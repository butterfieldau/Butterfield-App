import { router } from 'expo-router';

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
};

const BLUE   = '#1493FF';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const RED    = '#EF4444';
const NAVY   = '#1A2B4A';
const TEAL   = '#06B6D4';
const ROSE   = '#F43F5E';

const ALL_CATEGORIES: Category[] = [

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
          { icon: 'bar-chart-2', label: 'Reports',        sub: 'Revenue, sales trends & export',     color: NAVY,   perm: 'reports', onPress: () => router.push('/director-reports' as any) },
          { icon: 'percent',     label: 'Discount Codes', sub: 'Coupons, promotions & campaigns',    color: RED,    perm: 'pricing', onPress: () => router.push('/director-discounts' as any) },
        ],
      },
      {
        label: 'Rewards & Loyalty',
        items: [
          { icon: 'gift',        label: 'Loyalty Tiers',         sub: 'Blue, Silver, Gold & Black tiers',       color: GREEN,  perm: 'rewards', onPress: () => router.push('/director-settings-loyalty-tiers' as any) },
          { icon: 'star',        label: 'Reward Catalogue',      sub: 'Points redemption rewards & vouchers',   color: AMBER,  perm: 'rewards', onPress: () => router.push('/director-settings-rewards' as any) },
          { icon: 'coffee',      label: 'Coffee Stamp Settings', sub: 'Stamp card thresholds & rewards',        color: '#92400E', perm: 'rewards', soon: true },
          { icon: 'share-2',     label: 'Referral Program',      sub: 'Referral codes & incentives',            color: ROSE,   perm: 'rewards', soon: true },
          { icon: 'zap',         label: 'Points Rules',          sub: 'Earn rates, bonuses & expiry rules',     color: PURPLE, perm: 'rewards', soon: true },
        ],
      },
      {
        label: 'Marketing',
        items: [
          { icon: 'image',       label: 'Banners',               sub: 'Homepage banners & hero images',         color: AMBER,  perm: 'banners', onPress: () => router.push('/director-settings-banner' as any) },
          { icon: 'package',     label: 'Featured Products',     sub: 'Highlight products on the home screen',  color: BLUE,   perm: 'banners', soon: true },
          { icon: 'layout',      label: 'Homepage Promotions',   sub: 'Banners, callouts & promo tiles',        color: TEAL,   perm: 'banners', soon: true },
          { icon: 'sun',         label: 'Seasonal Campaigns',    sub: 'Holiday & event promotions',             color: ROSE,   perm: 'banners', soon: true },
        ],
      },
      {
        label: 'Announcements',
        items: [
          { icon: 'bell',        label: 'Push Notifications',    sub: 'Send to all or segmented customers',     color: TEAL,   perm: 'announcements', onPress: () => router.push('/director-settings-notify' as any) },
          { icon: 'clock',       label: 'Scheduled Notifications', sub: 'Queue messages for later',             color: BLUE,   perm: 'announcements', onPress: () => router.push('/director-settings-scheduled-notifications' as any) },
          { icon: 'users',       label: 'Customer Segments',     sub: 'Target by tier, location or behaviour',  color: PURPLE, perm: 'announcements', soon: true },
          { icon: 'list',        label: 'Announcement History',  sub: 'Past sends & open rates',                color: NAVY,   perm: 'announcements', soon: true },
        ],
      },
    ],
  },

  // ── OPERATIONS ─────────────────────────────────────────────────────────────
  {
    key: 'operations',
    label: 'Operations',
    icon: 'tool',
    color: GREEN,
    description: 'Store setup, stock, timesheets & hardware',
    groups: [
      {
        label: 'Store Setup',
        items: [
          { icon: 'map-pin',      label: 'Store Locations',      sub: 'Open status, hours, printers, pickup, geofence and notes per store', color: RED, perm: 'settings', onPress: () => router.push('/director-store-locations' as any) },
        ],
      },
      {
        label: 'Catalogue & Menu',
        items: [
          { icon: 'package', label: 'Products', sub: 'Browse, search and manage the product library', color: BLUE, perm: 'products', onPress: () => router.push('/(director)/products' as any) },
          { icon: 'grid', label: 'Categories', sub: 'Organise menu categories and category order', color: PURPLE, perm: 'products', onPress: () => router.push({ pathname: '/(director)/products', params: { tab: 'catalog' } } as any) },
          { icon: 'sliders', label: 'Options', sub: 'Milk types, extras, sizes and product options', color: TEAL, perm: 'products', onPress: () => router.push({ pathname: '/(director)/products', params: { tab: 'options' } } as any) },
        ],
      },
      {
        label: 'Stock & Inventory',
        items: [
          { icon: 'archive',     label: 'Inventory',             sub: 'View & adjust stock on hand',            color: AMBER,  perm: 'stock', onPress: () => router.push('/director-inventory' as any) },
          { icon: 'repeat',      label: 'Stock Movements',       sub: 'Receipts, write-offs & transfers',       color: GREEN,  perm: 'stock', soon: true },
          { icon: 'alert-circle',label: 'Low Stock Alerts',      sub: 'Reorder thresholds & email alerts',      color: RED,    perm: 'stock', soon: true },
          { icon: 'dollar-sign', label: 'Cost Tracking',         sub: 'COGS, margins & supplier pricing',       color: NAVY,   perm: 'stock', soon: true },
        ],
      },
      {
        label: 'Timesheets',
        items: [
          { icon: 'clock',       label: 'Staff Hours',           sub: 'Weekly timesheets & shift breakdown',    color: PURPLE, perm: 'timesheets', onPress: () => router.push('/director-staff-hours' as any) },
          { icon: 'download',    label: 'Payroll Export',        sub: 'Export hours as CSV for payroll',        color: GREEN,  perm: 'timesheets', soon: true },
        ],
      },
      {
        label: 'Hardware & Devices',
        items: [
          { icon: 'server',      label: 'Kitchen Printers',      sub: 'Kitchen display & order tickets',        color: '#D97706', directorOnly: true, soon: true },
          { icon: 'tag',         label: 'Label Printers',        sub: 'Product label & barcode printers',       color: TEAL,   directorOnly: true, soon: true },
          { icon: 'maximize',    label: 'Scanner Devices',       sub: 'Barcode & QR scanners',                  color: PURPLE, directorOnly: true, soon: true },
          { icon: 'monitor',     label: 'POS Devices',           sub: 'iPad & terminal management',             color: BLUE,   directorOnly: true, soon: true },
        ],
      },
    ],
  },

  // ── PEOPLE ─────────────────────────────────────────────────────────────────
  {
    key: 'people',
    label: 'People',
    icon: 'users',
    color: PURPLE,
    description: 'Customers, staff accounts, roles & access',
    groups: [
      {
        label: 'Customers',
        items: [
          { icon: 'user-check', label: 'Customer Profiles',  sub: 'Search, view & manage customers',        color: BLUE,   perm: 'users', onPress: () => router.push('/director-customer-profiles' as any) },
          { icon: 'book',       label: 'CRM',                sub: 'Notes, tags & customer history',         color: PURPLE, perm: 'users', soon: true },
          { icon: 'award',      label: 'Loyalty History',    sub: 'Points, stamps & redemptions per user',  color: AMBER,  perm: 'users', soon: true },
          { icon: 'edit-3',     label: 'Customer Notes',     sub: 'Internal notes on customer accounts',    color: TEAL,   perm: 'users', soon: true },
        ],
      },
      {
        label: 'Staff',
        items: [
          { icon: 'users',      label: 'Staff Accounts',     sub: 'All staff, roles & employment details',  color: PURPLE, perm: 'users', onPress: () => router.push('/director-staff-accounts' as any) },
          { icon: 'clock',      label: 'Timesheet Access',   sub: 'Staff clock-in history & hour totals',   color: GREEN,  perm: 'timesheets', onPress: () => router.push('/director-staff-hours' as any) },
          { icon: 'file-text',  label: 'Employment Details', sub: 'Contracts, TFN & pay rates',             color: NAVY,   perm: 'users', soon: true },
          { icon: 'user-plus',  label: 'Add Manager',        sub: 'Create a manager or promote staff in one place', color: GREEN, directorOnly: true, onPress: () => router.push('/director-settings-managers' as any) },
          { icon: 'sliders',    label: 'Permission Groups',  sub: 'Manager, Supervisor, Store Manager and more', color: PURPLE, directorOnly: true, onPress: () => router.push('/director-settings-managers' as any) },
          { icon: 'key',        label: 'Portal Access',      sub: 'See which tools each role can access', color: BLUE, directorOnly: true, onPress: () => router.push('/director-settings-managers' as any) },
          { icon: 'shield',     label: 'Roles & Permissions', sub: 'Manager, Supervisor, Store Manager, Area Manager, Director and Master', color: NAVY, directorOnly: true, onPress: () => router.push('/director-settings-managers' as any) },
        ],
      },
    ],
  },

  // ── WHOLESALE ──────────────────────────────────────────────────────────────
  {
    key: 'wholesale',
    label: 'Wholesale',
    icon: 'briefcase',
    color: AMBER,
    description: 'Pricing tiers, quantity breaks & credit limits',
    groups: [
      {
        label: 'Accounts',
        items: [
          { icon: 'briefcase',    label: 'Wholesale Accounts',  sub: 'B2B customers, account status & credit setup', color: GREEN, perm: 'users', onPress: () => router.push('/director-wholesale-accounts' as any) },
        ],
      },
      {
        label: 'Pricing & Tiers',
        items: [
          { icon: 'tag',          label: 'Pricing Tiers',       sub: 'Tier names, discounts & min orders',    color: AMBER,    perm: 'pricing', onPress: () => router.push({ pathname: '/director-pricing', params: { tab: 'Tiers' } } as any) },
          { icon: 'layers',       label: 'Qty Breaks',          sub: 'Volume discount rules per product',     color: '#D97706', perm: 'pricing', onPress: () => router.push({ pathname: '/director-pricing', params: { tab: 'QtyBreaks' } } as any) },
          { icon: 'dollar-sign',  label: 'Custom Pricing',      sub: 'Per-customer product overrides',        color: '#B45309', perm: 'pricing', onPress: () => router.push({ pathname: '/director-pricing', params: { tab: 'Custom' } } as any) },
          { icon: 'user-plus',    label: 'Customer Assignments',sub: 'Assign wholesale clients to tiers',     color: '#92400E', perm: 'pricing', onPress: () => router.push({ pathname: '/director-pricing', params: { tab: 'Assign' } } as any) },
          { icon: 'credit-card',  label: 'Credit Limits',       sub: 'Enable credit & set limits per client', color: GREEN,    perm: 'users',   soon: true },
          { icon: 'phone',        label: 'Account Managers',    sub: 'Assign account managers to wholesale customers',    color: BLUE,     perm: 'users',   onPress: () => router.push('/director-wholesale-accounts' as any) },
        ],
      },
    ],
  },

  // ── SYSTEM ─────────────────────────────────────────────────────────────────
  {
    key: 'system',
    label: 'System',
    icon: 'cpu',
    color: NAVY,
    description: 'Notifications, integrations & hardware',
    groups: [
      {
        label: 'Notification Preferences',
        items: [
          { icon: 'bell',         label: 'My Notifications',    sub: 'Control what you get notified about',   color: PURPLE, onPress: () => router.push('/notification-prefs' as any) },
          { icon: 'calendar',     label: 'Scheduled Sends',     sub: 'Automate notification delivery times',  color: BLUE,   directorOnly: true, soon: true },
        ],
      },
      {
        label: 'Integrations',
        items: [
          { icon: 'file-text',    label: 'Xero',                sub: 'Accounting & invoice sync',             color: '#00B4D8', perm: 'settings', onPress: () => router.push('/director-settings-xero' as any) },
          { icon: 'shopping-bag', label: 'Shopify',             sub: 'Product & order sync',                  color: '#96BF48', directorOnly: true, soon: true },
          { icon: 'credit-card',  label: 'Square',              sub: 'POS & payment terminal',                color: '#000000', directorOnly: true, soon: true },
          { icon: 'globe',        label: 'Google Login',         sub: 'Sign in with Google for customers',    color: RED,       soon: true },
          { icon: 'smartphone',   label: 'Apple Login',          sub: 'Sign in with Apple for customers',     color: NAVY,      soon: true },
          { icon: 'message-square', label: 'SMS Provider',      sub: 'Twilio or Vonage for SMS receipts',     color: GREEN,     directorOnly: true, soon: true },
        ],
      },
      {
        label: 'Hardware & Devices',
        items: [
          { icon: 'printer',      label: 'Receipt Printers',    sub: 'Configure receipt printer settings',    color: NAVY,   directorOnly: true, soon: true },
          { icon: 'server',       label: 'Kitchen Printers',    sub: 'Kitchen display & order tickets',       color: '#D97706', directorOnly: true, soon: true },
          { icon: 'tag',          label: 'Label Printers',      sub: 'Product label & barcode printers',      color: TEAL,   directorOnly: true, soon: true },
          { icon: 'maximize',     label: 'Scanners',            sub: 'Barcode & QR scanner config',           color: PURPLE, directorOnly: true, soon: true },
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
