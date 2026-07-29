/**
 * Legacy table ordering screen.
 *
 * Table ordering is now integrated into the main checkout flow via proximity
 * detection. This route exists only to handle old deep links gracefully.
 *
 * On mount it navigates to the main menu and shows a brief toast-style alert
 * so the customer knows to use the cart checkout when they're at the table.
 */
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { useStores } from '@/hooks/useStores';

export default function TableOrderRoute() {
  const { storeId } = useLocalSearchParams<{ storeId: string; tableNumber: string }>();
  const { data: storesData } = useStores();

  useEffect(() => {
    const stores = storesData?.data ?? [];
    const store = stores.find((s) => s.id === storeId);
    const storeName = store?.name ?? 'this store';

    // Navigate away first, then alert so the modal layer is gone.
    router.replace('/(customer)/menu' as any);

    setTimeout(() => {
      Alert.alert(
        'Order at your table',
        `Add items to your cart and select "Table Service" at checkout — you're within range of ${storeName}!`,
        [{ text: 'Got it', style: 'default' }],
      );
    }, 400);
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
