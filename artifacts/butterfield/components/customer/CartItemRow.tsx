import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { getPalette } from '@/constants/categoryColors';

const CHERRY = '#D0312D';
const MUTED  = '#8E8E93';
const CARD   = '#FFFFFF';
const BORDER = '#E5E7EB';

interface CartItemRowProps {
  item: {
    cartItemId: string;
    productName: string;
    variantName?: string;
    category?: string;
    imageUrl?: string | null;
    unitPriceCents: number;
    quantity: number;
    selectedOptions: Array<{ optionName?: string; textValue?: string }>;
  };
  onRemove: () => void;
  updateItemQuantity: (cartItemId: string, qty: number) => void;
  openSwipeableRef: React.MutableRefObject<Swipeable | null>;
}

export function CartItemRow({ item, onRemove, updateItemQuantity, openSwipeableRef }: CartItemRowProps) {
  const swipeableRef    = useRef<Swipeable>(null);
  const rowHeightAnim   = useRef(new RNAnimated.Value(0)).current;
  const measuredHeight  = useRef(0);
  const isCollapsingRef = useRef(false);
  const [collapsing, setCollapsing] = useState(false);

  const palette  = getPalette(item.category ?? 'default');
  const imageUrl = item.imageUrl ?? null;
  const optionLines = (item.selectedOptions ?? [])
    .filter(o => o.optionName && o.optionName !== 'No Sugar' && o.optionName !== 'No Honey' &&
                 o.optionName !== 'No Syrup' && o.optionName !== 'Regular Coffee' &&
                 o.optionName !== 'Regular' && o.optionName !== 'Normal' && o.optionName !== 'Full Cream')
    .concat(item.selectedOptions.filter(o => o.textValue));

  const handleLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && !isCollapsingRef.current) measuredHeight.current = h;
  };

  const renderRightActions = (progress: RNAnimated.AnimatedInterpolation<number>) => {
    const scale   = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.0], extrapolate: 'clamp' });
    const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1], extrapolate: 'clamp' });
    return (
      <View style={s.swipeDelete}>
        <RNAnimated.View style={{ alignItems: 'center', transform: [{ scale }], opacity }}>
          <Feather name="trash-2" size={18} color="#FFFFFF" />
          <Text style={s.swipeDeleteLabel}>Delete</Text>
        </RNAnimated.View>
      </View>
    );
  };

  const handleSwipeOpen = () => {
    if (isCollapsingRef.current) return;
    isCollapsingRef.current = true;
    const h = measuredHeight.current;
    rowHeightAnim.setValue(h);
    setCollapsing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    requestAnimationFrame(() => {
      RNAnimated.timing(rowHeightAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => onRemove());
    });
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={75}
      overshootRight
      overshootFriction={6}
      friction={1.5}
      onSwipeableWillOpen={() => {
        if (openSwipeableRef.current && openSwipeableRef.current !== swipeableRef.current) {
          openSwipeableRef.current.close();
        }
        openSwipeableRef.current = swipeableRef.current;
      }}
      onSwipeableOpen={handleSwipeOpen}
    >
      <RNAnimated.View
        onLayout={handleLayout}
        style={collapsing ? { height: rowHeightAnim, overflow: 'hidden' } : undefined}
      >
        <View style={[s.itemCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={s.itemThumb} contentFit="cover" />
          ) : (
            <View style={[s.itemThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 28 }}>{palette.emoji}</Text>
            </View>
          )}
          <Pressable
            onPress={() => { onRemove(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={s.removeBtn}
          >
            <Feather name="x" size={12} color={MUTED} />
          </Pressable>
          <View style={s.itemBody}>
            <Text style={s.itemName}>
              {item.productName}{item.variantName ? ` · ${item.variantName}` : ''}
            </Text>
            {optionLines.length > 0 && (
              <Text style={[s.itemOpts, { fontWeight: '400' }]} numberOfLines={2}>
                {optionLines.map(o => o.textValue ?? o.optionName).join(', ')}
              </Text>
            )}
            <Text style={s.itemPrice}>AUD {((item.unitPriceCents * item.quantity) / 100).toFixed(2)}</Text>
            <View style={s.qtyRow}>
              <Pressable onPress={() => { updateItemQuantity(item.cartItemId, item.quantity - 1); Haptics.selectionAsync(); }} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>–</Text>
              </Pressable>
              <Text style={s.qtyLabel}>QTY: {item.quantity}</Text>
              <Pressable onPress={() => { updateItemQuantity(item.cartItemId, item.quantity + 1); Haptics.selectionAsync(); }} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </RNAnimated.View>
    </Swipeable>
  );
}

const s = StyleSheet.create({
  swipeDelete:      { backgroundColor: CHERRY, width: 80, justifyContent: 'center', alignItems: 'center', gap: 4, borderRadius: 14, marginLeft: 8 },
  swipeDeleteLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, alignSelf: 'stretch' },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  itemOpts:   { fontSize: 12, color: '#8E8E93', lineHeight: 16 },
  itemPrice:  { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  qtyBtn:     { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' },
  qtyBtnText: { fontSize: 16, color: '#1C1C1E', fontWeight: '600', lineHeight: 20 },
  qtyLabel:   { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
});
