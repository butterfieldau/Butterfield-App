import React from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { ArrowUpRight, ArrowDownRight, Clock, MapPin, ShoppingBag } from 'lucide-react';

export default function Dashboard() {
  return (
    <AppLayout activeTab="home">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="mt-4">
          <h1 className="text-[32px] font-bold tracking-tight text-black leading-tight">Good morning,<br/>James</h1>
          <p className="text-[#8E8E93] text-[15px] mt-1 font-medium">Monday, 14 July</p>
        </div>

        {/* Revenue Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">Today</span>
            <span className="text-[22px] font-bold text-black">$847</span>
            <span className="text-[#34C759] text-[12px] font-semibold flex items-center"><ArrowUpRight size={14} className="mr-0.5"/> 12%</span>
          </div>
          <div className="w-[1px] h-12 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">Week</span>
            <span className="text-[22px] font-bold text-black">$4,230</span>
            <span className="text-[#34C759] text-[12px] font-semibold flex items-center"><ArrowUpRight size={14} className="mr-0.5"/> 5%</span>
          </div>
          <div className="w-[1px] h-12 bg-gray-100"></div>
          <div className="flex flex-col">
            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-1">Month</span>
            <span className="text-[22px] font-bold text-black">$18,460</span>
            <span className="text-[#FF3B30] text-[12px] font-semibold flex items-center"><ArrowDownRight size={14} className="mr-0.5"/> 2%</span>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Active Orders" value="3" />
          <KpiCard label="New Customers" value="12" />
          <KpiCard label="Staff On Shift" value="4" />
          <KpiCard label="Pending Approvals" value="2" badge />
        </div>

        {/* Live Orders */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[17px] font-semibold text-black">Live Orders</h2>
            <span className="text-[#007AFF] text-[15px] font-medium">See All</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            <LiveOrderCard id="#1042" name="Sarah M." status="preparing" time="2m ago" />
            <LiveOrderCard id="#1043" name="Tom K." status="pending" time="Just now" />
            <LiveOrderCard id="#1041" name="Emma W." status="ready" time="5m ago" />
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-[17px] font-semibold text-black mb-3">Recent Activity</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <ActivityRow icon={<ShoppingBag size={18} />} title="New order placed" subtitle="#1043 — $24.50" time="Just now" />
            <ActivityRow icon={<Clock size={18} />} title="Staff clocked in" subtitle="Mia (Barista)" time="10m ago" />
            <ActivityRow icon={<MapPin size={18} />} title="Delivery dispatched" subtitle="#1038 via UberEats" time="15m ago" />
            <ActivityRow icon={<ShoppingBag size={18} />} title="Order completed" subtitle="#1037 — $12.00" time="22m ago" border={false} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, badge }: { label: string, value: string, badge?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative">
      {badge && <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#FF3B30] rounded-full"></div>}
      <span className="text-[32px] font-bold text-black leading-none block mb-1">{value}</span>
      <span className="text-[13px] text-[#8E8E93] font-medium leading-tight block">{label}</span>
    </div>
  );
}

function LiveOrderCard({ id, name, status, time }: { id: string, name: string, status: any, time: string }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 min-w-[140px] snap-center shrink-0">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[14px] font-bold text-black">{id}</span>
        <span className="text-[12px] text-[#8E8E93] font-medium">{time}</span>
      </div>
      <div className="text-[15px] font-medium text-black mb-3">{name}</div>
      <StatusBadge status={status} />
    </div>
  );
}

function ActivityRow({ icon, title, subtitle, time, border = true }: { icon: React.ReactNode, title: string, subtitle: string, time: string, border?: boolean }) {
  return (
    <div className={`flex items-center p-3.5 ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#007AFF] mr-3 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-black truncate">{title}</div>
        <div className="text-[13px] text-[#8E8E93] truncate">{subtitle}</div>
      </div>
      <div className="text-[13px] text-[#8E8E93] ml-2 shrink-0">{time}</div>
    </div>
  );
}
