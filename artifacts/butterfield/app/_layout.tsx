import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

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
  key:          "BUTTERFIELD_QUERY_CACHE_V1",
  throttleTime: 3000,
});

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen
        name="(auth)"
        options={{ presentation: "modal", headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="(customer)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="store" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="edit-details" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="product" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="orders" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="addresses" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(staff)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(wholesale)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(director)" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(manager)" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    // Hide the native splash immediately and take over with the JS overlay,
    // which we fully control (duration + fade-out).
    SplashScreen.hideAsync();

    const hold = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue:         0,
        duration:        500,
        useNativeDriver: true,
      }).start(() => {
        setSplashVisible(false);
      });
    }, 1500);

    return () => clearTimeout(hold);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      {splashVisible && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]}
          pointerEvents="none"
        >
          <Image
            source={require('../assets/images/splash-screen.png')}
            style={styles.splashImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        </Animated.View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashImage: {
    width:  '100%',
    height: '100%',
  },
});
