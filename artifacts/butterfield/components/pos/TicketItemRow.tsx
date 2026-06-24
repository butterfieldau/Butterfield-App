import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import SupervisorPinCapture from './SupervisorPinCapture';
import styles from './posStyles';
import { BLUE, CHERRY, DARK, MID, MUTED, WHITE, fmtCents } from './types';
import type { TicketItem } from './types';

export default function TicketItemRow({
  item, onRemove, onIncrement, onDecrement, onEdit, onPriceOverride, openSwipeableRef,
}: {
  item: TicketItem; onRemove: () => void;
  onIncrement: () => void; onDecrement: () => void; onEdit: () => void;
  onPriceOverride: (newPriceCents: number | undefined, supervisorPin?: string) => void;
  openSwipeableRef: React.MutableRefObject<Swipeable | null>;
}) {
  const effectiveUnitPrice = item.priceOverrideCents ?? item.unitPriceCents;
  const lineTotal = effectiveUnitPrice * item.quantity;
  const origLineTotal = item.unitPriceCents * item.quantity;
  const hasOverride = item.priceOverrideCents !== undefined;
  const optionSummary = item.selectedOptions.map(o => o.optionName).join(', ');
  const variantLabel = item.variantName;

  const swipeableRef = useRef<Swipeable>(null);
  const rowHeightAnim = useRef(new Animated.Value(64)).current;
  const isCollapsing = useRef(false);
  const priceInputRef = useRef<TextInput>(null);

  const [showPriceEdit, setShowPriceEdit] = React.useState(false);
  const [rawPrice, setRawPrice] = React.useState('');
  const [showPinCapture, setShowPinCapture] = React.useState(false);
  const [pendingPriceCents, setPendingPriceCents] = React.useState<number | null>(null);

  // Delayed programmatic focus — autoFocus inside an animated Modal frequently
  // fails on iOS because the keyboard request fires before the animation ends.
  React.useEffect(() => {
    if (showPriceEdit) {
      const t = setTimeout(() => priceInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [showPriceEdit]);

  const openPriceEdit = () => {
    setRawPrice((effectiveUnitPrice / 100).toFixed(2));
    setShowPriceEdit(true);
    Haptics.selectionAsync();
  };

  const confirmPriceEdit = () => {
    const parsed = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
    if (isNaN(parsed) || parsed < 0) { setShowPriceEdit(false); return; }
    const newCents = Math.round(parsed * 100);
    if (newCents === item.unitPriceCents) {
      onPriceOverride(undefined);
      setShowPriceEdit(false);
      return;
    }
    const reduction = item.unitPriceCents - newCents;
    if (reduction > 100) {
      setPendingPriceCents(newCents);
      setShowPriceEdit(false);
      setShowPinCapture(true);
    } else {
      onPriceOverride(newCents);
      setShowPriceEdit(false);
    }
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.0], extrapolate: 'clamp' });
    const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1], extrapolate: 'clamp' });
    return (
      <View style={styles.ticketSwipeDelete}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale }], opacity }}>
          <Feather name="trash-2" size={18} color="#FFFFFF" />
          <Text style={styles.ticketSwipeDeleteLabel}>Delete</Text>
        </Animated.View>
      </View>
    );
  };

  const handleSwipeOpen = () => {
    if (isCollapsing.current) return;
    isCollapsing.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Animated.timing(rowHeightAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => {
      onRemove();
    });
  };

  return (
    <>
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
        <Animated.View style={[styles.ticketItem, { height: rowHeightAnim, overflow: 'hidden' }]}>
          <TouchableOpacity onPress={onEdit} style={{ flex: 1 }} activeOpacity={0.7}>
            <Text style={styles.ticketItemName} numberOfLines={1}>{item.productName}</Text>
            {(variantLabel || optionSummary) && (
              <Text style={styles.ticketItemMeta} numberOfLines={1}>
                {[variantLabel, optionSummary].filter(Boolean).join(' · ')}
              </Text>
            )}
            {item.notes ? (
              <Text style={styles.ticketItemNotes} numberOfLines={1}>Note: {item.notes}</Text>
            ) : null}
          </TouchableOpacity>
          <View style={styles.ticketItemRight}>
            <TouchableOpacity onPress={openPriceEdit} activeOpacity={0.7} hitSlop={6}>
              {hasOverride ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.ticketItemPriceStrike}>{fmtCents(origLineTotal)}</Text>
                  <Text style={[styles.ticketItemPrice, { color: CHERRY }]}>{fmtCents(lineTotal)}</Text>
                </View>
              ) : (
                <Text style={styles.ticketItemPrice}>{fmtCents(lineTotal)}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.qtyControls}>
              <Pressable onPress={item.quantity === 1 ? onRemove : onDecrement} style={styles.qtyBtn} hitSlop={6}>
                {item.quantity === 1
                  ? <Feather name="trash-2" size={14} color={CHERRY} />
                  : <Feather name="minus" size={14} color={MID} />}
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable onPress={onIncrement} style={styles.qtyBtn} hitSlop={6}>
                <Feather name="plus" size={14} color={BLUE} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Swipeable>

      <Modal visible={showPriceEdit} transparent animationType="fade" onRequestClose={() => setShowPriceEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.pinOverlay} onPress={() => setShowPriceEdit(false)}>
            <Pressable style={styles.priceEditSheet} onPress={() => {}}>
              <Text style={styles.priceEditTitle}>Set Price</Text>
              <Text style={styles.priceEditSub} numberOfLines={1}>{item.productName}</Text>
              <View style={styles.priceEditInputRow}>
                <Text style={styles.priceEditDollar}>$</Text>
                <TextInput
                  ref={priceInputRef}
                  style={styles.priceEditInput}
                  value={rawPrice}
                  onChangeText={setRawPrice}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmPriceEdit}
                  placeholder="0.00"
                  placeholderTextColor={MUTED}
                />
              </View>
              {hasOverride && (
                <Text style={styles.priceEditOriginal}>Original: {fmtCents(item.unitPriceCents)}</Text>
              )}
              <Text style={styles.priceEditHint}>Reductions over $1.00 require a supervisor PIN</Text>
              <View style={styles.priceEditActions}>
                <Pressable onPress={() => setShowPriceEdit(false)} style={styles.priceEditCancel}>
                  <Text style={styles.priceEditCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmPriceEdit} style={styles.priceEditConfirm}>
                  <Text style={styles.priceEditConfirmText}>Set Price</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {showPinCapture && (
        <SupervisorPinCapture
          title="Price Override"
          subtitle="Enter supervisor PIN to reduce price by more than $1.00"
          onClose={() => { setShowPinCapture(false); setPendingPriceCents(null); }}
          onSuccess={(pin) => {
            if (pendingPriceCents !== null) {
              onPriceOverride(pendingPriceCents, pin);
            }
            setShowPinCapture(false);
            setPendingPriceCents(null);
          }}
        />
      )}
    </>
  );
}

