import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/cardora/Brand";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";

export default function PrivacyPage() {
  return <div className="privacy-page">
    <header className="privacy-header"><a href="/"><Brand compact /></a><div><ThemeToggle /></div></header>
    <main className="privacy-content">
      <div className="eyebrow"><ShieldCheck size={14} /> CARDORA PRIVACY</div>
      <h1>Your contacts deserve care.</h1>
      <p className="privacy-lead">Cardora helps people collect the details needed for a shared address book. This page explains what is collected, why, and how notification choices work.</p>
      <section className="privacy-card"><span className="privacy-card-icon"><LockKeyhole size={17} /></span><div><h2>Information in a collection</h2><p>A contributor provides their name and international phone number. Cardora uses the calling code to check a collection’s allowed-country rules. Email is collected only if the contributor chooses email updates and enters an email address. Notification preferences are stored separately by channel.</p></div></section>
      <section className="privacy-card"><span className="privacy-card-icon"><ShieldCheck size={17} /></span><div><h2>Who can see contact details</h2><p>Collection contact details are shown only to the collection’s owner in their authenticated Cardora workspace. Administrators can see operational totals, country and consent aggregates, and collection status; the administration dashboard does not display individual public contributors’ contact details.</p></div></section>
      <section className="privacy-card"><span className="privacy-card-icon"><LockKeyhole size={17} /></span><div><h2>Notifications and consent</h2><p>Owners may contact only people who explicitly opted into the relevant channel. Kenyan SMS uses the Nena gateway and is limited to Kenyan numbers. A contributor can use their collection-specific preference link to stop future email and SMS updates. A message is not described as sent unless the configured provider confirms that it was queued.</p></div></section>
      <section className="privacy-card"><span className="privacy-card-icon"><ShieldCheck size={17} /></span><div><h2>Gmail connection</h2><p>Gmail-based notifications are not active in this Preview. When enabled on the production service, an owner’s own Gmail account will require a separate OAuth consent for the minimum sending access. Stored Gmail refresh tokens are encrypted at rest using authenticated encryption. The owner can disconnect that account from Cardora settings; disconnect removes the stored refresh token and revokes Google access where supported. Google OAuth credentials are configured by the operator on the production VPS, not collected on this page.</p></div></section>
      <section className="privacy-card"><span className="privacy-card-icon"><LockKeyhole size={17} /></span><div><h2>Retention and choices</h2><p>Owners can remove accepted contacts from their collections. Removing a contact stops future eligibility but does not reopen a collection link that has reached its limit. Contributors can withdraw notification consent using their preference link. For privacy questions, contact the Cardora service operator.</p></div></section>
      <a href="/" className="admin-return"><ArrowLeft size={14} /> Return to Cardora</a>
    </main>
    <footer className="privacy-footer">Cardora · Thoughtful contact collecting.</footer>
  </div>;
}
