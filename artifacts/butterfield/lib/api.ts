import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@butterfield_token';

const BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; name: string; phone?: string; birthday?: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    staffLogin: (data: { email: string; password: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/staff-login', { method: 'POST', body: JSON.stringify(data) }),
    wholesaleApply: (data: {
      email: string; password: string; name: string; phone?: string;
      companyName: string; abn?: string; deliveryAddress?: string;
    }) => request<{ message: string }>('/auth/wholesale-apply', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: ApiUser; profile: any }>('/auth/me'),
    updateMe: (data: { name?: string; phone?: string }) =>
      request<{ user: ApiUser }>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  },
  products: {
    list: () => request<{ data: ApiProduct[] }>('/products'),
    get: (id: string) => request<{ data: ApiProduct }>(`/products/${id}`),
  },
  orders: {
    list: () => request<{ data: ApiOrder[] }>('/orders'),
    get: (id: string) => request<{ data: ApiOrder }>(`/orders/${id}`),
    create: (data: {
      items: any[]; type: string; scheduledFor?: string; notes?: string;
      totalCents: number; stripePaymentIntentId?: string;
      loyaltyPointsUsed?: number; discountCents?: number; deliveryAddress?: string;
    }) => request<{ data: ApiOrder }>('/orders', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request<{ data: ApiOrder }>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  loyalty: {
    profile: () => request<{ data: LoyaltyProfile }>('/loyalty/profile'),
    transactions: () => request<{ data: LoyaltyTransaction[] }>('/loyalty/transactions'),
    rewards: () => request<{ data: LoyaltyReward[] }>('/loyalty/rewards'),
    redeem: (rewardId: string) =>
      request<{ data: any; reward: LoyaltyReward }>('/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) }),
    updateBirthday: (birthday: string) =>
      request<{ data: { birthday: string } }>('/loyalty/birthday', { method: 'PATCH', body: JSON.stringify({ birthday }) }),
  },
  staff: {
    clockIn: () => request<{ data: StaffShift }>('/staff/shifts/clock-in', { method: 'POST' }),
    clockOut: () => request<{ data: StaffShift }>('/staff/shifts/clock-out', { method: 'POST' }),
    currentShift: () => request<{ data: StaffShift | null }>('/staff/shifts/current'),
    shifts: () => request<{ data: StaffShift[] }>('/staff/shifts'),
    tasks: (category?: string) => request<{ data: StaffTask[] }>(`/staff/tasks${category ? `?category=${category}` : ''}`),
    completeTask: (id: string, isCompleted: boolean) =>
      request<{ data: StaffTask }>(`/staff/tasks/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
    logWastage: (data: { productName: string; quantity: string; unit: string; reason: string; estimatedCostCents?: number; notes?: string }) =>
      request<{ data: any }>('/staff/wastage', { method: 'POST', body: JSON.stringify(data) }),
    wastage: () => request<{ data: any[] }>('/staff/wastage'),
    reportIssue: (data: { title: string; description: string; category?: string; priority?: string }) =>
      request<{ data: any }>('/staff/issues', { method: 'POST', body: JSON.stringify(data) }),
    requestLeave: (data: { startDate: string; endDate: string; type: string; reason: string }) =>
      request<{ data: any }>('/staff/leave', { method: 'POST', body: JSON.stringify(data) }),
    allOrders: () => request<{ data: ApiOrder[] }>('/staff/orders'),
    profile: () => request<{ data: any }>('/staff/profile'),
  },
  wholesale: {
    account: () => request<{ data: any }>('/wholesale/account'),
    products: () => request<{ data: ApiProduct[] }>('/wholesale/products'),
    orders: () => request<{ data: any[] }>('/wholesale/orders'),
    createOrder: (data: {
      items: any[]; poReference?: string; notes?: string;
      totalCents: number; deliveryType: string; scheduledDate?: string;
    }) => request<{ data: any }>('/wholesale/orders', { method: 'POST', body: JSON.stringify(data) }),
  },
  announcements: () => request<{ data: any[] }>('/announcements'),
  favourites: {
    list: () => request<{ data: { productStripeId: string }[] }>('/favourites'),
    add: (productStripeId: string) =>
      request<{ success: boolean }>('/favourites', { method: 'POST', body: JSON.stringify({ productStripeId }) }),
    remove: (productStripeId: string) =>
      request<{ success: boolean }>(`/favourites/${productStripeId}`, { method: 'DELETE' }),
  },
  feedback: (data: { category: string; message: string; rating?: number; orderId?: string }) =>
    request<{ data: any }>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  waitlist: (productStripeId: string) =>
    request<{ data: any }>('/waitlist', { method: 'POST', body: JSON.stringify({ productStripeId }) }),
  payment: {
    createIntent: (amountCents: number) =>
      request<{ clientSecret: string; paymentIntentId: string }>('/payment/payment-intent', {
        method: 'POST', body: JSON.stringify({ amountCents }),
      }),
  },
};

export interface ApiUser {
  id: string;
  email: string;
  role: 'customer' | 'staff' | 'wholesale';
  name: string;
  phone?: string;
}

export interface ApiProduct {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, string>;
  images?: string[];
  prices?: { id: string; unit_amount: number; currency: string }[];
}

export interface ApiOrder {
  id: string;
  userId: string;
  status: string;
  type: string;
  scheduledFor?: string;
  notes?: string;
  totalCents: number;
  items: any[];
  loyaltyPointsEarned: number;
  createdAt: string;
}

export interface LoyaltyProfile {
  userId: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  referralCode: string;
  birthday?: string;
  stampCount: number;
  totalVisits: number;
  totalSpentCents: number;
}

export interface LoyaltyTransaction {
  id: string;
  points: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: string;
  isAppOnly: boolean;
}

export interface StaffShift {
  id: string;
  userId: string;
  clockIn: string;
  clockOut?: string;
  hoursWorked?: string;
}

export interface StaffTask {
  id: string;
  title: string;
  description?: string;
  category: string;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  sortOrder: number;
}
