import React from 'react';
import AppLayout from './_shared/AppLayout';
import { 
  BarChart2, Clock, Users, 
  Calendar, CheckSquare, Package, MonitorSmartphone,
  Tag, Gift, Box,
  Users2, PieChart, MessageSquare,
  Settings, Store, CreditCard, ScanLine,
  Lock, ChevronRight
} from 'lucide-react';

export default function More() {
  return (
    <AppLayout activeTab="more">
      <div className="pt-4 px-4 pb-6 h-full bg-[#F2F2F7]">
        <h1 className="text-[34px] font-bold tracking-tight text-black mb-4">More</h1>
        
        <div className="space-y-6">
          {/* Analytics */}
          <Section>
            <Row icon={<BarChart2 size={20} />} iconColor="text-[#007AFF]" bg="bg-[#007AFF]/10" label="Reports" />
            <Row icon={<Clock size={20} />} iconColor="text-[#FF9500]" bg="bg-[#FF9500]/10" label="Timesheets" />
            <Row icon={<Users size={20} />} iconColor="text-[#34C759]" bg="bg-[#34C759]/10" label="Staff Hub" border={false} />
          </Section>

          {/* Operations */}
          <Section header="OPERATIONS">
            <Row icon={<Calendar size={20} />} iconColor="text-[#FF2D55]" bg="bg-[#FF2D55]/10" label="Schedule" />
            <Row icon={<CheckSquare size={20} />} iconColor="text-[#5856D6]" bg="bg-[#5856D6]/10" label="Tasks" badge="3" />
            <Row icon={<Package size={20} />} iconColor="text-[#FF9500]" bg="bg-[#FF9500]/10" label="Stock" />
            <Row icon={<MonitorSmartphone size={20} />} iconColor="text-[#007AFF]" bg="bg-[#007AFF]/10" label="POS Orders" border={false} />
          </Section>

          {/* Commerce */}
          <Section header="COMMERCE">
            <Row icon={<Tag size={20} />} iconColor="text-[#34C759]" bg="bg-[#34C759]/10" label="Pricing" />
            <Row icon={<Gift size={20} />} iconColor="text-[#FF2D55]" bg="bg-[#FF2D55]/10" label="Discounts" />
            <Row icon={<Box size={20} />} iconColor="text-[#AF52DE]" bg="bg-[#AF52DE]/10" label="Build-a-Box" border={false} />
          </Section>

          {/* Customers */}
          <Section header="CUSTOMERS">
            <Row icon={<Users2 size={20} />} iconColor="text-[#007AFF]" bg="bg-[#007AFF]/10" label="Customers" />
            <Row icon={<PieChart size={20} />} iconColor="text-[#FF9500]" bg="bg-[#FF9500]/10" label="Segments" />
            <Row icon={<MessageSquare size={20} />} iconColor="text-[#34C759]" bg="bg-[#34C759]/10" label="Feedback" badge="1" border={false} />
          </Section>

          {/* System */}
          <Section header="SYSTEM">
            <Row icon={<Settings size={20} />} iconColor="text-[#8E8E93]" bg="bg-[#8E8E93]/10" label="Settings" />
            <Row icon={<Store size={20} />} iconColor="text-[#007AFF]" bg="bg-[#007AFF]/10" label="Stores" />
            <Row icon={<CreditCard size={20} />} iconColor="text-[#34C759]" bg="bg-[#34C759]/10" label="Linkly Terminal" />
            <Row icon={<ScanLine size={20} />} iconColor="text-[#5856D6]" bg="bg-[#5856D6]/10" label="Scan" border={false} />
          </Section>

          {/* Security */}
          <Section>
            <Row 
              icon={<Lock size={20} />} 
              iconColor="text-[#D4AF37]" 
              bg="bg-[#D4AF37]/10" 
              label="Director Vault" 
              border={false} 
              extra={<span className="text-[10px] font-bold text-white bg-[#D4AF37] px-1.5 py-0.5 rounded-sm tracking-wider mr-1">DIRECTOR ONLY</span>}
            />
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}

function Section({ header, children }: { header?: string, children: React.ReactNode }) {
  return (
    <div>
      {header && <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-4">{header}</h2>}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({ icon, iconColor, bg, label, badge, border = true, extra }: any) {
  return (
    <button className={`w-full flex items-center p-3.5 active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className={`w-8 h-8 rounded-lg ${bg} ${iconColor} flex items-center justify-center mr-3 shrink-0`}>
        {icon}
      </div>
      <span className="text-[16px] text-black font-medium flex-1 text-left">{label}</span>
      {extra && extra}
      {badge && (
        <span className="bg-[#FF3B30] text-white text-[13px] font-bold w-5 h-5 rounded-full flex items-center justify-center mr-2 shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight size={20} className="text-[#C7C7CC] shrink-0" />
    </button>
  );
}
