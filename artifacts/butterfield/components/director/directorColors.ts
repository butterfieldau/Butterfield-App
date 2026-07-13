export const BG          = '#F2F2F7';
export const CARD        = '#FFFFFF';
export const BLUE        = '#007AFF';
export const NAVY        = '#1A2B4A';
export const TEXT        = '#1C1C1E';
export const MUTED       = '#8E8E93';
export const BORDER      = '#E5E7EB';
export const BORD        = '#E5E7EB';
export const GREEN       = '#34C759';
export const AMBER       = '#F59E0B';
export const RED         = '#FF3B30';
export const PURPLE      = '#8B5CF6';
export const PINK        = '#EC4899';
export const TEAL        = '#06B6D4';
export const ROSE        = '#F43F5E';
export const GOLD        = '#C9A84C';
export const GLASS_BG    = 'rgba(255,255,255,0.6)';
export const GLASS_BORDER= 'rgba(255,255,255,0.85)';
export const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

export const RADIUS_SM   = 12;
export const RADIUS_MD   = 16;
export const RADIUS_LG   = 20;

export const CHIP_ACTIVE = {
  height: 34, borderRadius: 17, backgroundColor: BLUE,
  paddingHorizontal: 14, alignItems: 'center' as const, justifyContent: 'center' as const,
};

export const CHIP_INACTIVE = {
  height: 34, borderRadius: 17, backgroundColor: '#F1F5F9',
  paddingHorizontal: 14, alignItems: 'center' as const, justifyContent: 'center' as const,
};

export const CHIP_LABEL_ACTIVE   = { fontSize: 13, fontWeight: '600' as const, color: '#FFFFFF' };
export const CHIP_LABEL_INACTIVE = { fontSize: 13, fontWeight: '600' as const, color: TEXT };
