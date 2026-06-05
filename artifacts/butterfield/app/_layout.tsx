import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Image, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
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

    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      clearAppBadge().catch(() => {});
    });

    return () => {
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
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
});
