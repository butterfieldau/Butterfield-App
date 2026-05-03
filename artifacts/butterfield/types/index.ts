export type UserRole = 'customer' | 'staff' | 'wholesale';

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
  category: 'cookies' | 'coffee' | 'desserts' | 'bundles' | 'sandwiches';
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
