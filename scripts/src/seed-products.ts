import Stripe from 'stripe';

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

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken }, signal: AbortSignal.timeout(10_000) }
  );

  if (!resp.ok) throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);
  const data = await resp.json();
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret_key) throw new Error('Stripe integration not connected.');
  return { secretKey: settings.secret_key };
}

const PRODUCTS = [
  {
    name: 'Classic Choc Chip',
    description: 'Our signature cookie — golden brown with pools of dark chocolate. Baked fresh every morning.',
    priceCents: 450,
    metadata: { category: 'cookies', popular: 'true', gradient: '#8B4513,#C8833A' },
  },
  {
    name: 'Double Chocolate',
    description: 'Rich chocolate dough packed with two types of Belgian chocolate chips. Intensely decadent.',
    priceCents: 500,
    metadata: { category: 'cookies', gradient: '#3D1F0D,#6B3520' },
  },
  {
    name: 'Brown Butter Oat',
    description: 'Nutty browned butter, toasted oats and golden raisins. A soulful, old-school favourite.',
    priceCents: 480,
    metadata: { category: 'cookies', isNew: 'true', gradient: '#9B7A4A,#C8A870' },
  },
  {
    name: 'Lemon Zest',
    description: 'Bright lemon zest and white chocolate in a soft, chewy base. Sunshine in every bite.',
    priceCents: 450,
    metadata: { category: 'cookies', gradient: '#C8A830,#E8C840' },
  },
  {
    name: 'Snickerdoodle',
    description: 'Classic cinnamon sugar coating with a pillowy soft centre. Timeless and comforting.',
    priceCents: 400,
    metadata: { category: 'cookies', available: 'false', gradient: '#C87440,#E8A060' },
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
    name: 'Vanilla Soft Serve',
    description: 'Light, airy vanilla soft serve in a fresh waffle cone. Pure, simple joy.',
    priceCents: 600,
    metadata: { category: 'desserts', gradient: '#F5E6C8,#E8D0A0' },
  },
  {
    name: 'Miso Caramel Soft Serve',
    description: 'Our famous miso caramel drizzle over creamy soft serve. Sweet, salty, perfect.',
    priceCents: 750,
    metadata: { category: 'desserts', popular: 'true', gradient: '#C8833A,#E0A050' },
  },
  {
    name: 'Cookie & Cream Sandwich',
    description: 'Two warm choc chip cookies with vanilla cream filling. Our most instagrammed item.',
    priceCents: 900,
    metadata: { category: 'desserts', popular: 'true', gradient: '#2A1408,#5A3010' },
  },
  {
    name: 'Avocado Toast',
    description: 'Sourdough, smashed avo, chilli flakes, lemon and EVOO. A Sydney brunch staple.',
    priceCents: 1600,
    metadata: { category: 'sandwiches', gradient: '#4A8A30,#6AB040' },
  },
  {
    name: 'Smoked Salmon Bagel',
    description: 'House-made cream cheese, capers, red onion and premium smoked salmon on a fresh bagel.',
    priceCents: 1800,
    metadata: { category: 'sandwiches', gradient: '#C87060,#E09080' },
  },
  {
    name: 'Cookie Party Box',
    description: '12 assorted fresh-baked cookies — perfect for sharing. Choose your mix.',
    priceCents: 4800,
    metadata: { category: 'bundles', gradient: '#8B4513,#C8833A' },
  },
];

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
      metadata: item.metadata,
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
