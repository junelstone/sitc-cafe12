import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, useI18n } from '../lib/i18n.jsx'
import { fcfa } from '../lib/format'

const EMPTY = { name_fr: '', name_en: '', category: 'documents', price: 0, unit_fr: 'unité', unit_en: 'unit', stock_item_id: null, stock_per_unit: 0, active: true }

export default function Services() {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState([])
  const [stock, setStock] = useState([])
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const [s, st] = await Promise.all([
      supabase.from('services').select('*').order('sort_order').order('name_fr'),
      supabase.from('stock_items').select('id,name').eq('active', true).order('name'),
    ])
    setRows(s.data || []); setStock(st.data || [])
  }
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    const { id, created_at, ...rest } = edit
    const body = { ...rest, price: Math.max(0, parseInt(rest.price, 10) || 0), stock_per_unit: Number(rest.stock_per_unit) || 0, stock_item_id: rest.stock_item_id || null }
    const { error } = id ? await supabase.from('services').update(body).eq('id', id) : await supabase.from('services').insert(body)
    setMsg(error ? `${t('error')}: ${error.message}` : t('saved'))
    if (!error) { setEdit(null); load() }
  }

  const name = (r) => (lang === 'fr' ? r.name_fr : r.name_en)
  const shown = rows.filter((r) => `${r.name_fr} ${r.name_en}`.toLowerCase().includes(q.toLowerCase()))
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_services')}</h1>
        <div className="row"><input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => setEdit(EMPTY)}>+ {t('add_service')}</button></div></div>
      {msg && <p className="note">{msg}</p>}

      {edit && (
        <form className="card grid2" onSubmit={save}>
          <label>{t('name_fr')}<input required value={edit.name_fr} onChange={set('name_fr')} /></label>
          <label>{t('name_en')}<input required value={edit.name_en} onChange={set('name_en')} /></label>
          <label>{t('category')}<select value={edit.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t('cat_' + c)}</option>)}</select></label>
          <label>{t('price')} (F CFA)<input type="number" min="0" step="1" required value={edit.price} onChange={set('price')} /></label>
          <label>{t('unit')} (FR)<input value={edit.unit_fr} onChange={set('unit_fr')} /></label>
          <label>{t('unit')} (EN)<input value={edit.unit_en} onChange={set('unit_en')} /></label>
          <label>{t('stock_link')}<select value={edit.stock_item_id || ''} onChange={set('stock_item_id')}><option value="">{t('none')}</option>{stock.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>{t('quantity')} {t('per_unit')}<input type="number" min="0" step="any" value={edit.stock_per_unit} onChange={set('stock_per_unit')} disabled={!edit.stock_item_id} /></label>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={set('active')} /> {t('active')}</label>
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
        </form>
      )}

      <div className="card flush"><table>
        <thead><tr><th>{t('nav_services')}</th><th>{t('category')}</th><th className="num">{t('price')}</th><th></th></tr></thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id} className={r.active ? '' : 'dim'}>
            <td><b>{name(r)}</b><div className="muted small">/ {lang === 'fr' ? r.unit_fr : r.unit_en}</div></td>
            <td><span className="pill">{t('cat_' + r.category)}</span></td>
            <td className="num">{r.price > 0 ? fcfa(r.price) : <span className="warn">{t('price_missing')}</span>}</td>
            <td className="num"><button className="btn ghost small" onClick={() => setEdit(r)}>{t('edit')}</button></td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}
