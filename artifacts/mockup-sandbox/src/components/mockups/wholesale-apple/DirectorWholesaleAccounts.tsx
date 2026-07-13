import React, { useEffect, useState } from 'react';
import { Users, Grid, Home, ShoppingBag, Package, Plus, ChevronRight } from 'lucide-react';
import './_group.css';
import StatusBadge from './_shared/StatusBadge';

// Inline AppLayout for Director View to avoid cross-folder imports
function DirectorAppLayout({ children, activeTab = 'people' }: { children: React.ReactNode, activeTab?: string }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setTime(formatter.format(now).replace(',', ''));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="wholesale-apple-theme w-[390px] h-[844px] bg-[#F2F2F7] flex flex-col overflow-hidden relative mx-auto shadow-2xl border border-gray-200 rounded-[40px] text-left">
      <div className="h-[44px] flex items-center justify-between px-6 pt-2 bg-white/80 backdrop-blur-md z-50 absolute top-0 w-full rounded-t-[40px]">
        <div className="text-[12px] font-semibold text-black/80">{time || 'Mon 14 Jul 9:41 AM'}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-white bg-[#FF3B30] px-1.5 py-0.5 rounded-full tracking-wider">DIRECTOR</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-[83px] pt-[44px]">
        {children}
      </div>
      <div className="h-[83px] bg-white/90 backdrop-blur-lg border-t border-gray-200/50 absolute bottom-0 w-full flex justify-around px-2 pt-2 pb-6 z-50 rounded-b-[40px]">
        <TabItem icon={<Home size={24} />} label="Home" active={activeTab === 'home'} />
        <TabItem icon={<ShoppingBag size={24} />} label="Orders" active={activeTab === 'orders'} />
        <TabItem icon={<Users size={24} />} label="People" active={activeTab === 'people'} />
        <TabItem icon={<Package size={24} />} label="Products" active={activeTab === 'products'} />
        <TabItem icon={<Grid size={24} />} label="More" active={activeTab === 'more'} />
      </div>
    </div>
  );
}

function TabItem({ icon, label, active }: { icon: React.ReactNode, label: string, active: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 w-16 cursor-default ${active ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
}

export default function DirectorWholesaleAccounts() {
  const filters = ['All', 'Approved', 'Pending', 'Suspended'];
  const [filter, setFilter] = useState('All');

  return (
    <DirectorAppLayout activeTab="people">
      <div className="flex flex-col h-full">
        <div className="pt-4 px-4 pb-2 bg-[#F2F2F7] sticky top-0 z-10 flex flex-col">
          <div className="flex justify-between items-start mb-3">
             <h1 className="text-[34px] font-bold tracking-tight text-black">Wholesale</h1>
             <button className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center mt-2">
               <Plus size={20} />
             </button>
          </div>
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
           <div>
              <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-1">WHOLESALE ACCOUNTS</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <AccountRow name="Sunrise Bakery Pty Ltd" tier="SILVER" tierColor="text-[#8E8E93] bg-[#8E8E93]/10" status="approved" spend="$48,230" manager="Liam P." />
                <AccountRow name="The Local Roaster" tier="GOLD" tierColor="text-[#D4AF37] bg-[#D4AF37]/10" status="approved" spend="$120,400" manager="Sarah M." />
                <AccountRow name="Oceanview Cafe" tier="BRONZE" tierColor="text-[#CD7F32] bg-[#CD7F32]/10" status="approved" spend="$12,500" manager="Liam P." />
                
                {/* Pending Approval row with inline actions */}
                <div className="p-4 border-b border-gray-100 bg-[#FF9500]/5">
                   <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-[16px] font-semibold text-black mb-1">Newtown Deli</div>
                        <StatusBadge status="pending" />
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[13px] text-[#8E8E93] mb-1">Unassigned</span>
                         <span className="text-[14px] font-semibold text-black">$0</span>
                      </div>
                   </div>
                   <div className="flex gap-4 mt-3">
                      <button className="text-[14px] font-semibold text-[#34C759]">Approve</button>
                      <button className="text-[14px] font-semibold text-[#FF3B30]">Reject</button>
                   </div>
                </div>

                <AccountRow name="City Central Catering" tier="BRONZE" tierColor="text-[#CD7F32] bg-[#CD7F32]/10" status="suspended" spend="$4,200" manager="James C." border={false} />
              </div>
           </div>
        </div>
      </div>
    </DirectorAppLayout>
  );
}

function AccountRow({ name, tier, tierColor, status, spend, manager, border = true }: any) {
  return (
    <div className={`p-4 flex items-center active:bg-gray-50 cursor-pointer transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1 pr-2">
         <div className="text-[16px] font-semibold text-black mb-1.5 truncate">{name}</div>
         <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${tierColor}`}>{tier}</span>
            <StatusBadge status={status} />
         </div>
         <div className="text-[13px] text-[#8E8E93]">Managed by {manager}</div>
      </div>
      <div className="flex flex-col items-end justify-center">
         <span className="text-[15px] font-bold text-black mb-1">{spend}</span>
         <ChevronRight size={20} className="text-[#C7C7CC]" />
      </div>
    </div>
  );
}
