import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n.jsx'
import { dismissFailed, flush, status, subscribe } from '../lib/offline'

export default function OfflineBar() {
  const { t } = useI18n()
  const [st, setSt] = useState(status())
  useEffect(() => { flush(); return subscribe(setSt) }, [])
  if (st.online && !st.pending.length && !st.failed.length) return null
  return (
    <div className="offline-bar no-print">
      {!st.online && <span>📴 {t('offline_mode')}</span>}
      {st.pending.length > 0 && <span>⏳ {st.pending.length} {t('pending_sales')}{st.online && <button className="btn small" onClick={flush}>{t('send_now')}</button>}</span>}
      {st.failed.length > 0 && <span className="warn">⚠️ {st.failed.length} {t('failed_sales')}: {st.failed.map((f) => f.error).join(', ')} <button className="btn ghost small" onClick={dismissFailed}>OK</button></span>}
    </div>
  )
}
