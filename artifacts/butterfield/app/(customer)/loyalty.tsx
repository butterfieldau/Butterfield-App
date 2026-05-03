import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api, type LoyaltyReward } from '@/lib/api';

const TIER_CONFIG: Record<string, { label: string; color: string; next?: string; nextTarget: number; perks: string[] }> = {
  bronze: { label: 'Bronze', color: '#CD7F32', next: 'Silver', nextTarget: 15000, perks: ['1pt per $1 spent', 'Birthday reward', 'App-only offers'] },
  silver: { label: 'Silver', color: '#9CA3AF', next: 'Gold', nextTarget: 50000, perks: ['1.5pts per $1 spent', 'Free cookie monthly', 'Early drop access'] },
  gold: { label: 'Gold', color: '#F59E0B', next: 'Platinum', nextTarget: 100000, perks: ['2pts per $1 spent', 'Free drink monthly', 'VIP events'] },
  platinum: { label: 'Platinum', color: '#8B5CF6', nextTarget: 100000, perks: ['3pts per $1 spent', 'Free weekly treat', 'Private tastings', 'Priority orders'] },
};

export default function LoyaltyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data: profileData, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['loyalty-profile'], queryFn: () => api.loyalty.profile() });
  const { data: rewardsData } = useQuery({ queryKey: ['loyalty-rewards'], queryFn: () => api.loyalty.rewards() });
  const { data: txnData } = useQuery({ queryKey: ['loyalty-transactions'], queryFn: () => api.loyalty.transactions() });

  const profile = profileData?.data;
  const rewards = rewardsData?.data ?? [];
  const transactions = txnData?.data ?? [];
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const tier = profile?.loyaltyTier ?? 'bronze';
  const tierConfig = TIER_CONFIG[tier] ?? TIER_CONFIG.bronze;
  const progress = tier !== 'platinum' ? Math.min(profile?.totalSpentCents ?? 0, tierConfig.nextTarget) / tierConfig.nextTarget : 1;

  const handleRedeem = async (reward: LoyaltyReward) => {
    if ((profile?.loyaltyPoints ?? 0) < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - (profile?.loyaltyPoints ?? 0)} more points.`);
      return;
    }
    Alert.alert('Redeem Reward', `Redeem "${reward.name}" for ${reward.pointsCost} points?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Redeem', onPress: async () => {
        setRedeeming(reward.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
          await api.loyalty.redeem(reward.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
          qc.invalidateQueries({ queryKey: ['loyalty-transactions'] });
          Alert.alert('Redeemed!', `Show "${reward.name}" to the team at Butterfield.`);
        } catch (e: any) { Alert.alert('Error', e.message); } finally { setRedeeming(null); }
      }},
    ]);
  };

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
      <LinearGradient colors={[tierConfig.color, '#4A2410']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[styles.headerLabel, { fontFamily: 'Inter_400Regular' }]}>Your Loyalty</Text>
        <Text style={[styles.points, { fontFamily: 'Inter_700Bold' }]}>{profile?.loyaltyPoints ?? 0}<Text style={styles.pointsLabel}> pts</Text></Text>
        <View style={[styles.tierBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Feather name="award" size={14} color="#fff" />
          <Text style={[styles.tierLabel, { fontFamily: 'Inter_600SemiBold' }]}>{tierConfig.label} Member</Text>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 24 }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Tier Progress</Text>
            {tierConfig.next && <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>Next: {tierConfig.next}</Text>}
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tierConfig.color }]} />
          </View>
          {tier !== 'platinum' && <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>${((profile?.totalSpentCents ?? 0) / 100).toFixed(0)} of ${(tierConfig.nextTarget / 100).toFixed(0)} spent</Text>}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Stamp Card — {profile?.stampCount ?? 0}/10</Text>
          <View style={styles.stampGrid}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={[styles.stamp, { backgroundColor: i < (profile?.stampCount ?? 0) ? colors.primary : colors.muted, borderRadius: 10 }]}>
                {i < (profile?.stampCount ?? 0) ? <Feather name="coffee" size={14} color="#fff" /> : <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{i + 1}</Text>}
              </View>
            ))}
          </View>
          <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>Complete your card for a free coffee!</Text>
        </View>

        {profile?.referralCode && (
          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Referral Code</Text>
            <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>Share & both earn 100 bonus points</Text>
            <View style={[styles.refCode, { backgroundColor: colors.muted, borderRadius: 12 }]}>
              <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 3 }]}>{profile.referralCode}</Text>
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }]}>{tierConfig.label} Perks</Text>
          {tierConfig.perks.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
              <View style={[styles.perkDot, { backgroundColor: tierConfig.color }]} />
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 }]}>{p}</Text>
            </View>
          ))}
        </View>

        {rewards.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 12 }]}>Redeem Rewards</Text>
            {rewards.map((r) => (
              <View key={r.id} style={[styles.rewardCard, { backgroundColor: colors.card, borderRadius: colors.radius, marginBottom: 10 }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }]}>{r.name}</Text>
                    {r.isAppOnly && <View style={[styles.appOnlyBadge, { backgroundColor: colors.primary }]}><Text style={styles.appOnlyText}>APP ONLY</Text></View>}
                  </View>
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>{r.description}</Text>
                  <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>{r.pointsCost} pts</Text>
                </View>
                <Pressable onPress={() => handleRedeem(r)} disabled={redeeming === r.id}
                  style={[styles.redeemBtn, { backgroundColor: (profile?.loyaltyPoints ?? 0) >= r.pointsCost ? colors.primary : colors.muted, borderRadius: 12 }]}>
                  {redeeming === r.id ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: (profile?.loyaltyPoints ?? 0) >= r.pointsCost ? '#fff' : colors.mutedForeground }]}>
                      {(profile?.loyaltyPoints ?? 0) >= r.pointsCost ? 'Redeem' : 'Need more'}
                    </Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {transactions.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 12 }]}>History</Text>
            {transactions.slice(0, 15).map((txn) => (
              <View key={txn.id} style={[styles.txnRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.txnIcon, { backgroundColor: txn.type === 'earn' ? '#E6F4EC' : '#FEF3C7' }]}>
                  <Feather name={txn.type === 'earn' ? 'plus-circle' : 'minus-circle'} size={16} color={txn.type === 'earn' ? '#16A34A' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 13 }]}>{txn.description}</Text>
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 }]}>{new Date(txn.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <Text style={[{ color: txn.type === 'earn' ? '#16A34A' : '#D97706', fontFamily: 'Inter_700Bold', fontSize: 15 }]}>{txn.type === 'earn' ? '+' : ''}{txn.points}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, gap: 8 },
  headerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, letterSpacing: 1 },
  points: { color: '#fff', fontSize: 52, lineHeight: 58 },
  pointsLabel: { fontSize: 22 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  tierLabel: { color: '#fff', fontSize: 13 },
  card: { padding: 18, gap: 10 },
  cardTitle: { fontSize: 15 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stamp: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  refCode: { padding: 14, alignItems: 'center' },
  perkDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 20 },
  rewardCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  appOnlyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  appOnlyText: { color: '#fff', fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  redeemBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
