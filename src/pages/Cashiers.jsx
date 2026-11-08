import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'

// Per-cashier report (admin, Pro): what each staff member sold and how their till closes went.
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10) }
const presets = () => {
  const now = new Date()
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  return {
    today: [iso(now), iso(now)],
    yesterday: [iso(new Date(now.getTime() - 86400000)), iso(new Date(now.getTime() - 86400000))],
    week: [iso(monday), iso(now)],
    month: [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)],
  }
}

export default function Cashiers() {
  const { t, lang } = useI18n()
  const [[from, to], setRange] = useState(presets().today)
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [closes, setCloses] = useState([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setOpen(null)
    supabase.rpc('cashier_report', { date_from: from, date_to: to }).then(({ data, error }) => {
      setLoading(false); setMsg(error ? errText(t, error) : ''); setRows(data || [])
    })
  }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(r) {
    if (open === r.staff_id) return setOpen(null)
    setOpen(r.staff_id); setCloses([])
    const a = new Date(from + 'T00:00:00'), z = new Date(to + 'T00:00:00'); z.setDate(z.getDate() + 1)
    const { data } = await supabase.from('cash_closes').select('*').eq('staff_id', r.staff_id)
      .gte('period_end', a.toISOString()).lt('period_end', z.toISOString()).order('period_end', { ascending: false })
    setCloses(data || [])
  }

  async function exportXlsx() {
    const { default: writeExcelFile } = await import('write-excel-file/browser')
    const H = (arr) => arr.map((v) => ({ value: v, fontWeight: 'bold' }))
    await writeExcelFile([
      H([t('cashier'), t('sales_count'), t('total'), t('pay_cash'), t('pay_momo'), t('pay_account'), t('discount'), t('voided'), t('topups'), t('cash_out'), t('closes'), t('drawer_short'), t('drawer_over')]),
      ...rows.map((r) => [r.full_name, Number(r.sales_count), Number(r.total), Number(r.cash), Number(r.momo), Number(r.account), Number(r.discounts),
        Number(r.voided_count), Number(r.topups), Number(r.expenses_cash), Number(r.closes), Number(r.short_total), Number(r.over_total)]),
    ]).toFile(`caissiers-${from}_${to}.xlsx`)
  }

  const p = presets()
  const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0)
  const dt = (d) => new Date(d).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const time = (d) => (d ? new Date(d).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '—')
  const diff = (d) => (d === 0 ? <span className="ok">{t('drawer_ok')}</span> : <span className="warn">{d < 0 ? t('drawer_short') : t('drawer_over')} {fcfa(Math.abs(d))}</span>)

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_cashiers')}</h1>
        <button className="btn primary" disabled={loading || !rows.length} onClick={exportXlsx}>⬇ Excel</button></div>
      <div className="row wrap mb">
        {Object.entries(p).map(([k, r]) => (
          <button key={k} className={'chip ' + (from === r[0] && to === r[1] ? 'on' : '')} onClick={() => setRange(r)}>{t('range_' + k)}</button>
        ))}
        <input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} aria-label={t('from')} />
        <span className="muted">→</span>
        <input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} aria-label={t('to')} />
      </div>
      {msg && <p className="note">{msg}</p>}
      {loading ? <p className="muted">…</p> : <>
        <div className="kpis">
          <div className="kpi main"><span>{t('total')}</span><b>{fcfa(sum('total'))}</b><small>{sum('sales_count')} {t('sales_count').toLowerCase()}</small></div>
          <div className="kpi"><span>💵 {t('pay_cash')}</span><b>{fcfa(sum('cash'))}</b></div>
          <div className="kpi"><span>📱 {t('pay_momo')}</span><b>{fcfa(sum('momo'))}</b></div>
          <div className="kpi"><span>{t('drawer_short')}</span><b className={sum('short_total') ? 'warn' : ''}>{fcfa(sum('short_total'))}</b></div>
        </div>
        <div className="card flush scroll-x"><table className="compact">
          <thead><tr><th>{t('cashier')}</th><th className="num">{t('sales_count')}</th><th className="num">{t('total')}</th><th className="num">💵</th><th className="num">📱</th>
            <th className="num">{t('discount')}</th><th className="num">{t('voided')}</th><th className="num">{t('nav_expenses')}</th><th className="num">{t('closes')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <FragmentRow key={r.staff_id} r={r} open={open === r.staff_id} onClick={() => toggle(r)} closes={closes} t={t} dt={dt} time={time} diff={diff} />
          ))}</tbody>
        </table></div>
        <p className="muted small">{t('cashiers_hint')}</p>
      </>}
    </section>
  )
}

function FragmentRow({ r, open, onClick, closes, t, dt, time, diff }) {
  const net = Number(r.over_total) - Number(r.short_total)
  return (
    <>
      <tr className={'click ' + (open ? 'sel' : '')} onClick={onClick}>
        <td><b>{r.full_name}</b> <span className="pill">{t('role_' + r.role)}</span>{r.first_sale && <div className="muted small">🕒 {time(r.first_sale)} – {time(r.last_sale)}</div>}</td>
        <td className="num">{r.sales_count}</td>
        <td className="num"><b>{fcfa(r.total)}</b></td>
        <td className="num">{fcfa(r.cash)}</td>
        <td className="num">{fcfa(r.momo)}</td>
        <td className="num">{Number(r.discounts) ? fcfa(r.discounts) : '—'}</td>
        <td className="num">{Number(r.voided_count) ? <span className="warn">{r.voided_count} · {fcfa(r.voided_total)}</span> : '—'}</td>
        <td className="num">{Number(r.expenses_cash) ? fcfa(r.expenses_cash) : '—'}</td>
        <td className="num">{Number(r.closes) ? <>{r.closes} · {diff(net)}</> : '—'}</td>
      </tr>
      {open && (
        <tr className="sub"><td colSpan={9}>
          {!closes.length ? <span className="muted small">{t('no_closes')}</span> : (
            <table className="inner"><thead><tr><th>{t('date')}</th><th className="num">{t('expected')}</th><th className="num">{t('counted')}</th><th className="num">{t('difference')}</th><th>{t('note')}</th></tr></thead>
              <tbody>{closes.map((c) => (
                <tr key={c.id}><td className="small">{dt(c.period_end)}</td><td className="num">{fcfa(c.expected_cash)}</td><td className="num">{fcfa(c.counted_cash)}</td><td className="num">{diff(c.difference)}</td><td className="small">{c.note}</td></tr>
              ))}</tbody></table>
          )}
        </td></tr>
      )}
    </>
  )
}
