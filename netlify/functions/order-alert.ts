import type { Config } from "@netlify/functions";

type KitchenOrder = {
  id: string;
  customer_name: string;
  flat_number: string;
  order_details: string;
  delivery_time: string | null;
  amount: number;
  remarks: string;
};

const cleanPhone = (value = "") => value.replace(/\D/g, "");
const orderCode = (id: string) => id.slice(0, 8).toUpperCase();
const money = (value: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;

async function getAuthenticatedUser(authorization: string, supabaseUrl: string, supabaseKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabaseKey },
  });
  if (!response.ok) return null;
  return (await response.json()) as { id: string };
}

async function readSingle<T>(url: string, authorization: string, supabaseKey: string) {
  const response = await fetch(url, {
    headers: { Authorization: authorization, apikey: supabaseKey, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as T[];
  return rows[0] || null;
}

function safePublicPhoto(value: unknown, origin: string) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return "";
    if (url.pathname.startsWith("/food/")) return url.toString();
    if (url.pathname === "/api/photos" && (url.searchParams.get("key") || "").startsWith("menu/")) return url.toString();
  } catch {
    // A message without an image is still useful.
  }
  return "";
}

function messageFor(order: KitchenOrder, adminUrl: string, photoUrl: string) {
  const lines = [
    "🍲 *NEW ORDER — Neeru’s Home Kitchen*",
    `Order: #${orderCode(order.id)}`,
    `Customer: ${order.customer_name}`,
    `Flat: ${order.flat_number}`,
    `Items: ${order.order_details}`,
    `Amount: ${money(Number(order.amount))}`,
    `Delivery: ${order.delivery_time?.slice(0, 5) || "Not specified"}`,
  ];
  if (order.remarks?.trim()) lines.push(`Instructions: ${order.remarks.trim()}`);
  lines.push(`Open admin: ${adminUrl}`);
  if (photoUrl) lines.push(`Dish photo: ${photoUrl}`);
  return lines.join("\n");
}

async function sendBusinessAlert(recipient: string, message: string, photoUrl: string, order: KitchenOrder) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return { configured: false, sent: false };

  const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION || "v24.0";
  const templateName = process.env.WHATSAPP_ORDER_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE || "en";
  let payload: Record<string, unknown>;

  if (templateName) {
    const components: Record<string, unknown>[] = [];
    if (photoUrl && process.env.WHATSAPP_ORDER_TEMPLATE_HAS_IMAGE === "true") {
      components.push({ type: "header", parameters: [{ type: "image", image: { link: photoUrl } }] });
    }
    components.push({
      type: "body",
      parameters: [
        orderCode(order.id),
        order.customer_name,
        order.flat_number,
        order.order_details,
        money(Number(order.amount)),
        order.delivery_time?.slice(0, 5) || "Not specified",
      ].map((text) => ({ type: "text", text })),
    });
    payload = { messaging_product: "whatsapp", to: recipient, type: "template", template: { name: templateName, language: { code: templateLanguage }, components } };
  } else if (photoUrl) {
    payload = { messaging_product: "whatsapp", to: recipient, type: "image", image: { link: photoUrl, caption: message } };
  } else {
    payload = { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: message, preview_url: true } };
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { configured: true, sent: response.ok };
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

  const authorization = request.headers.get("authorization") || "";
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!authorization.startsWith("Bearer ") || !supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Sign in before sending an order alert." }, { status: 401 });
  }

  const user = await getAuthenticatedUser(authorization, supabaseUrl, supabaseKey);
  if (!user) return Response.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { orderId?: string; photoUrl?: string };
  if (!body.orderId || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
    return Response.json({ error: "A valid order is required." }, { status: 400 });
  }

  const query = new URLSearchParams({
    id: `eq.${body.orderId}`,
    customer_id: `eq.${user.id}`,
    select: "id,customer_name,flat_number,order_details,delivery_time,amount,remarks",
    limit: "1",
  });
  const order = await readSingle<KitchenOrder>(`${supabaseUrl}/rest/v1/orders?${query}`, authorization, supabaseKey);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const settings = await readSingle<{ whatsapp_number: string }>(
    `${supabaseUrl}/rest/v1/storefront_settings?id=eq.1&select=whatsapp_number&limit=1`,
    authorization,
    supabaseKey,
  );
  const recipient = cleanPhone(settings?.whatsapp_number);
  if (!recipient) return Response.json({ automatic: false, whatsappUrl: "", status: "no_recipient" });

  const origin = new URL(request.url).origin;
  const photoUrl = safePublicPhoto(body.photoUrl, origin);
  const message = messageFor(order, `${origin}/admin`, photoUrl);
  const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
  const delivery = await sendBusinessAlert(recipient, message, photoUrl, order).catch(() => ({ configured: true, sent: false }));

  return Response.json({
    automatic: delivery.sent,
    whatsappUrl,
    status: delivery.sent ? "sent" : delivery.configured ? "business_api_failed" : "tap_to_send",
    includesPhoto: Boolean(photoUrl),
  });
};

export const config: Config = { path: "/api/order-alert" };
