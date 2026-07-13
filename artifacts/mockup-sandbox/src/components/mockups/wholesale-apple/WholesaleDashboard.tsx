import React from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { ArrowUpRight, Phone, Mail, FileText, ChevronRight, AlertCircle, ShoppingBag, Search } from 'lucide-react';

export default function WholesaleDashboard() {
  return (
    <AppLayout activeTab="dashboard">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="mt-4">
          <div className="flex justify-between items-start">
            <h1 className="text-[32px] font-bold tracking-tight text-black leading-tight">Sunrise Bakery<br/>Pty Ltd</h1>
          </div>
          <div className="mt-2 inline-flex items-center bg-[#E5E5EA] px-2 py-1 rounded-md">
            <span className="text-[11px] font-bold tracking-wider text-[#8E8E93]">SILVER TIER</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">YTD Spend</span>
            <span className="text-[20px] font-bold text-black">$48,230</span>
          </div>
          <div className="w-[1px] h-10 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">Active</span>
            <span className="text-[20px] font-bold text-black">3</span>
          </div>
          <div className="w-[1px] h-10 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">Overdue</span>
            <span className="text-[20px] font-bold text-[#FF3B30]">$2,400</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button className="flex-1 bg-[#007AFF] text-white rounded-xl py-3.5 px-4 font-semibold text-[15px] flex items-center justify-center shadow-sm">
            <ShoppingBag size={18} className="mr-2" />
            New Order
          </button>
          <button className="flex-1 bg-white text-black border border-gray-200 rounded-xl py-3.5 px-4 font-semibold text-[15px] flex items-center justify-center shadow-sm">
            <Search size={18} className="mr-2" />
            View Catalog
          </button>
        </div>

        {/* Pending Orders Alert */}
        <div className="bg-[#FF9500]/10 border border-[#FF9500]/20 rounded-xl p-3.5 flex items-start gap-3">
          <AlertCircle size={20} className="text-[#FF9500] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[14px] font-medium text-black">You have 1 pending order awaiting approval</p>
            <button className="text-[#FF9500] text-[13px] font-semibold mt-1">Review Order →</button>
          </div>
        </div>

        {/* Account Manager */}
        <div>
          <h2 className="text-[17px] font-semibold text-black mb-3">Account Manager</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-medium text-lg shrink-0">
              LP
            </div>
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold text-black">Liam Porter</h3>
              <div className="flex items-center gap-3 mt-1.5 text-[13px] text-[#007AFF] font-medium">
                <span className="flex items-center gap-1"><Phone size={14} /> Call</span>
                <span className="flex items-center gap-1"><Mail size={14} /> Email</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[17px] font-semibold text-black">Recent Orders</h2>
            <span className="text-[#007AFF] text-[15px] font-medium">See All</span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <OrderRow id="PO-2024-0041" date="Today" status="processing" total="$127.60" />
            <OrderRow id="PO-2024-0040" date="Mon 14 Jul" status="dispatched" total="$345.00" />
            <OrderRow id="PO-2024-0039" date="Fri 11 Jul" status="delivered" total="$210.50" border={false} />
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

function OrderRow({ id, date, status, total, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center active:bg-gray-50 cursor-pointer transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[15px] font-semibold text-black">{id}</span>
          <span className="text-[15px] font-semibold text-black">{total}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[13px] text-[#8E8E93]">{date}</span>
          <StatusBadge status={status} />
        </div>
      </div>
      <ChevronRight size={20} className="text-[#C7C7CC] ml-3" />
    </div>
  );
}
