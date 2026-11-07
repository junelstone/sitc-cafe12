import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, configured } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import LangSwitch from '../components/LangSwitch.jsx'

// A new café creates its own space: café name, owner, phone, login. 14-day free trial.
export default function Signup() {
  const { t } = useI18n()
  const { signIn } = useAuth()
  const [params] = useSearchParams()
  const [f, setF] = useState({ cafe_name: '', owner_name: '', phone: '', city: '', email: '', password: '', plan: params.get('plan') === 'starter' ? 'starter' : 'pro' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('signup-cafe', { body: f })
    const code = error ? (await error.context?.json?.().catch(() => null))?.error || 'server_error' : data?.error
    if (code) { setBusy(false); setErr(t('su_' + code) !== 'su_' + code ? t('su_' + code) : `${t('error')}: ${code}`); return }
    const { error: e2 } = await signIn(f.email.trim().toLowerCase(), f.password)
    setBusy(false)
    if (e2) setErr(t('signInError'))
  }

  return (
    <div className="center login-bg">
      <form className="card narrow wide-ish" onSubmit={submit}>
        <div className="row between"><Link to="/" className="small">← {t('back')}</Link><LangSwitch /></div>
        <img className="login-logo" src="/logo.png" alt="" />
        <h1>{t('signup_title')}</h1>
        <p className="muted small">{t('signup_sub')}</p>
        <label>{t('cafe_name')}<input required minLength={2} value={f.cafe_name} onChange={set('cafe_name')} /></label>
        <label>{t('owner_name')}<input required minLength={2} value={f.owner_name} onChange={set('owner_name')} autoComplete="name" /></label>
        <div className="grid2">
          <label>{t('phone')}<input required minLength={6} type="tel" value={f.phone} onChange={set('phone')} placeholder="+242 06 …" /></label>
          <label>{t('city')}<input value={f.city} onChange={set('city')} /></label>
        </div>
        <label>{t('plan')}<select value={f.plan} onChange={set('plan')}><option value="starter">{t('plan_starter')}</option><option value="pro">{t('plan_pro')}</option></select></label>
        <label>{t('email')}<input type="email" required value={f.email} onChange={set('email')} autoComplete="username" /></label>
        <label>{t('password')}<input type="password" required minLength={8} value={f.password} onChange={set('password')} placeholder={t('pw_hint')} autoComplete="new-password" /></label>
        {err && <p className="alert">{err}</p>}
        <button className="btn primary full" disabled={busy || !configured}>{busy ? '…' : t('start_trial')}</button>
        <p className="muted small center-text">{t('have_account')} <Link to="/login">{t('signIn')}</Link></p>
      </form>
    </div>
  )
}
