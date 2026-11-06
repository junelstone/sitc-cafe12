// Turn a database error like "momo_ref_required" into a translated message.
export function errText(t, error) {
  const m = (error?.message || String(error || '')).trim()
  const key = 'err_' + m
  const tr = t(key)
  return tr !== key ? tr : `${t('error')}: ${m}`
}
