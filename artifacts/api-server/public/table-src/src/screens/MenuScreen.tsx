import { useState } from "react";
import { ArrowLeft, ShoppingBag, X } from "lucide-react";
import { useCategories, useProducts } from "../hooks/useMenu";
import { useApp } from "../context";
import { ProductSheet } from "../components/ProductSheet";
import { CartSheet } from "../components/CartSheet";
import { CartBar } from "../components/CartBar";
import { formatCents } from "../utils";
import type { Category, Product } from "../types";

// ── Smart app banner (mobile only) ────────────────────────────────────────────

function AppBanner() {
  const { config } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("app_banner_dismissed") === "1"; } catch { return false; }
  });

  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (!isMobile || dismissed) return null;

  const deepLink = `butterfield://table/${encodeURIComponent(config.storeId)}/${encodeURIComponent(config.tableNumber)}`;
  const storeLink = "https://butterfieldcookies.com.au/pages/app";

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 shrink-0"
      style={{ background: "#1B4FD8", borderBottom: "1px solid rgba(255,255,255,0.10)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">Open in Butterfield app</p>
        <p className="text-[11px] text-[#888] mt-0.5">
          <a
            href={storeLink}
            className="text-[#E8C87A] underline"
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get the app
          </a>
        </p>
      </div>
      <button
        onClick={() => { window.location.href = deepLink; }}
        className="shrink-0 text-sm font-semibold px-3.5 py-1.5 rounded-full"
        style={{ background: "#D20001", color: "#FFFFFF" }}
      >
        Open
      </button>
      <button
        onClick={() => {
          try { sessionStorage.setItem("app_banner_dismissed", "1"); } catch {}
          setDismissed(true);
        }}
        className="shrink-0 p-1"
        style={{ color: "#555" }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({ tableNumber, onOpenCart }: { tableNumber: string; onOpenCart: () => void }) {
  const { cartCount } = useApp();
  return (
    <header
      className="bg-white shrink-0 border-b border-[#F0EDE8]"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
    >
      <div className="flex items-center justify-between px-5 pb-3">
        {/* Logo — bigger than before */}
        <img
          src="/api/static/butterfield-logo.svg"
          alt="Butterfield Cookies"
          className="h-9"
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = "none";
            const parent = el.parentElement;
            if (parent && !parent.querySelector("span")) {
              const text = document.createElement("span");
              text.className = "text-lg font-black text-[#1A1A1A] tracking-tight";
              text.textContent = "Butterfield";
              parent.appendChild(text);
            }
          }}
        />

        <div className="flex items-center gap-2">
          {/* Table badge */}
          <div
            className="flex items-center gap-1.5 px-3 h-9 rounded-full shrink-0"
            style={{ background: "#1A1A1A" }}
          >
            <span className="text-[#888] text-xs font-semibold leading-none">Table</span>
            <span className="text-white text-sm font-black leading-none">{tableNumber}</span>
          </div>

          {/* Cart icon — cherry red when cart has items */}
          <button
            onClick={onOpenCart}
            className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
            style={{ background: cartCount > 0 ? "#D20001" : "#F0EDE8" }}
            aria-label="View cart"
          >
            <ShoppingBag size={16} color={cartCount > 0 ? "#fff" : "#5A5550"} />
            {cartCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center leading-none font-bold"
                style={{ fontSize: "9px" }}
              >
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

// ── Category colour palette (mirrors portal's categoryColors.ts) ──────────────

interface CatVisual { bg: string; text: string; gradient?: string; }

const CATEGORY_COLORS: Record<string, CatVisual> = {
  cookies:        { bg: "#E8C49A", text: "#3D1F0A" },
  coffee:         { bg: "#8B6244", text: "#FFFFFF" },
  matcha:         { bg: "#C8E6C2", text: "#1E4020" },
  tea:            { bg: "#D4C4A8", text: "#4A3820" },
  "cold-drinks":  { bg: "#BDE0F4", text: "#0E3A5A" },
  "iced-drinks":  { bg: "#60A5FA", text: "#0C2A5A" },
  milkshakes:     { bg: "#1E3A5F", text: "#FFFFFF" },
  fusions:        { bg: "#DC2626", text: "#FFFFFF", gradient: "linear-gradient(135deg, #DC2626 0%, #2563EB 100%)" },
  "soft-serve":   { bg: "#F8D8E8", text: "#6A1040" },
  desserts:       { bg: "#F2B8C6", text: "#6A2040" },
  sandwiches:     { bg: "#A8C89A", text: "#1A3010" },
  bundles:        { bg: "#B4A0D4", text: "#2A1060" },
  boxes:          { bg: "#D4BAE8", text: "#3A1060" },
  specials:       { bg: "#FFE5A0", text: "#5A3800" },
  seasonal:       { bg: "#F4D0A8", text: "#4A2010" },
  merch:          { bg: "#A8C8E8", text: "#0A2850" },
  pastries:       { bg: "#F0D4A8", text: "#4A2010" },
};

const FALLBACK_COLORS: CatVisual[] = [
  { bg: "#E8C49A", text: "#3D1F0A" },
  { bg: "#C8E6C2", text: "#1E4020" },
  { bg: "#BDE0F4", text: "#0E3A5A" },
  { bg: "#D4C4A8", text: "#4A3820" },
  { bg: "#F2B8C6", text: "#6A2040" },
];

function getCatVisual(slug: string, index: number): CatVisual {
  return CATEGORY_COLORS[slug] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}

// ── Root screen ───────────────────────────────────────────────────────────────
//
// Cart bar, cart sheet, and product sheet are ALL lifted here so they survive
// category-switching. Previously CartBar was only inside ProductListScreen,
// which caused it to vanish when navigating back to the category grid.

export function MenuScreen() {
  const { config } = useApp();
  const { categories, loading: catsLoading } = useCategories();
  const { products, loading: prodsLoading, error } = useProducts();
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const loading = catsLoading || prodsLoading;
  const activeCategory = categories.find((c) => c.id === activeCatId) ?? null;
  const categoryProducts = activeCatId
    ? products.filter(
        (p) =>
          (p.active || p.isSoldOut) &&
          (p.categoryId === activeCatId || p.category === activeCategory?.slug)
      )
    : [];

  return (
    <div className="h-dvh bg-white flex flex-col overflow-hidden">
      <AppBanner />

      {/* Header is always mounted — table circle + cart icon always visible */}
      <Header tableNumber={config.tableNumber} onOpenCart={() => setCartOpen(true)} />

      {activeCatId && activeCategory ? (
        <ProductListScreen
          category={activeCategory}
          categoryIndex={categories.findIndex((c) => c.id === activeCatId)}
          products={categoryProducts}
          onBack={() => setActiveCatId(null)}
          onSelectProduct={setSelectedProductId}
        />
      ) : (
        <CategoryView
          categories={categories}
          products={products}
          loading={loading}
          error={!!error}
          onSelect={(catId) => setActiveCatId(catId)}
        />
      )}

      {/* Global overlays — always at top level, survive category switches */}
      <CartBar onOpen={() => setCartOpen(true)} />
      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} />}
      {selectedProductId && (
        <ProductSheet productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
      )}
    </div>
  );
}

// ── Category view (home screen) ───────────────────────────────────────────────

function CategoryView({
  categories,
  products,
  loading,
  error,
  onSelect,
}: {
  categories: Category[];
  products: Product[];
  loading: boolean;
  error: boolean;
  onSelect: (catId: string) => void;
}) {
  const countFor = (cat: Category) =>
    products.filter(
      (p) => (p.active || p.isSoldOut) && (p.categoryId === cat.id || p.category === cat.slug)
    ).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 pt-5 pb-4 shrink-0">
        <h1 className="text-[34px] font-black text-[#1A1A1A] tracking-tight leading-none whitespace-nowrap">
          What would you like?
        </h1>
      </div>

      <main
        className="flex-1 overflow-y-auto no-scrollbar px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7rem)" }}
      >
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`rounded-3xl animate-pulse bg-[#EDE8E1] ${i < 2 ? "h-52" : "h-40"}`} />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-bold text-[#1A1A1A] text-lg">Couldn't load the menu</p>
            <p className="text-sm text-[#8A8580] mt-1">Ask a staff member for assistance</p>
          </div>
        )}

        {!loading && !error && categories.length > 0 && (
          <CategoryGrid categories={categories} countFor={countFor} onSelect={onSelect} />
        )}

        {!loading && !error && categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-bold text-[#1A1A1A] text-lg">Menu coming soon</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Category grid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  categories,
  countFor,
  onSelect,
}: {
  categories: Category[];
  countFor: (cat: Category) => number;
  onSelect: (catId: string) => void;
}) {
  const topTwo = categories.slice(0, 2);
  const rest = categories.slice(2);

  return (
    <div className="flex flex-col gap-3">
      {topTwo.length > 0 && (
        <div className={`grid gap-3 ${topTwo.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {topTwo.map((cat, i) => (
            <CategoryCard key={cat.id} cat={cat} index={i} count={countFor(cat)} tall onSelect={onSelect} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {rest.map((cat, i) => (
            <CategoryCard key={cat.id} cat={cat} index={i + 2} count={countFor(cat)} tall={false} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryCard({
  cat,
  index,
  count,
  tall,
  onSelect,
}: {
  cat: Category;
  index: number;
  count: number;
  tall: boolean;
  onSelect: (catId: string) => void;
}) {
  const { bg, text, gradient } = getCatVisual(cat.slug, index);

  return (
    <button
      onClick={() => onSelect(cat.id)}
      className={`relative rounded-3xl overflow-hidden text-left active:scale-[0.96] transition-transform ${
        tall ? "h-52" : "h-40"
      }`}
      style={{ background: gradient ?? bg }}
      data-testid={`category-card-${cat.slug}`}
      aria-label={cat.name}
    >
      {/* Name anchored bottom — no emoji, no background image */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 gap-0.5">
        {count > 0 && (
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: text, opacity: 0.6 }}
          >
            {count} item{count !== 1 ? "s" : ""}
          </p>
        )}
        <h2
          className="font-black tracking-tight leading-none"
          style={{ color: text, fontSize: tall ? "24px" : "19px" }}
        >
          {cat.name.toUpperCase()}
        </h2>
      </div>
    </button>
  );
}

// ── Product list screen ────────────────────────────────────────────────────────

function ProductListScreen({
  category,
  categoryIndex,
  products,
  onBack,
  onSelectProduct,
}: {
  category: Category;
  categoryIndex: number;
  products: Product[];
  onBack: () => void;
  onSelectProduct: (id: string) => void;
}) {
  const { bg, text } = getCatVisual(category.slug, categoryIndex);

  return (
    <div className="flex-1 flex flex-col min-h-0 animate-slide-in-right">
      {/* Coloured category banner — no emoji, no background image */}
      <header className="shrink-0" style={{ background: bg }}>
        <div className="px-5 pt-4 pb-5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-4"
            style={{ color: text, opacity: 0.7 }}
          >
            <ArrowLeft size={17} strokeWidth={2.5} />
            <span className="text-sm font-semibold">Menu</span>
          </button>
          <h1
            className="font-black tracking-tight leading-none"
            style={{ color: text, fontSize: "28px" }}
          >
            {category.name.toUpperCase()}
          </h1>
        </div>
      </header>

      {/* Product list — safe-area-aware bottom padding */}
      <main
        className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7rem)" }}
      >
        {products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-bold text-[#1A1A1A] text-lg">No items here yet</p>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={() => onSelectProduct(product.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

// ── Product card ───────────────────────────────────────────────────────────────

function ProductCard({ product, onSelect }: { product: Product; onSelect: () => void }) {
  const price = product.salePriceCents ?? product.priceCents;
  const isOnSale =
    product.salePriceCents != null && product.salePriceCents < (product.priceCents ?? Infinity);
  const soldOut = product.isSoldOut || !product.active;

  return (
    <button
      onClick={onSelect}
      disabled={soldOut}
      className={`flex items-center justify-between gap-3 bg-white rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98] w-full ${
        soldOut ? "opacity-50" : ""
      }`}
      style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)" }}
      data-testid={`product-card-${product.id}`}
    >
      {/* Text only — no images, no emojis */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[#1A1A1A] text-[16px] leading-tight">{product.name}</p>
        {product.description && (
          <p className="text-xs text-[#8A8580] mt-0.5 line-clamp-1 leading-relaxed">
            {product.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {price != null &&
            (isOnSale ? (
              <>
                <span className="font-black text-[#D20001] text-[15px]">
                  {formatCents(product.salePriceCents!)}
                </span>
                <span className="text-xs line-through text-[#C0BAB3]">
                  {formatCents(product.priceCents!)}
                </span>
              </>
            ) : (
              <span className="font-black text-[#1A1A1A] text-[15px]">{formatCents(price)}</span>
            ))}
          {soldOut && (
            <span className="text-[11px] font-semibold text-[#8A8580] uppercase tracking-wide">
              Sold out
            </span>
          )}
        </div>
      </div>

      {/* Cherry-red add button */}
      {!soldOut && (
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#D20001" }}
        >
          <span
            className="text-white font-light leading-none select-none"
            style={{ fontSize: "22px", marginTop: "-1px" }}
          >
            +
          </span>
        </div>
      )}
    </button>
  );
}
