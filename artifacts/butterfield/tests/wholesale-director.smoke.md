# Wholesale Director Feature — Smoke Test Plan

These test plans are executed via the `runTest()` Playwright subagent.
Demo accounts: director@demo.com / Demo1234! and wholesale@demo.com / Demo1234!

---

## Test 1 — Edit Items + Revised Invoice (director flow)

```
Test: Director edits items on a pending wholesale order and sends a revised invoice

1. [New Context] Create a new browser context (viewport 400×720)
2. [Browser] Navigate to / (Expo web preview)
3. [Browser] On the login screen, tap "Director" role button
4. [Browser] Fill email "director@demo.com" and password "Demo1234!"
5. [Browser] Tap the Login button and wait for the Director portal to load
6. [Verify] Assert the Director dashboard is visible (should show "DIRECTOR" badge and revenue stats)

7. [Browser] Tap the "Orders" tab in the bottom navigation
8. [Verify] Assert the orders list is visible and contains at least one wholesale order
   (wholesale orders show a blue-grey "WHOLESALE" badge or label)

9. [Browser] Tap on the most recent wholesale order to open OrderDetailModal
10. [Verify] Assert the modal opened and shows order details (items list, total, account name)

11. [Browser] Tap "Edit Items" button in the order detail modal
12. [Verify] Assert the Edit Items sheet opened (should show item list with quantity/price inputs)

13. [Browser] Change the quantity of the first item (increment by 1 using the + button)
14. [Browser] Tap "Save Changes" or "Done" button
15. [Verify]
    - Assert a success confirmation is shown (toast or alert saying "Order updated")
    - Assert the order total changed to reflect the new quantity

16. [Browser] Tap "Send Revised Invoice" button (only visible after edit history exists)
17. [Verify] Assert a confirmation prompt or success message appears about invoice being sent

---

## Test 2 — Partial Refund / Credit Memo (director flow)

```
Test: Director issues a partial credit memo on a paid wholesale order

1. [New Context] Create a new browser context (viewport 400×720)
2. [Browser] Navigate to /
3. [Browser] Tap "Director" role, fill email "director@demo.com" / "Demo1234!", tap Login
4. [Verify] Assert Director portal loads

5. [Browser] Tap "Orders" tab
6. [Browser] Find a wholesale order with status "delivered" or "paid" — tap to open detail modal
   (If no delivered wholesale order exists, tap the first wholesale order available)

7. [Browser] Tap "Issue Credit / Adjust" or "Adjust Order" button in the order detail
8. [Verify] Assert the AdjustWholesaleOrderSheet opened
   (should show "Credit Memo", amount input, reason text field, and per-line-item breakdown)

9. [Browser] Enter "5000" (50.00 AUD) in the total amount input field
10. [Browser] Enter "Damaged goods on delivery" in the reason field
11. [Browser] Tap "Issue Credit Memo" or "Apply" button
12. [Verify]
    - Assert a success message appears (toast or alert: "Credit memo issued")
    - Assert the order detail now shows a "CREDIT ISSUED" badge

13. [Browser] Tap the "CREDIT ISSUED" badge on the order card in the order list
14. [Verify] Assert an alert or popover shows the credit memo details:
    - Amount ≥ $50.00
    - Reason mentions "Damaged goods"
    - Date of issue is today

---

## Test 3 — Director-Created Order Appears in Wholesale Portal

```
Test: Director creates a wholesale order; it is visible to the wholesale customer

1. [New Context] Create a new browser context (viewport 400×720)
2. [Browser] Navigate to /
3. [Browser] Tap "Director" role, fill email "director@demo.com" / "Demo1234!", tap Login
4. [Verify] Assert Director portal loads

5. [Browser] Tap "Orders" tab
6. [Browser] Tap the "+" or "New Wholesale Order" floating action button
7. [Verify] Assert the CreateWholesaleOrderSheet opened
   (should show account selector list with wholesale account names)

8. [Browser] Tap on the first wholesale account in the list (e.g. "Butterfield Demo Wholesale")
   then tap "Continue" button
9. [Verify] Assert product catalog step is shown
   (should show product cards with + add buttons)

10. [Browser] Tap the "+" button on the first product to add it to the order
11. [Browser] Increment quantity to 10 using the quantity stepper
12. [Browser] Enter a PO reference like "SMOKE-001"
13. [Browser] Tap "Place Order" or "Create Order" button
14. [Verify] Assert a success confirmation appears (toast: "Wholesale order created")

15. [New Context] Open a second browser context
16. [Browser] Navigate to /
17. [Browser] Tap "Customer" role, then tap "Wholesale" option
    (or tap "Wholesale" role button if shown directly on login screen)
18. [Browser] Fill email "wholesale@demo.com" / "Demo1234!", tap Login
19. [Verify] Assert Wholesale portal loads

20. [Browser] Tap the "Orders" tab in the Wholesale portal
21. [Verify]
    - Assert the orders list contains the order with PO reference "SMOKE-001"
    - Assert it shows status "Pending"

---

## Test 4 — Manager Blocked from Financial Mutations (authorization)

```
Test: A manager account receives 403 when attempting director-only wholesale order mutations

1. [API] POST to /api/auth/login with { email: "manager@demo.com", password: "Demo1234!" }
   — note the returned JWT token as ${managerToken}

2. [API] GET /api/director/wholesale/orders to find any wholesale order id — note it as ${orderId}

3. [API] POST /api/director/wholesale/orders/${orderId}/adjust
   with header Authorization: Bearer ${managerToken}
   body: { amountCents: 1000, reason: "test", type: "credit" }
   — Assert response status is 403

4. [API] PATCH /api/director/wholesale/orders/${orderId}/items
   with header Authorization: Bearer ${managerToken}
   body: { items: [] }
   — Assert response status is 403

5. [API] POST /api/director/wholesale/orders
   with header Authorization: Bearer ${managerToken}
   body: { accountId: "x", items: [] }
   — Assert response status is 403

6. [Verify] All three calls above returned 403 Forbidden, confirming managers cannot perform
   financial mutations on wholesale orders even though they can access other director routes.
