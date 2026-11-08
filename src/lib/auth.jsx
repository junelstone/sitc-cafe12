import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Auth = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    const key = 'sitc.profile.' + session.user.id
    try { const c = JSON.parse(localStorage.getItem(key)); if (c) setProfile(c) } catch { /* no cache */ }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { if (data) { setProfile(data); try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* storage blocked */ } } })
  }, [session])

  const value = {
    session, profile, loading: session === undefined || (session && !profile),
    isAdmin: profile?.role === 'admin' && profile?.active,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: async () => {
      // Record the sign-out time for the admin's presence log (ignore errors, e.g. offline).
      try { await supabase.rpc('presence_end') } catch { /* offline */ }
      return supabase.auth.signOut()
    },
  }
  return <Auth.Provider value={value}>{children}</Auth.Provider>
}
export const useAuth = () => useContext(Auth)
