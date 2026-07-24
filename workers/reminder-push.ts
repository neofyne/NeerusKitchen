type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PRIVATE_KEY: string;
  PUSH_VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT?: string;
};

type Subscription = { endpoint: string; p256dh: string; auth: string };

const base64Url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const base64UrlText = (value: string) => base64Url(new TextEncoder().encode(value));
const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

async function vapidAuthorization(endpoint: string, env: Env) {
  const header = base64UrlText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlText(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:neofyne@gmail.com",
  }));
  const privateKey = await crypto.subtle.importKey("raw", fromBase64Url(env.VAPID_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signed))}`;
}

async function supabase(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function removeSubscription(env: Env, endpoint: string) {
  await supabase(env, `admin_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

async function sendEmptyPush(subscription: Subscription, env: Env) {
  const jwt = await vapidAuthorization(subscription.endpoint, env);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.PUSH_VAPID_PUBLIC_KEY}`,
      "Crypto-Key": `p256ecdsa=${env.PUSH_VAPID_PUBLIC_KEY}`,
      TTL: "300",
      Urgency: "high",
    },
  });
  if (response.status === 404 || response.status === 410) await removeSubscription(env, subscription.endpoint);
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Push service returned ${response.status}`);
}

async function sendDueReminders(env: Env) {
  const dueResponse = await supabase(env, "rpc/claim_due_delivery_reminders", { method: "POST", body: "{}" });
  if (!dueResponse.ok) throw new Error(`Could not claim due reminders: ${dueResponse.status}`);
  const due = await dueResponse.json() as unknown[];
  if (!due.length) return;
  const subscriptionResponse = await supabase(env, "admin_push_subscriptions?select=endpoint,p256dh,auth");
  if (!subscriptionResponse.ok) throw new Error(`Could not load phone alerts: ${subscriptionResponse.status}`);
  const subscriptions = await subscriptionResponse.json() as Subscription[];
  await Promise.allSettled(subscriptions.flatMap((subscription) => due.map(() => sendEmptyPush(subscription, env))));
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, context: ExecutionContext) {
    context.waitUntil(sendDueReminders(env));
  },
};
