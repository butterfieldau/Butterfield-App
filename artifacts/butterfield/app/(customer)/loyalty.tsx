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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, type LoyaltyReward } from '@/lib/api';
import { TIERS_ORDERED, getTierConfig, getNextTierBySpend } from '@/constants/tierConfig';
import { SwipeDownSheet } from '@/components/SwipeDownSheet';

const BG        = '#F5F6FA';
const BLUE_CARD = '#40C0F2';
const BLUE_DARK = '#2AA8DC';
const BRAND     = '#40C0F2';
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
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showQR, setShowQR] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const { data: profileData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
  });
  const { data: rewardsData } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.loyalty.rewards(),
  });
  const { data: txnData } = useQuery({
    queryKey: ['loyalty-transactions'],
    queryFn: () => api.loyalty.transactions(),
  });

  const profile = profileData?.data;
  const rewards = rewardsData?.data ?? [];
  const transactions = txnData?.data ?? [];

  const pts = profile?.loyaltyPoints ?? 0;
  const stamps = Math.min(profile?.stampCount ?? 0, STAMP_COUNT);
  const stampsLeft = Math.max(0, STAMP_COUNT - stamps);

  // Use the server-stored tier as the single source of truth (spend-based, never decreases).
  const totalSpentCents = (profile as any)?.totalSpentCents ?? 0;
  const currentTier = getTierConfig(profile?.loyaltyTier ?? 'bronze');
  const nextTier    = getNextTierBySpend(totalSpentCents);
  const spentToNext = nextTier ? nextTier.spendThreshold - totalSpentCents : 0;
  const progress    = nextTier ? Math.min(totalSpentCents / nextTier.spendThreshold, 1) : 1;

  const qrValue = `BUTTERFIELD:${user?.id ?? ''}:${profile?.referralCode ?? ''}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrValue || 'BUTTERFIELD:loading')}`;

  const handleRedeem = async (reward: LoyaltyReward) => {
    if (pts < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - pts} more points.`);
      return;
    }
    Alert.alert('Redeem Reward', `Redeem "${reward.title}" for ${reward.pointsCost} points?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redeem', onPress: async () => {
          setRedeeming(reward.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await api.loyalty.redeem(reward.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
            qc.invalidateQueries({ queryKey: ['loyalty-transactions'] });
            Alert.alert('Redeemed! 🎉', `Show "${reward.title}" to the team at Butterfield.`);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setRedeeming(null);
          }
        },
      },
    ]);
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
      <SwipeDownSheet
      visible={showQR}
      onClose={() => setShowQR(false)}
      backdropOpacity={0.52}
      sheetHeight={470}
      sheetStyle={styles.qrSheet}
      contentStyle={styles.qrSheetContent}
    >
        <View style={styles.qrModal}>
          <Text style={[styles.qrTitle, { fontFamily: 'Inter_700Bold' }]}>My Butterfield QR</Text>
          <Text style={[styles.qrSub, { fontFamily: 'Inter_400Regular' }]}>Show this to staff to earn stamps</Text>
          <View style={styles.qrBox}>
            <Image source={{ uri: qrImageUrl }} style={{ width: 200, height: 200, backgroundColor: WHITE }} contentFit="contain" />
          </View>
          <Text style={[styles.qrCode, { fontFamily: 'Inter_600SemiBold' }]}>{profile?.referralCode ?? user?.name}</Text>
          <Pressable onPress={() => setShowQR(false)} style={[styles.qrClose, { backgroundColor: BRAND }]}>
            <Text style={[{ color: WHITE, fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Close</Text>
          </Pressable>
        </View>
      </SwipeDownSheet>

      <ScrollView
        style={{ flex: 1, backgroundColor: WHITE }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BRAND} />}
      >
        <View style={[styles.pageHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.pageLabel, { fontFamily: 'Inter_600SemiBold' }]}>REWARDS</Text>
          <Text style={[styles.pageTitle, { fontFamily: 'Inter_700Bold' }]}>Your loyalty card</Text>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={currentTier.gradient} style={styles.loyaltyCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={[styles.memberLabel, { fontFamily: 'Inter_600SemiBold' }]}>
              MEMBER · {currentTier.label.toUpperCase()}
            </Text>
            <Text style={[styles.bigPoints, { fontFamily: 'Inter_700Bold' }]}>{pts.toLocaleString()}</Text>
            <Text style={[styles.ptsWorth, { fontFamily: 'Inter_400Regular' }]}>
              points · worth ${(Math.floor(pts / 100) * 5).toFixed(0)}
            </Text>

            {nextTier && (
              <View style={styles.progressSection}>
                <View style={styles.progressLabels}>
                  <Text style={[styles.progressLabelText, { fontFamily: 'Inter_400Regular' }]}>
                    ${(spentToNext / 100).toFixed(0)} to go for {nextTier.label}
                  </Text>
                  <Text style={[styles.progressLabelText, { fontFamily: 'Inter_600SemiBold' }]}>
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
                    <Text style={[styles.tierBtnLabel, { fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular', color: active ? '#fff' : 'rgba(255,255,255,0.5)' }]}>
                      {tier.label.toUpperCase()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold' }]}>Rewards Club</Text>
          <View style={styles.buyBadge}>
            <Text style={[styles.buyBadgeText, { fontFamily: 'Inter_500Medium' }]}>Buy 5, get 1 free</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={[BLUE_CARD, BLUE_DARK]} style={styles.coffeeCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.coffeeCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.coffeeLabel, { fontFamily: 'Inter_600SemiBold' }]}>REWARDS CLUB</Text>
                <Text style={[styles.coffeeToGo, { fontFamily: 'Inter_700Bold' }]}>
                  {stampsLeft > 0 ? `${stampsLeft} to go` : '🎉 Free coffee!'}
                </Text>
                <Text style={[styles.coffeeDesc, { fontFamily: 'Inter_400Regular' }]}>
                  Earn {STAMP_COUNT} stamps to unlock your free coffee.
                </Text>
              </View>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQR(true); }} style={styles.qrBtn}>
                <Feather name="maximize" size={12} color={WHITE} />
                <Text style={[styles.qrBtnText, { fontFamily: 'Inter_600SemiBold' }]}>My QR</Text>
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
                  <Text style={[styles.bdSectionLabel, { fontFamily: 'Inter_600SemiBold',
                    color: isBd ? '#E879A0' : MUTED }]}>
                    BIRTHDAY
                  </Text>
                  <Text style={[styles.bdHeading, { fontFamily: 'Inter_700Bold',
                    color: isBd ? '#BE185D' : TEXT }]}>
                    {bdInfo.emoji} {bdInfo.message}
                  </Text>
                  <Text style={[styles.bdDesc, { fontFamily: 'Inter_400Regular',
                    color: isBd ? '#9D174D' : MUTED }]}>
                    {bdInfo.sub}
                  </Text>
                  <View style={styles.bdEditHint}>
                    <Feather name="settings" size={11} color={MUTED} />
                    <Text style={[styles.bdEditHintText, { fontFamily: 'Inter_400Regular' }]}>
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
              <Text style={[styles.bdSectionLabel, { fontFamily: 'Inter_600SemiBold', color: MUTED }]}>
                BIRTHDAY
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.bdHeading, { fontFamily: 'Inter_700Bold', color: TEXT, flex: 1 }]}>
                  🎂 Add your birthday
                </Text>
                <Feather name="chevron-right" size={20} color={MUTED} />
              </View>
              <Text style={[styles.bdDesc, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
                Get a free cookie every birthday week — on us!
              </Text>
            </Pressable>
          )}
        </View>

        {rewards.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold' }]}>Redeem rewards</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {rewards.map((r) => {
                const canRedeem = pts >= r.pointsCost;
                const isLocked = r.type === 'tier' && !canRedeem;
                return (
                  <View key={r.id} style={styles.rewardCard}>
                    <View style={[styles.rewardIcon, { backgroundColor: '#EEF2FB' }]}>
                      <Feather name={r.type === 'tier' ? 'lock' : 'tag'} size={18} color={BRAND} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.rewardName, { fontFamily: 'Inter_600SemiBold' }]}>{r.title}</Text>
                        {r.type === 'tier' && (
                          <View style={[styles.tierTag, { backgroundColor: '#F59E0B' }]}>
                            <Text style={[styles.tierTagText, { fontFamily: 'Inter_700Bold' }]}>Gold</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.rewardDesc, { fontFamily: 'Inter_400Regular' }]}>{r.description}</Text>
                      <Text style={[styles.rewardPts, { fontFamily: 'Inter_600SemiBold', color: r.type === 'tier' ? MUTED : BRAND }]}>
                        {r.type === 'tier' ? 'Tier perk' : `${r.pointsCost} pts`}
                      </Text>
                    </View>
                    {isLocked ? (
                      <View style={[styles.lockedBtn, { backgroundColor: '#F0F0F0' }]}>
                        <Text style={[styles.lockedBtnText, { fontFamily: 'Inter_500Medium' }]}>Locked</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleRedeem(r)}
                        disabled={redeeming === r.id || !canRedeem}
                        style={[styles.redeemBtn, { backgroundColor: canRedeem ? WHITE : '#F0F0F0', borderColor: canRedeem ? BORDER : 'transparent', borderWidth: 1 }]}
                      >
                        {redeeming === r.id ? (
                          <ActivityIndicator size="small" color={BRAND} />
                        ) : (
                          <Text style={[styles.redeemBtnText, { fontFamily: 'Inter_600SemiBold', color: canRedeem ? TEXT : MUTED }]}>
                            {canRedeem ? 'Redeem' : 'Need more'}
                          </Text>
                        )}
                      </Pressable>
                    )}
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
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold' }]}>Recent activity</Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {transactions.slice(0, 10).map((txn) => (
                <View key={txn.id} style={styles.txnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txnDesc, { fontFamily: 'Inter_500Medium' }]}>{txn.description}</Text>
                    <Text style={[styles.txnDate, { fontFamily: 'Inter_400Regular' }]}>
                      {new Date(txn.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={[styles.txnPts, { fontFamily: 'Inter_700Bold', color: txn.type === 'earn' ? BRAND : '#EF4444' }]}>
                    {txn.type === 'earn' ? '+' : ''}{txn.points}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold' }]}>How it works</Text>
          </View>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {HOW_IT_WORKS.map((item) => (
              <View key={item.title} style={styles.howCard}>
                <View style={[styles.howIcon, { backgroundColor: '#EEF2FB' }]}>
                  <Feather name={item.icon as any} size={18} color={BRAND} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.howTitle, { fontFamily: 'Inter_600SemiBold' }]}>{item.title}</Text>
                  <Text style={[styles.howDesc, { fontFamily: 'Inter_400Regular' }]}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  pageHeader: { paddingHorizontal: 20, paddingBottom: 16, gap: 4, backgroundColor: WHITE },
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
  sectionTitle: { fontSize: 18, color: TEXT },
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

  qrSheet: { backgroundColor: WHITE },
  qrSheetContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 20 },
  qrModal: { backgroundColor: WHITE, borderRadius: 24, padding: 28, alignItems: 'center', gap: 10, marginHorizontal: 32, width: 300 },
  qrTitle: { fontSize: 20, color: TEXT },
  qrSub: { fontSize: 13, color: MUTED, textAlign: 'center' },
  qrBox: { padding: 16, backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, marginVertical: 8 },
  qrCode: { fontSize: 16, color: BRAND, letterSpacing: 2 },
  qrClose: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, width: '100%', alignItems: 'center' },
});
