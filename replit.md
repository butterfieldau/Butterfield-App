# Butterfield Cookies — Premium iOS App (Full-Stack)

## Overview
A premium iOS mobile app for Butterfield Cookies, a Sydney-based cookie, coffee, and dessert café brand.
Built with Expo SDK 54 + React Native. Backed by a real Express + PostgreSQL API server with JWT auth, Stripe integration (AUD), and full role-based portals.

## Architecture

```
artifacts/
  butterfield/          ← Expo mobile app (iOS + web preview)
  api-server/           ← Express + TypeScript API server (port 8080 → /api proxy)
lib/
  db/                   ← Drizzle ORM schema + migrations (PostgreSQL)
scripts/
  src/seed-products.ts  ← Stripe product seeder (run after connecting Stripe)
```

## API Server
- Base path: `/api` (proxied from Expo app via `EXPO_PUBLIC_DOMAIN/api`)
- Auth: JWT bearer tokens (signed with `SESSION_SECRET` env var)
- Stripe: gracefully skips init if integration not connected
- Logging: pino structured JSON logs via `req.log`

### Route Map
| Route | Auth | Description |
|-------|------|-------------|
| POST /api/auth/register | — | Customer registration |
| POST /api/auth/login | — | Login (all roles) |
| POST /api/auth/staff-login | — | Staff login (validates staff role) |
| POST /api/auth/wholesale-apply | — | Wholesale application (pending status) |
| GET /api/auth/me | JWT | Current user + profile |
| GET /api/products | — | All active products from stripe.products |
| GET /api/orders | JWT | Customer's own orders |
| POST /api/orders | JWT | Create order (earns loyalty points) |
| PATCH /api/orders/:id/status | JWT | Advance order status |
| GET /api/loyalty/profile | JWT | Loyalty profile (points, tier, stamps) |
| GET /api/loyalty/rewards | JWT | Available reward catalog |
| POST /api/loyalty/redeem | JWT | Redeem reward for points |
| GET /api/loyalty/transactions | JWT | Points transaction history |
| GET /api/staff/shifts/current | staff | Active shift for current user |
| POST /api/staff/shifts/clock-in | staff | Clock in (creates shift) |
| POST /api/staff/shifts/clock-out | staff | Clock out (records hours) |
| GET /api/staff/orders | staff | ALL customer orders queue |
| GET /api/staff/tasks | staff | Task checklist (filterable by category) |
| PATCH /api/staff/tasks/:id/complete | staff | Mark task complete/incomplete |
| POST /api/staff/wastage | staff | Log product wastage |
| POST /api/staff/issues | staff | Report issue |
| POST /api/staff/leave | staff | Submit leave request |
| GET /api/wholesale/account | wholesale | Account details (company, tier, credit) |
| GET /api/wholesale/products | wholesale | Product catalog (same as /api/products) |
| GET /api/wholesale/orders | wholesale | Wholesale order history |
| POST /api/wholesale/orders | wholesale | Place wholesale order |
| GET /api/announcements | JWT | All active announcements |
| GET/POST /api/favourites | JWT | Favourites list |
| POST /api/feedback | JWT | Submit feedback |
| POST /api/waitlist | JWT | Join waitlist |
| POST /api/payment/payment-intent | JWT | Create Stripe payment intent |
| POST /api/stripe/webhook | — | Stripe webhook handler |

## Three Distinct Role-Based Experiences

### 1. Customer Portal (`/(customer)/`)
- **Home**: Caramel gradient hero, loyalty points chip, daily special banner, fan favourites scroll, category-filtered product grid
- **Menu**: Full product catalog (from Stripe) with search + category filter, product cards with gradient thumbnails
- **Cart**: Quantity controls, Mon/Thu delivery slot picker, loyalty points redemption, Stripe payment sheet
- **Loyalty/Rewards**: Points balance, tier progress (Bronze/Silver/Gold/Platinum), stamp card, reward catalog, transaction history
- **Profile**: User stats, referral code, birthday bonus, settings

### 2. Staff Portal (`/(staff)/`)
- Dark chocolate theme (`#0D0604` / `#1A0A04`)
- **Dashboard**: Clock in/out with live shift timer, task progress bar, quick action grid, pending task list
- **Orders**: Full order queue for ALL customer orders, filterable by status, one-tap status advancement
- **Tasks**: Checklist by category (opening/prep/cleaning/daily/closing/training), tap to complete
- Also: wastage log, issue reports, leave requests (modals on Tasks screen)
- **Products**: Availability toggle switches per product
- **Profile**: Employee details, shift history

### 3. Wholesale Portal (`/(wholesale)/`)
- Forest green theme (`#0A1A0A` / `#122012`)
- **Dashboard**: YTD stats, recent orders, account manager contact
- **Catalog**: Tiered wholesale pricing (10%/20%/30% discount at 10/25/50+ units), per-product qty input, cart summary with PO reference
- **Orders**: Order history with status tracking
- **Invoices**: Outstanding balance summary
- **Profile**: Company details, ABN, payment terms, credit utilisation, cut-off schedule

## Database (PostgreSQL)

### Public Schema Tables
- `users` — email/password_hash/role (customer|staff|wholesale)/name/phone
- `customer_profiles` — loyalty_points, loyalty_tier, stamp_count, referral_code, birthday
- `staff_profiles` — employee_id, position, department, is_manager
- `wholesale_accounts` — company_name, abn, pricing_tier, credit_limit_cents, payment_terms, status
- `orders` — status, type (pickup/delivery), items (jsonb), total_cents, loyalty_points_earned
- `order_items` — normalized order line items
- `loyalty_transactions` — earn/redeem/expire/bonus transaction log
- `loyalty_rewards` — reward catalog (9 rewards seeded)
- `staff_shifts` — clock_in, clock_out, hours_worked
- `staff_tasks` — 25 tasks seeded (opening/prep/cleaning/daily/closing/training)
- `staff_wastage` — product wastage log
- `staff_issues` — issue reports with priority/status
- `staff_leave_requests` — leave requests with approval flow
- `wholesale_orders` — bulk orders with PO reference
- `announcements` — 4 seeded (2 active)
- `favourites`, `feedback`, `waitlists`

### Stripe Schema Tables (stripe.products, stripe.prices)
- Created manually; seeded with 15 Butterfield products across 5 categories
- Categories: cookies (5), coffee (4), desserts (3), sandwiches (2), bundles (1)
- Prices in AUD cents (e.g. Flat White = 550 = $5.50)
- Will sync automatically once Stripe integration is connected

## Auth Flow
- `/(tabs)/index.tsx` — gateway: checks JWT, redirects by role
- `/(auth)/login.tsx` — three-role selector (Customer/Staff/Wholesale) + email/password
- `AuthContext.tsx` — real JWT-backed context with AsyncStorage persistence
- Customers: register via app; Staff/Wholesale: created via admin or seeded

## Test Accounts (for development)
| Role | Email | Password |
|------|-------|----------|
| Customer | test@butterfield.com | test1234 |
| Staff | staff@butterfield.com | staff1234 |
| Wholesale | wholesale@butterfield.com | wholesale1234 |

## Brand Design
- **Palette**: Background `#FBF7F2` (cream), Primary `#C8833A` (caramel), Dark `#4A2410` (chocolate)
- **Typography**: Inter 400/500/600/700 (Google Fonts)
- **Icons**: @expo/vector-icons Feather set
- **Animations**: react-native-reanimated press feedback
- **Haptics**: expo-haptics on all interactive actions
- **Tab bars**: NativeTabs (liquid glass iOS 26+) with classic Tabs + BlurView fallback

## Tech Stack
- **Mobile**: Expo SDK 54, expo-router ~6.0.23, React Native 0.81.5
- **API**: Express 5, TypeScript, pino logging, Zod validation
- **DB**: Drizzle ORM + PostgreSQL (drizzle-kit push for schema)
- **Auth**: JWT (jsonwebtoken) + bcryptjs, SESSION_SECRET env var
- **Payments**: Stripe (AUD) — graceful init, requires Stripe integration connection
- **State**: @tanstack/react-query for all API calls, React Context for auth/cart
- **Currency**: AUD, all prices stored as cents integers

## Pending Items
- **Stripe integration**: Connect via Replit Integrations → run `pnpm --filter @workspace/scripts run seed-products` to sync real Stripe products
- **Push notifications**: expo-notifications scaffolded but not wired to backend
- **Image uploads**: expo-image-picker available but product images use gradient placeholders

## Key Files
- `artifacts/butterfield/lib/api.ts` — typed fetch wrapper for all API calls
- `artifacts/butterfield/context/AuthContext.tsx` — JWT auth context
- `artifacts/butterfield/context/CartContext.tsx` — cart state
- `artifacts/butterfield/types/index.ts` — shared TypeScript types
- `artifacts/api-server/src/app.ts` — Express app with CORS + webhook handler
- `artifacts/api-server/src/routes/` — all route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware
- `lib/db/src/schema/` — all Drizzle schema files
- `scripts/src/seed-products.ts` — Stripe product seeder
