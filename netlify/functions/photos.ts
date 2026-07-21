import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

const STORE_NAME = "neeru-private-photos";
const MAX_PHOTO_SIZE = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

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
    if (!(photo instanceof File) || (purpose !== "orders" && purpose !== "menu")) {
      return Response.json({ error: "A valid photo and purpose are required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(photo.type) || photo.size > MAX_PHOTO_SIZE) {
      return Response.json({ error: "Use a JPG, PNG, WebP or HEIC image under 6 MB" }, { status: 400 });
    }

    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const key = `${purpose}/${user.id}/${crypto.randomUUID()}.${extension}`;
    await store.set(key, photo, {
      metadata: { contentType: photo.type, owner: user.id, createdAt: new Date().toISOString() },
      onlyIfNew: true,
    });
    return Response.json({ key });
  }

  if (request.method === "GET") {
    const key = new URL(request.url).searchParams.get("key");
    const validKey = /^(orders|menu)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i;
    if (!key || !validKey.test(key)) {
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
        "Cache-Control": "private, max-age=3600",
        ETag: entry.etag,
      },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config: Config = { path: "/api/photos" };
