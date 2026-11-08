import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { num } from '../lib/format'
import { errText } from '../lib/errors'
import { useBusiness } from '../lib/business.jsx'
import { isLow, restockList } from '../lib/summary'
import SendOwner from '../components/SendOwner.jsx'

export default function Stock() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [moves, setMoves] = useState([])
  const [act, setAct] = useState(null) // { item, reason }
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const { biz } = useBusiness()

  async function load() {
    const [a, b] = await Promise.all([
      supabase.from('stock_items').select('*').eq('active', true).order('name'),
      supabase.from('stock_movements').select('*, item:stock_items(name, unit), staff:profiles(full_name)').order('created_at', { ascending: false }).limit(60),
    ])
    setItems(a.data || []); setMoves(b.data || [])
  }
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('restock', { item: act.item.id, change: Number(qty), reason: act.reason, note })
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) { setAct(null); setQty(''); setNote(''); load() }
  }
  const low = isLow
  const lowItems = items.filter(isLow)

  return (
    <section>
      <h1>{t('nav_stock')}</h1>
      {msg && <p className="note">{msg}</p>}
      {lowItems.length > 0 && (
        <div className="alert block low-box">
          <div>⚠️ <b>{lowItems.length} {t('items_low')}</b>: {lowItems.map((i) => i.name).join(', ')}</div>
          <SendOwner small text={restockList({ biz, low: lowItems, t })} label={t('send_restock')} />
        </div>
      )}
      <div className="stock-grid">
        {items.map((i) => (
          <div key={i.id} className={'card stock-card ' + (low(i) ? 'low' : '')}>
            <div className="row between"><b>{i.name}</b>{low(i) && <span className="pill warnpill">{t('low_stock')}</span>}</div>
            <div className="qty">{num(i.quantity)} <span className="muted small">{i.unit}</span></div>
            <div className="muted small">{t('low_alert')} {num(i.low_threshold)}</div>
            {act?.item.id === i.id ? (
              <form onSubmit={submit} className="grid1">
                <label>{act.reason === 'restock' ? t('new_qty') : t('change_qty')}<input type="number" step="any" required autoFocus value={qty} onChange={(e) => setQty(e.target.value)} placeholder={act.reason === 'adjust' ? t('adjust_hint') : ''} /></label>
                <input placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="row end"><button type="button" className="btn ghost small" onClick={() => setAct(null)}>{t('cancel')}</button><button className="btn primary small">{t('save')}</button></div>
              </form>
            ) : (
              <div className="row">
                <button className="btn small" onClick={() => { setAct({ item: i, reason: 'restock' }); setQty('') }}>+ {t('restock')}</button>
                {isAdmin && <button className="btn ghost small" onClick={() => { setAct({ item: i, reason: 'adjust' }); setQty('') }}>{t('adjust')}</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      <h2>{t('history')}</h2>
      <div className="card flush"><table>
        <thead><tr><th>{t('date')}</th><th>{t('item_name')}</th><th>{t('reason')}</th><th className="num">{t('change_qty')}</th><th>{t('cashier')}</th></tr></thead>
        <tbody>{moves.map((m) => (
          <tr key={m.id}>
            <td className="small">{new Date(m.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{m.item?.name}{m.note && <div className="muted small">{m.note}</div>}</td>
            <td>{t('r_' + m.reason)}</td>
            <td className={'num ' + (m.change < 0 ? 'warn' : 'ok')}>{m.change > 0 ? '+' : ''}{num(m.change)}</td>
            <td className="small">{m.staff?.full_name}</td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}
