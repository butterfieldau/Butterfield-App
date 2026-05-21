import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ClaimedReward, type LoyaltyReward } from '@/lib/api';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { useAuth } from '@/context/AuthContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import { getNextTierBySpend, getTierBySpendCents, type TierKey } from '@/constants/tierConfig';

const BG = '#050A15';
const SURFACE = '#0A1222';
const SURFACE_2 = '#101A2F';
const CARD = '#0F172B';
const TEXT = '#F8FAFC';
const TEXT_SOFT = 'rgba(241,245,249,0.8)';
const TEXT_MUTED = 'rgba(191,202,224,0.68)';
const BORDER = 'rgba(148,163,184,0.18)';
const BRAND = '#1493FF';
const WHITE = '#FFFFFF';
const STAMP_COUNT = 6;
const CELEBRATION_KEY_PREFIX = '@butterfield_rewards_celebrated';

type DisplayTierKey = 'blue' | 'silver' | 'gold' | 'black';

type DisplayTier = {
  key: DisplayTierKey;
  serverKey: TierKey;
  label: string;
  spendThreshold: number;
  shortLabel: string;
  logo: any;
  logoTint?: string;
  accent: string;
  chipBg: string;
  text: string;
  gradients: [string, string, string];
  edge: string;
  shadow: string;
  perkIntro: string;
  perks: { icon: keyof typeof Feather.glyphMap; title: string; detail: string }[];
};

const DISPLAY_TIERS: DisplayTier[] = [
  {
    key: 'blue',
    serverKey: 'blue',
    label: 'Blue',
    shortLabel: 'Blue Member',
    spendThreshold: 20000,
    logo: require('@/assets/images/logo-white.png'),
    accent: '#7FD3FF',
    chipBg: 'rgba(20,147,255,0.22)',
    text: '#F8FCFF',
    gradients: ['#0B63D8', '#1E93FF', '#63C8FF'],
    edge: 'rgba(255,255,255,0.22)',
    shadow: 'rgba(11,99,216,0.45)',
    perkIntro: 'Butterfield Blue gets you into the club with perks that make every order feel more worth it.',
    perks: [
      { icon: 'gift', title: 'Birthday treat', detail: 'Free cookie or coffee' },
      { icon: 'clock', title: 'Early drops', detail: '12 hours early' },
      { icon: 'star', title: 'Surprise offers', detail: 'App-only rewards' },
      { icon: 'award', title: 'Earn points', detail: 'On every purchase' },
      { icon: 'coffee', title: 'Size upgrade', detail: '1 free per month' },
      { icon: 'tag', title: 'Member promos', detail: 'Special offers' },
    ],
  },
  {
    key: 'silver',
    serverKey: 'silver',
    label: 'Silver',
    shortLabel: 'Silver Member',
    spendThreshold: 50000,
    logo: require('@/assets/images/logo-white.png'),
    accent: '#EFF4FB',
    chipBg: 'rgba(255,255,255,0.22)',
    text: '#FDFEFF',
    gradients: ['#808998', '#C8D0DC', '#EEF3F9'],
    edge: 'rgba(255,255,255,0.4)',
    shadow: 'rgba(163,174,189,0.28)',
    perkIntro: 'Silver sharpens the experience with richer access, stronger point momentum and better everyday treats.',
    perks: [
      { icon: 'gift', title: 'Everything in Blue', detail: 'All Blue benefits stay' },
      { icon: 'gift', title: 'Free cookie', detail: 'Every 2 months' },
      { icon: 'zap', title: 'Double points day', detail: 'Once per month' },
      { icon: 'clock', title: 'Early flavours', detail: '24 hours early' },
      { icon: 'package', title: 'Priority preorder', detail: 'High-demand drops' },
      { icon: 'droplet', title: 'Drink add-ons', detail: 'Selected extras free' },
    ],
  },
  {
    key: 'gold',
    serverKey: 'gold',
    label: 'Gold',
    shortLabel: 'Gold Member',
    spendThreshold: 100000,
    logo: require('@/assets/images/logo-white.png'),
    accent: '#FFF2CC',
    chipBg: 'rgba(255,243,205,0.2)',
    text: '#FFFDF7',
    gradients: ['#A77516', '#D6A74A', '#F4D48C'],
    edge: 'rgba(255,248,220,0.32)',
    shadow: 'rgba(166,117,22,0.34)',
    perkIntro: 'Gold is where Butterfield starts feeling seriously VIP, with richer monthly value and earlier access across the board.',
    perks: [
      { icon: 'gift', title: 'Everything in Silver', detail: 'All Silver benefits stay' },
      { icon: 'coffee', title: 'Free coffee', detail: 'Every month' },
      { icon: 'circle', title: 'Free cookie', detail: 'Single cookie monthly' },
      { icon: 'arrow-up-right', title: 'Priority pickup', detail: 'In-app queue bump' },
      { icon: 'clock', title: 'Early drops', detail: '48 hours early' },
      { icon: 'sun', title: 'Flavour previews', detail: 'Test launches first' },
    ],
  },
  {
    key: 'black',
    serverKey: 'black',
    label: 'Black',
    shortLabel: 'Black Member',
    spendThreshold: 200000,
    logo: require('@/assets/images/logo-blue.png'),
    accent: '#51A9FF',
    logoTint: '#3AA0FF',
    chipBg: 'rgba(58,160,255,0.16)',
    text: '#F6FAFF',
    gradients: ['#0A0E14', '#1A202A', '#343A45'],
    edge: 'rgba(99,179,255,0.2)',
    shadow: 'rgba(0,0,0,0.42)',
    perkIntro: 'Black is the top tier: the most exclusive drops, the richest monthly value and the best Butterfield access.',
    perks: [
      { icon: 'gift', title: 'Everything in Gold', detail: 'All Gold benefits stay' },
      { icon: 'package', title: 'Free six-pack', detail: 'Once every year' },
      { icon: 'coffee', title: 'Free drink', detail: 'Every month' },
      { icon: 'trending-up', title: '1.5x points', detail: 'Accelerated earn rate' },
      { icon: 'star', title: 'Black-only drop', detail: 'Exclusive flavour access' },
      { icon: 'shopping-bag', title: 'Merch & event perks', detail: 'VIP drops and invites' },
    ],
  },
];

const REWARD_PRESETS: Record<string, { icon: keyof typeof Feather.glyphMap; image?: any; tint: string; bg: [string, string] }> = {
  free_coffee: { icon: 'coffee', image: require('@/assets/images/coffee-hero.png'), tint: '#5B7CFA', bg: ['#EEF4FF', '#DCE8FF'] },
  free_cookie: { icon: 'circle', image: require('@/assets/images/cookie-hero.png'), tint: '#C47B23', bg: ['#FFF3D8', '#FFE1B2'] },
  free_six_pack: { icon: 'package', image: require('@/assets/images/cafe-hero.png'), tint: '#7A52E8', bg: ['#EEE8FF', '#DCD0FF'] },
  coffee_upgrade: { icon: 'trending-up', image: require('@/assets/images/coffee-hero.png'), tint: '#0E9F6E', bg: ['#E9FFF6', '#C9F7E4'] },
  birthday_reward: { icon: 'gift', image: require('@/assets/images/cookie-hero.png'), tint: '#E866A8', bg: ['#FFF0F7', '#FFE0EF'] },
  merch_reward: { icon: 'shopping-bag', image: require('@/assets/images/butterfield-character.png'), tint: '#4B5563', bg: ['#F4F5F7', '#E5E7EB'] },
  points_voucher: { icon: 'tag', image: require('@/assets/images/butterfield-app-gems.png'), tint: '#1D4ED8', bg: ['#EEF2FF', '#DCE4FF'] },
};

function getBirthdayInfo(isoDate: string): {
  daysUntil: number;
  message: string;
  sub: string;
  emoji: string;
  isBirthday: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [, m, d] = isoDate.split('-').map(Number);
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
  const formatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (diff === 0) return { daysUntil: 0, isBirthday: true, emoji: '🎂', message: 'Happy Birthday', sub: 'Your Butterfield birthday treat is ready to enjoy today.' };
  return { daysUntil: diff, isBirthday: false, emoji: '🎉', message: `Birthday on ${formatted}`, sub: `${diff} days to go — your free cookie or coffee will be waiting for you.` };
}

function getClaimExpiryInfo(expiresAt: string | null): { daysLeft: number; label: string } | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const msLeft = expiry.getTime() - now.getTime();
  if (msLeft <= 0) return null;
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft === 1) return { daysLeft: 1, label: 'Expires tomorrow' };
  if (daysLeft <= 7) return { daysLeft, label: `Expires in ${daysLeft} days` };
  const formatted = expiry.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return { daysLeft, label: `Expires ${formatted}` };
}

function getDisplayTierByServerTier(serverTier?: string | null): DisplayTier {
  return DISPLAY_TIERS.find((tier) => tier.serverKey === serverTier) ?? DISPLAY_TIERS[0];
}

function getNextDisplayTier(spentCents: number): DisplayTier | null {
  const nextServerTier = getNextTierBySpend(spentCents);
  return nextServerTier ? getDisplayTierByServerTier(nextServerTier.key) : null;
}

function formatCurrency(cents: number) {
  const hasCents = cents % 100 !== 0;
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 })}`;
}

function getPointsDollarValue(points: number) {
  return points * 5;
}

function rewardPresetForTitle(title: string, type?: string | null) {
  const key = title.toLowerCase();
  if (type === 'money_voucher') return REWARD_PRESETS.points_voucher;
  if (key.includes('six')) return REWARD_PRESETS.free_six_pack;
  if (key.includes('upgrade')) return REWARD_PRESETS.coffee_upgrade;
  if (key.includes('birthday')) return REWARD_PRESETS.birthday_reward;
  if (key.includes('merch') || key.includes('hoodie') || key.includes('shirt') || key.includes('hat')) return REWARD_PRESETS.merch_reward;
  if (key.includes('coffee') || key.includes('drink') || key.includes('matcha')) return REWARD_PRESETS.free_coffee;
  if (key.includes('cookie')) return REWARD_PRESETS.free_cookie;
  return REWARD_PRESETS.points_voucher;
}

function CelebrateOverlay({
  visible,
  tier,
  onClose,
}: {
  visible: boolean;
  tier: DisplayTier | null;
  onClose: () => void;
}) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  if (!visible || !tier) return null;

  return (
    <Animated.View style={[styles.celebrateBackdrop, { opacity }]}>
      <Animated.View style={[styles.celebrateCard, { transform: [{ scale }] }]}>
        <LinearGradient colors={tier.gradients} style={StyleSheet.absoluteFillObject} />
        <View style={styles.celebrateSparkleRow}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={[styles.celebrateDot, { opacity: i % 2 === 0 ? 0.82 : 0.48 }]} />
          ))}
        </View>
        <Text style={styles.celebrateEyebrow}>LEVEL UP</Text>
        <Text style={styles.celebrateTitle}>Welcome to {tier.label}</Text>
        <Text style={styles.celebrateBody}>Your Butterfield perks just got better. Your new tier benefits are now active.</Text>
        <Pressable style={styles.celebrateButton} onPress={onClose}>
          <Text style={styles.celebrateButtonText}>View my perks</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export default function LoyaltyScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/(customer)/loyalty" compact />;
  return <LoyaltyContent />;
}

function LoyaltyContent() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showQR, setShowQR] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [healedQrToken, setHealedQrToken] = useState<string | null>(null);
  const [previewTierKey, setPreviewTierKey] = useState<DisplayTierKey>('blue');
  const [celebrateTier, setCelebrateTier] = useState<DisplayTier | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const sectionFade = useRef(new Animated.Value(0)).current;

  const { data: profileData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const { data: rewardsData } = useQuery({ queryKey: ['loyalty-rewards'], queryFn: () => api.loyalty.rewards() });
  const { data: txnData } = useQuery({ queryKey: ['loyalty-transactions'], queryFn: () => api.loyalty.transactions() });
  const { data: claimedData } = useQuery({ queryKey: ['loyalty-claimed-rewards'], queryFn: () => api.loyalty.claimedRewards() });
  const { data: historyData } = useQuery({ queryKey: ['loyalty-claimed-rewards-history'], queryFn: () => api.loyalty.claimedRewardsHistory() });

  const profile = profileData?.data;
  const rewards = rewardsData?.data ?? [];
  const transactions = txnData?.data ?? [];
  const claimedRewards: ClaimedReward[] = claimedData?.data ?? [];
  const allHistory: ClaimedReward[] = historyData?.data ?? [];
  const pastClaims = allHistory.filter((c) => !['available', 'applied_to_cart'].includes(c.status));

  const points = profile?.loyaltyPoints ?? 0;
  const pointsDollarValue = getPointsDollarValue(points);
  const spendCents = (profile as any)?.totalSpentCents ?? 0;
  const stampCount = Math.min(profile?.coffeeStampCount ?? profile?.stampCount ?? 0, STAMP_COUNT);
  const stampsRemaining = Math.max(0, STAMP_COUNT - stampCount);
  const freeCoffeeRewards = profile?.freeCoffeeRewards ?? profile?.freeCoffeesEarned ?? 0;
  const serverTier = profile?.loyaltyTier || getTierBySpendCents(spendCents).key;
  const displayTier = getDisplayTierByServerTier(serverTier);
  const nextTier = getNextDisplayTier(spendCents);
  const spendProgress = nextTier
    ? Math.max(0, Math.min((spendCents - displayTier.spendThreshold) / (nextTier.spendThreshold - displayTier.spendThreshold || 1), 1))
    : 1;
  const spendRemaining = nextTier ? Math.max(nextTier.spendThreshold - spendCents, 0) : 0;
  const previewTier = DISPLAY_TIERS.find((tier) => tier.key === previewTierKey) ?? displayTier;
  const serverQrToken = profile?.loyaltyQrToken ?? null;
  const effectiveQrToken = serverQrToken ?? healedQrToken;
  const qrValue = profile?.qrPayload
    ?? (effectiveQrToken ? `BUTTERFIELD:LOYALTY:${effectiveQrToken}` : null)
    ?? (profile?.userId && profile?.referralCode ? `BUTTERFIELD:${profile.userId}:${profile.referralCode}` : null);

  useEffect(() => {
    if (!profile || qrValue) return;
    api.loyalty.ensureQr()
      .then((res) => {
        if (res.data?.loyaltyQrToken) {
          setHealedQrToken(res.data.loyaltyQrToken);
          qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
        }
      })
      .catch(() => {});
  }, [profile?.userId, qrValue, qc, profile]);

  useEffect(() => {
    setPreviewTierKey(displayTier.key);
  }, [displayTier.key]);

  useEffect(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: spendProgress,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    Animated.timing(sectionFade, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progressAnim, sectionFade, spendProgress]);

  useEffect(() => {
    const userId = profile?.userId;
    if (!userId || displayTier.key === 'blue') return;
    const key = `${CELEBRATION_KEY_PREFIX}:${userId}:${displayTier.key}`;
    AsyncStorage.getItem(key)
      .then((val) => {
        if (!val) {
          setCelebrateTier(displayTier);
          return AsyncStorage.setItem(key, 'seen');
        }
      })
      .catch(() => {});
  }, [displayTier, profile?.userId]);

  const handleClaim = async (reward: LoyaltyReward) => {
    if (points < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - points} more points to claim this.`);
      return;
    }
    const rewardTitle = reward.title ?? reward.name ?? 'Reward';
    const rewardType = reward.rewardType ?? 'item_reward';
    const voucherCents = reward.voucherValueCents;
    const typeLabel = rewardType === 'money_voucher'
      ? `This will give you a $${((voucherCents ?? 0) / 100).toFixed(2)} voucher to use at checkout.`
      : 'This free item will be added to your cart at checkout.';

    Alert.alert(
      'Claim Reward',
      `Claim "${rewardTitle}" for ${reward.pointsCost} points?\n\n${typeLabel}\n\nYou can cancel an unused claim from this screen to restore your points.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim',
          onPress: async () => {
            setRedeeming(reward.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await api.loyalty.redeem(reward.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
              qc.invalidateQueries({ queryKey: ['loyalty-transactions'] });
              qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
              Alert.alert('Claimed!', `"${rewardTitle}" is ready. Go to checkout to apply it.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setRedeeming(null);
            }
          },
        },
      ],
    );
  };

  const handleCancelClaim = async (claim: ClaimedReward) => {
    Alert.alert(
      'Cancel Claim',
      `Cancel your claimed "${claim.rewardName}"? Your ${claim.pointsSpent} points will be restored.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Claim',
          style: 'destructive',
          onPress: async () => {
            setCancelling(claim.id);
            try {
              await api.loyalty.cancelClaim(claim.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
              qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setCancelling(null);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={BRAND} size="large" />
      </View>
    );
  }

  const birthdayInfo = (profile as any)?.birthday ? getBirthdayInfo((profile as any).birthday) : null;
  const animatedWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <>
      <CelebrateOverlay visible={!!celebrateTier} tier={celebrateTier} onClose={() => setCelebrateTier(null)} />

      <CustomerQrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        qrValue={qrValue}
        customerName={profile?.customerName ?? 'Butterfield Member'}
        helperText="Show this in-store for your Butterfield rewards, coffee stamps and member perks."
        statusText={effectiveQrToken ? 'Your loyalty QR is synced and ready.' : 'We are refreshing your loyalty card details.'}
        isLoading={isRefetching && !qrValue}
        onRetry={() => { void refetch(); }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.pageLabel}>REWARDS</Text>
          <Text style={styles.pageTitle}>Your loyalty card</Text>
        </View>

        <Animated.View style={{ opacity: sectionFade, transform: [{ translateY: sectionFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={styles.heroSection}>
            <LinearGradient colors={displayTier.gradients} start={{ x: 0.02, y: 0.05 }} end={{ x: 0.98, y: 0.98 }} style={[styles.membershipCard, { shadowColor: displayTier.shadow }]}>
              <View style={styles.cardNoise} />
              <LinearGradient colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGloss} />
              <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.45 }} style={styles.cardEdgeGlow} />
              <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardTextureVeil} />
              <View style={[styles.cardTextureOrb, styles.cardTextureOrbOne, displayTier.key === 'black' ? styles.cardTextureOrbBlue : null]} />
              <View style={[styles.cardTextureOrb, styles.cardTextureOrbTwo, displayTier.key === 'black' ? styles.cardTextureOrbBlue : null]} />
              <View style={[styles.cardTextureRing, styles.cardTextureRingOne, displayTier.key === 'black' ? styles.cardTextureRingBlue : null]} />
              <View style={[styles.cardTextureRing, styles.cardTextureRingTwo, displayTier.key === 'black' ? styles.cardTextureRingBlue : null]} />
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.cardTextureBand} />
              <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardTextureSweep} />

              <View style={styles.cardTopRow}>
                <View style={styles.cardLogoBlock}>
                  <Image
                    source={displayTier.logo}
                    style={[styles.cardLogo, displayTier.logoTint ? { tintColor: displayTier.logoTint } : null]}
                    contentFit="contain"
                  />
                </View>
                <View style={[styles.cardTierChip, displayTier.key === 'black' ? styles.cardTierChipDark : null]}>
                  <Text style={[styles.cardTierChipText, displayTier.key === 'black' ? styles.cardTierChipTextDark : null]}>
                    {displayTier.label.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.cardBodyRow}>
                <View style={styles.cardBodyLeft}>
                  <Text style={[styles.memberNameLite, { color: displayTier.text }]} numberOfLines={1}>
                    Hi {profile?.customerName?.split(' ')[0] ?? 'there'}
                  </Text>
                  <Text style={[styles.pointsHeroValue, { color: displayTier.text }]}>{points.toLocaleString()}</Text>
                  <Text style={[styles.pointsHeroSub, { color: displayTier.text }]}>points · worth {formatCurrency(pointsDollarValue)}</Text>
                </View>

                <Pressable
                  style={styles.qrTile}
                  onPress={() => { Haptics.selectionAsync(); setShowQR(true); }}
                >
                  <Feather name="maximize" size={26} color="#405EFF" />
                </Pressable>
              </View>

              <View style={styles.cardProgressWrap}>
                <View style={styles.cardSpendMetaRow}>
                  <Text style={styles.cardSpendMetaText}>{nextTier ? `${formatCurrency(spendRemaining)} until ${nextTier.label}` : 'Top tier unlocked'}</Text>
                  <Text style={styles.cardSpendMetaText}>
                    {nextTier ? `${formatCurrency(spendCents)} / ${formatCurrency(nextTier.spendThreshold)} spent` : `${formatCurrency(spendCents)} spent`}
                  </Text>
                </View>
                <View style={styles.cardProgressTrack}>
                  <Animated.View style={[styles.cardProgressFill, { width: animatedWidth }]} />
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={[styles.section, styles.walletRow]}>
            <LinearGradient colors={['#102656', '#1A4FCB']} style={[styles.infoCard, styles.infoCardLarge]}>
              <Text style={styles.infoCardLabel}>Your points</Text>
              <Text style={styles.infoCardValue}>{points.toLocaleString()}</Text>
              <Text style={styles.infoCardSub}>worth {formatCurrency(pointsDollarValue)}</Text>
              <Text style={styles.infoCardHint}>Use any amount at checkout</Text>
              <Pressable style={styles.infoButton} onPress={() => router.push('/(customer)/cart')}>
                <Text style={styles.infoButtonText}>Use at checkout</Text>
              </Pressable>
            </LinearGradient>

            <LinearGradient colors={['#10213E', '#0D1630']} style={[styles.infoCard, styles.infoCardSmall]}>
              <View style={styles.infoCardMiniTop}>
                <Text style={styles.infoCardLabel}>Free coffee rewards</Text>
                <Text style={styles.infoCardMiniCount}>{freeCoffeeRewards}</Text>
              </View>
              <Text style={[styles.infoCardHint, styles.freeCoffeeHint]}>Every 6 coffee purchases unlocks 1 free coffee.</Text>
              <View style={styles.miniStampGrid}>
                {Array.from({ length: STAMP_COUNT }).map((_, index) => {
                  const filled = index < stampCount;
                  return (
                    <View key={index} style={[styles.miniStampBubble, filled ? styles.miniStampBubbleFilled : styles.miniStampBubbleEmpty]}>
                      {filled ? <Feather name="coffee" size={16} color="#0A67EC" /> : <View style={styles.miniStampDot} />}
                    </View>
                  );
                })}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Rewards wallet</Text>
              <Text style={styles.sectionMeta}>{claimedRewards.length > 0 ? `${claimedRewards.length} live reward${claimedRewards.length === 1 ? '' : 's'}` : 'Your next reward is brewing.'}</Text>
            </View>

            {claimedRewards.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletScroll}>
                {claimedRewards.map((claim) => {
                  const rewardName = claim.rewardName ?? 'Butterfield reward';
                  const preset = rewardPresetForTitle(rewardName, claim.rewardType);
                  const expiryInfo = getClaimExpiryInfo(claim.expiresAt ?? null);
                  return (
                    <LinearGradient key={claim.id} colors={preset.bg} style={styles.walletCard}>
                      <View style={styles.walletArtWrap}>
                        {preset.image ? (
                          <Image source={preset.image} style={styles.walletArt} contentFit="cover" />
                        ) : null}
                        <View style={[styles.walletIconBadge, { backgroundColor: WHITE }]}>
                          <Feather name={preset.icon as any} size={16} color={preset.tint} />
                        </View>
                      </View>
                      <Text style={styles.walletTitle}>{rewardName}</Text>
                      <Text style={styles.walletTerms}>
                        {claim.rewardType === 'money_voucher'
                          ? `$${((claim.voucherValueCents ?? 0) / 100).toFixed(2)} voucher`
                          : 'Use at checkout or counter'}
                      </Text>
                      <Text style={styles.walletExpiry}>{expiryInfo?.label ?? 'Ready now'}</Text>
                      <View style={styles.walletButtonRow}>
                        <Pressable style={styles.walletPrimaryButton} onPress={() => router.push('/(customer)/cart')}>
                          <Text style={styles.walletPrimaryButtonText}>Use now</Text>
                        </Pressable>
                        <Pressable style={styles.walletSecondaryButton} onPress={() => setShowQR(true)}>
                          <Text style={styles.walletSecondaryButtonText}>Show QR</Text>
                        </Pressable>
                      </View>
                      <Pressable
                        style={styles.walletCancelAction}
                        onPress={() => handleCancelClaim(claim)}
                        disabled={cancelling === claim.id}
                      >
                        {cancelling === claim.id ? (
                          <ActivityIndicator size="small" color="#D0312D" />
                        ) : (
                          <Text style={styles.walletCancelActionText}>Cancel claim</Text>
                        )}
                      </Pressable>
                    </LinearGradient>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="coffee" size={20} color={BRAND} />
                </View>
                <Text style={styles.emptyTitle}>Your next reward is brewing.</Text>
                <Text style={styles.emptyBody}>Keep ordering to unlock Butterfield perks. {nextTier ? `You’re ${formatCurrency(spendRemaining)} away from ${nextTier.label}.` : 'You are already at the top tier.'}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            {birthdayInfo ? (
              <LinearGradient colors={birthdayInfo.isBirthday ? ['#FFF3FA', '#FFE1F1'] : ['#FFFFFF', '#FFF7EE']} style={styles.birthdayCard}>
                <View style={styles.sectionHeadRow}>
                  <Text style={[styles.sectionTitle, { color: '#20131C' }]}>Birthday reward</Text>
                  <Text style={[styles.sectionMeta, { color: '#7B6676' }]}>{birthdayInfo.daysUntil === 0 ? 'Today' : `${birthdayInfo.daysUntil} days remaining`}</Text>
                </View>
                <Text style={styles.birthdayHeroText}>{birthdayInfo.emoji} {birthdayInfo.message}</Text>
                <Text style={styles.birthdayBody}>{birthdayInfo.sub}</Text>
                <View style={styles.birthdayFooter}>
                  <Text style={styles.birthdayDateLabel}>Birthday date</Text>
                  <Text style={styles.birthdayDateValue}>{(profile as any).birthday}</Text>
                  <Pressable onPress={() => router.push('/edit-details')}>
                    <Text style={styles.birthdayEditLink}>Edit birthday</Text>
                  </Pressable>
                </View>
              </LinearGradient>
            ) : (
              <Pressable style={styles.birthdayEmptyCard} onPress={() => router.push('/edit-details')}>
                <Text style={styles.sectionTitle}>Birthday reward</Text>
                <Text style={styles.birthdayHeroText}>Add your birthday</Text>
                <Text style={styles.birthdayBody}>Tell us your date so we can line up your Butterfield birthday reward.</Text>
                <Text style={styles.birthdayEditLink}>Add birthday</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Your tier perks</Text>
              <Text style={styles.sectionMeta}>{previewTier.shortLabel}</Text>
            </View>

            <View style={styles.perkTierTabs}>
              {DISPLAY_TIERS.map((tier) => (
                <Pressable
                  key={tier.key}
                  style={[styles.perkTierTab, previewTier.key === tier.key && styles.perkTierTabActive]}
                  onPress={() => { Haptics.selectionAsync(); setPreviewTierKey(tier.key); }}
                >
                  <Text style={[styles.perkTierTabText, previewTier.key === tier.key && styles.perkTierTabTextActive]}>
                    {tier.label.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <LinearGradient colors={previewTier.gradients} style={styles.perkHeroCard}>
              <Text style={styles.perkHeroLabel}>{previewTier.shortLabel}</Text>
              <Text style={styles.perkHeroSpend}>Spend {formatCurrency(previewTier.spendThreshold)}/year</Text>
              <Text style={styles.perkHeroText}>{previewTier.perkIntro}</Text>
            </LinearGradient>

            <View style={styles.perkGrid}>
              {previewTier.perks.map((perk) => (
                <View key={`${previewTier.key}-${perk.title}`} style={styles.perkTile}>
                  <View style={styles.perkIconWrap}>
                    <Feather name={perk.icon as any} size={18} color={BRAND} />
                  </View>
                  <Text style={styles.perkTitle}>{perk.title}</Text>
                  <Text style={styles.perkDetail}>{perk.detail}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Available rewards</Text>
              <Text style={styles.sectionMeta}>{rewards.filter((r: any) => r.customerRedeemable !== false).length} available</Text>
            </View>

            <View style={styles.rewardList}>
              {rewards.filter((r: any) => r.customerRedeemable !== false).map((reward) => {
                const rewardTitle = reward.title ?? reward.name ?? 'Reward';
                const preset = rewardPresetForTitle(rewardTitle, reward.rewardType);
                const canClaim = points >= reward.pointsCost;
                return (
                  <View key={reward.id} style={styles.rewardRedeemCard}>
                    <LinearGradient colors={preset.bg} style={styles.rewardRedeemArt}>
                      {preset.image ? <Image source={preset.image} style={styles.rewardRedeemImage} contentFit="cover" /> : null}
                    </LinearGradient>
                    <View style={styles.rewardRedeemContent}>
                      <Text style={styles.rewardRedeemTitle}>{rewardTitle}</Text>
                      <Text style={styles.rewardRedeemDesc}>{reward.description}</Text>
                      <View style={styles.rewardRedeemMetaRow}>
                        <Text style={styles.rewardRedeemPts}>{reward.rewardType === 'money_voucher' && reward.voucherValueCents ? `$${(reward.voucherValueCents / 100).toFixed(2)} voucher` : `${reward.pointsCost} pts`}</Text>
                        {reward.rewardType === 'money_voucher' && reward.voucherValueCents ? (
                          <Text style={styles.rewardRedeemHint}>{reward.pointsCost} points to claim</Text>
                        ) : (
                          <Text style={styles.rewardRedeemHint}>Use at checkout</Text>
                        )}
                      </View>
                    </View>
                    <Pressable
                      style={[styles.redeemButton, !canClaim && styles.redeemButtonDisabled]}
                      onPress={() => handleClaim(reward)}
                      disabled={redeeming === reward.id || !canClaim}
                    >
                      {redeeming === reward.id ? <ActivityIndicator size="small" color={WHITE} /> : <Text style={styles.redeemButtonText}>{canClaim ? 'Claim' : 'Need more'}</Text>}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Reward history</Text>
              <Text style={styles.sectionMeta}>{pastClaims.length > 0 ? `${pastClaims.length} previous reward${pastClaims.length === 1 ? '' : 's'}` : 'Fresh and ready'}</Text>
            </View>

            {pastClaims.length > 0 ? (
              <View style={styles.timelineWrap}>
                {pastClaims.map((claim, index) => {
                  const isVoucher = claim.rewardType === 'money_voucher';
                  const icon = isVoucher ? 'tag' : 'gift';
                  const status = claim.status === 'redeemed' ? 'Used' : claim.status === 'cancelled' ? 'Cancelled' : 'Expired';
                  return (
                    <View key={claim.id} style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        <View style={styles.timelineDot} />
                        {index < pastClaims.length - 1 ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.timelineCard}>
                        <View style={styles.timelineCardTop}>
                          <View style={styles.timelineBadge}>
                            <Feather name={icon as any} size={14} color={BRAND} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.timelineTitle}>{claim.rewardName}</Text>
                            <Text style={styles.timelineDate}>{claim.claimedAt ? new Date(claim.claimedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</Text>
                          </View>
                          <View style={styles.timelineStatusPill}>
                            <Text style={styles.timelineStatusText}>{status}</Text>
                          </View>
                        </View>
                        <Text style={styles.timelineBody}>{isVoucher ? `$${((claim.voucherValueCents ?? 0) / 100).toFixed(2)} voucher reward` : 'Butterfield reward claim'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="clock" size={20} color={BRAND} />
                </View>
                <Text style={styles.emptyTitle}>No reward history yet.</Text>
                <Text style={styles.emptyBody}>Keep ordering to unlock exclusive Butterfield perks and your history will start to build here.</Text>
              </View>
            )}
          </View>

        </Animated.View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  pageLabel: { fontSize: 12, color: '#7AA8FF', letterSpacing: 1.4, fontWeight: '700' },
  pageTitle: { fontSize: 31, lineHeight: 35, color: TEXT, fontWeight: '700' },
  heroSection: { paddingHorizontal: 16 },
  membershipCard: {
    borderRadius: 26,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 18,
  },
  cardNoise: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.16,
    backgroundColor: 'transparent',
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardGloss: { ...StyleSheet.absoluteFillObject },
  cardEdgeGlow: { ...StyleSheet.absoluteFillObject },
  cardTextureVeil: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  cardTextureOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardTextureOrbOne: {
    width: 190,
    height: 190,
    right: -34,
    top: 26,
  },
  cardTextureOrbTwo: {
    width: 124,
    height: 124,
    right: 104,
    top: 112,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  cardTextureOrbBlue: {
    backgroundColor: 'rgba(58,160,255,0.06)',
  },
  cardTextureRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTextureRingOne: {
    width: 220,
    height: 220,
    right: -52,
    top: 10,
    transform: [{ rotate: '-14deg' }],
  },
  cardTextureRingTwo: {
    width: 156,
    height: 156,
    right: 24,
    top: 52,
    transform: [{ rotate: '18deg' }],
  },
  cardTextureRingBlue: {
    borderColor: 'rgba(58,160,255,0.12)',
  },
  cardTextureBand: {
    position: 'absolute',
    left: -56,
    right: -36,
    top: 114,
    height: 1,
    transform: [{ rotate: '-12deg' }],
    opacity: 0.35,
  },
  cardTextureSweep: {
    position: 'absolute',
    width: 210,
    height: 210,
    right: -12,
    top: -34,
    borderRadius: 999,
    opacity: 0.45,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLogoBlock: { gap: 4 },
  cardLogo: { width: 132, height: 32 },
  cardTierChip: {
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cardTierChipDark: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cardTierChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: WHITE },
  cardTierChipTextDark: { color: '#51A9FF' },
  cardBodyRow: { marginTop: 24, flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  cardBodyLeft: { flex: 1, paddingRight: 10 },
  memberNameLite: { fontSize: 16, lineHeight: 20, fontWeight: '500', opacity: 0.96 },
  pointsHeroValue: { marginTop: 6, fontSize: 52, lineHeight: 56, fontWeight: '700' },
  pointsHeroSub: { marginTop: 2, fontSize: 14, lineHeight: 18, fontWeight: '600', opacity: 0.9 },
  qrTile: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
  },
  cardProgressWrap: { marginTop: 18, gap: 8 },
  cardSpendMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cardSpendMetaText: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600' },
  cardProgressTrack: { height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  cardProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 22, lineHeight: 26, color: TEXT, fontWeight: '700' },
  sectionMeta: { marginLeft: 'auto', fontSize: 13, color: '#8BA5C8', fontWeight: '600', textAlign: 'right' },
  perkTierTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    padding: 6,
    borderRadius: 18,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  perkTierTab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  perkTierTabActive: { backgroundColor: '#19335A' },
  perkTierTabText: { color: TEXT_MUTED, fontSize: 11, letterSpacing: 0.8, fontWeight: '700' },
  perkTierTabTextActive: { color: TEXT },
  perkHeroCard: { borderRadius: 22, padding: 18 },
  perkHeroLabel: { color: WHITE, fontSize: 11, letterSpacing: 1.1, fontWeight: '700' },
  perkHeroSpend: { marginTop: 8, color: WHITE, fontSize: 22, fontWeight: '700' },
  perkHeroText: { marginTop: 8, color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19 },
  perkGrid: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perkTile: {
    width: '48.4%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 124,
  },
  perkIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0D2345', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  perkTitle: { color: TEXT, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  perkDetail: { marginTop: 6, color: TEXT_MUTED, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  walletRow: { flexDirection: 'row', gap: 10 },
  infoCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-between',
  },
  infoCardLarge: { flex: 1 },
  infoCardSmall: { flex: 1, paddingBottom: 20, justifyContent: 'flex-start' },
  infoCardLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
  infoCardValue: { marginTop: 8, color: WHITE, fontSize: 32, lineHeight: 36, fontWeight: '700' },
  infoCardSub: { marginTop: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  infoCardHint: { marginTop: 4, color: 'rgba(255,255,255,0.66)', fontSize: 12, lineHeight: 17, fontWeight: '500' },
  infoCardMiniTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoCardMiniCount: { marginLeft: 'auto', color: WHITE, fontSize: 28, lineHeight: 32, fontWeight: '700' },
  freeCoffeeHint: {
    marginTop: 8,
    marginBottom: 14,
    color: 'rgba(255,255,255,0.84)',
    lineHeight: 19,
  },
  miniStampGrid: {
    alignSelf: 'center',
    width: 132,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  miniStampBubble: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  miniStampBubbleFilled: { backgroundColor: WHITE },
  miniStampBubbleEmpty: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.42)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.06)' },
  miniStampDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.6, borderColor: 'rgba(255,255,255,0.72)' },
  infoButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    borderRadius: 16,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  infoButtonText: { color: '#0D1730', fontSize: 13, fontWeight: '700' },
  walletScroll: { gap: 12, paddingRight: 12 },
  walletCard: {
    width: 232,
    borderRadius: 24,
    padding: 14,
    overflow: 'hidden',
  },
  walletArtWrap: { height: 116, borderRadius: 18, overflow: 'hidden', position: 'relative', backgroundColor: 'rgba(255,255,255,0.42)' },
  walletArt: { width: '100%', height: '100%' },
  walletIconBadge: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  walletTitle: { marginTop: 14, color: '#091221', fontSize: 18, lineHeight: 22, fontWeight: '700' },
  walletTerms: { marginTop: 6, color: '#43516A', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  walletExpiry: { marginTop: 8, color: '#637089', fontSize: 12, fontWeight: '600' },
  walletButtonRow: { marginTop: 14, flexDirection: 'row', gap: 8 },
  walletPrimaryButton: { flex: 1, borderRadius: 14, backgroundColor: '#0E1730', paddingVertical: 11, alignItems: 'center' },
  walletPrimaryButtonText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  walletSecondaryButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(9,18,33,0.12)', paddingVertical: 11, alignItems: 'center' },
  walletSecondaryButtonText: { color: '#091221', fontSize: 12, fontWeight: '700' },
  walletCancelAction: { marginTop: 12, alignSelf: 'flex-start' },
  walletCancelActionText: { color: '#9A2D2A', fontSize: 12, fontWeight: '700' },
  emptyCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'flex-start',
  },
  emptyIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0D2345', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { color: TEXT, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  emptyBody: { marginTop: 8, color: TEXT_MUTED, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  birthdayCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,214,223,0.7)',
  },
  birthdayEmptyCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  birthdayHeroText: { marginTop: 4, color: '#22111C', fontSize: 28, lineHeight: 32, fontWeight: '700' },
  birthdayBody: { marginTop: 8, color: '#6B5567', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  birthdayFooter: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120,95,113,0.12)',
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  birthdayDateLabel: { color: '#7D6877', fontSize: 12, fontWeight: '700' },
  birthdayDateValue: { color: '#2D1622', fontSize: 14, fontWeight: '700' },
  birthdayEditLink: { marginLeft: 'auto', color: BRAND, fontSize: 13, fontWeight: '700' },
  rewardList: { gap: 12 },
  rewardRedeemCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardRedeemArt: { width: 82, height: 82, borderRadius: 18, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  rewardRedeemImage: { width: '100%', height: '100%' },
  rewardRedeemContent: { flex: 1, gap: 5 },
  rewardRedeemTitle: { color: TEXT, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  rewardRedeemDesc: { color: TEXT_MUTED, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  rewardRedeemMetaRow: { marginTop: 6, gap: 4 },
  rewardRedeemPts: { color: '#89CCFF', fontSize: 13, fontWeight: '700' },
  rewardRedeemHint: { color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  redeemButton: {
    borderRadius: 16,
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 86,
  },
  redeemButtonDisabled: { backgroundColor: '#2B3A58' },
  redeemButtonText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  timelineWrap: { gap: 12 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { width: 22, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND, marginTop: 10 },
  timelineLine: { width: 1, flex: 1, marginTop: 8, backgroundColor: '#23314B' },
  timelineCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  timelineCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0D2345', alignItems: 'center', justifyContent: 'center' },
  timelineTitle: { color: TEXT, fontSize: 15, fontWeight: '700' },
  timelineDate: { marginTop: 2, color: TEXT_MUTED, fontSize: 12, fontWeight: '500' },
  timelineStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#11213F' },
  timelineStatusText: { color: '#89CCFF', fontSize: 11, fontWeight: '700' },
  timelineBody: { marginTop: 12, color: TEXT_MUTED, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  celebrateBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  celebrateCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    overflow: 'hidden',
  },
  celebrateSparkleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  celebrateDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.92)' },
  celebrateEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: 12, letterSpacing: 1.3, fontWeight: '700' },
  celebrateTitle: { marginTop: 8, color: WHITE, fontSize: 30, lineHeight: 34, fontWeight: '700' },
  celebrateBody: { marginTop: 8, color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  celebrateButton: {
    marginTop: 18,
    alignSelf: 'flex-start',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  celebrateButtonText: { color: '#111827', fontSize: 13, fontWeight: '700' },
});
