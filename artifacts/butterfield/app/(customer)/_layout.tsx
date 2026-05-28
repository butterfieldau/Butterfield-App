import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { AnimatedTabItem, GlassPill, GlassCircle } from '@/components/FloatingTabBar';

const BLUE  = '#1493FF';
const WHITE = '#FFFFFF';
const MUTED = '#9CA3AF';

const CUSTOMER_TABS = {
  index:   { icon: 'home',         title: 'Home'    },
  menu:    { icon: 'list',         title: 'Menu'    },
  loyalty: { icon: 'star',         title: 'Rewards' },
  cart:    { icon: 'shopping-bag', title: 'Order'   },
} as const;

function FloatingCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();

  if (hideTabs) return null;

  const mainRoutes    = state.routes.filter((r: any) => Object.keys(CUSTOMER_TABS).includes(r.name));
  const accountRoute  = state.routes.find((r: any) => r.name === 'profile');
  const accountIdx    = accountRoute ? state.routes.findIndex((r: any) => r.key === accountRoute.key) : -1;
  const accountFocused = accountIdx >= 0 && state.index === accountIdx;

  const makeOnPress = (route: any, focused: boolean) => () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(route.name);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.row}>
        {/* ── Main pill ── */}
        <GlassPill style={{ flex: 1 }}>
          {mainRoutes.map((route: any) => {
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
                badgeCount={route.name === 'cart' ? totalItems : undefined}
              />
            );
          })}
        </GlassPill>

        {/* ── Account circle ── */}
        {accountRoute && (
          <Pressable onPress={makeOnPress(accountRoute, accountFocused)} style={styles.accountWrap}>
            <GlassCircle size={64}>
              <View style={[styles.accountInner, accountFocused && styles.accountInnerActive]}>
                <Feather name="user" size={22} color={accountFocused ? WHITE : MUTED} />
              </View>
            </GlassCircle>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors  = useColors();
  const { user } = useAuth();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const isIOS   = Platform.OS === 'ios';
  const isWeb   = Platform.OS === 'web';
  const pathname = usePathname() ?? '';
  const hideTabs = pathname.includes('/cart');

  return (
    <>
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
              if (!user) { e.preventDefault(); setLoginTarget('/(customer)/loyalty'); }
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
              if (!user) { e.preventDefault(); setLoginTarget('/(customer)/cart'); }
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
              if (!user) { e.preventDefault(); setLoginTarget('/(customer)/profile'); }
            },
          }}
          options={{
            title: 'Account',
            tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
          }}
        />
        <Tabs.Screen name="track/[id]" options={{ href: null, title: 'Track Order' }} />
        <Tabs.Screen name="stores"     options={{ href: null, title: 'Our Stores' }} />
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
    position:        'absolute',
    left:            0,
    right:           0,
    bottom:          0,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  accountWrap: {
    // no extra style needed — GlassCircle carries its own shadow
  },
  accountInner: {
    width:          50,
    height:         50,
    borderRadius:   999,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  accountInnerActive: {
    backgroundColor: BLUE,
  },
});
