import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { api, type LoyaltyReward, type ClaimedReward } from '@/lib/api';
import { TIERS_ORDERED, getTierConfig, getNextTierBySpend } from '@/constants/tierConfig';
import { CustomerQrModal } from '@/components/CustomerQrModal';

const BG        = '#F5F6FA';
const BLUE_CARD = '#1493FF';
const BLUE_DARK = '#3CBBEE';
const BRAND     = '#1493FF';
const CHERRY    = '#D0312D';
const WHITE     = '#FFFFFF';
const TEXT      = '#1C1C1E';
const MUTED     = '#8E8E93';
const BORDER    = '#D8E4EB';
const STAMP_COUNT = 6;
function getBirthdayInfo(isoDate: string): {
  daysUntil: number;
  message: string;
  sub: string;
  emoji: string;
  isBirthday: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = isoDate.split('-').map(Number);
  // Next birthday this or next year
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
  const formatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (diff === 0) return {
    daysUntil: 0, isBirthday: true, emoji: '🎂',
    message: 'Happy Birthday!',
    sub: 'Your free cookie is ready — show this to any Butterfield team member! 🍪',
  };
  if (diff === 1) return {
    daysUntil: 1, isBirthday: false, emoji: '🥳',
    message: 'Your birthday is tomorrow!',
    sub: 'Get excited — your free birthday cookie is almost here!',
  };
  if (diff <= 3) return {
    daysUntil: diff, isBirthday: false, emoji: '🎉',
    message: `Only ${diff} days to go!`,
    sub: 'Your birthday is just around the corner. We can\'t wait to celebrate with you!',
  };
  if (diff <= 6) return {
    daysUntil: diff, isBirthday: false, emoji: '🎈',
    message: `${diff} days until your birthday!`,
    sub: 'Your free cookie is almost within reach. Hold tight!',
  };
  if (diff === 7) return {
    daysUntil: 7, isBirthday: false, emoji: '⏳',
    message: 'One week to go!',
    sub: 'Exactly one week until your birthday. Mark your calendar! 📅',
  };
  if (diff <= 14) return {
    daysUntil: diff, isBirthday: false, emoji: '📅',
    message: `${diff} days to birthday!`,
    sub: `Counting down — your free birthday cookie awaits you on ${formatted}.`,
  };
  if (diff <= 30) return {
    daysUntil: diff, isBirthday: false, emoji: '🍪',
    message: `${diff} days until ${formatted}!`,
    sub: 'Your birthday is coming up this month. Keep earning those loyalty points!',
  };
  return {
    daysUntil: diff, isBirthday: false, emoji: '🎂',
    message: `Birthday on ${formatted}`,
    sub: `${diff} days to go — your free cookie will be waiting for you!`,
  };
}
const HOW_IT_WORKS = [
  { icon: 'coffee', title: 'Earn 1 pt per $1', desc: 'Every dollar you spend earns 1 point automatically.' },
  { icon: 'tag', title: '100 pts = $5 credit', desc: 'Save up your points and redeem them for store credit. No minimum spend.' },
  { icon: 'award', title: 'Climb the tiers', desc: 'Silver at $150 spent · Gold at $500 · Platinum at $1,000 (lifetime).' },
  { icon: 'gift', title: 'Birthday treat', desc: 'Free cookie every birthday week, on us.' },
];
export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showQR, setShowQR] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Fallback QR token fetched via ensure-qr if the main profile had none.
  const [healedQrToken, setHealedQrToken] = useState<string | null>(null);
  const { data: profileData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: rewardsData } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.loyalty.rewards(),
  });
  const { data: txnData } = useQuery({
    queryKey: ['loyalty-transactions'],
    queryFn: () => api.loyalty.transactions(),
  });
  const { data: claimedData } = useQuery({
    queryKey: ['loyalty-claimed-rewards'],
    queryFn: () => api.loyalty.claimedRewards(),
  });
  const { data: historyData } = useQuery({
    queryKey: ['loyalty-claimed-rewards-history'],
    queryFn: () => api.loyalty.claimedRewardsHistory(),
  });
  const profile = profileData?.data;
  const rewards = rewardsData?.data ?? [];
  const transactions = txnData?.data ?? [];
  const claimedRewards: ClaimedReward[] = claimedData?.data ?? [];
  // Past claims: redeemed, cancelled, or expired (for history display)
  const allHistory: ClaimedReward[] = historyData?.data ?? [];
  const pastClaims = allHistory.filter(c => !['available', 'applied_to_cart'].includes(c.status));
  const pts = profile?.loyaltyPoints ?? 0;
  const stamps = Math.min(profile?.coffeeStampCount ?? profile?.stampCount ?? 0, STAMP_COUNT);
  const stampsLeft = Math.max(0, STAMP_COUNT - stamps);
  // Use the server-stored tier as the single source of truth (spend-based, never decreases).
  const totalSpentCents = (profile as any)?.totalSpentCents ?? 0;
  const currentTier = getTierConfig(profile?.loyaltyTier ?? 'bronze');
  const nextTier    = getNextTierBySpend(totalSpentCents);
  const spentToNext = nextTier ? nextTier.spendThreshold - totalSpentCents : 0;
  const progress    = nextTier ? Math.min(totalSpentCents / nextTier.spendThreshold, 1) : 1;
  const serverQrToken = profile?.loyaltyQrToken ?? null;
  const effectiveQrToken = serverQrToken ?? healedQrToken;
  const qrValue = profile?.qrPayload
    ?? (effectiveQrToken ? `BUTTERFIELD:LOYALTY:${effectiveQrToken}` : null)
    ?? (profile?.userId && profile?.referralCode ? `BUTTERFIELD:${profile.userId}:${profile.referralCode}` : null);
  // Self-heal: if the profile loaded but has no QR token, request one silently.
  React.useEffect(() => {
    if (!profile || qrValue) return;
    api.loyalty.ensureQr()
      .then((res) => {
        if (res.data?.loyaltyQrToken) {
          setHealedQrToken(res.data.loyaltyQrToken);
          qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
        }
      })
      .catch(() => {});
  }, [profile?.userId, qrValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleClaim = async (reward: LoyaltyReward) => {
    if (pts < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - pts} more points to claim this.`);
      return;
    }
    const rewardTitle = (reward as any).title ?? reward.name ?? 'Reward';
    const rewardType = (reward as any).rewardType ?? 'item_reward';
    const voucherCents = (reward as any).voucherValueCents;
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
              Alert.alert('Claimed!', `"${rewardTitle}" is ready. Go to Cart to apply it at checkout.`);
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <ActivityIndicator color={BRAND} size="large" />
      </View>
    );
  }
  return (
    <>
      <CustomerQrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        qrValue={qrValue}
        customerName={profile?.customerName ?? 'Butterfield Member'}
        helperText="Show this at the counter to collect coffee stamps and rewards."
        statusText={effectiveQrToken ? 'Your permanent loyalty QR is ready to scan.' : 'We are refreshing your loyalty card details.'}
        isLoading={isRefetching && !qrValue}
        onRetry={() => { void refetch(); }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: WHITE }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        <View style={[styles.pageHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.pageLabel, { fontWeight: '600' }]}>REWARDS</Text>
          <Text style={[styles.pageTitle, { fontWeight: '700' }]}>Your loyalty card</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={currentTier.gradient} style={styles.loyaltyCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={[styles.memberLabel, { fontWeight: '600' }]}>
              MEMBER · {currentTier.label.toUpperCase()}
            </Text>
            <Text style={[styles.bigPoints, { fontWeight: '700' }]}>{pts.toLocaleString()}</Text>
            <Text style={[styles.ptsWorth, { fontWeight: '400' }]}>
              points · worth ${(Math.floor(pts / 100) * 5).toFixed(0)}
            </Text>
            {nextTier && (
              <View style={styles.progressSection}>
                <View style={styles.progressLabels}>
                  <Text style={[styles.progressLabelText, { fontWeight: '400' }]}>
                    ${(spentToNext / 100).toFixed(0)} to go for {nextTier.label}
                  </Text>
                  <Text style={[styles.progressLabelText, { fontWeight: '600' }]}>
                    ${(totalSpentCents / 100).toFixed(0)} / ${(nextTier.spendThreshold / 100).toFixed(0)}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
              </View>
            )}
            <View style={styles.tierRow}>
              {TIERS_ORDERED.map((tier, i) => {
                const active = tier.key === currentTier.key;
                return (
                  <View
                    key={tier.key}
                    style={[
                      styles.tierBtn,
                      active && { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.65)' },
                      i < TIERS_ORDERED.length - 1 && { marginRight: 6 },
                    ]}
                  >
                    <Text style={[styles.tierBtnLabel, { fontWeight: active ? '700' : '400', color: active ? '#fff' : 'rgba(255,255,255,0.5)' }]}>
                      {tier.label.toUpperCase()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </LinearGradient>
        </View>
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>Rewards Club</Text>
          <View style={styles.buyBadge}>
            <Text style={[styles.buyBadgeText, { fontWeight: '500' }]}>Buy 5, get 1 free</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={[BLUE_CARD, BLUE_DARK]} style={styles.coffeeCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.coffeeCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.coffeeLabel, { fontWeight: '600' }]}>REWARDS CLUB</Text>
                <Text style={[styles.coffeeToGo, { fontWeight: '700' }]}>
                  {stampsLeft > 0 ? `${stampsLeft} to go` : '🎉 Free coffee!'}
                </Text>
                <Text style={[styles.coffeeDesc, { fontWeight: '400' }]}>
                  Earn {STAMP_COUNT} stamps to unlock your free coffee.
                </Text>
              </View>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQR(true); }} style={styles.qrBtn}>
                <Feather name="maximize" size={12} color={WHITE} />
                <Text style={[styles.qrBtnText, { fontWeight: '600' }]}>My QR</Text>
              </Pressable>
            </View>
            <View style={styles.stampRow}>
              {Array.from({ length: STAMP_COUNT }).map((_, i) => {
                const filled = i < stamps;
                return (
                  <View key={i} style={[styles.stampCircle, { backgroundColor: filled ? WHITE : 'transparent', borderColor: filled ? WHITE : 'rgba(255,255,255,0.4)', borderWidth: filled ? 0 : 2, borderStyle: filled ? 'solid' : 'dashed' }]}>
                    {filled && <Feather name="coffee" size={14} color={BLUE_DARK} />}
                  </View>
                );
              })}
            </View>
            <View style={styles.rewardRow}>
              <Feather name="gift" size={14} color={WHITE} />
              <Text style={[styles.rewardRowText, { fontWeight: '600' }]}>
                {profile?.freeCoffeeRewards ?? profile?.freeCoffeesEarned ?? 0} free coffee reward{((profile?.freeCoffeeRewards ?? profile?.freeCoffeesEarned ?? 0) === 1) ? '' : 's'} available
              </Text>
            </View>
          </LinearGradient>
        </View>
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          {(profile as any)?.birthday ? (
            // ── Birthday set: countdown card matching coffee card layout ────
            (() => {
              const bdInfo = getBirthdayInfo((profile as any).birthday!);
              const isBd = bdInfo.isBirthday;
              return (
                <View style={[
                  styles.birthdayCard,
                  isBd ? { backgroundColor: '#FFF0F8', borderColor: '#F9A8D4', borderStyle: 'solid' } : {},
                ]}>
                  <Text style={[styles.bdSectionLabel, { fontWeight: '600',
                    color: isBd ? '#E879A0' : MUTED }]}>
                    BIRTHDAY
                  </Text>
                  <Text style={[styles.bdHeading, { fontWeight: '700',
                    color: isBd ? '#BE185D' : TEXT }]}>
                    {bdInfo.emoji} {bdInfo.message}
                  </Text>
                  <Text style={[styles.bdDesc, { fontWeight: '400',
                    color: isBd ? '#9D174D' : MUTED }]}>
                    {bdInfo.sub}
                  </Text>
                  <View style={styles.bdEditHint}>
                    <Feather name="settings" size={11} color={MUTED} />
                    <Text style={[styles.bdEditHintText, { fontWeight: '400' }]}>
                      To update your birthday, go to Account → Edit Profile
                    </Text>
                  </View>
                </View>
              );
            })()
          ) : (
            // ── No birthday: tap to add, same card layout ───────────────────
            <Pressable
              style={[styles.birthdayCard, { borderStyle: 'dashed' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/edit-details');
              }}
            >
              <Text style={[styles.bdSectionLabel, { fontWeight: '600', color: MUTED }]}>
                BIRTHDAY
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.bdHeading, { fontWeight: '700', color: TEXT, flex: 1 }]}>
                  🎂 Add your birthday
                </Text>
                <Feather name="chevron-right" size={20} color={MUTED} />
              </View>
              <Text style={[styles.bdDesc, { fontWeight: '400', color: MUTED }]}>
                Get a free cookie every birthday week — on us!
              </Text>
            </Pressable>
          )}
        {claimedRewards.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={[styles.sectionHeader, { paddingHorizontal: 16 }]}>
              <Feather name="gift" size={16} color={TEXT} />
              <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>Claimed rewards</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {claimedRewards.map((c) => {
                const isVoucher = c.rewardType === 'money_voucher';
                return (
                  <View key={c.id} style={[styles.rewardCard, { backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 14, padding: 14 }]}>
                    <View style={[styles.rewardIcon, { backgroundColor: '#D1FAE5' }]}>
                      <Feather name={isVoucher ? 'tag' : 'gift'} size={18} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.rewardName, { fontWeight: '600', color: '#166534' }]}>{c.rewardName}</Text>
                      <Text style={[styles.rewardDesc, { fontWeight: '400', color: '#15803D' }]}>
                        {isVoucher
                          ? `$${((c.voucherValueCents ?? 0) / 100).toFixed(2)} voucher — apply at checkout`
                          : 'Free item — apply at checkout'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={{ backgroundColor: '#D1FAE5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, color: '#166534', fontWeight: '600' }}>Ready to use</Text>
                        </View>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleCancelClaim(c)}
                      disabled={cancelling === c.id}
                      style={{ padding: 8 }}
                    >
                      {cancelling === c.id
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <Feather name="x-circle" size={20} color="#EF4444" />}
                    </Pressable>
                  </View>
                );
              })}
              <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center', paddingBottom: 4 }}>
                Tap the X to cancel an unused claim and restore your points.
              </Text>
            </View>
          </View>
        )}

        {pastClaims.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={[styles.sectionHeader, { paddingHorizontal: 16 }]}>
              <Feather name="clock" size={16} color={TEXT} />
              <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>Reward history</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {pastClaims.map((c) => {
                const isVoucher = c.rewardType === 'money_voucher';
                const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
                  redeemed:   { label: 'Used',      bg: '#EFF6FF', text: '#1D4ED8' },
                  cancelled:  { label: 'Cancelled', bg: '#FEF2F2', text: '#DC2626' },
                  expired:    { label: 'Expired',   bg: '#F9FAFB', text: '#6B7280' },
                };
                const sc = statusConfig[c.status] ?? { label: c.status, bg: '#F9FAFB', text: '#6B7280' };
                const claimedDate = c.claimedAt ? new Date(c.claimedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                return (
                  <View key={c.id} style={[styles.rewardCard, { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 14, opacity: 0.85 }]}>
                    <View style={[styles.rewardIcon, { backgroundColor: '#F3F4F6' }]}>
                      <Feather name={isVoucher ? 'tag' : 'gift'} size={18} color="#9CA3AF" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.rewardName, { fontWeight: '600', color: '#374151' }]}>{c.rewardName}</Text>
                      <Text style={[styles.rewardDesc, { fontWeight: '400', color: '#6B7280' }]}>
                        {isVoucher ? `$${((c.voucherValueCents ?? 0) / 100).toFixed(2)} voucher` : 'Free item reward'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={{ backgroundColor: sc.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, color: sc.text, fontWeight: '600' }}>{sc.label}</Text>
                        </View>
                        {claimedDate ? <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{claimedDate}</Text> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {rewards.filter((r: any) => r.customerRedeemable !== false).length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>Claim a reward</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {rewards.filter((r: any) => r.customerRedeemable !== false).map((r) => {
                const canClaim = pts >= r.pointsCost;
                const rewardType = (r as any).rewardType ?? 'item_reward';
                const voucherCents = (r as any).voucherValueCents;
                return (
                  <View key={r.id} style={styles.rewardCard}>
                    <View style={[styles.rewardIcon, { backgroundColor: '#EEF2FB' }]}>
                      <Feather name={rewardType === 'money_voucher' ? 'tag' : 'gift'} size={18} color={BRAND} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.rewardName, { fontWeight: '600' }]}>{(r as any).title ?? r.name}</Text>
                      <Text style={[styles.rewardDesc, { fontWeight: '400' }]}>{r.description}</Text>
                      {rewardType === 'money_voucher' && voucherCents ? (
                        <Text style={[styles.rewardPts, { fontWeight: '600', color: '#16A34A' }]}>
                          ${(voucherCents / 100).toFixed(2)} off — {r.pointsCost} pts
                        </Text>
                      ) : (
                        <Text style={[styles.rewardPts, { fontWeight: '600', color: BRAND }]}>
                          {r.pointsCost} pts
                        </Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => handleClaim(r)}
                      disabled={redeeming === r.id || !canClaim}
                      style={[styles.redeemBtn, { backgroundColor: canClaim ? WHITE : '#F0F0F0', borderColor: canClaim ? BORDER : 'transparent', borderWidth: 1 }]}
                    >
                      {redeeming === r.id ? (
                        <ActivityIndicator size="small" color={BRAND} />
                      ) : (
                        <Text style={[styles.redeemBtnText, { fontWeight: '600', color: canClaim ? TEXT : MUTED }]}>
                          {canClaim ? 'Claim' : 'Need more'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {transactions.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={styles.sectionHeader}>
              <Feather name="clock" size={16} color={TEXT} />
              <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>Recent activity</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {transactions.slice(0, 10).map((txn) => (
                <View key={txn.id} style={styles.txnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txnDesc, { fontWeight: '500' }]}>{txn.description}</Text>
                    <Text style={[styles.txnDate, { fontWeight: '400' }]}>
                      {new Date(txn.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={[styles.txnPts, { fontWeight: '700', color: txn.points > 0 ? BRAND : txn.points < 0 ? '#EF4444' : MUTED }]}>
                    {txn.points > 0 ? '+' : ''}{txn.points}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={{ marginTop: 24 }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { fontWeight: '700' }]}>How it works</Text>
          </View>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {HOW_IT_WORKS.map((item) => (
              <View key={item.title} style={styles.howCard}>
                <View style={[styles.howIcon, { backgroundColor: '#EEF2FB' }]}>
                  <Feather name={item.icon as any} size={18} color={BRAND} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.howTitle, { fontWeight: '600' }]}>{item.title}</Text>
                  <Text style={[styles.howDesc, { fontWeight: '400' }]}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
      </ScrollView>
    </>
  );
}
const styles = StyleSheet.create({
  pageHeader: { paddingHorizontal: 20, paddingBottom: 20, gap: 6, backgroundColor: WHITE },
  pageLabel: { fontSize: 12, color: MUTED, letterSpacing: 1 },
  pageTitle: { fontSize: 26, color: TEXT },
  loyaltyCard: { borderRadius: 20, padding: 20, gap: 4 },
  memberLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, letterSpacing: 1 },
  bigPoints: { color: WHITE, fontSize: 52, lineHeight: 60 },
  ptsWorth: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  progressSection: { marginTop: 12, gap: 6 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabelText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: WHITE },
  tierRow: { flexDirection: 'row', marginTop: 16 },
  tierBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  tierBtnActive: { backgroundColor: WHITE },
  tierBtnLabel: { fontSize: 11, letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 20, color: TEXT },
  buyBadge: { marginLeft: 'auto', backgroundColor: '#EEF2FB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  buyBadgeText: { fontSize: 12, color: BRAND },
  coffeeCard: { borderRadius: 20, padding: 20, gap: 4 },
  coffeeCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  coffeeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  coffeeToGo: { color: WHITE, fontSize: 32, lineHeight: 38 },
  coffeeDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  qrBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  qrBtnText: { color: WHITE, fontSize: 12 },
  stampRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stampCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  rewardRowText: { color: 'rgba(255,255,255,0.95)', fontSize: 13 },
  birthdayCard: { backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 4, borderWidth: 1.5, borderColor: BORDER },
  bdSectionLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 2 },
  bdHeading:      { fontSize: 32, lineHeight: 40, marginBottom: 2 },
  bdDesc:         { fontSize: 13, lineHeight: 18, marginTop: 4 },
  bdEditHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EFF0F2' },
  bdEditHintText: { fontSize: 11, color: MUTED, lineHeight: 15, flex: 1 },
  rewardCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER },
  rewardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rewardName: { fontSize: 14, color: TEXT },
  rewardDesc: { fontSize: 12, color: MUTED, lineHeight: 16 },
  rewardPts: { fontSize: 13, marginTop: 2 },
  tierTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tierTagText: { fontSize: 10, color: WHITE, letterSpacing: 0.3 },
  lockedBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  lockedBtnText: { fontSize: 13, color: MUTED },
  redeemBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  redeemBtnText: { fontSize: 13 },
  txnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  txnDesc: { fontSize: 13, color: TEXT },
  txnDate: { fontSize: 11, color: MUTED, marginTop: 2 },
  txnPts: { fontSize: 16 },
  howCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER },
  howIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  howTitle: { fontSize: 14, color: TEXT, marginBottom: 2 },
  howDesc: { fontSize: 12, color: MUTED, lineHeight: 17 },
  birthdayModal: { backgroundColor: WHITE, borderRadius: 24, padding: 28, marginHorizontal: 20 },
  bdRow: { flexDirection: 'row', gap: 10 },
  bdField: { flex: 1 },
  bdLabel: { fontSize: 12, color: MUTED, marginBottom: 6, letterSpacing: 0.5 },
  bdInput: { backgroundColor: '#F5F6FA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center', borderWidth: 1, borderColor: BORDER },
  qrSheetContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  qrModal: {
    alignItems: 'center',
    gap: 10,
  },
  qrTitle: { fontSize: 22, color: '#083B57', fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  qrSub: { fontSize: 13, color: 'rgba(8,59,87,0.76)', textAlign: 'center', lineHeight: 18 },
  qrBox: { padding: 16, backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, marginVertical: 8 },
  qrFallback: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', gap: 10 },
  qrFallbackText: { fontSize: 13, color: '#4B5563', textAlign: 'center' },
  qrCode: { fontSize: 16, color: 'rgba(8,59,87,0.72)', letterSpacing: 2 },
  qrClose: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, width: '100%', alignItems: 'center' },
});
