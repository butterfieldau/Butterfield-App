import React from 'react';
import { 
  Shell, 
  SectionLabel, 
  FilterChip,
  BG, 
  SURFACE, 
  SURFACE_RAISED, 
  BORDER, 
  TEXT, 
  TEXT_MUTED, 
  TEXT_FAINT, 
  GOLD, 
  GOLD_DIM, 
  GREEN, 
  GREEN_DIM, 
  AMBER, 
  AMBER_DIM, 
  RED, 
  RED_DIM, 
  BLUE, 
  BLUE_DIM, 
  PURPLE, 
  PURPLE_DIM 
} from './_shared/Shell';
import { Plus, AlertCircle, Clock, Package, FileText, ChevronRight } from 'lucide-react';

const MOCK_ORDERS = [
  {
    id: 'PO-4471',
    company: 'Harborview Cafe Co.',
    deliveryDate: 'Today, 6:00 AM',
    items: 45,
    exGst: 345.50,
    total: 380.05,
    status: 'overdue',
    daysOverdue: 14
  },
  {
    id: 'PO-4470',
    company: 'The Daily Grind',
    deliveryDate: 'Yesterday, 5:30 AM',
    items: 120,
    exGst: 850.00,
    total: 935.00,
    status: 'overdue',
    daysOverdue: 2
  },
  {
    id: 'PO-4475',
    company: 'Main St Bakery',
    deliveryDate: 'Tomorrow, 5:00 AM',
    items: 60,
    exGst: 420.00,
    total: 462.00,
    status: 'pending'
  },
  {
    id: 'PO-4478',
    company: 'Harborview Cafe Co.',
    deliveryDate: 'Thu, 24 Aug',
    items: 45,
    exGst: 345.50,
    total: 380.05,
    status: 'pending'
  },
  {
    id: 'PO-4460',
    company: 'Downtown Espresso',
    deliveryDate: 'Mon, 21 Aug',
    items: 85,
    exGst: 610.00,
    total: 671.00,
    status: 'paid'
  }
];

export function Wholesale() {
  const outstandingBalance = 14250.00;
  const overdueAmount = 2450.00;
  const overdueAccountsCount = 4;
  const aov = 450.25;

  return (
    <Shell activeTab="wholesale" title="Wholesale" subtitle="B2B accounts & orders">
      {/* Hero Stat */}
      <div className="px-5 pt-8 pb-6 flex flex-col items-center justify-center text-center">
        <div className="text-[13px] font-bold tracking-widest uppercase mb-2" style={{ color: TEXT_MUTED }}>
          Outstanding Balance
        </div>
        <div className="text-6xl font-black tracking-tighter mb-3" style={{ color: TEXT }}>
          ${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: RED_DIM, color: RED }}
        >
          <AlertCircle size={16} />
          <span>{overdueAccountsCount} accounts overdue (${overdueAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
        </div>
      </div>

      {/* Sub KPIs */}
      <div className="px-5 mb-8 grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl flex flex-col gap-1" style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-semibold" style={{ color: TEXT_MUTED }}>Avg Order Value</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>${aov.toFixed(2)}</div>
        </div>
        <div className="p-4 rounded-2xl flex flex-col gap-1" style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-semibold" style={{ color: TEXT_MUTED }}>Orders This Week</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>24</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 mb-6 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <FilterChip label="All Active" active />
        <FilterChip label="Overdue" />
        <FilterChip label="Due This Week" />
        <FilterChip label="Paid" />
      </div>

      {/* Orders List */}
      <div>
        <SectionLabel>Requires Attention</SectionLabel>
        <div className="px-5 flex flex-col gap-3 mb-6">
          {MOCK_ORDERS.filter(o => o.status === 'overdue').map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>

        <SectionLabel>Upcoming Deliveries</SectionLabel>
        <div className="px-5 flex flex-col gap-3 pb-24">
          {MOCK_ORDERS.filter(o => o.status === 'pending').map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-5 left-5 flex justify-end pointer-events-none">
        <button 
          className="h-14 px-6 rounded-full flex items-center justify-center gap-2 font-bold text-[15px] shadow-lg pointer-events-auto transition-transform active:scale-95"
          style={{ background: GOLD, color: '#1A1206' }}
        >
          <Plus size={20} strokeWidth={3} />
          New Order
        </button>
      </div>
    </Shell>
  );
}

function OrderCard({ order }: { order: typeof MOCK_ORDERS[0] }) {
  const isOverdue = order.status === 'overdue';
  const isPaid = order.status === 'paid';

  return (
    <div 
      className="p-4 rounded-2xl relative overflow-hidden flex flex-col gap-3"
      style={{ 
        background: SURFACE, 
        border: `1px solid ${isOverdue ? RED : BORDER}`,
        boxShadow: isOverdue ? `0 0 0 1px ${RED} inset, 0 4px 20px rgba(248, 113, 113, 0.1)` : 'none'
      }}
    >
      {/* Overdue Accent Line */}
      {isOverdue && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: RED }} />
      )}

      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold" style={{ color: GOLD }}>{order.id}</span>
            {isOverdue && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: RED_DIM, color: RED }}>
                {order.daysOverdue}D OVERDUE
              </span>
            )}
            {isPaid && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: GREEN_DIM, color: GREEN }}>
                PAID
              </span>
            )}
          </div>
          <div className="text-base font-bold" style={{ color: TEXT }}>
            {order.company}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-0.5">
          <div className="text-base font-bold" style={{ color: TEXT }}>
            ${order.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px]" style={{ color: TEXT_MUTED }}>
            ${order.exGst.toFixed(2)} ex GST
          </div>
        </div>
      </div>

      <div className="h-px w-full opacity-50" style={{ background: BORDER }} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>
            <Clock size={14} style={{ color: isOverdue ? RED : TEXT_FAINT }} />
            <span style={{ color: isOverdue ? RED : TEXT_MUTED }}>{order.deliveryDate}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>
            <Package size={14} style={{ color: TEXT_FAINT }} />
            <span>{order.items} items</span>
          </div>
        </div>
        <ChevronRight size={16} style={{ color: TEXT_FAINT }} />
      </div>
    </div>
  );
}
