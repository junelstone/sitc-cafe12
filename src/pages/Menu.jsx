import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES, useI18n } from '../lib/i18n.jsx'
import LangSwitch from '../components/LangSwitch.jsx'

// Public price list a customer opens by scanning the café's QR code. No sign-in needed.
export default function Menu() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const [m, setM] = useState(undefined)

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { setM(null); return }
    supabase.rpc('public_menu', { cafe: id }).then(({ data, error }) => setM(error ? null : data))
  }, [id])

  if (m === undefined) return <div className="center muted">…</div>
  if (!m) return <div className="center"><div className="card narrow"><p>{t('menu_unavailable')}</p></div></div>

  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
  const price = (n) => `${nf.format(n)} ${m.currency || 'F CFA'}`
  const nm = (s) => (lang === 'fr' ? s.name_fr : s.name_en || s.name_fr)
  const un = (s) => (lang === 'fr' ? s.unit_fr : s.unit_en || s.unit_fr)
  const groups = CATEGORIES.map((c) => [c, m.services.filter((s) => s.category === c)]).filter(([, l]) => l.length)

  return (
    <div className="menu-page">
      <header className="menu-head">
        <div className="row end"><LangSwitch /></div>
        {m.logo_url && <img className="menu-logo" src={m.logo_url} alt="" />}
        <h1>{m.name}</h1>
        <p className="muted">{[m.address, m.city].filter(Boolean).join(', ')}</p>
        {m.phone && <a className="btn small" href={'tel:' + m.phone.replace(/\s/g, '')}>📞 {m.phone}</a>}
      </header>
      <h2 className="menu-title">{t('price_list')}</h2>
      {groups.map(([c, list]) => (
        <div key={c} className="card menu-group">
          <h3>{t('cat_' + c)}</h3>
          {list.map((s, i) => (
            <div key={i} className="menu-line"><span>{nm(s)}</span><span className="dots" /><b>{price(s.price)}</b><span className="muted small">/ {un(s)}</span></div>
          ))}
        </div>
      ))}
      {m.wifi.length > 0 && (
        <div className="card menu-group">
          <h3>📶 Wi-Fi</h3>
          {m.wifi.map((w, i) => <div key={i} className="menu-line"><span>{nm(w)}</span><span className="dots" /><b>{price(w.price)}</b></div>)}
        </div>
      )}
      {!groups.length && !m.wifi.length && <p className="muted center">{t('menu_empty')}</p>}
      <p className="muted small center">{t('prices_may_change')}</p>
    </div>
  )
}
