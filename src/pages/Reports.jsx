import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { fcfa, num } from '../lib/format'

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const PAGE = 1000

async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error || !data) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export default function Reports() {
  const { t, lang } = useI18n()
  const [month, setMonth] = useState(thisMonth())
  const [sales, setSales] = useState([])
  const [items, setItems] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [y, m] = month.split('-').map(Number)
      const start = new Date(y, m - 1, 1), end = new Date(y, m, 1)
      const endDay = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`
      const [s, i, e] = await Promise.all([
        fetchAll(() => supabase.from('sales').select('*, staff:profiles(full_name)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('created_at')),
        fetchAll(() => supabase.from('sale_items').select('label, quantity, line_total, sale:sales!inner(created_at, voided, kind)').gte('sale.created_at', start.toISOString()).lt('sale.created_at', end.toISOString()).eq('sale.voided', false)),
        fetchAll(() => supabase.from('expenses').select('*, staff:profiles(full_name)').gte('spent_on', `${month}-01`).lt('spent_on', endDay).order('spent_on')),
      ])
      setSales(s); setItems(i.filter((x) => (x.sale?.kind || 'sale') === 'sale')); setExpenses(e); setLoading(false)
    })()
  }, [month])

  const live = sales.filter((s) => !s.voided)
  const revenueSales = live.filter((s) => (s.kind || 'sale') === 'sale')
  const revenue = revenueSales.reduce((a, s) => a + s.total, 0)
  const spent = expenses.reduce((a, e) => a + e.amount, 0)
  const label = (l) => { const [fr, en] = l.split(' / '); return lang === 'fr' ? fr : (en || fr) }
  const group = (arr, key, val) => Object.values(arr.reduce((m, x) => { const k = key(x); m[k] = m[k] || { k, n: 0, total: 0 }; m[k].n += 1; m[k].total += val(x); return m }, {})).sort((a, b) => b.total - a.total)

  const byService = useMemo(() => Object.values(items.reduce((m, i) => { const k = i.label.replace(/ N°\d+| No\.\d+|\(\d+ min\)/g, '').trim(); m[k] = m[k] || { k, q: 0, total: 0 }; m[k].q += Number(i.quantity); m[k].total += i.line_total; return m }, {})).sort((a, b) => b.total - a.total), [items])
  const byStaff = group(revenueSales, (s) => s.staff?.full_name || '?', (s) => s.total)
  const byPay = group(live, (s) => s.payment_method, (s) => s.total)
  const byExp = group(expenses, (e) => e.category, (e) => e.amount)
  const byDay = useMemo(() => {
    const m = {}
    revenueSales.forEach((s) => { const d = new Date(s.created_at).getDate(); m[d] = (m[d] || 0) + s.total })
    const [y, mo] = month.split('-').map(Number)
    const days = new Date(y, mo, 0).getDate()
    return Array.from({ length: days }, (_, i) => ({ d: i + 1, total: m[i + 1] || 0 }))
  }, [sales, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxDay = Math.max(1, ...byDay.map((d) => d.total))
  const payName = (p) => t(p === 'cash' ? 'pay_cash' : p === 'mobile_money' ? 'pay_momo' : p === 'account' ? 'pay_account' : p)

  async function exportXlsx() {
    const { default: writeExcelFile } = await import('write-excel-file/browser')
    const H = (arr) => arr.map((v) => ({ value: v, fontWeight: 'bold' }))
    const dt = (d) => new Date(d).toLocaleString('fr-FR')
    await writeExcelFile([
      { sheet: t('summary'), data: [H([t('month'), month]), [t('revenue'), revenue], [t('nav_expenses'), spent], [t('profit'), revenue - spent], [],
        H([t('by_service'), t('qty'), t('total')]), ...byService.map((r) => [label(r.k), r.q, r.total]), [],
        H([t('by_staff'), t('sales_count'), t('total')]), ...byStaff.map((r) => [r.k, r.n, r.total])] },
      { sheet: t('sales_count'), data: [H([t('receipt_no'), t('date'), t('cashier'), t('customer').split(' (')[0], t('pay_cash') + '/' + t('pay_momo'), 'Ref', t('total'), t('voided')]),
        ...sales.map((s) => [s.number ?? s.receipt_no, dt(s.created_at), s.staff?.full_name || '', s.customer_name, payName(s.payment_method), s.momo_ref, s.total, s.voided ? 'X' : ''])] },
      { sheet: t('nav_expenses'), data: [H([t('date'), t('category'), t('description'), t('amount'), t('cashier')]),
        ...expenses.map((e) => [e.spent_on, t('exp_' + e.category), e.description, e.amount, e.staff?.full_name || ''])] },
    ]).toFile(`SITC-rapport-${month}.xlsx`)
  }

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_reports')}</h1>
        <div className="row"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn primary" disabled={loading} onClick={exportXlsx}>⬇ Excel</button></div></div>
      {loading ? <p className="muted">…</p> : <>
        <div className="kpis">
          <div className="kpi main"><span>{t('revenue')}</span><b>{fcfa(revenue)}</b><small>{revenueSales.length} {t('sales_count').toLowerCase()}</small></div>
          <div className="kpi"><span>{t('nav_expenses')}</span><b>{fcfa(spent)}</b></div>
          <div className="kpi"><span>{t('profit')}</span><b className={revenue - spent < 0 ? 'warn' : 'ok'}>{fcfa(revenue - spent)}</b></div>
        </div>
        <div className="card">
          <h2 className="mt0">{t('by_day')}</h2>
          <div className="bars">{byDay.map((d) => (
            <div key={d.d} className="bar" title={`${d.d} · ${fcfa(d.total)}`}><div style={{ height: `${(d.total / maxDay) * 100}%` }} /><span>{d.d}</span></div>
          ))}</div>
        </div>
        <div className="grid2">
          <div className="card flush"><table><thead><tr><th>{t('by_service')}</th><th className="num">{t('qty')}</th><th className="num">{t('total')}</th></tr></thead>
            <tbody>{byService.slice(0, 15).map((r) => <tr key={r.k}><td>{label(r.k)}</td><td className="num">{num(r.q)}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>
          <div className="grid1">
            <div className="card flush"><table><thead><tr><th>{t('by_staff')}</th><th className="num">{t('sales_count')}</th><th className="num">{t('total')}</th></tr></thead>
              <tbody>{byStaff.map((r) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.n}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>
            <div className="card flush"><table><thead><tr><th>{t('by_payment')}</th><th className="num">{t('total')}</th></tr></thead>
              <tbody>{byPay.map((r) => <tr key={r.k}><td>{payName(r.k)}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>
            <div className="card flush"><table><thead><tr><th>{t('nav_expenses')}</th><th className="num">{t('total')}</th></tr></thead>
              <tbody>{byExp.map((r) => <tr key={r.k}><td>{t('exp_' + r.k)}</td><td className="num">{fcfa(r.total)}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      </>}
    </section>
  )
}
