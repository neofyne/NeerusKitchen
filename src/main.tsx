import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  Archive,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  FileSpreadsheet,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  List,
  Mail,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Type,
  Upload,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  UsersRound,
  X,
} from "lucide-react";
import "./styles.css";
import "./storefront.css";
import { Storefront } from "./storefront";
import { supabase } from "./supabase";

type Stage =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered";
type DeliveryBy = "nanny" | "others";
type Screen = "orders" | "menu" | "settings";

type Order = {
  id: string;
  created_at?: string;
  order_date: string;
  customer_name: string;
  flat_number: string;
  order_details: string;
  delivery_time: string | null;
  amount: number;
  delivered_by: DeliveryBy;
  is_paid: boolean;
  stage: Stage;
  remarks: string;
  photo_path: string | null;
  photo_url?: string;
  source?: "family" | "customer";
  payment_status?: "pending" | "submitted" | "verified" | "failed" | "refunded";
  payment_reference?: string | null;
  payment_method?: "upi" | "cash";
};
type Draft = Omit<Order, "id">;
type MenuItem = {
  id: string;
  name: string;
  price: number;
  photo_path: string | null;
  photo_url?: string;
  is_active: boolean;
  description?: string;
  spice_level?: "mild" | "medium" | "spicy";
  daily?: {
    is_available: boolean;
    is_featured: boolean;
    portions_available: number | null;
    special_price: number | null;
  };
};
type CustomerProfile = {
  customer_name: string;
  flat_number: string;
  delivered_by: DeliveryBy;
};
type CustomerAccessRequest = {
  id: string;
  full_name: string;
  flat_number: string;
  phone: string;
  access_status: "pending" | "approved" | "rejected";
  access_requested_at: string | null;
  created_at: string;
};
type ExportOptions = {
  from: string;
  to: string;
  payment: "all" | "paid" | "pending";
};
type AdminStoreSettings = {
  ordering_open: boolean;
  hero_message: string;
  upi_id: string;
  merchant_name: string;
  order_cutoff: string;
  whatsapp_number: string;
};
type PaymentSettingsUpdate = Pick<AdminStoreSettings, "upi_id" | "merchant_name">;
type AdminAccountUpdate = { email: string; currentPassword: string; newPassword: string };

const stages: { key: Stage; label: string; short: string; color: string }[] = [
  { key: "new", label: "New", short: "New", color: "blue" },
  { key: "confirmed", label: "Confirmed", short: "Confirmed", color: "violet" },
  { key: "preparing", label: "Preparing", short: "Cooking", color: "orange" },
  { key: "ready", label: "Ready", short: "Ready", color: "teal" },
  { key: "out_for_delivery", label: "Out for delivery", short: "On the way", color: "amber" },
  { key: "delivered", label: "Delivered", short: "Delivered", color: "green" },
];

const starterMenu: MenuItem[] = [
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
].map(([slug, name, price]) => ({
  id: String(slug),
  name: String(name),
  price: Number(price),
  photo_path: null,
  photo_url: `/food/${slug}.jpg`,
  is_active: true,
}));

const starterImage = new Map(starterMenu.map((item) => [item.name.toLowerCase(), item.photo_url]));
const today = () => {
  const local = new Date();
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};
const emptyDraft = (date: string): Draft => ({
  order_date: date,
  customer_name: "",
  flat_number: "",
  order_details: "",
  delivery_time: "",
  amount: 0,
  delivered_by: "nanny",
  is_paid: false,
  stage: "new",
  remarks: "",
  photo_path: null,
});
const money = (amount: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
type BuildingWing = "" | "A" | "B" | "C" | "D";
const splitAdminFlat = (value = "") => {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^([A-D])[-\s]?(\d+)$/);
  return match
    ? { wing: match[1] as BuildingWing, number: match[2] }
    : { wing: "" as BuildingWing, number: normalized.replace(/\D/g, "") };
};
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" }).format(
    new Date(`${date}T00:00:00`),
  );
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

async function getPrivatePhotoUrl(path: string, session: Session | null) {
  if (!session) return undefined;
  const response = await fetch(`/api/photos?key=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) return undefined;
  return URL.createObjectURL(await response.blob());
}

export function AdminApp() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(starterMenu);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [accessRequests, setAccessRequests] = useState<CustomerAccessRequest[]>([]);
  const [notificationOrders, setNotificationOrders] = useState<Order[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationBusyId, setNotificationBusyId] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("neeru-admin-alert-sound") !== "off");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [screen, setScreen] = useState<Screen>("orders");
  const [activeStage, setActiveStage] = useState<Stage>("new");
  const [large, setLarge] = useState(() => localStorage.getItem("neeru-text-size") !== "standard");
  const [dark, setDark] = useState(() => localStorage.getItem("neeru-theme") === "dark");
  const [phonePreview, setPhonePreview] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [adding, setAdding] = useState(false);
  const [menuAdding, setMenuAdding] = useState(false);
  const [menuEditing, setMenuEditing] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [storeSettings, setStoreSettings] = useState<AdminStoreSettings>({ ordering_open: true, hero_message: "Fresh home-style food, prepared with care and delivered to your door.", upi_id: "krsnasolo@okicici", merchant_name: "Neeru's Home Kitchen", order_cutoff: "", whatsapp_number: "918483000013" });
  const knownActionIds = useRef<Set<string> | null>(null);
  const alertAudioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setIsAdmin(false);
      setAdminChecked(!session);
      return;
    }
    setAdminChecked(false);
    supabase.rpc("is_admin").then(({ data, error }) => {
      setIsAdmin(!error && data === true);
      setAdminChecked(true);
    });
  }, [session]);

  useEffect(() => {
    localStorage.setItem("neeru-text-size", large ? "large" : "standard");
  }, [large]);

  useEffect(() => {
    localStorage.setItem("neeru-theme", dark ? "dark" : "light");
  }, [dark]);

  function ensureAlertAudio() {
    if (!alertAudioContext.current) alertAudioContext.current = new AudioContext();
    if (alertAudioContext.current.state === "suspended") alertAudioContext.current.resume().catch(() => undefined);
    return alertAudioContext.current;
  }

  function soundAlert(context = alertAudioContext.current) {
    if (!soundEnabledRef.current || !context || context.state !== "running") return;
    const start = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = start + index * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.055, toneStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + 0.13);
    });
  }

  function toggleAlertSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    localStorage.setItem("neeru-admin-alert-sound", next ? "on" : "off");
    if (next) {
      const context = ensureAlertAudio();
      window.setTimeout(() => soundAlert(context), 40);
    }
  }

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    if (!soundEnabled) return;
    const unlock = () => ensureAlertAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [soundEnabled]);

  async function loadOrders() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", selectedDate)
      .order("delivery_time")
      .order("created_at");
    setLoading(false);
    if (error) setNotice(`Could not load orders: ${error.message}`);
    else {
      const resolved = await Promise.all(
        ((data ?? []) as Order[]).map(async (order) => {
          if (!order.photo_path) return order;
          return { ...order, photo_url: await getPrivatePhotoUrl(order.photo_path, session) };
        }),
      );
      setOrders(resolved);
    }
  }

  async function loadMenu() {
    if (!supabase || !session) return;
    const [{ data, error }, { data: daily }, { data: configuration }] = await Promise.all([
      supabase.from("menu_items").select("*").order("is_active", { ascending: false }).order("name"),
      supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price").eq("menu_date", today()),
      supabase.from("storefront_settings").select("ordering_open,hero_message,upi_id,merchant_name,order_cutoff,whatsapp_number").eq("id", 1).maybeSingle(),
    ]);
    if (error || !data?.length) return;
    const dailyMap = new Map((daily ?? []).map((entry) => [entry.menu_item_id, entry]));
    const resolved = await Promise.all(
      (data as MenuItem[]).map(async (item) => {
        const todayEntry = dailyMap.get(item.id);
        const withDaily = { ...item, daily: { is_available: item.is_active && (todayEntry?.is_available ?? true), is_featured: Boolean(todayEntry?.is_featured), portions_available: todayEntry?.portions_available ?? null, special_price: todayEntry?.special_price ?? null } };
        if (!item.photo_path) {
          return { ...withDaily, price: Number(item.price || 0), photo_url: starterImage.get(item.name.toLowerCase()) };
        }
        return {
          ...withDaily,
          price: Number(item.price || 0),
          photo_url: await getPrivatePhotoUrl(item.photo_path, session),
        };
      }),
    );
    setMenuItems(resolved);
    if (configuration) setStoreSettings({ ...configuration, order_cutoff: configuration.order_cutoff?.slice(0, 5) || "" } as AdminStoreSettings);
  }

  async function loadCustomers() {
    if (!supabase || !session) return;
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name,flat_number,delivered_by,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return;
    const unique = new Map<string, CustomerProfile>();
    for (const row of data ?? []) {
      const key = String(row.customer_name).trim().toLowerCase();
      if (key && !unique.has(key)) {
        unique.set(key, {
          customer_name: String(row.customer_name),
          flat_number: String(row.flat_number),
          delivered_by: row.delivered_by as DeliveryBy,
        });
      }
    }
    setCustomers([...unique.values()]);
  }

  async function loadActionCenter(announceNew = false) {
    if (!supabase || !session) return;
    const [requestResult, orderResult] = await Promise.all([
      supabase
        .from("customer_profiles")
        .select("id,full_name,flat_number,phone,access_status,access_requested_at,created_at")
        .eq("access_status", "pending")
        .order("access_requested_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("orders")
        .select("*")
        .eq("source", "customer")
        .eq("stage", "new")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (requestResult.error && !/access_status/i.test(requestResult.error.message)) {
      setNotice(`Could not load customer requests: ${requestResult.error.message}`);
    }
    if (orderResult.error) {
      setNotice(`Could not load online order alerts: ${orderResult.error.message}`);
    }
    const requests = (requestResult.data || []) as CustomerAccessRequest[];
    const onlineOrders = (orderResult.data || []) as Order[];
    const nextIds = new Set([
      ...requests.map((request) => `signup:${request.id}`),
      ...onlineOrders.map((order) => `order:${order.id}`),
    ]);
    const hasNewAction = knownActionIds.current
      ? [...nextIds].some((id) => !knownActionIds.current?.has(id))
      : false;
    knownActionIds.current = nextIds;
    setAccessRequests(requests);
    setNotificationOrders(onlineOrders);
    if (announceNew && hasNewAction) soundAlert();
  }

  useEffect(() => {
    loadOrders();
  }, [selectedDate, session]);
  useEffect(() => {
    loadMenu();
    loadCustomers();
    loadActionCenter(false);
  }, [session]);
  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    const channel = client
      .channel("kitchen-action-centre")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_profiles" }, () => loadActionCenter(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadActionCenter(true))
      .subscribe();
    const refresh = window.setInterval(() => loadActionCenter(true), 20_000);
    return () => {
      window.clearInterval(refresh);
      client.removeChannel(channel);
    };
  }, [session]);
  useEffect(() => {
    if (!supabase || !session) return;
    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `order_date=eq.${selectedDate}` },
        loadOrders,
      )
      .subscribe();
    const refresh = window.setInterval(loadOrders, 20_000);
    return () => {
      window.clearInterval(refresh);
      supabase?.removeChannel(channel);
    };
  }, [selectedDate, session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? orders.filter((o) => `${o.customer_name} ${o.flat_number} ${o.order_details}`.toLowerCase().includes(q))
      : orders;
  }, [orders, search]);
  const stats = useMemo(
    () => ({
      total: orders.length,
      amount: orders.reduce((n, o) => n + Number(o.amount), 0),
      paid: orders.filter((o) => o.is_paid).reduce((n, o) => n + Number(o.amount), 0),
      nanny: orders.filter((o) => o.delivered_by === "nanny").length,
      others: orders.filter((o) => o.delivered_by === "others").length,
    }),
    [orders],
  );
  const draft = adding ? emptyDraft(selectedDate) : editing;

  async function uploadPhoto(photo: File, purpose: "orders" | "menu" | "payment") {
    if (!session) throw new Error("Please sign in again before uploading a photo.");
    const form = new FormData();
    form.append("photo", photo);
    form.append("purpose", purpose);
    const response = await fetch("/api/photos", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Photo upload is unavailable. Use the Netlify-hosted app.");
    }
    return result.key as string;
  }

  async function saveOrder(values: Draft, photo?: File) {
    if (!supabase) return setNotice("Add your Supabase publishable key to .env.local first.");
    if (!values.customer_name || !values.flat_number || !values.order_details) {
      return setNotice("Please fill customer name, flat number, and order.");
    }
    let photoPath = values.photo_path;
    if (photo) {
      try {
        photoPath = await uploadPhoto(photo, "orders");
      } catch (error) {
        return setNotice(error instanceof Error ? error.message : "Could not upload photo.");
      }
    }
    const record = {
      ...values,
      photo_path: photoPath,
      amount: Number(values.amount),
      delivery_time: values.delivery_time || null,
      payment_status: values.is_paid ? "verified" : "pending",
    };
    const result = editing
      ? await supabase.from("orders").update(record).eq("id", editing.id)
      : await supabase.from("orders").insert(record);
    if (result.error) setNotice(`Could not save: ${result.error.message}`);
    else {
      setAdding(false);
      setEditing(null);
      setScreen("orders");
      setNotice("Order saved successfully.");
      loadOrders();
      loadCustomers();
    }
  }

  async function exportOrdersCsv(options: ExportOptions) {
    if (!supabase) return;
    if (!options.from || !options.to || options.from > options.to) {
      return setNotice("Choose a valid export date range.");
    }
    let query = supabase
      .from("orders")
      .select("*")
      .gte("order_date", options.from)
      .lte("order_date", options.to)
      .order("order_date")
      .order("delivery_time");
    if (options.payment !== "all") query = query.eq("is_paid", options.payment === "paid");
    const { data, error } = await query;
    if (error) return setNotice(`Could not export orders: ${error.message}`);

    const safeCell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = ["Sr. No.", "Date", "Customer Name", "Flat Number", "Order", "Delivery Time", "Amount (INR)", "Delivered By", "Paid", "Stage", "Remarks"];
    const rows = ((data ?? []) as Order[]).map((order, index) => [
      index + 1,
      order.order_date,
      order.customer_name,
      order.flat_number,
      order.order_details,
      order.delivery_time?.slice(0, 5) || "",
      Number(order.amount),
      order.delivered_by === "nanny" ? "Nanny" : "Others",
      order.is_paid ? "Yes" : "No",
      stages.find((stage) => stage.key === order.stage)?.label || order.stage,
      order.remarks,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(safeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `neerus-kitchen-${options.from}-to-${options.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`${rows.length} orders exported. Open the file in Excel or import it into Google Sheets.`);
  }

  async function saveMenuItem(values: Pick<MenuItem, "name" | "price" | "description" | "spice_level">, photo?: File, existing?: MenuItem) {
    if (!supabase || !session) return;
    let photoPath: string | null = existing?.photo_path ?? null;
    if (photo) {
      try {
        photoPath = await uploadPhoto(photo, "menu");
      } catch (error) {
        return setNotice(error instanceof Error ? error.message : "Could not upload menu photo.");
      }
    }
    const record = { name: values.name.trim(), price: Number(values.price), description: values.description?.trim() ?? "", spice_level: values.spice_level || "mild", photo_path: photoPath, is_active: true };
    const { error } = existing
      ? await supabase.from("menu_items").update(record).eq("id", existing.id)
      : await supabase.from("menu_items").insert(record);
    if (error) setNotice(`Could not save menu item: ${error.message}`);
    else {
      setMenuAdding(false);
      setMenuEditing(null);
      setNotice(`${values.name} was ${existing ? "updated" : "added to the recipe catalogue"}.`);
      loadMenu();
    }
  }

  async function toggleMenuItem(item: MenuItem) {
    if (!supabase) return;
    const next = !item.is_active;
    if (!next && !confirm(`Archive ${item.name}? It will disappear from the customer menu but can be restored here.`)) return;
    const { error } = await supabase.from("menu_items").update({ is_active: next }).eq("id", item.id);
    if (error) setNotice(`Could not update recipe: ${error.message}`);
    else {
      if (!next) await updateDailyMenu(item, { is_available: false, is_featured: false });
      setNotice(next ? `${item.name} restored to the catalogue.` : `${item.name} archived.`);
      loadMenu();
    }
  }

  async function updateDailyMenu(item: MenuItem, changes: Partial<NonNullable<MenuItem["daily"]>>) {
    if (!supabase) return;
    const daily = { is_available: true, is_featured: false, portions_available: null, special_price: null, ...item.daily, ...changes };
    const { error } = await supabase.from("daily_menu").upsert({ menu_item_id: item.id, menu_date: today(), ...daily }, { onConflict: "menu_item_id,menu_date" });
    if (error) setNotice(`Could not update today's menu: ${error.message}`); else loadMenu();
  }

  async function setAllDailyMenu(isAvailable: boolean) {
    if (!supabase) return;
    const rows = menuItems.filter((item) => item.is_active).map((item) => ({ menu_item_id: item.id, menu_date: today(), is_available: isAvailable, is_featured: isAvailable ? Boolean(item.daily?.is_featured) : false, portions_available: item.daily?.portions_available ?? null, special_price: item.daily?.special_price ?? null }));
    const { error } = await supabase.from("daily_menu").upsert(rows, { onConflict: "menu_item_id,menu_date" });
    if (error) setNotice(`Could not update today's menu: ${error.message}`);
    else { setNotice(isAvailable ? "All active recipes are shown today." : "Today's customer menu is cleared."); loadMenu(); }
  }

  async function repeatYesterdayMenu() {
    if (!supabase) return;
    const { data, error } = await supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price").eq("menu_date", shift(today(), -1));
    if (error) return setNotice(`Could not load yesterday's menu: ${error.message}`);
    if (!data?.length) return setNotice("Yesterday has no saved customer menu to repeat.");
    const rows = data.map((entry) => ({ ...entry, menu_date: today() }));
    const result = await supabase.from("daily_menu").upsert(rows, { onConflict: "menu_item_id,menu_date" });
    if (result.error) setNotice(`Could not repeat yesterday: ${result.error.message}`);
    else { setNotice("Yesterday's menu, featured dishes and portions were copied to today."); loadMenu(); }
  }

  async function saveStoreSettings(settings: AdminStoreSettings) {
    if (!supabase) return;
    const { error } = await supabase.from("storefront_settings").upsert({ id: 1, ...settings, order_cutoff: settings.order_cutoff || null });
    if (error) setNotice(`Could not save storefront: ${error.message}`);
    else { setStoreSettings(settings); setNotice("Customer storefront settings saved."); }
  }

  async function savePaymentSettings(values: PaymentSettingsUpdate, qrPhoto?: File) {
    if (!supabase) throw new Error("The shared database is not connected.");
    const upiId = values.upi_id.trim();
    const merchantName = values.merchant_name.trim();
    if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/.test(upiId)) {
      throw new Error("Enter a valid UPI ID, for example name@bank.");
    }
    if (!merchantName) throw new Error("Enter the name customers should see while paying.");
    const nextSettings = { ...storeSettings, upi_id: upiId, merchant_name: merchantName };
    const { error } = await supabase.from("storefront_settings").upsert({ id: 1, ...nextSettings, order_cutoff: nextSettings.order_cutoff || null });
    if (error) throw new Error(`Could not save payment settings: ${error.message}`);
    setStoreSettings(nextSettings);
    if (qrPhoto) {
      try {
        await uploadPhoto(qrPhoto, "payment");
      } catch (error) {
        throw new Error(`UPI details were saved, but the QR upload failed. ${error instanceof Error ? error.message : "Please try again."}`);
      }
    }
  }

  async function removePaymentQr() {
    if (!session) throw new Error("Please sign in again before removing the QR code.");
    const response = await fetch("/api/photos?key=payment/current", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not remove the payment QR code.");
  }

  async function saveCustomerContact(whatsappNumber: string) {
    if (!supabase) throw new Error("The shared database is not connected.");
    const digits = whatsappNumber.replace(/\D/g, "");
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    if (normalized && (normalized.length < 11 || normalized.length > 15)) {
      throw new Error("Enter the WhatsApp number with country code, for example +91 98765 43210.");
    }
    const nextSettings = { ...storeSettings, whatsapp_number: normalized };
    const { error } = await supabase.from("storefront_settings").upsert({ id: 1, ...nextSettings, order_cutoff: nextSettings.order_cutoff || null });
    if (error) throw new Error(`Could not save customer contact: ${error.message}`);
    setStoreSettings(nextSettings);
  }

  async function reviewCustomerAccess(customerId: string, approve: boolean) {
    if (!supabase) throw new Error("The shared database is not connected.");
    const { error } = await supabase.rpc("review_customer_access", { p_customer_id: customerId, p_approve: approve });
    if (error) throw new Error(error.message);
    await loadActionCenter(false);
    setNotice(approve ? "Customer approved. They can now sign in with their mobile number and PIN." : "Customer request declined.");
  }

  async function updateAdminAccount(values: AdminAccountUpdate) {
    if (!supabase || !session?.user.email) throw new Error("Please sign in again before changing the admin account.");
    const email = values.email.trim().toLowerCase();
    const emailChanged = email !== session.user.email.toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Enter a valid admin email address.");
    if (!values.currentPassword) throw new Error("Enter the current password to confirm this change.");
    if (!emailChanged && !values.newPassword) throw new Error("Change the email or enter a new password first.");
    if (values.newPassword && values.newPassword.length < 8) throw new Error("The new password must contain at least 8 characters.");

    const verification = await supabase.auth.signInWithPassword({ email: session.user.email, password: values.currentPassword });
    if (verification.error) throw new Error("The current password is not correct.");
    const changes: { email?: string; password?: string } = {};
    if (emailChanged) changes.email = email;
    if (values.newPassword) changes.password = values.newPassword;
    const { error } = await supabase.auth.updateUser(changes, {
      emailRedirectTo: `${window.location.origin}/admin`,
    });
    if (error) throw new Error(error.message);
    return emailChanged
      ? "Account updated. Supabase may send confirmation links to the old and new email addresses before the email changes."
      : "Admin password updated successfully.";
  }

  async function updateOrder(id: string, changes: Partial<Order>) {
    if (!supabase) return;
    const record = changes.is_paid === undefined
      ? changes
      : { ...changes, payment_status: changes.is_paid ? "verified" : "pending" };
    const { error } = await supabase.from("orders").update(record).eq("id", id);
    if (error) setNotice(`Could not update: ${error.message}`);
    else loadOrders();
  }
  async function deleteOrder(id: string) {
    if (!supabase || !confirm("Delete this order?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) setNotice(`Could not delete: ${error.message}`);
    else {
      setEditing(null);
      loadOrders();
    }
  }

  const openNewOrder = () => {
    setEditing(null);
    setAdding(true);
  };
  const openScreen = (next: Screen) => {
    setNotificationsOpen(false);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const notificationCount = accessRequests.length + notificationOrders.length;
  const reviewFromNotifications = async (request: CustomerAccessRequest, approve: boolean) => {
    setNotificationBusyId(request.id);
    try {
      await reviewCustomerAccess(request.id, approve);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not review this customer request.");
    } finally {
      setNotificationBusyId("");
    }
  };
  const openNotificationOrder = (order: Order) => {
    setNotificationsOpen(false);
    setAdding(false);
    setSelectedDate(order.order_date);
    setScreen("orders");
    setActiveStage("new");
    setEditing(order);
  };

  if (supabase && !session) return <Login dark={dark} />;
  if (supabase && session && recoveringPassword) {
    return <PasswordReset dark={dark} onComplete={() => setRecoveringPassword(false)} />;
  }
  if (supabase && session && !adminChecked) {
    return <main className="login-page"><section className="login-card admin-check"><LogoMark /><span className="loader" /><h1>Opening order desk…</h1><p>Checking family access securely.</p></section></main>;
  }
  if (supabase && session && !isAdmin) {
    return <main className="login-page"><section className="login-card"><LogoMark /><p className="eyebrow">CUSTOMER ACCOUNT</p><h1>Family access only</h1><p>This account cannot open the kitchen order desk.</p><a className="login-link" href="/">Return to the customer menu</a><button className="login-signout" onClick={() => supabase?.auth.signOut()}>Use a different admin account</button></section></main>;
  }
  return (
    <div className={`workspace ${phonePreview ? "preview-mode" : ""}`}>
      <button
        className="device-switch"
        onClick={() => setPhonePreview(!phonePreview)}
        aria-pressed={phonePreview}
      >
        <Smartphone size={18} />
        {phonePreview ? "Exit phone preview" : "Preview on phone"}
      </button>
      <div className={`app-frame ${large ? "large" : ""} ${dark ? "dark" : ""}`}>
        <main className="app">
          <header className="app-header">
            <button className="brand" onClick={() => openScreen("orders")} aria-label="Open orders">
              <LogoMark />
              <span className="brand-copy">
                <strong>Neeru’s Home Kitchen</strong>
                <small>HOME KITCHEN · ORDER DESK</small>
              </span>
            </button>
            <nav className="desktop-nav" aria-label="Main navigation">
              <button className={screen === "orders" ? "active" : ""} onClick={() => openScreen("orders")}>
                <LayoutDashboard size={18} /> Orders
              </button>
              <button className={screen === "menu" ? "active" : ""} onClick={() => openScreen("menu")}>
                <ChefHat size={18} /> Menu
              </button>
              <button className={screen === "settings" ? "active" : ""} onClick={() => openScreen("settings")}>
                <Settings2 size={18} /> Settings
              </button>
            </nav>
            <div className="header-actions">
              <AdminNotificationCenter
                open={notificationsOpen}
                count={notificationCount}
                accessRequests={accessRequests}
                orders={notificationOrders}
                soundEnabled={soundEnabled}
                busyId={notificationBusyId}
                onToggle={() => {
                  if (soundEnabled) ensureAlertAudio();
                  setNotificationsOpen((current) => !current);
                }}
                onClose={() => setNotificationsOpen(false)}
                onToggleSound={toggleAlertSound}
                onReview={reviewFromNotifications}
                onOpenOrder={openNotificationOrder}
                onManageApprovals={() => { setNotificationsOpen(false); openScreen("settings"); }}
              />
              <button className="icon-button text-size" onClick={() => openScreen("settings")} title="Open settings">
                <Settings2 size={20} />
                <span>Settings</span>
              </button>
              {session && (
                <button className="avatar" onClick={() => supabase?.auth.signOut()} title="Sign out">
                  <CircleUserRound size={23} />
                </button>
              )}
            </div>
          </header>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={18} /></button>
            </div>
          )}

          {screen === "orders" ? (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">DAILY OPERATIONS</span>
                  <h1>Today’s orders</h1>
                  <p>Track every meal from request to delivery.</p>
                </div>
                <button className="primary desktop-add" onClick={openNewOrder}><Plus size={20} /> New order</button>
              </section>

              <section className="date-toolbar">
                <button className="date-arrow" onClick={() => setSelectedDate(shift(selectedDate, -1))} aria-label="Previous day"><ChevronLeft /></button>
                <label className="date-control">
                  <CalendarDays size={20} />
                  <span>
                    <b>{dateLabel(selectedDate)}</b>
                    <small>{selectedDate === today() ? "Today" : selectedDate}</small>
                  </span>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
                <button className="date-arrow" onClick={() => setSelectedDate(shift(selectedDate, 1))} aria-label="Next day"><ChevronRight /></button>
                {selectedDate !== today() && <button className="today" onClick={() => setSelectedDate(today())}>Go to today</button>}
              </section>

              <section className="summary" aria-label="Daily summary">
                <Stat label="Orders" value={stats.total} icon={<UtensilsCrossed />} />
                <Stat label="Revenue" value={money(stats.amount)} icon={<IndianRupee />} />
                <Stat label="Collected" value={money(stats.paid)} tone="good" icon={<Check />} />
                <Stat label="Pending" value={money(stats.amount - stats.paid)} tone="danger" icon={<Clock3 />} />
                <Stat label="By Nanny" value={stats.nanny} compact />
                <Stat label="By Others" value={stats.others} compact />
              </section>

              <section className="work-controls">
                <label className="search">
                  <Search size={20} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, flat or food" />
                  {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={17} /></button>}
                </label>
                <div className="view-switch" aria-label="Choose order view">
                  <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><LayoutDashboard size={17} /> Board</button>
                  <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={17} /> List</button>
                </div>
              </section>

              {!supabase && <div className="setup">Setup needed: add the Supabase key in <code>.env.local</code>.</div>}
              {loading ? (
                <div className="empty"><span className="loader" /><strong>Loading orders…</strong></div>
              ) : filtered.length === 0 ? (
                <div className="empty"><span className="empty-icon"><UtensilsCrossed /></span><strong>{search ? "No matching orders" : "No orders for this day"}</strong><span>{search ? "Try a different customer, flat or food." : "Add the first order when the phone rings."}</span>{!search && <button className="secondary" onClick={openNewOrder}><Plus size={18} /> Add order</button>}</div>
              ) : view === "board" ? (
                <Board orders={filtered} menuItems={menuItems} activeStage={activeStage} onStage={setActiveStage} onEdit={setEditing} onUpdate={updateOrder} />
              ) : (
                <OrderList orders={filtered} menuItems={menuItems} onEdit={setEditing} onUpdate={updateOrder} />
              )}
            </>
          ) : screen === "menu" ? (
            <MenuScreen items={menuItems} settings={storeSettings} onSaveSettings={saveStoreSettings} onDaily={updateDailyMenu} onAdd={() => setMenuAdding(true)} onEdit={setMenuEditing} onToggleArchive={toggleMenuItem} onShowAll={() => setAllDailyMenu(true)} onHideAll={() => setAllDailyMenu(false)} onRepeatYesterday={repeatYesterdayMenu} onOrder={(item) => { setScreen("orders"); setEditing(null); setAdding(true); sessionStorage.setItem("neeru-prefill", JSON.stringify(item)); }} />
          ) : (
            <SettingsScreen
              large={large}
              dark={dark}
              selectedDate={selectedDate}
              customerCount={customers.length}
              accessRequests={accessRequests}
              adminEmail={session?.user.email || ""}
              paymentSettings={storeSettings}
              whatsappNumber={storeSettings.whatsapp_number}
              onLarge={setLarge}
              onDark={setDark}
              onExport={exportOrdersCsv}
              onSavePayment={savePaymentSettings}
              onRemovePaymentQr={removePaymentQr}
              onSaveCustomerContact={saveCustomerContact}
              onReviewCustomerAccess={reviewCustomerAccess}
              onUpdateAccount={updateAdminAccount}
              onSignOut={() => supabase?.auth.signOut()}
            />
          )}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button className={`nav-orders ${screen === "orders" ? "active" : ""}`} onClick={() => openScreen("orders")}><LayoutDashboard /><span>Orders</span></button>
          <button className="nav-add" onClick={openNewOrder}><Plus /><span>Add order</span></button>
          <button className={`nav-menu ${screen === "menu" ? "active" : ""}`} onClick={() => openScreen("menu")}><ChefHat /><span>Menu</span></button>
        </nav>

        {draft && (
          <OrderForm
            key={editing?.id ?? `new-${adding}`}
            draft={draft}
            menuItems={menuItems}
            customers={customers}
            onClose={() => { setAdding(false); setEditing(null); sessionStorage.removeItem("neeru-prefill"); }}
            onSave={saveOrder}
            onDelete={editing ? () => deleteOrder(editing.id) : undefined}
          />
        )}
        {(menuAdding || menuEditing) && <MenuItemForm item={menuEditing} onClose={() => { setMenuAdding(false); setMenuEditing(null); }} onSave={saveMenuItem} />}
      </div>
    </div>
  );
}

function AdminNotificationCenter({ open, count, accessRequests, orders, soundEnabled, busyId, onToggle, onClose, onToggleSound, onReview, onOpenOrder, onManageApprovals }: {
  open: boolean;
  count: number;
  accessRequests: CustomerAccessRequest[];
  orders: Order[];
  soundEnabled: boolean;
  busyId: string;
  onToggle: () => void;
  onClose: () => void;
  onToggleSound: () => void;
  onReview: (request: CustomerAccessRequest, approve: boolean) => Promise<void>;
  onOpenOrder: (order: Order) => void;
  onManageApprovals: () => void;
}) {
  return (
    <div className="notification-center">
      <button className={`notification-bell ${count ? "has-actions" : ""}`} onClick={onToggle} aria-expanded={open} aria-label={`${count} kitchen actions waiting`} title="Open notifications">
        <Bell size={20} />
        {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Kitchen action centre">
          <div className="notification-panel-head">
            <div><span>ACTION CENTRE</span><h2>{count ? `${count} waiting` : "All caught up"}</h2></div>
            <div>
              <button className={`notification-sound ${soundEnabled ? "active" : ""}`} onClick={onToggleSound} title={soundEnabled ? "Turn alert sound off" : "Turn alert sound on"}>{soundEnabled ? <Volume2 /> : <VolumeX />}<span>{soundEnabled ? "Sound on" : "Sound off"}</span></button>
              <button className="notification-close" onClick={onClose} aria-label="Close notifications"><X /></button>
            </div>
          </div>
          <div className="notification-scroll">
            {!count && <div className="notification-empty"><Check /><b>Nothing needs attention</b><span>New customer signups and online orders will appear here.</span></div>}
            {accessRequests.length > 0 && <div className="notification-group">
              <div className="notification-group-title"><span><UsersRound /> Customer approvals</span><b>{accessRequests.length}</b></div>
              {accessRequests.map((request) => {
                const digits = request.phone.replace(/\D/g, "");
                const shownPhone = digits.length === 12 && digits.startsWith("91") ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : request.phone;
                return <article className="notification-item signup-notification" key={request.id}>
                  <span className="notification-item-icon"><CircleUserRound /></span>
                  <div><b>{request.full_name || "New customer"}</b><small>Flat {request.flat_number || "not added"} · {shownPhone || "No phone"}</small></div>
                  <div className="notification-review-actions"><button disabled={Boolean(busyId)} onClick={() => onReview(request, true)}><Check /> Approve</button><button disabled={Boolean(busyId)} onClick={() => { if (confirm(`Decline access for ${request.full_name || shownPhone}?`)) onReview(request, false); }}><X /> Decline</button></div>
                </article>;
              })}
            </div>}
            {orders.length > 0 && <div className="notification-group">
              <div className="notification-group-title"><span><ReceiptText /> New online orders</span><b>{orders.length}</b></div>
              {orders.map((order) => <button className="notification-item order-notification" key={order.id} onClick={() => onOpenOrder(order)}>
                <span className="notification-item-icon"><UtensilsCrossed /></span>
                <span><b>{order.customer_name} · Flat {order.flat_number}</b><small>{order.order_details}</small></span>
                <strong>{money(Number(order.amount))}<ChevronRight /></strong>
              </button>)}
            </div>}
          </div>
          <button className="notification-manage" onClick={onManageApprovals}><Settings2 /> Open approval settings</button>
        </section>
      )}
    </div>
  );
}

function Login({ dark }: { dark: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? "That email or password is not correct. Please try again." : "");
  }
  async function requestPasswordReset() {
    if (!supabase) return;
    if (!email.trim()) {
      setMessage("Enter your family email address first, then tap Set or reset password.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin`,
    });
    setMessage(error ? `Could not send the reset email: ${error.message}` : "Password email sent. Open it on this phone and follow the secure link.");
  }
  return (
    <main className={`login-page ${dark ? "dark-login" : ""}`}>
      <section className="login-card">
        <LogoMark />
        <p className="eyebrow">PRIVATE FAMILY APP</p>
        <h1>Neeru’s Home Kitchen</h1>
        <p>One secure place for the family to manage daily kitchen orders.</p>
        <form onSubmit={signIn}>
          <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your kitchen password" autoComplete="current-password" required /></label>
          <button>Sign in to kitchen</button>
          <button type="button" className="reset-password" onClick={requestPasswordReset}>Set or reset password</button>
        </form>
        {message && <div className={`login-message ${message.startsWith("Password email") ? "success" : "error"}`}>{message}</div>}
        <p className="login-help">Need access? Ask the kitchen administrator to add your family account.</p>
      </section>
    </main>
  );
}

function PasswordReset({ dark, onComplete }: { dark: boolean; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The two passwords do not match.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(`Could not save the password: ${error.message}`);
    else onComplete();
  }
  return (
    <main className={`login-page ${dark ? "dark-login" : ""}`}>
      <section className="login-card">
        <LogoMark />
        <p className="eyebrow">SECURE FAMILY ACCESS</p>
        <h1>Set a new password</h1>
        <p>Choose a password with at least 8 characters. Share it only with the family members who use this kitchen.</p>
        <form onSubmit={savePassword}>
          <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>
          <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>
          <button>Save new password</button>
        </form>
        {message && <div className="login-message error">{message}</div>}
      </section>
    </main>
  );
}

function LogoMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path className="logo-steam" d="M17 21c-3-3 2-5 0-9M24 21c-3-3 2-5 0-10M31 21c-3-3 2-5 0-9" />
        <path className="logo-bowl" d="M10.5 25.5h27c-.8 8.2-6.1 12.5-13.5 12.5s-12.7-4.3-13.5-12.5Z" />
        <path className="logo-rim" d="M8.5 25.5h31" />
      </svg>
    </span>
  );
}

function Stat({ label, value, tone = "", icon, compact = false }: { label: string; value: string | number; tone?: string; icon?: React.ReactNode; compact?: boolean }) {
  return <div className={`stat ${tone} ${compact ? "compact" : ""}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}
function StageBadge({ stage }: { stage: Stage }) {
  const s = stages.find((x) => x.key === stage)!;
  return <span className={`stage ${s.color}`}><i />{s.label}</span>;
}
function menuImageFor(order: Order, menuItems: MenuItem[]) {
  const details = order.order_details.toLowerCase();
  return menuItems.find((item) => details.includes(item.name.toLowerCase()))?.photo_url;
}
function OrderCard({ order, menuItems, onEdit, onUpdate }: { order: Order; menuItems: MenuItem[]; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void }) {
  const current = stages.findIndex((s) => s.key === order.stage);
  const next = stages[current + 1];
  const image = order.photo_url || menuImageFor(order, menuItems);
  const paymentLabel = order.is_paid ? "Paid" : order.payment_status === "submitted" ? "Verify payment" : "Pending";
  return (
    <article className={`card card-${order.stage}`} onClick={() => onEdit(order)}>
      <div className="card-body">
        <div className="card-top">
          <span className="card-stage-group"><StageBadge stage={order.stage} />{order.source === "customer" && <span className="source-badge">Online</span>}</span>
          <button className={`${order.is_paid ? "paid yes" : "paid"} ${order.payment_status === "submitted" ? "submitted" : ""}`} onClick={(e) => { e.stopPropagation(); onUpdate(order.id, { is_paid: !order.is_paid }); }}><Check size={13} />{paymentLabel}</button>
        </div>
        <div className="card-summary-layout">
          <span className="order-thumb">{image ? <img src={image} alt="" /> : <ChefHat />}</span>
          <div className="card-summary-copy">
            <div className="customer-line"><div><h3>{order.customer_name}</h3><span>Flat {order.flat_number}</span></div><strong>{money(Number(order.amount))}</strong></div>
            <p className="food"><b>{order.order_details}</b></p>
          </div>
        </div>
        {order.remarks && <p className="remark">{order.remarks}</p>}
        {order.payment_reference && <p className="payment-reference"><ReceiptText size={13} /><span>UPI reference</span><b>{order.payment_reference}</b></p>}
        <div className="details"><span><Clock3 size={17} />{order.delivery_time?.slice(0, 5) || "Time not set"}</span><span>Via {order.delivered_by === "nanny" ? "Nanny" : "Others"}</span></div>
        <div className="card-footer">
          <button className="edit-order" onClick={(e) => { e.stopPropagation(); onEdit(order); }}>Edit details</button>
          {next && <button className="move-order" onClick={(e) => { e.stopPropagation(); onUpdate(order.id, { stage: next.key }); }}>Move to {next.short}<ChevronRight size={16} /></button>}
        </div>
      </div>
    </article>
  );
}

function Board({ orders, menuItems, activeStage, onStage, onEdit, onUpdate }: { orders: Order[]; menuItems: MenuItem[]; activeStage: Stage; onStage: (stage: Stage) => void; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void }) {
  return (
    <>
      <div className="stage-tabs">
        {stages.map((stage) => <button key={stage.key} className={`${stage.color} ${activeStage === stage.key ? "active" : ""}`} onClick={() => onStage(stage.key)}><i />{stage.short}<b>{orders.filter((o) => o.stage === stage.key).length}</b></button>)}
      </div>
      <section className="board">
        {stages.map((stage) => {
          const stageOrders = orders.filter((o) => o.stage === stage.key);
          return <div className={`column column-${stage.color} ${activeStage === stage.key ? "mobile-active" : ""}`} key={stage.key}>
            <div className="column-title"><span><i />{stage.label}</span><b>{stageOrders.length}</b></div>
            <div className="column-orders">
              {stageOrders.map((o) => <OrderCard key={o.id} order={o} menuItems={menuItems} onEdit={onEdit} onUpdate={onUpdate} />)}
              {!stageOrders.length && <div className="column-empty"><Check size={18} /><span>No orders here</span></div>}
            </div>
          </div>;
        })}
      </section>
    </>
  );
}

function OrderList({ orders, menuItems, onEdit, onUpdate }: { orders: Order[]; menuItems: MenuItem[]; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void }) {
  return <div className="order-list">{orders.map((o, i) => {
    const image = o.photo_url || menuImageFor(o, menuItems);
    return <div className="order-row" key={o.id} onClick={() => onEdit(o)}>
      <span className="serial">{String(i + 1).padStart(2, "0")}</span>
      {image ? <img src={image} alt="" /> : <span className="row-placeholder"><ChefHat /></span>}
      <div className="row-customer"><b>{o.customer_name} <em>· Flat {o.flat_number}</em>{o.source === "customer" && <i className="online-order-tag">Online</i>}</b><small><span>Order</span>{o.order_details}</small></div>
      <span className="row-time"><Clock3 size={14} />{o.delivery_time?.slice(0, 5) || "Not set"}</span>
      <b className="row-amount">{money(Number(o.amount))}</b>
      <StageBadge stage={o.stage} />
      <button className={`${o.is_paid ? "paid yes" : "paid"} ${o.payment_status === "submitted" ? "submitted" : ""}`} title={o.payment_reference ? `UPI reference: ${o.payment_reference}` : undefined} onClick={(e) => { e.stopPropagation(); onUpdate(o.id, { is_paid: !o.is_paid }); }}>{o.is_paid ? "Paid" : o.payment_status === "submitted" ? "Verify" : "Pending"}</button>
    </div>;
  })}</div>;
}

function MenuScreen({ items, settings, onSaveSettings, onDaily, onAdd, onEdit, onToggleArchive, onShowAll, onHideAll, onRepeatYesterday, onOrder }: { items: MenuItem[]; settings: AdminStoreSettings; onSaveSettings: (settings: AdminStoreSettings) => void; onDaily: (item: MenuItem, changes: Partial<NonNullable<MenuItem["daily"]>>) => void; onAdd: () => void; onEdit: (item: MenuItem) => void; onToggleArchive: (item: MenuItem) => void; onShowAll: () => void; onHideAll: () => void; onRepeatYesterday: () => void; onOrder: (item: MenuItem) => void }) {
  const [form, setForm] = useState(settings);
  const [upiQr, setUpiQr] = useState("");
  useEffect(() => setForm(settings), [settings]);
  useEffect(() => {
    if (!form.upi_id.trim()) return setUpiQr("");
    const uri = `upi://pay?pa=${encodeURIComponent(form.upi_id.trim())}&pn=${encodeURIComponent(form.merchant_name || "Neeru's Home Kitchen")}&cu=INR&tn=${encodeURIComponent("Neeru's Home Kitchen payment preview")}`;
    QRCode.toDataURL(uri, { width: 180, margin: 1, color: { dark: "#17211b", light: "#ffffff" } }).then(setUpiQr);
  }, [form.upi_id, form.merchant_name]);
  const set = <K extends keyof AdminStoreSettings>(key: K, value: AdminStoreSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
  const activeItems = items.filter((item) => item.is_active);
  const shownCount = activeItems.filter((item) => item.daily?.is_available).length;
  const featuredCount = activeItems.filter((item) => item.daily?.is_available && item.daily?.is_featured).length;
  return (
    <>
      <section className="page-heading menu-heading"><div><span className="eyebrow">STOREFRONT CONTROL CENTRE</span><h1>Menu & selling</h1><p>Manage the recipe catalogue, today’s availability, featured dishes and payment instructions.</p></div><button className="primary" onClick={onAdd}><Plus size={20} /> Add recipe</button></section>
      <section className="storefront-manager">
        <div className="manager-heading"><span className="settings-icon"><ShoppingBagIcon /></span><div><h2>Customer storefront</h2><p>Control today’s public ordering page without changing the family order desk.</p></div><a href="/" target="_blank" rel="noreferrer">Open storefront <ChevronRight size={16} /></a></div>
        <div className="manager-fields">
          <label className="ordering-toggle"><input type="checkbox" checked={form.ordering_open} onChange={(event) => set("ordering_open", event.target.checked)} /><span><b>{form.ordering_open ? "Orders open" : "Orders paused"}</b><small>Customers {form.ordering_open ? "can place new orders" : "can browse but cannot order"}</small></span></label>
          <label><span>Customer message</span><input value={form.hero_message} onChange={(event) => set("hero_message", event.target.value)} /></label>
          <label><span>Kitchen UPI ID</span><input value={form.upi_id} onChange={(event) => set("upi_id", event.target.value)} placeholder="yourname@bank" /></label>
          <label><span>Merchant name</span><input value={form.merchant_name} onChange={(event) => set("merchant_name", event.target.value)} /></label>
          <label><span>Order cutoff</span><input type="time" value={form.order_cutoff} onChange={(event) => set("order_cutoff", event.target.value)} /></label>
          <button className="primary manager-save" onClick={() => onSaveSettings(form)}><Check size={18} /> Save storefront</button>
        </div>
        <div className="payment-preview">
          <div className="payment-preview-copy"><span className="payment-preview-icon"><ReceiptText /></span><div><b>UPI Direct payment</b><small>After checkout, customers see an order-specific QR and submit their UPI reference. The kitchen verifies it before marking the order paid.</small><strong>{form.upi_id || "Add a UPI ID above to activate the QR"}</strong></div></div>
          {upiQr && <div className="payment-preview-qr"><img src={upiQr} alt="UPI QR preview" /><span>QR preview</span></div>}
        </div>
      </section>
      <div className="daily-menu-toolbar"><div className="daily-menu-label"><span><CalendarDays size={17} /> Today’s customer menu</span><small>{shownCount} shown · {featuredCount} featured · {items.length - activeItems.length} archived</small></div><div className="daily-menu-actions"><button onClick={onRepeatYesterday}><RotateCcw size={14} /> Repeat yesterday</button><button onClick={onShowAll}><Check size={14} /> Show all</button><button onClick={onHideAll}><X size={14} /> Clear today</button></div></div>
      <section className="menu-grid">
        {items.map((item) => <article className={`menu-card ${item.is_active ? "" : "archived"}`} key={item.id}>
          <button className="menu-image" disabled={!item.is_active} onClick={() => onOrder(item)}>{item.photo_url ? <img src={item.photo_url} alt={item.name} /> : <span><ChefHat /></span>}<em>{item.is_active ? "Add admin order" : "Archived"}</em></button>
          <div className="menu-copy"><div><h2>{item.name}</h2><span>{item.daily?.special_price !== null && item.daily?.special_price !== undefined ? `${money(item.daily.special_price)} today · ${money(item.price)} regular` : money(item.price)}</span></div><div className="menu-card-actions"><button onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={15} /></button><button className="remove-food" onClick={() => onToggleArchive(item)} aria-label={`${item.is_active ? "Archive" : "Restore"} ${item.name}`}>{item.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}</button></div></div>
          {item.description && <p className="menu-description">{item.description}</p>}
          <div className="daily-controls"><button className={item.daily?.is_available ? "selected" : ""} disabled={!item.is_active} onClick={() => onDaily(item, { is_available: !item.daily?.is_available, is_featured: item.daily?.is_available ? false : item.daily?.is_featured })}><Check size={14} /> {item.daily?.is_available ? "Shown" : "Hidden"}</button><button className={item.daily?.is_featured ? "selected featured" : ""} disabled={!item.is_active || !item.daily?.is_available} onClick={() => onDaily(item, { is_featured: !item.daily?.is_featured })}><FlameIcon /> Featured</button><label><span>Today’s price</span><input type="number" min="0" placeholder={String(item.price)} disabled={!item.is_active || !item.daily?.is_available} value={item.daily?.special_price ?? ""} onChange={(event) => onDaily(item, { special_price: event.target.value === "" ? null : Number(event.target.value) })} /></label><label><span>Portions</span><input type="number" min="0" placeholder="∞" disabled={!item.is_active || !item.daily?.is_available} value={item.daily?.portions_available ?? ""} onChange={(event) => onDaily(item, { portions_available: event.target.value === "" ? null : Number(event.target.value) })} /></label></div>
        </article>)}
      </section>
    </>
  );
}

function ShoppingBagIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>; }
function FlameIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c4 0 7-3 7-7 0-3-2-6-5-9 0 3-2 4-3 5 0-3-1-6-3-8 0 5-3 7-3 12 0 4 3 7 7 7Z" /></svg>; }

function SettingsScreen({ large, dark, selectedDate, customerCount, accessRequests, adminEmail, paymentSettings, whatsappNumber, onLarge, onDark, onExport, onSavePayment, onRemovePaymentQr, onSaveCustomerContact, onReviewCustomerAccess, onUpdateAccount, onSignOut }: {
  large: boolean;
  dark: boolean;
  selectedDate: string;
  customerCount: number;
  accessRequests: CustomerAccessRequest[];
  adminEmail: string;
  paymentSettings: AdminStoreSettings;
  whatsappNumber: string;
  onLarge: (large: boolean) => void;
  onDark: (dark: boolean) => void;
  onExport: (options: ExportOptions) => void;
  onSavePayment: (values: PaymentSettingsUpdate, qrPhoto?: File) => Promise<void>;
  onRemovePaymentQr: () => Promise<void>;
  onSaveCustomerContact: (whatsappNumber: string) => Promise<void>;
  onReviewCustomerAccess: (customerId: string, approve: boolean) => Promise<void>;
  onUpdateAccount: (values: AdminAccountUpdate) => Promise<string>;
  onSignOut: () => void;
}) {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({ from: selectedDate, to: selectedDate, payment: "all" });
  const [paymentForm, setPaymentForm] = useState<PaymentSettingsUpdate>({ upi_id: paymentSettings.upi_id, merchant_name: paymentSettings.merchant_name });
  const [qrFile, setQrFile] = useState<File | undefined>();
  const [qrPreview, setQrPreview] = useState("");
  const [savedQrAvailable, setSavedQrAvailable] = useState(false);
  const [qrRevision, setQrRevision] = useState(() => Date.now());
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState(false);
  const [accountForm, setAccountForm] = useState<AdminAccountUpdate>({ email: adminEmail, currentPassword: "", newPassword: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState(false);
  const [contactNumber, setContactNumber] = useState(whatsappNumber ? `+${whatsappNumber}` : "");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [contactError, setContactError] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessError, setAccessError] = useState(false);
  const setExport = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setExportOptions((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setPaymentForm({ upi_id: paymentSettings.upi_id, merchant_name: paymentSettings.merchant_name });
  }, [paymentSettings.upi_id, paymentSettings.merchant_name]);

  useEffect(() => {
    setAccountForm((current) => ({ ...current, email: adminEmail }));
  }, [adminEmail]);

  useEffect(() => {
    setContactNumber(whatsappNumber ? `+${whatsappNumber}` : "");
  }, [whatsappNumber]);

  useEffect(() => {
    let objectUrl = "";
    if (qrFile) {
      objectUrl = URL.createObjectURL(qrFile);
      setQrPreview(objectUrl);
    } else {
      setQrPreview("");
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [qrFile]);

  useEffect(() => {
    const controller = new AbortController();
    setSavedQrAvailable(false);
    fetch(`/api/photos?key=payment/current&v=${qrRevision}`, { cache: "no-store", signal: controller.signal })
      .then((response) => setSavedQrAvailable(response.ok && Boolean(response.headers.get("content-type")?.startsWith("image/"))))
      .catch(() => setSavedQrAvailable(false));
    return () => controller.abort();
  }, [qrRevision]);

  const upiLooksValid = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/.test(paymentForm.upi_id.trim());
  const savedQrUrl = `/api/photos?key=payment/current&v=${qrRevision}`;

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    setPaymentMessage("");
    setPaymentError(false);
    if (!upiLooksValid) {
      setPaymentError(true);
      return setPaymentMessage("Enter a valid UPI ID, for example name@bank.");
    }
    setPaymentBusy(true);
    try {
      await onSavePayment(paymentForm, qrFile);
      setQrFile(undefined);
      setQrRevision(Date.now());
      setPaymentMessage(qrFile ? "UPI details and payment QR saved. Customers will see the new scanner at checkout." : "UPI payment details saved.");
    } catch (error) {
      setPaymentError(true);
      setPaymentMessage(error instanceof Error ? error.message : "Could not save payment settings.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function removeQr() {
    if (!confirm("Remove the uploaded payment QR? Customers will still see an automatically generated QR from the UPI ID.")) return;
    setPaymentBusy(true);
    setPaymentMessage("");
    setPaymentError(false);
    try {
      await onRemovePaymentQr();
      setQrFile(undefined);
      setSavedQrAvailable(false);
      setQrRevision(Date.now());
      setPaymentMessage("Uploaded QR removed. Automatic UPI QR is now active.");
    } catch (error) {
      setPaymentError(true);
      setPaymentMessage(error instanceof Error ? error.message : "Could not remove the payment QR.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setAccountMessage("");
    setAccountError(false);
    if (accountForm.newPassword !== confirmPassword) {
      setAccountError(true);
      return setAccountMessage("The two new-password fields do not match.");
    }
    setAccountBusy(true);
    try {
      const message = await onUpdateAccount(accountForm);
      setAccountMessage(message);
      setAccountForm((current) => ({ ...current, currentPassword: "", newPassword: "" }));
      setConfirmPassword("");
    } catch (error) {
      setAccountError(true);
      setAccountMessage(error instanceof Error ? error.message : "Could not update the admin account.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    setContactBusy(true);
    setContactMessage("");
    setContactError(false);
    try {
      await onSaveCustomerContact(contactNumber);
      setContactMessage(contactNumber.trim() ? "WhatsApp contact saved. The customer button is now active." : "WhatsApp contact removed from the customer storefront.");
    } catch (error) {
      setContactError(true);
      setContactMessage(error instanceof Error ? error.message : "Could not save the WhatsApp contact.");
    } finally {
      setContactBusy(false);
    }
  }

  async function reviewAccess(request: CustomerAccessRequest, approve: boolean) {
    if (!approve && !confirm(`Decline access for ${request.full_name || request.phone}?`)) return;
    setReviewingId(request.id);
    setAccessMessage("");
    setAccessError(false);
    try {
      await onReviewCustomerAccess(request.id, approve);
      setAccessMessage(approve ? `${request.full_name || "Customer"} can now sign in.` : "Access request declined.");
    } catch (error) {
      setAccessError(true);
      setAccessMessage(error instanceof Error ? error.message : "Could not review this request.");
    } finally {
      setReviewingId("");
    }
  }

  return (
    <>
      <section className="page-heading settings-heading">
        <div><span className="eyebrow">KITCHEN CONTROL CENTRE</span><h1>Settings</h1><p>Manage access, payments, appearance and kitchen records securely.</p></div>
      </section>
      <section className="settings-grid">
        <article className="settings-card access-requests-card">
          <div className="settings-title"><span className="settings-icon"><UsersRound /></span><div><h2>Customer access requests</h2><p>Approve known residents before they can sign in and place orders.</p></div><b className="request-count">{accessRequests.length}</b></div>
          {accessRequests.length ? <div className="access-request-list">{accessRequests.map((request) => {
            const digits = request.phone.replace(/\D/g, "");
            const shownPhone = digits.length === 12 && digits.startsWith("91") ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : request.phone;
            return <div className="access-request" key={request.id}>
              <span><b>{request.full_name || "Unnamed customer"}</b><small>Flat {request.flat_number || "not added"} · {shownPhone || "No phone"}</small></span>
              <div><button type="button" className="approve-access" disabled={Boolean(reviewingId)} onClick={() => reviewAccess(request, true)}><Check /> Approve</button><button type="button" className="reject-access" disabled={Boolean(reviewingId)} onClick={() => reviewAccess(request, false)}><X /> Decline</button></div>
            </div>;
          })}</div> : <p className="access-empty"><Check /> No customer requests are waiting.</p>}
          {accessMessage && <p className={`settings-message ${accessError ? "error" : "success"}`} role="status">{accessMessage}</p>}
        </article>

        <article className="settings-card account-settings-card">
          <div className="settings-title"><span className="settings-icon"><ShieldCheck /></span><div><h2>Admin account</h2><p>Change the email or password for this signed-in administrator.</p></div></div>
          <form className="settings-form account-settings-form" onSubmit={saveAccount}>
            <label className="wide-setting-field"><span><Mail /> Admin email</span><input type="email" value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" required /></label>
            <label><span><KeyRound /> Current password</span><input type="password" value={accountForm.currentPassword} onChange={(event) => setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} placeholder="Required to confirm changes" autoComplete="current-password" required /></label>
            <label><span>New password <small>Optional</small></span><input type="password" minLength={8} value={accountForm.newPassword} onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))} placeholder="At least 8 characters" autoComplete="new-password" /></label>
            <label><span>Confirm new password</span><input type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat the new password" autoComplete="new-password" /></label>
            {accountMessage && <p className={`settings-message ${accountError ? "error" : "success"}`} role="status">{accountMessage}</p>}
            <button className="primary settings-save" disabled={accountBusy}><Save size={17} /> {accountBusy ? "Updating account…" : "Update admin account"}</button>
          </form>
          <p className="settings-security-note"><ShieldCheck /> Email changes may need confirmation from Supabase. The account keeps its admin permission because its secure user ID does not change.</p>
        </article>

        <article className="settings-card payment-settings-card">
          <div className="settings-title"><span className="settings-icon"><QrCode /></span><div><h2>UPI and payment QR</h2><p>Control the payment details customers receive after ordering.</p></div></div>
          <form className="settings-form payment-settings-form" onSubmit={savePayment}>
            <div className="payment-settings-fields">
              <label><span>UPI ID</span><input value={paymentForm.upi_id} onChange={(event) => setPaymentForm((current) => ({ ...current, upi_id: event.target.value }))} placeholder="name@bank" inputMode="email" aria-invalid={paymentForm.upi_id.length > 0 && !upiLooksValid} required />{paymentForm.upi_id.length > 0 && !upiLooksValid && <small className="field-hint error">Use a UPI ID such as krsnasolo@okicici</small>}</label>
              <label><span>Payee name</span><input value={paymentForm.merchant_name} onChange={(event) => setPaymentForm((current) => ({ ...current, merchant_name: event.target.value }))} placeholder="Neeru's Home Kitchen" required /></label>
            </div>
            <div className="qr-uploader">
              <div className="qr-preview-box">
                {(qrPreview || savedQrAvailable) ? <img src={qrPreview || savedQrUrl} alt="Current payment QR preview" /> : <span><QrCode /><small>Automatic QR</small></span>}
              </div>
              <div className="qr-upload-copy">
                <b>{qrFile ? "New QR ready to save" : savedQrAvailable ? "Custom payment QR active" : "Using automatic UPI QR"}</b>
                <p>Upload the scanner image exported from GPay, PhonePe or your banking app. JPG, PNG or WebP works best.</p>
                <div className="qr-actions">
                  <label className="upload-qr-button"><Upload size={16} /> {savedQrAvailable ? "Replace QR" : "Upload QR"}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setQrFile(event.target.files?.[0])} /></label>
                  {(qrFile || savedQrAvailable) && <button type="button" className="remove-qr-button" onClick={() => qrFile ? setQrFile(undefined) : removeQr()} disabled={paymentBusy}><Trash2 size={15} /> {qrFile ? "Cancel" : "Remove"}</button>}
                </div>
              </div>
            </div>
            {paymentMessage && <p className={`settings-message ${paymentError ? "error" : "success"}`} role="status">{paymentMessage}</p>}
            <button className="primary settings-save" disabled={paymentBusy || !upiLooksValid}><Save size={17} /> {paymentBusy ? "Saving payment settings…" : "Save payment settings"}</button>
          </form>
          <p className="settings-security-note"><ShieldCheck /> QR files are stored in Netlify Blobs. The UPI ID remains available for tap-to-pay and as an automatic QR fallback.</p>
        </article>

        <article className="settings-card contact-settings-card">
          <div className="settings-title"><span className="settings-icon whatsapp-settings-icon"><MessageCircle /></span><div><h2>Customer WhatsApp</h2><p>Give customers a quick way to ask about the menu or their order.</p></div></div>
          <form className="settings-form" onSubmit={saveContact}>
            <label><span>WhatsApp number</span><input type="tel" inputMode="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder="+91 98765 43210" /></label>
            <p className="contact-preview"><MessageCircle /><span><b>{contactNumber.trim() ? "Message us on WhatsApp" : "Button hidden until a number is added"}</b><small>The customer link opens a prefilled chat. A 10-digit Indian number automatically receives country code +91.</small></span></p>
            {contactMessage && <p className={`settings-message ${contactError ? "error" : "success"}`} role="status">{contactMessage}</p>}
            <button className="primary settings-save" disabled={contactBusy}><Save size={17} /> {contactBusy ? "Saving contact…" : "Save WhatsApp contact"}</button>
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-title"><span className="settings-icon"><Type /></span><div><h2>Text size</h2><p>This choice stays saved on this phone.</p></div></div>
          <div className="size-options" role="group" aria-label="Choose text size">
            <button className={!large ? "selected" : ""} onClick={() => onLarge(false)}><span>Aa</span><b>Standard</b><small>More fits on screen</small></button>
            <button className={large ? "selected" : ""} onClick={() => onLarge(true)}><span className="large-sample">Aa</span><b>Large</b><small>Easier to read</small></button>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-title"><span className="settings-icon">{dark ? <Moon /> : <Sun />}</span><div><h2>Appearance</h2><p>Choose the look for this phone.</p></div></div>
          <div className="theme-options" role="group" aria-label="Choose appearance">
            <button className={!dark ? "selected" : ""} onClick={() => onDark(false)}><span className="theme-preview light-preview"><Sun /></span><b>Light</b><small>Bright and clean</small></button>
            <button className={dark ? "selected" : ""} onClick={() => onDark(true)}><span className="theme-preview dark-preview"><Moon /></span><b>Dark</b><small>Comfortable at night</small></button>
          </div>
        </article>

        <article className="settings-card export-card">
          <div className="settings-title"><span className="settings-icon"><FileSpreadsheet /></span><div><h2>Download order data</h2><p>Choose a date range and payment status.</p></div></div>
          <div className="export-fields">
            <label><span>From</span><input type="date" value={exportOptions.from} onChange={(event) => setExport("from", event.target.value)} /></label>
            <label><span>To</span><input type="date" value={exportOptions.to} onChange={(event) => setExport("to", event.target.value)} /></label>
            <label className="payment-filter"><span>Payment</span><select value={exportOptions.payment} onChange={(event) => setExport("payment", event.target.value as ExportOptions["payment"])}><option value="all">All orders</option><option value="paid">Paid only</option><option value="pending">Pending only</option></select></label>
          </div>
          <button className="primary export-button" onClick={() => onExport(exportOptions)}><Download size={19} /> Download CSV</button>
          <p className="settings-help">CSV opens directly in Excel. In Google Sheets, choose File → Import → Upload. Automatic live Google Sheets syncing can be added later, but it needs a Google account connection.</p>
        </article>

        <article className="settings-card storage-card">
          <div className="settings-title"><span className="settings-icon"><UsersRound /></span><div><h2>Saved customers</h2><p>{customerCount} {customerCount === 1 ? "customer" : "customers"} remembered from past orders.</p></div></div>
          <p className="settings-help">Start typing a returning customer’s name in a new order. Their flat number and usual delivery person will appear automatically.</p>
        </article>

        <article className="settings-card storage-card">
          <div className="settings-title"><span className="settings-icon"><Camera /></span><div><h2>Photos and recipes</h2><p>Starter photos use Netlify’s CDN; new uploads use private Netlify Blobs.</p></div></div>
          <p className="settings-help">Use Menu → Add food item whenever you need another recipe. Orders and menu details remain in the shared family database.</p>
        </article>
      </section>
      <button className="sign-out-setting" onClick={onSignOut}><CircleUserRound size={19} /> Sign out on this device</button>
    </>
  );
}

function CustomerField({ value, customers, onChange, onSelect }: { value: string; customers: CustomerProfile[]; onChange: (value: string) => void; onSelect: (profile: CustomerProfile) => void }) {
  const [focused, setFocused] = useState(false);
  const query = value.trim().toLowerCase();
  const suggestions = customers
    .filter((profile) => !query || `${profile.customer_name} ${profile.flat_number}`.toLowerCase().includes(query))
    .slice(0, 5);
  return (
    <label className="customer-field">
      <span>Customer name</span>
      <input value={value} autoComplete="off" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => onChange(event.target.value)} required />
      {focused && suggestions.length > 0 && (
        <div className="customer-suggestions">
          <small>{query ? "Matching customers" : "Recent customers"}</small>
          {suggestions.map((profile) => (
            <button type="button" key={profile.customer_name.toLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(profile); setFocused(false); }}>
              <span><b>{profile.customer_name}</b><small>Flat {profile.flat_number}</small></span><ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function TimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rawHour = "12", rawMinute = "00"] = (value || "12:00").split(":");
  const hour24 = Number(rawHour);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  const minute = String(Math.round(Number(rawMinute) / 5) * 5 % 60).padStart(2, "0");
  const update = (nextHour: number, nextMinute: string, nextPeriod: string) => {
    const converted = nextHour === 12
      ? (nextPeriod === "AM" ? 0 : 12)
      : nextHour + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(converted).padStart(2, "0")}:${nextMinute}`);
  };
  const display = value
    ? `${String(hour).padStart(2, "0")}:${rawMinute} ${period}`
    : "Choose delivery time";
  return (
    <div className={`time-field ${open ? "open" : ""}`}>
      <span>Delivery time</span>
      <button type="button" className="time-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span><Clock3 size={20} />{display}</span><ChevronRight size={19} />
      </button>
      {open && (
        <div className="time-panel">
          <div className="time-panel-head"><b>Select delivery time</b><button type="button" onClick={() => setOpen(false)}>Done</button></div>
          <div className="time-section"><span>Hour</span><div className="time-grid hours">{Array.from({ length: 12 }, (_, index) => index + 1).map((option) => <button type="button" className={hour === option ? "selected" : ""} key={option} onClick={() => update(option, minute, period)}>{String(option).padStart(2, "0")}</button>)}</div></div>
          <div className="time-section"><span>Minutes</span><div className="time-grid minutes">{Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0")).map((option) => <button type="button" className={minute === option ? "selected" : ""} key={option} onClick={() => update(hour, option, period)}>{option}</button>)}</div></div>
          <div className="time-section period-section"><span>Period</span><div className="time-grid period">{["AM", "PM"].map((option) => <button type="button" className={period === option ? "selected" : ""} key={option} onClick={() => update(hour, minute, option)}>{option}</button>)}</div></div>
        </div>
      )}
    </div>
  );
}

function OrderForm({ draft, menuItems, customers, onClose, onSave, onDelete }: { draft: Draft | Order; menuItems: MenuItem[]; customers: CustomerProfile[]; onClose: () => void; onSave: (d: Draft, photo?: File) => void; onDelete?: () => void }) {
  const prefill = !('id' in draft) ? sessionStorage.getItem("neeru-prefill") : null;
  const prefillItem = prefill ? JSON.parse(prefill) as MenuItem : null;
  const [form, setForm] = useState<Draft>({ ...draft, order_details: prefillItem?.name || draft.order_details, amount: prefillItem?.price || draft.amount });
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const initialFlat = splitAdminFlat(draft.flat_number);
  const [flatWing, setFlatWing] = useState<BuildingWing>(initialFlat.wing);
  const [flatDigits, setFlatDigits] = useState(initialFlat.number);
  const [flatWarning, setFlatWarning] = useState("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((v) => ({ ...v, [key]: value }));
  const setCustomerFlat = (flatNumber: string) => {
    const parsed = splitAdminFlat(flatNumber);
    setFlatWing(parsed.wing);
    setFlatDigits(parsed.number);
    setFlatWarning("");
  };
  const updateFlatNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    setFlatDigits(digits);
    setFlatWarning(/\D/.test(value) ? "Use numbers only for the flat number." : "");
    set("flat_number", flatWing && digits ? `${flatWing}-${digits}` : "");
  };
  const updateFlatWing = (wing: BuildingWing) => {
    setFlatWing(wing);
    setFlatWarning("");
    set("flat_number", wing && flatDigits ? `${wing}-${flatDigits}` : "");
  };
  const updateCustomerName = (name: string) => {
    const match = customers.find((profile) => profile.customer_name.toLowerCase() === name.trim().toLowerCase());
    if (match) setCustomerFlat(match.flat_number);
    setForm((current) => match
      ? { ...current, customer_name: name, flat_number: match.flat_number, delivered_by: match.delivered_by }
      : { ...current, customer_name: name });
  };
  const selectCustomer = (profile: CustomerProfile) => {
    setCustomerFlat(profile.flat_number);
    setForm((current) => ({
      ...current,
      customer_name: profile.customer_name,
      flat_number: profile.flat_number,
      delivered_by: profile.delivered_by,
    }));
  };
  const selectFood = (item: MenuItem) => {
    set("order_details", form.order_details ? `${form.order_details}, ${item.name}` : item.name);
    if (!form.amount && item.price) set("amount", item.price);
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal order-modal" onSubmit={(e) => { e.preventDefault(); if (!flatWing || !flatDigits) { setFlatWarning(!flatWing ? "Choose the building wing." : "Enter the flat number."); return; } onSave({ ...form, flat_number: `${flatWing}-${flatDigits}` }, photo); }}>
        <div className="modal-head"><div><span className="eyebrow">{form.order_date}</span><h2>{"id" in draft ? "Edit order" : "New order"}</h2><p>Customer, food and delivery details</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
        <div className="form-grid">
          <CustomerField value={form.customer_name} customers={customers} onChange={updateCustomerName} onSelect={selectCustomer} />
          <div className={`admin-flat-fields ${flatWarning ? "has-warning" : ""}`}>
            <label><span>Wing</span><select value={flatWing} onChange={(event) => updateFlatWing(event.target.value as BuildingWing)} required><option value="" disabled>Choose</option>{["A", "B", "C", "D"].map((wing) => <option key={wing} value={wing}>Wing {wing}</option>)}</select></label>
            <label><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={flatDigits} onChange={(event) => updateFlatNumber(event.target.value)} placeholder="For example, 402" aria-invalid={Boolean(flatWarning)} required /></label>
            {flatWarning && <small className="admin-flat-warning">{flatWarning}</small>}
          </div>
          <div className="wide food-picker"><label>Choose food</label><div className="food-options">{menuItems.map((item) => <button type="button" key={item.id} className={form.order_details.toLowerCase().includes(item.name.toLowerCase()) ? "selected" : ""} onClick={() => selectFood(item)}>{item.photo_url ? <img src={item.photo_url} alt="" /> : <span><ChefHat /></span>}<b>{item.name}</b><small>{item.price ? money(item.price) : ""}</small></button>)}</div></div>
          <Field label="Order details" value={form.order_details} onChange={(v) => set("order_details", v)} wide />
          <TimeField value={form.delivery_time || ""} onChange={(v) => set("delivery_time", v)} />
          <Field label="Amount (₹)" type="number" value={String(form.amount)} onChange={(v) => set("amount", Number(v))} />
          <Choice label="Delivered by" options={[["nanny", "Nanny"], ["others", "Others"]]} value={form.delivered_by} onChange={(v) => set("delivered_by", v as DeliveryBy)} />
          {"id" in draft && draft.payment_reference && <div className="wide payment-proof"><ReceiptText size={19} /><span><small>Customer submitted UPI reference</small><b>{draft.payment_reference}</b></span></div>}
          <label className="paid-choice"><input type="checkbox" checked={form.is_paid} onChange={(e) => set("is_paid", e.target.checked)} /><span><Check size={18} /> Payment received</span></label>
          <fieldset className="wide stage-field"><legend>Order stage</legend><div className="stage-choice">{stages.map((s) => <button type="button" className={`${s.color} ${form.stage === s.key ? "selected" : ""}`} key={s.key} onClick={() => set("stage", s.key)}><i />{s.short}</button>)}</div></fieldset>
          <Field label="Remarks / special instructions" value={form.remarks} onChange={(v) => set("remarks", v)} wide textarea />
          <div className="wide quick">{["Less spicy", "No onion", "Extra pickle", "Call before delivery", "Send curd", "No green chilli"].map((t) => <button type="button" key={t} onClick={() => set("remarks", form.remarks ? `${form.remarks}, ${t}` : t)}><Plus size={13} />{t}</button>)}</div>
          <label className="wide photo-upload"><span><Camera size={18} /> Add a photo to this order <small>Optional</small></span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; setPhoto(file); if (file) setPhotoPreview(URL.createObjectURL(file)); }} /><div className="photo-drop">{photoPreview ? <img src={photoPreview} alt="Selected order" /> : <><Camera /><b>Take photo or choose from phone</b><small>{form.photo_path ? "A photo is already attached. Choose another to replace it." : "JPG, PNG or phone camera"}</small></>}</div></label>
        </div>
        <div className="modal-actions">{onDelete && <button type="button" className="delete" onClick={onDelete}><Trash2 size={18} /> Delete</button>}<span /><button type="button" className="cancel" onClick={onClose}>Cancel</button><button className="save"><Check size={19} /> Save order</button></div>
      </form>
    </div>
  );
}

function MenuItemForm({ item, onClose, onSave }: { item: MenuItem | null; onClose: () => void; onSave: (values: Pick<MenuItem, "name" | "price" | "description" | "spice_level">, photo?: File, existing?: MenuItem) => void }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price || 0);
  const [description, setDescription] = useState(item?.description || "");
  const [spiceLevel, setSpiceLevel] = useState<MenuItem["spice_level"]>(item?.spice_level || "mild");
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState<string | undefined>(item?.photo_url);
  return <div className="modal-bg"><form className="modal menu-modal" onSubmit={(e) => { e.preventDefault(); onSave({ name, price, description, spice_level: spiceLevel }, photo, item || undefined); }}><div className="modal-head"><div><span className="eyebrow">RECIPE CATALOGUE</span><h2>{item ? "Edit recipe" : "Add recipe"}</h2><p>Keep reusable dish details ready for today’s storefront.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="form-grid"><Field label="Food name" value={name} onChange={setName} /><Field label="Regular price (₹)" value={String(price)} onChange={(v) => setPrice(Number(v))} type="number" /><Field label="Short description" value={description} onChange={setDescription} wide /><label><span>Spice level</span><select value={spiceLevel} onChange={(event) => setSpiceLevel(event.target.value as MenuItem["spice_level"])}><option value="mild">Mild</option><option value="medium">Medium</option><option value="spicy">Spicy</option></select></label><label className="wide photo-upload"><span><Camera size={18} /> Food photo</span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; setPhoto(file); if (file) setPreview(URL.createObjectURL(file)); }} /><div className="photo-drop menu-photo-drop">{preview ? <img src={preview} alt="Selected food" /> : <><Camera /><b>Take or choose a clear food photo</b><small>Square photos work best</small></>}</div></label></div><div className="modal-actions"><span /><button type="button" className="cancel" onClick={onClose}>Cancel</button><button className="save">{item ? <Check size={19} /> : <Plus size={19} />} {item ? "Save recipe" : "Add recipe"}</button></div></form></div>;
}

function Field({ label, value, onChange, type = "text", wide = false, textarea = false, autoFocus = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; wide?: boolean; textarea?: boolean; autoFocus?: boolean }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} /> : <input autoFocus={autoFocus} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={!label.startsWith("Remarks")} />}</label>;
}
function Choice({ label, options, value, onChange }: { label: string; options: string[][]; value: string; onChange: (v: string) => void }) {
  return <fieldset><legend>{label}</legend><div className="choice">{options.map(([key, text]) => <button type="button" className={value === key ? "selected" : ""} key={key} onClick={() => onChange(key)}>{key === "nanny" ? <CircleUserRound size={18} /> : <UtensilsCrossed size={18} />}{text}</button>)}</div></fieldset>;
}

function Root() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  document.title = isAdmin ? "Neeru’s Home Kitchen · Family Order Desk" : "Neeru’s Home Kitchen · Vegetarian Meals";
  return isAdmin ? <AdminApp /> : <Storefront />;
}

createRoot(document.getElementById("root")!).render(<Root />);
