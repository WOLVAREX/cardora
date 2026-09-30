import { useState } from "react";
import { ArrowLeft, BadgeCheck, Download, FileWarning, Users } from "lucide-react";
import { useParams } from "wouter";
import { Brand } from "@/components/cardora/Brand";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function PublicVcfDownloadPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [downloaded, setDownloaded] = useState(false);
  const query = trpc.cardora.collection.publicVcfDownload.useQuery({ token }, { enabled: Boolean(token), retry: false });

  function download() {
    if (!query.data?.content) return;
    const blob = new Blob([query.data.content], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = query.data.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return <div className="public-page"><header className="public-header"><a href="/"><Brand compact /></a><div className="public-header-actions"><ThemeToggle /></div></header>
    <main className="vcf-download-page">
      {query.isLoading ? <div className="public-loading">Preparing the shared contact file…</div> : query.error || !query.data ? <section className="vcf-download-card"><span className="public-icon-circle"><FileWarning size={20} /></span><div className="eyebrow">SHARED CONTACT FILE</div><h1>This download link is no longer available.</h1><p>Links are private to their recipients and expire after seven days. Ask the collection owner to send a new link.</p><a href="/" className="public-back"><ArrowLeft size={14} /> Return to Cardora</a></section> : <section className="vcf-download-card"><span className="public-icon-circle"><Users size={20} /></span><div className="eyebrow">SHARED CONTACT FILE</div><h1>{query.data.title}</h1><p>{query.data.count ? `${query.data.count} contributor${query.data.count === 1 ? "" : "s"} chose to include their details in this shared VCF.` : "No contributors have opted to include their contact details in this shared VCF."}</p><p className="vcf-expiry">This private download link expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(query.data.expiresAt))}.</p>{query.data.count > 0 && <Button className="primary-button vcf-download-button" onClick={download}><Download size={17} /> Download contacts (.vcf)</Button>}{downloaded && <p className="vcf-download-success" role="status"><BadgeCheck size={15} /> The VCF file was downloaded.</p>}<a href="/" className="public-back"><ArrowLeft size={14} /> Return to Cardora</a></section>}
    </main>
  </div>;
}
