import { useState } from "react";

const BG = "#F2F2F7";
const CARD = "#FFFFFF";
const BLUE = "#007AFF";
const TEXT = "#1C1C1E";
const MUTED = "#8E8E93";
const BORDER = "#E5E7EB";
const GREEN = "#34C759";
const RED = "#FF3B30";
const AMBER = "#F59E0B";
const PURPLE = "#8B5CF6";

type Tab = "analytics" | "register" | "feedback" | "export";
type Range = "today" | "week" | "month" | "quarter" | "custom";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  quarter: "Quarter",
  custom: "Custom",
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function fmtAUD(cents: number) {
  return "$" + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.08em] uppercase mb-2.5" style={{ color: MUTED }}>
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="h-[34px] px-[14px] rounded-full text-[13px] font-semibold whitespace-nowrap border transition-all"
      style={{
        backgroundColor: active ? "#000" : CARD,
        color: active ? "#fff" : TEXT,
        borderColor: active ? "#000" : BORDER,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[20px] border bg-white ${className}`}
      style={{ borderColor: BORDER, boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}
    >
      {children}
    </div>
  );
}

function KpiCell({
  label,
  value,
  delta,
  color = TEXT,
}: {
  label: string;
  value: string;
  delta?: string;
  color?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center py-4 px-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="text-[22px] font-bold leading-none" style={{ color }}>
        {value}
      </p>
      {delta && (
        <p className="text-[11px] font-semibold mt-1" style={{ color: delta.startsWith("+") ? GREEN : RED }}>
          {delta} vs last
        </p>
      )}
    </div>
  );
}

function HBar({ label, value, max, color, sub }: { label: string; value: string; max: number; fill: number; color: string; sub?: string }) {
  const pct = Math.min((parseFloat(value.replace(/[^0-9.]/g, "")) / max) * 100, 100);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <p className="text-[13px] font-[500] flex-1 truncate" style={{ color: TEXT }}>{label}</p>
      <div className="flex items-center gap-2" style={{ width: 140 }}>
        <div className="flex-1 h-[6px] rounded-full" style={{ background: BORDER }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <p className="text-[12px] font-semibold" style={{ color: TEXT, minWidth: 52, textAlign: "right" }}>{value}</p>
      </div>
      {sub && <p className="text-[11px]" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

// ── Sparkline bar chart ───────────────────────────────────────────────────────
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const HOUR_DATA = [180, 420, 890, 1540, 980, 760, 640, 430, 210];
const maxH = Math.max(...HOUR_DATA);

function RevenueChart() {
  return (
    <div className="flex items-end gap-[3px] h-[72px] px-1">
      {HOURS.map((h, i) => (
        <div key={h} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-[4px] transition-all"
            style={{
              height: `${Math.round((HOUR_DATA[i] / maxH) * 64)}px`,
              background: i === 3 ? BLUE : `${BLUE}55`,
            }}
          />
          <span className="text-[9px]" style={{ color: MUTED }}>{h > 12 ? `${h - 12}p` : `${h}a`}</span>
        </div>
      ))}
    </div>
  );
}

// ── ANALYTICS TAB ─────────────────────────────────────────────────────────────
function AnalyticsTab({ range }: { range: Range }) {
  const [section, setSection] = useState<"sales" | "payments" | "products" | "staff" | "customers" | "busytimes">("sales");

  const NAV_ITEMS = [
    { id: "sales" as const, label: "Sales" },
    { id: "payments" as const, label: "Payments" },
    { id: "products" as const, label: "Products" },
    { id: "staff" as const, label: "Staff" },
    { id: "customers" as const, label: "Customers" },
    { id: "busytimes" as const, label: "Busy Times" },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Section nav */}
      <div
        className="sticky top-0 z-10 overflow-x-auto"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex gap-2 px-4 py-3" style={{ scrollbarWidth: "none" }}>
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className="h-[30px] px-3 rounded-full text-[12px] font-semibold whitespace-nowrap border transition-all"
              style={{
                background: section === n.id ? TEXT : CARD,
                color: section === n.id ? "#fff" : MUTED,
                borderColor: section === n.id ? TEXT : BORDER,
              }}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* KPI strip */}
        <Card>
          <div className="flex divide-x" style={{ borderColor: BORDER }}>
            <KpiCell label="Revenue" value="$4,218" delta="+12%" color={BLUE} />
            <div style={{ width: 1, background: BORDER }} />
            <KpiCell label="Orders" value="187" delta="+8%" />
            <div style={{ width: 1, background: BORDER }} />
            <KpiCell label="Avg Order" value="$22.56" delta="+3%" />
          </div>
        </Card>

        {/* Revenue Chart */}
        {section === "sales" && (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[15px] font-semibold" style={{ color: TEXT }}>Revenue by Hour</p>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${BLUE}15`, color: BLUE }}>
                  {RANGE_LABELS[range]}
                </span>
              </div>
              <RevenueChart />
            </Card>

            <Card className="overflow-hidden">
              <div className="p-4 pb-2">
                <p className="text-[15px] font-semibold" style={{ color: TEXT }}>Sales Summary</p>
              </div>
              <div className="px-4 pb-2">
                <div className="flex divide-x rounded-xl overflow-hidden border" style={{ borderColor: BORDER }}>
                  <div className="flex-1 p-3 text-center" style={{ background: "#EFF6FF" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: BLUE }}>Net Revenue</p>
                    <p className="text-[18px] font-bold" style={{ color: BLUE }}>$3,835</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>excl. GST</p>
                  </div>
                  <div style={{ width: 1, background: BORDER }} />
                  <div className="flex-1 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>GST</p>
                    <p className="text-[18px] font-bold" style={{ color: TEXT }}>$383</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>10% incl.</p>
                  </div>
                  <div style={{ width: 1, background: BORDER }} />
                  <div className="flex-1 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: AMBER }}>Discounts</p>
                    <p className="text-[18px] font-bold" style={{ color: AMBER }}>$124</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>given</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 flex gap-2">
                <div className="flex-1 flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: "#FCA5A5", background: "#FFF1F0" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: "#FEE2E2" }}>↩</div>
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: RED }}>Refunds</p>
                    <p className="text-[17px] font-bold" style={{ color: RED }}>3</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: "#FEF3C7" }}>✕</div>
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: AMBER }}>Cancelled</p>
                    <p className="text-[17px] font-bold" style={{ color: AMBER }}>7</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Channel breakdown */}
            <div>
              <SectionLabel>By Channel</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                {[
                  { icon: "📱", label: "App Orders", orders: 142, rev: "$3,204", pct: 76 },
                  { icon: "🖥", label: "POS Transactions", orders: 39, rev: "$879", pct: 21 },
                  { icon: "📦", label: "Wholesale", orders: 6, rev: "$135", pct: 3 },
                ].map((ch) => (
                  <div key={ch.label} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[20px]">{ch.icon}</span>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold" style={{ color: TEXT }}>{ch.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-[4px] rounded-full" style={{ background: BORDER }}>
                          <div className="h-full rounded-full" style={{ width: `${ch.pct}%`, background: BLUE }} />
                        </div>
                        <p className="text-[10px] font-semibold" style={{ color: MUTED }}>{ch.pct}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold" style={{ color: TEXT }}>{ch.rev}</p>
                      <p className="text-[11px]" style={{ color: MUTED }}>{ch.orders} orders</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}

        {section === "payments" && (
          <>
            <div>
              <SectionLabel>Payment Methods</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                {[
                  { method: "Visa / Mastercard", amount: "$2,341", count: 103, pct: 55, color: BLUE },
                  { method: "Apple Pay", amount: "$967", count: 43, pct: 23, color: "#555" },
                  { method: "Cash", amount: "$638", count: 28, pct: 15, color: AMBER },
                  { method: "EFTPOS", amount: "$272", count: 13, pct: 6, color: PURPLE },
                  { method: "Gift Voucher", amount: "$0", count: 0, pct: 1, color: GREEN },
                ].map((pm) => (
                  <div key={pm.method} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${pm.color}15` }}>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: pm.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold" style={{ color: TEXT }}>{pm.method}</p>
                      <p className="text-[11px]" style={{ color: MUTED }}>{pm.count} transactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold" style={{ color: TEXT }}>{pm.amount}</p>
                      <p className="text-[11px] font-semibold" style={{ color: pm.color }}>{pm.pct}%</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <SectionLabel>Surcharges Collected</SectionLabel>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[28px] font-bold" style={{ color: TEXT }}>$42.80</p>
                    <p className="text-[12px]" style={{ color: MUTED }}>across 13 EFTPOS surcharge transactions</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl" style={{ background: `${GREEN}15` }}>
                    💳
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {section === "products" && (
          <>
            <div>
              <SectionLabel>Top Products by Revenue</SectionLabel>
              <Card className="p-4">
                <div className="divide-y" style={{ borderColor: BORDER }}>
                  {[
                    { name: "Choc Chip Cookie 6pk", rev: "$1,024", orders: 64, pct: 100 },
                    { name: "Flat White", rev: "$687", orders: 125, pct: 67 },
                    { name: "Salted Caramel Cookie", rev: "$534", orders: 33, pct: 52 },
                    { name: "Cookie Box (12pk)", rev: "$412", orders: 16, pct: 40 },
                    { name: "Latte", rev: "$385", orders: 70, pct: 38 },
                  ].map((p) => (
                    <div key={p.name} className="py-2.5 first:pt-0 last:pb-0">
                      <HBar label={p.name} value={p.rev} max={1024} fill={p.pct} color={BLUE} sub={`${p.orders} sold`} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div>
              <SectionLabel>Category Revenue Split</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                {[
                  { cat: "Cookies", rev: "$2,104", pct: 50, color: BLUE },
                  { cat: "Coffee", rev: "$1,258", pct: 30, color: AMBER },
                  { cat: "Desserts", rev: "$630", pct: 15, color: PURPLE },
                  { cat: "Sandwiches", rev: "$210", pct: 5, color: GREEN },
                ].map((c) => (
                  <div key={c.cat} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                    <p className="flex-1 text-[13px] font-semibold" style={{ color: TEXT }}>{c.cat}</p>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-[5px] rounded-full" style={{ background: BORDER }}>
                        <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                      </div>
                      <p className="text-[13px] font-bold w-14 text-right" style={{ color: TEXT }}>{c.rev}</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <SectionLabel>Inventory Alerts</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#FEE2E2" }}>
                    <span className="text-[12px]">🚫</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: RED }}>Sold Out</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>2 products currently out of stock</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#FEF3C7" }}>
                    <span className="text-[12px]">⚠️</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: AMBER }}>Low Stock</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>5 products approaching sold-out</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {section === "staff" && (
          <>
            <div>
              <SectionLabel>Hours & Wages</SectionLabel>
              <Card className="p-4">
                <div className="flex divide-x" style={{ borderColor: BORDER }}>
                  <div className="flex-1 text-center pr-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Hours Worked</p>
                    <p className="text-[26px] font-bold" style={{ color: TEXT }}>142</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>this period</p>
                  </div>
                  <div style={{ width: 1, background: BORDER }} />
                  <div className="flex-1 text-center pl-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Wages Owed</p>
                    <p className="text-[26px] font-bold" style={{ color: PURPLE }}>$3,124</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>est. at base rate</p>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <SectionLabel>Staff Performance</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                {[
                  { name: "Sarah M.", role: "Barista", hours: "38h", tasks: 24, icon: "👩" },
                  { name: "James K.", role: "Supervisor", hours: "35h", tasks: 31, icon: "👨" },
                  { name: "Emily R.", role: "Front of House", hours: "28h", tasks: 19, icon: "👩" },
                  { name: "Tom B.", role: "Kitchen", hours: "22h", tasks: 17, icon: "👨" },
                ].map((staff) => (
                  <div key={staff.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[24px]">{staff.icon}</span>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold" style={{ color: TEXT }}>{staff.name}</p>
                      <p className="text-[11px]" style={{ color: MUTED }}>{staff.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold" style={{ color: TEXT }}>{staff.hours}</p>
                      <p className="text-[11px]" style={{ color: MUTED }}>{staff.tasks} tasks done</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <SectionLabel>Wastage This Period</SectionLabel>
              <Card className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl" style={{ background: "#F3E8FF" }}>
                  🗑️
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: TEXT }}>14 items logged</p>
                  <p className="text-[12px]" style={{ color: MUTED }}>Estimated cost: $89.40</p>
                </div>
                <div className="px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: `${PURPLE}15`, color: PURPLE }}>
                  View →
                </div>
              </Card>
            </div>
          </>
        )}

        {section === "customers" && (
          <>
            <div>
              <SectionLabel>Customer Growth</SectionLabel>
              <Card className="p-4">
                <div className="flex divide-x mb-4" style={{ borderColor: BORDER }}>
                  <div className="flex-1 text-center pr-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>New</p>
                    <p className="text-[26px] font-bold" style={{ color: GREEN }}>24</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>+18% vs last</p>
                  </div>
                  <div style={{ width: 1, background: BORDER }} />
                  <div className="flex-1 text-center pl-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Returning</p>
                    <p className="text-[26px] font-bold" style={{ color: BLUE }}>163</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>87% retention</p>
                  </div>
                </div>
                <div className="h-[1px] mb-4" style={{ background: BORDER }} />
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: BORDER }}>
                    <div className="h-full rounded-full" style={{ width: "87%", background: `linear-gradient(90deg, ${BLUE}, ${GREEN})` }} />
                  </div>
                  <p className="text-[12px] font-bold" style={{ color: TEXT }}>87% returning</p>
                </div>
              </Card>
            </div>

            <div>
              <SectionLabel>Loyalty Program</SectionLabel>
              <Card className="overflow-hidden divide-y" style={{ borderColor: BORDER }}>
                {[
                  { tier: "Platinum", count: 4, color: "#6B7280" },
                  { tier: "Gold", count: 18, color: AMBER },
                  { tier: "Silver", count: 67, color: "#9CA3AF" },
                  { tier: "Bronze", count: 147, color: "#92400E" },
                ].map((t) => (
                  <div key={t.tier} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px]" style={{ background: `${t.color}20`, color: t.color }}>
                      {t.tier[0]}
                    </div>
                    <p className="flex-1 text-[13px] font-semibold" style={{ color: TEXT }}>{t.tier}</p>
                    <p className="text-[15px] font-bold" style={{ color: TEXT }}>{t.count}</p>
                    <p className="text-[11px] w-12 text-right" style={{ color: MUTED }}>members</p>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <SectionLabel>Points Activity</SectionLabel>
              <Card className="p-4">
                <div className="flex justify-between">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Earned</p>
                    <p className="text-[20px] font-bold" style={{ color: GREEN }}>4,218</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>pts</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Redeemed</p>
                    <p className="text-[20px] font-bold" style={{ color: BLUE }}>1,340</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>pts</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Rewards</p>
                    <p className="text-[20px] font-bold" style={{ color: PURPLE }}>23</p>
                    <p className="text-[10px]" style={{ color: MUTED }}>claimed</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {section === "busytimes" && (
          <>
            <Card className="p-4">
              <p className="text-[15px] font-semibold mb-3" style={{ color: TEXT }}>Peak Hour Heatmap</p>
              <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl" style={{ background: `${AMBER}15`, border: `1px solid ${AMBER}40` }}>
                <span>⚡</span>
                <p className="text-[12px]" style={{ color: TEXT }}>Busiest hour: <strong>12–1 PM</strong> (avg 54 orders)</p>
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {[
                  { h: "9A", v: 0.2 }, { h: "10A", v: 0.4 }, { h: "11A", v: 0.7 },
                  { h: "12P", v: 1.0 }, { h: "1P", v: 0.8 }, { h: "2P", v: 0.5 },
                  { h: "3P", v: 0.35 }, { h: "4P", v: 0.3 }, { h: "5P", v: 0.25 },
                  { h: "6P", v: 0.15 }, { h: "7P", v: 0.1 }, { h: "8P", v: 0.05 },
                  { h: "9P", v: 0.03 }, { h: "10P", v: 0.01 },
                ].map((cell) => (
                  <div key={cell.h} className="flex flex-col items-center gap-1">
                    <div
                      className="w-full aspect-square rounded-[6px] flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: `rgba(0,122,255,${0.07 + cell.v * 0.88})`,
                        color: cell.v > 0.5 ? "#fff" : BLUE,
                      }}
                    >
                      {Math.round(cell.v * 54)}
                    </div>
                    <span className="text-[8px]" style={{ color: MUTED }}>{cell.h}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div>
              <SectionLabel>Busiest Days</SectionLabel>
              <Card className="p-4">
                <div className="flex flex-col gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => {
                    const vals = [38, 41, 45, 52, 67, 84, 43];
                    const pct = (vals[i] / 84) * 100;
                    return (
                      <div key={d} className="flex items-center gap-3">
                        <p className="text-[12px] font-semibold w-7" style={{ color: MUTED }}>{d}</p>
                        <div className="flex-1 h-[8px] rounded-full" style={{ background: BORDER }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i === 5 ? BLUE : `${BLUE}70` }} />
                        </div>
                        <p className="text-[12px] font-bold w-6 text-right" style={{ color: TEXT }}>{vals[i]}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* Download Excel */}
        <button
          className="w-full py-4 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 mt-2"
          style={{ background: BLUE }}
        >
          <span>↓</span> Download Excel Report
        </button>
      </div>
    </div>
  );
}

// ── REGISTER REPORTS TAB ──────────────────────────────────────────────────────
function RegisterTab() {
  const sessions = [
    { reg: "Register 1", date: "Thu 12 Jun", total: 182340, card: 156200, cash: 26140, variance: 0, method: "Manual", opened: "Sarah M." },
    { reg: "Register 2", date: "Thu 12 Jun", total: 98760, card: 98760, cash: 0, variance: -1500, method: "Auto", opened: "James K." },
    { reg: "Register 1", date: "Wed 11 Jun", total: 214500, card: 188000, cash: 26500, variance: 500, method: "Manual", opened: "Emily R." },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Summary strip */}
      <div className="px-4 pt-4">
        <Card>
          <div className="flex divide-x" style={{ borderColor: BORDER }}>
            <KpiCell label="Sessions" value="14" />
            <div style={{ width: 1, background: BORDER }} />
            <KpiCell label="Total Sales" value="$12,847" color={BLUE} />
            <div style={{ width: 1, background: BORDER }} />
            <KpiCell label="Variance" value="−$15.00" color={RED} />
          </div>
        </Card>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        <SectionLabel>Register Sessions</SectionLabel>
        {sessions.map((s, i) => {
          const varTone = s.variance === 0 ? GREEN : s.variance > 0 ? GREEN : RED;
          return (
            <Card key={i} className="overflow-hidden">
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: TEXT }}>{s.reg}</p>
                    <p className="text-[12px]" style={{ color: MUTED }}>{s.date} · Butterfield Cookies</p>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-full"
                      style={{
                        background: s.method === "Manual" ? "#ECFDF5" : "#EFF6FF",
                        color: s.method === "Manual" ? "#15803D" : BLUE,
                      }}
                    >
                      {s.method} Close
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-3" style={{ background: "#EFF6FF", border: `1px solid #BFDBFE` }}>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5" style={{ color: BLUE }}>Total Sales</p>
                    <p className="text-[20px] font-extrabold" style={{ color: BLUE }}>{fmtAUD(s.total)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold" style={{ color: TEXT }}>Card {fmtAUD(s.card)}</p>
                    {s.cash > 0 && <p className="text-[11px]" style={{ color: MUTED }}>Cash {fmtAUD(s.cash)}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Float", value: "$200.00" },
                    { label: "Expected Cash", value: fmtAUD(s.cash + 20000) },
                    {
                      label: "Variance",
                      value: s.variance === 0 ? "$0.00" : (s.variance > 0 ? "+" : "") + fmtAUD(Math.abs(s.variance)),
                      color: varTone,
                    },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl p-2.5 border" style={{ background: "#F8FAFC", borderColor: BORDER }}>
                      <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>{m.label}</p>
                      <p className="text-[13px] font-bold" style={{ color: m.color ?? TEXT }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] mt-3" style={{ color: MUTED }}>Opened by {s.opened}</p>
              </div>

              <div className="flex divide-x border-t" style={{ borderColor: BORDER }}>
                <button className="flex-1 py-3 text-[13px] font-semibold flex items-center justify-center gap-1.5" style={{ color: BLUE }}>
                  <span>🖨</span> Print
                </button>
                <div style={{ width: 1, background: BORDER }} />
                <button className="flex-1 py-3 text-[13px] font-semibold flex items-center justify-center gap-1.5" style={{ color: BLUE }}>
                  <span>📄</span> PDF
                </button>
                <div style={{ width: 1, background: BORDER }} />
                <button className="flex-1 py-3 text-[13px] font-semibold flex items-center justify-center gap-1.5" style={{ color: TEXT }}>
                  <span>✏️</span> Notes
                </button>
              </div>
            </Card>
          );
        })}

        <button
          className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 border"
          style={{ color: BLUE, borderColor: `${BLUE}40`, background: `${BLUE}08` }}
        >
          ↓ Export Filtered CSV
        </button>
      </div>
    </div>
  );
}

// ── FEEDBACK TAB ──────────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { color: string; bg: string }> = {
  general:   { color: "#0369A1", bg: "#EBF8FF" },
  product:   { color: "#5B21B6", bg: "#EDE9FE" },
  service:   { color: "#166534", bg: "#DCFCE7" },
  app:       { color: "#854D0E", bg: "#FEF9C3" },
  complaint: { color: "#991B1B", bg: "#FEF2F2" },
};

function FeedbackTab() {
  const items = [
    { cat: "product", rating: 5, msg: "The choc chip cookies are absolutely amazing! Best in Sydney by far 🍪", date: "12 Jun", unread: true },
    { cat: "service", rating: 4, msg: "Staff were friendly and efficient. Coffee came out fast during the lunch rush.", date: "12 Jun", unread: true },
    { cat: "app", rating: 3, msg: "Love the app but the cart sometimes loses my items when I switch screens.", date: "11 Jun", unread: false },
    { cat: "complaint", rating: 2, msg: "Order was marked ready but wasn't actually prepared yet. Waited 10 extra mins.", date: "11 Jun", unread: false },
    { cat: "general", rating: 5, msg: "Great café! Will definitely be back. The loyalty points system is a nice touch.", date: "10 Jun", unread: false },
  ];

  const unread = items.filter((f) => f.unread).length;

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Summary */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: TEXT }}>Average Rating</p>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="text-[18px]">
                    {n <= 4 ? "⭐" : "✩"}
                  </span>
                ))}
                <p className="text-[16px] font-bold ml-1" style={{ color: TEXT }}>4.0</p>
              </div>
            </div>
            {unread > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-full"
                style={{ background: `${BLUE}15`, border: `1px solid ${BLUE}30` }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: BLUE }} />
                <p className="text-[13px] font-semibold" style={{ color: BLUE }}>{unread} unread</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries({ general: 1, product: 1, service: 1, app: 1, complaint: 1 }).map(([cat, _]) => {
              const c = CAT_COLORS[cat];
              return (
                <span key={cat} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: c.bg, color: c.color }}>
                  {cat}
                </span>
              );
            })}
          </div>
        </Card>

        {items.map((f, i) => {
          const cat = CAT_COLORS[f.cat] ?? { color: MUTED, bg: BG };
          return (
            <Card
              key={i}
              className="p-4"
              style={{
                background: f.unread ? "#F0F9FF" : CARD,
                borderColor: f.unread ? `${BLUE}40` : BORDER,
              } as any}
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: cat.bg, color: cat.color }}>
                  {f.cat}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} style={{ fontSize: 11 }}>{n <= f.rating ? "⭐" : "✩"}</span>
                  ))}
                </div>
                <p className="text-[11px] ml-auto" style={{ color: MUTED }}>{f.date}</p>
                {f.unread && <div className="w-2 h-2 rounded-full" style={{ background: BLUE }} />}
              </div>
              <p className="text-[13px] leading-[19px]" style={{ color: TEXT }}>{f.msg}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── EXPORT CENTRE TAB ─────────────────────────────────────────────────────────
function ExportTab() {
  const exports = [
    {
      title: "Business Report",
      desc: "Full P&L — orders, revenue, GST, refunds, discounts",
      icon: "📊",
      color: BLUE,
      format: "XLSX",
      badge: "Premium",
    },
    {
      title: "Register Reports",
      desc: "Daily session summaries with cash variance",
      icon: "🖥",
      color: GREEN,
      format: "CSV",
      badge: null,
    },
    {
      title: "Staff Hours & Wages",
      desc: "Clock-in/out history with estimated wage costs",
      icon: "👥",
      color: PURPLE,
      format: "CSV",
      badge: null,
    },
    {
      title: "Wastage Log",
      desc: "All logged wastage items with cost estimates",
      icon: "🗑️",
      color: AMBER,
      format: "CSV",
      badge: null,
    },
    {
      title: "Customer Data",
      desc: "Customer list with loyalty tiers and spending",
      icon: "👤",
      color: "#EC4899",
      format: "CSV",
      badge: null,
    },
    {
      title: "Sales by Product",
      desc: "Product-level revenue and units sold breakdown",
      icon: "🛍",
      color: "#06B6D4",
      format: "CSV",
      badge: null,
    },
    {
      title: "Wholesale Orders",
      desc: "All wholesale orders with invoice and status",
      icon: "📦",
      color: "#059669",
      format: "CSV",
      badge: null,
    },
    {
      title: "Loyalty Transactions",
      desc: "Points earned, redeemed, and rewards claimed",
      icon: "⭐",
      color: AMBER,
      format: "CSV",
      badge: null,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Date selector */}
        <Card className="p-4">
          <p className="text-[13px] font-semibold mb-3" style={{ color: TEXT }}>Export Date Range</p>
          <div className="flex gap-2 flex-wrap">
            {["Today", "Week", "Month", "Quarter", "Custom"].map((p, i) => (
              <button
                key={p}
                className="px-3 py-2 rounded-xl text-[13px] font-semibold border"
                style={{
                  background: i === 2 ? BLUE : BG,
                  color: i === 2 ? "#fff" : TEXT,
                  borderColor: i === 2 ? BLUE : BORDER,
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: BORDER, background: BG }}>
            <span className="text-[13px]" style={{ color: MUTED }}>📅</span>
            <p className="text-[13px]" style={{ color: MUTED }}>1 Jun 2025 → 30 Jun 2025</p>
          </div>
        </Card>

        <SectionLabel>Available Exports</SectionLabel>

        {exports.map((exp) => (
          <Card key={exp.title} className="p-4">
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-[22px] flex-shrink-0"
                style={{ background: `${exp.color}15` }}
              >
                {exp.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[14px] font-semibold" style={{ color: TEXT }}>{exp.title}</p>
                  {exp.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${BLUE}15`, color: BLUE }}>
                      {exp.badge}
                    </span>
                  )}
                </div>
                <p className="text-[12px]" style={{ color: MUTED }}>{exp.desc}</p>
              </div>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-[12px] flex-shrink-0"
                style={{ background: `${exp.color}12`, color: exp.color, border: `1px solid ${exp.color}30` }}
              >
                ↓ {exp.format}
              </button>
            </div>
          </Card>
        ))}

        <div className="mt-2 p-4 rounded-2xl border" style={{ background: `${BLUE}08`, borderColor: `${BLUE}25` }}>
          <div className="flex items-center gap-2 mb-2">
            <span>💼</span>
            <p className="text-[13px] font-semibold" style={{ color: BLUE }}>Scheduled Reports</p>
          </div>
          <p className="text-[12px] mb-3" style={{ color: MUTED }}>Auto-email weekly or monthly reports to your accountant or business email.</p>
          <button className="w-full py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: BLUE, color: "#fff" }}>
            Set Up Auto Reports
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export function Reports() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [range, setRange] = useState<Range>("week");

  const TABS = [
    { id: "analytics" as const, label: "Analytics", icon: "📈" },
    { id: "register" as const, label: "Register", icon: "🖥" },
    { id: "feedback" as const, label: "Feedback", icon: "💬" },
    { id: "export" as const, label: "Export", icon: "↓" },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4" style={{ background: BG }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              ←
            </button>
            <h1 className="text-[22px] font-bold" style={{ color: TEXT }}>Reports</h1>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full" style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40` }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
            <p className="text-[11px] font-bold" style={{ color: GREEN }}>LIVE</p>
          </div>
        </div>

        {/* Top tab bar */}
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-2.5 rounded-2xl text-[12px] font-semibold transition-all flex flex-col items-center gap-0.5 border"
              style={{
                background: tab === t.id ? TEXT : CARD,
                color: tab === t.id ? "#fff" : MUTED,
                borderColor: tab === t.id ? TEXT : BORDER,
              }}
            >
              <span className="text-[15px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date range (only for analytics + register) */}
      {(tab === "analytics" || tab === "register") && (
        <div className="overflow-x-auto" style={{ borderBottom: `1px solid ${BORDER}`, background: CARD }}>
          <div className="flex gap-2 px-4 py-3" style={{ scrollbarWidth: "none" }}>
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <Chip key={r} active={range === r} onClick={() => setRange(r)}>
                {RANGE_LABELS[r]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === "analytics" && <AnalyticsTab range={range} />}
      {tab === "register" && <RegisterTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "export" && <ExportTab />}
    </div>
  );
}
