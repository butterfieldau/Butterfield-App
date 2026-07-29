import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { type StoreSummary } from '@/lib/api';
import { useStores } from '@/hooks/useStores';

/** Haversine distance in metres between two lat/lng pairs */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TABLE_PROXIMITY_METRES = 10;

export interface UseNearbyStoreResult {
  nearbyStore: StoreSummary | null;
  loading: boolean;
}

/**
 * Requests foreground location permission and returns the first store whose
 * coordinates are within TABLE_PROXIMITY_METRES of the device.
 *
 * - Returns { nearbyStore: null, loading: true } while permission is pending.
 * - Returns { nearbyStore: null, loading: false } on denial or unavailability.
 * - Never throws / shows an error to the customer.
 */
export function useNearbyStore(): UseNearbyStoreResult {
  const [nearbyStore, setNearbyStore] = useState<StoreSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: storesData } = useStores();
  const stores = storesData?.data ?? [];

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // Only request "when in use" permission — never background.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLoading(false);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        const { latitude, longitude, accuracy } = pos.coords;

        // Find the closest store and check if it's within range (accounting for
        // GPS accuracy the same way the staff clock-in code does).
        let found: StoreSummary | null = null;
        for (const store of stores) {
          if (store.latitude == null || store.longitude == null) continue;
          const raw = haversineMetres(latitude, longitude, store.latitude, store.longitude);
          const effectiveDistance = Math.max(0, raw - (accuracy ?? 0));
          if (effectiveDistance <= TABLE_PROXIMITY_METRES) {
            found = store;
            break;
          }
        }

        if (!cancelled) {
          setNearbyStore(found);
          setLoading(false);
        }
      } catch {
        // Location unavailable — silently fall through.
        if (!cancelled) setLoading(false);
      }
    }

    // Only run once stores are loaded.
    if (stores.length > 0) {
      check();
    } else {
      // Stores not yet available — keep loading until they arrive.
      // The effect will re-run when `stores` changes.
    }

    return () => {
      cancelled = true;
    };
  }, [stores]);

  // If stores haven't loaded yet we stay in loading state.
  return { nearbyStore, loading };
}
