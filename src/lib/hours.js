import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isoToDate } from './fmt'

/**
 * Default working hours. Breaks are a list; each can be removed or added (e.g. a second rest).
 * `unpaid` breaks (like lunch) are deducted from work hours (ساعت کارکرد / اضافه‌کار);
 * every break is deducted from the time available for operations.
 */
export const DEFAULT_HOURS = {
  weekday: { in: '07:30', out: '16:30' },
  thursday: { in: '07:30', out: '11:30' },
  breaks: [
    { name: 'صبحانه', start: '09:00', end: '09:20', unpaid: false },
    { name: 'ناهار', start: '13:00', end: '14:00', unpaid: true },
    { name: 'استراحت', start: '15:00', end: '15:15', unpaid: false },
  ],
}

const legacyBreaks = (o) => [
  o.breakfast && { name: 'صبحانه', start: o.breakfast.start, end: o.breakfast.end, unpaid: false },
  o.lunch && { name: 'ناهار', start: o.lunch.start, end: o.lunch.end, unpaid: true },
  o.rest && { name: 'استراحت', start: o.rest.start, end: o.rest.end, unpaid: false },
].filter(Boolean)

export const normalizeHours = (v) => {
  if (!v) return DEFAULT_HOURS
  return { weekday: v.weekday || DEFAULT_HOURS.weekday, thursday: v.thursday || DEFAULT_HOURS.thursday, breaks: Array.isArray(v.breaks) ? v.breaks : legacyBreaks(v) }
}

/** Default working hours (shared, editable with the `settings` permission). */
export function useWorkHours() {
  const [wh, setWh] = useState(DEFAULT_HOURS)
  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'work_hours').maybeSingle()
    if (data?.value) setWh(normalizeHours(data.value))
  }, [])
  useEffect(() => { load() }, [load])
  return [wh, load]
}

/** "HH:MM[:SS]" -> minutes since midnight (null if empty) */
export const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}
const overlap = (a1, a2, b1, b2) => (a1 == null || a2 == null || b1 == null || b2 == null ? 0 : Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)))

/** 0 Sat … 6 Fri (Iranian week) */
export const iranDow = (iso) => (isoToDate(iso).getUTCDay() + 1) % 7
export const dayKind = (iso) => (iranDow(iso) === 5 ? 'thursday' : iranDow(iso) === 6 ? 'friday' : 'weekday')

/** The default clock-in/out and breaks to prefill for a given date. */
export function defaultsFor(iso, wh) {
  const k = dayKind(iso)
  const w = k === 'thursday' ? wh.thursday : wh.weekday
  return { clock_in: k === 'friday' ? '' : w.in, clock_out: k === 'friday' ? '' : w.out, breaks: wh.breaks.map((b) => ({ ...b })) }
}
/** Default start of the shift for a date (null on Friday). */
export function shiftStart(iso, wh) {
  const k = dayKind(iso)
  return k === 'friday' ? null : (k === 'thursday' ? wh.thursday : wh.weekday).in
}

/** Breaks of a saved attendance row (new list, or the old fixed columns). */
export function breaksOf(a) {
  if (Array.isArray(a.breaks)) return a.breaks
  return [
    { name: 'صبحانه', start: a.breakfast_start, end: a.breakfast_end, unpaid: false },
    { name: 'ناهار', start: a.lunch_start, end: a.lunch_end, unpaid: true },
    { name: 'استراحت', start: a.rest_start, end: a.rest_end, unpaid: false },
  ].filter((b) => b.start && b.end)
}

/**
 * Scheduled working minutes of a day = default shift − default unpaid breaks inside it.
 * Sat–Wed 07:30–16:30 minus lunch 13–14 = 8h; Thursday 07:30–11:30 = 4h; Friday 0.
 */
export function baseMinutes(iso, wh) {
  const k = dayKind(iso)
  if (k === 'friday') return 0
  const w = k === 'thursday' ? wh.thursday : wh.weekday
  const a = toMin(w.in), b = toMin(w.out)
  return b - a - wh.breaks.filter((x) => x.unpaid).reduce((s, x) => s + overlap(a, b, toMin(x.start), toMin(x.end)), 0)
}

/**
 * Metrics for one attendance day (minutes). A break only counts for the part of it
 * that falls inside the person's presence.
 *   presence  = out − in
 *   work      = presence − unpaid breaks (lunch)         (ساعت کارکرد)
 *   net       = presence − all breaks                    (زمان در دسترس برای کار)
 *   overtime  = max(0, work − scheduled)                 (اضافه‌کار)
 *   deficit   = max(0, scheduled − work)                 (کسر کار)
 *   late      = clock-in after the expected start        (تأخیر)
 */
export function dayMetrics(a, wh) {
  const i = toMin(a.clock_in), o = toMin(a.clock_out)
  if (i == null || o == null || o <= i) return null
  const presence = o - i
  let breaks = 0, unpaid = 0
  for (const b of breaksOf(a)) {
    const m = overlap(i, o, toMin(b.start), toMin(b.end))
    breaks += m
    if (b.unpaid) unpaid += m
  }
  const work = presence - unpaid
  const net = presence - breaks
  const base = baseMinutes(a.work_date, wh)
  const exp = toMin(a.expected_in || shiftStart(a.work_date, wh))
  const late = exp != null ? Math.max(0, i - exp) : 0
  return { presence, breaks, unpaid, work, net, base, overtime: Math.max(0, work - base), deficit: Math.max(0, base - work), late }
}
