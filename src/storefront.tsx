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
import { supabase } from "./supabase";

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
};

type Profile = {
  id: string;
  full_name: string;
  flat_number: string;
  email: string;
  phone: string;
  spice_preference: Spice;
  standing_instructions: string;
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
].map(([id, name, price], index) => ({ id: String(id), name: String(name), price: Number(price), description: "Comforting home-style food, made fresh today.", spice_level: "mild", photo_path: null, image_url: starterImages[String(name)], is_featured: index < 3, portions_available: null })) as StoreMenuItem[];

const stageLabels: Record<string, string> = {
  new: "Order placed",
  confirmed: "Confirmed",
  preparing: "Cooking",
  ready: "Ready",
  out_for_delivery: "On the way",
  delivered: "Delivered",
};

const defaultSettings: StoreSettings = {
  ordering_open: true,
  hero_message: "Fresh home-style food, prepared with care and delivered to your door.",
  upi_id: "",
  merchant_name: "Neeru's Kitchen",
  order_cutoff: null,
};

const localToday = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};

const formatMoney = (amount: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
const splitFlatAddress = (value = "") => {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^([A-D])[-\s]?(\d+)$/);
  return match ? { wing: match[1] as Wing, number: match[2] } : { wing: "" as Wing, number: normalized.replace(/\D/g, "") };
};
const flatAddress = (wing: Wing, number: string) => `${wing}-${number}`;

export function Storefront() {
  const [view, setView] = useState<StoreView>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<StoreMenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem("neeru-cart") || "{}"));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null);
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
    const [{ data: menu }, { data: daily }, { data: configuration }] = await Promise.all([
      supabase.from("menu_items").select("id,name,price,description,spice_level,photo_path").eq("is_active", true).order("name"),
      supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price").eq("menu_date", localToday()),
      supabase.from("storefront_settings").select("ordering_open,hero_message,upi_id,merchant_name,order_cutoff").eq("id", 1).maybeSingle(),
    ]);
    const dailyMap = new Map((daily || []).map((entry) => [entry.menu_item_id, entry]));
    if (!menu) {
      setItems(starterCatalog);
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
      }];
    }));
    if (configuration) setSettings({ ...defaultSettings, ...configuration });
    setLoading(false);
  }

  async function loadProfile() {
    if (!supabase || !session) return;
    const { data } = await supabase.from("customer_profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (data) setProfile(data as Profile);
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
  const featured = items.filter((item) => item.is_featured);
  const cartLines = items.filter((item) => cart[item.id]).map((item) => ({ ...item, quantity: cart[item.id] }));
  const cartCount = cartLines.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartLines.reduce((total, item) => total + item.price * item.quantity, 0);

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
      <button className="store-device-switch" onClick={() => setPhonePreview((current) => !current)} aria-pressed={phonePreview}>
        <Smartphone />{phonePreview ? "Exit phone preview" : "Preview on phone"}
      </button>
      <div className="storefront">
      <header className="store-header">
        <button className="store-brand" onClick={() => go("menu")}><StoreLogo /><span><strong>Neeru’s Kitchen</strong><small>100% VEGETARIAN · HOME-COOKED</small></span></button>
        <div className="store-header-actions">
          <a className="family-link" href="/admin">Family desk</a>
          <button className={`header-cart-button ${view === "cart" ? "active" : ""}`} onClick={() => go("cart")} aria-label={cartCount ? `Cart, ${cartCount} items, ${formatMoney(cartTotal)}` : "Cart, empty"}>
            <span className="header-cart-icon"><ShoppingBag />{cartCount > 0 && <b>{cartCount}</b>}</span>
            <span className="header-cart-copy"><small>Cart</small><strong>{cartCount > 0 ? formatMoney(cartTotal) : "Empty"}</strong></span>
          </button>
          <button className="account-button" onClick={() => go("account")} aria-label="Account"><CircleUserRound /></button>
        </div>
      </header>

      {notice && <div className="store-notice"><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}

      <main className="store-main">
        {view === "menu" && <>
          <section className="store-hero">
            <div className="hero-copy"><span className="store-eyebrow"><Sparkles /> TODAY AT NEERU’S</span><h1>Good food.<br /><em>Feels like home.</em></h1><p>{settings.hero_message}</p><div className={`open-pill ${settings.ordering_open ? "" : "closed"}`}><i />{settings.ordering_open ? "Taking orders today" : "Orders are paused"}{settings.order_cutoff && ` · Until ${settings.order_cutoff.slice(0, 5)}`}</div></div>
            <div className="hero-plate">{featured[0]?.image_url ? <img src={featured[0].image_url} alt={featured[0].name} /> : <UtensilsCrossed />}</div>
          </section>

          {featured.length > 0 && <section className="featured-section"><div className="store-section-title"><div><span className="store-eyebrow"><Flame /> KITCHEN FAVOURITES</span><h2>Featured today</h2></div></div><div className="featured-row">{featured.map((item) => <FoodCard key={item.id} item={item} quantity={cart[item.id] || 0} onQuantity={setQuantity} featured />)}</div></section>}

          <section className="menu-section">
            <div className="store-section-title"><div><span className="store-eyebrow">FRESHLY PREPARED</span><h2>Today’s menu</h2></div><span>{visibleItems.length} dishes</span></div>
            <div className="store-filters"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search today’s vegetarian menu" /></label></div>
            {loading ? <div className="store-empty"><span className="loader" /><b>Preparing today’s menu…</b></div> : visibleItems.length ? <div className="store-menu-grid">{visibleItems.map((item) => <FoodCard key={item.id} item={item} quantity={cart[item.id] || 0} onQuantity={setQuantity} />)}</div> : <div className="store-empty"><ChefHat /><b>No dishes match this filter</b><span>Try viewing the full menu.</span></div>}
          </section>
        </>}

        {view === "cart" && <CartView lines={cartLines} total={cartTotal} orderingOpen={settings.ordering_open} onQuantity={setQuantity} onBack={() => go("menu")} onCheckout={beginCheckout} />}
        {view === "orders" && <OrdersView orders={orders} onBack={() => go("menu")} />}
        {view === "account" && session && <AccountView session={session} profile={profile} onSaved={(next) => { setProfile(next); setNotice("Your details were saved."); }} onBack={() => go("menu")} />}
      </main>

      <nav className="store-bottom-nav">
        <button className={view === "menu" ? "active" : ""} onClick={() => go("menu")}><Home /><span>Home</span></button>
        <button className={view === "orders" ? "active" : ""} onClick={() => go("orders")}><ReceiptText /><span>My orders</span></button>
        <button className={`cart-nav ${view === "cart" ? "active" : ""}`} onClick={() => go("cart")}><span className="cart-icon"><ShoppingBag />{cartCount > 0 && <b>{cartCount}</b>}</span><span>Cart</span></button>
      </nav>

      {authOpen && <CustomerAuth onClose={() => setAuthOpen(false)} onSuccess={() => { setAuthOpen(false); setNotice("Welcome to Neeru’s Kitchen."); }} />}
      {checkoutOpen && profile && <CheckoutModal lines={cartLines} total={cartTotal} profile={profile} settings={settings} onClose={() => setCheckoutOpen(false)} onEditProfile={() => { setCheckoutOpen(false); setView("account"); }} onPlaced={(order) => { setCheckoutOpen(false); setPlacedOrder(order); setCart({}); loadOrders(); }} />}
      {placedOrder && <PaymentModal order={placedOrder} settings={settings} onClose={() => { setPlacedOrder(null); go("orders"); }} />}
      </div>
    </div>
  );
}

function StoreLogo() {
  return <span className="store-logo"><svg viewBox="0 0 48 48"><path d="M17 21c-3-3 2-5 0-9M24 21c-3-3 2-5 0-10M31 21c-3-3 2-5 0-9" /><path className="fill" d="M10.5 25.5h27c-.8 8.2-6.1 12.5-13.5 12.5s-12.7-4.3-13.5-12.5Z" /><path d="M8.5 25.5h31" /></svg></span>;
}

function FoodCard({ item, quantity, onQuantity, featured = false }: { item: StoreMenuItem; quantity: number; onQuantity: (id: string, quantity: number) => void; featured?: boolean }) {
  const soldOut = item.portions_available === 0;
  return <article className={`store-food-card ${featured ? "featured-card" : ""} ${soldOut ? "sold-out" : ""}`}>
    <div className="food-card-image">{item.image_url ? <img src={item.image_url} alt={item.name} /> : <ChefHat />}{featured && <span className="featured-badge"><Sparkles /> Featured</span>}{soldOut && <span className="soldout-badge">Sold out</span>}</div>
    <div className="food-card-copy"><div className="food-meta"><span className="diet-dot"><i /></span><span>Vegetarian · {item.spice_level}</span>{item.portions_available !== null && item.portions_available > 0 && item.portions_available <= 5 && <span className="few-left">Only {item.portions_available} left</span>}</div><h3>{item.name}</h3><p>{item.description}</p><div className="food-card-bottom"><strong>{formatMoney(item.price)}</strong>{quantity > 0 ? <div className="quantity"><button onClick={() => onQuantity(item.id, quantity - 1)}><Minus /></button><b>{quantity}</b><button disabled={soldOut || (item.portions_available !== null && quantity >= item.portions_available)} onClick={() => onQuantity(item.id, quantity + 1)}><Plus /></button></div> : <button className="add-food" disabled={soldOut} onClick={() => onQuantity(item.id, 1)}>{soldOut ? "Unavailable" : <>Add <Plus /></>}</button>}</div></div>
  </article>;
}

function CartView({ lines, total, orderingOpen, onQuantity, onBack, onCheckout }: { lines: (StoreMenuItem & { quantity: number })[]; total: number; orderingOpen: boolean; onQuantity: (id: string, quantity: number) => void; onBack: () => void; onCheckout: () => void }) {
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Continue browsing</button><div className="subpage-heading"><span className="store-eyebrow">YOUR SELECTION</span><h1>Your cart</h1><p>Fresh food is prepared after your order is confirmed.</p></div>{lines.length ? <><div className="cart-lines">{lines.map((item) => <article key={item.id}><div>{item.image_url ? <img src={item.image_url} alt="" /> : <ChefHat />}</div><span><b>{item.name}</b><small>{formatMoney(item.price)} each</small></span><div className="quantity"><button onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus /></button><b>{item.quantity}</b><button onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus /></button></div><strong>{formatMoney(item.price * item.quantity)}</strong></article>)}</div><div className="cart-summary"><span><b>Total</b><small>Payment instructions appear after ordering</small></span><strong>{formatMoney(total)}</strong></div><button className="store-primary checkout-button" disabled={!orderingOpen} onClick={onCheckout}>{orderingOpen ? <>Continue to delivery <ChevronRight /></> : "Orders are paused today"}</button></> : <div className="store-empty"><ShoppingBag /><b>Your cart is empty</b><span>Add something delicious from today’s menu.</span><button onClick={onBack}>See today’s menu</button></div>}</section>;
}

function OrdersView({ orders, onBack }: { orders: CustomerOrder[]; onBack: () => void }) {
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Back to menu</button><div className="subpage-heading"><span className="store-eyebrow">ORDER HISTORY</span><h1>My orders</h1><p>Follow every meal from Neeru’s kitchen to your door.</p></div>{orders.length ? <div className="customer-orders">{orders.map((order) => <article key={order.id}><div className="customer-order-head"><span><b>#{order.id.slice(0, 8).toUpperCase()}</b><small>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(order.created_at))}</small></span><strong>{formatMoney(Number(order.amount))}</strong></div><p>{order.order_details}</p><div className="customer-order-status"><span className={`order-stage ${order.stage}`}><i />{stageLabels[order.stage] || order.stage}</span><span className={`payment-state ${order.payment_status}`}>{order.payment_status === "verified" ? <Check /> : <Clock3 />}{order.payment_status === "verified" ? "Paid" : "Payment pending"}</span></div></article>)}</div> : <div className="store-empty"><ReceiptText /><b>No orders yet</b><span>Your first home-cooked meal will appear here.</span><button onClick={onBack}>Explore the menu</button></div>}</section>;
}

function CustomerAuth({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
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
    if (mode === "register" && (!wing || !flat)) {
      if (!flat) setFlatWarning("Please enter your flat number using numbers only.");
      setMessage(!wing ? "Please choose your building wing." : "Please enter your flat number.");
      return;
    }
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setMessage("That email or password is not correct."); else onSuccess();
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim(), flat_number: flatAddress(wing, flat) } } });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (data.user?.identities?.length === 0) {
      setAwaitingConfirmation(true);
      return setMessage("This email may already have an account. Try Sign in, or resend the confirmation email below.");
    }
    if (!data.session) {
      setAwaitingConfirmation(true);
      setMessageIsSuccess(true);
      return setMessage(`We sent a confirmation link to ${email.trim()}. Check Spam or Promotions too.`);
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

  return <div className="store-modal-bg"><section className="auth-sheet"><button className="sheet-close" onClick={onClose}><X /></button><StoreLogo /><span className="store-eyebrow">WELCOME TO NEERU’S</span><h2>{mode === "register" ? "Create your account" : "Welcome back"}</h2><p>{mode === "register" ? "Save your address for faster ordering." : "Sign in to order and follow your meals."}</p><div className="auth-tabs"><button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>New customer</button><button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button></div><form onSubmit={submit}>{mode === "register" && <><label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label><div className="flat-address-fields"><label><span>Wing</span><select value={wing} onChange={(event) => setWing(event.target.value as Wing)} required><option value="" disabled>Choose</option>{["A", "B", "C", "D"].map((option) => <option value={option} key={option}>Wing {option}</option>)}</select></label><label className={flatWarning ? "field-warning" : ""}><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={flat} onChange={(event) => updateFlat(event.target.value)} placeholder="For example, 402" aria-describedby="signup-flat-warning" required />{flatWarning && <small id="signup-flat-warning" className="field-warning-text">{flatWarning}</small>}</label></div></>}<label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label><span>Password</span><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>{message && <div className={`auth-message ${messageIsSuccess ? "success" : ""}`}>{message}</div>}<button className="store-primary" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>{awaitingConfirmation && <button className="resend-confirmation" type="button" disabled={busy} onClick={resendConfirmation}>Resend confirmation email</button>}</form><small>By continuing, you agree to use your details only for kitchen orders and delivery.</small></section></div>;
}

function AccountView({ session, profile, onSaved, onBack }: { session: Session; profile: Profile | null; onSaved: (profile: Profile) => void; onBack: () => void }) {
  const defaultProfile = profile || { id: session.user.id, full_name: String(session.user.user_metadata.full_name || ""), flat_number: String(session.user.user_metadata.flat_number || ""), email: session.user.email || "", phone: "", spice_preference: "mild" as Spice, standing_instructions: "" };
  const initialAddress = splitFlatAddress(defaultProfile.flat_number);
  const [form, setForm] = useState<Profile>(defaultProfile);
  const [wing, setWing] = useState<Wing>(initialAddress.wing);
  const [flat, setFlat] = useState(initialAddress.number);
  const [flatWarning, setFlatWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setForm((current) => ({ ...current, [key]: value }));

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
      setMessage(!wing ? "Please choose your building wing." : "Please enter your flat number.");
      return;
    }
    setBusy(true);
    const next = { ...form, flat_number: flatAddress(wing, flat) };
    const { error } = await supabase.from("customer_profiles").upsert(next);
    setBusy(false); if (error) setMessage(error.message); else onSaved(next);
  }
  return <section className="store-subpage"><button className="store-back" onClick={onBack}><ArrowLeft /> Back to menu</button><div className="subpage-heading"><span className="store-eyebrow">YOUR DETAILS</span><h1>My kitchen profile</h1><p>These details make every future order quicker.</p></div><form className="profile-form" onSubmit={save}><div className="profile-grid"><label><span>Name</span><input value={form.full_name} onChange={(event) => set("full_name", event.target.value)} required /></label><div className="flat-address-fields"><label><span>Wing</span><select value={wing} onChange={(event) => setWing(event.target.value as Wing)} required><option value="" disabled>Choose</option>{["A", "B", "C", "D"].map((option) => <option value={option} key={option}>Wing {option}</option>)}</select></label><label className={flatWarning ? "field-warning" : ""}><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={flat} onChange={(event) => updateFlat(event.target.value)} placeholder="For example, 402" aria-describedby="profile-flat-warning" required />{flatWarning && <small id="profile-flat-warning" className="field-warning-text">{flatWarning}</small>}</label></div><label><span>Email</span><input value={form.email} disabled /></label><label><span>Phone <small>Optional</small></span><input type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></label></div><fieldset><legend>Usual spice level</legend><div className="profile-choices">{["mild", "medium", "spicy"].map((level) => <button type="button" className={form.spice_preference === level ? "selected" : ""} onClick={() => set("spice_preference", level as Spice)} key={level}>{level}</button>)}</div></fieldset><label><span>Standing instructions <small>Optional</small></span><textarea value={form.standing_instructions} onChange={(event) => set("standing_instructions", event.target.value)} placeholder="For example: no onion, call before delivery…" /></label>{message && <div className="auth-message">{message}</div>}<button className="store-primary" disabled={busy}>{busy ? "Saving…" : "Save my details"}</button></form><button className="customer-signout" onClick={() => supabase?.auth.signOut()}><LogOut /> Sign out</button></section>;
}

function CheckoutModal({ lines, total, profile, settings, onClose, onEditProfile, onPlaced }: { lines: (StoreMenuItem & { quantity: number })[]; total: number; profile: Profile; settings: StoreSettings; onClose: () => void; onEditProfile: () => void; onPlaced: (order: CustomerOrder) => void }) {
  const [deliveryTime, setDeliveryTime] = useState("");
  const [instructions, setInstructions] = useState(profile.standing_instructions || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function placeOrder(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true);
    const { data, error } = await supabase.rpc("place_customer_order", { p_delivery_time: deliveryTime || null, p_instructions: instructions, p_items: lines.map((item) => ({ menu_item_id: item.id, quantity: item.quantity })) });
    if (error) { setBusy(false); return setMessage(error.message); }
    const { data: order, error: loadError } = await supabase.from("orders").select("id,created_at,amount,stage,payment_status,payment_reference,order_details,delivery_time").eq("id", data).single();
    setBusy(false); if (loadError) setMessage(loadError.message); else onPlaced(order as CustomerOrder);
  }
  return <div className="store-modal-bg"><form className="checkout-sheet" onSubmit={placeOrder}><div className="checkout-head"><div><span className="store-eyebrow">DELIVERY DETAILS</span><h2>Almost there</h2></div><button type="button" onClick={onClose}><X /></button></div><div className="delivery-address"><span><Home /></span><div><b>{profile.full_name}</b><small>Flat {profile.flat_number}</small></div><button type="button" onClick={onEditProfile}>Edit</button></div><label><span>Preferred delivery time</span><input type="time" value={deliveryTime} onChange={(event) => setDeliveryTime(event.target.value)} required /></label><label><span>Instructions for this order <small>Optional</small></span><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><div className="checkout-review"><span>{lines.reduce((sum, item) => sum + item.quantity, 0)} items</span><strong>{formatMoney(total)}</strong></div>{message && <div className="auth-message">{message}</div>}<button className="store-primary" disabled={busy}>{busy ? "Placing order…" : <>Place order <ChevronRight /></>}</button><small className="checkout-note">You’ll receive UPI payment instructions after the order is created.</small></form></div>;
}

function PaymentModal({ order, settings, onClose }: { order: CustomerOrder; settings: StoreSettings; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const note = `Neeru order ${order.id.slice(0, 8).toUpperCase()}`;
  const paymentUri = settings.upi_id ? `upi://pay?pa=${encodeURIComponent(settings.upi_id)}&pn=${encodeURIComponent(settings.merchant_name)}&am=${Number(order.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}` : "";
  useEffect(() => { if (paymentUri) QRCode.toDataURL(paymentUri, { width: 280, margin: 1, color: { dark: "#17211b", light: "#ffffff" } }).then(setQr); }, [paymentUri]);
  async function submitReference() {
    if (!supabase || !reference.trim()) return setMessage("Enter the UPI transaction reference after paying.");
    const { error } = await supabase.rpc("submit_payment_reference", { p_order_id: order.id, p_reference: reference.trim() });
    setMessage(error ? error.message : "Payment reference sent. The kitchen will verify it shortly.");
  }
  return <div className="store-modal-bg"><section className="payment-sheet"><span className="payment-success"><Check /></span><span className="store-eyebrow">ORDER RECEIVED</span><h2>Thank you!</h2><p>Order <b>#{order.id.slice(0, 8).toUpperCase()}</b> has been sent to Neeru’s Kitchen.</p><div className="payment-total"><span>Amount to pay</span><strong>{formatMoney(Number(order.amount))}</strong></div>{paymentUri ? <><div className="upi-panel">{qr && <img src={qr} alt="UPI payment QR" />}<div><b>Pay with any UPI app</b><small>Scan on a computer, or tap below on your phone.</small><a href={paymentUri}>Open GPay or UPI app</a></div></div><label className="reference-field"><span>UPI transaction reference</span><div><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter after payment" /><button onClick={submitReference}>Submit</button></div></label></> : <div className="pay-later"><Clock3 /><span><b>Payment details coming shortly</b><small>The kitchen will confirm how to pay for this order.</small></span></div>}{message && <div className="auth-message success">{message}</div>}<button className="store-primary" onClick={onClose}>View my orders</button></section></div>;
}
