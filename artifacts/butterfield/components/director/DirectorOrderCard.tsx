import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { normalizeOrderItems } from '@/lib/orderItems';
import { STATUS_COLORS, STATUS_LABEL } from '@/lib/orderStatus';
import type { ApiOrder } from '@/lib/api';
import { styles } from './directorOrdersStyles';
import { fmtTime, fmtScheduledFor, openMap } from './ordersHelpers';
import { BRAND, BRAND_TEXT_ON, TEXT_MUTED, BRAND_DIM, GREEN_DIM, GREEN, AMBER, RED_DIM, RED } from './commandCenterColors';

export default function DirectorOrderCard({ order, onPress, onPrint, printing }: { order: ApiOrder; onPress: () => void; onPrint: () => Promise<void> | void; printing: boolean }) {
  const isWholesale = order.orderSource === 'wholesale' || order.type === 'wholesale';
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label = STATUS_LABEL[order.status] ?? order.status;
  const items  = normalizeOrderItems(order.items);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderNumber ?? order.id.slice(0, 8).toUpperCase()} ${order.customerName ?? ''} ${STATUS_LABEL[order.status] ?? order.status}`}
      style={({ pressed }) => [styles.orderCard, { opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={styles.orderCardAccent}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.orderId}>
                {isWholesale
                  ? `#${order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()}`
                  : (order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`)}
              </Text>
              {isWholesale ? (
                <View style={{ backgroundColor: GREEN_DIM, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: GREEN, fontWeight: '700', fontSize: 9 }}>WHOLESALE</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: BRAND_DIM, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: BRAND, fontWeight: '700', fontSize: 9 }}>APP</Text>
                </View>
              )}
            </View>
            {order.customerName && (<Text style={{ color: TEXT_MUTED, fontWeight: '500', fontSize: 12 }}>{order.customerName}</Text>)}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.text + '40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 11 }}>{label}</Text>
            </View>
            <Text style={{ color: BRAND, fontWeight: '700', fontSize: 14 }}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
          </View>
        </View>
        {!isWholesale && (() => {
          const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
          const isDineIn = (order as any).source === 'dine_in';
          const tableNumber = (order as any).tableNumber ?? null;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              {isDineIn ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Feather name="coffee" size={11} color={AMBER} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER }}>
                    {tableNumber ? `Table ${tableNumber}` : 'Dine-In'}
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDelivery ? BRAND_DIM : GREEN_DIM, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Feather name={isDelivery ? 'truck' : 'shopping-bag'} size={11} color={isDelivery ? BRAND : GREEN} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isDelivery ? BRAND : GREEN }}>
                    {isDelivery ? 'Delivery' : (order.scheduledFor ? 'Pickup' : 'ASAP Pickup')}
                  </Text>
                </View>
              )}
              {isDelivery && (order.deliveryAddress || order.street) && (() => {
                const addr = order.deliveryAddress ?? order.street ?? '';
                return (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); openMap(addr); Haptics.selectionAsync(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                    <Text style={{ fontSize: 11, color: BRAND, fontWeight: '400', flex: 1 }} numberOfLines={1}>{addr}</Text>
                    <Feather name="external-link" size={10} color={BRAND} />
                  </Pressable>
                );
              })()}
            </View>
          );
        })()}
        {order.scheduledFor && !isWholesale && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Feather name="clock" size={11} color={BRAND} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: BRAND }}>
              Scheduled: {fmtScheduledFor(order.scheduledFor)}
            </Text>
          </View>
        )}
        {order.status === 'scheduled' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Feather name="alert-circle" size={11} color={AMBER} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER }}>Needs Acceptance</Text>
          </View>
        )}
        {items.length === 0 ? (
          <Text style={{ color: TEXT_MUTED, fontWeight: '400', fontSize: 12, marginTop: 4 }}>No items</Text>
        ) : (
          <View style={{ marginTop: 4, gap: 2 }}>
            {items.slice(0, 3).map((it, idx) => (
              <View key={idx}>
                <Text style={{ color: TEXT_MUTED, fontWeight: '500', fontSize: 12 }} numberOfLines={1}>
                  {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}{it.variantName ? ` (${it.variantName})` : ''}
                </Text>
                {it.notableOptions.length > 0 && (
                  <Text style={{ color: TEXT_MUTED, fontWeight: '400', fontSize: 11, marginLeft: 10 }} numberOfLines={1}>
                    {it.notableOptions.join(' · ')}
                  </Text>
                )}
              </View>
            ))}
            {items.length > 3 && (
              <Text style={{ color: TEXT_MUTED, fontWeight: '400', fontSize: 11, fontStyle: 'italic' }}>
                +{items.length - 3} more
              </Text>
            )}
          </View>
        )}
        {items.some((it) => it.boxContents.length > 0) && (
          <View style={{ marginTop: 4, gap: 2 }}>
            {items.filter((it) => it.boxContents.length > 0).map((it, bi) => (
              <View key={bi}>
                {items.length > 1 && (
                  <Text style={{ color: TEXT_MUTED, fontWeight: '600', fontSize: 10, letterSpacing: 0.3 }}>{it.name}:</Text>
                )}
                <Text style={{ color: TEXT_MUTED, fontWeight: '400', fontSize: 11 }} numberOfLines={3}>
                  {it.boxContents.join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        )}
        {isWholesale && (Array.isArray((order as any).editHistory) && (order as any).editHistory.length > 0 || Array.isArray((order as any).creditMemos) && (order as any).creditMemos.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {Array.isArray((order as any).editHistory) && (order as any).editHistory.length > 0 && (
              <View style={{ backgroundColor: BRAND_DIM, borderWidth: 1, borderColor: BRAND + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: BRAND, fontWeight: '700', fontSize: 9 }}>MODIFIED</Text>
              </View>
            )}
            {Array.isArray((order as any).creditMemos) && (order as any).creditMemos.length > 0 && (
              <View style={{ backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: RED, fontWeight: '700', fontSize: 9 }}>CREDIT ISSUED</Text>
              </View>
            )}
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
          <Text style={{ color: TEXT_MUTED, fontWeight: '400', fontSize: 11 }}>{fmtTime(order.createdAt)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pressable onPress={onPrint} disabled={printing} style={[styles.printMiniBtn, { backgroundColor: printing ? TEXT_MUTED : BRAND }]}>
              <Feather name="printer" size={11} color={BRAND_TEXT_ON} />
              <Text style={[styles.printMiniBtnTxt, { color: BRAND_TEXT_ON }]}>{printing ? '...' : 'Print'}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="chevron-right" size={12} color={BRAND} />
              <Text style={{ color: BRAND, fontWeight: '600', fontSize: 11 }}>Tap to manage</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
