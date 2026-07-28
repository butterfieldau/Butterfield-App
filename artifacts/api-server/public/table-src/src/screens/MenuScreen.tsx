import { useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { useCategories, useProducts } from "../hooks/useMenu";
import { useApp } from "../context";
import { ProductSheet } from "../components/ProductSheet";
import { CartSheet } from "../components/CartSheet";
import { CartBar } from "../components/CartBar";
import { formatCents, dietaryLabel } from "../utils";
import type { Product } from "../types";

export function MenuScreen() {
  const { config } = useApp();
  const { categories } = useCategories();
  const { products, loading, error } = useProducts();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

  // Filter products
  const filtered = products.filter((p) => {
    if (!p.active && !p.isSoldOut) return false;
    if (activeCat !== "all" && p.category !== activeCat && p.categoryId !== activeCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by category for display
  const grouped = (() => {
    if (activeCat !== "all" || search.trim()) {
      return [{ slug: activeCat, name: "", products: filtered }];
    }
    const result: { slug: string; name: string; products: Product[] }[] = [];
    const used = new Set<string>();

    for (const cat of categories) {
      const catProducts = filtered.filter(
        (p) => p.category === cat.slug || p.categoryId === cat.id
      );
      if (catProducts.length > 0) {
        result.push({ slug: cat.slug, name: cat.name, products: catProducts });
        catProducts.forEach((p) => used.add(p.id));
      }
    }
    // Uncategorised
    const rest = filtered.filter((p) => !used.has(p.id));
    if (rest.length > 0) result.push({ slug: "other", name: "More", products: rest });
    return result;
  })();

  function scrollToCategory(slug: string) {
    setActiveCat(slug);
    const el = categoryRefs.current[slug];
    if (el) {
      const offset = 120;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }

  return (
    <div className="min-h-dvh bg-[#fdf8f3]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 safe-top">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <img
                src="/api/static/butterfield-logo.svg"
                alt="Butterfield Cookies"
                className="h-6"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Table</p>
              <p className="text-lg font-bold text-gray-900 leading-tight">{config.tableNumber}</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="w-full pl-9 pr-9 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {!search && categories.length > 0 && (
          <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
            <CategoryTab
              label="All"
              active={activeCat === "all"}
              onClick={() => setActiveCat("all")}
            />
            {categories.map((cat) => (
              <CategoryTab
                key={cat.id}
                label={cat.name}
                active={activeCat === cat.slug}
                onClick={() => scrollToCategory(cat.slug)}
              />
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="pb-28 px-4 pt-4">
        {loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-3xl mb-3">😔</p>
            <p className="font-medium">Couldn't load the menu</p>
            <p className="text-sm mt-1">Please ask a staff member for assistance</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-medium">Nothing found</p>
            <p className="text-sm mt-1">Try a different search term</p>
          </div>
        )}

        {!loading &&
          grouped.map((group) => (
            <section
              key={group.slug}
              ref={(el) => { categoryRefs.current[group.slug] = el; }}
              className="mb-6"
            >
              {group.name && (
                <h2 className="font-bold text-gray-900 text-lg mb-3">{group.name}</h2>
              )}
              <div className="flex flex-col gap-3">
                {group.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={() => setSelectedProductId(product.id)}
                  />
                ))}
              </div>
            </section>
          ))}
      </main>

      {/* Modals */}
      {selectedProductId && (
        <ProductSheet
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} />}

      <CartBar onOpen={() => setCartOpen(true)} />
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
        active
          ? "bg-[#0b70f8] text-white"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: Product;
  onSelect: () => void;
}) {
  const image = product.images[0];
  const price = product.salePriceCents ?? product.priceCents;
  const isOnSale = product.salePriceCents != null && product.salePriceCents < (product.priceCents ?? Infinity);
  const soldOut = product.isSoldOut || !product.active;

  return (
    <button
      onClick={onSelect}
      disabled={soldOut}
      className={`flex items-center gap-3 bg-white rounded-2xl p-3 text-left transition-all active:scale-[0.98] ${
        soldOut ? "opacity-60" : "shadow-sm hover:shadow-md"
      }`}
    >
      {image && (
        <div className="relative shrink-0">
          <img
            src={image}
            alt={product.name}
            className="w-20 h-20 rounded-xl object-cover"
          />
          {soldOut && (
            <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center">
              <span className="text-xs font-bold text-gray-500">Sold out</span>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm leading-tight">{product.name}</p>
        {product.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}
        {product.dietaryTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {product.dietaryTags.slice(0, 3).map((tag) => {
              const { label, color } = dietaryLabel(tag);
              return (
                <span key={tag} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${color}`}>
                  {label}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {price != null && (
            <>
              {isOnSale ? (
                <>
                  <span className="font-bold text-[#0b70f8] text-sm">{formatCents(product.salePriceCents!)}</span>
                  <span className="text-xs line-through text-gray-400">{formatCents(product.priceCents!)}</span>
                </>
              ) : (
                <span className="font-bold text-gray-900 text-sm">{formatCents(price)}</span>
              )}
            </>
          )}
        </div>
      </div>
      {!soldOut && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-[#0b70f8] flex items-center justify-center text-white font-bold text-lg">
          +
        </div>
      )}
    </button>
  );
}
