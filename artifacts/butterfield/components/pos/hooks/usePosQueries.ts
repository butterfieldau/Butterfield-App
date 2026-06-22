import { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RegisterSessionReport } from '@/lib/api';
import {
  savePosProductsCache, prefetchProductImages, clearDetailCache,
  saveStoreConfig, saveLoyaltyConfig, getPosLastSyncedAt,
} from '@/lib/posCache';
import { sendRegisterSummaryPrint, sendOpenDrawer } from '@/lib/printer';
import { buildRegisterSummaryPrintLines, type ProductDetail } from '../types';

export function usePosQueries({
  queryClient,
  isShopDisplay,
  setDetailCache,
  setPrinterDrawerBusy,
  setLastDrawerSuccessAt,
}: {
  queryClient: QueryClient;
  isShopDisplay: boolean;
  setDetailCache: React.Dispatch<React.SetStateAction<Record<string, ProductDetail>>>;
  setPrinterDrawerBusy: (v: boolean) => void;
  setLastDrawerSuccessAt: (d: Date | null) => void;
}) {
  const [syncingAll, setSyncingAll] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    getPosLastSyncedAt().then(setLastSyncedAt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: productsData, isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const res = await api.products.list();
      if ((res as any)?.data?.length) { await savePosProductsCache((res as any).data); await prefetchProductImages((res as any).data); }
      return res;
    },
    staleTime: Infinity,
  });

  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['pos-categories'],
    queryFn: () => api.shopDisplay.categories(),
    staleTime: Infinity,
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['pos-summary'],
    queryFn: () => api.pos.summary(),
    refetchInterval: 30_000,
  });

  const { data: registerData, refetch: refetchRegister } = useQuery({
    queryKey: ['pos-register-current'],
    queryFn: () => api.pos.registerCurrent(),
    refetchInterval: 30_000,
  });

  const { data: storeData } = useQuery({
    queryKey: ['pos-store-settings'],
    queryFn: async () => {
      let result: any;
      if (isShopDisplay) {
        const [storeRes, printerRes] = await Promise.all([
          api.shopDisplay.store(),
          api.shopDisplay.getPrinterConfig(),
        ]);
        const store = (storeRes as any)?.data?.[0] ?? {};
        const printer = (printerRes as any)?.data ?? {};
        result = {
          ...store,
          printerIp: printer.printerIp ?? null,
          printerPort: printer.printerPort ? Number(printer.printerPort) : 9100,
          printerBrand: printer.printerBrand === 'star' ? 'star' : 'epson',
          autoPrint: printer.autoPrint === true,
          autoDrawer: printer.autoDrawer === true,
          drawerPin: (Number(printer.drawerPin ?? 0) === 1 ? 1 : 0) as 0 | 1,
        };
      } else {
        const res = await api.director.settings();
        const s = (res as any)?.data ?? {};
        result = {
          printerIp: s.printerIp ?? null, printerPort: s.printerPort ? Number(s.printerPort) : 9100,
          printerBrand: s.printerBrand ?? 'epson',
          autoPrint: s.autoPrint === 'true' || s.autoPrint === true,
          autoDrawer: s.autoDrawer === 'true' || s.autoDrawer === true,
          drawerPin: (Number(s.drawerPin ?? s.drawer_pin ?? 0) === 1 ? 1 : 0) as 0 | 1,
          dailySpecial: s.dailySpecial ?? s.daily_special ?? null,
        };
      }
      if (result) saveStoreConfig(result);
      return result;
    },
    staleTime: Infinity,
  });

  useQuery({
    queryKey: ['pos-loyalty-config'],
    queryFn: async () => { const res = await api.pos.loyaltyConfig(); const cfg = (res as any)?.data ?? null; if (cfg) saveLoyaltyConfig(cfg); return res; },
    staleTime: Infinity,
  });

  const { data: cacheClearSignal } = useQuery<number>({ queryKey: ['pos-cache-clear-signal'], queryFn: () => 0, enabled: false, staleTime: Infinity });
  useEffect(() => { if (cacheClearSignal) setDetailCache({}); }, [cacheClearSignal, setDetailCache]);

  const syncAll = useCallback(async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await clearDetailCache();
      setDetailCache({});
      await Promise.all([
        refetchProducts(), refetchCategories(), refetchSummary(), refetchRegister(),
        queryClient.refetchQueries({ queryKey: ['pos-store-settings'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['pos-surcharges'],     type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['pos-loyalty-config'], type: 'all' }),
      ]);
      getPosLastSyncedAt().then(d => setLastSyncedAt(d ?? new Date()));
    } finally { setSyncingAll(false); }
  }, [syncingAll, refetchProducts, refetchCategories, refetchSummary, refetchRegister, queryClient, setDetailCache]);

  const printRegisterReport = useCallback(async (report: RegisterSessionReport) => {
    const store = storeData as any;
    if (!store?.printerIp) { Alert.alert('No Printer', 'Configure a printer IP in POS settings to print the daily register summary.'); return; }
    const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
    await sendRegisterSummaryPrint({ title: 'Daily Register Summary', lines: buildRegisterSummaryPrintLines(report), printerBrand: store.printerBrand ?? 'epson' }, store.printerIp, store.printerPort ?? 9100, fetchBytes);
  }, [isShopDisplay, storeData]);

  const openDrawerWithTracking = useCallback(async () => {
    setPrinterDrawerBusy(true);
    const store = storeData as any;
    try {
      if (!store?.printerIp) { Alert.alert('No Printer', 'Configure a printer IP in POS settings to open the cash drawer.'); return; }
      const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
      await sendOpenDrawer(store.printerIp, store.printerPort ?? 9100, fetchBytes, (store.drawerPin ?? 0) as 0 | 1, store.printerBrand as 'epson' | 'star' | undefined);
      setLastDrawerSuccessAt(new Date());
    } catch (err: any) { Alert.alert('Drawer Error', err?.message ?? 'Could not open the cash drawer.'); }
    finally { setPrinterDrawerBusy(false); }
  }, [isShopDisplay, storeData, setPrinterDrawerBusy, setLastDrawerSuccessAt]);

  const allProducts = useMemo(() => {
    const raw = (productsData as any)?.data ?? [];
    return (raw as any[]).filter((p: any) => !p.isAppOnly);
  }, [productsData]);

  const categories = useMemo<{ slug: string; name: string; color?: string | null }[]>(() => {
    const apiCats = (categoriesData as any)?.data as { id: string; name: string; slug: string; sortOrder?: number; isActive?: boolean; color?: string | null }[] | undefined;
    if (apiCats && apiCats.length > 0) {
      return apiCats.filter(c => c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(c => ({ slug: c.slug, name: c.name, color: c.color ?? null }));
    }
    const slugs = [...new Set(allProducts.map((p: any) => p.category ?? 'other').filter(Boolean))] as string[];
    return slugs.sort((a, b) => a.localeCompare(b)).map(s => ({ slug: s, name: s.charAt(0).toUpperCase() + s.slice(1) }));
  }, [categoriesData, allProducts]);

  const registerState = (registerData as any)?.data ?? null;
  const registerSession = registerState?.session ?? null;
  const cashEnabled = registerState?.cashEnabled ?? false;

  return {
    productsData, loadingProducts, refetchProducts,
    categoriesData, refetchCategories,
    summaryData, refetchSummary,
    registerData, refetchRegister,
    storeData, syncAll, syncingAll, lastSyncedAt,
    registerState, registerSession, cashEnabled,
    printRegisterReport, openDrawerWithTracking,
    allProducts, categories,
  };
}
