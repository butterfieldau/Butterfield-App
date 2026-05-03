import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

const BG = '#0A1A0A';
const ACCENT = '#3A8A3A';

export default function WholesaleLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.35)',
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : BG,
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
        },
        tabBarBackground: Platform.OS === 'ios'
          ? () => <BlurView intensity={80} tint="dark" style={{ flex: 1 }} />
          : undefined,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} /> }} />
      <Tabs.Screen name="catalog" options={{ title: 'Catalog', tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Account', tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }} />
    </Tabs>
  );
}
