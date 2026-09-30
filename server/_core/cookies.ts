import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(_req: Request): CookieOptions {
  // Preview is public HTTPS even when the upstream request is HTTP. Omitting
  // Domain keeps the __Host- cookie bound to this exact host.
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

export function getCsrfCookieOptions(_req: Request): CookieOptions {
  return { httpOnly: false, path: "/", sameSite: "none", secure: true };
}
