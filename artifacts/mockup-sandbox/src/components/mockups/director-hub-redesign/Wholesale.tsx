import React, { useState } from 'react';
import { 
  Shell, 
  SectionLabel, 
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
import { Plus, AlertCircle, Clock, Package, FileText, ChevronRight, X, Minus } from 'lucide-react';

const INITIAL_MOCK_ORDERS = [
  {
    id: 'PO-4471',
    company: 'Harborview Cafe Co.',
    deliveryDate: 'Today, 6:00 AM',
    items: 45,
    exGst: 345.50,
    total: 380.05,
    status: 'overdue',
    daysOverdue: 14,
    lineItems: [
      { name: 'Chocolate Chip Cookies (Bulk)', qty: 20, price: 10.00 },
      { name: 'House Blend Coffee Beans (1kg)', qty: 5, price: 29.10 }
    ]
  },
  {
    id: 'PO-4470',
    company: 'The Daily Grind',
    deliveryDate: 'Yesterday, 5:30 AM',
    items: 120,
    exGst: 850.00,
    total: 935.00,
    status: 'overdue',
    daysOverdue: 2,
    lineItems: [
      { name: 'Vanilla Shortbread (Bulk)', qty: 50, price: 8.00 },
      { name: 'Single Origin Espresso (1kg)', qty: 10, price: 45.00 }
    ]
  },
  {
    id: 'PO-4475',
    company: 'Main St Bakery',
    deliveryDate: 'Tomorrow, 5:00 AM',
    items: 60,
    exGst: 420.00,
    total: 462.00,
    status: 'pending',
    lineItems: [
      { name: 'Assorted Cookie Pack', qty: 30, price: 14.00 }
    ]
  },
  {
    id: 'PO-4478',
    company: 'Harborview Cafe Co.',
    deliveryDate: 'Thu, 24 Aug',
    items: 45,
    exGst: 345.50,
    total: 380.05,
    status: 'pending',
    lineItems: [
      { name: 'Macadamia White Choc (Bulk)', qty: 25, price: 11.00 },
      { name: 'Decaf Blend (500g)', qty: 5, price: 14.10 }
    ]
  },
  {
    id: 'PO-4460',
    company: 'Downtown Espresso',
    deliveryDate: 'Mon, 21 Aug',
    items: 85,
    exGst: 610.00,
    total: 671.00,
    status: 'paid',
    lineItems: [
      { name: 'Oatmeal Raisin (Bulk)', qty: 40, price: 9.00 },
      { name: 'Filter Roast Coffee (1kg)', qty: 5, price: 50.00 }
    ]
  }
];

type Order = typeof INITIAL_MOCK_ORDERS[0];
type FilterType = 'All Active' | 'Overdue' | 'Due This Week' | 'Paid';

export function Wholesale() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_MOCK_ORDERS);
  const [activeFilter, setActiveFilter] = useState<FilterType>('All Active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);

  const outstandingBalance = orders.reduce((acc, o) => o.status !== 'paid' ? acc + o.total : acc, 0);
  const overdueOrders = orders.filter(o => o.status === 'overdue');
  const overdueAmount = overdueOrders.reduce((acc, o) => acc + o.total, 0);
  const overdueAccountsCount = new Set(overdueOrders.map(o => o.company)).size;
  const aov = orders.length > 0 ? orders.reduce((acc, o) => acc + o.total, 0) / orders.length : 0;

  const handleUpdateStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));
    setSelectedOrder(null);
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders([newOrder, ...orders]);
    setShowNewOrderModal(false);
  };

  return (
    <Shell activeTab="wholesale" title="Wholesale" subtitle="B2B accounts & orders">
      {/* Hero Stat */}
      <div className="px-5 pt-8 pb-6 border-b" style={{ borderColor: BORDER }}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: TEXT_MUTED }}>
            Outstanding Balance
          </div>
          <div className="text-6xl font-black tracking-tighter mb-2" style={{ color: TEXT }}>
            ${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {overdueAccountsCount > 0 && (
            <div 
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
              style={{ background: RED_DIM, color: RED }}
            >
              <AlertCircle size={16} />
              <span>{overdueAccountsCount} accounts overdue (${overdueAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
            </div>
          )}
        </div>
      </div>

      {/* Sub KPIs */}
      <div className="px-5 pt-6 mb-3 grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Avg Order Value</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>${aov.toFixed(2)}</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: SURFACE, borderColor: BORDER }}>
          <div className="text-xs font-medium mb-1" style={{ color: TEXT_FAINT }}>Orders This Week</div>
          <div className="text-xl font-bold" style={{ color: TEXT }}>24</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['All Active', 'Overdue', 'Due This Week', 'Paid'] as FilterType[]).map(filter => (
          <button 
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex items-center gap-1 transition-colors"
            style={
              activeFilter === filter
                ? { background: BRAND, color: BRAND_TEXT_ON }
                : { background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }
            }
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div>
        {activeFilter === 'All Active' ? (
          <>
            <SectionLabel>Requires Attention</SectionLabel>
            <div className="px-5 flex flex-col gap-2">
              {orders.filter(o => o.status === 'overdue').map(order => (
                <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
              ))}
              {orders.filter(o => o.status === 'overdue').length === 0 && (
                <div className="py-4 text-center text-xs" style={{ color: TEXT_FAINT }}>No overdue orders</div>
              )}
            </div>

            <SectionLabel>Upcoming Deliveries</SectionLabel>
            <div className="px-5 flex flex-col gap-2 pb-24">
              {orders.filter(o => o.status === 'pending').map(order => (
                <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
              ))}
              {orders.filter(o => o.status === 'pending').length === 0 && (
                <div className="py-4 text-center text-xs" style={{ color: TEXT_FAINT }}>No pending orders</div>
              )}
            </div>
          </>
        ) : (
          <div className="px-5 flex flex-col gap-2 pb-24">
            <SectionLabel>{activeFilter}</SectionLabel>
            {orders.filter(o => {
              if (activeFilter === 'Overdue') return o.status === 'overdue';
              if (activeFilter === 'Paid') return o.status === 'paid';
              if (activeFilter === 'Due This Week') return o.status === 'pending'; // Approximation
              return true;
            }).map(order => (
              <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-5 left-5 flex justify-end pointer-events-none">
        <button 
          onClick={() => setShowNewOrderModal(true)}
          className="h-14 px-6 rounded-full flex items-center justify-center gap-2 font-bold text-[15px] shadow-lg pointer-events-auto transition-transform active:scale-95"
          style={{ background: BRAND, color: BRAND_TEXT_ON }}
        >
          <Plus size={20} strokeWidth={3} />
          New Order
        </button>
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <OrderDetailDrawer 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* New Order Modal */}
      {showNewOrderModal && (
        <NewOrderModal 
          onClose={() => setShowNewOrderModal(false)} 
          onAdd={handleAddOrder}
          existingCompanies={Array.from(new Set(orders.map(o => o.company)))}
        />
      )}
    </Shell>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const isOverdue = order.status === 'overdue';
  const isPaid = order.status === 'paid';

  return (
    <div 
      onClick={onClick}
      className="p-3 rounded-lg relative overflow-hidden flex flex-col gap-2 cursor-pointer transition-transform active:scale-[0.98]"
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
            <span className="text-[13px] font-bold" style={{ color: BRAND }}>{order.id}</span>
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

function OrderDetailDrawer({ order, onClose, onUpdateStatus }: { 
  order: Order; 
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" 
        onClick={onClose} 
      />
      <div 
        className="relative w-full max-h-[90vh] overflow-y-auto rounded-t-[32px] pointer-events-auto flex flex-col"
        style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-white/10" />
        </div>
        
        <div className="px-6 pt-4 pb-8 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-[13px] font-bold mb-1" style={{ color: BRAND }}>{order.id}</div>
              <h2 className="text-2xl font-black" style={{ color: TEXT }}>{order.company}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={14} style={{ color: TEXT_MUTED }} />
                <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>{order.deliveryDate}</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full" 
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            >
              <X size={20} style={{ color: TEXT }} />
            </button>
          </div>

          <div className="mb-8">
            <div className="text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: TEXT_MUTED }}>
              Line Items
            </div>
            <div className="flex flex-col gap-3">
              {order.lineItems?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 rounded-xl" style={{ background: SURFACE }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED }}>qty: {item.qty} × ${item.price.toFixed(2)}</div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: TEXT }}>
                    ${(item.qty * item.price).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 p-4 rounded-2xl mb-8" style={{ background: SURFACE }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED }}>Subtotal (ex GST)</span>
              <span style={{ color: TEXT }}>${order.exGst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED }}>GST (10%)</span>
              <span style={{ color: TEXT }}>${(order.total - order.exGst).toFixed(2)}</span>
            </div>
            <div className="h-px my-1" style={{ background: BORDER }} />
            <div className="flex justify-between text-lg font-black">
              <span style={{ color: TEXT }}>Total</span>
              <span style={{ color: BRAND }}>${order.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {order.status === 'overdue' && (
              <>
                <button 
                  onClick={() => onUpdateStatus(order.id, 'paid')}
                  className="w-full h-14 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-[0.98]"
                  style={{ background: GREEN, color: BRAND_TEXT_ON }}
                >
                  Mark as Paid
                </button>
                <button 
                  className="w-full h-14 rounded-2xl font-bold text-base border transition-transform active:scale-[0.98]"
                  style={{ borderColor: BORDER, color: TEXT }}
                >
                  Send Payment Reminder
                </button>
              </>
            )}
            {order.status === 'pending' && (
              <button 
                onClick={() => onUpdateStatus(order.id, 'paid')}
                className="w-full h-14 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-[0.98]"
                style={{ background: BRAND, color: BRAND_TEXT_ON }}
              >
                Mark as Delivered
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewOrderModal({ onClose, onAdd, existingCompanies }: {
  onClose: () => void;
  onAdd: (order: Order) => void;
  existingCompanies: string[];
}) {
  const [company, setCompany] = useState(existingCompanies[0] || '');
  const [deliveryDate, setDeliveryDate] = useState('Tomorrow, 6:00 AM');
  const [items, setItems] = useState([
    { name: 'Chocolate Chip Cookies (Bulk)', qty: 0, price: 10.00 },
    { name: 'House Blend Coffee Beans (1kg)', qty: 0, price: 29.10 },
  ]);

  const subtotal = items.reduce((acc, i) => acc + (i.qty * i.price), 0);
  const total = subtotal * 1.1;

  const handleQty = (idx: number, delta: number) => {
    const newItems = [...items];
    newItems[idx].qty = Math.max(0, newItems[idx].qty + delta);
    setItems(newItems);
  };

  const handleCreate = () => {
    if (subtotal === 0) return;
    const newOrder: Order = {
      id: `PO-${Math.floor(4500 + Math.random() * 500)}`,
      company,
      deliveryDate,
      items: items.reduce((acc, i) => acc + i.qty, 0),
      exGst: subtotal,
      total: total,
      status: 'pending',
      lineItems: items.filter(i => i.qty > 0)
    };
    onAdd(newOrder);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div 
        className="relative w-full max-w-md rounded-[32px] overflow-hidden flex flex-col"
        style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
      >
        <div className="px-6 pt-6 pb-4 border-b flex justify-between items-center" style={{ borderColor: BORDER }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>New Wholesale Order</h2>
          <button onClick={onClose} className="p-1 rounded-full" style={{ color: TEXT_FAINT }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh]">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Company</label>
            <select 
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full h-12 rounded-xl px-4 text-sm font-medium appearance-none"
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT }}
            >
              {existingCompanies.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Other">Other...</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Delivery Date</label>
            <input 
              type="text"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full h-12 rounded-xl px-4 text-sm font-medium"
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Items</label>
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 rounded-xl" style={{ background: SURFACE }}>
                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-sm font-bold truncate" style={{ color: TEXT }}>{item.name}</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>${item.price.toFixed(2)} / unit</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleQty(idx, -1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT }}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-sm font-bold w-4 text-center" style={{ color: TEXT }}>{item.qty}</span>
                  <button 
                    onClick={() => handleQty(idx, 1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t" style={{ borderColor: BORDER, background: SURFACE }}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold" style={{ color: TEXT_MUTED }}>Running Total</div>
            <div className="text-xl font-black" style={{ color: BRAND }}>${total.toFixed(2)}</div>
          </div>
          <button 
            onClick={handleCreate}
            disabled={subtotal === 0}
            className="w-full h-14 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ background: BRAND, color: BRAND_TEXT_ON }}
          >
            Create Order
          </button>
        </div>
      </div>
    </div>
  );
}

