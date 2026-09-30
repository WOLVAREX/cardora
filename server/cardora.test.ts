import { describe, expect, it } from "vitest";
import {
  buildVcf,
  campaignRecipientSnapshotHash,
  campaignReviewHash,
  CardoraValidationError,
  isCountryAllowed,
  isKenyaSmsEligible,
  isSupportedCountryCode,
  normalizePhone,
  normalizeSlug,
  validateCanonicalShareUrl,
} from "./cardora";
import { CARDORA_SHARE_IMAGE_URL } from "./cardoraSeoConstants";
import { withCollectionMetadata } from "./cardoraSeo";

describe("Cardora contact rules", () => {
  it("normalizes international numbers and derives eligibility from the calling code", () => {
    expect(normalizePhone("+254 712 345 678")).toEqual({ phoneE164: "+254712345678", countryCode: "KE" });
    expect(isCountryAllowed("ke", ["KE", "UG"])).toBe(true);
    expect(isCountryAllowed("UG", ["KE"])).toBe(false);
    expect(isSupportedCountryCode("KE")).toBe(true);
    expect(isSupportedCountryCode("ZZ")).toBe(false);
  });

  it("rejects national-only phone entries without a country code", () => {
    expect(() => normalizePhone("0712 345 678")).toThrow(CardoraValidationError);
  });

  it("only exposes owner SMS eligibility for a verified Kenyan +254 number", () => {
    const verifiedKenyan = { phoneE164: "+254712345678", phoneCountryCode: "KE", phoneVerifiedAt: new Date() };
    expect(isKenyaSmsEligible(verifiedKenyan)).toBe(true);
    expect(isKenyaSmsEligible({ ...verifiedKenyan, phoneVerifiedAt: null })).toBe(false);
    expect(isKenyaSmsEligible({ ...verifiedKenyan, phoneCountryCode: "UG" })).toBe(false);
  });

  it("normalizes link names and rejects names too short to share", () => {
    expect(normalizeSlug("São Paulo Guests")).toBe("sao-paulo-guests");
    expect(() => normalizeSlug("x!")).toThrow(CardoraValidationError);
  });

  it("creates escaped vCard 3.0 entries without leaking opted-out email addresses", () => {
    const vcf = buildVcf([
      { name: "Amina, Otieno\nFriends", phoneE164: "+254712345678", email: "amina@example.com" },
      { name: "No Email", phoneE164: "+254700000000", email: null },
      { name: "Bare\rCarriage Return", phoneE164: "+254711111111", email: null },
    ]);
    expect(vcf).toContain("VERSION:3.0\r\nFN:Amina\\, Otieno\\nFriends\r\nTEL;TYPE=CELL:+254712345678");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:amina@example.com");
    expect(vcf).toContain("FN:No Email\r\nTEL;TYPE=CELL:+254700000000\r\nEND:VCARD");
    expect(vcf).toContain("FN:Bare\\nCarriage Return\r\nTEL;TYPE=CELL:+254711111111");
    expect(buildVcf([])).toBe("");
  });
});

describe("collection share metadata", () => {
  const shell = [
    "<html><head>",
    "<title>Default</title>",
    '<meta name="description" content="Default description" />',
    '<meta property="og:title" content="Default title" />',
    '<meta property="og:description" content="Default description" />',
    '<meta property="og:url" content="/" />',
    '<meta property="og:image" content="/default.webp" />',
    '<meta name="twitter:title" content="Default title" />',
    '<meta name="twitter:description" content="Default description" />',
    '<meta name="twitter:image" content="/default.webp" />',
    "</head></html>",
  ].join("\n");

  it("renders user metadata and the fixed Cardora image with HTML escaping", () => {
    const html = withCollectionMetadata(shell, {
      title: 'A & "great" <group>',
      description: "R&D for friends & family",
      canonicalUrl: "https://customer-domain.example/c/friends",
    });
    expect(html).toContain("A &amp; &quot;great&quot; &lt;group&gt; · Cardora");
    expect(html).toContain('property="og:url" content="https://customer-domain.example/c/friends"');
    expect(html).toContain(`property="og:image" content="${CARDORA_SHARE_IMAGE_URL}"`);
    expect(html).toContain(`name="twitter:image" content="${CARDORA_SHARE_IMAGE_URL}"`);
    expect(html).toContain('name="twitter:description" content="R&amp;D for friends &amp; family"');
  });

  it("leaves the default shell intact when there is no collection", () => {
    expect(withCollectionMetadata(shell, null)).toBe(shell);
  });
});

describe("trusted canonical Cardora URLs", () => {
  it("accepts the current public origin and explicitly configured Cardora origins", () => {
    expect(validateCanonicalShareUrl({ canonicalUrl: "https://cardora.example/c/friends", slug: "friends", requestOrigin: "https://cardora.example" }))
      .toBe("https://cardora.example/c/friends");
    expect(validateCanonicalShareUrl({ canonicalUrl: "https://custom.example/c/friends", slug: "friends", requestOrigin: "https://cardora.example", configuredOrigins: "https://custom.example" }))
      .toBe("https://custom.example/c/friends");
  });

  it("rejects unrelated hosts, a mismatched path, query strings and insecure public hosts", () => {
    const input = { slug: "friends", requestOrigin: "https://cardora.example" };
    expect(() => validateCanonicalShareUrl({ ...input, canonicalUrl: "https://unrelated.example/c/friends" })).toThrow(/not configured/);
    expect(() => validateCanonicalShareUrl({ ...input, canonicalUrl: "https://cardora.example/c/other" })).toThrow(/path/);
    expect(() => validateCanonicalShareUrl({ ...input, canonicalUrl: "https://cardora.example/c/friends?next=elsewhere" })).toThrow(/query/);
    expect(() => validateCanonicalShareUrl({ ...input, canonicalUrl: "http://unrelated.example/c/friends" })).toThrow(/HTTPS/);
  });
});

describe("snapshot-bound campaign confirmation", () => {
  const recipients = [
    { id: 12, name: "Amina", destination: "amina@example.com" },
    { id: 18, name: "Brian", destination: "+254712345678" },
  ];

  it("hashes an exact recipient set independently of query order", () => {
    expect(campaignRecipientSnapshotHash("email", "Update", "Hello", recipients))
      .toBe(campaignRecipientSnapshotHash("email", "Update", "Hello", [...recipients].reverse()));
    expect(campaignRecipientSnapshotHash("email", "Update", "Hello", recipients))
      .not.toBe(campaignRecipientSnapshotHash("email", "Update", "Hello", [recipients[0]]));
    expect(campaignRecipientSnapshotHash("email", "Update", "Hello", recipients))
      .not.toBe(campaignRecipientSnapshotHash("email", "Changed", "Hello", recipients));
  });

  it("binds an explicit confirmation to the stored campaign and snapshot", () => {
    const snapshot = campaignRecipientSnapshotHash("email", "Update", "Hello", recipients);
    const review = { campaignId: 31, collectionId: 7, channel: "email" as const, subject: "Update", message: "Hello", recipientSnapshotHash: snapshot };
    expect(campaignReviewHash(review)).toBe(campaignReviewHash(review));
    expect(campaignReviewHash(review)).not.toBe(campaignReviewHash({ ...review, campaignId: 32 }));
    expect(campaignReviewHash(review)).not.toBe(campaignReviewHash({ ...review, recipientSnapshotHash: "0".repeat(64) }));
  });
});
