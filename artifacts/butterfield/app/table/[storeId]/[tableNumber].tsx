/**
 * In-app table ordering screen.
 *
 * Handles the deep link  butterfield://table/:storeId/:tableNumber
 * and presents a native category → product → cart → payment → confirmation
 * flow that mirrors the web SPA but feels fully native.
 */
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardField, StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct, type ProductCategory } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const BLUE   = '#1493FF';
const AMBER  = '#E8C87A';
const BG     = '#F9F8F6';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const DARK   = '#1A1A1A';
const MERCHANT_ID = 'merchant.au.com.butterfieldcookies.app';

// ── Category colours ──────────────────────────────────────────────────────────

function getCategoryColor(slug: string, name: string): { bg: string; text: string; emoji: string } {
  const k = `${slug} ${name}`.toLowerCase();
  if (k.includes('cookie') || k.includes('bake') || k.includes('pastry'))
    return { bg: '#F7EDD6', text: '#3D1F0A', emoji: '🍪' };
  if (k.includes('coffee') || k.includes('espresso') || k.includes('latte'))
    return { bg: '#1C0F07', text: '#F5E6D0', emoji: '☕' };
  if (k.includes('matcha'))
    return { bg: '#E4EDD8', text: '#1E4020', emoji: '🍵' };
  if (k.includes('tea') || k.includes('chai'))
    return { bg: '#EEE0D8', text: '#4A2818', emoji: '🫖' };
  if (k.includes('iced') || k.includes('cold') || k.includes('frappe'))
    return { bg: '#DDE8F0', text: '#0E3A5A', emoji: '🧊' };
  if (k.includes('food') || k.includes('sandwich'))
    return { bg: '#F0EDE8', text: '#2A1A0A', emoji: '🥪' };
  return { bg: '#EDE8E1', text: '#1C1C1E', emoji: '✨' };
}

// ── Option types ──────────────────────────────────────────────────────────────

interface OptionGroupOption {
  id: string;
  name: string;
  priceAdjustmentCents: number;
  isActive: boolean;
  sortOrder?: number;
}

interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: OptionGroupOption[];
}

interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceCents: number;
}

// ── Local cart ─────────────────────────────────────────────────────────────────

interface TableCartItem {
  /** Unique per product+variant+options combo so different option sets are separate rows */
  cartKey: string;
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string | null;
  category?: string | null;
  variantId?: string | null;
  variantName?: string | null;
  selectedOptions: SelectedOption[];
  notes?: string;
}

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<TableCartItem, 'quantity'>; quantity?: number }
  | { type: 'INC'; cartKey: string }
  | { type: 'DEC'; cartKey: string }
  | { type: 'CLEAR' };

function cartReducer(state: TableCartItem[], action: CartAction): TableCartItem[] {
  switch (action.type) {
    case 'ADD_ITEM': {
      const qty = action.quantity ?? 1;
      const existing = state.find((i) => i.cartKey === action.item.cartKey);
      if (existing) {
        return state.map((i) => i.cartKey === action.item.cartKey ? { ...i, quantity: i.quantity + qty } : i);
      }
      return [...state, { ...action.item, quantity: qty }];
    }
    case 'INC':
      return state.map((i) => i.cartKey === action.cartKey ? { ...i, quantity: i.quantity + 1 } : i);
    case 'DEC':
      return state
        .map((i) => i.cartKey === action.cartKey ? { ...i, quantity: i.quantity - 1 } : i)
        .filter((i) => i.quantity > 0);
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

/** Build a stable cart key from productId + optional variantId + sorted option ids */
function buildCartKey(productId: string, variantId: string | null | undefined, options: SelectedOption[]): string {
  const sortedOpts = [...options].map((o) => o.optionId).sort().join(',');
  return `${productId}|${variantId ?? ''}|${sortedOpts}`;
}

// ── View state machine ────────────────────────────────────────────────────────

type ViewState =
  | { kind: 'categories' }
  | { kind: 'products'; categoryId: string; categoryName: string; emoji: string; bg: string; textColor: string }
  | { kind: 'cart' }
  | { kind: 'done'; orderNumber: string; amountCents: number; stamps?: { count: number; total: number; goal: number } };

// ── Root export: provides StripeProvider ──────────────────────────────────────

export default function TableOrderRoute() {
  const { data: stripeConfigData } = useQuery({
    queryKey: ['stripe-config'],
    queryFn: () => api.payment.config(),
    staleTime: Infinity,
    retry: 1,
  });
  const publishableKey = stripeConfigData?.data?.publishableKey ?? '';

  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier={MERCHANT_ID}>
      <TableOrderScreen stripeReady={!!publishableKey} />
    </StripeProvider>
  );
}

// ── Inner screen ──────────────────────────────────────────────────────────────

function TableOrderScreen({ stripeReady }: { stripeReady: boolean }) {
  const { storeId, tableNumber } = useLocalSearchParams<{ storeId: string; tableNumber: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { confirmPayment } = useStripe();

  // Fetch me data to pre-fill phone
  const { data: meData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.auth.me(),
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
  });

  // Products + categories
  const { data: categoriesData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.products.categories(),
    staleTime: 5 * 60_000,
  });
  const { data: productsData, isLoading: prodsLoading } = useQuery({
    queryKey: ['products', 'menu', 'all'],
    queryFn: () => api.products.list({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const categories = categoriesData?.data ?? [];
  const allProducts = productsData?.data ?? [];

  // Local table cart (isolated from the global customer cart)
  const [cart, dispatch] = useReducer(cartReducer, []);
  const cartTotal = cart.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Navigation state
  const [view, setView] = useState<ViewState>({ kind: 'categories' });

  // Product options sheet
  const [sheetProduct, setSheetProduct] = useState<ApiProduct | null>(null);

  // Contact details for checkout
  const [contactName, setContactName]   = useState(user?.name ?? '');
  const [contactPhone, setContactPhone] = useState((meData?.user as any)?.phone ?? '');
  const [contactEmail] = useState(user?.email ?? '');

  // Payment state
  const [paying, setPaying]       = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [payError, setPayError]   = useState<string | null>(null);
  const pendingIntentRef = useRef<{ clientSecret: string; paymentIntentId: string } | null>(null);

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleBack = useCallback(() => {
    if (view.kind === 'products') { setView({ kind: 'categories' }); return; }
    if (view.kind === 'cart')     { setView({ kind: 'categories' }); return; }
    if (view.kind === 'done')     { router.canGoBack() ? router.back() : router.replace('/'); return; }
    router.canGoBack() ? router.back() : router.replace('/');
  }, [view]);

  /** Open the product options sheet; if the product has no options/variants, add directly */
  const handleProductTap = useCallback((product: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetProduct(product);
  }, []);

  /** Called by the sheet when user confirms their selection */
  const handleSheetAdd = useCallback((item: Omit<TableCartItem, 'quantity'>, quantity: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatch({ type: 'ADD_ITEM', item, quantity });
    setSheetProduct(null);
  }, []);

  // ── Pay handler ─────────────────────────────────────────────────────────────

  const handlePay = async () => {
    if (!stripeReady) {
      Alert.alert('Payment unavailable', 'Payment processing is not available right now.');
      return;
    }
    if (!contactName.trim()) {
      Alert.alert('Name required', 'Please enter your name before paying.');
      return;
    }
    if (cart.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaying(true);
    setPayError(null);

    try {
      // Create payment intent — include variantId + selectedOptions for server-side pricing
      const intentRes = await api.table.createPaymentIntent({
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          variantId: i.variantId ?? undefined,
          selectedOptions: i.selectedOptions.map((o) => ({
            optionId: o.optionId,
            groupId: o.groupId,
            priceAdjustmentCents: o.priceCents,
          })),
        })),
        tableNumber: tableNumber ?? '',
        storeId: storeId ?? '',
      });

      if (!intentRes.clientSecret) {
        setPayError('Could not start payment. Please try again.');
        setPaying(false);
        return;
      }

      pendingIntentRef.current = {
        clientSecret: intentRes.clientSecret,
        paymentIntentId: intentRes.paymentIntentId,
      };

      // Confirm card payment via Stripe
      const { paymentIntent, error } = await confirmPayment(intentRes.clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        if (error.code !== 'Canceled') {
          setPayError(error.localizedMessage ?? error.message ?? 'Payment failed.');
        }
        setPaying(false);
        return;
      }

      if (paymentIntent?.status !== 'Succeeded') {
        setPayError('Payment was not completed. Please try again.');
        setPaying(false);
        return;
      }

      // Record the order — include options so kitchen ticket shows customisations
      const orderRes = await api.table.placeOrder({
        stripePaymentIntentId: intentRes.paymentIntentId,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          name: i.name,
          unitCents: i.priceCents,
          variantId: i.variantId ?? undefined,
          variantName: i.variantName ?? undefined,
          selectedOptions: i.selectedOptions.map((o) => ({
            optionId: o.optionId,
            groupId: o.groupId,
            optionName: o.optionName,
            groupName: o.groupName,
            priceAdjustmentCents: o.priceCents,
          })),
          notes: i.notes || undefined,
        })),
        tableNumber: tableNumber ?? '',
        storeId: storeId ?? '',
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dispatch({ type: 'CLEAR' });
      setView({
        kind: 'done',
        orderNumber: orderRes.order.orderNumber,
        amountCents: orderRes.order.totalCents,
        stamps: orderRes.stamps,
      });
    } catch (err: any) {
      setPayError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // ── Prefill phone once meData loads ─────────────────────────────────────────

  React.useEffect(() => {
    const phone = (meData?.user as any)?.phone;
    if (phone && !contactPhone) setContactPhone(phone);
  }, [meData]);

  React.useEffect(() => {
    const name = user?.name ?? '';
    if (name && !contactName) setContactName(name);
  }, [user]);

  // ── Header ────────────────────────────────────────────────────────────────────

  const renderHeader = (title: string, showCart = true) => (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="arrow-left" size={22} color={TEXT} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.tableBadge}>
        <Text style={styles.tableBadgeLabel}>Table</Text>
        <Text style={styles.tableBadgeNum}>{tableNumber}</Text>
      </View>
      {showCart && cartCount > 0 && (
        <TouchableOpacity
          onPress={() => setView({ kind: 'cart' })}
          style={styles.cartChip}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={styles.cartChipText}>{cartCount} · {fmt(cartTotal)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Confirmation ─────────────────────────────────────────────────────────────

  if (view.kind === 'done') {
    const { orderNumber, amountCents, stamps } = view;
    return (
      <View style={[styles.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.doneWrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.doneCircle}>
            <Text style={{ fontSize: 40 }}>🍪</Text>
          </View>
          <Text style={styles.doneTitle}>Order placed!</Text>
          <Text style={styles.doneSub}>Sit tight — your order is on its way.</Text>

          <View style={styles.doneCard}>
            <View style={styles.doneRow}>
              <Text style={styles.doneRowLabel}>Order</Text>
              <Text style={styles.doneRowValue}>#{orderNumber}</Text>
            </View>
            <View style={[styles.doneRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.doneRowLabel}>Total paid</Text>
              <Text style={styles.doneRowValue}>{fmt(amountCents)}</Text>
            </View>
          </View>

          {stamps && stamps.count > 0 && (
            <View style={styles.stampsCard}>
              <Text style={styles.stampsEmoji}>☕</Text>
              <Text style={styles.stampsText}>
                {stamps.count} stamp{stamps.count !== 1 ? 's' : ''} added!
                {' '}You have {stamps.total}/{stamps.goal} stamps.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 28 }]}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Cart + checkout view ─────────────────────────────────────────────────────

  if (view.kind === 'cart') {
    return (
      <View style={[styles.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="dark-content" />
        {renderHeader('Your order', false)}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.cartScroll, { paddingBottom: insets.bottom + 120 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Items */}
            {cart.map((item) => (
              <View key={item.cartKey} style={styles.cartRow}>
                <View style={styles.cartRowLeft}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.cartThumb} />
                  ) : (
                    <View style={[styles.cartThumb, styles.cartThumbFallback]}>
                      <Text>🍪</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    {/* Show variant + options as a subtitle */}
                    {(item.variantName || item.selectedOptions.length > 0) && (
                      <Text style={styles.cartItemOptions} numberOfLines={2}>
                        {[
                          item.variantName,
                          ...item.selectedOptions.map((o) => o.optionName),
                        ].filter(Boolean).join(', ')}
                      </Text>
                    )}
                    <Text style={styles.cartItemPrice}>{fmt(item.priceCents)} each</Text>
                  </View>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'DEC', cartKey: item.cartKey }); }}
                    style={styles.qtyBtn}
                  >
                    <Feather name="minus" size={14} color={TEXT} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'INC', cartKey: item.cartKey }); }}
                    style={styles.qtyBtn}
                  >
                    <Feather name="plus" size={14} color={TEXT} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {cart.length === 0 && (
              <Text style={[styles.emptyText, { marginTop: 40 }]}>Your cart is empty.</Text>
            )}

            {/* Divider */}
            <View style={styles.sectionDivider} />

            {/* Contact */}
            <Text style={styles.sectionLabel}>Your details</Text>
            <TextInput
              style={styles.input}
              placeholder="Name *"
              placeholderTextColor={MUTED}
              value={contactName}
              onChangeText={setContactName}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor={MUTED}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />

            {/* Divider */}
            <View style={styles.sectionDivider} />

            {/* Card */}
            <Text style={styles.sectionLabel}>Payment</Text>
            {stripeReady ? (
              <CardField
                postalCodeEnabled={false}
                onCardChange={(details) => setCardComplete(details.complete)}
                style={styles.cardField}
                cardStyle={{
                  backgroundColor: CARD,
                  textColor: TEXT,
                  placeholderColor: MUTED,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 12,
                }}
              />
            ) : (
              <View style={[styles.cardField, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color={BLUE} />
              </View>
            )}

            {payError && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#D20001" />
                <Text style={styles.errorText}>{payError}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky pay button */}
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{fmt(cartTotal)}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (!cardComplete || cart.length === 0 || paying) && styles.primaryBtnDisabled,
            ]}
            onPress={handlePay}
            disabled={!cardComplete || cart.length === 0 || paying}
          >
            {paying
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.primaryBtnText}>Pay {fmt(cartTotal)}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Product list view ────────────────────────────────────────────────────────

  if (view.kind === 'products') {
    const { categoryId, categoryName, emoji, bg, textColor } = view;
    const products = allProducts.filter(
      (p) => (p.active || p.isSoldOut) &&
        (p.categoryId === categoryId || p.category === categories.find((c) => c.id === categoryId)?.slug)
    );
    const isDark = bg.startsWith('#1') || bg.startsWith('#0') || bg.startsWith('#2');

    return (
      <View style={[styles.root, { backgroundColor: BG }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Coloured category header */}
        <View style={[styles.catHeader, { backgroundColor: bg, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={isDark ? 'rgba(255,255,255,0.8)' : textColor} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.catHeaderEmoji]}>{emoji}</Text>
            <Text style={[styles.catHeaderTitle, { color: textColor }]}>{categoryName}</Text>
          </View>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeLabel}>Table</Text>
            <Text style={styles.tableBadgeNum}>{tableNumber}</Text>
          </View>
        </View>

        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.productList, { paddingBottom: insets.bottom + 100 }]}
          ListEmptyComponent={
            prodsLoading
              ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />
              : <Text style={styles.emptyText}>No items here yet.</Text>
          }
          renderItem={({ item: product }) => {
            const cartItems = cart.filter((i) => i.productId === product.id);
            const totalQty = cartItems.reduce((s, i) => s + i.quantity, 0);
            const price = product.salePriceCents ?? product.priceCents ?? 0;
            const soldOut = product.isSoldOut || !product.active;
            const hasOptions = product.hasVariants || (product as any).optionGroups?.length > 0;
            return (
              <TouchableOpacity
                style={[styles.productRow, soldOut && styles.productRowSoldOut]}
                onPress={() => { if (!soldOut) handleProductTap(product); }}
                activeOpacity={soldOut ? 1 : 0.7}
              >
                <View style={styles.productRowInfo}>
                  {product.images?.[0] ? (
                    <Image source={{ uri: product.images[0] }} style={styles.productThumb} />
                  ) : (
                    <View style={[styles.productThumb, styles.productThumbFallback]}>
                      <Text style={{ fontSize: 24 }}>🍪</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{product.name}</Text>
                    {product.description ? (
                      <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
                    ) : null}
                    <Text style={styles.productPrice}>{fmt(price)}</Text>
                    {soldOut && <Text style={styles.soldOutTag}>Sold out</Text>}
                    {hasOptions && !soldOut && (
                      <Text style={styles.customiseHint}>Tap to customise</Text>
                    )}
                  </View>
                </View>
                {!soldOut && (
                  totalQty > 0 ? (
                    <View style={[styles.addBtn, { backgroundColor: '#EDE8E1' }]}>
                      <Text style={[styles.qtyText, { minWidth: 0, color: DARK }]}>{totalQty}</Text>
                    </View>
                  ) : (
                    <View style={styles.addBtn}>
                      <Feather name="plus" size={16} color={CARD} />
                    </View>
                  )
                )}
              </TouchableOpacity>
            );
          }}
        />

        {/* Cart bar */}
        {cartCount > 0 && (
          <View style={[styles.cartBar, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity style={styles.cartBarBtn} onPress={() => setView({ kind: 'cart' })}>
              <View style={styles.cartBarBadge}>
                <Text style={styles.cartBarBadgeText}>{cartCount}</Text>
              </View>
              <Text style={styles.cartBarText}>View order</Text>
              <Text style={styles.cartBarPrice}>{fmt(cartTotal)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Product options bottom sheet */}
        {sheetProduct && (
          <ProductOptionsSheet
            product={sheetProduct}
            onClose={() => setSheetProduct(null)}
            onAdd={handleSheetAdd}
            insets={insets}
          />
        )}
      </View>
    );
  }

  // ── Categories grid ──────────────────────────────────────────────────────────

  const loading = catsLoading || prodsLoading;

  return (
    <View style={[styles.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingTitle}>What would you like?</Text>
        </View>
        <View style={styles.tableBadge}>
          <Text style={styles.tableBadgeLabel}>Table</Text>
          <Text style={styles.tableBadgeNum}>{tableNumber}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.catGrid, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {categories.map((cat, i) => {
            const { bg, text, emoji } = getCategoryColor(cat.slug, cat.name);
            const count = allProducts.filter(
              (p) => (p.active || p.isSoldOut) && (p.categoryId === cat.id || p.category === cat.slug)
            ).length;
            return (
              <Pressable
                key={cat.id}
                style={({ pressed }) => [
                  styles.catCard,
                  i < 2 ? styles.catCardTall : styles.catCardShort,
                  { backgroundColor: bg, opacity: pressed ? 0.9 : 1 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setView({ kind: 'products', categoryId: cat.id, categoryName: cat.name, emoji, bg, textColor: text });
                }}
              >
                <View style={[styles.catEmojiWrap, { backgroundColor: bg.startsWith('#1') ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                </View>
                <View style={{ marginTop: 'auto' as any }}>
                  {count > 0 && (
                    <Text style={[styles.catCount, { color: text, opacity: 0.6 }]}>
                      {count} item{count !== 1 ? 's' : ''}
                    </Text>
                  )}
                  <Text style={[styles.catName, { color: text, fontSize: i < 2 ? 20 : 16 }]}>
                    {cat.name.toUpperCase()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Cart bar */}
      {cartCount > 0 && (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.cartBarBtn} onPress={() => setView({ kind: 'cart' })}>
            <View style={styles.cartBarBadge}>
              <Text style={styles.cartBarBadgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBarText}>View order</Text>
            <Text style={styles.cartBarPrice}>{fmt(cartTotal)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── ProductOptionsSheet ───────────────────────────────────────────────────────

interface ProductOptionsSheetProps {
  product: ApiProduct;
  onClose: () => void;
  onAdd: (item: Omit<TableCartItem, 'quantity'>, quantity: number) => void;
  insets: { bottom: number; top: number };
}

function ProductOptionsSheet({ product, onClose, onAdd, insets }: ProductOptionsSheetProps) {
  // Fetch full product detail (with optionGroups + variants)
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['product-detail', product.id],
    queryFn: () => api.products.get(product.id),
    staleTime: 5 * 60_000,
  });

  const detail = detailData?.data as (ApiProduct & { variants?: any[]; optionGroups?: OptionGroup[] }) | undefined;
  const variants: Array<{ id: string; name: string; priceCents: number; isActive: boolean }> = detail?.variants ?? [];
  const optionGroups: OptionGroup[] = (detail?.optionGroups ?? []) as OptionGroup[];

  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState('');

  // Auto-select first variant
  React.useEffect(() => {
    if (variants.length > 0 && !selectedVariantId) {
      setSelectedVariantId(variants[0]!.id);
    }
  }, [variants.length]);

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const basePrice = (() => {
    if (selectedVariantId && variants.length > 0) {
      return variants.find((v) => v.id === selectedVariantId)?.priceCents
        ?? product.salePriceCents ?? product.priceCents ?? 0;
    }
    return product.salePriceCents ?? product.priceCents ?? 0;
  })();

  const optionExtra = Object.entries(selectedOptions).reduce((sum, [groupId, ids]) => {
    const group = optionGroups.find((g) => g.id === groupId);
    let s = 0;
    for (const optionId of ids) {
      s += group?.options.find((o) => o.id === optionId)?.priceAdjustmentCents ?? 0;
    }
    return sum + s;
  }, 0);

  const unitCents = basePrice + optionExtra;

  // Validate required groups are satisfied
  const canAdd = (() => {
    if (isLoading) return false;
    for (const group of optionGroups) {
      const min = group.minSelections ?? (group.required ? 1 : 0);
      const count = selectedOptions[group.id]?.size ?? 0;
      if (count < min) return false;
    }
    return true;
  })();

  function toggleOption(groupId: string, optionId: string, maxSelections: number) {
    setSelectedOptions((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        const effectiveMax = maxSelections <= 0 ? Infinity : maxSelections;
        if (effectiveMax === 1) {
          current.clear();
        } else if (current.size >= effectiveMax) {
          const [first] = current;
          current.delete(first!);
        }
        current.add(optionId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function handleAdd() {
    if (!canAdd) return;

    const builtOptions: SelectedOption[] = Object.entries(selectedOptions).flatMap(([groupId, ids]) => {
      const group = optionGroups.find((g) => g.id === groupId);
      return [...ids].map((optionId) => {
        const option = group?.options.find((o) => o.id === optionId);
        return {
          groupId,
          groupName: group?.name ?? '',
          optionId,
          optionName: option?.name ?? '',
          priceCents: option?.priceAdjustmentCents ?? 0,
        };
      });
    });

    const selectedVariant = variants.find((v) => v.id === selectedVariantId);
    const cartKey = buildCartKey(product.id, selectedVariantId, builtOptions);

    onAdd({
      cartKey,
      productId: product.id,
      name: product.name,
      priceCents: unitCents,
      imageUrl: product.images?.[0] ?? null,
      category: product.category ?? null,
      variantId: selectedVariantId,
      variantName: selectedVariant?.name ?? null,
      selectedOptions: builtOptions,
      notes: notes.trim() || undefined,
    }, quantity);
  }

  const image = product.images?.[0];

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Drag handle */}
          <View style={sheetStyles.handleWrap}>
            <View style={sheetStyles.handle} />
          </View>

          {/* Close button */}
          <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color={MUTED} />
          </TouchableOpacity>

          {/* Scrollable content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={sheetStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Hero image */}
            {image && (
              <View style={sheetStyles.heroWrap}>
                <Image source={{ uri: image }} style={sheetStyles.heroImage} />
              </View>
            )}

            {/* Name + price */}
            <View style={sheetStyles.nameRow}>
              <Text style={sheetStyles.productName}>{product.name}</Text>
              <Text style={sheetStyles.productPrice}>{fmt(unitCents)}</Text>
            </View>

            {/* Description */}
            {product.description ? (
              <Text style={sheetStyles.description}>{product.description}</Text>
            ) : null}

            {isLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={BLUE} />
              </View>
            )}

            {/* Variants (Size) */}
            {variants.length > 0 && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>Size</Text>
                <View style={sheetStyles.pillRow}>
                  {variants.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => { Haptics.selectionAsync(); setSelectedVariantId(v.id); }}
                      style={[sheetStyles.pill, selectedVariantId === v.id && sheetStyles.pillSelected]}
                    >
                      <Text style={[sheetStyles.pillText, selectedVariantId === v.id && sheetStyles.pillTextSelected]}>
                        {v.name}{v.priceCents ? ` · ${fmt(v.priceCents)}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Option groups */}
            {optionGroups.map((group) => {
              const min = group.minSelections ?? (group.required ? 1 : 0);
              const max = group.maxSelections ?? 1;
              const isMulti = max !== 1;
              const selected = selectedOptions[group.id] ?? new Set<string>();
              const count = selected.size;

              let badge = 'Optional';
              if (min > 0 && max > 1) badge = `Choose ${min}–${max}`;
              else if (min > 0) badge = 'Required';
              else if (max > 1) badge = `Up to ${max}`;

              return (
                <View key={group.id} style={sheetStyles.section}>
                  <View style={sheetStyles.sectionHeader}>
                    <Text style={sheetStyles.sectionTitle}>{group.name}</Text>
                    <View style={[sheetStyles.badge, min > 0 && sheetStyles.badgeRequired]}>
                      <Text style={[sheetStyles.badgeText, min > 0 && sheetStyles.badgeTextRequired]}>{badge}</Text>
                    </View>
                  </View>
                  {group.options.map((option) => {
                    const isSelected = selected.has(option.id);
                    const atMax = !isSelected && max > 0 && count >= max && !isMulti;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => {
                          if (atMax) return;
                          Haptics.selectionAsync();
                          toggleOption(group.id, option.id, max);
                        }}
                        style={[
                          sheetStyles.optionRow,
                          isSelected && sheetStyles.optionRowSelected,
                          atMax && sheetStyles.optionRowDisabled,
                        ]}
                        disabled={atMax}
                      >
                        {/* Radio / checkbox indicator */}
                        <View style={[
                          sheetStyles.optionIndicator,
                          isMulti ? sheetStyles.optionIndicatorCheckbox : sheetStyles.optionIndicatorRadio,
                          isSelected && sheetStyles.optionIndicatorSelected,
                        ]}>
                          {isSelected && (
                            <View style={[
                              sheetStyles.optionIndicatorDot,
                              isMulti ? sheetStyles.optionIndicatorDotCheckbox : sheetStyles.optionIndicatorDotRadio,
                            ]} />
                          )}
                        </View>
                        <Text style={[sheetStyles.optionName, isSelected && sheetStyles.optionNameSelected, atMax && sheetStyles.optionNameDisabled]}>
                          {option.name}
                        </Text>
                        {option.priceAdjustmentCents > 0 && (
                          <Text style={[sheetStyles.optionPrice, isSelected && sheetStyles.optionPriceSelected]}>
                            +{fmt(option.priceAdjustmentCents)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {/* Special instructions */}
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionTitle}>Special instructions</Text>
              <TextInput
                style={sheetStyles.notesInput}
                placeholder="Allergies, preferences, or requests…"
                placeholderTextColor={MUTED}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          {/* CTA bar */}
          <View style={sheetStyles.cta}>
            {/* Quantity stepper */}
            <View style={sheetStyles.stepper}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setQuantity(Math.max(1, quantity - 1)); }}
                style={sheetStyles.stepperBtn}
              >
                <Feather name="minus" size={14} color={TEXT} />
              </TouchableOpacity>
              <Text style={sheetStyles.stepperQty}>{quantity}</Text>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setQuantity(quantity + 1); }}
                style={sheetStyles.stepperBtn}
              >
                <Feather name="plus" size={14} color={TEXT} />
              </TouchableOpacity>
            </View>

            {/* Add button */}
            <TouchableOpacity
              style={[sheetStyles.addBtn, !canAdd && sheetStyles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!canAdd}
            >
              <Text style={[sheetStyles.addBtnText, !canAdd && sheetStyles.addBtnTextDisabled]}>
                {canAdd
                  ? `Add to order · ${fmt(unitCents * quantity)}`
                  : 'Select required options'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:                { flex: 1 },
  // Header
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 10, backgroundColor: BG },
  backBtn:             { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  headerTitle:         { flex: 1, fontSize: 18, fontWeight: '600', color: TEXT },
  greetingTitle:       { fontSize: 22, fontWeight: '700', color: TEXT },
  tableBadge:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE8E1', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  tableBadgeLabel:     { fontSize: 11, fontWeight: '500', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableBadgeNum:       { fontSize: 14, fontWeight: '700', color: TEXT },
  cartChip:            { backgroundColor: DARK, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  cartChipText:        { color: CARD, fontSize: 13, fontWeight: '600' },
  // Categories
  catGrid:             { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  catCard:             { borderRadius: 24, overflow: 'hidden', padding: 16, width: '47%' },
  catCardTall:         { height: 200 },
  catCardShort:        { height: 148 },
  catEmojiWrap:        { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  catCount:            { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  catName:             { fontWeight: '800', letterSpacing: -0.3 },
  loadingWrap:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText:           { textAlign: 'center', color: MUTED, fontSize: 15 },
  // Category product list header
  catHeader:           { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  catHeaderEmoji:      { fontSize: 28, marginBottom: 2 },
  catHeaderTitle:      { fontSize: 24, fontWeight: '700', marginTop: 4 },
  // Products
  productList:         { paddingHorizontal: 14, paddingTop: 10 },
  productRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  productRowSoldOut:   { opacity: 0.5 },
  productRowInfo:      { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  productThumb:        { width: 64, height: 64, borderRadius: 12 },
  productThumbFallback:{ backgroundColor: '#F0EDE8', justifyContent: 'center', alignItems: 'center' },
  productName:         { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 2 },
  productDesc:         { fontSize: 12, color: MUTED, lineHeight: 17, marginBottom: 4 },
  productPrice:        { fontSize: 14, fontWeight: '600', color: TEXT },
  soldOutTag:          { fontSize: 11, color: MUTED, fontWeight: '500', marginTop: 2 },
  customiseHint:       { fontSize: 11, color: BLUE, fontWeight: '500', marginTop: 2 },
  addBtn:              { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  qtyRow:              { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  qtyBtn:              { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F0EDE8', justifyContent: 'center', alignItems: 'center' },
  qtyText:             { fontSize: 15, fontWeight: '700', color: TEXT, minWidth: 18, textAlign: 'center' },
  // Cart bar
  cartBar:             { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'transparent' },
  cartBarBtn:          { backgroundColor: DARK, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 8 },
  cartBarBadge:        { backgroundColor: AMBER, borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  cartBarBadgeText:    { color: DARK, fontSize: 12, fontWeight: '700' },
  cartBarText:         { flex: 1, color: CARD, fontSize: 16, fontWeight: '600' },
  cartBarPrice:        { color: AMBER, fontSize: 16, fontWeight: '700' },
  // Cart screen
  cartScroll:          { paddingHorizontal: 16, paddingTop: 12 },
  cartRow:             { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cartRowLeft:         { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  cartThumb:           { width: 52, height: 52, borderRadius: 10 },
  cartThumbFallback:   { backgroundColor: '#F0EDE8', justifyContent: 'center', alignItems: 'center' },
  cartItemName:        { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 2 },
  cartItemOptions:     { fontSize: 11, color: MUTED, marginBottom: 2, lineHeight: 15 },
  cartItemPrice:       { fontSize: 12, color: MUTED },
  sectionDivider:      { height: 1, backgroundColor: BORDER, marginVertical: 20 },
  sectionLabel:        { fontSize: 13, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  input:               { backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: TEXT, borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  cardField:           { height: 54, marginBottom: 8 },
  errorBox:            { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF0F0', borderRadius: 10, padding: 12, marginTop: 4 },
  errorText:           { flex: 1, fontSize: 13, color: '#D20001' },
  // Sticky pay bar
  stickyBar:           { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER },
  totalRow:            { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  totalLabel:          { fontSize: 15, color: MUTED, fontWeight: '500' },
  totalAmount:         { fontSize: 15, fontWeight: '700', color: TEXT },
  primaryBtn:          { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnDisabled:  { backgroundColor: '#B0C4D8' },
  primaryBtnText:      { color: CARD, fontSize: 17, fontWeight: '700' },
  // Confirmation
  doneWrap:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  doneCircle:          { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFF8EE', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  doneTitle:           { fontSize: 28, fontWeight: '800', color: TEXT, marginBottom: 8, textAlign: 'center' },
  doneSub:             { fontSize: 16, color: MUTED, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  doneCard:            { backgroundColor: CARD, borderRadius: 16, width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  doneRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  doneRowLabel:        { fontSize: 15, color: MUTED },
  doneRowValue:        { fontSize: 15, fontWeight: '700', color: TEXT },
  stampsCard:          { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8EE', borderRadius: 14, padding: 14, marginTop: 16, width: '100%' },
  stampsEmoji:         { fontSize: 24 },
  stampsText:          { flex: 1, fontSize: 14, color: TEXT, lineHeight: 20 },
});

// Sheet-specific styles
const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0CCC8',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0EDE8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 8,
  },
  heroWrap: {
    height: 200,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 12,
  },
  productName: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 26,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    paddingTop: 2,
  },
  description: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#F0EDE8',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 10,
  },
  badgeRequired: {
    backgroundColor: '#FFF0EC',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
  },
  badgeTextRequired: {
    color: '#E05030',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F0EDE8',
  },
  pillSelected: {
    backgroundColor: DARK,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  pillTextSelected: {
    color: CARD,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F1EE',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    gap: 12,
  },
  optionRowSelected: {
    backgroundColor: DARK,
  },
  optionRowDisabled: {
    opacity: 0.4,
  },
  optionIndicator: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#B0AAA4',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  optionIndicatorRadio: {
    borderRadius: 9,
  },
  optionIndicatorCheckbox: {
    borderRadius: 4,
  },
  optionIndicatorSelected: {
    borderColor: CARD,
  },
  optionIndicatorDot: {
    backgroundColor: DARK,
  },
  optionIndicatorDotRadio: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CARD,
  },
  optionIndicatorDotCheckbox: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: CARD,
  },
  optionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: TEXT,
  },
  optionNameSelected: {
    color: CARD,
    fontWeight: '600',
  },
  optionNameDisabled: {
    color: MUTED,
  },
  optionPrice: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  optionPriceSelected: {
    color: 'rgba(255,255,255,0.65)',
  },
  notesInput: {
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    minHeight: 70,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: CARD,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EDE8',
    borderRadius: 12,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 38,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperQty: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    minWidth: 22,
    textAlign: 'center',
  },
  addBtn: {
    flex: 1,
    backgroundColor: DARK,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#EDE8E1',
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: CARD,
  },
  addBtnTextDisabled: {
    color: '#B0AAA4',
  },
});
