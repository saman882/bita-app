import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { fa, jDate, tehranIso, monthStart } from '../lib/fmt'
import { Icon, Button, Sheet, Field, JDateInput, useToast, Spinner } from '../components/ui'

/** Manager: delete recorded data (attendance, production, sales) for a date range or everything. */
export default function Purge() {
  const toast = useToast()
  const [all, setAll] = useState(false)
  const [from, setFrom] = useState(monthStart(tehranIso()))
  const [to, setTo] = useState(tehranIso())
  const [kinds, setKinds] = useState({ attendance: true, jobs: true, sales: true })
  const [counts, setCounts] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const pf = all ? null : from, pt = all ? null : to

  useEffect(() => {
    let alive = true
    setCounts(null)
    supabase.rpc('purge_counts', { p_from: pf, p_to: pt }).then(({ data }) => alive && setCounts(data || { attendance: 0, jobs: 0, sales: 0 }))
    return () => { alive = false }
  }, [pf, pt])

  const total = counts ? (kinds.attendance ? counts.attendance : 0) + (kinds.jobs ? counts.jobs : 0) + (kinds.sales ? counts.sales : 0) : 0
  const run = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('purge_data', { p_from: pf, p_to: pt, p_attendance: kinds.attendance, p_jobs: kinds.jobs, p_sales: kinds.sales })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast(`پاک شد: ${fa(data.attendance)} حضور، ${fa(data.jobs)} تولید، ${fa(data.sales)} فروش`)
    setConfirm(false); setTyped('')
    setCounts(null)
    supabase.rpc('purge_counts', { p_from: pf, p_to: pt }).then(({ data: c }) => setCounts(c))
  }
  const K = [['attendance', 'ساعت ورود و خروج و استراحت‌ها'], ['jobs', 'تولیدات (عملیات ثبت‌شده)'], ['sales', 'فروش‌ها']]

  return (
    <div className="page">
      <div className="page-title"><h1>پاک‌سازی داده‌ها</h1></div>
      <div className="banner banner-warn"><Icon name="alert" /><div>اطلاعات پایه (کارکنان، محصولات، عملیات‌ها، زمان‌های استاندارد، مشتریان و حساب‌ها) پاک نمی‌شود؛ فقط داده‌های ثبت‌شدهٔ روزانه.<small>پاک‌سازی برگشت‌پذیر نیست. اگر لازم دارید، قبلش از گزارش‌ها خروجی اکسل بگیرید.</small></div></div>

      <section className="card">
        <div className="card-head"><h2>بازهٔ زمانی</h2></div>
        <div className="seg">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>بازهٔ مشخص</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>همهٔ داده‌ها</button>
        </div>
        {!all && (
          <div className="range">
            <div><span className="muted small">از</span><JDateInput value={from} onChange={(v) => { setFrom(v); if (v > to) setTo(v) }} label="از تاریخ" /></div>
            <div><span className="muted small">تا</span><JDateInput value={to} onChange={(v) => { setTo(v); if (v < from) setFrom(v) }} label="تا تاریخ" /></div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>چه چیزهایی پاک شود؟</h2></div>
        <div className="perm-table">
          {K.map(([k, l]) => (
            <label key={k} className={`perm-row ${kinds[k] ? 'on' : ''}`}>
              <span>{l} {counts ? <b>({fa(counts[k])} رکورد)</b> : <Spinner size={12} />}</span>
              <input type="checkbox" className="switch" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
            </label>
          ))}
        </div>
        <Button variant="danger" icon="trash" disabled={!counts || total === 0} onClick={() => setConfirm(true)}>
          پاک کردن {fa(total)} رکورد {all ? '(همهٔ تاریخ‌ها)' : `از ${jDate(from)} تا ${jDate(to)}`}
        </Button>
      </section>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="تأیید پاک‌سازی"
        footer={<div className="row-gap"><Button variant="ghost" onClick={() => setConfirm(false)}>انصراف</Button>
          <Button variant="danger" className="grow" icon="trash" loading={busy} disabled={typed.trim() !== 'پاک کن'} onClick={run}>پاک کن</Button></div>}>
        <p><b>{fa(total)} رکورد</b> {all ? 'از همهٔ تاریخ‌ها' : `از ${jDate(from)} تا ${jDate(to)}`} برای همیشه پاک می‌شود.</p>
        <Field label="برای تأیید بنویسید: پاک کن"><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>
      </Sheet>
    </div>
  )
}
