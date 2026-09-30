import { useEffect, useMemo, useState } from "react";
import { Activity, BadgeCheck, BarChart3, Bell, ChevronLeft, ChevronRight, CircleAlert, CreditCard, Globe2, LayoutDashboard, Link2, LogOut, Mail, Menu, RefreshCw, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import type { PublicUser } from "../../../../drizzle/schema";
import { trpc } from "@/lib/trpc";
import { ThemeToggle } from "./ThemeToggle";
import { flagForCountry } from "@/lib/cardora";
import { SubscriptionManagementView } from "./SubscriptionManagementView";

type AdminTab = "overview" | "accounts" | "subscriptions" | "collections" | "campaigns";
const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "collections", label: "Collections", icon: Link2 },
  { id: "campaigns", label: "Campaigns", icon: Bell },
];
const chartColors = ["#789168", "#d5ef76", "#93aa81", "#52735b", "#c6d7b8", "#b4a275"];
const formatDate = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
const number = (value: number | undefined) => new Intl.NumberFormat().format(value ?? 0);

export function AdminDashboard({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [mobileMenuOpen]);
  const overview = trpc.admin.overview.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const accounts = trpc.admin.users.useQuery({ page, pageSize: 20, search }, { enabled: tab === "accounts", retry: false });
  const collections = trpc.admin.collections.useQuery({ page, pageSize: 20, search }, { enabled: tab === "collections", retry: false });
  const campaigns = trpc.admin.campaigns.useQuery({ page, pageSize: 20, search }, { enabled: tab === "campaigns", retry: false });
  const nena = trpc.admin.nenaStatus.useQuery(undefined, { enabled: tab === "overview", retry: false, refetchOnWindowFocus: false });
  const metrics = overview.data?.metrics;
  const countryData = useMemo(() => (overview.data?.countries ?? []).slice(0, 8).map(row => ({ ...row, name: row.countryCode })), [overview.data?.countries]);
  const campaignData = useMemo(() => Object.entries(overview.data?.campaignStatus ?? {}).map(([status, total]) => ({ status: status.replaceAll("_", " "), total })), [overview.data?.campaignStatus]);
  const rows = tab === "accounts" ? (accounts.data?.rows ?? []) : [];
  const pageCount = (total: number | undefined) => Math.max(1, Math.ceil((total ?? 0) / 20));

  function switchTab(next: AdminTab) { setTab(next); setPage(0); setSearch(""); setMobileMenuOpen(false); }

  return <div className="admin-shell">
    <aside id="admin-navigation" className={`admin-sidebar ${mobileMenuOpen ? "admin-sidebar-open" : ""}`}>
      <a className="admin-brand" href="/"><img src="/cardora-mark.webp" alt="" /><span>Cardora <small>ADMINISTRATION</small></span></a>
      <div className="admin-sidebar-label">PLATFORM</div>
      <nav className="admin-nav" aria-label="Admin navigation">
        {tabs.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={`admin-nav-item ${tab === item.id ? "active" : ""}`} onClick={() => switchTab(item.id)} aria-current={tab === item.id ? "page" : undefined}><Icon size={17} /><span>{item.label}</span>{item.id === "campaigns" && (metrics?.totalCampaigns ?? 0) > 0 && <i>{metrics?.totalCampaigns}</i>}</button>; })}
      </nav>
      <div className="admin-sidebar-bottom"><span className="admin-live-badge"><i /> Platform data</span><div className="admin-user"><span className="admin-avatar">{(user.name || "A").slice(0, 1).toUpperCase()}</span><div><strong>{user.name || "Administrator"}</strong><small>Platform admin</small></div><button type="button" aria-label="Sign out" onClick={onLogout}><LogOut size={15} /></button></div></div>
    </aside>
    {mobileMenuOpen && <button type="button" className="admin-nav-backdrop" aria-label="Close admin navigation" onClick={() => setMobileMenuOpen(false)} />}

    <main className="admin-main">
      <header className="admin-topbar"><div className="admin-topbar-leading"><button type="button" className="admin-mobile-menu" aria-label={mobileMenuOpen ? "Close admin navigation" : "Open admin navigation"} aria-controls="admin-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button><div><span className="admin-breadcrumb">Cardora <ChevronRight size={13} /> Administration <ChevronRight size={13} /> <strong>{tabs.find(item => item.id === tab)?.label}</strong></span><span className="admin-topbar-caption">Platform operations and account health</span></div></div><div className="admin-topbar-actions"><span className="admin-protected"><ShieldCheck size={15} /> Admin-only</span><ThemeToggle /><button type="button" className="admin-refresh" aria-label="Refresh dashboard" onClick={() => { void overview.refetch(); void nena.refetch(); toast.success("Dashboard refreshed."); }}><RefreshCw size={16} /></button></div></header>
      <section className="admin-page-content">
        <div className="admin-page-heading"><div><div className="eyebrow">CARDORA · PLATFORM OPERATIONS</div><h1>{tab === "overview" ? "A clear view of the whole platform." : tabs.find(item => item.id === tab)?.label}</h1><p className="admin-subtitle">{tab === "overview" ? "Monitor growth, collection capacity, consent and provider readiness from one private workspace." : tab === "accounts" ? "Review owner accounts, role assignment and phone-verification status." : tab === "subscriptions" ? "Edit plan tiers, account-wide contact/link caps, prices and user assignments." : tab === "collections" ? "Inspect country rules, capacity and activity across every collection link." : "Review notification campaigns and confirmed provider queue outcomes."}</p></div><span className="admin-date"><Activity size={15} /> Live database view</span></div>
        {tab === "collections" && <div className="admin-filter-row"><input className="admin-search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search title, slug, status or owner" aria-label="Search collections by title, slug, status or owner" /></div>}
        {tab === "campaigns" && <div className="admin-filter-row"><input className="admin-search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search subject, channel, status or owner" aria-label="Search campaigns by subject, channel, status or owner" /></div>}
        {overview.error && <div className="admin-error"><CircleAlert size={17} /> {overview.error.message}</div>}
        {tab === "overview" && <>
          <div className="admin-summary-grid">
            <AdminMetric icon={Users} label="Owner accounts" value={metrics?.totalUsers} helper={`+${number(metrics?.newUsers30Days)} in the last 30 days`} tone="green" />
            <AdminMetric icon={Link2} label="Collections" value={metrics?.totalCollections} helper={`${number(metrics?.openCollections)} currently open`} tone="sage" />
            <AdminMetric icon={Activity} label="Accepted contacts" value={metrics?.acceptedContacts} helper={`${number(metrics?.totalContacts)} total records`} tone="citron" />
            <AdminMetric icon={BarChart3} label="Capacity used" value={`${number(metrics?.usedSlots)} / ${number(metrics?.totalCapacity)}`} helper={metrics?.totalCapacity ? `${Math.round((metrics.usedSlots / metrics.totalCapacity) * 100)}% of all configured slots` : "No collection capacity configured"} tone="amber" />
          </div>
          <div className="admin-mini-stats"><div><span>At-capacity links</span><strong>{number(metrics?.fullCollections)}</strong><small>Hard limit reached</small></div><div><span>Email opt-ins</span><strong>{number(metrics?.emailOptIns)}</strong><small>Accepted contacts</small></div><div><span>Kenyan SMS opt-ins</span><strong>{number(metrics?.smsOptIns)}</strong><small>Accepted contacts</small></div><div><span>Campaigns</span><strong>{number(metrics?.totalCampaigns)}</strong><small>Drafted or attempted</small></div></div>
          <div className="admin-chart-grid">
            <section className="admin-panel admin-chart-panel"><div className="admin-panel-head"><div><span className="admin-panel-icon"><Globe2 size={16} /></span><div><h2>Contacts by country</h2><p>Country calling code from accepted contacts</p></div></div><span className="admin-chart-total">{number(metrics?.acceptedContacts)} <small>contacts</small></span></div>
              {countryData.length ? <div className="admin-chart-content"><div className="admin-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={countryData} dataKey="contacts" nameKey="name" innerRadius="62%" outerRadius="91%" paddingAngle={3} stroke="none">{countryData.map((entry, index) => <Cell key={entry.countryCode} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value: number) => [number(value), "Contacts"]} /></PieChart></ResponsiveContainer><div className="admin-donut-center"><strong>{number(metrics?.acceptedContacts)}</strong><span>accepted</span></div></div><div className="admin-country-legend">{countryData.slice(0, 6).map((item, index) => <div key={item.countryCode}><span className="legend-dot" style={{ background: chartColors[index % chartColors.length] }} /><span>{flagForCountry(item.countryCode)} {item.countryCode}</span><strong>{number(item.contacts)}</strong></div>)}</div></div> : <div className="admin-empty">Accepted contact country data will appear here.</div>}
            </section>
            <section className="admin-panel admin-chart-panel"><div className="admin-panel-head"><div><span className="admin-panel-icon citrus"><Bell size={16} /></span><div><h2>Campaign lifecycle</h2><p>Draft, send and provider-queue status</p></div></div></div>
              {campaignData.length ? <div className="admin-bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={campaignData} margin={{ top: 8, right: 8, left: -22, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e6e9e1" strokeDasharray="3 4" /><XAxis dataKey="status" tick={{ fontSize: 10, fill: "#7d897d" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#929b90" }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="total" name="Campaigns" fill="#789168" radius={[5, 5, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer></div> : <div className="admin-empty">Campaign state appears after owners prepare a message.</div>}
            </section>
          </div>
          <div className="admin-bottom-grid">
            <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-panel-icon"><Users size={16} /></span><div><h2>Recent accounts</h2><p>Latest account registrations</p></div></div><button className="admin-text-link" onClick={() => switchTab("accounts")}>All accounts <ChevronRight size={14} /></button></div><div className="admin-activity-list">{(overview.data?.recentUsers ?? []).map(row => <div className="admin-activity-row" key={row.id}><span className="admin-avatar small">{(row.name || row.email || "C").slice(0, 1).toUpperCase()}</span><div className="admin-activity-copy"><strong>{row.name || row.email || `Account ${row.id}`}</strong><span>{row.role === "admin" ? "Administrator" : "Owner account"} · {row.phoneCountryCode || "Phone not set"}</span></div><span className="admin-activity-date">{formatDate(row.createdAt)}</span></div>)}{!overview.data?.recentUsers.length && <div className="admin-empty">No accounts yet.</div>}</div></section>
            <section className="admin-panel admin-provider-panel"><div className="admin-panel-head"><div><span className="admin-panel-icon sms"><Smartphone size={16} /></span><div><h2>Nena SMS gateway</h2><p>Provider availability · Kenyan SMS</p></div></div></div><ProviderStatus data={nena.data} loading={nena.isLoading} onRefresh={() => void nena.refetch()} /><div className="admin-provider-note">SMS will send only from the active <code>NENA.</code> sender ID and only to opted-in Kenyan numbers.</div></section>
          </div>
          <section className="admin-panel admin-table-card"><div className="admin-panel-head"><div><span className="admin-panel-icon citrus"><Bell size={16} /></span><div><h2>Recent campaign outcomes</h2><p>Provider-accepted queue counts; no campaign contents or recipient PII</p></div></div><button className="admin-text-link" onClick={() => switchTab("campaigns")}>All campaigns <ChevronRight size={14} /></button></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Campaign</th><th>Owner</th><th>Channel</th><th>Eligible</th><th>Queued</th><th>State</th><th>Created</th></tr></thead><tbody>{(overview.data?.recentCampaigns ?? []).map(row => <tr key={row.id}><td><strong>{row.subject}</strong><small>Collection #{row.collectionId}</small></td><td>Owner #{row.ownerId}</td><td><span className="admin-channel">{row.channel === "email" ? <Mail size={13} /> : <Smartphone size={13} />}{row.channel}</span></td><td>{number(row.eligibleRecipientCount)}</td><td>{number(row.queuedRecipientCount)}</td><td><span className={`admin-badge ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td>{formatDate(row.sentAt ?? row.createdAt)}</td></tr>)}</tbody></table>{!overview.data?.recentCampaigns.length && <div className="admin-empty">Campaign outcomes will appear after owners prepare and send a message.</div>}</div></section>
          <section className="admin-panel admin-table-card"><div className="admin-panel-head"><div><span className="admin-panel-icon"><Link2 size={16} /></span><div><h2>Recently created collections</h2><p>Country allow-lists and hard capacity at a glance</p></div></div><button className="admin-text-link" onClick={() => switchTab("collections")}>All collections <ChevronRight size={14} /></button></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Collection</th><th>Owner</th><th>Countries</th><th>Capacity</th><th>Status</th></tr></thead><tbody>{(overview.data?.recentCollections ?? []).map(row => <tr key={row.id}><td><strong>{row.title}</strong><small>/{row.slug}</small></td><td>Owner #{row.ownerId}</td><td>{row.allowedCountryCodes.join(", ")}</td><td>{row.usedSlots} / {row.contactLimit}</td><td><span className={`admin-badge ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></section>
        </>}

        {tab === "accounts" && <section className="admin-panel admin-table-card"><div className="admin-panel-head"><div><span className="admin-panel-icon"><Users size={16} /></span><div><h2>Owner directory</h2><p>{number(accounts.data?.total)} accounts · role, email, phone country and verification</p></div></div><input className="admin-search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search name/email" aria-label="Search accounts by name or email" /></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Account</th><th>Role</th><th>Phone country</th><th>Phone verified</th><th>Joined</th><th>Last sign-in</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.name || `Account ${row.id}`}</strong><small>{row.email || `User #${row.id}`}</small></td><td><span className={`admin-badge ${row.role}`}>{row.role}</span></td><td>{row.phoneCountryCode ? `${flagForCountry(row.phoneCountryCode)} ${row.phoneCountryCode}` : "Not set"}</td><td>{row.phoneVerifiedAt ? <span className="admin-verified"><BadgeCheck size={14} /> Verified</span> : "Not verified"}</td><td>{formatDate(row.createdAt)}</td><td>{formatDate(row.lastSignedIn)}</td></tr>)}</tbody></table></div>{!rows.length && !accounts.isLoading && <div className="admin-empty">No accounts match this search.</div>}<Pager page={page} total={accounts.data?.total} pageCount={pageCount} onChange={setPage} /></section>}

        {tab === "collections" && <section className="admin-panel admin-table-card"><div className="admin-panel-head"><div><span className="admin-panel-icon"><Link2 size={16} /></span><div><h2>All collections</h2><p>{number(collections.data?.total)} share links · no contact-level records are shown</p></div></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Collection</th><th>Owner</th><th>Allowed countries</th><th>Contacts</th><th>Capacity used</th><th>Status</th><th>Created</th></tr></thead><tbody>{(collections.data?.rows ?? []).map(row => <tr key={row.id}><td><strong>{row.title}</strong><small>/{row.slug}</small></td><td>{row.owner?.name || `Owner #${row.ownerId}`}<small>{row.owner?.email || ""}</small></td><td><div className="admin-country-tags">{row.allowedCountryCodes.slice(0, 5).map(code => <span key={code}>{code}</span>)}{row.allowedCountryCodes.length > 5 && <span>+{row.allowedCountryCodes.length - 5}</span>}</div></td><td>{number(row.activeContactCount)}</td><td><CapacityMeter used={row.usedSlots} limit={row.contactLimit} /></td><td><span className={`admin-badge ${row.status}`}>{row.status}</span></td><td>{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div><Pager page={page} total={collections.data?.total} pageCount={pageCount} onChange={setPage} /></section>}

        {tab === "campaigns" && <section className="admin-panel admin-table-card"><div className="admin-panel-head"><div><span className="admin-panel-icon citrus"><Bell size={16} /></span><div><h2>Notification campaigns</h2><p>Only provider-confirmed queue counts are represented as queued.</p></div></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Campaign</th><th>Owner</th><th>Channel</th><th>Eligible</th><th>Queued</th><th>Skipped</th><th>State</th><th>Created</th></tr></thead><tbody>{(campaigns.data?.rows ?? []).map(row => <tr key={row.id}><td><strong>{row.subject}</strong><small>Collection #{row.collectionId}</small></td><td>Owner #{row.ownerId}</td><td><span className="admin-channel">{row.channel === "email" ? <Mail size={13} /> : <Smartphone size={13} />}{row.channel}</span></td><td>{number(row.eligibleRecipientCount)}</td><td>{number(row.queuedRecipientCount)}</td><td>{number(row.skippedRecipientCount)}</td><td><span className={`admin-badge ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td>{formatDate(row.sentAt ?? row.createdAt)}</td></tr>)}</tbody></table></div><Pager page={page} total={campaigns.data?.total} pageCount={pageCount} onChange={setPage} /></section>}
        {tab === "subscriptions" && <SubscriptionManagementView />}
      </section>
    </main>
  </div>;
}

function AdminMetric({ icon: Icon, label, value, helper, tone }: { icon: typeof Users; label: string; value?: number | string; helper: string; tone: string }) {
  return <article className="admin-stat-card"><span className={`admin-stat-icon ${tone}`}><Icon size={18} /></span><span className="admin-stat-label">{label}</span><strong className="admin-stat-value">{value === undefined ? "—" : typeof value === "string" ? value : number(value)}</strong><span className="admin-stat-helper">{helper}</span><span className="admin-stat-trend"><Activity size={14} /></span></article>;
}

function ProviderStatus({ data, loading, onRefresh }: { data?: { configured: boolean; wallet: string; credits: number | null; sender: string; senderLabel: string | null }; loading: boolean; onRefresh: () => void }) {
  if (loading) return <div className="admin-provider-state"><span className="admin-spinner" /> Checking Nena access…</div>;
  if (!data?.configured) return <div className="admin-provider-state warning"><CircleAlert size={17} /><span>NENA_API_KEY is not available in this server environment.</span><button onClick={onRefresh}>Retry</button></div>;
  const ready = data.wallet === "available" && data.sender === "available";
  return <div className={`admin-provider-state ${ready ? "ready" : "warning"}`}><span className="provider-state-icon">{ready ? <BadgeCheck size={17} /> : <CircleAlert size={17} />}</span><div><strong>{ready ? "Nena connection available" : data.wallet === "denied" || data.sender === "denied" ? "Nena API access denied" : "Nena sender not ready"}</strong><span>{data.sender === "available" ? `Active sender: ${data.senderLabel ?? "NENA."}` : data.sender === "denied" ? "Read-only sender lookup returned 401/403." : "Active sender ID NENA. is not assigned."}{data.credits !== null ? ` · ${number(data.credits)} credits` : ""}</span></div><button type="button" onClick={onRefresh} aria-label="Refresh Nena status"><RefreshCw size={14} /></button></div>;
}

function CapacityMeter({ used, limit }: { used: number; limit: number }) {
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <div className="admin-capacity"><span>{number(used)} / {number(limit)}</span><i><b style={{ width: `${percent}%` }} /></i></div>;
}

function Pager({ page, total, pageCount, onChange }: { page: number; total?: number; pageCount: (total: number | undefined) => number; onChange: (page: number) => void }) {
  const last = pageCount(total) - 1;
  return <div className="admin-pager"><span>{number(total)} records · page {page + 1} of {last + 1}</span><div><button disabled={page <= 0} onClick={() => onChange(Math.max(0, page - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button><button disabled={page >= last} onClick={() => onChange(Math.min(last, page + 1))} aria-label="Next page"><ChevronRight size={16} /></button></div></div>;
}
