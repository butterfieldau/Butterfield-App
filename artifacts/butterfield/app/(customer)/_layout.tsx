import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { GlassTabPill, GlassTabContainer } from '@/components/GlassTabPill';

const PRIMARY_TOP = '#1493FF';
const ACTIVE_TEXT = '#0C5A87';
const IDLE_TEXT   = '#2D2F33';

function LiquidCustomerTabBar({ state, descriptors, navigation, hideTabs }: any) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();

  if (hideTabs) return null;

  const mainRoutes = state.routes.filter((route: any) =>
    ['index', 'menu', 'loyalty', 'cart'].includes(route.name)
  );
  const accountRoute = state.routes.find((route: any) => route.name === 'profile');

  const renderTab = (route: any, detached = false) => {
    const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
    const focused = state.index === routeIndex;
    const options = descriptors[route.key]?.options ?? {};
    const label = options.title ?? route.name;
    const iconColor = focused ? ACTIVE_TEXT : IDLE_TEXT;

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
        style={[detached ? s.detachedTab : s.tab, focused && s.tabActive]}
      >
        {focused ? (
          <LinearGradient
            colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={s.iconWrap}>
          {options.tabBarIcon ? options.tabBarIcon({ color: iconColor, focused, size: 22 }) : null}
          {route.name === 'cart' && totalItems > 0 ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{String(totalItems > 99 ? '99+' : totalItems)}</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[s.label, { color: iconColor, fontWeight: focused ? '700' : '500' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* GlassContainer makes adjacent GlassTabPills merge at iOS 26+ */}
      <GlassTabContainer spacing={12} style={s.row}>
        <GlassTabPill style={s.mainPill} colorScheme="light">
          {mainRoutes.map((route: any) => renderTab(route))}
        </GlassTabPill>

        {accountRoute ? (
          <GlassTabPill style={s.accountPill} colorScheme="light">
            {renderTab(accountRoute, true)}
          </GlassTabPill>
        ) : null}
      </GlassTabContainer>
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
      tabBar={(props) =>
        isIOS ? <LiquidCustomerTabBar {...props} hideTabs={hideTabs} /> : undefined
      }
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
      <Tabs.Screen name="favourites"  options={{ href: null, title: 'Favourites' }} />
      <Tabs.Screen name="track/[id]"  options={{ href: null, title: 'Track Order' }} />
      <Tabs.Screen name="stores"      options={{ href: null, title: 'Our Stores' }} />
    </Tabs>
  );
}

export default function CustomerTabLayout() {
  return <ClassicCustomerTabs />;
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  row: {
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.74)',
  },
  accountPill: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.74)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tab: {
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
  detachedTab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  tabActive: {
    shadowColor: PRIMARY_TOP,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
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
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  label: {
    fontSize: 10,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
