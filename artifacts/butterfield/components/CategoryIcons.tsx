import React from 'react';
import Svg, { Path, Line, Circle, Rect, G } from 'react-native-svg';

type P = { size?: number; color?: string };

// ── Iced Drink ─────────────────────────────────────────────────────────────────
// Tall trapezoid cup, angled straw, two ice cube outlines
export function IcedDrinkIcon({ size = 24, color = '#636366' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 8L7 21H17L19 8Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <Line x1="4" y1="8" x2="20" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="16" y1="2" x2="14.8" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Rect x="7.5" y="11" width="4" height="3" rx="0.6" stroke={color} strokeWidth="1.2" />
      <Rect x="12.5" y="14.5" width="3.8" height="3" rx="0.6" stroke={color} strokeWidth="1.2" />
    </Svg>
  );
}

// ── Cookie Frappe ──────────────────────────────────────────────────────────────
// Wide frappuccino cup, large cream dome on top, spiral swirl, straw
export function FrappeIcon({ size = 24, color = '#636366' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12L7 21H17L20 12H4Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <Path
        d="M3 12C4.5 5 19.5 5 21 12"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M7 9.5Q12 7.5 17 9"
        stroke={color} strokeWidth="1.2" strokeLinecap="round"
      />
      <Path
        d="M9.5 7Q12 6 14.5 7"
        stroke={color} strokeWidth="1" strokeLinecap="round"
      />
      <Line x1="16" y1="2" x2="15.5" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

// ── Fusion ─────────────────────────────────────────────────────────────────────
// Two liquid drops converging into one with a spark at the merge point
export function FusionIcon({ size = 24, color = '#636366' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 3C5 6.5 6 11 9.5 12.5"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M8 3C8 3 10 8 9.5 12.5"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M16 3C19 6.5 18 11 14.5 12.5"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M16 3C16 3 14 8 14.5 12.5"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M9.5 12.5Q12 14 14.5 12.5"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M12 14V20"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Path
        d="M10 17Q12 19 14 17"
        stroke={color} strokeWidth="1.2" strokeLinecap="round"
      />
      <Circle cx="12" cy="14" r="1" stroke={color} strokeWidth="1.2" />
    </Svg>
  );
}

// ── Milkshake ──────────────────────────────────────────────────────────────────
// Straight-sided glass, large round cream dome, cherry with stem, straw
export function MilkshakeIcon({ size = 24, color = '#636366' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 13V21H17V13"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <Line x1="7" y1="21" x2="17" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path
        d="M6 13C6 7.5 18 7.5 18 13H6Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <Circle cx="10" cy="8" r="1.8" stroke={color} strokeWidth="1.2" />
      <Path
        d="M10 6.2C10 4.5 12.5 3.5 12.5 3.5"
        stroke={color} strokeWidth="1.2" strokeLinecap="round"
      />
      <Line x1="15.5" y1="3" x2="14.8" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

// ── Gift Box with B ────────────────────────────────────────────────────────────
// Square gift box, vertical ribbon, bow at top, bold "B" on the front
export function BoxIcon({ size = 24, color = '#636366' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="10" width="18" height="12" rx="1.5" stroke={color} strokeWidth="1.5" />
      <Path
        d="M2 7H22V10H2Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <Line x1="12" y1="7" x2="12" y2="22" stroke={color} strokeWidth="1.5" />
      <Path
        d="M12 7C11 4.5 8 4 8 6.5C8 9 12 8 12 7Z"
        stroke={color} strokeWidth="1.2" strokeLinejoin="round"
      />
      <Path
        d="M12 7C13 4.5 16 4 16 6.5C16 9 12 8 12 7Z"
        stroke={color} strokeWidth="1.2" strokeLinejoin="round"
      />
      <G>
        <Path
          d="M5.5 13V19"
          stroke={color} strokeWidth="1.4" strokeLinecap="round"
        />
        <Path
          d="M5.5 13Q9.5 13 9.5 15Q9.5 17 5.5 17"
          stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        />
        <Path
          d="M5.5 17Q10 17 10 19Q10 21 5.5 21"
          stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, (p: P) => React.ReactElement> = {
  'iced-drink': IcedDrinkIcon,
  'frappe':     FrappeIcon,
  'fusion':     FusionIcon,
  'milkshake':  MilkshakeIcon,
  'box':        BoxIcon,
};

export function CategorySvgIcon({ name, size, color }: { name: string } & P) {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} />;
}
