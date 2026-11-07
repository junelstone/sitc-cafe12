import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useBusiness } from '../lib/business.jsx'
import { num } from '../lib/format'
import { errText } from '../lib/errors'
import BizLogo from '../components/BizLogo.jsx'

export default function Settings() {
  const { t } = useI18n()
  const { biz, refresh } = useBusiness()
  const [s, setS] = useState(null)
  const [items, setItems] = useState([])
  const [item, setItem] = useState(null)
  const [msg, setMsg] = useState('')
  const [stations, setStations] = useState([])
  const [newSt, setNewSt] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    const [b, c] = await Promise.all([supabase.from('stock_items').select('*').order('name'), supabase.from('stations').select('*').order('sort_order')])
    setItems(b.data || []); setStations(c.data || [])
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (biz && !s) setS(biz) }, [biz]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveBiz(e, patch = {}) {
    e?.preventDefault()
    const v = { ...s, ...patch }
    const { error } = await supabase.rpc('update_my_business', {
      name: v.name, owner_name: v.owner_name, address: v.address, city: v.city, phone: v.phone, email: v.email,
      receipt_footer: v.receipt_footer, logo_url: v.logo_url, currency_label: v.currency_label,
    })
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) refresh()
  }
  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setMsg(t('logo_too_big'))
    setUploading(true)
    const path = `${biz.id}/logo-${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setUploading(false); return setMsg(errText(t, error)) }
    const url = supabase.storage.from('logos').getPublicUrl(path).data.publicUrl
    setS({ ...s, logo_url: url }); await saveBiz(null, { logo_url: url }); setUploading(false)
  }
  async function saveItem(e) {
    e.preventDefault()
    const { id, created_at, business_id, ...rest } = item // eslint-disable-line no-unused-vars
    const body = { ...rest, quantity: Number(rest.quantity) || 0, low_threshold: Number(rest.low_threshold) || 0 }
    const { error } = id ? await supabase.from('stock_items').update(body).eq('id', id) : await supabase.from('stock_items').insert(body)
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) { setItem(null); load() }
  }
  async function stUpdate(id, p) { const { error } = await supabase.from('stations').update(p).eq('id', id); setMsg(error ? errText(t, error) : t('saved')); load() }
  async function stAdd(e) { e.preventDefault(); const { error } = await supabase.from('stations').insert({ name: newSt.trim(), sort_order: stations.length + 1 }); setMsg(error ? errText(t, error) : t('saved')); setNewSt(''); load() }
  if (!s) return null
  const setB = (k) => (e) => setS({ ...s, [k]: e.target.value })
  const setI = (k) => (e) => setItem({ ...item, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <section>
      <h1>{t('nav_settings')}</h1>
      {msg && <p className="note">{msg}</p>}
      <form className="card grid2" onSubmit={saveBiz}>
        <h2 className="span2 mt0">{t('business')}</h2>
        <div className="span2 row logo-row">
          <BizLogo className="logo-big" />
          <label className="btn">{uploading ? '…' : t('change_logo')}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadLogo} /></label>
          {s.logo_url && <button type="button" className="btn ghost small" onClick={() => { setS({ ...s, logo_url: '' }); saveBiz(null, { logo_url: '' }) }}>{t('delete')}</button>}
        </div>
        <label>{t('business_name')}<input required value={s.name} onChange={setB('name')} /></label>
        <label>{t('owner_name')}<input value={s.owner_name} onChange={setB('owner_name')} /></label>
        <label>{t('address')}<input value={s.address} onChange={setB('address')} /></label>
        <label>{t('city')}<input value={s.city} onChange={setB('city')} /></label>
        <label>{t('phone')}<input value={s.phone} onChange={setB('phone')} /></label>
        <label>{t('email')}<input value={s.email} onChange={setB('email')} /></label>
        <label>{t('currency')}<input value={s.currency_label} onChange={setB('currency_label')} placeholder="F CFA" /></label>
        <label>{t('receipt_footer')}<input value={s.receipt_footer} onChange={setB('receipt_footer')} /></label>
        <div className="row end span2"><button className="btn primary">{t('save')}</button></div>
      </form>

      <h2>{t('stations')}</h2>
      <div className="card">
        {stations.map((st) => (
          <div key={st.id} className="row mb"><input defaultValue={st.name} onBlur={(e) => e.target.value.trim() && e.target.value !== st.name && stUpdate(st.id, { name: e.target.value.trim() })} />
            <label className="check"><input type="checkbox" checked={st.active} onChange={(e) => stUpdate(st.id, { active: e.target.checked })} /> {t('active')}</label></div>
        ))}
        <form className="row" onSubmit={stAdd}><input required placeholder={`PC ${stations.length + 1}`} value={newSt} onChange={(e) => setNewSt(e.target.value)} /><button className="btn">+ {t('add_station')}</button></form>
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
