import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { errText } from '../lib/errors'

export default function Staff() {
  const { t } = useI18n()
  const { profile: me } = useAuth()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')

  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

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
        <thead><tr><th>{t('full_name')}</th><th>{t('role')}</th><th>{t('active')}</th></tr></thead>
        <tbody>{rows.map((r) => { const self = r.id === me.id; return (
          <tr key={r.id} className={r.active ? '' : 'dim'}>
            <td><b>{r.full_name}</b>{self && <span className="muted small"> ({t('you')})</span>}</td>
            <td><select value={r.role} disabled={self} onChange={(e) => update(r.id, { role: e.target.value })}><option value="staff">{t('role_staff')}</option><option value="admin">{t('role_admin')}</option></select></td>
            <td><input type="checkbox" checked={r.active} disabled={self} onChange={(e) => update(r.id, { active: e.target.checked })} /></td>
          </tr>) })}</tbody>
      </table></div>
    </section>
  )
}
