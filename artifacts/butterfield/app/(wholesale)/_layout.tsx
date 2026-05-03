import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function WholesaleLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#40C0F2',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#EFEFEF',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid"        size={22} color={color} /> }} />
      <Tabs.Screen name="catalog"  options={{ title: 'Catalog',   tabBarIcon: ({ color }) => <Feather name="package"     size={22} color={color} /> }} />
      <Tabs.Screen name="orders"   options={{ title: 'Orders',    tabBarIcon: ({ color }) => <Feather name="file-text"   size={22} color={color} /> }} />
      <Tabs.Screen name="invoices" options={{ title: 'Invoices',  tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={22} color={color} /> }} />
      <Tabs.Screen name="profile"  options={{ title: 'Account',   tabBarIcon: ({ color }) => <Feather name="user"        size={22} color={color} /> }} />
    </Tabs>
  );
}
