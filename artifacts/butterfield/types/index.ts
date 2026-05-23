export type UserRole = 'customer' | 'staff' | 'wholesale' | 'director' | 'manager' | 'master' | 'shop_display';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  loyaltyPoints?: number;
  companyName?: string;
  creditLimit?: number;
  creditUsed?: number;
  accountNumber?: string;
  staffId?: string;
  avatar?: string;
}

export interface Product {
  id: string;
  name: string;
  category: 'cookies' | 'coffee' | 'desserts' | 'bundles' | 'sandwiches' | 'merch';
  price: number;
  wholesalePrice?: number;
  wholesalePriceTiers?: { minQty: number; price: number }[];
  description: string;
  available: boolean;
  popular?: boolean;
  isNew?: boolean;
  gradient: [string, string];
  priceId?: string;
}

// ── Cart types (v2 — supports variants + option customizations) ────────────

export interface SelectedCartOption {
  groupId: string;
  groupName: string;
  optionId?: string;
  optionName?: string;
  priceAdjustmentCents: number;
  textValue?: string;    // for text-type option groups (barista notes)
}

export interface CartItem {
  cartItemId: string;            // unique per cart line (nanoid-style)
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  basePriceCents: number;        // product or selected variant price
  selectedOptions: SelectedCartOption[];
  optionsTotalCents: number;     // sum of price adjustments
  unitPriceCents: number;        // basePriceCents + optionsTotalCents
  quantity: number;
  imageUrl?: string;
  category?: string;
  isCoffee?: boolean;
}

// Legacy shape — kept for backwards-compat in components that haven't been updated
export interface LegacyCartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'pending' | 'in-progress' | 'ready' | 'completed' | 'cancelled';

export interface StaffOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  type: 'dine-in' | 'takeaway' | 'delivery';
  tableNumber?: string;
  notes?: string;
}

export interface WholesaleOrder {
  id: string;
  orderNumber: string;
  date: string;
  items: { productId: string; productName: string; quantity: number; unitPrice: number }[];
  total: number;
  status: 'processing' | 'confirmed' | 'dispatched' | 'delivered';
  deliveryDate?: string;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

export interface LoyaltyTransaction {
  id: string;
  date: string;
  description: string;
  points: number;
  type: 'earn' | 'redeem';
}

export const ALL_MANAGER_PERMISSIONS = [
  'dashboard',
  'orders',
  'users',
  'timesheets',
  'products',
  'reports',
  'rewards',
  'announcements',
  'settings',
  'pricing',
] as const;

export type ManagerPermission = typeof ALL_MANAGER_PERMISSIONS[number];

export const MANAGER_PERMISSION_LABELS: Record<ManagerPermission, { label: string; desc: string; icon: string }> = {
  dashboard:     { label: 'Dashboard',     desc: 'View KPI stats and activity feed',          icon: 'grid' },
  orders:        { label: 'Orders',        desc: 'View and update order statuses',             icon: 'shopping-bag' },
  users:         { label: 'Users',         desc: 'Approve staff & manage wholesale accounts',  icon: 'users' },
  products:      { label: 'Products',      desc: 'Edit availability, photos and details',      icon: 'package' },
  timesheets:    { label: 'Timesheets',    desc: 'View, approve and edit staff timesheets',   icon: 'clock' },
  reports:       { label: 'Reports',       desc: 'Revenue and customer feedback reports',       icon: 'bar-chart-2' },
  rewards:       { label: 'Rewards',       desc: 'Create and edit loyalty rewards',            icon: 'gift' },
  announcements: { label: 'Announcements', desc: 'Publish and manage push announcements',      icon: 'bell' },
  settings:      { label: 'Settings',      desc: 'Change store hours and geo settings',        icon: 'settings' },
  pricing:       { label: 'Pricing',       desc: 'Manage wholesale tiers and price breaks',    icon: 'dollar-sign' },
};
