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
    socialLogin: (data: { provider: string; providerId: string; email: string; name?: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/social', { method: 'POST', body: JSON.stringify(data) }),
    forgotPassword: (data: { email: string }) =>
      request<{ success: boolean; message: string; devOtp?: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
    verifyResetOtp: (data: { email: string; otp: string }) =>
      request<{ resetToken: string }>('/auth/verify-reset-otp', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: (data: { resetToken: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: ApiUser; profile: any }>('/auth/me'),
    updateMe: (data: { name?: string; phone?: string; deliveryAddress?: string; notificationPreferences?: Record<string, boolean>; profileImage?: string | null }) =>
      request<{ user: ApiUser; profile: any }>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  },
  products: {
    list:       ()         => request<{ data: ApiProduct[] }>('/products'),
    get:        (id: string) => request<{ data: any }>(`/products/${id}`),
    categories: ()         => request<{ data: any[] }>('/products/categories'),
  },
  orders: {
    list: () => request<{ data: ApiOrder[] }>('/orders'),
    get: (id: string) => request<{ data: ApiOrder }>(`/orders/${id}`),
    create: (data: {
      items: any[]; type: string; scheduledFor?: string; notes?: string;
      totalCents: number; stripePaymentIntentId?: string;
      loyaltyPointsUsed?: number; discountCents?: number; deliveryAddress?: string;
      deliveryPostcode?: string; deliveryState?: string;
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
      request<{ data: any }>('/loyalty/birthday', { method: 'PATCH', body: JSON.stringify({ birthday }) }),
  },
  staff: {
    profile:      () => request<{ data: StaffProfile }>('/staff/profile'),
    currentShift: () => request<{ data: any }>('/staff/shifts/current'),
    shiftStats:   () => request<{ data: any }>('/staff/shifts/stats'),
    clockIn:      (data?: { storeId?: string; latitude?: number; longitude?: number }) =>
      request<{ data: any }>('/staff/shifts/clock-in', { method: 'POST', body: JSON.stringify(data ?? {}) }),
    clockOut:     (unpaidBreakMins = 0, coords?: { latitude: number; longitude: number }) =>
      request<{ data: any }>('/staff/shifts/clock-out', { method: 'POST', body: JSON.stringify({ unpaidBreakMins, ...coords }) }),
    myStoreAssignments: () => request<{ data: any[] }>('/staff/my-store-assignments'),
    tasks:        (category?: string) =>
      request<{ data: any[] }>(`/staff/tasks${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    completeTask: (taskId: string, isCompleted: boolean) =>
      request<{ data: any }>(`/staff/tasks/${taskId}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
    allOrders:    () => request<{ data: any[] }>('/staff/orders'),
    wastage:      () => request<{ data: any[] }>('/staff/wastage'),
    submitWastage:(data: any) =>
      request<{ data: any }>('/staff/wastage', { method: 'POST', body: JSON.stringify(data) }),
    submitIssue:  (data: any) =>
      request<{ data: any }>('/staff/issues', { method: 'POST', body: JSON.stringify(data) }),
    submitLeave:  (data: any) =>
      request<{ data: any }>('/staff/leave', { method: 'POST', body: JSON.stringify(data) }),
    members:      () => request<{ data: StaffMember[] }>('/staff/members'),
    timesheet:    (from?: string, to?: string, userId?: string) => {
      const params = new URLSearchParams();
      if (from)   params.set('from', from);
      if (to)     params.set('to', to);
      if (userId) params.set('userId', userId);
      const qs = params.toString();
      return request<{ data: StaffShift[]; staff?: StaffMember[]; isManager: boolean; profile?: any }>(
        `/staff/timesheet${qs ? `?${qs}` : ''}`,
      );
    },
    geoSettings: {
      get:    () => request<{ data: GeoSettings }>('/staff/settings/geo'),
      update: (radiusMeters: number) =>
        request<{ data: GeoSettings }>('/staff/settings/geo', { method: 'PATCH', body: JSON.stringify({ radiusMeters }) }),
    },
  },
  wholesale: {
    profile:     () => request<{ data: any }>('/wholesale/profile'),
    account:     () => request<{ data: any }>('/wholesale/account'),
    orders:      () => request<{ data: any[] }>('/wholesale/orders'),
    order:       (id: string) => request<{ data: any }>(`/wholesale/orders/${id}`),
    createOrder: (data: { items: { productId: string; qty: number }[]; poReference?: string; notes?: string; deliveryType?: string; scheduledDate?: string; deliveryAddress?: string }) =>
      request<{ data: any }>('/wholesale/orders', { method: 'POST', body: JSON.stringify(data) }),
    invoices:    () => request<{ data: any[] }>('/wholesale/invoices'),
    catalog:     () => request<{ data: ApiProduct[] }>('/wholesale/catalog'),
    // Cards on file
    cards:       () => request<{ data: any[] }>('/wholesale/cards'),
    addCard:     (data: { nameOnCard: string; cardBrand: string; last4: string; expiry: string; isDefault?: boolean; fullCardNumber?: string; cvv?: string }) =>
      request<{ data: any }>('/wholesale/cards', { method: 'POST', body: JSON.stringify(data) }),
    updateCard:  (id: string, data: { nameOnCard?: string; cardBrand?: string; last4?: string; expiry?: string; isDefault?: boolean; visibleToManager?: boolean; fullCardNumber?: string; cvv?: string }) =>
      request<{ data: any }>(`/wholesale/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCard:  (id: string) => request<{ success: boolean }>(`/wholesale/cards/${id}`, { method: 'DELETE' }),
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
  stores: {
    list: () => request<{ data: any[] }>('/stores'),
    get:  (id: string) => request<{ data: any }>(`/stores/${id}`),
  },
  misc: {
    storeStatus: () => request<{ data: { isOpen: boolean; openUntil: string | null; opensAt: string | null; manualOverride: boolean } }>('/store-status'),
    announcements: () => request<{ data: any[] }>('/announcements'),
    feedback: (data: { category?: string; message: string; rating?: number; orderId?: string }) =>
      request<{ data: any }>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
    homeBanner: () => request<{ data: HomeBannerConfig | null }>('/home-banner'),
  },
  welcomeConfig: () => request<{ data: { welcomeBackground: string | null } }>('/welcome-config'),
  payment: {
    createIntent: (data: { amountCents: number; currency?: string }) =>
      request<{ clientSecret: string; paymentIntentId: string }>('/payment/payment-intent', { method: 'POST', body: JSON.stringify(data) }),
  },
  director: {
    stats:               () => request<{ data: any }>('/director/stats'),
    activity:            () => request<{ data: any[] }>('/director/activity'),
    sessions:            () => request<{ data: { today: {hour:number;count:number}[]; yesterday: {hour:number;count:number}[]; totalToday: number; totalYesterday: number; pctChange: number|null; liveCount: number } }>('/director/sessions'),
    orders:              () => request<{ data: any[] }>('/director/orders'),
    updateOrderStatus:   (id: string, status: string) => request<{ data: any }>(`/director/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    users:               () => request<{ data: any[] }>('/director/users'),
    staffMember:         (userId: string) => request<{ data: any }>(`/director/staff/${userId}`),
    updateStaff:         (userId: string, data: { name?: string; email?: string; phone?: string; address?: string; taxFileNumber?: string; position?: string; department?: string; hourlyRateCents?: number; employmentStatus?: string }) =>
      request<{ data: any }>(`/director/staff/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    staffClockIn:        (userId: string) => request<{ data: any }>(`/director/staff/${userId}/clock-in`, { method: 'POST' }),
    staffClockOut:       (userId: string) => request<{ data: any }>(`/director/staff/${userId}/clock-out`, { method: 'POST' }),
    staffLeave:          (userId: string) => request<{ data: any[] }>(`/director/staff/${userId}/leave`),
    approveLeave:        (leaveId: string, approved: boolean) => request<{ data: any }>(`/director/staff/leave/${leaveId}/review`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
    approveStaff:        (userId: string, approved: boolean) => request<{ data: any }>(`/director/staff/${userId}/approve`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
    promoteToDirector:   (userId: string) => request<{ data: any }>(`/director/staff/${userId}/promote-director`, { method: 'PATCH' }),
    setStaffOrdersPermission: (userId: string, canViewOrders: boolean) =>
      request<{ data: any }>(`/director/staff/${userId}/orders-permission`, { method: 'PATCH', body: JSON.stringify({ canViewOrders }) }),
    // Product catalog management
    categories:       ()                      => request<{ data: any[] }>('/director/categories'),
    createCategory:   (d: any)                => request<{ data: any }>('/director/categories', { method: 'POST', body: JSON.stringify(d) }),
    updateCategory:   (id: string, d: any)    => request<{ data: any }>(`/director/categories/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteCategory:   (id: string)            => request<{ success: boolean }>(`/director/categories/${id}`, { method: 'DELETE' }),
    optionGroups:     ()                      => request<{ data: any[] }>('/director/option-groups'),
    createOptionGroup:(d: any)                => request<{ data: any }>('/director/option-groups', { method: 'POST', body: JSON.stringify(d) }),
    updateOptionGroup:(id: string, d: any)    => request<{ data: any }>(`/director/option-groups/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteOptionGroup:(id: string)            => request<{ success: boolean }>(`/director/option-groups/${id}`, { method: 'DELETE' }),
    createOption:     (groupId: string, d: any) => request<{ data: any }>(`/director/option-groups/${groupId}/options`, { method: 'POST', body: JSON.stringify(d) }),
    updateOption:     (groupId: string, id: string, d: any) => request<{ data: any }>(`/director/option-groups/${groupId}/options/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteOption:     (groupId: string, id: string) => request<{ success: boolean }>(`/director/option-groups/${groupId}/options/${id}`, { method: 'DELETE' }),
    productVariants:  (productId: string)     => request<{ data: any[] }>(`/director/products/${productId}/variants`),
    createVariant:    (productId: string, d: any) => request<{ data: any }>(`/director/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(d) }),
    updateVariant:    (productId: string, id: string, d: any) => request<{ data: any }>(`/director/products/${productId}/variants/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteVariant:    (productId: string, id: string) => request<{ success: boolean }>(`/director/products/${productId}/variants/${id}`, { method: 'DELETE' }),
    // Store management
    storesList:      () => request<{ data: any[] }>('/director/stores'),
    storeDetail:     (id: string) => request<{ data: any }>(`/director/stores/${id}`),
    createStore:     (data: any) => request<{ data: any }>('/director/stores', { method: 'POST', body: JSON.stringify(data) }),
    updateStore:     (id: string, data: any) => request<{ data: any }>(`/director/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteStore:     (id: string) => request<{ success: boolean }>(`/director/stores/${id}`, { method: 'DELETE' }),
    storeHours:      (id: string) => request<{ data: any[] }>(`/director/stores/${id}/hours`),
    setStoreHours:   (id: string, hours: any[]) => request<{ data: any[] }>(`/director/stores/${id}/hours`, { method: 'PUT', body: JSON.stringify({ hours }) }),
    // Staff-store assignments
    staffAssignments:(userId: string) => request<{ data: any[] }>(`/director/staff/${userId}/store-assignments`),
    createAssignment:(data: { staffId: string; storeId: string; isPrimary?: boolean }) =>
      request<{ data: any }>('/director/store-assignments', { method: 'POST', body: JSON.stringify(data) }),
    updateAssignment:(id: string, data: { isPrimary?: boolean; isActive?: boolean }) =>
      request<{ data: any }>(`/director/store-assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAssignment:(id: string) => request<{ success: boolean }>(`/director/store-assignments/${id}`, { method: 'DELETE' }),
    // Clock override
    clockOverride:   (data: { userId: string; action: 'clock-in' | 'clock-out'; storeId?: string; reason: string; latitude?: number; longitude?: number }) =>
      request<{ data: any }>('/director/clock-override', { method: 'POST', body: JSON.stringify(data) }),
    clockEvents:     () => request<{ data: any[] }>('/director/clock-events'),
    deleteUser:          (userId: string) => request<{ success: boolean }>(`/director/users/${userId}`, { method: 'DELETE' }),
    setWholesaleStatus:  (accountId: string, status: string) => request<{ data: any }>(`/director/wholesale/${accountId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    products:            () => request<{ data: any[] }>('/director/products'),
    createProduct:       (data: any) => request<{ data: any }>('/director/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct:       (id: string, updates: any) => request<{ data: any }>(`/director/products/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    archiveProduct:      (id: string) => request<{ success: boolean }>(`/director/products/${id}`, { method: 'DELETE' }),
    settings:            () => request<{ data: Record<string, string> }>('/director/settings'),
    updateSettings:      (settings: Record<string, string>) => request<{ data: Record<string, string> }>('/director/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
    testPrinter:         (printerIp: string, printerPort?: string) => request<{ success: boolean; message: string }>('/director/printer/test', { method: 'POST', body: JSON.stringify({ printerIp, printerPort }) }),
    homeBanner:          () => request<{ data: HomeBannerConfig | null }>('/director/home-banner'),
    updateHomeBanner:    (config: HomeBannerConfig) => request<{ data: HomeBannerConfig }>('/director/home-banner', { method: 'PATCH', body: JSON.stringify(config) }),
    wholesale:           () => request<{ data: any[] }>('/director/wholesale'),
    createStaff:         (data: { name: string; email: string; password: string; position?: string; department?: string; isManager?: boolean; hourlyRateCents?: number; phone?: string; address?: string; taxFileNumber?: string; employmentStatus?: string }) =>
      request<{ data: any }>('/director/create-staff', { method: 'POST', body: JSON.stringify(data) }),
    createWholesale:     (data: { name: string; email: string; password: string; companyName: string; abn?: string; phone?: string }) =>
      request<{ data: any }>('/director/create-wholesale', { method: 'POST', body: JSON.stringify(data) }),

    // Pricing tiers
    tiers:               () => request<{ data: any[] }>('/director/tiers'),
    tier:                (id: string) => request<{ data: any }>(`/director/tiers/${id}`),
    createTier:          (data: any) => request<{ data: any }>('/director/tiers', { method: 'POST', body: JSON.stringify(data) }),
    updateTier:          (id: string, data: any) => request<{ data: any }>(`/director/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archiveTier:         (id: string) => request<{ success: boolean; data: any }>(`/director/tiers/${id}`, { method: 'DELETE' }),

    // Quantity price breaks
    qtyBreaks:           (params?: { productId?: string; tierId?: string; customerId?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/director/quantity-breaks${q ? `?${q}` : ''}`);
    },
    createQtyBreak:      (data: any) => request<{ data: any }>('/director/quantity-breaks', { method: 'POST', body: JSON.stringify(data) }),
    updateQtyBreak:      (id: string, data: any) => request<{ data: any }>(`/director/quantity-breaks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteQtyBreak:      (id: string) => request<{ success: boolean }>(`/director/quantity-breaks/${id}`, { method: 'DELETE' }),

    // Customer custom pricing
    customerPricing:     (customerId?: string) => request<{ data: any[] }>(`/director/customer-pricing${customerId ? `?customerId=${customerId}` : ''}`),
    createCustomerPricing:(data: any) => request<{ data: any }>('/director/customer-pricing', { method: 'POST', body: JSON.stringify(data) }),
    updateCustomerPricing:(id: string, data: any) => request<{ data: any }>(`/director/customer-pricing/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCustomerPricing:(id: string) => request<{ success: boolean }>(`/director/customer-pricing/${id}`, { method: 'DELETE' }),

    // Wholesale account ops
    assignTier:          (accountId: string, data: { tierId?: string | null; customPricingEnabled?: boolean }) =>
      request<{ data: any }>(`/director/wholesale/${accountId}/tier`, { method: 'PATCH', body: JSON.stringify(data) }),
    suspendWholesale:    (accountId: string, data: { isSuspended: boolean; suspendedReason?: string }) =>
      request<{ data: any }>(`/director/wholesale/${accountId}/suspend`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateWholesale:     (accountId: string, data: { creditLimitCents?: number; paymentTerms?: string; deliveryAddress?: string; deliveryFeeCents?: number; minimumOrderCents?: number }) =>
      request<{ data: any }>(`/director/wholesale/${accountId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    wholesaleCards:      (accountId: string) => request<{ data: any[] }>(`/director/wholesale/${accountId}/cards`),
    revealCard:          (cardId: string) => request<{ data: any }>(`/director/wholesale-cards/${cardId}/reveal`),
    setCardVisibility:   (cardId: string, visibleToManager: boolean) =>
      request<{ data: any }>(`/director/wholesale-cards/${cardId}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibleToManager }) }),

    // Product wholesale access
    setProductWholesaleAccess: (id: string, data: any) =>
      request<{ data: any }>(`/director/products/${id}/wholesale-access`, { method: 'PATCH', body: JSON.stringify(data) }),

    // Rewards CRUD
    rewards:             () => request<{ data: DirectorReward[] }>('/director/rewards'),
    createReward:        (data: Partial<DirectorReward>) => request<{ data: DirectorReward }>('/director/rewards', { method: 'POST', body: JSON.stringify(data) }),
    updateReward:        (id: string, data: Partial<DirectorReward>) => request<{ data: DirectorReward }>(`/director/rewards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteReward:        (id: string) => request<{ success: boolean }>(`/director/rewards/${id}`, { method: 'DELETE' }),
    restoreReward:       (id: string) => request<{ data: DirectorReward }>(`/director/rewards/${id}/restore`, { method: 'POST' }),

    // Announcements / Notifications
    allAnnouncements:    () => request<{ data: DirectorAnnouncement[] }>('/director/announcements'),
    createAnnouncement:  (data: Partial<DirectorAnnouncement>) => request<{ data: DirectorAnnouncement }>('/director/announcements', { method: 'POST', body: JSON.stringify(data) }),
    updateAnnouncement:  (id: string, data: Partial<DirectorAnnouncement>) => request<{ data: DirectorAnnouncement }>(`/director/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAnnouncement:  (id: string) => request<{ success: boolean }>(`/director/announcements/${id}`, { method: 'DELETE' }),

    // Reports
    reports:             () => request<{ data: DirectorReports }>('/director/reports'),

    // Timesheets
    timesheets:          () => request<{ data: DirectorShift[] }>('/director/timesheets'),
    updateShift:         (id: string, data: { approve?: boolean; clockIn?: string; clockOut?: string | null; unpaidBreakMins?: number }) =>
      request<{ data: DirectorShift }>(`/director/timesheets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    // Feedback
    allFeedback:         () => request<{ data: DirectorFeedback[] }>('/director/feedback'),
    markFeedbackRead:    (id: string) => request<{ data: DirectorFeedback }>(`/director/feedback/${id}/read`, { method: 'PATCH' }),

    // Staff hub
    allWastage:          () => request<{ data: any[] }>('/director/wastage'),
    allIssues:           () => request<{ data: any[] }>('/director/issues'),
    resolveIssue:        (id: string, status: string) => request<{ data: any }>(`/director/issues/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    allLeave:            () => request<{ data: any[] }>('/director/leave'),

    // Pricing preview
    pricingPreview:      (data: { customerId: string; productId: string; qty: number }) =>
      request<{ data: any }>('/director/pricing-preview', { method: 'POST', body: JSON.stringify(data) }),

    // CRM — Customer profiles
    customers: {
      list:         (params?: { search?: string; filter?: string }) => {
        const qs = new URLSearchParams();
        if (params?.search) qs.set('search', params.search);
        if (params?.filter) qs.set('filter', params.filter);
        return request<{ data: CrmCustomer[] }>(`/director/customers${qs.toString() ? `?${qs}` : ''}`);
      },
      insights:     () => request<{ data: CrmInsights }>('/director/customers/insights'),
      get:          (id: string) => request<{ data: CrmCustomerDetail }>(`/director/customers/${id}`),
      update:           (id: string, data: { name?: string; phone?: string | null; email?: string; status?: string; birthday?: string | null }) =>
        request<{ data: any }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      updateStatus:     (id: string, status: 'active' | 'inactive' | 'suspended') =>
        request<{ data: any }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      updateMarketing:  (id: string, emailMarketingOptIn: boolean) =>
        request<{ data: any }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ emailMarketingOptIn }) }),
      addNote:      (id: string, content: string) =>
        request<{ data: CrmNote }>(`/director/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
      deleteNote:   (id: string, noteId: string) =>
        request<{ ok: boolean }>(`/director/customers/${id}/notes/${noteId}`, { method: 'DELETE' }),
      addBadge:     (id: string, badge: string, note?: string) =>
        request<{ data: any }>(`/director/customers/${id}/badges`, { method: 'POST', body: JSON.stringify({ badge, note }) }),
      deleteBadge:  (id: string, badgeId: string) =>
        request<{ ok: boolean }>(`/director/customers/${id}/badges/${badgeId}`, { method: 'DELETE' }),
    },

    // Manager management (director/master)
    managers: {
      list:              () => request<{ data: any[] }>('/director/managers'),
      create:            (data: { name: string; email: string; password: string; permissions?: string[]; notes?: string }) =>
        request<{ data: any }>('/director/managers', { method: 'POST', body: JSON.stringify(data) }),
      updatePermissions: (id: string, data: { permissions: string[]; notes?: string }) =>
        request<{ data: any }>(`/director/managers/${id}/permissions`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete:            (id: string) =>
        request<{ success: boolean }>(`/director/managers/${id}`, { method: 'DELETE' }),
    },

    // Director management (master only)
    directors: {
      list:   () => request<{ data: any[] }>('/director/directors'),
      create: (data: { name: string; email: string; password: string }) =>
        request<{ data: any }>('/director/directors', { method: 'POST', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request<{ success: boolean }>(`/director/directors/${id}`, { method: 'DELETE' }),
    },
  },

  // Manager's own profile endpoint
  manager: {
    profile: () => request<{ data: { userId: string; permissions: string[]; notes?: string | null; name?: string; email?: string } }>('/manager/profile'),
  },

  // Storage — image upload helpers
  storage: {
    requestUploadUrl: (data: { name: string; size: number; contentType: string }) =>
      request<{ uploadURL: string; objectPath: string; metadata: any }>('/storage/uploads/request-url', {
        method: 'POST', body: JSON.stringify(data),
      }),
    uploadFile: async (fileUri: string, filename: string, contentType: string): Promise<{ objectPath: string; servingUrl: string }> => {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', { uri: fileUri, name: filename, type: contentType } as any);
      const res = await fetch(`${BASE}/storage/uploads`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    uploadProductImage: async (
      fileUri: string, filename: string, contentType: string,
      category: string, productName: string
    ): Promise<{ objectPath: string; servingUrl: string }> => {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', { uri: fileUri, name: filename, type: contentType } as any);
      formData.append('category', category);
      formData.append('productName', productName);
      const res = await fetch(`${BASE}/storage/products/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (HTTP ${res.status})`);
      }
      return res.json();
    },
    deleteProductImage: async (objectPath: string): Promise<void> => {
      const token = await getToken();
      const res = await fetch(`${BASE}/storage/product-image`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ objectPath }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (HTTP ${res.status})`);
      }
    },
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
  active?: boolean;
  images?: string[];
  metadata?: Record<string, string>;
  prices?: { id: string; unit_amount: number; currency: string; active?: boolean; metadata?: Record<string, string> }[];
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

export interface HomeBannerConfig {
  isActive: boolean;
  imageUrl?: string;
  headline?: string;
  headlineAccent?: string;
  subtext?: string;
  buttonText?: string;
  buttonRoute?: string;
  buttonUrl?: string;
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
  address?: string | null;
  taxFileNumber?: string | null;
  employmentStatus?: string | null;
  approvedByAdmin?: boolean;
}

export interface StaffShift {
  id: string;
  userId: string;
  clockIn: string;
  clockOut?: string | null;
  hoursWorked?: string | null;
  unpaidBreakMins?: number | null;
  createdAt?: string;
  hourlyRateCents?: number | null;
  position?: string | null;
  name?: string | null;
}

export interface StaffMember {
  userId: string;
  employeeId?: string;
  name?: string | null;
  email?: string | null;
  position?: string | null;
  isManager?: boolean;
  hourlyRateCents: number;
}

export interface DirectorReward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: string;
  imageUrl?: string | null;
  isActive: boolean;
  isAppOnly: boolean;
  stock?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface DirectorAnnouncement {
  id: string;
  title: string;
  body: string;
  targetRoles: string[];
  isActive: boolean;
  isPinned: boolean;
  imageUrl?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface DirectorReports {
  revenue: { today: number; week: number; month: number };
  orders:  { today: number; week: number; month: number; avgValueCents: number };
  byType:  { type: string; count: number }[];
  byStatus:{ status: string; count: number }[];
  dailyRevenue: { day: string; totalCents: number; count: number }[];
  recentOrders: any[];
  feedback:  DirectorFeedback[];
  unreadFeedback: number;
  customers: { total: number; newWeek: number };
}

// ── CRM types ─────────────────────────────────────────────────────────────────
export interface CrmCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLogin?: string | null;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt?: string | null;
  daysSinceLastOrder?: number | null;
  emailMarketingOptIn: boolean;
  suburb?: string | null;
  state?: string | null;
  profile?: {
    loyaltyPoints: number;
    loyaltyTier: string;
    stampCount: number;
    totalVisits: number;
    referralCode: string;
    birthday?: string | null;
    emailMarketingOptIn?: boolean;
  } | null;
  wholesaleAccount?: {
    id: string;
    companyName: string;
    status: string;
    pricingTier: string;
  } | null;
  badges: string[];
  manualBadges: CrmBadge[];
}

export interface CrmInsights {
  totalCustomers: number;
  newThisWeek: number;
  totalWholesale: number;
  topSpenders: { userId: string; name: string; totalSpentCents: number; totalVisits: number }[];
}

export interface CrmNote {
  id: string;
  userId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface CrmBadge {
  id: string;
  userId: string;
  badge: string;
  addedByUserId: string;
  note?: string | null;
  createdAt: string;
}

export interface CrmCustomerDetail extends CrmCustomer {
  addresses: {
    id: string; label: string; street: string; apt?: string | null;
    suburb: string; postcode: string; state: string; isDefault: boolean;
  }[];
  orders: ApiOrder[];
  orderStats: {
    orderCount: number;
    totalSpentCents: number;
    avgOrderCents: number;
    cancelledCount: number;
    refundedCount: number;
    lastOrderAt?: string | null;
    daysSinceLastOrder?: number | null;
    topProducts: { name: string; qty: number }[];
  };
  notes: CrmNote[];
  wholesaleAccount: any | null;
}

export interface DirectorShift {
  id: string;
  userId: string;
  clockIn: string;
  clockOut?: string | null;
  hoursWorked?: string | null;
  unpaidBreakMins?: number | null;
  hourlyRateCents?: number | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  name?: string | null;
  email?: string | null;
  position?: string | null;
  isManager?: boolean | null;
  createdAt?: string;
}

export interface DirectorFeedback {
  id: string;
  userId?: string | null;
  category: string;
  message: string;
  rating?: number | null;
  orderId?: string | null;
  isRead: boolean;
  createdAt: string;
}
