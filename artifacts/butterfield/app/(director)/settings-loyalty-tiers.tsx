import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { TIER_CONFIG, TIERS_ORDERED, type TierKey } from '@/constants/tierConfig';

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const GREEN = '#22C55E';
const BLACK_ACCENT = '#0F172A';

const TIER_BENEFITS: Record<TierKey, string[]> = {
  blue: [
    'Base tier entry experience',
    'Birthday reward eligibility',
    'App-only member offers',
    'Standard points earning',
  ],
  silver: [
    'Everything in Blue',
    'Higher-value monthly rewards',
    'Earlier drop access',
    'Stronger loyalty reward settings',
  ],
  gold: [
    'Everything in Silver',
    'Priority member treatment',
    'Richer ongoing benefits',
    'Premium reward unlocks',
  ],
  black: [
    'Everything in Gold',
    'Top-tier exclusive benefits',
    'Best reward settings',
    'Highest-value member treatment',
  ],
};

function formatSpend(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU')}`;
}

function TierCard({ tier }: { tier: (typeof TIERS_ORDERED)[number] }) {
  const benefits = TIER_BENEFITS[tier.key];
  const upgradeCopy =
    tier.key === 'blue'
      ? 'Base member tier. Customers enter here and upgrade automatically as spend grows.'
      : `Customers upgrade into ${tier.label} automatically once lifetime spend reaches ${formatSpend(tier.spendThreshold)}.`;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.swatch, { backgroundColor: tier.gradient[0] }]}>
          <View style={[styles.swatchInner, { backgroundColor: tier.gradient[1] }]} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.tierTitleRow}>
            <Text style={styles.tierName}>{tier.label}</Text>
            <View style={[styles.thresholdPill, { backgroundColor: tier.key === 'black' ? BLACK_ACCENT + '14' : tier.accent + '22' }]}>
              <Text style={[styles.thresholdText, { color: tier.key === 'black' ? BLACK_ACCENT : tier.key === 'silver' ? '#374151' : tier.key === 'gold' ? '#92400E' : BLUE }]}>
                Spend {formatSpend(tier.spendThreshold)}
              </Text>
            </View>
          </View>
          <Text style={styles.tierSub}>{upgradeCopy}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tier design</Text>
        <View style={styles.designRow}>
          {tier.gradient.map((color, idx) => (
            <View key={idx} style={[styles.designChip, { backgroundColor: color }]} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tier benefits</Text>
        <View style={{ gap: 8 }}>
          {benefits.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Feather name="check-circle" size={15} color={GREEN} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Reward settings</Text>
          <Text style={styles.detailValue}>Tier-based perks & redemptions</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Upgrade logic</Text>
          <Text style={styles.detailValue}>Automatic by lifetime spend</Text>
        </View>
      </View>
    </View>
  );
}

export default function DirectorLoyaltyTiersPage() {
  return (
    <DirectorStandaloneScreen
      title="Loyalty Tiers"
      subtitle="Blue, Silver, Gold and Black tier setup"
    >
      <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Tier setup only</Text>
          <Text style={styles.introText}>
            This screen is for loyalty tier names, spend thresholds, tier colours/design, tier benefits,
            reward settings and customer upgrade logic. Reward items and vouchers belong in Reward Catalogue.
          </Text>
        </View>

        {TIERS_ORDERED.map((tier) => (
          <TierCard key={tier.key} tier={tier} />
        ))}
      </ScrollView>
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 36 },
  introCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 6,
  },
  introTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  introText: { fontSize: 13, lineHeight: 19, color: MUTED },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
  },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchInner: { width: 28, height: 28, borderRadius: 10, opacity: 0.9 },
  tierTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tierName: { fontSize: 20, fontWeight: '700', color: TEXT },
  thresholdPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  thresholdText: { fontSize: 12, fontWeight: '700' },
  tierSub: { marginTop: 4, fontSize: 13, lineHeight: 18, color: MUTED },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 1.1, textTransform: 'uppercase' },
  designRow: { flexDirection: 'row', gap: 8 },
  designChip: { width: 42, height: 24, borderRadius: 999 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { flex: 1, fontSize: 13, color: TEXT },
  detailGrid: { flexDirection: 'row', gap: 10 },
  detailItem: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 5,
  },
  detailLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.9 },
  detailValue: { fontSize: 13, fontWeight: '600', color: TEXT, lineHeight: 18 },
});
