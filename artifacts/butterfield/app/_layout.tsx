import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  DancingScript_700Bold,
} from "@expo-google-fonts/dancing-script";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

SplashScreen.preventAutoHideAsync();

// Wire NetInfo → React Query so offline detection works on native
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime:      1000 * 60 * 60 * 24, // keep cache for 24 h
      staleTime:   1000 * 60 * 5,       // treat data as fresh for 5 min
      networkMode: "offlineFirst",       // serve cache while offline
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)"
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen name="(customer)" options={{ headerShown: false }} />
      <Stack.Screen name="store" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="edit-details" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="product" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="orders" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="addresses" options={{ headerShown: false }} />
      <Stack.Screen name="(staff)" options={{ headerShown: false }} />
      <Stack.Screen name="(wholesale)" options={{ headerShown: false }} />
      <Stack.Screen name="(director)" options={{ headerShown: false }} />
      <Stack.Screen name="(manager)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    DancingScript_700Bold,
    Anton_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </CartProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
