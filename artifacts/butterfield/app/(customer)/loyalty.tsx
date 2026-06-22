import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import { useScrollStatusBar } from '@/hooks/useScrollStatusBar';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useNavScrollHandlerWithJS } from '@/hooks/useNavScroll';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ClaimedReward, type LoyaltyReward } from '@/lib/api';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { CoffeeStampToken } from '@/components/CoffeeStampIcon';
import { useAuth } from '@/context/AuthContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import { getTierBySpendCents } from '@/constants/tierConfig';
import {
  type DisplayTier, type DisplayTierKey,
  DISPLAY_TIERS, REWARD_PRESETS,
  getBirthdayInfo, getClaimExpiryInfo, getDisplayTierByServerTier,
  getNextDisplayTier, getNextTierBySpend, formatCurrency, getPointsDollarValue, rewardPresetForTitle,
} from '@/constants/loyaltyTierConfig';
import { TierCelebrateOverlay, StampCelebrateOverlay } from '@/components/customer/LoyaltyCelebration';

const BG        = '#050A15';
const SURFACE   = '#0A1222';
const CARD      = '#0F172B';
const TEXT      = '#F8FAFC';
const TEXT_SOFT = 'rgba(241,245,249,0.8)';
const TEXT_MUTED= 'rgba(191,202,224,0.68)';
const BORDER    = 'rgba(148,163,184,0.18)';
const BRAND     = '#40C0F2';
const WHITE     = '#FFFFFF';
const STAMP_COUNT = 6;
const CELEBRATION_KEY_PREFIX = '@butterfield_rewards_celebrated';


export default function LoyaltyScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/(customer)/loyalty" compact />;
  return <LoyaltyContent />;
}

function LoyaltyContent() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const STAMP_GAP     = screenWidth < 380 ? 4 : screenWidth < 430 ? 8 : 10;
  const stampRailPad  = screenWidth < 380 ? 10 : 12;
  const stampSize     = Math.min(60, Math.max(38, Math.floor((screenWidth - 60 - stampRailPad * 2 - STAMP_GAP * 5) / 6)));

  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { barStyle, handleScroll, onHeaderLayout } = useScrollStatusBar('light-content');
  const scrollHandler = useNavScrollHandlerWithJS(handleScroll);

  const [showQR, setShowQR]                       = useState(false);
  const [redeeming, setRedeeming]                 = useState<string | null>(null);
  const [cancelling, setCancelling]               = useState<string | null>(null);
  const [celebrateTier, setCelebrateTier]         = useState<DisplayTier | null>(null);
  const [showStampCelebration, setShowStampCelebration] = useState(false);
  const [displayedPoints, setDisplayedPoints]     = useState(0);
  const [showBirthdayBanner, setShowBirthdayBanner] = useState(false);

  const progressAnim    = useRef(new Animated.Value(0)).current;
  const sectionFade     = useRef(new Animated.Value(0)).current;
  const pointsCountAnim = useRef(new Animated.Value(0)).current;
  const prevFreeCoffeeRef = useRef<number | null>(null);
  const prevPointsRef     = useRef<number | null>(null);
  const prevStampCountRef = useRef<number | null>(null);
  const stampScaleAnims   = useRef(Array.from({ length: STAMP_COUNT }, () => new Animated.Value(1))).current;

  const { data: profileData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn:  () => api.loyalty.profile(),
    staleTime: 60_000,
  });
  const { data: rewardsData } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn:  () => api.loyalty.rewards(),
    staleTime: 300_000,
  });
  const { data: claimedData, refetch: refetchClaimed } = useQuery({
    queryKey: ['loyalty-claimed-rewards'],
    queryFn:  () => api.loyalty.claimedRewards(),
    staleTime: 30_000,
  });
  const { data: qrData, isRefetching: isQrRefetching, refetch: refetchQr } = useQuery({
    queryKey: ['loyalty-qr-token'],
    queryFn:  () => api.loyalty.ensureQr(),
    staleTime: 300_000,
    retry: 1,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchClaimed, refetchQr);

  const profile      = profileData?.data;
  const points       = profile?.loyaltyPoints ?? 0;
  const spendCents   = profile?.totalSpentCents ?? 0;
  const stampCount   = profile?.stampCount ?? 0;
  const freeCoffeeRewards = profile?.freeCoffeeRewards ?? 0;
  const tierSettings = profileData?.data?.loyaltyTierSettings ?? null;
  const displayTier  = getDisplayTierByServerTier(getTierBySpendCents(spendCents, tierSettings)?.key);
  const nextTier     = getNextDisplayTier(spendCents, tierSettings);
  const nextServerTier = nextTier ? getNextTierBySpend(spendCents, tierSettings) : null;
  const spendRemaining  = nextServerTier ? Math.max(0, nextServerTier.spendThreshold - spendCents) : 0;
  const autoGrantedRewards: string[] = (profile as any)?.autoGrantedRewards ?? [];

  const claimedRewards: ClaimedReward[] = useMemo(() => {
    const list = (claimedData as any)?.data ?? [];
    return list.filter((c: ClaimedReward) => c.status === 'available');
  }, [claimedData]);
  const pastClaims: ClaimedReward[] = useMemo(() => {
    const list = (claimedData as any)?.data ?? [];
    return list.filter((c: ClaimedReward) => c.status !== 'available').slice(0, 6);
  }, [claimedData]);
  const visibleRewards: LoyaltyReward[] = useMemo(() => {
    const list = rewardsData?.data ?? [];
    return list.filter((r: LoyaltyReward) => r.isActive !== false && r.customerRedeemable !== false);
  }, [rewardsData]);

  const qrValue = qrData?.data?.qrPayload ?? profile?.qrPayload ?? null;

  useEffect(() => {
    Animated.timing(sectionFade, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sectionFade]);

  useEffect(() => {
    if (!profile) return;
    const target = nextServerTier ? Math.min(spendCents / nextServerTier.spendThreshold, 1) : 1;
    Animated.timing(progressAnim, { toValue: target, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [spendCents, nextServerTier, progressAnim, profile]);

  useEffect(() => {
    if (prevFreeCoffeeRef.current !== null && freeCoffeeRewards > prevFreeCoffeeRef.current) {
      setShowStampCelebration(true);
    }
    prevFreeCoffeeRef.current = freeCoffeeRewards;
  }, [freeCoffeeRewards]);

  useEffect(() => {
    if (prevStampCountRef.current !== null && stampCount > prevStampCountRef.current) {
      const newIdx = stampCount - 1;
      if (newIdx >= 0 && newIdx < STAMP_COUNT) {
        const anim = stampScaleAnims[newIdx];
        if (anim) {
          Animated.sequence([
            Animated.spring(anim, { toValue: 0.85, damping: 8, stiffness: 320, useNativeDriver: true }),
            Animated.spring(anim, { toValue: 1.2, damping: 9, stiffness: 340, useNativeDriver: true }),
            Animated.spring(anim, { toValue: 1, damping: 10, stiffness: 300, useNativeDriver: true }),
          ]).start();
        }
      }
    }
    prevStampCountRef.current = stampCount;
  }, [stampCount, stampScaleAnims]);

  useEffect(() => {
    if (profile?.birthdayRewardGranted) setShowBirthdayBanner(true);
  }, [profile?.birthdayRewardGranted]);

  useEffect(() => {
    if (!profile) return;
    const storageKey = `${CELEBRATION_KEY_PREFIX}_tier`;
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        const current = displayTier.key;
        if (stored && stored !== current) {
          const storedIdx  = DISPLAY_TIERS.findIndex(t => t.key === stored);
          const currentIdx = DISPLAY_TIERS.findIndex(t => t.key === current);
          if (currentIdx > storedIdx) setCelebrateTier(displayTier);
        }
        if (stored !== current) AsyncStorage.setItem(storageKey, current).catch(() => {});
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTier.key, profile]);

  useEffect(() => {
    if (prevPointsRef.current === null) { prevPointsRef.current = points; setDisplayedPoints(points); pointsCountAnim.setValue(points); return; }
    const from = prevPointsRef.current;
    prevPointsRef.current = points;
    if (points === from) return;
    pointsCountAnim.setValue(from);
    const id = pointsCountAnim.addListener(({ value }) => setDisplayedPoints(Math.round(value)));
    Animated.timing(pointsCountAnim, { toValue: points, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      pointsCountAnim.removeListener(id);
      setDisplayedPoints(points);
    });
    return () => { pointsCountAnim.removeListener(id); };
  }, [points, pointsCountAnim]);

  const handleClaim = async (reward: LoyaltyReward) => {
    if (points < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - points} more points.`);
      return;
    }
    const title  = reward.title ?? reward.name ?? 'Reward';
    const isVouc = reward.rewardType === 'money_voucher';
    const typeLabel = isVouc ? `This gives you a $${((reward.voucherValueCents ?? 0) / 100).toFixed(2)} voucher.` : 'This free item will be added at checkout.';
    Alert.alert('Claim Reward', `Claim "${title}" for ${reward.pointsCost} points?\n\n${typeLabel}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Claim', onPress: async () => {
        setRedeeming(reward.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
          await api.loyalty.redeem(reward.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
          qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
          Alert.alert('Claimed!', `"${title}" is ready. Go to checkout to apply it.`);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setRedeeming(null); }
      }},
    ]);
  };

  const handleCancelClaim = async (claim: ClaimedReward) => {
    Alert.alert('Cancel Claim', `Cancel "${claim.rewardName}"? Your ${claim.pointsSpent} points will be restored.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel Claim', style: 'destructive', onPress: async () => {
        setCancelling(claim.id);
        try {
          await api.loyalty.cancelClaim(claim.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
          qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setCancelling(null); }
      }},
    ]);
  };

  if (isLoading) {
    return <View style={styles.loadingWrap}><ActivityIndicator color={BRAND} size="large" /></View>;
  }

  const birthdayInfo = (profile as any)?.birthday ? getBirthdayInfo((profile as any).birthday) : null;
  const animatedWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <>
      <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />
      <TierCelebrateOverlay visible={!!celebrateTier} tier={celebrateTier} onClose={() => setCelebrateTier(null)} />
      <StampCelebrateOverlay visible={showStampCelebration} onClose={() => setShowStampCelebration(false)} />
      <CustomerQrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        qrValue={qrValue}
        customerName={profile?.customerName ?? 'Butterfield Member'}
        helperText="Show this in-store for your Butterfield rewards, coffee stamps and member perks."
        statusText={qrValue ? 'Your loyalty QR is synced and ready.' : 'We are refreshing your loyalty card details.'}
        isLoading={isQrRefetching && !qrValue}
        onRetry={() => { void refetchQr(); }}
      />

      <Reanimated.ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        <View onLayout={onHeaderLayout}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.pageLabel}>REWARDS</Text>
            <Text style={styles.pageTitle}>Your loyalty card</Text>
          </View>
        </View>

        <Animated.View style={{ opacity: sectionFade, transform: [{ translateY: sectionFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>

          {/* ── Card 1: Membership ── */}
          <View style={styles.heroSection}>
            <LinearGradient colors={displayTier.gradients} start={{ x: 0.02, y: 0.05 }} end={{ x: 0.98, y: 0.98 }} style={[styles.membershipCard, { shadowColor: displayTier.shadow }]}>
              <LinearGradient colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={[styles.cardTextureOrb, { width: 190, height: 190, right: -34, top: 26 }]} />
              <View style={[styles.cardTextureOrb, { width: 124, height: 124, right: 104, top: 112, backgroundColor: 'rgba(255,255,255,0.035)' }]} />

              <View style={styles.cardTopRow}>
                <Image source={displayTier.logo} style={[styles.cardLogo, displayTier.logoTint ? { tintColor: displayTier.logoTint } : null]} contentFit="contain" />
                <View style={styles.cardTierChip}>
                  <Text style={styles.cardTierChipText}>{displayTier.label.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.cardBodyRow}>
                <View style={styles.cardBodyLeft}>
                  <Text style={[styles.memberNameLite, { color: displayTier.text }]} numberOfLines={1}>
                    Hi {profile?.customerName?.split(' ')[0] ?? 'there'}
                  </Text>
                  <Text style={[styles.pointsHeroValue, { color: displayTier.text }]}>{displayedPoints.toLocaleString()}</Text>
                  <Text style={[styles.pointsHeroSub, { color: displayTier.text }]}>points · worth {formatCurrency(getPointsDollarValue(displayedPoints))}</Text>
                </View>
                <Pressable style={styles.qrTile} onPress={() => { Haptics.selectionAsync(); setShowQR(true); }}>
                  <Feather name="maximize" size={26} color="#405EFF" />
                </Pressable>
              </View>

              <View style={styles.cardProgressWrap}>
                <View style={styles.cardSpendMetaRow}>
                  <Text style={styles.cardSpendMetaText}>{nextTier ? `${formatCurrency(spendRemaining)} until ${nextTier.label}` : 'Top tier unlocked'}</Text>
                  <Text style={styles.cardSpendMetaText}>{nextTier ? `${formatCurrency(spendCents)} / ${formatCurrency(nextTier.spendThreshold)} spent` : `${formatCurrency(spendCents)} spent`}</Text>
                </View>
                <View style={styles.cardProgressTrack}>
                  <Animated.View style={[styles.cardProgressFill, { width: animatedWidth }]} />
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* ── Card 2: Coffee Club ── */}
          <View style={styles.section}>
            <LinearGradient colors={['#10213E', '#0D1630']} style={styles.coffeeClubCard}>
              <View style={styles.coffeeClubHeader}>
                <View style={styles.freeCoffeeCopy}>
                  <Text style={styles.coffeeClubTitle}>Coffee Club</Text>
                  <Text style={styles.freeCoffeeHint}>Every 6 coffee purchases unlocks 1 free coffee.</Text>
                </View>
                <View style={styles.freeCoffeeBadge}>
                  <Text style={styles.freeCoffeeBadgeCount}>{freeCoffeeRewards}</Text>
                  <Text style={styles.freeCoffeeBadgeLabel}>free</Text>
                </View>
              </View>
              <View style={[styles.coffeeStampRail, { paddingHorizontal: stampRailPad }]}>
                <View style={[styles.coffeeStampRow, { columnGap: STAMP_GAP }]}>
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <Animated.View key={idx} style={{ transform: [{ scale: stampScaleAnims[idx] ?? 1 }] }}>
                      <CoffeeStampToken size={stampSize} filled={idx < stampCount} />
                    </Animated.View>
                  ))}
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* ── Birthday banner ── */}
          {showBirthdayBanner && (
            <View style={styles.section}>
              <LinearGradient colors={['#FF5A7E', '#FF3860', '#C8245C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.birthdayBannerCard}>
                <View style={styles.birthdayBannerRow}>
                  <Text style={styles.birthdayBannerEmoji}>🎂</Text>
                  <View style={styles.birthdayBannerCopy}>
                    <Text style={styles.birthdayBannerTitle}>Happy Birthday, {profile?.customerName?.split(' ')[0] ?? 'you'}!</Text>
                    <Text style={styles.birthdayBannerSub}>Your free Birthday Cookie is waiting in your wallet below.</Text>
                  </View>
                  <Pressable onPress={() => setShowBirthdayBanner(false)} hitSlop={12}>
                    <Feather name="x" size={18} color="rgba(255,255,255,0.8)" />
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* ── Reward wallet ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Rewards wallet</Text>
              <Text style={styles.sectionMeta}>{claimedRewards.length > 0 ? `${claimedRewards.length} live` : 'Keep ordering'}</Text>
            </View>
            {claimedRewards.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletScroll}>
                {claimedRewards.map((claim) => {
                  const rewardName = claim.rewardName ?? 'Butterfield reward';
                  const preset     = rewardPresetForTitle(rewardName, claim.rewardType);
                  const expiryInfo = getClaimExpiryInfo(claim.expiresAt ?? null);
                  const isBirthday = claim.rewardType === 'birthday_cookie';
                  return (
                    <LinearGradient key={claim.id} colors={preset.bg} style={styles.walletCard}>
                      {isBirthday && <View style={styles.birthdayWalletBadge}><Text style={styles.birthdayWalletBadgeText}>🎂 Birthday Gift</Text></View>}
                      <View style={styles.walletArtWrap}>
                        {preset.image ? <Image source={preset.image} style={styles.walletArt} contentFit="cover" /> : null}
                        <View style={[styles.walletIconBadge, { backgroundColor: WHITE }]}>
                          <Feather name={preset.icon as any} size={16} color={preset.tint} />
                        </View>
                      </View>
                      <Text style={styles.walletTitle}>{rewardName}</Text>
                      <Text style={styles.walletTerms}>
                        {isBirthday ? '100% off your cheapest cookie' : claim.rewardType === 'money_voucher' ? `$${((claim.voucherValueCents ?? 0) / 100).toFixed(2)} voucher` : 'Use at checkout or counter'}
                      </Text>
                      <Text style={styles.walletExpiry}>{expiryInfo?.label ?? 'Ready now'}</Text>
                      <View style={styles.walletButtonRow}>
                        <Pressable style={styles.walletPrimaryButton} onPress={() => router.push('/customer-cart' as any)}>
                          <Text style={styles.walletPrimaryButtonText}>Use now</Text>
                        </Pressable>
                        <Pressable style={styles.walletSecondaryButton} onPress={() => setShowQR(true)}>
                          <Text style={styles.walletSecondaryButtonText}>QR</Text>
                        </Pressable>
                      </View>
                      <Pressable style={styles.walletCancelAction} onPress={() => handleCancelClaim(claim)} disabled={cancelling === claim.id}>
                        {cancelling === claim.id ? <ActivityIndicator size="small" color="#D0312D" /> : <Text style={styles.walletCancelActionText}>Cancel claim</Text>}
                      </Pressable>
                    </LinearGradient>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}><Feather name="coffee" size={20} color={BRAND} /></View>
                <Text style={styles.emptyTitle}>Your next reward is brewing.</Text>
                <Text style={styles.emptyBody}>{nextTier ? `You're ${formatCurrency(spendRemaining)} away from ${nextTier.label}.` : 'Keep ordering to unlock Butterfield perks.'}</Text>
              </View>
            )}
          </View>

          {/* ── Available rewards (horizontal scroll) ── */}
          {visibleRewards.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitle}>Available rewards</Text>
                <Text style={styles.sectionMeta}>{visibleRewards.length} available</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 0, paddingRight: 4, gap: 10 }}>
                {visibleRewards.map((reward: LoyaltyReward) => {
                  const rewardTitle = reward.title ?? reward.name ?? 'Reward';
                  const preset      = rewardPresetForTitle(rewardTitle, reward.rewardType);
                  const canClaim    = points >= reward.pointsCost;
                  return (
                    <View key={reward.id} style={[styles.rewardCard, { opacity: canClaim ? 1 : 0.65 }]}>
                      <LinearGradient colors={preset.bg} style={styles.rewardCardArt}>
                        {preset.image ? <Image source={preset.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                        <View style={[styles.rewardCardIcon, { borderColor: preset.tint }]}>
                          <Feather name={preset.icon as any} size={16} color={preset.tint} />
                        </View>
                      </LinearGradient>
                      <View style={styles.rewardCardBody}>
                        <Text style={styles.rewardCardTitle} numberOfLines={2}>{rewardTitle}</Text>
                        <Text style={styles.rewardCardPts}>{reward.rewardType === 'money_voucher' && reward.voucherValueCents ? `$${(reward.voucherValueCents / 100).toFixed(2)} voucher` : `${reward.pointsCost} pts`}</Text>
                      </View>
                      <Pressable
                        style={[styles.rewardClaimBtn, { backgroundColor: canClaim ? BRAND : '#2A3856' }]}
                        onPress={() => handleClaim(reward)}
                        disabled={redeeming === reward.id || !canClaim}
                      >
                        {redeeming === reward.id
                          ? <ActivityIndicator size="small" color={WHITE} />
                          : <Text style={styles.rewardClaimBtnText}>{canClaim ? 'Claim' : `${reward.pointsCost} pts`}</Text>}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Birthday card ── */}
          <View style={styles.section}>
            {birthdayInfo ? (
              <LinearGradient colors={birthdayInfo.isBirthday ? ['#FFF3FA', '#FFE1F1'] : ['#FFFFFF', '#FFF7EE']} style={styles.birthdayCard}>
                <View style={styles.sectionHeadRow}>
                  <Text style={[styles.sectionTitle, { color: '#20131C' }]}>Birthday reward</Text>
                  <Text style={[styles.sectionMeta, { color: '#7B6676' }]}>{birthdayInfo.daysUntil === 0 ? 'Today' : `${birthdayInfo.daysUntil}d away`}</Text>
                </View>
                <Text style={styles.birthdayHeroText}>{birthdayInfo.emoji} {birthdayInfo.message}</Text>
                <Text style={styles.birthdayBody}>{birthdayInfo.sub}</Text>
                <Pressable onPress={() => router.push('/edit-details')} style={{ marginTop: 8 }}>
                  <Text style={styles.birthdayEditLink}>Edit birthday</Text>
                </Pressable>
              </LinearGradient>
            ) : (
              <Pressable style={styles.birthdayEmptyCard} onPress={() => router.push('/edit-details')}>
                <Text style={styles.sectionTitle}>Birthday reward</Text>
                <Text style={[styles.birthdayHeroText, { color: '#FFFFFF' }]}>Add your birthday</Text>
                <Text style={styles.birthdayBody}>Tell us your date so we can line up your Butterfield birthday reward.</Text>
                <Text style={styles.birthdayEditLink}>Add birthday →</Text>
              </Pressable>
            )}
          </View>

        </Animated.View>
      </Reanimated.ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header:      { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  pageLabel:   { fontSize: 12, color: '#7AA8FF', letterSpacing: 1.4, fontWeight: '700' },
  pageTitle:   { fontSize: 31, lineHeight: 35, color: TEXT, fontWeight: '700' },
  heroSection: { paddingHorizontal: 16 },
  section:     { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 18, color: TEXT, fontWeight: '700' },
  sectionMeta:  { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },
  // Membership card
  membershipCard: {
    borderRadius: 26, overflow: 'hidden',
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 18,
  },
  cardTextureOrb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  cardTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardLogo:     { width: 110, height: 32 },
  cardTierChip: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cardTierChipText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  cardBodyRow:  { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  cardBodyLeft: { gap: 2 },
  memberNameLite:  { fontSize: 14, fontWeight: '500', opacity: 0.85 },
  pointsHeroValue: { fontSize: 38, fontWeight: '900', lineHeight: 44, letterSpacing: -1 },
  pointsHeroSub:   { fontSize: 13, opacity: 0.75 },
  qrTile: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
  cardProgressWrap: { gap: 6 },
  cardSpendMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardSpendMetaText:{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
  cardProgressTrack:{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  cardProgressFill: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  // Coffee club
  coffeeClubCard:   { borderRadius: 20, overflow: 'hidden', padding: 16, gap: 12 },
  coffeeClubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  freeCoffeeCopy:   { flex: 1, gap: 2 },
  coffeeClubTitle:  { fontSize: 16, fontWeight: '700', color: WHITE },
  freeCoffeeHint:   { fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 17 },
  freeCoffeeBadge:  { alignItems: 'center', backgroundColor: 'rgba(64,192,242,0.18)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(64,192,242,0.3)' },
  freeCoffeeBadgeCount: { color: '#40C0F2', fontSize: 22, fontWeight: '900', lineHeight: 26 },
  freeCoffeeBadgeLabel: { color: 'rgba(64,192,242,0.75)', fontSize: 11, fontWeight: '600' },
  coffeeStampRail:  { alignItems: 'center' },
  coffeeStampRow:   { flexDirection: 'row', alignItems: 'center' },
  // Birthday banner
  birthdayBannerCard: { borderRadius: 16, overflow: 'hidden', padding: 16 },
  birthdayBannerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  birthdayBannerEmoji:{ fontSize: 28 },
  birthdayBannerCopy: { flex: 1, gap: 2 },
  birthdayBannerTitle:{ color: WHITE, fontSize: 15, fontWeight: '700' },
  birthdayBannerSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  // Wallet
  walletScroll: { gap: 10, paddingRight: 4 },
  walletCard:   { borderRadius: 20, overflow: 'hidden', padding: 14, width: 180, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  birthdayWalletBadge: { backgroundColor: '#FFE0F0', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 2 },
  birthdayWalletBadgeText: { fontSize: 10, color: '#C83C78', fontWeight: '700' },
  walletArtWrap:  { height: 60, borderRadius: 12, overflow: 'hidden', marginBottom: 2, backgroundColor: 'rgba(0,0,0,0.04)' },
  walletArt:      { width: '100%', height: '100%' },
  walletIconBadge:{ position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4 },
  walletTitle:    { fontSize: 13, color: '#0F172A', fontWeight: '700', lineHeight: 18 },
  walletTerms:    { fontSize: 11, color: '#475569', fontWeight: '500' },
  walletExpiry:   { fontSize: 10, color: '#94A3B8' },
  walletButtonRow:{ flexDirection: 'row', gap: 6, marginTop: 4 },
  walletPrimaryButton:  { flex: 1, backgroundColor: BRAND, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  walletPrimaryButtonText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  walletSecondaryButton:   { backgroundColor: '#EEF4FF', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center' },
  walletSecondaryButtonText: { color: BRAND, fontSize: 12, fontWeight: '600' },
  walletCancelAction:    { alignItems: 'center', paddingTop: 6 },
  walletCancelActionText:{ fontSize: 11, color: '#DC2626', fontWeight: '500' },
  // Empty
  emptyCard:    { backgroundColor: SURFACE, borderRadius: 16, padding: 20, alignItems: 'center', gap: 8 },
  emptyIconWrap:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,147,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { color: TEXT, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyBody:    { color: TEXT_MUTED, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  // Available rewards (horizontal cards)
  rewardCard:    { width: 148, backgroundColor: CARD, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  rewardCardArt: { height: 80, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8 },
  rewardCardIcon:{ width: 32, height: 32, borderRadius: 16, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  rewardCardBody:{ padding: 10, gap: 2 },
  rewardCardTitle:{ fontSize: 12, color: TEXT, fontWeight: '700', lineHeight: 17 },
  rewardCardPts: { fontSize: 11, color: BRAND, fontWeight: '700' },
  rewardClaimBtn:{ marginHorizontal: 10, marginBottom: 10, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  rewardClaimBtnText: { color: WHITE, fontSize: 12, fontWeight: '800' },
  // Birthday
  birthdayCard:      { borderRadius: 20, overflow: 'hidden', padding: 16, gap: 6 },
  birthdayHeroText:  { fontSize: 18, fontWeight: '800', color: '#2D1B29' },
  birthdayBody:      { fontSize: 13, color: '#5D4459', lineHeight: 19 },
  birthdayEditLink:  { fontSize: 13, color: BRAND, fontWeight: '600' },
  birthdayEmptyCard: { borderRadius: 20, overflow: 'hidden', padding: 16, gap: 6, backgroundColor: '#1A2B4A' },
});
