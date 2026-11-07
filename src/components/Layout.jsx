import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import LangSwitch from './LangSwitch.jsx'
import BizLogo from './BizLogo.jsx'
import TrialBanner from './TrialBanner.jsx'
import { useBusiness } from '../lib/business.jsx'
import OfflineBar from './OfflineBar.jsx'
import InstallButton from './InstallButton.jsx'

export default function Layout({ locked = false }) {
  const { profile, isAdmin, signOut } = useAuth()
  const { t } = useI18n()
  const { isPlatform, biz } = useBusiness()
  const PRO_ONLY = ['/customers', '/vouchers', '/reports']
  const links = [['/', 'nav_home'], ['/sale', 'nav_sale'], ['/jobs', 'nav_jobs'], ['/customers', 'nav_customers'], ['/sessions', 'nav_sessions'], ['/vouchers', 'nav_vouchers'], ['/stock', 'nav_stock'], ['/report', 'nav_report'], ['/drawer', 'nav_drawer'], ['/expenses', 'nav_expenses'], ...(isAdmin ? [['/reports', 'nav_reports'], ['/services', 'nav_services'], ['/staff', 'nav_staff'], ['/settings', 'nav_settings'], ['/subscription', 'nav_subscription']] : []), ...(isPlatform ? [['/platform', 'nav_platform']] : [])]
  const shown = locked ? [['/subscription', 'nav_subscription']] : links.filter(([to]) => biz?.plan === 'pro' || !PRO_ONLY.includes(to))
  return (
    <div className="shell">
      <header className="top no-print">
        <div className="brand"><BizLogo /></div>
        <nav>{shown.map(([to, k]) => <NavLink key={to} to={to} end>{t(k)}</NavLink>)}</nav>
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
