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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    staffLogin: (data: { email: string; password: string; latitude?: number; longitude?: number }) =>
      request<{ token: string; user: ApiUser }>('/auth/staff-login', { method: 'POST', body: JSON.stringify(data) }),
    wholesaleApply: (data: {
      email: string; password: string; name: string; phone?: string;
      companyName: string; abn?: string; deliveryAddress?: string;
    }) => request<{ message: string }>('/auth/wholesale-apply', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: ApiUser; profile: any }>('/auth/me'),
    updateMe: (data: { name?: string; phone?: string; deliveryAddress?: string }) =>
      request<{ user: ApiUser; profile: any }>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
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
  },
  staff: {
    profile:      () => request<{ data: StaffProfile }>('/staff/profile'),
    currentShift: () => request<{ data: any }>('/staff/shifts/current'),
    shiftStats:   () => request<{ data: any }>('/staff/shifts/stats'),
    clockIn:      () => request<{ data: any }>('/staff/shifts/clock-in', { method: 'POST' }),
    clockOut:     (unpaidBreakMins = 0) =>
      request<{ data: any }>('/staff/shifts/clock-out', { method: 'POST', body: JSON.stringify({ unpaidBreakMins }) }),
    tasks:        (category?: string) =>
      request<{ data: any[] }>(`/staff/tasks${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    completeTask: (taskId: string, isCompleted: boolean) =>
      request<{ data: any }>(`/staff/tasks/${taskId}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
    allOrders:    () => request<{ data: any[] }>('/staff/orders'),
    submitWastage:(data: any) =>
      request<{ data: any }>('/staff/wastage', { method: 'POST', body: JSON.stringify(data) }),
    submitIssue:  (data: any) =>
      request<{ data: any }>('/staff/issues', { method: 'POST', body: JSON.stringify(data) }),
    submitLeave:  (data: any) =>
      request<{ data: any }>('/staff/leave', { method: 'POST', body: JSON.stringify(data) }),
    members:      () => request<{ data: any[] }>('/staff/members'),
    geoSettings: {
      get:    () => request<{ data: GeoSettings }>('/staff/settings/geo'),
      update: (radiusMeters: number) =>
        request<{ data: GeoSettings }>('/staff/settings/geo', { method: 'PATCH', body: JSON.stringify({ radiusMeters }) }),
    },
  },
  wholesale: {
    profile: () => request<{ data: any }>('/wholesale/profile'),
    orders: () => request<{ data: any[] }>('/wholesale/orders'),
    createOrder: (data: any) => request<{ data: any }>('/wholesale/orders', { method: 'POST', body: JSON.stringify(data) }),
    invoices: () => request<{ data: any[] }>('/wholesale/invoices'),
    catalog: () => request<{ data: ApiProduct[] }>('/wholesale/catalog'),
  },
  favourites: {
    list: () => request<{ data: { productStripeId: string }[] }>('/favourites'),
    add: (productStripeId: string) =>
      request<{ success: boolean }>('/favourites', { method: 'POST', body: JSON.stringify({ productStripeId }) }),
    remove: (productStripeId: string) =>
      request<{ success: boolean }>(`/favourites/${productStripeId}`, { method: 'DELETE' }),
  },
  addresses: {
    list: () => request<{ data: SavedAddress[] }>('/addresses'),
    create: (data: { label?: string; street: string; apt?: string; suburb: string; postcode: string; state?: string; isDefault?: boolean }) =>
      request<{ data: SavedAddress }>('/addresses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { label?: string; street?: string; apt?: string; suburb?: string; postcode?: string; state?: string; isDefault?: boolean }) =>
      request<{ data: SavedAddress }>(`/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/addresses/${id}`, { method: 'DELETE' }),
  },
  misc: {
    announcements: () => request<{ data: any[] }>('/announcements'),
    feedback: (data: { category?: string; message: string; rating?: number; orderId?: string }) =>
      request<{ data: any }>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  },
  payment: {
    createIntent: (data: { amountCents: number; currency?: string }) =>
      request<{ clientSecret: string; paymentIntentId: string }>('/payment/create-intent', { method: 'POST', body: JSON.stringify(data) }),
  },
  director: {
    stats:               () => request<{ data: any }>('/director/stats'),
    orders:              () => request<{ data: any[] }>('/director/orders'),
    updateOrderStatus:   (id: string, status: string) => request<{ data: any }>(`/director/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    users:               () => request<{ data: any[] }>('/director/users'),
    approveStaff:        (userId: string, approved: boolean) => request<{ data: any }>(`/director/staff/${userId}/approve`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
    setWholesaleStatus:  (accountId: string, status: string) => request<{ data: any }>(`/director/wholesale/${accountId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    products:            () => request<{ data: any[] }>('/director/products'),
    updateProduct:       (id: string, updates: any) => request<{ data: any }>(`/director/products/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    settings:            () => request<{ data: Record<string, string> }>('/director/settings'),
    updateSettings:      (settings: Record<string, string>) => request<{ data: Record<string, string> }>('/director/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
    wholesale:           () => request<{ data: any[] }>('/director/wholesale'),
    createStaff:         (data: { name: string; email: string; password: string; position?: string; department?: string; isManager?: boolean; hourlyRateCents?: number }) =>
      request<{ data: any }>('/director/create-staff', { method: 'POST', body: JSON.stringify(data) }),
    createWholesale:     (data: { name: string; email: string; password: string; companyName: string; abn?: string; phone?: string }) =>
      request<{ data: any }>('/director/create-wholesale', { method: 'POST', body: JSON.stringify(data) }),
  },
  seedDemo: () => request<{ message: string; created: string[]; existing: string[] }>('/auth/seed-demo', { method: 'POST' }),
};

export interface GeoSettings {
  shopLat: number;
  shopLng: number;
  radiusMeters: number;
}

export interface ApiUser {
  id: string;
  email: string;
  role: string;
  name: string;
  phone?: string;
}

export interface ApiProduct {
  id: string;
  name: string;
  description: string;
  metadata?: Record<string, string>;
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
  createdAt: string;
  updatedAt: string;
  stripePaymentIntentId?: string;
  stripePaymentStatus?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsUsed?: number;
  discountCents?: number;
  deliveryAddress?: string;
}

export interface LoyaltyProfile {
  loyaltyPoints: number;
  loyaltyTier: string;
  stampCount: number;
  totalVisits: number;
  totalSpentCents: number;
  referralCode: string;
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
  title: string;
  description: string;
  pointsCost: number;
  type: string;
  isActive: boolean;
}

export interface SavedAddress {
  id: string;
  userId: string;
  label: string;
  street: string;
  apt?: string | null;
  suburb: string;
  postcode: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffProfile {
  userId: string;
  employeeId: string;
  position: string;
  department: string;
  isManager: boolean;
  hourlyRateCents: number;
}
