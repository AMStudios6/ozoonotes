import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import './SitePages.css'

export type SiteRoute = 'home' | 'product' | 'pricing' | 'dashboard' | 'roadmaps' | 'contact' | 'notes' | 'signin' | 'profile' | 'admin'

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
  return <main className="site-page site-content-page" data-theme={theme}><SiteHeader logo={logo} theme={theme} onNavigate={onNavigate} onThemeChange={onThemeChange} user={user}/><section className="contact-wrap"><span className="site-eyebrow">WE’D LIKE TO HEAR FROM YOU</span><h1>Contact OzooNotes</h1><p>Have a question, found a problem, or want to suggest what we build next? Choose the route that works for you.</p><div className="contact-options"><a href="https://www.instagram.com/ozoonotes/" target="_blank" rel="noreferrer"><span>◎</span><strong>Message us on Instagram</strong><small>For general questions and updates</small><b>Open Instagram ↗</b></a><a href="https://github.com/AMStudios6/ozoonotes/issues/new" target="_blank" rel="noreferrer"><span>⌘</span><strong>Report an issue or request a feature</strong><small>Include steps to reproduce a