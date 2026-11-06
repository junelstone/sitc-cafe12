import { useState } from 'react'
import { useI18n } from '../lib/i18n.jsx'
import { fcfa } from '../lib/format'

// Cash / Mobile Money capture. Calls onPay({ payment_method, momo_ref, amount_received }).
export default function PayBox({ total, busy, onPay, label }) {
  const { t } = useI18n()
  const [pay, setPay] = useState('cash')
  const [ref, setRef] = useState('')
  const [received, setReceived] = useState('')
  const rec = parseInt(received, 10) || 0
  return (
    <div className="paybox">
      <div className="seg wide">
        <button type="button" className={pay === 'cash' ? 'on' : ''} onClick={() => setPay('cash')}>💵 {t('pay_cash')}</button>
        <button type="button" className={pay === 'mobile_money' ? 'on' : ''} onClick={() => setPay('mobile_money')}>📱 {t('pay_momo')}</button>
      </div>
      {pay === 'cash' ? (
        <label>{t('received')}<input type="number" min="0" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total || '')} />
          {total > 0 && rec > total && <span className="ok">{t('change_due')}: {fcfa(rec - total)}</span>}</label>
      ) : (
        <label>{t('momo_ref')}<input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
      )}
      <button type="button" className="btn primary full big" disabled={busy || !(total > 0)}
        onClick={() => onPay({ payment_method: pay, momo_ref: ref.trim(), amount_received: pay === 'cash' ? (rec || total) : total })}>
        {label || t('checkout')} · {fcfa(total)}
      </button>
    </div>
  )
}
