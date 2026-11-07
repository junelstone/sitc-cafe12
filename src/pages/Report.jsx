import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa, num } from '../lib/format'
import { errText } from '../lib/errors'
import Receipt from '../components/Receipt.jsx'

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }

export default function Report() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [day, setDay] = useState(today())
  const [sales, setSales] = useState([])
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const start = new Date(day + 'T00:00:00'), end = new Date(start); end.setDate(end.getDate() + 1)
    const { data } = await supabase.from('sales').select('*, staff:profiles(full_name)')
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('created_at', { ascending: false })
    setSales(data || [])
    const ids = (data || []).filter((s) => !s.voided).map((s) => s.id)
    if (ids.length) { const r = await supabase.from('sale_items').select('*').in('sale_id', ids); setItems(r.data || []) } else setItems([])
  }
  useEffect(() => { load() }, [day])

  const live = sales.filter((s) => !s.voided)
  const sum = (arr) => arr.reduce((a, s) => a + s.total, 0)
  const byPay = { cash: sum(live.filter((s) => s.payment_method === 'cash')), mobile_money: sum(live.filter((s) => s.payment_method === 'mobile_money')), account: sum(live.filter((s) => s.payment_method === 'account')) }
  const byStaff = useMemo(() => Object.values(live.reduce((m, s) => { const k = s.staff?.full_name || '?'; m[k] = m[k] || { name: k, n: 0, total: 0 }; m[k].n++; m[k].total += s.total; return m }, {})), [sales])
  const byService = useMemo(() => Object.values(items.reduce((m, i) => { m[i.label] = m[i.label] || { label: i.label, q: 0, total: 0 }; m[i.label].q += Number(i.quantity); m[i.label].total += i.line_total; return m }, {})).sort((a, b) => b.total - a.total), [items])
  const label = (l) => { const [fr, en] = l.split(' / '); return lang === 'fr' ? fr : (en || fr) }

  async function voidSale(id) {
    const reason = window.prompt(t('void_reason'))
    if (reason === null) return
    const { error } = await supabase.rpc('void_sale', { sale: id, reason })
    setMsg(error ? errText(t, error) : t('saved')); load()
  }

  if (open) return <section><button className="btn ghost no-print" onClick={() => setOpen(null)}>← {t('nav_report')}</button><Receipt saleId={open} /></section>

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_report')}</h1><input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></div>
      {msg && <p className="note">{msg}</p>}
      <div className="kpis">
        <div className="kpi main"><span>{t('total')}</span><b>{fcfa(sum(live))}</b><small>{live.length} {t('sales_count').toLowerCase()}</small></div>
        <div className="kpi"><span>💵 {t('pay_cash')}</span><b>{fcfa(byPay.cash)}</b></div>
        <div className="kpi"><span>📱 {t('pay_momo')}</span><b>{fcfa(byPay.mobile_money)}</b></div>
        {byPay.account > 0 && <div className="kpi"><span>👤 {t('pay_account')}</span><b>{fcfa(byPay.account)}</b></div>}
      </div>
      <div className="grid2">
        {isAdmin && <div className="card flush"><table><thead><tr><th>{t('by_staff')}</th><th className="num">{t('sales_count')}</th><th className="num">{t('total')}</th></tr></thead>
          <tbody>{byStaff.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.n}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>}
        <div className="card flush"><table><thead><tr><th>{t('by_service')}</th><th className="num">{t('qty')}</th><th className="num">{t('total')}</th></tr></thead>
          <tbody>{byService.map((r) => <tr key={r.label}><td>{label(r.label)}</td><td className="num">{num(r.q)}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>
      </div>
      <h2>{t('sales_count')}</h2>
      {!sales.length ? <p className="muted">{t('no_sales')}</p> : (
        <div className="card flush"><table>
          <thead><tr><th>{t('receipt_no')}</th><th>{t('time')}</th><th>{t('cashier')}</th><th>{t('pay_cash')}/{t('pay_momo')}</th><th className="num">{t('total')}</th><th></th></tr></thead>
          <tbody>{sales.map((s) => (
            <tr key={s.id} className={s.voided ? 'dim' : ''}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(s.id) }}>{String(s.number ?? s.receipt_no).padStart(6, '0')}</a>{s.voided && <span className="pill warnpill">{t('voided')}</span>}</td>
              <td>{new Date(s.created_at).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{s.staff?.full_name}</td>
              <td>{s.payment_method === 'cash' ? t('pay_cash') : s.payment_method === 'account' ? t('pay_account') : `${t('pay_momo')} · ${s.momo_ref}`}</td>
              <td className="num">{fcfa(s.total)}</td>
              <td className="num">{isAdmin && !s.voided && <button className="btn ghost small" onClick={() => voidSale(s.id)}>{t('void')}</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  )
}
