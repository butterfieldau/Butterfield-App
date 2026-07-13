import React, { useState } from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { ChevronRight } from 'lucide-react';

export default function WholesaleOrders() {
  const [filter, setFilter] = useState('All');
  const filters = ['All', 'Active', 'Overdue', 'Completed'];

  return (
    <AppLayout activeTab="orders">
      <div className="flex flex-col h-full">
        <div className="pt-4 px-4 pb-2 bg-[#F2F2F7] sticky top-0 z-10">
          <h1 className="text-[34px] font-bold tracking-tight text-black mb-3">Orders</h1>
          <div className="flex overflow-x-auto -mx-4 px-4 pb-2 gap-2 snap-x">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-[14px] font-medium shrink-0 snap-start transition-colors ${
                  filter === f ? 'bg-black text-white' : 'bg-white text-black border border-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-6 space-y-5">
          {/* Active */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">ACTIVE</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <OrderRow id="PO-2024-0043" name="Sunrise Bakery Pty Ltd" time="Due Today" total="$420.00" status="processing" />
              <OrderRow id="PO-2024-0042" name="Sunrise Bakery Pty Ltd" time="Due Tomorrow" total="$150.50" status="pending" />
              <OrderRow id="PO-2024-0041" name="Sunrise Bakery Pty Ltd" time="Due Mon 17 Jul" total="$127.60" status="dispatched" border={false} />
            </div>
          </div>

          {/* Overdue (If filtered) */}
          <div>
             <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">ATTENTION</h2>
             <div className="bg-white rounded-2xl shadow-sm border border-[#FF3B30]/30 overflow-hidden relative">
               <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FF3B30]"></div>
               <OrderRow id="PO-2024-0038" name="Sunrise Bakery Pty Ltd" time="Overdue (2 Days)" total="$85.00" status="overdue" border={false} />
             </div>
          </div>

          {/* Earlier */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">EARLIER</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <OrderRow id="PO-2024-0037" name="Sunrise Bakery Pty Ltd" time="Delivered 10 Jul" total="$310.00" status="delivered" />
              <OrderRow id="PO-2024-0036" name="Sunrise Bakery Pty Ltd" time="Delivered 8 Jul" total="$215.00" status="delivered" border={false} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function OrderRow({ id, name, time, total, status, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center active:bg-gray-50 cursor-pointer transition-colors pl-4 ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[16px] font-semibold text-black">{id}</span>
          <span className="text-[15px] font-semibold text-black">{total}</span>
        </div>
        <div className="text-[13px] text-[#8E8E93] mb-2">{name}</div>
        <div className="flex justify-between items-center">
          <StatusBadge status={status} />
          <span className="text-[13px] text-[#8E8E93]">{time}</span>
        </div>
      </div>
      <ChevronRight size={20} className="text-[#C7C7CC] ml-3" />
    </div>
  );
}
