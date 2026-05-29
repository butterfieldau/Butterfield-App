import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole, isInternalRole } from '@/lib/roleRoutes';
import { FloatingInternalTabBar } from '@/components/FloatingTabBar';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';
const BG_STAFF = '#EFF6FF';

const STAFF_TAB_CONFIG = {
  index:    { icon: 'home',         title: 'Dashboard' },
  orders:   { icon: 'shopping-bag', title: 'Orders'    },
  scan:     { icon: 'maximize',     title: 'Scan'      },
  staffhub: { icon: 'users',        title: 'Staff Hub' },
  profile:  { icon: 'user',         title: 'Profile'   },
  more:     { icon: 'grid',         title: 'More'      },
} as const;

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

  const { data: managerProfileData } = useQuery({
    queryKey: ['manager-profile'],
    queryFn:  () => api.manager.profile(),
    enabled:  isManager,
    staleTime: 60_000,
  });
  const managerPerms: string[] = useMemo(
    () => managerProfileData?.data?.permissions ?? [],
    [managerProfileData],
  );

  const canViewOrders = isStaff
    ? (staffProfileData?.data as any)?.canViewOrders === true
    : true;

  // Returns true if: not a manager, OR manager has the given permission
  const hasPerm = (p: string) => !isManager || managerPerms.includes(p);

  // href helper: staff always blocked, managers gated by permission
  const mgrHref = (perm: string) => isStaff ? null : (hasPerm(perm) ? undefined : null);

  const visibleRouteNames: string[] = isManager
    ? [
        'index',
        ...(hasPerm('orders')    ? ['orders']   : []),
        'staffhub',
        'more',
      ]
    : canViewOrders
      ? ['index', 'orders', 'scan', 'staffhub', 'profile']
      : ['index', 'scan', 'staffhub', 'profile'];

  const badgeLabel = isStaff   ? 'STAFF'
                   : isManager ? 'STORE MANAGER'
                   : isMaster  ? 'MASTER'
                   :             'DIRECTOR';
  const badgeColor = isStaff   ? '#1493FF'
                   : isManager ? '#16A34A'
                   : isMaster  ? '#7C3AED'
                   :             '#EF4444';

  // ── Staff / Manager: light bg + animated glass floating tab bar ──────────────
  if (isInternal) {
    return (
      <View style={{ flex: 1, backgroundColor: BG_STAFF }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG_STAFF} translucent={false} />
        <View style={{ height: insets.top, backgroundColor: BG_STAFF }} />
        <Tabs
          tabBar={(props) => (
            <FloatingInternalTabBar
              {...props}
              visibleRouteNames={visibleRouteNames}
              tabConfig={STAFF_TAB_CONFIG}
              activeColor={BLUE}
            />
          )}
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              position: 'absolute', height: 0,
              backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0,
            },
          }}
        >
          <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="orders"   options={{ title: 'Orders' }} />
          <Tabs.Screen name="scan"     options={{ title: 'Scan',      href: isStaff ? undefined : null }} />
          <Tabs.Screen name="tasks"    options={{ title: 'Staff Hub', href: null }} />
          <Tabs.Screen name="staffhub" options={{ title: 'Staff Hub' }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile',   href: isStaff ? undefined : null }} />
          <Tabs.Screen name="more"     options={{ title: 'More',      href: isManager ? undefined : null }} />

          {/* Permission-gated screens: accessible for managers with the right perm, always blocked for staff */}
          <Tabs.Screen name="products"         options={{ href: mgrHref('products')  }} />
          <Tabs.Screen name="users"            options={{ href: mgrHref('users')     }} />
          <Tabs.Screen name="customers"        options={{ href: mgrHref('users')     }} />
          <Tabs.Screen name="reports"          options={{ href: mgrHref('reports')   }} />
          <Tabs.Screen name="timesheets"       options={{ href: mgrHref('timesheets') }} />
          <Tabs.Screen name="stock"            options={{ href: mgrHref('stock')     }} />
          <Tabs.Screen name="pricing"          options={{ href: mgrHref('pricing')   }} />
          <Tabs.Screen name="discounts"        options={{ href: mgrHref('pricing')   }} />
          <Tabs.Screen name="stores"           options={{ href: mgrHref('settings')  }} />
          <Tabs.Screen name="settings"         options={{ href: (isStaff ? null : (hasPerm('settings') || hasPerm('announcements') || hasPerm('rewards') || hasPerm('banners') ? undefined : null)) }} />

          {/* Always hidden for staff/manager */}
          <Tabs.Screen name="_staff-dashboard" options={{ href: null }} />
        </Tabs>
      </View>
    );
  }

  // ── Director / Master: navy header + standard tab bar ────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} translucent={false} />
      <PortalHeader
        badge={badgeLabel}
        badgeColor={badgeColor}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor:   BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor:  '#E5E7EB',
            borderTopWidth:  StyleSheet.hairlineWidth,
          },
          tabBarLabelStyle: { fontWeight: '500', fontSize: 10, marginBottom: 2 },
        }}
      >
        <Tabs.Screen name="index"
          options={{ title: 'Home',     tabBarIcon: ({ color, size }) => <Feather name="home"         size={size} color={color} /> }} />
        <Tabs.Screen name="orders"
          options={{ title: 'Orders',   tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} /> }} />
        <Tabs.Screen name="users"
          options={{ title: 'People',   tabBarIcon: ({ color, size }) => <Feather name="users"         size={size} color={color} /> }} />
        <Tabs.Screen name="products"
          options={{ title: 'Products', tabBarIcon: ({ color, size }) => <Feather name="package"       size={size} color={color} /> }} />
        <Tabs.Screen name="more"
          options={{ title: 'More',     tabBarIcon: ({ color, size }) => <Feather name="grid"          size={size} color={color} /> }} />
        {/* Hidden for director/master */}
        <Tabs.Screen name="scan"             options={{ href: null }} />
        <Tabs.Screen name="tasks"            options={{ href: null }} />
        <Tabs.Screen name="staffhub"         options={{ href: null }} />
        <Tabs.Screen name="profile"          options={{ href: null }} />
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
