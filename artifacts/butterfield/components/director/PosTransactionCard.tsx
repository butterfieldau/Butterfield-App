import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import type { PosTransaction } from '@/lib/api';
import { fmtTime } from './ordersHelpers';

const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const GREEN  = '#22C55E';

const POS_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:  { bg: '#DCFCE7', text: '#166534' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  refunded:  { bg: '#F3E8FF', text: '#6B21A8' },
  voided:    { bg: '#FEE2E2', text: '#991B1B' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

const POS_METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  eftpos: { label: 'EFTPOS', color: BLUE },
  cash:   { label: 'Cash',   color: GREEN },
  split:  { label: 'Split',  color: '#8B5CF6' },
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function summarisePosItems(items: any[]): string {
  if (!items || items.length === 0) return 'No items';
  const names = items.map((i: any) => {
    const qty = i.quantity ?? i.qty ?? 1;
    const name = i.name ?? i.productName ?? 'Item';
    return qty > 1 ? `${qty}× ${name}` : name;
  });
  if (names.length <= 3) return names.join(', ');
  return names.slice(0, 2).join(', ') + ` & ${names.length - 2} more`;
}
function getPosPaymentLabel(tx: PosTransaction): { label: string; color: string } {
  if (tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1) {
    return POS_METHOD_CONFIG.split;
  }
  const pm = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  return POS_METHOD_CONFIG[pm] ?? { label: pm.toUpperCase(), color: MUTED };
}

export default function PosTransactionCard({ tx }: { tx: PosTransaction }) {
  const statusStyle = POS_STATUS_COLORS[tx.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const payMethod = getPosPaymentLabel(tx);
  const hasExtras = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 8, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>
              {tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: statusStyle.bg }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.text, letterSpacing: 0.3 }}>
                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: MUTED }}>{fmtTime(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{fmtCents(tx.totalCents)}</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: payMethod.color + '18' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: payMethod.color }}>{payMethod.label}</Text>
          </View>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: BORDER }} />
      <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }} numberOfLines={2}>
        {summarisePosItems(tx.items)}
      </Text>
      {hasExtras && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {tx.discountCents > 0 && <Text style={{ fontSize: 12, color: GREEN }}>−{fmtCents(tx.discountCents)} disc</Text>}
          {tx.surchargeCents > 0 && <Text style={{ fontSize: 12, color: MUTED }}>+{fmtCents(tx.surchargeCents)} surcharge</Text>}
          {tx.tipCents > 0 && <Text style={{ fontSize: 12, color: '#F59E0B' }}>+{fmtCents(tx.tipCents)} tip</Text>}
        </View>
      )}
      {tx.operatorName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="user" size={11} color={MUTED} />
          <Text style={{ fontSize: 12, color: MUTED }}>{tx.operatorName}</Text>
        </View>
      ) : null}
    </View>
  );
}
