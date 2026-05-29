import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end > 0) ip = ip.slice(1, end);
  } else if ((ip.match(/:/g) ?? []).length === 1) {
    ip = ip.split(":")[0];
  }
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip || null;
}

function detectIp(): string | null {
  try {
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return normalizeIp(cf);
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return normalizeIp(xff.split(",")[0]);
    const real = getRequestHeader("x-real-ip");
    if (real) return normalizeIp(real);
    const ip = getRequestIP({ xForwardedFor: true });
    return normalizeIp(ip);
  } catch {
    return null;
  }
}

export const getMeuIp = createServerFn({ method: "GET" }).handler(async () => {
  return { ip: detectIp() };
});
