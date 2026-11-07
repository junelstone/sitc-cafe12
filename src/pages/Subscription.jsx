import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { num, fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n.jsx'
import { useBusiness } from '../lib/business.jsx'

export const PAY_NUMBER = '+242 06 453 02 55'

// The café admin sees their plan, end date, and declares a Mobile Money payment for the platform owner to confirm.
export default function Subscription() {
  const { t, lang } = useI18n()
  const { biz, prices, access, onTrial, endDate, daysLeft } = useBusiness()
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ plan: '', months: 1, reference: '' })
  const [msg, setMsg] = useState('')
  const load = () => supabase.from('subscription_payments').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])
  if (!biz) return null
  const plan = f.plan || biz.plan
  const price = prices.find((p) => p.plan === plan)
  const amount = price ? (Number(f.months) === 12 ? price.yearly : price.monthly) : 0
  const pending = rows.some((r) => r.status === 'pending')

  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('declare_payment', { plan, months: Number(f.months), reference: f.reference })
    setMsg(error ? errText(t, error) : t('payment_sent'))
    if (!error) { setF({ ...f, reference: '' }); load() }
  }
  const d = (x) => new Date(x).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')

  return (
    <section>
      <h1>{t('nav_subscription')}</h1>
      {access === 'expired' && <p className="alert">{t('expired_msg')}</p>}
      {access === 'suspended' && <p className="alert">{t('suspended_msg')}</p>}
      <div className="card">
        <div className="row between wrap">
          <div><span className="muted small">{t('plan')}</span><h2 style={{ margin: 0 }}>{t('plan_' + biz.plan)}</h2></div>
          <div><span className="muted small">{onTrial ? t('trial_until') : t('paid_until')}</span><h2 style={{ margin: 0 }}>{endDate ? d(endDate) : '—'}</h2></div>
          {access === 'ok' && <span className="pill okpill">{daysLeft} {t('days')}</span>}
        </div>
      </div>
      <div className="plans">{prices.map((p) => (
        <div key={p.plan} className={'card plan' + (p.plan === plan ? ' featured' : '')}>
          <h3>{t('plan_' + p.plan)}</h3>
          <div className="price">{num(p.monthly)} <small>F CFA / {t('per_month')}</small></div>
          <p className="muted small">{num(p.yearly)} F CFA / {t('per_year')}</p>
          <ul>
            <li>{p.max_staff == null ? t('unlimited_staff') : `${p.max_staff} ${t('staff_logins')}`}</li>
            <li>{p.max_stations == null ? t('unlimited_pcs') : `${p.max_stations} ${t('computers_max')}`}</li>
          </ul>
        </div>))}
      </div>
      <h2>{t('how_to_pay')}</h2>
      <form className="card grid2" onSubmit={submit}>
        <p className="span2">{t('pay_step1')} <b>{fcfa(amount)}</b> {t('pay_step1b')} <b>{PAY_NUMBER}</b> (Stone&apos;s IT Consulting). {t('pay_step2')}</p>
        <label>{t('plan')}<select value={plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{prices.map((p) => <option key={p.plan} value={p.plan}>{t('plan_' + p.plan)}</option>)}</select></label>
        <label>{t('period')}<select value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}><option value={1}>1 {t('month')}</option><option value={12}>12 {t('months')} ({t('two_months_free')})</option></select></label>
        <label className="span2">{t('momo_ref')}<input required value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></label>
        {pending && <p className="note span2">{t('payment_pending_note')}</p>}
        {msg && <p className="note span2">{msg}</p>}
        <div className="row end span2"><button className="btn primary">{t('declare_payment')}</button></div>
      </form>
      {rows.length > 0 && <>
        <h2>{t('history')}</h2>
        <div className="card flush"><table>
          <thead><tr><th>{t('date')}</th><th>{t('plan')}</th><th>{t('period')}</th><th>{t('amount')}</th><th>{t('momo_ref')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{d(r.created_at)}</td><td>{t('plan_' + r.plan)}</td><td>{r.months} {t(r.months === 1 ? 'month' : 'months')}</td><td>{fcfa(r.amount)}</td><td>{r.reference}</td><td><span className={'pill ' + (r.status === 'confirmed' ? 'okpill' : '')}>{t('ps_' + r.status)}</span></td></tr>)}</tbody>
        </table></div>
      </>}
    </section>
  )
}
