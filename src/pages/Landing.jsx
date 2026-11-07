import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { num } from '../lib/format'
import { useI18n } from '../lib/i18n.jsx'
import LangSwitch from '../components/LangSwitch.jsx'

const FEATURES = [['🧾', 'f_sales'], ['🖨️', 'f_receipts'], ['⏱️', 'f_sessions'], ['⌨️', 'f_jobs'], ['📦', 'f_stock'], ['💰', 'f_drawer'],
  ['📶', 'f_wifi'], ['👥', 'f_accounts'], ['📊', 'f_reports'], ['📱', 'f_mobile'], ['🌍', 'f_lang'], ['🔒', 'f_staff']]
const DEFAULT_PRICES = [{ plan: 'starter', monthly: 7500, yearly: 75000, max_staff: 2, max_stations: 4 }, { plan: 'pro', monthly: 15000, yearly: 150000, max_staff: null, max_stations: null }]

// Public sales page for other cafés.
export default function Landing() {
  const { t } = useI18n()
  const [prices, setPrices] = useState(DEFAULT_PRICES)
  useEffect(() => { supabase?.from('plan_prices').select('*').order('monthly').then(({ data }) => { if (data?.length) setPrices(data) }) }, [])
  return (
    <div className="landing">
      <header className="land-top">
        <div className="brand"><img className="logo" src="/logo.png" alt="" /><b>{t('product')}</b></div>
        <div className="row"><LangSwitch /><Link className="btn small" to="/login">{t('signIn')}</Link></div>
      </header>
      <section className="hero">
        <h1>{t('hero_title')}</h1>
        <p>{t('hero_sub')}</p>
        <Link className="btn primary big" to="/signup">{t('start_trial')}</Link>
        <p className="small">{t('hero_note')}</p>
      </section>
      <section className="land-sec">
        <h2>{t('features_title')}</h2>
        <div className="features">{FEATURES.map(([ico, k]) => (
          <div key={k} className="tile"><span className="ico">{ico}</span><b>{t(k)}</b><span className="muted small">{t(k + '_d')}</span></div>))}
        </div>
      </section>
      <section className="land-sec">
        <h2>{t('pricing_title')}</h2>
        <div className="plans">{prices.map((p) => (
          <div key={p.plan} className={'card plan' + (p.plan === 'pro' ? ' featured' : '')}>
            {p.plan === 'pro' && <span className="pill">{t('most_popular')}</span>}
            <h3>{t('plan_' + p.plan)}</h3>
            <div className="price">{num(p.monthly)} <small>F CFA / {t('per_month')}</small></div>
            <p className="muted small">{t('or')} {num(p.yearly)} F CFA / {t('per_year')} ({t('two_months_free')})</p>
            <ul>
              <li>{p.max_staff == null ? t('unlimited_staff') : `${p.max_staff} ${t('staff_logins')}`}</li>
              <li>{p.max_stations == null ? t('unlimited_pcs') : `${p.max_stations} ${t('computers_max')}`}</li>
              <li>{t('incl_core')}</li>
              {p.plan === 'pro' && <li>{t('incl_pro')}</li>}
            </ul>
            <Link className={'btn full ' + (p.plan === 'pro' ? 'primary' : '')} to={'/signup?plan=' + p.plan}>{t('start_trial')}</Link>
          </div>))}
        </div>
        <p className="muted small center-text">{t('pay_by_momo_note')}</p>
      </section>
      <footer className="land-foot muted small">
        {t('made_by')} Stone&apos;s IT Consulting · Brazzaville · +242 06 453 02 55 · <a href="mailto:contactus@sitc.fun">contactus@sitc.fun</a>
      </footer>
    </div>
  )
}
