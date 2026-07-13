import React from 'react';
import AppLayout from './_shared/AppLayout';
import { ChevronLeft, Phone, Mail, Printer, User } from 'lucide-react';
import StatusBadge from './_shared/StatusBadge';

export default function OrderDetail() {
  return (
    <AppLayout activeTab="none">
      <div className="bg-[#F2F2F7] min-h-full pb-8">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-1 sticky top-0 bg-[#F2F2F7]/90 backdrop-blur-md z-10">
          <button className="flex items-center text-[#007AFF] font-medium -ml-2 p-2">
            <ChevronLeft size={24} />
            <span className="text-[17px]">Orders</span>
          </button>
        </div>

        <div className="px-4 mt-2">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-[28px] font-bold text-black tracking-tight leading-tight">#1042</h1>
              <h2 className="text-[22px] font-semibold text-black/80">James Chen</h2>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-100 text-[13px] font-bold text-black uppercase tracking-wide">
              Pickup
            </div>
          </div>

          {/* Customer Contact */}
          <div className="flex gap-3 mb-6">
            <button className="flex-1 bg-white rounded-xl p-3 flex flex-col items-center justify-center gap-1 shadow-sm border border-gray-100 text-[#007AFF]">
              <Phone size={20} />
              <span className="text-[11px] font-medium">Call</span>
            </button>
            <button className="flex-1 bg-white rounded-xl p-3 flex flex-col items-center justify-center gap-1 shadow-sm border border-gray-100 text-[#007AFF]">
              <Mail size={20} />
              <span className="text-[11px] font-medium">Email</span>
            </button>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
            <h3 className="text-[15px] font-semibold mb-4 text-black">Status</h3>
            <div className="space-y-4">
              <TimelineStep label="Received" active={true} done={true} />
              <TimelineStep label="Preparing" active={true} done={true} />
              <TimelineStep label="Ready" active={true} done={false} isCurrent={true} />
              <TimelineStep label="Completed" active={false} done={false} />
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-[15px] font-semibold text-black">Order Items</h3>
            </div>
            <div className="p-4 space-y-3">
              <ItemRow name="Choc Chip Cookie" qty="2" price="$9.00" />
              <ItemRow name="Flat White" qty="1" price="$5.50" note="Oat milk, extra hot" />
            </div>
            <div className="bg-gray-50/50 p-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-[14px] text-[#8E8E93]">
                <span>Subtotal</span>
                <span>$14.50</span>
              </div>
              <div className="flex justify-between text-[14px] text-[#8E8E93]">
                <span>Tax</span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between text-[17px] font-bold text-black mt-2 pt-2 border-t border-gray-200">
                <span>Total</span>
                <span>$14.50</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <button className="w-full bg-[#007AFF] text-white rounded-xl py-4 text-[17px] font-semibold shadow-sm mb-3 active:opacity-80 transition-opacity">
            Mark as Completed
          </button>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <ActionRow icon={<Printer size={20} />} label="Print Receipt" />
            <ActionRow icon={<User size={20} />} label="View Customer" border={false} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function TimelineStep({ label, active, done, isCurrent }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px]
        ${done ? 'bg-[#34C759] text-white' : isCurrent ? 'bg-[#007AFF] text-white ring-4 ring-[#007AFF]/20' : 'bg-gray-100 text-gray-400'}`}>
        {done ? '✓' : ''}
      </div>
      <span className={`text-[15px] font-medium ${active ? 'text-black' : 'text-[#8E8E93]'}`}>{label}</span>
    </div>
  );
}

function ItemRow({ name, qty, price, note }: any) {
  return (
    <div className="flex justify-between items-start">
      <div>
        <div className="text-[15px] font-medium text-black">
          <span className="text-[#8E8E93] mr-2">{qty}×</span>
          {name}
        </div>
        {note && <div className="text-[13px] text-[#8E8E93] mt-0.5 ml-6">{note}</div>}
      </div>
      <span className="text-[15px] font-medium text-black">{price}</span>
    </div>
  );
}

function ActionRow({ icon, label, border = true }: any) {
  return (
    <button className={`w-full flex items-center p-4 active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="text-[#007AFF] mr-3">{icon}</div>
      <span className="text-[16px] text-black">{label}</span>
    </button>
  );
}
