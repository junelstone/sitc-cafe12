import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import Receipt from '../components/Receipt.jsx'

export default function Sale() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [services, setServices] = useState([])
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState([]) // [{ service, quantity }]
  const [pay, setPay] = useState('cash')
  const [momoRef, setMomoRef] = useState('')
  const [received, setReceived] = useState('')
  const [discount, setDiscount] = useState('')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.from('services').select('*').eq('active', true).order('sort_order').then(({ data }) => setServices(data || []))
  }, [])

  const name = (s) => (lang === 'fr' ? s.name_fr : s.name_en)
  const unit = (s) => (lang === 'fr' ? s.unit_fr : s.unit_en)
  const shown = services.filter((s) => (cat === 'all' || s.category === cat) && `${s.name_fr} ${s.name_en}`.toLowerCase().includes(q.toLowerCase()))
  const subtotal = useMemo(() => cart.reduce((a, c) => a + Math.round(c.service.price * (Number(c.quantity) || 0)), 0), [cart])
  const disc = Math.min(Math.max(parseInt(discount, 10) || 0, 0), subtotal)
  const total = subtotal - disc
  const rec = parseInt(received, 10) || 0

  const add = (s) => setCart((c) => {
    const i = c.findIndex((x) => x.service.id === s.id)
    if (i < 0) return [...c, { service: s, quantity: 1 }]
    const n = [...c]; n[i] = { ...n[i], quantity: (Number(n[i].quantity) || 0) + 1 }; return n
  })
  const setQty = (id, v) => setCart((c) => c.map((x) => (x.service.id === id ? { ...x, quantity: v } : x)).filter((x) => v === '' || Number(x.quantity) > 0 || x.service.id !== id))
  const reset = () => { setCart([]); setMomoRef(''); setReceived(''); setDiscount(''); setCustomer(''); setPhone(''); setErr(''); setPay('cash') }

  async function checkout() {
    setErr('')
    if (!cart.length) return setErr(t('err_empty_sale'))
    if (pay === 'cash' && received !== '' && rec < total) return setErr(t('err_not_enough'))
    setBusy(true)
    const { data, error } = await supabase.rpc('record_sale', {
      items: cart.filter((c) => Number(c.quantity) > 0).map((c) => ({ service_id: c.service.id, quantity: Number(c.quantity) })),
      payment_method: pay, momo_ref: momoRef.trim(), amount_received: pay === 'cash' ? (rec || total) : total,
      discount: disc, customer_name: customer.trim(), customer_phone: phone.trim(),
    })
    setBusy(false)
    if (error) return setErr(errText(t, error))
    setDone(data.id)
  }

  if (done) return <section><h1>{t('receipt')}</h1><Receipt saleId={done} onClose={() => { setDone(null); reset() }} /></section>

  return (
    <section className="pos">
      <div className="pos-left">
        <div className="row wrap">
          <input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
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
        <div className="seg wide">
          <button className={pay === 'cash' ? 'on' : ''} onClick={() => setPay('cash')}>💵 {t('pay_cash')}</button>
          <button className={pay === 'mobile_money' ? 'on' : ''} onClick={() => setPay('mobile_money')}>📱 {t('pay_momo')}</button>
        </div>
        {pay === 'cash' ? (
          <label>{t('received')}<input type="number" min="0" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />
            {rec > total && <span className="ok">{t('change_due')}: {fcfa(rec - total)}</span>}</label>
        ) : (
          <label>{t('momo_ref')}<input value={momoRef} onChange={(e) => setMomoRef(e.target.value)} /></label>
        )}
        <details><summary className="muted small">{t('customer')}</summary>
          <div className="grid2 mt"><input placeholder={t('full_name')} value={customer} onChange={(e) => setCustomer(e.target.value)} /><input placeholder={t('customer_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </details>
        {err && <p className="alert">{err}</p>}
        <button className="btn primary full big" disabled={busy || !cart.length} onClick={checkout}>{t('checkout')} · {fcfa(total)}</button>
      </aside>
    </section>
  )
}
