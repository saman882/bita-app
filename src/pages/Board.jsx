import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useNow } from '../lib/clock'
import { efficiency } from '../lib/calc'
import { fa, num, pct, clock, hms, jDateLong, tehranIso, shortTime, inDiffLabel, outDiffLabel, normalizeFa } from '../lib/fmt'
import { Icon, Button, Sheet, Field, NumInput, Empty, Spinner, Kpi, useToast, effTone } from '../components/ui'

/**
 * Recording board — used by supervisors (and admins) at the workplace.
 * Supervisors receive no standard times / efficiency from the server; admins get extras.
 */
const status = (r) => (!r.att ? 'absent' : r.att.clock_out ? 'left' : r.open_op ? 'working' : 'idle')
const ORDER = { working: 0, idle: 1, absent: 2, left: 3 }

export default function Board({ isAdmin }) {
  const toast = useToast()
  const now = useNow()
  const today = tehranIso(now)
  const [rows, setRows] = useState(null)
  const [stages, setStages] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null) // {kind:'in'|'out', w}
  const [pick, setPick] = useState(null) // worker for stage picker
  const [end, setEnd] = useState(null) // worker for ending op
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([supabase.rpc('board'), supabase.rpc('stage_options')])
    if (b.error || s.error) toast(errText(b.error || s.error), 'bad')
    setRows(b.data || [])
    setStages((s.data || []).filter((x) => x.active))
  }, [toast])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load, today])

  const act = async (fn, args, okMsg) => {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { toast(errText(error), 'bad'); return false }
    toast(okMsg)
    await load()
    return true
  }

  const list = useMemo(() => {
    const term = normalizeFa(q).trim()
    return (rows || [])
      .filter((r) => !term || r.full_name.includes(term) || (r.personnel_code || '').includes(term))
      .sort((a, b) => ORDER[status(a)] - ORDER[status(b)] || a.full_name.localeCompare(b.full_name, 'fa'))
  }, [rows, q])

  if (!rows) return <div className="page-center"><Spinner size={28} /></div>
  const cnt = (s) => rows.filter((r) => status(r) === s).length

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>ثبت حضور و عملیات</h1>
          <span className="muted small">{jDateLong(today)}</span>
        </div>
        <div className="big-clock mono">{clock(now)}</div>
      </div>

      <div className="kpis kpis-4">
        <Kpi icon="bolt" label="در حال کار" value={fa(cnt('working'))} tone="good" />
        <Kpi icon="clock" label="حاضر، بیکار" value={fa(cnt('idle'))} tone={cnt('idle') ? 'warn' : ''} />
        <Kpi icon="users" label="نیامده" value={fa(cnt('absent'))} />
        <Kpi icon="logout" label="رفته" value={fa(cnt('left'))} />
      </div>

      {rows.length > 6 && (
        <div className="input-ic search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="جستجوی نام یا کد پرسنلی…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty icon="users" title="هنوز نیرویی تعریف نشده" text="از بخش «نیروها» نیروها را اضافه کنید." />
      ) : (
        <div className="board">
          {list.map((r) => {
            const st = status(r)
            const done = r.ops || []
            const Q = done.reduce((s, o) => s + Number(o.quantity), 0)
            const A = done.reduce((s, o) => s + Number(o.actual || 0), 0)
            const S = done.reduce((s, o) => s + Number(o.standard || 0), 0)
            const eff = isAdmin && done.length ? efficiency(A, S) : null
            const il = isAdmin && r.att ? inDiffLabel(Number(r.att.in_diff)) : null
            const ol = isAdmin && r.att?.clock_out ? outDiffLabel(Number(r.att.out_diff)) : null
            const elapsed = r.open_op ? (now - Date.parse(r.open_op.started_at)) / 1000 : 0
            return (
              <div key={r.id} className={`wcard st-${st}`} style={r.open_op ? { '--c': r.open_op.color } : undefined}>
                <div className="wcard-head">
                  <div className="avatar">{r.full_name.trim()[0]}</div>
                  <div className="grow">
                    <b>{r.full_name}</b>
                    <small className="muted">
                      {r.personnel_code && <>کد {fa(r.personnel_code)} · </>}شیفت {shortTime(r.shift_start)}–{shortTime(r.shift_end)}
                    </small>
                  </div>
                  {eff != null && <span className={`badge badge-${effTone(eff)}`}>{pct(eff)}</span>}
                </div>

                {r.stale && (
                  <div className="mini-warn"><Icon name="alert" size={14} /> خروج {jDateLong(r.stale.work_date)} ثبت نشده — مدیر باید اصلاح کند</div>
                )}

                {r.att && (
                  <div className="wcard-times">
                    <span>ورود <b className="mono">{clock(r.att.clock_in)}</b>{il && <em className={`tone-${il.tone}`}> {il.text}</em>}</span>
                    {r.att.clock_out && <span>خروج <b className="mono">{clock(r.att.clock_out)}</b>{ol && <em className={`tone-${ol.tone}`}> {ol.text}</em>}</span>}
                  </div>
                )}

                {r.open_op && (
                  <div className="live-op">
                    <span className="op-dot pulse" />
                    <span>{r.open_op.stage_name}</span>
                    <small className="muted">از {clock(r.open_op.started_at)}</small>
                    <b className="mono">{hms(elapsed)}</b>
                  </div>
                )}

                {done.length > 0 && (
                  <details className="wcard-ops">
                    <summary>{fa(done.length)} عملیات تمام‌شده · {num(Q)} تولید</summary>
                    {done.map((o) => (
                      <div key={o.id} className="wop">
                        <span className="dot" style={{ background: o.color }} />
                        <span className="grow">{o.stage_name}</span>
                        <span className="mono muted">{clock(o.started_at)} ← {clock(o.ended_at)}</span>
                        <b>{num(Number(o.quantity))}</b>
                      </div>
                    ))}
                  </details>
                )}

                <div className="wcard-actions">
                  {st === 'absent' && (
                    <Button variant="success" icon="login" className="grow" onClick={() => setConfirm({ kind: 'in', w: r })}>ثبت ورود</Button>
                  )}
                  {st === 'idle' && (
                    <>
                      <Button icon="play" className="grow" onClick={() => setPick(r)} disabled={!stages.length}>شروع عملیات</Button>
                      <Button variant="ghost" icon="logout" onClick={() => setConfirm({ kind: 'out', w: r })}>خروج</Button>
                    </>
                  )}
                  {st === 'working' && (
                    <>
                      <Button variant="danger" icon="stop" className="grow" onClick={() => { setQty(''); setNote(''); setEnd(r) }}>پایان و ثبت تعداد</Button>
                      {(isAdmin || elapsed < 600) && (
                        <Button variant="ghost" icon="x" loading={busy} onClick={() => act('rec_cancel_op', { p_worker: r.id }, 'عملیات لغو شد')}>لغو</Button>
                      )}
                    </>
                  )}
                  {st === 'left' && <span className="muted small done-note"><Icon name="check" size={14} /> روز کاری بسته شد</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* confirm in / out */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'in' ? 'ثبت ورود' : 'ثبت خروج'}
        footer={
          <div className="row-gap">
            <Button variant="ghost" onClick={() => setConfirm(null)}>انصراف</Button>
            <Button variant={confirm?.kind === 'in' ? 'success' : 'danger'} icon={confirm?.kind === 'in' ? 'login' : 'logout'} className="grow" loading={busy}
              onClick={async () => {
                const k = confirm.kind, w = confirm.w
                const ok = await act(k === 'in' ? 'rec_clock_in' : 'rec_clock_out', { p_worker: w.id }, `${k === 'in' ? 'ورود' : 'خروج'} «${w.full_name}» ثبت شد`)
                if (ok) setConfirm(null)
              }}>
              بله، ثبت شود
            </Button>
          </div>
        }>
        {confirm && (
          <div className="confirm-body">
            <div className="avatar xl">{confirm.w.full_name.trim()[0]}</div>
            <b>{confirm.w.full_name}</b>
            <div className="confirm-time mono">{clock(now)}</div>
            <p className="muted small">زمان دقیق از ساعت سرور ثبت می‌شود.</p>
          </div>
        )}
      </Sheet>

      {/* stage picker */}
      <Sheet open={!!pick} onClose={() => setPick(null)} title={`شروع عملیات — ${pick?.full_name ?? ''}`}>
        <div className="stage-grid">
          {stages.map((s) => (
            <button key={s.id} className="stage-tile" style={{ '--c': s.color }} disabled={busy}
              onClick={async () => {
                const ok = await act('rec_start_op', { p_worker: pick.id, p_stage: s.id }, `«${s.name}» برای ${pick.full_name} شروع شد`)
                if (ok) setPick(null)
              }}>
              <span className="stage-tile-ic"><Icon name="play" size={18} /></span>
              <b>{s.name}</b>
              <small>واحد: {s.unit}</small>
            </button>
          ))}
        </div>
      </Sheet>

      {/* end op */}
      <Sheet open={!!end} onClose={() => setEnd(null)} title={`پایان «${end?.open_op?.stage_name ?? ''}» — ${end?.full_name ?? ''}`}
        footer={
          <Button className="btn-block btn-lg" icon="check" loading={busy} disabled={qty === '' || Number.isNaN(Number(qty))}
            onClick={async () => {
              const ok = await act('rec_end_op', { p_worker: end.id, p_quantity: Number(qty), p_note: note || null }, 'عملیات ثبت شد')
              if (ok) setEnd(null)
            }}>
            ثبت و پایان
          </Button>
        }>
        {end?.open_op && (
          <div className="end-summary">
            <div><span>شروع</span><b className="mono">{clock(end.open_op.started_at)}</b></div>
            <div><span>مدت</span><b className="mono">{hms((now - Date.parse(end.open_op.started_at)) / 1000)}</b></div>
          </div>
        )}
        <Field label={`تعداد تولید شده (${end?.open_op?.unit ?? ''})`}>
          <NumInput value={qty} onChange={setQty} autoFocus placeholder="۰" />
        </Field>
        <Field label="توضیح (اختیاری)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: قطعی دستگاه" />
        </Field>
        {isAdmin && end?.open_op?.std_per_unit && qty !== '' && (() => {
          const e = efficiency((now - Date.parse(end.open_op.started_at)) / 1000, Number(qty) * Number(end.open_op.std_per_unit))
          return <div className={`eff-preview tone-${effTone(e)}`}><span>بهره‌وری این عملیات (فقط مدیر می‌بیند)</span><b>{pct(e)}</b></div>
        })()}
      </Sheet>
    </div>
  )
}
