import { Feather } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { ManagerPermission } from '@/types';

const PURPLE = '#6B21A8';
const INDIGO = '#3730A3';
const BLUE   = '#40C0F2';

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

  const handleLogout = () => logout().then(() => router.replace('/(auth)/login'));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Manager badge header strip */}
      <View style={{ backgroundColor: INDIGO, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: PURPLE, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>MANAGER</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold', fontStyle: 'italic' }}>Butterfield</Text>
        </View>
        <Pressable onPress={handleLogout} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="log-out" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Inter_500Medium' }}>Sign out</Text>
        </Pressable>
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#EFEFEF', borderTopWidth: 1 },
          tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 10 },
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
      </Tabs>
    </View>
  );
}
