import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n.jsx'

// Shows "Install the app" when the browser allows installing to the home screen (Android / desktop Chrome).
export default function InstallButton() {
  const { t } = useI18n()
  const [evt, setEvt] = useState(null)
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (!evt) return null
  return <button className="btn small" onClick={async () => { evt.prompt(); await evt.userChoice; setEvt(null) }}>📲 {t('install_app')}</button>
}
