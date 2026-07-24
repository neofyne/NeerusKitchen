type R2ObjectBody = {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
};

type BannerPhotos = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<void>;
};

type Env = {
  BANNER_PHOTOS: BannerPhotos;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

type Context = {
  request: Request;
  env: Env;
};

const LEGACY_API_ORIGIN = "https://neerus-kitchen.netlify.app";
const MAX_BANNER_BYTES = 512 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const BANNER_KEY = /^banner\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i;

function legacyRequest(request: Request) {
  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, LEGACY_API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  return new Request(upstream, { method: request.method, headers, body: request.body, redirect: "manual" });
}

function cors(request: Request) {
  const origin = request.headers.get("origin");
  return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function reply(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(request) });
}

async function isAdmin(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const user = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY } });
  if (!user.ok) return null;
  const profile = await user.json() as { id: string };
  const admin = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  return admin.ok && (await admin.json()) === true ? profile : null;
}

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  // Existing order, menu, and payment photos remain in Netlify Blobs. Only
  // banner images use R2 so this change is safe and does not break old photos.
  const isBannerRequest = key?.startsWith("banner/") || (request.method === "POST" && request.headers.get("content-type")?.includes("multipart/form-data"));
  if (!isBannerRequest) return fetch(legacyRequest(request));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors(request), "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST" } });
  }

  if (request.method === "GET") {
    if (!key || !BANNER_KEY.test(key)) return reply(request, { error: "Photo not found" }, 404);
    const photo = await env.BANNER_PHOTOS.get(key);
    if (!photo) return reply(request, { error: "Photo not found" }, 404);
    const etag = photo.httpEtag;
    const headers = { ...cors(request), "Content-Type": photo.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", ETag: etag };
    if (request.headers.get("if-none-match")?.split(",").map((item) => item.trim()).includes(etag)) return new Response(null, { status: 304, headers });
    return new Response(photo.body, { headers });
  }

  if (request.method === "POST") {
    // Reading formData consumes the request body. Keep a pristine copy for
    // menu, order and payment uploads, which are still stored in Netlify
    // Blobs while banner images live in R2.
    const legacyUpload = request.clone();
    const form = await request.formData();
    const photo = form.get("photo");
    if (form.get("purpose") !== "banner" || !(photo instanceof File)) return fetch(legacyRequest(legacyUpload));
    const admin = await isAdmin(request, env);
    if (!admin) return reply(request, { error: "Family administrator access required" }, 403);
    if (!ALLOWED_TYPES.has(photo.type) || photo.size > MAX_BANNER_BYTES) return reply(request, { error: "Use a JPG, PNG, WebP or HEIC banner under 512 KB" }, 400);
    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const imageKey = `banner/${admin.id}/${crypto.randomUUID()}.${extension}`;
    await env.BANNER_PHOTOS.put(imageKey, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type }, customMetadata: { owner: admin.id, purpose: "banner" } });
    return reply(request, { key: imageKey });
  }

  return fetch(legacyRequest(request));
};
