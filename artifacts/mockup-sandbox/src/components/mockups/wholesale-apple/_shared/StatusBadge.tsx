import React from 'react';

export default function StatusBadge({ status }: { status: string }) {
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-800';
  let label = status.toUpperCase();

  switch (status.toLowerCase()) {
    case 'pending':
      bgColor = 'bg-[#007AFF]/10';
      textColor = 'text-[#007AFF]';
      break;
    case 'processing':
      bgColor = 'bg-[#FF9500]/10';
      textColor = 'text-[#FF9500]';
      break;
    case 'dispatched':
      bgColor = 'bg-[#AF52DE]/10';
      textColor = 'text-[#AF52DE]';
      break;
    case 'delivered':
    case 'paid':
    case 'approved':
      bgColor = 'bg-[#34C759]/10';
      textColor = 'text-[#34C759]';
      break;
    case 'cancelled':
    case 'overdue':
    case 'suspended':
      bgColor = 'bg-[#FF3B30]/10';
      textColor = 'text-[#FF3B30]';
      break;
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
}
