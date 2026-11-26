import { useCallback, useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { fa, num, jDate, jParts } from '../lib/fmt'
import { saveBlob } from '../lib/download'
import { Icon, Button, Empty, Spinner, useToast } from '../components/ui'

/* Backups: one automatic full backup every night (03:00 Tehran; the previous automatic one is
   deleted), plus manual backups on demand (the last 10 are kept). Each can be downloaded. */

const TABLES = [
  ['workers', 'همکاران'], ['customers', 'مشتریان'], ['product_types', 'گروه‌های محصول'], ['products', 'محصولات'], ['stages', 'عملیات‌ها'],
  ['standards', 'زمان‌های استاندارد'], ['attendance', 'حضور'], ['jobs', 'عملیات ثبت‌شده'], ['sales', 'فروش'], ['profiles', 'حساب‌ها'], ['roles', 'نقش‌ها'], ['app_settings', 'تنظیمات'],
]
const tehranTime = (ts) => new Date(ts).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false })
const tehranDay = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })
const stamp = (ts) => { const { jy, jm, jd } = jParts(tehranDay(ts)); return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}` }
const size = (b) => (b > 1048576 ? `${fa((b / 1048576).toFixed(1))} مگابایت` : `${fa(Math.max(1, Math.round(b / 1024)))} کیلوبایت`)

export default function Backup() {
  const toast = useToast()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_backups')
    if (error) toast(errText(error), 'bad')
    setList(data || [])
  }, [toast])
  useEffect(() => { load() }, [load])

  const download = async (b, kind) => {
    setBusy(`${b.id}-${kind}`)
    try {
      const { data, error } = await supabase.rpc('get_backup', { p_id: b.id })
      if (error) throw error
      const base = `پشتیبان رویای بیتا ${stamp(b.created_at)}`
      if (kind === 'json') {
        await saveBlob(new Blob([JSON.stringify({ app: 'royaye-bita', created_at: b.created_at, kind: b.kind, data }, null, 1)], { type: 'application/json' }), `${base}.json`)
      } else {
        const XLSX = await import('xlsx')
        const book = XLSX.utils.book_new()
        for (const [k, label] of TABLES) {
          const rows = (data[k] || []).map((r) => Object.fromEntries(Object.entries(r).map(([c, v]) => [c, v && typeof v === 'object' ? JSON.stringify(v) : v])))
          XLSX.utils.book_append_sheet(book, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['خالی']]), label)
        }
        book.Workbook = { Views: [{ RTL: true }] }
        const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true })
        await saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`)
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast(errText(e), 'bad')
    } finally { setBusy(null) }
  }

  const backupNow = async () => {
    setBusy('new')
    const { data: id, error } = await supabase.rpc('create_backup')
    if (error) { setBusy(null); return toast(errText(error), 'bad') }
    toast('نسخهٔ پشتیبان ساخته شد')
    const { data } = await supabase.rpc('list_backups')
    setList(data || [])
    setBusy(null)
    const b = (data || []).find((x) => x.id === id)
    if (b) download(b, 'xlsx')
  }

  return (
    <div className="page">
      <div className="page-title"><h1>پشتیبان‌گیری</h1></div>
      <div className="banner"><Icon name="check" /><div>هر شب ساعت ۳ بامداد یک نسخهٔ پشتیبان کامل از همهٔ اطلاعات خودکار گرفته می‌شود و نسخهٔ خودکار قبلی پاک می‌شود. با «پشتیبان‌گیری الان» هم هر وقت خواستید یک نسخه می‌سازید و دانلود می‌کنید (۱۰ نسخهٔ دستی آخر نگه داشته می‌شود).</div></div>
      <Button className="btn-block btn-lg" icon="download" loading={busy === 'new'} onClick={backupNow}>پشتیبان‌گیری الان</Button>
      <section className="card">
        <div className="card-head"><h2>نسخه‌های پشتیبان</h2></div>
        {!list ? <Spinner /> : list.length === 0 ? <Empty icon="box" title="هنوز نسخه‌ای نیست" /> : (
          <div className="backup-list">
            {list.map((b) => (
              <div key={b.id} className="backup-item">
                <div className="grow">
                  <b>{jDate(tehranDay(b.created_at))} · ساعت {tehranTime(b.created_at)}</b>
                  <span className={`badge ${b.kind === 'auto' ? 'badge-good' : 'badge-brand'}`}>{b.kind === 'auto' ? 'خودکار روزانه' : `دستی${b.by ? ` — ${b.by}` : ''}`}</span>
                  <small className="muted">{size(b.size_bytes)} · {num(b.counts?.workers ?? 0)} همکار · {num(b.counts?.jobs ?? 0)} عملیات · {num(b.counts?.attendance ?? 0)} حضور · {num(b.counts?.sales ?? 0)} فروش · {num(b.counts?.customers ?? 0)} مشتری</small>
                </div>
                <div className="row-gap">
                  <Button variant="ghost" icon="download" loading={busy === `${b.id}-xlsx`} onClick={() => download(b, 'xlsx')}>اکسل</Button>
                  <Button variant="ghost" icon="download" loading={busy === `${b.id}-json`} onClick={() => download(b, 'json')}>فایل کامل</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">«اکسل» برای دیدن اطلاعات است (هر جدول در یک برگه). «فایل کامل» برای بازگرداندن اطلاعات در صورت نیاز است؛ آن را جای امنی نگه دارید.</p>
      </section>
    </div>
  )
}
