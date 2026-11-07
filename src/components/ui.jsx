import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fa, toEn, jParts, isoFromJ, jMonthLen, MONTHS } from '../lib/fmt'

/* ---------------- Icons (stroke, 24px grid) ---------------- */
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  live: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  play: 'M7 4v16l13-8z',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'm5 12 5 5L20 7',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  key: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 1 1 8 0v4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
}
export function Icon({ name, size = 20, className = '', stroke = 2 }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}

/* ---------------- Toasts ---------------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, tone = 'good') => {
    const id = Math.random()
    setItems((x) => [...x, { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'bad' ? 'alert' : 'check'} size={18} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------------- Bottom sheet / modal ---------------- */
export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="بستن"><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

export const Spinner = ({ size = 18 }) => <span className="spinner" style={{ width: size, height: size }} />

export function Button({ children, loading, variant = 'primary', icon, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Kpi({ label, value, sub, tone = '', icon }) {
  return (
    <div className={`kpi ${tone ? 'kpi-' + tone : ''}`}>
      <div className="kpi-top">
        {icon && <span className="kpi-ic"><Icon name={icon} size={16} /></span>}
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export const Empty = ({ icon = 'box', title, text }) => (
  <div className="empty">
    <div className="empty-ic"><Icon name={icon} size={26} /></div>
    <b>{title}</b>
    {text && <p>{text}</p>}
  </div>
)

export const effTone = (r) => (r == null ? '' : r >= 0.95 ? 'good' : r >= 0.8 ? 'warn' : 'bad')

/* ---------------- Jalali date input ---------------- */
export function JDateInput({ value, onChange, label }) {
  const { jy, jm, jd } = jParts(value)
  const years = []
  for (let y = jy - 3; y <= jy + 1; y++) years.push(y)
  const set = (y, m, d) => onChange(isoFromJ(y, m, Math.min(d, jMonthLen(y, m))))
  return (
    <div className="jdate" role="group" aria-label={label}>
      <select value={jd} onChange={(e) => set(jy, jm, +e.target.value)} aria-label="روز">
        {Array.from({ length: jMonthLen(jy, jm) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{fa(d)}</option>)}
      </select>
      <select value={jm} onChange={(e) => set(jy, +e.target.value, jd)} aria-label="ماه">
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={jy} onChange={(e) => set(+e.target.value, jm, jd)} aria-label="سال">
        {years.map((y) => <option key={y} value={y}>{fa(y)}</option>)}
      </select>
    </div>
  )
}

/** Numeric text input that accepts Persian digits. */
export function NumInput({ value, onChange, ...rest }) {
  return (
    <input inputMode="decimal" dir="ltr" className="input input-num" value={fa(value)}
      onChange={(e) => onChange(toEn(e.target.value).replace(/[^\d.]/g, ''))} {...rest} />
  )
}
