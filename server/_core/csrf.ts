import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { CSRF_COOKIE_NAME } from "@shared/const";
import { getCsrfCookieOptions } from "./cookies";

export function csrfTokenMatches(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken || cookieToken.length !== 43 || headerToken.length !== 43) return false;
  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
}

export function requestHasValidCsrf(req: Request): boolean {
  const cookieToken = parseCookieHeader(req.headers.cookie ?? "")[CSRF_COOKIE_NAME];
  const header = req.headers["x-cardora-csrf"];
  const headerToken = typeof header === "string" ? header : undefined;
  return csrfTokenMatches(cookieToken, headerToken);
}

export function registerCsrfRoute(app: Express) {
  app.get("/api/auth/csrf", (req: Request, res: Response) => {
    let token = parseCookieHeader(req.headers.cookie ?? "")[CSRF_COOKIE_NAME];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      token = randomBytes(32).toString("base64url");
      res.cookie(CSRF_COOKIE_NAME, token, { ...getCsrfCookieOptions(req), maxAge: 24 * 60 * 60 * 1000 });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ token });
  });
}
