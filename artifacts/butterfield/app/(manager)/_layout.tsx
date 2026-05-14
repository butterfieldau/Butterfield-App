import { Feather } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { api } from '@/lib/api';
import type { ManagerPermission } from '@/types';

const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const PURPLE = '#6B21A8';

export default function ManagerLayout() {
  const { logout } = useAuth();
  const [permissions, setPermissions] = useState<ManagerPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.manager.profile()
      .then(r => setPermissions((r.data.permissions ?? []) as ManagerPermission[]))
      .catch(() => setPermissions([]))
      .finally(() => setLoading(false));
  }, []);

  const can = (p: ManagerPermission) => permissions.includes(p);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: NAVY }}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <PortalHeader
        badge="MANAGER"
        badgeColor={PURPLE}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#EFEFEF', borderTopWidth: 1 },
          tabBarLabelStyle: { fontWeight: '500', fontSize: 10 },
        }}
      >
        <Tabs.Screen name="index"
          options={{
            title: 'Dashboard',
            href: can('dashboard') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="grid" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="orders"
          options={{
            title: 'Orders',
            href: can('orders') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="users"
          options={{
            title: 'People',
            href: can('users') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="timesheets"
          options={{
            title: 'Timesheets',
            href: can('timesheets') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="clock" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="products"
          options={{
            title: 'Products',
            href: can('products') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="package" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="reports"
          options={{
            title: 'Reports',
            href: can('reports') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="settings"
          options={{
            title: 'Settings',
            href: can('settings') ? undefined : null,
            tabBarIcon: ({ color }) => <Feather name="settings" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="scan"
          options={{
            title: 'Scan',
            tabBarIcon: ({ color }) => <Feather name="maximize" size={20} color={color} />,
          }}
        />
        <Tabs.Screen name="staffhub" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
