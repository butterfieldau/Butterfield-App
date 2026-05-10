# Butterfield Cookies — Premium iOS App (Full-Stack)

## Overview
A premium iOS mobile app for Butterfield Cookies, a Sydney-based cookie, coffee, and dessert café brand.
Built with Expo SDK 54 + React Native. Backed by a real Express + PostgreSQL API server with JWT auth, Stripe integration (AUD), and full role-based portals.

## Brand Design (Updated)
- **Customer portal primary**: Cobalt `#0212EE` / darker `#0110CC` (header gradients, icons, tab tints, CTAs)
- **Customer portal background**: `#F5F6FA` (original light grey — user preference)
- **Customer portal accent / CTA**: Cherry `#D20001` (Add to Cart, Done buttons, quick-add circles)
- **Loyalty card / Coffee Club card**: Sky blue `#5AB8FF` → `#3A7FD4` gradient (kept distinct for loyalty branding)
- **Colours propagate via**: `constants/colors.ts` → `useColors()` hook → all screens
- **QR code**: `react-native-qrcode-svg` installed. Per-customer QR code in the Rewards screen Coffee Club card ("My QR" button opens modal with scannable code encoding userId + referralCode)

## Architecture

```
artifacts/
  butterfield/          ← Expo mobile app (iOS + web preview)
  api-server/           ← Express + TypeScript API server (port 8080 → /api proxy)
lib/
  db/                   ← Drizzle ORM schema + migrations (PostgreSQL)
                         Includes: pricing_tiers, quantity_price_breaks, customer_pricing
scripts/
  src/seed-products.ts  ← Stripe product seeder (run after connecting Stripe)
```

## Wholesale Pricing Tier System (Director-managed)
- **Schema**: `pricing_tiers` (Bronze/Silver/Gold/etc, each with discount %, min order, payment terms, lead time, cut-off, delivery rules), `quantity_price_breaks` (per product, scoped to tier or customer), `customer_pricing` (per-customer overrides on product or category). Tiers soft-archive (status='archived'); pricing rules soft-archive (isActive=false) — never hard-deleted to preserve order audit trails.
- **Pricing engine**: `artifacts/api-server/src/lib/wholesalePricing.ts` — `calculateWholesalePrice` enforces strict priority order: manual override → customer product → customer category → qty break (customer) → qty break (tier) → tier default discount → standard wholesale → error. Deterministic ordering (highest minQty first, then most-recent createdAt) for overlapping rules.
- **Order security**: `priceAndValidateOrder` recomputes ALL prices server-side, ignores any client-supplied totals, enforces tier min order, product min/max qty, suspended/approved checks. Client cannot manipulate price.
- **Director routes** (all `requireRole('director')`): `/api/director/{tiers,quantity-breaks,customer-pricing,pricing-preview}` CRUD, plus `/api/director/wholesale/:id/{tier,suspend}` and `/api/director/products/:id/wholesale-access`.
- **Mobile UI**: New `app/(director)/pricing.tsx` tab with 4 sub-tabs (Tiers / Qty Breaks / Custom / Assign).

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
| POST /api/auth/staff-login | — | Staff login (geo check; demo accounts bypassed) |
| POST /api/auth/wholesale-apply | — | Wholesale application (pending status) |
| POST /api/auth/seed-demo | — | Create/verify all 4 demo accounts |
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
| GET /api/director/stats | director | Dashboard KPIs (orders, revenue, users) |
| GET /api/director/orders | director | All orders (200 most recent) |
| PATCH /api/director/orders/:id/status | director | Update any order status |
| GET /api/director/users | director | All users with staff/wholesale profiles |
| PATCH /api/director/staff/:userId/approve | director | Approve/revoke staff access |
| PATCH /api/director/wholesale/:id/status | director | Approve/reject wholesale account |
| GET /api/director/products | director | All products |
| PATCH /api/director/products/:id | director | Update product (availability, featured, new) |
| GET /api/director/settings | director | Store settings (geo, open/close, special) |
| PATCH /api/director/settings | director | Update store settings |
| GET /api/announcements | JWT | All active announcements |
| GET/POST /api/favourites | JWT | Favourites list |
| POST /api/feedback | JWT | Submit feedback |
| POST /api/waitlist | JWT | Join waitlist |
| POST /api/payment/payment-intent | JWT | Create Stripe payment intent |
| POST /api/stripe/webhook | — | Stripe webhook handler |

## Four Role-Based Experiences

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

### 4. Director Portal (`/(director)/`)
- Navy `#1A2B4A` header strip with red DIRECTOR badge; no geo restriction
- **Dashboard** (`index.tsx`): Revenue strip (today/week/month in AUD), 4-stat grid (orders today, active, users, products), pending-approvals alert banner, recent 8 orders list
- **Orders** (`orders.tsx`): All 200 most-recent orders, filter chips (All/Pending/Preparing/Ready/Done/Cancelled), tap card → Alert to advance status
- **Users** (`users.tsx`): Tabbed All/Staff/Wholesale/Customers, staff approval toggle (Switch), wholesale status prompt (Approve/Pending/Reject)
- **Products** (`products.tsx`): All products with Available/Featured/New toggle switches per item
- **Settings** (`settings.tsx`): Store open toggle, daily special text, geo-fence radius + shop lat/lng, demo account quick-reference panel
- Auth: uses regular `/auth/login` endpoint (no geo check needed); `requireRole('director')` middleware on all `/director/*` routes

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

## Demo Accounts (seeded via POST /api/auth/seed-demo)
All demo accounts use password `Demo1234!`. Staff/Manager/Director geo-check is bypassed for all demo emails.

| Role | Email | Portal |
|------|-------|--------|
| Customer | customer@demo.com | Customer app |
| Staff | staff@demo.com | Staff portal (approvedByAdmin: true) |
| Wholesale | wholesale@demo.com | Wholesale portal (status: approved) |
| Director | director@demo.com | Director portal (full backend access) |
| Manager | manager@demo.com | Manager portal (permissions: dashboard, orders, products, reports) |

Login screen has a **Demo accounts** strip with one-tap auto-fill for each role.

## Brand Design
- **Customer palette**: Cobalt `#0212EE`, Background `#F5F6FA`, Cherry `#D20001`
- **Original caramel palette** (hero btn accent): Background `#FBF7F2` (cream), Primary `#C8833A` (caramel), Dark `#4A2410` (chocolate)
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

## Image Upload (Object Storage)
- Provisioned via Replit Object Storage (GCS-backed)
- Director Products → edit any product → Photos section → "Upload from camera roll" (hero) or "Upload" (gallery)
- Flow: expo-image-picker → POST /api/storage/uploads/request-url (presigned URL) → PUT to GCS → serving URL stored in product
- Serving: GET /api/storage/objects/:path (private), GET /api/storage/public-objects/:path (public)

## Manager Role
- **Schema**: `manager_profiles` table — `userId` (PK), `permissions` (JSON array), `createdByUserId`, `notes`
- **Auth**: managers log in via the Staff/Director login flow (`POST /api/auth/staff-login`)
- **Portal**: `/(manager)/` — indigo-themed, dynamic tabs based on permissions set by director
- **Permissions**: dashboard, orders, users, products, reports, rewards, announcements, settings, pricing
- **Director management**: Settings → Managers tab — create managers, toggle permissions per tab, remove
- **API**: director-only CRUD at `/api/director/managers` (PATCH permissions, DELETE downgrades to staff role)
- **Permissions enforced**: UI level (which tabs appear). All director API routes accept `requireRole('director', 'manager')`.

## Pending Items
- **Stripe integration**: Connect via Replit Integrations → run `pnpm --filter @workspace/scripts run seed-products` to sync real Stripe products
- **Push notifications**: expo-notifications scaffolded but not wired to backend

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
