export interface Env {
  ASSETS: Fetcher;
}

const LEGACY_API_ORIGIN = "https://neerus-kitchen.netlify.app";

function isHtmlRequest(request: Request) {
  return request.method === "GET" && request.headers.get("accept")?.includes("text/html");
}

function legacyApiRequest(request: Request) {
  const url = new URL(request.url);
  const legacyUrl = new URL(`${url.pathname}${url.search}`, LEGACY_API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  return new Request(legacyUrl, { method: request.method, headers, body: request.body, redirect: "manual" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The first Cloudflare release keeps the already-working Netlify APIs
    // behind the new hostname. The next migration step replaces these routes
    // with Cloudflare R2 and Workers without changing the browser application.
    if (url.pathname.startsWith("/api/")) {
      return fetch(legacyApiRequest(request));
    }

    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return Response.redirect(new URL("/admin.html", url), 302);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || !isHtmlRequest(request)) return asset;
    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  },
};
