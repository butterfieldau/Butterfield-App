export interface CategoryPalette {
  bg: string;
  banner: string;
  bannerText: string;
  chip: string;
  chipText: string;
  emoji: string;
  defaultTags: string[];
}

export const CATEGORY_PALETTE: Record<string, CategoryPalette> = {
  cookies: {
    bg: '#E8C49A',
    banner: '#C4956A',
    bannerText: '#fff',
    chip: '#C4956A',
    chipText: '#fff',
    emoji: '🍪',
    defaultTags: ['Handmade', 'Fresh Baked', 'Butter', 'Chocolate'],
  },
  coffee: {
    bg: '#8B6244',
    banner: '#5E3E26',
    bannerText: '#fff',
    chip: '#5E3E26',
    chipText: '#fff',
    emoji: '☕',
    defaultTags: ['Espresso', 'Milk', 'Arabica', 'Hot'],
  },
  desserts: {
    bg: '#F2B8C6',
    banner: '#D4809A',
    bannerText: '#fff',
    chip: '#D4809A',
    chipText: '#fff',
    emoji: '🍰',
    defaultTags: ['Sweet', 'Cream', 'Pastry', 'Fresh'],
  },
  sandwiches: {
    bg: '#A8C89A',
    banner: '#6A9A5A',
    bannerText: '#fff',
    chip: '#6A9A5A',
    chipText: '#fff',
    emoji: '🥪',
    defaultTags: ['Sourdough', 'Fresh', 'Grilled', 'Daily'],
  },
  bundles: {
    bg: '#B4A0D4',
    banner: '#7A66AA',
    bannerText: '#fff',
    chip: '#7A66AA',
    chipText: '#fff',
    emoji: '🎁',
    defaultTags: ['Gift Ready', 'Mixed', 'Assorted', 'Value'],
  },
  merch: {
    bg: '#A8C8E8',
    banner: '#5A90C0',
    bannerText: '#fff',
    chip: '#5A90C0',
    chipText: '#fff',
    emoji: '👕',
    defaultTags: ['Branded', 'Limited', 'Exclusive'],
  },
  default: {
    bg: '#88C8E8',
    banner: '#5AA8D0',
    bannerText: '#fff',
    chip: '#5AA8D0',
    chipText: '#fff',
    emoji: '🛍️',
    defaultTags: ['Butterfield', 'Fresh', 'Local'],
  },
};

export function getPalette(category?: string): CategoryPalette {
  return CATEGORY_PALETTE[category ?? ''] ?? CATEGORY_PALETTE.default;
}

export const CATEGORY_OPTIONS: Record<string, { label: string; choices: string[] }[]> = {
  cookies: [
    { label: 'Size', choices: ['Regular', 'Large', 'Box of 6', 'Box of 12'] },
    { label: 'Temperature', choices: ['Fresh Warm', 'Room Temp', 'Frozen'] },
    { label: 'Extras', choices: ['Gift Wrapped', 'Message Card', 'Extra Napkins'] },
  ],
  coffee: [
    { label: 'Size', choices: ['Small', 'Medium', 'Large'] },
    { label: 'Milk & Creamers', choices: ['Whole Milk', 'Oat Milk', 'Almond Milk', 'Skim', 'Half-And-Half'] },
    { label: 'Sweeteners', choices: ['No Sugar', 'Honey', 'Maple Syrup', 'Agave', 'Simple Syrup'] },
    { label: 'Flavour Boosts', choices: ['Vanilla', 'Caramel', 'Hazelnut', 'Extra Shot'] },
  ],
  desserts: [
    { label: 'Size', choices: ['Single', 'Duo', 'Family Box'] },
    { label: 'Extras', choices: ['Whipped Cream', 'Ice Cream', 'Extra Sauce', 'Sprinkles'] },
  ],
  sandwiches: [
    { label: 'Bread', choices: ['Sourdough', 'White', 'Multigrain', 'Gluten Free'] },
    { label: 'Extras', choices: ['No Onion', 'No Mayo', 'Extra Sauce', 'Add Cheese'] },
    { label: 'Size', choices: ['Regular', 'Large'] },
  ],
  bundles: [
    { label: 'Box Size', choices: ['6 Pack', '12 Pack', '24 Pack'] },
    { label: 'Assortment', choices: ['Mixed', 'All Choc Chip', 'All Classic', 'Custom'] },
    { label: 'Extras', choices: ['Gift Box', 'Gift Message', 'Ribbon Wrap'] },
  ],
  default: [
    { label: 'Quantity', choices: ['1', '2', '3', '4', '5'] },
  ],
};

export function getOptions(category?: string) {
  return CATEGORY_OPTIONS[category ?? ''] ?? CATEGORY_OPTIONS.default;
}
