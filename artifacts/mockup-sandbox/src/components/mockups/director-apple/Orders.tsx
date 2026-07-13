import React, { useState } from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { ChevronRight } from 'lucide-react';

export default function Orders() {
  const [filter, setFilter] = useState('All');
  const filters = ['All', 'Active', 'Pending', 'Preparing', 'Ready', 'Done', 'Cancelled'];

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
          {/* Live Queue */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">Live Queue</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <OrderRow id="#1042" name="James Chen" time="2m ago" type="Pickup" count={3} total="$14.50" status="preparing" />
              <OrderRow id="#1043" name="Tom K." time="Just now" type="Delivery" count={2} total="$24.50" status="pending" />
              <OrderRow id="#1041" name="Emma W." time="5m ago" type="Pickup" count={1} total="$5.50" status="ready" border={false} />
            </div>
          </div>

          {/* Earlier Today */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">Earlier Today</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <OrderRow id="#1040" name="Lucas M." time="9:15 AM" type="Pickup" count={4} total="$32.00" status="completed" />
              <OrderRow id="#1039" name="Olivia S." time="9:02 AM" type="Delivery" count={2} total="$18.00" status="completed" />
              <OrderRow id="#1038" name="Noah R." time="8:45 AM" type="Pickup" count={1} total="$4.50" status="completed" />
              <OrderRow id="#1037" name="Mia B." time="8:30 AM" type="Pickup" count={5} total="$42.50" status="completed" />
              <OrderRow id="#1036" name="Isabella J." time="8:12 AM" type="Delivery" count={2} total="$15.00" status="cancelled" border={false} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function OrderRow({ id, name, time, type, count, total, status, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center active:bg-gray-50 cursor-pointer transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[16px] font-semibold text-black">{id} — {name}</span>
          <span className="text-[13px] text-[#8E8E93]">{time}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-[13px] text-[#8E8E93] font-medium">{type} • {count} items</span>
          </div>
          <span className="text-[15px] font-semibold text-black">{total}</span>
        </div>
      </div>
      <ChevronRight size={20} className="text-[#C7C7CC] ml-3" />
    </div>
  );
}
