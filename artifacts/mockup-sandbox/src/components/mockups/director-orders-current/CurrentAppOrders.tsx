import React from 'react';
import { ShoppingBag, DollarSign, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import './_group.css';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: '#F3F4F6', text: '#6B7280' },
  being_prepared: { bg: '#DBEAFE', text: '#1E40AF' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Pending',
  being_prepared: 'Preparing',
  ready_for_pickup: 'Ready',
  completed: 'Done',
  cancelled: 'Cancelled',
};

const MOCK_LIVE_ORDERS = [
  {
    id: '1',
    orderNumber: 'A7B2C',
    status: 'being_prepared',
    customerName: 'Sarah Jenkins',
    items: '6× Classic Choc Chip',
    totalCents: 2400,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: '2',
    orderNumber: 'D9E4F',
    status: 'received',
    customerName: 'Marcus Wong',
    items: '12× Assorted Box',
    totalCents: 4500,
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
];

const MOCK_HISTORY = [
  {
    dateLabel: 'Today · Wed 25 Jun',
    revenue: 12450,
    count: 8,
    orders: [
      { id: 'h1', orderNumber: 'T9821', status: 'completed', totalCents: 3200, createdAt: '10:45 AM', customerName: 'Alice Smith', items: '6× Macadamia White' },
      { id: 'h2', orderNumber: 'T9820', status: 'completed', totalCents: 1800, createdAt: '09:30 AM', customerName: 'Bob Brown', items: '1× Coffee, 2× Choc Chip' },
      { id: 'h3', orderNumber: 'T9819', status: 'cancelled', totalCents: 4500, createdAt: '08:15 AM', customerName: 'Charlie Davis', items: '12× Party Pack' },
    ]
  },
  {
    dateLabel: 'Yesterday · Tue 24 Jun',
    revenue: 45200,
    count: 24,
    orders: [
      { id: 'h4', orderNumber: 'T9790', status: 'completed', totalCents: 2400, createdAt: '4:20 PM', customerName: 'Diana Prince', items: '6× Triple Choc' },
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

function LiveOrderCard({ order }: { order: any }) {
  const col = STATUS_COLORS[order.status];
  const elapsed = '12m'; // Hardcoded for mockup
  return (
    <div className="w-[200px] bg-white rounded-xl p-3 border border-[#E5E7EB] border-t-[3px] shadow-sm flex-shrink-0" style={{ borderTopColor: col.text }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-bold text-[#1C1C1E]">#{order.orderNumber}</span>
        <div className="px-1.5 py-0.5 rounded-lg text-[9px] font-bold" style={{ backgroundColor: col.bg, color: col.text }}>
          {STATUS_LABEL[order.status]}
        </div>
      </div>
      <div className="text-[11px] text-[#8E8E93] mb-1 truncate">{order.customerName}</div>
      <div className="text-[11px] text-[#8E8E93] mb-1.5 truncate">{order.items}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[#8E8E93]">
          <Clock size={10} />
          <span className="text-[10px]">{elapsed}</span>
        </div>
        <span className="text-xs font-bold text-[#1493FF]">${(order.totalCents / 100).toFixed(2)}</span>
      </div>
    </div>
  );
}

function AnalyticsStrip() {
  const tiles = [
    { label: 'Orders', value: '32', icon: ShoppingBag, color: '#1493FF' },
    { label: 'Avg ticket', value: '$24.50', icon: DollarSign, color: '#F59E0B' },
    { label: 'Fulfilment', value: '98%', icon: CheckCircle, color: '#22C55E' },
  ];
  return (
    <div className="flex gap-2.5 px-3.5 py-2.5 bg-[#EFF6FF]">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex-1 bg-white rounded-xl p-2.5 border border-[#E5E7EB] flex flex-col items-center gap-0.5 shadow-sm">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: `${tile.color}18` }}>
            <tile.icon size={12} color={tile.color} />
          </div>
          <span className="text-[13px] font-bold text-[#1C1C1E]">{tile.value}</span>
          <span className="text-[9px] text-[#8E8E93] font-medium uppercase tracking-wider">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: any }) {
  const col = STATUS_COLORS[order.status];
  return (
    <div className="bg-white rounded-2xl p-3.5 mb-2 border border-[#E5E7EB] shadow-sm flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#1C1C1E]">#{order.orderNumber}</span>
            <div className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: col.bg, color: col.text }}>
              {STATUS_LABEL[order.status]}
            </div>
          </div>
          <span className="text-sm font-bold text-[#1C1C1E]">${(order.totalCents / 100).toFixed(2)}</span>
        </div>
        <div className="text-xs text-[#1C1C1E] font-medium truncate mb-0.5">{order.customerName}</div>
        <div className="text-[11px] text-[#8E8E93] truncate">{order.items}</div>
      </div>
      <ChevronRight size={16} className="text-[#1493FF]" />
    </div>
  );
}

export function CurrentAppOrders() {
  return (
    <div className="director-phone-frame min-h-screen flex flex-col">
      <Header activeTab="app" />
      
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Live Strip */}
        <div className="p-3.5">
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
            <span className="text-[13px] font-bold text-[#1C1C1E]">Live — 2 active</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-3.5 px-3.5 no-scrollbar">
            {MOCK_LIVE_ORDERS.map(order => (
              <LiveOrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>

        <AnalyticsStrip />

        {/* Filters */}
        <div className="px-3.5 py-2 overflow-x-auto flex gap-2 no-scrollbar">
          {['All', 'Active', 'Scheduled', 'Pending', 'Preparing', 'Ready', 'Done'].map((label, i) => (
            <div 
              key={label}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
                i === 1 ? 'bg-[#1493FF] border-[#1493FF] text-white' : 'bg-white border-[#E5E7EB] text-[#8E8E93]'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* History */}
        <div className="px-3.5 pt-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Today's App Orders</h2>
            <span className="text-[10px] bg-[#1493FF]/10 text-[#1493FF] px-2 py-0.5 rounded-full font-bold">8</span>
          </div>
          
          {MOCK_HISTORY.map((group) => (
            <div key={group.dateLabel} className="mb-6">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">{group.dateLabel}</span>
                <div className="bg-[#1493FF]/10 px-2 py-0.5 rounded-lg">
                  <span className="text-xs font-bold text-[#1493FF]">${(group.revenue / 100).toFixed(2)}</span>
                </div>
              </div>
              {group.orders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
