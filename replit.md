# Butterfield Cookies — Premium iOS App

## Overview
A premium iOS mobile app for Butterfield Cookies, a Sydney-based cookie, coffee, and dessert café brand. Built with Expo SDK 54 and React Native.

## Three Distinct Role-Based Experiences

### 1. Customer App (`/(customer)/`)
- **Home**: Caramel gradient hero, loyalty points chip, promo banner, fan favourites horizontal scroll, category-filtered product grid
- **Menu**: Full product catalog with search bar + category filter
- **Cart**: Quantity controls, order summary, loyalty points preview, mock checkout flow with success state
- **Loyalty/Rewards**: Points balance, Silver/Gold/Platinum tiers, progress bar, reward redemption catalog, transaction history
- **Profile**: User stats, settings menu, sign out

### 2. Staff Portal (`/(staff)/`)
- Dark chocolate theme (`#0D0604` / `#1A0A04`)
- **Dashboard**: Revenue, active/pending/completed stats, quick action grid, live order cards with status advancement
- **Orders**: Filterable queue by status (Pending / In Progress / Ready / Completed), one-tap status progression
- **Products**: Availability toggle switches per product with category filter, "On Shift" badge
- **Profile**: Staff ID, shift details, daily performance stats

### 3. Wholesale Portal (`/(wholesale)/`)
- Forest green theme (`#F2F8F5` / `#1A3A2A`)
- **Dashboard**: Credit limit progress bar, YTD spend stats, recent order cards, account manager contact
- **Catalog**: Wholesale pricing tiers (per min-quantity), per-product quantity selector, add-to-order flow
- **Orders**: Full order history with delivery dates, reorder & invoice download actions
- **Invoices**: Outstanding balance summary, overdue alerts, Pay Now CTA, PDF download
- **Account**: Company details, delivery address, payment terms, team management

## Auth Flow
- `/(tabs)/index.tsx` — auth gateway, checks AsyncStorage, redirects by role
- `/(auth)/login.tsx` — three-role selector cards (Customer / Staff / Wholesale) + email/password fields
- `AuthContext` — persists user to AsyncStorage
- Demo login: select any role → tap Continue (any email/password works)

## Brand Design
- **Palette**: Background `#FBF7F2` (cream), Primary `#C8833A` (caramel), Accent `#4A2410` (chocolate), Border `#E8DDD0`
- **Typography**: Inter 400/500/600/700 (Google Fonts)
- **Radius**: 16px
- **Animations**: react-native-reanimated press feedback on product cards
- **Haptics**: expo-haptics on all interactive actions
- **Tab bars**: NativeTabs (liquid glass on iOS 26+) with classic Tabs + BlurView fallback

## Tech Stack
- Expo SDK 54 / expo-router ~6.0.17 / React Native 0.81.5
- AsyncStorage for auth persistence (no backend needed)
- expo-linear-gradient for all gradients
- expo-haptics for tactile feedback
- expo-glass-effect + expo-blur for tab bar effects
- @expo/vector-icons (Feather) for all icons

## Key Files
- `artifacts/butterfield/context/AuthContext.tsx` — auth state + AsyncStorage
- `artifacts/butterfield/context/CartContext.tsx` — cart state
- `artifacts/butterfield/data/mockData.ts` — all mock products, orders, invoices, loyalty data
- `artifacts/butterfield/types/index.ts` — TypeScript interfaces
- `artifacts/butterfield/constants/colors.ts` — Butterfield warm palette

## Generated Assets
- `assets/images/icon.png` — app icon (cookie on cream)
- `assets/images/cookie-hero.png`, `coffee-hero.png`, `dessert-hero.png`, `cafe-hero.png` — brand imagery
