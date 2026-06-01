import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { api, type LoyaltyTierKey, type LoyaltyTierSetting, type LoyaltyTierSettings } from '@/lib/api';

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const TIER_ORDER: LoyaltyTierKey[] = ['blue', 'silver', 'gold', 'black'];

type EditableTierState = LoyaltyTierSetting & {
  spendThresholdDollars: string;
  benefitsText: string;
};

function toEditableState(settings: LoyaltyTierSettings): Record<LoyaltyTierKey, EditableTierState> {
  return {
    blue: {
      ...settings.blue,
      spendThresholdDollars: String(Math.round(settings.blue.spendThresholdCents / 100)),
      benefitsText: settings.blue.benefits.join('\n'),
    },
    silver: {
      ...settings.silver,
      spendThresholdDollars: String(Math.round(settings.silver.spendThresholdCents / 100)),
      benefitsText: settings.silver.benefits.join('\n'),
    },
    gold: {
      ...settings.gold,
      spendThresholdDollars: String(Math.round(settings.gold.spendThresholdCents / 100)),
      benefitsText: settings.gold.benefits.join('\n'),
    },
    black: {
      ...settings.black,
      spendThresholdDollars: String(Math.round(settings.black.spendThresholdCents / 100)),
      benefitsText: settings.black.benefits.join('\n'),
    },
  };
}

function parseDollarInput(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function buildPayload(state: Record<LoyaltyTierKey, EditableTierState>): LoyaltyTierSettings | null {
  const payload = {} as LoyaltyTierSettings;

  for (const key of TIER_ORDER) {
    const tier = state[key];
    const threshold = parseDollarInput(tier.spendThresholdDollars);
    if (threshold === null) return null;
    payload[key] = {
      key,
      label: tier.label.trim() || tier.key[0].toUpperCase() + tier.key.slice(1),
      spendThresholdCents: threshold,
      gradient: [tier.gradient[0].trim() || '#1493FF', tier.gradient[1].trim() || '#0C63D8'],
      accent: tier.accent.trim() || '#1493FF',
      progressColor: tier.progressColor.trim() || '#7FD3FF',
      benefits: tier.benefitsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      rewardSettings: tier.rewardSettings.trim(),
    };
  }

  if (
    payload.silver.spendThresholdCents < payload.blue.spendThresholdCents ||
    payload.gold.spendThresholdCents < payload.silver.spendThresholdCents ||
    payload.black.spendThresholdCents < payload.gold.spendThresholdCents
  ) {
    return null;
  }

  return payload;
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU')}`;
}

function TierEditor({
  tier,
  onChange,
}: {
  tier: EditableTierState;
  onChange: (patch: Partial<EditableTierState>) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.tierTitle}>{tier.label}</Text>
          <Text style={styles.tierHint}>
            {tier.key === 'blue'
              ? 'Base member tier. The spend figure here is the visible Blue milestone.'
              : `Customers auto-upgrade to ${tier.label} when lifetime spend reaches ${formatCurrency(tier.spendThresholdCents)}.`}
          </Text>
        </View>
        <View style={styles.swatchRow}>
          <View style={[styles.swatch, { backgroundColor: tier.gradient[0] }]} />
          <View style={[styles.swatch, { backgroundColor: tier.gradient[1] }]} />
        </View>
      </View>

      <View style={styles.fieldGrid}>
        <View style={styles.field}>
          <Text style={styles.label}>Tier name</Text>
          <TextInput
            value={tier.label}
            onChangeText={(label) => onChange({ label })}
            style={styles.input}
            placeholder="Tier name"
            placeholderTextColor={MUTED}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Spend threshold (AUD)</Text>
          <TextInput
            value={tier.spendThresholdDollars}
            onChangeText={(spendThresholdDollars) => onChange({ spendThresholdDollars })}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      <View style={styles.fieldGrid}>
        <View style={styles.field}>
          <Text style={styles.label}>Gradient start</Text>
          <TextInput
            value={tier.gradient[0]}
            onChangeText={(value) => onChange({ gradient: [value, tier.gradient[1]] as [string, string] })}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="#1493FF"
            placeholderTextColor={MUTED}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Gradient end</Text>
          <TextInput
            value={tier.gradient[1]}
            onChangeText={(value) => onChange({ gradient: [tier.gradient[0], value] as [string, string] })}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="#0C63D8"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      <View style={styles.fieldGrid}>
        <View style={styles.field}>
          <Text style={styles.label}>Accent colour</Text>
          <TextInput
            value={tier.accent}
            onChangeText={(accent) => onChange({ accent })}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="#1493FF"
            placeholderTextColor={MUTED}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Progress colour</Text>
          <TextInput
            value={tier.progressColor}
            onChangeText={(progressColor) => onChange({ progressColor })}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="#7FD3FF"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Tier benefits</Text>
        <TextInput
          value={tier.benefitsText}
          onChangeText={(benefitsText) => onChange({ benefitsText })}
          style={[styles.input, styles.textarea]}
          multiline
          textAlignVertical="top"
          placeholder="One benefit per line"
          placeholderTextColor={MUTED}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Tier reward settings</Text>
        <TextInput
          value={tier.rewardSettings}
          onChangeText={(rewardSettings) => onChange({ rewardSettings })}
          style={[styles.input, styles.textareaSmall]}
          multiline
          textAlignVertical="top"
          placeholder="Describe the reward setup for this tier"
          placeholderTextColor={MUTED}
        />
      </View>
    </View>
  );
}

export default function DirectorLoyaltyTiersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-loyalty-tier-settings'],
    queryFn: () => api.director.loyaltyTierSettings(),
  });

  const [draft, setDraft] = useState<Record<LoyaltyTierKey, EditableTierState> | null>(null);

  useEffect(() => {
    if (data?.data) setDraft(toEditableState(data.data));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings: LoyaltyTierSettings) => api.director.updateLoyaltyTierSettings(settings),
    onSuccess: (res) => {
      qc.setQueryData(['director-loyalty-tier-settings'], res);
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      Alert.alert('Saved', 'Loyalty tier settings have been updated.');
    },
    onError: (error: any) => {
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
    },
  });

  const canSave = useMemo(() => {
    if (!draft) return false;
    return buildPayload(draft) !== null;
  }, [draft]);

  const handleSave = () => {
    if (!draft) return;
    const payload = buildPayload(draft);
    if (!payload) {
      Alert.alert(
        'Check tier thresholds',
        'Please keep the tier thresholds in order so Blue is lowest, then Silver, Gold, and Black.',
      );
      return;
    }
    mutation.mutate(payload);
  };

  return (
    <DirectorStandaloneScreen
      title="Loyalty Tiers"
      subtitle="Tier names, thresholds, design, benefits and upgrade rules"
    >
      <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Tier setup only</Text>
          <Text style={styles.introText}>
            Use this screen to manage Blue, Silver, Gold and Black tier names, spend thresholds, colours,
            benefits and reward notes. Reward items and vouchers stay in Reward Catalogue.
          </Text>
        </View>

        <View style={styles.logicCard}>
          <Feather name="trending-up" size={18} color={BLUE} />
          <View style={{ flex: 1 }}>
            <Text style={styles.logicTitle}>Customer upgrade logic</Text>
            <Text style={styles.logicText}>
              Customers move up automatically based on lifetime spend. Blue stays the base member tier,
              then Silver, Gold and Black unlock in that order as thresholds are reached.
            </Text>
          </View>
        </View>

        {isLoading || !draft ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading tier settings…</Text>
          </View>
        ) : (
          TIER_ORDER.map((key) => (
            <TierEditor
              key={key}
              tier={draft[key]}
              onChange={(patch) => setDraft((current) => current ? ({ ...current, [key]: { ...current[key], ...patch } }) : current)}
            />
          ))
        )}

        <Pressable
          onPress={handleSave}
          disabled={!canSave || mutation.isPending}
          style={[styles.saveButton, (!canSave || mutation.isPending) && styles.saveButtonDisabled]}
        >
          <Feather name="save" size={18} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>{mutation.isPending ? 'Saving…' : 'Save Loyalty Tiers'}</Text>
        </Pressable>
      </ScrollView>
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
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
  logicCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  logicTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  logicText: { marginTop: 4, fontSize: 13, lineHeight: 18, color: '#475569' },
  loadingCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: 'center',
  },
  loadingText: { fontSize: 14, color: MUTED, fontWeight: '600' },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerTextWrap: { flex: 1 },
  tierTitle: { fontSize: 20, fontWeight: '700', color: TEXT },
  tierHint: { marginTop: 4, fontSize: 13, lineHeight: 18, color: MUTED },
  swatchRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: BORDER },
  fieldGrid: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.7, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FBFDFF',
    color: TEXT,
    fontSize: 15,
  },
  textarea: { minHeight: 112 },
  textareaSmall: { minHeight: 84 },
  saveButton: {
    marginTop: 4,
    backgroundColor: BLUE,
    borderRadius: 16,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  saveButtonDisabled: { backgroundColor: '#93C5FD' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
