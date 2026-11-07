import { useBusiness } from '../lib/business.jsx'

// Café logo, or a coloured initial when the café has not uploaded one.
export default function BizLogo({ className = 'logo' }) {
  const { biz } = useBusiness()
  if (biz?.logo_url) return <img className={className} src={biz.logo_url} alt={biz.name} />
  return <span className={className + ' initial'} title={biz?.name}>{(biz?.name || '?').trim().charAt(0).toUpperCase()}</span>
}
