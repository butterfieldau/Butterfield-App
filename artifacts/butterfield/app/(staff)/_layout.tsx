import { Feather } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { NewOrderBanner } from '@/components/NewOrderBanner';
import { useOrderNotifications, type NewOrderInfo } from '@/hooks/useOrderNotifications';

export default function StaffLayout() {
  const [pendingOrders, setPendingOrders] = useState<NewOrderInfo[]>([]);
  const [showBanner, setShowBanner] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleNewOrders = useCallback((orders: NewOrderInfo[]) => {
    setPendingOrders(orders);
    setUnreadCount((prev) => prev + orders.length);
    setShowBanner(true);
  }, []);

  useOrderNotifications(handleNewOrders);

  const handleDismiss = useCallback(() => setShowBanner(false), []);
  const handleView = useCallback(() => {
    setShowBanner(false);
    setUnreadCount(0);
    router.push('/(staff)/orders');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#40C0F2',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#EFEFEF', borderTopWidth: 1 },
          tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} />,
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarBadgeStyle: { backgroundColor: '#F40009', fontSize: 10, fontFamily: 'Inter_700Bold', minWidth: 18, height: 18, lineHeight: 18 },
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{ title: 'Tasks', tabBarIcon: ({ color }) => <Feather name="clipboard" size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="timesheet"
          options={{ title: 'Timesheet', tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }}
        />
        <Tabs.Screen name="products" options={{ href: null }} />
      </Tabs>

      {showBanner && (
        <NewOrderBanner orders={pendingOrders} onDismiss={handleDismiss} onView={handleView} />
      )}
    </View>
  );
}
