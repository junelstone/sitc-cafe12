const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
export const fcfa = (n) => `${nf.format(Math.round(Number(n) || 0))} F CFA`
export const num = (n) => nf.format(Number(n) || 0)
