import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs, usePathname, useRouter } from 'expo-router';
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

const TABS = [
  { name: 'index',   path: '/(wholesale)',         title: 'Dashboard', icon: 'grid'          },
  { name: 'catalog', path: '/(wholesale)/catalog', title: 'Catalog',   icon: 'package'       },
  { name: 'cart',    path: '/(wholesale)/cart',    title: 'Cart',      icon: 'shopping-cart' },
  { name: 'orders',  path: '/(wholesale)/orders',  title: 'Orders',    icon: 'file-text'     },
  { name: 'profile', path: '/(wholesale)/profile', title: 'Account',   icon: 'user'          },
] as const;

function WholesaleGlassTabBar() {
  const pathname   = usePathname();
  const nav        = useRouter();
  const insets     = useSafeAreaInsets();

  // Hide tab bar entirely on the Cart screen
  if (pathname.includes('/cart')) return null;

  const isActive = (name: string) => {
    if (name === 'index') {
      return !TABS.slice(1).some(t => pathname.includes(`/${t.name}`));
    }
    return pathname.includes(`/${name}`);
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassTabContainer spacing={12} style={s.row}>
        <GlassTabPill style={s.pill} colorScheme="light">
          {TABS.map((tab) => {
            const focused   = isActive(tab.name);
            const iconColor = focused ? ACTIVE_TEXT : IDLE_TEXT;

            const onPress = () => {
              Haptics.selectionAsync();
              nav.navigate(tab.path as any);
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
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: '#8E8E93',
          // Fully collapse & hide the native tab bar on iOS — the glass pill above handles it
          tabBarStyle: isIOS
            ? { position: 'absolute', height: 0, minHeight: 0, opacity: 0, overflow: 'hidden' }
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

      {/* Glass pill rendered OUTSIDE Tabs so it is never part of the native tab bar stack */}
      {isIOS && <WholesaleGlassTabBar />}
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
