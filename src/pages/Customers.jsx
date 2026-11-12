import { lazy, Suspense, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useAccess, can } from '../lib/access'
import { fa, normalizeFa, toEn } from '../lib/fmt'
import { Icon, Button, Sheet, Field, Empty, Spinner, useToast, SearchBox } from '../components/ui'
import { useCustomers } from './SalesEntry'

const MapPicker = lazy(() => import('../components/MapPicker'))

/** Accepts "35.7, 51.4", Google Maps / Neshan / Balad links containing coordinates. */
export function parseLocation(text) {
  const s = toEn(String(text || '')).replace(/،/g, ',')
  const m = s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|latlng)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ||
    s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = +m[1], lng = +m[2]
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}
export const mapLinks = (lat, lng) => ({
  google: `https://www.google.com/maps?q=${lat},${lng}`,
  neshan: `https://neshan.org/maps/@${lat},${lng},16z`,
})

const empty = { code: '', first_name: '', last_name: '', phone: '', address: '', lat: null, lng: null, note: '', active: true }

export default function Customers({ onBack }) {
  const toast = useToast()
  const access = useAccess()
  const editable = can(access, 'customers')
  const [list, reload] = useCustomers()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loc, setLoc] = useState('')
  const isNew = edit && !edit.id

  const shown = useMemo(() => {
    const t = normalizeFa(toEn(q)).trim()
    return list.filter((c) => !t || normalizeFa(c.name).includes(t) || c.code.includes(t) || normalizeFa(c.address || '').includes(t) || (c.phone || '').includes(t))
  }, [list, q])

  const nextCode = () => {
    const nums = list.map((c) => parseInt(c.code, 10)).filter((n) => !Number.isNaN(n))
    return String((nums.length ? Math.max(...nums) : 1000) + 1)
  }
  const open = (c) => { setLoc(''); setEdit(c ? { ...c, phone: c.phone || '', address: c.address || '', note: c.note || '' } : { ...empty, code: nextCode() }) }

  const save = async () => {
    const row = {
      code: toEn(edit.code).trim(), first_name: normalizeFa(edit.first_name).trim(), last_name: normalizeFa(edit.last_name).trim(),
      phone: toEn(edit.phone).trim() || null, address: normalizeFa(edit.address).trim() || null, note: normalizeFa(edit.note).trim() || null,
      lat: edit.lat ?? null, lng: edit.lng ?? null, active: edit.active,
    }
    if (!row.code) return toast('کد مشتری را وارد کنید', 'bad')
    if (!row.first_name) return toast('نام مشتری را وارد کنید', 'bad')
    setBusy(true)
    const { error } = isNew ? await supabase.from('customers').insert(row) : await supabase.from('customers').update(row).eq('id', edit.id)
    setBusy(false)
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'این کد مشتری قبلاً ثبت شده است' : errText(error), 'bad')
    toast(isNew ? 'مشتری اضافه شد' : 'ذخیره شد'); setEdit(null); reload()
  }
  const remove = async () => {
    setBusy(true)
    const { error } = await supabase.from('customers').delete().eq('id', del.id)
    setBusy(false)
    if (error) return toast(/foreign key/i.test(error.message) ? 'برای این مشتری فروش ثبت شده؛ به‌جای حذف، غیرفعالش کنید' : errText(error), 'bad')
    toast('حذف شد'); setDel(null); reload()
  }
  const myLocation = () => {
    if (!navigator.geolocation) return toast('مرورگر موقعیت مکانی را پشتیبانی نمی‌کند', 'bad')
    navigator.geolocation.getCurrentPosition(
      (p) => setEdit((e) => ({ ...e, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) })),
      () => toast('دسترسی به موقعیت داده نشد', 'bad'), { enableHighAccuracy: true, timeout: 10000 })
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1>مشتریان</h1>
        <div className="row-gap">
          {onBack && <Button variant="ghost" icon="chev" onClick={onBack}>اطلاعات پایه</Button>}
          {editable && <Button icon="plus" onClick={() => open(null)}>افزودن مشتری</Button>}
        </div>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام، کد، تلفن یا آدرس…" />
      {shown.length === 0 ? <Empty icon="users" title={list.length ? 'مشتری‌ای پیدا نشد' : 'هنوز مشتری‌ای ثبت نشده'} /> : (
        <div className="list">
          {shown.map((c) => (
            <button key={c.id} className={`list-item as-btn ${c.active ? '' : 'is-off'}`} onClick={() => open(c)}>
              <div className="code-badge">{fa(c.code)}</div>
              <div className="grow">
                <b>{c.name} {!c.active && <span className="badge badge-soft">غیرفعال</span>}</b>
                <small className="muted">{c.address || 'بدون آدرس'}{c.phone && <> · <span dir="ltr">{fa(c.phone)}</span></>}</small>
              </div>
              {c.lat != null && <Icon name="pin" size={18} className="tone-good" />}
              <Icon name="edit" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'مشتری جدید' : `مشتری ${edit?.code ? fa(edit.code) : ''}`}
        footer={editable && <div className="row-gap">
          {!isNew && <Button variant="ghost-danger" icon="trash" onClick={() => { setDel(edit); setEdit(null) }}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>{isNew ? 'افزودن' : 'ذخیره'}</Button></div>}>
        {edit && (
          <fieldset className="form plain" disabled={!editable}>
            <div className="grid2">
              <Field label="کد مشتری"><input className="input" dir="ltr" inputMode="numeric" value={fa(edit.code)} onChange={(e) => setEdit({ ...edit, code: toEn(e.target.value) })} /></Field>
              <Field label="تلفن (اختیاری)"><input className="input" dir="ltr" inputMode="tel" value={fa(edit.phone)} onChange={(e) => setEdit({ ...edit, phone: toEn(e.target.value) })} /></Field>
            </div>
            <div className="grid2">
              <Field label="نام"><input className="input" value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} autoFocus={isNew} /></Field>
              <Field label="نام خانوادگی"><input className="input" value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} /></Field>
            </div>
            <Field label="آدرس"><textarea className="input textarea" rows={2} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>

            <Field label="لوکیشن" hint="روی نقشه بزنید، یا «موقعیت من» را بزنید، یا لینک گوگل‌مپ/نشان را بچسبانید.">
              <Suspense fallback={<div className="map-box center muted">در حال بارگذاری نقشه…</div>}>
                <MapPicker value={edit.lat != null ? { lat: edit.lat, lng: edit.lng } : null} onChange={(p) => setEdit((e) => ({ ...e, ...p }))} />
              </Suspense>
              <div className="loc-row">
                <input className="input" dir="ltr" placeholder="لینک یا مختصات، مثلاً 35.7, 51.4" value={loc}
                  onChange={(e) => { setLoc(e.target.value); const p = parseLocation(e.target.value); if (p) setEdit((x) => ({ ...x, ...p })) }} />
                <Button type="button" variant="ghost" icon="pin" onClick={myLocation}>موقعیت من</Button>
              </div>
              {edit.lat != null ? (
                <div className="loc-info">
                  <span dir="ltr" className="mono">{fa(edit.lat)}, {fa(edit.lng)}</span>
                  <a href={mapLinks(edit.lat, edit.lng).neshan} target="_blank" rel="noreferrer">نشان</a>
                  <a href={mapLinks(edit.lat, edit.lng).google} target="_blank" rel="noreferrer">گوگل‌مپ</a>
                  {editable && <button type="button" className="link-btn" onClick={() => setEdit({ ...edit, lat: null, lng: null })}>حذف لوکیشن</button>}
                </div>
              ) : <small className="muted">لوکیشن ثبت نشده</small>}
            </Field>
            <Field label="توضیح (اختیاری)"><input className="input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
            {!isNew && <Field label="وضعیت"><select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">فعال</option><option value="0">غیرفعال (در فهرست فروش نمی‌آید)</option></select></Field>}
          </fieldset>
        )}
      </Sheet>

      <Sheet open={!!del} onClose={() => setDel(null)} title="حذف مشتری"
        footer={<div className="row-gap"><Button variant="ghost" onClick={() => setDel(null)}>انصراف</Button><Button variant="danger" className="grow" icon="trash" loading={busy} onClick={remove}>حذف</Button></div>}>
        <p>مشتری «{del?.first_name} {del?.last_name}» حذف شود؟ اگر برایش فروش ثبت شده باشد حذف نمی‌شود و باید غیرفعالش کنید.</p>
      </Sheet>
      {!list && <Spinner />}
    </div>
  )
}
