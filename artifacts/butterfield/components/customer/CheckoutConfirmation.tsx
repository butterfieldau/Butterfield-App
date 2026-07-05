import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EdgeInsets } from 'react-native-safe-area-context';
import { computeConfirmationDisplaySavings } from '../../lib/confirmationSavings';

export { computeConfirmationDisplaySavings };

const CHERRY = '#D0312D';
const BLUE   = '#1493FF';

export interface Confirmation {
  orderId: string;
  orderNumber?: string | null;
  totalCents: number;
  type: string;
  scheduledLabel?: string;
  scheduledDateLabel?: string;
  paymentMethodType?: string;
  isScheduled?: boolean;
  rewardSavingsCents?: number;
  freeCoffeeDiscountCents?: number;
  rewardName?: string;
}

type ConfettiPiece = {
  id: number;
  left: number;
  top: number;
  dx: number;
  dy: number;
  delay: number;
  size: number;
  rotate: number;
  color: string;
  shape: 'circle' | 'square' | 'bar';
};

function ConfettiPieceView({ piece }: { piece: ConfettiPiece }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [piece.delay, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: piece.dx * p },
        { translateY: piece.dy * p },
        { rotate: `${piece.rotate * p}deg` },
        { scale: interpolate(p, [0, 0.15, 1], [0.25, 1.05, 0.85]) },
      ],
    };
  });

  const shapeStyle =
    piece.shape === 'circle'
      ? { borderRadius: piece.size / 2 }
      : piece.shape === 'square'
        ? { borderRadius: 3 }
        : { borderRadius: 999 };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: piece.left,
          top: piece.top,
          width: piece.size,
          height: piece.shape === 'bar' ? Math.max(6, Math.round(piece.size * 0.55)) : piece.size,
          backgroundColor: piece.color,
        },
        shapeStyle,
        style,
      ]}
    />
  );
}

interface Props {
  confirmation: Confirmation;
  clearCart: () => void;
  insets: EdgeInsets;
}

export function CheckoutConfirmation({ confirmation, clearCart, insets }: Props) {
  const earnedPoints   = Math.max(0, Math.floor(confirmation.totalCents / 125));
  const totalSavingsCents = computeConfirmationDisplaySavings(confirmation);
  const orderShortId  = confirmation.orderNumber ?? `#${confirmation.orderId.slice(0, 8).toUpperCase()}`;
  const placedLabel   = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  const { width: screenWidth } = useWindowDimensions();

  const celebrationPieces = useMemo<ConfettiPiece[]>(() => {
    const colors = ['#FF7A59', '#FFD166', '#7DD3FC', '#A78BFA', '#34D399', '#FB7185'];
    const seed = confirmation.orderId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 36; i += 1) {
      const mix = seed + i * 37;
      pieces.push({
        id: i,
        left: (mix * 13) % (screenWidth - 12),
        top: 8 + ((mix * 17) % 42),
        dx: ((mix % 11) - 5) * 20 + (i % 2 === 0 ? 34 : -24),
        dy: 180 + ((mix % 7) * 10),
        delay: (i % 8) * 30,
        size: 7 + (mix % 6),
        rotate: (mix % 2 === 0 ? 1 : -1) * (240 + (mix % 7) * 30),
        color: colors[mix % colors.length],
        shape: i % 3 === 0 ? 'bar' : i % 3 === 1 ? 'square' : 'circle',
      });
    }
    return pieces;
  }, [confirmation.orderId, screenWidth]);

  const goHome = () => { clearCart(); router.dismissAll(); router.replace('/(tabs)'); };
  const goTrack = () => {
    clearCart();
    router.dismissAll();
    router.replace('/(tabs)' as any);
    setTimeout(() => { router.push(`/(customer)/track/${confirmation.orderId}` as any); }, 50);
  };

  return (
    <View style={[s.wrap, { backgroundColor: '#FFFFFF' }]}>
      <ScrollView
        style={{ flex: 1, width: '100%', backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.card}>
          <View style={s.glow}>
            <View style={s.contentBlock}>
              <View style={s.topBar}>
                <Pressable onPress={goHome} style={s.topBack}>
                  <Feather name="chevron-left" size={22} color={CHERRY} />
                </Pressable>
                <Text style={s.topTitle}>Thank You</Text>
                <View style={s.topSpacer} />
              </View>
              <View style={s.characterStage} pointerEvents="none">
                <View style={s.characterFrame}>
                  <Image source={require('../../assets/images/thank-you-cookie-character.png')} style={s.characterImage} contentFit="contain" />
                </View>
              </View>
              {/* Confetti */}
              <View style={[StyleSheet.absoluteFillObject, { overflow: 'visible' }]} pointerEvents="none">
                {celebrationPieces.map(p => <ConfettiPieceView key={p.id} piece={p} />)}
              </View>
              <View style={s.hero}>
                <Text style={s.title}>Thank you!</Text>
                <Text style={s.orderLine}>Order Number: <Text style={s.orderStrong}>{orderShortId}</Text></Text>
                <Text style={s.description}>
                  {confirmation.isScheduled
                    ? (() => {
                        const slotKind = confirmation.type === 'pickup' ? 'pickup slot' : 'delivery';
                        const dateStr = confirmation.scheduledDateLabel ? ` on ${confirmation.scheduledDateLabel}` : '';
                        return `Your order has been placed and is awaiting confirmation for your ${slotKind}${dateStr}. You'll receive a push notification once confirmed.`;
                      })()
                    : confirmation.paymentMethodType === 'pay_at_pickup'
                      ? 'Your order is locked in. Please pay at the counter — check My Orders for live status updates.'
                      : 'Your order is being prepared. Tap Track My Order below to follow its live status.'}
                </Text>
              </View>
              <View style={s.summaryCard}>
                <View style={s.summaryTop}>
                  <View style={s.summaryPriceWrap}>
                    <Text style={s.summaryPrice}>AUD {(confirmation.totalCents / 100).toFixed(2)}</Text>
                    <Text style={s.summaryOrderId}>{orderShortId}</Text>
                  </View>
                  {confirmation.paymentMethodType !== 'pay_at_pickup' && (
                    <Pressable onPress={goTrack} style={s.trackLink}>
                      <Text style={s.trackText}>Track</Text>
                    </Pressable>
                  )}
                </View>
                <View style={s.divider} />
                <View style={s.summaryBottom}>
                  <View style={s.statusRow}>
                    <Feather name={confirmation.isScheduled ? 'clock' : 'package'} size={14} color="#A35A00" />
                    <Text style={s.statusText}>{confirmation.isScheduled ? 'Awaiting confirmation' : 'Being prepared'}</Text>
                  </View>
                  <Text style={s.dateText}>{placedLabel}</Text>
                </View>
              </View>
              <View style={s.pointsInline}>
                <Feather name="star" size={15} color="#A35A00" />
                <Text style={s.pointsInlineText}>
                  You earned <Text style={s.pointsInlineStrong}>+{earnedPoints} points</Text> from this order
                </Text>
              </View>
              {totalSavingsCents > 0 && (
                <View style={s.rewardSavings}>
                  <Feather name="gift" size={15} color="#15803D" />
                  <Text style={s.rewardSavingsText}>
                    You saved{' '}
                    <Text style={s.rewardSavingsStrong}>${(totalSavingsCents / 100).toFixed(2)}</Text>
                    {confirmation.rewardName ? ` with your ${confirmation.rewardName}` : ' with loyalty rewards'}
                  </Text>
                </View>
              )}
            </View>
            {confirmation.paymentMethodType !== 'pay_at_pickup' ? (
              <>
                <Pressable onPress={goTrack} style={[s.returnHomeBtn, { backgroundColor: BLUE }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="navigation" size={16} color="#fff" />
                    <Text style={s.returnHomeBtnText}>Track My Order</Text>
                  </View>
                </Pressable>
                <Pressable onPress={goHome} style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: '#8E8E93' }}>Return home</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={goHome} style={s.returnHomeBtn}>
                <Text style={s.returnHomeBtnText}>Return home</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:          { flex: 1, overflow: 'visible', backgroundColor: '#FFFFFF' },
  card:          { width: '100%', alignItems: 'center', zIndex: 2, maxWidth: 430, paddingTop: 8, flexGrow: 1 },
  glow:          { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  contentBlock:  { width: '100%', alignItems: 'center', gap: 18 },
  topBar:        { width: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ECECEC', paddingBottom: 14 },
  topBack:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  topTitle:      { fontSize: 18, fontWeight: '600', color: '#222222', textAlign: 'center' },
  topSpacer:     { width: 36, height: 36 },
  characterStage:{ position: 'relative', left: 0, right: 0, bottom: 0, height: 226, justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, marginBottom: -6 },
  characterFrame:{ width: 198, maxWidth: '66%', aspectRatio: 3195 / 3402 },
  characterImage:{ width: '100%', height: '100%' },
  hero:          { alignItems: 'center', gap: 12, width: '100%', paddingTop: 4 },
  title:         { fontSize: 28, fontWeight: '800', color: '#444444', textAlign: 'center', letterSpacing: -0.3 },
  orderLine:     { fontSize: 16, fontWeight: '500', color: '#555555', textAlign: 'center' },
  orderStrong:   { fontWeight: '800', color: '#3A3A3A' },
  description:   { fontSize: 14, fontWeight: '400', color: '#575757', lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  summaryCard:   { alignSelf: 'stretch', borderRadius: 20, borderWidth: 1, borderColor: '#F0F0F0', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, gap: 12 },
  summaryTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  summaryPriceWrap:{ flex: 1, gap: 3 },
  summaryPrice:  { fontSize: 18, fontWeight: '700', color: '#2E2E2E' },
  summaryOrderId:{ fontSize: 14, fontWeight: '500', color: '#707070' },
  trackLink:     { paddingHorizontal: 6, paddingVertical: 4 },
  trackText:     { fontSize: 16, fontWeight: '700', color: '#E94677' },
  divider:       { height: 1, backgroundColor: '#EFEFEF' },
  summaryBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  statusText:    { fontSize: 14, fontWeight: '500', color: '#5A5A5A' },
  dateText:      { fontSize: 14, fontWeight: '500', color: '#777777' },
  pointsInline:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
  pointsInlineText:   { fontSize: 14, fontWeight: '500', color: '#5B3A00', textAlign: 'center' },
  pointsInlineStrong: { fontWeight: '800', color: '#8A4D00' },
  rewardSavings:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#DCFCE7', borderRadius: 10 },
  rewardSavingsText:  { fontSize: 14, fontWeight: '500', color: '#15803D', textAlign: 'center', flexShrink: 1 },
  rewardSavingsStrong:{ fontWeight: '800', color: '#166534' },
  returnHomeBtn:      { alignSelf: 'stretch', backgroundColor: '#F61D22', borderRadius: 999, minHeight: 58, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  returnHomeBtnText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
