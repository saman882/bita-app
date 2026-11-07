import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useNow } from '../lib/clock'
import { efficiency, effective } from '../lib/calc'
import {
  fa, num, pct, clock, hms, humanDur, jDateLong, tehranIso, tehranMs, shortTime, inDiffLabel, outDiffLabel,
} from '../lib/fmt'
import { Icon, Button, Sheet, Kpi, Empty, Field, NumInput, Spinner, useToast, effTone } from '../components/ui'

export default function Today({ profile }) {
  const toast = useToast()
  const now = useNow()
  const today = tehranIso(now)
  const [loading, setLoading] = useState(true)
  const [stages, setStages] = useState([])
  const [att, setAtt] = useState(null) // today's attendance row
  const [stale, setStale] = useState([]) // older days never clocked out
  const [ops, setOps] = useState([])
  const [busy, setBusy] = useState(null)
  const [endOpen, setEndOpen] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [s, a, o] = await Promise.all([
      supabase.from('stages').select('*').eq('active', true).order('sort_order').order('id'),
      supabase.from('v_attendance').select('*').eq('user_id', profile.id).order('clock_in', { ascending: false }).limit(10),
      supabase.from('v_operations').select('*').eq('user_id', profile.id).or(`work_date.eq.${today},ended_at.is.null`).order('started_at'),
    ])
    const err = s.error || a.error || o.error
    if (err) toast(errText(err), 'bad')
    setStages(s.data || [])
    setAtt((a.data || []).find((r) => r.work_date === today) || null)
    setStale((a.data || []).filter((r) => r.work_date < today && !r.clock_out))
    setOps(o.data || [])
    setLoading(false)
  }, [profile.id, today, toast])

  useEffect(() => { load() }, [load])

  const openOp = ops.find((o) => !o.ended_at)
  const doneOps = ops.filter((o) => o.ended_at && o.work_date === today)

  const call = async (key, fn, okMsg) => {
    setBusy(key)
    const { error } = await fn()
    setBusy(null)
    if (error) return toast(errText(error), 'bad'), false
    toast(okMsg)
    await load()
    return true
  }

  /* ----- shift timing ----- */
  const shiftStart = tehranMs(today, att?.expected_in || profile.shift_start)
  const shiftEnd = tehranMs(today, att?.expected_out || profile.shift_end)
  const inLbl = inDiffLabel(att?.in_diff_seconds != null ? Number(att.in_diff_seconds) : null)
  const outLbl = outDiffLabel(att?.out_diff_seconds != null ? Number(att.out_diff_seconds) : null)

  /* ----- live summary ----- */
  const summary = useMemo(() => {
    let A = 0, S = 0, Q = 0
    for (const o of doneOps) { A += Number(o.actual_seconds); S += Number(o.standard_total_seconds); Q += Number(o.quantity) }
    const runA = openOp ? Math.max(0, (now - Date.parse(openOp.started_at)) / 1000) : 0
    const presence = att ? ((att.clock_out ? Date.parse(att.clock_out) : now) - Date.parse(att.clock_in)) / 1000 : 0
    return { A, S, Q, eff: efficiency(A, S), effective: effective(A + runA, presence), presence }
  }, [doneOps, openOp, att, now])

  const opElapsed = openOp ? Math.max(0, (now - Date.parse(openOp.started_at)) / 1000) : 0
  const opStd = openOp ? Number(openOp.std_per_unit) : 0
  const qtyNum = Number(qty)
  const previewEff = openOp && qty !== '' ? efficiency(opElapsed, qtyNum * opStd) : null

  if (loading) return <div className="page-center"><Spinner size={28} /></div>

  return (
    <div className="page">
      {/* ---------- HERO ---------- */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-top">
          <div>
            <div className="hero-hello">سلام، {profile.full_name.split(' ')[0]} 👋</div>
            <div className="hero-date">{jDateLong(today)}</div>
          </div>
          <div className="hero-shift">
            <Icon name="clock" size={14} />
            شیفت {shortTime(att?.expected_in || profile.shift_start)} تا {shortTime(att?.expected_out || profile.shift_end)}
          </div>
        </div>
        <div className="hero-clock" aria-live="off">{clock(now)}</div>

        {!att && (
          <>
            <div className={`hero-diff ${now > shiftStart ? 'is-bad' : 'is-good'}`}>
              {now > shiftStart
                ? <>از شروع شیفت <b>{humanDur((now - shiftStart) / 1000)}</b> گذشته</>
                : <><b>{humanDur((shiftStart - now) / 1000)}</b> تا شروع شیفت</>}
            </div>
            <button className="punch punch-in" disabled={busy === 'in'}
              onClick={() => call('in', () => supabase.rpc('clock_in'), 'ورود شما ثبت شد')}>
              {busy === 'in' ? <Spinner size={26} /> : <Icon name="login" size={30} />}
              <span>ثبت ورود</span>
            </button>
          </>
        )}

        {att && !att.clock_out && (
          <>
            <div className="hero-row">
              <div className="chip-glass">ورود <b>{clock(att.clock_in)}</b></div>
              <div className={`chip-glass tone-${inLbl.tone}`}>{inLbl.text}</div>
            </div>
            <div className="hero-stats">
              <div><span>زمان حضور</span><b className="mono">{hms(summary.presence)}</b></div>
              <div>
                <span>{now < shiftEnd ? 'تا پایان شیفت' : 'از پایان شیفت گذشته'}</span>
                <b className="mono">{hms(Math.abs(shiftEnd - now) / 1000)}</b>
              </div>
            </div>
            <button className="punch punch-out" onClick={() => setOutOpen(true)} disabled={!!openOp}
              title={openOp ? 'ابتدا عملیات را پایان دهید' : ''}>
              <Icon name="logout" size={26} />
              <span>{openOp ? 'اول عملیات را پایان دهید' : 'ثبت خروج'}</span>
            </button>
          </>
        )}

        {att?.clock_out && (
          <div className="hero-done">
            <div className="hero-row">
              <div className="chip-glass">ورود <b>{clock(att.clock_in)}</b></div>
              <div className={`chip-glass tone-${inLbl.tone}`}>{inLbl.text}</div>
            </div>
            <div className="hero-row">
              <div className="chip-glass">خروج <b>{clock(att.clock_out)}</b></div>
              <div className={`chip-glass tone-${outLbl.tone}`}>{outLbl.text}</div>
            </div>
            <div className="hero-note"><Icon name="check" size={16} /> روز کاری امروز بسته شد. خسته نباشید!</div>
          </div>
        )}
      </section>

      {stale.length > 0 && (
        <div className="banner banner-warn">
          <Icon name="alert" />
          <div>
            خروج روز {stale.map((s) => jDateLong(s.work_date)).join('، ')} ثبت نشده است.
            <small>برای اصلاح به مدیر اطلاع دهید.</small>
          </div>
        </div>
      )}

      {/* ---------- OPERATION ---------- */}
      {att && !att.clock_out && (
        <section className="section">
          <div className="section-head">
            <h2>{openOp ? 'عملیات در حال انجام' : 'شروع عملیات'}</h2>
          </div>

          {openOp ? (
            <div className="op-live" style={{ '--c': openOp.color }}>
              <div className="op-live-head">
                <span className="op-dot pulse" />
                <b>{openOp.stage_name}</b>
                <span className="muted">از {clock(openOp.started_at)}</span>
              </div>
              <div className="op-timer mono">{hms(opElapsed)}</div>
              <div className="op-meta">
                <div><span>استاندارد هر {openOp.unit}</span><b>{humanDur(opStd)}</b></div>
                <div><span>تعداد هدف تا الان</span><b>{num(Math.floor(opElapsed / opStd))} {openOp.unit}</b></div>
              </div>
              <Button variant="danger" icon="stop" className="btn-block btn-lg" onClick={() => { setQty(''); setNote(''); setEndOpen(true) }}>
                پایان عملیات و ثبت تعداد
              </Button>
            </div>
          ) : stages.length === 0 ? (
            <Empty icon="layers" title="مرحله‌ای تعریف نشده" text="مدیر باید ابتدا مراحل تولید را تعریف کند." />
          ) : (
            <div className="stage-grid">
              {stages.map((s) => (
                <button key={s.id} className="stage-tile" style={{ '--c': s.color }} disabled={busy === 's' + s.id}
                  onClick={() => call('s' + s.id, () => supabase.rpc('start_operation', { p_stage_id: s.id }), `عملیات «${s.name}» شروع شد`)}>
                  <span className="stage-tile-ic">{busy === 's' + s.id ? <Spinner /> : <Icon name="play" size={18} />}</span>
                  <b>{s.name}</b>
                  <small>استاندارد: {humanDur(Number(s.standard_seconds))} / {s.unit}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- TODAY SUMMARY ---------- */}
      {att && (
        <section className="section">
          <div className="section-head"><h2>کارنامهٔ امروز</h2></div>
          <div className="kpis">
            <Kpi icon="target" label="بهره‌وری" value={pct(summary.eff)} tone={effTone(summary.eff)} sub="عملیات‌های تمام‌شده" />
            <Kpi icon="bolt" label="کارکرد مؤثر" value={pct(summary.effective)} sub="زمان عملیات ÷ حضور" />
            <Kpi icon="box" label="تولید" value={num(summary.Q)} sub={`${fa(doneOps.length)} عملیات`} />
            <Kpi icon="clock" label="زمان عملیات" value={hms(summary.A)} sub={`استاندارد ${hms(summary.S)}`} />
          </div>

          {doneOps.length > 0 && (
            <div className="timeline">
              {[...doneOps].reverse().map((o) => {
                const e = efficiency(Number(o.actual_seconds), Number(o.standard_total_seconds))
                return (
                  <div key={o.id} className="tl-item" style={{ '--c': o.color }}>
                    <span className="tl-dot" />
                    <div className="tl-main">
                      <div className="tl-row">
                        <b>{o.stage_name}</b>
                        <span className={`badge badge-${effTone(e)}`}>{pct(e)}</span>
                      </div>
                      <div className="tl-sub">
                        {clock(o.started_at)} تا {clock(o.ended_at)} · {hms(Number(o.actual_seconds))} · {num(Number(o.quantity))} {o.unit}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------- END OPERATION SHEET ---------- */}
      <Sheet open={endOpen} onClose={() => setEndOpen(false)} title={`پایان «${openOp?.stage_name ?? ''}»`}
        footer={
          <Button className="btn-block btn-lg" icon="check" loading={busy === 'end'} disabled={qty === '' || Number.isNaN(qtyNum)}
            onClick={async () => {
              const ok = await call('end', () => supabase.rpc('end_operation', { p_quantity: qtyNum, p_note: note || null }), 'عملیات ثبت شد')
              if (ok) setEndOpen(false)
            }}>
            ثبت و پایان
          </Button>
        }>
        <div className="end-summary">
          <div><span>مدت عملیات</span><b className="mono">{hms(opElapsed)}</b></div>
          <div><span>استاندارد هر {openOp?.unit}</span><b>{humanDur(opStd)}</b></div>
        </div>
        <Field label={`تعداد تولید شده (${openOp?.unit ?? ''})`}>
          <NumInput value={qty} onChange={setQty} autoFocus placeholder="۰" />
        </Field>
        <Field label="توضیح (اختیاری)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: قطعی دستگاه" />
        </Field>
        {previewEff != null && (
          <div className={`eff-preview tone-${effTone(previewEff)}`}>
            <span>بهره‌وری این عملیات</span>
            <b>{pct(previewEff)}</b>
            <small>زمان استاندارد: {hms(qtyNum * opStd)}</small>
          </div>
        )}
      </Sheet>

      {/* ---------- CLOCK OUT CONFIRM ---------- */}
      <Sheet open={outOpen} onClose={() => setOutOpen(false)} title="ثبت خروج"
        footer={
          <div className="row-gap">
            <Button variant="ghost" onClick={() => setOutOpen(false)}>انصراف</Button>
            <Button variant="danger" icon="logout" loading={busy === 'out'} className="grow"
              onClick={async () => {
                const ok = await call('out', () => supabase.rpc('clock_out'), 'خروج شما ثبت شد')
                if (ok) setOutOpen(false)
              }}>
              بله، خروج ثبت شود
            </Button>
          </div>
        }>
        <p className="lead">ساعت الان <b className="mono">{clock(now)}</b> است.</p>
        <div className={`eff-preview tone-${now < shiftEnd ? 'bad' : 'good'}`}>
          <span>{now < shiftEnd ? 'خروج زودتر از پایان شیفت' : 'بعد از پایان شیفت'}</span>
          <b>{humanDur(Math.abs(shiftEnd - now) / 1000)}</b>
        </div>
        <p className="muted small">بعد از ثبت خروج، امروز دیگر نمی‌توانید عملیات جدید شروع کنید.</p>
      </Sheet>
    </div>
  )
}
