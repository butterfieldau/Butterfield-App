import { Feather } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';

export default function DirectorLayout() {
  const { logout, user } = useAuth();
  const isMaster = user?.role === 'master';

  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <PortalHeader
        badge={isMaster ? 'MASTER' : 'DIRECTOR'}
        badgeColor={isMaster ? '#7C3AED' : '#EF4444'}
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
        <Tabs.Screen name="index"    options={{ title: 'Home',     tabBarIcon: ({ color, size }) => <Feather name="home"        size={size} color={color} /> }} />
        <Tabs.Screen name="orders"   options={{ title: 'Orders',   tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} /> }} />
        <Tabs.Screen name="users"    options={{ title: 'People',   tabBarIcon: ({ color, size }) => <Feather name="users"       size={size} color={color} /> }} />
        <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: ({ color, size }) => <Feather name="package"     size={size} color={color} /> }} />
        <Tabs.Screen name="more"     options={{ title: 'More',     tabBarIcon: ({ color, size }) => <Feather name="grid"        size={size} color={color} /> }} />

        {/* Hidden — accessed via router.push from Home/More screens */}
        <Tabs.Screen name="customers"  options={{ href: null }} />
        <Tabs.Screen name="pricing"    options={{ href: null }} />
        <Tabs.Screen name="reports"    options={{ href: null }} />
        <Tabs.Screen name="timesheets" options={{ href: null }} />
        <Tabs.Screen name="settings"   options={{ href: null }} />
        <Tabs.Screen name="staffhub"   options={{ href: null }} />
        <Tabs.Screen name="stores"     options={{ href: null }} />
      </Tabs>
    </View>
  );
}
