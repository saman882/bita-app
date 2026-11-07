import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend, BarChart, Bar, Cell,
} from 'recharts'
import { supabase, errText } from '../lib/supabase'
import { analyze, trend, efficiency, downloadCsv } from '../lib/calc'
import {
  fa, num, pct, hms, jDate, jDateLong, tehranIso, addDays, weekStart, monthStart, jParts, MONTHS,
  clock, inDiffLabel, outDiffLabel, humanDur,
} from '../lib/fmt'
import { Icon, Kpi, Empty, Spinner, JDateInput, useToast, effTone, Button } from '../components/ui'

const PRESETS = [
  { id: 'today', label: 'امروز' },
  { id: 'week', label: 'این هفته' },
  { id: 'month', label: 'این ماه' },
  { id: 'lastmonth', label: 'ماه قبل' },
  { id: '30', label: '۳۰ روز اخیر' },
  { id: '90', label: '۳ ماه اخیر' },
]
function presetRange(id) {
  const t = tehranIso()
  switch (id) {
    case 'today': return [t, t]
    case 'week': return [weekStart(t), t]
    case 'month': return [monthStart(t), t]
    case 'lastmonth': { const e = addDays(monthStart(t), -1); return [monthStart(e), e] }
    case '30': return [addDays(t, -29), t]
    case '90': return [addDays(t, -89), t]
    default: return [t, t]
  }
}

const jDateEn = (iso) => { const { jy, jm, jd } = jParts(iso); return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}` }

const bucketLabel = (iso, mode) => {
  if (mode === 'month') { const { jy, jm } = jParts(iso); return `${MONTHS[jm - 1]} ${fa(String(jy).slice(2))}` }
  const { jm, jd } = jParts(iso)
  return mode === 'week' ? `هفتهٔ ${fa(jd)}/${fa(jm)}` : `${fa(jd)}/${fa(jm)}`
}

export default function Reports({ profile, isAdmin, workers = [] }) {
  const toast = useToast()
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState(presetRange('month'))
  const [who, setWho] = useState(isAdmin ? 'all' : profile.id)
  const [mode, setMode] = useState('day')
  const [byStage, setByStage] = useState(false)
  const [data, setData] = useState(null)
  const [openDay, setOpenDay] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    ;(async () => {
      let qo = supabase.from('v_operations').select('*').gte('work_date', from).lte('work_date', to).order('started_at')
      let qa = supabase.from('v_attendance').select('*').gte('work_date', from).lte('work_date', to)
      if (who !== 'all') { qo = qo.eq('user_id', who); qa = qa.eq('user_id', who) }
      const [o, a] = await Promise.all([qo.limit(20000), qa.limit(20000)])
      if (!alive) return
      if (o.error || a.error) { toast(errText(o.error || a.error), 'bad'); setData({ ops: [], att: [] }); return }
      setData({ ops: o.data, att: a.data })
    })()
    return () => { alive = false }
  }, [from, to, who, toast])

  const nameOf = useMemo(() => Object.fromEntries(workers.map((w) => [w.id, w.full_name])), [workers])
  const res = useMemo(() => (data ? analyze(data.ops, data.att) : null), [data])
  const stageList = useMemo(() => res?.stages ?? [], [res])
  const series = useMemo(
    () => (data ? trend(data.ops, data.att, mode, byStage ? stageList.map((s) => s.key) : null) : []),
    [data, mode, byStage, stageList],
  )
  const attByDay = useMemo(() => {
    const m = {}
    for (const a of data?.att ?? []) (m[a.work_date] ||= []).push(a)
    return m
  }, [data])

  const pickPreset = (id) => { setPreset(id); setRange(presetRange(id)) }
  const setFrom = (v) => { setPreset(null); setRange([v, v > to ? v : to]) }
  const setTo = (v) => { setPreset(null); setRange([v < from ? v : from, v]) }

  const exportCsv = () => {
    const rows = [['تاریخ', 'نیرو', 'مرحله', 'شروع', 'پایان', 'تعداد', 'واحد', 'زمان واقعی (ثانیه)', 'زمان استاندارد (ثانیه)', 'بهره‌وری ٪', 'توضیح']]
    for (const o of data.ops.filter((x) => x.ended_at)) {
      const e = efficiency(Number(o.actual_seconds), Number(o.standard_total_seconds))
      rows.push([jDateEn(o.work_date), nameOf[o.user_id] || profile.full_name, o.stage_name,
        new Date(o.started_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran' }),
        new Date(o.ended_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran' }),
        o.quantity, o.unit, Math.round(o.actual_seconds), Math.round(o.standard_total_seconds), e == null ? '' : (e * 100).toFixed(1), o.note || ''])
    }
    rows.push([])
    rows.push(['تاریخ', 'نیرو', 'ورود', 'خروج', 'ورود مقرر', 'خروج مقرر', 'اختلاف ورود (ثانیه، مثبت=تأخیر)', 'اختلاف خروج (ثانیه، منفی=تعجیل)', 'حضور (ثانیه)'])
    for (const a of data.att) {
      rows.push([jDateEn(a.work_date), nameOf[a.user_id] || profile.full_name,
        new Date(a.clock_in).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran' }),
        a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran' }) : '',
        a.expected_in, a.expected_out, Math.round(a.in_diff_seconds), a.out_diff_seconds == null ? '' : Math.round(a.out_diff_seconds),
        a.presence_seconds == null ? '' : Math.round(a.presence_seconds)])
    }
    const label = who === 'all' ? 'all' : (workers.find((w) => w.id === who)?.username || profile.username)
    downloadCsv(`report-${label}-${from}_${to}.csv`, rows)
  }

  const t = res?.total
  return (
    <div className="page">
      <div className="page-title">
        <h1>گزارش‌ها</h1>
        {data && data.ops.length + data.att.length > 0 && (
          <Button variant="ghost" icon="download" onClick={exportCsv}>خروجی اکسل</Button>
        )}
      </div>

      {/* ---------- FILTERS ---------- */}
      <div className="card filters">
        {isAdmin && (
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="نیرو">
            <option value="all">همهٔ نیروها</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
          </select>
        )}
        <div className="chips" role="tablist">
          {PRESETS.map((p) => (
            <button key={p.id} role="tab" aria-selected={preset === p.id} className={`chip ${preset === p.id ? 'on' : ''}`} onClick={() => pickPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="range">
          <div><span className="muted small">از</span><JDateInput value={from} onChange={setFrom} label="از تاریخ" /></div>
          <div><span className="muted small">تا</span><JDateInput value={to} onChange={setTo} label="تا تاریخ" /></div>
        </div>
      </div>

      {!data ? (
        <div className="page-center"><Spinner size={28} /></div>
      ) : data.ops.length + data.att.length === 0 ? (
        <Empty icon="chart" title="داده‌ای در این بازه نیست" text={`${jDate(from)} تا ${jDate(to)}`} />
      ) : (
        <>
          {/* ---------- KPIs ---------- */}
          <div className="kpis">
            <Kpi icon="target" label="بهره‌وری کل" value={pct(t.eff)} tone={effTone(t.eff)} sub={`${fa(t.count)} عملیات`} />
            <Kpi icon="bolt" label="کارکرد مؤثر" value={pct(t.effective)} sub={`حضور ${hms(t.presence)}`} />
            <Kpi icon="box" label="حجم تولید" value={num(t.qty)} sub={`${fa(t.days)} روز کاری`} />
            <Kpi icon="clock" label="زمان عملیات" value={hms(t.actual)} sub={`استاندارد ${hms(t.standard)}`} />
            <Kpi icon="alert" label="مجموع تأخیر ورود" value={hms(t.late)} tone={t.late ? 'bad' : 'good'} sub={`${fa(t.lateDays)} روز`} />
            <Kpi icon="logout" label="مجموع تعجیل خروج" value={hms(t.early)} tone={t.early ? 'bad' : 'good'} sub={`${fa(t.earlyDays)} روز`} />
          </div>

          {/* ---------- TREND ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>روند بهره‌وری</h2>
              <div className="seg" role="tablist">
                {[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه']].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
                ))}
              </div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={byStage} onChange={(e) => setByStage(e.target.checked)} />
              <span>نمایش جداگانهٔ هر مرحله</span>
            </label>
            <div className="chart" dir="ltr">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={series} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="key" tickFormatter={(k) => bucketLabel(k, mode)} tick={{ fontSize: 11, fill: 'var(--muted)' }} reversed axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis orientation="right" domain={[(min) => Math.floor(Math.min(min, 70) / 10) * 10, (max) => Math.ceil(Math.max(max, 110) / 10) * 10]} allowDataOverflow={false} tickFormatter={(v) => fa(v) + '٪'} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                  <ReferenceLine y={100} stroke="var(--good)" strokeDasharray="4 4" />
                  <Tooltip content={<TrendTip mode={mode} />} />
                  {byStage ? stageList.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={`s${s.key}`} name={s.name} stroke={s.color} strokeWidth={2.5} dot={series.length < 32} connectNulls />
                  )) : (
                    <>
                      <Line type="monotone" dataKey="eff" name="بهره‌وری" stroke="var(--brand)" strokeWidth={3} dot={series.length < 32} connectNulls />
                      <Line type="monotone" dataKey="effective" name="کارکرد مؤثر" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                    </>
                  )}
                  <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} iconType="circle" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ---------- PER STAGE ---------- */}
          <section className="card">
            <div className="card-head"><h2>به تفکیک مرحله</h2></div>
            <div className="chart" dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(120, stageList.length * 46)}>
                <BarChart data={stageList.map((s) => ({ name: s.name, v: s.eff == null ? 0 : Math.round(s.eff * 1000) / 10, c: s.color }))} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide reversed />
                  <YAxis type="category" dataKey="name" orientation="right" width={90} tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={100} stroke="var(--good)" strokeDasharray="4 4" />
                  <Tooltip formatter={(v) => [fa(v) + '٪', 'بهره‌وری']} cursor={{ fill: 'var(--soft)' }} />
                  <Bar dataKey="v" radius={[8, 0, 0, 8]} barSize={22} label={{ position: 'insideLeft', formatter: (v) => fa(v) + '٪', fill: '#fff', fontSize: 12 }}>
                    {stageList.map((s) => <Cell key={s.key} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>مرحله</th><th>تولید</th><th>زمان واقعی</th><th>زمان استاندارد</th><th>بهره‌وری</th></tr></thead>
                <tbody>
                  {stageList.map((s) => (
                    <tr key={s.key}>
                      <td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                      <td>{num(s.qty)} <small className="muted">{s.unit}</small></td>
                      <td className="mono">{hms(s.actual)}</td>
                      <td className="mono">{hms(s.standard)}</td>
                      <td><span className={`badge badge-${effTone(s.eff)}`}>{pct(s.eff)}</span></td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>جمع کل</td><td>{num(t.qty)}</td><td className="mono">{hms(t.actual)}</td><td className="mono">{hms(t.standard)}</td>
                    <td><span className={`badge badge-${effTone(t.eff)}`}>{pct(t.eff)}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- PER WORKER (admin, all) ---------- */}
          {isAdmin && who === 'all' && (
            <section className="card">
              <div className="card-head"><h2>مقایسهٔ نیروها</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>نیرو</th><th>روز</th><th>تولید</th><th>بهره‌وری</th><th>کارکرد مؤثر</th><th>تأخیر</th></tr></thead>
                  <tbody>
                    {[...res.users].sort((a, b) => (b.eff ?? -9) - (a.eff ?? -9)).map((u, i) => (
                      <tr key={u.key} className="clickable" onClick={() => setWho(u.key)}>
                        <td>{i < 3 && u.eff != null && <span className="rank">{fa(i + 1)}</span>}{nameOf[u.key] || '—'}</td>
                        <td>{fa(u.days)}</td>
                        <td>{num(u.qty)}</td>
                        <td><span className={`badge badge-${effTone(u.eff)}`}>{pct(u.eff)}</span></td>
                        <td>{pct(u.effective)}</td>
                        <td className="mono">{hms(u.late)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ---------- DAILY ---------- */}
          <section className="card">
            <div className="card-head"><h2>گزارش روزانه</h2></div>
            <div className="days">
              {res.days.map((d) => {
                const open = openDay === d.date
                const rows = attByDay[d.date] || []
                const dayOps = data.ops.filter((o) => o.work_date === d.date && o.ended_at)
                const one = who !== 'all' ? rows[0] : null
                return (
                  <div key={d.date} className={`day ${open ? 'open' : ''}`}>
                    <button className="day-head" onClick={() => setOpenDay(open ? null : d.date)} aria-expanded={open}>
                      <div>
                        <b>{jDateLong(d.date)}</b>
                        <small className="muted">
                          {one ? <>ورود {clock(one.clock_in)} · خروج {one.clock_out ? clock(one.clock_out) : '—'}</> : `${fa(rows.length)} نفر حاضر`}
                          {' · '}{num(d.qty)} تولید
                        </small>
                      </div>
                      <div className="day-badges">
                        <span className={`badge badge-${effTone(d.eff)}`}>{pct(d.eff)}</span>
                        <span className="badge badge-soft">مؤثر {pct(d.effective)}</span>
                      </div>
                    </button>
                    {open && (
                      <div className="day-body">
                        {rows.map((a) => {
                          const il = inDiffLabel(Number(a.in_diff_seconds))
                          const ol = outDiffLabel(a.out_diff_seconds == null ? null : Number(a.out_diff_seconds))
                          return (
                            <div key={a.id} className="att-line">
                              {who === 'all' && <b>{nameOf[a.user_id]}</b>}
                              <span>ورود {clock(a.clock_in)} <em className={`tone-${il.tone}`}>{il.text}</em></span>
                              <span>خروج {a.clock_out ? clock(a.clock_out) : 'ثبت نشده'} {a.clock_out && <em className={`tone-${ol.tone}`}>{ol.text}</em>}</span>
                              <span>حضور {a.presence_seconds == null ? '—' : humanDur(Number(a.presence_seconds))}</span>
                            </div>
                          )
                        })}
                        <div className="table-wrap">
                          <table className="table table-sm">
                            <thead><tr>{who === 'all' && <th>نیرو</th>}<th>مرحله</th><th>شروع</th><th>پایان</th><th>تعداد</th><th>واقعی</th><th>استاندارد</th><th>بهره‌وری</th></tr></thead>
                            <tbody>
                              {dayOps.map((o) => {
                                const e = efficiency(Number(o.actual_seconds), Number(o.standard_total_seconds))
                                return (
                                  <tr key={o.id}>
                                    {who === 'all' && <td>{nameOf[o.user_id]}</td>}
                                    <td><span className="dot" style={{ background: o.color }} />{o.stage_name}{o.note && <small className="muted note"> — {o.note}</small>}</td>
                                    <td className="mono">{clock(o.started_at)}</td>
                                    <td className="mono">{clock(o.ended_at)}</td>
                                    <td>{num(Number(o.quantity))}</td>
                                    <td className="mono">{hms(Number(o.actual_seconds))}</td>
                                    <td className="mono">{hms(Number(o.standard_total_seconds))}</td>
                                    <td><span className={`badge badge-${effTone(e)}`}>{pct(e)}</span></td>
                                  </tr>
                                )
                              })}
                              {dayOps.length === 0 && <tr><td colSpan={8} className="muted center">عملیاتی ثبت نشده</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <p className="formula-note">
            <Icon name="target" size={14} /> بهره‌وری = ۱ − (زمان واقعی − زمان استاندارد) ÷ زمان استاندارد
            <br />
            <Icon name="bolt" size={14} /> کارکرد مؤثر = مجموع زمان عملیات ÷ مجموع زمان حضور (روزهایی که خروج ثبت شده)
          </p>
        </>
      )}
    </div>
  )
}

function TrendTip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null
  const title = mode === 'month' ? jParts(label) && `${MONTHS[jParts(label).jm - 1]} ${fa(jParts(label).jy)}`
    : mode === 'week' ? `هفتهٔ ${jDate(label)} تا ${jDate(addDays(label, 6))}` : jDateLong(label)
  return (
    <div className="tip" dir="rtl">
      <b>{title}</b>
      {payload.map((p) => (
        <div key={p.dataKey}><span className="dot" style={{ background: p.color }} />{p.name}: <b>{p.value == null ? '—' : fa(p.value) + '٪'}</b></div>
      ))}
    </div>
  )
}

