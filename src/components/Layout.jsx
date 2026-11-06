import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import LangSwitch from './LangSwitch.jsx'

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const { t } = useI18n()
  const links = [['/', 'nav_home'], ['/sale', 'nav_sale'], ['/jobs', 'nav_jobs'], ['/sessions', 'nav_sessions'], ['/vouchers', 'nav_vouchers'], ['/stock', 'nav_stock'], ['/report', 'nav_report'], ['/drawer', 'nav_drawer'], ['/expenses', 'nav_expenses'], ...(isAdmin ? [['/reports', 'nav_reports'], ['/services', 'nav_services'], ['/staff', 'nav_staff'], ['/settings', 'nav_settings']] : [])]
  return (
    <div className="shell">
      <header className="top no-print">
        <div className="brand"><img className="logo" src="/logo.png" alt="Stone's IT Consulting" /><span>{t('appName')}</span></div>
        <nav>{links.map(([to, k]) => <NavLink key={to} to={to} end>{t(k)}</NavLink>)}</nav>
        <div className="who">
          <LangSwitch />
          <span className="muted small">{profile.full_name}</span>
          <button className="btn ghost small" onClick={signOut}>{t('signOut')}</button>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  )
}
