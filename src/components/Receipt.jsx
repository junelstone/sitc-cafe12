import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { fcfa, num } from '../lib/format'

// Loads a sale and shows a printable receipt. Bilingual labels are printed on the ticket.
export default function Receipt({ saleId, onClose }) {
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('sales').select('*, staff:profiles(full_name)').eq('id', saleId).single(),
      supabase.from('sale_items').select('*').eq('sale_id', saleId),
      supabase.from('settings').select('*').single(),
    ]).then(([s, i, st]) => setData({ sale: s.data, items: i.data || [], biz: st.data }))
  }, [saleId])

  function print(small) {
    document.body.classList.toggle('print-80', small)
    window.print()
  }
  if (!data?.sale) return <div className="card">…</div>
  const { sale, items, biz } = data
  const label = (l) => { const [fr, en] = l.split(' / '); return lang === 'fr' ? fr : (en || fr) }
  const when = new Date(sale.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')

  return (
    <div className="receipt-wrap">
      <div className="receipt" id="receipt">
        <div className="r-head"><img className="r-logo" src="/logo.png" alt="" /><b>{biz?.business_name}</b><div>{biz?.address}</div><div>{biz?.phone} · {biz?.email}</div></div>
        <div className="r-meta">
          <div><span>{t('receipt_no')}</span><b>{String(sale.receipt_no).padStart(6, '0')}</b></div>
          <div><span>{t('date')}</span><span>{when}</span></div>
          <div><span>{t('cashier')}</span><span>{sale.staff?.full_name}</span></div>
          {sale.customer_name && <div><span>{t('customer').split(' (')[0]}</span><span>{sale.customer_name}</span></div>}
        </div>
        {sale.voided && <div className="r-void">*** {t('voided').toUpperCase()} ***</div>}
        <table className="r-items"><tbody>{items.map((i) => (
          <tr key={i.id}><td>{label(i.label)}{/Code ?: ?(\S+)/.test(i.label) && <div className="r-code">{i.label.match(/Code ?: ?(\S+)/)[1]}</div>}<div className="r-sub">{num(i.quantity)} × {fcfa(i.unit_price)}</div></td><td className="num">{fcfa(i.line_total)}</td></tr>
        ))}</tbody></table>
        <div className="r-tot">
          {sale.discount > 0 && <><div><span>{t('subtotal')}</span><span>{fcfa(sale.subtotal)}</span></div><div><span>{t('discount')}</span><span>-{fcfa(sale.discount)}</span></div></>}
          <div className="big"><span>{t('total')}</span><span>{fcfa(sale.total)}</span></div>
          <div><span>{sale.payment_method === 'cash' ? t('pay_cash') : t('pay_momo')}</span><span>{sale.payment_method === 'cash' ? fcfa(sale.amount_received || sale.total) : sale.momo_ref}</span></div>
          {sale.payment_method === 'cash' && sale.amount_received > sale.total && <div><span>{t('change_due')}</span><span>{fcfa(sale.amount_received - sale.total)}</span></div>}
        </div>
        <div className="r-foot">{biz?.receipt_footer}</div>
      </div>
      <div className="row wrap no-print">
        <button className="btn primary" onClick={() => print(false)}>🖨️ {t('print')}</button>
        <button className="btn" onClick={() => print(true)}>{t('print_small')}</button>
        {onClose && <button className="btn ghost" onClick={onClose}>{t('new_sale')}</button>}
      </div>
    </div>
  )
}
