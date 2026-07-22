import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  DatabaseBackup,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HardDrive,
  IndianRupee,
  Info,
  KeyRound,
  LayoutDashboard,
  List,
  Mail,
  MessageCircle,
  Minus,
  Moon,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  ArchiveRestore,
  Save,
  Search,
  Share2,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Tags,
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

type Stage = "new" | "delivered";
type DeliveryBy = "nanny" | "others";
type Screen = "orders" | "menu" | "settings";

type OrderLine = {
  id?: string;
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  unit_label: string;
};

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
  items?: OrderLine[];
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
  category_id?: string | null;
  unit_label?: string;
  daily?: {
    is_available: boolean;
    is_featured: boolean;
    portions_available: number | null;
    special_price: number | null;
    promotion_message: string;
    promotion_until: string | null;
  };
};
type DishCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
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
type ExportFormat = "csv" | "xlsx";
type StorageSection = { count: number; knownBytes: number; unknownSizes: number };
type StorageSummary = { orders: StorageSection; menu: StorageSection; payment: StorageSection };
type CleanupAction = "delivered-photos" | "all-order-photos" | "all-menu-photos" | "delivered-orders" | "all-orders";
type OrderDeletionReason = "cancelled" | "unpaid" | "duplicate" | "mistake" | "unavailable" | "other";
type PromotionValues = { message: string; specialPrice: number | null; portions: number | null; until: string; includeCategory: boolean };
type CategoryPromotionValues = { heroId: string; message: string };
type PreparedPromotion = { title: string; text: string; url: string; image?: File };
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
type PortableBackup = {
  format: "neerus-home-kitchen-backup";
  version: 1;
  created_at: string;
  app_name: string;
  counts: {
    orders: number;
    order_items: number;
    dish_categories?: number;
    menu_items: number;
    daily_menu: number;
    customer_profiles: number;
    restored_customer_profiles: number;
  };
  data: Record<string, unknown[]>;
};
type PortableRestoreResult = {
  orders: number;
  order_items: number;
  dish_categories?: number;
  menu_items: number;
  daily_menu: number;
  customers_matched: number;
  customers_waiting_to_reconnect: number;
};

function isPortableBackup(value: unknown): value is PortableBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PortableBackup>;
  if (candidate.format !== "neerus-home-kitchen-backup" || candidate.version !== 1) return false;
  if (!candidate.counts || !candidate.data || typeof candidate.created_at !== "string") return false;
  return ["orders", "menu_items", "customer_profiles"].every((key) => Array.isArray(candidate.data?.[key]));
}

const stages: { key: Stage; label: string; badge: string; short: string; color: string }[] = [
  { key: "new", label: "Orders", badge: "Order", short: "Orders", color: "blue" },
  { key: "delivered", label: "Delivered", badge: "Delivered", short: "Delivered", color: "green" },
];
const normalizeStage = (value?: string): Stage => value === "delivered" ? "delivered" : "new";

type PhotoCompressionPreset = { longestSide: number; targetBytes: number; label: string };

async function decodePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo from your phone or computer.");
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap as CanvasImageSource, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Safari can decode some iPhone formats through an image element even when createImageBitmap cannot.
    }
  }
  return new Promise<{ source: CanvasImageSource; width: number; height: number; dispose: () => void }>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This phone photo could not be read. Please choose a JPG, PNG, HEIC or WebP image.")); };
    image.src = url;
  });
}

async function compressPhoto(file: File, preset: PhotoCompressionPreset) {
  const decoded = await decodePhoto(file);
  let smallest: Blob | null = null;
  try {
    let longestSide = Math.min(preset.longestSide, Math.max(decoded.width, decoded.height));
    for (let pass = 0; pass < 5; pass += 1) {
      const scale = Math.min(1, longestSide / Math.max(decoded.width, decoded.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(`This browser could not prepare the ${preset.label} photo.`);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32]) {
        const candidate = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!candidate) continue;
        if (!smallest || candidate.size < smallest.size) smallest = candidate;
        if (candidate.size <= preset.targetBytes) {
          return new File([candidate], `${file.name.replace(/\.[^.]+$/, "") || preset.label}.webp`, { type: "image/webp" });
        }
      }
      longestSide = Math.max(320, Math.round(longestSide * 0.78));
    }
  } finally {
    decoded.dispose();
  }
  if (!smallest) throw new Error(`This browser could not compress the ${preset.label} photo.`);
  return new File([smallest], `${file.name.replace(/\.[^.]+$/, "") || preset.label}.webp`, { type: "image/webp" });
}

const compressOrderPhoto = (file: File) => compressPhoto(file, { longestSide: 360, targetBytes: 32 * 1024, label: "order" });
const compressMenuPhoto = (file: File) => compressPhoto(file, { longestSide: 1400, targetBytes: 260 * 1024, label: "dish" });

function readableBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function shareOrSaveFile(file: File) {
  const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (shareNavigator.share && (!shareNavigator.canShare || shareNavigator.canShare({ files: [file] }))) {
    await shareNavigator.share({ files: [file], title: file.name, text: "Neeru's Home Kitchen order data" });
    return "The phone share sheet was opened. Choose Files, WhatsApp, AirDrop or another app.";
  }
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (pickerWindow.showSaveFilePicker) {
    const extension = `.${file.name.split(".").pop()}`;
    const description = extension === ".xlsx" ? "Excel workbook" : extension === ".json" ? "Neeru's Kitchen backup" : extension === ".sql" ? "Supabase setup SQL" : "CSV file";
    const handle = await pickerWindow.showSaveFilePicker({ suggestedName: file.name, types: [{ description, accept: { [file.type]: [extension] } }] });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return `Saved ${file.name}.`;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `Downloaded ${file.name}. This browser does not provide a native share sheet.`;
}

function promotionShareText(prepared: PreparedPromotion) {
  const url = prepared.url.trim();
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = prepared.text
    .replace(new RegExp(`(?:\\s*Order here:\\s*)?${escapedUrl}`, "gi"), "")
    .trim();
  return `${body}\n\n🛒 *Order now*\n${url}`;
}

async function refreshIfAdminBuildIsStale() {
  if (import.meta.env.DEV) return false;
  const currentAsset = Array.from(document.scripts)
    .map((script) => script.src ? new URL(script.src, window.location.origin).pathname : "")
    .find((path) => /^\/assets\/main-[^/]+\.js$/.test(path));
  if (!currentAsset) return false;
  try {
    const response = await fetch(`/admin?share-check=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) return false;
    const html = await response.text();
    const latestAsset = html.match(/src="(\/assets\/main-[^"]+\.js)"/)?.[1];
    if (!latestAsset || latestAsset === currentAsset) return false;
    window.location.replace(`/admin?updated=${Date.now()}`);
    return true;
  } catch {
    return false;
  }
}

async function sharePromotion(prepared: PreparedPromotion) {
  if (await refreshIfAdminBuildIsStale()) throw new Error("The app was updated before sharing. Please tap Share now again after it reloads.");
  const shareText = promotionShareText(prepared);
  // Keep the ordering URL only inside `text`. Passing it again as ShareData.url
  // makes WhatsApp append the same link a second time on some phones.
  const data: ShareData = { title: prepared.title, text: shareText };
  if (prepared.image) data.files = [prepared.image];
  const shareNavigator = navigator as Navigator & { canShare?: (value: ShareData) => boolean };
  if (shareNavigator.share && (!data.files || !shareNavigator.canShare || shareNavigator.canShare(data))) {
    await shareNavigator.share(data);
    return "Share sheet opened. Choose WhatsApp and the dish photo, offer and order link will be ready.";
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  return "WhatsApp opened with the offer and direct order link. The link generates the dish photo preview.";
}
const showLocalDevicePreview = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const photoApiBase = import.meta.env.DEV ? "https://neerus-kitchen.netlify.app/api/photos" : "/api/photos";
const photoApiUrl = (query = "") => `${photoApiBase}${query}`;

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
starterImage.set("aloo parantha", "/food/aloo-paratha.jpg");
starterImage.set("plain parantha", "/food/plain-parantha.jpg");
starterImage.set("green chilli parantha", "/food/green-chilli-parantha.jpg");
starterImage.set("missa parantha", "/food/missa-parantha.jpg");
starterImage.set("paneer parantha", "/food/paneer-parantha.jpg");
starterImage.set("vegetable parantha", "/food/vegetable-parantha.jpg");
starterImage.set("besan chilla", "/food/besan-chilla.jpg");
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
  const response = await fetch(photoApiUrl(`?key=${encodeURIComponent(path)}`), {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) return undefined;
  return URL.createObjectURL(await response.blob());
}

export function AdminApp() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(starterMenu);
  const [dishCategories, setDishCategories] = useState<DishCategory[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [accessRequests, setAccessRequests] = useState<CustomerAccessRequest[]>([]);
  const [notificationOrders, setNotificationOrders] = useState<Order[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationBusyId, setNotificationBusyId] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("neeru-admin-alert-sound") !== "off");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | DeliveryBy>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [screen, setScreen] = useState<Screen>("orders");
  const [activeStage, setActiveStage] = useState<Stage>("new");
  const [large, setLarge] = useState(() => localStorage.getItem("neeru-text-size") !== "standard");
  const [dark, setDark] = useState(() => localStorage.getItem("neeru-theme") === "dark");
  const [phonePreview, setPhonePreview] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deliveringOrder, setDeliveringOrder] = useState<Order | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menuAdding, setMenuAdding] = useState(false);
  const [menuEditing, setMenuEditing] = useState<MenuItem | null>(null);
  const [promotingItem, setPromotingItem] = useState<MenuItem | null>(null);
  const [categoryAdding, setCategoryAdding] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<DishCategory | null>(null);
  const [promotingCategory, setPromotingCategory] = useState<DishCategory | null>(null);
  const [appUpdateReady, setAppUpdateReady] = useState(false);
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

  const canApplyAppUpdate = screen === "orders" && !adding && !editing && !menuAdding && !menuEditing && !promotingItem && !categoryAdding && !categoryEditing && !promotingCategory && !deletingOrder && !deliveringOrder;
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const currentAsset = Array.from(document.scripts)
      .map((script) => script.src ? new URL(script.src, window.location.origin).pathname : "")
      .find((path) => /^\/assets\/main-[^/]+\.js$/.test(path));
    if (!currentAsset) return;
    let stopped = false;
    let checking = false;
    const checkForUpdate = async () => {
      if (stopped || checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch(`/admin?update-check=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
        if (!response.ok) return;
        const html = await response.text();
        const nextAsset = html.match(/src="(\/assets\/main-[^"]+\.js)"/)?.[1];
        if (!nextAsset || nextAsset === currentAsset) return;
        if (canApplyAppUpdate) window.location.replace(`/admin?updated=${Date.now()}`);
        else setAppUpdateReady(true);
      } catch {
        // A missed version check is harmless; the next focus or interval retries.
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void checkForUpdate(); };
    const timer = window.setInterval(checkForUpdate, 60_000);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", onVisible);
    void checkForUpdate();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canApplyAppUpdate]);

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
      .select("*,order_items(id,menu_item_id,item_name,unit_price,quantity,unit_label)")
      .eq("order_date", selectedDate)
      .order("delivery_time")
      .order("created_at");
    setLoading(false);
    if (error) setNotice(`Could not load orders: ${error.message}`);
    else {
      const resolved = await Promise.all(
        ((data ?? []) as (Omit<Order, "stage"> & { stage: string })[]).map(async (rawOrder) => {
          const order = {
            ...rawOrder,
            stage: normalizeStage(rawOrder.stage),
            items: ((rawOrder as typeof rawOrder & { order_items?: OrderLine[] }).order_items || []).map((line) => ({
              ...line,
              unit_price: Number(line.unit_price),
              quantity: Number(line.quantity),
              unit_label: line.unit_label || "portion",
            })),
          } as Order;
          if (!order.photo_path) return order;
          return { ...order, photo_url: await getPrivatePhotoUrl(order.photo_path, session) };
        }),
      );
      setOrders(resolved);
    }
  }

  async function loadMenu() {
    if (!supabase || !session) return;
    const [{ data, error }, { data: daily }, { data: configuration }, categoryResult] = await Promise.all([
      supabase.from("menu_items").select("*").order("is_active", { ascending: false }).order("name"),
      supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price,promotion_message,promotion_until").eq("menu_date", today()),
      supabase.from("storefront_settings").select("ordering_open,hero_message,upi_id,merchant_name,order_cutoff,whatsapp_number").eq("id", 1).maybeSingle(),
      supabase.from("dish_categories").select("*").order("sort_order").order("name"),
    ]);
    if (error || !data?.length) return;
    const dailyMap = new Map((daily ?? []).map((entry) => [entry.menu_item_id, entry]));
    const resolved = await Promise.all(
      (data as MenuItem[]).map(async (item) => {
        const todayEntry = dailyMap.get(item.id);
        const withDaily = { ...item, daily: { is_available: item.is_active && (todayEntry?.is_available ?? true), is_featured: Boolean(todayEntry?.is_featured), portions_available: todayEntry?.portions_available ?? null, special_price: todayEntry?.special_price ?? null, promotion_message: todayEntry?.promotion_message ?? "", promotion_until: todayEntry?.promotion_until?.slice(0, 5) ?? null } };
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
    if (!categoryResult.error) setDishCategories((categoryResult.data || []) as DishCategory[]);
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
        .neq("stage", "delivered")
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
    const onlineOrders = ((orderResult.data || []) as (Omit<Order, "stage"> & { stage: string })[])
      .map((order) => ({ ...order, stage: normalizeStage(order.stage) } as Order));
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
    return orders.filter((order) => {
      const matchesDelivery = deliveryFilter === "all" || order.delivered_by === deliveryFilter;
      const matchesSearch = !q || `${order.customer_name} ${order.flat_number} ${order.order_details}`.toLowerCase().includes(q);
      return matchesDelivery && matchesSearch;
    });
  }, [orders, search, deliveryFilter]);
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
    const preparedPhoto = purpose === "orders" ? await compressOrderPhoto(photo) : purpose === "menu" ? await compressMenuPhoto(photo) : photo;
    form.append("photo", preparedPhoto);
    form.append("purpose", purpose);
    const response = await fetch(photoApiUrl(), {
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
    const structuredItems = (values.items || [])
      .filter((line) => line.menu_item_id && line.quantity > 0)
      .map((line) => ({ ...line, quantity: Math.min(20, Math.max(1, Number(line.quantity))), unit_price: Number(line.unit_price) }));
    const structuredDetails = structuredItems.map((line) => `${line.item_name} × ${line.quantity}${line.unit_label && line.unit_label !== "portion" ? ` (${line.unit_label} each)` : ""}`).join(", ");
    const structuredTotal = structuredItems.reduce((total, line) => total + line.unit_price * line.quantity, 0);
    let photoPath = values.photo_path;
    if (values.stage === "delivered") {
      photoPath = null;
    } else if (photo) {
      try {
        photoPath = await uploadPhoto(photo, "orders");
      } catch (error) {
        return setNotice(error instanceof Error ? error.message : "Could not upload photo.");
      }
    }
    const record = {
      order_date: values.order_date,
      customer_name: values.customer_name.trim(),
      flat_number: values.flat_number,
      order_details: structuredDetails || values.order_details.trim(),
      photo_path: photoPath,
      amount: structuredItems.length ? structuredTotal : Number(values.amount),
      delivery_time: values.delivery_time || null,
      delivered_by: values.delivered_by,
      is_paid: values.is_paid,
      stage: normalizeStage(values.stage),
      remarks: values.remarks || "",
      payment_status: values.is_paid ? "verified" : "pending",
    };
    let deliveryPhotoDeleted = false;
    if (editing?.photo_path && record.stage === "delivered") {
      try {
        await deletePhotoKeys([editing.photo_path]);
        deliveryPhotoDeleted = true;
      } catch (error) {
        return setNotice(error instanceof Error ? `Order was not marked delivered. ${error.message}` : "Order was not marked delivered because its photo could not be deleted.");
      }
    }
    const result = editing
      ? await supabase.from("orders").update(record).eq("id", editing.id).select("id,stage,photo_path").maybeSingle()
      : await supabase.from("orders").insert(record).select("id,stage,photo_path").maybeSingle();
    if (result.error || !result.data) {
      if (deliveryPhotoDeleted && editing) await supabase.from("orders").update({ photo_path: null }).eq("id", editing.id);
      setNotice(`Could not save: ${result.error?.message || "the order was not updated"}${deliveryPhotoDeleted ? ". The temporary photo was still removed safely." : ""}`);
    }
    else {
      const orderId = result.data.id;
      if (editing || structuredItems.length) {
        const deletion = await supabase.from("order_items").delete().eq("order_id", orderId);
        if (deletion.error) return setNotice(`Order details were saved, but quantities could not be updated: ${deletion.error.message}`);
      }
      if (structuredItems.length) {
        const lineResult = await supabase.from("order_items").insert(structuredItems.map((line) => ({
          order_id: orderId,
          menu_item_id: line.menu_item_id,
          item_name: line.item_name,
          unit_price: line.unit_price,
          quantity: line.quantity,
          unit_label: line.unit_label || "portion",
        })));
        if (lineResult.error) return setNotice(`Order saved, but its dish quantities could not be saved: ${lineResult.error.message}`);
      }
      if (editing?.photo_path && photoPath !== editing.photo_path && record.stage !== "delivered") {
        try {
          await deletePhotoKeys([editing.photo_path]);
        } catch {
          setNotice("Order saved, but the replaced photo still needs cleanup from Settings → Storage & cleanup.");
        }
      }
      setAdding(false);
      setEditing(null);
      setScreen("orders");
      setNotice("Order saved successfully.");
      loadOrders();
      loadCustomers();
    }
  }

  async function prepareOrdersExport(options: ExportOptions, format: ExportFormat): Promise<File> {
    if (!supabase) throw new Error("The shared database is not connected.");
    if (!options.from || !options.to || options.from > options.to) {
      throw new Error("Choose a valid export date range.");
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
    if (error) throw new Error(`Could not export orders: ${error.message}`);

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
    const baseName = `neerus-home-kitchen-${options.from}-to-${options.to}`;
    if (format === "csv") {
      const csv = [headers, ...rows].map((row) => row.map(safeCell).join(",")).join("\r\n");
      return new File(["\ufeff", csv], `${baseName}.csv`, { type: "text/csv;charset=utf-8" });
    }
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const blob = await writeExcelFile([headers, ...rows], { sheet: "Orders" }).toBlob();
    return new File([blob], `${baseName}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function createPortableBackup(): Promise<File> {
    if (!supabase) throw new Error("The shared database is not connected.");
    const client = supabase;
    let { data, error } = await client.rpc("create_portable_backup");
    if (error) {
      if (/function .* does not exist|schema cache/i.test(error.message)) {
        const readAll = async (table: string, optional = false) => {
          const rows: unknown[] = [];
          const pageSize = 1000;
          for (let start = 0; start < 100000; start += pageSize) {
            const result = await client.from(table).select("*").range(start, start + pageSize - 1);
            if (result.error) {
              if (optional && /does not exist|schema cache|not find/i.test(result.error.message)) return [];
              throw new Error(`Could not back up ${table.replace(/_/g, " ")}: ${result.error.message}`);
            }
            const page = result.data ?? [];
            rows.push(...page);
            if (page.length < pageSize) break;
          }
          return rows;
        };
        const [storefrontSettings, categories, menuItems, dailyMenu, customerProfiles, restoredProfiles, allOrders, orderItems] = await Promise.all([
          readAll("storefront_settings"),
          readAll("dish_categories", true),
          readAll("menu_items"),
          readAll("daily_menu"),
          readAll("customer_profiles"),
          readAll("restored_customer_profiles", true),
          readAll("orders"),
          readAll("order_items"),
        ]);
        data = {
          format: "neerus-home-kitchen-backup",
          version: 1,
          created_at: new Date().toISOString(),
          app_name: "Neeru's Home Kitchen",
          notes: {
            passwords_included: false,
            photo_files_included: false,
            photo_storage: "Netlify Blobs",
            account_recovery: "Customers sign up with the same email or phone number to reclaim restored history.",
          },
          counts: {
            orders: allOrders.length,
            order_items: orderItems.length,
            dish_categories: categories.length,
            menu_items: menuItems.length,
            daily_menu: dailyMenu.length,
            customer_profiles: customerProfiles.length,
            restored_customer_profiles: restoredProfiles.length,
          },
          admin_accounts: session ? [{ email: session.user.email || "", phone: session.user.phone || "" }] : [],
          data: {
            storefront_settings: storefrontSettings,
            dish_categories: categories,
            menu_items: menuItems,
            daily_menu: dailyMenu,
            customer_profiles: customerProfiles,
            restored_customer_profiles: restoredProfiles,
            orders: allOrders,
            order_items: orderItems,
          },
        };
        error = null;
      } else {
        throw new Error(`Could not create backup: ${error.message}`);
      }
    }
    if (!isPortableBackup(data)) throw new Error("Supabase returned an invalid backup package.");
    const stamp = new Date(data.created_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new File(
      [JSON.stringify(data, null, 2)],
      `neerus-home-kitchen-full-backup-${stamp}.json`,
      { type: "application/json" },
    );
  }

  async function restorePortableBackup(backup: PortableBackup): Promise<PortableRestoreResult> {
    if (!supabase) throw new Error("The shared database is not connected.");
    const { data, error } = await supabase.rpc("restore_portable_backup", { p_backup: backup, p_mode: "replace" });
    if (error) {
      if (/function .* does not exist|schema cache/i.test(error.message)) {
        throw new Error("Restore support is not installed. Run the new-project setup SQL in Supabase first.");
      }
      throw new Error(`Restore failed safely: ${error.message}`);
    }
    const result = data as PortableRestoreResult | null;
    if (!result || typeof result.orders !== "number") throw new Error("Supabase did not confirm the restored records.");
    await Promise.all([loadOrders(), loadMenu(), loadCustomers(), loadActionCenter(false)]);
    return result;
  }

  async function deletePhotoKeys(keys: string[]) {
    if (!session || keys.length === 0) return 0;
    const response = await fetch(photoApiUrl(), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not remove stored photos.");
    if (result.verified !== true) throw new Error("The server did not verify that the photo was deleted.");
    return Number(result.removed || 0);
  }

  async function loadStorageSummary(): Promise<StorageSummary> {
    if (!session) throw new Error("Please sign in again to check storage.");
    const response = await fetch(photoApiUrl("?summary=1"), { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const result = await response.json().catch(() => null) as (StorageSummary & { error?: string }) | null;
    if (!response.ok) throw new Error(result?.error || "Could not check photo storage.");
    if (!result?.orders || !result.menu || !result.payment) {
      throw new Error(import.meta.env.DEV ? "Photo storage totals are available on the Netlify-hosted app. All other settings still work here." : "Storage totals are temporarily unavailable.");
    }
    return result;
  }

  async function cleanupData(action: CleanupAction) {
    if (!supabase) throw new Error("The shared database is not connected.");
    if (action === "all-menu-photos") {
      const { data, error } = await supabase.from("menu_items").select("id,photo_path").not("photo_path", "is", null);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Pick<MenuItem, "id" | "photo_path">[];
      await deletePhotoKeys(rows.flatMap((row) => row.photo_path ? [row.photo_path] : []));
      if (rows.length) {
        const update = await supabase.from("menu_items").update({ photo_path: null }).in("id", rows.map((row) => row.id));
        if (update.error) throw new Error(update.error.message);
      }
      await loadMenu();
      return `${rows.length} uploaded menu photos removed. Dish names, prices and starter images remain.`;
    }

    let query = supabase.from("orders").select("id,photo_path,stage");
    if (action === "delivered-photos" || action === "delivered-orders") query = query.eq("stage", "delivered");
    if (action === "delivered-photos" || action === "all-order-photos") query = query.not("photo_path", "is", null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Pick<Order, "id" | "photo_path" | "stage">[];
    const keys = rows.flatMap((row) => row.photo_path ? [row.photo_path] : []);
    await deletePhotoKeys(keys);

    if (action === "delivered-orders" || action === "all-orders") {
      if (rows.length) {
        const removal = await supabase.from("orders").delete().in("id", rows.map((row) => row.id));
        if (removal.error) throw new Error(removal.error.message);
      }
      await Promise.all([loadOrders(), loadCustomers(), loadActionCenter(false)]);
      return `${rows.length} ${action === "all-orders" ? "orders" : "delivered orders"} permanently deleted.`;
    }

    if (rows.length) {
      const update = await supabase.from("orders").update({ photo_path: null }).in("id", rows.map((row) => row.id));
      if (update.error) throw new Error(update.error.message);
    }
    await loadOrders();
    return `${keys.length} order photos removed. The order records remain.`;
  }

  async function saveMenuItem(values: Pick<MenuItem, "name" | "price" | "description" | "spice_level" | "category_id" | "unit_label">, photo?: File, existing?: MenuItem) {
    if (!supabase || !session) return;
    let photoPath: string | null = existing?.photo_path ?? null;
    let uploadedPhotoPath: string | null = null;
    if (photo) {
      try {
        uploadedPhotoPath = await uploadPhoto(photo, "menu");
        photoPath = uploadedPhotoPath;
      } catch (error) {
        return setNotice(error instanceof Error ? error.message : "Could not upload menu photo.");
      }
    }
    const record = { name: values.name.trim(), price: Number(values.price), description: values.description?.trim() ?? "", spice_level: values.spice_level || "mild", category_id: values.category_id || null, unit_label: values.unit_label?.trim() || "portion", photo_path: photoPath, is_active: true };
    const { error } = existing
      ? await supabase.from("menu_items").update(record).eq("id", existing.id)
      : await supabase.from("menu_items").insert(record);
    if (error) {
      if (uploadedPhotoPath) await deletePhotoKeys([uploadedPhotoPath]).catch(() => undefined);
      setNotice(`Could not save menu item: ${error.message}`);
    }
    else {
      if (uploadedPhotoPath && existing?.photo_path && existing.photo_path !== uploadedPhotoPath) {
        await deletePhotoKeys([existing.photo_path]).catch(() => undefined);
      }
      setMenuAdding(false);
      setMenuEditing(null);
      setNotice(`${values.name} was ${existing ? "updated" : "added to the dish catalogue"}.`);
      loadMenu();
    }
  }

  async function toggleMenuItem(item: MenuItem) {
    if (!supabase) return;
    const next = !item.is_active;
    if (!next && !confirm(`Archive ${item.name}? It will disappear from the customer menu but can be restored here.`)) return;
    const { error } = await supabase.from("menu_items").update({ is_active: next }).eq("id", item.id);
    if (error) setNotice(`Could not update dish: ${error.message}`);
    else {
      if (!next) await updateDailyMenu(item, { is_available: false, is_featured: false });
      setNotice(next ? `${item.name} restored to the catalogue.` : `${item.name} archived.`);
      loadMenu();
    }
  }

  async function saveDishCategory(values: Pick<DishCategory, "name" | "description" | "sort_order">, existing?: DishCategory) {
    if (!supabase) return;
    const baseSlug = values.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `category-${Date.now()}`;
    const record = { name: values.name.trim(), slug: existing?.slug || baseSlug, description: values.description.trim(), sort_order: Number(values.sort_order) || 0, is_active: true };
    const { error } = existing
      ? await supabase.from("dish_categories").update(record).eq("id", existing.id)
      : await supabase.from("dish_categories").insert(record);
    if (error) setNotice(`Could not save category: ${error.message}`);
    else {
      setCategoryAdding(false);
      setCategoryEditing(null);
      setNotice(`${values.name} category ${existing ? "updated" : "created"}.`);
      loadMenu();
    }
  }

  async function toggleDishCategory(category: DishCategory) {
    if (!supabase) return;
    const next = !category.is_active;
    if (!next && !confirm(`Hide the ${category.name} category? Its dishes stay saved and can be reassigned or restored.`)) return;
    const { error } = await supabase.from("dish_categories").update({ is_active: next }).eq("id", category.id);
    if (error) setNotice(`Could not update category: ${error.message}`);
    else {
      setNotice(next ? `${category.name} restored.` : `${category.name} hidden from the storefront.`);
      loadMenu();
    }
  }

  async function updateDailyMenu(item: MenuItem, changes: Partial<NonNullable<MenuItem["daily"]>>) {
    if (!supabase) return;
    const daily = { is_available: true, is_featured: false, portions_available: null, special_price: null, promotion_message: "", promotion_until: null, ...item.daily, ...changes };
    const { error } = await supabase.from("daily_menu").upsert({ menu_item_id: item.id, menu_date: today(), ...daily }, { onConflict: "menu_item_id,menu_date" });
    if (error) setNotice(`Could not update today's menu: ${error.message}`); else loadMenu();
  }

  async function prepareDishPromotion(item: MenuItem, values: PromotionValues): Promise<PreparedPromotion> {
    if (!supabase) throw new Error("The shared database is not connected.");
    const sharedCategory = values.includeCategory
      ? dishCategories.find((category) => category.id === item.category_id && category.is_active)
      : undefined;
    const categoryItems = sharedCategory
      ? menuItems.filter((candidate) => candidate.is_active && candidate.category_id === sharedCategory.id)
      : [];
    const daily = {
      menu_item_id: item.id,
      menu_date: today(),
      is_available: true,
      is_featured: true,
      portions_available: values.portions,
      special_price: values.specialPrice,
      promotion_message: values.message.trim(),
      promotion_until: values.until || null,
    };
    const dailyRows = sharedCategory && categoryItems.length > 1
      ? categoryItems.map((candidate) => candidate.id === item.id ? daily : {
        menu_item_id: candidate.id,
        menu_date: today(),
        is_available: true,
        is_featured: Boolean(candidate.daily?.is_featured),
        portions_available: candidate.daily?.portions_available ?? null,
        special_price: candidate.daily?.special_price ?? null,
        promotion_message: candidate.daily?.promotion_message || "",
        promotion_until: candidate.daily?.promotion_until || null,
      })
      : [daily];
    const { error } = await supabase.from("daily_menu").upsert(dailyRows, { onConflict: "menu_item_id,menu_date" });
    if (error) throw new Error(`Could not save today’s promotion: ${error.message}`);
    const price = Number(values.specialPrice ?? item.price);
    const lines = [`🍲 *${item.name}*`, values.message.trim() || item.description || "Freshly prepared at Neeru’s Home Kitchen.", `Today: ${money(price)}`];
    if (values.specialPrice !== null && Number(values.specialPrice) < Number(item.price)) lines.push(`Regular price: ${money(item.price)}`);
    if (values.portions !== null) lines.push(values.portions > 0 ? `Only ${values.portions} portions available` : "Sold out for today");
    if (values.until) lines.push(`Order before ${values.until}`);
    const dishSlug = item.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const url = sharedCategory && categoryItems.length > 1
      ? `${window.location.origin}/c/${encodeURIComponent(sharedCategory.slug)}/${encodeURIComponent(dishSlug || item.id.slice(0, 8))}`
      : `${window.location.origin}/d/${encodeURIComponent(dishSlug || item.id.slice(0, 8))}`;
    let imageFile: File | undefined;
    if (item.photo_url) {
      try {
        const response = await fetch(item.photo_url);
        if (response.ok) {
          const blob = await response.blob();
          const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
          imageFile = new File([blob], `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${extension}`, { type: blob.type || "image/jpeg" });
        }
      } catch {
        imageFile = undefined;
      }
    }
    await loadMenu();
    return { title: `${item.name} from Neeru’s Home Kitchen`, text: lines.join("\n"), url, image: imageFile };
  }

  async function prepareCategoryPromotion(category: DishCategory, values: CategoryPromotionValues): Promise<PreparedPromotion> {
    if (!supabase) throw new Error("The shared database is not connected.");
    const categoryItems = menuItems.filter((item) => item.is_active && item.category_id === category.id);
    const hero = categoryItems.find((item) => item.id === values.heroId);
    if (!hero) throw new Error("Choose a featured dish from this category.");
    const dailyRows = categoryItems.map((item) => ({
      menu_item_id: item.id,
      menu_date: today(),
      is_available: true,
      is_featured: item.id === hero.id || Boolean(item.daily?.is_featured),
      portions_available: item.daily?.portions_available ?? null,
      special_price: item.daily?.special_price ?? null,
      promotion_message: item.id === hero.id ? values.message.trim() : item.daily?.promotion_message || "",
      promotion_until: item.daily?.promotion_until || null,
    }));
    const { error } = await supabase.from("daily_menu").upsert(dailyRows, { onConflict: "menu_item_id,menu_date" });
    if (error) throw new Error(`Could not prepare the category menu: ${error.message}`);
    const lines = [
      "❤️ *Neeru’s Home Kitchen*",
      "",
      `*${category.name} Menu*`,
      values.message.trim(),
      "",
      ...categoryItems.flatMap((item) => [
        `*${item.name}* – ${money(Number(item.daily?.special_price ?? item.price))}${item.unit_label && item.unit_label !== "portion" ? ` / ${item.unit_label}` : ""}`,
        item.description || "Made fresh after you order.",
        "",
      ]),
      category.description || "Made fresh after you order, so every portion is prepared just for you.",
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
    const heroSlug = hero.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const url = `${window.location.origin}/c/${encodeURIComponent(category.slug)}/${encodeURIComponent(heroSlug || hero.id.slice(0, 8))}`;
    let imageFile: File | undefined;
    if (hero.photo_url) {
      try {
        const response = await fetch(hero.photo_url);
        if (response.ok) {
          const blob = await response.blob();
          const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
          imageFile = new File([blob], `${category.slug}-${heroSlug}.${extension}`, { type: blob.type || "image/jpeg" });
        }
      } catch {
        imageFile = undefined;
      }
    }
    await loadMenu();
    return { title: `${category.name} Menu · Neeru’s Home Kitchen`, text: lines.join("\n").trim(), url, image: imageFile };
  }

  async function setAllDailyMenu(isAvailable: boolean) {
    if (!supabase) return;
    const rows = menuItems.filter((item) => item.is_active).map((item) => ({ menu_item_id: item.id, menu_date: today(), is_available: isAvailable, is_featured: isAvailable ? Boolean(item.daily?.is_featured) : false, portions_available: item.daily?.portions_available ?? null, special_price: item.daily?.special_price ?? null }));
    const { error } = await supabase.from("daily_menu").upsert(rows, { onConflict: "menu_item_id,menu_date" });
    if (error) setNotice(`Could not update today's menu: ${error.message}`);
    else { setNotice(isAvailable ? "All active dishes are shown today." : "Today's customer menu is cleared."); loadMenu(); }
  }

  async function repeatYesterdayMenu() {
    if (!supabase) return;
    const { data, error } = await supabase.from("daily_menu").select("menu_item_id,is_available,is_featured,portions_available,special_price,promotion_message,promotion_until").eq("menu_date", shift(today(), -1));
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
    const response = await fetch(photoApiUrl("?key=payment/current"), {
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
    if (!supabase) return false;
    const currentOrder = orders.find((order) => order.id === id);
    const isDelivering = changes.stage === "delivered";
    let deliveryPhotoDeleted = false;
    if (isDelivering && currentOrder?.photo_path) {
      try {
        await deletePhotoKeys([currentOrder.photo_path]);
        deliveryPhotoDeleted = true;
      } catch (error) {
        setNotice(error instanceof Error ? `Not marked delivered. ${error.message}` : "Not marked delivered because its photo could not be deleted.");
        return false;
      }
    }
    const deliveryChanges = isDelivering ? { ...changes, photo_path: null } : changes;
    const record = deliveryChanges.is_paid === undefined
      ? deliveryChanges
      : { ...deliveryChanges, payment_status: deliveryChanges.is_paid ? "verified" : "pending" };
    const { data, error } = await supabase.from("orders").update(record).eq("id", id).select("id,stage,is_paid,payment_status,photo_path").maybeSingle();
    if (error || !data) {
      if (deliveryPhotoDeleted) await supabase.from("orders").update({ photo_path: null }).eq("id", id);
      setNotice(`Could not update: ${error?.message || "the order was not changed"}${deliveryPhotoDeleted ? ". The temporary photo was still removed safely." : ""}`);
      return false;
    }
    else {
      setOrders((current) => current.map((order) => order.id === id ? { ...order, ...record, stage: normalizeStage(data.stage) } as Order : order));
      if (isDelivering) setNotice(currentOrder?.photo_path ? "Marked delivered. The temporary photo was deleted and verified first." : "Marked delivered. No temporary photo was attached.");
      loadOrders();
      return true;
    }
  }

  async function confirmOrderDelivery(order: Order) {
    setDeliveryBusy(true);
    try {
      const updated = await updateOrder(order.id, { stage: "delivered" });
      if (updated) setDeliveringOrder(null);
    } finally {
      setDeliveryBusy(false);
    }
  }
  async function deleteOrder(order: Order, reason: OrderDeletionReason) {
    if (!supabase) throw new Error("The shared database is not connected.");
    setDeleteBusy(true);
    const currentOrder = orders.find((item) => item.id === order.id) || order;
    let photoDeleted = false;
    try {
      if (currentOrder?.photo_path) {
        await deletePhotoKeys([currentOrder.photo_path]);
        photoDeleted = true;
        if (currentOrder.photo_url?.startsWith("blob:")) URL.revokeObjectURL(currentOrder.photo_url);
      }
      const { data, error } = await supabase.from("orders").delete().eq("id", order.id).select("id").maybeSingle();
      if (error || !data) {
        if (photoDeleted) {
          await supabase.from("orders").update({ photo_path: null }).eq("id", order.id);
          setOrders((current) => current.map((item) => item.id === order.id ? { ...item, photo_path: null, photo_url: undefined } : item));
        }
        throw new Error(`Could not delete the order: ${error?.message || "the record was not removed"}.${photoDeleted ? " Its private photo was still removed safely." : ""}`);
      }
      const reasonLabels: Record<OrderDeletionReason, string> = {
        cancelled: "customer cancellation",
        unpaid: "non-payment",
        duplicate: "duplicate entry",
        mistake: "entry mistake",
        unavailable: "kitchen unavailable",
        other: "other reason",
      };
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setNotificationOrders((current) => current.filter((item) => item.id !== order.id));
      setEditing(null);
      setDeletingOrder(null);
      setNotice(`${order.customer_name}'s order was permanently deleted for ${reasonLabels[reason]}. It no longer affects orders, revenue or payment totals${photoDeleted ? ", and its private photo was deleted and verified" : ""}.`);
      await Promise.all([loadOrders(), loadCustomers(), loadActionCenter(false)]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Could not delete the order:")) throw error;
      throw new Error(error instanceof Error ? `Order was not deleted. ${error.message}` : "Order was not deleted because its private photo or database record could not be removed.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const requestOrderDeletion = (order: Order) => {
    setEditing(null);
    setDeletingOrder(order);
  };

  const openNewOrder = () => {
    setEditing(null);
    setAdding(true);
  };
  const openExistingOrder = (order: Order) => {
    sessionStorage.removeItem("neeru-prefill");
    setAdding(false);
    setEditing(order);
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
      {showLocalDevicePreview && <button
        className="device-switch"
        onClick={() => setPhonePreview(!phonePreview)}
        aria-pressed={phonePreview}
      >
        <Smartphone size={18} />
        {phonePreview ? "Exit phone preview" : "Preview on phone"}
      </button>}
      <div className={`app-frame ${large ? "large" : ""} ${dark ? "dark" : ""}`}>
        <main className="app">
          {appUpdateReady && <div className="app-update-banner" role="status"><span><RotateCcw /><b>App update ready</b></span><button onClick={() => window.location.replace(`/admin?updated=${Date.now()}`)}>Update now</button></div>}
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
                <div className="delivery-filter" role="group" aria-label="Filter orders by delivery person">
                  <button className={deliveryFilter === "all" ? "active" : ""} aria-pressed={deliveryFilter === "all"} onClick={() => setDeliveryFilter("all")}><List size={15} /><span>All</span><b>{stats.total}</b></button>
                  <button className={deliveryFilter === "nanny" ? "active" : ""} aria-pressed={deliveryFilter === "nanny"} onClick={() => setDeliveryFilter("nanny")}><CircleUserRound size={15} /><span>Nanny</span><b>{stats.nanny}</b></button>
                  <button className={deliveryFilter === "others" ? "active" : ""} aria-pressed={deliveryFilter === "others"} onClick={() => setDeliveryFilter("others")}><UtensilsCrossed size={15} /><span>Others</span><b>{stats.others}</b></button>
                </div>
                <div className="view-switch" aria-label="Choose order view">
                  <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><LayoutDashboard size={17} /> Board</button>
                  <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={17} /> List</button>
                </div>
              </section>

              {!supabase && <div className="setup">Setup needed: add the Supabase key in <code>.env.local</code>.</div>}
              {loading ? (
                <div className="empty"><span className="loader" /><strong>Loading orders…</strong></div>
              ) : filtered.length === 0 ? (
                <div className="empty"><span className="empty-icon"><UtensilsCrossed /></span><strong>{search ? "No matching orders" : deliveryFilter !== "all" ? `No orders assigned to ${deliveryFilter === "nanny" ? "Nanny" : "Others"}` : "No orders for this day"}</strong><span>{search ? "Try a different customer, flat or food." : deliveryFilter !== "all" ? "Choose All to see every order for this day." : "Add the first order when the phone rings."}</span>{!search && deliveryFilter === "all" && <button className="secondary" onClick={openNewOrder}><Plus size={18} /> Add order</button>}</div>
              ) : view === "board" ? (
                <Board orders={filtered} menuItems={menuItems} activeStage={activeStage} onStage={setActiveStage} onEdit={openExistingOrder} onUpdate={updateOrder} onDelete={requestOrderDeletion} onDeliver={setDeliveringOrder} />
              ) : (
                <OrderList orders={filtered} menuItems={menuItems} onEdit={openExistingOrder} onUpdate={updateOrder} onDelete={requestOrderDeletion} />
              )}
            </>
          ) : screen === "menu" ? (
            <MenuScreen items={menuItems} categories={dishCategories} settings={storeSettings} onSaveSettings={saveStoreSettings} onDaily={updateDailyMenu} onAdd={() => setMenuAdding(true)} onEdit={setMenuEditing} onPromote={setPromotingItem} onToggleArchive={toggleMenuItem} onAddCategory={() => setCategoryAdding(true)} onEditCategory={setCategoryEditing} onPromoteCategory={setPromotingCategory} onToggleCategory={toggleDishCategory} onShowAll={() => setAllDailyMenu(true)} onHideAll={() => setAllDailyMenu(false)} onRepeatYesterday={repeatYesterdayMenu} onOrder={(item) => { setScreen("orders"); setEditing(null); setAdding(true); sessionStorage.setItem("neeru-prefill", JSON.stringify(item)); }} />
          ) : (
            <SettingsScreen
              large={large}
              dark={dark}
              selectedDate={selectedDate}
              customerCount={customers.length}
              adminEmail={session?.user.email || ""}
              paymentSettings={storeSettings}
              whatsappNumber={storeSettings.whatsapp_number}
              onLarge={setLarge}
              onDark={setDark}
              onPrepareExport={prepareOrdersExport}
              onCreateBackup={createPortableBackup}
              onRestoreBackup={restorePortableBackup}
              onLoadStorage={loadStorageSummary}
              onCleanup={cleanupData}
              onSavePayment={savePaymentSettings}
              onRemovePaymentQr={removePaymentQr}
              onSaveCustomerContact={saveCustomerContact}
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
            onDelete={editing ? () => requestOrderDeletion(editing) : undefined}
          />
        )}
        {deletingOrder && <DeleteOrderModal order={deletingOrder} busy={deleteBusy} onClose={() => { if (!deleteBusy) setDeletingOrder(null); }} onConfirm={(reason) => deleteOrder(deletingOrder, reason)} />}
        {deliveringOrder && <CompleteDeliveryModal order={deliveringOrder} busy={deliveryBusy} onClose={() => { if (!deliveryBusy) setDeliveringOrder(null); }} onConfirm={() => confirmOrderDelivery(deliveringOrder)} />}
        {(menuAdding || menuEditing) && <MenuItemForm item={menuEditing} categories={dishCategories} onClose={() => { setMenuAdding(false); setMenuEditing(null); }} onSave={saveMenuItem} />}
        {promotingItem && <PromotionModal item={promotingItem} category={dishCategories.find((category) => category.id === promotingItem.category_id && category.is_active)} categoryDishCount={menuItems.filter((candidate) => candidate.is_active && candidate.category_id === promotingItem.category_id).length} onClose={() => setPromotingItem(null)} onPrepare={prepareDishPromotion} />}
        {(categoryAdding || categoryEditing) && <CategoryForm category={categoryEditing} onClose={() => { setCategoryAdding(false); setCategoryEditing(null); }} onSave={saveDishCategory} />}
        {promotingCategory && <CategoryPromotionModal category={promotingCategory} items={menuItems.filter((item) => item.category_id === promotingCategory.id && item.is_active)} onClose={() => setPromotingCategory(null)} onPrepare={prepareCategoryPromotion} />}
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
            {!count && <div className="notification-empty"><Check /><b>Nothing needs attention</b><span>New online orders will appear here.</span></div>}
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
          <button className="notification-manage" onClick={onManageApprovals}><Settings2 /> Open settings</button>
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
  return <span className={`stage ${s.color}`}><i />{s.badge}</span>;
}
function menuImageFor(order: Order, menuItems: MenuItem[]) {
  const details = order.order_details.toLowerCase();
  return menuItems.find((item) => details.includes(item.name.toLowerCase()))?.photo_url;
}
function OrderCard({ order, menuItems, onEdit, onUpdate, onDelete, onDeliver }: { order: Order; menuItems: MenuItem[]; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void; onDelete: (o: Order) => void; onDeliver: (o: Order) => void }) {
  const canDeliver = order.stage !== "delivered";
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
          <span className="card-secondary-actions"><button className="edit-order" onClick={(e) => { e.stopPropagation(); onEdit(order); }}>Edit</button><button className="delete-order-action" onClick={(e) => { e.stopPropagation(); onDelete(order); }}><Trash2 size={13} /> Delete</button></span>
          {canDeliver
            ? <button className="move-order" onClick={(e) => { e.stopPropagation(); onDeliver(order); }}>Mark delivered<Check size={16} /></button>
            : <button className="move-order restore-order" onClick={(e) => { e.stopPropagation(); onUpdate(order.id, { stage: "new" }); }}>Back to Orders<RotateCcw size={15} /></button>}
        </div>
      </div>
    </article>
  );
}

function Board({ orders, menuItems, activeStage, onStage, onEdit, onUpdate, onDelete, onDeliver }: { orders: Order[]; menuItems: MenuItem[]; activeStage: Stage; onStage: (stage: Stage) => void; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void; onDelete: (o: Order) => void; onDeliver: (o: Order) => void }) {
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
              {stageOrders.map((o) => <OrderCard key={o.id} order={o} menuItems={menuItems} onEdit={onEdit} onUpdate={onUpdate} onDelete={onDelete} onDeliver={onDeliver} />)}
              {!stageOrders.length && <div className="column-empty"><Check size={18} /><span>No orders here</span></div>}
            </div>
          </div>;
        })}
      </section>
    </>
  );
}

function OrderList({ orders, menuItems, onEdit, onUpdate, onDelete }: { orders: Order[]; menuItems: MenuItem[]; onEdit: (o: Order) => void; onUpdate: (id: string, c: Partial<Order>) => void; onDelete: (o: Order) => void }) {
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
      <button className="row-delete-order" aria-label={`Delete ${o.customer_name}'s order`} title="Delete order" onClick={(event) => { event.stopPropagation(); onDelete(o); }}><Trash2 /></button>
    </div>;
  })}</div>;
}

function MenuScreen({ items, categories, settings, onSaveSettings, onDaily, onAdd, onEdit, onPromote, onToggleArchive, onAddCategory, onEditCategory, onPromoteCategory, onToggleCategory, onShowAll, onHideAll, onRepeatYesterday, onOrder }: { items: MenuItem[]; categories: DishCategory[]; settings: AdminStoreSettings; onSaveSettings: (settings: AdminStoreSettings) => void; onDaily: (item: MenuItem, changes: Partial<NonNullable<MenuItem["daily"]>>) => void; onAdd: () => void; onEdit: (item: MenuItem) => void; onPromote: (item: MenuItem) => void; onToggleArchive: (item: MenuItem) => void; onAddCategory: () => void; onEditCategory: (category: DishCategory) => void; onPromoteCategory: (category: DishCategory) => void; onToggleCategory: (category: DishCategory) => void; onShowAll: () => void; onHideAll: () => void; onRepeatYesterday: () => void; onOrder: (item: MenuItem) => void }) {
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
  const categoryName = (item: MenuItem) => categories.find((category) => category.id === item.category_id)?.name || "Other dishes";
  return (
    <>
      <section className="page-heading menu-heading"><div><span className="eyebrow">STOREFRONT CONTROL CENTRE</span><span className="page-title-with-info"><h1>Menu & selling</h1><InfoTip label="About menu and selling">Manage dish categories, the dish catalogue, today’s availability, featured dishes and payment instructions.</InfoTip></span></div><button className="primary" onClick={onAdd}><Plus size={20} /> Add dish</button></section>
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
      <section className="category-manager">
        <div className="category-manager-head"><div><span className="settings-icon"><Tags /></span><span><h2>Dish categories</h2><small>Group dishes and share a complete category menu with one featured dish.</small></span></div><button onClick={onAddCategory}><Plus /> Add category</button></div>
        <div className="category-list">{categories.map((category) => {
          const count = items.filter((item) => item.category_id === category.id && item.is_active).length;
          return <article className={category.is_active ? "" : "archived"} key={category.id}><span><b>{category.name}</b><small>{count} dish{count === 1 ? "" : "es"}</small></span><div><button disabled={!category.is_active || count === 0} onClick={() => onPromoteCategory(category)} title="Share category menu on WhatsApp"><MessageCircle /></button><button onClick={() => onEditCategory(category)} title="Edit category"><Pencil /></button><button onClick={() => onToggleCategory(category)} title={category.is_active ? "Hide category" : "Restore category"}>{category.is_active ? <Archive /> : <ArchiveRestore />}</button></div></article>;
        })}</div>
      </section>
      <div className="daily-menu-toolbar"><div className="daily-menu-label"><span><CalendarDays size={17} /> Today’s customer menu</span><small>{shownCount} shown · {featuredCount} featured · {items.length - activeItems.length} archived</small></div><div className="daily-menu-actions"><button onClick={onRepeatYesterday}><RotateCcw size={14} /> Repeat yesterday</button><button onClick={onShowAll}><Check size={14} /> Show all</button><button onClick={onHideAll}><X size={14} /> Clear today</button></div></div>
      <section className="menu-grid">
        {items.map((item) => <article className={`menu-card ${item.is_active ? "" : "archived"}`} data-menu-id={item.id} key={item.id}>
          <button className="menu-image" disabled={!item.is_active} onClick={() => onOrder(item)}>{item.photo_url ? <img src={item.photo_url} alt={item.name} /> : <span><ChefHat /></span>}<em>{item.is_active ? "Add admin order" : "Archived"}</em></button>
          <div className="menu-copy"><div><small className="menu-category-tag">{categoryName(item)}</small><h2>{item.name}</h2><span>{item.daily?.special_price !== null && item.daily?.special_price !== undefined ? `${money(item.daily.special_price)} today · ${money(item.price)} / ${item.unit_label || "portion"} regular` : `${money(item.price)} / ${item.unit_label || "portion"}`}</span></div><div className="menu-card-actions"><button className="promote-food" disabled={!item.is_active} onClick={() => onPromote(item)} aria-label={`Promote ${item.name} on WhatsApp`} title="Promote on WhatsApp"><MessageCircle size={15} /></button><button onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={15} /></button><button className="remove-food" onClick={() => onToggleArchive(item)} aria-label={`${item.is_active ? "Archive" : "Restore"} ${item.name}`}>{item.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}</button></div></div>
          {item.description && <p className="menu-description">{item.description}</p>}
          <div className="daily-controls"><button className={item.daily?.is_available ? "selected" : ""} disabled={!item.is_active} onClick={() => onDaily(item, { is_available: !item.daily?.is_available, is_featured: item.daily?.is_available ? false : item.daily?.is_featured })}><Check size={14} /> {item.daily?.is_available ? "Shown" : "Hidden"}</button><button className={item.daily?.is_featured ? "selected featured" : ""} disabled={!item.is_active || !item.daily?.is_available} onClick={() => onDaily(item, { is_featured: !item.daily?.is_featured })}><FlameIcon /> Featured</button><label><span>Today’s price</span><input type="number" min="0" placeholder={String(item.price)} disabled={!item.is_active || !item.daily?.is_available} value={item.daily?.special_price ?? ""} onChange={(event) => onDaily(item, { special_price: event.target.value === "" ? null : Number(event.target.value) })} /></label><label><span>Portions</span><input type="number" min="0" placeholder="∞" disabled={!item.is_active || !item.daily?.is_available} value={item.daily?.portions_available ?? ""} onChange={(event) => onDaily(item, { portions_available: event.target.value === "" ? null : Number(event.target.value) })} /></label></div>
        </article>)}
      </section>
    </>
  );
}

function ShoppingBagIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>; }
function FlameIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c4 0 7-3 7-7 0-3-2-6-5-9 0 3-2 4-3 5 0-3-1-6-3-8 0 5-3 7-3 12 0 4 3 7 7 7Z" /></svg>; }

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!tipRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className={`info-popout ${open ? "open" : ""}`} ref={tipRef}>
      <button type="button" className="info-popout-trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen((current) => !current)}><Info /></button>
      {open && <span className="info-popout-card" role="note">{children}</span>}
    </span>
  );
}

function SettingsScreen({ large, dark, selectedDate, customerCount, adminEmail, paymentSettings, whatsappNumber, onLarge, onDark, onPrepareExport, onCreateBackup, onRestoreBackup, onLoadStorage, onCleanup, onSavePayment, onRemovePaymentQr, onSaveCustomerContact, onUpdateAccount, onSignOut }: {
  large: boolean;
  dark: boolean;
  selectedDate: string;
  customerCount: number;
  adminEmail: string;
  paymentSettings: AdminStoreSettings;
  whatsappNumber: string;
  onLarge: (large: boolean) => void;
  onDark: (dark: boolean) => void;
  onPrepareExport: (options: ExportOptions, format: ExportFormat) => Promise<File>;
  onCreateBackup: () => Promise<File>;
  onRestoreBackup: (backup: PortableBackup) => Promise<PortableRestoreResult>;
  onLoadStorage: () => Promise<StorageSummary>;
  onCleanup: (action: CleanupAction) => Promise<string>;
  onSavePayment: (values: PaymentSettingsUpdate, qrPhoto?: File) => Promise<void>;
  onRemovePaymentQr: () => Promise<void>;
  onSaveCustomerContact: (whatsappNumber: string) => Promise<void>;
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
  const [exportBusy, setExportBusy] = useState<ExportFormat | "">("");
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState(false);
  const [backupBusy, setBackupBusy] = useState<"create" | "restore" | "">("");
  const [preparedBackup, setPreparedBackup] = useState<File | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<PortableBackup | null>(null);
  const [selectedBackupName, setSelectedBackupName] = useState("");
  const [restoreApproved, setRestoreApproved] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState(false);
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [storageBusy, setStorageBusy] = useState<CleanupAction | "refresh" | "">("");
  const [storageMessage, setStorageMessage] = useState("");
  const [storageError, setStorageError] = useState(false);
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
    void refreshStorage();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setSavedQrAvailable(false);
    fetch(photoApiUrl(`?key=payment/current&v=${qrRevision}`), { cache: "no-store", signal: controller.signal })
      .then((response) => setSavedQrAvailable(response.ok && Boolean(response.headers.get("content-type")?.startsWith("image/"))))
      .catch(() => setSavedQrAvailable(false));
    return () => controller.abort();
  }, [qrRevision]);

  const upiLooksValid = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/.test(paymentForm.upi_id.trim());
  const savedQrUrl = photoApiUrl(`?key=payment/current&v=${qrRevision}`);

  async function refreshStorage() {
    setStorageBusy("refresh");
    setStorageError(false);
    try {
      setStorageSummary(await onLoadStorage());
    } catch (error) {
      setStorageError(true);
      setStorageMessage(error instanceof Error ? error.message : "Could not check photo storage.");
    } finally {
      setStorageBusy("");
    }
  }

  async function prepareExport(format: ExportFormat) {
    setExportBusy(format);
    setExportError(false);
    setExportMessage("");
    setPreparedFile(null);
    try {
      const file = await onPrepareExport(exportOptions, format);
      setPreparedFile(file);
      setExportMessage(`${format === "xlsx" ? "Excel" : "CSV"} file is ready. Tap Share or save to choose Files, WhatsApp, AirDrop or another app.`);
    } catch (error) {
      setExportError(true);
      setExportMessage(error instanceof Error ? error.message : "Could not prepare the export.");
    } finally {
      setExportBusy("");
    }
  }

  async function sharePrepared() {
    if (!preparedFile) return;
    setExportError(false);
    try {
      setExportMessage(await shareOrSaveFile(preparedFile));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setExportError(true);
      setExportMessage(error instanceof Error ? error.message : "Could not share or save the file.");
    }
  }

  async function runCleanup(action: CleanupAction) {
    const prompts: Record<CleanupAction, string> = {
      "delivered-photos": "Remove every photo attached to delivered orders? The order records will stay.",
      "all-order-photos": "Remove ALL order photos? The order records will stay.",
      "all-menu-photos": "Remove ALL manually uploaded menu photos? Dish details stay, but uploaded food photos will be cleared.",
      "delivered-orders": "Permanently delete all delivered order history and its photos? This cannot be undone.",
      "all-orders": "Permanently delete ALL order history and order photos? This cannot be undone.",
    };
    if (!window.confirm(prompts[action])) return;
    if (action === "all-orders" && window.prompt("Type DELETE ALL ORDERS to confirm") !== "DELETE ALL ORDERS") return;
    setStorageBusy(action);
    setStorageError(false);
    try {
      setStorageMessage(await onCleanup(action));
      setStorageSummary(await onLoadStorage());
    } catch (error) {
      setStorageError(true);
      setStorageMessage(error instanceof Error ? error.message : "Cleanup could not be completed.");
    } finally {
      setStorageBusy("");
    }
  }

  async function prepareFullBackup() {
    setBackupBusy("create");
    setBackupError(false);
    setBackupMessage("");
    try {
      const file = await onCreateBackup();
      setPreparedBackup(file);
      setBackupMessage("Portable backup ready. Save it somewhere outside Supabase.");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "Could not prepare the backup.");
    } finally {
      setBackupBusy("");
    }
  }

  async function saveFullBackup() {
    if (!preparedBackup) return;
    setBackupError(false);
    try {
      setBackupMessage(await shareOrSaveFile(preparedBackup));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "Could not share or save the backup.");
    }
  }

  async function chooseBackup(file?: File) {
    setSelectedBackup(null);
    setSelectedBackupName("");
    setRestoreApproved(false);
    setBackupError(false);
    setBackupMessage("");
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setBackupError(true);
      return setBackupMessage("This backup is over the 25 MB safety limit.");
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isPortableBackup(parsed)) throw new Error("Choose a valid Neeru's Home Kitchen .json backup.");
      setSelectedBackup(parsed);
      setSelectedBackupName(file.name);
      setBackupMessage("Backup checked and ready for review.");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "The selected file could not be read.");
    }
  }

  async function restoreFullBackup() {
    if (!selectedBackup || !restoreApproved) return;
    setBackupBusy("restore");
    setBackupError(false);
    setBackupMessage("");
    try {
      const result = await onRestoreBackup(selectedBackup);
      setBackupMessage(`Restore complete: ${result.orders} orders, ${result.menu_items} dishes and ${result.customers_matched} connected customers. ${result.customers_waiting_to_reconnect} customer account${result.customers_waiting_to_reconnect === 1 ? "" : "s"} can reconnect with the same phone or email.`);
      setSelectedBackup(null);
      setSelectedBackupName("");
      setRestoreApproved(false);
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be restored.");
    } finally {
      setBackupBusy("");
    }
  }

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

  return (
    <>
      <section className="page-heading settings-heading">
        <div><span className="eyebrow">KITCHEN CONTROL CENTRE</span><span className="page-title-with-info"><h1>Settings</h1><InfoTip label="About settings">Manage payments, appearance, exports and kitchen records securely.</InfoTip></span></div>
      </section>
      <section className="settings-grid">
        <article className="settings-card account-settings-card">
          <div className="settings-title"><span className="settings-icon"><ShieldCheck /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Admin account</h2><InfoTip label="About admin account">Change the email or password for this signed-in administrator. Email changes may need confirmation from Supabase; the account keeps its admin permission because its secure user ID does not change.</InfoTip></span></div></div>
          <form className="settings-form account-settings-form" onSubmit={saveAccount}>
            <label className="wide-setting-field"><span><Mail /> Admin email</span><input type="email" value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" required /></label>
            <label><span><KeyRound /> Current password</span><input type="password" value={accountForm.currentPassword} onChange={(event) => setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} placeholder="Required to confirm changes" autoComplete="current-password" required /></label>
            <label><span>New password <small>Optional</small></span><input type="password" minLength={8} value={accountForm.newPassword} onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))} placeholder="At least 8 characters" autoComplete="new-password" /></label>
            <label><span>Confirm new password</span><input type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat the new password" autoComplete="new-password" /></label>
            {accountMessage && <p className={`settings-message ${accountError ? "error" : "success"}`} role="status">{accountMessage}</p>}
            <button className="primary settings-save" disabled={accountBusy}><Save size={17} /> {accountBusy ? "Updating account…" : "Update admin account"}</button>
          </form>
        </article>

        <article className="settings-card payment-settings-card">
          <div className="settings-title"><span className="settings-icon"><QrCode /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>UPI and payment QR</h2><InfoTip label="About payment settings">Control the payment details customers receive after ordering. QR files are stored privately in Netlify Blobs; the UPI ID also powers tap-to-pay and the automatic QR fallback.</InfoTip></span></div></div>
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
                <span className="compact-info-line"><b>{qrFile ? "New QR ready to save" : savedQrAvailable ? "Custom payment QR active" : "Using automatic UPI QR"}</b><InfoTip label="About QR uploads">Upload the scanner image exported from GPay, PhonePe or your banking app. JPG, PNG or WebP works best.</InfoTip></span>
                <div className="qr-actions">
                  <label className="upload-qr-button"><Upload size={16} /> {savedQrAvailable ? "Replace QR" : "Upload QR"}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setQrFile(event.target.files?.[0])} /></label>
                  {(qrFile || savedQrAvailable) && <button type="button" className="remove-qr-button" onClick={() => qrFile ? setQrFile(undefined) : removeQr()} disabled={paymentBusy}><Trash2 size={15} /> {qrFile ? "Cancel" : "Remove"}</button>}
                </div>
              </div>
            </div>
            {paymentMessage && <p className={`settings-message ${paymentError ? "error" : "success"}`} role="status">{paymentMessage}</p>}
            <button className="primary settings-save" disabled={paymentBusy || !upiLooksValid}><Save size={17} /> {paymentBusy ? "Saving payment settings…" : "Save payment settings"}</button>
          </form>
        </article>

        <article className="settings-card contact-settings-card">
          <div className="settings-title"><span className="settings-icon whatsapp-settings-icon"><MessageCircle /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Customer WhatsApp</h2><InfoTip label="About customer WhatsApp">Give customers a quick way to ask about the menu or their order. A 10-digit Indian number automatically receives country code +91.</InfoTip></span></div></div>
          <form className="settings-form" onSubmit={saveContact}>
            <label><span>WhatsApp number</span><input type="tel" inputMode="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder="+91 98765 43210" /></label>
            <p className="contact-preview"><MessageCircle /><span><b>{contactNumber.trim() ? "Message us on WhatsApp" : "Button hidden until a number is added"}</b></span></p>
            {contactMessage && <p className={`settings-message ${contactError ? "error" : "success"}`} role="status">{contactMessage}</p>}
            <button className="primary settings-save" disabled={contactBusy}><Save size={17} /> {contactBusy ? "Saving contact…" : "Save WhatsApp contact"}</button>
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-title"><span className="settings-icon"><Type /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Text size</h2><InfoTip label="About text size">This choice stays saved on this phone.</InfoTip></span></div></div>
          <div className="size-options" role="group" aria-label="Choose text size">
            <button className={!large ? "selected" : ""} onClick={() => onLarge(false)}><span>Aa</span><b>Standard</b><small>More fits on screen</small></button>
            <button className={large ? "selected" : ""} onClick={() => onLarge(true)}><span className="large-sample">Aa</span><b>Large</b><small>Easier to read</small></button>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-title"><span className="settings-icon">{dark ? <Moon /> : <Sun />}</span><div className="settings-title-copy"><span className="settings-title-line"><h2>Appearance</h2><InfoTip label="About appearance">Choose the look for this phone.</InfoTip></span></div></div>
          <div className="theme-options" role="group" aria-label="Choose appearance">
            <button className={!dark ? "selected" : ""} onClick={() => onDark(false)}><span className="theme-preview light-preview"><Sun /></span><b>Light</b><small>Bright and clean</small></button>
            <button className={dark ? "selected" : ""} onClick={() => onDark(true)}><span className="theme-preview dark-preview"><Moon /></span><b>Dark</b><small>Comfortable at night</small></button>
          </div>
        </article>

        <article className="settings-card export-card">
          <div className="settings-title"><span className="settings-icon"><FileSpreadsheet /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Export order data</h2><InfoTip label="About exporting orders">Choose the dates and prepare either a CSV or Excel workbook. On phones, Share or save opens the native sheet for Files, WhatsApp, AirDrop and other apps. On supported Mac browsers it opens Save As; other browsers use Downloads without leaving this page.</InfoTip></span></div></div>
          <div className="export-fields">
            <label><span>From</span><input type="date" value={exportOptions.from} onChange={(event) => setExport("from", event.target.value)} /></label>
            <label><span>To</span><input type="date" value={exportOptions.to} onChange={(event) => setExport("to", event.target.value)} /></label>
            <label className="payment-filter"><span>Payment</span><select value={exportOptions.payment} onChange={(event) => setExport("payment", event.target.value as ExportOptions["payment"])}><option value="all">All orders</option><option value="paid">Paid only</option><option value="pending">Pending only</option></select></label>
          </div>
          <div className="export-actions">
            <button className="secondary export-button" disabled={Boolean(exportBusy)} onClick={() => prepareExport("csv")}><Download size={19} /> {exportBusy === "csv" ? "Preparing CSV…" : "Prepare CSV"}</button>
            <button className="primary export-button" disabled={Boolean(exportBusy)} onClick={() => prepareExport("xlsx")}><FileSpreadsheet size={19} /> {exportBusy === "xlsx" ? "Preparing Excel…" : "Prepare Excel (.xlsx)"}</button>
          </div>
          {preparedFile && <div className="prepared-export"><span><b>{preparedFile.name}</b><small>{readableBytes(preparedFile.size)} · ready on this device</small></span><button className="primary" onClick={sharePrepared}><Share2 size={18} /> Share or save</button></div>}
          {exportMessage && <p className={`settings-message ${exportError ? "error" : "success"}`} role="status">{exportMessage}</p>}
        </article>

        <article className="settings-card export-card migration-card">
          <div className="settings-title"><span className="settings-icon"><DatabaseBackup /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Full backup &amp; restore</h2><InfoTip label="About portable backups">Creates a portable JSON package containing orders, order items, customer profiles, menu, daily availability, promotions, UPI and storefront settings. Supabase never exposes passwords, so customers reconnect securely with the same phone or email. Photo files remain in this Netlify site; their database references are included.</InfoTip></span></div></div>
          <div className="migration-sections">
            <section className="migration-section">
              <span className="migration-label"><b>1. Protect this kitchen</b><em>Non-destructive</em></span>
              <div className="migration-actions">
                <button className="primary" disabled={Boolean(backupBusy)} onClick={prepareFullBackup}><DatabaseBackup size={18} /> {backupBusy === "create" ? "Creating backup…" : "Create full backup"}</button>
                <a className="secondary setup-sql-link" href="/supabase-new-project-setup.sql" download="neerus-home-kitchen-supabase-setup.sql"><Download size={17} /> New-project setup SQL</a>
              </div>
              {preparedBackup && <div className="prepared-export"><span><b>{preparedBackup.name}</b><small>{readableBytes(preparedBackup.size)} · JSON migration package</small></span><button className="primary" onClick={saveFullBackup}><Share2 size={18} /> Share or save</button></div>}
            </section>

            <section className="migration-section restore-section">
              <span className="migration-label"><b>2. Restore a backup</b><em>Replaces records</em></span>
              <label className="backup-file-picker"><Upload size={18} /><span><b>{selectedBackupName || "Choose backup file"}</b><small>Neeru's Kitchen JSON only</small></span><input type="file" accept="application/json,.json" onChange={(event) => { void chooseBackup(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
              {selectedBackup && <div className="backup-review">
                <div className="backup-counts"><span><b>{selectedBackup.counts.orders}</b><small>Orders</small></span><span><b>{selectedBackup.counts.menu_items}</b><small>Dishes</small></span><span><b>{selectedBackup.counts.customer_profiles + selectedBackup.counts.restored_customer_profiles}</b><small>Customers</small></span></div>
                <small className="backup-date">Created {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedBackup.created_at))}</small>
                <label className="restore-consent"><input type="checkbox" checked={restoreApproved} onChange={(event) => setRestoreApproved(event.target.checked)} /><span>I understand this replaces the current orders, menu and daily selling records.</span></label>
                <button className="restore-backup-button" disabled={!restoreApproved || Boolean(backupBusy)} onClick={restoreFullBackup}><ArchiveRestore size={18} /> {backupBusy === "restore" ? "Restoring safely…" : "Restore this backup"}</button>
              </div>}
            </section>
          </div>
          {backupMessage && <p className={`settings-message ${backupError ? "error" : "success"}`} role="status">{backupMessage}</p>}
        </article>

        <article className="settings-card storage-card">
          <div className="settings-title"><span className="settings-icon"><UsersRound /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Saved customers</h2><InfoTip label="About saved customers">Start typing a returning customer’s name in a new order. Their tower, flat number and usual delivery person will appear automatically.</InfoTip></span><strong className="settings-compact-stat">{customerCount} {customerCount === 1 ? "customer" : "customers"} remembered</strong></div></div>
        </article>

        <article className="settings-card export-card storage-cleanup-card">
          <div className="settings-title"><span className="settings-icon"><HardDrive /></span><div className="settings-title-copy"><span className="settings-title-line"><h2>Storage &amp; cleanup</h2><InfoTip label="About photo storage">Order photos are temporary private thumbnails; menu photos remain until removed or replaced. Photos live in the private Netlify Blobs store and Supabase keeps only an opaque key. New order photos become tiny 360 px WebP thumbnails. High-resolution dish photos are automatically reduced to a fast-loading WebP and served with long-term browser caching.</InfoTip></span></div><button className="storage-refresh" onClick={refreshStorage} disabled={Boolean(storageBusy)}><RotateCcw size={15} /> Refresh</button></div>
          <div className="storage-summary">
            <span><Camera /><b>{storageSummary?.orders?.count ?? "—"}</b><small>Order photos{storageSummary?.orders ? ` · ${readableBytes(storageSummary.orders.knownBytes)} tracked` : ""}</small></span>
            <span><ChefHat /><b>{storageSummary?.menu?.count ?? "—"}</b><small>Uploaded menu photos{storageSummary?.menu ? ` · ${readableBytes(storageSummary.menu.knownBytes)} tracked` : ""}</small></span>
            <span><FileSpreadsheet /><b>Supabase</b><small>Order text, customers and prices</small></span>
          </div>
          {storageSummary?.orders && storageSummary?.menu && (storageSummary.orders.unknownSizes + storageSummary.menu.unknownSizes > 0) && <div className="storage-inline-info"><InfoTip label="About older photo sizes">Some older photos predate size tracking, so displayed bytes cover new uploads only. Photo counts still include everything.</InfoTip><span>Older sizes partly tracked</span></div>}
          <div className="cleanup-groups">
            <section><span className="cleanup-title"><b>Photo cleanup</b><InfoTip label="About photo cleanup">Removes image files while keeping order and dish data.</InfoTip><em>Records stay</em></span><div><button disabled={Boolean(storageBusy)} onClick={() => runCleanup("delivered-photos")}><Trash2 /> Delivered order photos</button><button disabled={Boolean(storageBusy)} onClick={() => runCleanup("all-order-photos")}><Trash2 /> All order photos</button><button disabled={Boolean(storageBusy)} onClick={() => runCleanup("all-menu-photos")}><Trash2 /> Uploaded menu photos</button></div></section>
            <section className="danger-cleanup"><span className="cleanup-title"><b>Database history</b><InfoTip label="About deleting history">Permanently deletes order records from Supabase. Export first if you need a backup.</InfoTip><em>Permanent</em></span><div><button disabled={Boolean(storageBusy)} onClick={() => runCleanup("delivered-orders")}><Archive /> Delete delivered history</button><button disabled={Boolean(storageBusy)} onClick={() => runCleanup("all-orders")}><Trash2 /> Delete all orders</button></div></section>
          </div>
          {storageMessage && <p className={`settings-message ${storageError ? "error" : "success"}`} role="status">{storageMessage}</p>}
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

function CompleteDeliveryModal({ order, busy, onClose, onConfirm }: { order: Order; busy: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <div className="modal-bg delivery-confirm-bg" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="modal delivery-confirm-modal">
        <div className="delivery-confirm-head"><span className="delivery-confirm-icon"><Check /></span><div><span className="eyebrow">COMPLETE DELIVERY</span><h2>Mark as delivered?</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy}><X /></button></div>
        <div className="delivery-confirm-summary"><span><b>{order.customer_name}</b><small>Flat {order.flat_number}</small></span><strong>{money(Number(order.amount))}</strong><p>{order.order_details}</p></div>
        <div className="delivery-confirm-note"><ShieldCheck /><span><b>{order.photo_path ? "Temporary photo will be removed" : "Ready to complete"}</b><small>{order.photo_path ? "The private order photo is deleted and verified before the status changes. The order record and totals remain available under Delivered." : "The order record and totals remain available under Delivered. You can move it back to Orders later if needed."}</small></span></div>
        <div className="delivery-confirm-actions"><button type="button" className="cancel" onClick={onClose} disabled={busy}>Keep in Orders</button><button type="button" className="confirm-delivery" onClick={onConfirm} disabled={busy}><Check size={18} /> {busy ? "Completing safely…" : "Mark delivered"}</button></div>
      </section>
    </div>
  );
}

function DeleteOrderModal({ order, busy, onClose, onConfirm }: { order: Order; busy: boolean; onClose: () => void; onConfirm: (reason: OrderDeletionReason) => Promise<void> }) {
  const [reason, setReason] = useState<OrderDeletionReason>("cancelled");
  const [error, setError] = useState("");

  async function confirmDeletion(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onConfirm(reason);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The order could not be deleted.");
    }
  }

  return (
    <div className="modal-bg delete-order-bg" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="modal delete-order-modal" onSubmit={confirmDeletion}>
        <div className="delete-order-head"><span className="delete-order-icon"><Trash2 /></span><div><span className="eyebrow">PERMANENT ACTION</span><h2>Delete this order?</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy}><X /></button></div>
        <div className="delete-order-summary"><span><b>{order.customer_name}</b><small>Flat {order.flat_number}</small></span><strong>{money(Number(order.amount))}</strong><p>{order.order_details}</p></div>
        <label className="delete-reason"><span>Reason for deletion</span><select value={reason} onChange={(event) => setReason(event.target.value as OrderDeletionReason)}><option value="cancelled">Customer cancelled</option><option value="unpaid">Payment not received</option><option value="duplicate">Duplicate order</option><option value="mistake">Entered by mistake</option><option value="unavailable">Kitchen unable to fulfil</option><option value="other">Other reason</option></select></label>
        <div className="delete-order-warning"><ShieldCheck /><span><b>Removed completely</b><small>This order will disappear from order counts, revenue and payment totals. {order.photo_path ? "Its attached private photo will be deleted and verified first." : "No private order photo is attached."}</small></span></div>
        {error && <p className="settings-message error" role="alert">{error}</p>}
        <div className="delete-order-actions"><button type="button" className="cancel" onClick={onClose} disabled={busy}>Keep order</button><button className="confirm-delete" disabled={busy}><Trash2 size={17} /> {busy ? "Deleting safely…" : "Delete permanently"}</button></div>
      </form>
    </div>
  );
}

function OrderForm({ draft, menuItems, customers, onClose, onSave, onDelete }: { draft: Draft | Order; menuItems: MenuItem[]; customers: CustomerProfile[]; onClose: () => void; onSave: (d: Draft, photo?: File) => void; onDelete?: () => void }) {
  const prefill = !('id' in draft) ? sessionStorage.getItem("neeru-prefill") : null;
  const prefillItem = prefill ? JSON.parse(prefill) as MenuItem : null;
  const initialOrderLines: OrderLine[] = draft.items?.length ? draft.items : prefillItem ? [{ menu_item_id: prefillItem.id, item_name: prefillItem.name, unit_price: Number(prefillItem.daily?.special_price ?? prefillItem.price), quantity: 1, unit_label: prefillItem.unit_label || "portion" }] : [];
  const initialLineDetails = initialOrderLines.map((line) => `${line.item_name} × ${line.quantity}${line.unit_label !== "portion" ? ` (${line.unit_label} each)` : ""}`).join(", ");
  const initialLineTotal = initialOrderLines.reduce((total, line) => total + Number(line.unit_price) * line.quantity, 0);
  const [orderLines, setOrderLines] = useState<OrderLine[]>(initialOrderLines);
  const [form, setForm] = useState<Draft>({ ...draft, items: initialOrderLines, order_details: initialLineDetails || draft.order_details, amount: initialOrderLines.length ? initialLineTotal : draft.amount });
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const initialFlat = splitAdminFlat(draft.flat_number);
  const [flatWing, setFlatWing] = useState<BuildingWing>(initialFlat.wing);
  const [flatDigits, setFlatDigits] = useState(initialFlat.number);
  const [allowNoWing, setAllowNoWing] = useState(Boolean(initialFlat.number && !initialFlat.wing && "id" in draft));
  const [flatWarning, setFlatWarning] = useState("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((v) => ({ ...v, [key]: value }));
  const setCustomerFlat = (flatNumber: string) => {
    const parsed = splitAdminFlat(flatNumber);
    setFlatWing(parsed.wing);
    setFlatDigits(parsed.number);
    setAllowNoWing(Boolean(parsed.number && !parsed.wing));
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
    if (wing) setAllowNoWing(false);
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
  const applyOrderLines = (next: OrderLine[]) => {
    const normalized = next.filter((line) => line.quantity > 0).map((line) => ({ ...line, quantity: Math.min(20, Math.max(1, line.quantity)) }));
    const details = normalized.map((line) => `${line.item_name} × ${line.quantity}${line.unit_label !== "portion" ? ` (${line.unit_label} each)` : ""}`).join(", ");
    const amount = normalized.reduce((total, line) => total + Number(line.unit_price) * line.quantity, 0);
    setOrderLines(normalized);
    setForm((current) => ({ ...current, items: normalized, order_details: details, amount }));
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
    const existing = orderLines.find((line) => line.menu_item_id === item.id);
    if (existing) return applyOrderLines(orderLines.map((line) => line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line));
    applyOrderLines([...orderLines, { menu_item_id: item.id, item_name: item.name, unit_price: Number(item.daily?.special_price ?? item.price), quantity: 1, unit_label: item.unit_label || "portion" }]);
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal order-modal" onSubmit={(e) => { e.preventDefault(); if ((!flatWing && !allowNoWing) || !flatDigits) { setFlatWarning(!flatWing ? "Choose the tower." : "Enter the flat number."); return; } onSave({ ...form, flat_number: flatWing ? `${flatWing}-${flatDigits}` : flatDigits }, photo); }}>
        <div className="modal-head"><div><span className="eyebrow">{form.order_date}</span><h2>{"id" in draft ? "Edit order" : "New order"}</h2><p>Customer, food and delivery details</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
        <div className="form-grid">
          <CustomerField value={form.customer_name} customers={customers} onChange={updateCustomerName} onSelect={selectCustomer} />
          <div className={`admin-flat-fields ${flatWarning ? "has-warning" : ""}`}>
            <label><span>Tower</span><select value={flatWing} onChange={(event) => updateFlatWing(event.target.value as BuildingWing)} required={!allowNoWing}><option value="" disabled={!allowNoWing}>{allowNoWing ? "No tower (existing)" : "Choose"}</option>{["A", "B", "C", "D"].map((wing) => <option key={wing} value={wing}>Tower {wing}</option>)}</select></label>
            <label><span>Flat number</span><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={flatDigits} onChange={(event) => updateFlatNumber(event.target.value)} placeholder="For example, 402" aria-invalid={Boolean(flatWarning)} required /></label>
            {flatWarning && <small className="admin-flat-warning">{flatWarning}</small>}
          </div>
          <div className="wide food-picker"><label>Choose dishes</label><div className="food-options">{menuItems.filter((item) => item.is_active).map((item) => { const selected = orderLines.find((line) => line.menu_item_id === item.id); return <button type="button" key={item.id} className={selected ? "selected" : ""} onClick={() => selectFood(item)}>{item.photo_url ? <img src={item.photo_url} alt="" /> : <span><ChefHat /></span>}<b>{item.name}</b><small>{item.price ? `${money(Number(item.daily?.special_price ?? item.price))} / ${item.unit_label || "portion"}` : ""}</small>{selected && <em>{selected.quantity}×</em>}</button>; })}</div></div>
          <div className="wide admin-order-lines"><span className="admin-order-lines-title">Dish quantities</span>{orderLines.length ? orderLines.map((line) => <article key={line.menu_item_id}><span><b>{line.item_name}</b><small>{money(line.unit_price)} / {line.unit_label}</small></span><div className="admin-line-quantity"><button type="button" aria-label={`Decrease ${line.item_name} quantity`} onClick={() => applyOrderLines(orderLines.map((entry) => entry.menu_item_id === line.menu_item_id ? { ...entry, quantity: entry.quantity - 1 } : entry))}><Minus /></button><b>{line.quantity}</b><button type="button" aria-label={`Increase ${line.item_name} quantity`} disabled={line.quantity >= 20} onClick={() => applyOrderLines(orderLines.map((entry) => entry.menu_item_id === line.menu_item_id ? { ...entry, quantity: entry.quantity + 1 } : entry))}><Plus /></button></div><strong>{money(line.unit_price * line.quantity)}</strong><button type="button" aria-label={`Remove ${line.item_name}`} className="remove-order-line" onClick={() => applyOrderLines(orderLines.filter((entry) => entry.menu_item_id !== line.menu_item_id))}><X /></button></article>) : <p>Tap a dish above to add it, then set the quantity here.</p>}</div>
          <Field label="Order summary" value={form.order_details} onChange={(v) => set("order_details", v)} wide />
          <TimeField value={form.delivery_time || ""} onChange={(v) => set("delivery_time", v)} />
          <Field label="Amount (₹)" type="number" value={String(form.amount)} onChange={(v) => set("amount", Number(v))} />
          <Choice label="Delivered by" options={[["nanny", "Nanny"], ["others", "Others"]]} value={form.delivered_by} onChange={(v) => set("delivered_by", v as DeliveryBy)} />
          {"id" in draft && draft.payment_reference && <div className="wide payment-proof"><ReceiptText size={19} /><span><small>Customer submitted UPI reference</small><b>{draft.payment_reference}</b></span></div>}
          <label className="paid-choice"><input type="checkbox" checked={form.is_paid} onChange={(e) => set("is_paid", e.target.checked)} /><span><Check size={18} /> Payment received</span></label>
          <fieldset className="wide stage-field"><legend>Order stage</legend><div className="stage-choice">{stages.map((s) => <button type="button" className={`${s.color} ${form.stage === s.key ? "selected" : ""}`} key={s.key} onClick={() => set("stage", s.key)}><i />{s.short}</button>)}</div></fieldset>
          <Field label="Remarks / special instructions" value={form.remarks} onChange={(v) => set("remarks", v)} wide textarea />
          <div className="wide quick">{["Less spicy", "No onion", "Extra pickle", "Call before delivery", "Send curd", "No green chilli"].map((t) => <button type="button" key={t} onClick={() => set("remarks", form.remarks ? `${form.remarks}, ${t}` : t)}><Plus size={13} />{t}</button>)}</div>
          <label className="wide photo-upload"><span><Camera size={18} /> Add a temporary order photo <small>Optional</small></span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; setPhoto(file); if (file) setPhotoPreview(URL.createObjectURL(file)); }} /><div className="photo-drop">{photoPreview ? <img src={photoPreview} alt="Selected order" /> : <><Camera /><b>Take photo or choose from phone</b><small>{form.photo_path ? "A photo is attached. A replacement will be compressed automatically." : "Compressed to a tiny 360 px thumbnail and deleted after delivery"}</small></>}</div></label>
        </div>
        <div className="modal-actions">{onDelete && <button type="button" className="delete" onClick={onDelete}><Trash2 size={18} /> Delete order</button>}<span /><button type="button" className="cancel" onClick={onClose}>Cancel</button><button className="save"><Check size={19} /> Save order</button></div>
      </form>
    </div>
  );
}

function PromotionModal({ item, category, categoryDishCount, onClose, onPrepare }: { item: MenuItem; category?: DishCategory; categoryDishCount: number; onClose: () => void; onPrepare: (item: MenuItem, values: PromotionValues) => Promise<PreparedPromotion> }) {
  const [message, setMessage] = useState(item.daily?.promotion_message || `Today’s special: ${item.name}, freshly prepared in our home kitchen.`);
  const [specialPrice, setSpecialPrice] = useState<string>(item.daily?.special_price === null || item.daily?.special_price === undefined ? "" : String(item.daily.special_price));
  const [portions, setPortions] = useState<string>(item.daily?.portions_available === null || item.daily?.portions_available === undefined ? "" : String(item.daily.portions_available));
  const [until, setUntil] = useState(item.daily?.promotion_until || "");
  const [includeCategory, setIncludeCategory] = useState(false);
  const [prepared, setPrepared] = useState<PreparedPromotion | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);

  async function prepare() {
    const parsedPrice = specialPrice === "" ? null : Number(specialPrice);
    const parsedPortions = portions === "" ? null : Number(portions);
    if ((parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) || (parsedPortions !== null && (!Number.isInteger(parsedPortions) || parsedPortions < 0))) {
      setError(true);
      setFeedback("Use a valid positive price and a whole number for portions.");
      return;
    }
    setBusy(true);
    setError(false);
    setFeedback("");
    try {
      const result = await onPrepare(item, {
        message,
        specialPrice: parsedPrice,
        portions: parsedPortions,
        until,
        includeCategory,
      });
      setPrepared(result);
      setFeedback(includeCategory && category ? `Today’s offer is live. ${item.name} will lead the shared page, followed by the other ${category.name} dishes.` : "Today’s offer is live. The shared page will show only this dish before customers continue to order.");
    } catch (reason) {
      setError(true);
      setFeedback(reason instanceof Error ? reason.message : "Could not prepare this promotion.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!prepared) return;
    setError(false);
    try {
      setFeedback(await sharePromotion(prepared));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(true);
      setFeedback(reason instanceof Error ? reason.message : "Could not open the share sheet.");
    }
  }

  return <div className="modal-bg" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal promotion-modal">
    <div className="modal-head"><div><span className="eyebrow">WHATSAPP PROMOTION</span><h2>Promote {item.name}</h2><p>Set today’s offer, then send the photo and direct ordering link.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
    <div className="promotion-preview">{item.photo_url ? <img src={item.photo_url} alt={item.name} /> : <span><ChefHat /></span>}<div><b>{item.name}</b><small>{item.description || "Freshly prepared at Neeru’s Home Kitchen."}</small><strong>{specialPrice ? `${money(Number(specialPrice))} today` : money(item.price)}</strong></div></div>
    <div className="promotion-form">
      <label className="wide"><span>WhatsApp message</span><textarea value={message} maxLength={280} onChange={(event) => { setMessage(event.target.value); setPrepared(null); }} placeholder="What makes this dish special today?" /></label>
      <label><span>Offer price <small>Optional</small></span><input type="number" min="0" value={specialPrice} onChange={(event) => { setSpecialPrice(event.target.value); setPrepared(null); }} placeholder={`Regular ${money(item.price)}`} /></label>
      <label><span>Limited portions <small>Optional</small></span><input type="number" min="0" value={portions} onChange={(event) => { setPortions(event.target.value); setPrepared(null); }} placeholder="For example, 10" /></label>
      <label className="wide"><span>Order before <small>Optional</small></span><input type="time" value={until} onChange={(event) => { setUntil(event.target.value); setPrepared(null); }} /></label>
    </div>
    {category && categoryDishCount > 1 && <label className="share-category-choice"><input type="checkbox" checked={includeCategory} onChange={(event) => { setIncludeCategory(event.target.checked); setPrepared(null); }} /><span><b>Also show the complete {category.name} category</b><small>{item.name} stays large and featured. The other {categoryDishCount - 1} dishes appear below with small photos, details and Add buttons.</small></span></label>}
    <p className="promotion-note"><MessageCircle /> {includeCategory && category ? `The WhatsApp preview features ${item.name}; tapping it opens the complete ${category.name} selection.` : "The WhatsApp preview and shared page feature only this dish."}</p>
    {feedback && <p className={`settings-message ${error ? "error" : "success"}`}>{feedback}</p>}
    {prepared && <a className="promotion-ready-link" href={prepared.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Preview what customers will see</a>}
    <div className="modal-actions promotion-actions"><button type="button" className="cancel" onClick={onClose}>Close</button><span />{prepared ? <button type="button" className="save whatsapp-share-button" onClick={share}><MessageCircle /> Share now</button> : <button type="button" className="save" disabled={busy || !message.trim()} onClick={prepare}><Check /> {busy ? "Preparing…" : "Save offer & prepare"}</button>}</div>
  </section></div>;
}

function CategoryForm({ category, onClose, onSave }: { category: DishCategory | null; onClose: () => void; onSave: (values: Pick<DishCategory, "name" | "description" | "sort_order">, existing?: DishCategory) => void }) {
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [sortOrder, setSortOrder] = useState(category?.sort_order || 0);
  return <div className="modal-bg"><form className="modal category-modal" onSubmit={(event) => { event.preventDefault(); onSave({ name, description, sort_order: sortOrder }, category || undefined); }}>
    <div className="modal-head"><div><span className="eyebrow">DISH CATEGORIES</span><h2>{category ? "Edit category" : "New category"}</h2><p>Use categories for menu sections and complete WhatsApp promotions.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
    <div className="form-grid"><Field label="Category name" value={name} onChange={setName} autoFocus /><Field label="Display order" value={String(sortOrder)} onChange={(value) => setSortOrder(Number(value))} type="number" /><Field label="Category note" value={description} onChange={setDescription} wide textarea /></div>
    <div className="modal-actions"><span /><button type="button" className="cancel" onClick={onClose}>Cancel</button><button className="save"><Check /> {category ? "Save category" : "Create category"}</button></div>
  </form></div>;
}

function CategoryPromotionModal({ category, items, onClose, onPrepare }: { category: DishCategory; items: MenuItem[]; onClose: () => void; onPrepare: (category: DishCategory, values: CategoryPromotionValues) => Promise<PreparedPromotion> }) {
  const [heroId, setHeroId] = useState(items[0]?.id || "");
  const [message, setMessage] = useState(category.description || "Made fresh after you order, so every portion is prepared just for you.");
  const [prepared, setPrepared] = useState<PreparedPromotion | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const hero = items.find((item) => item.id === heroId);
  async function prepare() {
    setBusy(true); setError(false); setFeedback("");
    try {
      const result = await onPrepare(category, { heroId, message });
      setPrepared(result);
      setFeedback("Category menu is ready. The chosen dish will lead the shared page and the other dishes will appear as compact rows.");
    } catch (reason) {
      setError(true); setFeedback(reason instanceof Error ? reason.message : "Could not prepare this category menu.");
    } finally { setBusy(false); }
  }
  async function share() {
    if (!prepared) return;
    try { setError(false); setFeedback(await sharePromotion(prepared)); }
    catch (reason) { if (reason instanceof DOMException && reason.name === "AbortError") return; setError(true); setFeedback(reason instanceof Error ? reason.message : "Could not open the share sheet."); }
  }
  return <div className="modal-bg"><section className="modal category-promotion-modal">
    <div className="modal-head"><div><span className="eyebrow">SHARE CATEGORY MENU</span><h2>{category.name}</h2><p>Choose the large featured dish. Every other dish stays compact and easy to scan.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
    {hero && <div className="promotion-preview">{hero.photo_url ? <img src={hero.photo_url} alt={hero.name} /> : <span><ChefHat /></span>}<div><small>FEATURED DISH</small><b>{hero.name}</b><strong>{money(Number(hero.daily?.special_price ?? hero.price))} / {hero.unit_label || "portion"}</strong></div></div>}
    <label className="category-promotion-message"><span>Menu introduction</span><textarea value={message} onChange={(event) => { setMessage(event.target.value); setPrepared(null); }} /></label>
    <div className="category-hero-list">{items.map((item) => <button type="button" className={item.id === heroId ? "selected" : ""} onClick={() => { setHeroId(item.id); setPrepared(null); }} key={item.id}>{item.photo_url ? <img src={item.photo_url} alt="" /> : <span><ChefHat /></span>}<span><b>{item.name}</b><small>{money(Number(item.daily?.special_price ?? item.price))} / {item.unit_label || "portion"}</small></span><i /></button>)}</div>
    {feedback && <p className={`settings-message ${error ? "error" : "success"}`}>{feedback}</p>}
    {prepared && <a className="promotion-ready-link" href={prepared.url} target="_blank" rel="noreferrer"><ExternalLink /> Preview shared category</a>}
    <div className="modal-actions"><button className="cancel" onClick={onClose}>Close</button><span />{prepared ? <button className="save whatsapp-share-button" onClick={share}><MessageCircle /> Share category</button> : <button className="save" disabled={busy || !heroId || !message.trim()} onClick={prepare}><Check /> {busy ? "Preparing…" : "Prepare category"}</button>}</div>
  </section></div>;
}

function MenuItemForm({ item, categories, onClose, onSave }: { item: MenuItem | null; categories: DishCategory[]; onClose: () => void; onSave: (values: Pick<MenuItem, "name" | "price" | "description" | "spice_level" | "category_id" | "unit_label">, photo?: File, existing?: MenuItem) => void }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price || 0);
  const [description, setDescription] = useState(item?.description || "");
  const [spiceLevel, setSpiceLevel] = useState<MenuItem["spice_level"]>(item?.spice_level || "mild");
  const [categoryId, setCategoryId] = useState(item?.category_id || categories.find((category) => category.slug === "other-dishes")?.id || categories[0]?.id || "");
  const [unitLabel, setUnitLabel] = useState(item?.unit_label || "portion");
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState<string | undefined>(item?.photo_url);
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, price, description, spice_level: spiceLevel, category_id: categoryId || null, unit_label: unitLabel }, photo, item || undefined);
    } finally {
      setSaving(false);
    }
  }
  return <div className="modal-bg"><form className="modal menu-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">DISH CATALOGUE</span><h2>{item ? "Edit dish" : "Add dish"}</h2><p>Save the category, selling unit and customer-facing dish details.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="form-grid"><Field label="Dish name" value={name} onChange={setName} /><Field label="Price (₹)" value={String(price)} onChange={(v) => setPrice(Number(v))} type="number" /><label><span>Category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="" disabled>Choose category</option>{categories.filter((category) => category.is_active || category.id === item?.category_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Field label="Selling unit" value={unitLabel} onChange={setUnitLabel} /><div className="wide field-hint"><Info size={15} /><span>Examples: <b>2 pcs</b>, <b>plate</b>, <b>bowl</b> or <b>500 g</b>. The entered price applies to one of these units.</span></div><Field label="Short description" value={description} onChange={setDescription} wide /><label><span>Spice level</span><select value={spiceLevel} onChange={(event) => setSpiceLevel(event.target.value as MenuItem["spice_level"])}><option value="mild">Mild</option><option value="medium">Medium</option><option value="spicy">Spicy</option></select></label><label className="wide photo-upload"><span><Camera size={18} /> Dish photo</span><input type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; setPhoto(file); if (file) setPreview(URL.createObjectURL(file)); }} /><div className="photo-drop menu-photo-drop">{preview ? <><img src={preview} alt="Selected dish" /><small>{photo ? `${readableBytes(photo.size)} selected · automatically resized and compressed when saved` : "Current dish photo"}</small></> : <><Camera /><b>Take or choose any phone photo</b><small>Large and high-resolution photos are automatically resized to a fast-loading WebP image.</small></>}</div></label></div><div className="modal-actions"><span /><button type="button" className="cancel" onClick={onClose} disabled={saving}>Cancel</button><button className="save" disabled={saving}>{saving ? <span className="loader" /> : item ? <Check size={19} /> : <Plus size={19} />} {saving ? photo ? "Optimizing photo…" : "Saving…" : item ? "Save dish" : "Add dish"}</button></div></form></div>;
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
