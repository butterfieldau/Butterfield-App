import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole, isInternalRole } from '@/lib/roleRoutes';

const BLUE     = '#1493FF';
const NAVY     = '#1A2B4A';
const WHITE    = '#FFFFFF';
const MUTED    = '#9CA3AF';
const BG_STAFF = '#F5F6FA';

const TAB_CONFIG: Record<string, { icon: string; title: string }> = {
  index:    { icon: 'home',         title: 'Dashboard' },
  orders:   { icon: 'shopping-bag', title: 'Orders'    },
  scan:     { icon: 'maximize',     title: 'Scan'      },
  tasks:    { icon: 'clipboard',    title: 'Tasks'     },
  profile:  { icon: 'user',         title: 'Profile'   },
  staffhub: { icon: 'users',        title: 'Staff Hub' },
  more:     { icon: 'grid',         title: 'More'      },
};

function FloatingInternalTabBar({ state, navigation, visibleRouteNames }: any) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter((r: any) =>
    visibleRouteNames.includes(r.name),
  );

  return (
    <View pointerEvents="box-none" style={[tStyles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={tStyles.pill}>
        {visibleRoutes.map((route: any) => {
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const focused = state.index === routeIndex;
          const cfg = TAB_CONFIG[route.name] ?? { icon: 'circle', title: route.name };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress', target: route.key, canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync();
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={tStyles.touch}>
              {focused ? (
                <View style={tStyles.activePill}>
                  <Feather name={cfg.icon as any} size={19} color={WHITE} />
                  <Text style={tStyles.activeLabel} numberOfLines={1}>{cfg.title}</Text>
                </View>
              ) : (
                <View style={tStyles.inactiveWrap}>
                  <Feather name={cfg.icon as any} size={22} color={MUTED} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function DirectorLayout() {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return <Redirect href="/(customer)" />;
  if (!isInternalRole(user.role)) return <Redirect href={getHomeRouteForRole(user.role)} />;
  if (user.role === 'shop_display') return <Redirect href="/(shop-display)" />;

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

  // Floating tab bar visible routes per role
  const visibleRouteNames: string[] = isManager
    ? ['index', 'orders', 'tasks', 'staffhub', 'more']
    : canViewOrders
      ? ['index', 'orders', 'scan', 'tasks', 'profile']
      : ['index', 'scan', 'tasks', 'profile'];

  const badgeLabel = isStaff   ? 'STAFF'
                   : isManager ? 'STORE MANAGER'
                   : isMaster  ? 'MASTER'
                   :             'DIRECTOR';
  const badgeColor = isStaff   ? '#1493FF'
                   : isManager ? '#16A34A'
                   : isMaster  ? '#7C3AED'
                   :             '#EF4444';

  // ── Staff / Manager: light background + floating tab bar, no PortalHeader ──
  if (isInternal) {
    return (
      <View style={{ flex: 1, backgroundColor: BG_STAFF }}>
        {/* Safe area spacer replaces PortalHeader for staff/manager */}
        <View style={{ height: insets.top, backgroundColor: BG_STAFF }} />

        <Tabs
          tabBar={(props) => (
            <FloatingInternalTabBar
              {...props}
              visibleRouteNames={visibleRouteNames}
            />
          )}
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              position: 'absolute',
              height: 0,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: 'Dashboard' }}
          />
          <Tabs.Screen
            name="orders"
            options={{ title: 'Orders' }}
          />
          <Tabs.Screen
            name="scan"
            options={{
              title: 'Scan',
              href: isStaff ? undefined : null,
            }}
          />
          <Tabs.Screen
            name="tasks"
            options={{ title: 'Tasks' }}
          />
          <Tabs.Screen
            name="staffhub"
            options={{
              title: 'Staff Hub',
              href: isManager ? undefined : null,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              href: isStaff ? undefined : null,
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: 'More',
              href: isManager ? undefined : null,
            }}
          />
          {/* Hidden for staff/manager */}
          <Tabs.Screen name="users"          options={{ href: null }} />
          <Tabs.Screen name="products"       options={{ href: null }} />
          <Tabs.Screen name="stock"          options={{ href: null }} />
          <Tabs.Screen name="_staff-dashboard" options={{ href: null }} />
          <Tabs.Screen name="customers"      options={{ href: null }} />
          <Tabs.Screen name="pricing"        options={{ href: null }} />
          <Tabs.Screen name="discounts"      options={{ href: null }} />
          <Tabs.Screen name="reports"        options={{ href: null }} />
          <Tabs.Screen name="timesheets"     options={{ href: null }} />
          <Tabs.Screen name="settings"       options={{ href: null }} />
          <Tabs.Screen name="stores"         options={{ href: null }} />
        </Tabs>
      </View>
    );
  }

  // ── Director / Master: existing navy header + standard tab bar ──
  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <PortalHeader
        badge={badgeLabel}
        badgeColor={badgeColor}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: {
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
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            tabBarIcon: ({ color, size }) => <Feather name="maximize" size={size} color={color} />,
            href: null,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} />,
            href: null,
          }}
        />
        <Tabs.Screen
          name="staffhub"
          options={{
            title: 'Staff Hub',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
            href: null,
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: 'People',
            tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: 'Products',
            tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
          }}
        />
        {/* Hidden for director/master */}
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
    </View>
  );
}

const tStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 10,
  },
  touch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 7,
  },
  activeLabel: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  inactiveWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
});
