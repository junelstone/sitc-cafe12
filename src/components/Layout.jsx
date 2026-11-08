import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import LangSwitch from './LangSwitch.jsx'
import BizLogo from './BizLogo.jsx'
import TrialBanner from './TrialBanner.jsx'
import { useBusiness } from '../lib/business.jsx'
import OfflineBar from './OfflineBar.jsx'
import InstallButton from './InstallButton.jsx'

const PRO_ONLY = ['/customers', '/vouchers', '/reports']

export default function Layout({ locked = false }) {
  const { profile, isAdmin, signOut } = useAuth()
  const { t } = useI18n()
  const { isPlatform, biz } = useBusiness()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(null)
  const navRef = useRef(null)

  // Close the open menu after a page change, a click elsewhere, or Escape.
  useEffect(() => { setOpen(null) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!navRef.current?.contains(e.target)) setOpen(null) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const allowed = ([to]) => biz?.plan === 'pro' || !PRO_ONLY.includes(to)
  const groups = locked
    ? [{ to: '/subscription', k: 'nav_subscription' }]
    : [
        { to: '/', k: 'nav_home' },
        { k: 'grp_sales', items: [['/sale', 'nav_sale'], ['/jobs', 'nav_jobs'], ['/sessions', 'nav_sessions'], ['/vouchers', 'nav_vouchers'], ['/customers', 'nav_customers']] },
        { k: 'grp_cash', items: [['/report', 'nav_report'], ['/drawer', 'nav_drawer'], ['/expenses', 'nav_expenses']] },
        { k: 'grp_manage', items: [['/stock', 'nav_stock'], ...(isAdmin ? [['/reports', 'nav_reports'], ['/services', 'nav_services'], ['/staff', 'nav_staff'], ['/settings', 'nav_settings'], ['/subscription', 'nav_subscription']] : [])] },
        ...(isPlatform ? [{ to: '/platform', k: 'nav_platform' }] : []),
      ]

  return (
    <div className="shell">
      <header className="top no-print">
        <div className="brand"><BizLogo /></div>
        <nav ref={navRef}>
          {groups.map((g) => {
            if (g.to) return <NavLink key={g.k} to={g.to} end>{t(g.k)}</NavLink>
            const items = g.items.filter(allowed)
            if (!items.length) return null
            const here = items.some(([to]) => pathname === to)
            const isOpen = open === g.k
            return (
              <div key={g.k} className={'dd' + (isOpen ? ' open' : '')}>
                <button type="button" className={'dd-btn' + (here ? ' active' : '')} aria-haspopup="true" aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : g.k)}>
                  {t(g.k)} <span className="caret" aria-hidden="true">▾</span>
                </button>
                {isOpen && (
                  <div className="dd-menu" role="menu">
                    {items.map(([to, k]) => <NavLink key={to} to={to} end role="menuitem">{t(k)}</NavLink>)}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="who">
          <InstallButton />
          <LangSwitch />
          <span className="muted small">{profile.full_name}</span>
          <button className="btn ghost small" onClick={signOut}>{t('signOut')}</button>
        </div>
      </header>
      <TrialBanner />
      <OfflineBar />
      <main><Outlet /></main>
    </div>
  )
}
