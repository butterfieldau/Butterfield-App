import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, type LoyaltyReward } from '@/lib/api';

const BG = '#F5F6FA';
const BLUE_CARD = '#40C0F2';
const BLUE_DARK = '#2AA8DC';
const BRAND = '#40C0F2';
const WHITE = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#D0E8F5';

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

const TIERS = [
  { key: 'bronze', label: 'BRONZE', threshold: 0 },
  { key: 'silver', label: 'SILVER', threshold: 1000 },
  { key: 'gold', label: 'GOLD', threshold: 3000 },
];

const HOW_IT_WORKS = [
  { icon: 'coffee', title: 'Earn 1 pt per $1', desc: 'Every dollar you spend earns 1 point automatically.' },
  { icon: 'tag', title: '100 pts = $5 credit', desc: 'Save up your points and redeem them for store credit. No minimum spend.' },
  { icon: 'award', title: 'Climb the tiers', desc: 'Silver at 1,000 pts · Gold at 3,000 pts (lifetime).' },
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

  const currentTier = pts >= 3000 ? TIERS[2] : pts >= 1000 ? TIERS[1] : TIERS[0];
  const nextTier = TIERS.find((t) => t.threshold > pts);
  const ptsToNext = nextTier ? nextTier.threshold - pts : 0;
  const progress = nextTier ? Math.min(pts / nextTier.threshold, 1) : 1;

  const qrValue = `BUTTERFIELD:${user?.id ?? ''}:${profile?.referralCode ?? ''}`;

  const handleRedeem = async (reward: LoyaltyReward) => {
    if (pts < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - pts} more points.`);
      return;
    }
    Alert.alert('Redeem Reward', `Redeem "${reward.name}" for ${reward.pointsCost} points?`, [
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
            Alert.alert('Redeemed! 🎉', `Show "${reward.name}" to the team at Butterfield.`);
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
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQR(false)}>
          <View style={styles.qrModal}>
            <Text style={[styles.qrTitle, { fontFamily: 'Inter_700Bold' }]}>My Butterfield QR</Text>
            <Text style={[styles.qrSub, { fontFamily: 'Inter_400Regular' }]}>Show this to staff to earn stamps</Text>
            <View style={styles.qrBox}>
              <QRCode value={qrValue} size={200} color={TEXT} backgroundColor={WHITE} />
            </View>
            <Text style={[styles.qrCode, { fontFamily: 'Inter_600SemiBold' }]}>{profile?.referralCode ?? user?.name}</Text>
            <Pressable onPress={() => setShowQR(false)} style={[styles.qrClose, { backgroundColor: BRAND }]}>
              <Text style={[{ color: WHITE, fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BRAND} />}
      >
        <View style={[styles.pageHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.pageLabel, { fontFamily: 'Inter_600SemiBold' }]}>REWARDS</Text>
          <Text style={[styles.pageTitle, { fontFamily: 'Inter_700Bold' }]}>Your loyalty card</Text>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={[BLUE_CARD, BLUE_DARK]} style={styles.loyaltyCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={[styles.memberLabel, { fontFamily: 'Inter_600SemiBold' }]}>
              MEMBER · {currentTier.label}
            </Text>
            <Text style={[styles.bigPoints, { fontFamily: 'Inter_700Bold' }]}>{pts.toLocaleString()}</Text>
            <Text style={[styles.ptsWorth, { fontFamily: 'Inter_400Regular' }]}>
              points · worth ${(Math.floor(pts / 100) * 5).toFixed(0)}
            </Text>

            {nextTier && (
              <View style={styles.progressSection}>
                <View style={styles.progressLabels}>
                  <Text style={[styles.progressLabelText, { fontFamily: 'Inter_400Regular' }]}>
                    {ptsToNext.toLocaleString()} pts to {nextTier.label}
                  </Text>
                  <Text style={[styles.progressLabelText, { fontFamily: 'Inter_600SemiBold' }]}>
                    {pts.toLocaleString()} / {nextTier.threshold.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
              </View>
            )}

            <View style={styles.tierRow}>
              {TIERS.map((tier, i) => {
                const active = tier.key === currentTier.key;
                return (
                  <View
                    key={tier.key}
                    style={[styles.tierBtn, active && styles.tierBtnActive, i < TIERS.length - 1 && { marginRight: 8 }]}
                  >
                    <Feather name="award" size={12} color={active ? BRAND : 'rgba(255,255,255,0.6)'} />
                    <Text style={[styles.tierBtnLabel, { fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular', color: active ? BRAND : 'rgba(255,255,255,0.7)' }]}>
                      {tier.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold' }]}>Coffee Club</Text>
          <View style={styles.buyBadge}>
            <Text style={[styles.buyBadgeText, { fontFamily: 'Inter_500Medium' }]}>Buy 5, get 1 free</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <LinearGradient colors={[BLUE_CARD, BLUE_DARK]} style={styles.coffeeCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.coffeeCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.coffeeLabel, { fontFamily: 'Inter_600SemiBold' }]}>COFFEE CLUB</Text>
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
          {profile?.birthday ? (
            // ── Birthday already set: show countdown, no editing here ──────
            (() => {
              const bdInfo = getBirthdayInfo(profile.birthday!);
              return (
                <View style={[
                  styles.birthdayCard,
                  bdInfo.isBirthday && { borderColor: '#F9A8D4', borderStyle: 'solid', backgroundColor: '#FFF0F8' },
                ]}>
                  {/* Emoji + countdown pill row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <View style={[styles.birthdayIcon, {
                      backgroundColor: bdInfo.isBirthday ? '#FCE7F3' : '#EEF2FB',
                      width: 48, height: 48, borderRadius: 14,
                    }]}>
                      <Text style={{ fontSize: 22 }}>{bdInfo.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.birthdayTitle, { fontFamily: 'Inter_700Bold', fontSize: 16,
                        color: bdInfo.isBirthday ? '#BE185D' : TEXT }]}>
                        {bdInfo.message}
                      </Text>
                      {!bdInfo.isBirthday && (
                        <View style={styles.countdownPill}>
                          <Text style={[styles.countdownPillText, { fontFamily: 'Inter_700Bold' }]}>
                            {bdInfo.daysUntil === 1 ? '1 day' : `${bdInfo.daysUntil} days`}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {/* Sub message */}
                  <Text style={[styles.birthdaySub, { fontFamily: 'Inter_400Regular', lineHeight: 18 }]}>
                    {bdInfo.sub}
                  </Text>
                  {/* Hint to edit */}
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
            // ── No birthday set: tap to add ─────────────────────────────────
            <Pressable
              style={styles.birthdayCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/edit-details');
              }}
            >
              <View style={[styles.birthdayIcon, { backgroundColor: '#EEF2FB' }]}>
                <Text style={{ fontSize: 18 }}>🎂</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.birthdayTitle, { fontFamily: 'Inter_600SemiBold' }]}>
                  Add your birthday
                </Text>
                <Text style={[styles.birthdaySub, { fontFamily: 'Inter_400Regular' }]}>
                  Get a free cookie every birthday week — on us!
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={MUTED} />
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
                const isLocked = r.category === 'tier' && !canRedeem;
                return (
                  <View key={r.id} style={styles.rewardCard}>
                    <View style={[styles.rewardIcon, { backgroundColor: '#EEF2FB' }]}>
                      <Feather name={r.category === 'tier' ? 'lock' : 'tag'} size={18} color={BRAND} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.rewardName, { fontFamily: 'Inter_600SemiBold' }]}>{r.name}</Text>
                        {r.category === 'tier' && (
                          <View style={[styles.tierTag, { backgroundColor: '#F59E0B' }]}>
                            <Text style={[styles.tierTagText, { fontFamily: 'Inter_700Bold' }]}>Gold</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.rewardDesc, { fontFamily: 'Inter_400Regular' }]}>{r.description}</Text>
                      <Text style={[styles.rewardPts, { fontFamily: 'Inter_600SemiBold', color: r.category === 'tier' ? MUTED : BRAND }]}>
                        {r.category === 'tier' ? 'Tier perk' : `${r.pointsCost} pts`}
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

  birthdayCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', gap: 0 },
  birthdayIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  birthdayTitle: { fontSize: 15, color: TEXT },
  birthdaySub: { fontSize: 13, color: MUTED, marginTop: 2, lineHeight: 18 },

  countdownPill: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#EEF2FB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  countdownPillText: { fontSize: 11, color: BRAND, letterSpacing: 0.3 },

  bdEditHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFF0F2' },
  bdEditHintText: { fontSize: 11, color: MUTED, lineHeight: 15 },

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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  qrModal: { backgroundColor: WHITE, borderRadius: 24, padding: 28, alignItems: 'center', gap: 10, marginHorizontal: 32, width: 300 },
  qrTitle: { fontSize: 20, color: TEXT },
  qrSub: { fontSize: 13, color: MUTED, textAlign: 'center' },
  qrBox: { padding: 16, backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, marginVertical: 8 },
  qrCode: { fontSize: 16, color: BRAND, letterSpacing: 2 },
  qrClose: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, width: '100%', alignItems: 'center' },
});
