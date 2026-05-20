import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';

const PRIMARY_TOP = '#1493FF';

function LiquidCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();

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
        {focused ? (
          <>
            <View style={styles.activeGlow} />
            <LinearGradient
              colors={['rgba(255,255,255,0.88)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.12)']}
              start={{ x: 0.18, y: 0.05 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.activeLiquid}
            />
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
      <View style={styles.tabBarRow}>
        <BlurView intensity={72} tint="light" style={styles.mainPill}>
          {mainRoutes.map((route: any) => renderTab(route))}
        </BlurView>
        {accountRoute ? (
          <BlurView intensity={72} tint="light" style={styles.accountPill}>
            {renderTab(accountRoute, true)}
          </BlurView>
        ) : null}
      </View>
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors = useColors();
  const { user } = useAuth();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname() ?? '';
  const hideTabs = pathname.includes('/cart');

  return (
    <>
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
          listeners={{
            tabPress: (e) => {
              if (!user) {
                e.preventDefault();
                setLoginTarget('/(customer)/loyalty');
              }
            },
          }}
          options={{
            title: 'Rewards',
            tabBarIcon: ({ color }) => <Feather name="star" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="cart"
          listeners={{
            tabPress: (e) => {
              if (!user) {
                e.preventDefault();
                setLoginTarget('/(customer)/cart');
              }
            },
          }}
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
      <LoginRequiredModal
        visible={!!loginTarget}
        redirectTo={loginTarget ?? undefined}
        onCancel={() => setLoginTarget(null)}
      />
    </>
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
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  mainPill: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  accountPill: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(255,255,255,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    overflow: 'hidden',
    gap: 4,
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
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: 'rgba(20,147,255,0.14)',
  },
  activeLiquid: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
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
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
