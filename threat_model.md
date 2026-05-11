# Threat Model

## Project Overview

Butterfield Cookies is a production mobile commerce application with an Expo/React Native client in `artifacts/butterfield`, an Express 5 + TypeScript API in `artifacts/api-server`, and a PostgreSQL database schema in `lib/db`. It supports customer, staff, wholesale, manager, director, and master roles, Stripe-backed retail payments, wholesale ordering, loyalty features, push notifications, and object-storage-backed file uploads.

This scan is scoped to production-reachable behavior only. The mockup sandbox is out of scope. Assume deployed production runs with `NODE_ENV=production` and platform-managed TLS; findings should therefore focus on server-side trust boundaries, storage of sensitive data, authorization, payment integrity, and production-exposed upload/download surfaces.

## Assets

- **User accounts and sessions** — JWT bearer tokens, password hashes, password-reset tokens, role assignments, and manager/director access. Compromise enables impersonation and privilege escalation.
- **Customer and employee PII** — names, emails, phones, addresses, birthdays, staff information, wholesale account details, and device push tokens.
- **Order and pricing data** — retail orders, wholesale orders, loyalty balances, pricing tiers, customer-specific pricing, and product availability. Integrity matters because clients are not trusted to set totals or statuses.
- **Payment data** — Stripe payment intents, Stripe customer identifiers, and wholesale payment-card data. This is the most sensitive asset class in the repo.
- **Uploaded media and stored objects** — product photos, profile images, and any objects served from the storage proxy endpoints.
- **Application secrets and service credentials** — `SESSION_SECRET`, `DATABASE_URL`, Replit connector credentials, Stripe secrets, email API keys, and object storage credentials.

## Trust Boundaries

- **Mobile client → API server** — every request from Expo clients crosses from an untrusted environment into the backend. Role, price, payment status, and object paths must all be enforced server-side.
- **API server → PostgreSQL** — the API can read and mutate all business data. Overbroad authorization or plaintext storage here has direct impact.
- **API server → Stripe / Replit connectors** — payment operations and webhook verification depend on secrets retrieved server-side.
- **API server → Object storage** — upload request signing, object naming, visibility, and download authorization are all security-sensitive.
- **Public → Authenticated → Internal roles** — public auth and product endpoints are lower trust; customer/staff/wholesale endpoints require per-user scoping; manager/director/master surfaces require strong server-side authorization.
- **Production → Dev-only** — development conveniences such as demo accounts or no-email fallback behavior are not production findings unless reachable when `NODE_ENV=production`.

## Scan Anchors

- **Primary production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/**/*.ts`
- **Highest-risk backend areas:** `routes/auth.ts`, `routes/orders.ts`, `routes/payment.ts`, `routes/wholesale.ts`, `routes/director*.ts`, `routes/storage.ts`, `middlewares/auth.ts`, `lib/wholesalePricing.ts`
- **Sensitive data schemas:** `lib/db/src/schema/users.ts`, `lib/db/src/schema/wholesale_cards.ts`, pricing and order schema files under `lib/db/src/schema/`
- **Client-side role UX only:** manager tab gating in `artifacts/butterfield/app/(manager)/_layout.tsx` is not a security control by itself
- **Usually dev-only / lower-priority unless proven reachable:** mockup-only code, local workflow artifacts, and non-production fallback behavior guarded by `NODE_ENV !== 'production'`

## Threat Categories

### Spoofing

Authentication relies on bearer JWTs signed with `SESSION_SECRET`. The API MUST verify the token on every protected route, reject missing or invalid tokens, and verify privileged callers through server-side role checks rather than client routing state. Stripe webhooks MUST only be trusted after signature verification.

Any social-login or federated-identity flow MUST verify provider-issued tokens server-side before linking an external identity to an existing account or minting a local JWT. User-supplied email addresses or provider IDs are not trustworthy identity proof.

### Tampering

The mobile client is untrusted. Order totals, loyalty mutations, payment state, pricing tier behavior, and object-storage paths MUST be validated and recomputed server-side. No route may trust client-supplied totals, role claims, or payment references without verifying them against authoritative server-side data.

### Information Disclosure

The system stores significant PII and payment-related data. API responses MUST only expose data needed by the caller’s role and ownership scope. Sensitive data such as full payment-card details, CVVs, secrets, private object paths, or internal-only staff/customer data MUST never be exposed to unauthorized roles or stored unnecessarily.

### Denial of Service

Public and lightly authenticated routes such as login, password reset, payment-intent creation, and upload endpoints are candidate abuse points. Production endpoints MUST bound upload size, validate content types, and avoid allowing unauthenticated callers to consume unbounded storage, email, or payment resources.

### Elevation of Privilege

This project has several internal roles with materially different powers. Manager, staff, wholesale, and customer capabilities MUST be enforced on the server, including per-endpoint permission checks where manager permissions are finer-grained than role membership. IDORs and function-level authorization failures are high-risk because the API exposes broad order, pricing, customer, and operational actions.
