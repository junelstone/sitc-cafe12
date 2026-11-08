import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useBusiness } from '../lib/business.jsx'
import { intlPhone, ownerPhone, smsUrl, whatsappUrl } from '../lib/notify'

// WhatsApp / SMS buttons that send a ready-made message to the café owner's number.
export default function SendOwner({ text, label, small = false, phone }) {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const { biz } = useBusiness()
  const to = phone ?? ownerPhone(biz)
  const ok = Boolean(intlPhone(to))
  const cls = 'btn' + (small ? ' small' : '')
  return (
    <div className="send-owner row wrap">
      <a className={cls + ' wa'} href={whatsappUrl(ok ? to : '', text)} target="_blank" rel="noreferrer">📲 {label || t('send_whatsapp')}</a>
      {ok && <a className={cls + ' ghost'} href={smsUrl(to, text)}>✉️ SMS</a>}
      {!ok && !phone && <span className="muted small">{t('owner_wa_missing')} {isAdmin && <Link to="/settings">{t('nav_settings')}</Link>}</span>}
    </div>
  )
}
