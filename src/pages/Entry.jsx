import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { efficiency } from '../lib/calc'
import { fa, num, pct, jDateLong, tehranIso, addDays, shortTime, normalizeFa, inDiffLabel, outDiffLabel, humanDur, toEn } from '../lib/fmt'
import { Icon, Button, Sheet, Field, NumInput, Empty, Spinner, useToast, effTone, JCalendar, SearchSelect, TimeInput, SearchBox, JDateInput, isTime } from '../components/ui'

const t5 = (t) => (t ? String(t).slice(0, 5) : '')
const mins = (a, b) => {
  if (!/^\d\d:\d\d$/.test(a || '') || !/^\d\d:\d\d$/.test(b || '')) return null
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

/** Loads catalog lists (products with type, operations) visible to any staff role. */
export function useCatalog() {
  const [cat, setCat] = useState({ products: [], stages: [], loaded: false })
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from('products').select('id, name, active, type_id, product_types(name, sort_order)').order('name'),
      supabase.from('stages').select('id, name, color, sort_order, active').order('sort_order').order('id'),
    ])
    const products = (p.data || []).map((x) => ({ ...x, type: x.product_types?.name, typeOrder: x.product_types?.sort_order ?? 0, sub: x.product_types?.name }))
      .sort((a, b) => a.typeOrder - b.typeOrder || a.name.localeCompare(b.name, 'fa'))
    setCat({ products, stages: s.data || [], loaded: true })
  }, [])
  useEffect(() => { load() }, [load])
  return [cat, load]
}

export default function Entry({ isManager }) {
  const toast = useToast()
  const today = tehranIso()
  const [date, setDate] = useState(today)
  const [calOpen, setCalOpen] = useState(false)
  const [marks, setMarks] = useState(new Set())
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null) // worker id for detail sheet
  const [cat] = useCatalog()

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('day_sheet', { p_date: date })
    if (error) toast(errText(error), 'bad')
    setRows(data || [])
  }, [date, toast])
  useEffect(() => { setRows(null); load() }, [load])

  const loadMarks = useCallback(async (from, to) => {
    const { data } = await supabase.rpc('days_with_data', { p_from: from, p_to: to })
    setMarks(new Set(data || []))
  }, [])

  const list = useMemo(() => {
    const t = normalizeFa(q).trim()
    return (rows || []).filter((r) => !t || normalizeFa(r.full_name).includes(t) || (r.personnel_code || '').includes(toEn(t)))
  }, [rows, q])

  const worker = rows?.find((r) => r.id === open)
  const doneCount = (rows || []).filter((r) => r.att || r.jobs?.length).length

  return (
    <div className="page">
      <div className="page-title">
        <h1>ثبت روزانه</h1>
      </div>

      {/* date bar */}
      <div className="datebar card">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="روز قبل"><Icon name="chev" /></button>
        <button className="datebar-main" onClick={() => setCalOpen(true)}>
          <Icon name="cal" size={20} />
          <div>
            <b>{jDateLong(date)}</b>
            <small className="muted">{date === today ? 'امروز' : 'برای تغییر تاریخ بزنید'} · {fa(doneCount)} از {fa(rows?.length ?? 0)} نیرو ثبت شده</small>
          </div>
        </button>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="روز بعد"><Icon name="chev" className="flip" /></button>
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام نیرو…" />

      {!rows ? <div className="page-center"><Spinner size={28} /></div> : list.length === 0 ? (
        <Empty icon="users" title={rows.length ? 'نیرویی با این نام پیدا نشد' : 'هنوز نیرویی تعریف نشده'} />
      ) : (
        <div className="entry-list">
          {list.map((r) => <WorkerRow key={r.id} r={r} date={date} isManager={isManager} onSaved={load} onOpen={() => setOpen(r.id)} />)}
        </div>
      )}

      <Sheet open={calOpen} onClose={() => setCalOpen(false)} title="انتخاب تاریخ">
        <JCalendar value={date} marks={marks} onMonth={loadMarks} onChange={(d) => { setDate(d); setCalOpen(false) }} />
        <p className="muted small center">روزهایی که نقطه دارند اطلاعات ثبت‌شده دارند.</p>
      </Sheet>

      {worker && (
        <WorkerDay worker={worker} date={date} cat={cat} isManager={isManager} onClose={() => setOpen(null)} onSaved={load} />
      )}
    </div>
  )
}

/* ---------- one worker in the day list: attendance inline ---------- */
function WorkerRow({ r, date, isManager, onSaved, onOpen }) {
  const toast = useToast()
  const [cin, setCin] = useState(t5(r.att?.clock_in))
  const [cout, setCout] = useState(t5(r.att?.clock_out))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCin(t5(r.att?.clock_in)); setCout(t5(r.att?.clock_out)) }, [r.att?.clock_in, r.att?.clock_out, date])
  const dirty = cin !== t5(r.att?.clock_in) || cout !== t5(r.att?.clock_out)
  const jobs = r.jobs || []
  const Q = jobs.reduce((s, j) => s + Number(j.quantity), 0)
  let A = 0, S = 0
  if (isManager) for (const j of jobs) if (j.actual != null && j.std_seconds != null) { A += Number(j.actual); S += Number(j.quantity) * Number(j.std_seconds) }
  const eff = isManager ? efficiency(A, S) : null
  const il = isManager && r.att?.in_diff != null ? inDiffLabel(Number(r.att.in_diff)) : null
  const ol = isManager && r.att?.out_diff != null ? outDiffLabel(Number(r.att.out_diff)) : null

  const save = async () => {
    if ((cin && !isTime(cin)) || (cout && !isTime(cout))) return toast('ساعت را به شکل ۲۴ ساعته وارد کنید، مثلاً ۰۷:۳۰ یا ۱۶:۴۵', 'bad')
    if (cin && cout && cout <= cin) return toast('ساعت خروج باید بعد از ورود باشد', 'bad')
    setBusy(true)
    const { error } = await supabase.rpc('save_attendance', { p_worker: r.id, p_date: date, p_in: cin || null, p_out: cout || null })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast(`حضور «${r.full_name}» ذخیره شد`)
    onSaved()
  }

  return (
    <div className={`erow ${r.att || jobs.length ? 'has' : ''} ${r.active ? '' : 'is-off'}`}>
      <div className="erow-head">
        <div className="avatar">{r.full_name.trim()[0]}</div>
        <div className="grow">
          <b>{r.full_name}</b>
          <small className="muted">شیفت {shortTime(r.shift_start)}–{shortTime(r.shift_end)}{r.personnel_code && <> · کد {fa(r.personnel_code)}</>}</small>
        </div>
        {eff != null && <span className={`badge badge-${effTone(eff)}`}>{pct(eff)}</span>}
      </div>
      <div className="erow-att">
        <label><span>ورود</span><TimeInput value={cin} onChange={setCin} aria-label={`ساعت ورود ${r.full_name}`} /></label>
        <label><span>خروج</span><TimeInput value={cout} onChange={setCout} aria-label={`ساعت خروج ${r.full_name}`} /></label>
        {dirty && <Button icon="check" loading={busy} onClick={save} className="erow-save">ذخیره</Button>}
      </div>
      {(il || ol) && <div className="erow-diff">{il && <em className={`tone-${il.tone}`}>{il.text}</em>}{ol && <em className={`tone-${ol.tone}`}>{ol.text}</em>}</div>}
      <button className="erow-jobs" onClick={onOpen}>
        <Icon name="layers" size={18} />
        <span className="grow">{jobs.length ? <>{fa(jobs.length)} عملیات · {num(Q)} تولید</> : 'هنوز عملیاتی ثبت نشده'}</span>
        <span className="erow-cta">{jobs.length ? 'مشاهده و ویرایش' : 'ثبت عملیات'}<Icon name="chev" size={16} className="flip" /></span>
      </button>
    </div>
  )
}

/* ---------- one worker, one day: operations ---------- */
const newRow = (start = '') => ({ start, end: '', qty: '' })

function WorkerDay({ worker, date, cat, isManager, onClose, onSaved }) {
  const toast = useToast()
  const [product, setProduct] = useState(null)
  const [picked, setPicked] = useState([]) // stage ids in order
  const [rowsBy, setRowsBy] = useState({}) // stageId -> {start,end,qty}
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
    setPicked([]); setRowsBy({})
    onSaved()
  }

  const remove = async (id) => {
    const { error } = await supabase.rpc('delete_job', { p_id: id })
    if (error) return toast(errText(error), 'bad')
    toast('حذف شد'); setDelId(null); onSaved()
  }

  return (
    <Sheet open onClose={onClose} title={`${worker.full_name} — ${jDateLong(date)}`}
      footer={picked.length > 0 && (
        <Button className="btn-block btn-lg" icon="check" loading={busy} onClick={saveAll}>ثبت {fa(picked.length)} عملیات</Button>
      )}>
      {/* existing */}
      {jobs.length > 0 && (
        <div className="jobs">
          <div className="sub-head">ثبت‌شده در این روز</div>
          {jobs.map((j) => {
            const e = isManager && j.actual != null && j.std_seconds != null ? efficiency(Number(j.actual), Number(j.quantity) * Number(j.std_seconds)) : null
            return (
              <div key={j.id} className="job" style={{ '--c': j.color }}>
                <span className="job-bar" />
                <div className="grow">
                  <div className="job-top"><b>{j.stage_name}</b>{e != null && <span className={`badge badge-${effTone(e)}`}>{pct(e)}</span>}</div>
                  <small className="muted">{j.product_name}</small>
                  <div className="job-meta">
                    <span className="mono">{j.start_time ? `${fa(t5(j.start_time))} تا ${fa(t5(j.end_time))}` : 'بدون ساعت'}</span>
                    {j.start_time && <span>({humanDur(mins(t5(j.start_time), t5(j.end_time)) * 60)})</span>}
                    <b>{num(Number(j.quantity))} عدد</b>
                  </div>
                </div>
                {delId === j.id ? (
                  <div className="job-confirm">
                    <Button variant="danger" onClick={() => remove(j.id)}>حذف</Button>
                    <Button variant="ghost" onClick={() => setDelId(null)}>نه</Button>
                  </div>
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

      {/* add new */}
      <div className="sub-head">{jobs.length ? 'افزودن عملیات جدید' : 'ثبت عملیات این روز'}</div>
      <div className="form">
        <Field label="محصول">
          <SearchSelect label="انتخاب محصول" items={products} value={product} onChange={setProduct} group="type" placeholder="محصول را انتخاب کنید" />
        </Field>
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
