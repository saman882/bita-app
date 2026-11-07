import { weekStart, monthStart } from './fmt'

/**
 * Efficiency (company formula): 1 − (actual − standard) / standard
 * Can be negative when actual > 2 × standard — intended.
 */
export const efficiency = (actual, standard) => (standard > 0 ? 1 - (actual - standard) / standard : null)

/** Effective work = Σ operation time ÷ Σ presence time */
export const effective = (opSec, presenceSec) => (presenceSec > 0 ? opSec / presenceSec : null)

const blank = () => ({ qty: 0, actual: 0, standard: 0, count: 0, presence: 0, effOps: 0, days: new Set(), late: 0, lateDays: 0, early: 0, earlyDays: 0 })

function finish(g) {
  return {
    ...g,
    days: g.days.size,
    eff: efficiency(g.actual, g.standard),
    effective: effective(g.effOps, g.presence),
  }
}

/**
 * ops: rows of v_operations (only finished ones are counted)
 * att: rows of v_attendance
 */
export function analyze(ops, att) {
  const done = ops.filter((o) => o.ended_at)
  // presence per user+day, only for closed attendance
  const presKey = new Map()
  for (const a of att) if (a.presence_seconds != null) presKey.set(`${a.user_id}|${a.work_date}`, Number(a.presence_seconds))

  const total = blank()
  const byStage = new Map()
  const byDay = new Map()
  const byUser = new Map()

  const touch = (map, key, extra) => {
    if (!map.has(key)) map.set(key, { key, ...extra, ...blank() })
    return map.get(key)
  }

  for (const o of done) {
    const A = Number(o.actual_seconds)
    const S = Number(o.standard_total_seconds)
    const Q = Number(o.quantity)
    const closed = presKey.has(`${o.user_id}|${o.work_date}`)
    const groups = [
      total,
      touch(byStage, o.stage_id, { name: o.stage_name, unit: o.unit, color: o.color }),
      touch(byDay, o.work_date, { date: o.work_date }),
      touch(byUser, o.user_id, { user_id: o.user_id }),
    ]
    for (const g of groups) {
      g.qty += Q
      g.actual += A
      g.standard += S
      g.count += 1
      g.days.add(o.work_date)
      if (closed) g.effOps += A
    }
  }

  for (const a of att) {
    const groups = [total, touch(byDay, a.work_date, { date: a.work_date }), touch(byUser, a.user_id, { user_id: a.user_id })]
    for (const g of groups) {
      g.days.add(a.work_date)
      if (a.presence_seconds != null) g.presence += Number(a.presence_seconds)
      const inD = Number(a.in_diff_seconds)
      if (inD > 0) { g.late += inD; g.lateDays += 1 }
      if (a.out_diff_seconds != null && Number(a.out_diff_seconds) < 0) { g.early += -Number(a.out_diff_seconds); g.earlyDays += 1 }
    }
  }

  return {
    total: finish(total),
    stages: [...byStage.values()].map(finish).sort((a, b) => b.actual - a.actual),
    days: [...byDay.values()].map(finish).sort((a, b) => (a.date < b.date ? 1 : -1)),
    users: [...byUser.values()].map(finish),
  }
}

/** Builds a trend series grouped by day / week / month, oldest first. */
export function trend(ops, att, mode, stageIds) {
  const keyOf = (d) => (mode === 'week' ? weekStart(d) : mode === 'month' ? monthStart(d) : d)
  const buckets = new Map()
  const pick = (k) => {
    if (!buckets.has(k)) buckets.set(k, { key: k, actual: 0, standard: 0, presence: 0, effOps: 0, perStage: {} })
    return buckets.get(k)
  }
  const presKey = new Set(att.filter((a) => a.presence_seconds != null).map((a) => `${a.user_id}|${a.work_date}`))
  for (const o of ops) {
    if (!o.ended_at) continue
    const b = pick(keyOf(o.work_date))
    const A = Number(o.actual_seconds), S = Number(o.standard_total_seconds)
    b.actual += A
    b.standard += S
    if (presKey.has(`${o.user_id}|${o.work_date}`)) b.effOps += A
    if (stageIds) {
      const ps = (b.perStage[o.stage_id] ||= { actual: 0, standard: 0 })
      ps.actual += A
      ps.standard += S
    }
  }
  for (const a of att) if (a.presence_seconds != null) pick(keyOf(a.work_date)).presence += Number(a.presence_seconds)

  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => {
      const row = {
        key: b.key,
        eff: round(efficiency(b.actual, b.standard)),
        effective: round(effective(b.effOps, b.presence)),
      }
      if (stageIds) for (const id of stageIds) {
        const ps = b.perStage[id]
        row[`s${id}`] = ps ? round(efficiency(ps.actual, ps.standard)) : null
      }
      return row
    })
}
const round = (r) => (r == null ? null : Math.round(r * 1000) / 10) // as percent with 1 decimal

/** CSV with BOM so Excel opens Persian text correctly. */
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
