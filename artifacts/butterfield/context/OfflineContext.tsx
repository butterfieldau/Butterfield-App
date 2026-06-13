import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { api } from '@/lib/api';
import {
  enqueueOfflineOrder,
  loadOfflineQueue,
  markOfflineOrderFailed,
  removeFromOfflineQueue,
  type OfflineOrderPayload,
  type OfflineQueueEntry,
} from '@/lib/posCache';

interface OfflineContextValue {
  isOnline: boolean;
  pendingCount: number;
  failedItems: OfflineQueueEntry[];
  syncToast: string | null;
  enqueueOrder: (entry: OfflineQueueEntry) => Promise<void>;
  retryItem: (idempotencyKey: string) => Promise<void>;
  dismissItem: (idempotencyKey: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  pendingCount: 0,
  failedItems: [],
  syncToast: null,
  enqueueOrder: async () => {},
  retryItem: async () => {},
  dismissItem: async () => {},
  syncNow: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

/** Format AUD cents as a display string, e.g. 1550 → "$15.50" */
function fmtAUD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Build a short readable summary of order items from an OfflineQueueEntry. */
function buildItemSummary(entry: OfflineQueueEntry): string {
  // Use pre-built snapshot if available
  if (entry.itemSummary) return entry.itemSummary;
  const items = Array.isArray(entry.payload?.items) ? entry.payload.items : [];
  if (items.length === 0) return 'No items';
  const first2 = items
    .slice(0, 2)
    .map((i: any) => `${i.quantity ?? 1}× ${i.productName ?? i.name ?? 'item'}`)
    .join(', ');
  return items.length > 2 ? `${first2} +${items.length - 2} more` : first2;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<OfflineQueueEntry[]>([]);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const isSyncingRef = useRef(false);
  const wasOfflineRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    const q = await loadOfflineQueue();
    setQueue(q);
  }, []);

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const submitEntry = useCallback(async (entry: OfflineQueueEntry): Promise<boolean> => {
    try {
      await (api.pos.createOrder as any)(entry.payload);
      await removeFromOfflineQueue(entry.idempotencyKey);
      return true;
    } catch (err: any) {
      // ── 409 Conflict: server already has this exact order ─────────────────
      // This happens when the same idempotency key was synced by another device
      // (e.g. a backup tablet that came back online). The order IS processed —
      // staff just need to be informed so they don't re-ring it.
      if (err?.status === 409) {
        await removeFromOfflineQueue(entry.idempotencyKey);
        const itemText = buildItemSummary(entry);
        const totalText = fmtAUD(entry.totalCents ?? 0);
        Alert.alert(
          'Duplicate Order Detected',
          `This order was already processed on another device and has been removed from the sync queue.\n\n${itemText}\nTotal: ${totalText}\n\nNo action needed — check the order queue to confirm it was recorded.`,
          [
            {
              text: 'View Order Queue',
              style: 'default',
              // Staff can navigate to the order list themselves; we just dismiss here
              onPress: () => {},
            },
            { text: 'Dismiss', style: 'cancel' },
          ],
        );
        return true;
      }
      const isNetworkError =
        err?.message?.includes('Network request failed') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network');
      if (isNetworkError) {
        await markOfflineOrderFailed(entry.idempotencyKey, 'Network unavailable during sync');
      } else {
        await markOfflineOrderFailed(entry.idempotencyKey, err?.message ?? 'Server error');
      }
      return false;
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const q = await loadOfflineQueue();
      const pending = q.filter(e => e.syncStatus === 'pending');
      if (pending.length === 0) {
        await refreshQueue();
        return;
      }
      let syncedCount = 0;
      for (const entry of pending) {
        const ok = await submitEntry(entry);
        if (ok) syncedCount++;
      }
      await refreshQueue();
      if (syncedCount > 0) {
        setSyncToast(`Synced ${syncedCount} offline order${syncedCount > 1 ? 's' : ''}`);
        setTimeout(() => setSyncToast(null), 3500);
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [submitEntry, refreshQueue]);

  // Connectivity listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        // Give network a moment to stabilise before syncing
        setTimeout(() => syncNow(), 1500);
      } else if (!online) {
        wasOfflineRef.current = true;
      }
    });
    return () => unsub();
  }, [syncNow]);

  const enqueueOrder = useCallback(async (entry: OfflineQueueEntry) => {
    await enqueueOfflineOrder(entry);
    await refreshQueue();
  }, [refreshQueue]);

  const retryItem = useCallback(async (idempotencyKey: string) => {
    const q = await loadOfflineQueue();
    const entry = q.find(e => e.idempotencyKey === idempotencyKey);
    if (!entry) return;
    // Reset to pending
    await enqueueOfflineOrder({ ...entry, syncStatus: 'pending', syncError: undefined });
    await refreshQueue();
    if (isOnline) await syncNow();
  }, [isOnline, syncNow, refreshQueue]);

  const dismissItem = useCallback(async (idempotencyKey: string) => {
    await removeFromOfflineQueue(idempotencyKey);
    await refreshQueue();
  }, [refreshQueue]);

  const pendingCount = queue.filter(e => e.syncStatus === 'pending').length;
  const failedItems  = queue.filter(e => e.syncStatus === 'failed');

  return (
    <OfflineContext.Provider value={{
      isOnline,
      pendingCount,
      failedItems,
      syncToast,
      enqueueOrder,
      retryItem,
      dismissItem,
      syncNow,
    }}>
      {children}
    </OfflineContext.Provider>
  );
}
