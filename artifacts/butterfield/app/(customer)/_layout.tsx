import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

const BLUE   = '#1493FF';
const WHITE  = '#FFFFFF';
const MUTED  = '#9CA3AF';
const PILL_BG = '#FFFFFF';

function FloatingCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();

  if (hideTabs) return null;

  const mainRoutes = state.routes.filter((route: any) =>
    ['index', 'menu', 'loyalty', 'cart'].includes(route.name),
  );
  const accountRoute = state.routes.find((route: any) => route.name === 'profile');

  const renderTab = (route: any, detached = false) => {
    const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
    const focused = state.index === routeIndex;
    const options = descriptors[route.key]?.options ?? {};
    const label = options.title ?? route.name;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        Haptics.selectionAsync();
        navigation.navigate(route.name);
      }
    };

    if (detached) {
      return (
        <Pressable key={route.key} onPress={onPress} style={styles.accountCircle}>
          <View style={[styles.accountInner, focused && styles.accountInnerActive]}>
            {options.tabBarIcon
              ? options.tabBarIcon({ color: focused ? WHITE : MUTED, focused, size: 22 })
              : null}
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tabTouchArea}>
        {focused ? (
          <View style={styles.activePill}>
            <View style={styles.activeIconWrap}>
              {options.tabBarIcon ? options.tabBarIcon({ color: WHITE, focused, size: 19 }) : null}
              {route.name === 'cart' && totalItems > 0 ? (
                <View style={[styles.cartBadge, { top: -5, right: -8 }]}>
                  <Text style={styles.cartBadgeText}>{String(totalItems > 99 ? '99+' : totalItems)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.activeLabel} numberOfLines={1}>{label}</Text>
          </View>
        ) : (
          <View style={styles.inactivePill}>
            <View style={styles.inactiveIconWrap}>
              {options.tabBarIcon ? options.tabBarIcon({ color: MUTED, focused, size: 22 }) : null}
              {route.name === 'cart' && totalItems > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{String(totalItems > 99 ? '99+' : totalItems)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabBarRow}>
        <View style={styles.mainPill}>
          {mainRoutes.map((route: any) => renderTab(route))}
        </View>
        {accountRoute ? renderTab(accountRoute, true) : null}
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
        tabBar={(props) => (isIOS ? <FloatingCustomerTabBar {...props} hideTabs={hideTabs} /> : undefined)}
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
          listeners={{
            tabPress: (e) => {
              if (!user) {
                e.preventDefault();
                setLoginTarget('/(customer)/profile');
              }
            },
          }}
          options={{
            title: 'Account',
            tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
          }}
        />
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
  const { user } = useAuth();
  if (user && user.role !== 'customer') {
    return <Redirect href={getHomeRouteForRole(user.role)} />;
  }
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
    alignItems: 'center',
    gap: 12,
  },
  mainPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PILL_BG,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 10,
  },
  tabTouchArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 7,
  },
  activeIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLabel: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  inactivePill: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  inactiveIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCircle: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: PILL_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 10,
  },
  accountInner: {
    width: 50,
    height: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  accountInnerActive: {
    backgroundColor: BLUE,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BLUE,
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
});
