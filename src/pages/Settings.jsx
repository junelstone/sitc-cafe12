import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { num } from '../lib/format'

export default function Settings() {
  const { t } = useI18n()
  const [s, setS] = useState(null)
  const [items, setItems] = useState([])
  const [item, setItem] = useState(null)
  const [msg, setMsg] = useState('')
  const [stations, setStations] = useState([])
  const [newSt, setNewSt] = useState('')

  const load = async () => {
    const [a, b] = await Promise.all([supabase.from('settings').select('*').single(), supabase.from('stock_items').select('*').order('name')])
    setS(a.data); setItems(b.data || [])
    const c = await supabase.from('stations').select('*').order('sort_order'); setStations(c.data || [])
  }
  useEffect(() => { load() }, [])

  async function saveBiz(e) {
    e.preventDefault()
    const { id, updated_at, ...rest } = s
    const { error } = await supabase.from('settings').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1)
    setMsg(error ? `${t('error')}: ${error.message}` : t('saved'))
  }
  async function saveItem(e) {
    e.preventDefault()
    const { id, created_at, ...rest } = item
    const body = { ...rest, quantity: Number(rest.quantity) || 0, low_threshold: Number(rest.low_threshold) || 0 }
    const { error } = id ? await supabase.from('stock_items').update(body).eq('id', id) : await supabase.from('stock_items').insert(body)
    setMsg(error ? `${t('error')}: ${error.message}` : t('saved'))
    if (!error) { setItem(null); load() }
  }
  async function stUpdate(id, p) { const { error } = await supabase.from('stations').update(p).eq('id', id); setMsg(error ? `${t('error')}: ${error.message}` : t('saved')); load() }
  async function stAdd(e) { e.preventDefault(); const { error } = await supabase.from('stations').insert({ name: newSt.trim(), sort_order: stations.length + 1 }); setMsg(error ? `${t('error')}: ${error.message}` : t('saved')); setNewSt(''); load() }
  if (!s) return null
  const setB = (k) => (e) => setS({ ...s, [k]: e.target.value })
  const setI = (k) => (e) => setItem({ ...item, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <section>
      <h1>{t('nav_settings')}</h1>
      {msg && <p className="note">{msg}</p>}
      <form className="card grid2" onSubmit={saveBiz}>
        <h2 className="span2">{t('business')}</h2>
        <label>{t('business_name')}<input value={s.business_name} onChange={setB('business_name')} /></label>
        <label>{t('phone')}<input value={s.phone} onChange={setB('phone')} /></label>
        <label>{t('address')}<input value={s.address} onChange={setB('address')} /></label>
        <label>{t('email')}<input value={s.email} onChange={setB('email')} /></label>
        <label className="span2">{t('receipt_footer')}<input value={s.receipt_footer} onChange={setB('receipt_footer')} /></label>
        <div className="row end span2"><button className="btn primary">{t('save')}</button></div>
      </form>

      <h2>{t('stations')}</h2>
      <div className="card">
        {stations.map((st) => (
          <div key={st.id} className="row mb"><input defaultValue={st.name} onBlur={(e) => e.target.value.trim() && e.target.value !== st.name && stUpdate(st.id, { name: e.target.value.trim() })} />
            <label className="check"><input type="checkbox" checked={st.active} onChange={(e) => stUpdate(st.id, { active: e.target.checked })} /> {t('active')}</label></div>
        ))}
        <form className="row" onSubmit={stAdd}><input required placeholder="PC 5" value={newSt} onChange={(e) => setNewSt(e.target.value)} /><button className="btn">+ {t('add_station')}</button></form>
      </div>

      <div className="row between"><h2>{t('stock_items')}</h2><button className="btn" onClick={() => setItem({ name: '', unit: 'pcs', quantity: 0, low_threshold: 0, active: true })}>+ {t('add_item')}</button></div>
      {item && (
        <form className="card grid2" onSubmit={saveItem}>
          <label>{t('item_name')}<input required value={item.name} onChange={setI('name')} /></label>
          <label>{t('unit')}<input value={item.unit} onChange={setI('unit')} /></label>
          <label>{t('quantity')}<input type="number" step="any" value={item.quantity} onChange={setI('quantity')} /></label>
          <label>{t('low_alert')}<input type="number" step="any" min="0" value={item.low_threshold} onChange={setI('low_threshold')} /></label>
          <label className="check"><input type="checkbox" checked={item.active} onChange={setI('active')} /> {t('active')}</label>
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setItem(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
        </form>
      )}
      <div className="card flush"><table>
        <thead><tr><th>{t('item_name')}</th><th className="num">{t('quantity')}</th><th className="num">{t('low_alert')}</th><th></th></tr></thead>
        <tbody>{items.map((r) => (
          <tr key={r.id} className={r.active ? '' : 'dim'}>
            <td><b>{r.name}</b></td>
            <td className={'num ' + (Number(r.quantity) <= Number(r.low_threshold) ? 'warn' : '')}>{num(r.quantity)} {r.unit}</td>
            <td className="num">{num(r.low_threshold)}</td>
            <td className="num"><button className="btn ghost small" onClick={() => setItem(r)}>{t('edit')}</button></td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}
