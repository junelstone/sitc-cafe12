import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'

export const EXP_CATS = ['rent', 'electricity', 'internet', 'paper', 'ink', 'salary', 'maintenance', 'transport', 'other']
const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function Expenses() {
  const { t, lang } = useI18n()
  const { profile, isAdmin } = useAuth()
  const [month, setMonth] = useState(thisMonth())
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const [y, m] = month.split('-').map(Number)
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    const { data } = await supabase.from('expenses').select('*, staff:profiles(full_name)').gte('spent_on', `${month}-01`).lt('spent_on', end).order('spent_on', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('expenses').insert({ ...form, amount: parseInt(form.amount, 10), staff_id: profile.id })
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) { setForm(null); load() }
  }
  async function del(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    setMsg(error ? errText(t, error) : t('saved')); load()
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const total = rows.reduce((a, r) => a + r.amount, 0)

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_expenses')}</h1>
        <div className="row"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn primary" onClick={() => setForm({ spent_on: new Date().toISOString().slice(0, 10), category: 'paper', description: '', amount: '', payment_method: 'cash' })}>+ {t('add_expense')}</button></div></div>
      {msg && <p className="note">{msg}</p>}
      {form && (
        <form className="card grid2" onSubmit={save}>
          <label>{t('date')}<input type="date" required value={form.spent_on} onChange={set('spent_on')} /></label>
          <label>{t('category')}<select value={form.category} onChange={set('category')}>{EXP_CATS.map((c) => <option key={c} value={c}>{t('exp_' + c)}</option>)}</select></label>
          <label className="span2">{t('description')}<input value={form.description} onChange={set('description')} /></label>
          <label>{t('amount')} (F CFA)<input type="number" min="1" required value={form.amount} onChange={set('amount')} /></label>
          <label>{t('pay_cash')}/{t('pay_momo')}<select value={form.payment_method} onChange={set('payment_method')}>
            <option value="cash">{t('pay_cash')}</option><option value="mobile_money">{t('pay_momo')}</option><option value="bank">{t('pay_bank')}</option></select></label>
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setForm(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
        </form>
      )}
      <div className="kpis"><div className="kpi"><span>{t('total')}</span><b>{fcfa(total)}</b></div></div>
      <div className="card flush"><table>
        <thead><tr><th>{t('date')}</th><th>{t('category')}</th><th>{t('description')}</th><th className="num">{t('amount')}</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="small">{new Date(r.spent_on + 'T12:00:00').toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</td>
            <td><span className="pill">{t('exp_' + r.category)}</span></td>
            <td>{r.description}<div className="muted small">{r.staff?.full_name} · {t(r.payment_method === 'cash' ? 'pay_cash' : r.payment_method === 'bank' ? 'pay_bank' : 'pay_momo')}</div></td>
            <td className="num">{fcfa(r.amount)}</td>
            <td className="num">{isAdmin && <button className="btn ghost small" onClick={() => del(r.id)}>{t('delete')}</button>}</td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}
