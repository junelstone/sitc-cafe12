import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import { useBusiness } from '../lib/business.jsx'
import { closeSummary, isLow } from '../lib/summary'
import SendOwner from '../components/SendOwner.jsx'

export default function Drawer() {
  const { t, lang } = useI18n()
  const { isAdmin, profile } = useAuth()
  const { biz } = useBusiness()
  const [last, setLast] = useState(null) // the close just done, to send to the owner
  const [low, setLow] = useState([])
  const [float, setFloat] = useState('')
  const [st, setSt] = useState(null)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [closes, setCloses] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.rpc('drawer_status', { opening_float: parseInt(float, 10) || 0 }),
      supabase.from('cash_closes').select('*, staff:profiles(full_name)').order('created_at', { ascending: false }).limit(30),
      supabase.from('stock_items').select('name, quantity, low_threshold, unit').eq('active', true),
    ])
    setSt(a.data?.[0] || null); setCloses(b.data || []); setLow((c.data || []).filter(isLow))
  }
  useEffect(() => { load() }, [float]) // eslint-disable-line react-hooks/exhaustive-deps

  async function close() {
    setBusy(true)
    const { data, error } = await supabase.rpc('close_drawer', { counted: parseInt(counted, 10), opening_float: parseInt(float, 10) || 0, note })
    setBusy(false)
    if (error) return setMsg(errText(t, error))
    setLast(data); setMsg(t('closed_ok')); setCounted(''); setNote(''); setFloat(''); load()
  }

  const dt = (d) => new Date(d).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const diff = counted === '' || !st ? null : (parseInt(counted, 10) || 0) - st.expected_cash
  const diffLabel = (d) => d === 0 ? <span className="ok">{t('drawer_ok')}</span> : <span className="warn">{d < 0 ? t('drawer_short') : t('drawer_over')} {fcfa(Math.abs(d))}</span>

  return (
    <section>
      <h1>{t('drawer_title')}</h1>
      {msg && <p className="note">{msg}</p>}
      {last && (
        <div className="card send-card">
          <div className="row between"><b>📲 {t('send_summary_title')}</b><button className="btn ghost small" onClick={() => setLast(null)}>✕</button></div>
          <pre className="msg-preview">{closeSummary({ close: last, biz, staff: last.staff?.full_name || profile.full_name, low, t, lang })}</pre>
          <SendOwner text={closeSummary({ close: last, biz, staff: last.staff?.full_name || profile.full_name, low, t, lang })} />
        </div>
      )}
      {st && (
        <div className="card drawer">
          <div className="row between muted small"><span>{t('since')} {dt(st.period_start)}</span></div>
          <label className="row between"><span>{t('opening_float')}</span><input className="w-amt" type="number" min="0" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" /></label>
          <div className="row between"><span>+ {t('cash_in')}</span><b>{fcfa(st.cash_sales)}</b></div>
          <div className="row between"><span>− {t('cash_out')}</span><b>{fcfa(st.cash_expenses)}</b></div>
          <div className="row between big"><span>{t('expected')}</span><span>{fcfa(st.expected_cash)}</span></div>
          <div className="row between muted"><span>{t('momo_info')}</span><span>{fcfa(st.momo_sales)}</span></div>
          <label className="row between big"><span>{t('counted')}</span><input className="w-amt big" type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} /></label>
          {diff !== null && <div className="row between"><span>{t('difference')}</span>{diffLabel(diff)}</div>}
          <input placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary full big" disabled={busy || counted === ''} onClick={close}>🔒 {t('close_drawer')}</button>
        </div>
      )}
      <h2>{t('past_closes')}</h2>
      <div className="card flush"><table>
        <thead><tr><th>{t('date')}</th>{isAdmin && <th>{t('cashier')}</th>}<th className="num">{t('expected')}</th><th className="num">{t('counted')}</th><th className="num">{t('difference')}</th><th></th></tr></thead>
        <tbody>{closes.map((c) => (
          <tr key={c.id}>
            <td className="small">{dt(c.period_end)}{c.note && <div className="muted small">{c.note}</div>}</td>
            {isAdmin && <td>{c.staff?.full_name}</td>}
            <td className="num">{fcfa(c.expected_cash)}</td><td className="num">{fcfa(c.counted_cash)}</td>
            <td className="num">{diffLabel(c.difference)}</td>
            <td className="num"><button className="btn ghost small" title={t('send_whatsapp')} onClick={() => { setLast(c); window.scrollTo(0, 0) }}>📲</button></td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}
