import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@butterfield_token';

const BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

function normalizeServingUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (BASE.startsWith('http')) {
    try {
      return new URL(url, BASE).toString();
    } catch {
      return url;
    }
  }
  return url;
}

export function getWholesaleInvoiceUrl(orderId: string): string {
  return `${BASE}/invoices/w/${orderId}`;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

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
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body);
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; name: string; phone?: string; birthday?: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    staffLogin: (data: { email: string; password: string; latitude?: number; longitude?: number; accuracyMeters?: number }) =>
      request<{ token: string; user: ApiUser }>('/auth/staff-login', { method: 'POST', body: JSON.stringify(data) }),
    wholesaleApply: (data: {
      email: string; password: string; name: string; phone: string;
      companyName: string; abn?: string; deliveryAddress: string; howDidYouHear?: string;
    }) => request<{ message: string }>('/auth/wholesale-apply', { method: 'POST', body: JSON.stringify(data) }),
    socialLogin: (data: { provider: 'google'; idToken: string } | { provider: 'apple'; idToken: string }) =>
      request<{ token: string; user: ApiUser }>('/auth/social', { method: 'POST', body: JSON.stringify(data) }),
    forgotPassword: (data: { email?: string; phone?: string; method: 'email' | 'sms' }) =>
      request<{ success: boolean; message: string; destination?: string; method?: string; devOtp?: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
    verifyResetOtp: (data: { email?: string; phone?: string; otp: string }) =>
      request<{ resetToken: string }>('/auth/verify-reset-otp', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: (data: { resetToken: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: ApiUser; profile: AuthProfile | null }>('/auth/me'),
    validateStaffInvite: (token: string) =>
      request<{ valid: boolean; note: string | null }>(`/auth/validate-staff-invite?token=${encodeURIComponent(token)}`),
    staffRegister: (data: {
      token: string;
      name: string;
      email: string;
      password: string;
      phone: string;
      address: string;
      dateOfBirth: string;
      storeId: string;
      position?: string;
      department?: string;
      taxFileNumber?: string;
      emergencyContact?: { name: string; phone: string; relationship: string };
    }) => request<{ success: boolean; message: string; employeeId: string }>('/auth/staff-register', { method: 'POST', body: JSON.stringify(data) }),
    updateMe: (data: { name?: string; phone?: string; deliveryAddress?: string; notificationPreferences?: Record<string, boolean>; profileImage?: string | null; preferredStoreId?: string | null }) =>
      request<{ user: ApiUser; profile: AuthProfile | null }>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAccount: () =>
      request<{ success: boolean; message: string }>('/auth/account', { method: 'DELETE' }),
  },
  products: {
    list:       ()         => request<{ data: ApiProduct[] }>('/products'),
    get:        (id: string) => request<{ data: ApiProduct }>(`/products/${id}`),
    categories: ()         => request<{ data: ProductCategory[] }>('/products/categories'),
    topSellers: ()         => request<{ data: ApiProduct[] }>('/products/top-sellers'),
  },
  orders: {
    list: () => request<{ data: ApiOrder[] }>('/orders'),
    get: (id: string) => request<{ data: ApiOrder }>(`/orders/${id}`),
    create: (data: {
      items: ApiOrderItem[]; type: string; scheduledFor?: string; notes?: string;
      totalCents: number; stripePaymentIntentId?: string;
      loyaltyPointsUsed?: number; discountCents?: number; deliveryAddress?: string;
      deliveryPostcode?: string; deliveryState?: string;
      paymentMethod?: 'card' | 'pay_at_pickup';
      discountCode?: string; discountCodeId?: string; paymentMethodType?: string;
      claimedRewardId?: string;
      storeId?: string;
    }) => request<{ data: ApiOrder }>('/orders', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request<{ data: ApiOrder }>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  discounts: {
    validate: (data: { code: string; items: ApiOrderItem[]; orderType?: string }) =>
      request<{ valid: boolean; id: string; code: string; discountAmountCents: number; discountType: string; description: string | null }>(
        '/discounts/validate',
        { method: 'POST', body: JSON.stringify(data) },
      ),
  },
  loyalty: {
    profile: () => request<{ data: LoyaltyProfile }>('/loyalty/profile'),
    ensureQr: () => request<{ data: { loyaltyQrToken: string; qrPayload: string } }>('/loyalty/ensure-qr'),
    transactions: () => request<{ data: LoyaltyTransaction[] }>('/loyalty/transactions'),
    rewards: () => request<{ data: LoyaltyReward[] }>('/loyalty/rewards'),
    lookupCustomer: (payload: string) =>
      request<{ data: LoyaltyLookupResult }>('/loyalty/lookup', { method: 'POST', body: JSON.stringify({ qrPayload: payload }) }),
    addCoffeeStamp: (payload: string, quantity = 1, force = false) =>
      request<{ data: LoyaltyLookupResult }>('/loyalty/scan-stamp', { method: 'POST', body: JSON.stringify({ qrPayload: payload, quantity, force }) }),
    useFreeCoffee: (payload: string) =>
      request<{ data: LoyaltyLookupResult & { redeemedAt?: string } }>('/loyalty/use-free-coffee', { method: 'POST', body: JSON.stringify({ qrPayload: payload }) }),
    redeem: (rewardId: string) =>
      request<{ data: ClaimedReward & { rewardName: string; rewardDescription: string; rewardType: string; linkedProductId: string | null }; reward: LoyaltyReward }>('/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) }),
    claimedRewards: () =>
      request<{ data: ClaimedReward[] }>('/loyalty/claimed-rewards'),
    cancelClaim: (claimId: string) =>
      request<{ success: boolean; pointsRestored: number }>(`/loyalty/claimed-rewards/${claimId}`, { method: 'DELETE' }),
    applyClaim: (claimId: string) =>
      request<{ success: boolean }>(`/loyalty/claimed-rewards/${claimId}/apply`, { method: 'POST' }),
    unapplyClaim: (claimId: string) =>
      request<{ success: boolean }>(`/loyalty/claimed-rewards/${claimId}/unapply`, { method: 'POST' }),
    claimedRewardsHistory: () =>
      request<{ data: ClaimedReward[] }>('/loyalty/claimed-rewards/history'),
    updateBirthday: (birthday: string) =>
      request<{ data: LoyaltyProfile }>('/loyalty/birthday', { method: 'PATCH', body: JSON.stringify({ birthday }) }),
  },
  staff: {
    profile:      () => request<{ data: StaffProfile }>('/staff/profile'),
    currentShift: () => request<{ data: StaffShift | null }>('/staff/shifts/current'),
    shiftStats:   () => request<{ data: StaffShiftStats }>('/staff/shifts/stats'),
    clockIn:      (data?: { storeId?: string; latitude?: number; longitude?: number; accuracyMeters?: number }) =>
      request<{ data: StaffShift }>('/staff/shifts/clock-in', { method: 'POST', body: JSON.stringify(data ?? {}) }),
    clockOut:     (unpaidBreakMins = 0, coords?: { latitude: number; longitude: number }) =>
      request<{ data: StaffShift }>('/staff/shifts/clock-out', { method: 'POST', body: JSON.stringify({ unpaidBreakMins, ...coords }) }),
    myStoreAssignments: () => request<{ data: StaffStoreAssignment[] }>('/staff/my-store-assignments'),
    tasks:        (category?: string) =>
      request<{ data: StaffTask[] }>(`/staff/tasks${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    completeTask: (taskId: string, isCompleted: boolean) =>
      request<{ data: StaffTask }>(`/staff/tasks/${taskId}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
    allOrders:    () => request<{ data: ApiOrder[] }>('/staff/orders'),
    wastage:      () => request<{ data: StaffWastageEntry[] }>('/staff/wastage'),
    submitWastage:(data: StaffWastageInput) =>
      request<{ data: StaffWastageEntry }>('/staff/wastage', { method: 'POST', body: JSON.stringify(data) }),
    submitIssue:  (data: StaffIssueInput) =>
      request<{ data: StaffIssue }>('/staff/issues', { method: 'POST', body: JSON.stringify(data) }),
    submitLeave:  (data: StaffLeaveInput) =>
      request<{ data: StaffLeaveRequest }>('/staff/leave', { method: 'POST', body: JSON.stringify(data) }),
    myLeave:      () => request<{ data: StaffLeaveRequest[] }>('/staff/leave'),
    members:      () => request<{ data: StaffMember[] }>('/staff/members'),
    timesheet:    (from?: string, to?: string, userId?: string) => {
      const params = new URLSearchParams();
      if (from)   params.set('from', from);
      if (to)     params.set('to', to);
      if (userId) params.set('userId', userId);
      const qs = params.toString();
      return request<{ data: StaffShift[]; staff?: StaffMember[]; isManager: boolean; profile?: StaffProfile | null }>(
        `/staff/timesheet${qs ? `?${qs}` : ''}`,
      );
    },
    geoSettings: {
      get:    () => request<{ data: GeoSettings }>('/staff/settings/geo'),
      update: (radiusMeters: number) =>
        request<{ data: GeoSettings }>('/staff/settings/geo', { method: 'PATCH', body: JSON.stringify({ radiusMeters }) }),
    },
  },
  shopDisplay: {
    me: () => request<{ data: ShopDisplayMe }>('/shop-display/me'),
    orders: () => request<{ data: ShopDisplayOrder[] }>('/shop-display/orders'),
    updateOrderStatus: (id: string, status: string) =>
      request<{ data: ShopDisplayOrder }>(`/shop-display/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    tasks: (category?: string) =>
      request<{ data: StaffTask[] }>(`/shop-display/tasks${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    completeTask: (taskId: string, isCompleted: boolean, notes?: string) =>
      request<{ data: StaffTask }>(`/shop-display/tasks/${taskId}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted, notes }) }),
    taskHistory: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return request<{ data: ShopDisplayTaskHistory[] }>(`/shop-display/tasks/history${qs ? `?${qs}` : ''}`);
    },
  },
  wholesale: {
    profile:     () => request<{ data: WholesaleProfile }>('/wholesale/profile'),
    account:     () => request<{ data: WholesaleAccount }>('/wholesale/account'),
    orders:      () => request<{ data: WholesaleOrderRecord[] }>('/wholesale/orders'),
    order:       (id: string) => request<{ data: WholesaleOrderRecord }>(`/wholesale/orders/${id}`),
    createOrder: (data: {
      items: { productId: string; qty: number }[];
      poReference?: string;
      notes?: string;
      deliveryType?: string;
      scheduledDate?: string;
      deliveryAddress?: string;
      stripePaymentIntentId?: string;
      paymentMethodType?: string;
    }) =>
      request<{ data: WholesaleOrderRecord }>('/wholesale/orders', { method: 'POST', body: JSON.stringify(data) }),
    invoices:    () => request<{ data: WholesaleInvoice[] }>('/wholesale/invoices'),
    catalog:     () => request<{ data: ApiProduct[] }>('/wholesale/catalog'),
    pricingContext: () => request<{ data: WholesalePricingContext }>('/wholesale/pricing-context'),
    // Cards on file
    cards:       () => request<{ data: WholesaleCard[] }>('/wholesale/cards'),
    addCard:     (data: { paymentMethodId?: string; nameOnCard?: string; cardBrand?: string; last4?: string; expiry?: string; isDefault?: boolean }) =>
      request<{ data: WholesaleCard }>('/wholesale/cards', { method: 'POST', body: JSON.stringify(data) }),
    updateCard:  (id: string, data: { nameOnCard?: string; isDefault?: boolean }) =>
      request<{ data: WholesaleCard }>(`/wholesale/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCard:  (id: string) => request<{ success: boolean }>(`/wholesale/cards/${id}`, { method: 'DELETE' }),
    createPaymentIntent: (data: { items: { productId: string; qty: number }[]; deliveryType?: 'pickup' | 'delivery'; savePaymentMethod?: boolean }) =>
      request<{ paymentRequired?: boolean; clientSecret: string | null; paymentIntentId: string | null; baseAmountCents?: number; stripeFeeCents?: number; amountCents: number }>(
        '/wholesale/payment-intent',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    confirmSavedMethod: (data: { items: { productId: string; qty: number }[]; deliveryType?: 'pickup' | 'delivery'; paymentMethodId: string }) =>
      request<{ paymentRequired?: boolean; paymentIntentId: string | null; clientSecret: string | null; baseAmountCents?: number; stripeFeeCents?: number; amountCents: number; requiresAction?: boolean; success?: boolean }>(
        '/wholesale/confirm-saved-method',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    confirmIntent: (paymentIntentId: string) =>
      request<{ success?: boolean; requiresAction?: boolean; paymentIntentId: string; clientSecret: string | null }>(
        '/wholesale/confirm-intent',
        { method: 'POST', body: JSON.stringify({ paymentIntentId }) },
      ),
    updateAccountsEmail: (accountsEmail: string | null) =>
      request<{ data: WholesaleAccount }>('/wholesale/account/accounts-email', { method: 'PATCH', body: JSON.stringify({ accountsEmail }) }),
    updateBusinessHours: (businessHours: string | null) =>
      request<{ data: WholesaleAccount }>('/wholesale/account/business-hours', { method: 'PATCH', body: JSON.stringify({ businessHours }) }),
    deliverySchedule: () =>
      request<{ data: { slots: WholesaleDeliverySlot[] } }>('/wholesale/delivery-schedule'),
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
    list: () => request<{ data: StoreSummary[] }>('/stores'),
    get:  (id: string) => request<{ data: StoreDetail }>(`/stores/${id}`),
  },
  misc: {
    storeStatus: () => request<{ data: { isOpen: boolean; openUntil: string | null; opensAt: string | null; manualOverride: boolean } }>('/store-status'),
    announcements: () => request<{ data: DirectorAnnouncement[] }>('/announcements'),
    feedback: (data: { category?: string; message: string; rating?: number; orderId?: string }) =>
      request<{ data: DirectorFeedback }>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
    homeBanner: () => request<{ data: HomeBannerConfig | null }>('/home-banner'),
    context: () => request<{ data: LiveContext }>('/context'),
  },
  notifications: {
    registerToken: (data: { token: string; platform?: string; deviceName?: string }) =>
      request<{ ok: true }>('/notifications/register-token', { method: 'POST', body: JSON.stringify(data) }),
    unregisterToken: (data: { token: string }) =>
      request<{ ok: true }>('/notifications/register-token', { method: 'DELETE', body: JSON.stringify(data) }),
    getPreferences: () => request<{ data: Record<string, boolean> }>('/notifications/preferences'),
    preferences: () => request<{ data: Record<string, boolean> }>('/notifications/preferences'),
    updatePreferences: (prefs: Record<string, boolean>) =>
      request<{ ok: boolean; data: Record<string, boolean> }>('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(prefs) }),
    logs: () => request<{ data: NotificationLogRecord[] }>('/notifications/logs'),
    send: (data: { type: string; title: string; body: string; targetRole?: string; targetUserId?: string; data?: Record<string, unknown> }) =>
      request<{ ok: true }>('/notifications/send', { method: 'POST', body: JSON.stringify(data) }),
    scheduled: () => request<{ data: ScheduledNotificationRecord[] }>('/notifications/scheduled'),
    createScheduled: (data: {
      title: string;
      message: string;
      imageUrl?: string | null;
      imageObjectPath?: string | null;
      actionType?: string | null;
      actionValue?: string | null;
      audienceType: ScheduledNotificationAudienceType;
      audienceFilters?: ScheduledNotificationFilters | null;
      scheduledAt: string;
      status?: 'draft' | 'scheduled';
    }) =>
      request<{ data: ScheduledNotificationRecord }>('/notifications/scheduled', { method: 'POST', body: JSON.stringify(data) }),
    updateScheduled: (id: string, data: Partial<{
      title: string;
      message: string;
      imageUrl: string | null;
      imageObjectPath: string | null;
      actionType: string | null;
      actionValue: string | null;
      audienceType: ScheduledNotificationAudienceType;
      audienceFilters: ScheduledNotificationFilters | null;
      scheduledAt: string;
      status: ScheduledNotificationStatus;
    }>) =>
      request<{ data: ScheduledNotificationRecord }>(`/notifications/scheduled/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    cancelScheduled: (id: string) =>
      request<{ data: ScheduledNotificationRecord }>(`/notifications/scheduled/${id}/cancel`, { method: 'POST' }),
  },
  welcomeConfig: () => request<{ data: { welcomeBackground: string | null } }>('/welcome-config'),
  payment: {
    config: () => request<{ data: { publishableKey: string | null; merchantDisplayName: string } }>('/payment/config'),
    methods: () => request<{ data: Array<{ id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null; isDefault: boolean }> }>('/payment/methods'),
    saveMethod: (data: { paymentMethodId: string; setAsDefault?: boolean }) =>
      request<{ data: { id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null; isDefault: boolean } }>('/payment/methods', { method: 'POST', body: JSON.stringify(data) }),
    setDefaultMethod: (paymentMethodId: string) =>
      request<{ success: boolean }>(`/payment/methods/${paymentMethodId}/default`, { method: 'PATCH' }),
    deleteMethod: (paymentMethodId: string) =>
      request<{ success: boolean }>(`/payment/methods/${paymentMethodId}`, { method: 'DELETE' }),
    createIntent: (data: {
      items: Array<{
        productId: string;
        variantId?: string | null;
        quantity: number;
        selectedOptions?: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>;
      }>;
      orderType: 'pickup' | 'delivery';
      discountCode?: string;
      paymentMethod?: 'card' | 'pay_at_pickup';
      claimedRewardId?: string;
      loyaltyPointsUsed?: number;
      savePaymentMethod?: boolean;
    }) =>
      request<{
        paymentRequired?: boolean;
        clientSecret: string | null;
        paymentIntentId: string | null;
        customerId?: string | null;
        customerEphemeralKeySecret?: string | null;
        amountCents: number;
        discountAmountCents?: number;
        rewardDiscountCents?: number;
      }>('/payment/payment-intent', { method: 'POST', body: JSON.stringify(data) }),
    confirmSavedMethod: (data: {
      items: Array<{
        productId: string;
        variantId?: string | null;
        quantity: number;
        selectedOptions?: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>;
      }>;
      orderType: 'pickup' | 'delivery';
      discountCode?: string;
      claimedRewardId?: string;
      loyaltyPointsUsed?: number;
      paymentMethodId: string;
    }) =>
      request<{
        paymentRequired?: boolean;
        paymentIntentId: string | null;
        clientSecret: string | null;
        amountCents: number;
        discountAmountCents?: number;
        requiresAction?: boolean;
        success?: boolean;
      }>('/payment/confirm-saved-method', { method: 'POST', body: JSON.stringify(data) }),
    confirmIntent: (paymentIntentId: string) =>
      request<{ success?: boolean; requiresAction?: boolean; paymentIntentId: string; clientSecret: string | null }>(
        '/payment/confirm-intent',
        { method: 'POST', body: JSON.stringify({ paymentIntentId }) },
      ),
  },
  director: {
    stats:               () => request<{ data: DirectorStats }>('/director/stats'),
    activity:            () => request<{ data: DirectorActivityItem[] }>('/director/activity'),
    sessions:            () => request<{ data: { today: {hour:number;count:number}[]; lastWeek: {hour:number;count:number}[]; totalToday: number; totalLastWeek: number; pctChange: number|null; liveCount: number } }>('/director/sessions'),
    revenue:             (from: string, to: string) => request<{ data: { total: number; from: string; to: string } }>(`/director/stats/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    deletedAccounts:     () => request<{ data: DeletedAccount[] }>('/director/deleted-accounts'),
    restoreAccount:      (id: string) => request<{ success: boolean; data: DeletedAccount }>(`/director/deleted-accounts/${id}/restore`, { method: 'POST' }),
    orders:              () => request<{ data: ApiOrder[] }>('/director/orders'),
    updateOrderStatus:   (id: string, status: string) => request<{ data: ApiOrder }>(`/director/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    users:               () => request<{ data: DirectorUserSummary[] }>('/director/users'),
    staffMember:         (userId: string) => request<{ data: DirectorStaffMember }>(`/director/staff/${userId}`),
    updateStaff:         (userId: string, data: { name?: string; email?: string; phone?: string; address?: string; taxFileNumber?: string; position?: string; department?: string; hourlyRateCents?: number; employmentStatus?: string }) =>
      request<{ data: DirectorStaffMember }>(`/director/staff/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    staffClockIn:        (userId: string) => request<{ data: StaffShift }>(`/director/staff/${userId}/clock-in`, { method: 'POST' }),
    staffClockOut:       (userId: string) => request<{ data: StaffShift }>(`/director/staff/${userId}/clock-out`, { method: 'POST' }),
    staffLeave:          (userId: string) => request<{ data: StaffLeaveRequest[] }>(`/director/staff/${userId}/leave`),
    approveLeave:        (leaveId: string, approved: boolean, note?: string) => request<{ data: StaffLeaveRequest }>(`/director/staff/leave/${leaveId}/review`, { method: 'PATCH', body: JSON.stringify({ approved, note }) }),
    approveStaff:        (userId: string, approved: boolean) => request<{ data: DirectorStaffMember }>(`/director/staff/${userId}/approve`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
    promoteToDirector:   (userId: string) => request<{ data: DirectorStaffMember }>(`/director/staff/${userId}/promote-director`, { method: 'PATCH' }),
    setStaffOrdersPermission: (userId: string, canViewOrders: boolean) =>
      request<{ data: DirectorStaffMember }>(`/director/staff/${userId}/orders-permission`, { method: 'PATCH', body: JSON.stringify({ canViewOrders }) }),
    // Product catalog management
    categories:       ()                      => request<{ data: DirectorCategory[] }>('/director/categories'),
    createCategory:   (d: DirectorCategoryInput)                => request<{ data: DirectorCategory }>('/director/categories', { method: 'POST', body: JSON.stringify(d) }),
    updateCategory:   (id: string, d: DirectorCategoryInput)    => request<{ data: DirectorCategory }>(`/director/categories/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteCategory:   (id: string)            => request<{ success: boolean }>(`/director/categories/${id}`, { method: 'DELETE' }),
    optionGroups:     ()                      => request<{ data: DirectorOptionGroup[] }>('/director/option-groups'),
    createOptionGroup:(d: DirectorOptionGroupInput)                => request<{ data: DirectorOptionGroup }>('/director/option-groups', { method: 'POST', body: JSON.stringify(d) }),
    updateOptionGroup:(id: string, d: DirectorOptionGroupInput)    => request<{ data: DirectorOptionGroup }>(`/director/option-groups/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteOptionGroup:(id: string)            => request<{ success: boolean }>(`/director/option-groups/${id}`, { method: 'DELETE' }),
    createOption:     (groupId: string, d: DirectorOptionInput) => request<{ data: DirectorOption }>(`/director/option-groups/${groupId}/options`, { method: 'POST', body: JSON.stringify(d) }),
    updateOption:     (groupId: string, id: string, d: DirectorOptionInput) => request<{ data: DirectorOption }>(`/director/option-groups/${groupId}/options/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteOption:     (groupId: string, id: string) => request<{ success: boolean }>(`/director/option-groups/${groupId}/options/${id}`, { method: 'DELETE' }),
    productVariants:  (productId: string)     => request<{ data: DirectorProductVariant[] }>(`/director/products/${productId}/variants`),
    createVariant:    (productId: string, d: DirectorProductVariantInput) => request<{ data: DirectorProductVariant }>(`/director/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(d) }),
    updateVariant:    (productId: string, id: string, d: DirectorProductVariantInput) => request<{ data: DirectorProductVariant }>(`/director/products/${productId}/variants/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteVariant:    (productId: string, id: string) => request<{ success: boolean }>(`/director/products/${productId}/variants/${id}`, { method: 'DELETE' }),
    // Store management
    storesList:      () => request<{ data: StoreSummary[] }>('/director/stores'),
    storeDetail:     (id: string) => request<{ data: StoreDetail }>(`/director/stores/${id}`),
    createStore:     (data: StoreInput) => request<{ data: StoreDetail }>('/director/stores', { method: 'POST', body: JSON.stringify(data) }),
    updateStore:     (id: string, data: StoreInput) => request<{ data: StoreDetail }>(`/director/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteStore:     (id: string) => request<{ success: boolean }>(`/director/stores/${id}`, { method: 'DELETE' }),
    restoreStore:    (id: string) => request<{ success: boolean; data: StoreDetail }>(`/director/stores/${id}/restore`, { method: 'POST' }),
    storeHours:      (id: string) => request<{ data: StoreHour[] }>(`/director/stores/${id}/hours`),
    setStoreHours:   (id: string, hours: StoreHour[] ) => request<{ data: StoreHour[] }>(`/director/stores/${id}/hours`, { method: 'PUT', body: JSON.stringify({ hours }) }),
    // Staff-store assignments
    staffAssignments:(userId: string) => request<{ data: StaffStoreAssignment[] }>(`/director/staff/${userId}/store-assignments`),
    createAssignment:(data: { staffId: string; storeId: string; isPrimary?: boolean }) =>
      request<{ data: StaffStoreAssignment }>('/director/store-assignments', { method: 'POST', body: JSON.stringify(data) }),
    updateAssignment:(id: string, data: { isPrimary?: boolean; isActive?: boolean }) =>
      request<{ data: StaffStoreAssignment }>(`/director/store-assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAssignment:(id: string) => request<{ success: boolean }>(`/director/store-assignments/${id}`, { method: 'DELETE' }),
    // Clock override
    clockOverride:   (data: { userId: string; action: 'clock-in' | 'clock-out'; storeId?: string; reason: string; latitude?: number; longitude?: number }) =>
      request<{ data: StaffShift }>('/director/clock-override', { method: 'POST', body: JSON.stringify(data) }),
    clockEvents:     () => request<{ data: StaffShift[] }>('/director/clock-events'),
    deleteUser:          (userId: string) => request<{ success: boolean }>(`/director/users/${userId}`, { method: 'DELETE' }),
    setWholesaleStatus:  (accountId: string, status: string) => request<{ data: WholesaleAccount }>(`/director/wholesale/${accountId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    wholesaleDeliverySettings: () =>
      request<{ data: { slots: WholesaleDeliverySlot[]; cutoffReminderEnabled: boolean } }>('/director/wholesale-delivery-settings'),
    updateWholesaleDeliverySettings: (data: { slots: WholesaleDeliverySlot[]; cutoffReminderEnabled: boolean }) =>
      request<{ success: boolean }>('/director/wholesale-delivery-settings', { method: 'PATCH', body: JSON.stringify(data) }),
    products:            () => request<{ data: DirectorCatalogProduct[] }>('/director/products'),
    createProduct:       (data: DirectorProductInput) => request<{ data: DirectorCatalogProduct }>('/director/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct:       (id: string, updates: DirectorProductInput) => request<{ data: DirectorCatalogProduct }>(`/director/products/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    archiveProduct:      (id: string) => request<{ success: boolean }>(`/director/products/${id}`, { method: 'DELETE' }),
    settings:            () => request<{ data: Record<string, string> }>('/director/settings'),
    updateSettings:      (settings: Record<string, string>) => request<{ data: Record<string, string> }>('/director/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
    loyaltyTierSettings: async () => {
      const res = await request<{ data: Record<string, string> }>('/director/settings');
      return {
        data: parseLoyaltyTierSettingsValue(res.data.loyalty_tier_settings),
      };
    },
    updateLoyaltyTierSettings: async (settings: LoyaltyTierSettings) => {
      const res = await request<{ data: Record<string, string> }>('/director/settings', {
        method: 'PATCH',
        body: JSON.stringify({ loyalty_tier_settings: JSON.stringify(settings) }),
      });
      return {
        data: parseLoyaltyTierSettingsValue(res.data.loyalty_tier_settings),
      };
    },
    printerBytes:        (job?: PrinterJob) =>
      request<{ data: { bytes: string } }>('/director/printer/bytes', { method: 'POST', body: JSON.stringify(job ? { job } : {}) }),
    homeBanner:          () => request<{ data: HomeBannerConfig | null }>('/director/home-banner'),
    updateHomeBanner:    (config: HomeBannerConfig) => request<{ data: HomeBannerConfig }>('/director/home-banner', { method: 'PATCH', body: JSON.stringify(config) }),
    wholesale:           () => request<{ data: WholesaleAccount[] }>('/director/wholesale'),
    createStaff:         (data: { name: string; email: string; password: string; position?: string; department?: string; isManager?: boolean; hourlyRateCents?: number; phone?: string; address?: string; taxFileNumber?: string; employmentStatus?: string }) =>
      request<{ data: DirectorStaffMember }>('/director/create-staff', { method: 'POST', body: JSON.stringify(data) }),
    generateStaffInvite: (data: { note?: string; expiryDays?: number }) =>
      request<{ data: StaffInviteToken }>('/director/staff-invites', { method: 'POST', body: JSON.stringify(data) }),
    listStaffInvites:    () => request<{ data: StaffInviteToken[] }>('/director/staff-invites'),
    revokeStaffInvite:   (id: string) => request<{ success: boolean }>(`/director/staff-invites/${id}`, { method: 'DELETE' }),
    createWholesale:     (data: { name: string; email: string; password: string; companyName: string; abn?: string; phone?: string }) =>
      request<{ data: WholesaleAccount }>('/director/create-wholesale', { method: 'POST', body: JSON.stringify(data) }),
    shopDisplays:        () => request<{ data: ShopDisplayUser[] }>('/director/shop-displays'),
    createShopDisplay:   (data: { name: string; email: string; password: string; phone?: string }) =>
      request<{ data: ShopDisplayUser }>('/director/shop-displays', { method: 'POST', body: JSON.stringify(data) }),
    updateShopDisplay:   (id: string, data: { name?: string; email?: string; phone?: string; status?: 'active' | 'inactive' | 'suspended' }) =>
      request<{ data: ShopDisplayUser }>(`/director/shop-displays/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    resetShopDisplayPassword: (id: string, password: string) =>
      request<{ success: boolean }>(`/director/shop-displays/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    deleteShopDisplay:   (id: string) => request<{ success: boolean }>(`/director/shop-displays/${id}`, { method: 'DELETE' }),

    // Pricing tiers
    tiers:               () => request<{ data: PricingTier[] }>('/director/tiers'),
    tier:                (id: string) => request<{ data: PricingTier }>(`/director/tiers/${id}`),
    createTier:          (data: PricingTierInput) => request<{ data: PricingTier }>('/director/tiers', { method: 'POST', body: JSON.stringify(data) }),
    updateTier:          (id: string, data: PricingTierInput) => request<{ data: PricingTier }>(`/director/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archiveTier:         (id: string) => request<{ success: boolean; data: PricingTier }>(`/director/tiers/${id}`, { method: 'DELETE' }),
    deleteTier:          (id: string, force?: boolean) =>
      request<{ success: boolean; assignedCount?: number; unassignedCount?: number }>(
        `/director/tiers/${id}`, { method: 'DELETE', body: force ? JSON.stringify({ force: true }) : undefined },
      ),

    // Quantity price breaks
    qtyBreaks:           (params?: { productId?: string; tierId?: string; customerId?: string }) => {
      const q = new URLSearchParams(
        Object.entries(params ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
          if (value) acc[key] = value;
          return acc;
        }, {}),
      ).toString();
      return request<{ data: QuantityPriceBreak[] }>(`/director/quantity-breaks${q ? `?${q}` : ''}`);
    },
    createQtyBreak:      (data: QuantityPriceBreakInput) => request<{ data: QuantityPriceBreak }>('/director/quantity-breaks', { method: 'POST', body: JSON.stringify(data) }),
    updateQtyBreak:      (id: string, data: QuantityPriceBreakInput) => request<{ data: QuantityPriceBreak }>(`/director/quantity-breaks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteQtyBreak:      (id: string) => request<{ success: boolean }>(`/director/quantity-breaks/${id}`, { method: 'DELETE' }),

    // Customer custom pricing
    customerPricing:     (customerId?: string) => request<{ data: CustomerPricingRule[] }>(`/director/customer-pricing${customerId ? `?customerId=${customerId}` : ''}`),
    createCustomerPricing:(data: CustomerPricingRuleInput) => request<{ data: CustomerPricingRule }>('/director/customer-pricing', { method: 'POST', body: JSON.stringify(data) }),
    updateCustomerPricing:(id: string, data: CustomerPricingRuleInput) => request<{ data: CustomerPricingRule }>(`/director/customer-pricing/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCustomerPricing:(id: string) => request<{ success: boolean }>(`/director/customer-pricing/${id}`, { method: 'DELETE' }),

    // Wholesale account ops
    assignTier:          (accountId: string, data: { tierId?: string | null; customPricingEnabled?: boolean }) =>
      request<{ data: WholesaleAccount }>(`/director/wholesale/${accountId}/tier`, { method: 'PATCH', body: JSON.stringify(data) }),
    suspendWholesale:    (accountId: string, data: { isSuspended: boolean; suspendedReason?: string }) =>
      request<{ data: WholesaleAccount }>(`/director/wholesale/${accountId}/suspend`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateWholesale:     (accountId: string, data: {
      creditEnabled?: boolean;
      creditLimitCents?: number;
      creditNotes?: string | null;
      paymentTerms?: string | null;
      deliveryAddress?: string;
      deliveryFeeCents?: number;
      minimumOrderCents?: number;
      accountManagerName?: string | null;
      accountManagerPhone?: string | null;
      accountManagerEmail?: string | null;
      accountsEmail?: string | null;
    }) =>
      request<{ data: WholesaleAccount }>(`/director/wholesale/${accountId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    wholesaleCards:      (accountId: string) => request<{ data: WholesaleCard[] }>(`/director/wholesale/${accountId}/cards`),

    // Product wholesale access
    setProductWholesaleAccess: (id: string, data: ProductWholesaleAccessInput) =>
      request<{ data: DirectorCatalogProduct }>(`/director/products/${id}/wholesale-access`, { method: 'PATCH', body: JSON.stringify(data) }),

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

    // Discount codes
    discountCodes:       () => request<{ data: DiscountCodeRecord[] }>('/director/discount-codes'),
    createDiscountCode:  (data: DiscountCodeInput) => request<{ data: DiscountCodeRecord }>('/director/discount-codes', { method: 'POST', body: JSON.stringify(data) }),
    updateDiscountCode:  (id: string, data: DiscountCodeInput) => request<{ data: DiscountCodeRecord }>(`/director/discount-codes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteDiscountCode:  (id: string) => request<{ success: boolean }>(`/director/discount-codes/${id}`, { method: 'DELETE' }),

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
    allWastage:          () => request<{ data: StaffWastageEntry[] }>('/director/wastage'),
    deleteWastage:       (id: string) => request<{ data: StaffWastageEntry }>(`/director/wastage/${id}`, { method: 'DELETE' }),
    allIssues:           () => request<{ data: StaffIssue[] }>('/director/issues'),
    resolveIssue:        (id: string, status: string) => request<{ data: StaffIssue }>(`/director/issues/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    tasks:               () => request<{ data: StaffTask[] }>('/director/tasks'),
    staffList:           () => request<{ data: { id: string; name: string; role: string }[] }>('/director/staff-list'),
    createTask:          (data: { title: string; description?: string; category?: string; cadence?: 'daily' | 'weekly' | 'one_off'; isRecurring?: boolean; assignedToUserId?: string | null; assignedToName?: string | null }) =>
      request<{ data: StaffTask }>('/director/tasks', { method: 'POST', body: JSON.stringify(data) }),
    updateTask:          (id: string, data: { title?: string; description?: string; category?: string; cadence?: 'daily' | 'weekly' | 'one_off'; isRecurring?: boolean; assignedToUserId?: string | null; assignedToName?: string | null }) =>
      request<{ data: StaffTask }>(`/director/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    reorderTasks:        (taskIds: string[]) => request<{ success: boolean }>('/director/tasks/reorder', { method: 'POST', body: JSON.stringify({ taskIds }) }),
    deleteTask:          (id: string) => request<{ success: boolean }>(`/director/tasks/${id}`, { method: 'DELETE' }),
    completeTask:        (id: string, isCompleted: boolean) =>
      request<{ data: StaffTask }>(`/director/tasks/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
    allLeave:            () => request<{ data: StaffLeaveRequest[] }>('/director/leave'),
    deleteLeave:         (id: string) => request<{ data: StaffLeaveRequest }>(`/director/leave/${id}`, { method: 'DELETE' }),
    taskHistory:         (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      const qs = params.toString();
      return request<{ data: TaskHistoryEntry[] }>(`/director/tasks/history${qs ? `?${qs}` : ''}`);
    },

    // Pricing preview
    pricingPreview:      (data: { customerId: string; productId: string; qty: number }) =>
      request<{ data: WholesalePricePreview }>('/director/pricing-preview', { method: 'POST', body: JSON.stringify(data) }),

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
      update:           (id: string, data: { name?: string; phone?: string | null; email?: string; status?: string; birthday?: string | null; payAtPickupEnabled?: boolean }) =>
        request<{ data: CrmCustomer }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      promote:          (id: string, role: 'staff' | 'manager' | 'director' | 'master', accessRole?: AccessRole) =>
        request<{ data: CrmCustomer }>(`/director/customers/${id}/promote`, { method: 'PATCH', body: JSON.stringify({ role, accessRole }) }),
      updateStatus:     (id: string, status: 'active' | 'inactive' | 'suspended') =>
        request<{ data: CrmCustomer }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      updateMarketing:  (id: string, emailMarketingOptIn: boolean) =>
        request<{ data: CrmCustomer }>(`/director/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ emailMarketingOptIn }) }),
      addNote:      (id: string, content: string) =>
        request<{ data: CrmNote }>(`/director/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
      deleteNote:   (id: string, noteId: string) =>
        request<{ ok: boolean }>(`/director/customers/${id}/notes/${noteId}`, { method: 'DELETE' }),
      addBadge:     (id: string, badge: string, note?: string) =>
        request<{ data: CrmBadge }>(`/director/customers/${id}/badges`, { method: 'POST', body: JSON.stringify({ badge, note }) }),
      deleteBadge:  (id: string, badgeId: string) =>
        request<{ ok: boolean }>(`/director/customers/${id}/badges/${badgeId}`, { method: 'DELETE' }),
    },

    // Manager management (director/master)
    managers: {
      list:              () => request<{ data: DirectorManager[] }>('/director/managers'),
      create:            (data: { name: string; email: string; password: string; permissions?: string[]; notes?: string; accessRole?: AccessRole }) =>
        request<{ data: DirectorManager }>('/director/managers', { method: 'POST', body: JSON.stringify(data) }),
      updatePermissions: (id: string, data: { permissions: string[]; notes?: string; accessRole?: AccessRole }) =>
        request<{ data: DirectorManager }>(`/director/managers/${id}/permissions`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete:            (id: string) =>
        request<{ success: boolean }>(`/director/managers/${id}`, { method: 'DELETE' }),
    },

    // Director management (master only)
    directors: {
      list:   () => request<{ data: DirectorIdentity[] }>('/director/directors'),
      create: (data: { name: string; email: string; password: string }) =>
        request<{ data: DirectorIdentity }>(`/director/directors`, { method: 'POST', body: JSON.stringify(data) }),
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
      request<{ uploadURL: string; objectPath: string; metadata: Record<string, unknown> }>('/storage/uploads/request-url', {
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
      const data = await res.json();
      return {
        ...data,
        servingUrl: normalizeServingUrl(data.servingUrl),
      };
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
      const data = await res.json();
      return {
        ...data,
        servingUrl: normalizeServingUrl(data.servingUrl),
      };
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

  stock: {
    categories:       () => request<{ data: { id: string; label: string }[] }>('/stock/categories'),
    createCategory:   (name: string) => request<{ data: StockCategory }>('/stock/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteCategory:   (id: string) => request<{ data: { success: boolean } }>(`/stock/categories/${id}`, { method: 'DELETE' }),
    items:            () => request<{ data: StockItem[] }>('/stock/items'),
    create:           (data: StockItemInput) => request<{ data: StockItem }>('/stock/items', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<StockItemInput>) => request<{ data: StockItem }>(`/stock/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateQuantity: (id: string, currentQuantity: number) =>
      request<{ data: StockItem }>(`/stock/items/${id}`, { method: 'PATCH', body: JSON.stringify({ currentQuantity }) }),
    delete: (id: string) => request<{ data: { success: boolean } }>(`/stock/items/${id}`, { method: 'DELETE' }),
  },
};

export interface StockItem {
  id: string;
  name: string;
  category: 'coffee' | 'drinks' | 'front_of_house' | 'sauces' | 'chocolate' | 'kitchen';
  unit: string;
  currentQuantity: number;
  lowStockThreshold: number;
  costCents?: number | null;
  supplier?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  galleryUrls?: string[];
  productUrl?: string | null;
  shortDescription?: string | null;
  ingredients?: string | null;
  nutritionInfo?: string | null;
  storageInstructions?: string | null;
  servingInstructions?: string | null;
  metadata?: Record<string, string>;
  prices?: { id: string; unit_amount: number; currency: string; active?: boolean; metadata?: Record<string, string> }[];
}

export interface ApiOrder {
  id: string;
  userId: string;
  storeId?: string | null;
  status: string;
  type: string;
  scheduledFor?: string;
  notes?: string;
  totalCents: number;
  items: ApiOrderItem[];
  createdAt: string;
  updatedAt: string;
  stripePaymentIntentId?: string;
  stripePaymentStatus?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsUsed?: number;
  discountCents?: number;
  deliveryAddress?: string;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  invoiceDueDate?: string | null;
  stripeInvoiceId?: string | null;
}

export interface LiveContext {
  weather: {
    temp: number;
    apparentTemp: number;
    condition: 'clear' | 'cloudy' | 'foggy' | 'rainy' | 'showery' | 'stormy';
    emoji: string;
    description: string;
  } | null;
  publicHoliday: string | null;
  islamicHoliday: string | null;
  isRamadan: boolean;
  hijriDay: number;
  hijriMonth: number;
  hijriYear: number;
  fetchedAt: number;
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
  userId?: string;
  preferredStoreId?: string | null;
  customerName?: string;
  customerEmail?: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  stampCount: number;
  coffeeStampCount?: number;
  freeCoffeeRewards?: number;
  totalVisits: number;
  totalSpentCents: number;
  referralCode: string;
  loyaltyQrToken?: string | null;
  qrPayload?: string | null;
  recentActivity?: LoyaltyActivity[];
  freeCoffeesEarned?: number;
  loyaltyTierSettings?: LoyaltyTierSettings;
}

export type LoyaltyTierKey = 'blue' | 'silver' | 'gold' | 'black';

export interface LoyaltyTierSetting {
  key: LoyaltyTierKey;
  label: string;
  spendThresholdCents: number;
  gradient: [string, string];
  accent: string;
  progressColor: string;
  benefits: string[];
  rewardSettings: string;
}

export type LoyaltyTierSettings = Record<LoyaltyTierKey, LoyaltyTierSetting>;

const DEFAULT_LOYALTY_TIER_SETTINGS: LoyaltyTierSettings = {
  blue: {
    key: 'blue',
    label: 'Blue',
    spendThresholdCents: 20000,
    gradient: ['#1493FF', '#0C63D8'],
    accent: '#1493FF',
    progressColor: '#7FD3FF',
    benefits: [
      'Base tier entry experience',
      'Birthday reward eligibility',
      'App-only member offers',
      'Standard points earning',
    ],
    rewardSettings: 'Standard member rewards and app offers.',
  },
  silver: {
    key: 'silver',
    label: 'Silver',
    spendThresholdCents: 50000,
    gradient: ['#B7C0CD', '#747F90'],
    accent: '#D6DEE8',
    progressColor: '#EEF3F9',
    benefits: [
      'Everything in Blue',
      'Higher-value monthly rewards',
      'Earlier drop access',
      'Stronger loyalty reward settings',
    ],
    rewardSettings: 'Improved monthly rewards and priority access.',
  },
  gold: {
    key: 'gold',
    label: 'Gold',
    spendThresholdCents: 100000,
    gradient: ['#E3B55F', '#A77516'],
    accent: '#F4D48C',
    progressColor: '#FFF2CC',
    benefits: [
      'Everything in Silver',
      'Priority member treatment',
      'Richer ongoing benefits',
      'Premium reward unlocks',
    ],
    rewardSettings: 'Premium monthly rewards and priority treatment.',
  },
  black: {
    key: 'black',
    label: 'Black',
    spendThresholdCents: 200000,
    gradient: ['#1A1E27', '#05070B'],
    accent: '#51A9FF',
    progressColor: '#93C5FD',
    benefits: [
      'Everything in Gold',
      'Top-tier exclusive benefits',
      'Best reward settings',
      'Highest-value member treatment',
    ],
    rewardSettings: 'Top-tier exclusives, highest-value rewards and VIP treatment.',
  },
};

function parseLoyaltyTierSettingsValue(raw: string | null | undefined): LoyaltyTierSettings {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    const source = parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {};
    const pick = (key: LoyaltyTierKey): LoyaltyTierSetting => {
      const defaults = DEFAULT_LOYALTY_TIER_SETTINGS[key];
      const input = source[key] ?? {};
      return {
        key,
        label: typeof input.label === 'string' && input.label.trim() ? input.label.trim() : defaults.label,
        spendThresholdCents: Number.isFinite(Number(input.spendThresholdCents)) ? Math.max(0, Math.round(Number(input.spendThresholdCents))) : defaults.spendThresholdCents,
        gradient: [
          typeof input.gradient?.[0] === 'string' && input.gradient[0].trim() ? input.gradient[0].trim() : defaults.gradient[0],
          typeof input.gradient?.[1] === 'string' && input.gradient[1].trim() ? input.gradient[1].trim() : defaults.gradient[1],
        ],
        accent: typeof input.accent === 'string' && input.accent.trim() ? input.accent.trim() : defaults.accent,
        progressColor: typeof input.progressColor === 'string' && input.progressColor.trim() ? input.progressColor.trim() : defaults.progressColor,
        benefits: Array.isArray(input.benefits) && input.benefits.length > 0
          ? input.benefits.map((item: unknown) => String(item).trim()).filter(Boolean)
          : defaults.benefits,
        rewardSettings: typeof input.rewardSettings === 'string' && input.rewardSettings.trim()
          ? input.rewardSettings.trim()
          : defaults.rewardSettings,
      };
    };
    const normalized: LoyaltyTierSettings = {
      blue: pick('blue'),
      silver: pick('silver'),
      gold: pick('gold'),
      black: pick('black'),
    };
    normalized.silver.spendThresholdCents = Math.max(normalized.silver.spendThresholdCents, normalized.blue.spendThresholdCents);
    normalized.gold.spendThresholdCents = Math.max(normalized.gold.spendThresholdCents, normalized.silver.spendThresholdCents);
    normalized.black.spendThresholdCents = Math.max(normalized.black.spendThresholdCents, normalized.gold.spendThresholdCents);
    return normalized;
  } catch {
    return DEFAULT_LOYALTY_TIER_SETTINGS;
  }
}

export interface LoyaltyTransaction {
  id: string;
  points: number;
  type: string;
  description: string;
  createdAt: string;
  orderId?: string | null;
  coffeeStampsDelta?: number;
  freeCoffeeRewardsDelta?: number;
}

export interface LoyaltyActivity {
  id: string;
  customerId: string;
  loyaltyQrToken?: string | null;
  orderId?: string | null;
  activityType: string;
  pointsDelta: number;
  coffeeStampsDelta: number;
  freeCoffeeRewardsDelta: number;
  description: string;
  createdAt: string;
}

export interface LoyaltyLookupResult {
  customerId?: string;
  customerName: string;
  customerEmail: string;
  loyaltyPoints: number;
  coffeeStampCount: number;
  freeCoffeeRewards: number;
  stampCount: number;
  stampsUntilNextFreeCoffee?: number;
  freeCoffeesEarned: number;
  loyaltyQrToken?: string | null;
  qrPayload?: string | null;
  recentActivity?: LoyaltyActivity[];
  earnedFree?: boolean;
  pointsDelta?: number;
}

export interface LoyaltyReward {
  id: string;
  title?: string;
  name?: string;
  description: string;
  pointsCost: number;
  type?: string;
  isActive: boolean;
  rewardType?: 'item_reward' | 'money_voucher';
  voucherValueCents?: number | null;
  linkedProductId?: string | null;
  customerRedeemable?: boolean;
  staffRedeemable?: boolean;
  stock?: number | null;
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
  storeId?: string | null;
  storeName?: string | null;
  clockIn: string;
  clockOut?: string | null;
  hoursWorked?: string | null;
  unpaidBreakMins?: number | null;
  createdAt?: string;
  hourlyRateCents?: number | null;
  position?: string | null;
  name?: string | null;
}

export interface ShopDisplayTaskHistory {
  id: string;
  taskId: string;
  taskTitle: string;
  taskCategory: string;
  completedByUserId?: string | null;
  completedByName?: string | null;
  completedByRole?: string | null;
  completionStatus: string;
  notes?: string | null;
  createdAt: string;
}

export interface ShopDisplayUser {
  id: string;
  name: string;
  email: string;
  role: 'shop_display';
  phone?: string | null;
  status: string;
  createdAt?: string;
  lastLogin?: string | null;
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

export interface DirectorProduct {
  id: string;
  name: string;
  priceCents?: number | null;
  isActive?: boolean;
  category?: string | null;
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
  rewardType: 'item_reward' | 'money_voucher';
  voucherValueCents?: number | null;
  linkedProductId?: string | null;
  customerRedeemable: boolean;
  staffRedeemable: boolean;
  claimCount?: number;
  claimExpiryDays?: number | null;
}

export interface ClaimedReward {
  id: string;
  userId: string;
  rewardId: string;
  status: 'available' | 'applied_to_cart' | 'redeemed' | 'expired' | 'cancelled';
  claimedAt: string;
  redeemedAt?: string | null;
  orderId?: string | null;
  pointsSpent: number;
  voucherValueCents?: number | null;
  expiresAt?: string | null;
  rewardName?: string;
  rewardDescription?: string;
  rewardType?: 'item_reward' | 'money_voucher';
  linkedProductId?: string | null;
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

export type ScheduledNotificationStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled' | 'failed';
export type ScheduledNotificationAudienceType =
  | 'all_customers'
  | 'loyalty_tier'
  | 'active_rewards'
  | 'inactive_customers'
  | 'customer_segment'
  | 'custom_selected_customers';

export interface ScheduledNotificationFilters {
  loyaltyTier?: 'blue' | 'silver' | 'gold' | 'black';
  inactiveDays?: number;
}

export interface ScheduledNotificationRecord {
  id: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  imageObjectPath?: string | null;
  actionType?: string | null;
  actionValue?: string | null;
  audienceType: ScheduledNotificationAudienceType;
  audienceFilters?: string | ScheduledNotificationFilters | null;
  scheduledAt: string;
  sentAt?: string | null;
  status: ScheduledNotificationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
}

export interface NotificationLogRecord {
  id: string;
  targetUserId?: string | null;
  targetRole?: string | null;
  type: string;
  title: string;
  body: string;
  data?: string | null;
  sentBy?: string | null;
  successCount: number;
  failureCount: number;
  sentAt: string;
}

export interface DirectorReports {
  revenue: { today: number; week: number; month: number };
  orders:  { today: number; week: number; month: number; avgValueCents: number };
  byType:  { type: string; count: number }[];
  byStatus:{ status: string; count: number }[];
  dailyRevenue: { day: string; totalCents: number; count: number }[];
  topSellingItems: { name: string; quantity: number }[];
  recentOrders: ApiOrder[];
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
  profileImage?: string | null;
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
    payAtPickupEnabled?: boolean;
  } | null;
  wholesaleAccount?: {
    id: string;
    companyName: string;
    status: string;
    pricingTier?: string | null;
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
  paymentMethods?: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
  }[];
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
  wholesaleAccount: WholesaleAccount | null;
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

export interface AuthProfile {
  id?: string;
  userId?: string;
  preferredStoreId?: string | null;
  phone?: string | null;
  birthday?: string | null;
  deliveryAddress?: string | null;
  profileImage?: string | null;
  notificationPreferences?: Record<string, boolean> | null;
  loyaltyPoints?: number;
  loyaltyTier?: string;
  stampCount?: number;
  totalVisits?: number;
  referralCode?: string;
  emailMarketingOptIn?: boolean;
  payAtPickupEnabled?: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  showPublic?: boolean;
  showWholesale?: boolean;
}

export interface ApiOrderItemOption {
  groupId?: string;
  optionId?: string;
  priceAdjustmentCents?: number;
  groupName?: string;
  optionName?: string;
  textValue?: string | null;
}

export interface ApiOrderItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  selectedOptions?: ApiOrderItemOption[];
  productName?: string;
  category?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
  variantName?: string | null;
  unitPriceCents?: number;
  totalPriceCents?: number;
  imageUrl?: string | null;
}

export interface StaffShiftStats {
  currentWeekHours: number;
  previousWeekHours: number;
  pendingApprovalHours?: number;
  totalWagesCents?: number;
  hourlyRateCents?: number;
  todayMins?: number;
  todayEarningsCents?: number;
  weekMins?: number;
  weekEarningsCents?: number;
}

export interface StaffStoreAssignment {
  id: string;
  staffId: string;
  storeId: string;
  isPrimary: boolean;
  isActive?: boolean;
  storeName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffTask {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  cadence?: 'daily' | 'weekly' | 'one_off' | null;
  isRecurring?: boolean;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByUserId?: string | null;
  completedByName?: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffWastageEntry {
  id: string;
  itemName: string;
  quantity: number;
  unit?: string | null;
  reason?: string | null;
  notes?: string | null;
  estimatedCostCents?: number | null;
  createdAt: string;
  createdByUserId?: string | null;
  createdByName?: string | null;
}

export interface StaffWastageInput {
  itemName?: string;
  productName?: string;
  quantity: number | string;
  unit?: string;
  reason?: string;
  notes?: string | null;
  estimatedCostCents?: number | null;
}

export interface StaffIssue {
  id: string;
  category?: string | null;
  title?: string | null;
  description: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  createdByUserId?: string | null;
  createdByName?: string | null;
}

export interface StaffIssueInput {
  category?: string;
  title?: string;
  description: string;
  priority?: string;
}

export interface StaffLeaveRequest {
  id: string;
  userId?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
}

export interface StaffLeaveInput {
  type?: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  taskCategory: string;
  completedByName?: string | null;
  completedByRole?: string | null;
  completionStatus: string;
  notes?: string | null;
  createdAt: string;
}

export interface ShopDisplayMe {
  id: string;
  name: string;
  email: string;
  role: 'shop_display';
  permissions?: string[];
  storeIds?: string[];
}

export interface ShopDisplayOrder extends ApiOrder {
  orderNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  pickupTime?: string | null;
  paymentStatus?: string | null;
}

export interface WholesaleDeliverySlot {
  deliveryDow: number;
  deliveryLabel: string;
  cutoffDow: number;
  cutoffDayLabel: string;
  cutoffHour: number;
  windowOpen: string;
  windowClose: string;
}

export interface WholesaleProfile {
  userId?: string;
  companyName?: string;
  abn?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  pricingTier?: string | null;
  paymentTerms?: string | null;
}

export interface WholesaleAccount {
  id: string;
  userId?: string;
  companyName: string;
  abn?: string | null;
  status: string;
  email?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  pricingTier?: string | null;
  tierId?: string | null;
  tier?: PricingTier | null;
  creditEnabled?: boolean;
  creditLimitCents?: number | null;
  currentBalanceCents?: number | null;
  creditNotes?: string | null;
  paymentTerms?: string | null;
  deliveryFeeCents?: number | null;
  minimumOrderCents?: number | null;
  minOrderCents?: number | null;
  accountManagerName?: string | null;
  accountManagerPhone?: string | null;
  accountManagerEmail?: string | null;
  accountManager?: string | null;
  accountsEmail?: string | null;
  contactName?: string | null;
  howDidYouHear?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  isSuspended?: boolean;
  suspendedReason?: string | null;
  customPricingEnabled?: boolean;
  businessHours?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WholesaleOrderRecord {
  id: string;
  orderNumber?: string | null;
  status: string;
  items: ApiOrderItem[];
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  poReference?: string | null;
  notes?: string | null;
  deliveryType?: string | null;
  scheduledDate?: string | null;
  deliveryAddress?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  invoiceDueDate?: string | null;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePaymentStatus?: string | null;
  paymentMethodType?: string | null;
  refundedCents?: number;
  originalTotalCents?: number | null;
  isPaid?: boolean;
}

export interface WholesaleInvoice {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  amountCents: number;
  dueDate?: string | null;
  issuedAt?: string | null;
  paidAt?: string | null;
  orderId?: string | null;
  pdfUrl?: string | null;
}

export interface WholesalePricingContext {
  account: WholesaleAccount | null;
  tier: PricingTier | null;
  quantityBreaks: QuantityPriceBreak[];
  customPricing: CustomerPricingRule[];
}

export interface WholesaleCard {
  id: string;
  stripePaymentMethodId?: string | null;
  nameOnCard: string;
  cardBrand: string;
  brand?: string;
  last4: string;
  expiry: string;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoreSummary {
  id: string;
  slug: string;
  name: string;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadius?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  imageUrl?: string | null;
  printerIp?: string | null;
  printerPort?: number | null;
  orderCutoffTime?: string | null;
  dailySpecial?: string | null;
  status?: string;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  publicNotes?: string | null;
  internalNotes?: string | null;
  preDeleteStatus?: string | null;
  deletedAt?: string | null;
  purgeAt?: string | null;
  sortOrder?: number;
  openStatus?: string;
  openLabel?: string;
  todayHours?: StoreHour | null;
  openingHours?: StoreHour[];
}

export interface StoreDetail extends StoreSummary {
  assignments?: Array<{
    id: string;
    staffId: string;
    isPrimary?: boolean;
    isActive?: boolean;
    name?: string | null;
    email?: string | null;
    position?: string | null;
  }>;
}

export interface StoreInput {
  name: string;
  slug?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  imageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadius?: number | null;
  printerIp?: string | null;
  printerPort?: number | null;
  orderCutoffTime?: string | null;
  dailySpecial?: string | null;
  status?: 'open' | 'coming_soon' | 'temporarily_closed' | 'closed';
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  publicNotes?: string | null;
  internalNotes?: string | null;
  sortOrder?: number;
}

export interface StoreHour {
  id?: string;
  storeId?: string;
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  isClosed?: boolean;
  notes?: string | null;
}

export interface DirectorStats {
  revenue: { today: number; week: number; month: number };
  orders: {
    today: number;
    active: number;
    wholesaleNew: number;
  };
  users: {
    pendingStaff: number;
    pendingWholesale: number;
  };
  staff: {
    clockedIn: number;
    pendingLeave: number;
    weekWagesOwedCents: number;
  };
  tasks: {
    open: number;
  };
  products: {
    soldOut: number;
    lowStock: number;
  };
  issues: {
    open: number;
    high: number;
  };
  wastage: {
    countToday: number;
    countWeek: number;
    costToday: number;
    costWeek: number;
  };
  customers: {
    total?: number;
    birthdayToday: number;
    unreadFeedback: number;
  };
}

export interface DirectorActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  createdAt: string;
}

export interface DeletedAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  deletedAt: string;
}

export interface DirectorUserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  status?: string | null;
  wholesaleAccount?: WholesaleAccount | null;
}

export interface DirectorStaffMember extends DirectorUserSummary {
  employeeId?: string | null;
  address?: string | null;
  taxFileNumber?: string | null;
  position?: string | null;
  department?: string | null;
  hourlyRateCents?: number | null;
  employmentStatus?: string | null;
  dateOfBirth?: string | null;
  emergencyContact?: { name?: string | null; phone?: string | null; relationship?: string | null } | null;
  approvedByAdmin?: boolean;
  canViewOrders?: boolean;
  createdAt?: string;
  staffProfile?: {
    employeeId?: string | null;
    address?: string | null;
    taxFileNumber?: string | null;
    position?: string | null;
    department?: string | null;
    employmentStatus?: string | null;
    hourlyRateCents?: number | null;
    dateOfBirth?: string | null;
    emergencyContact?: { name?: string | null; phone?: string | null; relationship?: string | null } | null;
    canViewOrders?: boolean;
  } | null;
  recentShifts?: StaffShift[];
}

export interface DirectorCategory extends ProductCategory {
  productCount?: number;
  isPickupAvailable?: boolean;
  isDeliveryAvailable?: boolean;
  showOnHome?: boolean;
  homeOrder?: number;
}

export interface DirectorCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  showPublic?: boolean;
  showWholesale?: boolean;
  isPickupAvailable?: boolean;
  isDeliveryAvailable?: boolean;
  showOnHome?: boolean;
  homeOrder?: number;
}

export interface DirectorOption {
  id: string;
  groupId: string;
  name: string;
  priceAdjustmentCents: number;
  sortOrder?: number;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface DirectorOptionInput {
  name: string;
  priceAdjustmentCents?: number;
  sortOrder?: number;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface DirectorOptionGroup {
  id: string;
  name: string;
  description?: string | null;
  selectionType?: 'single' | 'multiple' | 'multi' | 'text';
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  appliesToCategoryIds?: string[];
  appliesToProductIds?: string[];
  excludeProductIds?: string[];
  options?: DirectorOption[];
}

export interface DirectorOptionGroupInput {
  name?: string;
  description?: string | null;
  selectionType?: 'single' | 'multiple' | 'multi' | 'text';
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  appliesToCategoryIds?: string[];
  appliesToProductIds?: string[];
  excludeProductIds?: string[];
}

export interface DirectorProductVariant {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface DirectorProductVariantInput {
  name: string;
  priceCents: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface DirectorCatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  category?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  galleryUrls?: string[];
  priceCents?: number | null;
  wholesalePriceCents?: number | null;
  sku?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  isSoldOut?: boolean;
  variants?: DirectorProductVariant[];
}

export interface DirectorProductInput {
  name?: string;
  description?: string | null;
  shortDescription?: string | null;
  category?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  galleryUrls?: string[];
  priceCents?: number | null;
  wholesalePriceCents?: number | null;
  sku?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  isSoldOut?: boolean;
}

export interface PrinterJob {
  orderId?: string;
  title?: string;
  lines?: string[];
  copies?: number;
}

export interface StaffInviteToken {
  id: string;
  token: string;
  note?: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
}

export interface PricingTier {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  isActive?: boolean;
  minOrderCents?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PricingTierInput {
  name: string;
  description?: string | null;
  status?: string | null;
  isActive?: boolean;
}

export interface QuantityPriceBreak {
  id: string;
  productId: string;
  scope?: string | null;
  tierId?: string | null;
  customerId?: string | null;
  minQty: number;
  unitPriceCents: number;
  isActive?: boolean;
}

export interface QuantityPriceBreakInput {
  productId: string;
  minQty: number;
  unitPriceCents: number;
  scope?: string | null;
  tierId?: string | null;
  customerId?: string | null;
  isActive?: boolean;
}

export interface CustomerPricingRule {
  id: string;
  customerId: string;
  productId: string;
  unitPriceCents: number;
  isActive?: boolean;
}

export interface CustomerPricingRuleInput {
  customerId: string;
  productId: string;
  unitPriceCents: number;
  isActive?: boolean;
}

export interface ProductWholesaleAccessInput {
  isWholesaleVisible?: boolean;
  isWholesalePurchasable?: boolean;
  allowedTierIds?: string[];
}

export interface DiscountCodeRecord {
  id: string;
  code: string;
  description?: string | null;
  discountType: string;
  discountAmountCents?: number | null;
  isActive?: boolean;
  expiresAt?: string | null;
}

export interface DiscountCodeInput {
  code: string;
  description?: string | null;
  discountType: string;
  discountAmountCents?: number | null;
  isActive?: boolean;
  expiresAt?: string | null;
}

export interface WholesalePricePreview {
  productId: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  source?: string;
}

export interface DirectorManager {
  id: string;
  name: string;
  email: string;
  role: 'manager';
  accessRole?: AccessRole;
  permissions: string[];
  notes?: string | null;
  createdAt?: string;
}

export type AccessRole =
  | 'manager'
  | 'supervisor'
  | 'store_manager'
  | 'area_manager'
  | 'director'
  | 'master';

export interface DirectorIdentity {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'master';
  createdAt?: string;
}

export interface StockCategory {
  id: string;
  label: string;
}

export interface StockItemInput {
  name: string;
  category: string;
  unit: string;
  currentQuantity: number;
  lowStockThreshold: number;
  costCents?: number | null;
  supplier?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
