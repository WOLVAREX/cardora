import { ArrowRight, Briefcase, CalendarDays, Check, ChevronRight, Globe2, Link2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { Brand, BrandMark } from "@/components/cardora/Brand";
import { Dashboard } from "@/components/cardora/Dashboard";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";

export default function Home() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="auth-loading"><BrandMark size="lg" /><span>Opening your Cardora workspace…</span></div>;
  if (user) return <Dashboard user={user} onLogout={() => void logout()} />;
  return <Landing />;
}

function Landing() {
  function login() {
    window.location.assign("/login");
  }
  return <div className="landing-shell">
    <header className="landing-nav"><a href="/"><Brand /></a><div className="landing-nav-right"><ThemeToggle /><span><LockKeyhole size={14} /> Private by default</span><Button variant="outline" onClick={login}>Sign in <ArrowRight size={15} /></Button></div></header>
    <main className="landing-main">
      <section className="hero-copy"><div className="eyebrow hero-eyebrow"><span className="sparkle-dot">✳</span> THE ADDRESS BOOK, REIMAGINED</div><h1>Good people.<br /><em>One good link.</em></h1><p>Bring your community into one thoughtful address book. Choose the countries you welcome, share your link, and let Cardora take care of the sorting.</p><div className="hero-actions"><Button onClick={login} className="primary-button hero-cta">Start collecting <ArrowRight size={17} /></Button><span className="hero-caption"><ShieldCheck size={14} /> Only the details you need. Always yours.</span></div><div className="hero-trust"><div className="trust-avatars"><span>J</span><span>A</span><span>M</span><span>+</span></div><p>A calmer way to gather contacts,<br /><strong>wherever your people are.</strong></p></div></section>
      <section className="hero-visual" aria-label="A preview of Cardora contact collection">
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="hero-glow" />
        <div className="float-card share-float"><div className="float-card-top"><span className="tiny-brand"><BrandMark size="sm" /> cardora</span><span className="live-indicator"><i /> OPEN</span></div><div className="share-card-title">Weekend<br />gathering list</div><p>Add your details so the group can stay in touch.</p><div className="share-country-row"><span>🇰🇪 Kenya</span><span>🇺🇬 Uganda</span><span className="country-count">+ 2</span></div><div className="share-progress"><span /><i /></div><div className="share-bottom"><span>18 of 25 people</span><button aria-label="Link example"><Link2 size={15} /></button></div></div>
        <div className="float-card person-float"><span className="person-avatar avatar-1">J</span><div><strong>Jane Mwangi</strong><small>+254 · just added</small></div><Check size={15} className="person-check" /></div>
        <div className="float-card country-float"><div className="country-float-icon"><Globe2 size={18} /></div><div><strong>Country-aware</strong><small>Country code checked</small></div><span className="check-circle"><Check size={12} /></span></div>
        <div className="visual-caption"><div className="visual-caption-mark"><BrandMark size="sm" /></div><div><strong>Gather with care.</strong><span>Keep connections close.</span></div></div>
      </section>
      <div className="hero-footnote"><span>01 <i /> SIMPLE LINKS</span><span>02 <i /> COUNTRY FILTERS</span><span>03 <i /> PORTABLE VCARD</span></div>
    </main>
    <section className="landing-features"><div><span className="feature-icon"><Globe2 size={19} /></span><h3>Your countries, your call.</h3><p>Allow contacts by international phone country code—no guessing from someone’s location.</p></div><div><span className="feature-icon"><Users size={19} /></span><h3>A clear finish line.</h3><p>Set a limit. When your list is full, the link closes and everyone knows.</p></div><div><span className="feature-icon"><ShieldCheck size={19} /></span><h3>Only what’s needed.</h3><p>Collect names and numbers with clear consent and an easy way to opt out of updates.</p></div></section>
    <section className="landing-use-cases" aria-labelledby="landing-use-cases-title">
      <div className="landing-use-cases-heading"><span className="eyebrow">ONE PORTABLE VCARD, MANY USES</span><h2 id="landing-use-cases-title">A contact file for the way you connect.</h2><p>From a family gathering to a growing business network, collect the details people choose to share and export them as a portable VCF.</p></div>
      <div className="landing-use-case-grid">
        <article className="landing-use-case-card"><span className="landing-use-case-icon"><Users size={18} aria-hidden="true" /></span><span className="landing-use-case-kicker">PERSONAL &amp; COMMUNITY</span><h3>Keep your people connected.</h3><p>Gather family, club, volunteer, or neighborhood contacts with one simple link everyone can share.</p></article>
        <article className="landing-use-case-card"><span className="landing-use-case-icon"><CalendarDays size={18} aria-hidden="true" /></span><span className="landing-use-case-kicker">EVENTS &amp; ORGANIZERS</span><h3>Make the follow-up easier.</h3><p>Bring attendee or organizer contacts into one country-aware list instead of chasing scattered messages afterward.</p></article>
        <article className="landing-use-case-card"><span className="landing-use-case-icon"><Briefcase size={18} aria-hidden="true" /></span><span className="landing-use-case-kicker">BUSINESS &amp; TEAMS</span><h3>Grow a useful contact list.</h3><p>Use it for networking events, hiring fairs, sales teams, or client communities. People opt in, and you can export the collected contacts as a VCF.</p></article>
      </div>
      <div className="landing-use-case-note"><Link2 size={16} aria-hidden="true" /><p><strong>Portable by design.</strong> Download a standard .vcf contact file and import it into a compatible address-book app when you’re ready.</p></div>
    </section>
    <footer className="landing-footer"><Brand compact /><span>Thoughtful contact collecting, by Cardora.</span><button onClick={login}>Continue <ChevronRight size={14} /></button></footer>
  </div>;
}
