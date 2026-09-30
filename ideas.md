# Cardora design brief

## Direction exploration

- **Open Ledger** — A quiet, editorial contact-keeping tool: warm paper surfaces, deep forest ink, one restrained citrus accent, spacious tables and human-scale serif headlines. Probability: 0.07. **Chosen direction.**
- **Signal Desk** — A crisp, high-contrast communications console: graphite surfaces, bright green status cues, compact mono labels and precise grid geometry. Probability: 0.04.
- **Postcard Commons** — A cheerful community organizer: soft sky and apricot hues, rounded cards, stamp-like status badges and expressive display lettering. Probability: 0.09.

## Chosen direction: Open Ledger

- **Design movement:** Contemporary editorial utility with the clarity of a well-kept address book.
- **Core principles:** Trust before novelty; scan-friendly data; clear system status; warmth without visual clutter; obvious separation between public collection links and private owner tools.
- **Color philosophy:** Warm ivory paper (#F7F6F0), crisp white cards, dark evergreen ink (#153A31), muted sage surfaces (#E8EEE8), charcoal text (#242823), and one vivid citron accent (#D5EF76). Use amber and muted red only for attention and errors.
- **Layout paradigm:** Compact left navigation on desktop with a generous, centered work canvas; on mobile, collapse navigation into a top bar and stack cards. Place the contact table and collection status at the visual center.
- **Signature elements:** Small paper-like panels, subtle ruled dividers, country chips, low-contrast texture-free surfaces, circular avatar initials, compact progress meters, and a live share-card preview.
- **Interaction philosophy:** Calm and direct. Inline validation, explicit capacity states, clear confirmation after local product actions, and no pretend delivery state for disconnected messaging services.
- **Animation:** Minimal; short opacity/translate transitions on menus and modals, restrained progress changes, and reduced-motion support.
- **Typography system:** A sturdy sans-serif UI face with a restrained editorial serif for the wordmark and major headings; monospace reserved for country codes, counts, and technical statuses. Use system fallbacks so the UI does not depend on an external font service.
- **Brand essence:** A considered place to gather useful connections and keep them in a portable address book.
- **Brand voice:** Warm, clear, dependable, and specific. Prefer plain descriptions over jargon.
- **Wordmark/logo:** Cardora wordmark paired with a simple forest-green contact-card motif: two offset rounded rectangles and a small joining notch, no decorative detail or embedded text in the icon.
- **Signature brand color:** Deep evergreen (#153A31), balanced by paper ivory and a citron highlight.

## Brand asset placement

Create a square, opaque Cardora icon with a full-bleed evergreen background and a simple ivory contact-card symbol. Use the same branded mark in the site header, favicon, and the fixed platform thumbnail for link previews. Do not use the generic image-search results as product artwork.


## Responsive and dark-mode extension

Keep **Open Ledger** as the single visual direction. Fix the observed narrow-screen clipping with a true mobile hamburger/drawer, stacked fluid cards, and deliberate horizontal table scrolling inside its own container. Provide an accessible, persistent dark mode using deep evergreen-charcoal surfaces, softened paper-white text, sage dividers, and the same restrained citron accent; maintain readable status colors and clear focus states. The landing, owner pages, forms, public collection, privacy disclosure, and role-gated admin dashboard all share the theme. Respect reduced-motion preferences and keep the desktop left-navigation layout unchanged.


## Subscription and plan management

Extend Open Ledger rather than creating another dashboard language. The owner workspace should show the current plan beside two compact usage meters—accepted contacts across all links and existing collection links—with plain status text, a clear limit-reaching message, and a direct path to review available plans. The admin workspace should add a dedicated Plans & subscriptions section with scannable tier cards, editable quota and price fields, a searchable account assignment panel, explicit active/inactive or renewal status, and safe inline confirmation; keep these controls behind the existing admin role. Use the established paper panels, ruled dividers, evergreen primary actions, sage progress tracks and small citron accents. Keep all billing status legible in dark mode and at mobile widths; never display payment secrets or card data.


## Email sign-in and account creation

Keep the authentication screen inside Open Ledger: a calm warm-paper canvas, compact Cardora mark/wordmark, centered white/ivory card, editorial serif title, plainly labeled email/password fields, clear primary action, and a direct sign-in/sign-up mode switch. Keep the current session and migration constraints visible in plain language—email is not verified by this flow, and pre-existing accounts are migrated separately. Continue the persistent light/dark palette, visible focus rings, mobile-safe spacing and reduced-motion behavior; do not introduce a third-party OAuth button.
