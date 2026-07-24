import { supabase } from "./supabase";

export type PhonePushStatus = "checking" | "ready" | "enabled" | "blocked" | "unsupported" | "setup-required";

const vapidKeyFromBuild = String(import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY || "").trim();

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer | null) {
  if (!value) return "";
  const binary = String.fromCharCode(...new Uint8Array(value));
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function vapidPublicKey() {
  if (vapidKeyFromBuild) return vapidKeyFromBuild;
  const response = await fetch("/api/push/config", { cache: "no-store" });
  if (!response.ok) return "";
  const value = await response.json().catch(() => ({})) as { publicKey?: string };
  return String(value.publicKey || "").trim();
}

async function serviceWorkerRegistration() {
  return navigator.serviceWorker.register("/admin-sw.js", { scope: "/" });
}

export async function getPhonePushStatus(): Promise<PhonePushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (!(await vapidPublicKey())) return "setup-required";
  const registration = await serviceWorkerRegistration();
  return (await registration.pushManager.getSubscription()) ? "enabled" : "ready";
}

export async function enablePhonePush(userId: string) {
  if (!supabase) throw new Error("The shared database is not connected.");
  if (!pushSupported()) throw new Error("This browser does not support phone notifications. Use Safari on an installed iPhone app, or Chrome on Android.");
  const publicKey = await vapidPublicKey();
  if (!publicKey) throw new Error("Phone alerts still need their secure push key. Finish the push setup before turning this on.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are off for this browser. Allow notifications in your phone or browser settings, then try again.");
  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlBytes(publicKey) });
  const { error } = await supabase.from("admin_push_subscriptions").upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: bytesToBase64Url(subscription.getKey("p256dh")),
    auth: bytesToBase64Url(subscription.getKey("auth")),
    user_agent: navigator.userAgent,
  }, { onConflict: "endpoint" });
  if (error) throw new Error(`Could not save this phone for alerts: ${error.message}`);
}

export async function disablePhonePush() {
  if (!supabase || !pushSupported()) return;
  const registration = await serviceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const { error } = await supabase.from("admin_push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(`This phone was unsubscribed, but could not be removed from the kitchen alerts list: ${error.message}`);
}
