import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem } from '@/types';

const CART_STORAGE_KEY = '@butterfield_cart';

// ── nano-id for unique cart line IDs ──────────────────────────────────────
let _counter = 0;
function cartLineId() { return `cli_${Date.now()}_${++_counter}`; }

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalPriceCents: number;
  /** Legacy: price in dollars (backwards compat) */
  totalPrice: number;
  addItemToCart: (item: Omit<CartItem, 'cartItemId' | 'optionsTotalCents' | 'unitPriceCents'>) => void;
  updateItemQuantity: (cartItemId: string, quantity: number) => void;
  removeCartItem: (cartItemId: string) => void;
  clearCart: () => void;
  /** True when cart was rehydrated from a previous session on this device */
  cartRestoredFromSession: boolean;
  dismissCartRestoredBanner: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems]                             = useState<CartItem[]>([]);
  const [hydrated, setHydrated]                       = useState(false);
  const [cartRestoredFromSession, setCartRestoredFromSession] = useState(false);
  const isFirstWrite = useRef(true);

  // ── Rehydrate from AsyncStorage on mount ──────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then(val => {
        if (val) {
          try {
            const parsed = JSON.parse(val) as CartItem[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setItems(parsed);
              setCartRestoredFromSession(true);
            }
          } catch {
            // Corrupt data — start fresh
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setHydrated(true);
        isFirstWrite.current = false;
      });
  }, []);

  // ── Persist to AsyncStorage on every items change (after hydration) ───
  useEffect(() => {
    if (!hydrated) return;
    if (isFirstWrite.current) { isFirstWrite.current = false; return; }
    if (items.length === 0) {
      AsyncStorage.removeItem(CART_STORAGE_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(() => {});
    }
  }, [items, hydrated]);

  const addItemToCart = useCallback((raw: Omit<CartItem, 'cartItemId' | 'optionsTotalCents' | 'unitPriceCents'>) => {
    const optionsTotalCents = (raw.selectedOptions ?? []).reduce((s, o) => s + o.priceAdjustmentCents, 0);
    const unitPriceCents    = raw.basePriceCents + optionsTotalCents;

    // Two items with identical product + variant + options = merge quantity
    setItems(prev => {
      const match = prev.find(i =>
        i.productId === raw.productId &&
        i.variantId === raw.variantId &&
        JSON.stringify(i.selectedOptions) === JSON.stringify(raw.selectedOptions ?? [])
      );
      if (match) {
        return prev.map(i => i.cartItemId === match.cartItemId ? { ...i, quantity: i.quantity + raw.quantity } : i);
      }
      return [...prev, { ...raw, cartItemId: cartLineId(), optionsTotalCents, unitPriceCents }];
    });
  }, []);

  const updateItemQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    } else {
      setItems(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity } : i));
    }
  }, []);

  const removeCartItem = useCallback((cartItemId: string) => {
    setItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCartRestoredFromSession(false);
    AsyncStorage.removeItem(CART_STORAGE_KEY).catch(() => {});
  }, []);

  const dismissCartRestoredBanner = useCallback(() => {
    setCartRestoredFromSession(false);
  }, []);

  const totalItems      = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const totalPriceCents = useMemo(() => items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0), [items]);
  const totalPrice      = useMemo(() => totalPriceCents / 100, [totalPriceCents]);

  const value = useMemo(() => ({
    items, totalItems, totalPriceCents, totalPrice,
    addItemToCart, updateItemQuantity, removeCartItem, clearCart,
    cartRestoredFromSession, dismissCartRestoredBanner,
  }), [items, totalItems, totalPriceCents, totalPrice,
    addItemToCart, updateItemQuantity, removeCartItem, clearCart,
    cartRestoredFromSession, dismissCartRestoredBanner]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
