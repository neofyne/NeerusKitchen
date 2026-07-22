import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  ChefHat,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Flame,
  Home,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { storefrontSupabase as supabase } from "./supabase";
import { ceilTimeToQuarter, formatTime12 } from "./promotionFormat";

type StoreView = "menu" | "cart" | "orders" | "account";
type Spice = "mild" | "medium" | "spicy";
type Wing = "" | "A" | "B" | "C" | "D";

type StoreMenuItem = {
  id: string;
  name: string;
  price: number;
  description: string;
  spice_level: Spice;
  photo_path: string | null;
  image_url?: string;
  is_featured: boolean;
  portions_available: number | null;
  promotion_message: string;
  promotion_until: string | null;
  category_id: string | null;
  unit_label: string;
};

type StoreCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
};

type Profile = {
  id: string;
  full_name: string;
  flat_number: string;
  email: string;
  phone: string;
  spice_preference: Spice;
  standing_instructions: string;
  access_status: "pending" | "approved" | "rejected";
};

type CustomerOrder = {
  id: string;
  created_at: string;
  amount: number;
  stage: string;
  payment_status: string;
  payment_reference: string | null;
  order_details: string;
  delivery_time: string | null;
};

type StoreSettings = {
  ordering_open: boolean;
  hero_message: string;
  upi_id: string;
  merchant_name: string;
  order_cutoff: string | null;
  whatsapp_number: string;
};

type OrderAlertResult = {
  automatic: boolean;
  whatsappUrl: string;
  status: "sent" | "business_api_failed" | "tap_to_send" | "no_recipient";
  includesPhoto?: boolean;
};

const starterImages: Record<string, string> = {
  "Veg sandwich": "/food/veg-sandwich.jpg",
  "Paneer sandwich": "/food/paneer-sandwich.jpg",
  "Masala khichdi": "/food/masala-khichdi.jpg",
  "Moong dal khichdi": "/food/moong-dal-khichdi.jpg",
  "Dal rice": "/food/dal-rice.jpg",
  "Rajma rice": "/food/rajma-rice.jpg",
  "Veg pulao": "/food/veg-pulao.jpg",
  "Curd rice": "/food/curd-rice.jpg",
  "Aloo paratha": "/food/aloo-paratha.jpg",
  "Aloo Parantha": "/food/aloo-paratha.jpg",
  "Plain Parantha": "/food/plain-parantha.jpg",
  "Green Chilli Parantha": "/food/green-chilli-parantha.jpg",
  "Missa Parantha": "/food/missa-parantha.jpg",
  "Paneer Parantha": "/food/paneer-parantha.jpg",
  "Vegetable Parantha": "/food/vegetable-parantha.jpg",
  "Besan Chilla": "/food/besan-chilla.jpg",
  Poha: "/food/poha.jpg",
};

const starterCatalog = [
  ["veg-sandwich", "Veg sandwich", 120],
  ["paneer-sandwich", "Paneer sandwich", 150],
  ["masala-khichdi", "Masala khichdi", 140],
  ["moong-dal-khichdi", "Moong dal khichdi", 130],
  ["dal-rice", "Dal rice", 140],
  ["rajma-rice", "Rajma rice", 160],
  ["veg-pulao", "Veg pulao", 150],
  ["curd-rice", "Curd rice", 130],
  ["aloo-paratha", "Aloo paratha", 90],
  ["poha", "Poha", 80],
].map(([id, name, price], index) => ({ id: String(id), name: String(name), price: Number(price), description: "Comforting home-style food, made fresh today.", spice_level: "mild", photo_path: null, image_url: starterImages[String(name)], is_featured: index < 3, portions_available: null, promotion_message: "", promotion_until: null, category_id: "starter", unit_label: "portion" })) as StoreMenuItem[];
const starterCategories: StoreCategory[] = [{ id: "starter", name: "Today’s dishes", slug: "todays-dishes", description: "Fresh home-style dishes prepared today.", sort_order: 0 }];
const stageLabels: Record<string, string> = {
  new: "Order placed",
  delivered: "Delivered",
};
const customerStage = (stage: string) => stage === "delivered" ? "delivered" : "new";
const showLocalDevicePreview = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname);

const defaultSettings: StoreSettings = {
  ordering_open: true,
  hero_message: "Fresh home-style food, prepared with care and delivered to your door.",
  upi_id: "krsnasolo@okicici",
  merchant_name: "Neeru's Home Kitchen",
  order_cutoff: null,
  whatsapp_number: "918483000013",
};

const localToday = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};

const formatMoney = (amount: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const splitFlatAddress = (value = "") => {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^([A-D])[-\s]?(\d+)$/);
  return match ? { wing: match[1] as Wing, number: match[2] } : { wing: "" as Wing, number: normalized.replace(/\D/g, "") };
};
const flatAddress = (wing: Wing, number: string) => `${wing}-${number}`;
const normalizeIndianPhone = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  return "";
};
const savedCart = (): Record<string, number> => {
  try {
    const value = JSON.parse(localStorage.getItem("neeru-cart") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
export function Storefront() {
  const [sharedDishId] = useState(() => new URLSearchParams(window.location.search).get("dish") || "");
  const [sharedCategoryPath] = useState(() => {
    const match = window.location.pathname.match(/^\/c\/([^/]+)(?:\/([^/]+))?/);
    const query = new URLSearchParams(window.location.search);
    return { categorySlug: match?.[1] ? decodeURIComponent(match[1]) : query.get("category") || "", heroSlug: match?.[2] ? decodeURIComponent(match[2]) : query.get("hero") || "" };
  });
  const [view, setView] = useState<StoreView>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<StoreMenuItem[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [cart, setCart] = useState<Record<string, number>>(savedCart);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null);
  const [placedAlert, setPlacedAlert] = useState<OrderAlertResult | null>(null);
  const [notice, setNotice] = useState("");
  const [phonePreview, setPhonePreview] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    localStorage.setItem("neeru-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setOrders([]);
      return;
    }
    loadProfile();
    loadOrders();
  }, [session]);

  async function loadStore() {
    if (!supabase) return setLoading(false);
    setLoading(true);
    const [{ data: menu }, { data: daily }, { data: configuration }, categoryResult] = await Promise.all([
      supabase.from("menu_items").select("id,name,price,description,spice_level,photo_path,category_id,unit_label").eq("is_active", true).order("name"),
      supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price,promotion_message,promotion_until").eq("menu_date", localToday()),
      supabase.from("storefront_settings").select("ordering_open,hero_message,upi_id,merchant_name,order_cutoff,whatsapp_number").eq("id", 1).maybeSingle(),
      supabase.from("dish_categories").select("id,name,slug,description,sort_order").eq("is_active", true).order("sort_order").order("name"),
    ]);
    const dailyMap = new Map((daily || []).map((entry) => [entry.menu_item_id, entry]));
    if (!menu) {
      setItems(starterCatalog);
      setCategories(starterCategories);
      setLoading(false);
      return;
    }
    setItems(menu.flatMap((row) => {
      const today = dailyMap.get(row.id);
      if (today && !today.is_available) return [];
      return [{
        ...row,
        price: Number(today?.special_price ?? row.price ?? 0),
        description: row.description || "Comforting home-style food, made fresh today.",
        spice_level: (row.spice_level || "mild") as Spice,
        image_url: row.photo_path ? `/api/photos?key=${encodeURIComponent(row.photo_path)}` : starterImages[row.name],
        is_featured: Boolean(today?.is_featured),
        portions_available: today?.portions_available ?? null,
        promotion_message: today?.promotion_message ?? "",
        promotion_until: today?.promotion_until?.slice(0, 5) ?? null,
        category_id: row.category_id || null,
        unit_label: row.unit_label || "portion",
      }];
    }));
    setCategories(categoryResult.data?.length ? categoryResult.data as StoreCategory[] : starterCategories);
    if (configuration) setSettings({ ...defaultSettings, ...configuration });
    setLoading(false);
  }

  async function loadProfile() {
    if (!supabase || !session) return;
    const { data } = await supabase.from("customer_profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (!data) return;
    const next = data as Profile;
    if (next.access_status === "rejected") {
      setNotice("This account is unavailable. Please contact Neeru’s Home Kitchen.");
      await supabase.auth.signOut();
      return;
    }
    setProfile(next);
  }

  async function loadOrders() {
    if (!supabase || !session) return;
    const { data } = await supabase.from("orders").select("id,created_at,amount,stage,payment_status,payment_reference,order_details,delivery_time").eq("customer_id", session.user.id).order("created_at", { ascending: false }).limit(30);
    setOrders((data || []) as CustomerOrder[]);
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => !query || `${item.name} ${item.description}`.toLowerCase().includes(query));
  }, [items, search]);
  const menuGroups = useMemo(() => {
    const known = categories.map((category) => ({ category, items: visibleItems.filter((item) => item.category_id === category.id) })).filter((group) => group.items.length);
    const knownIds = new Set(categories.map((category) => category.id));
    const uncategorized = visibleItems.filter((item) => !item.category_id || !knownIds.has(item.category_id));
    return uncategorized.length ? [...known, { category: { id: "other", name: "Other dishes", slug: "other-dishes", description: "More fresh dishes from our home kitchen.", sort_order: 999 }, items: uncategorized }] : known;
  }, [categories, visibleItems]);
  const featured = items.filter((item) => item.is_featured);
  const heroItem = featured[0] || items[0];
  const sharedDish = items.find((item) => item.id === sharedDishId);
  const sharedCategory = categories.find((category) => category.slug === sharedCategoryPath.categorySlug);
  const sharedCategoryItems = sharedCategory ? items.filter((item) => item.category_id === sharedCategory.id) : [];
  const sharedCategoryHero = sharedCategoryItems.find((item) => slugify(item.name) === sharedCategoryPath.heroSlug) || sharedCategoryItems[0];
  const currentTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date());
  const acceptingOrders = settings.ordering_open && (!settings.order_cutoff || currentTime <= settings.order_cutoff.slice(0, 5));
  const cartLines = items.filter((item) => cart[item.id]).map((item) => ({ ...item, quantity: cart[item.id] }));
  const cartCount = cartLines.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartLines.reduce((total, item) => total + item.price * item.quantity, 0);
  const whatsappNumber = settings.whatsapp_number?.replace(/\D/g, "") || "";
  const whatsappDisplay = whatsappNumber.length === 12 && whatsappNumber.startsWith("91")
    ? `+91 ${whatsappNumber.slice(2, 7)} ${whatsappNumber.slice(7)}`
    : whatsappNumber ? `+${whatsappNumber}` : "";
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi Neeru's Home Kitchen, I have a question about today's menu or my order.")}`
    : "";

  function setQuantity(id: string, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  function beginCheckout() {
    if (!session) return setAuthOpen(true);
    if (!profile?.full_name || !profile.flat_number) return setView("account");
    setCheckoutOpen(true);
  }

  function go(next: StoreView) {
    if ((next === "orders" || next === "account") && !session) return setAuthOpen(true);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (next === "orders") loadOrders();
  }

  return (
    <div className={`storefront-workspace ${phonePreview ? "storefront-preview" : ""}`}>
      {showLocalDevicePreview && <button className="store-device-switch" onClick={() => setPhonePreview((current) => !current)} aria-pressed={phonePreview}>
        <Smartphone />{phonePreview ? "Exit phone preview" : "Preview on phone"}
      </button>}
      <div className="storefront">
      <header className="store-header">
        <button className="store-brand" onClick={() => go("menu")}><StoreLogo /><span><strong>Neeru’s Home Kitchen</strong><small>100% VEGETARIAN · HOME-COOKED</small></span></button>
        <div className="store-header-actions">
          {whatsappHref && <a className="store-contact-link" href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`Contact Neeru's Home Kitchen on WhatsApp ${whatsappDisplay}`}><MessageCircle /><span>WhatsApp</span></a>}
          <a className="family-link" href="/admin">Family desk</a>
          <button className={`header-cart-button ${view === "cart" ? "active" : ""}`} onClick={() => go("cart")} aria-label={cartCount ? `Cart, ${cartCount} items, ${formatMoney(cartTotal)}` : "Cart, empty"}>
            <span className="header-cart-icon"><ShoppingBag />{cartCount > 0 && <b>{cartCount}</b>}</span>
            <span className="header-cart-copy"><small>Cart</small><strong>{cartCount > 0 ? formatMoney(cartTotal) : "Empty"}</strong></span>
          </button>
          <button className={`account-button ${session ? "" : "sign-in"}`} onClick={() => go("account")} aria-label={session ? "Account" : "Sign in"}><CircleUserRound /><span>{session ? "Account" : "Sign in"}</span></button>
        </div>
      </header>

      {notice && <div className="store-notice"><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}

      <main className="store-main">
        {view === "menu" && <>
          {sharedCategory && sharedCategoryHero
            ? <SharedCategoryMenu category={sharedCategory} items={sharedCategoryItems} hero={sharedCategoryHero} cart={cart} onQuantity={setQuantity} onCart={() => go("cart")} />
            : sharedDish
              ? <SharedDishMenu item={sharedDish} quantity={cart[sharedDish.id] || 0} onQuantity={setQuantity} onCart={() => go("cart")} />
              : <>
          <section className="store-hero">
            <div className="hero-copy"><span className="store-eyebrow"><Sparkles /> TODAY AT NEERU’S</span><h1>Good food.<br /><em>Feels like home.</em></h1><p>{settings.hero_message}</p><div className={`open-pill ${acceptingOrders ? "" : "closed"}`}><i />{acceptingOrders ? "Taking orders today" : settings.ordering_open ? "Today’s order cutoff has passed" : "Orders are paused"}{settings.order_cutoff && ` · Until ${settings.order_cutoff.slice(0, 5)}`}</div></div>
            <div className="hero-plate">{heroItem?.image_url ? <img src={heroItem.image_url} alt={heroItem.name} decoding="async" /> : <UtensilsCrossed />}</div>
          </section>

          {featured.length > 0 && <section className="featured-section"><div className="store-section-title"><div><span className="store-eyebrow"><Flame /> KITCHEN FAVOURITES</span><h2>Featured today</h2></div></div><div className="featured-row">{featured.map((item) => <FoodCard key={item.id} item={item} quantity={cart[item.id] || 0} onQuantity={setQuantity} featured />)}</div></section>}

          <section className="menu-section">
            <div className="store-section-title"><div><span className="store-eyebrow">FRESHLY PREPARED</span><h2>Today’s menu</h2></div><span>{visibleItems.length} dishes</span></div>
            <div className="store-filters"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search today’s vegetarian menu" /></label></div>
            {!search && categories.length > 1 && <div className="store-category-chips">{categories.map((category) => <a href={`#category-${category.slug}`} key={category.id}>{category.name}</a>)}</div>}
            {loading ? <div className="store-empty"><span className="loader" /><b>Preparing today’s menu…</b></div> : visibleItems.length ? <div className="store-menu-groups">{menuGroups.map((group) => <section id={`category-${group.category.slug}`} className="store-category-section" key={group.category.id}><div className="store-category-heading"><span><b>{group.category.name}</b><small>{group.category.description}</small></span><em>{group.items.length} dish{group.items.length === 1 ? "" : "es"}</em></div><div className="store-menu-grid">{group.items.map((item) => <FoodCard key={item.id} item={item} quantity={cart[item.id] || 0} onQuantity={setQuantity} />)}</div></section>)}</div> : <div className="store-empty"><ChefHat /><b>No dishes match this filter</b><span>Try viewing the full menu.</span></div>}
          </section>
          </>}
        </>}

        {view === "cart" && <CartView lines={cartLines} total={cartTotal} orderingOpen={acceptingOrders} onQuantity={setQuantity} onBack={() => go("menu")} onCheckout={beginCheckout} />}
        {view === "orders" && <OrdersView orders={orders} onBack={() => go("menu")} />}
        {view === "account" && session && <AccountView session={session} profile={profile} onSaved={(next) => { setProfile(next); setNotice("Your details were saved."); }} onBack={() => go("menu")} />}
      </main>

      <nav className="store-bottom-nav">
        <button className={view === "menu" ? "active" : ""} onClick={() => go("menu")}><Home /><span>Home</span></button>
        <button className={view === "orders" ? "active" : ""} onClick={() => go("orders")}><ReceiptText /><span>My orders</span></button>
        <button className={`cart-nav ${view === "cart" ? "active" : ""}`} onClick={() => go("cart")}><span className="cart-icon"><ShoppingBag />{cartCount > 0 && <b>{cartCount}</b>}</span><span>Cart</span></button>
      </nav>

      {authOpen && <CustomerAuth onClose={() => setAuthOpen(false)} onSuccess={() => { setAuthOpen(false); setNotice("Welcome to Neeru’s Home Kitchen."); }} />}
      {checkoutOpen && profile && <CheckoutModal lines={cartLines} total={cartTotal} profile={profile} settings={settings} onClose={() => setCheckoutOpen(false)} onEditProfile={() => { setCheckoutOpen(false); setView("account"); }} onPlaced={(order, alert) => { setCheckoutOpen(false); setPlacedOrder(order); setPlacedAlert(alert); setCart({}); loadOrders(); }} />}
      {placedOrder && <PaymentModal order={placedOrder} settings={settings} alert={placedAlert} onClose={() => { setPlacedOrder(null); setPlacedAlert(null); go("orders"); }} />}
      {whatsappHref && <a className="store-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Message Neeru's Home Kitchen on WhatsApp" title={`WhatsApp ${whatsappDisplay}`}><MessageCircle /><span><b>WhatsApp us</b><small>{whatsappDisplay}</small></span></a>}
      </div>
    </div>
  );
}

function StoreLogo() {
  return <span className="store-logo"><svg viewBox="0 0 48 48"><path d="M17 21c-3-3 2-5 0-9M24 21c-3-3 2-5 0-10M31 21c-3-3 2-5 0-9" /><path className="fill" d="M10.5 25.5h27c-.8 8.2-6.1 12.5-13.5 12.5s-12.7-4.3-13.5-12.5Z" /><path d="M8.5 25.5h31" /></svg></span>;
}

function SharedDishMenu({ item, quantity, onQuantity, onCart }: { item: StoreMenuItem; quantity: number; onQuantity: (id: string, quantity: number) => void; onCart: () => void }) {
  const soldOut = item.portions_available === 0;
  const addDish = () => { onQuantity(item.id, Math.max(1, quantity)); onCart(); };
  return <section className="shared-dish-page">
    <article className="shared-dish-banner">
      <div className="shared-dish-image">{item.image_url ? <img src={item.image_url} alt={item.name} decoding="async" /> : <ChefHat />}</div>
      <div className="shared-dish-copy"><span className="store-eyebrow"><MessageCircle /> SHARED FROM NEERU’S KITCHEN</span><h1>{item.name}</h1><p>{item.promotion_message || item.description}</p><div className="shared-dish-facts"><strong>{formatMoney(item.price)}</strong><small>per {item.unit_label}</small>{item.portions_available !== null && <span>{item.portions_available > 0 ? `Only ${item.portions_available} portions today` : "Sold out"}</span>}{item.promotion_until && <span>Order before {formatTime12(item.promotion_until)}</span>}</div><button className="store-primary" disabled={soldOut} onClick={addDish}>{soldOut ? "Unavailable today" : <>Add &amp; order now <ChevronRight /></>}</button></div>
    </article>
    <div className="shared-dish-footer"><span>This link was prepared specially for {item.name}.</span><a href="/">Browse the full menu</a></div>
  </section>;
}

function SharedCategoryMenu({ category, items, hero, cart, onQuantity, onCart }: { category: StoreCategory; items: StoreMenuItem[]; hero: StoreMenuItem; cart: Record<string, number>; onQuantity: (id: string, quantity: number) => void; onCart: () => void }) {
  const others = items.filter((item) => item.id !== hero.id);
  const heroQuantity = cart[hero.id] || 0;
  const addHero = () => { onQuantity(hero.id, Math.max(1, heroQuantity)); onCart(); };
  return <section className="shared-category-page">
    <div className="shared-category-intro"><span className="store-eyebrow"><MessageCircle /> SHARED MENU</span><h1>{category.name}</h1><p>{category.description || "Made fresh after you order, so every portion is prepared just for you."}</p></div>
    <article className="shared-category-hero"><div className="shared-category-hero-image">{hero.image_url ? <img src={hero.image_url} alt={hero.name} decoding="async" /> : <ChefHat />}</div><div className="shared-category-hero-copy"><span>FEATURED DISH</span><h2>{hero.name}</h2><p>{hero.promotion_message || hero.description}</p><div className="shared-category-hero-facts"><strong>{formatMoney(hero.price)}</strong><small>per {hero.unit_label}</small>{hero.portions_available !== null && <em>{hero.portions_available > 0 ? `Only ${hero.portions_available} portions today` : "Sold out"}</em>}{hero.promotion_until && <em>Order before {formatTime12(hero.promotion_until)}</em>}</div><button className="store-primary" disabled={hero.portions_available === 0} onClick={addHero}>{hero.portions_available === 0 ? "Unavailable today" : <>Add &amp; order now <ChevronRight /></>}</button></div></article>
    {others.length > 0 && <div className="shared-category-list"><div className="shared-category-list-head"><b>More from {category.name}</b><span>{others.length} more dish{others.length === 1 ? "" : "es"}</span></div>{others.map((item) => { const quantity = cart[item.id] || 0; const soldOut = item.portions_available === 0; return <article key={item.id}><div className="shared-category-thumb">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" decoding="async" /> : <ChefHat />}</div><span><b>{item.name}</b><small>{item.description}</small><strong>{formatMoney(item.price)} / {item.unit_label}</strong></span>{quantity > 0 ? <div className="quantity"><button onClick={() => onQuantity(item.id, quantity - 1)} aria-label={`Decrease ${item.name} quantity`}><Minus /></button><b>{quantity}</b><button disabled={soldOut || quantity >= 20} onClick={() => onQuantity(item.id, quantity + 1)} aria-label={`Increase ${item.name} quantity`}><Plus /></button></div> : <button className="compact-add" disabled={soldOut} onClick={() => onQuantity(item.id, 1)}>{soldOut ? "Sold out" : <>Add <Plus /></>}</button>}</article>; })}</div>}
    <div className="shared-category-footer"><span>Made fresh after you order.</span><button onClick={onCart}><ShoppingBag /> View cart</button></div>
  </section>;
}

function FoodCard({ item, quantity, onQuantity, featured = false }: { item: StoreMenuItem; quantity: number; onQuantity: (id: string, quantity: number) => void; featured?: boolean }) {
  const soldOut = item.portions_available === 0;
  return <article className={`store-food-card ${featured ? "featured-card" : ""} ${soldOut ? "sold-out" : ""}`}>
    <div className="food-card-image">{item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" /> : <ChefHat />}{featured && <span className="featured-badge"><Sparkles /> Featured</span>}{soldOut && <span className="soldout-badge">Sold out</span>}</div>
    <div className="food-card-copy"><div className="food-meta"><span className="diet-dot"><i /></span><span>Vegetarian · {item.spice_level}</span>{item.portions_available !== null && item.portions_available > 0 && item.portions_available <= 5 && <span className="few-left">Only {item.portions_available} left</span>}</div><h3>{item.name}</h3><p>{item.description}</p><div className="food-card-bottom"><span className="dish-price"><strong>{formatMoney(item.price)}</strong><small>/ {item.unit_label}</small></span>{quantity > 0 ? <div className="quantity"><button onClick={() => onQuantity(item.id, quantity - 1)}><Minus /></button><b>{quantity}</b><button disabled={soldOut || (item.portions_available !== null && quantity >= item.portions_available)} onClick={() => onQuantity(item.id, quantity + 1)}><Plus /></button></div> : <button className="add-food" disabled={soldOut} onClick={() => onQuantity(item.id, 1)}>{soldOut ? "Unavailable" : <>Add <Plus /></>}</button>}</div></div>
  </article>;
}

function CartView({ lines, total, orderingOpen, onQuantity, onBack, onCheckout }: { lines: (StoreMenuItem & { quantity: number })[]; total: number; orderingOpen: boolean; onQuantity: (id: string, quantity: number) => void; onBack: () => void; onCheckout: () => void }) {
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Continue browsing</button><div className="subpage-heading"><span className="store-eyebrow">YOUR SELECTION</span><h1>Your cart</h1><p>Fresh food is prepared after your order is confirmed.</p></div>{lines.length ? <><div className="cart-lines">{lines.map((item) => <article key={item.id}><div>{item.image_url ? <img src={item.image_url} alt="" /> : <ChefHat />}</div><span><b>{item.name}</b><small>{formatMoney(item.price)} / {item.unit_label}</small></span><div className="quantity"><button onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus /></button><b>{item.quantity}</b><button onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus /></button></div><strong>{formatMoney(item.price * item.quantity)}</strong></article>)}</div><div className="cart-summary"><span><b>Total</b><small>Payment instructions appear after ordering</small></span><strong>{formatMoney(total)}</strong></div><button className="store-primary checkout-button" disabled={!orderingOpen} onClick={onCheckout}>{orderingOpen ? <>Continue to delivery <ChevronRight /></> : "Orders are paused today"}</button></> : <div className="store-empty"><ShoppingBag /><b>Your cart is empty</b><span>Add something delicious from today’s menu.</span><button onClick={onBack}>See today’s menu</button></div>}</section>;
}

function OrdersView({ orders, onBack }: { orders: CustomerOrder[]; onBack: () => void }) {
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Back to menu</button><div className="subpage-heading"><span className="store-eyebrow">ORDER HISTORY</span><h1>My orders</h1><p>See which meals are still open and which have been delivered.</p></div>{orders.length ? <div className="customer-orders">{orders.map((order) => { const visibleStage = customerStage(order.stage); return <article key={order.id}><div className="customer-order-head"><span><b>#{order.id.slice(0, 8).toUpperCase()}</b><small>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(order.created_at))}</small></span><strong>{formatMoney(Number(order.amount))}</strong></div><p>{order.order_details}</p><div className="customer-order-status"><span className={`order-stage ${visibleStage}`}><i />{stageLabels[visibleStage]}</span><span className={`payment-state ${order.payment_status}`}>{order.payment_status === "verified" ? <Check /> : <Clock3 />}{order.payment_status === "verified" ? "Paid" : order.payment_status === "submitted" ? "Payment sent" : "Payment pending"}</span></div></article>; })}</div> : <div className="store-empty"><ReceiptText /><b>No orders yet</b><span>Your first home-cooked meal will appear here.</span><button onClick={onBack}>Explore the menu</button></div>}</section>;
}

function CustomerAuth({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [wing, setWing] = useState<Wing>("");
  const [flat, setFlat] = useState("");
  const [flatWarning, setFlatWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  function updateFlat(value: string) {
    if (/\D/.test(value)) {
      setFlatWarning("Please enter only numbers for the flat number.");
      setFlat(value.replace(/\D/g, ""));
      return;
    }
    setFlatWarning("");
    setFlat(value);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");
    setMessageIsSuccess(false);
    setAwaitingConfirmation(false);
    if (mode === "register" && (!name.trim() || !wing || !flat)) {
      if (!flat) setFlatWarning("Please enter your flat number using numbers only.");
      setMessage(!name.trim() ? "Please enter your name." : !wing ? "Please choose your tower." : "Please enter your flat number.");
      return;
    }

    if (method === "phone") {
      const formattedPhone = normalizeIndianPhone(phone);
      if (!formattedPhone) return setMessage("Enter a valid 10-digit Indian mobile number.");
      if (!/^\d{6}$/.test(pin)) return setMessage("Choose or enter your complete 6-digit PIN.");
      setBusy(true);
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ phone: formattedPhone, password: pin });
        if (error) {
          setBusy(false);
          return setMessage("That mobile number or PIN is not correct.");
        }
        const { data: access, error: accessError } = await supabase.from("customer_profiles").select("access_status").eq("id", data.user.id).single();
        if (accessError || access?.access_status === "rejected") {
          await supabase.auth.signOut();
          setBusy(false);
          return setMessage(access?.access_status === "rejected" ? "This account is unavailable. Please contact Neeru’s Home Kitchen." : "We could not open your customer profile. Please try again.");
        }
        setBusy(false);
        onSuccess();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        phone: formattedPhone,
        password: pin,
        options: { data: { full_name: name.trim(), flat_number: flatAddress(wing, flat), phone: formattedPhone, login_method: "phone_pin" } },
      });
      setBusy(false);
      if (error) {
        if (/already|exists|registered/i.test(error.message)) return setMessage("This mobile number already has an account. Choose Returning customer and sign in with your PIN.");
        return setMessage(error.message);
      }
      if (data.session) {
        onSuccess();
        return;
      }
      setMessageIsSuccess(true);
      setMessage("Your account was created. Choose Returning customer and sign in with this number and PIN.");
      return;
    }

    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setMessage("That email or password is not correct."); else onSuccess();
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim(), flat_number: flatAddress(wing, flat) } },
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (!data.session) {
      setAwaitingConfirmation(true);
      setMessageIsSuccess(true);
      setMessage(`A confirmation link was sent to ${email.trim()}.`);
      return;
    }
    onSuccess();
  }

  async function resendConfirmation() {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setMessageIsSuccess(!error);
    setMessage(error ? error.message : `A new confirmation link was sent to ${email.trim()}.`);
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setMessage("");
    setMessageIsSuccess(false);
    setAwaitingConfirmation(false);
  }

  return <div className="store-modal-bg"><section className="auth-sheet">
    <button className="sheet-close" onClick={onClose}><X /></button>
    <StoreLogo />
    <span className="store-eyebrow">WELCOME TO NEERU’S</span>
    <h2>{mode === "register" ? "Create your account" : "Welcome back"}</h2>
    <p>{mode === "register" ? "Add your mobile number, name and tower details to start ordering immediately." : "Sign in to order and follow your meals."}</p>
    <div className="auth-tabs">
      <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>New customer</button>
      <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Returning customer</button>
    </div>
    <form onSubmit={submit}>
      {mode === "register" && <>
        <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
        <div className="flat-address-fields">
          <label><span>Tower</span><select value={wing} onChange={(event) => setWing(event.target.value as Wing)} required><option value="" disabled>Choose</option>{["A", "B", "C", "D"].map((option) => <option value={option} key={option}>Tower {option}</option>)}</select></label>
          <label className={flatWarning ? "field-warning" : ""}><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={flat} onChange={(event) => updateFlat(event.target.value)} placeholder="For example, 402" aria-describedby="signup-flat-warning" required />{flatWarning && <small id="signup-flat-warning" className="field-warning-text">{flatWarning}</small>}</label>
        </div>
      </>}
      {method === "phone" ? <>
        <label><span>Mobile number</span><div className="phone-field"><b>+91</b><input type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" required /></div></label>
        <label><span>{mode === "register" ? "Create a 6-digit login PIN" : "Your 6-digit PIN"}</span><input className="otp-input" type="password" inputMode="numeric" autoComplete={mode === "register" ? "new-password" : "current-password"} pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="• • • • • •" required /></label>
      </> : <>
        <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label><span>Password</span><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required /></label>
      </>}
      {message && <div className={`auth-message ${messageIsSuccess ? "success" : ""}`}>{message}</div>}
      <button className="store-primary" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? method === "phone" ? "Create account & order" : "Create email account" : method === "phone" ? "Sign in with mobile" : "Sign in with email"}</button>
      {method === "email" && awaitingConfirmation && <button className="resend-confirmation" type="button" disabled={busy} onClick={resendConfirmation}>Resend confirmation email</button>}
    </form>
    <button className="auth-method-switch" type="button" onClick={() => { setMethod(method === "phone" ? "email" : "phone"); setMessage(""); setAwaitingConfirmation(false); }}>{method === "phone" ? "Use email and password instead" : "Use mobile number and PIN instead"}</button>
    <small>{method === "phone" ? "No SMS charge and no approval wait. Your six-digit PIN is private and should not be shared." : "Email accounts use Supabase confirmation and remain available as an alternative."}</small>
  </section></div>;
}

function AccountView({ session, profile, onSaved, onBack }: { session: Session; profile: Profile | null; onSaved: (profile: Profile) => void; onBack: () => void }) {
  const isPhoneAccount = Boolean(session.user.phone && !session.user.email);
  const defaultProfile = profile
    ? { ...profile, email: profile.email || session.user.email || "", phone: profile.phone || session.user.phone || "" }
    : { id: session.user.id, full_name: String(session.user.user_metadata.full_name || ""), flat_number: String(session.user.user_metadata.flat_number || ""), email: session.user.email || "", phone: session.user.phone || "", spice_preference: "mild" as Spice, standing_instructions: "", access_status: "approved" as const };
  const initialAddress = splitFlatAddress(defaultProfile.flat_number);
  const [form, setForm] = useState<Profile>(defaultProfile);
  const [wing, setWing] = useState<Wing>(initialAddress.wing);
  const [flat, setFlat] = useState(initialAddress.number);
  const [flatWarning, setFlatWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!profile) return;
    const next = { ...profile, email: profile.email || session.user.email || "", phone: profile.phone || session.user.phone || "" };
    const address = splitFlatAddress(next.flat_number);
    setForm(next);
    setWing(address.wing);
    setFlat(address.number);
  }, [profile, session.user.email, session.user.phone]);

  function updateFlat(value: string) {
    if (/\D/.test(value)) {
      setFlatWarning("Please enter only numbers for the flat number.");
      setFlat(value.replace(/\D/g, ""));
      return;
    }
    setFlatWarning("");
    setFlat(value);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return;
    if (!wing || !flat) {
      if (!flat) setFlatWarning("Please enter your flat number using numbers only.");
      setMessage(!wing ? "Please choose your tower." : "Please enter your flat number.");
      return;
    }
    setBusy(true);
    const next = { ...form, flat_number: flatAddress(wing, flat) };
    const { error } = await supabase.from("customer_profiles").upsert({ id: next.id, full_name: next.full_name, flat_number: next.flat_number, email: next.email, phone: next.phone, spice_preference: next.spice_preference, standing_instructions: next.standing_instructions });
    setBusy(false); if (error) setMessage(error.message); else onSaved(next);
  }
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Back to menu</button><div className="subpage-heading"><span className="store-eyebrow">YOUR DETAILS</span><h1>My kitchen profile</h1><p>These details make every future order quicker.</p></div><form className="profile-form" onSubmit={save}><div className="profile-grid"><label><span>Name</span><input value={form.full_name} onChange={(event) => set("full_name", event.target.value)} required /></label><div className="flat-address-fields"><label><span>Tower</span><select value={wing} onChange={(event) => setWing(event.target.value as Wing)} required><option value="" disabled>Choose</option>{["A", "B", "C", "D"].map((option) => <option value={option} key={option}>Tower {option}</option>)}</select></label><label className={flatWarning ? "field-warning" : ""}><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={flat} onChange={(event) => updateFlat(event.target.value)} placeholder="For example, 402" aria-describedby="profile-flat-warning" required />{flatWarning && <small id="profile-flat-warning" className="field-warning-text">{flatWarning}</small>}</label></div>{form.email && !isPhoneAccount && <label><span>Email</span><input value={form.email} disabled /></label>}<label><span>{isPhoneAccount ? "Mobile login" : session.user.phone ? "Verified mobile" : <>Phone <small>Optional</small></>}</span><input type="tel" value={form.phone} disabled={isPhoneAccount || Boolean(session.user.phone)} onChange={(event) => set("phone", event.target.value)} /></label></div><fieldset><legend>Usual spice level</legend><div className="profile-choices">{["mild", "medium", "spicy"].map((level) => <button type="button" className={form.spice_preference === level ? "selected" : ""} onClick={() => set("spice_preference", level as Spice)} key={level}>{level}</button>)}</div></fieldset><label><span>Standing instructions <small>Optional</small></span><textarea value={form.standing_instructions} onChange={(event) => set("standing_instructions", event.target.value)} placeholder="For example: no onion, call before delivery…" /></label>{message && <div className="auth-message">{message}</div>}<button className="store-primary" disabled={busy}>{busy ? "Saving…" : "Save my details"}</button></form><button className="customer-signout" onClick={() => supabase?.auth.signOut()}><LogOut /> Sign out</button></section>;
}

function CheckoutModal({ lines, total, profile, settings, onClose, onEditProfile, onPlaced }: { lines: (StoreMenuItem & { quantity: number })[]; total: number; profile: Profile; settings: StoreSettings; onClose: () => void; onEditProfile: () => void; onPlaced: (order: CustomerOrder, alert: OrderAlertResult | null) => void }) {
  const [deliveryTime, setDeliveryTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function placeOrder(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true);
    const { data, error } = await supabase.rpc("place_customer_order", { p_delivery_time: ceilTimeToQuarter(deliveryTime) || null, p_instructions: instructions, p_items: lines.map((item) => ({ menu_item_id: item.id, quantity: item.quantity })) });
    if (error) { setBusy(false); return setMessage(error.message); }
    const { data: order, error: loadError } = await supabase.from("orders").select("id,created_at,amount,stage,payment_status,payment_reference,order_details,delivery_time").eq("id", data).single();
    if (loadError) { setBusy(false); return setMessage(loadError.message); }

    let alert: OrderAlertResult | null = null;
    try {
      const { data: auth } = await supabase.auth.getSession();
      const firstPhoto = lines.find((item) => item.image_url)?.image_url || "";
      const response = await fetch("/api/order-alert", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.session?.access_token || ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: data, photoUrl: firstPhoto }),
      });
      if (response.ok) alert = await response.json() as OrderAlertResult;
    } catch {
      // The order is already safely stored and visible to the kitchen app.
    }
    setBusy(false);
    onPlaced(order as CustomerOrder, alert);
  }
  return <div className="store-modal-bg"><form className="checkout-sheet" onSubmit={placeOrder}><div className="checkout-head"><div><span className="store-eyebrow">DELIVERY DETAILS</span><h2>Almost there</h2></div><button type="button" onClick={onClose}><X /></button></div><div className="delivery-address"><span><Home /></span><div><b>{profile.full_name}</b><small>Flat {profile.flat_number}</small></div><button type="button" onClick={onEditProfile}>Edit</button></div>{profile.standing_instructions && <div className="standing-instruction"><Check /><span><b>Standing instruction applied</b><small>{profile.standing_instructions}</small></span></div>}<label><span>Anything just for this order? <small>Optional</small></span><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="For example: deliver after 7 PM" /></label><label><span>Preferred delivery time</span><input type="time" step="900" value={deliveryTime} onChange={(event) => setDeliveryTime(event.target.value)} required /></label><div className="checkout-review"><span>{lines.reduce((sum, item) => sum + item.quantity, 0)} items</span><strong>{formatMoney(total)}</strong></div>{message && <div className="auth-message">{message}</div>}<button className="store-primary" disabled={busy}>{busy ? "Placing order…" : <>Place order <ChevronRight /></>}</button><small className="checkout-note">You’ll receive UPI payment instructions after the order is created.</small></form></div>;
}

function PaymentModal({ order, settings, alert, onClose }: { order: CustomerOrder; settings: StoreSettings; alert: OrderAlertResult | null; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const [qrKind, setQrKind] = useState<"custom" | "generated" | "">("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const note = `Neeru's Home Kitchen order ${order.id.slice(0, 8).toUpperCase()}`;
  const paymentQuery = settings.upi_id ? new URLSearchParams({ pa: settings.upi_id, pn: settings.merchant_name, am: Number(order.amount).toFixed(2), cu: "INR", tn: note }).toString() : "";
  const paymentUri = paymentQuery ? `upi://pay?${paymentQuery}` : "";
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const googlePayUri = paymentQuery
    ? isIOS ? `gpay://upi/pay?${paymentQuery}` : `intent://pay?${paymentQuery}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`
    : "";
  const paytmUri = paymentQuery && isAndroid
    ? `intent://pay?${paymentQuery}#Intent;scheme=upi;package=net.one97.paytm;end`
    : "";
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    async function loadPaymentQr() {
      try {
        const response = await fetch("/api/photos?key=payment/current", { cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          objectUrl = URL.createObjectURL(await response.blob());
          if (!cancelled) {
            setQr(objectUrl);
            setQrKind("custom");
          }
          return;
        }
      } catch {
        // The generated order-specific QR below remains available as a fallback.
      }
      if (paymentUri) {
        const generated = await QRCode.toDataURL(paymentUri, { width: 280, margin: 1, color: { dark: "#17211b", light: "#ffffff" } });
        if (!cancelled) {
          setQr(generated);
          setQrKind("generated");
        }
      } else if (!cancelled) {
        setQr("");
        setQrKind("");
      }
    }
    loadPaymentQr();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [paymentUri]);
  async function submitReference() {
    if (!supabase || !reference.trim()) return setMessage("Enter the UPI transaction reference after paying.");
    const { error } = await supabase.rpc("submit_payment_reference", { p_order_id: order.id, p_reference: reference.trim() });
    setMessage(error ? error.message : "Payment reference sent. The kitchen will verify it shortly.");
  }
  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(settings.upi_id);
      setCopyMessage("UPI ID copied");
    } catch {
      setCopyMessage(`UPI ID: ${settings.upi_id}`);
    }
  }
  return (
    <div className="store-modal-bg">
      <section className="payment-sheet">
        <span className="payment-success"><Check /></span>
        <span className="store-eyebrow">ORDER RECEIVED</span>
        <h2>Thank you!</h2>
        <p>Order <b>#{order.id.slice(0, 8).toUpperCase()}</b> has been sent to Neeru’s Home Kitchen.</p>
        <div className={`kitchen-alert-status ${alert?.automatic ? "automatic" : "ready"}`}>
          <MessageCircle />
          <span><b>{alert?.automatic ? "WhatsApp alert sent to the kitchen" : "Kitchen app notified"}</b><small>{alert?.automatic ? "The family also received the order details on WhatsApp." : alert?.whatsappUrl ? "The order is live in the admin app. Tap below to send a WhatsApp copy too." : "The order is live in the admin app with its notification sound."}</small></span>
        </div>
        {!alert?.automatic && alert?.whatsappUrl && <a className="whatsapp-order-copy" href={alert.whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle /> Send order copy on WhatsApp</a>}
        <div className="payment-total"><span>Amount to pay</span><strong>{formatMoney(Number(order.amount))}</strong></div>
        {paymentUri ? (
          <>
            <div className="upi-panel">
              {qr ? <img src={qr} alt="UPI payment QR" /> : <span className="payment-qr-loading"><i className="store-loader" />Preparing QR…</span>}
              <div>
                <b>Pay with any UPI app</b>
                <small>{qrKind === "custom" ? "Scan Neeru’s Home Kitchen QR from another screen, or choose your payment app below." : "Scan from another screen, or choose your payment app below."}</small>
                <div className="upi-app-actions">
                  <a className="gpay-action" href={googlePayUri}>Google Pay</a>
                  {paytmUri && <a className="paytm-action" href={paytmUri}>Paytm</a>}
                  <a href={paymentUri}>Any UPI app</a>
                </div>
                <div className="upi-id-row"><code>{settings.upi_id}</code><button type="button" onClick={copyUpiId}>Copy</button></div>
                {copyMessage && <span className="upi-copy-message">{copyMessage}</span>}
              </div>
            </div>
            <label className="reference-field"><span>UPI transaction reference</span><div><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter after payment" /><button type="button" onClick={submitReference}>Submit</button></div></label>
          </>
        ) : <div className="pay-later"><Clock3 /><span><b>Payment details coming shortly</b><small>The kitchen will confirm how to pay for this order.</small></span></div>}
        {message && <div className="auth-message success">{message}</div>}
        <button className="store-primary" onClick={onClose}>View my orders</button>
      </section>
    </div>
  );
}
