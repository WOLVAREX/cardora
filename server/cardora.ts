import { createHash } from "node:crypto";
import { getCountries, parsePhoneNumberFromString } from "libphonenumber-js";

const supportedCountryCodes = new Set<string>(getCountries());

export class CardoraValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardoraValidationError";
  }
}

export function normalizePhone(raw: string): { phoneE164: string; countryCode: string } {
  const phone = parsePhoneNumberFromString(raw.trim());
  if (!phone || !phone.isValid() || !phone.country) {
    throw new CardoraValidationError("Enter a valid international phone number, including its country calling code.");
  }
  return { phoneE164: phone.number, countryCode: phone.country.toUpperCase() };
}

export function isCountryAllowed(countryCode: string, allowedCountryCodes: string[]) {
  return allowedCountryCodes.includes(countryCode.toUpperCase());
}

export function isSupportedCountryCode(countryCode: string) {
  return supportedCountryCodes.has(countryCode);
}

export function isKenyaSmsEligible(profile: {
  phoneE164: string | null;
  phoneCountryCode: string | null;
  phoneVerifiedAt: Date | null;
}) {
  return Boolean(
    profile.phoneVerifiedAt &&
    profile.phoneCountryCode?.toUpperCase() === "KE" &&
    profile.phoneE164?.startsWith("+254"),
  );
}

export function normalizeSlug(raw: string) {
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (slug.length < 3) throw new CardoraValidationError("Choose a link name with at least 3 letters or numbers.");
  return slug;
}

function escapeVcf(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function buildVcf(people: Array<{ name: string; phoneE164: string; email: string | null }>) {
  const cards = people.map(person => [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVcf(person.name)}`,
    `TEL;TYPE=CELL:${escapeVcf(person.phoneE164)}`,
    ...(person.email ? [`EMAIL;TYPE=INTERNET:${escapeVcf(person.email)}`] : []),
    "END:VCARD",
  ].join("\r\n"));
  return cards.length ? `${cards.join("\r\n")}\r\n` : "";
}

export type CampaignReviewRecipient = { id: number; name: string; destination: string };

export function campaignRecipientSnapshotHash(
  channel: "email" | "sms",
  subject: string,
  message: string,
  recipients: CampaignReviewRecipient[],
) {
  const exactSet = [...recipients]
    .map(person => ({ id: person.id, name: person.name, destination: person.destination }))
    .sort((a, b) => a.id - b.id);
  return createHash("sha256")
    .update(JSON.stringify({ version: 1, channel, subject, message, recipients: exactSet }))
    .digest("hex");
}

export function campaignReviewHash(input: {
  campaignId: number;
  collectionId: number;
  channel: "email" | "sms";
  subject: string;
  message: string;
  recipientSnapshotHash: string;
}) {
  return createHash("sha256").update(JSON.stringify({ version: 1, ...input })).digest("hex");
}

function normalizedPublicOrigin(raw: string) {
  try {
    const url = new URL(raw.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function validateCanonicalShareUrl(input: {
  canonicalUrl: string;
  slug: string;
  requestOrigin?: string | null;
  configuredOrigins?: string;
}) {
  let share: URL;
  try {
    share = new URL(input.canonicalUrl);
  } catch {
    throw new CardoraValidationError("Enter a valid canonical share URL.");
  }
  if (share.username || share.password || share.search || share.hash) {
    throw new CardoraValidationError("The canonical share URL cannot include credentials, a query, or a fragment.");
  }
  if (share.pathname.replace(/\/+$/, "") !== `/c/${input.slug}`) {
    throw new CardoraValidationError("The share URL must use this collection's /c/<link-name> path.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(share.hostname);
  if (share.protocol !== "https:" && !(local && share.protocol === "http:")) {
    throw new CardoraValidationError("Use an HTTPS Cardora share URL.");
  }
  const allowed = new Set<string>();
  const requestOrigin = input.requestOrigin ? normalizedPublicOrigin(input.requestOrigin) : null;
  if (requestOrigin) allowed.add(requestOrigin);
  for (const origin of (input.configuredOrigins ?? "").split(",")) {
    const normalized = normalizedPublicOrigin(origin);
    if (normalized) allowed.add(normalized);
  }
  if (!allowed.has(share.origin.toLowerCase())) {
    throw new CardoraValidationError("This host is not configured to serve Cardora links. Use this site's URL or add the exact HTTPS origin to CARDORA_PUBLIC_ORIGINS on the server.");
  }
  return share.toString();
}
