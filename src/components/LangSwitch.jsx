import { useI18n } from '../lib/i18n.jsx'

export default function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="seg" role="group" aria-label={t('language')}>
      {['fr', 'en'].map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
}
