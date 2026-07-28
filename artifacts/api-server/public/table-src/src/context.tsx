import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
import type { CartItem, TableConfig, Screen, OrderConfirmation } from "./types";
import { randomId } from "./utils";

// ── Cart state ────────────────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "ADD"; item: Omit<CartItem, "id"> }
  | { type: "UPDATE_QTY"; id: string; delta: number }
  | { type: "REMOVE"; id: string }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      // Check if an identical item already exists (same product, variant, options)
      const key = itemKey(action.item);
      const existing = state.items.find((i) => itemKey(i) === key);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + action.item.quantity } : i
          ),
        };
      }
      return { items: [...state.items, { ...action.item, id: randomId() }] };
    }
    case "UPDATE_QTY": {
      const next = state.items
        .map((i) => (i.id === action.id ? { ...i, quantity: i.quantity + action.delta } : i))
        .filter((i) => i.quantity > 0);
      return { items: next };
    }
    case "REMOVE":
      return { items: state.items.filter((i) => i.id !== action.id) };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

function itemKey(item: Omit<CartItem, "id">): string {
  const opts = [...item.selectedOptions]
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((o) => o.optionId)
    .join("|");
  // Include notes in the key so items with different special instructions are kept separate.
  // This matters for allergy/preference notes — merging them would silently lose instructions.
  const notePart = item.notes?.trim() ?? "";
  return `${item.productId}::${item.variantId ?? ""}::${opts}::${notePart}`;
}

// ── App context ───────────────────────────────────────────────────────────────

interface AppContextValue {
  config: TableConfig;
  cart: CartItem[];
  screen: Screen;
  confirmation: OrderConfirmation | null;
  cartTotal: number;
  cartCount: number;
  addToCart: (item: Omit<CartItem, "id">) => void;
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  goTo: (screen: Screen) => void;
  setConfirmation: (c: OrderConfirmation) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  config,
  children,
}: {
  config: TableConfig;
  children: ReactNode;
}) {
  const [cartState, dispatch] = useReducer(cartReducer, { items: [] });
  const [screen, setScreen] = useReducer((_: Screen, s: Screen) => s, "menu" as Screen);
  const [confirmation, setConfirmation] = useReducer(
    (_: OrderConfirmation | null, c: OrderConfirmation | null) => c,
    null
  );

  const addToCart = useCallback((item: Omit<CartItem, "id">) => dispatch({ type: "ADD", item }), []);
  const updateQty = useCallback((id: string, delta: number) => dispatch({ type: "UPDATE_QTY", id, delta }), []);
  const removeFromCart = useCallback((id: string) => dispatch({ type: "REMOVE", id }), []);
  const clearCart = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const goTo = useCallback((s: Screen) => setScreen(s), []);

  const cartTotal = cartState.items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const cartCount = cartState.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <AppContext.Provider
      value={{
        config,
        cart: cartState.items,
        screen,
        confirmation,
        cartTotal,
        cartCount,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
        goTo,
        setConfirmation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
