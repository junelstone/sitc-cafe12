import { supabase } from './supabase'

// Offline support for counter sales: cache the price list, queue sales made without
// internet, and send them later. Each queued sale has a client_ref so the server never
// records it twice, even if the same sale is sent again.

const QUEUE = 'sitc.queue'
const FAILED = 'sitc.failed'
const SERVICES = 'sitc.services'
const listeners = new Set()

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full or blocked */ } }
const emit = () => listeners.forEach((f) => f(status()))

export const newRef = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
export const isNetworkError = (error) => !navigator.onLine || /fetch|network|Load failed|timeout/i.test(error?.message || '')

export const cacheServices = (list) => write(SERVICES, list)
export const cachedServices = () => read(SERVICES, [])

export function enqueue(sale) { write(QUEUE, [...read(QUEUE, []), sale]); emit() }
export function status() { return { pending: read(QUEUE, []), failed: read(FAILED, []), online: navigator.onLine } }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function dismissFailed() { write(FAILED, []); emit() }

let flushing = false
export async function flush() {
  if (flushing || !navigator.onLine || !supabase) return
  flushing = true
  try {
    for (const sale of read(QUEUE, [])) {
      const { error } = await supabase.rpc('record_sale2', { ...sale.params, client_ref: sale.client_ref })
      if (error && isNetworkError(error)) break
      write(QUEUE, read(QUEUE, []).filter((s) => s.client_ref !== sale.client_ref))
      if (error) write(FAILED, [...read(FAILED, []), { ...sale, error: error.message }])
      emit()
    }
  } finally { flushing = false; emit() }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { emit(); flush() })
  window.addEventListener('offline', emit)
  setInterval(flush, 30000)
}
