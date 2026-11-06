import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa, num } from '../lib/format'
import { errText } from '../lib/errors'
import PayBox from '../components/PayBox.jsx'
import Receipt from '../components/Receipt.jsx'

const dur = (m, lang) => m % 1440 === 0 ? `${m / 1440} ${lang === 'fr' ? 'j' : 'd'}` : m % 60 === 0 ? `${m / 60} h` : `${m} min`

export default function Vouchers() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [plans, setPlans] = useState([])
  const [counts, setCounts] = useState({})
  const [selling, setSelling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [imp, setImp] = useState({ plan: '', codes: '', batch: '' })
  const [editPlan, setEditPlan] = useState(null)
  const [recent, setRecent] = useState([])

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.from('voucher_plans').select('*').order('sort_order'),
      supabase.rpc('voucher_counts'),
      supabase.from('vouchers').select('code, sold_at, status, plan:voucher_plans(name_fr, name_en), staff:profiles(full_name)').eq('status', 'sold').order('sold_at', { ascending: false }).limit(20),
    ])
    setPlans(a.data || []); setCounts(Object.fromEntries((b.data || []).map((r) => [r.plan_id, r]))); setRecent(c.data || [])
  }
  useEffect(() => { load() }, [])

  async function sell(p) {
    setBusy(true)
    const { data, error } = await supabase.rpc('sell_voucher', { plan: selling.id, ...p })
    setBusy(false)
    if (error) return setMsg(errText(t, error))
    setSelling(null); setMsg(''); load(); setReceipt(data.id)
  }
  async function importCodes(e) {
    e.preventDefault()
    const codes = imp.codes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean)
    const { data, error } = await supabase.rpc('import_vouchers', { plan: imp.plan, codes, batch: imp.batch })
    setMsg(error ? errText(t, error) : `${data} ${t('codes_imported')}`)
    if (!error) { setImp({ ...imp, codes: '' }); load() }
  }
  async function savePlan(e) {
    e.preventDefault()
    const { id, ...rest } = editPlan
    const body = { ...rest, price: parseInt(rest.price, 10) || 0, minutes: parseInt(rest.minutes, 10) || 60 }
    const { error } = id ? await supabase.from('voucher_plans').update(body).eq('id', id) : await supabase.from('voucher_plans').insert(body)
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) { setEditPlan(null); load() }
  }

  if (receipt) return <section><button className="btn ghost no-print" onClick={() => setReceipt(null)}>← {t('nav_vouchers')}</button><Receipt saleId={receipt} /></section>
  const name = (p) => (lang === 'fr' ? p.name_fr : p.name_en)
  const setE = (k) => (e) => setEditPlan({ ...editPlan, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <section>
      <h1>{t('nav_vouchers')}</h1>
      {msg && <p className="note">{msg}</p>}
      <div className="stations">
        {plans.filter((p) => p.active).map((p) => {
          const left = Number(counts[p.id]?.available || 0)
          return (
            <div key={p.id} className="card station">
              <div className="row between"><b className="big">📶 {name(p)}</b><span className="muted small">{dur(p.minutes, lang)}</span></div>
              <div className="row between"><span className="big">{p.price > 0 ? fcfa(p.price) : <span className="warn">{t('price_missing')}</span>}</span>
                <span className={'pill ' + (left > 10 ? 'okpill' : 'warnpill')}>{num(left)} {t('left')}</span></div>
              {selling?.id === p.id ? (
                <><PayBox total={p.price} busy={busy} onPay={sell} label={t('sell_code')} /><button className="btn ghost small" onClick={() => setSelling(null)}>{t('cancel')}</button></>
              ) : <button className="btn primary full" disabled={!left || p.price <= 0} onClick={() => setSelling(p)}>{t('sell_code')}</button>}
            </div>
          )
        })}
      </div>

      {isAdmin && <>
        <h2>{t('voucher_plans')}</h2>
        <div className="card flush"><table>
          <thead><tr><th>{t('nav_vouchers')}</th><th>{t('duration')}</th><th className="num">{t('price')}</th><th className="num">{t('left')}</th><th className="num">{t('sold')}</th><th></th></tr></thead>
          <tbody>{plans.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'dim'}><td><b>{name(p)}</b></td><td>{dur(p.minutes, lang)}</td><td className="num">{fcfa(p.price)}</td>
              <td className="num">{num(counts[p.id]?.available || 0)}</td><td className="num">{num(counts[p.id]?.sold || 0)}</td>
              <td className="num"><button className="btn ghost small" onClick={() => setEditPlan(p)}>{t('edit')}</button></td></tr>))}</tbody>
        </table></div>
        <button className="btn" onClick={() => setEditPlan({ name_fr: '', name_en: '', minutes: 60, price: 0, active: true, sort_order: plans.length + 1 })}>+ {t('add_plan')}</button>
        {editPlan && (
          <form className="card grid2 mt" onSubmit={savePlan}>
            <label>{t('name_fr')}<input required value={editPlan.name_fr} onChange={setE('name_fr')} /></label>
            <label>{t('name_en')}<input required value={editPlan.name_en} onChange={setE('name_en')} /></label>
            <label>{t('duration')} (min)<input type="number" min="1" value={editPlan.minutes} onChange={setE('minutes')} /></label>
            <label>{t('price')} (F CFA)<input type="number" min="0" value={editPlan.price} onChange={setE('price')} /></label>
            <label className="check"><input type="checkbox" checked={editPlan.active} onChange={setE('active')} /> {t('active')}</label>
            <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setEditPlan(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
          </form>
        )}

        <h2>{t('import_codes')}</h2>
        <form className="card grid2" onSubmit={importCodes}>
          <label>{t('nav_vouchers')}<select required value={imp.plan} onChange={(e) => setImp({ ...imp, plan: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}</select></label>
          <label>{t('batch')}<input value={imp.batch} onChange={(e) => setImp({ ...imp, batch: e.target.value })} placeholder="2026-11" /></label>
          <label className="span2">{t('codes')}<textarea rows="5" required value={imp.codes} onChange={(e) => setImp({ ...imp, codes: e.target.value })} placeholder={t('codes_hint')} /></label>
          <div className="row end span2"><button className="btn primary">{t('import')}</button></div>
        </form>
      </>}

      <h2>{t('recent_sold')}</h2>
      <div className="card flush"><table>
        <thead><tr><th>{t('date')}</th><th>{t('nav_vouchers')}</th><th>Code</th><th>{t('cashier')}</th></tr></thead>
        <tbody>{recent.map((v) => (
          <tr key={v.code}><td className="small">{new Date(v.sold_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{v.plan && name(v.plan)}</td><td><code>{v.code}</code></td><td className="small">{v.staff?.full_name}</td></tr>))}</tbody>
      </table></div>
    </section>
  )
}
