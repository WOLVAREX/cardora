import { ExternalLink } from "lucide-react";
import { CARDORA_MARK } from "@/lib/cardora";

export function SharePreview({ title, description, url }: { title: string; description: string; url: string }) {
  let host = "cardora";
  try { host = new URL(url).hostname; } catch { /* share URL may still be incomplete while editing */ }
  return (
    <div className="social-preview share-preview-card">
      <div className="social-image"><img src={CARDORA_MARK} alt="Cardora" /><span className="platform-label">CARDORA</span></div>
      <div className="social-copy">
        <span className="social-domain">{host.toUpperCase()}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <a className="preview-open" href={url || undefined} target="_blank" rel="noreferrer">Preview link <ExternalLink size={12} /></a>
      </div>
    </div>
  );
}
