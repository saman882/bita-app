import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend, LabelList,
} from 'recharts'
import { supabase, errText } from '../lib/supabase'
import { analyze, trend, efficiency, perUnit } from '../lib/calc'
import { fa, num, pct, hms, jDate, jDateLong, tehranIso, addDays, weekStart, monthStart, jParts, MONTHS, inDiffLabel } from '../lib/fmt'
import { Icon, Kpi, Empty, Spinner, JDateInput, useToast, effTone, Button, SearchSelect } from '../components/ui'

const PRESETS = [
  ['today', 'امروز'], ['week', 'این هفته'], ['month', 'این ماه'], ['lastmonth', 'ماه قبل'], ['90', '۳ ماه اخیر'], ['year', 'امسال'],
]
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
const bucketLabel = (iso, mode) => {
  const { jy, jm, jd } = jParts(iso)
  if (mode === 'month') return `${MONTHS[jm - 1]} ${fa(String(jy).slice(2))}`
  return mode === 'week' ? `هفتهٔ ${fa(jd)}/${fa(jm)}` : `${fa(jd)}/${fa(jm)}`
}
const pc = (r) => (r == null ? 0 : Math.round(r * 1000) / 10)
const jIso = (iso) => { const { jy, jm, jd } = jParts(iso); return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}` }
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

export default function Reports({ workers = [] }) {
  const toast = useToast()
  const [preset, setPreset] = useState('90')
  const [[from, to], setRange] = useState(presetRange('90'))
  const [who, setWho] = useState(null)
  const [stage, setStage] = useState(null)
  const [product, setProduct] = useState(null)
  const [cat, setCat] = useState({ stages: [], products: [] })
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('day')
  const [chart, setChart] = useState('line')
  const [metric, setMetric] = useState('eff')
  const [split, setSplit] = useState(null)
  const [openDay, setOpenDay] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('stages').select('id, name, color').order('sort_order'),
      supabase.from('products').select('id, name, product_types(name, sort_order)').order('name'),
    ]).then(([s, p]) => setCat({
      stages: s.data || [],
      products: (p.data || []).map((x) => ({ id: x.id, name: x.name, type: x.product_types?.name, o: x.product_types?.sort_order ?? 0 }))
        .sort((a, b) => a.o - b.o || a.name.localeCompare(b.name, 'fa')),
    }))
  }, [])

  useEffect(() => {
    let alive = true
    setData(null)
    ;(async () => {
      let qj = supabase.from('v_jobs').select('*').gte('work_date', from).lte('work_date', to).order('work_date').order('start_time', { nullsFirst: false })
      let qa = supabase.from('v_attendance').select('*').gte('work_date', from).lte('work_date', to)
      if (who) { qj = qj.eq('worker_id', who); qa = qa.eq('worker_id', who) }
      if (stage) qj = qj.eq('stage_id', stage)
      if (product) qj = qj.eq('product_id', product)
      const [j, a] = await Promise.all([qj.limit(50000), qa.limit(50000)])
      if (!alive) return
      if (j.error || a.error) { toast(errText(j.error || a.error), 'bad'); setData({ jobs: [], att: [] }); return }
      // presence is not split by operation/product, so attendance is only used without those filters
      setData({ jobs: j.data, att: stage || product ? [] : a.data })
    })()
    return () => { alive = false }
  }, [from, to, who, stage, product, toast])

  const nameOf = useMemo(() => Object.fromEntries(workers.map((w) => [w.id, w.full_name])), [workers])
  const att = useMemo(() => (data?.att || []).map((a) => ({ ...a, worker_name: nameOf[a.worker_id] })), [data, nameOf])
  const res = useMemo(() => (data ? analyze(data.jobs, att) : null), [data, att])
  const splitItems = useMemo(() => (!res || !split ? [] : split === 'stage' ? res.stages : res.workers), [res, split])
  const series = useMemo(() => (data ? trend(data.jobs, att, mode, split) : []), [data, att, mode, split])
  const colorOf = (it, i) => it.color || PALETTE[i % PALETTE.length]

  const pick = (id) => { setPreset(id); setRange(presetRange(id)) }
  const t = res?.total
  const empty = data && data.jobs.length + data.att.length === 0

  const exportXlsx = async () => {
    setExporting(true)
    try { await buildWorkbook({ data, res, att, from, to, nameOf }) } catch (e) { toast(errText(e), 'bad') } finally { setExporting(false) }
  }

  const effBar = (v) => (v >= 95 ? 'var(--good)' : v >= 80 ? 'var(--warn)' : 'var(--bad)')

  return (
    <div className="page">
      <div className="page-title">
        <h1>گزارش‌ها</h1>
        {data && !empty && <Button variant="success" icon="download" loading={exporting} onClick={exportXlsx}>خروجی اکسل</Button>}
      </div>

      <div className="card filters">
        <div className="chips">{PRESETS.map(([k, l]) => <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => pick(k)}>{l}</button>)}</div>
        <div className="range">
          <div><span className="muted small">از</span><JDateInput value={from} onChange={(v) => { setPreset(null); setRange([v, v > to ? v : to]) }} label="از تاریخ" /></div>
          <div><span className="muted small">تا</span><JDateInput value={to} onChange={(v) => { setPreset(null); setRange([v < from ? v : from, v]) }} label="تا تاریخ" /></div>
        </div>
        <div className="grid3 filters-3">
          <SearchSelect label="نیرو" items={workers.map((w) => ({ id: w.id, name: w.full_name }))} value={who} onChange={setWho} allLabel="همهٔ نیروها" />
          <SearchSelect label="عملیات" items={cat.stages} value={stage} onChange={setStage} allLabel="همهٔ عملیات‌ها" />
          <SearchSelect label="محصول" items={cat.products} value={product} onChange={setProduct} allLabel="همهٔ محصولات" group="type" />
        </div>
        {(who || stage || product) && <button className="link-btn" onClick={() => { setWho(null); setStage(null); setProduct(null) }}>حذف فیلترها</button>}
      </div>

      {!data ? <div className="page-center"><Spinner size={28} /></div> : empty ? (
        <Empty icon="chart" title="در این بازه اطلاعاتی نیست" text={`${jDate(from)} تا ${jDate(to)}`} />
      ) : (
        <>
          <div className="kpis">
            <Kpi icon="target" label="بهره‌وری کل" value={pct(t.eff)} tone={effTone(t.eff)} sub="استاندارد ÷ صرف‌شده" />
            <Kpi icon="box" label="حجم تولید" value={num(t.qty)} sub={`${fa(t.count)} عملیات در ${fa(t.days)} روز`} />
            <Kpi icon="clock" label="زمان صرف‌شده" value={hms(t.actual)} sub={`استاندارد ${hms(t.standard)}`} />
            <Kpi icon="bolt" label="کارکرد مؤثر" value={pct(t.effective)} sub={t.presence ? `حضور ${hms(t.presence)}` : 'ساعت حضور ثبت نشده'} />
            {t.untimed > 0 && <Kpi icon="alert" label="عملیات بدون ساعت" value={fa(t.untimed)} tone="warn" sub="در بهره‌وری حساب نمی‌شوند" />}
            {t.lateDays > 0 && <Kpi icon="alert" label="تأخیر ورود" value={hms(t.late)} tone="bad" sub={`${fa(t.lateDays)} مورد`} />}
          </div>

          {/* ---------- trend ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>روند {metric === 'eff' ? 'بهره‌وری' : 'تولید'}</h2>
              <div className="seg">{[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
            </div>
            <div className="chart-opts">
              <div className="seg sm">{[['eff', 'بهره‌وری'], ['qty', 'تولید']].map(([k, l]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => { setMetric(k); if (k === 'qty') setSplit(null) }}>{l}</button>)}</div>
              <div className="seg sm">{[['line', 'خطی'], ['bar', 'میله‌ای']].map(([k, l]) => <button key={k} className={chart === k ? 'on' : ''} onClick={() => setChart(k)}>{l}</button>)}</div>
              {metric === 'eff' && <div className="seg sm">{[[null, 'کل'], ['stage', 'هر عملیات'], ['worker', 'هر نیرو']].map(([k, l]) => <button key={l} className={split === k ? 'on' : ''} onClick={() => setSplit(k)}>{l}</button>)}</div>}
            </div>
            <div className="chart" dir="ltr">
              <ResponsiveContainer width="100%" height={300}>
                {chart === 'line' ? (
                  <LineChart data={series} margin={{ top: 10, right: 8, left: -6, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={(k) => bucketLabel(k, mode)} tick={{ fontSize: 11, fill: 'var(--muted)' }} reversed axisLine={false} tickLine={false} minTickGap={10} />
                    <YAxis orientation="right" tickFormatter={(v) => fa(v) + (metric === 'eff' ? '٪' : '')} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={48} />
                    {metric === 'eff' && <ReferenceLine y={100} stroke="var(--good)" strokeDasharray="4 4" />}
                    <Tooltip content={<Tip mode={mode} unit={metric === 'eff' ? '٪' : ''} />} />
                    {metric === 'qty' ? <Line type="monotone" dataKey="qty" name="تولید" stroke="var(--accent)" strokeWidth={3} dot={series.length < 35} />
                      : split ? splitItems.map((it, i) => <Line key={it.key} type="monotone" dataKey={`p${it.key}`} name={it.name} stroke={colorOf(it, i)} strokeWidth={2.2} dot={false} connectNulls />)
                      : <Line type="monotone" dataKey="eff" name="بهره‌وری" stroke="var(--brand)" strokeWidth={3} dot={series.length < 35} connectNulls />}
                    {split && <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} iconType="circle" />}
                  </LineChart>
                ) : (
                  <BarChart data={series} margin={{ top: 10, right: 8, left: -6, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={(k) => bucketLabel(k, mode)} tick={{ fontSize: 11, fill: 'var(--muted)' }} reversed axisLine={false} tickLine={false} minTickGap={6} />
                    <YAxis orientation="right" tickFormatter={(v) => fa(v) + (metric === 'eff' ? '٪' : '')} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={48} />
                    {metric === 'eff' && <ReferenceLine y={100} stroke="var(--good)" strokeDasharray="4 4" />}
                    <Tooltip content={<Tip mode={mode} unit={metric === 'eff' ? '٪' : ''} />} cursor={{ fill: 'var(--soft)' }} />
                    {metric === 'qty' ? <Bar dataKey="qty" name="تولید" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                      : split ? splitItems.map((it, i) => <Bar key={it.key} dataKey={`p${it.key}`} name={it.name} fill={colorOf(it, i)} radius={[4, 4, 0, 0]} />)
                      : <Bar dataKey="eff" name="بهره‌وری" radius={[6, 6, 0, 0]}>{series.map((r) => <Cell key={r.key} fill={effBar(r.eff)} />)}</Bar>}
                    {split && <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} iconType="circle" />}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          {/* ---------- by operation ---------- */}
          <section className="card">
            <div className="card-head"><h2>به تفکیک عملیات (مرحله)</h2></div>
            <HBars rows={res.stages.filter((s) => s.eff != null).map((s) => ({ name: s.name, v: pc(s.eff), c: s.color }))} unit="٪" />
            <div className="table-wrap"><table className="table">
              <thead><tr><th>عملیات</th><th>تولید</th><th>زمان صرف‌شده</th><th>زمان استاندارد</th><th>زمان واقعی یک عدد</th><th>بهره‌وری</th></tr></thead>
              <tbody>
                {res.stages.map((s) => <tr key={s.key}>
                  <td><span className="dot" style={{ background: s.color }} />{s.name}</td><td>{num(s.qty)}</td>
                  <td className="mono">{hms(s.actual)}</td><td className="mono">{hms(s.standard)}</td>
                  <td>{s.unit == null ? '—' : `${num(s.unit)} ثانیه`}</td>
                  <td><span className={`badge badge-${effTone(s.eff)}`}>{pct(s.eff)}</span></td></tr>)}
                <tr className="total"><td>جمع کل</td><td>{num(t.qty)}</td><td className="mono">{hms(t.actual)}</td><td className="mono">{hms(t.standard)}</td>
                  <td>{t.unit == null ? '—' : `${num(t.unit)} ثانیه`}</td><td><span className={`badge badge-${effTone(t.eff)}`}>{pct(t.eff)}</span></td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ---------- by worker ---------- */}
          {!who && (
            <section className="card">
              <div className="card-head"><h2>مقایسهٔ نیروها</h2></div>
              <HBars rows={res.workers.filter((w) => w.eff != null).map((w, i) => ({ name: w.name, v: pc(w.eff), c: PALETTE[i % 10] }))} unit="٪" />
              <div className="table-wrap"><table className="table">
                <thead><tr><th>نیرو</th><th>روز</th><th>عملیات</th><th>تولید</th><th>زمان صرف‌شده</th><th>زمان استاندارد</th><th>بهره‌وری</th><th>کارکرد مؤثر</th></tr></thead>
                <tbody>{res.workers.map((w, i) => <tr key={w.key} className="clickable" onClick={() => setWho(w.key)}>
                  <td>{i < 3 && w.eff != null && <span className="rank">{fa(i + 1)}</span>}{w.name}</td><td>{fa(w.days)}</td>
                  <td>{fa(w.count)}{w.untimed ? <small className="muted"> ({fa(w.untimed)} بی‌ساعت)</small> : null}</td><td>{num(w.qty)}</td>
                  <td className="mono">{hms(w.actual)}</td><td className="mono">{hms(w.standard)}</td>
                  <td><span className={`badge badge-${effTone(w.eff)}`}>{pct(w.eff)}</span></td><td>{pct(w.effective)}</td></tr>)}</tbody>
              </table></div>
            </section>
          )}

          {/* ---------- worker × operation (Excel: گزارش بهره وری) ---------- */}
          <section className="card">
            <div className="card-head"><h2>بهره‌وری هر نیرو در هر عملیات</h2></div>
            <Matrix res={res} />
          </section>

          {/* ---------- by product ---------- */}
          <section className="card">
            <div className="card-head"><h2>تولید به تفکیک محصول</h2><span className="muted small">{fa(res.products.length)} محصول</span></div>
            <HBars rows={res.products.slice(0, 12).map((p) => ({ name: p.name, v: p.qty, c: 'var(--brand)' }))} unit="" wide />
            <details className="more"><summary>جدول کامل محصولات</summary>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>محصول</th><th>نوع</th><th>تولید</th><th>عملیات</th><th>بهره‌وری</th></tr></thead>
                <tbody>{res.products.map((p) => <tr key={p.key}><td className="wrap">{p.name}</td><td>{p.type}</td><td>{num(p.qty)}</td><td>{fa(p.count)}</td>
                  <td><span className={`badge badge-${effTone(p.eff)}`}>{pct(p.eff)}</span></td></tr>)}</tbody>
              </table></div>
            </details>
          </section>

          {/* ---------- daily ---------- */}
          <section className="card">
            <div className="card-head"><h2>گزارش روزانه</h2></div>
            <div className="days">
              {res.days.map((d) => {
                const open = openDay === d.date
                const dayJobs = open ? data.jobs.filter((j) => j.work_date === d.date) : []
                const dayAtt = open ? att.filter((a) => a.work_date === d.date) : []
                return (
                  <div key={d.date} className={`day ${open ? 'open' : ''}`}>
                    <button className="day-head" onClick={() => setOpenDay(open ? null : d.date)} aria-expanded={open}>
                      <div><b>{jDateLong(d.date)}</b><small className="muted">{fa(d.count)} عملیات · {num(d.qty)} تولید</small></div>
                      <div className="day-badges"><span className={`badge badge-${effTone(d.eff)}`}>{pct(d.eff)}</span>{d.effective != null && <span className="badge badge-soft">مؤثر {pct(d.effective)}</span>}</div>
                    </button>
                    {open && (
                      <div className="day-body">
                        {dayAtt.map((a) => {
                          const il = a.in_diff_seconds == null ? null : inDiffLabel(Number(a.in_diff_seconds))
                          return (
                            <div key={a.id} className="att-line"><b>{a.worker_name}</b>
                              <span>ورود {a.clock_in ? fa(a.clock_in.slice(0, 5)) : '—'} {il && <em className={`tone-${il.tone}`}>{il.text}</em>}</span>
                              <span>خروج {a.clock_out ? fa(a.clock_out.slice(0, 5)) : '—'}</span></div>
                          )
                        })}
                        <div className="table-wrap"><table className="table table-sm">
                          <thead><tr><th>نیرو</th><th>عملیات</th><th>محصول</th><th>شروع</th><th>پایان</th><th>تعداد</th><th>صرف‌شده</th><th>استاندارد</th><th>بهره‌وری</th></tr></thead>
                          <tbody>{dayJobs.map((j) => {
                            const e = efficiency(Number(j.actual_seconds), Number(j.standard_total_seconds))
                            return (
                              <tr key={j.id}><td>{j.worker_name}</td><td><span className="dot" style={{ background: j.color }} />{j.stage_name}</td>
                                <td className="wrap small">{j.product_name}</td><td className="mono">{j.start_time ? fa(j.start_time.slice(0, 5)) : '—'}</td>
                                <td className="mono">{j.end_time ? fa(j.end_time.slice(0, 5)) : '—'}</td><td>{num(Number(j.quantity))}</td>
                                <td className="mono">{j.actual_seconds == null ? '—' : hms(Number(j.actual_seconds))}</td>
                                <td className="mono">{j.standard_total_seconds == null ? '—' : hms(Number(j.standard_total_seconds))}</td>
                                <td>{j.actual_seconds == null ? <span className="muted small">بدون ساعت</span> : <span className={`badge badge-${effTone(e)}`}>{pct(e)}</span>}</td></tr>
                            )
                          })}</tbody>
                        </table></div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <p className="formula-note">
            <Icon name="target" size={14} /> بهره‌وری = زمان استاندارد ÷ زمان صرف‌شده · زمان استاندارد = تعداد × زمان استاندارد یک عدد<br />
            <Icon name="bolt" size={14} /> کارکرد مؤثر = مجموع زمان عملیات ÷ مجموع زمان حضور · عملیات بدون ساعت شروع/پایان در بهره‌وری حساب نمی‌شوند
          </p>
        </>
      )}
    </div>
  )
}

function HBars({ rows, unit, wide }) {
  if (!rows.length) return null
  return (
    <div className="chart" dir="ltr">
      <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 38)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
          <XAxis type="number" hide reversed />
          <YAxis type="category" dataKey="name" orientation="right" width={wide ? 210 : 110} tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} />
          {unit === '٪' && <ReferenceLine x={100} stroke="var(--good)" strokeDasharray="4 4" />}
          <Tooltip formatter={(v) => [fa(v) + unit, unit ? 'بهره‌وری' : 'تولید']} cursor={{ fill: 'var(--soft)' }} />
          <Bar dataKey="v" radius={[8, 0, 0, 8]} barSize={20}>
            {rows.map((r, i) => <Cell key={i} fill={r.c} />)}
            <LabelList dataKey="v" position="insideLeft" formatter={(v) => fa(v) + unit} fill="#fff" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Matrix({ res }) {
  const cell = Object.fromEntries(res.workerStage.map((c) => [`${c.worker_id}|${c.stage_id}`, c]))
  return (
    <div className="table-wrap"><table className="table matrix">
      <thead><tr><th>نیرو</th>{res.stages.map((s) => <th key={s.key}><span className="dot" style={{ background: s.color }} />{s.name}</th>)}<th>کل</th></tr></thead>
      <tbody>{res.workers.map((w) => <tr key={w.key}><td><b>{w.name}</b></td>
        {res.stages.map((s) => {
          const c = cell[`${w.key}|${s.key}`]
          return <td key={s.key} className={c?.eff != null ? `heat-${effTone(c.eff)}` : ''} title={c ? `${num(c.qty)} عدد` : ''}>{c ? (c.eff == null ? <span className="muted small">بی‌ساعت</span> : pct(c.eff)) : ''}</td>
        })}
        <td><span className={`badge badge-${effTone(w.eff)}`}>{pct(w.eff)}</span></td></tr>)}</tbody>
    </table></div>
  )
}

function Tip({ active, payload, label, mode, unit }) {
  if (!active || !payload?.length) return null
  const { jy, jm } = jParts(label)
  const title = mode === 'month' ? `${MONTHS[jm - 1]} ${fa(jy)}` : mode === 'week' ? `هفتهٔ ${jDate(label)} تا ${jDate(addDays(label, 6))}` : jDateLong(label)
  return (
    <div className="tip" dir="rtl"><b>{title}</b>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey}><span className="dot" style={{ background: p.color || p.fill }} />{p.name}: <b>{fa(typeof p.value === 'number' ? Math.round(p.value * 10) / 10 : p.value)}{unit}</b></div>
      ))}
    </div>
  )
}

/* ---------------- Excel export (mirrors the company workbook) ---------------- */
async function buildWorkbook({ data, res, att, from, to, nameOf }) {
  const XLSX = await import('xlsx')
  const r2 = (v, d = 2) => (v == null || !Number.isFinite(v) ? '' : Math.round(v * 10 ** d) / 10 ** d)
  const pctv = (v) => (v == null ? '' : r2(v * 100, 1))
  const book = XLSX.utils.book_new()
  const add = (name, rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(book, ws, name)
  }

  // 1. raw data — same columns as the monthly sheet
  add('داده‌ها', [
    ['تاریخ', 'نام محصول', 'نام عملیات', 'نوع محصول', 'تعداد', 'ساعت شروع', 'ساعت پایان', 'اپراتور', 'زمان استاندارد (ثانیه)', 'مدت زمان صرف شده (دقیقه)', 'مدت زمان استاندارد (دقیقه)', 'زمان واقعی یک عدد (ثانیه)', 'بهره‌وری ٪', 'توضیح'],
    ...data.jobs.map((j) => {
      const A = j.actual_seconds == null ? null : Number(j.actual_seconds), Q = Number(j.quantity), S = j.standard_total_seconds == null ? null : Number(j.standard_total_seconds)
      return [jIso(j.work_date), j.product_name, j.stage_name, j.type_name, Q, j.start_time?.slice(0, 5) || '', j.end_time?.slice(0, 5) || '', j.worker_name,
        j.std_per_unit == null ? '' : Number(j.std_per_unit), A == null ? '' : r2(A / 60), S == null ? '' : r2(S / 60), r2(perUnit(A, Q)), pctv(efficiency(A, S)), j.note || '']
    }),
  ], [11, 40, 16, 12, 8, 10, 10, 12, 12, 14, 14, 14, 10, 20])

  // 2. efficiency per worker and per worker × operation (Excel "گزارش بهره وری")
  const eff = [['نیرو', 'مدت زمان صرف شده (دقیقه)', 'مدت زمان استاندارد (دقیقه)', 'بهره‌وری ٪'],
    ...res.workers.map((w) => [w.name, r2(w.actual / 60), r2(w.standard / 60), pctv(w.eff)]),
    ['جمع کل', r2(res.total.actual / 60), r2(res.total.standard / 60), pctv(res.total.eff)], [],
    ['نیرو / عملیات', 'مدت زمان صرف شده (دقیقه)', 'مدت زمان استاندارد (دقیقه)', 'بهره‌وری ٪']]
  for (const w of res.workers) {
    eff.push([w.name, r2(w.actual / 60), r2(w.standard / 60), pctv(w.eff)])
    for (const c of res.workerStage.filter((x) => x.worker_id === w.key)) eff.push(['    ' + c.stage, r2(c.actual / 60), r2(c.standard / 60), pctv(c.eff)])
  }
  add('گزارش بهره وری', eff, [26, 22, 22, 12])

  // 3. by operation
  add('به تفکیک عملیات', [['عملیات', 'تولید', 'تعداد عملیات', 'صرف شده (دقیقه)', 'استاندارد (دقیقه)', 'زمان واقعی یک عدد (ثانیه)', 'بهره‌وری ٪'],
    ...res.stages.map((s) => [s.name, s.qty, s.count, r2(s.actual / 60), r2(s.standard / 60), r2(s.unit), pctv(s.eff)])], [18, 10, 12, 16, 16, 20, 12])

  // 4. production report (Excel "گزارش تولید")
  const cell = Object.fromEntries(res.workerStage.map((c) => [`${c.worker_id}|${c.stage_id}`, c]))
  const prod = [['میانگین زمان واقعی یک عدد (ثانیه)', ...res.workers.map((w) => w.name), 'کل'],
    ...res.stages.map((s) => [s.name, ...res.workers.map((w) => r2(cell[`${w.key}|${s.key}`]?.unit)), r2(s.unit)]), [],
    ['جمع تعداد', ...res.stages.map((s) => s.name), 'کل']]
  const pq = {}
  for (const j of data.jobs) { (pq[j.product_name] ||= {})[j.stage_id] = (pq[j.product_name][j.stage_id] || 0) + Number(j.quantity) }
  for (const p of res.products) prod.push([p.name, ...res.stages.map((s) => pq[p.name]?.[s.key] || ''), p.qty])
  add('گزارش تولید', prod, [40, ...res.stages.map(() => 12), 10])

  // 5. work duration (Excel "مدت کارکرد")
  add('مدت کارکرد', [['نیرو', 'مدت زمان فعال (دقیقه)', 'مدت زمان فعال (ساعت)', 'کل مدت حضور (ساعت)', 'درصد حضور مؤثر ٪', 'تأخیر ورود (دقیقه)'],
    ...res.workers.map((w) => {
      const active = data.jobs.filter((j) => j.worker_id === w.key && j.actual_seconds != null).reduce((s, j) => s + Number(j.actual_seconds), 0)
      return [w.name, r2(active / 60), r2(active / 3600), w.presence ? r2(w.presence / 3600) : '', pctv(w.effective), r2(w.late / 60)]
    })], [14, 18, 18, 18, 16, 16])

  // 6. attendance
  if (att.length) add('حضور', [['تاریخ', 'نیرو', 'ورود', 'خروج', 'ورود مقرر', 'خروج مقرر', 'تأخیر ورود (دقیقه)', 'حضور (ساعت)'],
    ...[...att].sort((a, b) => (a.work_date < b.work_date ? -1 : 1)).map((a) => [jIso(a.work_date), nameOf[a.worker_id], a.clock_in?.slice(0, 5) || '', a.clock_out?.slice(0, 5) || '',
      a.expected_in?.slice(0, 5), a.expected_out?.slice(0, 5), a.in_diff_seconds == null ? '' : r2(Number(a.in_diff_seconds) / 60), a.presence_seconds == null ? '' : r2(Number(a.presence_seconds) / 3600)])],
  [11, 14, 8, 8, 10, 10, 16, 12])

  book.Workbook = { Views: [{ RTL: true }] }
  XLSX.writeFile(book, `bita-report-${jIso(from).replace(/\//g, '-')}_${jIso(to).replace(/\//g, '-')}.xlsx`)
}
