import React, { useState, useMemo } from 'react';
import { Clock, CheckCircle2, AlertCircle, ShoppingBag, TrendingUp, Search, X, ChevronRight } from 'lucide-react';
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
  BRAND, 
  BRAND_DARK, 
  BRAND_TEXT_ON, 
  BRAND_DIM, 
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

// Types
type Urgency = 'high' | 'medium' | 'low';
type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'Cancelled';

interface Order {
  id: string;
  customer: string;
  summary: string;
  time: string;
  total: string;
  status: OrderStatus;
  urgency?: Urgency;
}

interface HistoryOrder {
  id: string;
  customer: string;
  status: 'Completed' | 'Cancelled';
  total: string;
  time: string;
}

// Mock Data
const INITIAL_IN_FLIGHT_ORDERS: Order[] = [
  { id: '#12492', customer: 'Sarah Jenkins', summary: '3× Choc Chip, 2× Flat White', time: '18m', total: '$28.50', status: 'ready', urgency: 'high' },
  { id: '#12493', customer: 'Michael Chen', summary: '1× Macadamia, 1× Cold Brew', time: '8m', total: '$12.00', status: 'preparing', urgency: 'medium' },
  { id: '#12494', customer: 'Emma Watson', summary: '6× Assorted Box', time: '2m', total: '$34.00', status: 'pending', urgency: 'low' },
];

const INITIAL_HISTORY_TODAY: HistoryOrder[] = [
  { id: '#12491', customer: 'David Kim', status: 'Completed', total: '$18.50', time: '10:42 AM' },
  { id: '#12490', customer: 'Lisa Wang', status: 'Completed', total: '$24.00', time: '10:15 AM' },
  { id: '#12489', customer: 'James Smith', status: 'Cancelled', total: '$14.00', time: '09:30 AM' },
];

const INITIAL_HISTORY_YESTERDAY: HistoryOrder[] = [
  { id: '#12488', customer: 'Robert Taylor', status: 'Completed', total: '$42.50', time: '4:15 PM' },
  { id: '#12487', customer: 'Anna Lee', status: 'Completed', total: '$16.00', time: '2:30 PM' },
  { id: '#12486', customer: 'Tom Wilson', status: 'Completed', total: '$21.00', time: '1:10 PM' },
];

export function AppOrders() {
  const [inFlightOrders, setInFlightOrders] = useState<Order[]>(INITIAL_IN_FLIGHT_ORDERS);
  const [todayHistory, setTodayHistory] = useState<HistoryOrder[]>(INITIAL_HISTORY_TODAY);
  const [yesterdayHistory, setYesterdayHistory] = useState<HistoryOrder[]>(INITIAL_HISTORY_YESTERDAY);
  
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Ready'>('All');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filteredInFlight = useMemo(() => {
    if (filter === 'All') return inFlightOrders;
    return inFlightOrders.filter(o => o.status.toLowerCase() === filter.toLowerCase());
  }, [inFlightOrders, filter]);

  const filteredToday = useMemo(() => {
    if (!searchQuery) return todayHistory;
    const q = searchQuery.toLowerCase();
    return todayHistory.filter(o => o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  }, [todayHistory, searchQuery]);

  const filteredYesterday = useMemo(() => {
    if (!searchQuery) return yesterdayHistory;
    const q = searchQuery.toLowerCase();
    return yesterdayHistory.filter(o => o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  }, [yesterdayHistory, searchQuery]);

  const selectedOrder = inFlightOrders.find(o => o.id === selectedOrderId);

  const advanceStatus = (orderId: string) => {
    const orderIndex = inFlightOrders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const order = inFlightOrders[orderIndex];
    let nextStatus: OrderStatus = order.status;

    if (order.status === 'pending') nextStatus = 'preparing';
    else if (order.status === 'preparing') nextStatus = 'ready';
    else if (order.status === 'ready') {
      // Complete order
      const newInFlight = [...inFlightOrders];
      newInFlight.splice(orderIndex, 1);
      setInFlightOrders(newInFlight);
      
      const completedOrder: HistoryOrder = {
        id: order.id,
        customer: order.customer,
        status: 'Completed',
        total: order.total,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setTodayHistory([completedOrder, ...todayHistory]);
      setSelectedOrderId(null);
      return;
    }

    const newInFlight = [...inFlightOrders];
    newInFlight[orderIndex] = { ...order, status: nextStatus };
    setInFlightOrders(newInFlight);
  };

  const revenueToday = todayHistory.reduce((acc, curr) => {
    if (curr.status === 'Completed') {
      return acc + parseFloat(curr.total.replace('$', ''));
    }
    return acc;
  }, 0);

  const revenueYesterday = yesterdayHistory.reduce((acc, curr) => {
    if (curr.status === 'Completed') {
      return acc + parseFloat(curr.total.replace('$', ''));
    }
    return acc;
  }, 0);

  return (
    <Shell activeTab="app" title="Live Orders" subtitle="Overview of all mobile app orders">
      
      {/* Hero Stat */}
      <div className="px-5 pt-8 pb-6 border-b relative overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: AMBER }}>
            Needs Attention
          </div>
          <div className="text-7xl font-bold tracking-tighter mb-2" style={{ color: TEXT }}>
            {inFlightOrders.length}
          </div>
          <div className="text-lg font-medium" style={{ color: TEXT_MUTED }}>
            Orders in flight
          </div>
          <div className="mt-4 px-4 py-2 rounded-full flex items-center gap-2" style={{ background: SURFACE_RAISED }}>
            <TrendingUp size={16} color={GREEN} />
            <span className="font-medium" style={{ color: TEXT }}>${revenueToday.toFixed(2)}</span>
            <span className="text-sm" style={{ color: TEXT_FAINT }}>revenue today</span>
          </div>
        </div>
      </div>

      {/* In-Flight Orders Strip */}
      <SectionLabel 
        right={
          <div className="flex gap-2">
            {(['All', 'Pending', 'Ready'] as const).map(f => (
              <div key={f} onClick={() => setFilter(f)} className="cursor-pointer">
                <FilterChip label={f} active={filter === f} />
              </div>
            ))}
          </div>
        }
      >
        In-Flight Queue
      </SectionLabel>
      
      <div className="px-5 pb-6 overflow-x-auto flex gap-4 snap-x no-scrollbar">
        {filteredInFlight.map((order, idx) => {
          let timeColor = TEXT_MUTED;
          let bgColor = SURFACE;
          let borderColor = BORDER;
          
          if (order.urgency === 'high') {
            timeColor = RED;
            bgColor = RED_DIM;
            borderColor = 'rgba(96, 165, 250, 0.4)';
          } else if (order.urgency === 'medium') {
            timeColor = AMBER;
          }

          let StatusIcon = Clock;
          if (order.status === 'ready') StatusIcon = CheckCircle2;
          if (order.status === 'pending') StatusIcon = AlertCircle;

          return (
            <div 
              key={order.id} 
              className="flex-none w-72 rounded-xl p-4 snap-start border cursor-pointer active:scale-[0.98] transition-transform"
              style={{ background: bgColor, borderColor }}
              onClick={() => setSelectedOrderId(order.id)}
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
              <div className="text-sm mb-4 min-h-[40px] line-clamp-2" style={{ color: TEXT }}>
                {order.summary}
              </div>
              <div className="flex justify-between items-end">
                <div className="font-bold" style={{ color: TEXT }}>{order.total}</div>
                <div className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider" 
                     style={{ 
                       background: order.status === 'ready' ? GREEN_DIM : 
                                  order.status === 'preparing' ? BLUE_DIM : SURFACE_RAISED, 
                       color: order.status === 'ready' ? GREEN : 
                              order.status === 'preparing' ? BLUE : TEXT_MUTED 
                     }}>
                  {order.status}
                </div>
              </div>
            </div>
          );
        })}
        {filteredInFlight.length === 0 && (
          <div className="flex-none w-full py-12 text-center" style={{ color: TEXT_FAINT }}>
            No {filter !== 'All' ? filter.toLowerCase() : ''} orders in flight
          </div>
        )}
      </div>

      {/* Supporting KPIs */}
      <div className="px-5 grid grid-cols-3 gap-3 mb-8">
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Total Orders</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>{todayHistory.length + yesterdayHistory.length + inFlightOrders.length}</div>
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
      <SectionLabel 
        right={
          <div className="flex items-center gap-2">
            {isSearchOpen && (
              <input 
                autoFocus
                type="text"
                placeholder="Search..."
                className="bg-transparent border-b border-gray-700 focus:border-brand-500 outline-none text-xs py-1"
                style={{ color: TEXT, borderColor: BORDER }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            )}
            <button 
              onClick={() => {
                setIsSearchOpen(!isSearchOpen);
                if (isSearchOpen) setSearchQuery('');
              }}
              className="p-1"
            >
              {isSearchOpen ? <X size={16} color={TEXT_MUTED} /> : <Search size={16} color={TEXT_MUTED} />}
            </button>
          </div>
        }
      >
        Order History
      </SectionLabel>

      <div className="px-5 flex flex-col gap-6">
        {/* Today */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: TEXT_FAINT }}>Today</h3>
            <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>${revenueToday.toFixed(2)}</span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredToday.map((order) => (
              <div key={order.id} className="p-3 rounded-lg border flex items-center justify-between" style={{ background: SURFACE, borderColor: BORDER }}>
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
            {filteredToday.length === 0 && (
              <div className="py-4 text-center text-xs" style={{ color: TEXT_FAINT }}>No orders found</div>
            )}
          </div>
        </div>

        {/* Yesterday */}
        {(filteredYesterday.length > 0 || !searchQuery) && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: TEXT_FAINT }}>Yesterday</h3>
              {!searchQuery && <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>${revenueYesterday.toFixed(2)}</span>}
            </div>
            <div className="flex flex-col gap-2">
              {filteredYesterday.map((order) => (
                <div key={order.id} className="p-3 rounded-lg border flex items-center justify-between" style={{ background: SURFACE, borderColor: BORDER }}>
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
                         style={{ background: order.status === 'Completed' ? GREEN_DIM : RED_DIM, color: order.status === 'Completed' ? GREEN : RED }}>
                      {order.status}
                    </div>
                  </div>
                </div>
              ))}
              {searchQuery && filteredYesterday.length === 0 && (
                <div className="py-4 text-center text-xs" style={{ color: TEXT_FAINT }}>No orders found</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal / Drawer Overlay */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedOrderId(null)}
          />
          <div 
            className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border-t border-x sm:border overflow-hidden animate-in slide-in-from-bottom duration-300"
            style={{ background: SURFACE_RAISED, borderColor: BORDER }}
          >
            {/* Modal Handle (for mobile feel) */}
            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-12 h-1.5 rounded-full" style={{ background: BORDER }} />
            </div>

            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: TEXT }}>Order {selectedOrder.id}</h2>
                  <p className="text-lg" style={{ color: TEXT_MUTED }}>{selectedOrder.customer}</p>
                </div>
                <button 
                  onClick={() => setSelectedOrderId(null)}
                  className="p-2 rounded-full"
                  style={{ background: SURFACE, color: TEXT_MUTED }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Items */}
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: TEXT_FAINT }}>
                    Order Items
                  </div>
                  <div className="flex flex-col gap-3">
                    {selectedOrder.summary.split(', ').map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: BORDER }}>
                        <span className="font-medium" style={{ color: TEXT }}>{item}</span>
                        <span className="text-sm" style={{ color: TEXT_MUTED }}>$12.00</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl border" style={{ background: SURFACE, borderColor: BORDER }}>
                    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: TEXT_FAINT }}>Time Elapsed</div>
                    <div className="text-lg font-mono font-bold" style={{ color: AMBER }}>{selectedOrder.time}</div>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ background: SURFACE, borderColor: BORDER }}>
                    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: TEXT_FAINT }}>Total Value</div>
                    <div className="text-lg font-bold" style={{ color: TEXT }}>{selectedOrder.total}</div>
                  </div>
                </div>

                {/* Status Section */}
                <div>
                   <div className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: TEXT_FAINT }}>
                    Current Status
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl border" style={{ background: SURFACE, borderColor: BORDER }}>
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ 
                        background: selectedOrder.status === 'ready' ? GREEN_DIM : 
                                   selectedOrder.status === 'preparing' ? BLUE_DIM : 
                                   selectedOrder.status === 'pending' ? AMBER_DIM : SURFACE_RAISED 
                      }}
                    >
                      {selectedOrder.status === 'ready' ? <CheckCircle2 size={20} color={GREEN} /> : 
                       selectedOrder.status === 'preparing' ? <Clock size={20} color={BLUE} /> : 
                       <AlertCircle size={20} color={AMBER} />}
                    </div>
                    <div>
                      <div className="font-bold capitalize" style={{ color: TEXT }}>{selectedOrder.status}</div>
                      <div className="text-xs" style={{ color: TEXT_FAINT }}>
                        {selectedOrder.status === 'pending' ? 'Order is waiting to be accepted' :
                         selectedOrder.status === 'preparing' ? 'Staff is currently preparing the items' :
                         'Order is ready for pickup'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => advanceStatus(selectedOrder.id)}
                  className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  style={{ background: BRAND, color: BRAND_TEXT_ON }}
                >
                  {selectedOrder.status === 'ready' ? 'Complete Order' : 'Advance Status'}
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </Shell>
  );
}

