import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
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
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/logo-white.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Butterfield"
        />

        <View style={styles.copyBlock}>
          <Text style={styles.headline}>Warm Cookies.{'\n'}Real Coffee.</Text>
          <Text style={styles.subhead}>
            Skip the queue, earn rewards and{'\n'}order your favourites faster.
          </Text>
        </View>
      </View>

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
    backgroundColor: '#31A8F0',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 56,
    paddingTop: 80,
  },
  logo: {
    width: '100%',
    height: 120,
    marginBottom: 120,
    alignSelf: 'center',
  },
  copyBlock: {
    gap: 22,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 60,
    lineHeight: 66,
    fontWeight: '700',
    letterSpacing: 0,
  },
  subhead: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 40,
    paddingTop: 28,
    backgroundColor: 'transparent',
  },
  getStartedBtn: {
    height: 56,
    borderRadius: 16,
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
    fontWeight: '700',
  },
});
