import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

const GUEST_STARTED_KEY = '@butterfield_guest_started';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getHomeRouteForRole(user.role));
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#1493FF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Image
        source={require('@/assets/images/splash-screen.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityLabel="Butterfield splash screen"
      />

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          style={({ pressed }) => [styles.getStartedBtn, { opacity: pressed ? 0.88 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            AsyncStorage.setItem(GUEST_STARTED_KEY, '1').catch(() => {});
            router.replace('/(customer)');
          }}
        >
          <Text style={styles.getStartedText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#29A9ED',
  },
  root: {
    flex: 1,
    backgroundColor: '#2A98E8',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    backgroundColor: 'transparent',
  },
  getStartedBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#053E63',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  getStartedText: {
    color: '#1493FF',
    fontSize: 17,
    fontWeight: '800',
  },
});
