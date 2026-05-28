import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole, isInternalRole } from '@/lib/roleRoutes';
import { FloatingInternalTabBar } from '@/components/FloatingTabBar';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';

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
  const canViewOrders = isStaff
    ? (staffProfileData?.data as any)?.canViewOrders === true
    : true;

  const visibleRouteNames: string[] = isManager
    ? ['index', 'orders', 'staffhub', 'more']
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
      <View style={{ flex: 1 }}>
        <View style={{ height: insets.top }} />
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
            sceneContainerStyle: { backgroundColor: 'transparent' },
            tabBarStyle: {
              position: 'absolute', height: 0,
              backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0,
            },
          }}
        >
          <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="orders"   options={{ title: 'Orders' }} />
          <Tabs.Screen name="scan"     options={{ title: 'Scan',      href: isStaff               ? undefined : null }} />
          <Tabs.Screen name="tasks"    options={{ title: 'Staff Hub', href: null }} />
          <Tabs.Screen name="staffhub" options={{ title: 'Staff Hub', href: (isStaff || isManager) ? undefined : null }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile',   href: isStaff               ? undefined : null }} />
          <Tabs.Screen name="more"     options={{ title: 'More',     href: isManager  ? undefined : null }} />
          {/* Hidden for staff/manager */}
          <Tabs.Screen name="users"            options={{ href: null }} />
          <Tabs.Screen name="products"         options={{ href: null }} />
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

  // ── Director / Master: navy header + standard tab bar ────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <PortalHeader
        badge={badgeLabel}
        badgeColor={badgeColor}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneContainerStyle: { backgroundColor: 'transparent' },
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
