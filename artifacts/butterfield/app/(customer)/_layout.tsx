import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';

const PRIMARY_TOP = '#1493FF';

function LiquidCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();

  if (hideTabs) return null;

  const tabRoutes = state.routes.filter((route: any) =>
    ['index', 'menu', 'loyalty', 'cart', 'profile'].includes(route.name),
  );

  const renderTab = (route: any) => {
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
        style={[styles.tabButton, focused && styles.tabButtonActive]}
      >
        {focused ? (
          <>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.84)']}
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
        <Text style={[styles.tabLabel, { color: iconColor, fontWeight: focused ? '700' : '500' }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <BlurView intensity={78} tint="light" style={styles.mainPill}>
        <LinearGradient
          colors={['rgba(255,255,255,0.78)', 'rgba(255,255,255,0.56)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {tabRoutes.map((route: any) => renderTab(route))}
      </BlurView>
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname() ?? '';
  const hideTabs = pathname.includes('/cart');

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
  return <ClassicCustomerTabs />;
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  mainPill: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.58)',
    shadowColor: '#5EA8D7',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    overflow: 'hidden',
    gap: 5,
  },
  tabButtonActive: {
    shadowColor: PRIMARY_TOP,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: 'rgba(20,147,255,0.13)',
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
    fontSize: 10,
    letterSpacing: 0,
    textAlign: 'center',
  },
});
