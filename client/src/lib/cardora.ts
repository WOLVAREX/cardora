import { getCountries } from "libphonenumber-js";

// Fixed original Cardora platform mark, also used as the favicon.
export const CARDORA_MARK = "/cardora-mark.webp";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const COUNTRY_OPTIONS = getCountries()
  .map(code => ({ code, name: regionNames.of(code) ?? code }))
  .filter(item => item.name !== item.code)
  .sort((a, b) => a.name.localeCompare(b.name));

export function flagForCountry(code: string) {
  return String.fromCodePoint(...code.toUpperCase().split("").map(char => 127397 + char.charCodeAt(0)));
}

export function safeShareUrl(canonicalUrl: string, slug: string) {
  try { return new URL(canonicalUrl).toString(); }
  catch { return `${window.location.origin}/c/${slug}`; }
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
