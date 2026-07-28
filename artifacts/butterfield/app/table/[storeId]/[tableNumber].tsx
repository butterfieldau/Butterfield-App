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

// ── Local cart ─────────────────────────────────────────────────────────────────

interface TableCartItem {
  id: string;           // productId used as key
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string | null;
  category?: string | null;
}

type CartAction =
  | { type: 'ADD'; product: ApiProduct }
  | { type: 'INC'; productId: string }
  | { type: 'DEC'; productId: string }
  | { type: 'CLEAR' };

function cartReducer(state: TableCartItem[], action: CartAction): TableCartItem[] {
  switch (action.type) {
    case 'ADD': {
      const p = action.product;
      const price = p.salePriceCents ?? p.priceCents ?? 0;
      const existing = state.find((i) => i.productId === p.id);
      if (existing) {
        return state.map((i) => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...state, {
        id: p.id,
        productId: p.id,
        name: p.name,
        priceCents: price,
        quantity: 1,
        imageUrl: p.images?.[0] ?? null,
        category: p.category ?? null,
      }];
    }
    case 'INC':
      return state.map((i) => i.productId === action.productId ? { ...i, quantity: i.quantity + 1 } : i);
    case 'DEC':
      return state
        .map((i) => i.productId === action.productId ? { ...i, quantity: i.quantity - 1 } : i)
        .filter((i) => i.quantity > 0);
    case 'CLEAR':
      return [];
    default:
      return state;
  }
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
      // Create payment intent
      const intentRes = await api.table.createPaymentIntent({
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
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

      // Record the order
      const orderRes = await api.table.placeOrder({
        stripePaymentIntentId: intentRes.paymentIntentId,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name, unitCents: i.priceCents })),
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
              <View key={item.productId} style={styles.cartRow}>
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
                    <Text style={styles.cartItemPrice}>{fmt(item.priceCents)} each</Text>
                  </View>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'DEC', productId: item.productId }); }}
                    style={styles.qtyBtn}
                  >
                    <Feather name="minus" size={14} color={TEXT} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'INC', productId: item.productId }); }}
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
            const inCart = cart.find((i) => i.productId === product.id);
            const price = product.salePriceCents ?? product.priceCents ?? 0;
            const soldOut = product.isSoldOut || !product.active;
            return (
              <View style={[styles.productRow, soldOut && styles.productRowSoldOut]}>
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
                  </View>
                </View>
                {!soldOut && (
                  inCart ? (
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'DEC', productId: product.id }); }}
                        style={styles.qtyBtn}
                      >
                        <Feather name="minus" size={14} color={TEXT} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{inCart.quantity}</Text>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); dispatch({ type: 'INC', productId: product.id }); }}
                        style={styles.qtyBtn}
                      >
                        <Feather name="plus" size={14} color={TEXT} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'ADD', product }); }}
                      style={styles.addBtn}
                    >
                      <Feather name="plus" size={16} color={CARD} />
                    </TouchableOpacity>
                  )
                )}
              </View>
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
