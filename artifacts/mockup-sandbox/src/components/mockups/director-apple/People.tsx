import React, { useState } from 'react';
import AppLayout from './_shared/AppLayout';

export default function People() {
  const [segment, setSegment] = useState('Staff');
  const segments = ['Staff', 'Wholesale', 'Customers', 'All'];

  return (
    <AppLayout activeTab="people">
      <div className="flex flex-col h-full">
        <div className="pt-4 px-4 pb-4 bg-[#F2F2F7] sticky top-0 z-10">
          <h1 className="text-[34px] font-bold tracking-tight text-black mb-4">People</h1>
          
          {/* iOS Segmented Control */}
          <div className="bg-gray-200/80 p-0.5 rounded-[9px] flex">
            {segments.map(s => (
              <button
                key={s}
                onClick={() => setSegment(s)}
                className={`flex-1 py-1.5 text-[13px] font-semibold rounded-[7px] transition-all ${
                  segment === s ? 'bg-white text-black shadow-sm' : 'text-black/70'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <StaffRow initials="JC" name="James Chen" role="Director" status="On Shift" color="bg-blue-100 text-blue-700" />
            <StaffRow initials="MW" name="Mia Wong" role="Barista" status="On Shift" color="bg-purple-100 text-purple-700" />
            <StaffRow initials="LS" name="Lucas Smith" role="Front of House" status="Needs Approval" color="bg-orange-100 text-orange-700" />
            <StaffRow initials="OR" name="Olivia Roberts" role="Baker" status="Off Shift" color="bg-pink-100 text-pink-700" />
            <StaffRow initials="DK" name="David Kim" role="Barista" status="Off Shift" color="bg-green-100 text-green-700" border={false} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StaffRow({ initials, name, role, status, color, border = true }: any) {
  const isPending = status === 'Needs Approval';
  
  return (
    <div className={`p-4 ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold ${color}`}>
            {initials}
          </div>
          <div>
            <div className="text-[16px] font-semibold text-black">{name}</div>
            <div className="text-[14px] text-[#8E8E93]">{role}</div>
          </div>
        </div>
        
        {!isPending && (
          <span className={`text-[13px] font-medium px-2 py-1 rounded-full ${
            status === 'On Shift' ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#8E8E93]/10 text-[#8E8E93]'
          }`}>
            {status}
          </span>
        )}
      </div>
      
      {isPending && (
        <div className="mt-4 flex gap-2">
          <button className="flex-1 bg-[#34C759] text-white py-2 rounded-lg text-[14px] font-semibold active:opacity-80">
            Approve
          </button>
          <button className="flex-1 bg-[#FF3B30]/10 text-[#FF3B30] py-2 rounded-lg text-[14px] font-semibold active:bg-[#FF3B30]/20">
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
