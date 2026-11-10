import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { efficiency } from '../lib/calc'
import {
  num, pct, clock, humanDur, jDateLong, tehranIso, inDiffLabel, normalizeFa, secToMmss, tehranMs,
} from '../lib/fmt'
import { Icon, Button, Sheet, Field, Empty, Spinner, NumInput, JDateInput, useToast, effTone } from '../components/ui'

/* =====================================================================
   STAGES
   ===================================================================== */
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

export function Stages() {
  const toast = useToast()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('stages').select('*').order('sort_order').order('id')
    if (error) toast(errText(error), 'bad')
    setList(data || [])
  }, [toast])
  useEffect(() => { load() }, [load])

  const open = (s) => {
    const sec = Number(s?.standard_seconds ?? 60)
    setEdit(s ? { ...s, min: String(Math.floor(sec / 60)), sec: String(+(sec % 60).toFixed(2)) }
      : { name: '', unit: 'عدد', min: '1', sec: '0', color: COLORS[(list?.length ?? 0) % COLORS.length], sort_order: (list?.length ?? 0) + 1, active: true })
  }

  const save = async () => {
    const standard_seconds = Number(edit.min || 0) * 60 + Number(edit.sec || 0)
    const name = normalizeFa(edit.name).trim()
    if (!name) return toast('نام مرحله را وارد کنید', 'bad')
    if (!(standard_seconds > 0)) return toast('زمان استاندارد باید بیشتر از صفر باشد', 'bad')
    const row = { name, unit: normalizeFa(edit.unit).trim() || 'عدد', standard_seconds, color: edit.color, sort_order: Number(edit.sort_order) || 0, active: edit.active }
    setBusy(true)
    const { error } = edit.id ? await supabase.from('stages').update(row).eq('id', edit.id) : await supabase.from('stages').insert(row)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('مرحله ذخیره شد')
    setEdit(null)
    load()
  }

  const remove = async () => {
    setBusy(true)
    const { error } = await supabase.from('stages').delete().eq('id', edit.id)
    setBusy(false)
    if (error) return toast(/foreign key/i.test(error.message) ? 'این مرحله سابقهٔ عملیات دارد؛ به‌جای حذف آن را غیرفعال کنید' : errText(error), 'bad')
    toast('حذف شد')
    setEdit(null)
    load()
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1>مراحل تولید</h1>
        <Button icon="plus" onClick={() => open(null)}>مرحلهٔ جدید</Button>
      </div>
      <p className="muted small intro">زمان استاندارد یعنی زمان لازم برای تولید <b>یک واحد</b> در هر مرحله. تغییر آن روی عملیات‌های قبلی اثری ندارد.</p>
      {!list ? <div className="page-center"><Spinner /></div> : list.length === 0 ? (
        <Empty icon="layers" title="هنوز مرحله‌ای نیست" />
      ) : (
        <div className="list">
          {list.map((s) => (
            <button key={s.id} className={`list-item as-btn ${s.active ? '' : 'is-off'}`} onClick={() => open(s)}>
              <span className="stage-swatch" style={{ background: s.color }}><Icon name="layers" size={18} /></span>
              <div className="grow">
                <b>{s.name} {!s.active && <span className="badge badge-soft">غیرفعال</span>}</b>
                <small className="muted">استاندارد هر {s.unit}: {humanDur(Number(s.standard_seconds))}</small>
              </div>
              <Icon name="edit" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش مرحله' : 'مرحلهٔ جدید'}
        footer={<div className="row-gap">
          {edit?.id && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={remove}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>ذخیره</Button>
        </div>}>
        {edit && (
          <div className="form">
            <div className="grid2">
              <Field label="نام مرحله"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="مثلاً دوخت" /></Field>
              <Field label="واحد شمارش"><input className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="عدد / کارتن / متر" /></Field>
            </div>
            <Field label={`زمان استاندارد برای هر ${edit.unit || 'واحد'}`}>
              <div className="duration">
                <NumInput value={edit.min} onChange={(v) => setEdit({ ...edit, min: v })} aria-label="دقیقه" /><span>دقیقه</span>
                <NumInput value={edit.sec} onChange={(v) => setEdit({ ...edit, sec: v })} aria-label="ثانیه" /><span>ثانیه</span>
              </div>
            </Field>
            <Field label="رنگ">
              <div className="swatches">
                {COLORS.map((c) => (
                  <button key={c} type="button" className={`swatch ${edit.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label={c} />
                ))}
              </div>
            </Field>
            <div className="grid2">
              <Field label="ترتیب نمایش"><NumInput value={String(edit.sort_order)} onChange={(v) => setEdit({ ...edit, sort_order: v })} /></Field>
              <Field label="وضعیت">
                <select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">فعال</option><option value="0">غیرفعال</option>
                </select>
              </Field>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/* =====================================================================
   RECORDS (corrections)
   ===================================================================== */
const tOf = (ts) => (ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran', hour12: false }) : '')
const tsOf = (iso, t) => (t ? new Date(tehranMs(iso, t.length === 5 ? t + ':00' : t)).toISOString() : null)

export function Records({ workers, me }) {
  const toast = useToast()
  const [picked, setWho] = useState(null)
  const who = picked || workers.find((w) => w.active)?.id || workers[0]?.id
  const [date, setDate] = useState(tehranIso())
  const [att, setAtt] = useState(undefined)
  const [ops, setOps] = useState([])
  const [stages, setStages] = useState([])
  const [edit, setEdit] = useState(null)
  const [attEdit, setAttEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const worker = useMemo(() => workers.find((w) => w.id === who), [workers, who])

  const load = useCallback(async () => {
    if (!who) return
    setAtt(undefined)
    const [a, o, s] = await Promise.all([
      supabase.from('v_attendance').select('*').eq('worker_id', who).eq('work_date', date).maybeSingle(),
      supabase.from('v_operations').select('*').eq('worker_id', who).eq('work_date', date).order('started_at'),
      supabase.from('stages').select('*').order('sort_order'),
    ])
    if (a.error || o.error) toast(errText(a.error || o.error), 'bad')
    setAtt(a.data || null)
    setOps(o.data || [])
    setStages(s.data || [])
  }, [who, date, toast])
  useEffect(() => { load() }, [load])

  const stamp = { edited_by: me.id, edited_at: new Date().toISOString() }
  const recStamp = { recorded_by: me.id }

  const saveAtt = async () => {
    const clock_in = tsOf(date, attEdit.in)
    const clock_out = attEdit.out ? tsOf(date, attEdit.out) : null
    if (!clock_in) return toast('ساعت ورود لازم است', 'bad')
    if (clock_out && clock_out < clock_in) return toast('خروج نمی‌تواند قبل از ورود باشد', 'bad')
    const row = { clock_in, clock_out, expected_in: attEdit.ein, expected_out: attEdit.eout, ...stamp }
    setBusy(true)
    const { error } = att
      ? await supabase.from('attendance').update(row).eq('id', att.id)
      : await supabase.from('attendance').insert({ ...row, ...recStamp, worker_id: who, work_date: date })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('حضور ذخیره شد'); setAttEdit(null); load()
  }
  const delAtt = async () => {
    setBusy(true)
    const { error } = await supabase.from('attendance').delete().eq('id', att.id)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('حضور حذف شد'); setAttEdit(null); load()
  }

  const saveOp = async () => {
    const started_at = tsOf(date, edit.start)
    const ended_at = edit.end ? tsOf(date, edit.end) : null
    if (!started_at) return toast('ساعت شروع لازم است', 'bad')
    if (ended_at && ended_at < started_at) return toast('پایان نمی‌تواند قبل از شروع باشد', 'bad')
    if (ended_at && edit.qty === '') return toast('تعداد را وارد کنید', 'bad')
    const st = stages.find((s) => s.id === Number(edit.stage_id))
    const row = {
      stage_id: st.id, started_at, ended_at, quantity: ended_at ? Number(edit.qty) : null, note: edit.note || null, ...stamp,
      ...(edit.id && Number(edit.stage_id) === edit.orig_stage ? {} : { standard_seconds: st.standard_seconds }),
    }
    setBusy(true)
    const { error } = edit.id
      ? await supabase.from('operations').update(row).eq('id', edit.id)
      : await supabase.from('operations').insert({ ...row, ...recStamp, worker_id: who, work_date: date })
    setBusy(false)
    if (error) return toast(/one_open/.test(error.message) ? 'این نیرو یک عملیات باز دیگر دارد' : errText(error), 'bad')
    toast('عملیات ذخیره شد'); setEdit(null); load()
  }
  const delOp = async () => {
    setBusy(true)
    const { error } = await supabase.from('operations').delete().eq('id', edit.id)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('عملیات حذف شد'); setEdit(null); load()
  }

  return (
    <div className="page">
      <div className="page-title"><h1>اصلاح ثبت‌ها</h1></div>
      <p className="muted small intro">برای وقتی که نیرو فراموش کرده خروج یا پایان عملیات را بزند، یا اشتباه ثبت کرده. هر اصلاح با نام شما ثبت می‌شود.</p>
      <div className="card filters">
        <select className="input" value={who || ''} onChange={(e) => setWho(e.target.value)} aria-label="نیرو">
          {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
        </select>
        <JDateInput value={date} onChange={setDate} label="تاریخ" />
      </div>

      {att === undefined ? <div className="page-center"><Spinner /></div> : (
        <>
          <section className="card">
            <div className="card-head">
              <h2>حضور {jDateLong(date)}</h2>
              <Button variant="ghost" icon={att ? 'edit' : 'plus'} onClick={() => setAttEdit({
                in: tOf(att?.clock_in) || (worker?.shift_start || '08:00').slice(0, 8),
                out: tOf(att?.clock_out),
                ein: (att?.expected_in || worker?.shift_start || '08:00').slice(0, 5),
                eout: (att?.expected_out || worker?.shift_end || '16:00').slice(0, 5),
              })}>{att ? 'ویرایش' : 'ثبت دستی'}</Button>
            </div>
            {att ? (
              <div className="att-line big">
                <span>ورود <b className="mono">{clock(att.clock_in)}</b> <em className={`tone-${inDiffLabel(+att.in_diff_seconds).tone}`}>{inDiffLabel(+att.in_diff_seconds).text}</em></span>
                <span>خروج <b className="mono">{att.clock_out ? clock(att.clock_out) : <span className="tone-bad">ثبت نشده</span>}</b></span>
                {att.edited_at && <span className="muted small">اصلاح‌شده توسط مدیر</span>}
              </div>
            ) : <p className="muted">در این روز ورودی ثبت نشده.</p>}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>عملیات‌ها</h2>
              <Button variant="ghost" icon="plus" disabled={!stages.length} onClick={() => setEdit({ stage_id: stages.find((s) => s.active)?.id ?? stages[0].id, start: '', end: '', qty: '', note: '' })}>افزودن</Button>
            </div>
            {ops.length === 0 ? <p className="muted">عملیاتی ثبت نشده.</p> : (
              <div className="list">
                {ops.map((o) => (
                  <button key={o.id} className="list-item as-btn" onClick={() => setEdit({
                    id: o.id, stage_id: o.stage_id, orig_stage: o.stage_id, start: tOf(o.started_at), end: tOf(o.ended_at), qty: o.quantity == null ? '' : String(+o.quantity), note: o.note || '',
                  })}>
                    <span className="stage-swatch sm" style={{ background: o.color }} />
                    <div className="grow">
                      <b>{o.stage_name} {!o.ended_at && <span className="badge badge-warn">باز</span>}</b>
                      <small className="muted mono">{clock(o.started_at)} ← {o.ended_at ? clock(o.ended_at) : '…'} {o.ended_at && <>· {num(+o.quantity)} {o.unit}</>}</small>
                    </div>
                    {o.ended_at && <span className={`badge badge-${effTone(efficiency(+o.actual_seconds, +o.standard_total_seconds))}`}>{pct(efficiency(+o.actual_seconds, +o.standard_total_seconds))}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Sheet open={!!attEdit} onClose={() => setAttEdit(null)} title="ویرایش حضور"
        footer={<div className="row-gap">
          {att && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={delAtt}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={saveAtt}>ذخیره</Button>
        </div>}>
        {attEdit && (
          <div className="form">
            <div className="grid2">
              <Field label="ساعت ورود"><input type="time" step="1" className="input" dir="ltr" value={attEdit.in} onChange={(e) => setAttEdit({ ...attEdit, in: e.target.value })} /></Field>
              <Field label="ساعت خروج" hint="خالی = ثبت نشده"><input type="time" step="1" className="input" dir="ltr" value={attEdit.out} onChange={(e) => setAttEdit({ ...attEdit, out: e.target.value })} /></Field>
            </div>
            <div className="grid2">
              <Field label="ورود مقرر"><input type="time" className="input" dir="ltr" value={attEdit.ein} onChange={(e) => setAttEdit({ ...attEdit, ein: e.target.value })} /></Field>
              <Field label="خروج مقرر"><input type="time" className="input" dir="ltr" value={attEdit.eout} onChange={(e) => setAttEdit({ ...attEdit, eout: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش عملیات' : 'افزودن عملیات'}
        footer={<div className="row-gap">
          {edit?.id && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={delOp}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={saveOp}>ذخیره</Button>
        </div>}>
        {edit && (
          <div className="form">
            <Field label="مرحله">
              <select className="input" value={edit.stage_id} onChange={(e) => setEdit({ ...edit, stage_id: Number(e.target.value) })}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({secToMmss(s.standard_seconds)})</option>)}
              </select>
            </Field>
            <div className="grid2">
              <Field label="شروع"><input type="time" step="1" className="input" dir="ltr" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
              <Field label="پایان" hint="خالی = هنوز باز"><input type="time" step="1" className="input" dir="ltr" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            </div>
            <Field label="تعداد"><NumInput value={edit.qty} onChange={(v) => setEdit({ ...edit, qty: v })} /></Field>
            <Field label="توضیح"><input className="input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </div>
  )
}
