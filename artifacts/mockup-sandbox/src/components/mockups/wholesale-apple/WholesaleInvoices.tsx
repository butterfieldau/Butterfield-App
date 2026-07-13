import React from 'react';
import AppLayout from './_shared/AppLayout';
import StatusBadge from './_shared/StatusBadge';
import { AlertCircle, Download, ChevronRight } from 'lucide-react';

export default function WholesaleInvoices() {
  return (
    <AppLayout activeTab="invoices">
      <div className="p-4 space-y-6">
        <div className="mt-4">
          <h1 className="text-[34px] font-bold tracking-tight text-black mb-4">Invoices</h1>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#FF9500]/30 overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#FF9500]"></div>
          <div className="p-5 pl-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-[#FF9500]" />
              <span className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider">Outstanding Balance</span>
            </div>
            <div className="text-[32px] font-bold text-black mb-4">$2,400.00</div>
            
            <div className="bg-[#F2F2F7] rounded-xl p-3.5 space-y-2">
               <div className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-2">Pay To</div>
               <div className="flex justify-between text-[14px]">
                 <span className="text-[#8E8E93]">Account Name</span>
                 <span className="font-medium text-black">Butterfield Cookies PTY LTD</span>
               </div>
               <div className="flex justify-between text-[14px]">
                 <span className="text-[#8E8E93]">BSB</span>
                 <span className="font-medium text-black">067 873</span>
               </div>
               <div className="flex justify-between text-[14px]">
                 <span className="text-[#8E8E93]">Account</span>
                 <span className="font-medium text-black">1465 8181</span>
               </div>
               <div className="flex justify-between text-[14px]">
                 <span className="text-[#8E8E93]">ABN</span>
                 <span className="font-medium text-black">24 680 761 166</span>
               </div>
            </div>
            
            <button className="w-full mt-4 bg-black text-white font-semibold text-[15px] py-3.5 rounded-xl shadow-sm active:bg-gray-800">
               Record Payment
            </button>
          </div>
        </div>

        {/* Invoice List */}
        <div>
          <h2 className="text-[17px] font-semibold text-black mb-3">Recent Invoices</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             <InvoiceRow id="INV-2024-0096" ref="PO-2024-0041" date="14 Jul 2024" amount="$127.60" status="pending" />
             <InvoiceRow id="INV-2024-0095" ref="PO-2024-0040" date="10 Jul 2024" amount="$2,400.00" status="overdue" />
             <InvoiceRow id="INV-2024-0094" ref="PO-2024-0039" date="01 Jul 2024" amount="$450.00" status="paid" />
             <InvoiceRow id="INV-2024-0093" ref="PO-2024-0038" date="25 Jun 2024" amount="$1,200.00" status="paid" />
             <InvoiceRow id="INV-2024-0092" ref="PO-2024-0037" date="15 Jun 2024" amount="$85.00" status="paid" border={false} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function InvoiceRow({ id, ref, date, amount, status, border = true }: any) {
  return (
    <div className={`p-4 flex items-center active:bg-gray-50 cursor-pointer transition-colors ${border ? 'border-b border-gray-100' : ''}`}>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[15px] font-bold text-black">{id}</span>
          <span className="text-[15px] font-bold text-black">{amount}</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-[13px] text-[#8E8E93]">{ref} • {date}</div>
          <div className="flex items-center gap-2">
            {status === 'overdue' && <AlertCircle size={14} className="text-[#FF3B30]" />}
            {status === 'paid' && <Download size={14} className="text-[#007AFF]" />}
            <StatusBadge status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
