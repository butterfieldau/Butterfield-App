import React from 'react';
import { Clock, CheckCircle2, AlertCircle, ShoppingBag, TrendingUp, Search } from 'lucide-react';
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

// Mock Data
const IN_FLIGHT_ORDERS = [
  { id: '#12492', customer: 'Sarah Jenkins', summary: '3× Choc Chip, 2× Flat White', time: '18m', total: '$28.50', status: 'ready', urgency: 'high' },
  { id: '#12493', customer: 'Michael Chen', summary: '1× Macadamia, 1× Cold Brew', time: '8m', total: '$12.00', status: 'preparing', urgency: 'medium' },
  { id: '#12494', customer: 'Emma Watson', summary: '6× Assorted Box', time: '2m', total: '$34.00', status: 'pending', urgency: 'low' },
];

const HISTORY_TODAY = [
  { id: '#12491', customer: 'David Kim', status: 'Completed', total: '$18.50', time: '10:42 AM' },
  { id: '#12490', customer: 'Lisa Wang', status: 'Completed', total: '$24.00', time: '10:15 AM' },
  { id: '#12489', customer: 'James Smith', status: 'Cancelled', total: '$14.00', time: '09:30 AM' },
];

const HISTORY_YESTERDAY = [
  { id: '#12488', customer: 'Robert Taylor', status: 'Completed', total: '$42.50', time: '4:15 PM' },
  { id: '#12487', customer: 'Anna Lee', status: 'Completed', total: '$16.00', time: '2:30 PM' },
  { id: '#12486', customer: 'Tom Wilson', status: 'Completed', total: '$21.00', time: '1:10 PM' },
];

export function AppOrders() {
  return (
    <Shell activeTab="app" title="Live Orders" subtitle="Overview of all mobile app orders">
      
      {/* Hero Stat */}
      <div className="px-5 pt-8 pb-6 border-b" style={{ borderColor: BORDER }}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: AMBER }}>
            Needs Attention
          </div>
          <div className="text-7xl font-bold tracking-tighter mb-2" style={{ color: TEXT }}>
            3
          </div>
          <div className="text-lg font-medium" style={{ color: TEXT_MUTED }}>
            Orders in flight
          </div>
          <div className="mt-4 px-4 py-2 rounded-full flex items-center gap-2" style={{ background: SURFACE_RAISED }}>
            <TrendingUp size={16} color={GREEN} />
            <span className="font-medium" style={{ color: TEXT }}>$1,248.50</span>
            <span className="text-sm" style={{ color: TEXT_FAINT }}>revenue today</span>
          </div>
        </div>
      </div>

      {/* In-Flight Orders Strip */}
      <SectionLabel 
        right={
          <div className="flex gap-2">
            <FilterChip label="All" active />
            <FilterChip label="Pending" />
            <FilterChip label="Ready" />
          </div>
        }
      >
        In-Flight Queue
      </SectionLabel>
      
      <div className="px-5 pb-6 overflow-x-auto flex gap-4 snap-x">
        {IN_FLIGHT_ORDERS.map((order, idx) => {
          let timeColor = TEXT_MUTED;
          let bgColor = SURFACE;
          let borderColor = BORDER;
          
          if (order.urgency === 'high') {
            timeColor = RED;
            bgColor = RED_DIM;
            borderColor = 'rgba(248, 113, 113, 0.3)';
          } else if (order.urgency === 'medium') {
            timeColor = AMBER;
          }

          let StatusIcon = Clock;
          if (order.status === 'ready') StatusIcon = CheckCircle2;
          if (order.status === 'pending') StatusIcon = AlertCircle;

          return (
            <div 
              key={idx} 
              className="flex-none w-72 rounded-xl p-4 snap-start border"
              style={{ background: bgColor, borderColor }}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-bold text-lg" style={{ color: TEXT }}>{order.id}</div>
                  <div className="text-sm" style={{ color: TEXT_MUTED }}>{order.customer}</div>
                </div>
                <div className="flex items-center gap-1.5 font-mono font-medium text-lg" style={{ color: timeColor }}>
                  <StatusIcon size={16} />
                  {order.time}
                </div>
              </div>
              <div className="text-sm mb-4 min-h-[40px]" style={{ color: TEXT }}>
                {order.summary}
              </div>
              <div className="flex justify-between items-end">
                <div className="font-bold" style={{ color: TEXT }}>{order.total}</div>
                <div className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider" 
                     style={{ 
                       background: order.status === 'ready' ? GREEN_DIM : SURFACE_RAISED, 
                       color: order.status === 'ready' ? GREEN : TEXT_MUTED 
                     }}>
                  {order.status}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Supporting KPIs */}
      <div className="px-5 grid grid-cols-3 gap-3 mb-8">
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Total Orders</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>142</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Avg Ticket</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>$18.40</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Fulfillment</div>
          <div className="text-xl font-bold" style={{ color: GREEN }}>98.5%</div>
        </div>
      </div>

      {/* Order History */}
      <SectionLabel right={<Search size={16} color={TEXT_MUTED} />}>
        Order History
      </SectionLabel>

      <div className="px-5 flex flex-col gap-6">
        {/* Today */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold" style={{ color: TEXT }}>Today</h3>
            <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>$1,248.50</span>
          </div>
          <div className="flex flex-col gap-2">
            {HISTORY_TODAY.map((order, idx) => (
              <div key={idx} className="p-3 rounded-lg border flex items-center justify-between" style={{ background: SURFACE, borderColor: BORDER }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: SURFACE_RAISED }}>
                    <ShoppingBag size={18} color={TEXT_MUTED} />
                  </div>
                  <div>
                    <div className="font-bold text-sm" style={{ color: TEXT }}>{order.id} <span className="font-normal" style={{ color: TEXT_FAINT }}>· {order.customer}</span></div>
                    <div className="text-xs mt-0.5" style={{ color: TEXT_FAINT }}>{order.time}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-bold text-sm" style={{ color: TEXT }}>{order.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" 
                       style={{ 
                         background: order.status === 'Completed' ? GREEN_DIM : RED_DIM, 
                         color: order.status === 'Completed' ? GREEN : RED 
                       }}>
                    {order.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Yesterday */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold" style={{ color: TEXT }}>Yesterday</h3>
            <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>$2,840.00</span>
          </div>
          <div className="flex flex-col gap-2">
            {HISTORY_YESTERDAY.map((order, idx) => (
              <div key={idx} className="p-3 rounded-lg border flex items-center justify-between" style={{ background: SURFACE, borderColor: BORDER }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: SURFACE_RAISED }}>
                    <ShoppingBag size={18} color={TEXT_MUTED} />
                  </div>
                  <div>
                    <div className="font-bold text-sm" style={{ color: TEXT }}>{order.id} <span className="font-normal" style={{ color: TEXT_FAINT }}>· {order.customer}</span></div>
                    <div className="text-xs mt-0.5" style={{ color: TEXT_FAINT }}>{order.time}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-bold text-sm" style={{ color: TEXT }}>{order.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" 
                       style={{ background: GREEN_DIM, color: GREEN }}>
                    {order.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
    </Shell>
  );
}
