import { useEffect, useState } from "react";
import { Download, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { CollectionList } from "@/lib/cardora-types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Collections = CollectionList;

export function ContactsView({ collections, initialCollectionId, smsEligible }: { collections: Collections; initialCollectionId?: number; smsEligible: boolean }) {
  const [selectedId, setSelectedId] = useState<number | undefined>(initialCollectionId ?? collections[0]?.id);
  const [search, setSearch] = useState("");
  const [confirmDownload, setConfirmDownload] = useState(false);
  useEffect(() => { if (!selectedId && collections.length) setSelectedId(collections[0].id); }, [collections, selectedId]);
  const peopleQuery = trpc.cardora.collection.listContacts.useQuery({ collectionId: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const remove = trpc.cardora.collection.removeContact.useMutation({ onSuccess: () => { toast.success("Contact removed from this VCF."); void peopleQuery.refetch(); } });
  const utils = trpc.useUtils();
  const people = (peopleQuery.data ?? []).filter(person => `${person.name} ${person.phoneE164} ${person.countryCode}`.toLowerCase().includes(search.toLowerCase()));
  const collection = collections.find(item => item.id === selectedId);
  const collectionStillOpen = Boolean(collection && collection.status === "open" && collection.usedSlots < collection.contactLimit);

  async function downloadVcf() {
    if (!selectedId) return;
    try {
      const result = await utils.cardora.collection.exportVcf.fetch({ collectionId: selectedId });
      if (!result.content) { toast.error("There are no contacts to export yet."); return; }
      const blob = new Blob([result.content], { type: "text/vcard;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.count} contacts as VCF.`);
    } catch { toast.error("Couldn’t export contacts."); }
  }

  function requestDownload() {
    if (collectionStillOpen) { setConfirmDownload(true); return; }
    void downloadVcf();
  }

  return <><div className="page-heading-row"><div><div className="eyebrow">YOUR ADDRESS BOOK</div><h1>Contacts</h1><p className="page-subtitle">The people who chose to add themselves to your collections.</p></div><button className="outline-action" onClick={requestDownload} disabled={!selectedId || !peopleQuery.data?.length}><Download size={16} /> Export VCF</button></div>
    <AlertDialog open={confirmDownload} onOpenChange={setConfirmDownload}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Download before this collection is full?</AlertDialogTitle><AlertDialogDescription>{collection?.usedSlots ?? 0} of {collection?.contactLimit ?? 0} spots are filled. This VCF will include contacts accepted so far; contacts added later will not be included in this file.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep collecting</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirmDownload(false); void downloadVcf(); }}>Download current VCF</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <div className="toolbar-card"><label className="collection-select-wrap"><span>Collection</span><select value={selectedId ?? ""} onChange={event => setSelectedId(Number(event.target.value) || undefined)} aria-label="Choose collection">{collections.length ? collections.map(item => <option key={item.id} value={item.id}>{item.title}</option>) : <option value="">No collections yet</option>}</select></label><label className="table-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a contact" aria-label="Search contacts" /></label><span className="table-count">{people.length} {people.length === 1 ? "contact" : "contacts"}</span></div>
    <section className="content-card table-card"><div className="section-head"><div><h2>{collection?.title ?? "Contact list"}</h2><p>Only active, accepted contacts appear in your download.</p></div>{collection && <div className="vcf-chip"><span>VCF</span> Ready to export</div>}</div>
      {peopleQuery.isLoading ? <div className="loading-row">Loading contacts…</div> : !collections.length ? <div className="empty-simple"><Users size={25} /><h3>Create a collection first</h3><p>Once people add themselves, you’ll find them here.</p></div> : !people.length ? <div className="empty-simple"><Users size={25} /><h3>No contacts in this list yet</h3><p>Share your link and accepted contacts will appear here.</p></div> : <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Phone number</th><th>Country</th><th>Updates</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td><span className="contact-name"><i>{person.name.slice(0, 1).toUpperCase()}</i>{person.name}</span></td><td className="phone-cell">{person.phoneE164}</td><td><span className="country-code-cell">{person.countryCode}</span></td><td><span className="channel-prefs">{person.emailOptIn && <span>Email</span>}{smsEligible && person.smsOptIn && <span>SMS</span>}{!person.emailOptIn && (!smsEligible || !person.smsOptIn) && <span className="no-updates">No updates</span>}</span></td><td><button className="remove-contact" aria-label={`Remove ${person.name}`} onClick={() => { if (window.confirm(`Remove ${person.name} from this collection? This cannot be undone.`)) remove.mutate({ collectionId: selectedId!, contactId: person.id }); }} disabled={remove.isPending}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
      <div className="table-foot"><ShieldCheck size={15} /><span>Contact details stay private to your account. A removal doesn’t reopen a link that has already reached its limit.</span></div>
    </section>
  </>;
}
