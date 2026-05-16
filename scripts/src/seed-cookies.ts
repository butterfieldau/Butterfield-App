import { db, productsTable, productVariantsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

const COOKIES_CAT_ID = "cat_cookies";

function uid(prefix: string, name: string) {
  return `${prefix}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 40)}`;
}

const COOKIES = [
  {
    name: "Choc Chip Cookie",
    description: "Each cookie is packed with rich, melty chocolate chips and a perfect crunch, promising a satisfying bite every time.",
    priceCents: 700,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg",
    popular: true,
    gradient: "#4A2A10,#8B5A2A",
  },
  {
    name: "Red Velvet Cookie",
    description: "Indulge in the decadence of Red Velvet. With its deep, rich flavors and a hint of cocoa, each cookie is a velvety dream come true.",
    priceCents: 700,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_RedValvet_2880x2304_1af322bc-b56c-4635-8477-309d188fe6dd.jpg",
    popular: true,
    gradient: "#7A0A10,#C02020",
  },
  {
    name: "Double Choc",
    description: "A true chocolate lover's treasure. The outer layer offers a gentle crisp, giving way to a soft, melt-in-your-mouth centre loaded with double chocolate goodness.",
    priceCents: 700,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_PoubleChoc_2880x2304_25c9d3df-9dc3-4e40-a844-9512aeec3862.jpg",
    popular: false,
    gradient: "#2A1408,#5A2A10",
  },
  {
    name: "Nutella Cookie",
    description: "Indulge in the creamy, hazelnut goodness of our Nutella cookie, filled with a generous Nutella centre.",
    priceCents: 750,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Nutella_2880x2304_9a0309b5-92ba-4a25-8800-17d080a5c9ed.jpg",
    popular: false,
    gradient: "#5A2A08,#8B4A18",
  },
  {
    name: "Biscoff",
    description: "Experience the unique delight of our Biscoff cookie, featuring a smooth Biscoff spread centre, encased in a soft cookie — a treat for Biscoff enthusiasts.",
    priceCents: 750,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Biscoff_2880x2304_c0c0d24b-bd23-4dbf-b563-82b0d49eeb65.jpg",
    popular: true,
    gradient: "#8B6020,#C89030",
  },
  {
    name: "Pistachio Cookie",
    description: "A luxurious blend of rich, nutty pistachios and creamy white chocolate, drizzled and filled with smooth pistachio sauce — unique and irresistible.",
    priceCents: 750,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Pistachio_2880x2304_22fcddc2-bd6f-48b2-b5c0-cfe6528a14b5.jpg",
    popular: true,
    gradient: "#3A6A2A,#5A9A4A",
  },
  {
    name: "Strawberry Sprinkles",
    description: "Vanilla cookie base loaded with sprinkles, filled with a strawberry centre then topped with more strawberry chocolate and sprinkles.",
    priceCents: 750,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_StrawberrySprinkles_2880x2304_5e8f6941-501f-4907-a5a8-59c4e4f5b26d.jpg",
    popular: false,
    gradient: "#C83060,#E86080",
  },
  {
    name: "M&Ms Cookie",
    description: "Colourful M&Ms folded into a thick, chewy cookie dough — fun, bright and impossible to resist.",
    priceCents: 700,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/ButterfieldCookies_MAndMs.jpg",
    popular: false,
    gradient: "#C83030,#E06060",
  },
  {
    name: "Macadamia Cookie",
    description: "Chunky macadamia nuts baked into a golden, buttery cookie — rich, crunchy and perfectly sweet.",
    priceCents: 700,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Macadamia_2880x2304_46f262ba-121b-4f4e-8bb9-5ec36d0b8917.jpg",
    popular: false,
    gradient: "#C8A030,#E8C050",
  },
  {
    name: "Bueno Cookie",
    description: "Kinder Bueno pieces and hazelnut chocolate folded into a thick, indulgent cookie. Dangerously good.",
    priceCents: 800,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg",
    popular: true,
    gradient: "#4A1808,#7A3A18",
  },
  {
    name: "Oreo Cookie",
    description: "Crushed Oreo pieces baked through a thick, chewy cookie base — cookies and cream in every bite.",
    priceCents: 800,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_Oreo_2880x2304_e4ee5afa-3a72-4f63-af56-b24f05d8e7b0.jpg",
    popular: false,
    gradient: "#1A1A1A,#3A3A3A",
  },
  {
    name: "Viral Dubai Cookie",
    description: "The internet's most-talked-about flavour — crispy kataifi pastry and pistachio cream filling baked into a thick, chunky cookie. Rich, nutty and completely addictive.",
    priceCents: 1000,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_ViralDubai_2880x2304_70dcaa91-2eb5-4ffb-99ac-6b13fa469857.jpg",
    popular: true,
    isNew: true,
    gradient: "#7A5A10,#C8A030",
  },
  {
    name: "Almond Croissant Cookie",
    description: "Inspired by the classic almond croissant — frangipane filling and toasted flaked almonds baked into a buttery, golden cookie.",
    priceCents: 800,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/ButterfieldCookies_AlmondCroissantCookie_2880x2304_ad98ea84-f045-47a1-8af7-e6b6e79fa74d.jpg",
    popular: false,
    gradient: "#C8A830,#E8C850",
  },
  {
    name: "Chunky Cookies — 6 Pack",
    description: "Six of our famous chunky cookies in one box. Choose your mix — best sellers, nut free, or a single flavour. Fresh-baked to order.",
    priceCents: 3800,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/butterfield_box_32.png",
    popular: false,
    gradient: "#4A2A10,#8B5A2A",
    isBundle: true,
  },
  {
    name: "Chunky Cookies — 12 Pack",
    description: "A full dozen of our famous chunky cookies. Perfect for sharing, gifting or treating yourself. Choose your mix — best sellers, nut free, or a single flavour.",
    priceCents: 7500,
    imageUrl: "https://cdn.shopify.com/s/files/1/0871/2211/6906/files/Butterfield_12Pack.jpg",
    popular: true,
    gradient: "#4A2A10,#8B5A2A",
    isBundle: true,
  },
];

async function main() {
  console.log("🍪 Updating Butterfield cookie catalog...\n");

  // 1. Find and remove all existing cookie products
  console.log("🗑  Removing old cookie products...");
  const existingCookies = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(or(eq(productsTable.categoryId, COOKIES_CAT_ID), eq(productsTable.category, "cookies")));

  for (const p of existingCookies) {
    await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, p.id));
    await db.delete(productsTable).where(eq(productsTable.id, p.id));
    console.log(`  ✗ Removed: ${p.name}`);
  }

  // 2. Insert real cookies
  console.log("\n✨ Inserting real Butterfield cookies...");
  for (let i = 0; i < COOKIES.length; i++) {
    const c = COOKIES[i];
    const productId = uid("prod", c.name);
    await db.insert(productsTable).values({
      id: productId,
      categoryId: COOKIES_CAT_ID,
      name: c.name,
      description: c.description,
      category: "cookies",
      productType: "standard",
      priceCents: c.priceCents,
      imageUrl: c.imageUrl,
      isAvailable: true,
      isActive: true,
      isFeatured: (c as any).isBundle ? false : c.popular,
      isNew: (c as any).isNew ?? false,
      isWholesaleAvailable: true,
      isStaffOnly: false,
      isAppOnly: false,
      isLimitedDrop: false,
      isSoldOut: false,
      isComingSoon: false,
      isPickupOnly: false,
      sortOrder: i,
      minOrderQty: 1,
      wholesaleAccessMode: "all",
      tags: JSON.stringify(c.popular ? ["popular"] : []),
      allergens: JSON.stringify([]),
      dietaryTags: JSON.stringify([]),
    });
    console.log(`  ✓ Added: ${c.name} — $${(c.priceCents / 100).toFixed(2)}`);
  }

  console.log(`\n✅ Cookie catalog updated — ${COOKIES.length} products added.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
