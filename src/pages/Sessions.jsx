import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fcfa } from '../lib/format'
import { errText } from '../lib/errors'
import PayBox from '../components/PayBox.jsx'
import Receipt from '../components/Receipt.jsx'

// Same rule as the database: per minute, 15 min minimum, rounded up to 25 F CFA.
const price = (rate, mins) => Math.ceil((Math.max(mins, 15) * rate) / 60 / 25) * 25
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? h + 'h ' : ''}${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s` }

export default function Sessions() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuth()
  const [stations, setStations] = useState([])
  const [open, setOpen] = useState([])
  const [svcs, setSvcs] = useState([])
  const [svc, setSvc] = useState('')
  const [names, setNames] = useState({})
  const [now, setNow] = useState(Date.now())
  const [stopping, setStopping] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.from('stations').select('*').eq('active', true).order('sort_order'),
      supabase.from('computer_sessions').select('*').is('ended_at', null),
      supabase.from('services').select('*').eq('active', true).eq('category', 'internet').gt('price', 0).order('sort_order'),
    ])
    setStations(a.data || []); setOpen(b.data || []); setSvcs(c.data || [])
    if (!svc && c.data?.length) setSvc(c.data[0].id)
  }
  useEffect(() => { load(); const i = setInterval(() => setNow(Date.now()), 1000); const r = setInterval(load, 20000); return () => { clearInterval(i); clearInterval(r) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function start(st) {
    setMsg('')
    const { error } = await supabase.rpc('start_session', { station: st.id, service: svc, customer_name: names[st.id] || '' })
    if (error) setMsg(errText(t, error))
    setNames({ ...names, [st.id]: '' }); load()
  }
  async function stop(p) {
    setBusy(true)
    const { data, error } = await supabase.rpc('end_session', { session: stopping.id, ...p })
    setBusy(false)
    if (error) return setMsg(errText(t, error))
    setStopping(null); load(); setReceipt(data.id)
  }
  async function cancel(cs) {
    const { error } = await supabase.rpc('cancel_session', { session: cs.id })
    if (error) setMsg(errText(t, error))
    setStopping(null); load()
  }

  if (receipt) return <section><button className="btn ghost no-print" onClick={() => setReceipt(null)}>← {t('nav_sessions')}</button><Receipt saleId={receipt} /></section>
  const name = (s) => (lang === 'fr' ? s.name_fr : s.name_en)

  return (
    <section>
      <div className="row between wrap"><h1>{t('nav_sessions')}</h1>
        {svcs.length > 0 && <label className="row">{t('rate')}<select value={svc} onChange={(e) => setSvc(e.target.value)}>{svcs.map((s) => <option key={s.id} value={s.id}>{name(s)} · {fcfa(s.price)}/h</option>)}</select></label>}</div>
      <p className="muted small">{t('billing_rule')}</p>
      {!svcs.length && <p className="alert">{t('no_internet_service')}</p>}
      {msg && <p className="alert">{msg}</p>}
      <div className="stations">
        {stations.map((st) => {
          const cs = open.find((o) => o.station_id === st.id)
          const ms = cs ? now - new Date(cs.started_at).getTime() : 0
          const mins = Math.ceil(ms / 60000)
          return (
            <div key={st.id} className={'station card ' + (cs ? 'busy' : 'free')}>
              <div className="row between"><b className="big">🖥️ {st.name}</b><span className={'pill ' + (cs ? 'warnpill' : 'okpill')}>{t(cs ? 'busy' : 'free')}</span></div>
              {cs ? (
                <>
                  {cs.customer_name && <div className="muted">{cs.customer_name}</div>}
                  <div className="timer">{mmss(ms)}</div>
                  <div className="row between"><span className="muted">{t('due_now')}</span><b>{fcfa(price(cs.rate_per_hour, mins))}</b></div>
                  {stopping?.id === cs.id ? (
                    <>
                      <PayBox total={price(cs.rate_per_hour, mins)} busy={busy} onPay={stop} label={t('take_payment')} />
                      <div className="row between"><button className="btn ghost small" onClick={() => setStopping(null)}>{t('cancel')}</button>
                        {isAdmin && <button className="btn ghost small" onClick={() => cancel(cs)}>{t('cancel_session')}</button>}</div>
                    </>
                  ) : <button className="btn primary full" onClick={() => setStopping(cs)}>⏹ {t('stop_bill')}</button>}
                </>
              ) : (
                <>
                  <input placeholder={t('customer')} value={names[st.id] || ''} onChange={(e) => setNames({ ...names, [st.id]: e.target.value })} />
                  <button className="btn primary full" disabled={!svc} onClick={() => start(st)}>▶ {t('start')}</button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
