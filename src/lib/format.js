const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
let currency = 'F CFA'
export const setCurrency = (label) => { if (label) currency = label }
export const fcfa = (n) => `${nf.format(Math.round(Number(n) || 0))} ${currency}`
export const num = (n) => nf.format(Number(n) || 0)
