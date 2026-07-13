import React from 'react';
import AppLayout from './_shared/AppLayout';
import { Search, Minus, Plus, ShoppingBag } from 'lucide-react';

export default function WholesaleCatalog() {
  const categories = ['All', 'Cookies', 'Coffee', 'Desserts', 'Sandwiches', 'Bundles'];

  return (
    <AppLayout activeTab="catalog">
      <div className="flex flex-col h-full">
        <div className="pt-4 px-4 pb-2 bg-[#F2F2F7] sticky top-0 z-10">
          <h1 className="text-[34px] font-bold tracking-tight text-black mb-3">Catalog</h1>
          
          {/* Banner */}
          <div className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-xl p-3 mb-4 flex items-center justify-center">
            <span className="text-[13px] font-semibold text-[#007AFF]">Your Silver Tier discount: 20% off all products</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8E8E93]" />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="w-full bg-[#E3E3E8] text-black placeholder-[#8E8E93] rounded-xl py-2 pl-9 pr-4 text-[16px] outline-none"
            />
          </div>

          {/* Categories */}
          <div className="flex overflow-x-auto -mx-4 px-4 pb-2 gap-2 snap-x">
            {categories.map((c, i) => (
              <button
                key={c}
                className={`px-4 py-1.5 rounded-full text-[14px] font-medium shrink-0 snap-start transition-colors ${
                  i === 0 ? 'bg-black text-white' : 'bg-white text-black border border-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-24 grid grid-cols-2 gap-3">
          <ProductCard name="Choc Chip Cookie Box (24pk)" origPrice="$56.25" price="$45.00" qty={2} />
          <ProductCard name="Macadamia Cookie Box (24pk)" origPrice="$60.00" price="$48.00" qty={0} />
          <ProductCard name="1kg Espresso Blend Beans" origPrice="$40.00" price="$32.00" qty={0} />
          <ProductCard name="Lemon Tart Whole (10 inch)" origPrice="$75.00" price="$60.00" qty={1} />
          <ProductCard name="Flat White Blend (1kg)" origPrice="$42.00" price="$33.60" qty={0} />
          <ProductCard name="Brownie Slab (16 slices)" origPrice="$50.00" price="$40.00" qty={0} />
        </div>
      </div>

      {/* Floating Cart Strip */}
      <div className="absolute bottom-[83px] w-full px-4 pb-4 pointer-events-none z-50">
        <div className="bg-black text-white rounded-2xl shadow-xl p-4 flex justify-between items-center pointer-events-auto">
           <div className="flex flex-col">
             <span className="text-[13px] font-medium text-gray-300">4 items</span>
             <span className="text-[17px] font-bold">$127.60</span>
           </div>
           <button className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl text-[15px] font-semibold active:bg-white/30 transition-colors">
             Place Order <span className="text-[18px]">→</span>
           </button>
        </div>
      </div>
    </AppLayout>
  );
}

function ProductCard({ name, origPrice, price, qty }: { name: string, origPrice: string, price: string, qty: number }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col h-full justify-between">
       <div>
         <div className="w-full aspect-square bg-[#F2F2F7] rounded-xl mb-3 flex items-center justify-center">
            <ShoppingBag size={32} className="text-gray-300" />
         </div>
         <h3 className="text-[14px] font-semibold text-black leading-tight mb-2 line-clamp-2">{name}</h3>
       </div>
       
       <div>
         <div className="flex items-center gap-1.5 mb-3">
           <span className="text-[12px] text-[#8E8E93] line-through">{origPrice}</span>
           <span className="text-[15px] font-bold text-[#007AFF]">{price}</span>
         </div>
         
         {qty > 0 ? (
           <div className="flex items-center justify-between bg-black text-white rounded-lg p-1">
             <button className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-md active:bg-white/30"><Minus size={16} /></button>
             <span className="text-[15px] font-bold">{qty}</span>
             <button className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-md active:bg-white/30"><Plus size={16} /></button>
           </div>
         ) : (
           <button className="w-full bg-[#F2F2F7] text-[#007AFF] font-bold text-[14px] py-2 rounded-lg active:bg-[#E5E5EA]">
             Add
           </button>
         )}
       </div>
    </div>
  );
}
