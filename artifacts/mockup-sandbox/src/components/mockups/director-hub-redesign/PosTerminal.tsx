import React, { useState, useMemo } from 'react';
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
  Clock,
  RotateCcw,
  Undo2
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

const MOCK_DATA: Record<string, { issues: Transaction[], inProgress: Transaction[], completed: Transaction[] }> = {
  'Today, 24 Jun': {
    issues: [
      { id: 'TX-8921', time: '14:22', items: '2x Latte, 1x Choc Chip', total: 14.50, method: 'EFTPOS', status: 'Voided' },
      { id: 'TX-8840', time: '10:15', items: '1x Build-a-Box (6)', total: 32.00, method: 'Split', status: 'Refunded' },
    ],
    inProgress: [
      { id: 'TX-8945', time: '14:58', items: '1x Flat White, 1x Macadamia', total: 11.00, method: 'Cash', status: 'In Progress' },
      { id: 'TX-8944', time: '14:56', items: '3x Cappuccino', total: 16.50, method: 'EFTPOS', status: 'In Progress' },
    ],
    completed: [
      { id: 'TX-8943', time: '14:51', items: '1x Espresso, 2x Double Choc', total: 15.00, method: 'EFTPOS', status: 'Completed' },
      { id: 'TX-8942', time: '14:48', items: '1x Iced Latte', total: 6.50, method: 'EFTPOS', status: 'Completed' },
      { id: 'TX-8941', time: '14:42', items: '4x Build-a-Box (12)', total: 210.00, method: 'Split', status: 'Completed' },
      { id: 'TX-8940', time: '14:35', items: '1x Piccolo', total: 4.50, method: 'Cash', status: 'Completed' },
    ]
  },
  'Yesterday, 23 Jun': {
    issues: [],
    inProgress: [],
    completed: [
      { id: 'TX-8701', time: '16:45', items: '2x Latte', total: 9.00, method: 'EFTPOS', status: 'Completed' },
      { id: 'TX-8700', time: '16:30', items: '1x Choc Chip', total: 4.50, method: 'Cash', status: 'Completed' },
    ]
  }
};

const DATES = ['Yesterday, 23 Jun', 'Today, 24 Jun'];

export function PosTerminal() {
  const [dateIndex, setDateIndex] = useState(1);
  const [search, setSearch] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'void' | 'refund' } | null>(null);

  const [data, setData] = useState(MOCK_DATA);

  const currentDate = DATES[dateIndex];
  const currentDayData = data[currentDate];

  const filteredIssues = useMemo(() => 
    currentDayData.issues.filter(tx => 
      tx.id.toLowerCase().includes(search.toLowerCase()) ||
      tx.items.toLowerCase().includes(search.toLowerCase()) ||
      tx.total.toString().includes(search)
    ), [currentDayData.issues, search]);

  const filteredInProgress = useMemo(() => 
    currentDayData.inProgress.filter(tx => 
      tx.id.toLowerCase().includes(search.toLowerCase()) ||
      tx.items.toLowerCase().includes(search.toLowerCase()) ||
      tx.total.toString().includes(search)
    ), [currentDayData.inProgress, search]);

  const filteredCompleted = useMemo(() => 
    currentDayData.completed.filter(tx => 
      tx.id.toLowerCase().includes(search.toLowerCase()) ||
      tx.items.toLowerCase().includes(search.toLowerCase()) ||
      tx.total.toString().includes(search)
    ), [currentDayData.completed, search]);

  const handleAction = (txId: string, action: 'void' | 'refund' | 'restore') => {
    setData(prev => {
      const newData = { ...prev };
      const dayData = { ...newData[currentDate] };
      
      if (action === 'void' || action === 'refund') {
        const tx = dayData.completed.find(t => t.id === txId);
        if (tx) {
          dayData.completed = dayData.completed.filter(t => t.id !== txId);
          dayData.issues = [...dayData.issues, { ...tx, status: (action === 'void' ? 'Voided' : 'Refunded') as TxStatus }];
        }
      } else if (action === 'restore') {
        const tx = dayData.issues.find(t => t.id === txId);
        if (tx) {
          dayData.issues = dayData.issues.filter(t => t.id !== txId);
          dayData.completed = [{ ...tx, status: 'Completed' as TxStatus }, ...dayData.completed].sort((a, b) => b.time.localeCompare(a.time));
        }
      }

      newData[currentDate] = dayData;
      return newData;
    });
    setConfirmAction(null);
  };

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
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: BRAND_DIM, color: BRAND }}>
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
      <div className="flex flex-col gap-2 mt-4 pt-3 border-t" style={{ borderColor: BORDER }}>
        {confirmAction?.id === tx.id ? (
          <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg">
            <span className="text-[10px] font-bold uppercase" style={{ color: confirmAction.type === 'void' ? RED : PURPLE }}>
              Confirm {confirmAction.type}?
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setConfirmAction(null)}
                className="px-2 py-1 rounded text-[10px] font-bold"
                style={{ background: SURFACE, color: TEXT_MUTED }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction(tx.id, confirmAction.type)}
                className="px-2 py-1 rounded text-[10px] font-bold"
                style={{ 
                  background: confirmAction.type === 'void' ? RED : PURPLE, 
                  color: BRAND_TEXT_ON 
                }}
              >
                Yes, {confirmAction.type}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: TEXT_MUTED }}>
              <Printer size={14} /> Reprint
            </button>
            {tx.status === 'Completed' && (
              <>
                <button 
                  onClick={() => setConfirmAction({ id: tx.id, type: 'void' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" 
                  style={{ color: RED }}
                >
                  <XOctagon size={14} /> Void
                </button>
                <button 
                  onClick={() => setConfirmAction({ id: tx.id, type: 'refund' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" 
                  style={{ color: PURPLE }}
                >
                  <RotateCcw size={14} /> Refund
                </button>
              </>
            )}
            {tx.status === 'Voided' && (
              <button 
                onClick={() => handleAction(tx.id, 'restore')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-white/5" 
                style={{ color: GREEN }}
              >
                <Undo2 size={14} /> Restore
              </button>
            )}
          </div>
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
            <button 
              onClick={() => setDateIndex(prev => Math.max(0, prev - 1))}
              disabled={dateIndex === 0}
              className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" 
              style={{ color: TEXT_MUTED }}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 text-sm font-bold w-[120px] text-center" style={{ color: TEXT }}>{currentDate}</div>
            <button 
              onClick={() => setDateIndex(prev => Math.min(DATES.length - 1, prev + 1))}
              disabled={dateIndex === DATES.length - 1}
              className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" 
              style={{ color: TEXT_MUTED }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          
          {confirmClose ? (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setConfirmClose(false)}
                className="px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: SURFACE_RAISED, color: TEXT_MUTED }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setIsRegisterOpen(false);
                  setConfirmClose(false);
                }}
                className="px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: RED, color: BRAND_TEXT_ON }}
              >
                Confirm Close
              </button>
            </div>
          ) : (
            <button 
              onClick={() => {
                if (isRegisterOpen) setConfirmClose(true);
                else setIsRegisterOpen(true);
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all" 
              style={{ 
                background: isRegisterOpen ? SURFACE_RAISED : BRAND, 
                color: isRegisterOpen ? TEXT : BRAND_TEXT_ON,
                border: isRegisterOpen ? `1px solid ${BORDER}` : 'none'
              }}
            >
              {isRegisterOpen ? 'Close Register' : 'Open Register'}
            </button>
          )}
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
          <div className="absolute top-0 w-full h-1" style={{ background: BRAND }} />
          <span className="text-sm font-bold tracking-wider uppercase mb-1" style={{ color: BRAND }}>Total Revenue</span>
          <span className="text-5xl font-black tracking-tight" style={{ color: TEXT }}>
            ${currentDayData.completed.reduce((acc, tx) => acc + tx.total, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm" style={{ color: TEXT_MUTED }}>{currentDayData.completed.length} tickets</span>
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
          <span className="text-xl font-bold" style={{ color: TEXT }}>
            ${currentDayData.completed.length > 0 
              ? (currentDayData.completed.reduce((acc, tx) => acc + tx.total, 0) / currentDayData.completed.length).toFixed(2) 
              : '0.00'}
          </span>
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
      {filteredIssues.length > 0 && (
        <>
          <SectionLabel right={<span className="text-xs font-bold" style={{ color: RED }}>{filteredIssues.length} Requires Review</span>}>
            Issues
          </SectionLabel>
          <div className="px-5">
            {filteredIssues.map(renderTxRow)}
          </div>
        </>
      )}

      {/* In Progress */}
      {filteredInProgress.length > 0 && (
        <>
          <SectionLabel right={<span className="text-xs font-bold" style={{ color: BRAND }}>{filteredInProgress.length} Active</span>}>
            In Progress
          </SectionLabel>
          <div className="px-5">
            {filteredInProgress.map(renderTxRow)}
          </div>
        </>
      )}

      {/* Completed */}
      {filteredCompleted.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
          <div className="px-5 pb-6">
            {filteredCompleted.map(renderTxRow)}
            {search === '' && (
              <button className="w-full py-3 rounded-xl text-sm font-bold mt-2" style={{ background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                Load More
              </button>
            )}
          </div>
        </>
      )}

      {search !== '' && filteredIssues.length === 0 && filteredInProgress.length === 0 && filteredCompleted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
          <Search size={48} className="mb-4 opacity-20" style={{ color: TEXT_MUTED }} />
          <h3 className="text-lg font-bold mb-1" style={{ color: TEXT }}>No matches found</h3>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>Try searching for a different receipt number, item name, or amount.</p>
        </div>
      )}
    </Shell>
  );
}
