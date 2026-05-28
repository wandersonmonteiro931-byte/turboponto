import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function detectIp(): string | null {
  try {
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || null;
    const real = getRequestHeader("x-real-ip");
    if (real) return real.trim();
    const ip = getRequestIP({ xForwardedFor: true });
    return ip ?? null;
  } catch {
    return null;
  }
}

export const getMeuIp = createServerFn({ method: "GET" }).handler(async () => {
  return { ip: detectIp() };
});
