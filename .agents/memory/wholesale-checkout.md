---
name: Wholesale checkout flow architecture
description: How the wholesale checkout overlay works — moved from catalog to cart tab as a Modal
---

## Rule
The wholesale checkout flow lives in `cart.tsx` as a React Native `<Modal animationType="slide" presentationStyle="pageSheet">`. It covers the entire screen including the tab bar.

**Why:** The old approach embedded the checkout overlay inside `catalog.tsx` and triggered it via `WS_OPEN_CHECKOUT_KEY` AsyncStorage flag + tab navigation. This caused the tab bar to show through the overlay and confused users who expected checkout to be in the Cart tab.

## How to apply
- `cart.tsx` exports `WS_CART_KEY` and `WS_OPEN_CHECKOUT_KEY` constants — import from here.
- `catalog.tsx` imports both keys and uses them only for the **reorder flow**: builds cart → saves to `WS_CART_KEY` → sets `WS_OPEN_CHECKOUT_KEY` → navigates to `/(wholesale)/cart`.
- `cart.tsx` useFocusEffect reads both keys on focus: loads cart from storage, opens checkout modal if flag is set.
- `catalog.tsx` has NO checkout state, NO checkout overlay, NO floating cart bar. It's purely a product browser.
- Cart footer (total + "Proceed to Checkout") is a `ListFooterComponent` on the FlatList — not absolute positioned — so it never overlaps the floating tab bar.
