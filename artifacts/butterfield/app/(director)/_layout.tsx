import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
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

// Per-route label + icon config (role-sensitive routes resolved at render time)
const ROUTE_META: Record<string, { icon: string; label: string }> = {
  orders:   { icon: 'shopping-bag', label: 'Orders'    },
  scan:     { icon: 'maximize',     label: 'Scan'      },
  tasks:    { icon: 'clipboard',    label: 'Tasks'     },
  staffhub: { icon: 'users',        label: 'Staff Hub' },
  profile:  { icon: 'user',         label: 'Profile'   },
  users:    { icon: 'users',        label: 'People'    },
  products: { icon: 'package',      label: 'Products'  },
  more:     { icon: 'grid',         label: 'More'      },
};

function DirectorGlassTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

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

  // Ordered list of route names visible for the current role
  const visibleNames = useMemo<string[]>(() => {
    if (isStaff) {
      const names = ['index', 'scan', 'tasks', 'profile'];
      if (canViewOrders) names.splice(1, 0, 'orders');
      return names;
    }
    if (isManager) return ['index', 'orders', 'tasks', 'staffhub', 'more'];
    return ['index', 'orders', 'users', 'products', 'more']; // director / master
  }, [isStaff, isManager, canViewOrders]);

  const visibleRoutes = useMemo(
    () => state.routes.filter((r: any) => visibleNames.includes(r.name)),
    [state.routes, visibleNames],
  );

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassTabContainer spacing={12} style={s.row}>
        <GlassTabPill style={s.pill} colorScheme="light">
          {visibleRoutes.map((route: any) => {
            const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
            const focused    = state.index === routeIndex;
            const iconColor  = focused ? ACTIVE_TEXT : IDLE_TEXT;

            // index route is role-aware
            const meta = route.name === 'index'
              ? { icon: isInternal ? 'clock' : 'home', label: isInternal ? 'Dashboard' : 'Home' }
              : (ROUTE_META[route.name] ?? { icon: 'grid', label: route.name });

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync();
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable key={route.key} onPress={onPress} style={[s.tab, focused && s.tabActive]}>
                {focused ? (
                  <LinearGradient
                    colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Feather name={meta.icon as any} size={22} color={iconColor} />
                <Text
                  style={[s.label, { color: iconColor, fontWeight: focused ? '700' : '500' }]}
                  numberOfLines={1}
                >
                  {meta.label}
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
        tabBar={(props) => (isIOS ? <DirectorGlassTabBar {...props} /> : undefined)}
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
        {/* ── Dashboard / Home — all roles ── */}
        <Tabs.Screen
          name="index"
          options={{
            title: isInternal ? 'Dashboard' : 'Home',
            tabBarIcon: ({ color, size }) => (
              <Feather name={isInternal ? 'clock' : 'home'} size={size} color={color} />
            ),
          }}
        />

        {/* ── Orders — all except staff without canViewOrders ── */}
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
            href: isStaff && !canViewOrders ? null : undefined,
          }}
        />

        {/* ── Scan — staff only ── */}
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            tabBarIcon: ({ color, size }) => <Feather name="maximize" size={size} color={color} />,
            href: isStaff ? undefined : null,
          }}
        />

        {/* ── Tasks — staff and manager ── */}
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} />,
            href: isInternal ? undefined : null,
          }}
        />

        {/* ── Staff Hub — manager only ── */}
        <Tabs.Screen
          name="staffhub"
          options={{
            title: 'Staff Hub',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
            href: isManager ? undefined : null,
          }}
        />

        {/* ── Profile — staff only ── */}
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
            href: isStaff ? undefined : null,
          }}
        />

        {/* ── People — director / master only ── */}
        <Tabs.Screen
          name="users"
          options={{
            title: 'People',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
            href: isInternal ? null : undefined,
          }}
        />

        {/* ── Products — director, master only (managers access via More) ── */}
        <Tabs.Screen
          name="products"
          options={{
            title: 'Products',
            tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} />,
            href: (isStaff || isManager) ? null : undefined,
          }}
        />

        {/* ── More — manager, director, master ── */}
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
            href: isStaff ? null : undefined,
          }}
        />

        {/* ── Hidden for all — accessed via deep links or internal navigation ── */}
        <Tabs.Screen name="stock"           options={{ href: null }} />
        <Tabs.Screen name="_staff-dashboard" options={{ href: null }} />
        <Tabs.Screen name="customers"        options={{ href: null }} />
        <Tabs.Screen name="pricing"          options={{ href: null }} />
        <Tabs.Screen name="discounts"        options={{ href: null }} />
        <Tabs.Screen name="reports"          options={{ href: null }} />
        <Tabs.Screen name="timesheets"       options={{ href: null }} />
        <Tabs.Screen name="settings"         options={{ href: null }} />
        <Tabs.Screen name="stores"           options={{ href: null }} />
      </Tabs>
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
