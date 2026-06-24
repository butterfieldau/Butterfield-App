import { Redirect, Tabs } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { FloatingInternalTabBar } from '@/components/FloatingTabBar';
import { api } from '@/lib/api';
import { useWholesaleScreenSecurity } from '@/hooks/useWholesaleScreenSecurity';
import WholesaleTermsScreen from './terms';

const BG   = '#EFF6FF';
const BLUE = '#1493FF';

const WHOLESALE_TAB_CONFIG = {
  index:   { icon: 'home',           title: 'Dashboard' },
  catalog: { icon: 'bag',            title: 'Catalog'   },
  cart:    { icon: 'cart',           title: 'Cart'      },
  orders:  { icon: 'document-text',  title: 'Orders'    },
  profile: { icon: 'person',         title: 'Account'   },
} as const;

const VISIBLE: string[] = ['index', 'catalog', 'cart', 'orders', 'profile'];

export default function WholesaleLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  useWholesaleScreenSecurity({ screenName: 'WholesalePortal', enabled: !!user && user.role === 'wholesale' });

  const { data: termsStatus, isLoading: termsLoading } = useQuery({
    queryKey: ['wholesale-terms-status'],
    queryFn:  () => api.wholesale.termsStatus(),
    enabled:  !!user && user.role === 'wholesale',
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const handleTermsAccepted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wholesale-terms-status'] });
  }, [queryClient]);

  if (!user) return <Redirect href="/(customer)" />;
  if (user.role !== 'wholesale') return <Redirect href={getHomeRouteForRole(user.role)} />;

  if (termsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  if (termsStatus && !termsStatus.accepted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFF' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFF" />
        <View style={{ height: insets.top, backgroundColor: '#F8FAFF' }} />
        <WholesaleTermsScreen onAccepted={handleTermsAccepted} />
      </View>
    );
  }

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
        <Tabs.Screen name="terms"     options={{ href: null }} />
      </Tabs>
    </View>
  );
}
