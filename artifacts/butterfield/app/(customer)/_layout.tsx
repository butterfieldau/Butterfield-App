import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router, useLocalSearchParams, usePathname } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';

const TAB_ROUTES = ['/', '/menu', '/loyalty', '/cart', '/profile'] as const;
const PRIMARY_TOP = '#1493FF';
const PRIMARY_BOTTOM = '#3CBBEE';

function getActiveTabIndex(pathname: string) {
  const p = pathname.toLowerCase();
  if (p.includes('/menu')) return 1;
  if (p.includes('/loyalty')) return 2;
  if (p.includes('/cart')) return 3;
  if (p.includes('/profile')) return 4;
  if (p === '/' || p.endsWith('/index')) return 0;
  return -1;
}

function LiquidCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();
  const liquidGlass = isLiquidGlassAvailable();

  if (hideTabs) return null;

  const mainRoutes = state.routes.filter((route: any) => ['index', 'menu', 'loyalty', 'cart'].includes(route.name));
  const accountRoute = state.routes.find((route: any) => route.name === 'profile');

  const renderTab = (route: any, detached = false) => {
    const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
    const focused = state.index === routeIndex;
    const options = descriptors[route.key]?.options ?? {};
    const label = options.title ?? route.name;
    const iconColor = focused ? '#0C5A87' : '#2D2F33';

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        Haptics.selectionAsync();
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        style={[detached ? styles.detachedTabButton : styles.tabButton, focused && styles.tabButtonActive]}
      >
        {focused && !liquidGlass ? (
          <>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.activeGlow} />
          </>
        ) : null}
        <View style={styles.tabIconWrap}>
          {options.tabBarIcon ? options.tabBarIcon({ color: iconColor, focused, size: 22 }) : null}
          {route.name === 'cart' && totalItems > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{String(totalItems > 99 ? '99+' : totalItems)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, { color: iconColor, fontWeight: focused ? '700' : '500' }]}>{label}</Text>
      </Pressable>
    );
  };

  const mainPillContent = mainRoutes.map((route: any) => renderTab(route));
  const accountPillContent = accountRoute ? renderTab(accountRoute, true) : null;

  return (
    <View pointerEvents="box-none" style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {liquidGlass ? (
        <GlassContainer style={styles.tabBarRow} spacing={12}>
          <GlassView glassEffectStyle="regular" colorScheme="light" style={styles.mainPill}>
            {mainPillContent}
          </GlassView>
          {accountRoute ? (
            <GlassView glassEffectStyle="regular" colorScheme="light" style={styles.accountPill}>
              {accountPillContent}
            </GlassView>
          ) : null}
        </GlassContainer>
      ) : (
        <View style={styles.tabBarRow}>
          <BlurView intensity={72} tint="light" style={styles.mainPill}>
            {mainPillContent}
          </BlurView>
          {accountRoute ? (
            <BlurView intensity={72} tint="light" style={styles.accountPill}>
              {accountPillContent}
            </BlurView>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors = useColors();
  const params = useLocalSearchParams<{ success?: string }>();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const hideTabs = usePathname()?.includes('/cart');

  return (
    <Tabs
      tabBar={(props) => (isIOS ? <LiquidCustomerTabBar {...props} hideTabs={hideTabs} /> : undefined)}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: hideTabs
          ? { display: 'none' }
          : isIOS
            ? { position: 'absolute', height: 0, backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 }
            : {
                position: 'absolute',
                backgroundColor: colors.background,
                borderTopWidth: isWeb ? 1 : 0,
                borderTopColor: colors.border,
                elevation: 0,
                ...(isWeb ? { height: 84 } : {}),
              },
        tabBarBackground: () =>
          isWeb ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} /> : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color }) => <Feather name="star" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Order',
          tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="favourites" options={{ href: null, title: 'Favourites' }} />
      <Tabs.Screen name="track/[id]" options={{ href: null, title: 'Track Order' }} />
      <Tabs.Screen name="stores" options={{ href: null, title: 'Our Stores' }} />
    </Tabs>
  );
}

export default function CustomerTabLayout() {
  const pathname = usePathname() ?? '/';
  const activeIndex = getActiveTabIndex(pathname);
  const canSwipe = Platform.OS === 'ios' && activeIndex >= 0;

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
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
        }),
    [activeIndex],
  );

  const content = <ClassicCustomerTabs />;
  if (!canSwipe) return content;

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={{ flex: 1 }}>{content}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  mainPill: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
    backgroundColor: 'rgba(255,255,255,0.66)',
  },
  accountPill: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
    backgroundColor: 'rgba(255,255,255,0.66)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
    gap: 5,
  },
  detachedTabButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  tabButtonActive: {
    shadowColor: PRIMARY_TOP,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: 'rgba(20,147,255,0.12)',
  },
  tabIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PRIMARY_TOP,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.1,
  },
});
