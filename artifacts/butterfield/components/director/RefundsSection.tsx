import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RefundOperator, RefundEvent } from '@/lib/api';
import { s } from './reportStyles';
import { BLUE, AMBER, RED, NAVY, TEXT, MUTED } from './directorColors';
import { fmtAUD } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import StatCard from './StatCard';
import HBar from './HBar';
import SectionLoader from './SectionLoader';

function RefundOperatorsCard({ from, to }: { from: string; to: string }) {
  const [showRefunds, setShowRefunds] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['reports-refund-operators', from, to],
    queryFn: () => api.director.reportsRefundOperators(from, to),
    staleTime: 60_000,
  });
  const operators: RefundOperator[] = data?.data ?? [];
  const refunds: RefundEvent[] = data?.refunds ?? [];
  const grandTotal: number = data?.grandTotalRefundedCents ?? 0;
  if (isLoading) return <ActivityIndicator color={NAVY} style={{ marginVertical: 8 }} />;
  if (operators.length === 0 && refunds.length === 0) return null;
  return (
    <View style={s.card}>
      <View style={[s.breakRow, { marginBottom: 12 }]}>
        <Text style={[s.sectionTitle, { flex: 1 }]}>REFUND SUMMARY</Text>
        <Text style={[s.breakCount, { color: RED, fontSize: 16 }]}>
          ${(grandTotal / 100).toFixed(2)}
        </Text>
      </View>

      {operators.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { marginBottom: 8 }]}>BY OPERATOR</Text>
          {operators.map((op, i) => (
            <View key={op.userId}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.breakRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.breakLabel}>{op.name}</Text>
                  <Text style={s.breakSub}>{op.role}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {op.refunds > 0 && (
                    <Text style={[s.breakCount, { color: RED }]}>
                      {op.refunds} refund{op.refunds !== 1 ? 's' : ''}
                      {op.totalRefundedCents > 0 ? ` · $${(op.totalRefundedCents / 100).toFixed(2)}` : ''}
                    </Text>
                  )}
                  {op.voids > 0 && <Text style={[s.breakCount, { color: AMBER }]}>{op.voids} void{op.voids !== 1 ? 's' : ''}</Text>}
                  {op.discounts > 0 && <Text style={[s.breakCount, { color: BLUE }]}>{op.discounts} discount{op.discounts !== 1 ? 's' : ''}</Text>}
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {refunds.length > 0 && (
        <>
          <View style={s.divider} />
          <Pressable
            style={[s.breakRow, { marginTop: 8 }]}
            onPress={() => setShowRefunds(v => !v)}
          >
            <Text style={[s.sectionTitle, { flex: 1 }]}>REFUND EVENTS ({refunds.length})</Text>
            <Feather name={showRefunds ? 'chevron-up' : 'chevron-down'} size={14} color={MUTED} />
          </Pressable>
          {showRefunds && refunds.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <View style={[s.divider, { opacity: 0.5 }]} />}
              <View style={[s.breakRow, { marginTop: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.breakSub}>
                    {r.operatorName} · {new Date(r.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                  </Text>
                  {r.orderId && <Text style={[s.breakSub, { fontSize: 10 }]}>Order {r.orderId.slice(0, 12)}…</Text>}
                  {r.reason && <Text style={[s.breakSub, { fontSize: 10, fontStyle: 'italic' }]}>{r.reason}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.breakCount, { color: RED }]}>
                    ${(r.refundAmountCents / 100).toFixed(2)}
                  </Text>
                  {r.refundType && <Text style={[s.breakSub, { fontSize: 10 }]}>{r.refundType}</Text>}
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export default function RefundsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-refunds', from, to],
    queryFn: () => api.director.reportsRefunds(from, to),
    staleTime: 60_000,
  });
  const d = data?.data;
  const maxCode = Math.max(...(d?.discounts.byCode.map(c => c.totalDiscountCents) ?? [1]), 1);

  if (isLoading) return <SectionLoader />;
  if (!d) return null;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="REFUNDS & DISCOUNTS" icon="rotate-ccw" />
      <View style={s.card}>
        <View style={s.statRow}>
          <StatCard
            label="Refunds"
            value={String(d.refunds.count)}
            sub={fmtAUD(d.refunds.totalCents)}
            color={d.refunds.count > 0 ? RED : TEXT}
            icon="rotate-ccw"
          />
          <StatCard
            label="Discounts Used"
            value={String(d.discounts.count)}
            sub={fmtAUD(d.discounts.totalCents) + ' off'}
            color={AMBER}
            icon="percent"
          />
          <View style={s.statCard} />
        </View>

        {d.refunds.topReasons.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>TOP REFUND/CANCEL REASONS</Text>
            {d.refunds.topReasons.map((r, i) => (
              <View key={r.reason}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1 }]} numberOfLines={2}>{r.reason}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.breakCount}>{r.count}×</Text>
                    <Text style={s.breakValue}>{fmtAUD(r.totalCents)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {d.discounts.byType.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>BY DISCOUNT TYPE</Text>
            {d.discounts.byType.map((t, i) => {
              const label = t.type === 'loyalty_redemption' ? 'Loyalty Redemption'
                : t.type === 'percentage' ? 'Percentage Off'
                : t.type === 'fixed_amount' ? 'Fixed Amount Off'
                : t.type === 'free_delivery' ? 'Free Delivery'
                : t.type === 'promo_code' ? 'Promo Code'
                : t.type.replace(/_/g, ' ');
              const maxByType = Math.max(...d.discounts.byType.map(x => x.totalDiscountCents), 1);
              return (
                <View key={t.type}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.breakRow}>
                    <Text style={[s.breakLabel, { flex: 1 }]}>{label}</Text>
                    <Text style={s.breakCount}>{t.count}×</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <HBar value={t.totalDiscountCents} max={maxByType} color={AMBER} />
                    </View>
                    <Text style={s.breakValue}>{fmtAUD(t.totalDiscountCents)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {d.discounts.byCode.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>BY DISCOUNT CODE</Text>
            {d.discounts.byCode.map((c, i) => (
              <View key={c.code}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1, fontFamily: 'monospace' }]} numberOfLines={1}>
                    {c.code === 'no_code' ? '(no code)' : c.code}
                  </Text>
                  <Text style={s.breakCount}>{c.count}×</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <HBar value={c.totalDiscountCents} max={maxCode} color={AMBER} />
                  </View>
                  <Text style={s.breakValue}>{fmtAUD(c.totalDiscountCents)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      <RefundOperatorsCard from={from} to={to} />
    </View>
  );
}
