// Build WhatsApp / SMS links for telling a customer their job is ready.
// Congo numbers: "06 453 02 55" -> "242064530255".
export function intlPhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (!d.startsWith('242')) d = '242' + d
  return d.length >= 11 ? d : ''
}

export function readyMessage(job, biz, balance) {
  const name = biz?.name || ''
  const due = balance > 0 ? ` Reste à payer : ${new Intl.NumberFormat('fr-FR').format(balance)} F CFA.` : ''
  const dueEn = balance > 0 ? ` Balance due: ${new Intl.NumberFormat('fr-FR').format(balance)} F CFA.` : ''
  return `Bonjour ${job.customer_name}, votre travail N°${job.number ?? job.job_no} est prêt chez ${name}.${due} Merci !\n` +
    `Hello ${job.customer_name}, your job No.${job.number ?? job.job_no} is ready at ${name}.${dueEn} Thank you!`
}

// With no valid number, WhatsApp opens and lets the user pick the contact.
export const whatsappUrl = (phone, text) => `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`
export const smsUrl = (phone, text) => `sms:+${intlPhone(phone)}?body=${encodeURIComponent(text)}`

// The number that receives owner summaries: the WhatsApp number in Settings, else the café phone.
export const ownerPhone = (biz) => biz?.owner_whatsapp || biz?.phone || ''
