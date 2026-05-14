import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading]);

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['welcome-config'],
    queryFn: () => api.welcomeConfig(),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const backgroundUrl = configData?.data?.welcomeBackground ?? null;

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#C8833A" size="large" />
      </View>
    );
  }

  const onBg     = !!backgroundUrl;
  const textCol  = onBg ? '#fff'                     : '#1C1C1E';
  const subCol   = onBg ? 'rgba(255,255,255,0.80)'   : '#6B6B6B';
  const circBg   = onBg ? 'rgba(255,255,255,0.15)'   : 'rgba(200,131,58,0.18)';
  const circBdr  = onBg ? 'rgba(255,255,255,0.25)'   : 'rgba(200,131,58,0.25)';
  const regBg    = onBg ? '#fff'                     : '#1C1C1E';
  const regText  = onBg ? '#1C1C1E'                  : '#fff';
  const loginBdr = onBg ? 'rgba(255,255,255,0.5)'    : 'rgba(28,28,30,0.25)';

  const inner = (
    <View style={[styles.inner, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}>
      {/* Hero image area */}
      <View style={styles.heroArea}>
        <View style={[styles.heroCircle, { backgroundColor: circBg, borderColor: circBdr }]}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={styles.heroImage}
            contentFit="contain"
          />
        </View>
        <View style={styles.decor1} />
        <View style={styles.decor2} />
      </View>

      {/* Text block */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { fontWeight: '700', color: textCol }]}>
          Welcome to{'\n'}Butterfield Cookies!
        </Text>
        <Text style={[styles.subtitle, { fontWeight: '400', color: subCol }]}>
          Sydney's favourite cookies, coffee & desserts.{'\n'}Order ahead, earn rewards.
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.btns}>
        <Pressable
          style={({ pressed }) => [styles.registerBtn, { opacity: pressed ? 0.88 : 1, backgroundColor: regBg }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/(auth)/login?mode=register');
          }}
        >
          <Text style={[styles.registerBtnText, { fontWeight: '700', color: regText }]}>Register</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.loginBtn, { opacity: pressed ? 0.75 : 1, borderColor: loginBdr }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(auth)/login');
          }}
        >
          <Text style={[styles.loginBtnText, { fontWeight: '600', color: textCol }]}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );

  if (backgroundUrl) {
    return (
      <ImageBackground source={{ uri: backgroundUrl }} style={{ flex: 1 }} resizeMode="cover">
        <View style={styles.bgOverlay}>{inner}</View>
      </ImageBackground>
    );
  }

  return (
    <LinearGradient colors={['#FBF7F2', '#F2EBE0', '#EDE3D4']} style={{ flex: 1 }}>
      {inner}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F2' },
  bgOverlay: { flex: 1, backgroundColor: 'rgba(10,5,0,0.52)' },

  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },

  heroArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
  },
  heroCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(200, 131, 58, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(200, 131, 58, 0.25)',
  },
  heroImage: {
    width: 150,
    height: 150,
  },
  decor1: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200, 131, 58, 0.12)',
    top: '15%',
    right: '8%',
  },
  decor2: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 131, 58, 0.09)',
    bottom: '20%',
    left: '10%',
  },

  textBlock: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    color: '#1C1C1E',
    textAlign: 'center',
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },

  btns: {
    width: '100%',
    gap: 12,
  },
  registerBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  loginBtn: {
    backgroundColor: 'transparent',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,30,0.25)',
  },
  loginBtnText: {
    color: '#1C1C1E',
    fontSize: 16,
  },
});
