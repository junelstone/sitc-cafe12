import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import PayBox from '../components/PayBox.jsx'
import Receipt from '../components/Receipt.jsx'

export default function Customers() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [sel, setSel] = useState(null)
  const [hist, setHist] = useState([])
  const [amt, setAmt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [receipt, setReceipt] = useState(null)

  async function load() {
    const { data } = await supabase.from('customers').select('*').order('name').limit(500)
    setRows(data || [])
    if (sel) { const s = (data || []).find((c) => c.id === sel.id); setSel(s || null); if (s) loadHist(s.id) }
  }
  const loadHist = (id) => supabase.from('account_entries').select('*, sale:sales(receipt_no), staff:profiles(full_name)').eq('customer_id', id).order('created_at', { ascending: false }).limit(50).then(({ data }) => setHist(data || []))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault()
    const { id, balance, created_at, ...rest } = form // eslint-disable-line no-unused-vars
    const body = { ...rest, credit_limit: parseInt(rest.credit_limit, 10) || 0 }
    const { error } = id ? await supabase.from('customers').update(body).eq('id', id) : await supabase.from('customers').insert(body)
    setMsg(error ? errText(t, error) : t('saved'))
    if (!error) { setForm(null); load() }
  }
  async function topup(p) {
    setBusy(true)
    const { data, error } = await supabase.rpc('topup_account', { customer: sel.id, amount: parseInt(amt, 10) || 0, ...p })
    setBusy(false)
    if (error) return setMsg(errText(t, error))
    setAmt(''); setMsg(''); load(); setReceipt(data.id)
  }
  const open = (c) => { setSel(c); setForm(null); setAmt(''); loadHist(c.id) }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const shown = rows.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))
  const owed = rows.filter((c) => c.balance < 0).reduce((a, c) => a - c.balance, 0)

  if (receipt) return <section><button className="btn ghost no-print" onClick={() => setReceipt(null)}>← {t('nav_customers')}</button><Receipt saleId={receipt} /></section>

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_customers')}</h1>
        <div className="row"><input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => { setForm({ name: '', phone: '', kind: 'individual', credit_limit: 0, note: '', active: true }); setSel(null) }}>+ {t('add_customer')}</button></div></div>
      {msg && <p className="note">{msg}</p>}
      {owed > 0 && <p className="muted">{t('total_owed')}: <b className="warn">{fcfa(owed)}</b></p>}
      {form && (
        <form className="card grid2" onSubmit={save}>
          <label>{t('full_name')}<input required value={form.name} onChange={set('name')} /></label>
          <label>{t('customer_phone')}<input type="tel" value={form.phone} onChange={set('phone')} /></label>
          <label>{t('kind')}<select value={form.kind} onChange={set('kind')}><option value="individual">{t('individual')}</option><option value="business">{t('business_kind')}</option></select></label>
          <label>{t('credit_limit')} (F CFA)<input type="number" min="0" value={form.credit_limit} onChange={set('credit_limit')} disabled={!isAdmin} /></label>
          <label className="span2">{t('note')}<input value={form.note} onChange={set('note')} /></label>
          {form.id && <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> {t('active')}</label>}
          <div className="row end span2"><button type="button" className="btn ghost" onClick={() => setForm(null)}>{t('cancel')}</button><button className="btn primary">{t('save')}</button></div>
        </form>
      )}
      <div className={sel ? 'split' : ''}>
        <div className="card flush"><table>
          <thead><tr><th>{t('full_name')}</th><th>{t('customer_phone')}</th><th className="num">{t('balance_short')}</th></tr></thead>
          <tbody>{shown.map((c) => (
            <tr key={c.id} className={'click ' + (sel?.id === c.id ? 'sel ' : '') + (c.active ? '' : 'dim')} onClick={() => open(c)}>
              <td><b>{c.name}</b>{c.kind === 'business' && <span className="pill">{t('business_kind')}</span>}</td>
              <td className="small">{c.phone}</td>
              <td className={'num ' + (c.balance < 0 ? 'warn' : c.balance > 0 ? 'ok' : '')}>{fcfa(c.balance)}</td>
            </tr>))}</tbody>
        </table></div>
        {sel && (
          <aside className="card job-detail">
            <div className="row between"><h2>{sel.name}</h2><button className="btn ghost small" onClick={() => setSel(null)}>✕</button></div>
            {sel.phone && <a href={'tel:' + sel.phone}>{sel.phone}</a>}
            <div className="row between big"><span>{t('balance_short')}</span><span className={sel.balance < 0 ? 'warn' : 'ok'}>{fcfa(sel.balance)}</span></div>
            <p className="muted small">{sel.balance < 0 ? t('owes') : t('prepaid')} · {t('credit_limit')} {fcfa(sel.credit_limit)}</p>
            {isAdmin && <button className="btn ghost small" onClick={() => setForm(sel)}>{t('edit')}</button>}
            <div className="paywrap">
              <h3>{sel.balance < 0 ? t('pay_debt') : t('add_credit')}</h3>
              <label>{t('amount')}<div className="row"><input type="number" min="1" value={amt} onChange={(e) => setAmt(e.target.value)} />
                {sel.balance < 0 && <button type="button" className="btn small" onClick={() => setAmt(String(-sel.balance))}>{t('all_owed')}</button>}</div></label>
              <PayBox total={parseInt(amt, 10) || 0} busy={busy} onPay={topup} label={t('take_payment')} />
            </div>
            <h3>{t('history')}</h3>
            <div className="hist">{hist.map((h) => (
              <div key={h.id} className="row between small">
                <span>{new Date(h.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')} · {t('ae_' + h.kind)}{h.sale?.receipt_no && ` #${h.sale.receipt_no}`}</span>
                <b className={h.change < 0 ? 'warn' : 'ok'}>{h.change > 0 ? '+' : ''}{fcfa(h.change)}</b>
              </div>))}</div>
          </aside>
        )}
      </div>
    </section>
  )
}
