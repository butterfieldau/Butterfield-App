import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { CartItem, SelectedCartOption } from '@/types';

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
  /** @deprecated Use addItemToCart */
  addItem: (product: any) => void;
  /** @deprecated Use removeCartItem */
  removeItem: (productId: string) => void;
  /** @deprecated Use updateItemQuantity */
  updateQuantity: (productId: string, quantity: number) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

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

  const clearCart = useCallback(() => setItems([]), []);

  // ── Legacy compat ────────────────────────────────────────────────────────
  const addItem = useCallback((product: any) => {
    addItemToCart({
      productId: product.id ?? product.product?.id ?? 'unknown',
      productName: product.name ?? product.product?.name ?? 'Item',
      basePriceCents: Math.round((product.price ?? (product.priceCents ?? 0) / 100) * 100),
      selectedOptions: [],
      quantity: 1,
      imageUrl: product.images?.[0] ?? product.imageUrl,
      category: product.category ?? product.metadata?.category,
    });
  }, [addItemToCart]);

  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.productId !== productId));
    } else {
      setItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity } : i));
    }
  }, []);

  const totalItems      = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const totalPriceCents = useMemo(() => items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0), [items]);
  const totalPrice      = useMemo(() => totalPriceCents / 100, [totalPriceCents]);

  const value = useMemo(() => ({
    items, totalItems, totalPriceCents, totalPrice,
    addItemToCart, updateItemQuantity, removeCartItem, clearCart,
    addItem, removeItem, updateQuantity,
  }), [items, totalItems, totalPriceCents, totalPrice,
    addItemToCart, updateItemQuantity, removeCartItem, clearCart,
    addItem, removeItem, updateQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
