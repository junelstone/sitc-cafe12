import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth.jsx'
import { setCurrency } from './format'

// The signed-in user's café (name, logo, plan, subscription dates) and platform-owner flag.
const Biz = createContext(null)
const DAY = 86400000

export function BusinessProvider({ children }) {
  const { profile } = useAuth()
  const [biz, setBiz] = useState(null)
  const [isPlatform, setIsPlatform] = useState(false)
  const [prices, setPrices] = useState([])

  const refresh = useCallback(async () => {
    if (!profile?.business_id) { setBiz(null); return }
    const key = 'sitc.biz.' + profile.business_id
    try { const c = JSON.parse(localStorage.getItem(key)); if (c) { setBiz(c); setCurrency(c.currency_label) } } catch { /* no cache */ }
    const [b, p, pr] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', profile.business_id).single(),
      supabase.from('platform_admins').select('user_id').eq('user_id', profile.id).maybeSingle(),
      supabase.from('plan_prices').select('*').order('monthly'),
    ])
    if (b.data) { setBiz(b.data); setCurrency(b.data.currency_label); try { localStorage.setItem(key, JSON.stringify(b.data)) } catch { /* storage blocked */ } }
    setIsPlatform(Boolean(p.data)); setPrices(pr.data || [])
  }, [profile?.business_id, profile?.id])
  useEffect(() => { refresh() }, [refresh])

  const end = biz ? Math.max(new Date(biz.trial_ends_at).getTime(), biz.paid_until ? new Date(biz.paid_until).getTime() : 0) : 0
  const daysLeft = biz ? Math.ceil((end - Date.now()) / DAY) : null
  const access = !biz ? 'loading' : biz.status === 'suspended' ? 'suspended' : end < Date.now() ? 'expired' : 'ok'
  const onTrial = biz && (!biz.paid_until || new Date(biz.paid_until) < new Date(biz.trial_ends_at))
  return <Biz.Provider value={{ biz, refresh, isPlatform, prices, daysLeft, access, onTrial, endDate: end ? new Date(end) : null }}>{children}</Biz.Provider>
}
export const useBusiness = () => useContext(Biz)
