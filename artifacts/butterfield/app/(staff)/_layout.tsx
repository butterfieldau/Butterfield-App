import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function StaffLayout() {
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
      <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid"         size={22} color={color} /> }} />
      <Tabs.Screen name="orders"   options={{ title: 'Orders',    tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks"    options={{ title: 'Tasks',     tabBarIcon: ({ color }) => <Feather name="clipboard"    size={22} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products',  tabBarIcon: ({ color }) => <Feather name="box"          size={22} color={color} /> }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',   tabBarIcon: ({ color }) => <Feather name="user"         size={22} color={color} /> }} />
    </Tabs>
  );
}
