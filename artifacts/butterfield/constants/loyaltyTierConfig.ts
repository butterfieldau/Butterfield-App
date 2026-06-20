import { Feather } from '@expo/vector-icons';
import { getNextTierBySpend as _getNextTierBySpend, type TierKey } from '@/constants/tierConfig';
import type { LoyaltyTierSettings } from '@/lib/api';

export type DisplayTierKey = 'blue' | 'silver' | 'gold' | 'black';

export type DisplayTier = {
  key: DisplayTierKey;
  serverKey: TierKey;
  label: string;
  spendThreshold: number;
  shortLabel: string;
  logo: any;
  logoTint?: string;
  accent: string;
  chipBg: string;
  text: string;
  gradients: [string, string, string];
  edge: string;
  shadow: string;
};

export const DISPLAY_TIERS: DisplayTier[] = [
  {
    key: 'blue', serverKey: 'blue', label: 'Blue', shortLabel: 'Blue Member', spendThreshold: 20000,
    logo: require('@/assets/images/logo-white.png'), accent: '#7FD3FF', chipBg: 'rgba(20,147,255,0.22)',
    text: '#F8FCFF', gradients: ['#0B63D8', '#1E93FF', '#63C8FF'], edge: 'rgba(255,255,255,0.22)', shadow: 'rgba(11,99,216,0.45)',
  },
  {
    key: 'silver', serverKey: 'silver', label: 'Silver', shortLabel: 'Silver Member', spendThreshold: 50000,
    logo: require('@/assets/images/logo-white.png'), accent: '#EFF4FB', chipBg: 'rgba(255,255,255,0.22)',
    text: '#FDFEFF', gradients: ['#808998', '#C8D0DC', '#EEF3F9'], edge: 'rgba(255,255,255,0.4)', shadow: 'rgba(163,174,189,0.28)',
  },
  {
    key: 'gold', serverKey: 'gold', label: 'Gold', shortLabel: 'Gold Member', spendThreshold: 100000,
    logo: require('@/assets/images/logo-white.png'), accent: '#FFF2CC', chipBg: 'rgba(255,243,205,0.2)',
    text: '#FFFDF7', gradients: ['#A77516', '#D6A74A', '#F4D48C'], edge: 'rgba(255,248,220,0.32)', shadow: 'rgba(166,117,22,0.34)',
  },
  {
    key: 'black', serverKey: 'black', label: 'Black', shortLabel: 'Black Member', spendThreshold: 200000,
    logo: require('@/assets/images/logo-blue.png'), accent: '#51A9FF', logoTint: '#3AA0FF',
    chipBg: 'rgba(58,160,255,0.16)', text: '#F6FAFF', gradients: ['#0A0E14', '#1A202A', '#343A45'],
    edge: 'rgba(99,179,255,0.2)', shadow: 'rgba(0,0,0,0.42)',
  },
];

export const REWARD_PRESETS: Record<string, { icon: keyof typeof Feather.glyphMap; image?: any; tint: string; bg: [string, string] }> = {
  free_coffee:    { icon: 'coffee',       tint: '#5B7CFA', bg: ['#EEF4FF', '#DCE8FF'] },
  free_cookie:    { icon: 'circle',       tint: '#C47B23', bg: ['#FFF3D8', '#FFE1B2'] },
  free_six_pack:  { icon: 'package',      tint: '#7A52E8', bg: ['#EEE8FF', '#DCD0FF'] },
  coffee_upgrade: { icon: 'trending-up',  tint: '#0E9F6E', bg: ['#E9FFF6', '#C9F7E4'] },
  birthday_reward:{ icon: 'gift',         tint: '#E866A8', bg: ['#FFF0F7', '#FFE0EF'] },
  merch_reward:   { icon: 'shopping-bag', image: require('@/assets/images/butterfield-character.png'), tint: '#4B5563', bg: ['#F4F5F7', '#E5E7EB'] },
  points_voucher: { icon: 'tag',          image: require('@/assets/images/butterfield-app-gems.png'),  tint: '#1D4ED8', bg: ['#EEF2FF', '#DCE4FF'] },
};

export function getBirthdayInfo(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [, m, d] = isoDate.split('-').map(Number);
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
  const formatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (diff === 0) return { daysUntil: 0, isBirthday: true, emoji: '🎂', message: 'Happy Birthday', sub: 'Your Butterfield birthday treat is ready today.' };
  return { daysUntil: diff, isBirthday: false, emoji: '🎉', message: `Birthday on ${formatted}`, sub: `${diff} days to go — your free cookie or coffee will be waiting.` };
}

export function getClaimExpiryInfo(expiresAt: string | null) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const msLeft = expiry.getTime() - Date.now();
  if (msLeft <= 0) return null;
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft === 1) return { label: 'Expires tomorrow' };
  if (daysLeft <= 7) return { label: `Expires in ${daysLeft} days` };
  return { label: `Expires ${expiry.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` };
}

export function getDisplayTierByServerTier(serverTier?: string | null): DisplayTier {
  return DISPLAY_TIERS.find((t) => t.serverKey === serverTier) ?? DISPLAY_TIERS[0];
}

export function getNextTierBySpend(spentCents: number, settings?: LoyaltyTierSettings | null) {
  return _getNextTierBySpend(spentCents, settings);
}

export function getNextDisplayTier(spentCents: number, settings?: LoyaltyTierSettings | null): DisplayTier | null {
  const next = _getNextTierBySpend(spentCents, settings);
  return next ? getDisplayTierByServerTier(next.key) : null;
}

export function formatCurrency(cents: number) {
  const hasCents = cents % 100 !== 0;
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 })}`;
}

export function getPointsDollarValue(points: number) { return points * 5; }

export function rewardPresetForTitle(title: string, type?: string | null) {
  const k = title.toLowerCase();
  if (type === 'money_voucher') return REWARD_PRESETS.points_voucher;
  if (k.includes('six'))       return REWARD_PRESETS.free_six_pack;
  if (k.includes('upgrade'))   return REWARD_PRESETS.coffee_upgrade;
  if (k.includes('birthday'))  return REWARD_PRESETS.birthday_reward;
  if (k.includes('merch') || k.includes('hoodie') || k.includes('shirt') || k.includes('hat')) return REWARD_PRESETS.merch_reward;
  if (k.includes('coffee') || k.includes('drink') || k.includes('matcha')) return REWARD_PRESETS.free_coffee;
  if (k.includes('cookie')) return REWARD_PRESETS.free_cookie;
  return REWARD_PRESETS.points_voucher;
}
