import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import { useI18n } from './lib/i18n.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Services from './pages/Services.jsx'
import Staff from './pages/Staff.jsx'
import Settings from './pages/Settings.jsx'
import Sale from './pages/Sale.jsx'
import Report from './pages/Report.jsx'
import Jobs from './pages/Jobs.jsx'
import Sessions from './pages/Sessions.jsx'
import Stock from './pages/Stock.jsx'
import Drawer from './pages/Drawer.jsx'
import Expenses from './pages/Expenses.jsx'
import Reports from './pages/Reports.jsx'
import Vouchers from './pages/Vouchers.jsx'
import Customers from './pages/Customers.jsx'
import Landing from './pages/Landing.jsx'
import Signup from './pages/Signup.jsx'
import Subscription from './pages/Subscription.jsx'
import Platform from './pages/Platform.jsx'
import Cashiers from './pages/Cashiers.jsx'
import Menu from './pages/Menu.jsx'
import { useBusiness } from './lib/business.jsx'

export default function App() {
  const { session, profile, loading, isAdmin, signOut } = useAuth()
  const { t } = useI18n()
  const { biz, access, isPlatform } = useBusiness()
  const { pathname } = useLocation()

  // Public price list (QR code): works signed in or not.
  if (pathname.startsWith('/menu/')) return <Routes><Route path="menu/:id" element={<Menu />} /></Routes>
  if (loading) return <div className="center muted">…</div>
  if (!session) return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
  if (!profile?.active) return (
    <div className="center"><div className="card narrow"><p>{t('inactive')}</p>
      <button className="btn" onClick={signOut}>{t('signOut')}</button></div></div>
  )

  if (!biz) return <div className="center muted">…</div>
  const adminOnly = (el) => (isAdmin ? el : <Navigate to="/" replace />)
  const pro = (el) => (biz.plan === 'pro' ? el : <Navigate to="/subscription" replace />)

  // Trial or subscription over: the admin can only pay; staff wait for the admin.
  if (access !== 'ok' && !isPlatform) {
    if (!isAdmin) return (
      <div className="center"><div className="card narrow"><p>{t(access === 'suspended' ? 'suspended_msg' : 'expired_staff')}</p>
        <button className="btn" onClick={signOut}>{t('signOut')}</button></div></div>
    )
    return (
      <Routes>
        <Route element={<Layout locked />}>
          <Route path="subscription" element={<Subscription />} />
          <Route path="*" element={<Navigate to="/subscription" replace />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="sale" element={<Sale />} />
        <Route path="report" element={<Report />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="stock" element={<Stock />} />
        <Route path="customers" element={pro(<Customers />)} />
        <Route path="vouchers" element={pro(<Vouchers />)} />
        <Route path="drawer" element={<Drawer />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="services" element={adminOnly(<Services />)} />
        <Route path="reports" element={adminOnly(pro(<Reports />))} />
        <Route path="cashiers" element={adminOnly(pro(<Cashiers />))} />
        <Route path="staff" element={adminOnly(<Staff />)} />
        <Route path="settings" element={adminOnly(<Settings />)} />
        <Route path="subscription" element={adminOnly(<Subscription />)} />
        <Route path="platform" element={isPlatform ? <Platform /> : <Navigate to="/" replace />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
