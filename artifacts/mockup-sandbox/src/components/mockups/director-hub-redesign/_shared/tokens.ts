// Shared design tokens for the Director Hub redesign — "Command Center" direction.
// High-contrast dark chrome, one warm gold brand accent, clear semantic status colors.

export const BG = '#0A0E14';
export const SURFACE = '#141A24';
export const SURFACE_RAISED = '#1B2330';
export const BORDER = '#26303F';

export const TEXT = '#F5F7FA';
export const TEXT_MUTED = '#8B96A8';
export const TEXT_FAINT = '#5B6576';

export const GOLD = '#F2B84B';
export const GOLD_DIM = 'rgba(242, 184, 75, 0.14)';

export const GREEN = '#34D399';
export const GREEN_DIM = 'rgba(52, 211, 153, 0.14)';
export const AMBER = '#FBBF24';
export const AMBER_DIM = 'rgba(251, 191, 36, 0.14)';
export const RED = '#F87171';
export const RED_DIM = 'rgba(248, 113, 113, 0.14)';
export const BLUE = '#60A5FA';
export const BLUE_DIM = 'rgba(96, 165, 250, 0.14)';
export const PURPLE = '#C084FC';
export const PURPLE_DIM = 'rgba(192, 132, 252, 0.14)';

export type TabKey = 'app' | 'wholesale' | 'pos';

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'app', label: 'App Orders' },
  { key: 'wholesale', label: 'Wholesale' },
  { key: 'pos', label: 'POS' },
];
