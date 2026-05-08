export type UserRole = 'customer' | 'staff' | 'wholesale' | 'director' | 'manager';

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

export interface CartItem {
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
  reports:       { label: 'Reports',       desc: 'Revenue, timesheets and feedback reports',   icon: 'bar-chart-2' },
  rewards:       { label: 'Rewards',       desc: 'Create and edit loyalty rewards',            icon: 'gift' },
  announcements: { label: 'Announcements', desc: 'Publish and manage push announcements',      icon: 'bell' },
  settings:      { label: 'Settings',      desc: 'Change store hours and geo settings',        icon: 'settings' },
  pricing:       { label: 'Pricing',       desc: 'Manage wholesale tiers and price breaks',    icon: 'dollar-sign' },
};
