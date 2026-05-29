---
name: Stripe schema _raw_data pattern
description: How to manually insert rows into stripe.products and stripe.prices in dev
---

All columns in `stripe.products` and `stripe.prices` (id, name, active, object, currency, unit_amount, product, etc.) are **generated always as** expressions derived from a single `_raw_data jsonb` column. You cannot INSERT into them directly.

**How to insert:**
```sql
INSERT INTO stripe.products (_raw_data, _account_id) VALUES
('{"id":"prod_xxx","object":"product","active":true,"name":"...","images":[],"metadata":{...},"livemode":false,"default_price":"price_xxx"}', 'acct_1TWMilPKUGf62iG1');

INSERT INTO stripe.prices (_raw_data, _account_id) VALUES
('{"id":"price_xxx","object":"price","active":true,"currency":"aud","product":"prod_xxx","type":"one_time","unit_amount":550,"billing_scheme":"per_unit","livemode":false}', 'acct_1TWMilPKUGf62iG1');
```

**Dev account_id:** `acct_1TWMilPKUGf62iG1`

**Why:** The stripe schema is managed by a Stripe sync integration that writes raw Stripe API payloads into _raw_data and derives all other columns from it via generated column expressions.

**How to apply:** Any time you need to seed or replace dev stripe catalog data, use psql directly (executeSql skill blocks stripe.* mutations) and insert only (_raw_data, _account_id). Must DELETE existing rows first in a separate transaction before re-inserting, since the DELETE + INSERT in the same transaction risks rollback restoring the old rows if a later statement fails.
