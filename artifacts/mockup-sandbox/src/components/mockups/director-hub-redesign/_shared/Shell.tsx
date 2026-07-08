import { ReactNode } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { BG, SURFACE, BORDER, TEXT, TEXT_MUTED, GOLD, GOLD_DIM, TABS, TabKey } from './tokens';

export function Shell({
  activeTab,
  title,
  subtitle,
  children,
}: {
  activeTab: TabKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <div
        className="shrink-0 px-5 pt-6 pb-3 flex flex-col gap-3"
        style={{ background: '#0D131C', borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
              style={{ background: GOLD_DIM, color: GOLD }}
            >
              DIRECTOR
            </div>
            <span className="text-[11px]" style={{ color: TEXT_MUTED }}>
              Butterfield Cookies
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Bell size={16} color={TEXT_MUTED} />
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT }}
            >
              M
            </div>
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              {subtitle}
            </p>
          )}
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: SURFACE }}>
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <div
                key={tab.key}
                className="flex-1 text-center py-2 rounded-lg text-[12px] font-semibold transition-colors"
                style={
                  isActive
                    ? { background: GOLD, color: '#1A1206' }
                    : { color: TEXT_MUTED }
                }
              >
                {tab.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-8">{children}</div>
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 mt-6 mb-2.5">
      <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXT_MUTED }}>
        {children}
      </span>
      {right}
    </div>
  );
}

export function FilterChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex items-center gap-1"
      style={
        active
          ? { background: GOLD, color: '#1A1206' }
          : { background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }
      }
    >
      {label}
    </div>
  );
}

export { ChevronDown };
export * from './tokens';
