import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';
import { STATUS_COLORS, STATUS_LABEL } from '@/lib/orderStatus';
import type { ApiOrder } from '@/lib/api';
import { styles } from './ordersStyles';
import { fmtTime, openMap } from './ordersHelpers';

const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';

export default function OrderCard({ order, onPress, onPrint, printing }: { order: ApiOrder; onPress: () => void; onPrint: () => Promise<void> | void; printing: boolean }) {
  const isWholesale = order.orderSource === 'wholesale' || order.type === 'wholesale';
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label = STATUS_LABEL[order.status] ?? order.status;
  const items  = normalizeOrderItems(order.items);
  const itemSummary = summarizeOrderItems(items).replaceAll(' · ', ', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderNumber ?? order.id.slice(0, 8).toUpperCase()} ${order.customerName ?? ''} ${STATUS_LABEL[order.status] ?? order.status}`}
      style={({ pressed }) => [styles.orderCard, { opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={[styles.orderCardAccent, { backgroundColor: colors.bg }]}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.orderId}>
                {isWholesale
                  ? `#${order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()}`
                  : (order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`)}
              </Text>
              {isWholesale ? (
                <View style={{ backgroundColor: '#DCFCE7', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 9 }}>WHOLESALE</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#DBEAFE', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: '#1E40AF', fontWeight: '700', fontSize: 9 }}>APP</Text>
                </View>
              )}
            </View>
            {order.customerName && (<Text style={{ color: MUTED, fontWeight: '500', fontSize: 12 }}>{order.customerName}</Text>)}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.text + '40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 11 }}>{label}</Text>
            </View>
            <Text style={{ color: BLUE, fontWeight: '700', fontSize: 14 }}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
          </View>
        </View>
        {!isWholesale && (() => {
          const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDelivery ? '#DBEAFE' : '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Feather name={isDelivery ? 'truck' : 'shopping-bag'} size={11} color={isDelivery ? '#1E40AF' : '#166534'} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDelivery ? '#1E40AF' : '#166534' }}>
                  {isDelivery ? 'Delivery' : (order.scheduledFor ? 'Pickup' : 'ASAP Pickup')}
                </Text>
              </View>
              {isDelivery && (order.deliveryAddress || order.street) && (() => {
                const addr = order.deliveryAddress ?? order.street ?? '';
                return (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); openMap(addr); Haptics.selectionAsync(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#1E40AF', fontWeight: '400', flex: 1 }} numberOfLines={1}>{addr}</Text>
                    <Feather name="external-link" size={10} color="#1E40AF" />
                  </Pressable>
                );
              })()}
            </View>
          );
        })()}
        {order.status === 'scheduled' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Feather name="clock" size={11} color="#92400E" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Needs Acceptance</Text>
          </View>
        )}
        <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12, marginTop: 4 }} numberOfLines={1}>{itemSummary || 'No items'}</Text>
        {items.some((it) => it.boxContents.length > 0) && (
          <View style={{ marginTop: 4, gap: 2 }}>
            {items.filter((it) => it.boxContents.length > 0).map((it, bi) => (
              <View key={bi}>
                {items.length > 1 && (
                  <Text style={{ color: MUTED, fontWeight: '600', fontSize: 10, letterSpacing: 0.3 }}>{it.name}:</Text>
                )}
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11 }} numberOfLines={3}>
                  {it.boxContents.join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        )}
        {isWholesale && (Array.isArray((order as any).editHistory) && (order as any).editHistory.length > 0 || Array.isArray((order as any).creditMemos) && (order as any).creditMemos.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {Array.isArray((order as any).editHistory) && (order as any).editHistory.length > 0 && (
              <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 9 }}>MODIFIED</Text>
              </View>
            )}
            {Array.isArray((order as any).creditMemos) && (order as any).creditMemos.length > 0 && (
              <View style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: '#991B1B', fontWeight: '700', fontSize: 9 }}>CREDIT ISSUED</Text>
              </View>
            )}
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
          <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11 }}>{fmtTime(order.createdAt)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pressable onPress={onPrint} disabled={printing} style={[styles.printMiniBtn, { backgroundColor: printing ? MUTED : TEXT }]}>
              <Feather name="printer" size={11} color="#fff" />
              <Text style={styles.printMiniBtnTxt}>{printing ? '...' : 'Print'}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="chevron-right" size={12} color={BLUE} />
              <Text style={{ color: BLUE, fontWeight: '600', fontSize: 11 }}>Tap to manage</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
