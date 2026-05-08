import { Feather } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

const NAVY = '#1A2B4A';
const BLUE = '#40C0F2';
const RED  = '#F40009';

export default function DirectorLayout() {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout().then(() => router.replace('/(auth)/login'));
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Director badge header strip */}
      <View style={{ backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: RED, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>DIRECTOR</Text>
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
          tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid"       size={22} color={color} /> }} />
        <Tabs.Screen name="orders"   options={{ title: 'Orders',    tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} /> }} />
        <Tabs.Screen name="users"    options={{ title: 'Users',     tabBarIcon: ({ color }) => <Feather name="users"      size={22} color={color} /> }} />
        <Tabs.Screen name="products" options={{ title: 'Products',  tabBarIcon: ({ color }) => <Feather name="package"    size={22} color={color} /> }} />
        <Tabs.Screen name="pricing"  options={{ href: null }} />
        <Tabs.Screen name="reports"  options={{ title: 'Reports',   tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings',  tabBarIcon: ({ color }) => <Feather name="settings"   size={22} color={color} /> }} />
      </Tabs>
    </View>
  );
}
