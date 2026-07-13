import React from 'react';
import WholesaleDashboard from './WholesaleDashboard';
import WholesaleOrders from './WholesaleOrders';
import WholesaleCatalog from './WholesaleCatalog';
import WholesaleInvoices from './WholesaleInvoices';
import DirectorWholesaleAccounts from './DirectorWholesaleAccounts';
import './_group.css';

export default function Overview() {
  return (
    <div className="wholesale-apple-theme w-[100vw] h-[100vh] bg-[#0A0F1E] overflow-hidden relative font-sans flex items-center justify-center">
      {/* Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#007AFF]/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#34C759]/20 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Hero Text */}
      <div className="absolute left-[8%] top-[35%] z-20">
        <h1 className="text-white text-[80px] font-bold leading-tight tracking-tight mb-4 shadow-black/50 drop-shadow-lg">
          Butterfield<br />Wholesale
        </h1>
        <p className="text-white/70 text-[28px] font-medium tracking-wide">
          Business ordering.<br />Beautifully done.
        </p>
      </div>

      {/* Phone Mockups */}
      <div className="absolute right-[5%] top-1/2 -translate-y-1/2 w-[1200px] h-[800px] flex items-center justify-center">
        
        {/* Mockframe 1: Invoices (Back Left) */}
        <div className="absolute left-[0%] top-[15%] scale-[0.6] opacity-80 -rotate-6 shadow-2xl transition-transform duration-700 hover:scale-[0.65] hover:opacity-100 hover:z-30">
          <MockupFrame>
            <WholesaleInvoices />
          </MockupFrame>
        </div>

        {/* Mockframe 2: Orders (Mid Left) */}
        <div className="absolute left-[15%] top-[30%] scale-[0.7] opacity-90 -rotate-3 shadow-2xl transition-transform duration-700 hover:scale-[0.75] hover:opacity-100 hover:z-30">
          <MockupFrame>
            <WholesaleOrders />
          </MockupFrame>
        </div>

        {/* Mockframe 3: Catalog (Right) */}
        <div className="absolute left-[55%] top-[25%] scale-[0.7] opacity-90 rotate-3 shadow-2xl transition-transform duration-700 hover:scale-[0.75] hover:opacity-100 hover:z-30">
          <MockupFrame>
            <WholesaleCatalog />
          </MockupFrame>
        </div>

        {/* Mockframe 4: Director View (Back Right) */}
        <div className="absolute left-[70%] top-[10%] scale-[0.6] opacity-70 rotate-6 shadow-2xl transition-transform duration-700 hover:scale-[0.65] hover:opacity-100 hover:z-30">
          <MockupFrame>
            <DirectorWholesaleAccounts />
          </MockupFrame>
        </div>

        {/* Mockframe 5: Dashboard (Center/Hero) */}
        <div className="absolute left-[30%] top-[10%] scale-[0.85] z-20 shadow-2xl transition-transform duration-700 hover:scale-[0.9]">
          <MockupFrame>
            <WholesaleDashboard />
          </MockupFrame>
        </div>

      </div>
    </div>
  );
}

function MockupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[410px] h-[864px] bg-black rounded-[50px] p-[10px] shadow-[0_0_0_1px_rgba(255,255,255,0.1),_0_20px_40px_rgba(0,0,0,0.5)] relative">
      {/* Dynamic Island Notch */}
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-[20px] z-50"></div>
      
      {/* Screen Area */}
      <div className="w-[390px] h-[844px] rounded-[40px] overflow-hidden bg-[#F2F2F7] relative">
        <div className="absolute inset-0 pointer-events-none scale-100 origin-top-left">
          {children}
        </div>
      </div>
    </div>
  );
}
