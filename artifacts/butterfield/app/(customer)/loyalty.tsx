import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { MOCK_LOYALTY_TRANSACTIONS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';

const TIERS = [
  { name: 'Bronze', min: 0, max: 499, color: '#CD7F32' },
  { name: 'Silver', min: 500, max: 1499, color: '#A8A8A8' },
  { name: 'Gold', min: 1500, max: 2999, color: '#C8A830' },
  { name: 'Platinum', min: 3000, max: Infinity, color: '#8B6FE0' },
];

const REWARDS = [
  { id: 'r1', name: 'Free Flat White', points: 150, icon: 'coffee' },
  { id: 'r2', name: 'Free Cookie', points: 100, icon: 'gift' },
  { id: 'r3', name: 'Free Dessert', points: 250, icon: 'heart' },
  { id: 'r4', name: '$10 Voucher', points: 400, icon: 'tag' },
  { id: 'r5', name: 'Cookie Dozen', points: 800, icon: 'package' },
];

export default function LoyaltyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const points = user?.loyaltyPoints ?? 0;

  const currentTier = TIERS.find((t) => points >= t.min && points <= t.max) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const progressPercent = nextTier
    ? ((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100
    : 100;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {/* Header */}
          <LinearGradient
            colors={[currentTier.color, '#8B4513']}
            style={[styles.hero, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={[styles.tierLabel, { fontFamily: 'Inter_500Medium' }]}>YOUR TIER</Text>
            <Text style={[styles.tierName, { fontFamily: 'Inter_700Bold' }]}>{currentTier.name} Member</Text>
            <Text style={[styles.pointsValue, { fontFamily: 'Inter_700Bold' }]}>
              {points.toLocaleString()}
            </Text>
            <Text style={[styles.pointsLabel, { fontFamily: 'Inter_400Regular' }]}>loyalty points</Text>

            {nextTier && (
              <View style={styles.progressSection}>
                <Text style={[styles.progressLabel, { fontFamily: 'Inter_400Regular' }]}>
                  {nextTier.min - points} points to {nextTier.name}
                </Text>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(progressPercent, 100)}%` }]} />
                </View>
              </View>
            )}
          </LinearGradient>

          {/* All tiers */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Membership Tiers
            </Text>
            <View style={styles.tiersRow}>
              {TIERS.map((tier) => {
                const isActive = tier.name === currentTier.name;
                return (
                  <View
                    key={tier.name}
                    style={[
                      styles.tierCard,
                      {
                        backgroundColor: isActive ? tier.color : colors.card,
                        borderRadius: colors.radius / 2,
                        borderWidth: isActive ? 0 : 1,
                        borderColor: colors.border,
                        opacity: isActive ? 1 : 0.6,
                      },
                    ]}
                  >
                    <Text style={[styles.tierCardName, { color: isActive ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      {tier.name}
                    </Text>
                    <Text style={[styles.tierCardMin, { color: isActive ? 'rgba(255,255,255,0.8)' : colors.mutedForeground }]}>
                      {tier.min === 0 ? '0+' : `${tier.min.toLocaleString()}+`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Rewards */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Redeem Rewards
            </Text>
            <View style={styles.rewardsGrid}>
              {REWARDS.map((reward) => {
                const canRedeem = points >= reward.points;
                return (
                  <View
                    key={reward.id}
                    style={[
                      styles.rewardCard,
                      {
                        backgroundColor: colors.card,
                        borderRadius: colors.radius,
                        borderColor: canRedeem ? colors.primary : colors.border,
                        borderWidth: canRedeem ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.rewardIcon,
                        { backgroundColor: canRedeem ? '#FEF3C7' : colors.muted },
                      ]}
                    >
                      <Feather name={reward.icon as any} size={20} color={canRedeem ? '#C8833A' : colors.mutedForeground} />
                    </View>
                    <Text style={[styles.rewardName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>
                      {reward.name}
                    </Text>
                    <Text style={[styles.rewardPoints, { color: canRedeem ? colors.primary : colors.mutedForeground }]}>
                      {reward.points} pts
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* History header */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', marginHorizontal: 20, marginBottom: 4 }]}>
            History
          </Text>
        </>
      }
      data={MOCK_LOYALTY_TRANSACTIONS}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <View style={[styles.transaction, { borderBottomColor: colors.border }]}>
          <View
            style={[
              styles.txIcon,
              { backgroundColor: item.type === 'earn' ? '#D1FAE5' : '#FEE2E2' },
            ]}
          >
            <Feather
              name={item.type === 'earn' ? 'arrow-down' : 'arrow-up'}
              size={14}
              color={item.type === 'earn' ? '#065F46' : '#991B1B'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txDesc, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
              {item.description}
            </Text>
            <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{item.date}</Text>
          </View>
          <Text
            style={[
              styles.txPoints,
              {
                color: item.type === 'earn' ? '#065F46' : '#991B1B',
                fontFamily: 'Inter_700Bold',
              },
            ]}
          >
            {item.points > 0 ? '+' : ''}{item.points} pts
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 6,
  },
  tierLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  tierName: {
    color: '#fff',
    fontSize: 20,
  },
  pointsValue: {
    color: '#fff',
    fontSize: 48,
    marginTop: 8,
    lineHeight: 54,
  },
  pointsLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  progressSection: {
    marginTop: 16,
    gap: 8,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  progressBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  section: {
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
  },
  tiersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tierCard: {
    flex: 1,
    padding: 12,
    gap: 4,
    alignItems: 'center',
  },
  tierCardName: {
    fontSize: 12,
  },
  tierCardMin: {
    fontSize: 10,
  },
  rewardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rewardCard: {
    width: '47%',
    padding: 14,
    gap: 8,
    shadowColor: '#4A2410',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardName: {
    fontSize: 13,
    lineHeight: 18,
  },
  rewardPoints: {
    fontSize: 13,
    fontWeight: '700',
  },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDesc: {
    fontSize: 14,
    marginBottom: 2,
  },
  txDate: {
    fontSize: 12,
  },
  txPoints: {
    fontSize: 14,
  },
});
