import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { AnimatedTabItem, GlassCircle, GlassPill } from '@/components/FloatingTabBar';

const BLUE      = '#1493FF';
const CIRCLE_SZ = 62;

const CUSTOMER_TABS = {
  index:   { icon: 'home',    title: 'Home'    },
  menu:    { icon: 'list',    title: 'Menu'    },
  loyalty: { icon: 'star',    title: 'Rewards' },
  profile: { icon: 'person',  title: 'Account' },
} as const;

const VISIBLE_ROUTES = ['index', 'menu', 'loyalty', 'profile'] as const;

function FloatingCustomerTabBar({ state, navigation }: any) {
  const insets         = useSafeAreaInsets();
  const router         = useRouter();
  const { user }       = useAuth();
  const { totalItems } = useCart();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  const visibleRoutes = state.routes.filter((r: any) =>
    (VISIBLE_ROUTES as readonly string[]).includes(r.name),
  );

  const makeOnPress = (route: any, focused: boolean) => () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(route.name);
    }
  };

  const goToCart = () => {
    if (!user) {
      setLoginTarget('/customer-cart');
      return;
    }
    Haptics.selectionAsync();
    router.push('/customer-cart' as any);
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View style={styles.barRow}>
          <GlassPill>
            {visibleRoutes.map((route: any) => {
              const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
              const focused    = state.index === routeIndex;
              const cfg        = (CUSTOMER_TABS as any)[route.name] ?? { icon: 'circle', title: route.name };

              return (
                <AnimatedTabItem
                  key={route.key}
                  focused={focused}
                  onPress={makeOnPress(route, focused)}
                  cfg={cfg}
                  activeColor={BLUE}
                />
              );
            })}
          </GlassPill>

          <Pressable onPress={goToCart} hitSlop={8} style={styles.cartWrap}>
            <GlassCircle size={CIRCLE_SZ}>
              <Feather
                name="shopping-bag"
                size={22}
                color={totalItems > 0 ? BLUE : '#333'}
              />
            </GlassCircle>
            {totalItems > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {totalItems > 99 ? '99+' : String(totalItems)}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <LoginRequiredModal
        visible={!!loginTarget}
        redirectTo={loginTarget ?? undefined}
        onCancel={() => setLoginTarget(null)}
      />
    </>
  );
}

function ClassicCustomerTabs() {
  const colors   = useColors();
  const { user } = useAuth();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <Tabs
        tabBar={(props) => <FloatingCustomerTabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor:   colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown:    false,
          tabBarShowLabel: false,
          tabBarStyle:    { position: 'absolute', height: 0, backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
        }}
      >
        <Tabs.Screen name="index"   options={{ title: 'Home'    }} />
        <Tabs.Screen name="menu"    options={{ title: 'Menu'    }} />
        <Tabs.Screen
          name="loyalty"
          listeners={{ tabPress: (e) => { if (!user) { e.preventDefault(); setLoginTarget('/(customer)/loyalty'); } } }}
          options={{ title: 'Rewards' }}
        />
        <Tabs.Screen
          name="profile"
          listeners={{ tabPress: (e) => { if (!user) { e.preventDefault(); setLoginTarget('/(customer)/profile'); } } }}
          options={{ title: 'Account' }}
        />
        <Tabs.Screen name="cart"            options={{ href: null, title: 'Order'           }} />
        <Tabs.Screen name="track/[id]"      options={{ href: null, title: 'Track Order'     }} />
        <Tabs.Screen name="stores"          options={{ href: null, title: 'Our Stores'      }} />
        <Tabs.Screen name="payment-methods" options={{ href: null, title: 'Payment Methods' }} />
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
  wrap: {
    position:          'absolute',
    left:              0,
    right:             0,
    bottom:            0,
    paddingHorizontal: 24,
    alignItems:        'center',
  },
  barRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  cartWrap: {
    position: 'relative',
  },
  badge: {
    position:          'absolute',
    top:               -4,
    right:             -4,
    minWidth:          18,
    height:            18,
    borderRadius:      9,
    backgroundColor:   '#FF3B30',
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color:      '#fff',
    fontSize:   10,
    fontWeight: '700',
    lineHeight: 13,
  },
});
