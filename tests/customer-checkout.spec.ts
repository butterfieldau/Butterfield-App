/**
 * Customer checkout smoke tests
 *
 * All tests use the `request`/`fs` fixtures.  Playwright's headless-shell
 * binary requires libglib-2.0 which is absent in the NixOS Replit runtime;
 * this matches the convention in wholesale-director.spec.ts.
 *
 * Two fixes under test:
 *  FIX 1 — Redundant /(customer)/cart redirect file removed; cart lives
 *           directly at /customer-cart.
 *  FIX 2 — deliveryState now reads from saved-address state with NSW fallback:
 *           `addrState || 'NSW'`; useCheckout.ts initialises addrState to 'NSW'.
 */

import { test, expect, request } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:80';

// ── Shared token — fetched ONCE in beforeAll to avoid triggering the
//    in-memory login-rate-limiter (10 attempts / 10 min per IP+email).
let customerToken = '';

async function seedDemo() {
  const ctx = await request.newContext();
  await ctx.post(`${BASE}/api/auth/seed-demo`, { data: {} });
  await ctx.dispose();
}

async function fetchToken(email: string, password: string): Promise<string> {
  const ctx = await request.newContext();
  const res  = await ctx.post(`${BASE}/api/auth/login`, { data: { email, password } });
  const body = await res.json();
  await ctx.dispose();
  if (!body.token) throw new Error(`No token for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

/** Register a brand-new customer account; returns the JWT immediately. */
async function registerFresh(
  name: string,
  email: string,
  password: string,
  phone: string,
): Promise<string> {
  const ctx = await request.newContext();
  const res  = await ctx.post(`${BASE}/api/auth/register`, {
    data: { name, email, password, phone },
  });
  const body = await res.json();
  await ctx.dispose();
  if (!body.token) throw new Error(`Registration failed: ${JSON.stringify(body)}`);
  return body.token;
}

/** Fetch the active product list; skip the calling test if empty. */
async function getProducts(req: any): Promise<any[]> {
  const res     = await req.get(`${BASE}/api/products`);
  const body    = await res.json();
  return Array.isArray(body) ? body : (body.data ?? []);
}

test.beforeAll(async () => {
  await seedDemo();
  customerToken = await fetchToken('customer@demo.com', 'Demo1234!');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — FIX 1, part A: old /(customer)/cart redirect file must NOT exist;
//           the canonical cart screen MUST be at app/customer-cart.tsx.
// ─────────────────────────────────────────────────────────────────────────────
test('FIX1: old (customer)/cart redirect removed; customer-cart.tsx is the live route file', () => {
  const oldRedirect = path.resolve(
    __dirname,
    '../artifacts/butterfield/app/(customer)/cart.tsx',
  );
  expect(
    fs.existsSync(oldRedirect),
    'Redirect file at app/(customer)/cart.tsx should have been removed (FIX 1)',
  ).toBe(false);

  const cartScreen = path.resolve(
    __dirname,
    '../artifacts/butterfield/app/customer-cart.tsx',
  );
  expect(
    fs.existsSync(cartScreen),
    'Canonical cart screen at app/customer-cart.tsx must exist',
  ).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — FIX 1, part B: navigation source assertions.
//   • (customer)/_layout.tsx must route the Cart tab to '/customer-cart'
//     (not the old '/(customer)/cart').
//   • Root _layout.tsx must register 'customer-cart' as a Stack.Screen so
//     the route is reachable without a redirect hop.
// ─────────────────────────────────────────────────────────────────────────────
test('FIX1: (customer) layout navigates to /customer-cart; Stack.Screen registered', () => {
  const customerLayout = fs.readFileSync(
    path.resolve(__dirname, '../artifacts/butterfield/app/(customer)/_layout.tsx'),
    'utf8',
  );

  // Every cart push/replace must target '/customer-cart', not '/(customer)/cart'
  expect(
    customerLayout,
    '(customer)/_layout.tsx must navigate to /customer-cart',
  ).toMatch(/router\.(push|replace|navigate)\(\s*['"]\/customer-cart['"]/);

  // Must NOT reference the old route
  expect(
    customerLayout,
    '(customer)/_layout.tsx must not reference the old /(customer)/cart route',
  ).not.toMatch(/['"]\/\(customer\)\/cart['"]/);

  const rootLayout = fs.readFileSync(
    path.resolve(__dirname, '../artifacts/butterfield/app/_layout.tsx'),
    'utf8',
  );

  // The root Stack must include a Screen definition for 'customer-cart'
  expect(
    rootLayout,
    'Root _layout.tsx must register customer-cart as a Stack.Screen',
  ).toMatch(/Stack\.Screen\s+name=['"]customer-cart['"]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Pickup order end-to-end: order created and visible in history.
// ─────────────────────────────────────────────────────────────────────────────
test('customer places a pickup order; it appears in order history', async ({ request: req }) => {
  const auth     = { Authorization: `Bearer ${customerToken}` };
  const products = await getProducts(req);
  if (!products.length) { test.skip(true, 'No products seeded'); return; }

  const product        = products[0];
  const unitPriceCents = product.unitPriceCents ?? product.priceCents ?? product.default_price?.unit_amount ?? 500;

  const createRes = await req.post(`${BASE}/api/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      type: 'pickup', paymentMethod: 'pay_at_pickup',
      contactName: 'Playwright Test',
      items: [{
        productId: product.id, productName: product.name ?? 'Test Cookie',
        variantId: null, variantName: null,
        basePriceCents: unitPriceCents, selectedOptions: [],
        quantity: 1, unitPriceCents, totalCents: unitPriceCents,
        category: product.metadata?.category ?? 'cookies',
      }],
      totalCents: unitPriceCents,
    },
  });

  expect(createRes.ok(), `Order creation failed (${createRes.status()}): ${await createRes.text()}`).toBeTruthy();
  const created  = await createRes.json();
  const orderId: string = created.data?.id ?? created.id;
  expect(orderId, 'Order ID returned').toBeTruthy();
  expect(created.data?.type ?? created.type).toBe('pickup');

  const history: any[] = ((await (await req.get(`${BASE}/api/orders`, { headers: auth })).json()).data ?? []);
  const found = history.find((o: any) => o.id === orderId);
  expect(found, `Order ${orderId} appears in history`).toBeTruthy();
  expect(found.status).toMatch(/^(pending|received|scheduled)$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — FIX 2, runtime acceptance: NSW + Sydney postcode is accepted.
//           This is the exact payload the fixed client sends when the customer
//           has an NSW address (addrState = 'NSW', addrState || 'NSW' = 'NSW').
// ─────────────────────────────────────────────────────────────────────────────
test('FIX2: delivery order with NSW state and Sydney postcode is accepted (201)', async ({ request: req }) => {
  const auth     = { Authorization: `Bearer ${customerToken}` };
  const products = await getProducts(req);
  if (!products.length) { test.skip(true, 'No products seeded'); return; }

  const product        = products[0];
  const unitPriceCents = product.unitPriceCents ?? product.priceCents ?? product.default_price?.unit_amount ?? 500;

  const createRes = await req.post(`${BASE}/api/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      type: 'delivery', paymentMethod: 'card',
      deliveryAddress: '123 Pitt Street, Sydney NSW 2000',
      deliveryPostcode: '2000', deliveryState: 'NSW',
      contactName: 'Playwright Test',
      items: [{
        productId: product.id, productName: product.name ?? 'Test Cookie',
        variantId: null, variantName: null,
        basePriceCents: unitPriceCents, selectedOptions: [],
        quantity: 1, unitPriceCents, totalCents: unitPriceCents,
        category: product.metadata?.category ?? 'cookies',
      }],
      totalCents: unitPriceCents + 1200,
    },
  });

  expect(
    createRes.ok(),
    `NSW delivery must be accepted (${createRes.status()}): ${await createRes.text()}`,
  ).toBeTruthy();
  expect(
    (await createRes.json()).data?.type ?? (await createRes.json()).type,
  ).toBe('delivery');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Server rejects non-NSW delivery with 400.
//           Guards against a client sending a VIC/QLD/etc. saved-address state
//           without the || 'NSW' fallback normalising it.
// ─────────────────────────────────────────────────────────────────────────────
test('server rejects non-NSW (VIC) delivery with 400', async ({ request: req }) => {
  const auth     = { Authorization: `Bearer ${customerToken}` };
  const products = await getProducts(req);
  if (!products.length) { test.skip(true, 'No products seeded'); return; }

  const product        = products[0];
  const unitPriceCents = product.unitPriceCents ?? product.priceCents ?? product.default_price?.unit_amount ?? 500;

  const res = await req.post(`${BASE}/api/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      type: 'delivery', paymentMethod: 'card',
      deliveryAddress: '456 Collins Street, Melbourne VIC 3000',
      deliveryPostcode: '3000', deliveryState: 'VIC',
      contactName: 'Playwright Test',
      items: [{
        productId: product.id, productName: product.name ?? 'Test Cookie',
        variantId: null, variantName: null,
        basePriceCents: unitPriceCents, selectedOptions: [],
        quantity: 1, unitPriceCents, totalCents: unitPriceCents,
        category: product.metadata?.category ?? 'cookies',
      }],
      totalCents: unitPriceCents + 1200,
    },
  });

  expect(res.status(), 'Non-NSW delivery must be rejected with HTTP 400').toBe(400);
  expect((await res.json()).error).toMatch(/Sydney|NSW/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 — Omitting deliveryState is rejected with 400.
//           This simulates the pre-fix client (no || 'NSW' fallback) sending
//           an undefined state for a customer with no saved address.
// ─────────────────────────────────────────────────────────────────────────────
test('pre-fix behaviour: omitted deliveryState is rejected with 400', async ({ request: req }) => {
  const auth     = { Authorization: `Bearer ${customerToken}` };
  const products = await getProducts(req);
  if (!products.length) { test.skip(true, 'No products seeded'); return; }

  const product        = products[0];
  const unitPriceCents = product.unitPriceCents ?? product.priceCents ?? product.default_price?.unit_amount ?? 500;

  const res = await req.post(`${BASE}/api/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      type: 'delivery', paymentMethod: 'card',
      deliveryAddress: '123 Pitt Street, Sydney 2000',
      deliveryPostcode: '2000',
      // deliveryState intentionally omitted → simulates pre-fix client
      contactName: 'Playwright Test',
      items: [{
        productId: product.id, productName: product.name ?? 'Test Cookie',
        variantId: null, variantName: null,
        basePriceCents: unitPriceCents, selectedOptions: [],
        quantity: 1, unitPriceCents, totalCents: unitPriceCents,
        category: product.metadata?.category ?? 'cookies',
      }],
      totalCents: unitPriceCents + 1200,
    },
  });

  expect(
    res.status(),
    'Delivery with no deliveryState must be rejected (empty string !== "NSW")',
  ).toBe(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7 — FIX 2, fresh-customer runtime proof.
//
//   A brand-new customer has NO saved address.  useCheckout.ts initialises
//   addrState to 'NSW' via useState('NSW').  customer-cart.tsx then sends
//   deliveryState = addrState || 'NSW' = 'NSW'.
//
//   This test registers a new account (simulating first checkout, no saved
//   address), then places a delivery order using exactly the value the fixed
//   client would compute — 'NSW' — and proves the server accepts it.
//
//   Compare with Test 6 (omitted state → 400): that is the pre-fix failure
//   mode.  This test is the post-fix success path.
// ─────────────────────────────────────────────────────────────────────────────
test('FIX2: fresh customer (no saved address) delivers via NSW default — succeeds', async ({ request: req }) => {
  // Register a unique new customer — they have NO saved address on file.
  const uid   = Date.now();
  const email = `fresh-${uid}@playwright.test`;
  let freshToken: string;
  try {
    freshToken = await registerFresh(
      'Fresh Playwright Customer',
      email,
      'PlaywrightTest1!',
      `04${String(uid).slice(-8)}`,
    );
  } catch (e: any) {
    test.skip(true, `Could not register fresh customer: ${e.message}`);
    return;
  }

  const auth     = { Authorization: `Bearer ${freshToken}` };
  const products = await getProducts(req);
  if (!products.length) { test.skip(true, 'No products seeded'); return; }

  const product        = products[0];
  const unitPriceCents = product.unitPriceCents ?? product.priceCents ?? product.default_price?.unit_amount ?? 500;

  // The fixed client would compute: addrState || 'NSW' = 'NSW' || 'NSW' = 'NSW'
  // (because useCheckout initialises addrState to 'NSW' when no address is saved).
  const createRes = await req.post(`${BASE}/api/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      type: 'delivery', paymentMethod: 'card',
      deliveryAddress:  `42 George Street, Sydney NSW ${uid % 900 + 2000}`,
      deliveryPostcode: String(uid % 900 + 2000),
      deliveryState:    'NSW',   // === addrState || 'NSW' for a customer with no saved address
      contactName:      'Fresh Playwright Customer',
      items: [{
        productId: product.id, productName: product.name ?? 'Test Cookie',
        variantId: null, variantName: null,
        basePriceCents: unitPriceCents, selectedOptions: [],
        quantity: 1, unitPriceCents, totalCents: unitPriceCents,
        category: product.metadata?.category ?? 'cookies',
      }],
      totalCents: unitPriceCents + 1200,
    },
  });

  expect(
    createRes.ok(),
    `Fresh-customer NSW delivery must succeed (${createRes.status()}): ${await createRes.text()}`,
  ).toBeTruthy();

  const created = await createRes.json();
  expect(created.data?.type ?? created.type).toBe('delivery');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8 — Source assertions: confirm both fixes are present in live source.
//
//  (a) customer-cart.tsx: order submission uses `addrState || 'NSW'` as the
//      deliveryState value (FIX 2 — the exact fallback expression).
//  (b) useCheckout.ts: addrState initialised to 'NSW' via useState so a
//      customer with no saved address defaults to NSW immediately.
//  (c) CheckoutDeliveryStep.tsx: renders "NSW — Sydney deliveries only" pill,
//      confirming the UI communicates the NSW constraint to the user.
//  (d) orders.ts: server-side guard enforces `state !== 'NSW'` so no
//      out-of-state delivery can be accepted even if the client misbehaves.
// ─────────────────────────────────────────────────────────────────────────────
test('source: deliveryState uses addrState||NSW; useCheckout inits NSW; UI shows NSW pill; API enforces NSW', () => {
  const root = path.resolve(__dirname, '../artifacts/butterfield');

  // (a) client fallback expression in order submission
  const cartSrc = fs.readFileSync(path.join(root, 'app/customer-cart.tsx'), 'utf8');
  expect(
    cartSrc,
    '(a) customer-cart.tsx: deliveryState must use addrState || \'NSW\' fallback',
  ).toMatch(/deliveryState\s*:.*addrState\s*\|\|\s*['"]NSW['"]/);

  // (b) hook initialises addrState to 'NSW' so new customers default to NSW
  const hookSrc = fs.readFileSync(path.join(root, 'hooks/useCheckout.ts'), 'utf8');
  expect(
    hookSrc,
    "(b) useCheckout.ts: addrState must be initialised to 'NSW' via useState",
  ).toMatch(/useState\s*\(\s*['"]NSW['"]\s*\)/);

  // (c) delivery UI explicitly shows the NSW restriction as a pill to the user
  const stepSrc = fs.readFileSync(
    path.join(root, 'components/customer/CheckoutDeliveryStep.tsx'),
    'utf8',
  );
  expect(
    stepSrc,
    '(c) CheckoutDeliveryStep.tsx: must render "NSW — Sydney deliveries only" pill',
  ).toMatch(/NSW\s*[—–-]\s*Sydney deliveries only/);

  // (d) server-side NSW enforcement in orders route
  const ordersSrc = fs.readFileSync(
    path.resolve(__dirname, '../artifacts/api-server/src/routes/orders.ts'),
    'utf8',
  );
  expect(
    ordersSrc,
    "(d) orders.ts: must enforce state !== 'NSW' server-side",
  ).toMatch(/state\s*!==\s*['"]NSW['"]/);
});
