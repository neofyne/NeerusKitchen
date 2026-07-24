export const quarterHourMinutes = ["00", "15", "30", "45"] as const;

export function ceilTimeToQuarter(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  const rounded = Math.ceil((hour * 60 + minute) / 15) * 15 % (24 * 60);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

export function formatTime12(value: string) {
  const normalized = ceilTimeToQuarter(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour24) || !Number.isInteger(minute) || hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return "";
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatDeliveryDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

export function promotionTimingLines(deliveryDate: string, deliveryTime: string, cutoffTime: string) {
  const date = formatDeliveryDate(deliveryDate);
  const time = formatTime12(deliveryTime);
  const cutoff = formatTime12(cutoffTime);
  const lines: string[] = [];
  if (date) lines.push(`📅 *Delivery:* ${date}`);
  if (time) lines.push(`🕒 *${date ? "Time" : "Delivery time"}:* ${time}`);
  if (cutoff) lines.push(`⏰ *Order before:* ${cutoff}`);
  return lines;
}

export function composePromotionShareText(text: string, urlValue: string) {
  const url = urlValue.trim();
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = text
    .replace(new RegExp(`(?:\\s*Order here:\\s*)?${escapedUrl}`, "gi"), "")
    .replace(/\n*❤️\s*\*?Neeru\*?\s*$/i, "")
    .trim();
  return `${body}\n\n🛒 *Order now*\n${url}`;
}
