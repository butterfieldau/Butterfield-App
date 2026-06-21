import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Redirect, router, Tabs, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { getHomeRouteForRole } from '@/lib/roleRoutes';
import { useShopDisplayAwakeMode, getDisplayLockPin, verifyDisplayLockPin, clearDisplayLockPin, getShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';
import { LayoutSafeAreaContext } from '@/context/LayoutSafeAreaContext';
import { api } from '@/lib/api';
import {
  getPosLastSyncedAt, getMsUntil4amSydney, formatSyncTime,
  loadCachedPosProducts, loadCachedStoreConfig, loadCachedSurcharges, loadCachedLoyaltyConfig,
  clearDetailCache,
} from '@/lib/posCache';
import { PosIdleScreen } from '@/components/PosIdleScreen';
import PosPinModal from '@/components/PosPinModal';

const IDLE_TIMEOUT_MS = 120_000;

const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const WHITE = '#FFFFFF';
const MUTED = '#9CA3AF';
const TEXT  = '#1C1C1E';
const SOFT_BLUE = '#EFF6FF';

type NewOrderBannerOrder = { customerName: string; orderNumber: string };
const NEW_ORDER_STATUSES = new Set(['received', 'scheduled']);

// ── Web AudioContext — created once, shared across renders ────────────────────
// Kept at module level so the unlocked state persists across component re-renders.
let _webAudioCtx: AudioContext | null = null;

function getOrCreateWebAudioCtx(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  const win = globalThis as any;
  const AC = win.AudioContext ?? win.webkitAudioContext;
  if (!AC) return null;
  if (!_webAudioCtx) _webAudioCtx = new AC() as AudioContext;
  return _webAudioCtx;
}

function unlockWebAudio() {
  const ctx = getOrCreateWebAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function toAlertOrder(order: { id: string; customerName?: string | null; orderNumber?: string | null }) {
  return {
    customerName: order.customerName ?? 'Customer',
    orderNumber: order.orderNumber ?? `#${order.id.slice(0, 6).toUpperCase()}`,
  };
}

function NewOrderAlertOverlay({
  visible,
  order,
  onDismiss,
  soundEnabled,
  queueIndex,
  queueTotal,
}: {
  visible: boolean;
  order: NewOrderBannerOrder | null;
  onDismiss: () => void;
  soundEnabled: boolean;
  queueIndex?: number;
  queueTotal?: number;
}) {
  // On web: holds the currently-playing AudioBufferSourceNode (looping)
  const webSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Native: useAudioPlayer manages lifecycle and cleanup automatically.
  // Pass null on web so the hook is always called (rules of hooks) but is a no-op.
  const player = useAudioPlayer(
    Platform.OS !== 'web'
      ? require('@/assets/sounds/app-sales-order-alert.wav')
      : null,
  );

  // One-time native audio mode + player config (re-runs if player identity changes)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    player.loop = true;
    player.volume = 1;
  }, [player]);

  // Native: drive play/pause from visibility + sound setting
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (visible && soundEnabled) {
      player.seekTo(0);
      player.play();
    } else {
      player.pause();
    }
  }, [visible, soundEnabled, player]);

  // Web: manual Web Audio API path (expo-audio does not support web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!visible) {
      if (webSourceRef.current) {
        try { webSourceRef.current.stop(); } catch {}
        webSourceRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const alertSoundModule = require('@/assets/sounds/app-sales-order-alert.wav');
        const ctx = getOrCreateWebAudioCtx();
        if (!ctx) throw new Error('Web audio is unavailable on this device');
        // Ensure context is running — may still be suspended before first gesture
        if (ctx.state === 'suspended') await ctx.resume();

        const asset = Image.resolveAssetSource(alertSoundModule);
        const rawSrc = asset?.uri;
        if (!rawSrc) throw new Error('App Sales alert sound URL missing');
        // Convert any relative URI to absolute so fetch() works in all browsers
        const src = rawSrc.startsWith('http')
          ? rawSrc
          : `${(globalThis as any).location?.origin ?? ''}${rawSrc}`;

        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        if (!soundEnabled) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;
        source.connect(ctx.destination);
        source.start(0);
        webSourceRef.current = source;
      } catch (error) {
        console.warn('App Sales order alert sound failed to start', error);
      }
    })();
    return () => {
      cancelled = true;
      if (webSourceRef.current) {
        try { webSourceRef.current.stop(); } catch {}
        webSourceRef.current = null;
      }
    };
  }, [visible, soundEnabled]);

  if (!visible || !order) return null;

  const showCounter = typeof queueTotal === 'number' && queueTotal > 1;
  const counterLabel = showCounter ? `${(queueIndex ?? 0) + 1} of ${queueTotal}` : null;

  // Card and backdrop are SIBLINGS (not nested) so a tap on the dismiss
  // button can never also trigger the backdrop handler — no double-shift risk.
  const overlayContent = (
    <View style={sAlert.overlayWrap}>
      {/* Backdrop — full-screen, tap to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      {/* Card — sits above the backdrop, does not bubble touches to it */}
      <View style={sAlert.card}>
        {showCounter && (
          <View style={sAlert.counterBadge}>
            <Text style={sAlert.counterText}>{counterLabel}</Text>
          </View>
        )}
        <View style={sAlert.iconWrap}>
          <Feather name="bell" size={40} color={NAVY} />
        </View>
        <Text style={sAlert.title}>New Order</Text>
        <Text style={sAlert.name}>{order.customerName}</Text>
        <Text style={sAlert.orderNum}>{order.orderNumber}</Text>
        <Text style={sAlert.hint}>Tap anywhere outside to dismiss</Text>
        <TouchableOpacity style={sAlert.dismissBtn} onPress={onDismiss} activeOpacity={0.82}>
          <Feather name="check" size={18} color={WHITE} />
          <Text style={sAlert.dismissText}>Got it — dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // On web the POS runs inside the browser DOM; a React Native Modal does NOT
  // guarantee rendering above browser-native elements or other high-z-index
  // overlays. Use a plain absolute-fill View with an extreme zIndex instead.
  if (Platform.OS === 'web') {
    return (
      <View style={[sAlert.webTopLayer]}>
        {overlayContent}
      </View>
    );
  }

  // Native: keep Modal but promote it to the top hardware layer so it renders
  // above the status bar and any other modal that may already be open.
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
      hardwareAccelerated
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {overlayContent}
    </Modal>
  );
}

const sAlert = StyleSheet.create({
  // On web: sits above everything else in the stacking context
  webTopLayer:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999 } as any,
  // Shared container for both web and native paths — full-fill, dimmed background,
  // centres the card. Backdrop Pressable uses absoluteFill inside this view.
  overlayWrap:  { flex: 1, backgroundColor: 'rgba(20,43,74,0.72)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  backdrop:     { flex: 1, backgroundColor: 'rgba(20,43,74,0.72)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:         { backgroundColor: SOFT_BLUE, borderRadius: 28, padding: 36, alignItems: 'center', gap: 10, width: '100%', maxWidth: 360, borderWidth: 3, borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  iconWrap:    { width: 88, height: 88, borderRadius: 44, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 4, borderWidth: 2, borderColor: '#93C5FD' },
  title:       { fontSize: 30, fontWeight: '900', color: BLUE },
  name:        { fontSize: 20, fontWeight: '700', color: NAVY },
  orderNum:    { fontSize: 15, fontWeight: '700', color: BLUE },
  hint:        { fontSize: 13, color: NAVY, marginTop: 10, opacity: 0.68 },
  // Queue counter badge — shown when more than one alert is queued
  counterBadge: { backgroundColor: BLUE, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 4 },
  counterText:  { color: WHITE, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  // Explicit dismiss button inside the card
  dismissBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: NAVY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 6, width: '100%', justifyContent: 'center' },
  dismissText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});

const NAV_ITEMS = [
  { segment: 'pos',       label: 'POS',          icon: 'monitor'      as const },
  { segment: 'index',     label: 'App Sales',    icon: 'shopping-bag' as const },
  { segment: 'dashboard', label: 'Dashboard',    icon: 'bar-chart-2'  as const },
  { segment: 'products',  label: 'Products',     icon: 'package'      as const, perm: 'products'  },
  { segment: 'tasks',     label: 'Tasks',        icon: 'check-square' as const },
  { segment: 'clock',     label: 'Clock In/Out', icon: 'clock'        as const },
  { segment: 'customers', label: 'Customers',    icon: 'users'        as const, perm: 'customers' },
  { segment: 'settings',  label: 'Settings',     icon: 'settings'     as const },
] as const;

export default function ShopDisplayLayout() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // On iOS, only use the sidebar/wide layout on iPad — never on iPhone (even wide-screen
  // iPhones in landscape return insets.top=0 which breaks safe-area handling).
  // On other platforms (web preview, Android) fall back to width-based detection.
  const isWide = Platform.OS === 'ios' ? Platform.isPad : width >= 768;
  const pathname = usePathname();
  useShopDisplayAwakeMode(user?.role === 'shop_display');

  const { data: meData } = useQuery({
    queryKey: ['shop-display-me'],
    queryFn: () => api.shopDisplay.me(),
    enabled: user?.role === 'shop_display',
    staleTime: 60000,
  });
  const permissions: string[] = meData?.data?.permissions ?? [];

  // ── New-order badge — counts orders in 'received' state (not yet acknowledged) ──
  const { data: ordersData } = useQuery({
    queryKey: ['shop-display-orders'],
    queryFn: () => api.shopDisplay.orders(),
    enabled: user?.role === 'shop_display',
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const layoutRows: Array<{ id: string; status: string; customerName?: string | null; orderNumber?: string | null; createdAt?: string }> = ordersData?.data ?? [];
  const incomingOrderCount = layoutRows.filter((o) => NEW_ORDER_STATUSES.has(o.status)).length;

  // ── New-order popup + sound (layout-level so it fires on any tab) ──────────
  const [soundEnabled, setSoundEnabled] = useState(true);
  // Queue of pending alerts — first item is currently displayed, rest are waiting.
  // Using a queue ensures no order notification is silently dropped when multiple
  // orders arrive in quick succession or while another alert is still showing.
  const [alertQueue, setAlertQueue] = useState<NewOrderBannerOrder[]>([]);
  const seenRef    = useRef<Record<string, string>>({});
  const bootedRef  = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabled).catch(() => {});
  }, []);

  // Pre-unlock the Web AudioContext on the first user gesture anywhere on the
  // display so that the order-alert sound can play without autoplay restrictions.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      unlockWebAudio();
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('click', handler);
    };
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('pointerdown', handler, { passive: true });
    document.addEventListener('click', handler, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  useEffect(() => {
    const currentMap: Record<string, string> = {};
    for (const o of layoutRows) currentMap[o.id] = o.status;

    if (!bootedRef.current) {
      if (layoutRows.length === 0) return;
      seenRef.current = currentMap;
      bootedRef.current = true;
      const mountMs = mountTimeRef.current;
      const freshOnBoot = layoutRows.find(o => {
        if (!NEW_ORDER_STATUSES.has(o.status)) return false;
        const ts = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        return ts >= mountMs - 2000;
      });
      if (freshOnBoot) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setAlertQueue(prev => {
          const already = prev.some(a => a.orderNumber === toAlertOrder(freshOnBoot).orderNumber);
          return already ? prev : [...prev, toAlertOrder(freshOnBoot)];
        });
      }
      return;
    }

    const prev = seenRef.current;
    const freshOrders = layoutRows.filter((o) => !prev[o.id] && NEW_ORDER_STATUSES.has(o.status));
    if (freshOrders.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAlertQueue(q => {
        let next = [...q];
        for (const o of freshOrders) {
          const alert = toAlertOrder(o);
          if (!next.some(a => a.orderNumber === alert.orderNumber)) {
            next = [...next, alert];
          }
        }
        return next;
      });
    }
    seenRef.current = currentMap;
  }, [layoutRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global screensaver ───────────────────────────────────────────────────────
  const lastIdleRef = useRef<number>(Date.now());
  const [isIdle, setIsIdle] = useState(false);

  const { data: idleProductsData } = useQuery({
    queryKey: ['shop-display-idle-products'],
    queryFn: () => api.shopDisplay.idleProducts(),
    enabled: user?.role === 'shop_display',
    staleTime: 5 * 60_000,
  });
  const idleProducts: any[] = (idleProductsData as any)?.data ?? [];

  const { data: idleStoreData } = useQuery({
    queryKey: ['shop-display-store'],
    queryFn: () => api.shopDisplay.store(),
    enabled: user?.role === 'shop_display',
    staleTime: 60_000,
  });
  const idleDailySpecial: string | null = (idleStoreData as any)?.data?.[0]?.dailySpecial ?? null;

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastIdleRef.current >= IDLE_TIMEOUT_MS) {
        setIsIdle(prev => prev ? prev : true);
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, []);

  // ── Product sync ──────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // Gate: holds the Tabs from rendering until AsyncStorage cache is seeded into
  // QueryClient, so POS useQuery hooks see cached data on their first execution
  // and staleTime:Infinity suppresses the network fetch.
  const [cacheSeeded, setCacheSeeded] = useState(false);

  // ── Dashboard PIN gate ────────────────────────────────────────────────────
  const [dashboardLocked, setDashboardLocked] = useState(true);
  const [showDashboardPin, setShowDashboardPin] = useState(false);

  // Re-lock dashboard whenever user navigates away from it
  useEffect(() => {
    const isDashboard = pathname.endsWith('/dashboard') || pathname === 'dashboard';
    if (!isDashboard) setDashboardLocked(true);
  }, [pathname]);

  // ── Display lock ─────────────────────────────────────────────────────────────
  const [lockPin, setLockPin] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockDigits, setLockDigits] = useState<string[]>([]);
  const lockShakeAnim = useRef(new Animated.Value(0)).current;

  // ── Forgot PIN recovery ───────────────────────────────────────────────────
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [forgotPinPassword, setForgotPinPassword] = useState('');
  const [forgotPinLoading, setForgotPinLoading] = useState(false);
  const [forgotPinError, setForgotPinError] = useState('');
  const [showForgotPw, setShowForgotPw] = useState(false);

  useEffect(() => {
    getPosLastSyncedAt().then(d => setLastSyncedAt(d));
  }, []);

  // Seed QueryClient from AsyncStorage BEFORE Tabs render so POS useQuery hooks
  // see cached data on their very first execution. cacheSeeded gates the Tabs.
  useEffect(() => {
    Promise.all([
      loadCachedPosProducts(),
      loadCachedStoreConfig(),
      loadCachedSurcharges(),
      loadCachedLoyaltyConfig(),
    ]).then(([products, storeConfig, surcharges, loyaltyConfig]) => {
      if (products?.length)  queryClient.setQueryData(['pos-products'], { data: products });
      if (storeConfig)       queryClient.setQueryData(['pos-store-settings'], storeConfig);
      if (surcharges)        queryClient.setQueryData(['pos-surcharges'], { data: surcharges });
      if (loyaltyConfig)     queryClient.setQueryData(['pos-loyalty-config'], { data: loyaltyConfig });
      setCacheSeeded(true);
    }).catch(() => setCacheSeeded(true)); // always unblock even if AsyncStorage fails
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load lock PIN on mount — lock immediately if PIN is set
  useEffect(() => {
    getDisplayLockPin().then(pin => {
      setLockPin(pin);
      if (pin) setIsLocked(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh lockPin (but don't re-lock) when user navigates — picks up PIN changes from Settings
  useEffect(() => {
    getDisplayLockPin().then(setLockPin);
  }, [pathname]);

  const lockShakeError = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(lockShakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(lockShakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(lockShakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(lockShakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(lockShakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start(() => setLockDigits([]));
  }, [lockShakeAnim]);

  const onLockDigit = useCallback((d: string) => {
    setLockDigits(prev => {
      const next = [...prev, d].slice(0, 4);
      if (next.length === 4 && lockPin) {
        if (verifyDisplayLockPin(next.join(''), lockPin)) {
          setTimeout(() => {
            setIsLocked(false);
            setLockDigits([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }, 80);
        } else {
          setTimeout(lockShakeError, 80);
        }
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [lockPin, lockShakeError]);

  const onLockBackspace = useCallback(() => {
    setLockDigits(d => d.slice(0, -1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const doLock = useCallback(() => {
    if (!lockPin) return;
    setLockDigits([]);
    setIsLocked(true);
  }, [lockPin]);

  const handleForgotPinRecovery = useCallback(async () => {
    if (!user?.email || !forgotPinPassword.trim()) {
      setForgotPinError('Please enter your password.');
      return;
    }
    setForgotPinLoading(true);
    setForgotPinError('');
    try {
      await api.auth.staffLogin({ email: user.email, password: forgotPinPassword });
      // Password correct — clear the PIN and unlock
      await clearDisplayLockPin();
      setLockPin(null);
      setIsLocked(false);
      setShowForgotPin(false);
      setForgotPinPassword('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setForgotPinError('Incorrect password. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setForgotPinLoading(false);
    }
  }, [user?.email, forgotPinPassword]);

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Clear persisted + in-memory detail cache so stale variants don't survive a sync
      await clearDetailCache();
      queryClient.setQueryData<number>(['pos-cache-clear-signal'], Date.now());
      // type:'all' ensures inactive (unmounted) queries are also refreshed — critical
      // for the 4am auto-sync where the POS screen may not currently be open.
      await queryClient.refetchQueries({ queryKey: ['pos-products'],       type: 'all' });
      await queryClient.refetchQueries({ queryKey: ['pos-store-settings'], type: 'all' });
      await queryClient.refetchQueries({ queryKey: ['pos-surcharges'],     type: 'all' });
      await queryClient.refetchQueries({ queryKey: ['pos-loyalty-config'], type: 'all' });
      const d = await getPosLastSyncedAt();
      setLastSyncedAt(d ?? new Date());
    } finally {
      setSyncing(false);
    }
  }, [syncing, queryClient]);

  // keep a stable ref so the 4 am timer always calls the latest version
  const syncRef = useRef(syncNow);
  useEffect(() => { syncRef.current = syncNow; }, [syncNow]);

  // auto-sync every day at 4 am Sydney time
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let intervalId: ReturnType<typeof setInterval>;
    const doSync = () => syncRef.current();
    timeoutId = setTimeout(() => {
      doSync();
      intervalId = setInterval(doSync, 24 * 60 * 60 * 1000);
    }, getMsUntil4amSydney());
    return () => { clearTimeout(timeoutId); clearInterval(intervalId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'shop_display') return <Redirect href={getHomeRouteForRole(user.role)} />;
  // Hold the Tabs (and POS useQuery hooks) until the AsyncStorage seed is done.
  // AsyncStorage reads are typically <20 ms, so this is imperceptible.
  if (!cacheSeeded) return <View style={{ flex: 1, backgroundColor: '#F8FAFF' }} />;

  const activeSegment = pathname.split('/').filter(Boolean).pop() ?? '';
  const isActive = (segment: string) =>
    segment === 'index'
      ? (!activeSegment || activeSegment === 'index' || activeSegment === '(shop-display)')
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
      initialRouteName="pos"
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
        options={{
          title: 'App Sales',
          tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} />,
          tabBarButton: dashboardLocked
            ? (props) => (
                <TouchableOpacity
                  {...(props as any)}
                  onPress={() => setShowDashboardPin(true)}
                />
              )
            : undefined,
        }}
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

  // Single return keeps <Tabs> at the same tree position on every render,
  // so rotating the device never unmounts the navigator or clears app state.
  return (
    <View
      style={{ flex: 1, flexDirection: 'row', backgroundColor: NAVY }}
      onStartShouldSetResponderCapture={() => { lastIdleRef.current = Date.now(); return false; }}
    >
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* ── Sidebar — wide screens only ───────────────────────────── */}
      {isWide && (
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
                    if (item.segment === 'dashboard' && dashboardLocked) {
                      setShowDashboardPin(true);
                      return;
                    }
                    const route = item.segment === 'index'
                      ? '/(shop-display)'
                      : `/(shop-display)/${item.segment}`;
                    router.navigate(route as any);
                  }}
                  style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && !active && styles.navItemPressed]}
                >
                  <Feather name={item.icon} size={18} color={active ? BLUE : MUTED} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                  {item.segment === 'index' && incomingOrderCount > 0 && (
                    <View style={styles.navBadge}>
                      <Text style={styles.navBadgeText}>{incomingOrderCount > 99 ? '99+' : String(incomingOrderCount)}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {lastSyncedAt ? (
            <Text style={styles.sidebarSyncTime}>{formatSyncTime(lastSyncedAt)}</Text>
          ) : null}
          {lockPin ? (
            <Pressable onPress={doLock} style={styles.sidebarLogout}>
              <Feather name="lock" size={15} color={MUTED} />
              <Text style={styles.sidebarLogoutText}>Lock screen</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* ── Content — always the same node at the same tree position ─ */}
      <View style={{ flex: 1, paddingTop: isWide ? insets.top : 0 }}>
        {!isWide && (
          <PortalHeader
            badge="SHOP DISPLAY"
            badgeColor={BLUE}
            backgroundColor={NAVY}
            onLock={lockPin ? doLock : undefined}
          />
        )}
        <LayoutSafeAreaContext.Provider value={isWide}>
          {tabScreens}
        </LayoutSafeAreaContext.Provider>
      </View>

      {/* ── Global screensaver overlay ────────────────────────────── */}
      {isIdle && !isLocked && (
        <PosIdleScreen
          products={idleProducts}
          dailySpecial={idleDailySpecial}
          onDismiss={() => {
            lastIdleRef.current = Date.now();
            setIsIdle(false);
          }}
        />
      )}

      {/* ── Display lock screen overlay ───────────────────────────── */}
      {isLocked && lockPin && (
        <View style={[StyleSheet.absoluteFill, styles.lockOverlay]}>
          <StatusBar barStyle="light-content" backgroundColor={NAVY} />
          <View style={styles.lockHeader}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={styles.lockLogo}
              resizeMode="contain"
            />
            <View style={styles.lockBadge}>
              <Feather name="lock" size={13} color={BLUE} />
              <Text style={styles.lockBadgeText}>DISPLAY LOCKED</Text>
            </View>
            <Text style={styles.lockSubtitle}>Enter your 4-digit display PIN</Text>
          </View>

          <Animated.View style={[styles.lockDotsRow, { transform: [{ translateX: lockShakeAnim }] }]}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.lockDot, lockDigits[i] !== undefined && styles.lockDotFilled]} />
            ))}
          </Animated.View>

          <View style={styles.lockPad}>
            {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']].map((row, ri) => (
              <View key={ri} style={styles.lockPadRow}>
                {row.map((d, di) =>
                  d === '' ? (
                    <View key={di} style={styles.lockPadKey} />
                  ) : d === '⌫' ? (
                    <TouchableOpacity key={di} style={styles.lockPadKey} onPress={onLockBackspace} activeOpacity={0.6}>
                      <Feather name="delete" size={22} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity key={di} style={[styles.lockPadKey, styles.lockPadKeyBtn]} onPress={() => onLockDigit(d)} activeOpacity={0.65}>
                      <Text style={styles.lockPadKeyText}>{d}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.lockForgotBtn}
            onPress={() => { setForgotPinError(''); setForgotPinPassword(''); setShowForgotPin(true); }}
          >
            <Text style={styles.lockForgotText}>Forgot PIN?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.lockSignOutBtn}
            onPress={() => {
              Alert.alert('Sign out', 'Are you sure you want to sign out of this display?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => logout().then(() => router.replace('/(auth)/login')) },
              ]);
            }}
          >
            <Feather name="log-out" size={14} color="rgba(255,255,255,0.4)" />
            <Text style={styles.lockSignOutText}>Sign out of this display</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Forgot PIN recovery modal ──────────────────────────────── */}
      <Modal visible={showForgotPin} transparent animationType="fade" onRequestClose={() => setShowForgotPin(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.forgotOverlay}>
          <View style={styles.forgotCard}>
            <View style={styles.forgotIconRow}>
              <View style={styles.forgotIconBg}>
                <Feather name="unlock" size={22} color={BLUE} />
              </View>
            </View>
            <Text style={styles.forgotTitle}>Verify your identity</Text>
            <Text style={styles.forgotSub}>
              Enter your Butterfield account password to clear the display PIN and regain access.
            </Text>

            <View style={styles.forgotInputRow}>
              <TextInput
                style={styles.forgotInput}
                placeholder="Account password"
                placeholderTextColor="#9CA3AF"
                value={forgotPinPassword}
                onChangeText={setForgotPinPassword}
                secureTextEntry={!showForgotPw}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleForgotPinRecovery}
              />
              <TouchableOpacity onPress={() => setShowForgotPw(v => !v)} style={styles.forgotEye}>
                <Feather name={showForgotPw ? 'eye-off' : 'eye'} size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {!!forgotPinError && (
              <View style={styles.forgotError}>
                <Feather name="alert-circle" size={13} color="#EF4444" />
                <Text style={styles.forgotErrorText}>{forgotPinError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.forgotConfirmBtn, forgotPinLoading && { opacity: 0.7 }]}
              onPress={handleForgotPinRecovery}
              disabled={forgotPinLoading}
            >
              {forgotPinLoading
                ? <Text style={styles.forgotConfirmText}>Verifying…</Text>
                : <Text style={styles.forgotConfirmText}>Clear PIN &amp; Unlock</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotCancelBtn}
              onPress={() => { setShowForgotPin(false); setForgotPinPassword(''); setForgotPinError(''); }}
            >
              <Text style={styles.forgotCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── New order alert — layout-level so it fires on any tab ─── */}
      {/* Queue: first item is shown; onDismiss shifts it off so the next appears */}
      <NewOrderAlertOverlay
        visible={alertQueue.length > 0}
        order={alertQueue[0] ?? null}
        onDismiss={() => setAlertQueue(q => q.slice(1))}
        soundEnabled={soundEnabled}
        queueIndex={0}
        queueTotal={alertQueue.length}
      />

      {/* ── Dashboard PIN gate ─────────────────────────────────────── */}
      {showDashboardPin && (
        <PosPinModal
          title="Dashboard"
          subtitle="Enter your POS PIN to access the dashboard"
          onClose={() => setShowDashboardPin(false)}
          onSuccess={() => {
            setShowDashboardPin(false);
            setDashboardLocked(false);
            setTimeout(() => {
              router.navigate('/(shop-display)/dashboard' as any);
            }, 0);
          }}
        />
      )}
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
  syncTimestamp:     { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '500' },
  sidebarSyncBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(20,147,255,0.18)', borderWidth: 1, borderColor: 'rgba(20,147,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  navList:           { flex: 1, paddingHorizontal: 10, gap: 2 },
  navItem:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14 },
  navItemActive:     { backgroundColor: 'rgba(20,147,255,0.18)' },
  navItemPressed:    { backgroundColor: 'rgba(255,255,255,0.07)' },
  navLabel:          { fontSize: 14, fontWeight: '600', color: MUTED, flex: 1 },
  navLabelActive:    { color: WHITE, fontWeight: '700' },
  navBadge:          { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  navBadgeText:      { color: WHITE, fontSize: 11, fontWeight: '800', lineHeight: 14 },
  sidebarSyncTime:   { color: MUTED, fontSize: 11, marginHorizontal: 14, marginBottom: 4 },
  sidebarLogout:     { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sidebarLogoutText: { color: MUTED, fontSize: 13, fontWeight: '600' },

  // Lock screen
  lockOverlay:       { backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  lockHeader:        { alignItems: 'center', gap: 12, marginBottom: 36 },
  lockLogo:          { width: 160, height: 46, marginBottom: 4 },
  lockBadge:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,147,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  lockBadgeText:     { color: BLUE, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  lockSubtitle:      { color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: '500' },
  lockDotsRow:       { flexDirection: 'row', gap: 16, marginBottom: 40 },
  lockDot:           { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'transparent' },
  lockDotFilled:     { backgroundColor: WHITE, borderColor: WHITE },
  lockPad:           { gap: 10, width: 260 },
  lockPadRow:        { flexDirection: 'row', gap: 10 },
  lockPadKey:        { flex: 1, height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lockPadKeyBtn:     { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  lockPadKeyText:    { fontSize: 26, fontWeight: '400', color: WHITE },
  lockForgotBtn:     { marginTop: 28, padding: 10 },
  lockForgotText:    { color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  lockSignOutBtn:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, padding: 12 },
  lockSignOutText:   { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '500' },

  // Forgot PIN modal
  forgotOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  forgotCard:        { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, gap: 4 },
  forgotIconRow:     { alignItems: 'center', marginBottom: 8 },
  forgotIconBg:      { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  forgotTitle:       { fontSize: 18, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginBottom: 4 },
  forgotSub:         { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  forgotInputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, marginBottom: 6 },
  forgotInput:       { flex: 1, fontSize: 15, color: '#1C1C1E', paddingVertical: 13 },
  forgotEye:         { padding: 6 },
  forgotError:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 4 },
  forgotErrorText:   { color: '#EF4444', fontSize: 13, flex: 1 },
  forgotConfirmBtn:  { backgroundColor: '#1A2B4A', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10, marginBottom: 6 },
  forgotConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  forgotCancelBtn:   { alignItems: 'center', paddingVertical: 10 },
  forgotCancelText:  { color: '#8E8E93', fontSize: 14, fontWeight: '500' },
});
