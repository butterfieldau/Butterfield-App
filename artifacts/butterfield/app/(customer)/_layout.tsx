import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, View, Text, useColorScheme } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';

const BLUE = '#3058A8';

function CartBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: -4,
        right: -8,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: BLUE,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 13 }}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

function NativeCustomerTabs() {
  const { totalItems } = useCart();

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="menu">
        <Icon sf={{ default: 'menucard', selected: 'menucard.fill' }} />
        <Label>Menu</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loyalty">
        <Icon sf={{ default: 'star', selected: 'star.fill' }} />
        <Label>Rewards</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart">
        <View style={{ position: 'relative' }}>
          <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
          <CartBadge count={totalItems} />
        </View>
        <Label>Order</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicCustomerTabs() {
  const colors = useColors();
  const { totalItems } = useCart();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={24} /> : <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="list.bullet" tintColor={color} size={24} /> : <Feather name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="star" tintColor={color} size={24} /> : <Feather name="star" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Order',
          tabBarStyle: { display: 'none' },
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
          tabBarBadgeStyle: { backgroundColor: BLUE },
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bag" tintColor={color} size={24} />
            ) : (
              <Feather name="shopping-bag" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person" tintColor={color} size={24} /> : <Feather name="user" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="favourites" options={{ href: null, title: 'Favourites' }} />
      <Tabs.Screen name="track/[id]" options={{ href: null, title: 'Track Order' }} />
      <Tabs.Screen name="stores"     options={{ href: null, title: 'Our Stores'  }} />
    </Tabs>
  );
}

export default function CustomerTabLayout() {
  if (isLiquidGlassAvailable()) return <NativeCustomerTabs />;
  return <ClassicCustomerTabs />;
}
