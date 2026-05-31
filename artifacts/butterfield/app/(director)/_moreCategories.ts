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

export type Category = {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  items: RowItem[];
};

const BLUE   = '#1493FF';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const RED    = '#EF4444';
const NAVY   = '#1A2B4A';

const ALL_CATEGORIES: Category[] = [
  {
    key: 'sales',
    label: 'Sales & Marketing',
    icon: 'trending-up',
    color: BLUE,
    description: 'Reports, discounts, rewards & promotions',
    items: [
      { icon: 'bar-chart-2', label: 'Reports',            sub: 'Revenue, sales trends & analytics',         color: NAVY,    perm: 'reports',       onPress: () => router.push('/(director)/reports' as any) },
      { icon: 'percent',     label: 'Discount Codes',     sub: 'Coupons, promotions & campaigns',           color: RED,     perm: 'pricing',       onPress: () => router.push('/(director)/discounts' as any) },
      { icon: 'gift',        label: 'Rewards & Loyalty',  sub: 'Loyalty tiers, rewards & coffee stamps',    color: GREEN,   perm: 'rewards',       onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Rewards' } } as any) },
      { icon: 'image',       label: 'Banners',            sub: 'Homepage banners & featured products',      color: AMBER,   perm: 'banners',       onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Banner'  } } as any) },
      { icon: 'bell',        label: 'Announcements',      sub: 'Push notifications & in-app messages',      color: '#06B6D4', perm: 'announcements', onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Notify'  } } as any) },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: 'tool',
    color: GREEN,
    description: 'Store settings, stock, locations & timesheets',
    items: [
      { icon: 'settings', label: 'Store Settings',   sub: 'Open/close, daily special & pickup',         color: GREEN,   perm: 'settings',   onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Store' } } as any) },
      { icon: 'map-pin',  label: 'Store Locations',  sub: 'Locations, trading hours & geofence',        color: '#059669', perm: 'settings', onPress: () => router.push('/(director)/stores' as any) },
      { icon: 'archive',  label: 'Stock & Inventory',sub: 'Stock levels, movements & low-stock alerts', color: AMBER,   perm: 'stock',      onPress: () => router.push('/(director)/stock' as any) },
      { icon: 'clock',    label: 'Timesheets',        sub: 'Staff hours, payroll export & attendance',   color: PURPLE,  perm: 'timesheets', onPress: () => router.push('/(director)/timesheets' as any) },
    ],
  },
  {
    key: 'people',
    label: 'People',
    icon: 'users',
    color: PURPLE,
    description: 'Customers, staff accounts & manager access',
    items: [
      { icon: 'user-check', label: 'Customers',        sub: 'CRM, loyalty history & customer notes',     color: BLUE,   perm: 'users',                onPress: () => router.push('/(director)/customers' as any) },
      { icon: 'users',      label: 'People & Accounts',sub: 'Staff, managers & wholesale accounts',      color: PURPLE, perm: 'users',                onPress: () => router.push('/(director)/users' as any) },
      { icon: 'shield',     label: 'Manager Access',   sub: 'Roles, permissions & portal access',        color: NAVY,   directorOnly: true,           onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Managers' } } as any) },
    ],
  },
  {
    key: 'wholesale',
    label: 'Wholesale',
    icon: 'briefcase',
    color: AMBER,
    description: 'Pricing tiers, quantity breaks & credit limits',
    items: [
      { icon: 'tag',          label: 'Wholesale Tiers',   sub: 'Tier discounts & minimum order rules', color: AMBER,    perm: 'pricing', onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'Tiers' } } as any) },
      { icon: 'layers',       label: 'Quantity Breaks',   sub: 'Volume pricing per product',           color: '#D97706', perm: 'pricing', onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'QtyBreaks' } } as any) },
      { icon: 'dollar-sign',  label: 'Customer Pricing',  sub: 'Per-customer overrides & credit',      color: '#B45309', perm: 'pricing', onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'Custom' } } as any) },
      { icon: 'user',         label: 'Account Managers',  sub: 'Assign managers to wholesale clients', color: '#92400E', perm: 'users',   onPress: () => router.push('/(director)/users' as any) },
    ],
  },
  {
    key: 'system',
    label: 'System',
    icon: 'cpu',
    color: NAVY,
    description: 'Notifications, integrations & app settings',
    items: [
      { icon: 'bell-off',   label: 'Notification Settings', sub: 'Control what you get notified about', color: PURPLE, onPress: () => router.push('/notification-prefs' as any) },
      { icon: 'link',       label: 'Integrations',          sub: 'Square, Shopify, Xero & Google',      color: BLUE,   soon: true },
      { icon: 'sliders',    label: 'App Settings',          sub: 'Configure app-wide preferences',      color: GREEN,  soon: true },
      { icon: 'lock',       label: 'Security',              sub: 'Access control & authentication',     color: AMBER,  directorOnly: true, soon: true },
      { icon: 'file-text',  label: 'Audit Logs',            sub: 'Track admin actions & changes',       color: NAVY,   directorOnly: true, soon: true },
    ],
  },
];

export function buildCategories(
  canSee: (perm: string) => boolean,
  isDirector: boolean,
): Category[] {
  return ALL_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      if (item.directorOnly && !isDirector) return false;
      if (item.perm && !canSee(item.perm)) return false;
      return true;
    }),
  })).filter(cat => cat.items.length > 0);
}
