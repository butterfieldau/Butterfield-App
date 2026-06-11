import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Image, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { clearAppBadge } from "@/lib/pushNotifications";

SplashScreen.preventAutoHideAsync();

// Treat "unknown yet" network states as online so native boot doesn't get stuck
// serving stale cache while connectivity is still being resolved.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
    setOnline(isOnline);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime:      1000 * 60 * 60 * 24,
      staleTime:   1000 * 60 * 5,
      networkMode: "offlineFirst",
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

const persister = createAsyncStoragePersister({
  storage:      AsyncStorage,
  key:          "BUTTERFIELD_QUERY_CACHE_V3",
  throttleTime: 3000,
});

const directorStandaloneScreenOptions = {
  headerShown: false,
  animation: "slide_from_right" as const,
  gestureEnabled: true,
  fullScreenGestureEnabled: false,
  gestureDirection: "horizontal" as const,
};

/**
 * Handles notification taps and routes the user to the correct in-app screen.
 * Must live inside AuthProvider so it can read the current user's role.
 *
 * Routing rules (role-aware to prevent cross-portal navigation):
 *  - customer  + orderId present → /(customer)/track/[orderId]
 *  - customer  + screen starts with /(customer)/ → that screen
 *  - staff     + screen starts with /(staff)/    → that screen
 *  - director/manager/master + screen starts with /(director)/ → that screen
 */
function NotificationTapHandler() {
  const { user } = useAuth();
  // Stores cold-start notification data until the user session is resolved
  const pendingData = useRef<Record<string, unknown> | null>(null);
  const handledInitial = useRef(false);

  const navigateFromData = useCallback(
    (data: Record<string, unknown>, role: string) => {
      const screen = typeof data.screen === 'string' ? data.screen : null;
      const orderId = typeof data.orderId === 'string' ? data.orderId : null;

      if (role === 'customer') {
        // Any order notification with an ID → land directly on the tracking screen
        if (orderId) {
          router.push(`/(customer)/track/${orderId}` as any);
          return;
        }
        if (screen?.startsWith('/(customer)/')) {
          router.push(screen as any);
          return;
        }
      } else if (role === 'staff') {
        if (screen?.startsWith('/(staff)/')) {
          router.push(screen as any);
          return;
        }
      } else if (['director', 'manager', 'master'].includes(role)) {
        if (screen?.startsWith('/(director)/')) {
          router.push(screen as any);
          return;
        }
      }
    },
    [],
  );

  // Process pending cold-start data once a user session is available
  useEffect(() => {
    if (user && pendingData.current) {
      const data = pendingData.current;
      pendingData.current = null;
      setTimeout(() => navigateFromData(data, user.role), 400);
    }
  }, [user, navigateFromData]);

  // Cold-start: check if the app was launched by tapping a notification
  useEffect(() => {
    if (handledInitial.current) return;
    handledInitial.current = true;

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        if (user) {
          setTimeout(() => navigateFromData(data, user.role), 400);
        } else {
          pendingData.current = data;
        }
      })
      .catch(() => {});
  }, []); // intentionally empty — runs once on mount

  // Foreground / background tap: app is running or recently suspended
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      clearAppBadge().catch(() => {});
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      if (user) {
        navigateFromData(data, user.role);
      }
    });
    return () => sub.remove();
  }, [user, navigateFromData]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen
        name="(auth)"
        options={{ presentation: "modal", headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="(customer)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen name="store" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="edit-details" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="product" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="orders" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="notification-prefs" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="addresses" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="director-more-category" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-banner" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-loyalty-tiers" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-rewards" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-notify" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-scheduled-notifications" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-managers" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-settings-directors" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-wholesale-accounts" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-wholesale-delivery" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-staff-accounts" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-pos-screens" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="customer-segments" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-store-locations" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-inventory" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-staff-hours" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-reports" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-pricing" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-discounts" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-wholesale-invoices" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-linkly" options={directorStandaloneScreenOptions} />
      <Stack.Screen name="(staff)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(shop-display)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen name="(wholesale)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen name="(director)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen name="(manager)" options={{ headerShown: false, animation: "slide_from_right", gestureEnabled: false }} />
    </Stack>
  );
}

// JS-layer splash overlay — renders the same image as the native splash so
// there's no visible jump, holds for 2 s, then fades out at 60 fps.
function JsSplashOverlay({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const holdTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue:         0,
        duration:        500,
        useNativeDriver: true,
      }).start(() => onDone());
    }, 2000);

    return () => clearTimeout(holdTimer);
  }, [opacity, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 9999 }]}>
      <LinearGradient
        colors={['#1481ff', '#3cbbee']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.splashContent}>
          <Image
            source={require('../assets/images/logo-white.png')}
            style={styles.splashLogo}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.splashWatermarkContainer, { paddingBottom: insets.bottom + 24 }]}>
          <Image
            source={require('../assets/images/launchtime-watermark.png')}
            style={styles.splashWatermark}
            resizeMode="contain"
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Hide the native Expo splash immediately — the JS overlay takes over
    // so there's no visible gap between the two layers.
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    clearAppBadge().catch(() => {});

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        clearAppBadge().catch(() => {});
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      clearAppBadge().catch(() => {});
    });

    return () => {
      appStateSub.remove();
      receivedSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
          }}
        >
          <AuthProvider>
            <CartProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
              {/* Notification tap router — renders null, needs AuthProvider for role-aware navigation */}
              <NotificationTapHandler />
            </CartProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>

      {/* JS splash sits above everything until its fade completes */}
      {!splashDone && (
        <JsSplashOverlay onDone={() => setSplashDone(true)} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContent: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: '100%',
    maxWidth: 340,
    height: 92,
  },
  splashWatermarkContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  splashWatermark: {
    width: 140,
    height: 20,
    opacity: 0.85,
  },
});
