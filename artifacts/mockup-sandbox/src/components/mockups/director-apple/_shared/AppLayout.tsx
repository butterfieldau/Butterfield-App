import React, { useEffect, useState } from 'react';
import { Home, ShoppingBag, Users, Package, Grid } from 'lucide-react';
import '../_group.css';

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab?: 'home' | 'orders' | 'people' | 'products' | 'more' | 'none';
}

export default function AppLayout({ children, activeTab = 'home' }: AppLayoutProps) {
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
    <div className="director-apple-theme w-[390px] h-[844px] bg-[#F2F2F7] flex flex-col overflow-hidden relative mx-auto shadow-2xl border border-gray-200 rounded-[40px] text-left">
      {/* Status Bar */}
      <div className="h-[44px] flex items-center justify-between px-6 pt-2 bg-white/80 backdrop-blur-md z-50 absolute top-0 w-full rounded-t-[40px]">
        <div className="text-[12px] font-semibold text-black/80">{time || 'Mon 14 Jul 9:41 AM'}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-white bg-[#FF3B30] px-1.5 py-0.5 rounded-full tracking-wider">DIRECTOR</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-[83px] pt-[44px]">
        {children}
      </div>

      {/* Tab Bar */}
      {activeTab !== 'none' && (
        <div className="h-[83px] bg-white/90 backdrop-blur-lg border-t border-gray-200/50 absolute bottom-0 w-full flex justify-around px-2 pt-2 pb-6 z-50 rounded-b-[40px]">
          <TabItem icon={<Home size={24} />} label="Home" active={activeTab === 'home'} />
          <TabItem icon={<ShoppingBag size={24} />} label="Orders" active={activeTab === 'orders'} />
          <TabItem icon={<Users size={24} />} label="People" active={activeTab === 'people'} />
          <TabItem icon={<Package size={24} />} label="Products" active={activeTab === 'products'} />
          <TabItem icon={<Grid size={24} />} label="More" active={activeTab === 'more'} />
        </div>
      )}
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
