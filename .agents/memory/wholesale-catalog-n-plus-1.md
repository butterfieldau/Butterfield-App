---
name: Wholesale catalog N+1 pricing query
description: calculateWholesalePrice does ~5 sequential DB queries per call; never loop it per-product for a listing endpoint.
---

`calculateWholesalePrice()` in `wholesalePricing.ts` re-fetches the product and issues up to 5 sequential queries (customer product price, customer category price, customer qty breaks, tier qty breaks) per call. It's correct and appropriately small for pricing a handful of order lines at checkout, but calling it in a `for` loop over the full product catalog (e.g. a "list all products with computed price" endpoint) turns into 1000s of round trips and scales linearly with catalog size — measured 3.27s at ~1000 products, vs 0.16s after batching.

**Why:** Found via load-testing the wholesale catalog endpoint by temporarily seeding 1000 synthetic products and timing before/after — the per-product DB round trips were invisible at the seeded row count (~60) but became the dominant cost at scale.

**How to apply:** For any endpoint that prices/checks many products at once, use `calculateWholesalePricesBulk()` (added alongside the single-item function) which loads all customer-pricing and quantity-break rows for the whole set in ~4 queries total, then resolves each product in memory using the same priority order. Keep using the single-item `calculateWholesalePrice()` only for per-order-line pricing at submit time (small N, needs independent re-verification anyway). When adding new per-product-loop pricing/availability logic, grep for `await.*(calculateWholesalePrice|canCustomerAccessProduct)` inside a `for`/`.map` over a full product list as a smell — batch-load the underlying tables instead.
