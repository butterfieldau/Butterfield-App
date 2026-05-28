import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

const NAVY = '#1A2B4A';

export default function WholesaleLayout() {
  const { logout, user } = useAuth();

  if (!user) return <Redirect href="/(customer)" />;
  if (user.role !== 'wholesale') return <Redirect href={getHomeRouteForRole(user.role)} />;

  return (
    <View style={{ flex: 1 }}>
      <PortalHeader
        badge="WHOLESALE"
        badgeColor="#1493FF"
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneContainerStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: '#1493FF',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#EFEFEF',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontWeight: '500', fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid"          size={22} color={color} /> }} />
        <Tabs.Screen name="catalog"  options={{ title: 'Catalog',   tabBarIcon: ({ color }) => <Feather name="package"       size={22} color={color} /> }} />
        <Tabs.Screen name="cart"     options={{ title: 'Cart',      tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} /> }} />
        <Tabs.Screen name="orders"   options={{ title: 'Orders',    tabBarIcon: ({ color }) => <Feather name="file-text"     size={22} color={color} /> }} />
        <Tabs.Screen name="profile"  options={{ title: 'Account',   tabBarIcon: ({ color }) => <Feather name="user"          size={22} color={color} /> }} />
        <Tabs.Screen name="invoices" options={{ href: null }} />
        <Tabs.Screen name="addresses" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
