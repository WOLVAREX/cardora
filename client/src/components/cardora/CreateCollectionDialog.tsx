import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Globe2, Link2, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CountryPicker } from "./CountryPicker";
import { BrandMark } from "./Brand";
import { trpc } from "@/lib/trpc";

export function CreateCollectionDialog({ onCreated, remainingCollections, maxContactLimit = 100000, onPlanClick }: { onCreated?: () => void; remainingCollections?: number; maxContactLimit?: number; onPlanClick?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("New contact list");
  const [description, setDescription] = useState("A simple way to collect and keep everyone’s contact details together.");
  const [slug, setSlug] = useState(() => `contact-list-${Math.random().toString(36).slice(2, 7)}`);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [customUrl, setCustomUrl] = useState(false);
  const [countries, setCountries] = useState<string[]>(["KE"]);
  const [limit, setLimit] = useState("50");
  const utils = trpc.useUtils();
  const atLinkLimit = remainingCollections !== undefined && remainingCollections <= 0;

  useEffect(() => {
    if (open && !customUrl && typeof window !== "undefined") setCanonicalUrl(`${window.location.origin}/c/${slug}`);
  }, [open, slug, customUrl]);
  useEffect(() => {
    if (Number(limit) > maxContactLimit) setLimit(String(maxContactLimit));
  }, [limit, maxContactLimit]);

  const create = trpc.cardora.collection.create.useMutation({
    onSuccess: async () => {
      await utils.cardora.dashboard.invalidate();
      toast.success("Your Cardora link is ready to share.");
      onCreated?.();
      setOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  function makeSlug(value: string) {
    return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!countries.length) { toast.error("Select at least one allowed country."); return; }
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxContactLimit) { toast.error(`Set a contact limit between 1 and ${maxContactLimit.toLocaleString()}.`); return; }
    try {
      await create.mutateAsync({ title: title.trim(), description: description.trim(), slug, canonicalUrl, allowedCountryCodes: countries, contactLimit: parsedLimit });
    } catch { /* mutation feedback is shown by tRPC */ }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="primary-button" disabled={atLinkLimit} title={atLinkLimit ? "Your current plan's collection-link limit has been reached." : undefined}>{atLinkLimit ? <Check size={17} /> : <Plus size={17} />}{atLinkLimit ? "Link limit reached" : "New collection"}</Button>
      </DialogTrigger>
      <DialogContent className="collection-dialog sm:max-w-[900px]" showCloseButton={false}>
        <div className="collection-dialog-header">
          <DialogHeader>
            <div className="dialog-eyebrow"><Sparkles size={13} /> CREATE A COLLECTION</div>
            <DialogTitle className="dialog-title">Bring your people together.</DialogTitle>
            <DialogDescription className="dialog-description">Choose who can add their details, set a firm limit, then share one link anywhere.</DialogDescription>
          </DialogHeader>
          <DialogClose asChild><button type="button" className="collection-dialog-close" aria-label="Close collection creation dialog"><X size={18} /></button></DialogClose>
        </div>
        <form onSubmit={submit} className="create-grid">
          <div className="create-fields">
            <div className="field-block">
              <label className="field-label" htmlFor="collection-title">Collection name</label>
              <Input id="collection-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required />
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="collection-description">Link description</label>
              <Textarea id="collection-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} required />
              <div className="character-count">{description.length}/500 <span>Used in WhatsApp, Telegram and X previews.</span></div>
            </div>
            <div className="metadata-grid">
              <div className="field-block">
                <label className="field-label" htmlFor="collection-slug">Share link name</label>
                <div className="input-with-icon"><Link2 size={15} /><Input id="collection-slug" value={slug} onChange={event => { setSlug(makeSlug(event.target.value)); setCustomUrl(false); }} required minLength={3} maxLength={80} /></div>
              </div>
              <div className="field-block">
                <label className="field-label" htmlFor="contact-limit">Contact limit</label>
                <Input id="contact-limit" type="number" min={1} max={maxContactLimit} value={limit} onChange={event => setLimit(event.target.value)} required />
                {maxContactLimit < 100000 && <p className="field-hint">This account can set up to {maxContactLimit.toLocaleString()} contacts per link.</p>}
              </div>
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="collection-url">Canonical share URL <span className="label-optional">editable</span></label>
              <div className="input-with-icon"><Globe2 size={15} /><Input id="collection-url" value={canonicalUrl} onChange={event => { setCanonicalUrl(event.target.value); setCustomUrl(true); }} placeholder="https://yourdomain.com/c/your-link" required /></div>
              <p className="field-hint">Use this Cardora site's URL. A custom domain works only when it is configured on the server to serve Cardora collections.</p>
            </div>
            <div className="field-block">
              <label className="field-label">Allowed contact countries</label>
              <CountryPicker selected={countries} onChange={setCountries} />
            </div>
          </div>
          <aside className="preview-column">
            <div className="preview-heading"><span>SHARE PREVIEW</span><span className="live-dot">LIVE</span></div>
            <div className="social-preview">
              <div className="social-image"><BrandMark size="lg" className="preview-mark" /><span className="platform-label">CARDORA</span></div>
              <div className="social-copy">
                <span className="social-domain">{(() => { try { return new URL(canonicalUrl).hostname.toUpperCase(); } catch { return "YOUR LINK"; } })()}</span>
                <h3>{title || "Your collection title"}</h3>
                <p>{description || "Your link description will appear here."}</p>
              </div>
            </div>
            <div className="preview-note"><Check size={15} /><span>Cardora’s fixed brand image keeps every preview recognizable. Your description tells people what this collection is for.</span></div>
            <div className="limit-preview"><div className="limit-preview-icon"><ChevronDown size={15} /></div><div><strong>{limit || "0"} people max</strong><span>The link closes automatically at capacity.</span></div></div>
            <div className="dialog-actions">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="cancel-button">Cancel</Button>
              <Button type="submit" disabled={create.isPending} className="primary-button">
                {create.isPending ? <LoaderCircle size={16} className="spin" /> : <>Create link <ArrowUpRight size={16} /></>}
              </Button>
            </div>
          </aside>
        </form>
      </DialogContent>
    </Dialog>
    {atLinkLimit && onPlanClick && <button type="button" className="text-button collection-quota-link" onClick={onPlanClick}>View plan &amp; usage</button>}
    </>
  );
}
