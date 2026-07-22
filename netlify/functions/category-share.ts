import type { Config } from "@netlify/functions";

const starterImages: Record<string, string> = {
  "Aloo Parantha": "/food/aloo-paratha.jpg",
  "Aloo paratha": "/food/aloo-paratha.jpg",
  "Veg sandwich": "/food/veg-sandwich.jpg",
  "Paneer sandwich": "/food/paneer-sandwich.jpg",
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const slugify = (value: string) => value.toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return ""; } };
const indiaDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export default async (request: Request) => {
  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname.match(/^\/c\/([^/]+)\/([^/]+)\/?$/);
  const categorySlug = path?.[1] ? safeDecode(path[1]) : "";
  const heroSlug = path?.[2] ? safeDecode(path[2]) : "";
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const origin = requestUrl.origin;
  if (!/^[a-z0-9-]{1,100}$/.test(categorySlug) || !/^[a-z0-9-]{1,100}$/.test(heroSlug) || !supabaseUrl || !supabaseKey) return Response.redirect(origin, 302);
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const categoryResponse = await fetch(`${supabaseUrl}/rest/v1/dish_categories?slug=eq.${encodeURIComponent(categorySlug)}&is_active=eq.true&select=id,name,slug,description&limit=1`, { headers });
  if (!categoryResponse.ok) return Response.redirect(origin, 302);
  const categories = await categoryResponse.json() as Array<{ id: string; name: string; slug: string; description: string }>;
  const category = categories[0];
  if (!category) return Response.redirect(origin, 302);
  const menuResponse = await fetch(`${supabaseUrl}/rest/v1/menu_items?category_id=eq.${encodeURIComponent(category.id)}&is_active=eq.true&select=id,name,price,description,photo_path,unit_label&limit=200`, { headers });
  if (!menuResponse.ok) return Response.redirect(origin, 302);
  const items = await menuResponse.json() as Array<{ id: string; name: string; price: number; description: string; photo_path: string | null; unit_label: string }>;
  const hero = items.find((item) => slugify(item.name) === heroSlug) || items[0];
  if (!hero) return Response.redirect(origin, 302);
  const dailyResponse = await fetch(`${supabaseUrl}/rest/v1/daily_menu?menu_item_id=eq.${encodeURIComponent(hero.id)}&menu_date=eq.${indiaDate()}&select=special_price,promotion_message&limit=1`, { headers });
  const daily = dailyResponse.ok ? (await dailyResponse.json() as Array<{ special_price: number | null; promotion_message: string }>)[0] : undefined;
  const price = Number(daily?.special_price ?? hero.price ?? 0);
  const imagePath = hero.photo_path ? `/api/photos?key=${encodeURIComponent(hero.photo_path)}` : starterImages[hero.name] || "/neerus-home-kitchen-whatsapp-v5.jpg";
  const imageUrl = new URL(imagePath, origin).toString();
  const title = `${category.name} Menu · ${hero.name} featured`;
  const description = `${daily?.promotion_message || category.description || "Fresh home-style vegetarian dishes, made after you order."} ${items.length} dishes available from ₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.min(...items.map((item) => Number(item.price))))}.`;
  const orderUrl = `${origin}/?category=${encodeURIComponent(category.slug)}&hero=${encodeURIComponent(heroSlug)}`;
  return new Response(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} · Neeru’s Home Kitchen</title><meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Neeru’s Home Kitchen">
    <meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:alt" content="${escapeHtml(hero.name)}">
    <meta property="og:url" content="${escapeHtml(requestUrl.toString())}">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(orderUrl)}">
  </head><body><p>Opening <a href="${escapeHtml(orderUrl)}">${escapeHtml(category.name)} at Neeru’s Home Kitchen</a>…</p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
};

export const config: Config = { path: "/c/:category/:hero" };
