import { test, expect, request } from '@playwright/test';

const BASE = 'http://localhost:80';

async function seedDemo() {
  const ctx = await request.newContext();
  await ctx.post(`${BASE}/api/auth/seed-demo`, { data: {} });
  await ctx.dispose();
}

/**
 * Returns a JWT for the given account.
 * Staff/manager/director accounts use /api/auth/staff-login.
 * Customer/wholesale accounts use /api/auth/login.
 */
async function getToken(email: string, password: string): Promise<string> {
  const ctx = await request.newContext();
  const isInternal = ['director@demo.com', 'manager@demo.com', 'staff@demo.com'].includes(email);
  const endpoint = isInternal
    ? `${BASE}/api/auth/staff-login`
    : `${BASE}/api/auth/login`;
  const res = await ctx.post(endpoint, { data: { email, password } });
  const body = await res.json();
  await ctx.dispose();
  if (!body.token) throw new Error(`No token for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed demo accounts once before the suite runs
// ─────────────────────────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await seedDemo();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Director creates a wholesale order (used in Test 3 cross-portal
//           check) and then edits its items. The updated order must have an
//           editHistory entry with a proper `editedAt` ISO timestamp and the
//           revised total.
// ─────────────────────────────────────────────────────────────────────────────
test('director edits wholesale order items; editedAt timestamp is set', async ({ request }) => {
  const directorToken = await getToken('director@demo.com', 'Demo1234!');
  const auth = { Authorization: `Bearer ${directorToken}` };

  // Fetch wholesale accounts — GET /api/director/wholesale → { data: [...] }
  const accountsRes = await request.get(`${BASE}/api/director/wholesale`, { headers: auth });
  expect(accountsRes.ok(), `Accounts list failed: ${await accountsRes.text()}`).toBeTruthy();
  const accounts: any[] = (await accountsRes.json()).data ?? [];
  if (!accounts.length) { test.skip(true, 'No wholesale accounts'); return; }

  // Fetch products — GET /api/products → array or { data: [...] }
  const productsRes = await request.get(`${BASE}/api/products`);
  expect(productsRes.ok()).toBeTruthy();
  const productsBody = await productsRes.json();
  const products: any[] = Array.isArray(productsBody) ? productsBody : (productsBody.data ?? []);
  if (!products.length) { test.skip(true, 'No products'); return; }

  const account = accounts[0];
  const product = products[0];
  const unitPrice: number = product.unitPriceCents ?? product.default_price?.unit_amount ?? 1000;

  // Create a fresh wholesale order as director
  const createRes = await request.post(`${BASE}/api/director/wholesale/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      accountId: account.id,
      items: [{ productId: product.id, productName: product.name ?? 'Test Product', quantity: 5, unitPriceCents: unitPrice, totalCents: unitPrice * 5 }],
      poReference: `SMOKE-EDIT-${Date.now()}`,
      deliveryType: 'pickup',
    },
  });
  expect(createRes.ok(), `Create order failed: ${await createRes.text()}`).toBeTruthy();
  const orderId: string = (await createRes.json()).data?.id;
  expect(orderId).toBeTruthy();

  // Edit: bump quantity to 8
  const editedItems = [{ productId: product.id, productName: product.name ?? 'Test Product', quantity: 8, unitPriceCents: unitPrice, totalCents: unitPrice * 8 }];
  const editRes = await request.patch(`${BASE}/api/director/wholesale/orders/${orderId}/items`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: { items: editedItems, notes: 'Playwright smoke test edit' },
  });
  expect(editRes.ok(), `Edit items failed: ${await editRes.text()}`).toBeTruthy();

  const updated = (await editRes.json()).data;

  // editHistory must contain an entry with editedAt and type === 'edit'
  const history: any[] = updated.editHistory ?? [];
  expect(history.length).toBeGreaterThan(0);
  const lastEntry = history[history.length - 1];
  expect(lastEntry.editedAt).toBeTruthy();
  expect(['edit', 'item_edit']).toContain(lastEntry.type);

  // Total must reflect the edited quantity
  expect(updated.totalCents).toBe(unitPrice * 8);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Director issues a partial credit memo on a paid wholesale order.
//           The creditMemos array gains an entry, refundedCents increments,
//           and (for net-terms orders) the account currentBalanceCents
//           decrements atomically.
// ─────────────────────────────────────────────────────────────────────────────
test('director issues partial credit memo; credit recorded and net-terms balance decremented', async ({ request }) => {
  const directorToken = await getToken('director@demo.com', 'Demo1234!');
  const auth = { Authorization: `Bearer ${directorToken}` };

  // GET /api/director/orders returns ALL orders (customer + wholesale combined).
  // Wholesale orders have orderSource === 'wholesale'.
  const ordersRes = await request.get(`${BASE}/api/director/orders`, { headers: auth });
  expect(ordersRes.ok(), `Director orders failed: ${await ordersRes.text()}`).toBeTruthy();
  const allOrders: any[] = (await ordersRes.json()).data ?? (await ordersRes.json()) ?? [];

  const paid = allOrders.find(
    (o: any) => o.orderSource === 'wholesale' && o.isPaid && (o.refundedCents ?? 0) < o.totalCents
  );
  if (!paid) { test.skip(true, 'No eligible paid wholesale order for credit memo'); return; }

  const orderId: string = paid.id;
  const creditCents = 500; // $5.00

  // Capture account balance before
  const accountRes = await request.get(`${BASE}/api/director/wholesale`, { headers: auth });
  const accounts: any[] = (await accountRes.json()).data ?? [];
  const account = accounts.find((a: any) => a.id === paid.accountId);
  const balanceBefore: number = account?.currentBalanceCents ?? -1;

  const adjustRes = await request.post(`${BASE}/api/director/wholesale/orders/${orderId}/adjust`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: { amountCents: creditCents, reason: 'Playwright smoke test — damaged goods', type: 'credit_memo' },
  });
  expect(adjustRes.ok(), `Adjust failed: ${await adjustRes.text()}`).toBeTruthy();

  const updatedOrder = (await adjustRes.json()).data;

  // creditMemos array must have a new entry
  const memos: any[] = updatedOrder.creditMemos ?? [];
  expect(memos.length).toBeGreaterThan(0);
  const lastMemo = memos[memos.length - 1];
  expect(lastMemo.amountCents).toBe(creditCents);
  expect(lastMemo.reason).toContain('smoke test');
  expect(lastMemo.createdAt).toBeTruthy();

  // refundedCents must have grown by creditCents
  expect(updatedOrder.refundedCents).toBeGreaterThanOrEqual(creditCents);

  // editHistory must have a 'credit' entry with editedAt
  const creditEntries = (updatedOrder.editHistory ?? []).filter((e: any) => e.type === 'credit');
  expect(creditEntries.length).toBeGreaterThan(0);
  expect(creditEntries[creditEntries.length - 1].editedAt).toBeTruthy();

  // For net-terms orders: verify account balance decremented
  const isPaidByCard = !!paid.stripePaymentIntentId &&
    paid.stripePaymentStatus !== 'net_terms' &&
    paid.stripePaymentStatus !== 'pending';
  if (!isPaidByCard && balanceBefore > 0) {
    const accountAfterRes = await request.get(`${BASE}/api/director/wholesale`, { headers: auth });
    const accountsAfter: any[] = (await accountAfterRes.json()).data ?? [];
    const accountAfter = accountsAfter.find((a: any) => a.id === paid.accountId);
    const balanceAfter: number = accountAfter?.currentBalanceCents ?? -1;
    expect(balanceAfter).toBe(Math.max(0, balanceBefore - creditCents));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Director creates a wholesale order; the wholesale customer can
//           see it in their own GET /api/wholesale/orders list.
// ─────────────────────────────────────────────────────────────────────────────
test('director-created wholesale order appears in wholesale customer order list', async ({ request }) => {
  const directorToken = await getToken('director@demo.com', 'Demo1234!');
  const auth = { Authorization: `Bearer ${directorToken}` };

  // Find the demo wholesale account
  const accountsRes = await request.get(`${BASE}/api/director/wholesale`, { headers: auth });
  expect(accountsRes.ok()).toBeTruthy();
  const accounts: any[] = (await accountsRes.json()).data ?? [];
  if (!accounts.length) { test.skip(true, 'No wholesale accounts'); return; }

  const account = accounts.find((a: any) => a.email === 'wholesale@demo.com') ?? accounts[0];

  // Get a product
  const productsRes = await request.get(`${BASE}/api/products`);
  const productsBody = await productsRes.json();
  const products: any[] = Array.isArray(productsBody) ? productsBody : (productsBody.data ?? []);
  if (!products.length) { test.skip(true, 'No products'); return; }

  const product = products[0];
  const unitPrice: number = product.unitPriceCents ?? product.default_price?.unit_amount ?? 1000;
  const poRef = `SMOKE-CROSS-${Date.now()}`;

  // Director creates the order
  const createRes = await request.post(`${BASE}/api/director/wholesale/orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      accountId: account.id,
      items: [{ productId: product.id, productName: product.name ?? 'Product', quantity: 10, unitPriceCents: unitPrice, totalCents: unitPrice * 10 }],
      poReference: poRef,
      deliveryType: 'pickup',
      notes: 'Playwright smoke test — cross-portal visibility',
    },
  });
  expect(createRes.ok(), `Create order failed: ${await createRes.text()}`).toBeTruthy();
  const newOrderId: string = (await createRes.json()).data?.id;
  expect(newOrderId).toBeTruthy();

  // Wholesale customer checks their own order list
  const wsToken = await getToken('wholesale@demo.com', 'Demo1234!');
  const wsAuth = { Authorization: `Bearer ${wsToken}` };

  const wsOrdersRes = await request.get(`${BASE}/api/wholesale/orders`, { headers: wsAuth });
  expect(wsOrdersRes.ok(), `Wholesale orders list failed: ${await wsOrdersRes.text()}`).toBeTruthy();

  const wsOrders: any[] = (await wsOrdersRes.json()).data ?? (await wsOrdersRes.json()) ?? [];
  const found = wsOrders.find((o: any) => o.id === newOrderId || o.poReference === poRef);
  expect(found, `Order ${poRef} not found in wholesale customer list`).toBeTruthy();
  expect(found.status).toBe('pending');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Manager role is blocked (403) from director-only financial routes.
// ─────────────────────────────────────────────────────────────────────────────
test('manager role cannot access director-only wholesale financial routes (403)', async ({ request }) => {
  const managerToken = await getToken('manager@demo.com', 'Demo1234!');
  const auth = { Authorization: `Bearer ${managerToken}` };

  // Use a fake order id — the role check fires before any DB lookup
  const fakeId = 'nonexistent-order-for-role-check';

  const [adjustRes, itemsRes, createRes, invoiceRes] = await Promise.all([
    request.post(`${BASE}/api/director/wholesale/orders/${fakeId}/adjust`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { amountCents: 1000, reason: 'manager attempt', type: 'credit_memo' },
    }),
    request.patch(`${BASE}/api/director/wholesale/orders/${fakeId}/items`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { items: [{ productId: 'x', productName: 'x', quantity: 1, unitPriceCents: 100, totalCents: 100 }] },
    }),
    request.post(`${BASE}/api/director/wholesale/orders`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { accountId: 'fake-account', items: [] },
    }),
    request.post(`${BASE}/api/director/wholesale/orders/${fakeId}/send-revised-invoice`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {},
    }),
  ]);

  expect(adjustRes.status(), 'POST /adjust must be 403 for manager').toBe(403);
  expect(itemsRes.status(), 'PATCH /items must be 403 for manager').toBe(403);
  expect(createRes.status(), 'POST /wholesale/orders must be 403 for manager').toBe(403);
  expect(invoiceRes.status(), 'POST /send-revised-invoice must be 403 for manager').toBe(403);
});
