import { Navigate, Route, Routes } from 'react-router-dom'
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

export default function App() {
  const { session, profile, loading, isAdmin, signOut } = useAuth()
  const { t } = useI18n()

  if (loading) return <div className="center muted">…</div>
  if (!session) return <Login />
  if (!profile?.active) return (
    <div className="center"><div className="card narrow"><p>{t('inactive')}</p>
      <button className="btn" onClick={signOut}>{t('signOut')}</button></div></div>
  )

  const adminOnly = (el) => (isAdmin ? el : <Navigate to="/" replace />)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="sale" element={<Sale />} />
        <Route path="report" element={<Report />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="stock" element={<Stock />} />
        <Route path="drawer" element={<Drawer />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="services" element={adminOnly(<Services />)} />
        <Route path="reports" element={adminOnly(<Reports />)} />
        <Route path="staff" element={adminOnly(<Staff />)} />
        <Route path="settings" element={adminOnly(<Settings />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
