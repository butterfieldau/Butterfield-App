import React from 'react';
import Dashboard from './Dashboard';
import Orders from './Orders';
import Products from './Products';
import People from './People';
import More from './More';
import './_group.css';

export default function Overview() {
  return (
    <div className="director-apple-theme w-screen h-screen bg-[#0A0A14] bg-gradient-to-br from-[#0A0A14] via-[#111122] to-[#0A0A14] overflow-hidden flex items-center justify-center relative font-sans">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#007AFF]/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-[#5856D6]/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Title Text */}
      <div className="absolute top-[8%] left-[8%] z-10 text-white">
        <h1 className="text-[72px] font-bold tracking-tighter leading-none mb-4">
          Butterfield<br/>Director
        </h1>
        <p className="text-[28px] text-white/60 font-medium tracking-tight">
          Run your business. Beautifully.
        </p>
      </div>

      {/* Composition wrapper */}
      <div className="relative w-full max-w-[1600px] h-full flex items-center justify-center">
        
        {/* Phone 1: Dashboard (Center-Left, Hero) */}
        <div className="absolute z-50 transform -translate-x-[200px] scale-[0.85] shadow-2xl hover:scale-[0.88] transition-transform duration-700 ease-out">
          <PhoneMockup>
            <Dashboard />
          </PhoneMockup>
        </div>

        {/* Phone 2: Orders (Right, tilted) */}
        <div className="absolute z-40 transform translate-x-[250px] -translate-y-[80px] rotate-[8deg] scale-[0.7] opacity-90 shadow-2xl">
          <PhoneMockup>
            <Orders />
          </PhoneMockup>
        </div>

        {/* Phone 3: Products (Far Right, tilted more) */}
        <div className="absolute z-30 transform translate-x-[600px] translate-y-[100px] rotate-[15deg] scale-[0.6] opacity-70 shadow-2xl">
          <PhoneMockup>
            <Products />
          </PhoneMockup>
        </div>

        {/* Phone 4: People (Left, behind) */}
        <div className="absolute z-40 transform -translate-x-[650px] -translate-y-[40px] -rotate-[10deg] scale-[0.65] opacity-85 shadow-2xl">
          <PhoneMockup>
            <People />
          </PhoneMockup>
        </div>

        {/* Phone 5: More (Far left, far behind) */}
        <div className="absolute z-30 transform -translate-x-[950px] translate-y-[150px] -rotate-[18deg] scale-[0.55] opacity-50 shadow-2xl">
          <PhoneMockup>
            <More />
          </PhoneMockup>
        </div>

      </div>
    </div>
  );
}

function PhoneMockup({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[390px] h-[844px] rounded-[55px] p-[12px] bg-[#1A1A1A] shadow-[0_0_0_1px_#333,0_40px_80px_rgba(0,0,0,0.5)]">
      {/* Screen area with clip */}
      <div className="relative w-full h-full rounded-[43px] overflow-hidden bg-white">
        {children}
      </div>
      
      {/* Dynamic Island */}
      <div className="absolute top-[22px] left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-full z-[100]"></div>
    </div>
  );
}
