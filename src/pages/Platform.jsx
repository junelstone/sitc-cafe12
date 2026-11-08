import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n.jsx'
import { useBusiness } from '../lib/business.jsx'
import { whatsappUrl, smsUrl, intlPhone } from '../lib/notify'
import { PAY_NUMBER } from './Subscription.jsx'

const DAY = 86400000

// Bilingual reminder sent to a café owner before (or just after) the plan ends.
function reminderText(c, endDate, price) {
  const fr = endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const en = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const past = endDate < new Date()
  const amt = new Intl.NumberFormat('fr-FR').format(price || 0)
  const who = c.owner_name || c.name
  return `Bonjour ${who}, l\u2019abonnement SITC Café Manager de ${c.name} ${past ? 's\u2019est terminé' : 'se termine'} le ${fr}. ` +
    `Pour continuer, envoyez ${amt} F CFA par Mobile Money au ${PAY_NUMBER}, puis entrez l\u2019ID de transaction dans Gestion > Abonnement. Merci !\n\n` +
    `Hello ${who}, the SITC Café Manager plan for ${c.name} ${past ? 'ended' : 'ends'} on ${en}. ` +
    `To continue, send ${amt} F CFA by Mobile Money to ${PAY_NUMBER}, then enter the transaction ID under Management > Subscription. Thank you!\n— Stone\u2019s IT Consulting`
}

// Platform owner (Stone's IT Consulting): every café, payments to confirm, plan prices.
export default function Platform() {
  const { t, lang } = useI18n()
  const { refresh } = useBusiness()
  const [cafes, setCafes] = useState([])
  const [pays, setPays] = useState([])
  const [prices, setPrices] = useState([])
  const [msg, setMsg] = useState('')
  const load = () => {
    supabase.rpc('platform_overview').then(({ data }) => setCafes(data || []))
    supabase.from('subscription_payments').select('*, businesses(name)').eq('status', 'pending').order('created_at').then(({ data }) => setPays(data || []))
    supabase.from('plan_prices').select('*').order('monthly').then(({ data }) => setPrices(data || []))
  }
  useEffect(() => { load() }, [])
  const run = async (p) => { const { error } = await p; setMsg(error ? errText(t, error) : t('saved')); load(); refresh() }
  const d = (x) => (x ? new Date(x).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : '—')
  const end = (c) => new Date(Math.max(new Date(c.trial_ends_at), c.paid_until ? new Date(c.paid_until) : 0))
  const setPrice = (plan, k, v) => setPrices(prices.map((p) => (p.plan === plan ? { ...p, [k]: v } : p)))
  const savePrice = (p) => run(supabase.from('plan_prices').update({
    monthly: Number(p.monthly), yearly: Number(p.yearly),
    max_staff: p.max_staff === '' || p.max_staff == null ? null : Number(p.max_staff),
    max_stations: p.max_stations === '' || p.max_stations == null ? null : Number(p.max_stations),
  }).eq('plan', p.plan))

  const left = (c) => Math.ceil((end(c) - Date.now()) / DAY)
  const expiring = cafes.filter((c) => c.status !== 'suspended' && left(c) <= 7 && left(c) > -15).sort((a, b) => left(a) - left(b))
  const remind = (c) => { supabase.rpc('platform_mark_reminded', { business: c.id }).then(load) }
  const active = cafes.filter((c) => c.status !== 'suspended' && end(c) >= new Date())
  const mrr = active.filter((c) => c.status === 'active').reduce((s, c) => s + (prices.find((p) => p.plan === c.plan)?.monthly || 0), 0)

  return (
    <section>
      <h1>{t('nav_platform')}</h1>
      {msg && <p className="note">{msg}</p>}
      <div className="stats">
        <div className="card"><span className="muted small">{t('cafes')}</span><b className="big">{cafes.length}</b></div>
        <div className="card"><span className="muted small">{t('on_trial')}</span><b className="big">{active.filter((c) => c.status === 'trial').length}</b></div>
        <div className="card"><span className="muted small">{t('paying')}</span><b className="big">{active.filter((c) => c.status === 'active').length}</b></div>
        <div className="card"><span className="muted small">{t('monthly_income')}</span><b className="big">{fcfa(mrr)}</b></div>
      </div>

      <h2>{t('payments_to_confirm')}</h2>
      {pays.length === 0 ? <p className="muted">{t('none')}</p> : (
        <div className="card flush"><table>
          <thead><tr><th>{t('date')}</th><th>{t('cafe_name')}</th><th>{t('plan')}</th><th>{t('period')}</th><th>{t('amount')}</th><th>{t('momo_ref')}</th><th></th></tr></thead>
          <tbody>{pays.map((p) => (
            <tr key={p.id}><td>{d(p.created_at)}</td><td>{p.businesses?.name}</td><td>{t('plan_' + p.plan)}</td><td>{p.months} {t(p.months === 1 ? 'month' : 'months')}</td><td>{fcfa(p.amount)}</td><td><b>{p.reference}</b></td>
              <td className="row"><button className="btn small primary" onClick={() => run(supabase.rpc('platform_confirm_payment', { payment: p.id, approve: true }))}>✓ {t('confirm')}</button>
                <button className="btn small" onClick={() => run(supabase.rpc('platform_confirm_payment', { payment: p.id, approve: false }))}>✗ {t('reject')}</button></td></tr>))}
          </tbody></table></div>)}

      <h2>⏳ {t('expiring_soon')}</h2>
      {expiring.length === 0 ? <p className="muted">{t('none')}</p> : (
        <div className="card flush"><table>
          <thead><tr><th>{t('cafe_name')}</th><th>{t('plan')}</th><th>{t('ends')}</th><th>{t('reminded')}</th><th></th></tr></thead>
          <tbody>{expiring.map((c) => { const n = left(c); const to = c.owner_whatsapp || c.phone; const txt = reminderText(c, end(c), prices.find((p) => p.plan === c.plan)?.monthly); return (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="muted small">{[c.owner_name, to].filter(Boolean).join(' · ')}</div></td>
              <td>{t('plan_' + c.plan)}{c.status === 'trial' && <span className="pill">{t('bs_trial')}</span>}</td>
              <td><span className={n <= 3 ? 'warn' : ''}>{d(end(c))} · {n >= 0 ? `${n} ${t('days')}` : t('bs_expired')}</span></td>
              <td className="small">{c.last_reminded_at ? d(c.last_reminded_at) : '—'}</td>
              <td className="row wrap">
                <a className="btn small wa" href={whatsappUrl(intlPhone(to) ? to : '', txt)} target="_blank" rel="noreferrer" onClick={() => remind(c)}>📲 WhatsApp</a>
                {intlPhone(to) && <a className="btn small ghost" href={smsUrl(to, txt)} onClick={() => remind(c)}>✉️ SMS</a>}
              </td>
            </tr>) })}</tbody>
        </table></div>)}
      <p className="muted small">{t('reminders_hint')}</p>

      <h2>{t('cafes')}</h2>
      <div className="card flush"><table>
        <thead><tr><th>{t('cafe_name')}</th><th>{t('owner_name')}</th><th>{t('plan')}</th><th>{t('status')}</th><th>{t('ends')}</th><th>{t('nav_staff')}</th><th>{t('sales_30d')}</th><th>{t('last_sale')}</th><th></th></tr></thead>
        <tbody>{cafes.map((c) => { const ok = c.status !== 'suspended' && end(c) >= new Date(); return (
          <tr key={c.id} className={ok ? '' : 'dim'}>
            <td><b>{c.name}</b><div className="muted small">{[c.city, c.phone, c.email].filter(Boolean).join(' · ')}</div></td>
            <td>{c.owner_name}</td>
            <td><select value={c.plan} onChange={(e) => run(supabase.from('businesses').update({ plan: e.target.value }).eq('id', c.id))}>{prices.map((p) => <option key={p.plan} value={p.plan}>{t('plan_' + p.plan)}</option>)}</select></td>
            <td><span className={'pill ' + (c.status === 'active' && ok ? 'okpill' : '')}>{ok ? t('bs_' + c.status) : c.status === 'suspended' ? t('bs_suspended') : t('bs_expired')}</span>{c.pending_payments > 0 && <span className="pill">💳 {c.pending_payments}</span>}</td>
            <td>{d(end(c))}</td>
            <td>{c.staff}</td>
            <td>{c.sales_30d} · {fcfa(c.revenue_30d)}</td>
            <td>{d(c.last_sale)}</td>
            <td className="row wrap">
              <button className="btn small" onClick={() => run(supabase.rpc('platform_extend', { business: c.id, months: 1 }))}>+1 {t('month')}</button>
              <button className="btn small" onClick={() => run(supabase.rpc('platform_extend', { business: c.id, months: 12 }))}>+12</button>
              {c.status === 'suspended'
                ? <button className="btn small" onClick={() => run(supabase.rpc('platform_set_status', { business: c.id, status: 'active' }))}>{t('reactivate')}</button>
                : <button className="btn small" onClick={() => window.confirm(t('suspend_confirm')) && run(supabase.rpc('platform_set_status', { business: c.id, status: 'suspended' }))}>{t('suspend')}</button>}
            </td>
          </tr>) })}</tbody>
      </table></div>

      <h2>{t('plan_prices')}</h2>
      <div className="card flush"><table>
        <thead><tr><th>{t('plan')}</th><th>{t('per_month')}</th><th>{t('per_year')}</th><th>{t('staff_logins')}</th><th>{t('computers_max')}</th><th></th></tr></thead>
        <tbody>{prices.map((p) => (
          <tr key={p.plan}><td><b>{t('plan_' + p.plan)}</b></td>
            <td><input type="number" min="0" value={p.monthly} onChange={(e) => setPrice(p.plan, 'monthly', e.target.value)} /></td>
            <td><input type="number" min="0" value={p.yearly} onChange={(e) => setPrice(p.plan, 'yearly', e.target.value)} /></td>
            <td><input type="number" min="1" placeholder="∞" value={p.max_staff ?? ''} onChange={(e) => setPrice(p.plan, 'max_staff', e.target.value)} /></td>
            <td><input type="number" min="1" placeholder="∞" value={p.max_stations ?? ''} onChange={(e) => setPrice(p.plan, 'max_stations', e.target.value)} /></td>
            <td><button className="btn small primary" onClick={() => savePrice(p)}>{t('save')}</button></td></tr>))}
        </tbody></table></div>
      <p className="muted small">{t('unlimited_hint')}</p>
    </section>
  )
}
