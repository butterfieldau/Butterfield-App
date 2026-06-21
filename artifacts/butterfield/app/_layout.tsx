import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InAppNotificationBanner, type InAppNotificationPayload } from "@/components/InAppNotificationBanner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { VaultProvider } from "@/context/VaultContext";
import { clearAppBadge } from "@/lib/pushNotifications";

SplashScreen.preventAutoHideAsync();

// ---------------------------------------------------------------------------
// Global JS error handler — last-resort safety net for native module startup
// failures (e.g. react-native-star-io10 on iOS 26 arm64e). If a native module
// throws an exception during TurboModule eager init, React Native surfaces it
// here before any screen renders. We log it and, for non-fatal errors, allow
// the app to continue rather than showing a blank crash.
// ---------------------------------------------------------------------------
(function installGlobalErrorHandler() {
  try {
    // ErrorUtils is a React Native global — not always typed in @types/react-native.
    const EU = (global as any).ErrorUtils;
    if (!EU || typeof EU.setGlobalHandler !== 'function') return;

    const previousHandler: ((error: Error, isFatal?: boolean) => void) | undefined =
      typeof EU.getGlobalHandler === 'function' ? EU.getGlobalHandler() : undefined;

    EU.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const message = error?.message ?? String(error);

      // Detect known native-module startup errors so we can downgrade them.
      const isNativeModuleStartup =
        message.includes('StarIO') ||
        message.includes('star-io') ||
        message.includes('TurboModuleRegistry') ||
        message.includes('NativeModule') ||
        message.includes('Cannot read property') ||
        false;

      if (isNativeModuleStartup && isFatal) {
        // Downgrade to non-fatal — the ObjC shim should have already caught
        // the real crash; this handles edge cases where an error still surfaces.
        console.warn(
          '[GlobalErrorHandler] Downgraded native-module startup error to non-fatal:',
          message,
        );
        previousHandler?.(error, false);
        return;
      }

      // All other errors: pass through to the previous handler unchanged.
      previousHandler?.(error, isFatal);
    });
  } catch {
    // Never let the error handler installation crash the app.
  }
}());

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
 * Hides the native splash screen once the auth check has completed.
 * Must live inside AuthProvider to read isLoading.
 */
function SplashHider() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);

  return null;
}

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
      <Stack.Screen name="director-vault"             options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-vault-recipe"     options={directorStandaloneScreenOptions} />
      <Stack.Screen name="director-vault-recipe-edit" options={directorStandaloneScreenOptions} />
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

export default function RootLayout() {
  const [inAppNotif, setInAppNotif] = useState<InAppNotificationPayload | null>(null);
  const inAppNavTarget = useRef<string | null>(null);

  useEffect(() => {
    clearAppBadge().catch(() => {});

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        clearAppBadge().catch(() => {});
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      clearAppBadge().catch(() => {});

      const content = notification.request.content;
      const title = content.title ?? 'Butterfield Cookies';
      const body  = content.body  ?? '';
      const data  = (content.data ?? {}) as Record<string, unknown>;

      // Derive a navigation target from the data payload
      const orderId = typeof data.orderId === 'string' ? data.orderId : null;
      const screen  = typeof data.screen  === 'string' ? data.screen  : null;
      inAppNavTarget.current = orderId
        ? `/(customer)/track/${orderId}`
        : screen ?? null;

      setInAppNotif({ title, body, data });
    });

    return () => {
      appStateSub.remove();
      receivedSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
          }}
        >
          <AuthProvider>
            {/* Hides native splash once auth check is done — must be inside AuthProvider */}
            <SplashHider />
            <VaultProvider>
            <CartProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <RootLayoutNav />
              </GestureHandlerRootView>
              {/* Notification tap router — renders null, needs AuthProvider for role-aware navigation */}
              <NotificationTapHandler />
            </CartProvider>
            </VaultProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>

      {/* In-app foreground notification banner */}
      {inAppNotif && (
        <InAppNotificationBanner
          notification={inAppNotif}
          onDismiss={() => setInAppNotif(null)}
          onPress={
            inAppNavTarget.current
              ? () => {
                  const target = inAppNavTarget.current;
                  inAppNavTarget.current = null;
                  if (target) router.push(target as any);
                }
              : undefined
          }
        />
      )}
    </SafeAreaProvider>
  );
}
