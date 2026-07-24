type PagesContext = { env: { PUSH_VAPID_PUBLIC_KEY?: string } };

export const onRequestGet = ({ env }: PagesContext): Response => Response.json({
  publicKey: env.PUSH_VAPID_PUBLIC_KEY || "",
}, {
  headers: { "Cache-Control": "no-store" },
});
