import * as Haptics from 'expo-haptics';
import { Tabs, router, useLocalSearchParams, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';

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

function ClassicCustomerTabs() {
  const colors = useColors();
  const { totalItems } = useCart();
  const params = useLocalSearchParams<{ success?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const hideTabs = usePathname()?.includes('/cart') && params.success === '1';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          ...(hideTabs
            ? { display: 'none' }
            : {
                position: 'absolute',
                backgroundColor: isIOS ? 'transparent' : colors.background,
                borderTopWidth: isWeb ? 1 : 0,
                borderTopColor: colors.border,
                elevation: 0,
                ...(isWeb ? { height: 84 } : {}),
              }),
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: isDark ? 0.96 : 0.98 }]} />
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
            <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) =>
            <Feather name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color }) =>
            <Feather name="star" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Order',
          tabBarIcon: ({ color }) => (
            <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="shopping-bag" size={22} color={color} />
              {totalItems > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#40C0F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 12 }}>
                    {String(totalItems > 99 ? '99+' : totalItems)}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) =>
            <Feather name="user" size={22} color={color} />,
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

  const content = <ClassicCustomerTabs />;

  if (!canSwipe) return content;

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={{ flex: 1 }}>{content}</View>
    </GestureDetector>
  );
}
