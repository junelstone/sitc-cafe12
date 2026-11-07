import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import PayBox from '../components/PayBox.jsx'
import { useBusiness } from '../lib/business.jsx'
import { intlPhone, readyMessage, smsUrl, whatsappUrl } from '../lib/notify'
import Receipt from '../components/Receipt.jsx'

const FLOW = ['received', 'in_progress', 'ready', 'collected']
const KINDS = ['typing', 'design', 'printing', 'other']
const EMPTY = { customer_name: '', customer_phone: '', kind: 'typing', description: '', pages: '', price: '', due_at: '' }

export default function Jobs() {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [sel, setSel] = useState(null)
  const [payAmt, setPayAmt] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const { biz } = useBusiness()

  async function load() {
    let qy = supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(300)
    if (filter === 'open') qy = qy.not('status', 'in', '(collected,cancelled)')
    const { data } = await qy
    setJobs(data || [])
    if (sel) setSel((data || []).find((j) => j.id === sel.id) || null)
  }
  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault()
    const body = { ...form, pages: parseInt(form.pages, 10) || 0, price: parseInt(form.price, 10) || 0, due_at: form.due_at ? new Date(form.due_at).toISOString() : null, created_by: profile.id }
    const { data, error } = await supabase.from('jobs').insert(body).select().single()
    if (error) return setMsg(errText(t, error))
    setForm(null); setMsg(''); await load(); setSel(data); setPayAmt('')
  }
  async function patch(id, p) {
    const { error } = await supabase.from('jobs').update(p).eq('id', id)
    setMsg(error ? errText(t, error) : ''); load()
  }
  async function pay(p) {
    setBusy(true)
    const { data, error } = await supabase.rpc('pay_job', { job: sel.id, amount: parseInt(payAmt, 10) || 0, ...p })
    setBusy(false)
    if (error) return setMsg(errText(t, error))
    setPayAmt(''); setMsg(''); load(); setReceipt(data.id)
  }

  const shown = jobs.filter((j) => `${j.number ?? j.job_no} ${j.customer_name} ${j.customer_phone} ${j.description}`.toLowerCase().includes(q.toLowerCase()))
  const fmtDate = (d) => d ? new Date(d).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const isLate = (j) => j.due_at && new Date(j.due_at) < new Date() && !['collected', 'cancelled', 'ready'].includes(j.status)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  if (receipt) return <section><button className="btn ghost no-print" onClick={() => setReceipt(null)}>← {t('nav_jobs')}</button><Receipt saleId={receipt} /></section>

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_jobs')}</h1>
        <div className="row wrap">
          <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">{['open', 'all'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{t(f === 'open' ? 'open_jobs' : 'all_jobs')}</button>)}</div>
          <button className="btn primary" onClick={() => { setForm(EMPTY); setSel(null) }}>+ {t('new_job')}</button>
        </div></div>
      {msg && <p className="alert">{msg}</p>}

      {form && (
        <form className="card grid2" onSubmit={create}>
          <label>{t('full_name')}<input required value={form.customer_name} onChange={set('customer_name')} /></label>
          <label>{t('customer_phone')}<input type="tel" value={form.customer_phone} onChange={set('customer_phone')} /></label>
          <label>{t('kind')}<select value={form.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k} value={k}>{t('kind_' + k)}</option>)}</select></label>
          <label>{t('pages')}<input type="number" min="0" value={form.pages} onChange={set('pages')} /></label>
          <label className="span2">{t('description')}<textarea rows="2" value={form.description} onChange={set('description')} /></label>
          <label>{t('price_agreed')} (F CFA)<input type="number" min="0" required value={form.price} onChange={set('price')} /></label>
          <label>{t('due')}<input type="datetime-local" value={form.due_at} onChange={set('due_at')} /></label>
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setForm(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
        </form>
      )}

      <div className={sel ? 'split' : ''}>
        <div className="card flush"><table>
          <thead><tr><th>{t('job_no')}</th><th>{t('customer').split(' (')[0]}</th><th>{t('status')}</th><th>{t('due')}</th><th className="num">{t('balance')}</th></tr></thead>
          <tbody>{shown.map((j) => (
            <tr key={j.id} className={'click ' + (sel?.id === j.id ? 'sel ' : '') + (j.status === 'cancelled' ? 'dim' : '')} onClick={() => { setSel(j); setPayAmt(''); setForm(null) }}>
              <td><b>{j.number ?? j.job_no}</b></td>
              <td>{j.customer_name}<div className="muted small">{t('kind_' + j.kind)}{j.pages ? ` · ${j.pages} p.` : ''}</div></td>
              <td><span className={'pill st-' + j.status}>{t('st_' + j.status)}</span>{isLate(j) && <span className="pill warnpill">{t('late')}</span>}{j.status === 'ready' && j.notified_at && <span title={t('notified')}> 💬</span>}</td>
              <td className="small">{fmtDate(j.due_at)}</td>
              <td className="num">{j.price - j.paid > 0 ? <span className="warn">{fcfa(j.price - j.paid)}</span> : '✓'}</td>
            </tr>))}</tbody>
        </table></div>

        {sel && (
          <aside className="card job-detail">
            <div className="row between"><h2>{t('job_no')} {sel.number ?? sel.job_no}</h2><button className="btn ghost small" onClick={() => setSel(null)}>✕</button></div>
            <p><b>{sel.customer_name}</b>{sel.customer_phone && <> · <a href={'tel:' + sel.customer_phone}>{sel.customer_phone}</a></>}</p>
            {sel.description && <p className="muted">{sel.description}</p>}
            <div className="steps">{FLOW.map((s, i) => (
              <span key={s} className={'step ' + (FLOW.indexOf(sel.status) >= i ? 'done' : '')}>{t('st_' + s)}</span>
            ))}</div>
            <div className="row between"><span>{t('price_agreed')}</span><b>{fcfa(sel.price)}</b></div>
            <div className="row between"><span>{t('paid')}</span><span>{fcfa(sel.paid)}</span></div>
            <div className="row between big"><span>{t('balance')}</span><span>{fcfa(sel.price - sel.paid)}</span></div>

            {!['collected', 'cancelled'].includes(sel.status) && (
              <>
                <div className="row wrap">
                  {sel.status === 'received' && <button className="btn" onClick={() => patch(sel.id, { status: 'in_progress' })}>{t('mark_as')} « {t('st_in_progress')} »</button>}
                  {['received', 'in_progress'].includes(sel.status) && <button className="btn" onClick={() => patch(sel.id, { status: 'ready' })}>{t('mark_as')} « {t('st_ready')} »</button>}
                  {sel.status === 'ready' && <button className="btn primary" disabled={sel.paid < sel.price} title={sel.paid < sel.price ? t('must_pay_first') : ''} onClick={() => patch(sel.id, { status: 'collected' })}>✓ {t('collect')}</button>}
                </div>
                {sel.status === 'ready' && sel.paid < sel.price && <p className="muted small">{t('must_pay_first')}</p>}
                {sel.status === 'ready' && (intlPhone(sel.customer_phone) ? (
                  <div className="notify">
                    <span className="small"><b>{t('notify_customer')}</b>{sel.notified_at && <span className="muted"> · {t('notified')} {fmtDate(sel.notified_at)}</span>}</span>
                    <div className="row wrap">
                      <a className="btn wa" target="_blank" rel="noreferrer" href={whatsappUrl(sel.customer_phone, readyMessage(sel, biz, sel.price - sel.paid))} onClick={() => patch(sel.id, { notified_at: new Date().toISOString() })}>💬 WhatsApp</a>
                      <a className="btn" href={smsUrl(sel.customer_phone, readyMessage(sel, biz, sel.price - sel.paid))} onClick={() => patch(sel.id, { notified_at: new Date().toISOString() })}>✉️ SMS</a>
                    </div>
                  </div>
                ) : <p className="muted small">{t('no_phone')}</p>)}
                {sel.price > sel.paid && (
                  <div className="paywrap">
                    <h3>{t('take_payment')}</h3>
                    <label>{t('amount')}<div className="row"><input type="number" min="1" max={sel.price - sel.paid} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                      <button type="button" className="btn small" onClick={() => setPayAmt(String(sel.price - sel.paid))}>{t('balance')}</button></div></label>
                    <PayBox total={Math.min(parseInt(payAmt, 10) || 0, sel.price - sel.paid)} busy={busy} onPay={pay} label={t('take_payment')} />
                  </div>
                )}
                <details><summary className="muted small">{t('edit')}</summary>
                  <div className="grid2 mt">
                    <label>{t('customer_phone')}<input key={sel.id + 'p'} type="tel" defaultValue={sel.customer_phone} onBlur={(e) => e.target.value !== sel.customer_phone && patch(sel.id, { customer_phone: e.target.value.trim() })} /></label>
                    <label>{t('price_agreed')}<input key={sel.id + 'pr'} type="number" min={sel.paid} defaultValue={sel.price} onBlur={(e) => Number(e.target.value) !== sel.price && patch(sel.id, { price: parseInt(e.target.value, 10) || 0 })} /></label>
                    <label>&nbsp;<button type="button" className="btn ghost" onClick={() => patch(sel.id, { status: 'cancelled' })}>{t('st_cancelled')}</button></label>
                  </div>
                </details>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}
