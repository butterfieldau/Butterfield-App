import Stripe from 'stripe';

async function tryFetchCreds(hostname: string, token: string, env: string): Promise<string | null> {
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', env);
  const resp = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'X-Replit-Token': token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { items?: Array<{ settings?: { secret?: string } }> };
  return data.items?.[0]?.settings?.secret ?? null;
}

async function getStripeCredentials(): Promise<{ secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Missing Replit env vars. Ensure Stripe integration is connected.');
  }

  const secretKey =
    (await tryFetchCreds(hostname, xReplitToken, 'development')) ??
    (await tryFetchCreds(hostname, xReplitToken, 'production'));

  if (!secretKey) throw new Error('Stripe integration not connected or missing secret key.');
  return { secretKey };
}

const PRODUCTS = [
  {
    name: 'Choc Chip Cookie',
    description: 'Our signature cookie — golden brown with pools of dark chocolate. Baked fresh every morning.',
    priceCents: 700,
    metadata: { category: 'cookies', popular: 'true', gradient: '#8B4513,#C8833A' },
  },
  {
    name: 'Pistachio Cookie',
    description: 'Rich pistachio dough with white chocolate and crushed pistachios. A fan favourite.',
    priceCents: 750,
    metadata: { category: 'cookies', popular: 'true', gradient: '#4A7A3A,#6A9A5A' },
  },
  {
    name: 'Biscoff',
    description: 'Our take on the cult classic — Biscoff spread swirled through a chewy cookie base.',
    priceCents: 750,
    metadata: { category: 'cookies', gradient: '#8B6020,#C8903A' },
  },
  {
    name: 'M&Ms Cookie',
    description: 'Colourful M&Ms folded into a chewy cookie dough. Fun, bright and irresistible.',
    priceCents: 700,
    metadata: { category: 'cookies', gradient: '#C83030,#E06060' },
  },
  {
    name: 'Red Velvet Cookie',
    description: 'Bold red velvet dough with cream cheese swirl and white chocolate chips.',
    priceCents: 700,
    metadata: { category: 'cookies', gradient: '#8B0A10,#C82020' },
  },
  {
    name: 'Almond Croissant Cookie',
    description: 'Inspired by the classic almond croissant — frangipane filling, flaked almonds on top.',
    priceCents: 800,
    metadata: { category: 'cookies', isNew: 'true', gradient: '#C8A830,#E8C850' },
  },
  {
    name: 'Bueno Cookie',
    description: 'Kinder Bueno pieces folded into a hazelnut chocolate cookie. Dangerously good.',
    priceCents: 800,
    metadata: { category: 'cookies', gradient: '#5A2810,#8B4A20' },
  },
  {
    name: 'Cookie & Cream Sandwich',
    description: 'Two warm cookies sandwiched with vanilla cream filling. Our most instagrammed item.',
    priceCents: 900,
    metadata: { category: 'desserts', popular: 'true', gradient: '#2A1408,#5A3010' },
  },
  {
    name: 'Flat White',
    description: 'Our house blend espresso with silky steamed whole milk. The Sydney café staple.',
    priceCents: 550,
    metadata: { category: 'coffee', popular: 'true', gradient: '#4A2410,#8B5A30' },
  },
  {
    name: 'Oat Milk Latte',
    description: 'Single origin espresso with creamy oat milk. Naturally sweet and incredibly smooth.',
    priceCents: 600,
    metadata: { category: 'coffee', gradient: '#6B4A2A,#A0784A' },
  },
  {
    name: 'Cold Brew',
    description: '24-hour cold steeped, served over ice. Bold, smooth and never bitter.',
    priceCents: 650,
    metadata: { category: 'coffee', isNew: 'true', gradient: '#1A0A04,#3D1F10' },
  },
  {
    name: 'Cappuccino',
    description: 'Equal parts espresso, steamed milk and thick foam. Classic Italian perfection.',
    priceCents: 550,
    metadata: { category: 'coffee', gradient: '#5A3420,#8B6040' },
  },
  {
    name: 'Cookie Party Box',
    description: '12 assorted fresh-baked cookies — perfect for sharing. Choose your mix.',
    priceCents: 7500,
    metadata: { category: 'bundles', gradient: '#8B4513,#C8833A' },
  },
  {
    name: 'Retro Shirt',
    description: 'Limited edition Butterfield retro tee. 100% cotton, relaxed fit.',
    priceCents: 5000,
    metadata: { category: 'merch', gradient: '#40C0F2,#2AA8DC' },
  },
  {
    name: 'Bucket Hat',
    description: 'Sky blue Butterfield bucket hat. The official summer accessory.',
    priceCents: 2000,
    metadata: { category: 'merch', gradient: '#40C0F2,#2AA8DC' },
  },
];

function toMetadata(obj: Record<string, string | undefined>): Stripe.MetadataParam {
  return Object.fromEntries(
    Object.entries(obj).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

async function run() {
  const { secretKey } = await getStripeCredentials();
  const stripe = new Stripe(secretKey);

  console.log('Seeding Butterfield products to Stripe...\n');

  for (const item of PRODUCTS) {
    const existing = await stripe.products.search({ query: `name:'${item.name}' AND active:'true'` });
    if (existing.data.length > 0) {
      console.log(`  ✓ Already exists: ${item.name}`);
      continue;
    }
    const product = await stripe.products.create({
      name: item.name,
      description: item.description,
      metadata: toMetadata(item.metadata),
    });
    await stripe.prices.create({
      product: product.id,
      unit_amount: item.priceCents,
      currency: 'aud',
    });
    console.log(`  ✓ Created: ${item.name} — $${(item.priceCents / 100).toFixed(2)}`);
  }

  console.log('\nDone! Run the API server to sync products to the database.');
}

run().catch((e) => { console.error(e.message); process.exit(1); });
