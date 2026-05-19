import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { GlassTabPill, GlassTabContainer } from '@/components/GlassTabPill';

const NAVY  = '#1A2B4A';
const BLUE  = '#1493FF';
const ACTIVE_TEXT = '#0C5A87';
const IDLE_TEXT   = '#2D2F33';

const WHOLESALE_TABS = [
  { name: 'index',   title: 'Dashboard', icon: 'grid' },
  { name: 'catalog', title: 'Catalog',   icon: 'package' },
  { name: 'cart',    title: 'Cart',      icon: 'shopping-cart' },
  { name: 'orders',  title: 'Orders',    icon: 'file-text' },
  { name: 'profile', title: 'Account',   icon: 'user' },
] as const;

function WholesaleGlassTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassTabContainer spacing={12} style={s.row}>
        <GlassTabPill style={s.pill} colorScheme="light">
          {WHOLESALE_TABS.map((tab) => {
            const route = state.routes.find((r: any) => r.name === tab.name);
            if (!route) return null;
            const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
            const focused = state.index === routeIndex;
            const iconColor = focused ? ACTIVE_TEXT : IDLE_TEXT;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync();
                navigation.navigate(tab.name);
              }
            };

            return (
              <Pressable key={tab.name} onPress={onPress} style={[s.tab, focused && s.tabActive]}>
                {focused ? (
                  <LinearGradient
                    colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.82)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Feather name={tab.icon as any} size={22} color={iconColor} />
                <Text style={[s.label, { color: iconColor, fontWeight: focused ? '700' : '500' }]} numberOfLines={1}>
                  {tab.title}
                </Text>
              </Pressable>
            );
          })}
        </GlassTabPill>
      </GlassTabContainer>
    </View>
  );
}

const isIOS = Platform.OS === 'ios';

export default function WholesaleLayout() {
  const { logout } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <PortalHeader
        badge="WHOLESALE"
        badgeColor={BLUE}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />
      <Tabs
        tabBar={(props) => (isIOS ? <WholesaleGlassTabBar {...props} /> : undefined)}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: isIOS
            ? { position: 'absolute', height: 0, backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 }
            : { backgroundColor: '#fff', borderTopColor: '#EFEFEF', borderTopWidth: 1 },
          tabBarLabelStyle: { fontWeight: '500', fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid"          size={22} color={color} /> }} />
        <Tabs.Screen name="catalog"  options={{ title: 'Catalog',   tabBarIcon: ({ color }) => <Feather name="package"       size={22} color={color} /> }} />
        <Tabs.Screen name="cart"     options={{ title: 'Cart',      tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} /> }} />
        <Tabs.Screen name="orders"   options={{ title: 'Orders',    tabBarIcon: ({ color }) => <Feather name="file-text"     size={22} color={color} /> }} />
        <Tabs.Screen name="profile"  options={{ title: 'Account',   tabBarIcon: ({ color }) => <Feather name="user"          size={22} color={color} /> }} />
        <Tabs.Screen name="invoices"  options={{ href: null }} />
        <Tabs.Screen name="addresses" options={{ href: null }} />
      </Tabs>
    </View>
  );
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
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.74)',
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
  tabActive: {
    shadowColor: BLUE,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: {
    fontSize: 10,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
