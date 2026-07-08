import React from 'react';
import { DollarSign, AlertCircle, BarChart2, Truck, ChevronRight, Plus } from 'lucide-react';
import './_group.css';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  processing: { bg: '#DBEAFE', text: '#1E40AF' },
  dispatched: { bg: '#DCFCE7', text: '#166534' },
  delivered: { bg: '#DCFCE7', text: '#166534' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

const INV_COLORS: Record<string, { bg: string; text: string }> = {
  paid: { bg: '#DCFCE7', text: '#166534' },
  pending: { bg: '#FEF3C7', text: '#92400E' },
  overdue: { bg: '#FEE2E2', text: '#991B1B' },
};

const MOCK_WHOLESALE_ORDERS = [
  {
    label: 'This week',
    items: [
      {
        id: 'w1',
        orderNumber: 'PO-9821-X',
        customerName: 'The Morning Café',
        status: 'dispatched',
        totalCents: 24500,
        scheduledDate: '2025-06-26',
        isPaid: false,
        isOverdue: false,
        itemCount: 48,
        exGstCents: 22273,
      },
      {
        id: 'w2',
        orderNumber: 'WS-7721',
        customerName: 'Harbourside Deli',
        status: 'processing',
        totalCents: 11200,
        scheduledDate: '2025-06-24',
        isPaid: false,
        isOverdue: true,
        itemCount: 24,
        exGstCents: 10182,
      }
    ]
  },
  {
    label: 'Last week',
    items: [
      {
        id: 'w3',
        orderNumber: 'PO-9750-A',
        customerName: 'Sweet Tooth Bakery',
        status: 'delivered',
        totalCents: 38500,
        scheduledDate: '2025-06-18',
        isPaid: true,
        isOverdue: false,
        itemCount: 72,
        exGstCents: 35000,
      }
    ]
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

function KpiTiles() {
  const tiles = [
    { label: 'Outstanding', value: '$357.00', icon: DollarSign, color: '#F59E0B' },
    { label: 'Overdue', value: '1', icon: AlertCircle, color: '#EF4444' },
    { label: 'Avg order', value: '$182.40', icon: BarChart2, color: '#1493FF' },
  ];
  return (
    <div className="flex gap-2.5 px-3.5 py-3.5 bg-[#EFF6FF]">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex-1 bg-white rounded-2xl p-3 border border-[#E5E7EB] flex flex-col items-center gap-1 shadow-sm">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-0.5" style={{ backgroundColor: `${tile.color}18` }}>
            <tile.icon size={14} color={tile.color} />
          </div>
          <span className="text-sm font-bold text-[#1C1C1E]">{tile.value}</span>
          <span className="text-[10px] text-[#8E8E93] font-semibold uppercase tracking-wider">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}

function WholesaleOrderCard({ order }: { order: any }) {
  const statusColors = STATUS_COLORS[order.status] || { bg: '#F3F4F6', text: '#6B7280' };
  const invStatus = order.isPaid ? 'paid' : (order.isOverdue ? 'overdue' : 'pending');
  const invCfg = INV_COLORS[invStatus];
  const borderColor = order.isOverdue ? '#F59E0B' : (order.status === 'dispatched' || order.status === 'delivered' ? '#22C55E' : '#1493FF80');

  return (
    <div className="bg-white rounded-2xl p-3.5 mb-2.5 border border-[#E5E7EB] shadow-sm flex flex-col gap-2.5 relative" style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div className="flex justify-between items-start gap-2.5">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[15px] font-bold text-[#1C1C1E]">#{order.orderNumber}</span>
            {order.isOverdue && (
              <div className="bg-[#FEF2F2] px-1.5 py-0.5 rounded-lg text-[9px] font-bold text-[#991B1B] tracking-wider uppercase">OVERDUE</div>
            )}
          </div>
          <div className="text-[13px] font-medium text-[#8E8E93] truncate">{order.customerName}</div>
          <div className="flex items-center gap-1 mt-1">
            <Truck size={11} className={order.isOverdue ? 'text-[#F59E0B]' : 'text-[#8E8E93]'} />
            <span className={`text-[11px] font-medium ${order.isOverdue ? 'text-[#F59E0B]' : 'text-[#8E8E93]'}`}>
              {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="px-2 py-0.5 rounded-xl border border-black/10 text-[11px] font-semibold" style={{ backgroundColor: statusColors.bg, color: statusColors.text }}>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </div>
          <span className="text-[15px] font-bold text-[#1493FF]">${(order.totalCents / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="h-px bg-[#E5E7EB] w-full" />

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#8E8E93]">
          {order.itemCount} items · ex-GST ${(order.exGstCents / 100).toFixed(2)}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold uppercase" style={{ backgroundColor: invCfg.bg, color: invCfg.text }}>
            {invStatus}
          </div>
          <ChevronRight size={12} className="text-[#1493FF]" />
        </div>
      </div>
    </div>
  );
}

export function CurrentWholesale() {
  return (
    <div className="director-phone-frame min-h-screen flex flex-col">
      <Header activeTab="wholesale" />
      
      <div className="flex-1 overflow-y-auto pb-32">
        <KpiTiles />

        {/* Filters */}
        <div className="bg-[#EFF6FF] border-b border-[#E5E7EB] px-3.5 py-2.5 overflow-x-auto flex gap-2 no-scrollbar">
          {['All', 'Pending', 'Confirmed', 'Dispatched', 'Overdue', 'Invoiced'].map((label, i) => (
            <div 
              key={label}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
                i === 0 ? 'bg-[#1493FF] border-[#1493FF] text-white' : 'bg-[#EFF6FF] border-[#E5E7EB] text-[#8E8E93]'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-3.5 pt-2">
          {MOCK_WHOLESALE_ORDERS.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="flex items-center gap-2 py-2.5">
                <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider flex-1">{section.label}</span>
                <div className="bg-[#1493FF]/10 px-1.5 py-0.5 rounded-lg">
                  <span className="text-[11px] font-bold text-[#1493FF]">{section.items.length}</span>
                </div>
              </div>
              {section.items.map(order => (
                <WholesaleOrderCard key={order.id} order={order} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-7 right-5 bg-[#1A2B4A] px-4 py-3 rounded-full flex items-center gap-2 shadow-lg cursor-pointer">
        <Plus size={18} color="white" />
        <span className="text-white font-bold text-sm">New Wholesale Order</span>
      </div>
    </div>
  );
}
