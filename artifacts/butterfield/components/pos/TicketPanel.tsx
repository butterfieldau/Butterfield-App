import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import POSCartScannerLayer, { type POSCartScannerLayerRef } from './POSCartScannerLayer';
import { Swipeable } from 'react-native-gesture-handler';
import { api } from '@/lib/api';
import TicketItemRow from './TicketItemRow';
import styles from './posStyles';
import { BLUE, CHERRY, MUTED, MID, WHITE, STAMP_GOAL, fmtCents, ticketSubtotal, ticketTotal, isBirthdayMonth } from './types';
import type { AppliedDiscount, AttachedCustomerClaimedReward, OrderType, Ticket, TicketItem } from './types';

export default function TicketPanel({
  ticket, onUpdateTicket, onRemoveItem, onUpdateQty, onPriceOverride,
  onClear, onHold, onAttachCustomer, onCharge, onEditItem,
  discountPresets, attachCustomerToCart, openCameraScanner, anyModalOpen,
}: {
  ticket: Ticket;
  onUpdateTicket: (p: Partial<Ticket>) => void;
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onPriceOverride: (localId: string, newPriceCents: number | undefined, supervisorPin?: string) => void;
  onClear: () => void;
  onHold?: () => void;
  onAttachCustomer: () => void;
  onCharge: () => void;
  onEditItem: (item: TicketItem) => void;
  discountPresets: number[];
  attachCustomerToCart: (qrValue: string) => Promise<void>;
  openCameraScanner: () => void;
  anyModalOpen: boolean;
}) {
  const subtotal = ticketSubtotal(ticket);
  const total = ticketTotal(ticket);
  const isEmpty = ticket.items.length === 0;
  const discount = ticket.appliedDiscount;

  const openSwipeableRef = useRef<Swipeable | null>(null);
  const scannerRef       = useRef<POSCartScannerLayerRef>(null);

  const [codeInput, setCodeInput] = React.useState('');
  const [validating, setValidating] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = React.useState(false);

  const prevShowCodeInputRef = React.useRef(showCodeInput);
  React.useEffect(() => {
    if (prevShowCodeInputRef.current && !showCodeInput) {
      const t = setTimeout(() => scannerRef.current?.focus(), 150);
      prevShowCodeInputRef.current = false;
      return () => clearTimeout(t);
    }
    prevShowCodeInputRef.current = showCodeInput;
    return undefined;
  }, [showCodeInput]);

  const hasCoffeeItems = ticket.items.some(i => i.category.toLowerCase() === 'coffee');
  const canRedeemFreeCoffee = (ticket.customer?.freeCoffeeRewards ?? 0) > 0 && hasCoffeeItems && discount?.type !== 'free_coffee';

  const applyPctDiscount = (pct: number) => {
    const amountCents = Math.round(subtotal * pct / 100);
    onUpdateTicket({ appliedDiscount: { type: 'pct', pct, amountCents, label: `${pct}% off` } });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const applyFreeCoffee = () => {
    const coffeeItems = ticket.items.filter(i => i.category.toLowerCase() === 'coffee');
    if (coffeeItems.length === 0) return;
    const cheapest = Math.min(...coffeeItems.map(i => i.unitPriceCents));
    onUpdateTicket({
      appliedDiscount: { type: 'free_coffee', amountCents: cheapest, label: `☕ Free Coffee (–${fmtCents(cheapest)})` },
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const applyClaimedReward = (cr: AttachedCustomerClaimedReward) => {
    const sub = ticketSubtotal(ticket);
    let amountCents: number;
    let label: string;
    if (cr.voucherValueCents) {
      amountCents = Math.min(cr.voucherValueCents, sub);
      label = `🎁 ${cr.rewardName} (–${fmtCents(amountCents)})`;
    } else if (cr.rewardType === 'birthday_cookie' || cr.rewardType === 'cookie_any') {
      const cookieCategories = ['cookies', 'cookie-frappes'];
      const cookieItems = ticket.items.filter(i => cookieCategories.includes(i.category.toLowerCase()));
      if (cookieItems.length === 0) {
        amountCents = 0;
        label = `🍪 ${cr.rewardName} (add a cookie to cart)`;
      } else {
        const cheapestCookie = Math.min(...cookieItems.map(i => i.priceOverrideCents ?? i.unitPriceCents));
        amountCents = cheapestCookie;
        label = `🍪 ${cr.rewardName} (–${fmtCents(cheapestCookie)})`;
      }
    } else {
      amountCents = sub;
      label = `🎁 ${cr.rewardName} (free)`;
    }
    onUpdateTicket({ appliedDiscount: { type: 'claimed_reward', claimedRewardId: cr.id, amountCents, label } });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const applyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setValidating(true);
    setCodeError(null);
    try {
      const res = await api.discounts.validate({
        code,
        items: ticket.items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          selectedOptions: i.selectedOptions.map(o => ({
            optionId: o.optionId,
            groupId: o.groupId,
            priceAdjustmentCents: o.priceAdjustmentCents,
          })),
        })),
        orderType: 'pickup',
        customerId: ticket.customer?.userId,
      });
      if (res.valid) {
        onUpdateTicket({
          appliedDiscount: {
            type: 'code', code: res.code, codeId: res.id,
            amountCents: res.discountAmountCents,
            label: `Code: ${res.code} (–${fmtCents(res.discountAmountCents)})`,
          },
        });
        setShowCodeInput(false);
        setCodeInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setCodeError(err?.message ?? 'Invalid discount code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setValidating(false);
    }
  };

  const removeDiscount = () => {
    onUpdateTicket({ appliedDiscount: null });
    setCodeInput('');
    setCodeError(null);
    setShowCodeInput(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.ticketContainer}>
      {/* Customer section */}
      {ticket.customer ? (
        <View style={styles.customerSection}>
          <TouchableOpacity onPress={onAttachCustomer} style={styles.customerBarInner} activeOpacity={0.7}>
            <Feather name="user" size={16} color={BLUE} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.customerName}>{ticket.customer.name}</Text>
                {isBirthdayMonth(ticket.customer.birthday) && (
                  <Text style={{ fontSize: 14 }}>🎂</Text>
                )}
              </View>
              <Text style={styles.customerSub}>
                {ticket.customer.loyaltyPoints} pts
                {(ticket.customer.freeCoffeeRewards ?? 0) > 0 ? ` · ☕ ×${ticket.customer.freeCoffeeRewards} free` : ''}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={MUTED} />
          </TouchableOpacity>
          <View style={styles.stampRow}>
            {Array.from({ length: STAMP_GOAL }).map((_, i) => {
              const filled = i < (ticket.customer?.stampCount ?? 0);
              return (
                <View key={i} style={[styles.stampCircle, filled && styles.stampCircleFilled]}>
                  {filled ? <Feather name="coffee" size={11} color={WHITE} /> : null}
                </View>
              );
            })}
            <Text style={styles.stampLabel}>{ticket.customer.stampCount}/{STAMP_GOAL}</Text>
            <Text style={[styles.stampLabel, { marginLeft: 0, color: MUTED }]}>
              {hasCoffeeItems ? '— stamps apply automatically after payment' : '— add coffee to earn stamps'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.customerBtnRow}>
          <Pressable onPress={onAttachCustomer} style={styles.customerBtn}>
            <Feather name="user" size={14} color={BLUE} />
            <Text style={styles.customerBtnText}>Attach Customer</Text>
          </Pressable>
        </View>
      )}

      {/* Always-on Bluetooth scanner layer */}
      <POSCartScannerLayer
        ref={scannerRef}
        attachCustomerToCart={attachCustomerToCart}
        openCameraScanner={openCameraScanner}
        anyModalOpen={anyModalOpen}
      />

      {/* Order type */}
      <View style={styles.orderTypeRow}>
        {(['counter', 'dine_in', 'takeaway'] as OrderType[]).map(type => (
          <Pressable
            key={type}
            onPress={() => onUpdateTicket({ orderType: type })}
            style={[styles.orderTypeChip, ticket.orderType === type && styles.orderTypeChipActive]}
          >
            <Text style={[styles.orderTypeText, ticket.orderType === type && styles.orderTypeTextActive]}>
              {type === 'counter' ? 'Counter' : type === 'dine_in' ? 'Dine In' : 'Takeaway'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Order note */}
      <View style={styles.ticketNotesRow}>
        <Feather name="file-text" size={13} color={MUTED} style={{ marginTop: 1 }} />
        <TextInput
          style={styles.ticketNotesInput}
          placeholder="Add order note…"
          placeholderTextColor={MUTED}
          value={ticket.notes}
          onChangeText={v => onUpdateTicket({ notes: v })}
          returnKeyType="done"
          blurOnSubmit
          onBlur={() => setTimeout(() => scannerRef.current?.focus(), 150)}
        />
        {ticket.notes.length > 0 && (
          <Pressable onPress={() => onUpdateTicket({ notes: '' })} hitSlop={8}>
            <Feather name="x" size={13} color={MUTED} />
          </Pressable>
        )}
      </View>

      {/* Items list */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyTicket}>
            <Feather name="shopping-cart" size={36} color={MUTED} />
            <Text style={styles.emptyTicketText}>Tap products to add to the ticket</Text>
          </View>
        ) : (
          ticket.items.map(item => (
            <TicketItemRow
              key={item.localId}
              item={item}
              onRemove={() => onRemoveItem(item.localId)}
              onIncrement={() => onUpdateQty(item.localId, 1)}
              onDecrement={() => onUpdateQty(item.localId, -1)}
              onEdit={() => onEditItem(item)}
              onPriceOverride={(newPriceCents, pin) => onPriceOverride(item.localId, newPriceCents, pin)}
              openSwipeableRef={openSwipeableRef}
            />
          ))
        )}
      </ScrollView>

      {/* Discount section */}
      {!isEmpty && (
        <View style={styles.discountSection}>
          {discount ? (
            <View style={styles.discountApplied}>
              <Feather name="tag" size={13} color="#16A34A" />
              <Text style={styles.discountAppliedText} numberOfLines={1}>{discount.label}</Text>
              <Pressable onPress={removeDiscount} hitSlop={8} style={{ marginLeft: 'auto' as any }}>
                <Feather name="x" size={14} color={MID} />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.discountChips}>
                {discountPresets.map(pct => (
                  <Pressable key={pct} onPress={() => applyPctDiscount(pct)} style={styles.discountChip}>
                    <Text style={styles.discountChipText}>{pct}%</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => { setShowCodeInput(v => !v); setCodeError(null); }} style={styles.discountChipCode}>
                  <Feather name="hash" size={12} color={BLUE} />
                  <Text style={[styles.discountChipText, { color: BLUE }]}>Code</Text>
                </Pressable>
                {canRedeemFreeCoffee && (
                  <Pressable onPress={applyFreeCoffee} style={styles.discountChipCoffee}>
                    <Text style={styles.discountChipText}>☕ Free</Text>
                  </Pressable>
                )}
                {(ticket.customer?.availableClaimedRewards ?? []).map(cr => {
                  const chipLabel = cr.voucherValueCents
                    ? `🎁 $${(cr.voucherValueCents / 100).toFixed(0)} off`
                    : `🎁 ${cr.rewardName}`;
                  return (
                    <Pressable key={cr.id} onPress={() => applyClaimedReward(cr)} style={styles.discountChipReward}>
                      <Text style={styles.discountChipText}>{chipLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {showCodeInput && (
                <View style={styles.discountCodeRow}>
                  <TextInput
                    style={styles.discountCodeInput}
                    placeholder="Enter code…"
                    placeholderTextColor={MUTED}
                    value={codeInput}
                    onChangeText={t => { setCodeInput(t.toUpperCase()); setCodeError(null); }}
                    autoCapitalize="characters"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={applyCode}
                    onBlur={() => setTimeout(() => scannerRef.current?.focus(), 150)}
                  />
                  <Pressable
                    onPress={applyCode}
                    disabled={validating || !codeInput.trim()}
                    style={[styles.discountCodeApplyBtn, (!codeInput.trim() || validating) && { opacity: 0.5 }]}
                  >
                    {validating
                      ? <ActivityIndicator size="small" color={WHITE} />
                      : <Text style={styles.discountCodeApplyText}>Apply</Text>}
                  </Pressable>
                </View>
              )}
              {codeError ? <Text style={styles.discountCodeError}>{codeError}</Text> : null}
            </>
          )}
        </View>
      )}

      {/* Totals */}
      {!isEmpty && (
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtCents(subtotal)}</Text>
          </View>
          {discount && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#16A34A' }]}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#16A34A' }]}>–{fmtCents(discount.amountCents)}</Text>
            </View>
          )}
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalFinalLabel}>Total</Text>
            <Text style={styles.totalFinalValue}>{fmtCents(total)}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.ticketActions}>
        {!isEmpty && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Pressable onPress={onClear} style={styles.clearBtn}>
              <Feather name="trash-2" size={14} color={CHERRY} />
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
            {onHold && (
              <Pressable onPress={onHold} style={styles.holdBtn}>
                <Feather name="pause" size={14} color={MID} />
                <Text style={styles.holdBtnText}>Hold</Text>
              </Pressable>
            )}
          </View>
        )}
        <TouchableOpacity
          onPress={onCharge}
          style={[styles.chargeBtn, isEmpty && { opacity: 0.5 }]}
          disabled={isEmpty}
          activeOpacity={0.8}
        >
          <Feather name="credit-card" size={18} color={WHITE} />
          <Text style={styles.chargeBtnText}>
            {isEmpty ? 'Charge' : `Charge ${fmtCents(total)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

