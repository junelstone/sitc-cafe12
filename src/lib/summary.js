// Plain-text messages for the owner (sent with WhatsApp or SMS).
import { fcfa, num } from './format'

const when = (d, lang) => new Date(d).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const lowLines = (low, t) => (low?.length ? ['', `⚠️ ${t('low_stock_alert')}`, ...low.map((i) => `• ${i.name}: ${num(i.quantity)} ${i.unit}`)] : [])

// After a cashier closes the till.
export function closeSummary({ close, biz, staff, low, t, lang }) {
  const d = close.difference
  return [
    `🔒 ${t('close_drawer')} · ${biz?.name || ''}`,
    `${t('cashier')}: ${staff}`,
    `${when(close.period_start, lang)} → ${when(close.period_end, lang)}`,
    '',
    `${t('opening_float')}: ${fcfa(close.opening_float)}`,
    `+ ${t('cash_in')}: ${fcfa(close.cash_sales)}`,
    `− ${t('cash_out')}: ${fcfa(close.cash_expenses)}`,
    `${t('expected')}: ${fcfa(close.expected_cash)}`,
    `${t('counted')}: ${fcfa(close.counted_cash)}`,
    `${t('difference')}: ${d === 0 ? t('drawer_ok') : `${d < 0 ? t('drawer_short') : t('drawer_over')} ${fcfa(Math.abs(d))}`}`,
    `📱 ${t('momo_info')}: ${fcfa(close.momo_sales)}`,
    ...(close.note ? ['', `${t('note')}: ${close.note}`] : []),
    ...lowLines(low, t),
  ].join('\n')
}

// The whole café's day (admin, from Today's cash).
export function daySummary({ day, biz, totals, count, byStaff, top, low, t, lang }) {
  const date = new Date(day + 'T12:00:00').toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return [
    `📊 ${t('day_summary')} · ${biz?.name || ''}`,
    date,
    '',
    `${t('total')}: ${fcfa(totals.all)} (${count} ${t('sales_count').toLowerCase()})`,
    `💵 ${t('pay_cash')}: ${fcfa(totals.cash)}`,
    `📱 ${t('pay_momo')}: ${fcfa(totals.mobile_money)}`,
    ...(totals.account ? [`👤 ${t('pay_account')}: ${fcfa(totals.account)}`] : []),
    ...(byStaff.length ? ['', `${t('by_staff')}:`, ...byStaff.map((r) => `• ${r.name}: ${fcfa(r.total)} (${r.n})`)] : []),
    ...(top.length ? ['', `${t('top_services')}:`, ...top.map((r) => `• ${r.label}: ${fcfa(r.total)}`)] : []),
    ...lowLines(low, t),
  ].join('\n')
}

// Restock list for the owner (from the Stock page).
export function restockList({ biz, low, t }) {
  return [`📦 ${t('restock_list')} · ${biz?.name || ''}`, '', ...low.map((i) => `• ${i.name}: ${num(i.quantity)} ${i.unit} (${t('low_alert').toLowerCase()} ${num(i.low_threshold)})`)].join('\n')
}

export const isLow = (i) => Number(i.quantity) <= Number(i.low_threshold)
