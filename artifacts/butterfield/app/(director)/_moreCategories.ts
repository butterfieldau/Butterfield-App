import { router } from 'expo-router';
import { BLUE, GREEN, AMBER, PURPLE, RED, NAVY, TEAL, ROSE } from '@/constants/directorColors';

export type RowItem = {
  icon: string;
  label: string;
  sub: string;
  color: string;
  perm?: string;
  directorOnly?: boolean;
  soon?: boolean;
  onPress?: () => void;
};

export type RowGroup = {
  label: string;
  items: RowItem[];
};

export type Category = {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  groups: RowGroup[];
  premium?: boolean;
};

const ALL_CATEGORIES: Category[] = [

  // ── VAULT ───────────────────────────────────────────────────────────────────
  {
    key: 'vault',
    label: 'Vault',
    icon: 'lock',
    color: '#C9A84C',
    description: 'Secure recipe & cost repository — PIN + biometric protected',
    premium: true,
    groups: [
      {
        label: 'Recipe Repository',
        items: [
          {
            icon: 'book-open',
            label: 'Open Vault',
            sub: 'Recipes, ingredients & margin calculator',
            color: '#C9A84C',
            directorOnly: true,
            onPress: () => router.push('/director-vault' as any),
          },
        ],
      },
    ],
  },

  // ── SALES & MARKETING ──────────────────────────────────────────────────────
  {
    key: 'sales',
    label: 'Sales & Marketing',
    icon: 'trending-up',
    color: BLUE,
    description: 'Analytics, rewards, promotions & announcements',
    groups: [
      {
        label: 'Analytics',
        items: [
          { icon: 'bar-chart-2', label: 'Reports',        sub: 'Revenue, sales trends & export',     color: BLUE,   perm: 'reports', onPress: () => router.push('/director-reports' as any) },
          { icon: 'percent',     label: 'Discount Codes', sub: 'Coupons, promotions & campaigns',    color: BLUE,   perm: 'pricing', onPress: () => router.push('/director-discounts' as any) },
        ],
      },
      {
        label: 'Rewards & Loyalty',
        items: [
          { icon: 'gift',        label: 'Loyalty Tiers',         sub: 'Blue, Silver, Gold & Black tiers',       color: BLUE,   perm: 'rewards', onPress: () => router.push('/director-settings-loyalty-tiers' as any) },
          { icon: 'star',        label: 'Reward Catalogue',      sub: 'Points redemption rewards & vouchers',   color: BLUE,   perm: 'rewards', onPress: () => router.push('/director-settings-rewards' as any) },
          { icon: 'coffee',      label: 'Coffee Stamp Settings', sub: 'Stamp card thresholds & rewards',        color: BLUE,   perm: 'rewards', soon: true },
          { icon: 'share-2',     label: 'Referral Program',      sub: 'Referral codes & incentives',            color: BLUE,   perm: 'rewards', soon: true },
          { icon: 'zap',         label: 'Points Rules',          sub: 'Earn rates, bonuses & expiry rules',     color: BLUE,   perm: 'rewards', soon: true },
        ],
      },
      {
        label: 'Marketing',
        items: [
          { icon: 'image',       label: 'Banners',               sub: 'Homepage banners & hero images',         color: BLUE,   perm: 'banners', onPress: () => router.push('/director-settings-banner' as any) },
          { icon: 'package',     label: 'Featured Products',     sub: 'Highlight products on the home screen',  color: BLUE,   perm: 'banners', soon: true },
          { icon: 'layout',      label: 'Homepage Promotions',   sub: 'Banners, callouts & promo tiles',        color: BLUE,   perm: 'banners', soon: true },
          { icon: 'sun',         label: 'Seasonal Campaigns',    sub: 'Holiday & event promotions',             color: BLUE,   perm: 'banners', soon: true },
        ],
      },
      {
        label: 'Announcements',
        items: [
          { icon: 'bell',        label: 'Push Notifications',      sub: 'Send to all or segmented customers',     color: BLUE,   perm: 'announcements', onPress: () => router.push('/director-settings-notify' as any) },
          { icon: 'clock',       label: 'Scheduled Notifications', sub: 'Queue messages for later',               color: BLUE,   perm: 'announcements', onPress: () => router.push('/director-settings-scheduled-notifications' as any) },
          { icon: 'users',       label: 'Customer Segments',       sub: 'Target by tier, location or behaviour',  color: BLUE,   perm: 'announcements', onPress: () => router.push('/director-customer-segments' as any) },
          { icon: 'list',        label: 'Announcement History',    sub: 'Past sends & open rates',                color: BLUE,   perm: 'announcements', soon: true },
        ],
      },
      {
        label: 'Customer Feedback',
        items: [
          { icon: 'message-square', label: 'Feedback Inbox',    sub: 'Star ratings, comments & order reviews', color: BLUE,   perm: 'announcements', onPress: () => router.push('/director-feedback' as any) },
        ],
      },
    ],
  },

  // ── OPERATIONS ─────────────────────────────────────────────────────────────
  {
    key: 'operations',
    label: 'Operations',
    icon: 'tool',
    color: BLUE,
    description: 'Store setup, stock & hardware',
    groups: [
      {
        label: 'Store Setup',
        items: [
          { icon: 'map-pin',   label: 'Store Locations',   sub: 'Open status, hours, printers, pickup, geofence and notes per store', color: BLUE, perm: 'settings', onPress: () => router.push('/director-store-locations' as any) },
          { icon: 'truck',     label: 'Delivery Settings', sub: 'Slots, fee, blackout dates & category eligibility',                  color: BLUE, perm: 'settings', onPress: () => router.push('/director-settings-delivery' as any) },
        ],
      },
      {
        label: 'Catalogue & Menu',
        items: [
          { icon: 'package', label: 'Products',     sub: 'Browse, search and manage the product library',    color: BLUE, perm: 'products', onPress: () => router.push('/(director)/products' as any) },
          { icon: 'grid',    label: 'Categories',   sub: 'Organise menu categories and category order',      color: BLUE, perm: 'products', onPress: () => router.push({ pathname: '/(director)/products', params: { tab: 'catalog' } } as any) },
          { icon: 'sliders', label: 'Options',      sub: 'Milk types, extras, sizes and product options',   color: BLUE, perm: 'products', onPress: () => router.push({ pathname: '/(director)/products', params: { tab: 'options' } } as any) },
          { icon: 'package', label: 'Build a Box',  sub: 'Box sizes, prices, exclusions & premium add-ons', color: BLUE, perm: 'products', onPress: () => router.push('/director-build-a-box' as any) },
        ],
      },
      {
        label: 'Stock & Inventory',
        items: [
          { icon: 'archive',      label: 'Inventory',        sub: 'View & adjust stock on hand',              color: BLUE,   perm: 'stock', onPress: () => router.push('/director-inventory' as any) },
          { icon: 'repeat',       label: 'Stock Movements',  sub: 'Receipts, write-offs & transfers',         color: BLUE,   perm: 'stock', soon: true },
          { icon: 'alert-circle', label: 'Low Stock Alerts', sub: 'Reorder thresholds & email alerts',        color: BLUE,   perm: 'stock', soon: true },
          { icon: 'dollar-sign',  label: 'Cost Tracking',    sub: 'COGS, margins & supplier pricing',         color: BLUE,   perm: 'stock', soon: true },
        ],
      },
      {
        label: 'Hardware & Devices',
        items: [
          { icon: 'monitor',  label: 'POS Devices',      sub: 'Counter iPad logins, store assignments & permissions', color: BLUE,   directorOnly: true, onPress: () => router.push({ pathname: '/(director)/users', params: { mode: 'pos' } } as any) },
          { icon: 'server',   label: 'Kitchen Printers', sub: 'Kitchen display & order tickets',                      color: BLUE,   directorOnly: true, soon: true },
        ],
      },
    ],
  },

  // ── STAFF ──────────────────────────────────────────────────────────────────
  {
    key: 'staff',
    label: 'Staff',
    icon: 'users',
    color: BLUE,
    description: 'Accounts, roster, hours & payroll',
    groups: [
      {
        label: 'Staff Directory',
        items: [
          { icon: 'user',    label: 'Staff Accounts', sub: 'Approvals, profiles & invite links', color: BLUE, perm: 'users', onPress: () => router.push('/director-staff-accounts' as any) },
        ],
      },
      {
        label: 'Rostering & Time',
        items: [
          { icon: 'calendar', label: 'Roster',         sub: 'Build & publish the weekly shift schedule', color: BLUE, perm: 'timesheets', onPress: () => router.push('/director-roster' as any) },
          { icon: 'clock',    label: 'Staff Hours',    sub: 'Weekly timesheets & shift breakdown',       color: BLUE, perm: 'timesheets', onPress: () => router.push('/director-staff-hours' as any) },
          { icon: 'download', label: 'Payroll Export', sub: 'Export hours as CSV for payroll',           color: BLUE, perm: 'timesheets', soon: true },
        ],
      },
      {
        label: 'Tasks & Wellbeing',
        items: [
          { icon: 'clipboard', label: 'Staff Hub', sub: 'Tasks, issues, wastage & leave requests', color: BLUE, onPress: () => router.push('/(director)/staffhub' as any) },
        ],
      },
    ],
  },

  // ── WHOLESALE ──────────────────────────────────────────────────────────────
  {
    key: 'wholesale',
    label: 'Wholesale',
    icon: 'briefcase',
    color: BLUE,
    description: 'Pricing tiers, quantity breaks & credit limits',
    groups: [
      {
        label: 'Accounts',
        items: [
          { icon: 'briefcase',  label: 'Wholesale Accounts', sub: 'B2B customers, account status & credit setup', color: BLUE, perm: 'users', onPress: () => router.push('/director-wholesale-accounts' as any) },
          { icon: 'file-text',  label: 'Invoice Management', sub: 'View unpaid & overdue invoices, mark as paid',  color: BLUE, perm: 'users', onPress: () => router.push('/director-wholesale-invoices' as any) },
        ],
      },
      {
        label: 'Pricing & Tiers',
        items: [
          { icon: 'tag',         label: 'Pricing Tiers',  sub: 'Tier names, discounts, qty breaks & customer assignments', color: BLUE, perm: 'pricing', onPress: () => router.push('/director-pricing' as any) },
          { icon: 'credit-card', label: 'Credit Limits',  sub: 'Enable credit & set limits per client',                   color: BLUE, perm: 'users',   soon: true },
        ],
      },
      {
        label: 'Delivery',
        items: [
          { icon: 'truck', label: 'Delivery Settings', sub: 'Cutoff times, delivery windows & order reminders', color: BLUE, directorOnly: true, onPress: () => router.push('/director-wholesale-delivery' as any) },
        ],
      },
      {
        label: 'Security & Compliance',
        items: [
          { icon: 'shield', label: 'Wholesale Security Logs', sub: 'Pricing views, screenshots & terms acceptances', color: BLUE, perm: 'users', onPress: () => router.push('/director-wholesale-security' as any) },
        ],
      },
    ],
  },

  // ── SYSTEM ─────────────────────────────────────────────────────────────────
  {
    key: 'system',
    label: 'System',
    icon: 'cpu',
    color: BLUE,
    description: 'Notifications, integrations & POS',
    groups: [
      {
        label: 'Notification Preferences',
        items: [
          { icon: 'bell', label: 'My Notifications', sub: 'Control what you get notified about', color: BLUE, onPress: () => router.push('/notification-prefs' as any) },
          { icon: 'calendar', label: 'Scheduled Sends', sub: 'Automate notification delivery times', color: BLUE, directorOnly: true, soon: true },
        ],
      },
      {
        label: 'POS',
        items: [
          { icon: 'lock',         label: 'POS Thresholds',   sub: 'Require manager PIN for refunds & large discounts', color: BLUE, directorOnly: true, onPress: () => router.push('/director-pos-thresholds' as any) },
          { icon: 'shopping-bag', label: 'POS Transactions', sub: 'Read-only terminal sales history',                  color: BLUE, directorOnly: true, onPress: () => router.push('/director-pos-orders' as any) },
        ],
      },
      {
        label: 'Security & Audit',
        items: [
          { icon: 'list',    label: 'Audit Log',      sub: 'POS refunds, setting changes & director actions',  color: BLUE, directorOnly: true, onPress: () => router.push('/director-audit-log' as any) },
          { icon: 'log-in',  label: 'Login History',  sub: 'All login attempts, successes & failures',         color: BLUE, directorOnly: true, onPress: () => router.push('/director-login-history' as any) },
        ],
      },
      {
        label: 'Integrations',
        items: [
          { icon: 'shopping-bag',   label: 'Shopify',       sub: 'Product & order sync',               color: BLUE, directorOnly: true, soon: true },
          { icon: 'credit-card',    label: 'Square',        sub: 'POS & payment terminal',             color: BLUE, directorOnly: true, soon: true },
          { icon: 'globe',          label: 'Google Login',  sub: 'Sign in with Google for customers',  color: BLUE,                     soon: true },
          { icon: 'smartphone',     label: 'Apple Login',   sub: 'Sign in with Apple for customers',   color: BLUE,                     soon: true },
          { icon: 'message-square', label: 'SMS Provider',  sub: 'Twilio or Vonage for SMS receipts',  color: BLUE, directorOnly: true, soon: true },
        ],
      },
    ],
  },
];

export function buildCategories(
  canSee: (perm: string) => boolean,
  isDirector: boolean,
): Category[] {
  return ALL_CATEGORIES.map(cat => ({
    ...cat,
    groups: cat.groups.map(group => ({
      ...group,
      items: (group.items as RowItem[]).filter(item => {
        if (item.directorOnly && !isDirector) return false;
        if (item.perm && !canSee(item.perm)) return false;
        return true;
      }),
    })).filter(group => group.items.length > 0),
  })).filter(cat => cat.groups.length > 0);
}

export function getLiveItemCount(cat: Category): number {
  return cat.groups.flatMap(g => g.items).filter(i => !i.soon).length;
}

export function getSoonItemNames(cat: Category): string[] {
  return cat.groups.flatMap(g => g.items).filter(i => i.soon).map(i => i.label);
}
