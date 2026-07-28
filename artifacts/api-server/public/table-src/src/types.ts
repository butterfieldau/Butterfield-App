export interface TableConfig {
  storeId: string;
  tableNumber: string;
  stripePublishableKey?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface OptionGroupOption {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: OptionGroupOption[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number | null;
  salePriceCents: number | null;
  images: string[];
  categoryId: string | null;
  category: string | null;
  dietaryTags: string[];
  allergens: string[];
  isSoldOut: boolean;
  isComingSoon: boolean;
  active: boolean;
  variants?: ProductVariant[];
  optionGroups?: OptionGroup[];
}

export interface CartItem {
  id: string; // uuid for cart uniqueness
  productId: string;
  productName: string;
  productImage: string | null;
  variantId?: string;
  variantName?: string;
  selectedOptions: { groupId: string; groupName: string; optionId: string; optionName: string; priceCents: number }[];
  unitCents: number;
  quantity: number;
  notes?: string;
}

export type Screen = "menu" | "checkout" | "confirmation";

export interface OrderConfirmation {
  orderNumber: string;
  tableNumber: string;
  items: CartItem[];
  totalCents: number;
}
