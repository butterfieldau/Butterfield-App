import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { FloatingInternalTabBar } from '@/components/FloatingTabBar';

const BG   = '#EFF6FF';
const BLUE = '#1493FF';

const WHOLESALE_TAB_CONFIG = {
  index:   { icon: 'home',          title: 'Dashboard' },
  catalog: { icon: 'shopping-bag',  title: 'Catalog'   },
  cart:    { icon: 'shopping-cart', title: 'Cart'      },
  orders:  { icon: 'file-text',     title: 'Orders'    },
  profile: { icon: 'user',          title: 'Account'   },
} as const;

const VISIBLE: string[] = ['index', 'catalog', 'cart', 'orders', 'profile'];

export default function WholesaleLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return <Redirect href="/(customer)" />;
  if (user.role !== 'wholesale') return <Redirect href={getHomeRouteForRole(user.role)} />;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} translucent={false} />
      <View style={{ height: insets.top, backgroundColor: BG }} />
      <Tabs
        tabBar={(props) => (
          <FloatingInternalTabBar
            {...props}
            visibleRouteNames={VISIBLE}
            tabConfig={WHOLESALE_TAB_CONFIG}
            activeColor={BLUE}
          />
        )}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: 'absolute', height: 0,
            backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0,
          },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="catalog"  options={{ title: 'Catalog'   }} />
        <Tabs.Screen name="cart"     options={{ title: 'Cart'      }} />
        <Tabs.Screen name="orders"   options={{ title: 'Orders'    }} />
        <Tabs.Screen name="profile"  options={{ title: 'Account'   }} />
        <Tabs.Screen name="invoices"  options={{ href: null }} />
        <Tabs.Screen name="addresses" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
