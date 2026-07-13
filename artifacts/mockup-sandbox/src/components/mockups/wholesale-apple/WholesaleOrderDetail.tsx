import React from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { ChevronLeft, FileDown, RotateCcw, MapPin, CheckCircle2, Circle } from 'lucide-react';

export default function WholesaleOrderDetail() {
  return (
    <AppLayout activeTab="none">
      <div className="flex flex-col h-full bg-[#F2F2F7]">
        {/* Nav Bar */}
        <div className="flex items-center px-4 pt-4 pb-2 sticky top-0 bg-[#F2F2F7] z-10">
          <button className="flex items-center text-[#007AFF] text-[17px]">
            <ChevronLeft size={22} className="-ml-1.5" />
            <span>Orders</span>
          </button>
        </div>

        <div className="px-4 pb-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-[32px] font-bold tracking-tight text-black mb-2">PO-2024-0041</h1>
            <div className="flex items-center gap-2">
              <StatusBadge status="dispatched" />
              <span className="text-[14px] text-[#8E8E93]">Placed on 14 Jul 2024</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-start gap-4 mb-4">
               <div className="flex flex-col items-center">
                 <CheckCircle2 size={20} className="text-[#34C759]" />
                 <div className="w-[1px] h-6 bg-[#34C759] my-1"></div>
                 <CheckCircle2 size={20} className="text-[#34C759]" />
                 <div className="w-[1px] h-6 bg-[#34C759] my-1"></div>
                 <div className="w-5 h-5 rounded-full border-2 border-[#007AFF] bg-[#007AFF]/20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 bg-[#007AFF] rounded-full"></div>
                 </div>
                 <div className="w-[1px] h-6 bg-gray-200 my-1"></div>
                 <Circle size={20} className="text-gray-300" />
               </div>
               <div className="flex flex-col flex-1 py-0.5 gap-[18px]">
                 <div>
                   <div className="text-[14px] font-semibold text-black">Pending</div>
                   <div className="text-[12px] text-[#8E8E93]">14 Jul, 08:30 AM</div>
                 </div>
                 <div>
                   <div className="text-[14px] font-semibold text-black">Processing</div>
                   <div className="text-[12px] text-[#8E8E93]">14 Jul, 09:15 AM</div>
                 </div>
                 <div>
                   <div className="text-[14px] font-semibold text-[#007AFF]">Dispatched</div>
                   <div className="text-[12px] text-[#007AFF]/80">14 Jul, 10:45 AM</div>
                 </div>
                 <div>
                   <div className="text-[14px] font-medium text-gray-400">Delivered</div>
                   <div className="text-[12px] text-gray-400">Est. 11:30 AM</div>
                 </div>
               </div>
            </div>
          </div>

          {/* Delivery Details */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-3">
             <MapPin size={20} className="text-[#8E8E93] shrink-0 mt-0.5" />
             <div>
               <div className="text-[14px] font-semibold text-black mb-1">Sunrise Bakery HQ</div>
               <div className="text-[14px] text-[#8E8E93] leading-snug">
                 124 Baking Street<br/>
                 Surry Hills, NSW 2010<br/>
                 Australia
               </div>
             </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-black">Order Items</h2>
            </div>
            <ItemRow name="Choc Chip Cookie Box (24pk)" qty="2" price="$45.00" total="$90.00" />
            <ItemRow name="Macadamia Cookie Box (24pk)" qty="1" price="$48.00" total="$48.00" />
            <ItemRow name="1kg Espresso Blend Beans" qty="2" price="$32.00" total="$64.00" border={false} />
            
            <div className="p-4 bg-gray-50/50 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-[14px] text-[#8E8E93]">
                <span>Subtotal</span>
                <span>$202.00</span>
              </div>
              <div className="flex justify-between text-[14px] text-[#8E8E93]">
                <span>Delivery Fee</span>
                <span>$15.00</span>
              </div>
              <div className="flex justify-between text-[14px] text-[#8E8E93]">
                <span>GST (10%)</span>
                <span>$21.70</span>
              </div>
              <div className="flex justify-between text-[16px] font-bold text-black pt-2 border-t border-gray-200/60">
                <span>Total</span>
                <span>$238.70</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
             <div className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wider mb-1">Payment Terms</div>
             <div className="text-[15px] font-semibold text-black">NET 30 — Due 14 Aug 2024</div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
             <button className="flex-1 bg-white text-black border border-gray-200 rounded-xl py-3.5 px-4 font-semibold text-[15px] flex items-center justify-center shadow-sm">
               <FileDown size={18} className="mr-2" />
               Invoice
             </button>
             <button className="flex-1 bg-[#007AFF] text-white rounded-xl py-3.5 px-4 font-semibold text-[15px] flex items-center justify-center shadow-sm">
               <RotateCcw size={18} className="mr-2" />
               Reorder
             </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ItemRow({ name, qty, price, total, border = true }: any) {
  return (
    <div className={`p-4 flex justify-between items-center ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1 pr-4">
        <div className="text-[15px] font-medium text-black mb-1 leading-tight">{name}</div>
        <div className="text-[13px] text-[#8E8E93]">{qty} × {price}</div>
      </div>
      <div className="text-[15px] font-semibold text-black">{total}</div>
    </div>
  );
}
