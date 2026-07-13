import React from 'react';
import AppLayout from './_shared/AppLayout';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Settings() {
  return (
    <AppLayout activeTab="none">
      <div className="bg-[#F2F2F7] min-h-full pb-8">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-1 sticky top-0 bg-[#F2F2F7]/90 backdrop-blur-md z-10">
          <button className="flex items-center text-[#007AFF] font-medium -ml-2 p-2">
            <ChevronLeft size={24} />
            <span className="text-[17px]">More</span>
          </button>
        </div>

        <div className="px-4 mt-2 mb-6">
          <h1 className="text-[34px] font-bold text-black tracking-tight leading-tight">Settings</h1>
        </div>

        <div className="px-4 space-y-6">
          {/* Store */}
          <Section header="STORE" footer="Controls whether the store is accepting online orders.">
            <ToggleRow label="Store Open" active={true} />
            <InputRow label="Daily Special" value="Try our new cold brew!" />
            <InputRow label="Geo-fence Radius" value="5 km" border={false} />
          </Section>

          {/* Delivery */}
          <Section header="DELIVERY">
            <ToggleRow label="Delivery enabled" active={true} />
            <InputRow label="Delivery fee" value="$5.00" />
            <InputRow label="Min order value" value="$15.00" border={false} />
          </Section>

          {/* Loyalty */}
          <Section header="LOYALTY">
            <InputRow label="Stamps per coffee" value="1" />
            <InputRow label="Points per dollar" value="10" />
            <LinkRow label="Tier thresholds" border={false} />
          </Section>

          {/* Notifications */}
          <Section header="NOTIFICATIONS">
            <ToggleRow label="Order alerts" active={true} />
            <LinkRow label="Staff alerts" />
            <LinkRow label="Marketing emails" border={false} />
          </Section>

          {/* Banners */}
          <Section header="BANNERS">
            <LinkRow label="Active Announcements" value="4 active" />
            <LinkRow label="Scheduled" border={false} />
          </Section>

          {/* Managers */}
          <Section header="MANAGERS">
            <LinkRow label="Manage Team" value="3 managers" border={false} />
          </Section>

          {/* Demo */}
          <Section header="DEMO ACCOUNTS">
            <LinkRow label="Demo Accounts" value="4 accounts" border={false} />
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}

function Section({ header, footer, children }: { header?: string, footer?: string, children: React.ReactNode }) {
  return (
    <div>
      {header && <h2 className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 ml-4">{header}</h2>}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {children}
      </div>
      {footer && <p className="text-[13px] text-[#8E8E93] mt-2 ml-4 mr-4 leading-snug">{footer}</p>}
    </div>
  );
}

function ToggleRow({ label, active, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center justify-between bg-white ${border ? 'border-b border-gray-100' : ''}`}>
      <span className="text-[16px] text-black">{label}</span>
      <div className={`w-[51px] h-[31px] rounded-full p-[2px] transition-colors duration-200 ease-in-out ${active ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
        <div className={`w-[27px] h-[27px] bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${active ? 'translate-x-[20px]' : 'translate-x-0'}`} />
      </div>
    </div>
  );
}

function InputRow({ label, value, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center justify-between bg-white ${border ? 'border-b border-gray-100' : ''}`}>
      <span className="text-[16px] text-black w-1/3">{label}</span>
      <span className="text-[16px] text-[#8E8E93] text-right truncate w-2/3">{value}</span>
    </div>
  );
}

function LinkRow({ label, value, border = true }: any) {
  return (
    <button className={`w-full p-3.5 flex items-center justify-between bg-white active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <span className="text-[16px] text-black">{label}</span>
      <div className="flex items-center gap-2">
        {value && <span className="text-[16px] text-[#8E8E93]">{value}</span>}
        <ChevronRight size={20} className="text-[#C7C7CC]" />
      </div>
    </button>
  );
}
