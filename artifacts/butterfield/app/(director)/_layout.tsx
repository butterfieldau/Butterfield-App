import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole, isInternalRole } from '@/lib/roleRoutes';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';

export default function DirectorLayout() {
  const { logout, user } = useAuth();

  if (!user) return <Redirect href="/(customer)" />;
  if (!isInternalRole(user.role)) return <Redirect href={getHomeRouteForRole(user.role)} />;

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
  const headerBg   = NAVY;

  return (
    <View style={{ flex: 1, backgroundColor: headerBg }}>
      <PortalHeader
        badge={badgeLabel}
        badgeColor={badgeColor}
        backgroundColor={headerBg}
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

        {/* ── Stock — director and manager ── */}
        <Tabs.Screen name="stock" options={{ href: null }} />

        {/* ── Hidden for all — accessed via deep links or internal imports ── */}
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
