import { Link } from 'react-router-dom'
import { useBusiness } from '../lib/business.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.jsx'

// Reminder shown during the trial and in the last 7 days before the subscription ends.
export default function TrialBanner() {
  const { daysLeft, onTrial, access } = useBusiness()
  const { isAdmin } = useAuth()
  const { t } = useI18n()
  if (access !== 'ok' || daysLeft === null || (!onTrial && daysLeft > 7)) return null
  return (
    <div className={'trial-bar no-print' + (daysLeft <= 3 ? ' urgent' : '')}>
      <span>{daysLeft <= 1 ? `⚠️ ${t(onTrial ? 'trial_last_day' : 'sub_last_day')}` : onTrial ? `🎁 ${t('trial_left')} ${daysLeft} ${t('days')}` : `⏳ ${t('sub_ends_in')} ${daysLeft} ${t('days')}`}</span>
      {!isAdmin && daysLeft <= 3 && <span className="small">{t('tell_admin_pay')}</span>}
      {isAdmin && <Link className="btn small primary" to="/subscription">{t('subscribe_now')}</Link>}
    </div>
  )
}
