import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Tabs, router, usePathname } from 'expo-router';
import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';

const BLUE = '#40C0F2';
const TAB_ROUTES = ['/', '/menu', '/loyalty', '/cart', '/profile'] as const;

function getActiveTabIndex(pathname: string) {
  const p = pathname.toLowerCase();
  if (p.includes('/menu')) return 1;
  if (p.includes('/loyalty')) return 2;
  if (p.includes('/cart')) return 3;
  if (p.includes('/profile')) return 4;
  if (p === '/' || p.endsWith('/index')) return 0;
  return -1;
}

/** Blue pill badge rendered inside the icon — works on all platforms */
function BlueBadge({ count, iconSize }: { count: number; iconSize: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <View
      style={{
        position: 'absolute',
        top: -(iconSize * 0.3),
        right: -(iconSize * 0.45),
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: BLUE,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 12 }}>
        {label}
      </Text>
    </View>
  );
}

function NativeCustomerTabs() {
  const { totalItems } = useCart();

  return (
    <NativeTabs badgeBackgroundColor={BLUE}>
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
        <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <Label>Order</Label>
        {totalItems > 0 && (
          <Badge>
            {String(totalItems)}
          </Badge>
        )}
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
          tabBarIcon: ({ color }) => (
            <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              {isIOS
                ? <SymbolView name="bag" tintColor={color} size={24} />
                : <Feather name="shopping-bag" size={22} color={color} />}
              <BlueBadge count={totalItems} iconSize={24} />
            </View>
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
  const pathname = usePathname() ?? '/';
  const activeIndex = getActiveTabIndex(pathname);
  const canSwipe = Platform.OS === 'ios' && activeIndex >= 0;

  const swipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (activeIndex < 0) return;
      const fastEnough = Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 700;
      if (!fastEnough) return;

      if (e.translationX < 0 && activeIndex < TAB_ROUTES.length - 1) {
        Haptics.selectionAsync();
        router.navigate(TAB_ROUTES[activeIndex + 1] as any);
      } else if (e.translationX > 0 && activeIndex > 0) {
        Haptics.selectionAsync();
        router.navigate(TAB_ROUTES[activeIndex - 1] as any);
      }
    }), [activeIndex]);

  const content = isLiquidGlassAvailable() ? <NativeCustomerTabs /> : <ClassicCustomerTabs />;

  if (!canSwipe) return content;

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={{ flex: 1 }}>{content}</View>
    </GestureDetector>
  );
}
