---
name: Wholesale portal design system
description: Color tokens and glass card pattern used across all wholesale screens
---

## Rule
Every card surface in the wholesale portal uses the glass token set, not plain CARD/BORDER.

**Why:** Consistent glass effect across all 5 screens was requested — index.tsx was done first, then cart, catalog, orders, profile were updated to match.

## Tokens
```ts
const BG         = '#EFF6FF';   // page background (light blue)
const CARD       = '#FFFFFF';   // plain white (use only inside modals/checkout)
const BLUE       = '#1493FF';   // primary action / price
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = { shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:14, elevation:3 };
```

## Applied to
- `index.tsx` — stat cards, KPI strip, order list cards (done earlier)
- `cart.tsx` — cart item cards, summary card, checkout button
- `catalog.tsx` — CompactProductRow (product list rows)
- `orders.tsx` — orderCard, invoiceCard, payMethod row
- `profile.tsx` — stat strip cards, Group sections, creditCard

## FlatList padding
All wholesale FlatLists use `paddingBottom: 120` (minimum) so content clears the FloatingInternalTabBar.
