import type { Request } from "express";
import { CARDORA_SHARE_IMAGE_URL } from "./cardoraSeoConstants";

export type ShareMetadata = { title: string; description: string; canonicalUrl: string } | null;

function attribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function publicRequestFallback(req: Request) {
  // Express' internal host is not the public Preview origin; use this only for the app shell,
  // not to invent a canonical URL. A collection's saved public URL is the source of truth.
  return req.path;
}

export function withCollectionMetadata(html: string, metadata: ShareMetadata) {
  if (!metadata) return html;
  const title = attribute(metadata.title);
  const description = attribute(metadata.description);
  const image = CARDORA_SHARE_IMAGE_URL;
  const canonical = attribute(metadata.canonicalUrl);
  const replacements: Array<[RegExp, string]> = [
    [/<title>[^<]*<\/title>/i, `<title>${title} · Cardora</title>`],
    [/<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="description" content="${description}" />`],
    [/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:title" content="${title}" />`],
    [/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:description" content="${description}" />`],
    [/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:url" content="${canonical}" />`],
    [/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:image" content="${attribute(image)}" />`],
    [/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:title" content="${title}" />`],
    [/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:description" content="${description}" />`],
    [/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:image" content="${attribute(image)}" />`],
  ];
  for (const [pattern, replacement] of replacements) html = html.replace(pattern, replacement);
  return html;
}
