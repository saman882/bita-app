import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isoToDate } from './fmt'

export const DEFAULT_HOURS = {
  weekday: { in: '07:30', out: '16:30' },
  thursday: { in: '07:30', out: '11:30' },
  breakfast: { start: '09:00', end: '09:20' },
  lunch: { start: '13:00', end: '14:00' },
  rest: { start: '15:00', end: '15:15' },
}

/** Default working hours (shared, editable with the `settings` permission). */
export function useWorkHours() {
  const [wh, setWh] = useState(DEFAULT_HOURS)
  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'work_hours').maybeSingle()
    if (data?.value) setWh({ ...DEFAULT_HOURS, ...data.value })
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
  return {
    clock_in: k === 'friday' ? '' : w.in, clock_out: k === 'friday' ? '' : w.out,
    breakfast_start: wh.breakfast.start, breakfast_end: wh.breakfast.end,
    lunch_start: wh.lunch.start, lunch_end: wh.lunch.end,
    rest_start: wh.rest.start, rest_end: wh.rest.end,
  }
}

/**
 * Scheduled working minutes of a day = default shift − default lunch inside it.
 * Sat–Wed 07:30–16:30 minus lunch 13–14 = 8h; Thursday 07:30–11:30 = 4h; Friday 0.
 */
export function baseMinutes(iso, wh) {
  const k = dayKind(iso)
  if (k === 'friday') return 0
  const w = k === 'thursday' ? wh.thursday : wh.weekday
  const a = toMin(w.in), b = toMin(w.out)
  return b - a - overlap(a, b, toMin(wh.lunch.start), toMin(wh.lunch.end))
}

/**
 * Metrics for one attendance day (minutes). A break only counts for the part of it
 * that falls inside the person's presence — e.g. on Thursday, lunch 13–14 is deducted
 * only if they were still at work then.
 *   presence  = out − in
 *   work      = presence − lunch                        (ساعت کارکرد)
 *   net       = presence − breakfast − lunch − rest      (زمان در دسترس برای کار)
 *   overtime  = max(0, work − scheduled)                 (اضافه‌کار)
 *   deficit   = max(0, scheduled − work)                 (کسر کار)
 */
export function dayMetrics(a, wh) {
  const i = toMin(a.clock_in), o = toMin(a.clock_out)
  if (i == null || o == null || o <= i) return null
  const presence = o - i
  const bf = overlap(i, o, toMin(a.breakfast_start), toMin(a.breakfast_end))
  const lunch = overlap(i, o, toMin(a.lunch_start), toMin(a.lunch_end))
  const rest = overlap(i, o, toMin(a.rest_start), toMin(a.rest_end))
  const work = presence - lunch
  const net = presence - bf - lunch - rest
  const base = baseMinutes(a.work_date, wh)
  return { presence, bf, lunch, rest, breaks: bf + lunch + rest, work, net, base, overtime: Math.max(0, work - base), deficit: Math.max(0, base - work) }
}
