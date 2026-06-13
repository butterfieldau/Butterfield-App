import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';
const LIGHT_BLUE = '#E6F0FF';
const GREEN  = '#22C55E';

function CardBrandIcon({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  let color = MUTED;
  let label = brand.toUpperCase();
  if (b === 'visa') { color = '#1A1F71'; label = 'VISA'; }
  else if (b === 'mastercard') { color = '#EB001B'; label = 'MC'; }
  else if (b === 'amex') { color = '#007BC1'; label = 'AMEX'; }
  else if (b === 'discover') { color = '#FF6600'; label = 'DISC'; }
  else if (b === 'unionpay') { color = '#C0392B'; label = 'UP'; }

  return (
    <View style={[st.brandBadge, { borderColor: color + '33', backgroundColor: color + '10' }]}>
      <Text style={[st.brandText, { color }]}>{label}</Text>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={[st.card, { backgroundColor: '#F3F4F6' }]}>
      <View style={[st.brandBadge, { backgroundColor: '#E5E7EB', borderColor: '#D1D5DB', width: 56 }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 14, width: '60%', backgroundColor: '#E5E7EB', borderRadius: 4 }} />
        <View style={{ height: 11, width: '40%', backgroundColor: '#E5E7EB', borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [actionId, setActionId] = useState<string | null>(null);

  const {
    data: methodsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.payment.methods(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const methods = methodsData?.data ?? [];

  const handleSetDefault = async (id: string) => {
    Haptics.selectionAsync();
    setActionId(id);
    try {
      await api.payment.setDefaultMethod(id);
      await qc.invalidateQueries({ queryKey: ['payment-methods'] });
    } catch {
      Alert.alert('Error', 'Could not set default card. Please try again.');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = (id: string, last4: string) => {
    Alert.alert(
      'Remove card',
      `Remove the card ending in ${last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionId(id);
            try {
              await api.payment.deleteMethod(id);
              await qc.invalidateQueries({ queryKey: ['payment-methods'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert('Error', 'Could not remove that card. Please try again.');
            } finally {
              setActionId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={st.backBtn}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={TEXT} />
        </Pressable>
        <Text style={st.headerTitle}>Payment methods</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {isError && !isLoading && (
          <View style={st.emptyWrap}>
            <Feather name="alert-circle" size={40} color={MUTED} />
            <Text style={st.emptyTitle}>Could not load cards</Text>
            <Pressable onPress={() => refetch()} style={st.retryBtn}>
              <Text style={{ fontSize: 14, color: BLUE, fontWeight: '600' }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isError && methods.length === 0 && (
          <View style={st.emptyWrap}>
            <Feather name="credit-card" size={44} color={MUTED} />
            <Text style={st.emptyTitle}>No saved cards</Text>
            <Text style={st.emptySubtitle}>
              Cards saved during checkout will appear here for one-tap payments.
            </Text>
          </View>
        )}

        {!isLoading && methods.map((m) => {
          const expStr = `${String(m.expMonth ?? '').padStart(2, '0')}/${String(m.expYear ?? '').slice(-2)}`;
          const isActioning = actionId === m.id;

          return (
            <View
              key={m.id}
              style={[
                st.card,
                m.isDefault && { borderColor: BLUE, backgroundColor: LIGHT_BLUE },
              ]}
            >
              <CardBrandIcon brand={m.brand} />

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={st.cardNumber}>•••• {m.last4}</Text>
                  {m.isDefault && (
                    <View style={st.defaultBadge}>
                      <Text style={st.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={st.cardMeta}>Expires {expStr}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {!m.isDefault && (
                  <Pressable
                    onPress={() => handleSetDefault(m.id)}
                    disabled={!!actionId}
                    style={st.actionBtn}
                    hitSlop={8}
                  >
                    {isActioning ? (
                      <ActivityIndicator size="small" color={GREEN} />
                    ) : (
                      <View style={st.setDefaultBtn}>
                        <Feather name="check-circle" size={13} color={GREEN} />
                        <Text style={{ fontSize: 11, color: GREEN, fontWeight: '600' }}>Set default</Text>
                      </View>
                    )}
                  </Pressable>
                )}

                <Pressable
                  onPress={() => handleDelete(m.id, m.last4)}
                  disabled={!!actionId}
                  style={[st.actionBtn, { marginLeft: 4 }]}
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={16} color={isActioning ? MUTED : RED} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {!isLoading && methods.length > 0 && (
          <View style={st.hint}>
            <Feather name="lock" size={12} color={MUTED} />
            <Text style={st.hintText}>
              Cards are stored securely by Stripe. Butterfield Cookies never sees your full card number.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
  },
  brandBadge: {
    width: 56,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: 1,
  },
  cardMeta: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
  },
  defaultBadge: {
    backgroundColor: BLUE + '22',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 0.3,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  setDefaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GREEN + '15',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  emptyWrap: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: LIGHT_BLUE,
    borderRadius: 10,
  },

  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
});
