import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText, adminUsers, normPw, normUser } from '../lib/supabase'
import { fa, shortTime, toEn, normalizeFa } from '../lib/fmt'
import { Icon, Button, Sheet, Field, NumInput, Empty, useToast, SearchBox } from '../components/ui'

export const ROLE = { manager: 'مدیر', admin: 'ادمین', supervisor: 'سرپرست' }

/* =====================================================================
   WORKERS (no login) — any staff can add/edit; only the manager deletes
   ===================================================================== */
const emptyWorker = { full_name: '', personnel_code: '', shift_start: '08:00', shift_end: '16:00', active: true }

export function Workers({ workers, reload, canDelete, me }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const isNew = edit && !edit.id

  const save = async () => {
    const row = {
      full_name: normalizeFa(edit.full_name).trim(),
      personnel_code: toEn(edit.personnel_code || '').trim() || null,
      shift_start: edit.shift_start, shift_end: edit.shift_end, active: edit.active,
    }
    if (!row.full_name) return toast('نام را وارد کنید', 'bad')
    setBusy(true)
    const { error } = isNew ? await supabase.from('workers').insert({ ...row, created_by: me.id }) : await supabase.from('workers').update(row).eq('id', edit.id)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast(isNew ? `«${row.full_name}» اضافه شد` : 'ذخیره شد'); setEdit(null); reload()
  }
  const remove = async () => {
    setBusy(true)
    const { error } = await supabase.from('workers').delete().eq('id', del.id)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('حذف شد'); setDel(null); reload()
  }

  const list = useMemo(() => {
    const t = normalizeFa(q).trim()
    return [...workers].filter((w) => !t || normalizeFa(w.full_name).includes(t) || (w.personnel_code || '').includes(toEn(t)))
      .sort((a, b) => (a.active === b.active ? a.full_name.localeCompare(b.full_name, 'fa') : a.active ? -1 : 1))
  }, [workers, q])

  return (
    <div className="page">
      <div className="page-title">
        <h1>نیروها</h1>
        <Button icon="plus" onClick={() => setEdit({ ...emptyWorker })}>نیروی جدید</Button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام یا کد پرسنلی…" />
      {list.length === 0 ? <Empty icon="users" title={workers.length ? 'پیدا نشد' : 'هنوز نیرویی نیست'} /> : (
        <div className="list">
          {list.map((w) => (
            <button key={w.id} className={`list-item as-btn ${w.active ? '' : 'is-off'}`}
              onClick={() => setEdit({ ...w, personnel_code: w.personnel_code || '', shift_start: w.shift_start.slice(0, 5), shift_end: w.shift_end.slice(0, 5) })}>
              <div className="avatar">{w.full_name.trim()[0]}</div>
              <div className="grow">
                <b>{w.full_name} {!w.active && <span className="badge badge-soft">غیرفعال</span>}</b>
                <small className="muted">{w.personnel_code && <>کد {fa(w.personnel_code)} · </>}شیفت {shortTime(w.shift_start)}–{shortTime(w.shift_end)}</small>
              </div>
              <Icon name="edit" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'نیروی جدید' : 'ویرایش نیرو'}
        footer={<div className="row-gap">
          {!isNew && canDelete && <Button variant="ghost-danger" icon="trash" onClick={() => { setDel(edit); setEdit(null) }}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>{isNew ? 'افزودن' : 'ذخیره'}</Button>
        </div>}>
        {edit && (
          <div className="form">
            <Field label="نام"><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} placeholder="مثلاً نظیری" autoFocus={isNew} /></Field>
            <Field label="کد پرسنلی (اختیاری)"><NumInput value={edit.personnel_code} onChange={(v) => setEdit({ ...edit, personnel_code: v })} /></Field>
            <div className="grid2">
              <Field label="ساعت ورود مقرر"><input type="time" className="input" dir="ltr" value={edit.shift_start} onChange={(e) => setEdit({ ...edit, shift_start: e.target.value })} /></Field>
              <Field label="ساعت خروج مقرر"><input type="time" className="input" dir="ltr" value={edit.shift_end} onChange={(e) => setEdit({ ...edit, shift_end: e.target.value })} /></Field>
            </div>
            {!isNew && (
              <Field label="وضعیت" hint="نیروی غیرفعال در فهرست ثبت روزانه نمی‌آید؛ سوابقش می‌ماند.">
                <select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">فعال</option><option value="0">غیرفعال</option>
                </select>
              </Field>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!del} onClose={() => setDel(null)} title="حذف نیرو"
        footer={<div className="row-gap">
          <Button variant="ghost" onClick={() => setDel(null)}>انصراف</Button>
          <Button variant="danger" className="grow" icon="trash" loading={busy} onClick={remove}>حذف همیشگی</Button>
        </div>}>
        <div className="banner banner-bad"><Icon name="alert" />
          <div>با حذف «{del?.full_name}» <b>همهٔ سوابق حضور و عملیات او هم پاک می‌شود</b>.<small>اگر دیگر کار نمی‌کند، به‌جای حذف «غیرفعال» کنید.</small></div>
        </div>
      </Sheet>
    </div>
  )
}

/* =====================================================================
   ACCOUNTS (manager only)
   ===================================================================== */
export function Users({ me }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [edit, setEdit] = useState(null)
  const [pw, setPw] = useState(null)
  const [newPw, setNewPw] = useState('')
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const isNew = edit && !edit.id

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*')
    if (error) toast(errText(error), 'bad')
    const order = { manager: 0, admin: 1, supervisor: 2 }
    setList((data || []).sort((a, b) => order[a.role] - order[b.role]))
  }, [toast])
  useEffect(() => { load() }, [load])

  const run = async (fn, ok, after) => {
    setBusy(true)
    try { await fn(); toast(ok); after?.(); load() } catch (e) { toast(errText(e), 'bad') } finally { setBusy(false) }
  }
  const save = () => {
    const full_name = normalizeFa(edit.full_name).trim()
    if (!full_name) return toast('نام را وارد کنید', 'bad')
    if (isNew) return run(() => adminUsers({ action: 'create', full_name, username: normUser(edit.username), password: normPw(edit.password), role: edit.role }), 'حساب ساخته شد', () => setEdit(null))
    return run(() => adminUsers({ action: 'update', id: edit.id, full_name, username: normUser(edit.username), role: edit.role, active: edit.active }), 'ذخیره شد', () => setEdit(null))
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1>حساب‌های کاربری</h1>
        <Button variant="ghost" icon="plus" onClick={() => setEdit({ full_name: '', username: '', password: '', role: 'supervisor', active: true })}>حساب جدید</Button>
      </div>
      <div className="card role-help">
        <div><b>مدیر</b><span>دسترسی کامل: گزارش‌ها، ثبت، محصولات و عملیات، زمان استاندارد، حساب‌ها</span></div>
        <div><b>ادمین</b><span>ثبت روزانه + تعریف و ویرایش محصولات، عملیات و زمان استاندارد. گزارش نمی‌بیند.</span></div>
        <div><b>سرپرست</b><span>ثبت ورود و خروج، عملیات و تولید نیروها؛ تعریف نیرو. زمان استاندارد و گزارش نمی‌بیند.</span></div>
        <small className="muted">نام کاربری به حروف بزرگ و کوچک حساس نیست؛ رمز عبور حساس است.</small>
      </div>
      <div className="list">
        {list.map((u) => (
          <div key={u.id} className={`list-item ${u.active ? '' : 'is-off'}`}>
            <div className="avatar">{u.full_name.trim()[0]}</div>
            <div className="grow">
              <b>{u.full_name} <span className={`badge ${u.role === 'manager' ? 'badge-brand' : 'badge-soft'}`}>{ROLE[u.role]}</span>{u.id === me.id && <span className="badge badge-good">شما</span>} {!u.active && <span className="badge badge-bad">غیرفعال</span>}</b>
              <small className="muted" dir="ltr">{u.username}</small>
            </div>
            <button className="icon-btn" aria-label="تغییر رمز" title="تغییر رمز" onClick={() => { setNewPw(''); setPw(u) }}><Icon name="key" size={18} /></button>
            <button className="icon-btn" aria-label="ویرایش" title="ویرایش" onClick={() => setEdit({ ...u })}><Icon name="edit" size={18} /></button>
          </div>
        ))}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'حساب جدید' : 'ویرایش حساب'}
        footer={<div className="row-gap">
          {!isNew && edit?.id !== me.id && <Button variant="ghost-danger" icon="trash" onClick={() => { setDel(edit); setEdit(null) }}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>{isNew ? 'ساخت' : 'ذخیره'}</Button>
        </div>}>
        {edit && (
          <div className="form">
            <Field label="نام نمایشی"><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label="نام کاربری" hint="حروف انگلیسی، عدد، _ . -">
              <input className="input" dir="ltr" autoCapitalize="none" autoComplete="off" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} />
            </Field>
            {isNew && <Field label="رمز عبور" hint="حداقل ۶ کاراکتر؛ به حروف بزرگ و کوچک حساس است">
              <input className="input" dir="ltr" autoCapitalize="none" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>}
            {edit.id !== me.id && (
              <div className="grid2">
                <Field label="نقش"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  <option value="supervisor">سرپرست</option><option value="admin">ادمین</option><option value="manager">مدیر</option></select></Field>
                {!isNew && <Field label="وضعیت"><select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">فعال</option><option value="0">غیرفعال</option></select></Field>}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!pw} onClose={() => setPw(null)} title={`رمز جدید برای ${pw?.full_name ?? ''}`}
        footer={<Button className="btn-block" icon="key" loading={busy} onClick={() => run(() => adminUsers({ action: 'set_password', id: pw.id, password: normPw(newPw) }), 'رمز تغییر کرد', () => setPw(null))}>ثبت رمز جدید</Button>}>
        <Field label="رمز عبور جدید" hint="حداقل ۶ کاراکتر؛ به حروف بزرگ و کوچک حساس است">
          <input className="input" dir="ltr" autoCapitalize="none" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
        </Field>
      </Sheet>

      <Sheet open={!!del} onClose={() => setDel(null)} title="حذف حساب"
        footer={<div className="row-gap"><Button variant="ghost" onClick={() => setDel(null)}>انصراف</Button>
          <Button variant="danger" className="grow" icon="trash" loading={busy} onClick={() => run(() => adminUsers({ action: 'delete', id: del.id }), 'حذف شد', () => setDel(null))}>حذف حساب</Button></div>}>
        <p>حساب «{del?.full_name}» حذف می‌شود. اطلاعاتی که ثبت کرده باقی می‌ماند.</p>
      </Sheet>
    </div>
  )
}
