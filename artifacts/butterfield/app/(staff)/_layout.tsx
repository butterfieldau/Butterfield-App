import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

const BG = '#0D0604';
const ACCENT = '#C8833A';

export default function StaffLayout() {
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
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color }) => <Feather name="clipboard" size={22} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: ({ color }) => <Feather name="box" size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }} />
    </Tabs>
  );
}
