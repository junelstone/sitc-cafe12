import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { configured } from '../lib/supabase'
import LangSwitch from '../components/LangSwitch.jsx'
import InstallButton from '../components/InstallButton.jsx'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setErr(t('signInError'))
  }

  return (
    <div className="center login-bg">
      <form className="card narrow" onSubmit={submit}>
        <div className="row end"><LangSwitch /></div>
        <img className="login-logo" src="/logo.png" alt="" />
        <h1>{t('signInTitle')}</h1>
        {!configured && <p className="alert">{t('notConfigured')}</p>}
        <label>{t('email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>{t('password')}<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {err && <p className="alert">{err}</p>}
        <button className="btn primary full" disabled={busy || !configured}>{t('signIn')}</button>
        <div className="row" style={{ justifyContent: 'center' }}><InstallButton /></div>
        <p className="muted small center-text">Stone's IT Consulting · Brazzaville</p>
      </form>
    </div>
  )
}
