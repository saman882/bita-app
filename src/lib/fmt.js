import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js'

export const TZ = 'Asia/Tehran'
const FA = '۰۱۲۳۴۵۶۷۸۹'

export const fa = (v) => String(v ?? '').replace(/\d/g, (d) => FA[d])
export const toEn = (s) =>
  String(s ?? '')
    .replace(/[۰-۹]/g, (d) => FA.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
export const normalizeFa = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک')

const nf = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })
export const num = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(n))
export const pct = (r) => (r == null || !Number.isFinite(r) ? '—' : `${nf.format(Math.round(r * 1000) / 10)}٪`)

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
export const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

/* ---------- ISO date strings (YYYY-MM-DD) as the canonical "work_date" ---------- */
const pad = (n) => String(n).padStart(2, '0')
export const isoFromParts = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const isoToDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}
export const dateToIso = (dt) => isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
export const addDays = (iso, n) => {
  const d = isoToDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return dateToIso(d)
}
/** Today's date in Tehran, given an (optionally server-corrected) epoch ms. */
export const tehranIso = (ms = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))

export const jParts = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return toJalaali(y, m, d) // {jy, jm, jd}
}
export const isoFromJ = (jy, jm, jd) => {
  const g = toGregorian(jy, jm, jd)
  return isoFromParts(g.gy, g.gm, g.gd)
}
export const jMonthLen = jalaaliMonthLength

export const jDate = (iso) => {
  const { jy, jm, jd } = jParts(iso)
  return fa(`${jy}/${pad(jm)}/${pad(jd)}`)
}
export const jDateLong = (iso) => {
  const { jy, jm, jd } = jParts(iso)
  return `${WEEKDAYS[isoToDate(iso).getUTCDay()]} ${fa(jd)} ${MONTHS[jm - 1]} ${fa(jy)}`
}
/** Saturday that starts the (Iranian) week containing iso. */
export const weekStart = (iso) => {
  const dow = isoToDate(iso).getUTCDay() // 0 Sun .. 6 Sat
  return addDays(iso, -((dow + 1) % 7))
}
export const monthStart = (iso) => {
  const { jy, jm } = jParts(iso)
  return isoFromJ(jy, jm, 1)
}
export const monthEnd = (iso) => {
  const { jy, jm } = jParts(iso)
  return isoFromJ(jy, jm, jMonthLen(jy, jm))
}
export const jMonthLabel = (iso) => {
  const { jy, jm } = jParts(iso)
  return `${MONTHS[jm - 1]} ${fa(jy)}`
}

/* ---------- Times ---------- */
const tf = new Intl.DateTimeFormat('fa-IR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
export const clock = (ts) => (ts ? tf.format(new Date(ts)) : '—')
export const shortTime = (t) => (t ? fa(String(t).slice(0, 5)) : '—')

/** 3725 -> "۱:۰۲:۰۵" */
export const hms = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.round(Math.abs(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return fa(`${h}:${pad(m)}:${pad(r)}`)
}
/** Human Persian duration: "۲ ساعت و ۳ دقیقه و ۱۲ ثانیه" */
export const humanDur = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.round(Math.abs(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const parts = []
  if (h) parts.push(`${fa(h)} ساعت`)
  if (m) parts.push(`${fa(m)} دقیقه`)
  if (r || !parts.length) parts.push(`${fa(r)} ثانیه`)
  return parts.join(' و ')
}
/** In-diff: positive = late. Out-diff: negative = early leave. */
export const inDiffLabel = (d) => {
  if (d == null) return { text: '—', tone: 'muted' }
  if (Math.abs(d) < 1) return { text: 'دقیقاً سر وقت', tone: 'good' }
  return d > 0 ? { text: `${humanDur(d)} تأخیر`, tone: 'bad' } : { text: `${humanDur(d)} زودتر`, tone: 'good' }
}
export const outDiffLabel = (d) => {
  if (d == null) return { text: '—', tone: 'muted' }
  if (Math.abs(d) < 1) return { text: 'دقیقاً سر وقت', tone: 'good' }
  return d < 0 ? { text: `${humanDur(d)} تعجیل`, tone: 'bad' } : { text: `${humanDur(d)} دیرتر`, tone: 'info' }
}
/** Epoch ms of a Tehran wall-clock time on a given date (Iran has no DST since 1401). */
export const tehranMs = (iso, time) => Date.parse(`${iso}T${String(time).slice(0, 8).padEnd(8, ':00')}+03:30`)

/** Seconds <-> "mm:ss" for standard-time inputs */
export const secToMmss = (s) => {
  const v = Math.round(Number(s) || 0)
  return `${Math.floor(v / 60)}:${pad(v % 60)}`
}
