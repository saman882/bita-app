import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { efficiency } from '../lib/calc'
import { useAccess, can } from '../lib/access'
import { useWorkHours, defaultsFor, dayKind, dayMetrics, breaksOf } from '../lib/hours'
import { fa, num, pct, jDateLong, tehranIso, addDays, normalizeFa, humanDur, toEn } from '../lib/fmt'
import { Icon, Button, Sheet, Field, NumInput, Empty, Spinner, useToast, effTone, JCalendar, SearchSelect, TimeInput, SearchBox, JDateInput, isTime } from '../components/ui'
import SalesEntry from './SalesEntry'

const t5 = (t) => (t ? String(t).slice(0, 5) : '')
const mins = (a, b) => {
  if (!/^\d\d:\d\d$/.test(a || '') || !/^\d\d:\d\d$/.test(b || '')) return null
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

/** Catalog lists (products with group, operations) — readable by any staff. */
export function useCatalog() {
  const [cat, setCat] = useState({ products: [], stages: [], types: [], loaded: false })
  const load = useCallback(async () => {
    const [p, s, t] = await Promise.all([
      supabase.from('products').select('id, name, active, price, type_id, product_types(name, sort_order)').order('name'),
      supabase.from('stages').select('id, name, color, sort_order, active, is_packaging').order('sort_order').order('id'),
      supabase.from('product_types').select('*').order('sort_order'),
    ])
    const products = (p.data || []).map((x) => ({ ...x, type: x.product_types?.name, typeOrder: x.product_types?.sort_order ?? 0, sub: x.product_types?.name }))
      .sort((a, b) => a.typeOrder - b.typeOrder || a.name.localeCompare(b.name, 'fa'))
    setCat({ products, stages: s.data || [], types: t.data || [], loaded: true })
  }, [])
  useEffect(() => { load() }, [load])
  return [cat, load]
}

/** Date bar + calendar shared by production and sales entry. */
export function DatePicker({ date, setDate, kind, extra }) {
  const today = tehranIso()
  const [open, setOpen] = useState(false)
  const [marks, setMarks] = useState(new Set())
  const loadMarks = useCallback(async (from, to) => {
    const { data } = await supabase.rpc('days_with_data', { p_from: from, p_to: to, p_kind: kind })
    setMarks(new Set(data || []))
  }, [kind])
  return (
    <>
      <div className="datebar card">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="روز قبل"><Icon name="chev" /></button>
        <button className="datebar-main" onClick={() => setOpen(true)}>
          <Icon name="cal" size={20} />
          <div><b>{jDateLong(date)}</b><small className="muted">{date === today ? 'امروز' : 'برای تغییر تاریخ بزنید'}{extra ? ` · ${extra}` : ''}</small></div>
        </button>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="روز بعد"><Icon name="chev" className="flip" /></button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="انتخاب تاریخ">
        <JCalendar value={date} marks={marks} onMonth={loadMarks} onChange={(d) => { setDate(d); setOpen(false) }} />
        <p className="muted small center">روزهایی که نقطه دارند اطلاعات ثبت‌شده دارند.</p>
      </Sheet>
    </>
  )
}

const BRANCHES = [
  { id: 'attendance', label: 'حضور همکاران', text: 'ورود، خروج و استراحت‌های هر همکار', icon: 'clock', perm: 'entry_production' },
  { id: 'operations', label: 'عملیات تولید', text: 'محصول، عملیات، ساعت و تعداد هر همکار', icon: 'layers', perm: 'entry_production' },
  { id: 'sales', label: 'فروش', text: 'فاکتورهای فروش و ورود از اکسل', icon: 'tag', perm: 'entry_sales' },
]

export default function Entry() {
  const access = useAccess()
  const branches = BRANCHES.filter((b) => can(access, b.perm))
  const [view, setView] = useState(branches.length === 1 ? branches[0].id : null)
  const [date, setDate] = useState(tehranIso())
  if (!branches.length) return <div className="page"><Empty icon="alert" title="به ثبت روزانه دسترسی ندارید" /></div>
  const cur = branches.find((b) => b.id === view)
  if (!cur) return (
    <div className="page">
      <div className="page-title"><h1>ثبت روزانه</h1></div>
      <div className="hub">
        {branches.map((b) => (
          <button key={b.id} className="hub-card" onClick={() => setView(b.id)}>
            <span className="hub-ic"><Icon name={b.icon} size={26} /></span>
            <div className="grow"><b>{b.label}</b><small className="muted">{b.text}</small></div>
            <Icon name="chev" className="flip muted" />
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="page">
      <div className="page-title">
        <h1>{cur.label}</h1>
        {branches.length > 1 && <Button variant="ghost" icon="chev" onClick={() => setView(null)}>ثبت روزانه</Button>}
      </div>
      {view === 'attendance' && <AttendanceEntry date={date} setDate={setDate} />}
      {view === 'operations' && <OperationsEntry date={date} setDate={setDate} />}
      {view === 'sales' && <SalesEntry date={date} setDate={setDate} />}
    </div>
  )
}

/** Loads the day sheet (every active colleague with that day's attendance and operations). */
function useDaySheet(date) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('day_sheet', { p_date: date })
    if (error) toast(errText(error), 'bad')
    setRows(data || [])
  }, [date, toast])
  useEffect(() => { setRows(null); load() }, [load])
  return [rows, load]
}
const useFiltered = (rows, q) => useMemo(() => {
  const t = normalizeFa(q).trim()
  return (rows || []).filter((r) => !t || normalizeFa(r.full_name).includes(t) || (r.personnel_code || '').includes(toEn(t)))
}, [rows, q])

const breakText = (b) => `${fa(b.start)}–${fa(b.end)}`

/* =====================================================================
   ATTENDANCE
   ===================================================================== */
function AttendanceEntry({ date, setDate }) {
  const access = useAccess()
  const [rows, load] = useDaySheet(date)
  const [q, setQ] = useState('')
  const [wh, reloadWh] = useWorkHours()
  const [hoursOpen, setHoursOpen] = useState(false)
  const list = useFiltered(rows, q)
  const saved = (rows || []).filter((r) => r.att).length

  return (
    <>
      <DatePicker date={date} setDate={setDate} kind="production" extra={`حضور ${fa(saved)} از ${fa(rows?.length ?? 0)} همکار ثبت شده`} />
      <div className="hours-bar card">
        <div className="hours-items">
          <span><b>شنبه تا چهارشنبه</b> {fa(wh.weekday.in)}–{fa(wh.weekday.out)}</span>
          <span><b>پنجشنبه</b> {fa(wh.thursday.in)}–{fa(wh.thursday.out)}</span>
          {wh.breaks.map((b, i) => <span key={i}><b>{b.name}</b> {breakText(b)}</span>)}
        </div>
        {can(access, 'settings') && <Button variant="ghost" icon="edit" onClick={() => setHoursOpen(true)}>تغییر پیش‌فرض‌ها</Button>}
      </div>
      {dayKind(date) === 'friday' && <div className="banner banner-warn"><Icon name="alert" /><div>این روز جمعه است؛ ساعت ورود و خروج پیش‌فرض ندارد. اگر کسی سر کار بوده دستی وارد کنید (همه‌اش اضافه‌کار حساب می‌شود).</div></div>}
      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام همکار…" />
      {!rows ? <div className="page-center"><Spinner size={28} /></div> : list.length === 0 ? (
        <Empty icon="users" title={rows.length ? 'همکاری با این نام پیدا نشد' : 'هنوز همکاری تعریف نشده'} />
      ) : (
        <div className="entry-list">
          {list.map((r) => <WorkerRow key={r.id} r={r} date={date} wh={wh} onSaved={load} />)}
        </div>
      )}
      {hoursOpen && <HoursEditor wh={wh} onClose={() => setHoursOpen(false)} onSaved={() => { setHoursOpen(false); reloadWh() }} />}
    </>
  )
}

const t5b = (b) => ({ name: b.name, start: t5(b.start), end: t5(b.end), unpaid: !!b.unpaid })
const sameAtt = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function WorkerRow({ r, date, wh, onSaved }) {
  const toast = useToast()
  const initial = useMemo(() => (r.att
    ? { clock_in: t5(r.att.clock_in), clock_out: t5(r.att.clock_out), breaks: breaksOf(r.att).map(t5b) }
    : { ...defaultsFor(date, wh), breaks: defaultsFor(date, wh).breaks.map(t5b) }), [r.att, date, wh])
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setF(initial) }, [initial])
  const setB = (i, k, v) => setF((x) => ({ ...x, breaks: x.breaks.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }))
  const dirty = !r.att || !sameAtt(f, initial)
  const m = dayMetrics({ ...f, work_date: date, expected_in: r.att?.expected_in }, wh)

  const save = async () => {
    for (const t of [f.clock_in, f.clock_out]) if (t && !isTime(t)) return toast('ساعت را به شکل ۲۴ ساعته وارد کنید، مثلاً ۰۷:۳۰', 'bad')
    if (!f.clock_in && !f.clock_out) return toast('ساعت ورود یا خروج را وارد کنید', 'bad')
    if (f.clock_in && f.clock_out && f.clock_out <= f.clock_in) return toast('ساعت خروج باید بعد از ورود باشد', 'bad')
    for (const b of f.breaks) {
      if ((b.start && !isTime(b.start)) || (b.end && !isTime(b.end))) return toast(`ساعت «${b.name}» نامعتبر است`, 'bad')
      if (!!b.start !== !!b.end) return toast(`شروع و پایان «${b.name}» را هر دو وارد کنید یا هر دو را خالی بگذارید`, 'bad')
      if (b.start && b.end <= b.start) return toast(`پایان «${b.name}» باید بعد از شروع آن باشد`, 'bad')
    }
    setBusy(true)
    const { error } = await supabase.rpc('save_attendance2', { p_worker: r.id, p_date: date, p_in: f.clock_in || null, p_out: f.clock_out || null, p_breaks: f.breaks.filter((b) => b.start && b.end) })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast(`حضور «${r.full_name}» ذخیره شد`); onSaved()
  }
  const clear = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('save_attendance2', { p_worker: r.id, p_date: date, p_in: null, p_out: null, p_breaks: [] })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast(`حضور «${r.full_name}» حذف شد`); onSaved()
  }

  return (
    <div className={`erow ${r.att ? 'has' : 'draft'} ${r.active ? '' : 'is-off'}`}>
      <div className="erow-head">
        <div className="avatar">{r.full_name.trim()[0]}</div>
        <div className="grow">
          <b>{r.full_name}</b>
          <small className="muted">{r.att ? 'حضور ثبت شده' : 'ساعت‌های پیش‌فرض — هنوز ثبت نشده'}{r.personnel_code && <> · کد {fa(r.personnel_code)}</>}</small>
        </div>
        {m?.late > 0 && <span className="badge badge-bad">{fa(m.late)} دقیقه تأخیر</span>}
      </div>
      <div className="erow-times">
        <div className="tpair"><span>ورود و خروج</span>
          <TimeInput value={f.clock_in} onChange={(v) => setF({ ...f, clock_in: v })} aria-label="ورود" /><i>تا</i>
          <TimeInput value={f.clock_out} onChange={(v) => setF({ ...f, clock_out: v })} aria-label="خروج" />
        </div>
        {f.breaks.map((b, i) => (
          <div key={i} className="tpair"><span>{b.name}</span>
            <TimeInput value={b.start} onChange={(v) => setB(i, 'start', v)} aria-label={`${b.name} از`} /><i>تا</i>
            <TimeInput value={b.end} onChange={(v) => setB(i, 'end', v)} aria-label={`${b.name} تا`} />
            <button type="button" className="icon-btn sm" aria-label={`برداشتن ${b.name}`} onClick={() => setF({ ...f, breaks: f.breaks.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <button type="button" className="link-btn add-break" onClick={() => setF({ ...f, breaks: [...f.breaks, { name: 'استراحت', start: '', end: '', unpaid: false }] })}><Icon name="plus" size={14} /> افزودن استراحت</button>
      </div>
      {m && <small className="muted erow-sum">کارکرد {humanDur(m.work * 60)}{m.overtime > 0 && <> · <b className="tone-info">اضافه‌کار {humanDur(m.overtime * 60)}</b></>}</small>}
      <div className="erow-btns">
        {dirty && <Button icon="check" loading={busy} onClick={save} className="grow">{r.att ? 'ذخیرهٔ تغییرات' : 'ثبت حضور'}</Button>}
        {r.att && !dirty && <span className="muted small grow saved-note"><Icon name="check" size={14} /> ذخیره شده</span>}
        {r.att && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={clear}>حذف حضور</Button>}
      </div>
    </div>
  )
}

function HoursEditor({ wh, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(wh)))
  const [busy, setBusy] = useState(false)
  const setShift = (g, k, v) => setF((x) => ({ ...x, [g]: { ...x[g], [k]: v } }))
  const setB = (i, k, v) => setF((x) => ({ ...x, breaks: x.breaks.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }))
  const save = async () => {
    for (const [a, b] of [[f.weekday.in, f.weekday.out], [f.thursday.in, f.thursday.out]]) {
      if (!isTime(a) || !isTime(b) || b <= a) return toast('ساعت شیفت را درست و به شکل ۲۴ ساعته وارد کنید', 'bad')
    }
    for (const b of f.breaks) {
      if (!b.name.trim()) return toast('برای هر استراحت یک نام بنویسید', 'bad')
      if (!isTime(b.start) || !isTime(b.end) || b.end <= b.start) return toast(`ساعت «${b.name}» را درست وارد کنید`, 'bad')
    }
    setBusy(true)
    const value = { weekday: f.weekday, thursday: f.thursday, breaks: f.breaks.map((b) => ({ ...b, name: b.name.trim() })).sort((a, b) => (a.start < b.start ? -1 : 1)) }
    const { error } = await supabase.from('app_settings').update({ value }).eq('key', 'work_hours')
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('ساعت‌های پیش‌فرض ذخیره شد'); onSaved()
  }
  return (
    <Sheet open onClose={onClose} title="ساعت‌های کاری پیش‌فرض" footer={<Button className="btn-block" icon="check" loading={busy} onClick={save}>ذخیره</Button>}>
      <div className="form">
        <p className="muted small">این ساعت‌ها برای همهٔ همکاران پیش‌فرض است و در ثبت حضور برای هر نفر قابل تغییر است. ساعت کار موظف هر روز (مبنای اضافه‌کار) = ساعت شیفت منهای استراحت‌هایی که «از کارکرد کم می‌شود» (مثل ناهار).</p>
        <div className="tpair"><span>شنبه تا چهارشنبه</span><TimeInput value={f.weekday.in} onChange={(v) => setShift('weekday', 'in', v)} /><i>تا</i><TimeInput value={f.weekday.out} onChange={(v) => setShift('weekday', 'out', v)} /></div>
        <div className="tpair"><span>پنجشنبه</span><TimeInput value={f.thursday.in} onChange={(v) => setShift('thursday', 'in', v)} /><i>تا</i><TimeInput value={f.thursday.out} onChange={(v) => setShift('thursday', 'out', v)} /></div>
        <div className="sub-head">استراحت‌ها</div>
        {f.breaks.length === 0 && <p className="muted small">استراحتی تعریف نشده.</p>}
        {f.breaks.map((b, i) => (
          <div key={i} className="break-edit">
            <div className="break-edit-top">
              <input className="input" value={b.name} onChange={(e) => setB(i, 'name', e.target.value)} placeholder="نام، مثلاً استراحت دوم" aria-label="نام استراحت" />
              <button type="button" className="icon-btn" aria-label={`حذف ${b.name}`} onClick={() => setF({ ...f, breaks: f.breaks.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>
            </div>
            <div className="tpair"><span>از</span><TimeInput value={b.start} onChange={(v) => setB(i, 'start', v)} /><i>تا</i><TimeInput value={b.end} onChange={(v) => setB(i, 'end', v)} /></div>
            <label className="check"><input type="checkbox" checked={!!b.unpaid} onChange={(e) => setB(i, 'unpaid', e.target.checked)} /> از ساعت کارکرد کم می‌شود (مثل ناهار)</label>
          </div>
        ))}
        <Button variant="ghost" icon="plus" onClick={() => setF({ ...f, breaks: [...f.breaks, { name: '', start: '', end: '', unpaid: false }] })}>افزودن استراحت</Button>
      </div>
    </Sheet>
  )
}

/* =====================================================================
   OPERATIONS
   ===================================================================== */
function OperationsEntry({ date, setDate }) {
  const access = useAccess()
  const showEff = can(access, 'reports_staff')
  const [rows, load] = useDaySheet(date)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [cat] = useCatalog()
  const list = useFiltered(rows, q)
  const worker = rows?.find((r) => r.id === open)
  const withJobs = (rows || []).filter((r) => r.jobs?.length).length

  return (
    <>
      <DatePicker date={date} setDate={setDate} kind="production" extra={`عملیات ${fa(withJobs)} همکار ثبت شده`} />
      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام همکار…" />
      {!rows ? <div className="page-center"><Spinner size={28} /></div> : list.length === 0 ? (
        <Empty icon="users" title={rows.length ? 'همکاری با این نام پیدا نشد' : 'هنوز همکاری تعریف نشده'} />
      ) : (
        <div className="entry-list">
          {list.map((r) => {
            const jobs = r.jobs || []
            const Q = jobs.reduce((s, j) => s + Number(j.quantity), 0)
            let A = 0, S = 0
            if (showEff) for (const j of jobs) if (j.actual != null && j.std_seconds != null) { A += Number(j.actual); S += Number(j.quantity) * Number(j.std_seconds) }
            const eff = showEff ? efficiency(A, S) : null
            return (
              <button key={r.id} className={`erow op-person ${jobs.length ? 'has' : 'draft'} ${r.active ? '' : 'is-off'}`} onClick={() => setOpen(r.id)}>
                <div className="erow-head">
                  <div className="avatar">{r.full_name.trim()[0]}</div>
                  <div className="grow">
                    <b>{r.full_name}</b>
                    <small className="muted">{jobs.length ? <>{fa(jobs.length)} عملیات · {num(Q)} عدد</> : 'هنوز عملیاتی ثبت نشده'}{r.att ? ` · حضور ${fa(t5(r.att.clock_in))}–${fa(t5(r.att.clock_out))}` : ' · حضور ثبت نشده'}</small>
                  </div>
                  {eff != null && <span className={`badge badge-${effTone(eff)}`}>{pct(eff)}</span>}
                  <span className="erow-cta">{jobs.length ? 'ویرایش' : 'ثبت عملیات'}<Icon name="chev" size={16} className="flip" /></span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {worker && <WorkerDay worker={worker} date={date} cat={cat} showEff={showEff} onClose={() => setOpen(null)} onSaved={load} />}
    </>
  )
}

/* ---------- one employee, one day: operations ---------- */
const newRow = (start = '') => ({ start, end: '', qty: '' })

function WorkerDay({ worker, date, cat, showEff, onClose, onSaved }) {
  const toast = useToast()
  const [product, setProduct] = useState(null)
  const [picked, setPicked] = useState([])
  const [rowsBy, setRowsBy] = useState({})
  const [opQ, setOpQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)
  const [delId, setDelId] = useState(null)
  const jobs = worker.jobs || []
  const lastEnd = jobs.reduce((m, j) => (j.end_time && t5(j.end_time) > m ? t5(j.end_time) : m), '')
  const products = cat.products.filter((p) => p.active || p.id === product)
  const stages = cat.stages.filter((s) => s.active && (!opQ || normalizeFa(s.name).includes(normalizeFa(opQ).trim())))

  const toggle = (id) => {
    if (picked.includes(id)) { setPicked(picked.filter((x) => x !== id)); return }
    const prevEnd = picked.length ? rowsBy[picked[picked.length - 1]]?.end : lastEnd
    setPicked([...picked, id])
    setRowsBy({ ...rowsBy, [id]: rowsBy[id] || newRow(prevEnd || '') })
  }
  const setRow = (id, k, v) => setRowsBy({ ...rowsBy, [id]: { ...rowsBy[id], [k]: v } })

  const saveAll = async () => {
    if (!product) return toast('محصول را انتخاب کنید', 'bad')
    if (!picked.length) return toast('حداقل یک عملیات انتخاب کنید', 'bad')
    for (const id of picked) {
      const r = rowsBy[id], name = cat.stages.find((s) => s.id === id)?.name
      if (r.qty === '') return toast(`تعداد «${name}» را وارد کنید`, 'bad')
      if ((r.start && !isTime(r.start)) || (r.end && !isTime(r.end))) return toast(`ساعت «${name}» نامعتبر است؛ مثلاً ۰۷:۳۰`, 'bad')
      if (!!r.start !== !!r.end) return toast(`برای «${name}» هر دو ساعت شروع و پایان را وارد کنید`, 'bad')
      if (r.start && r.end <= r.start) return toast(`در «${name}» ساعت پایان باید بعد از شروع باشد`, 'bad')
    }
    setBusy(true)
    for (const id of picked) {
      const r = rowsBy[id]
      const { error } = await supabase.rpc('save_job', { p_id: null, p_worker: worker.id, p_date: date, p_product: product, p_stage: id,
        p_qty: Number(r.qty), p_start: r.start || null, p_end: r.end || null, p_note: null })
      if (error) { setBusy(false); toast(errText(error), 'bad'); onSaved(); return }
    }
    setBusy(false)
    toast(`${fa(picked.length)} عملیات ثبت شد`)
    setPicked([]); setRowsBy({}); onSaved()
  }
  const remove = async (id) => {
    const { error } = await supabase.rpc('delete_job', { p_id: id })
    if (error) return toast(errText(error), 'bad')
    toast('حذف شد'); setDelId(null); onSaved()
  }

  return (
    <Sheet open onClose={onClose} title={`${worker.full_name} — ${jDateLong(date)}`}
      footer={picked.length > 0 && <Button className="btn-block btn-lg" icon="check" loading={busy} onClick={saveAll}>ثبت {fa(picked.length)} عملیات</Button>}>
      {jobs.length > 0 && (
        <div className="jobs">
          <div className="sub-head">ثبت‌شده در این روز</div>
          {jobs.map((j) => {
            const e = showEff && j.actual != null && j.std_seconds != null ? efficiency(Number(j.actual), Number(j.quantity) * Number(j.std_seconds)) : null
            return (
              <div key={j.id} className="job" style={{ '--c': j.color }}>
                <span className="job-bar" />
                <div className="grow">
                  <div className="job-top"><b>{j.stage_name}</b>{e != null && <span className={`badge badge-${effTone(e)}`}>{pct(e)}</span>}{showEff && j.std_seconds == null && <span className="badge" title="در بهره‌وری حساب نمی‌شود؛ در حضور مؤثر حساب می‌شود">بدون زمان استاندارد</span>}</div>
                  <small className="muted">{j.product_name}</small>
                  <div className="job-meta">
                    <span className="mono">{j.start_time ? `${fa(t5(j.start_time))} تا ${fa(t5(j.end_time))}` : 'بدون ساعت'}</span>
                    {j.start_time && <span>({humanDur(mins(t5(j.start_time), t5(j.end_time)) * 60)})</span>}
                    <b>{num(Number(j.quantity))} عدد</b>
                  </div>
                </div>
                {delId === j.id ? (
                  <div className="job-confirm"><Button variant="danger" onClick={() => remove(j.id)}>حذف</Button><Button variant="ghost" onClick={() => setDelId(null)}>نه</Button></div>
                ) : (
                  <div className="job-actions">
                    <button className="icon-btn" aria-label="ویرایش" onClick={() => setEdit({ ...j, start: t5(j.start_time), end: t5(j.end_time), qty: String(Number(j.quantity)) })}><Icon name="edit" size={18} /></button>
                    <button className="icon-btn" aria-label="حذف" onClick={() => setDelId(j.id)}><Icon name="trash" size={18} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="sub-head">{jobs.length ? 'افزودن عملیات جدید' : 'ثبت عملیات این روز'}</div>
      <div className="form">
        <Field label="محصول"><SearchSelect label="انتخاب محصول" items={products} value={product} onChange={setProduct} group="type" placeholder="محصول را انتخاب کنید" /></Field>
        <Field label="عملیات‌های انجام‌شده (هر تعداد)">
          {cat.stages.length > 8 && <input className="input op-search" placeholder="جستجوی عملیات…" value={opQ} onChange={(e) => setOpQ(e.target.value)} />}
          <div className="op-chips">
            {stages.map((s) => (
              <button key={s.id} type="button" className={`op-chip ${picked.includes(s.id) ? 'on' : ''}`} style={{ '--c': s.color }} onClick={() => toggle(s.id)} aria-pressed={picked.includes(s.id)}>
                {picked.includes(s.id) ? <Icon name="check" size={14} /> : <span className="dot" style={{ background: s.color }} />}{s.name}
              </button>
            ))}
          </div>
        </Field>
        {picked.map((id) => {
          const s = cat.stages.find((x) => x.id === id), r = rowsBy[id]
          const m = mins(r.start, r.end)
          return (
            <div key={id} className="op-row" style={{ '--c': s.color }}>
              <div className="op-row-head"><span className="dot" style={{ background: s.color }} /><b>{s.name}</b>
                <button className="icon-btn" onClick={() => toggle(id)} aria-label="برداشتن"><Icon name="x" size={16} /></button></div>
              <div className="op-row-grid">
                <label><span>شروع</span><TimeInput value={r.start} onChange={(v) => setRow(id, 'start', v)} /></label>
                <label><span>پایان</span><TimeInput value={r.end} onChange={(v) => setRow(id, 'end', v)} /></label>
                <label><span>تعداد</span><NumInput value={r.qty} onChange={(v) => setRow(id, 'qty', v)} placeholder="۰" /></label>
              </div>
              {m != null && <small className={m > 0 ? 'muted' : 'tone-bad'}>{m > 0 ? `مدت: ${humanDur(m * 60)}` : 'پایان باید بعد از شروع باشد'}</small>}
            </div>
          )
        })}
      </div>
      {edit && <JobEditor job={edit} worker={worker} date={date} cat={cat} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onSaved() }} />}
    </Sheet>
  )
}

function JobEditor({ job, worker, date, cat, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(job)
  const [busy, setBusy] = useState(false)
  const [d, setD] = useState(date)
  const save = async () => {
    if (f.qty === '') return toast('تعداد را وارد کنید', 'bad')
    if ((f.start && !isTime(f.start)) || (f.end && !isTime(f.end))) return toast('ساعت نامعتبر است؛ مثلاً ۰۷:۳۰', 'bad')
    if (!!f.start !== !!f.end) return toast('هر دو ساعت شروع و پایان را وارد کنید', 'bad')
    if (f.start && f.end <= f.start) return toast('ساعت پایان باید بعد از شروع باشد', 'bad')
    setBusy(true)
    const { error } = await supabase.rpc('save_job', { p_id: job.id, p_worker: worker.id, p_date: d, p_product: f.product_id, p_stage: f.stage_id,
      p_qty: Number(f.qty), p_start: f.start || null, p_end: f.end || null, p_note: f.note || null })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('ویرایش ذخیره شد'); onSaved()
  }
  return (
    <Sheet open onClose={onClose} title="ویرایش عملیات" footer={<Button className="btn-block" icon="check" loading={busy} onClick={save}>ذخیره</Button>}>
      <div className="form">
        <Field label="محصول"><SearchSelect label="انتخاب محصول" items={cat.products} value={f.product_id} onChange={(v) => setF({ ...f, product_id: v })} group="type" /></Field>
        <Field label="عملیات"><SearchSelect label="انتخاب عملیات" items={cat.stages} value={f.stage_id} onChange={(v) => setF({ ...f, stage_id: v })} /></Field>
        <div className="grid3">
          <Field label="شروع"><TimeInput value={f.start} onChange={(v) => setF({ ...f, start: v })} /></Field>
          <Field label="پایان"><TimeInput value={f.end} onChange={(v) => setF({ ...f, end: v })} /></Field>
          <Field label="تعداد"><NumInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} /></Field>
        </div>
        <Field label="تاریخ" hint="برای انتقال این عملیات به روز دیگر"><JDateInput value={d} onChange={(v) => setD(v > tehranIso() ? tehranIso() : v)} label="تاریخ" /></Field>
        <Field label="توضیح"><input className="input" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Sheet>
  )
}
