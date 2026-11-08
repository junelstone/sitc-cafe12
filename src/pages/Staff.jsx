import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { errText } from '../lib/errors'

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }

export default function Staff() {
  const { t } = useI18n()
  const { profile: me } = useAuth()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')

  const { lang } = useI18n()
  const [day, setDay] = useState(today())
  const [visits, setVisits] = useState([])   // the chosen day's logins
  const [latest, setLatest] = useState({})   // staff_id -> most recent visit
  const [, tick] = useState(0)

  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setRows(data || []))
  const loadPresence = async () => {
    const a = new Date(day + 'T00:00:00'), z = new Date(a); z.setDate(z.getDate() + 1)
    const [v, l] = await Promise.all([
      supabase.from('staff_presence').select('*').gte('last_seen_at', a.toISOString()).lt('started_at', z.toISOString()).order('started_at', { ascending: false }).limit(300),
      supabase.from('staff_presence').select('*').gte('last_seen_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('last_seen_at', { ascending: false }).limit(500),
    ])
    setVisits(v.data || [])
    const m = {}; (l.data || []).forEach((r) => { if (!m[r.staff_id]) m[r.staff_id] = r }); setLatest(m)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { loadPresence(); const h = setInterval(() => { loadPresence(); tick((n) => n + 1) }, 30000); return () => clearInterval(h) }, [day]) // eslint-disable-line react-hooks/exhaustive-deps

  const loc = lang === 'fr' ? 'fr-FR' : 'en-GB'
  const hm = (d) => new Date(d).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  const online = (r) => r && !r.ended_at && Date.now() - new Date(r.last_seen_at) < 3 * 60000
  const ago = (d) => {
    const m = Math.round((Date.now() - new Date(d)) / 60000)
    if (m < 60) return `${t('seen')} ${t('ago_pre')}${m} min${t('ago_post')}`
    if (m < 24 * 60) return `${t('seen')} ${t('ago_pre')}${Math.round(m / 60)} h${t('ago_post')}`
    return `${t('seen')} ${new Date(d).toLocaleDateString(loc, { day: '2-digit', month: 'short' })} ${hm(d)}`
  }
  const dur = (r) => { const m = Math.max(1, Math.round((new Date(r.ended_at || r.last_seen_at) - new Date(r.started_at)) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` }
  const status = (id) => {
    const r = latest[id]
    if (online(r)) return <span className="ok">🟢 {t('online_now')} <span className="muted small">· {t('since')} {hm(r.started_at)}</span></span>
    if (!r) return <span className="muted small">{t('never_seen')}</span>
    return <span className="muted small">⚪ {ago(r.ended_at || r.last_seen_at)}</span>
  }
  const name = (id) => rows.find((r) => r.id === id)?.full_name || '?'

  async function update(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    setMsg(error ? `${t('error')}: ${error.message}` : t('saved')); load()
  }

  async function create(e) {
    e.preventDefault()
    const { data, error } = await supabase.functions.invoke('create-staff', { body: form })
    const err = error ? (await error.context?.json?.().catch(() => null))?.error || error.message : data?.error
    setMsg(err ? errText(t, err) : t('staff_created'))
    if (!err) { setForm(null); load() }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_staff')}</h1>
        <button className="btn primary" onClick={() => setForm({ full_name: '', email: '', password: '', role: 'staff' })}>+ {t('add_staff')}</button></div>
      {msg && <p className="note">{msg}</p>}
      {form && (
        <form className="card grid2" onSubmit={create}>
          <label>{t('full_name')}<input required value={form.full_name} onChange={set('full_name')} /></label>
          <label>{t('email')}<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label>{t('password')}<input type="text" required minLength={8} value={form.password} onChange={set('password')} placeholder={t('pw_hint')} /></label>
          <label>{t('role')}<select value={form.role} onChange={set('role')}><option value="staff">{t('role_staff')}</option><option value="admin">{t('role_admin')}</option></select></label>
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setForm(null)}>{t('cancel')}</button><button className="btn primary">{t('add')}</button></div>
        </form>
      )}
      <div className="card flush"><table>
        <thead><tr><th>{t('full_name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('active')}</th></tr></thead>
        <tbody>{rows.map((r) => { const self = r.id === me.id; return (
          <tr key={r.id} className={r.active ? '' : 'dim'}>
            <td><b>{r.full_name}</b>{self && <span className="muted small"> ({t('you')})</span>}</td>
            <td><select value={r.role} disabled={self} onChange={(e) => update(r.id, { role: e.target.value })}><option value="staff">{t('role_staff')}</option><option value="admin">{t('role_admin')}</option></select></td>
            <td>{status(r.id)}</td>
            <td><input type="checkbox" checked={r.active} disabled={self} onChange={(e) => update(r.id, { active: e.target.checked })} /></td>
          </tr>) })}</tbody>
      </table></div>

      <div className="row between wrap"><h2>🕒 {t('logins')}</h2><input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></div>
      {!visits.length ? <p className="muted">{t('no_logins')}</p> : (
        <div className="card flush"><table>
          <thead><tr><th>{t('full_name')}</th><th>{t('login_at')}</th><th>{t('logout_at')}</th><th className="num">{t('duration')}</th></tr></thead>
          <tbody>{visits.map((v) => (
            <tr key={v.id}>
              <td><b>{name(v.staff_id)}</b></td>
              <td>{hm(v.started_at)}</td>
              <td>{online(v) ? <span className="ok">🟢 {t('online_now')}</span> : v.ended_at ? `${hm(v.ended_at)} · ${t('signed_out')}` : `${hm(v.last_seen_at)} · ${t('last_activity')}`}</td>
              <td className="num">{dur(v)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <p className="muted small">{t('presence_hint')}</p>
    </section>
  )
}
