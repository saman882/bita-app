import { weekStart, monthStart } from './fmt'

/**
 * Efficiency = standard time / actual time (company decision 1405/08/20).
 * Only jobs that have BOTH a recorded duration and a standard count toward it.
 */
export const efficiency = (actual, standard) => (standard > 0 && actual > 0 ? standard / actual : null)

/** Effective work (Excel "درصد حضور موثر") = Σ active operation time ÷ Σ presence time */
export const effective = (opSec, presenceSec) => (presenceSec > 0 ? opSec / presenceSec : null)

/** Seconds per unit actually taken (Excel "زمان واقعی یک عدد") */
export const perUnit = (actualSec, qty) => (actualSec > 0 && qty > 0 ? actualSec / qty : null)

const blank = () => ({ qty: 0, count: 0, actual: 0, standard: 0, timed: 0, untimed: 0, timedQty: 0, presence: 0, effOps: 0, days: new Set(), late: 0, lateDays: 0, early: 0, earlyDays: 0 })
const finish = (g) => ({ ...g, days: g.days.size, eff: efficiency(g.actual, g.standard), effective: effective(g.effOps, g.presence), unit: perUnit(g.actual, g.timedQty) })

/** jobs: rows of v_jobs, att: rows of v_attendance */
export function analyze(jobs, att) {
  const presKey = new Map()
  for (const a of att) if (a.presence_seconds != null) presKey.set(`${a.worker_id}|${a.work_date}`, Number(a.presence_seconds))

  const total = blank()
  const maps = { stage: new Map(), worker: new Map(), product: new Map(), type: new Map(), day: new Map(), ws: new Map() }
  const touch = (map, key, extra) => {
    if (!map.has(key)) map.set(key, { key, ...extra, ...blank() })
    return map.get(key)
  }

  for (const j of jobs) {
    const A = j.actual_seconds == null ? null : Number(j.actual_seconds)
    const S = j.standard_total_seconds == null ? null : Number(j.standard_total_seconds)
    const Q = Number(j.quantity)
    const both = A != null && S != null
    const groups = [
      total,
      touch(maps.stage, j.stage_id, { name: j.stage_name, color: j.color }),
      touch(maps.worker, j.worker_id, { name: j.worker_name }),
      touch(maps.product, j.product_id, { name: j.product_name, type: j.type_name }),
      touch(maps.type, j.type_id, { name: j.type_name }),
      touch(maps.day, j.work_date, { date: j.work_date }),
      touch(maps.ws, `${j.worker_id}|${j.stage_id}`, { worker_id: j.worker_id, stage_id: j.stage_id, name: j.worker_name, stage: j.stage_name, color: j.color }),
    ]
    for (const g of groups) {
      g.qty += Q
      g.count += 1
      g.days.add(j.work_date)
      if (A == null) g.untimed += 1
      else { g.timed += 1; g.timedQty += Q }
      if (both) { g.actual += A; g.standard += S }
      if (A != null && presKey.has(`${j.worker_id}|${j.work_date}`)) g.effOps += A
    }
  }
  for (const a of att) {
    for (const g of [total, touch(maps.worker, a.worker_id, { name: a.worker_name }), touch(maps.day, a.work_date, { date: a.work_date })]) {
      g.days.add(a.work_date)
      if (a.presence_seconds != null) g.presence += Number(a.presence_seconds)
      if (a.in_diff_seconds != null && Number(a.in_diff_seconds) > 0) { g.late += Number(a.in_diff_seconds); g.lateDays += 1 }
      if (a.out_diff_seconds != null && Number(a.out_diff_seconds) < 0) { g.early += -Number(a.out_diff_seconds); g.earlyDays += 1 }
    }
  }
  const list = (m) => [...m.values()].map(finish)
  return {
    total: finish(total),
    stages: list(maps.stage).sort((a, b) => b.qty - a.qty),
    workers: list(maps.worker).sort((a, b) => (b.eff ?? -1) - (a.eff ?? -1)),
    products: list(maps.product).sort((a, b) => b.qty - a.qty),
    types: list(maps.type),
    days: list(maps.day).sort((a, b) => (a.date < b.date ? 1 : -1)),
    workerStage: list(maps.ws),
  }
}

/** Trend series by day / week / month (oldest first); optional split by 'stage' or 'worker'. */
export function trend(jobs, att, mode, split) {
  const keyOf = (d) => (mode === 'week' ? weekStart(d) : mode === 'month' ? monthStart(d) : d)
  const buckets = new Map()
  const pick = (k) => {
    if (!buckets.has(k)) buckets.set(k, { key: k, actual: 0, standard: 0, qty: 0, presence: 0, effOps: 0, parts: {} })
    return buckets.get(k)
  }
  const presKey = new Set(att.filter((a) => a.presence_seconds != null).map((a) => `${a.worker_id}|${a.work_date}`))
  for (const j of jobs) {
    const b = pick(keyOf(j.work_date))
    b.qty += Number(j.quantity)
    const A = j.actual_seconds == null ? null : Number(j.actual_seconds)
    const S = j.standard_total_seconds == null ? null : Number(j.standard_total_seconds)
    if (A != null && S != null) {
      b.actual += A; b.standard += S
      if (split) {
        const id = split === 'stage' ? j.stage_id : j.worker_id
        const p = (b.parts[id] ||= { actual: 0, standard: 0 })
        p.actual += A; p.standard += S
      }
    }
    if (A != null && presKey.has(`${j.worker_id}|${j.work_date}`)) b.effOps += A
  }
  for (const a of att) if (a.presence_seconds != null) pick(keyOf(a.work_date)).presence += Number(a.presence_seconds)
  const pc = (r) => (r == null ? null : Math.round(r * 1000) / 10)
  return [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((b) => {
    const row = { key: b.key, eff: pc(efficiency(b.actual, b.standard)), effective: pc(effective(b.effOps, b.presence)), qty: b.qty }
    for (const [id, p] of Object.entries(b.parts)) row[`p${id}`] = pc(efficiency(p.actual, p.standard))
    return row
  })
}
