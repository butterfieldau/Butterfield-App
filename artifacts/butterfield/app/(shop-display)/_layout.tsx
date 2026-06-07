import { Feather } from '@expo/vector-icons';
import { Redirect, router, Tabs, usePathname } from 'expo-router';
import React from 'react';
import { Image, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { useShopDisplayAwakeMode } from '@/lib/shopDisplayMode';
import { api } from '@/lib/api';

const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const WHITE = '#FFFFFF';
const MUTED = '#9CA3AF';

const NAV_ITEMS = [
  { segment: 'pos',       label: 'POS',          icon: 'monitor'      as const },
  { segment: 'index',     label: 'Orders',       icon: 'shopping-bag' as const },
  { segment: 'products',  label: 'Products',     icon: 'package'      as const, perm: 'products'  },
  { segment: 'tasks',     label: 'Tasks',        icon: 'check-square' as const },
  { segment: 'clock',     label: 'Clock In/Out', icon: 'clock'        as const },
  { segment: 'customers', label: 'Customers',    icon: 'users'        as const, perm: 'customers' },
  { segment: 'scan',      label: 'Scan QR',      icon: 'maximize'     as const },
  { segment: 'settings',  label: 'Settings',     icon: 'settings'     as const },
] as const;

export default function ShopDisplayLayout() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const pathname = usePathname();
  useShopDisplayAwakeMode(user?.role === 'shop_display');

  const { data: meData } = useQuery({
    queryKey: ['shop-display-me'],
    queryFn: () => api.shopDisplay.me(),
    enabled: user?.role === 'shop_display',
    staleTime: 60000,
  });
  const permissions: string[] = meData?.data?.permissions ?? [];

  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'shop_display') return <Redirect href={getHomeRouteForRole(user.role)} />;

  const activeSegment = pathname.split('/').pop() ?? 'index';
  const isActive = (segment: string) =>
    segment === 'index'
      ? (activeSegment === 'index' || activeSegment === '(shop-display)')
      : activeSegment === segment;

  const visibleNavItems = NAV_ITEMS.filter((item) => !('perm' in item) || permissions.includes(item.perm!));

  const tabBarStyle: object = isWide
    ? { display: 'none' }
    : {
        backgroundColor: WHITE,
        borderTopColor: '#E5E7EB',
        borderTopWidth: StyleSheet.hairlineWidth,
        height: 74,
        paddingBottom: 10,
        paddingTop: 8,
      };

  const tabScreens = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: tabBarStyle as any,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12, marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{ title: 'POS', tabBarIcon: ({ color, size }) => <Feather name="monitor" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} />,
          tabBarButton: (!isWide && !permissions.includes('products')) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <Feather name="check-square" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="clock"
        options={{ title: 'Clock', tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
          tabBarButton: (!isWide && !permissions.includes('customers')) ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Scan QR', tabBarIcon: ({ color, size }) => <Feather name="maximize" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }}
      />
    </Tabs>
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: NAVY }}>
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <View style={[styles.sidebar, { paddingTop: Math.max(insets.top + 12, 40) }]}>
          <View style={styles.sidebarBrand}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={styles.sidebarLogo}
              resizeMode="contain"
            />
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>SHOP DISPLAY</Text>
            </View>
            <Text style={styles.brandSub} numberOfLines={1}>{user.name}</Text>
          </View>

          <View style={styles.navList}>
            {visibleNavItems.map((item) => {
              const active = isActive(item.segment);
              return (
                <Pressable
                  key={item.segment}
                  onPress={() => {
                    const route = item.segment === 'index'
                      ? '/(shop-display)'
                      : `/(shop-display)/${item.segment}`;
                    router.navigate(route as any);
                  }}
                  style={[styles.navItem, active && styles.navItemActive]}
                >
                  <Feather name={item.icon} size={18} color={active ? BLUE : MUTED} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => logout().then(() => router.replace('/(auth)/login'))}
            style={styles.sidebarLogout}
          >
            <Feather name="log-out" size={15} color={MUTED} />
            <Text style={styles.sidebarLogoutText}>Sign out</Text>
          </Pressable>
        </View>

        {/* ── Content ─────────────────────────────────────────────── */}
        <View style={{ flex: 1, paddingTop: insets.top }}>
          {tabScreens}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <PortalHeader
        badge="SHOP DISPLAY"
        badgeColor={BLUE}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login'))}
      />
      {tabScreens}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar:           { width: 220, backgroundColor: NAVY, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(255,255,255,0.12)' },
  sidebarBrand:      { paddingHorizontal: 16, paddingBottom: 20, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)', marginBottom: 10 },
  sidebarLogo:       { width: 130, height: 38, marginBottom: 4 },
  brandBadge:        { backgroundColor: 'rgba(20,147,255,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  brandBadgeText:    { color: BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  brandSub:          { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },
  navList:           { flex: 1, paddingHorizontal: 10, gap: 2 },
  navItem:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14 },
  navItemActive:     { backgroundColor: 'rgba(20,147,255,0.18)' },
  navLabel:          { fontSize: 14, fontWeight: '600', color: MUTED },
  navLabelActive:    { color: WHITE, fontWeight: '700' },
  sidebarLogout:     { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sidebarLogoutText: { color: MUTED, fontSize: 13, fontWeight: '600' },
});
