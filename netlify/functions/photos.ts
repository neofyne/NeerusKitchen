import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

const STORE_NAME = "neeru-private-photos";
const MAX_PAYMENT_PHOTO_SIZE = 6 * 1024 * 1024;
const MAX_MENU_PHOTO_SIZE = 512 * 1024;
const MAX_ORDER_PHOTO_SIZE = 160 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const VALID_PRIVATE_KEY = /^(orders|menu)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i;
const ALLOWED_ORIGINS = new Set(["https://neerus-kitchen.netlify.app", "http://127.0.0.1:5174", "http://localhost:5174"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" }
    : {};
}

function json(request: Request, body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { ...corsHeaders(request), ...(init.headers || {}) } });
}

async function deleteAndVerify(store: ReturnType<typeof getStore>, keys: string[]) {
  await Promise.all(keys.map((key) => store.delete(key)));
  const remaining = await Promise.all(keys.map((key) => store.getMetadata(key)));
  if (remaining.some(Boolean)) throw new Error("One or more photos remained after deletion");
}

async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !supabaseKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabaseKey },
  });
  if (!response.ok) return null;
  return (await response.json()) as { id: string };
}

async function isFamilyAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !supabaseKey) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: supabaseKey, "Content-Type": "application/json" },
    body: "{}",
  });
  return response.ok && (await response.json()) === true;
}

export default async (request: Request) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

  if (request.method === "POST") {
    const user = await getAuthenticatedUser(request);
    if (!user || !(await isFamilyAdmin(request))) {
      return json(request, { error: "Family administrator access required" }, { status: 403 });
    }
    const form = await request.formData();
    const photo = form.get("photo");
    const purpose = form.get("purpose");
    if (!(photo instanceof File) || (purpose !== "orders" && purpose !== "menu" && purpose !== "payment")) {
      return json(request, { error: "A valid photo and purpose are required" }, { status: 400 });
    }
    const maximumSize = purpose === "orders" ? MAX_ORDER_PHOTO_SIZE : purpose === "menu" ? MAX_MENU_PHOTO_SIZE : MAX_PAYMENT_PHOTO_SIZE;
    if (!ALLOWED_TYPES.has(photo.type) || photo.size > maximumSize) {
      const limit = purpose === "orders"
        ? "160 KB (order photos are compressed on your phone)"
        : purpose === "menu"
          ? "512 KB (dish photos are compressed automatically before upload)"
          : "6 MB";
      return json(request, { error: `Use a JPG, PNG, WebP or HEIC image under ${limit}` }, { status: 400 });
    }

    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const key = purpose === "payment" ? "payment/current" : `${purpose}/${user.id}/${crypto.randomUUID()}.${extension}`;
    await store.set(key, photo, {
      metadata: { contentType: photo.type, owner: user.id, createdAt: new Date().toISOString(), bytes: photo.size, purpose },
      ...(purpose === "payment" ? {} : { onlyIfNew: true }),
    });
    return json(request, { key });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      if (!(await isFamilyAdmin(request))) {
        return json(request, { error: "Family administrator access required" }, { status: 403 });
      }
      const result = await store.list();
      const entries = await Promise.all(result.blobs.map(async ({ key }) => ({ key, metadata: (await store.getMetadata(key))?.metadata })));
      const summarize = (prefix: string) => {
        const matching = entries.filter(({ key }) => key.startsWith(prefix));
        return {
          count: matching.length,
          knownBytes: matching.reduce((total, entry) => total + Number(entry.metadata?.bytes || 0), 0),
          unknownSizes: matching.filter((entry) => !Number(entry.metadata?.bytes)).length,
        };
      };
      return json(request, { orders: summarize("orders/"), menu: summarize("menu/"), payment: summarize("payment/") });
    }

    const key = url.searchParams.get("key");
    if (!key || (key !== "payment/current" && !VALID_PRIVATE_KEY.test(key))) {
      return json(request, { error: "Photo not found" }, { status: 404 });
    }
    if (key.startsWith("orders/") && !(await isFamilyAdmin(request))) {
      return json(request, { error: "Family administrator access required" }, { status: 403 });
    }
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
    if (!entry?.data) return json(request, { error: "Photo not found" }, { status: 404 });
    const contentType = String(entry.metadata?.contentType || "application/octet-stream");
    const cacheControl = key === "payment/current"
      ? "no-store"
      : key.startsWith("menu/")
        ? "public, max-age=31536000, immutable"
        : "private, max-age=3600";
    const etag = entry.etag.startsWith('"') ? entry.etag : `"${entry.etag}"`;
    const responseHeaders = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      ETag: etag,
      ...corsHeaders(request),
    };
    if (key.startsWith("menu/") && request.headers.get("if-none-match")?.split(",").map((value) => value.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers: responseHeaders });
    }
    return new Response(entry.data, {
      headers: responseHeaders,
    });
  }

  if (request.method === "DELETE") {
    if (!(await isFamilyAdmin(request))) {
      return json(request, { error: "Family administrator access required" }, { status: 403 });
    }
    const key = new URL(request.url).searchParams.get("key");
    if (key) {
      if (key !== "payment/current" && !VALID_PRIVATE_KEY.test(key)) {
        return json(request, { error: "Photo not found" }, { status: 404 });
      }
      try {
        await deleteAndVerify(store, [key]);
        return json(request, { removed: 1, verified: true });
      } catch {
        return json(request, { error: "The photo could not be verified as deleted" }, { status: 500 });
      }
    }

    const body = await request.json().catch(() => null) as { keys?: unknown } | null;
    if (!Array.isArray(body?.keys) || body.keys.length === 0 || body.keys.length > 500) {
      return json(request, { error: "Provide between 1 and 500 photo keys" }, { status: 400 });
    }
    const keys = [...new Set(body.keys.filter((value): value is string => typeof value === "string" && VALID_PRIVATE_KEY.test(value)))];
    if (keys.length !== body.keys.length) {
      return json(request, { error: "One or more photo keys are invalid" }, { status: 400 });
    }
    try {
      await deleteAndVerify(store, keys);
      return json(request, { removed: keys.length, verified: true });
    } catch {
      return json(request, { error: "One or more photos could not be verified as deleted" }, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/photos" };
