import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

const STORE_NAME = "neeru-private-photos";
const MAX_PHOTO_SIZE = 6 * 1024 * 1024;
const MAX_ORDER_PHOTO_SIZE = 160 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const VALID_PRIVATE_KEY = /^(orders|menu)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i;

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

  if (request.method === "POST") {
    const user = await getAuthenticatedUser(request);
    if (!user || !(await isFamilyAdmin(request))) {
      return Response.json({ error: "Family administrator access required" }, { status: 403 });
    }
    const form = await request.formData();
    const photo = form.get("photo");
    const purpose = form.get("purpose");
    if (!(photo instanceof File) || (purpose !== "orders" && purpose !== "menu" && purpose !== "payment")) {
      return Response.json({ error: "A valid photo and purpose are required" }, { status: 400 });
    }
    const maximumSize = purpose === "orders" ? MAX_ORDER_PHOTO_SIZE : MAX_PHOTO_SIZE;
    if (!ALLOWED_TYPES.has(photo.type) || photo.size > maximumSize) {
      const limit = purpose === "orders" ? "160 KB (order photos are compressed on your phone)" : "6 MB";
      return Response.json({ error: `Use a JPG, PNG, WebP or HEIC image under ${limit}` }, { status: 400 });
    }

    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const key = purpose === "payment" ? "payment/current" : `${purpose}/${user.id}/${crypto.randomUUID()}.${extension}`;
    await store.set(key, photo, {
      metadata: { contentType: photo.type, owner: user.id, createdAt: new Date().toISOString(), bytes: photo.size, purpose },
      ...(purpose === "payment" ? {} : { onlyIfNew: true }),
    });
    return Response.json({ key });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      if (!(await isFamilyAdmin(request))) {
        return Response.json({ error: "Family administrator access required" }, { status: 403 });
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
      return Response.json({ orders: summarize("orders/"), menu: summarize("menu/"), payment: summarize("payment/") });
    }

    const key = url.searchParams.get("key");
    if (!key || (key !== "payment/current" && !VALID_PRIVATE_KEY.test(key))) {
      return Response.json({ error: "Photo not found" }, { status: 404 });
    }
    if (key.startsWith("orders/") && !(await isFamilyAdmin(request))) {
      return Response.json({ error: "Family administrator access required" }, { status: 403 });
    }
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
    if (!entry?.data) return Response.json({ error: "Photo not found" }, { status: 404 });
    const contentType = String(entry.metadata?.contentType || "application/octet-stream");
    return new Response(entry.data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": key === "payment/current" ? "no-store" : "private, max-age=3600",
        ETag: entry.etag,
      },
    });
  }

  if (request.method === "DELETE") {
    if (!(await isFamilyAdmin(request))) {
      return Response.json({ error: "Family administrator access required" }, { status: 403 });
    }
    const key = new URL(request.url).searchParams.get("key");
    if (key) {
      if (key !== "payment/current" && !VALID_PRIVATE_KEY.test(key)) {
        return Response.json({ error: "Photo not found" }, { status: 404 });
      }
      await store.delete(key);
      return Response.json({ removed: 1 });
    }

    const body = await request.json().catch(() => null) as { keys?: unknown } | null;
    if (!Array.isArray(body?.keys) || body.keys.length === 0 || body.keys.length > 500) {
      return Response.json({ error: "Provide between 1 and 500 photo keys" }, { status: 400 });
    }
    const keys = [...new Set(body.keys.filter((value): value is string => typeof value === "string" && VALID_PRIVATE_KEY.test(value)))];
    if (keys.length !== body.keys.length) {
      return Response.json({ error: "One or more photo keys are invalid" }, { status: 400 });
    }
    await Promise.all(keys.map((photoKey) => store.delete(photoKey)));
    return Response.json({ removed: keys.length });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/photos" };
