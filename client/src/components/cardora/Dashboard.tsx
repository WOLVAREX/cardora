import { useEffect, useState } from "react";
import { BadgeCheck, Bell, BookOpen, Check, ChevronRight, ClipboardList, Copy, CreditCard, Download, ExternalLink, FileDown, Globe2, LayoutDashboard, Link2, LogOut, Mail, Menu, MoreHorizontal, Plus, Settings, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Brand, BrandMark } from "./Brand";
import { CreateCollectionDialog } from "./CreateCollectionDialog";
import { ContactsView } from "./ContactsView";
import { NotificationsView } from "./NotificationsView";
import { SettingsView } from "./SettingsView";
import { SubscriptionView } from "./SubscriptionView";
import { ThemeToggle } from "./ThemeToggle";
import { trpc } from "@/lib/trpc";
import type { PublicUser } from "../../../../drizzle/schema";
import { safeShareUrl } from "@/lib/cardora";
import type { CollectionList, DashboardData } from "@/lib/cardora-types";
import { useLocation } from "wouter";

type Tab = "overview" | "collections" | "contacts" | "notifications" | "subscription" | "settings";
const navItems: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "collections", label: "Collections", icon: BookOpen },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "subscription", label: "Plan & usage", icon: CreditCard },
];
const tabPaths: Record<Tab, string> = {
  overview: "/overview",
  collections: "/collections",
  contacts: "/contacts",
  notifications: "/notifications",
  subscription: "/plan-usage",
  settings: "/account-settings",
};
function tabForPath(path: string): Tab {
  const cleanPath = path.split("?")[0].replace(/\/$/, "") || "/";
  return (Object.entries(tabPaths).find(([, route]) => route === cleanPath)?.[0] as Tab | undefined) ?? "overview";
}

export function Dashboard({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const [location, setLocation] = useLocation();
  const [tab, setTabState] = useState<Tab>(() => tabForPath(location));
  const setTab = (next: Tab) => {
    setTabState(next);
    if (location !== tabPaths[next]) setLocation(tabPaths[next]);
  };
  const [activeCollection, setActiveCollection] = useState<number | undefined>();
  const [capacityFollowup, setCapacityFollowup] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [mobileMenuOpen]);
  const query = trpc.cardora.dashboard.useQuery();
  const markRead = trpc.cardora.collection.markAlertsRead.useMutation({ onSuccess: () => query.refetch() });
  const data = query.data;
  const collections = data?.collections ?? [];
  const unreadAlerts = data?.alerts.filter(alert => !alert.readAt).length ?? 0;

  const allContacts = data?.totalContacts ?? 0;
  const openCollections = data?.openCollections ?? 0;
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("gmail");
    if (!status) return;
    if (status === "connected") toast.success("Gmail connection verified and saved.");
    else if (status === "cancelled") toast.message("Google Gmail authorization was cancelled.");
    else if (status === "error") toast.error(url.searchParams.get("reason") === "gmail_mismatch" ? "Connect the same Gmail address you saved in Account settings." : "Gmail connection could not be completed. Check production OAuth setup and try again.");
    url.searchParams.delete("gmail"); url.searchParams.delete("reason");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (status === "connected") void query.refetch();
  }, [query]);

  useEffect(() => { setTabState(tabForPath(location)); }, [location]);
  useEffect(() => { if (tab !== "notifications") setCapacityFollowup(false); }, [tab]);

  function manageContacts(id: number) {
    setActiveCollection(id);
    setTab("contacts");
  }

  return (
    <div className="app-shell">
      <aside id="owner-navigation" className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <a className="sidebar-brand" href="/"><Brand /></a>
        <button type="button" className="sidebar-workspace sidebar-workspace-button" onClick={() => { setTab("settings"); setMobileMenuOpen(false); }} aria-label="Open account settings"><span className="workspace-avatar">{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><span><small>WORKSPACE</small><strong>{user.name || "My Cardora"}</strong></span><MoreHorizontal size={18} aria-hidden="true" /></button>
        <nav className="side-nav" aria-label="Main navigation">
          <span className="nav-overline">WORKSPACE</span>
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => { if (item.id === "notifications") setCapacityFollowup(false); setTab(item.id); setMobileMenuOpen(false); }}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "notifications" && unreadAlerts > 0 && <i className="nav-count">{unreadAlerts}</i>}</button>;
          })}
          <span className="nav-overline nav-overline-lower">PREFERENCES</span>
          <button className={`nav-item ${tab === "settings" ? "active" : ""}`} aria-current={tab === "settings" ? "page" : undefined} onClick={() => { setTab("settings"); setMobileMenuOpen(false); }}><Settings size={17} strokeWidth={1.8} /><span>Account settings</span></button>
          {user.role === "admin" && <a className="nav-item admin-nav-link" href="/admin" onClick={() => setMobileMenuOpen(false)}><ShieldCheck size={17} strokeWidth={1.8} /><span>Admin dashboard</span></a>}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-mini"><ShieldCheck size={17} /><div><strong>Contributor choices matter</strong><span>Shared VCFs include opt-in contacts only.</span></div></div>
          <button className="sidebar-user" onClick={onLogout}><span className="user-avatar">{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><span className="user-copy"><strong>{user.name || "Account"}</strong><small>{user.email || "Email not provided"}</small></span><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="mobile-topbar">
        <button type="button" className="mobile-menu-toggle" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-controls="owner-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        <button className="mobile-brand" onClick={() => { setTab("overview"); setMobileMenuOpen(false); }}><Brand compact /></button>
        <div className="mobile-topbar-actions"><ThemeToggle /><button className="icon-button" onClick={() => { setTab("settings"); setMobileMenuOpen(false); }} aria-label="Account settings"><Settings size={18} /></button></div>
      </div>
      {mobileMenuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{tab === "settings" ? "Account settings" : navItems.find(item => item.id === tab)?.label}</strong></div><div className="topbar-right"><span className="secure-note"><ShieldCheck size={15} /> Private by default</span><ThemeToggle /><button className="bell-button" aria-label="Notifications" onClick={() => { setCapacityFollowup(false); setTab("notifications"); setMobileMenuOpen(false); if (unreadAlerts) markRead.mutate(); }}><Bell size={18} />{unreadAlerts > 0 && <i />}</button><button type="button" className="topbar-profile-button" aria-label="Open account settings" title="Account settings" onClick={() => { setTab("settings"); setMobileMenuOpen(false); }}><span className="topbar-avatar">{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span></button></div></header>

        <div className="page-content">
          {data?.alerts.some(alert => !alert.readAt) && tab === "overview" && (() => { const alert = data.alerts.find(item => !item.readAt)!; return <button className="capacity-alert" onClick={() => { setActiveCollection(alert.collectionId); setCapacityFollowup(true); setTab("notifications"); markRead.mutate(); }}><span className="alert-dot" /><span><strong>{alert.kind === "account_limit_reached" ? "Your account has reached its contact limit" : "A collection has reached capacity"}</strong><small>{alert.message}</small><span className="capacity-alert-action">Review opted-in contributors and notification options</span></span><ChevronRight size={17} /></button>; })()}
          {tab === "overview" && <Overview data={data} loading={query.isLoading} email={user.email} onTab={setTab} onManage={manageContacts} />}
          {tab === "collections" && <CollectionsPage collections={collections} onManage={manageContacts} remainingCollections={data?.subscription.usage.collectionsRemaining} onPlanClick={() => setTab("subscription")} />}
          {tab === "contacts" && <ContactsView collections={collections} initialCollectionId={activeCollection} smsEligible={data?.profile.smsEligible ?? false} />}
          {tab === "notifications" && <NotificationsView collections={collections} initialCollectionId={activeCollection} capacityFollowup={capacityFollowup} smsEligible={data?.profile.smsEligible ?? false} smsVisible={data?.profile.phoneCountryCode === "KE"} emailConfigured={data?.profile.emailDeliveryConfigured ?? false} />}
          {tab === "subscription" && <SubscriptionView />}
          {tab === "settings" && <SettingsView user={user} profile={data?.profile} onSaved={() => query.refetch()} />}
        </div>
        <footer className="dashboard-footer"><span>Cardora <span className="footer-dot">·</span> Made to keep good connections close.</span><a href="/privacy">Privacy disclosure</a></footer>
      </main>
    </div>
  );
}

function Overview({ data, loading, email, onTab, onManage }: { data?: DashboardData; loading: boolean; email: string | null; onTab: (tab: Tab) => void; onManage: (id: number) => void }) {
  const collections = data?.collections ?? [];
  const latest = collections.slice(0, 4);
  return (
    <>
      <div className="page-heading-row"><div><div className="eyebrow">YOUR CONTACTS, THOUGHTFULLY GATHERED</div><h1>Good connections, <em>kept close.</em></h1><p className="page-subtitle">Create a collection link, share it with your people, and bring everyone into one address book.</p></div><div className="heading-action"><CreateCollectionDialog onCreated={() => onTab("collections")} remainingCollections={data?.subscription.usage.collectionsRemaining} onPlanClick={() => onTab("subscription")} /></div></div>
      {!loading && <section className="account-ready-banner"><span className="account-ready-icon"><BadgeCheck size={19} /></span><div><strong>Ready to go live</strong><p>Email: {data?.profile.notificationEmail ?? email ?? "Not saved"} <span>·</span> Phone: {data?.profile.phoneE164 ?? "Not saved"}. You can update these details in account settings.</p></div><Button variant="outline" onClick={() => onTab("settings")}>Manage details</Button></section>}
      <div className="stat-grid">
        <Metric icon={Users} label="Contacts collected" value={loading ? "—" : String(data?.totalContacts ?? 0)} helper="Across your collections" tone="sage" />
        <Metric icon={Link2} label="Active links" value={loading ? "—" : String(data?.openCollections ?? 0)} helper="Still accepting contacts" tone="green" />
        <Metric icon={ClipboardList} label="Collections" value={loading ? "—" : String(collections.length)} helper="All your shared lists" tone="citrus" />
      </div>
      <section className="content-card collection-card">
        <div className="section-head"><div><h2>Your collections</h2><p>Share a link. Build a little community.</p></div><button className="text-button" onClick={() => onTab("collections")}>View all <ChevronRight size={15} /></button></div>
        {loading ? <div className="loading-row">Loading your collections…</div> : latest.length ? <CollectionRows collections={latest} onManage={onManage} /> : <div className="empty-collections"><div className="empty-art"><div className="empty-card empty-card-back" /><div className="empty-card empty-card-front"><span /><span /><span /></div><div className="empty-star">✳</div></div><div><h3>Your first collection starts here.</h3><p>Choose the countries you’ll accept, set a contact limit, then share your link.</p></div><CreateCollectionDialog remainingCollections={data?.subscription.usage.collectionsRemaining} onPlanClick={() => onTab("subscription")} /></div>}
      </section>
      <div className="bottom-grid">
        <section className="content-card getting-started"><div className="small-icon-circle"><Globe2 size={18} /></div><div><span className="eyebrow">HOW CARDORA WORKS</span><h2>From one link to a shared address book.</h2><p>Set your countries and contact cap. Cardora checks every number’s country calling code and closes the link when you reach your limit.</p><button className="text-button" onClick={() => onTab("collections")}>Explore collections <ChevronRight size={15} /></button></div></section>
        <section className="integrations-card"><div className="integration-title"><span className="small-icon-circle"><Mail size={17} /></span><div><h3>Thoughtful notifications</h3><p>Reach people who chose to hear from you.</p></div></div><div className="integration-status"><span className={`status-dot ${data?.profile.emailDeliveryConfigured ? "ready" : "muted"}`} />Brevo email <b>{data?.profile.emailDeliveryConfigured ? "Available" : "Not configured"}</b></div><div className="integration-status"><span className={`status-dot ${data?.profile.smsEligible ? "ready" : "muted"}`} />SMS eligibility <b>{data?.profile.smsEligible ? "Verified Kenyan owner" : data?.profile.phoneCountryCode === "KE" ? "Verify Kenyan phone" : "Kenya only"}</b></div><button className="text-button" onClick={() => onTab("settings")}>Manage notification details <ChevronRight size={15} /></button></section>
      </div>
    </>
  );
}

function Metric({ icon: Icon, label, value, helper, tone }: { icon: typeof Users; label: string; value: string; helper: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></div><div className="metric-content"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div><span className="metric-accent">↗</span></div>;
}

function CollectionsPage({ collections, onManage, remainingCollections, onPlanClick }: { collections: CollectionList; onManage: (id: number) => void; remainingCollections?: number; onPlanClick: () => void }) {
  return <><div className="page-heading-row"><div><div className="eyebrow">YOUR LINK LIBRARY</div><h1>Collections</h1><p className="page-subtitle">Every shared link, in one tidy place.</p></div><CreateCollectionDialog remainingCollections={remainingCollections} onPlanClick={onPlanClick} /></div><section className="content-card"><div className="section-head"><div><h2>{collections.length} {collections.length === 1 ? "collection" : "collections"}</h2><p>Capacity is a hard stop—once full, a link won’t take more contacts.</p></div></div>{collections.length ? <CollectionRows collections={collections} onManage={onManage} /> : <div className="empty-simple"><BookOpen size={25} /><h3>No collections yet</h3><p>Create your first shareable link. Connect Gmail in account settings when you’re ready to send email notifications.</p></div>}</section></>;
}

function CollectionRows({ collections, onManage }: { collections: CollectionList; onManage: (id: number) => void }) {
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [pendingDownload, setPendingDownload] = useState<(typeof collections)[number] | null>(null);
  async function copyLink(collection: (typeof collections)[number]) {
    try { await navigator.clipboard.writeText(safeShareUrl(collection.canonicalUrl, collection.slug)); setCopiedId(collection.id); toast.success("Collection link copied."); setTimeout(() => setCopiedId(null), 1800); }
    catch { toast.error("Couldn’t copy the link. Try copying it from the preview."); }
  }
  async function exportCollection(collection: (typeof collections)[number]) {
    setExporting(collection.id);
    try {
      const result = await utils.cardora.collection.exportVcf.fetch({ collectionId: collection.id });
      if (!result.content) { toast.error("There are no contacts to export yet."); return; }
      const blob = new Blob([result.content], { type: "text/vcard;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.count} contacts as VCF.`);
    } catch { toast.error("Couldn’t export this collection."); }
    finally { setExporting(null); }
  }
  function requestDownload(collection: (typeof collections)[number]) {
    const full = collection.status !== "open" || collection.usedSlots >= collection.contactLimit;
    if (!full) { setPendingDownload(collection); return; }
    void exportCollection(collection);
  }
  return <><div className="collection-list">{collections.map(collection => {
    const percent = Math.min(100, Math.round((collection.usedSlots / collection.contactLimit) * 100));
    const full = collection.status !== "open" || collection.usedSlots >= collection.contactLimit;
    return <article className="collection-row" key={collection.id}>
      <div className="collection-icon"><BrandMark size="sm" /></div>
      <div className="collection-main"><div className="collection-name-line"><h3>{collection.title}</h3><span className={`status-pill ${full ? "full" : "open"}`}><span />{full ? "At capacity" : "Accepting"}</span></div><p>{collection.description || "No description"}</p><div className="collection-progress"><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><span>{collection.usedSlots} of {collection.contactLimit}</span><span className="progress-dot">·</span><span>{collection.activeContactCount} saved</span></div></div>
      <div className="collection-actions"><button className="action-icon" title="Copy link" aria-label={`Copy ${collection.title} link`} onClick={() => copyLink(collection)}>{copiedId === collection.id ? <Check size={16} /> : <Copy size={16} />}</button><button className="action-icon" title="Download VCF" aria-label={`Download ${collection.title} VCF`} onClick={() => requestDownload(collection)} disabled={exporting === collection.id}><Download size={16} /></button><button className="row-manage" onClick={() => onManage(collection.id)}>Manage <ChevronRight size={14} /></button></div>
    </article>;
  })}</div><AlertDialog open={Boolean(pendingDownload)} onOpenChange={open => { if (!open) setPendingDownload(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Download before this collection is full?</AlertDialogTitle><AlertDialogDescription>{pendingDownload?.usedSlots ?? 0} of {pendingDownload?.contactLimit ?? 0} spots are filled in “{pendingDownload?.title}”. This VCF will include contacts accepted so far; contacts added later will not be included in this file.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep collecting</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDownload) void exportCollection(pendingDownload); setPendingDownload(null); }}>Download current VCF</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
