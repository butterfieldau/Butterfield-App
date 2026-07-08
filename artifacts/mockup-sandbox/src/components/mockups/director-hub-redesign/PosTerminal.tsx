import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Printer, 
  XOctagon, 
  TrendingUp,
  CreditCard,
  Banknote,
  SplitSquareHorizontal,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
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

type PaymentMethod = 'EFTPOS' | 'Cash' | 'Split';
type TxStatus = 'In Progress' | 'Completed' | 'Voided' | 'Refunded';

interface Transaction {
  id: string;
  time: string;
  items: string;
  total: number;
  method: PaymentMethod;
  status: TxStatus;
}

const ISSUES: Transaction[] = [
  { id: 'TX-8921', time: '14:22', items: '2x Latte, 1x Choc Chip', total: 14.50, method: 'EFTPOS', status: 'Voided' },
  { id: 'TX-8840', time: '10:15', items: '1x Build-a-Box (6)', total: 32.00, method: 'Split', status: 'Refunded' },
];

const IN_PROGRESS: Transaction[] = [
  { id: 'TX-8945', time: '14:58', items: '1x Flat White, 1x Macadamia', total: 11.00, method: 'Cash', status: 'In Progress' },
  { id: 'TX-8944', time: '14:56', items: '3x Cappuccino', total: 16.50, method: 'EFTPOS', status: 'In Progress' },
];

const COMPLETED: Transaction[] = [
  { id: 'TX-8943', time: '14:51', items: '1x Espresso, 2x Double Choc', total: 15.00, method: 'EFTPOS', status: 'Completed' },
  { id: 'TX-8942', time: '14:48', items: '1x Iced Latte', total: 6.50, method: 'EFTPOS', status: 'Completed' },
  { id: 'TX-8941', time: '14:42', items: '4x Build-a-Box (12)', total: 210.00, method: 'Split', status: 'Completed' },
  { id: 'TX-8940', time: '14:35', items: '1x Piccolo', total: 4.50, method: 'Cash', status: 'Completed' },
];

export function PosTerminal() {
  const [search, setSearch] = useState('');

  const renderPaymentBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'EFTPOS':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: BLUE_DIM, color: BLUE }}>
            <CreditCard size={12} /> EFTPOS
          </div>
        );
      case 'Cash':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: GREEN_DIM, color: GREEN }}>
            <Banknote size={12} /> CASH
          </div>
        );
      case 'Split':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: PURPLE_DIM, color: PURPLE }}>
            <SplitSquareHorizontal size={12} /> SPLIT
          </div>
        );
    }
  };

  const renderStatusBadge = (status: TxStatus) => {
    switch (status) {
      case 'Voided':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: RED_DIM, color: RED }}>
            <XOctagon size={12} /> VOIDED
          </div>
        );
      case 'Refunded':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: AMBER_DIM, color: AMBER }}>
            <AlertTriangle size={12} /> REFUNDED
          </div>
        );
      case 'In Progress':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: GOLD_DIM, color: GOLD }}>
            <Clock size={12} /> IN PROGRESS
          </div>
        );
      case 'Completed':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: GREEN_DIM, color: GREEN }}>
            <CheckCircle2 size={12} /> COMPLETED
          </div>
        );
    }
  };

  const renderTxRow = (tx: Transaction) => (
    <div key={tx.id} className="flex flex-col p-4 mb-2 rounded-xl" style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: TEXT }}>{tx.id}</span>
          <span className="text-xs font-mono" style={{ color: TEXT_MUTED }}>{tx.time}</span>
        </div>
        <div className="text-lg font-bold" style={{ color: TEXT }}>${tx.total.toFixed(2)}</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm line-clamp-1 flex-1 mr-4" style={{ color: TEXT_MUTED }}>{tx.items}</div>
        <div className="flex items-center gap-2">
          {renderStatusBadge(tx.status)}
          {renderPaymentBadge(tx.method)}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t" style={{ borderColor: BORDER }}>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: TEXT_MUTED }}>
          <Printer size={14} /> Reprint
        </button>
        {tx.status === 'Completed' && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: RED }}>
            <XOctagon size={14} /> Void
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Shell activeTab="pos" title="POS Terminal" subtitle="Till performance & live transactions">
      
      {/* Date & Search */}
      <div className="px-5 py-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: SURFACE }}>
            <button className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}>
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 text-sm font-bold" style={{ color: TEXT }}>Today, 24 Jun</div>
            <button className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} disabled>
              <ChevronRight size={16} className="opacity-50" />
            </button>
          </div>
          <button className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: SURFACE_RAISED, color: TEXT }}>
            Open Register
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
          <input 
            type="text" 
            placeholder="Search receipt #, item, or amount..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none placeholder:text-opacity-50"
            style={{ 
              background: SURFACE, 
              border: `1px solid ${BORDER}`, 
              color: TEXT,
            }}
          />
        </div>
      </div>

      {/* Hero Stat */}
      <div className="px-5 py-2">
        <div className="p-6 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden" style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}>
          <div className="absolute top-0 w-full h-1" style={{ background: GOLD }} />
          <span className="text-sm font-bold tracking-wider uppercase mb-1" style={{ color: GOLD }}>Total Revenue</span>
          <span className="text-5xl font-black tracking-tight" style={{ color: TEXT }}>$4,285.50</span>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm" style={{ color: TEXT_MUTED }}>145 tickets</span>
            <span className="w-1 h-1 rounded-full" style={{ background: BORDER }} />
            <span className="text-sm flex items-center gap-1" style={{ color: GREEN }}>
              <TrendingUp size={14} /> +12% vs yesterday
            </span>
          </div>
        </div>
      </div>

      {/* At a glance */}
      <div className="px-5 py-2 grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl flex flex-col" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Avg Ticket</span>
          <span className="text-xl font-bold" style={{ color: TEXT }}>$29.55</span>
        </div>
        <div className="p-4 rounded-xl flex flex-col" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Top Seller</span>
          <span className="text-sm font-bold mt-1 line-clamp-1" style={{ color: TEXT }}>Build-a-Box (6)</span>
        </div>
        <div className="col-span-2 p-4 rounded-xl flex flex-col gap-2" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <div className="flex justify-between text-xs font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
            <span>EFTPOS (78%)</span>
            <span>Cash (22%)</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden flex">
            <div className="h-full" style={{ background: BLUE, width: '78%' }} />
            <div className="h-full" style={{ background: GREEN, width: '22%' }} />
          </div>
        </div>
      </div>

      {/* Issues */}
      {search === '' && ISSUES.length > 0 && (
        <>
          <SectionLabel right={<span className="text-xs font-bold" style={{ color: RED }}>{ISSUES.length} Requires Review</span>}>
            Issues
          </SectionLabel>
          <div className="px-5">
            {ISSUES.map(renderTxRow)}
          </div>
        </>
      )}

      {/* In Progress */}
      {search === '' && IN_PROGRESS.length > 0 && (
        <>
          <SectionLabel right={<span className="text-xs font-bold" style={{ color: GOLD }}>{IN_PROGRESS.length} Active</span>}>
            In Progress
          </SectionLabel>
          <div className="px-5">
            {IN_PROGRESS.map(renderTxRow)}
          </div>
        </>
      )}

      {/* Completed */}
      <SectionLabel>History</SectionLabel>
      <div className="px-5 pb-6">
        {COMPLETED.map(renderTxRow)}
        <button className="w-full py-3 rounded-xl text-sm font-bold mt-2" style={{ background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
          Load More
        </button>
      </div>
    </Shell>
  );
}
