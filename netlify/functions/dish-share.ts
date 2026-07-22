import type { Config } from "@netlify/functions";

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

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const dishSlug = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const safeDecode = (value: string) => {
  try { return decodeURIComponent(value); } catch { return ""; }
};

const indiaDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export default async (request: Request) => {
  const requestUrl = new URL(request.url);
  const legacyId = requestUrl.searchParams.get("id") || "";
  const slug = requestUrl.pathname.startsWith("/d/") ? safeDecode(requestUrl.pathname.slice(3)).replace(/\/+$/, "") : "";
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const origin = requestUrl.origin;
  if ((!/^[0-9a-f-]{36}$/i.test(legacyId) && !/^[a-z0-9-]{1,100}$/.test(slug)) || !supabaseUrl || !supabaseKey) return Response.redirect(origin, 302);

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const menuQuery = legacyId
    ? `id=eq.${encodeURIComponent(legacyId)}&is_active=eq.true&select=id,name,price,description,photo_path&limit=1`
    : "is_active=eq.true&select=id,name,price,description,photo_path&limit=200";
  const menuResponse = await fetch(`${supabaseUrl}/rest/v1/menu_items?${menuQuery}`, { headers });
  if (!menuResponse.ok) return Response.redirect(origin, 302);
  const menuRows = await menuResponse.json() as Array<{ id: string; name: string; price: number; description: string; photo_path: string | null }>;
  const item = legacyId ? menuRows[0] : menuRows.find((candidate) => dishSlug(candidate.name) === slug);
  if (!item) return Response.redirect(origin, 302);
  const dailyResponse = await fetch(`${supabaseUrl}/rest/v1/daily_menu?menu_item_id=eq.${encodeURIComponent(item.id)}&menu_date=eq.${indiaDate()}&select=is_available,is_featured,special_price,portions_available,promotion_message,promotion_until&limit=1`, { headers });
  const dailyRows = dailyResponse.ok ? await dailyResponse.json() as Array<{ is_available: boolean; special_price: number | null; portions_available: number | null; promotion_message: string; promotion_until: string | null }> : [];
  const orderUrl = `${origin}/?dish=${encodeURIComponent(item.id)}`;
  const daily = dailyRows[0];
  const price = Number(daily?.special_price ?? item.price ?? 0);
  const limited = daily?.portions_available === null || daily?.portions_available === undefined ? "" : ` Only ${daily.portions_available} portions available.`;
  const until = daily?.promotion_until ? ` Order before ${daily.promotion_until.slice(0, 5)}.` : "";
  const description = `${daily?.promotion_message || item.description || "Fresh home-style vegetarian food, prepared with care."}${limited}${until}`.trim();
  const imagePath = item.photo_path ? `/api/photos?key=${encodeURIComponent(item.photo_path)}` : starterImages[item.name] || "/neerus-home-kitchen-whatsapp-v5.jpg";
  const imageUrl = new URL(imagePath, origin).toString();
  const title = `${item.name} · ₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)} today`;

  return new Response(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} · Neeru’s Home Kitchen</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Neeru’s Home Kitchen">
    <meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:alt" content="${escapeHtml(item.name)}">
    <meta property="og:url" content="${escapeHtml(requestUrl.toString())}">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(orderUrl)}">
  </head><body><p>Opening <a href="${escapeHtml(orderUrl)}">${escapeHtml(item.name)} at Neeru’s Home Kitchen</a>…</p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
};

export const config: Config = { path: ["/share/dish", "/d/:slug"] };
