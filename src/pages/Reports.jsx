import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LabelList, Legend,
} from 'recharts'
import { supabase, errText } from '../lib/supabase'
import { analyze, efficiency } from '../lib/calc'
import { useAccess, can } from '../lib/access'
import { useWorkHours, dayMetrics } from '../lib/hours'
import { fa, num, pct, jDate, jDateLong, tehranIso, addDays, weekStart, monthStart, jParts, MONTHS, jMd } from '../lib/fmt'
import { Icon, Kpi, Empty, Spinner, JDateInput, useToast, effTone, Button, SearchSelect } from '../components/ui'
import { money } from './SalesEntry'

/* ---------------- helpers ---------------- */
const PRESETS = [['today', 'امروز'], ['week', 'این هفته'], ['month', 'این ماه'], ['lastmonth', 'ماه قبل'], ['90', '۳ ماه اخیر'], ['year', 'امسال']]
function presetRange(id) {
  const t = tehranIso()
  switch (id) {
    case 'today': return [t, t]
    case 'week': return [weekStart(t), t]
    case 'month': return [monthStart(t), t]
    case 'lastmonth': { const e = addDays(monthStart(t), -1); return [monthStart(e), e] }
    case '90': return [addDays(t, -89), t]
    case 'year': { let d = monthStart(t); while (jParts(d).jm > 1) d = monthStart(addDays(d, -1)); return [d, t] }
    default: return [t, t]
  }
}
const jIso = (iso) => { const { jy, jm, jd } = jParts(iso); return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}` }
const bucketOf = (iso, mode) => (mode === 'week' ? weekStart(iso) : mode === 'month' ? monthStart(iso) : iso)
const bucketLabel = (iso, mode) => {
  const { jy, jm, jd } = jParts(iso)
  if (mode === 'month') return `${MONTHS[jm - 1]} ${fa(String(jy).slice(2))}`
  return mode === 'week' ? `هفتهٔ ${jMd(iso)}` : jMd(iso)
}
const pc = (r) => (r == null ? null : Math.round(r * 1000) / 10)
const hm = (min) => { if (min == null) return '—'; const m = Math.round(min); return fa(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`) }
const hrs = (min) => Math.round((min / 60) * 100) / 100
const EFF_COLOR = (v) => (v == null ? 'var(--muted)' : v >= 95 ? 'var(--good)' : v >= 80 ? 'var(--warn)' : 'var(--bad)')
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

/** One-sheet Excel export of a report section. rows: array of arrays (first = header). */
async function exportSheet(title, rows, range) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([[title], [`از ${jIso(range[0])} تا ${jIso(range[1])}`], [], ...rows])
  ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2))) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, ws, title.slice(0, 30).replace(/[\\/?*[\]:]/g, ' '))
  book.Workbook = { Views: [{ RTL: true }] }
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true })
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const name = `${title} ${jIso(range[0]).replace(/\//g, '-')} تا ${jIso(range[1]).replace(/\//g, '-')}.xlsx`
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
  if (ios || standalone || /Telegram|Instagram|WhatsApp|; wv\)/i.test(ua)) {
    const file = new File([blob], name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function Section({ title, sub, rows, range, children, actions }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await exportSheet(title, rows(), range) } catch (e) { if (e?.name !== 'AbortError') toast(/import|fetch|module/i.test(e?.message || '') ? 'دریافت ابزار اکسل ناموفق بود؛ صفحه را تازه کنید' : errText(e), 'bad') } finally { setBusy(false) }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>{title}</h2>{sub && <small className="muted">{sub}</small>}</div>
        <div className="row-gap">{actions}{rows && <Button variant="ghost" icon="download" loading={busy} onClick={go} className="btn-xl">اکسل</Button>}</div>
      </div>
      {children}
    </section>
  )
}

function HBars({ rows, unit = '', color, wide, fmt }) {
  if (!rows.length) return <p className="muted small">داده‌ای نیست</p>
  const f = fmt || ((v) => fa(v) + unit)
  return (
    <div className="chart" dir="ltr">
      <ResponsiveContainer width="100%" height={Math.max(110, rows.length * 38)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: Math.min(130, 16 + 7 * Math.max(...rows.map((r) => String(f(r.v)).length))), top: 4, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, 'auto']} />
          <YAxis type="category" dataKey="name" orientation="left" width={wide ? 220 : 110} tick={{ fontSize: 12, fill: 'var(--text)', textAnchor: 'end' }} axisLine={false} tickLine={false} />
          {unit === '٪' && <ReferenceLine x={100} stroke="var(--good)" strokeDasharray="4 4" />}
          <Tooltip formatter={(v) => [f(v), '']} separator="" cursor={{ fill: 'var(--soft)' }} />
          <Bar dataKey="v" radius={[0, 8, 8, 0]} barSize={20}>
            {rows.map((r, i) => <Cell key={i} fill={color ? color(r.v, i) : r.c || 'var(--brand)'} />)}
            <LabelList dataKey="v" position="right" formatter={f} fill="var(--text)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Stacked({ rows, keys, fmt }) {
  if (!rows.length) return <p className="muted small">داده‌ای نیست</p>
  return (
    <div className="chart" dir="ltr">
      <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 40 + 40)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, 'auto']} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: 'var(--text)', textAnchor: 'end' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v, n) => [fmt(v), n]} cursor={{ fill: 'var(--soft)' }} />
          <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
          {keys.map(([k, label, c], i) => (
            <Bar key={k} dataKey={k} name={label} stackId="a" fill={c} barSize={22} radius={i === keys.length - 1 ? [0, 6, 6, 0] : 0}>
              <LabelList dataKey={k} position="center" formatter={(v) => (v >= 0.5 ? fmt(v) : '')} fill="#fff" fontSize={10} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Trend({ data, mode, setMode, unit = '', color = 'var(--brand)', effColors, lineOnly }) {
  const [kind, setKind] = useState('line')
  return (
    <>
      <div className="chart-opts">
        <div className="seg sm">{[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
        {!lineOnly && <div className="seg sm">{[['line', 'خطی'], ['bar', 'میله‌ای']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>}
      </div>
      <div className="chart" dir="ltr">
        <ResponsiveContainer width="100%" height={260}>
          {kind === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="key" interval={data.length <= 31 ? 0 : 'preserveStartEnd'} angle={data.length > 12 ? -45 : 0} textAnchor={data.length > 12 ? 'end' : 'middle'} height={data.length > 12 ? 46 : 30} tickFormatter={(k) => bucketLabel(k, mode)} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} minTickGap={8} />
              <YAxis orientation="left" tickFormatter={(v) => fa(v) + unit} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={54} />
              {unit === '٪' && <ReferenceLine y={100} stroke="var(--good)" strokeDasharray="4 4" />}
              <Tooltip labelFormatter={(k) => (mode === 'day' ? `${jDateLong(k)} (${jDate(k)})` : bucketLabel(k, mode))} formatter={(v) => [fa(v) + unit, '']} separator="" />
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={3} dot={data.length < 35 ? { r: 4, fill: color } : false} connectNulls>{data.length <= 31 && <LabelList dataKey="v" position="top" formatter={(v) => (v == null ? '' : fa(v))} fontSize={10} fill="var(--muted)" />}</Line>
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="key" interval={data.length <= 31 ? 0 : 'preserveStartEnd'} angle={data.length > 12 ? -45 : 0} textAnchor={data.length > 12 ? 'end' : 'middle'} height={data.length > 12 ? 46 : 30} tickFormatter={(k) => bucketLabel(k, mode)} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} minTickGap={6} />
              <YAxis orientation="left" tickFormatter={(v) => fa(v) + unit} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={54} />
              {unit === '٪' && <ReferenceLine y={100} stroke="var(--good)" strokeDasharray="4 4" />}
              <Tooltip labelFormatter={(k) => (mode === 'day' ? `${jDateLong(k)} (${jDate(k)})` : bucketLabel(k, mode))} formatter={(v) => [fa(v) + unit, '']} separator="" cursor={{ fill: 'var(--soft)' }} />
              <Bar dataKey="v" radius={[6, 6, 0, 0]}>{data.map((r) => <Cell key={r.key} fill={effColors ? EFF_COLOR(r.v) : color} />)}</Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  )
}

/* ================================ PAGE ================================ */
export default function Reports({ workers = [], initialTab }) {
  const access = useAccess()
  const tabs = [
    can(access, 'reports_staff') && ['staff', 'همکاران', 'users'],
    can(access, 'reports_production') && ['production', 'تولید', 'layers'],
    can(access, 'reports_sales') && ['sales', 'فروش', 'tag'],
  ].filter(Boolean)
  const [tab, setTab] = useState(tabs.some((t) => t[0] === initialTab) ? initialTab : tabs[0]?.[0])
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState(presetRange('month'))
  const [types, setTypes] = useState([])
  useEffect(() => { supabase.from('product_types').select('id, name').order('sort_order').then(({ data }) => setTypes(data || [])) }, [])

  if (!tabs.length) return <div className="page"><Empty icon="alert" title="به گزارش‌ها دسترسی ندارید" /></div>
  const range = [from, to]
  return (
    <div className="page">
      <div className="page-title"><h1>گزارش‌ها</h1></div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={16} />{l}</button>)}
      </div>
      <div className="card filters">
        <div className="chips">{PRESETS.map(([k, l]) => <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => { setPreset(k); setRange(presetRange(k)) }}>{l}</button>)}</div>
        <div className="range">
          <div><span className="muted small">از</span><JDateInput value={from} onChange={(v) => { setPreset(null); setRange([v, v > to ? v : to]) }} label="از تاریخ" /></div>
          <div><span className="muted small">تا</span><JDateInput value={to} onChange={(v) => { setPreset(null); setRange([v < from ? v : from, v]) }} label="تا تاریخ" /></div>
        </div>
      </div>
      {tab === 'staff' && <StaffReport range={range} workers={workers} />}
      {tab === 'production' && <ProductionReport range={range} types={types} />}
      {tab === 'sales' && <SalesReport range={range} types={types} />}
    </div>
  )
}

function useRows(view, dateCol, range, filters, deps) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    setRows(null)
    let q = supabase.from(view).select('*').gte(dateCol, range[0]).lte(dateCol, range[1]).order(dateCol)
    for (const [k, v] of Object.entries(filters)) if (v != null) q = q.eq(k, v)
    q.limit(50000).then(({ data, error }) => {
      if (!alive) return
      if (error) toast(errText(error), 'bad')
      setRows(data || [])
    })
    return () => { alive = false }
  }, [view, dateCol, range[0], range[1], ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return rows
}

/* ================================ STAFF ================================ */
function StaffReport({ range, workers }) {
  const [who, setWho] = useState(null)
  const [mode, setMode] = useState('day')
  const [wh] = useWorkHours()
  const jobs = useRows('v_jobs', 'work_date', range, { worker_id: who }, [who])
  const att = useRows('v_attendance', 'work_date', range, { worker_id: who }, [who])

  const r0 = (a, b) => (a != null && b != null ? a * b : null)
  const r = useMemo(() => {
    if (!jobs || !att) return null
    const res = analyze(jobs, [])
    const opByDay = new Map()
    for (const j of jobs) if (j.actual_seconds != null) { const k = `${j.worker_id}|${j.work_date}`; opByDay.set(k, (opByDay.get(k) || 0) + Number(j.actual_seconds) / 60) }
    const per = new Map()
    const T = { days: 0, presence: 0, work: 0, net: 0, breaks: 0, overtime: 0, otDays: 0, deficit: 0, ops: 0, idle: 0, late: 0, lateDays: 0 }
    const daily = []
    for (const a of att) {
      const m = dayMetrics(a, wh)
      if (!m) continue
      const ops = opByDay.get(`${a.worker_id}|${a.work_date}`) || 0
      const idle = Math.max(0, m.net - ops)
      if (!per.has(a.worker_id)) per.set(a.worker_id, { key: a.worker_id, name: a.worker_name, days: 0, presence: 0, work: 0, net: 0, breaks: 0, overtime: 0, otDays: 0, deficit: 0, ops: 0, idle: 0, late: 0, lateDays: 0 })
      for (const g of [per.get(a.worker_id), T]) {
        g.days += 1; g.presence += m.presence; g.work += m.work; g.net += m.net; g.breaks += m.breaks
        g.overtime += m.overtime; g.otDays += m.overtime > 0 ? 1 : 0; g.deficit += m.deficit; g.ops += ops; g.idle += idle
        g.late += m.late; g.lateDays += m.late > 0 ? 1 : 0
      }
      daily.push({ ...a, m, ops, idle })
    }
    const effW = Object.fromEntries(res.workers.map((w) => [w.key, w]))
    const names = new Map([...res.workers.map((w) => [w.key, w.name]), ...[...per.values()].map((p) => [p.key, p.name])])
    const people = [...names.keys()].map((id) => { const p = per.get(id), ew = effW[id]; const presence = p?.net ? p.ops / p.net : null
      return { id, name: names.get(id), eff: ew?.eff ?? null, ew, p, presence, effect: ew?.eff != null && presence != null ? ew.eff * presence : null } })
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
    const trendMap = new Map()
    for (const j of jobs) {
      if (j.actual_seconds == null || j.standard_total_seconds == null) continue
      const k = bucketOf(j.work_date, mode); const b = trendMap.get(k) || { a: 0, s: 0 }
      b.a += Number(j.actual_seconds); b.s += Number(j.standard_total_seconds); trendMap.set(k, b)
    }
    const trend = [...trendMap.entries()].sort().map(([key, b]) => ({ key, v: pc(efficiency(b.a, b.s)) }))
    const effect = r0(res.total.eff, T.net ? T.ops / T.net : null)
    return { res, people, T, effect, daily: daily.sort((a, b) => (a.work_date < b.work_date ? 1 : -1)), trend }
  }, [jobs, att, wh, mode])

  const workerItems = workers.map((w) => ({ id: w.id, name: w.full_name }))
  return (
    <>
      <div className="card filters"><SearchSelect label="همکار" items={workerItems} value={who} onChange={setWho} allLabel="همهٔ همکاران" /></div>
      {!r ? <div className="page-center"><Spinner size={28} /></div> : r.people.length === 0 ? <Empty icon="users" title="در این بازه اطلاعاتی ثبت نشده" /> : (
        <>
          <div className="kpis">
            <Kpi icon="target" label="بهره‌وری کل" value={pct(r.res.total.eff)} tone={effTone(r.res.total.eff)} sub="استاندارد ÷ صرف‌شده" />
            <Kpi icon="bolt" label="حضور مؤثر کل" value={pct(r.T.net ? r.T.ops / r.T.net : null)} sub="عملیات ÷ (حضور − استراحت‌ها)" />
            <Kpi icon="chart" label="اثربخشی کل" value={pct(r.effect)} tone={effTone(r.effect)} sub="بهره‌وری × حضور مؤثر" />
            <Kpi icon="alert" label="کل تأخیر" value={hm(r.T.late)} tone={r.T.late ? 'bad' : ''} sub={`${fa(r.T.lateDays)} بار`} />
            <Kpi icon="clock" label="کل ساعت کارکرد" value={hm(r.T.work)} sub={`${fa(r.T.days)} روز-نفر`} />
            <Kpi icon="plus" label="کل اضافه‌کار" value={hm(r.T.overtime)} tone={r.T.overtime ? 'info' : ''} sub={`${fa(r.T.otDays)} روز`} />
            <Kpi icon="alert" label="کل زمان بیکار" value={hm(r.T.idle)} tone={r.T.idle ? 'warn' : ''} />
          </div>

          <Section title="بهره‌وری هر همکار" sub="زمان استاندارد ÷ زمان صرف‌شده · سبز ۹۵٪ به بالا، زرد ۸۰ تا ۹۵٪، قرمز زیر ۸۰٪" range={range}
            rows={() => [['همکار', 'زمان صرف‌شده (دقیقه)', 'زمان استاندارد (دقیقه)', 'بهره‌وری ٪'], ...r.people.map((p) => [p.name, Math.round((p.ew?.actual || 0) / 60), Math.round((p.ew?.standard || 0) / 60), pc(p.eff) ?? ''])]}>
            <HBars rows={r.people.filter((p) => p.eff != null).map((p) => ({ name: p.name, v: pc(p.eff) }))} unit="٪" color={EFF_COLOR} />
          </Section>

          <Section title="حضور مؤثر هر همکار" sub="مجموع زمان عملیات ÷ (زمان حضور − صبحانه − ناهار − استراحت)" range={range}
            rows={() => [['همکار', 'زمان عملیات (ساعت)', 'حضور خالص (ساعت)', 'حضور مؤثر ٪'], ...r.people.map((p) => [p.name, hrs(p.p?.ops || 0), hrs(p.p?.net || 0), p.p?.net ? pc(p.p.ops / p.p.net) : ''])]}>
            <HBars rows={r.people.filter((p) => p.p?.net).map((p) => ({ name: p.name, v: pc(p.p.ops / p.p.net) }))} unit="٪" color={EFF_COLOR} />
          </Section>

          <Section title="اثربخشی هر همکار" sub="بهره‌وری × حضور مؤثر (= زمان استاندارد ÷ زمان در دسترس) · سبز ۹۵٪ به بالا، زرد ۸۰ تا ۹۵٪، قرمز زیر ۸۰٪" range={range}
            rows={() => [['همکار', 'بهره‌وری ٪', 'حضور مؤثر ٪', 'اثربخشی ٪'], ...r.people.map((p) => [p.name, pc(p.eff) ?? '', pc(p.presence) ?? '', pc(p.effect) ?? ''])]}>
            <HBars rows={r.people.filter((p) => p.effect != null).map((p) => ({ name: p.name, v: pc(p.effect) }))} unit="٪" color={EFF_COLOR} />
          </Section>

          <Section title="تأخیر هر همکار" sub="ورود بعد از ساعت شروع شیفت · مجموع زمان تأخیر و تعداد دفعات در این بازه" range={range}
            rows={() => [['همکار', 'روزهای حضور', 'دفعات تأخیر', 'مجموع تأخیر (دقیقه)', 'مجموع تأخیر (ساعت)'], ...r.people.filter((p) => p.p).map((p) => [p.name, p.p.days, p.p.lateDays, Math.round(p.p.late), hrs(p.p.late)])]}>
            {r.T.late === 0 ? <p className="muted small">در این بازه تأخیری ثبت نشده.</p> : <>
              <HBars rows={r.people.filter((p) => p.p?.late).sort((a, b) => b.p.late - a.p.late).map((p) => ({ name: p.name, v: p.p.late, n: p.p.lateDays }))} fmt={(v) => hm(v)} color={() => 'var(--bad)'} />
              <div className="table-wrap"><table className="table table-sm">
                <thead><tr><th>همکار</th><th>دفعات تأخیر</th><th>مجموع تأخیر</th></tr></thead>
                <tbody>{r.people.filter((p) => p.p?.late).sort((a, b) => b.p.late - a.p.late).map((p) => <tr key={p.id}><td>{p.name}</td><td>{fa(p.p.lateDays)} بار</td><td className="mono">{hm(p.p.late)}</td></tr>)}</tbody>
              </table></div>
            </>}
          </Section>

          <Section title="اضافه‌کار هر همکار" sub="هر روز: (حضور − ناهار) − ساعت موظف (شنبه تا چهارشنبه ۸ ساعت، پنجشنبه ۴ ساعت)" range={range}
            rows={() => [['همکار', 'روزهای حضور', 'روزهای اضافه‌کار', 'اضافه‌کار (ساعت)', 'کسر کار (ساعت)'], ...r.people.map((p) => [p.name, p.p?.days || 0, p.p?.otDays || 0, hrs(p.p?.overtime || 0), hrs(p.p?.deficit || 0)])]}>
            <HBars rows={r.people.filter((p) => p.p).map((p, i) => ({ name: p.name, v: hrs(p.p.overtime), c: PALETTE[i % 10] }))} fmt={(v) => hm(v * 60)} color={() => 'var(--info)'} />
          </Section>

          <Section title="ساعت کارکرد هر همکار" sub="زمان حضور − ناهار" range={range}
            rows={() => [['همکار', 'روزهای حضور', 'کل حضور (ساعت)', 'ناهار (ساعت)', 'ساعت کارکرد'], ...r.people.map((p) => [p.name, p.p?.days || 0, hrs(p.p?.presence || 0), hrs((p.p?.presence || 0) - (p.p?.work || 0)), hrs(p.p?.work || 0)])]}>
            <HBars rows={r.people.filter((p) => p.p).map((p) => ({ name: p.name, v: hrs(p.p.work) }))} fmt={(v) => hm(v * 60)} color={() => 'var(--brand)'} />
          </Section>

          <Section title="زمان بیکار هر همکار" sub="زمان حضور − زمان عملیات‌ها − صبحانه − ناهار − استراحت" range={range}
            rows={() => [['همکار', 'کل حضور (ساعت)', 'استراحت‌ها (ساعت)', 'زمان عملیات (ساعت)', 'زمان بیکار (ساعت)'], ...r.people.map((p) => [p.name, hrs(p.p?.presence || 0), hrs(p.p?.breaks || 0), hrs(p.p?.ops || 0), hrs(p.p?.idle || 0)])]}>
            <HBars rows={r.people.filter((p) => p.p).map((p) => ({ name: p.name, v: hrs(p.p.idle) }))} fmt={(v) => hm(v * 60)} color={() => 'var(--warn)'} />
          </Section>

          <Section title="ترکیب زمان حضور هر همکار" sub="زمان عملیات + زمان بیکار + استراحت‌ها = کل زمان حضور (ساعت)" range={range}
            rows={() => [['همکار', 'زمان عملیات (ساعت)', 'زمان بیکار (ساعت)', 'استراحت‌ها (ساعت)', 'کل حضور (ساعت)'], ...r.people.filter((p) => p.p).map((p) => [p.name, hrs(p.p.ops), hrs(p.p.idle), hrs(p.p.breaks), hrs(p.p.presence)])]}>
            <Stacked rows={r.people.filter((p) => p.p).map((p) => ({ name: p.name, ops: hrs(Math.min(p.p.ops, p.p.net)), idle: hrs(p.p.idle), breaks: hrs(p.p.breaks) }))}
              keys={[['ops', 'زمان عملیات', 'var(--good)'], ['idle', 'زمان بیکار', 'var(--warn)'], ['breaks', 'استراحت‌ها', '#94a3b8']]} fmt={(v) => hm(v * 60)} />
          </Section>

          <Section title="بهره‌وری هر همکار در هر عملیات" range={range}
            rows={() => [['همکار', ...r.res.stages.map((s) => s.name), 'کل'], ...r.res.workers.map((w) => [w.name, ...r.res.stages.map((s) => pc(r.res.workerStage.find((c) => c.worker_id === w.key && c.stage_id === s.key)?.eff) ?? ''), pc(w.eff) ?? ''])]}>
            <Matrix res={r.res} />
          </Section>

          <Section title="روند بهره‌وری" range={range} rows={() => [['دوره', 'بهره‌وری ٪'], ...r.trend.map((t) => [mode === 'day' ? jIso(t.key) : bucketLabel(t.key, mode), t.v ?? ''])]}>
            <Trend data={r.trend} mode={mode} setMode={setMode} unit="٪" lineOnly />
          </Section>

          <Section title="جزئیات روزانهٔ حضور" range={range}
            rows={() => [['تاریخ', 'همکار', 'ورود', 'خروج', 'تأخیر (دقیقه)', 'استراحت‌ها (ساعت)', 'حضور', 'کارکرد', 'اضافه‌کار', 'زمان عملیات', 'بیکار', 'حضور مؤثر ٪'],
              ...r.daily.map((d) => [jIso(d.work_date), d.worker_name, d.clock_in?.slice(0, 5), d.clock_out?.slice(0, 5), Math.round(d.m.late), hrs(d.m.breaks), hrs(d.m.presence), hrs(d.m.work), hrs(d.m.overtime), hrs(d.ops), hrs(d.idle), d.m.net ? pc(d.ops / d.m.net) : ''])]}>
            <div className="table-wrap"><table className="table table-sm">
              <thead><tr><th>تاریخ</th><th>همکار</th><th>ورود</th><th>خروج</th><th>تأخیر</th><th>کارکرد</th><th>اضافه‌کار</th><th>عملیات</th><th>بیکار</th><th>مؤثر</th></tr></thead>
              <tbody>{r.daily.slice(0, 300).map((d) => (
                <tr key={d.id}><td>{jDate(d.work_date)}</td><td>{d.worker_name}</td><td className="mono">{fa(d.clock_in?.slice(0, 5))}</td><td className="mono">{fa(d.clock_out?.slice(0, 5))}</td><td className={d.m.late ? 'mono tone-bad' : 'mono muted'}>{d.m.late ? hm(d.m.late) : '—'}</td>
                  <td className="mono">{hm(d.m.work)}</td><td className="mono">{d.m.overtime ? hm(d.m.overtime) : '—'}</td><td className="mono">{hm(d.ops)}</td><td className="mono">{hm(d.idle)}</td>
                  <td><span className={`badge badge-${effTone(d.m.net ? d.ops / d.m.net : null)}`}>{pct(d.m.net ? d.ops / d.m.net : null)}</span></td></tr>))}</tbody>
            </table></div>
          </Section>
        </>
      )}
    </>
  )
}

function Matrix({ res }) {
  const cell = Object.fromEntries(res.workerStage.map((c) => [`${c.worker_id}|${c.stage_id}`, c]))
  return (
    <div className="table-wrap"><table className="table matrix">
      <thead><tr><th>همکار</th>{res.stages.map((s) => <th key={s.key}><span className="dot" style={{ background: s.color }} />{s.name}</th>)}<th>کل</th></tr></thead>
      <tbody>{res.workers.map((w) => <tr key={w.key}><td><b>{w.name}</b></td>
        {res.stages.map((s) => {
          const c = cell[`${w.key}|${s.key}`]
          return <td key={s.key} className={c?.eff != null ? `heat-${effTone(c.eff)}` : ''} title={c ? `${num(c.qty)} عدد` : ''}>{c ? (c.eff == null ? <span className="muted small">بی‌ساعت</span> : pct(c.eff)) : ''}</td>
        })}
        <td><span className={`badge badge-${effTone(w.eff)}`}>{pct(w.eff)}</span></td></tr>)}</tbody>
    </table></div>
  )
}

/* ================================ PRODUCTION ================================ */
function ProductionReport({ range, types }) {
  const [group, setGroup] = useState(null)
  const [opGroup, setOpGroup] = useState(null)
  const [mode, setMode] = useState('day')
  const jobs = useRows('v_jobs', 'work_date', range, { type_id: group }, [group])

  const r = useMemo(() => {
    if (!jobs) return null
    const packed = jobs.filter((j) => j.is_packaging)
    const sum = (arr) => arr.reduce((s, j) => s + Number(j.quantity), 0)
    const byType = new Map(), byProduct = new Map(), byStage = new Map(), stageType = new Map(), trendM = new Map()
    for (const j of packed) {
      byType.set(j.type_name, (byType.get(j.type_name) || 0) + Number(j.quantity))
      const p = byProduct.get(j.product_id) || { name: j.product_name, type: j.type_name, qty: 0 }
      p.qty += Number(j.quantity); byProduct.set(j.product_id, p)
      const k = bucketOf(j.work_date, mode); trendM.set(k, (trendM.get(k) || 0) + Number(j.quantity))
    }
    for (const j of jobs) {
      if (opGroup && j.type_name !== opGroup) continue
      const s = byStage.get(j.stage_id) || { name: j.stage_name, color: j.color, qty: 0, packaging: j.is_packaging }
      s.qty += Number(j.quantity); byStage.set(j.stage_id, s)
      const st = stageType.get(j.stage_id) || {}; st[j.type_name] = (st[j.type_name] || 0) + Number(j.quantity); stageType.set(j.stage_id, st)
    }
    return {
      total: sum(packed), hasPackaging: jobs.some((j) => j.is_packaging),
      types: [...byType.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
      products: [...byProduct.values()].sort((a, b) => b.qty - a.qty),
      stages: [...byStage.values()].sort((a, b) => b.qty - a.qty),
      stageType, stageList: [...byStage.entries()],
      trend: [...trendM.entries()].sort().map(([key, v]) => ({ key, v })),
    }
  }, [jobs, mode, opGroup])

  const typeNames = types.map((t) => t.name)
  return (
    <>
      <div className="card filters"><SearchSelect label="گروه محصول" items={types} value={group} onChange={setGroup} allLabel="همهٔ گروه‌ها" /></div>
      {!r ? <div className="page-center"><Spinner size={28} /></div> : !jobs.length ? <Empty icon="layers" title="در این بازه تولیدی ثبت نشده" /> : (
        <>
          {!r.hasPackaging && <div className="banner banner-warn"><Icon name="alert" /><div>در این بازه عملیات «بسته‌بندی» ثبت نشده؛ تولید کل از تعداد بسته‌بندی‌شده حساب می‌شود، پس صفر است.</div></div>}
          <div className="kpis">
            <Kpi icon="box" label="تولید کل (بسته‌بندی‌شده)" value={num(r.total)} tone="good" sub="همهٔ محصولات" />
            {r.types.map((t) => <Kpi key={t.name} icon="tag" label={`تولید ${t.name}`} value={num(t.qty)} sub="بسته‌بندی‌شده" />)}
          </div>

          <Section title="تولید کل هر گروه محصول" sub="فقط محصولات بسته‌بندی‌شده" range={range}
            rows={() => [['گروه محصول', 'تعداد بسته‌بندی‌شده', 'سهم ٪'], ...r.types.map((t) => [t.name, t.qty, r.total ? pc(t.qty / r.total) : '']), ['جمع کل', r.total, 100]]}>
            <HBars rows={r.types.map((t, i) => ({ name: t.name, v: t.qty, c: PALETTE[i % 10] }))} fmt={(v) => num(v)} />
          </Section>

          {r.types.map((t, gi) => {
            const ps = r.products.filter((p) => p.type === t.name)
            return (
              <Section key={t.name} title={`تولید گروه ${t.name}`} sub={`${num(t.qty)} عدد بسته‌بندی‌شده · ${fa(ps.length)} محصول`} range={range}
                rows={() => [['محصول', 'تعداد بسته‌بندی‌شده', 'سهم از گروه ٪'], ...ps.map((p) => [p.name, p.qty, t.qty ? pc(p.qty / t.qty) : ''])]}>
                <HBars rows={ps.slice(0, 20).map((p) => ({ name: p.name, v: p.qty }))} fmt={(v) => num(v)} wide color={() => PALETTE[gi % 10]} />
              </Section>
            )
          })}

          <Section title="تولید هر عملیات" sub={`مجموع تعداد ثبت‌شده در هر عملیات${opGroup ? ` · فقط گروه ${opGroup}` : ''}`} range={range}
            rows={() => [['عملیات', 'تعداد'], ...r.stages.map((s) => [s.name, s.qty])]}>
            <div className="chips op-groups">
              <button className={`chip ${!opGroup ? 'on' : ''}`} onClick={() => setOpGroup(null)}>همهٔ گروه‌ها</button>
              {types.map((t) => <button key={t.id} className={`chip ${opGroup === t.name ? 'on' : ''}`} onClick={() => setOpGroup(t.name)}>{t.name}</button>)}
            </div>
            <HBars rows={r.stages.map((s) => ({ name: s.name, v: s.qty, c: s.color }))} fmt={(v) => num(v)} />
          </Section>

          <Section title="تعداد بسته‌بندی هر محصول" sub={`${fa(r.products.length)} محصول`} range={range}
            rows={() => [['محصول', 'گروه', 'تعداد بسته‌بندی‌شده'], ...r.products.map((p) => [p.name, p.type, p.qty])]}>
            <HBars rows={r.products.slice(0, 15).map((p) => ({ name: p.name, v: p.qty }))} fmt={(v) => num(v)} wide />
            {r.products.length > 15 && (
              <details className="more"><summary>جدول کامل ({fa(r.products.length)} محصول)</summary>
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>محصول</th><th>گروه</th><th>بسته‌بندی‌شده</th></tr></thead>
                  <tbody>{r.products.map((p) => <tr key={p.name}><td className="wrap">{p.name}</td><td>{p.type}</td><td>{num(p.qty)}</td></tr>)}</tbody>
                </table></div>
              </details>
            )}
          </Section>

          <Section title="روند تولید (بسته‌بندی‌شده)" range={range} rows={() => [['دوره', 'تعداد'], ...r.trend.map((t) => [mode === 'day' ? jIso(t.key) : bucketLabel(t.key, mode), t.v])]}>
            <Trend data={r.trend} mode={mode} setMode={setMode} color="var(--accent)" />
          </Section>

          <Section title="تولید هر عملیات به تفکیک گروه محصول" range={range}
            rows={() => [['عملیات', ...typeNames, 'جمع'], ...r.stageList.map(([id, s]) => [s.name, ...typeNames.map((t) => r.stageType.get(id)?.[t] || 0), s.qty])]}>
            <div className="table-wrap"><table className="table matrix">
              <thead><tr><th>عملیات</th>{typeNames.map((t) => <th key={t}>{t}</th>)}<th>جمع</th></tr></thead>
              <tbody>{r.stageList.map(([id, s]) => <tr key={id}><td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                {typeNames.map((t) => <td key={t}>{r.stageType.get(id)?.[t] ? num(r.stageType.get(id)[t]) : ''}</td>)}<td><b>{num(s.qty)}</b></td></tr>)}</tbody>
            </table></div>
          </Section>
        </>
      )}
    </>
  )
}

/* ================================ SALES ================================ */
const MetricSeg = ({ v, set }) => <div className="seg sm">{[['amount', 'ریالی'], ['qty', 'تعدادی']].map(([k, l]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>

function SalesReport({ range, types }) {
  const [group, setGroup] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [customers, setCustomers] = useState([])
  const [mode, setMode] = useState('day')
  const [metric, setMetric] = useState('amount')
  const [mType, setMType] = useState('amount')
  const [mProd, setMProd] = useState('amount')
  const [mCust, setMCust] = useState('amount')
  useEffect(() => {
    supabase.from('customers').select('id, code, first_name, last_name').order('first_name').then(({ data }) =>
      setCustomers((data || []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), sub: `کد ${fa(c.code)}` }))))
  }, [])
  const sales = useRows('v_sales', 'sale_date', range, { type_id: group, customer_id: customer }, [group, customer])

  const r = useMemo(() => {
    if (!sales) return null
    let qty = 0, amount = 0
    const byType = new Map(), byProduct = new Map(), byCust = new Map(), trendM = new Map()
    for (const s of sales) {
      const q = Number(s.quantity), a = Number(s.amount)
      qty += q; amount += a
      const t = byType.get(s.type_name) || { name: s.type_name, qty: 0, amount: 0 }; t.qty += q; t.amount += a; byType.set(s.type_name, t)
      const p = byProduct.get(s.product_id) || { name: s.product_name, type: s.type_name, qty: 0, amount: 0 }; p.qty += q; p.amount += a; byProduct.set(s.product_id, p)
      const c = byCust.get(s.customer_id) || { name: s.customer_name, code: s.customer_code, qty: 0, amount: 0, types: new Set(), products: new Set(), byType: {} }
      c.qty += q; c.amount += a; c.types.add(s.type_name); c.products.add(s.product_id); byCust.set(s.customer_id, c)
      const ct = c.byType[s.type_name] || (c.byType[s.type_name] = { qty: 0, amount: 0 }); ct.qty += q; ct.amount += a
      const k = bucketOf(s.sale_date, mode); const b = trendM.get(k) || { qty: 0, amount: 0 }; b.qty += q; b.amount += a; trendM.set(k, b)
    }
    return {
      qty, amount,
      types: [...byType.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty),
      products: [...byProduct.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty),
      customers: [...byCust.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty),
      trend: [...trendM.entries()].sort().map(([key, b]) => ({ key, v: metric === 'amount' ? b.amount : b.qty })),
    }
  }, [sales, mode, metric])

  return (
    <>
      <div className="card filters grid2">
        <SearchSelect label="گروه محصول" items={types} value={group} onChange={setGroup} allLabel="همهٔ گروه‌ها" />
        <SearchSelect label="مشتری" items={customers} value={customer} onChange={setCustomer} allLabel="همهٔ مشتریان" />
      </div>
      {!r ? <div className="page-center"><Spinner size={28} /></div> : !sales.length ? <Empty icon="tag" title="در این بازه فروشی ثبت نشده" /> : (
        <>
          <div className="kpis">
            <Kpi icon="tag" label="مبلغ کل فروش" value={money(r.amount)} tone="good" />
            <Kpi icon="box" label="تعداد کل فروش" value={num(r.qty)} sub={`${fa(r.products.length)} محصول`} />
            <Kpi icon="users" label="مشتریان" value={fa(r.customers.length)} />
          </div>

          <Section title="درصد فروش هر گروه محصول" sub="سهم هر گروه از کل فروش (بر اساس مبلغ و تعداد)" range={range}
            rows={() => [['گروه محصول', 'تعداد', 'سهم از تعداد ٪', 'مبلغ (ریال)', 'سهم از مبلغ ٪'], ...r.types.map((t) => [t.name, t.qty, r.qty ? pc(t.qty / r.qty) : '', t.amount, r.amount ? pc(t.amount / r.amount) : ''])]}>
            <div className="share">
              {r.types.map((t, i) => {
                const share = r.amount ? t.amount / r.amount : r.qty ? t.qty / r.qty : 0
                return (
                  <div key={t.name} className="share-row">
                    <div className="share-head"><b>{t.name}</b><span>{pct(share)}</span></div>
                    <div className="share-bar"><span style={{ width: `${Math.max(2, share * 100)}%`, background: PALETTE[i % 10] }} /></div>
                    <small className="muted">{num(t.qty)} عدد ({pct(r.qty ? t.qty / r.qty : null)} از تعداد) · {money(t.amount)}</small>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section title="فروش هر گروه محصول" sub={mType === 'amount' ? 'مبلغ (ریال)' : 'تعداد'} range={range} actions={<MetricSeg v={mType} set={setMType} />}
            rows={() => [['گروه محصول', 'تعداد', 'مبلغ (ریال)'], ...r.types.map((t) => [t.name, t.qty, t.amount])]}>
            <HBars rows={r.types.map((t, i) => ({ name: t.name, v: mType === 'amount' ? t.amount : t.qty, c: PALETTE[i % 10] }))} fmt={mType === 'amount' ? (v) => money(v) : (v) => num(v)} />
          </Section>

          <Section title="فروش هر محصول" range={range} actions={<MetricSeg v={mProd} set={setMProd} />}
            rows={() => [['محصول', 'گروه', 'تعداد', 'مبلغ (ریال)', 'سهم از مبلغ ٪'], ...r.products.map((p) => [p.name, p.type, p.qty, p.amount, r.amount ? pc(p.amount / r.amount) : ''])]}>
            <HBars rows={[...r.products].sort((a, b) => (mProd === 'amount' ? b.amount - a.amount : b.qty - a.qty)).slice(0, 15).map((p) => ({ name: p.name, v: mProd === 'amount' ? p.amount : p.qty }))} fmt={mProd === 'amount' ? (v) => money(v) : (v) => num(v)} wide />
            <div className="table-wrap"><table className="table">
              <thead><tr><th>محصول</th><th>گروه</th><th>تعداد</th><th>مبلغ</th><th>سهم</th></tr></thead>
              <tbody>{r.products.map((p) => <tr key={p.name}><td className="wrap">{p.name}</td><td>{p.type}</td><td>{num(p.qty)}</td><td>{money(p.amount)}</td><td>{pct(r.amount ? p.amount / r.amount : null)}</td></tr>)}</tbody>
            </table></div>
          </Section>

          <Section title="فروش به هر مشتری" range={range} actions={<MetricSeg v={mCust} set={setMCust} />}
            rows={() => [['کد مشتری', 'مشتری', 'تعداد کل', 'مبلغ کل (ریال)', 'گروه‌های محصول', 'تعداد انواع محصول'], ...r.customers.map((c) => [c.code, c.name, c.qty, c.amount, [...c.types].join('، '), c.products.size])]}>
            <HBars rows={[...r.customers].sort((a, b) => (mCust === 'amount' ? b.amount - a.amount : b.qty - a.qty)).slice(0, 15).map((c) => ({ name: c.name, v: mCust === 'amount' ? c.amount : c.qty }))} fmt={mCust === 'amount' ? (v) => money(v) : (v) => num(v)} wide color={() => 'var(--good)'} />
            <div className="table-wrap"><table className="table">
              <thead><tr><th>مشتری</th><th>تعداد کل</th><th>مبلغ کل</th><th>گروه‌های محصول</th><th>انواع محصول</th></tr></thead>
              <tbody>{r.customers.map((c) => <tr key={c.code}><td><b>{c.name}</b> <small className="muted">کد {fa(c.code)}</small></td><td>{num(c.qty)}</td><td>{money(c.amount)}</td>
                <td className="wrap">{[...c.types].join('، ')}</td><td>{fa(c.products.size)}</td></tr>)}</tbody>
            </table></div>
          </Section>

          <Section title="فروش هر مشتری به تفکیک گروه محصول" sub="هر خانه: تعداد و مبلغ (ریال)" range={range}
            rows={() => [['کد مشتری', 'مشتری', ...r.types.flatMap((t) => [`${t.name} (تعداد)`, `${t.name} (ریال)`]), 'جمع تعداد', 'جمع ریال'],
              ...r.customers.map((c) => [c.code, c.name, ...r.types.flatMap((t) => [c.byType[t.name]?.qty || 0, c.byType[t.name]?.amount || 0]), c.qty, c.amount])]}>
            <div className="table-wrap"><table className="table matrix">
              <thead><tr><th>مشتری</th>{r.types.map((t) => <th key={t.name}>{t.name}</th>)}<th>جمع</th></tr></thead>
              <tbody>{r.customers.map((c) => <tr key={c.code}><td><b>{c.name}</b></td>
                {r.types.map((t) => { const x = c.byType[t.name]; return <td key={t.name}>{x ? <div className="cell2"><b>{num(x.qty)} عدد</b><small>{money(x.amount)}</small></div> : ''}</td> })}
                <td><div className="cell2"><b>{num(c.qty)} عدد</b><small>{money(c.amount)}</small></div></td></tr>)}</tbody>
            </table></div>
          </Section>

          <Section title="روند فروش" range={range} actions={<div className="seg sm">{[['amount', 'مبلغ'], ['qty', 'تعداد']].map(([k, l]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{l}</button>)}</div>}
            rows={() => [['دوره', metric === 'amount' ? 'مبلغ (ریال)' : 'تعداد'], ...r.trend.map((t) => [mode === 'day' ? jIso(t.key) : bucketLabel(t.key, mode), t.v])]}>
            <Trend data={r.trend} mode={mode} setMode={setMode} color="var(--good)" />
          </Section>
        </>
      )}
    </>
  )
}


/* ================================ DASHBOARD ================================ */
const DASH_PRESETS = [['today', 'امروز'], ['week', 'این هفته'], ['month', 'این ماه'], ['year', 'امسال']]

/** First page after login: a summary of sales, production and colleagues for the chosen period. */
export function Dashboard({ onOpen }) {
  const access = useAccess()
  const [preset, setPreset] = useState('month')
  const range = useMemo(() => presetRange(preset), [preset])
  const showSales = can(access, 'reports_sales'), showProd = can(access, 'reports_production'), showStaff = can(access, 'reports_staff')
  return (
    <div className="page">
      <div className="page-title"><h1>داشبورد</h1></div>
      <div className="card filters"><div className="chips">{DASH_PRESETS.map(([k, l]) => <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => setPreset(k)}>{l}</button>)}</div>
        <small className="muted">از {jDate(range[0])} تا {jDate(range[1])}</small></div>
      {showSales && <DashSales range={range} onOpen={onOpen} />}
      {showProd && <DashProduction range={range} onOpen={onOpen} />}
      {showStaff && <DashStaff range={range} onOpen={onOpen} />}
      {!showSales && !showProd && !showStaff && <Empty icon="alert" title="به گزارش‌ها دسترسی ندارید" />}
    </div>
  )
}

const DashHead = ({ title, icon, onOpen }) => (
  <div className="card-head"><h2 className="row-gap"><Icon name={icon} size={18} />{title}</h2>
    {onOpen && <button className="link-btn" onClick={onOpen}>گزارش کامل</button>}</div>
)

function DashSales({ range, onOpen }) {
  const sales = useRows('v_sales', 'sale_date', range, {}, [])
  const r = useMemo(() => {
    if (!sales) return null
    const sumBy = (key, name) => {
      const m = new Map()
      for (const s of sales) { const k = s[key]; const x = m.get(k) || { name: s[name], qty: 0, amount: 0 }; x.qty += Number(s.quantity); x.amount += Number(s.amount); m.set(k, x) }
      return [...m.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty)
    }
    return { qty: sales.reduce((t, s) => t + Number(s.quantity), 0), amount: sales.reduce((t, s) => t + Number(s.amount), 0),
      types: sumBy('type_id', 'type_name'), products: sumBy('product_id', 'product_name'), customers: sumBy('customer_id', 'customer_name'),
      invoices: new Set(sales.map((s) => s.invoice_no || `${s.sale_date}|${s.customer_id}`)).size }
  }, [sales])
  return (
    <section className="card dash">
      <DashHead title="فروش" icon="tag" onOpen={onOpen && (() => onOpen('sales'))} />
      {!r ? <Spinner /> : !sales.length ? <p className="muted">در این بازه فروشی ثبت نشده.</p> : <>
        <div className="kpis">
          <Kpi icon="tag" label="مبلغ کل فروش" value={money(r.amount)} tone="good" />
          <Kpi icon="box" label="تعداد کل" value={num(r.qty)} sub={`${fa(r.products.length)} محصول`} />
          <Kpi icon="users" label="مشتریان" value={fa(r.customers.length)} sub={`${fa(r.invoices)} فاکتور`} />
        </div>
        <div className="dash-grid">
          <div><div className="sub-head">فروش هر گروه (ریال)</div><HBars rows={r.types.map((t, i) => ({ name: t.name, v: t.amount, c: PALETTE[i % 10] }))} fmt={money} /></div>
          <div><div className="sub-head">پرفروش‌ترین محصولات (تعداد)</div><HBars rows={[...r.products].sort((a, b) => b.qty - a.qty).slice(0, 5).map((p) => ({ name: p.name, v: p.qty }))} fmt={(v) => num(v)} wide /></div>
          <div><div className="sub-head">مشتریان برتر (ریال)</div><HBars rows={r.customers.slice(0, 5).map((c) => ({ name: c.name, v: c.amount }))} fmt={money} color={() => 'var(--good)'} /></div>
        </div>
      </>}
    </section>
  )
}

function DashProduction({ range, onOpen }) {
  const jobs = useRows('v_jobs', 'work_date', range, {}, [])
  const r = useMemo(() => {
    if (!jobs) return null
    const packed = jobs.filter((j) => j.is_packaging)
    const m = new Map(), pm = new Map()
    for (const j of packed) {
      m.set(j.type_name, (m.get(j.type_name) || 0) + Number(j.quantity))
      const p = pm.get(j.product_id) || { name: j.product_name, qty: 0 }; p.qty += Number(j.quantity); pm.set(j.product_id, p)
    }
    return { total: packed.reduce((t, j) => t + Number(j.quantity), 0), types: [...m.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
      products: [...pm.values()].sort((a, b) => b.qty - a.qty) }
  }, [jobs])
  return (
    <section className="card dash">
      <DashHead title="تولید" icon="layers" onOpen={onOpen && (() => onOpen('production'))} />
      {!r ? <Spinner /> : !jobs.length ? <p className="muted">در این بازه تولیدی ثبت نشده.</p> : <>
        <div className="kpis">
          <Kpi icon="box" label="تولید کل (بسته‌بندی‌شده)" value={num(r.total)} tone="good" />
          {r.types.map((t) => <Kpi key={t.name} icon="tag" label={t.name} value={num(t.qty)} />)}
        </div>
        <div className="dash-grid">
          <div><div className="sub-head">تولید هر گروه</div><HBars rows={r.types.map((t, i) => ({ name: t.name, v: t.qty, c: PALETTE[i % 10] }))} fmt={(v) => num(v)} /></div>
          <div><div className="sub-head">بیشترین تولید (محصول)</div><HBars rows={r.products.slice(0, 5).map((p) => ({ name: p.name, v: p.qty }))} fmt={(v) => num(v)} wide /></div>
        </div>
      </>}
    </section>
  )
}

function DashStaff({ range, onOpen }) {
  const [wh] = useWorkHours()
  const jobs = useRows('v_jobs', 'work_date', range, {}, [])
  const att = useRows('v_attendance', 'work_date', range, {}, [])
  const r = useMemo(() => {
    if (!jobs || !att) return null
    const res = analyze(jobs, [])
    const opByDay = new Map()
    for (const j of jobs) if (j.actual_seconds != null) { const k = `${j.worker_id}|${j.work_date}`; opByDay.set(k, (opByDay.get(k) || 0) + Number(j.actual_seconds) / 60) }
    const T = { days: 0, net: 0, ops: 0, idle: 0, overtime: 0, late: 0, lateDays: 0 }
    for (const a of att) {
      const m = dayMetrics(a, wh); if (!m) continue
      const ops = opByDay.get(`${a.worker_id}|${a.work_date}`) || 0
      T.days += 1; T.net += m.net; T.ops += ops; T.idle += Math.max(0, m.net - ops); T.overtime += m.overtime; T.late += m.late; T.lateDays += m.late > 0 ? 1 : 0
    }
    const presence = T.net ? T.ops / T.net : null
    return { res, T, presence, effect: res.total.eff != null && presence != null ? res.total.eff * presence : null }
  }, [jobs, att, wh])
  return (
    <section className="card dash">
      <DashHead title="همکاران" icon="users" onOpen={onOpen && (() => onOpen('staff'))} />
      {!r ? <Spinner /> : (!jobs.length && !att.length) ? <p className="muted">در این بازه اطلاعاتی ثبت نشده.</p> : <>
        <div className="kpis">
          <Kpi icon="target" label="بهره‌وری" value={pct(r.res.total.eff)} tone={effTone(r.res.total.eff)} />
          <Kpi icon="bolt" label="حضور مؤثر" value={pct(r.presence)} tone={effTone(r.presence)} />
          <Kpi icon="chart" label="اثربخشی" value={pct(r.effect)} tone={effTone(r.effect)} />
          <Kpi icon="plus" label="اضافه‌کار" value={hm(r.T.overtime)} tone={r.T.overtime ? 'info' : ''} />
          <Kpi icon="alert" label="تأخیر" value={hm(r.T.late)} tone={r.T.late ? 'bad' : ''} sub={`${fa(r.T.lateDays)} بار`} />
          <Kpi icon="clock" label="زمان بیکار" value={hm(r.T.idle)} tone={r.T.idle ? 'warn' : ''} />
        </div>
        <div className="sub-head">بهره‌وری هر همکار</div>
        <HBars rows={r.res.workers.filter((w) => w.eff != null).map((w) => ({ name: w.name, v: pc(w.eff) }))} unit="٪" color={EFF_COLOR} />
      </>}
    </section>
  )
}
