import React from 'react';

interface StatusBadgeProps {
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: { color: 'bg-[#FF9500]/10 text-[#FF9500]', label: 'Pending' },
    preparing: { color: 'bg-[#007AFF]/10 text-[#007AFF]', label: 'Preparing' },
    ready: { color: 'bg-[#34C759]/10 text-[#34C759]', label: 'Ready' },
    completed: { color: 'bg-[#8E8E93]/10 text-[#8E8E93]', label: 'Completed' },
    cancelled: { color: 'bg-[#FF3B30]/10 text-[#FF3B30]', label: 'Cancelled' }
  };

  const { color, label } = config[status];

  return (
    <span className={`px-2 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}
