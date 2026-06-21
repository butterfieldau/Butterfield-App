import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { AnimatedTabItem, GlassCircle, GlassPill } from '@/components/FloatingTabBar';

const BLUE      = '#1493FF';
const CIRCLE_SZ = 54;

const CUSTOMER_TABS = {
  index:   { icon: 'home',    title: 'Home'    },
  menu:    { icon: 'list',    title: 'Menu'    },
  loyalty: { icon: 'star',    title: 'Rewards' },
  profile: { icon: 'person',  title: 'Account' },
} as const;

const VISIBLE_ROUTES = ['index', 'menu', 'loyalty', 'profile'] as const;

function CartCircleButton({ onPress, count }: { onPress: () => void; count: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <GlassCircle size={CIRCLE_SZ}>
        <Ionicons
          name={count > 0 ? 'bag' : 'bag-outline'}
          size={22}
          color={count > 0 ? BLUE : '#444'}
        />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
          </View>
        )}
      </GlassCircle>
    </Pressable>
  );
}

function FloatingCustomerTabBar({ state, navigation, hideTabs }: any) {
  const insets              = useSafeAreaInsets();
  const router              = useRouter();
  const { totalItems }      = useCart();
  const pathname            = usePathname() ?? '';
  const onCartScreen        = pathname.includes('/cart');

  if (hideTabs) return null;

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
    Haptics.selectionAsync();
    router.push('/(customer)/cart' as any);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.barRow}>
        {/* Left spacer mirrors cart circle width to keep pill visually centred */}
        <View style={{ width: CIRCLE_SZ }} pointerEvents="none" />

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

        {!onCartScreen && (
          <CartCircleButton onPress={goToCart} count={totalItems} />
        )}
        {onCartScreen && <View style={{ width: CIRCLE_SZ }} pointerEvents="none" />}
      </View>
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors              = useColors();
  const { user }            = useAuth();
  const { totalItems }      = useCart();
  const router              = useRouter();
  const insets              = useSafeAreaInsets();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const isIOS    = Platform.OS === 'ios';
  const isWeb    = Platform.OS === 'web';
  const pathname = usePathname() ?? '';
  const hideTabs = pathname.includes('/cart');

  const goToCart = () => {
    Haptics.selectionAsync();
    router.push('/(customer)/cart' as any);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <Tabs
        tabBar={(props) => (isIOS ? <FloatingCustomerTabBar {...props} hideTabs={hideTabs} /> : undefined)}
        screenOptions={{
          tabBarActiveTintColor:   colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown:     false,
          tabBarShowLabel: false,
          tabBarStyle: hideTabs
            ? { display: 'none' }
            : isIOS
              ? { position: 'absolute', height: 0, backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 }
              : {
                  position:        'absolute',
                  backgroundColor: colors.background,
                  borderTopWidth:  isWeb ? 1 : 0,
                  borderTopColor:  colors.border,
                  elevation:       0,
                  ...(isWeb ? { height: 84 } : {}),
                },
          tabBarBackground: () =>
            isWeb ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} /> : null,
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
        <Tabs.Screen name="cart"           options={{ href: null, title: 'Order'         }} />
        <Tabs.Screen name="track/[id]"     options={{ href: null, title: 'Track Order'   }} />
        <Tabs.Screen name="stores"         options={{ href: null, title: 'Our Stores'    }} />
        <Tabs.Screen name="payment-methods" options={{ href: null, title: 'Payment Methods' }} />
      </Tabs>

      {/* Floating cart circle for web / Android (iOS uses FloatingCustomerTabBar above) */}
      {!isIOS && !hideTabs && (
        <View
          pointerEvents="box-none"
          style={[styles.webCartWrap, { bottom: Math.max(insets.bottom + (isWeb ? 84 : 56), 100) }]}
        >
          <CartCircleButton onPress={goToCart} count={totalItems} />
        </View>
      )}

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
  webCartWrap: {
    position: 'absolute',
    right:    24,
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
