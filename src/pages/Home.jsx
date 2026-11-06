import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { num } from '../lib/format'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'

const TILES = [['tile_sale', '🧾', '/sale'], ['tile_report', '💰', '/report'], ['tile_jobs', '⌨️', '/jobs'], ['tile_sessions', '⏱️', '/sessions'], ['tile_stock', '📦', '/stock']]

export default function Home() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const [low, setLow] = useState([])
  useEffect(() => {
    supabase.from('stock_items').select('name, quantity, low_threshold, unit').eq('active', true)
      .then(({ data }) => setLow((data || []).filter((i) => Number(i.quantity) <= Number(i.low_threshold))))
  }, [])
  return (
    <section>
      <h1>{t('hello')}, {profile.full_name.split(' ')[0]} 👋</h1>
      <p className="muted">{t('home_intro')} <span className="pill">{t('role_' + profile.role)}</span></p>
      {low.length > 0 && <Link to="/stock" className="alert block">⚠️ {t('low_stock_alert')} {low.map((i) => `${i.name} (${num(i.quantity)} ${i.unit})`).join(', ')}</Link>}
      <div className="tiles">
        {TILES.map(([k, icon, to]) => to ? (
          <Link key={k} to={to} className="tile"><span className="ico">{icon}</span><b>{t(k)}</b></Link>
        ) : (
          <div key={k} className="tile disabled"><span className="ico">{icon}</span><b>{t(k)}</b><span className="muted small">{t('soon')}</span></div>
        ))}
      </div>
    </section>
  )
}
