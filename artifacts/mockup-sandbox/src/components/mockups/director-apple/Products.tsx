import React, { useState } from 'react';
import AppLayout from './_shared/AppLayout';
import { Search, ChevronRight } from 'lucide-react';

export default function Products() {
  const [filter, setFilter] = useState('All');
  const filters = ['All', 'Cookies', 'Coffee', 'Desserts', 'Sandwiches', 'Bundles'];

  return (
    <AppLayout activeTab="products">
      <div className="flex flex-col h-full">
        <div className="pt-4 px-4 pb-2 bg-[#F2F2F7] sticky top-0 z-10">
          <h1 className="text-[34px] font-bold tracking-tight text-black mb-3">Products</h1>
          
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={20} />
            <input 
              type="text" 
              placeholder="Search" 
              className="w-full bg-gray-200/80 rounded-[10px] py-2 pl-10 pr-4 text-[17px] text-black placeholder:text-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/50"
            />
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

        <div className="px-4 pb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <ProductRow name="Choc Chip Cookie" price="$4.50" available={true} badge="FEATURED" />
            <ProductRow name="Macadamia & White Choc" price="$5.00" available={true} />
            <ProductRow name="Double Choc Fudge" price="$4.50" available={false} />
            <ProductRow name="Flat White" price="$5.50" available={true} />
            <ProductRow name="Latte" price="$5.50" available={true} />
            <ProductRow name="Cold Brew" price="$6.00" available={true} badge="NEW" />
            <ProductRow name="Lemon Tart" price="$7.50" available={true} />
            <ProductRow name="Chicken Sourdough" price="$12.50" available={false} border={false} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ProductRow({ name, price, available, badge, border = true }: any) {
  return (
    <div className={`p-3.5 flex items-center active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''} ${!available ? 'opacity-60 grayscale-[0.5]' : ''}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[16px] font-semibold text-black">{name}</span>
          {badge && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${
              badge === 'NEW' ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#007AFF]/10 text-[#007AFF]'
            }`}>
              {badge}
            </span>
          )}
        </div>
        <span className="text-[14px] text-[#8E8E93] font-medium">{price}</span>
      </div>
      
      <div className="flex items-center gap-4">
        {/* iOS style toggle */}
        <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${available ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
          <div className={`w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${available ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
        <ChevronRight size={20} className="text-[#C7C7CC]" />
      </div>
    </div>
  );
}
