import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa, num } from '../lib/format'
import { errText } from '../lib/errors'
import { cacheServices, cachedServices, enqueue, isNetworkError, newRef } from '../lib/offline'
import Receipt from '../components/Receipt.jsx'
import { useBusiness } from '../lib/business.jsx'
import { isLow } from '../lib/summary'

export default function Sale() {
  const { t, lang } = useI18n()
  const { isAdmin, profile } = useAuth()
  const { biz } = useBusiness()
  const [services, setServices] = useState(cachedServices())
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState([]) // [{ service, quantity }]
  const [pay, setPay] = useState('cash')
  const [momoRef, setMomoRef] = useState('')
  const [received, setReceived] = useState('')
  const [discount, setDiscount] = useState('')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [account, setAccount] = useState(null) // selected customer account
  const [custQ, setCustQ] = useState('')
  const [custList, setCustList] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [offlineDone, setOfflineDone] = useState(null)
  const [usePts, setUsePts] = useState('')
  const [lowAfter, setLowAfter] = useState([])

  useEffect(() => {
    supabase.from('services').select('*').eq('active', true).order('sort_order').then(({ data, error }) => {
      if (!error && data) { setServices(data); cacheServices(data) }
    })
  }, [])
  useEffect(() => {
    if (custQ.trim().length < 2) { setCustList([]); return }
    const h = setTimeout(() => {
      supabase.from('customers').select('*').eq('active', true).or(`name.ilike.%${custQ.trim()}%,phone.ilike.%${custQ.trim()}%`).limit(6)
        .then(({ data }) => setCustList(data || []))
    }, 250)
    return () => clearTimeout(h)
  }, [custQ])

  const name = (s) => (lang === 'fr' ? s.name_fr : s.name_en)
  const unit = (s) => (lang === 'fr' ? s.unit_fr : s.unit_en)
  const shown = services.filter((s) => (cat === 'all' || s.category === cat) && `${s.name_fr} ${s.name_en}`.toLowerCase().includes(q.toLowerCase()))
  const subtotal = useMemo(() => cart.reduce((a, c) => a + Math.round(c.service.price * (Number(c.quantity) || 0)), 0), [cart])
  const disc = Math.min(Math.max(parseInt(discount, 10) || 0, 0), subtotal)
  const loyalty = biz?.plan === 'pro' && biz?.loyalty_enabled
  const ptValue = biz?.loyalty_value || 0
  const maxPts = loyalty && account && ptValue > 0 ? Math.min(account.points || 0, Math.floor((subtotal - disc) / ptValue)) : 0
  const pts = Math.min(Math.max(parseInt(usePts, 10) || 0, 0), maxPts)
  const total = subtotal - disc - pts * ptValue
  const willEarn = loyalty && account ? Math.floor(total / (biz.loyalty_per || 100)) : 0
  const rec = parseInt(received, 10) || 0

  const add = (s) => setCart((c) => {
    const i = c.findIndex((x) => x.service.id === s.id)
    if (i < 0) return [...c, { service: s, quantity: 1 }]
    const n = [...c]; n[i] = { ...n[i], quantity: (Number(n[i].quantity) || 0) + 1 }; return n
  })
  const setQty = (id, v) => setCart((c) => c.map((x) => (x.service.id === id ? { ...x, quantity: v } : x)))
  const reset = () => { setCart([]); setMomoRef(''); setReceived(''); setDiscount(''); setCustomer(''); setPhone(''); setErr(''); setPay('cash'); setAccount(null); setCustQ(''); setUsePts('') }
  const pickAccount = (c) => { setAccount(c); setCustQ(''); setCustList([]) }

  async function checkout() {
    setErr('')
    const lines = cart.filter((c) => Number(c.quantity) > 0)
    if (!lines.length) return setErr(t('err_empty_sale'))
    if (pay === 'cash' && received !== '' && rec < total) return setErr(t('err_not_enough'))
    if (pay === 'mobile_money' && !momoRef.trim()) return setErr(t('err_momo_ref_required'))
    const params = {
      items: lines.map((c) => ({ service_id: c.service.id, quantity: Number(c.quantity) })),
      payment_method: pay, momo_ref: momoRef.trim(), amount_received: pay === 'cash' ? (rec || total) : total,
      discount: disc, customer_name: customer.trim(), customer_phone: phone.trim(), customer: account?.id || null,
      ...(pts > 0 ? { redeem_points: pts } : {}),
    }
    const client_ref = newRef()
    setBusy(true)
    const { data, error } = await supabase.rpc('record_sale2', { ...params, client_ref })
    setBusy(false)
    if (error && isNetworkError(error) && pay !== 'account' && pts === 0) {
      const sale = { client_ref, params, created_at: new Date().toISOString(), total, staff: profile.full_name,
        lines: lines.map((c) => ({ label: name(c.service), quantity: Number(c.quantity), unit_price: c.service.price })) }
      enqueue(sale); setOfflineDone(sale); return
    }
    if (error) return setErr(errText(t, error))
    setDone(data.id)
    // Warn the cashier if this sale took paper or ink below its alert level.
    const used = [...new Set(lines.map((c) => c.service.stock_item_id).filter(Boolean))]
    if (used.length) supabase.from('stock_items').select('name, quantity, low_threshold, unit').in('id', used).then(({ data: st }) => setLowAfter((st || []).filter(isLow)))
    else setLowAfter([])
  }

  if (done) return (
    <section><h1>{t('receipt')}</h1>
      {lowAfter.length > 0 && <p className="alert block no-print">⚠️ {t('low_stock_alert')} {lowAfter.map((i) => `${i.name} (${num(i.quantity)} ${i.unit})`).join(', ')}</p>}
      <Receipt saleId={done} onClose={() => { setDone(null); setLowAfter([]); reset() }} />
    </section>
  )
  if (offlineDone) return (
    <section><h1>{t('receipt')}</h1>
      <div className="receipt-wrap">
        <div className="receipt" id="receipt">
          <div className="r-head">{biz?.logo_url && <img className="r-logo" src={biz.logo_url} alt="" />}<b>{biz?.name}</b></div>
          <div className="r-void">{t('provisional_receipt')}</div>
          <div className="r-meta"><div><span>Ref</span><span>{offlineDone.client_ref.slice(0, 8).toUpperCase()}</span></div>
            <div><span>{t('date')}</span><span>{new Date(offlineDone.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</span></div>
            <div><span>{t('cashier')}</span><span>{offlineDone.staff}</span></div></div>
          <table className="r-items"><tbody>{offlineDone.lines.map((l, i) => (
            <tr key={i}><td>{l.label}<div className="r-sub">{num(l.quantity)} × {fcfa(l.unit_price)}</div></td><td className="num">{fcfa(Math.round(l.quantity * l.unit_price))}</td></tr>))}</tbody></table>
          <div className="r-tot"><div className="big"><span>{t('total')}</span><span>{fcfa(offlineDone.total)}</span></div></div>
        </div>
        <div className="row wrap no-print">
          <button className="btn primary" onClick={() => window.print()}>🖨️ {t('print')}</button>
          <button className="btn ghost" onClick={() => { setOfflineDone(null); reset() }}>{t('new_sale')}</button>
        </div>
      </div>
    </section>
  )

  return (
    <section className="pos">
      <div className="pos-left">
        <div className="row wrap"><input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          {['all', ...CATEGORIES].map((c) => <button key={c} className={'chip ' + (cat === c ? 'on' : '')} onClick={() => setCat(c)}>{c === 'all' ? t('all') : t('cat_' + c)}</button>)}
        </div>
        <div className="svc-grid">
          {shown.map((s) => (
            <button key={s.id} className="svc" onClick={() => add(s)} disabled={s.price <= 0 && !isAdmin}>
              <b>{name(s)}</b>
              <span className="muted small">{s.price > 0 ? `${fcfa(s.price)} / ${unit(s)}` : t('price_missing')}</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="card pos-cart">
        <div className="row between"><h2>{t('cart')}</h2>{cart.length > 0 && <button className="btn ghost small" onClick={reset}>{t('clear')}</button>}</div>
        {!cart.length && <p className="muted">{t('cart_empty')}</p>}
        {cart.map((c) => (
          <div key={c.service.id} className="line">
            <div className="grow"><b>{name(c.service)}</b><div className="muted small">{fcfa(c.service.price)} / {unit(c.service)}</div></div>
            <div className="stepper">
              <button onClick={() => setQty(c.service.id, Math.max(0, (Number(c.quantity) || 0) - 1))}>−</button>
              <input inputMode="decimal" value={c.quantity} onChange={(e) => setQty(c.service.id, e.target.value)} aria-label={t('qty')} />
              <button onClick={() => setQty(c.service.id, (Number(c.quantity) || 0) + 1)}>+</button>
            </div>
            <div className="num w-amt">{fcfa(Math.round(c.service.price * (Number(c.quantity) || 0)))}</div>
          </div>
        ))}
        <div className="totals">
          <div className="row between"><span>{t('subtotal')}</span><span>{fcfa(subtotal)}</span></div>
          <label className="row between"><span>{t('discount')}</span><input className="w-amt" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></label>
          <div className="row between big"><span>{t('total')}</span><span>{fcfa(total)}</span></div>
        </div>

        {account ? (
          <div className="acct-pill"><span>👤 <b>{account.name}</b> · {t('balance_short')} <span className={account.balance < 0 ? 'warn' : 'ok'}>{fcfa(account.balance)}</span></span>
            <button className="btn ghost small" onClick={() => { setAccount(null); setUsePts(''); if (pay === 'account') setPay('cash') }}>✕</button></div>
        ) : (
          <div className="cust-search">
            <input placeholder={'👤 ' + t('find_customer')} value={custQ} onChange={(e) => setCustQ(e.target.value)} />
            {custList.length > 0 && <div className="dropdown">{custList.map((c) => <button key={c.id} onClick={() => pickAccount(c)}><b>{c.name}</b> <span className="muted small">{c.phone} · {fcfa(c.balance)}</span></button>)}</div>}
          </div>
        )}

        {loyalty && account && (
          <div className="points-box">
            <span>⭐ <b>{num(account.points || 0)}</b> {t('points')} <span className="muted small">(= {fcfa((account.points || 0) * ptValue)})</span></span>
            {maxPts > 0 && <label className="row"><span className="small">{t('use_points')}</span>
              <input className="w-amt" type="number" min="0" max={maxPts} value={usePts} onChange={(e) => setUsePts(e.target.value)} placeholder="0" />
              <button type="button" className="btn ghost small" onClick={() => setUsePts(String(maxPts))}>{t('max')}</button></label>}
            {pts > 0 && <span className="ok small">− {fcfa(pts * ptValue)}</span>}
            {willEarn > 0 && <span className="muted small">+{willEarn} {t('points')} {t('after_sale')}</span>}
          </div>
        )}
        <div className={'seg wide' + (account ? ' three' : '')}>
          <button className={pay === 'cash' ? 'on' : ''} onClick={() => setPay('cash')}>💵 {t('pay_cash')}</button>
          <button className={pay === 'mobile_money' ? 'on' : ''} onClick={() => setPay('mobile_money')}>📱 {t('pay_momo')}</button>
          {account && <button className={pay === 'account' ? 'on' : ''} onClick={() => setPay('account')}>👤 {t('pay_account')}</button>}
        </div>
        {pay === 'cash' && (
          <label>{t('received')}<input type="number" min="0" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />
            {rec > total && <span className="ok">{t('change_due')}: {fcfa(rec - total)}</span>}</label>
        )}
        {pay === 'mobile_money' && <label>{t('momo_ref')}<input value={momoRef} onChange={(e) => setMomoRef(e.target.value)} /></label>}
        {pay === 'account' && account && <p className="muted small">{t('after_sale_balance')}: <b className={account.balance - total < 0 ? 'warn' : 'ok'}>{fcfa(account.balance - total)}</b> ({t('credit_limit')} {fcfa(account.credit_limit)})</p>}
        {!account && (
          <details><summary className="muted small">{t('customer')}</summary>
            <div className="grid2 mt"><input placeholder={t('full_name')} value={customer} onChange={(e) => setCustomer(e.target.value)} /><input placeholder={t('customer_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </details>
        )}
        {err && <p className="alert">{err}</p>}
        <button className="btn primary full big" disabled={busy || !cart.length} onClick={checkout}>{t('checkout')} · {fcfa(total)}</button>
      </aside>
    </section>
  )
}
