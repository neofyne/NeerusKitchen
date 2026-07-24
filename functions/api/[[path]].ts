const LEGACY_API_ORIGIN = "https://neerus-kitchen.netlify.app";

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const url = new URL(context.request.url);
  const upstream = new URL(`${url.pathname}${url.search}`, LEGACY_API_ORIGIN);
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  return fetch(new Request(upstream, {
    method: context.request.method,
    headers,
    body: context.request.body,
    redirect: "manual",
  }));
};
