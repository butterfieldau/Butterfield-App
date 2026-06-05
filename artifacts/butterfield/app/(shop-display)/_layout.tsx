import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { useShopDisplayAwakeMode } from '@/lib/shopDisplayMode';

const BLUE = '#1493FF';
const NAVY = '#1A2B4A';

export default function ShopDisplayLayout() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  useShopDisplayAwakeMode(user?.role === 'shop_display');

  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'shop_display') return <Redirect href={getHomeRouteForRole(user.role)} />;

  return (
    <View style={{ flex: 1, backgroundColor: NAVY, paddingTop: insets.top }}>
      <PortalHeader
        badge="SHOP DISPLAY"
        badgeColor="#1493FF"
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
            height: 74,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontWeight: '700', fontSize: 12, marginBottom: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, size }) => <Feather name="check-square" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan QR',
            tabBarIcon: ({ color, size }) => <Feather name="maximize" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
