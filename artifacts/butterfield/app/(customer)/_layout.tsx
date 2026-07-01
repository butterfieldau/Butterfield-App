import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { AnimatedTabItem, GlassPill } from '@/components/FloatingTabBar';
import { navScale, snapNavScaleFull } from '@/hooks/useNavScroll';
import CustomerFloatingCartBar from '@/components/customer/CustomerFloatingCartBar';

const BLUE = '#1493FF';

const CUSTOMER_TABS = {
  index:   { icon: 'home',    title: 'Home'    },
  menu:    { icon: 'list',    title: 'Menu'    },
  loyalty: { icon: 'star',    title: 'Rewards' },
  profile: { icon: 'person',  title: 'Account' },
} as const;

const VISIBLE_ROUTES = ['index', 'menu', 'loyalty', 'profile'] as const;

// Half of (circle-width + gap) — keeps the combined row visually centred when circle appears
const PILL_SHIFT = 28;

function FloatingCustomerTabBar({ state, navigation }: any) {
  const insets   = useSafeAreaInsets();
  const { totalItems } = useCart();
  const pathname = usePathname();

  const onCartScreen  = pathname === '/customer-cart';
  const cartVisible   = totalItems > 0 && !onCartScreen;

  const pillShift = useSharedValue(0);

  useEffect(() => {
    pillShift.value = cartVisible
      ? withSpring(-PILL_SHIFT, { damping: 28, stiffness: 220, mass: 0.8 })
      : withSpring(0,           { damping: 28, stiffness: 220, mass: 0.8 });
  }, [cartVisible]);

  const visibleRoutes = state.routes.filter((r: any) =>
    (VISIBLE_ROUTES as readonly string[]).includes(r.name),
  );

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      withSpring(navScale.value, { damping: 20, stiffness: 180, mass: 0.8 }) },
      { translateX: pillShift.value },
    ],
  }));

  const makeOnPress = (route: any, focused: boolean) => () => {
    snapNavScaleFull();
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
      <View style={styles.barRow}>
        <Reanimated.View style={pillAnimStyle}>
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
        </Reanimated.View>

        <CustomerFloatingCartBar />
      </View>
    </View>
  );
}

function ClassicCustomerTabs() {
  const colors   = useColors();
  const { user } = useAuth();
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  return (
    <>
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
        <Tabs.Screen name="track/[id]" options={{ href: null, title: 'Track Order' }} />
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
});
