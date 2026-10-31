import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import './SitePages.css'

export type SiteRoute = 'home' | 'product' | 'pricing' | 'dashboard' | 'dashboard-options' | 'diary' | 'roadmaps' | 'resources' | 'books' | 'watchlist' | 'contact' | 'signin' | 'profile' | 'account' | 'admin'

export type DashboardOptionId = 'projects' | 'simulation' | 'infiniteBoard' | 'diary' | 'roadmaps' | 'resources' | 'books' | 'watchlist'
export const dashboardOptionChoices: { id: DashboardOptionId; title: string; description: string; icon: string }[] = [
  { id: 'projects', title: 'Projects', description: 'Write longer reports and keep project materials together.', icon: '▧' },
  { id: 'simulation', title: 'Simulators', description: 'Open electronics, graphing, calculus, and coding tools.', icon: '⌁' },
  { id: 'infiniteBoard', title: 'Infinite board', description: 'Sketch and organize ideas on an open canvas.', icon: '∞' },
  { id: 'diary', title: 'Diary', description: 'Keep private daily entries in your workspace.', icon: '▤' },
  { id: 'roadmaps', title: 'Road maps', description: 'Create or explore community learning plans.', icon: '⌖' },
  { id: 'resources', title: 'Resources', description: 'Browse and share video collections.', icon: '▶' },
  { id: 'books', title: 'Books to read', description: 'Keep track of books you want to read.', icon: '▤' },
  { id: 'watchlist', title: 'Movies & series', description: 'Save titles you want to watch.', icon: '▣' },
]

type SharedProps = {
  logo: string
  theme: string
  onNavigate: (target: string) => void
  onThemeChange: (theme: 'purple' | 'white-purple') => void
  user: { username: string; displayName?: string; avatar?: string | null } | null
}

function routeLink(target: string, onNavigate: (target: string) => void) {
  return (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onNavigate(target)
  }
}

function SiteHeader({ logo, theme, onNavigate, onThemeChange, user }: SharedProps) {
  return <header className="site-header">
    <a className="site-brand" href="/" onClick={routeLink('home', onNavigate)} aria-label="OzooNotes home"><img src={logo} alt="OzooNotes" /></a>
    <nav className="site-nav" aria-label="Main navigation">
      <a href="/?page=dashboard" onClick={routeLink('dashboard', onNavigate)}>Dashboard</a>
      <details className="product-menu"><summary>Product <span aria-hidden="true">⌄</span></summary><div className="product-menu-panel">
        <a href="/?page=product#what-we-offer" onClick={routeLink('product#what-we-offer', onNavigate)}><b>What we offer</b><small>Notes, boards, and study tools</small></a>
        <a href="/?page=product#our-goal" onClick={routeLink('product#our-goal', onNavigate)}><b>Our goal</b><small>A shared space to learn and teach</small></a>
        <a href="/?page=product#future" onClick={routeLink('product#future', onNavigate)}><b>What’s ahead</b><small>Ideas we plan to build gradually</small></a>
      </div></details>
      <a href="/?page=pricing" onClick={routeLink('pricing', onNavigate)}>Pricing</a>
      <a href="/?page=roadmaps" onClick={routeLink('roadmaps', onNavigate)}>Road map</a>
      <a href="/?page=contact" onClick={routeLink('contact', onNavigate)}>Contact</a>
    </nav>
    <div className="site-header-actions"><label className="site-theme-picker"><span>Theme</span><select aria-label="Color theme" value={theme} onChange={(event) => onThemeChange(event.target.value as 'purple' | 'white-purple')}><option value="purple">Purple &amp; Black</option><option value="white-purple">White &amp; Purple</option></select></label>{user ? <a className="site-signin site-account-link" href="/?page=profile" onClick={routeLink('profile', onNavigate)} aria-label={`Edit profile for ${user.username}`} title={`Signed in as ${user.username}`}>{user.avatar ? <img src={user.avatar} alt="" /> : <span className="site-account-initial" aria-hidden="true">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span>}<span className="site-account-name">{user.displayName || user.username}</span></a> : <a className="site-signin" href="/?page=signin" onClick={routeLink('signin', onNavigate)}>Sign in <span aria-hidden="true">↗</span></a>}</div>
  </header>
}

function SiteFooter({ logo, onNavigate }: Pick<SharedProps, 'logo' | 'onNavigate'>) {
  return <footer className="site-footer">
    <a className="site-footer-brand" href="/" onClick={routeLink('home', onNavigate)}><img src={logo} alt="OzooNotes" /><span>Make space for the way you think.</span></a>
    <nav aria-label="Footer links"><a href="/?page=product" onClick={routeLink('product', onNavigate)}>Product</a><a href="/?page=pricing" onClick={routeLink('pricing', onNavigate)}>Pricing</a><a href="/?page=dashboard" onClick={routeLink('dashboard', onNavigate)}>Dashboard</a><a href="/?page=contact" onClick={routeLink('contact', onNavigate)}>Contact</a><a href="https://github.com/AMStudios6/ozoonotes/issues/new" target="_blank" rel="noreferrer">Send feedback</a><a href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer" aria-label="OzooNotes on GitHub" title="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.51-1.3-1.24-1.65-1.24-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.62 1.22 3.26.93.1-.73.39-1.22.71-1.5-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.27-2.6 5.21-5.08 5.49.4.35.76 1.02.76 2.06v3.1c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg></a><a href="https://www.instagram.com/ozoonotes/" target="_blank" rel="noreferrer" aria-label="OzooNotes on Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg></a></nav>
    <small>© {new Date().getFullYear()} OzooNotes · Your ideas stay yours.</small>
  </footer>
}

export function ContactPage({ logo, theme, onNavigate, onThemeChange, user }: SharedProps) {
  return <main className="site-page site-content-page" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/><section className="contact-wrap"><span className="site-eyebrow">WE’D LIKE TO HEAR FROM YOU</span><h1>Contact OzooNotes</h1><p>Have a question, found a problem, or want to suggest what we build next? Choose the route that works for you.</p><div className="contact-options"><a href="https://www.instagram.com/ozoonotes/" target="_blank" rel="noreferrer"><span>◎</span><strong>Message us on Instagram</strong><small>For general questions and updates</small><b>Open Instagram ↗</b></a><a href="https://github.com/AMStudios6/ozoonotes/issues/new" target="_blank" rel="noreferrer"><span>⌘</span><strong>Report an issue or request a feature</strong><small>Include steps to reproduce a problem, or describe your idea</small><b>Open GitHub ↗</b></a></div><p className="contact-note">Please don’t include passwords, payment details, or private notes in a support message.</p></section><SiteFooter logo={logo} onNavigate={onNavigate}/></main>
}

export function DashboardOptionsPage({ theme, options, saving, error, canGoBack, onSave, onBack }: {
  theme: string
  options: DashboardOptionId[]
  saving: boolean
  error: string
  canGoBack: boolean
  onSave: (options: DashboardOptionId[]) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<DashboardOptionId[]>(options)
  const toggle = (id: DashboardOptionId) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  return <main className="dashboard-options-page" data-theme={theme}>
    <div className="dashboard-options-shell">
      {canGoBack && <button className="dashboard-options-back" type="button" onClick={onBack}>← <span>Dashboard</span></button>}
      <header className="dashboard-options-heading"><span className="site-eyebrow">MAKE IT YOURS</span><h1>Choose your workspace.</h1><p>Pick the tools you want in your dashboard. You can change these choices later, and they’ll stay with your account on every device.</p></header>
      <div className="dashboard-options-controls"><span>{selected.length} of {dashboardOptionChoices.length} tools selected</span><div><button type="button" onClick={() => setSelected(dashboardOptionChoices.map((choice) => choice.id))}>Select all</button><button type="button" onClick={() => setSelected([])}>Clear</button></div></div>
      <section className="dashboard-options-grid" aria-label="Dashboard tools">{dashboardOptionChoices.map((choice) => <label key={choice.id} className={'dashboard-option-card' + (selected.includes(choice.id) ? ' selected' : '')}>
        <input type="checkbox" checked={selected.includes(choice.id)} onChange={() => toggle(choice.id)} />
        <span className="dashboard-option-icon" aria-hidden="true">{choice.icon}</span><span className="dashboard-option-copy"><strong>{choice.title}</strong><small>{choice.description}</small></span><span className="dashboard-option-check" aria-hidden="true">✓</span>
      </label>)}</section>
      <p className="dashboard-options-note"><strong>Your notes stay available.</strong> This only changes which optional tools appear in your dashboard navigation.</p>
      {error && <p className="dashboard-options-error" role="alert">{error}</p>}
      <footer className="dashboard-options-footer"><button type="button" className="dashboard-options-save" disabled={saving} onClick={() => onSave(selected)}>{saving ? 'Saving your choices…' : 'Save and continue'} <span aria-hidden="true">→</span></button><small>Saved securely to your OzooNotes account.</small></footer>
    </div>
  </main>
}

function AppPreview() {
  return <div className="site-preview" aria-label="Illustration of the OzooNotes workspace">
    <div className="preview-top"><span className="preview-dots"><i/><i/><i/></span><b>OzooNotes</b><span className="preview-save">Saved locally</span></div>
    <div className="preview-body"><aside><span>✎</span><span>⌖</span><span>▱</span><span>T</span><span>⌘</span></aside><div className="preview-paper"><span className="preview-label">BIOLOGY · CELL STRUCTURE</span><strong>One idea,<br/>many connections.</strong><svg viewBox="0 0 260 120" aria-hidden="true"><path d="M8 72c26-2 25-44 52-40 28 4 14 58 48 54 29-4 25-43 50-45 35-3 22 45 55 34 16-6 22-22 38-35"/><circle cx="62" cy="32" r="6"/><circle cx="160" cy="41" r="6"/><circle cx="213" cy="77" r="6"/></svg><div className="preview-lines"><i/><i/><i/></div></div><div className="preview-notes"><b>Class notes</b><i/><i/><i/><span>+ Add a page</span></div></div>
    <div className="preview-caption"><span/> A page that grows with your thinking</div>
  </div>
}

export function MarketingHome({ logo, theme, onNavigate, onThemeChange, user }: SharedProps) {
  return <main className="site-page site-home" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/>
    <section className="site-hero"><div className="site-hero-copy"><span className="site-eyebrow"><i/> NOTES · IDEAS · LEARNING</span><h1>Just imagine,<br/><em>and it will do it.</em></h1><p>A playful, flexible workspace for handwritten notes, diagrams, projects, and the ideas you’re still figuring out.</p><div className="site-hero-actions"><a className="site-button site-button-primary" href="/?page=dashboard" onClick={routeLink('dashboard',onNavigate)}>Open your dashboard <span>→</span></a><a className="site-button site-button-quiet" href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer">Explore on GitHub ↗</a></div><div className="site-hero-foot"><span>Start free, no account required.</span><span>Built for learning and making.</span></div></div><div className="site-hero-art"><div className="site-orbit orbit-a"/><div className="site-orbit orbit-b"/><span className="hero-sticker sticker-star">✳</span><span className="hero-sticker sticker-spark">✦</span><AppPreview/><div className="hero-note-chip">A thought is a good place to start <span>↗</span></div></div></section>
    <section className="site-showcase"><div className="site-section-intro"><span className="site-eyebrow">A WORKSPACE IN MOTION</span><h2>Let the idea take shape.</h2><p>Write in your own way, then connect notes, sketches, and useful tools as you go.</p></div><AppPreview/></section>
    <section className="site-features"><div className="site-section-intro"><span className="site-eyebrow">THREE WAYS TO THINK</span><h2>From first thought to clearer picture.</h2></div><div className="site-feature-grid"><article><span className="site-feature-icon">✎</span><small>01 · CAPTURE</small><h3>Get it out of your head.</h3><p>Write, draw, add images, or save a link in a page that feels open and easy to use.</p></article><article><span className="site-feature-icon">⌘</span><small>02 · CONNECT</small><h3>See how it fits together.</h3><p>Use shapes, tags, notebooks, project pages, and simulators to bring related ideas together.</p></article><article><span className="site-feature-icon">↗</span><small>03 · KEEP MOVING</small><h3>Take your work with you.</h3><p>Organize your notes and export finished work when you need to share or print it.</p></article></div></section>
    <section className="site-plan-teaser"><div className="site-section-intro"><span className="site-eyebrow">A PLAN FOR EVERY STAGE</span><h2>Begin simply. Grow when you’re ready.</h2></div><div className="site-teaser-grid"><article><span className="plan-pill">STANDARD · FREE</span><h3>A good place to begin.</h3><p>Use the dashboard without signing in. Your everyday notes stay saved in your browser.</p><a className="site-button site-button-quiet" href="/?page=dashboard" onClick={routeLink('dashboard',onNavigate)}>Start for free <span>→</span></a></article><article className="teaser-pro"><span className="plan-pill">CLASS PLUS · $3.99/MO</span><h3>More room for learning.</h3><p>Cloud backup, unlimited notes, more templates, sharing, and collaboration for students and teachers.</p><a className="site-button site-button-primary" href="/?page=pricing" onClick={routeLink('pricing',onNavigate)}>See Class Plus <span>→</span></a></article><article className="teaser-business"><span className="plan-pill">BUSINESS · $9.99/MO</span><h3>Bring a team together.</h3><p>Shared team workspaces, member roles, business templates, and collaboration tools.</p><a className="site-button site-button-quiet" href="/?page=pricing" onClick={routeLink('pricing',onNavigate)}>See Business <span>→</span></a></article></div><p className="site-plan-note">Class Plus and Business prices are previews. Checkout is not active yet.</p></section>
    <section className="site-last-cta"><span className="site-eyebrow">YOUR NEXT IDEA IS WAITING</span><h2>Think through it.<br/><em>See the whole picture.</em></h2><a className="site-button site-button-primary" href="/?page=dashboard" onClick={routeLink('dashboard',onNavigate)}>Go to dashboard <span>→</span></a></section>
    <SiteFooter logo={logo} onNavigate={onNavigate}/>
  </main>
}

export function ProductPage({ logo, theme, onNavigate, onThemeChange, user }: SharedProps) {
  return <main className="site-page site-content-page" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/><article className="product-story">
    <header className="story-hero"><span className="site-eyebrow">A LITTLE ROOM TO THINK</span><h1>What we offer</h1><p>One workspace to collect thoughts, make visual notes, and build ideas into something you can explain.</p></header>
    <section id="what-we-offer" className="story-section story-offer"><div><span className="site-eyebrow">01 · THE TOOLKIT</span><h2>What we offer</h2><p>OzooNotes brings a flexible note canvas together with projects and learning tools. Write with a pen or brush, arrange shapes and images, use multiple pages, and export your work. Keep notes organized with notebooks and tags. Explore separate simulators for graphs, code, electronics, and calculus.</p><p>Use the dashboard as a guest for local notes, or sign in when you want an account-based feature such as cloud storage and sharing.</p></div><div className="story-card-stack"><div className="story-mini-card"><span>✎</span><b>Notes &amp; boards</b><small>Write, draw, arrange, export</small></div><div className="story-mini-card"><span>⌘</span><b>Projects</b><small>Build a story around your work</small></div><div className="story-mini-card"><span>ƒ</span><b>Simulators</b><small>Explore equations, code, circuits</small></div></div></section>
    <section id="our-goal" className="story-section story-goal"><div className="story-number">02</div><div><span className="site-eyebrow">WHY WE’RE BUILDING IT</span><h2>Our goal</h2><p>Students should have a calm place to take notes, collect sources, and make hard topics easier to see. Teachers should be able to prepare visual lessons and explain ideas on a board. Over time, we want those tools to make it easier for teachers to teach, share useful learning material, and earn from their work—while students can learn from it in the same space.</p><p>We’re building toward that goal gradually, with practical tools first and room for the community to shape what comes next.</p></div></section>
    <section id="future" className="story-section story-future"><div><span className="site-eyebrow">03 · THE ROAD AHEAD</span><h2>What to expect in the future</h2><p>We plan to grow OzooNotes carefully, based on what students and teachers actually need.</p><div className="future-list"><div><span>Next</span><b>Better organization</b><small>Smarter tags, notebooks, and study folders.</small></div><div><span>Later</span><b>Classroom sharing</b><small>More reliable shared lessons and group work.</small></div><div><span>Exploring</span><b>Teacher resources</b><small>A way to publish and discover teaching material.</small></div><div><span>Exploring</span><b>More exports and templates</b><small>Reusable layouts for notes, projects, and lessons.</small></div></div><p className="roadmap-note">These are planned ideas, not promises or current features.</p></div><div className="future-art"><span>✦</span><div className="future-art-paper"><i/><i/><i/><b>Idea → lesson → understanding</b><svg viewBox="0 0 200 80" aria-hidden="true"><path d="M8 60c25-12 26-45 54-44s20 44 47 44 26-42 48-43 18 24 36 16"/></svg></div></div></section>
    <div className="story-cta"><h2>Give your next idea some space.</h2><a className="site-button site-button-primary" href="/?page=dashboard" onClick={routeLink('dashboard',onNavigate)}>Open dashboard →</a></div>
  </article><SiteFooter logo={logo} onNavigate={onNavigate}/></main>
}

const standardFeatures = ['Free, no sign-in required', 'Up to 5 note documents', 'Infinite board saved in this browser', '2 launches per simulator each day', 'Basic notebooks and tags', 'Starter templates', 'One shared document when signed in', 'Local saving and standard exports']
const classPlusFeatures = ['Unlimited note documents and simulators', 'All built-in templates and custom templates', 'Expanded project and study organization', 'Cloud backup for your work', 'Share notes with view or edit access', 'Comments, collaboration, timer, and recording', 'PDF and document exports', 'For students and teachers']
const businessFeatures = ['Everything in Class Plus', 'Shared team workspace for projects and notes', 'Team member roles and access controls', 'Reusable business templates for meetings, plans, and reports', 'Team comments and collaboration', 'Organize work by team and project', 'PDF and document exports for sharing', 'For small businesses, teams, and employees']

export function PricingPage({ logo, theme, onNavigate, onThemeChange, user }: SharedProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  return <main className="site-page site-content-page" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/><div className="pricing-wrap">
    <header className="pricing-hero"><span className="site-eyebrow">PLANS FOR LEARNING AND WORK</span><h1>Choose your room to grow.</h1><p>Start with Standard, then choose Class Plus or Business when you need more room and shared tools.</p><div className="billing-toggle" role="group" aria-label="Billing period"><button className={billing==='monthly'?'selected':''} onClick={()=>setBilling('monthly')}>Monthly</button><button className={billing==='yearly'?'selected':''} onClick={()=>setBilling('yearly')}>Yearly <span>Save 2 months</span></button></div></header>
    <section className="pricing-cards pricing-cards-three"><article className="pricing-card"><div className="pricing-card-top"><span className="plan-pill">STANDARD</span><span className="pricing-spark">✳</span></div><h2>Free</h2><p className="price-caption">For everyday notes and learning.</p><div className="plan-price"><strong>$0</strong><span>forever</span></div><a className="site-button site-button-quiet" href="/?page=dashboard" onClick={routeLink('dashboard',onNavigate)}>Use Standard <span>→</span></a><ul>{standardFeatures.map((feature)=><li key={feature}><i>✓</i>{feature}</li>)}</ul></article><article className="pricing-card pricing-card-pro"><div className="pricing-card-top"><span className="plan-pill">CLASS PLUS</span><span className="pricing-spark">✦</span></div><h2>More room to grow.</h2><p className="price-caption">For students and teachers who need cloud access and shared work.</p><div className="plan-price"><strong>{billing==='monthly'?'$3.99':'$39.99'}</strong><span>/{billing==='monthly'?'month':'year'}</span></div>{billing==='yearly'&&<small className="price-monthly-note">About $3.33 per month, billed yearly.</small>}<button className="site-button site-button-primary pro-coming" type="button" disabled>Class Plus billing is coming soon</button><ul>{classPlusFeatures.map((feature)=><li key={feature}><i>✓</i>{feature}</li>)}</ul></article><article className="pricing-card pricing-card-business"><div className="pricing-card-top"><span className="plan-pill">BUSINESS</span><span className="pricing-spark">◈</span></div><h2>Work together.</h2><p className="price-caption">For small businesses, teams, and employees.</p><div className="plan-price"><strong>{billing==='monthly'?'$9.99':'$99.99'}</strong><span>/{billing==='monthly'?'month':'year'}</span></div>{billing==='yearly'&&<small className="price-monthly-note">About $8.33 per month, billed yearly.</small>}<button className="site-button site-button-primary pro-coming" type="button" disabled>Business billing is coming soon</button><ul>{businessFeatures.map((feature)=><li key={feature}><i>✓</i>{feature}</li>)}</ul></article></section>
    <p className="pricing-fineprint">Class Plus and Business prices are previews. Checkout and paid upgrades have not been connected. Team features and business templates will be introduced as they are ready.</p>
    <section className="pricing-comparison"><span className="site-eyebrow">SIDE BY SIDE</span><h2>What changes as you grow?</h2><div className="comparison-scroll"><table><thead><tr><th>Included</th><th>Standard · Free</th><th>Class Plus · {billing==='monthly'?'$3.99/mo':'$39.99/yr'}</th><th>Business · {billing==='monthly'?'$9.99/mo':'$99.99/yr'}</th></tr></thead><tbody>{[['Documents','Up to 5','Unlimited','Unlimited'],['Simulators','2 launches per simulator/day','Unlimited','Unlimited'],['Saving','In this browser','Cloud backup','Cloud backup'],['Templates','Starter set','All + custom','All + business templates'],['Organization','Basic tags and notebooks','Expanded study and project organization','Team and project organization'],['Sharing','One shared document','More shared documents','Team access controls'],['Team tools','—','Comments and collaboration','Team collaboration and member roles'],['Export','Standard formats','PDF and document export','PDF and document export'],['Screen recording & timer','—','Included','Included']].map(([what, standard, plus, business])=><tr key={what}><th>{what}</th><td>{standard}</td><td>{plus}</td><td>{business}</td></tr>)}</tbody></table></div></section>
  </div><SiteFooter logo={logo} onNavigate={onNavigate}/></main>
}

export type AdminAccount = { id: number; username: string; email?: string | null; plan: 'normal' | 'pro'; businessPlan?: boolean; accountType?: string; createdAt: string; cloudBoards: number }

export function AdminPage({ logo, theme, onNavigate, onThemeChange, user, users, totals, loading, error, onRefresh, onChangePlan }: SharedProps & {
  users: AdminAccount[]
  totals: { users: number; proUsers: number }
  loading: boolean
  error: string
  onRefresh: () => void
  onChangePlan: (id: number, plan: 'normal' | 'pro' | 'business') => void
}) {
  return <main className="site-page site-content-page admin-page" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/><section className="admin-wrap">
    <div className="admin-heading"><div><span className="site-eyebrow">PRIVATE ACCOUNT TOOLS</span><h1>Admin dashboard</h1><p>Review accounts and manage plan access.</p></div><button className="site-button site-button-quiet" onClick={onRefresh}>↻ Refresh</button></div>
    <div className="admin-stat-grid"><article><small>Registered accounts</small><strong>{totals.users}</strong></article><article><small>Class Plus and Business access</small><strong>{totals.proUsers}</strong></article><article><small>Admin tools</small><strong>Protected</strong></article></div>
    {error && <div className="admin-message" role="alert">{error}</div>}{loading ? <div className="admin-empty">Loading account list…</div> : users.length ? <div className="admin-table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Joined</th><th>Cloud boards</th><th>Plan access</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><b>{user.username}</b><small>{user.email || 'No email on file'}</small></td><td>{user.accountType || 'Student'}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.cloudBoards}</td><td><select aria-label={`Plan for ${user.username}`} value={user.businessPlan ? 'business' : user.plan === 'pro' ? 'pro' : 'normal'} onChange={(event)=>onChangePlan(user.id,event.target.value as 'normal'|'pro'|'business')}><option value="normal">Standard · Free</option><option value="pro">Class Plus</option><option value="business">Business</option></select></td></tr>)}</tbody></table></div> : <div className="admin-empty">{error ? 'Admin data is unavailable.' : 'No accounts found.'}</div>}
    <p className="admin-note">Changing a plan grants or removes its feature access. Payment collection is not connected yet.</p>
  </section><SiteFooter logo={logo} onNavigate={onNavigate}/></main>
}
