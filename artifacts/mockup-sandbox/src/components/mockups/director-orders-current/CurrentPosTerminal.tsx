import React from 'react';
import { ChevronLeft, ChevronRight, Search, Monitor, User, Printer, XCircle } from 'lucide-react';
import './_group.css';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: '#DCFCE7', text: '#166534' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  refunded: { bg: '#F3E8FF', text: '#6B21A8' },
  voided: { bg: '#FEE2E2', text: '#991B1B' },
};

const MOCK_TRANSACTIONS = [
  {
    id: 'p1',
    orderNumber: 'POS-7821',
    status: 'completed',
    totalCents: 1450,
    createdAt: '12:45 PM',
    operatorName: 'Alex J.',
    paymentMethod: 'eftpos',
    items: '1× Large Latte, 2× Choc Chip Cookie',
  },
  {
    id: 'p2',
    orderNumber: 'POS-7820',
    status: 'received',
    totalCents: 850,
    createdAt: '12:40 PM',
    operatorName: 'Alex J.',
    paymentMethod: 'cash',
    items: '1× Flat White, 1× Brownie',
  },
  {
    id: 'p3',
    orderNumber: 'POS-7819',
    status: 'voided',
    totalCents: 2200,
    createdAt: '12:30 PM',
    operatorName: 'Alex J.',
    paymentMethod: 'eftpos',
    items: '4× Assorted Cookies',
  }
];

function Header({ activeTab }: { activeTab: 'app' | 'wholesale' | 'pos' }) {
  return (
    <div className="bg-[#1A2B4A] pt-12 pb-0 px-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-bold text-[#1A2B4A]">B</div>
          <span className="text-white font-bold text-lg">Director</span>
        </div>
        <div className="bg-[#D0312D] text-white text-[10px] font-black px-2 py-0.5 rounded tracking-tighter">DIRECTOR</div>
      </div>
      <div className="flex border-b border-white/10">
        {(['app', 'wholesale', 'pos'] as const).map((tab) => (
          <div
            key={tab}
            className={`flex-1 text-center py-3 text-sm font-semibold capitalize transition-colors ${
              activeTab === tab ? 'text-white border-b-2 border-[#1493FF]' : 'text-white/50'
            }`}
          >
            {tab}
          </div>
        ))}
      </div>
    </div>
  );
}

function DateHeader() {
  return (
    <div className="flex items-center bg-white border-b border-[#E5E7EB] px-2 py-2.5">
      <div className="p-2"><ChevronLeft size={22} className="text-[#1A2B4A]" /></div>
      <div className="flex-1 text-center font-semibold text-[15px] text-[#1C1C1E]">Today</div>
      <div className="p-2 opacity-30"><Search size={18} className="text-[#8E8E93]" /></div>
      <div className="p-2 opacity-35"><ChevronRight size={22} className="text-[#E5E7EB]" /></div>
    </div>
  );
}

function SummaryCard() {
  const metrics = [
    { label: 'Revenue', value: '$452.80', color: '#22C55E' },
    { label: 'Tickets', value: '38', color: '#1493FF' },
    { label: 'Avg ticket', value: '$11.91', color: '#F59E0B' },
  ];
  return (
    <div className="bg-[#1A2B4A] rounded-2xl p-3.5 mb-3.5 flex flex-col gap-2.5">
      <h2 className="text-[12px] font-bold text-white/50 uppercase tracking-wider">Today at a glance</h2>
      <div className="flex gap-2.5">
        {metrics.map(m => (
          <div key={m.label} className="flex-1 bg-white/10 rounded-xl p-2.5 flex flex-col items-center gap-0.5">
            <span className="text-sm font-extrabold text-white">{m.value}</span>
            <span className="text-[9px] text-white/50 font-medium uppercase tracking-wider">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="bg-white/10 rounded-lg px-2 py-1 flex items-center gap-1">
          <span className="text-[11px] font-bold text-[#22C55E]">Cash $112.50</span>
        </div>
        <div className="bg-white/10 rounded-lg px-2 py-1 flex items-center gap-1">
          <span className="text-[11px] font-bold text-[#93C5FD]">EFTPOS $340.30</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-white/40">Top item:</span>
        <span className="text-[11px] text-white font-semibold">Choc Chip Cookie (24×)</span>
      </div>
    </div>
  );
}

function TransactionCard({ tx }: { tx: any }) {
  const statusCol = STATUS_COLORS[tx.status] || { bg: '#F3F4F6', text: '#6B7280' };
  const methodColor = tx.paymentMethod === 'cash' ? '#22C55E' : '#1493FF';
  const methodLabel = tx.paymentMethod.toUpperCase();
  const canVoid = !['voided', 'cancelled', 'refunded'].includes(tx.status);

  return (
    <div className="bg-white rounded-2xl p-3.5 mb-2.5 border border-[#E5E7EB] shadow-sm flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[15px] font-bold text-[#1C1C1E]">{tx.orderNumber}</span>
            <div className="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-tight" style={{ backgroundColor: statusCol.bg, color: statusCol.text }}>
              {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
            </div>
          </div>
          <span className="text-xs text-[#8E8E93]">{tx.createdAt}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[17px] font-bold text-[#1C1C1E]">${(tx.totalCents / 100).toFixed(2)}</span>
          <div className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${methodColor}18`, color: methodColor }}>
            {methodLabel}
          </div>
        </div>
      </div>
      <div className="h-px bg-[#E5E7EB] w-full" />
      <div className="text-[13px] text-[#8E8E93] leading-relaxed line-clamp-2">{tx.items}</div>
      <div className="flex items-center gap-1">
        <User size={11} className="text-[#8E8E93]" />
        <span className="text-xs text-[#8E8E93]">{tx.operatorName}</span>
      </div>
      
      <div className="flex gap-2 mt-0.5 pt-2 border-t border-[#E5E7EB]">
        <button className="flex-1 bg-[#1493FF]/10 border border-[#1493FF]/30 text-[#1493FF] rounded-lg py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
          <Printer size={12} />
          Reprint
        </button>
        {canVoid && (
          <button className="flex-1 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded-lg py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
            <XCircle size={12} />
            Void
          </button>
        )}
      </div>
    </div>
  );
}

export function CurrentPosTerminal() {
  return (
    <div className="director-phone-frame min-h-screen flex flex-col">
      <Header activeTab="pos" />
      <DateHeader />
      
      {/* Filter Chips */}
      <div className="bg-[#EFF6FF] border-b border-[#E5E7EB] px-4 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
        {['All', 'EFTPOS', 'Cash', 'Refunded', 'Voided'].map((label, i) => (
          <div 
            key={label}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
              i === 0 ? 'bg-[#1493FF] border-[#1493FF] text-white' : 'bg-[#EFF6FF] border-[#E5E7EB] text-[#8E8E93]'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
        <SummaryCard />

        <div className="flex items-center justify-between mb-3.5 px-1">
          <h2 className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">3 Transactions</h2>
          <div className="bg-[#1493FF]/10 px-2 py-0.5 rounded-lg text-xs font-bold text-[#1493FF]">
            $452.80
          </div>
        </div>

        {MOCK_TRANSACTIONS.map(tx => (
          <TransactionCard key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  );
}
