import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs, useRouter } from 'expo-router';
import { usePathname } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { GlassTabPill, GlassTabContainer } from '@/components/GlassTabPill';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';
const ACTIVE_TEXT = '#0C5A87';
const IDLE_TEXT   = '#2D2F33';

function DirectorGlassTabBar() {
  const pathname  = usePathname();
  const nav       = useRouter();
  const insets    = useSafeAreaInsets();
  const { user }  = useAuth();

  const isStaff    = user?.role === 'staff';
  const isManager  = user?.role === 'manager';
  const isInternal = isStaff || isManager;

  const { data: staffProfileData } = useQuery({
    queryKey: ['staff-profile'],
    queryFn:  () => api.staff.profile(),
    enabled:  isStaff,
  });
  const canViewOrders = isStaff
    ? (staffProfileData?.data as any)?.canViewOrders === true
    : true;

  const allTabs = useMemo(() => [
    {
      name: 'index',
      path: isStaff ? '/(director)' : isManager ? '/(director)' : '/(director)',
      icon: isInternal ? 'clock' : 'home',
      label: isInternal ? 'Dashboard' : 'Home',
      hidden: false,
    },
    { name: 'orders',   path: '/(director)/orders',   icon: 'shopping-bag', label: 'Orders',    hidden: isStaff && !canViewOrders },
    { name: 'scan',     path: '/(director)/scan',     icon: 'maximize',     label: 'Scan',      hidden: !isStaff },
    { name: 'tasks',    path: '/(director)/tasks',    icon: 'clipboard',    label: 'Tasks',     hidden: !isInternal },
    { name: 'staffhub', path: '/(director)/staffhub', icon: 'users',        label: 'Staff Hub', hidden: !isManager },
    { name: 'profile',  path: '/(director)/profile',  icon: 'user',         label: 'Profile',   hidden: !isStaff },
    { name: 'users',    path: '/(director)/users',    icon: 'users',        label: 'People',    hidden: isInternal },
    { name: 'products', path: '/(director)/products', icon: 'package',      label: 'Products',  hidden: isStaff || isManager },
    { name: 'more',     path: '/(director)/more',     icon: 'grid',         label: 'More',      hidden: isStaff },
  ], [isStaff, isManager, isInternal, canViewOrders]);

  const visibleTabs = useMemo(() => allTabs.filter(t => !t.hidden), [allTabs]);

  const isActive = (name: string) => {
    if (name === 'index') {
      return !visibleTabs.slice(1).some(t => pathname.includes(`/${t.name}`));
    }
    return pathname.includes(`/${name}`);
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassTabContainer spacing={12} style={s.row}>
        <GlassTabPill style={s.pill} colorScheme="light">
          {visibleTabs.map((tab) => {
            const focused   = isActive(tab.name);
            const iconColor = focused ? ACTIVE_TEXT : IDLE_TEXT;

            const onPress = () => {
              Haptics.selectionAsync();
              nav.navigate(tab.path as any);
            };

            return (
              <Pressable key={tab.name} onPress={onPress} style={[s.tab, focused && s.tabActive]}>
                {focused ? (
                  <LinearGradient
                    colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Feather name={tab.icon as any} size={22} color={iconColor} />
                <Text
                  style={[s.label, { color: iconColor, fontWeight: focused ? '700' : '500' }]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </GlassTabPill>
      </GlassTabContainer>
    </View>
  );
}

const isIOS = Platform.OS === 'ios';

export default function DirectorLayout() {
  const { logout, user } = useAuth();

  const isStaff    = user?.role === 'staff';
  const isManager  = user?.role === 'manager';
  const isMaster   = user?.role === 'master';
  const isInternal = isStaff || isManager;

  const { data: staffProfileData } = useQuery({
    queryKey: ['staff-profile'],
    queryFn:  () => api.staff.profile(),
    enabled:  isStaff,
  });
  const canViewOrders = isStaff
    ? (staffProfileData?.data as any)?.canViewOrders === true
    : true;

  const badgeLabel = isStaff   ? 'STAFF'
                   : isManager ? 'STORE MANAGER'
                   : isMaster  ? 'MASTER'
                   :             'DIRECTOR';
  const badgeColor = isStaff   ? '#1493FF'
                   : isManager ? '#16A34A'
                   : isMaster  ? '#7C3AED'
                   :             '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <PortalHeader
        badge={badgeLabel}
        badgeColor={badgeColor}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />

      <Tabs
        tabBar={isIOS ? () => null : undefined}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: isIOS
            ? { display: 'none' }
            : {
                backgroundColor: '#FFFFFF',
                borderTopColor: '#E5E7EB',
                borderTopWidth: StyleSheet.hairlineWidth,
              },
          tabBarLabelStyle: { fontWeight: '500', fontSize: 10, marginBottom: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: isInternal ? 'Dashboard' : 'Home',
            tabBarIcon: ({ color, size }) => (
              <Feather name={isInternal ? 'clock' : 'home'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
            href: isStaff && !canViewOrders ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            tabBarIcon: ({ color, size }) => <Feather name="maximize" size={size} color={color} />,
            href: isStaff ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} />,
            href: isInternal ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="staffhub"
          options={{
            title: 'Staff Hub',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
            href: isManager ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
            href: isStaff ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: 'People',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
            href: isInternal ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: 'Products',
            tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} />,
            href: (isStaff || isManager) ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
            href: isStaff ? null : undefined,
          }}
        />
        <Tabs.Screen name="stock"            options={{ href: null }} />
        <Tabs.Screen name="_staff-dashboard" options={{ href: null }} />
        <Tabs.Screen name="customers"        options={{ href: null }} />
        <Tabs.Screen name="pricing"          options={{ href: null }} />
        <Tabs.Screen name="discounts"        options={{ href: null }} />
        <Tabs.Screen name="reports"          options={{ href: null }} />
        <Tabs.Screen name="timesheets"       options={{ href: null }} />
        <Tabs.Screen name="settings"         options={{ href: null }} />
        <Tabs.Screen name="stores"           options={{ href: null }} />
      </Tabs>

      {/* Glass pill outside Tabs — never part of the native tab bar stack */}
      {isIOS && <DirectorGlassTabBar />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.74)',
  },
  tab: {
    flex: 1,
    minHeight: 62,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    overflow: 'hidden',
    gap: 4,
  },
  tabActive: {
    shadowColor: BLUE,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: {
    fontSize: 10,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
