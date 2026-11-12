import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText, adminUsers, normPw, normUser } from '../lib/supabase'
import { PERMS, useAccess, can } from '../lib/access'
import { fa, toEn, normalizeFa } from '../lib/fmt'
import { Icon, Button, Sheet, Field, NumInput, Empty, useToast, SearchBox } from '../components/ui'

/* =====================================================================
   کارکنان (no login) — add/edit with `staff`, delete with `staff_delete`
   ===================================================================== */
const emptyWorker = { full_name: '', personnel_code: '', active: true }

export function Workers({ workers, reload, me, onBack }) {
  const toast = useToast()
  const access = useAccess()
  const canEdit = can(access, 'staff'), canDelete = can(access, 'staff_delete')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const isNew = edit && !edit.id

  const save = async () => {
    const row = { full_name: normalizeFa(edit.full_name).trim(), personnel_code: toEn(edit.personnel_code || '').trim() || null, active: edit.active }
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
        <h1>کارکنان</h1>
        <div className="row-gap">
          {onBack && <Button variant="ghost" icon="chev" onClick={onBack}>اطلاعات پایه</Button>}
          {canEdit && <Button icon="plus" onClick={() => setEdit({ ...emptyWorker })}>همکار جدید</Button>}
        </div>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام یا کد پرسنلی…" />
      {list.length === 0 ? <Empty icon="users" title={workers.length ? 'پیدا نشد' : 'هنوز همکاری ثبت نشده'} /> : (
        <div className="list">
          {list.map((w) => (
            <button key={w.id} className={`list-item as-btn ${w.active ? '' : 'is-off'}`} disabled={!canEdit}
              onClick={() => setEdit({ ...w, personnel_code: w.personnel_code || '' })}>
              <div className="avatar">{w.full_name.trim()[0]}</div>
              <div className="grow">
                <b>{w.full_name} {!w.active && <span className="badge badge-soft">غیرفعال</span>}</b>
                <small className="muted">{w.personnel_code ? <>کد پرسنلی {fa(w.personnel_code)}</> : 'بدون کد پرسنلی'}</small>
              </div>
              {canEdit && <Icon name="edit" size={18} className="muted" />}
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'همکار جدید' : 'ویرایش همکار'}
        footer={<div className="row-gap">
          {!isNew && canDelete && <Button variant="ghost-danger" icon="trash" onClick={() => { setDel(edit); setEdit(null) }}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>{isNew ? 'افزودن' : 'ذخیره'}</Button>
        </div>}>
        {edit && (
          <div className="form">
            <Field label="نام همکار"><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} placeholder="مثلاً نظیری" autoFocus={isNew} /></Field>
            <Field label="کد پرسنلی (اختیاری)"><NumInput value={edit.personnel_code} onChange={(v) => setEdit({ ...edit, personnel_code: v })} /></Field>
            <p className="muted small">ساعت ورود و خروج پیش‌فرض برای همهٔ کارکنان یکسان است و در «ثبت روزانه» قابل تغییر است.</p>
            {!isNew && (
              <Field label="وضعیت" hint="همکار غیرفعال در ثبت روزانه نمی‌آید؛ سوابقش می‌ماند.">
                <select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">فعال</option><option value="0">غیرفعال</option>
                </select>
              </Field>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!del} onClose={() => setDel(null)} title="حذف همکار"
        footer={<div className="row-gap"><Button variant="ghost" onClick={() => setDel(null)}>انصراف</Button>
          <Button variant="danger" className="grow" icon="trash" loading={busy} onClick={remove}>حذف همیشگی</Button></div>}>
        <div className="banner banner-bad"><Icon name="alert" />
          <div>با حذف «{del?.full_name}» <b>همهٔ سوابق حضور و تولید او هم پاک می‌شود</b>.<small>اگر دیگر کار نمی‌کند، به‌جای حذف «غیرفعال» کنید.</small></div>
        </div>
      </Sheet>
    </div>
  )
}

/* =====================================================================
   حساب‌های کاربری و نقش‌ها
   ===================================================================== */
function PermTable({ value, onChange, disabled }) {
  const groups = [...new Set(PERMS.map((p) => p.group))]
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])
  return (
    <div className="perm-table">
      {groups.map((g) => (
        <div key={g} className="perm-group">
          <div className="perm-group-head">{g}</div>
          {PERMS.filter((p) => p.group === g).map((p) => (
            <label key={p.key} className={`perm-row ${value.includes(p.key) ? 'on' : ''}`}>
              <span>{p.label}</span>
              <input type="checkbox" className="switch" checked={disabled || value.includes(p.key)} disabled={disabled} onChange={() => toggle(p.key)} />
            </label>
          ))}
        </div>
      ))}
      {!disabled && (
        <div className="perm-quick">
          <button type="button" className="link-btn" onClick={() => onChange(PERMS.map((p) => p.key))}>انتخاب همه</button>
          <button type="button" className="link-btn" onClick={() => onChange([])}>هیچ‌کدام</button>
        </div>
      )}
    </div>
  )
}

export function Users({ me, onMeChanged }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [roles, setRoles] = useState([])
  const [edit, setEdit] = useState(null)
  const [pw, setPw] = useState(null)
  const [newPw, setNewPw] = useState('')
  const [del, setDel] = useState(null)
  const [roleEdit, setRoleEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const isNew = edit && !edit.id

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([supabase.from('profiles').select('*'), supabase.from('roles').select('*').order('sort_order').order('id')])
    if (p.error || r.error) toast(errText(p.error || r.error), 'bad')
    setRoles(r.data || [])
    const order = Object.fromEntries((r.data || []).map((x, i) => [x.id, i]))
    setList((p.data || []).sort((a, b) => order[a.role_id] - order[b.role_id]))
  }, [toast])
  useEffect(() => { load() }, [load])
  const roleOf = (id) => roles.find((r) => r.id === id)

  const run = async (fn, ok, after) => {
    setBusy(true)
    try { await fn(); toast(ok); after?.(); load(); if (edit?.id === me.id) onMeChanged?.() } catch (e) { toast(errText(e), 'bad') } finally { setBusy(false) }
  }
  const pickRole = (id) => {
    const r = roleOf(Number(id))
    setEdit((e) => ({ ...e, role_id: Number(id), perms: r?.perms || [] }))
  }
  const save = () => {
    const full_name = normalizeFa(edit.full_name).trim()
    if (!full_name) return toast('نام را وارد کنید', 'bad')
    if (!edit.role_id) return toast('نقش را انتخاب کنید', 'bad')
    const body = { full_name, username: normUser(edit.username), role_id: edit.role_id, perms: edit.perms }
    if (isNew) return run(() => adminUsers({ action: 'create', ...body, password: normPw(edit.password) }), 'حساب ساخته شد', () => setEdit(null))
    return run(() => adminUsers({ action: 'update', id: edit.id, ...body, active: edit.active }), 'ذخیره شد', () => setEdit(null))
  }

  const saveRole = async () => {
    const name = normalizeFa(roleEdit.name).trim()
    if (!name) return toast('نام نقش را وارد کنید', 'bad')
    setBusy(true)
    const row = { name, perms: roleEdit.perms, sort_order: roleEdit.sort_order ?? roles.length + 1 }
    const { error } = roleEdit.id ? await supabase.from('roles').update(row).eq('id', roleEdit.id) : await supabase.from('roles').insert(row)
    setBusy(false)
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'نقشی با این نام وجود دارد' : errText(error), 'bad')
    toast('نقش ذخیره شد'); setRoleEdit(null); load()
  }
  const deleteRole = async () => {
    if (list.some((u) => u.role_id === roleEdit.id)) return toast('این نقش به حسابی داده شده؛ اول نقش آن حساب‌ها را عوض کنید', 'bad')
    setBusy(true)
    const { error } = await supabase.from('roles').delete().eq('id', roleEdit.id)
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('نقش حذف شد'); setRoleEdit(null); load()
  }

  const permCount = (u) => (roleOf(u.role_id)?.is_manager ? 'همهٔ دسترسی‌ها' : `${fa((u.perms || []).length)} دسترسی`)

  return (
    <div className="page">
      <div className="page-title">
        <h1>حساب‌های کاربری</h1>
        <Button icon="plus" onClick={() => { const r = roles.find((x) => !x.is_manager); setEdit({ full_name: '', username: '', password: '', role_id: r?.id, perms: r?.perms || [], active: true }) }}>حساب جدید</Button>
      </div>
      <p className="muted small intro">نام کاربری به حروف بزرگ و کوچک حساس نیست؛ رمز عبور حساس است.</p>
      <div className="list">
        {list.map((u) => (
          <div key={u.id} className={`list-item ${u.active ? '' : 'is-off'}`}>
            <div className="avatar">{u.full_name.trim()[0]}</div>
            <div className="grow">
              <b>{u.full_name} <span className={`badge ${roleOf(u.role_id)?.is_manager ? 'badge-brand' : 'badge-soft'}`}>{roleOf(u.role_id)?.name}</span>{u.id === me.id && <span className="badge badge-good">شما</span>} {!u.active && <span className="badge badge-bad">غیرفعال</span>}</b>
              <small className="muted"><span dir="ltr">{u.username}</span> · {permCount(u)}</small>
            </div>
            <button className="icon-btn" aria-label="تغییر رمز" title="تغییر رمز" onClick={() => { setNewPw(''); setPw(u) }}><Icon name="key" size={18} /></button>
            <button className="icon-btn" aria-label="ویرایش" title="ویرایش" onClick={() => setEdit({ ...u, perms: u.perms || [] })}><Icon name="edit" size={18} /></button>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head"><h2>نقش‌ها</h2><Button variant="ghost" icon="plus" onClick={() => setRoleEdit({ name: '', perms: [] })}>نقش جدید</Button></div>
        <p className="muted small">نقش یک الگوی آماده از دسترسی‌هاست (مثلاً منشی، انباردار). هنگام ساخت حساب با انتخاب نقش، دسترسی‌هایش خودکار تیک می‌خورد و می‌توانید برای آن شخص کم و زیادشان کنید.</p>
        <div className="list">
          {roles.map((r) => (
            <button key={r.id} className="list-item as-btn" disabled={r.is_manager} onClick={() => setRoleEdit({ ...r })}>
              <span className="stage-swatch" style={{ background: r.is_manager ? 'var(--brand)' : 'var(--brand-2)' }}><Icon name="key" size={18} /></span>
              <div className="grow"><b>{r.name}</b><small className="muted">{r.is_manager ? 'دسترسی کامل — قابل تغییر نیست' : `${fa(r.perms.length)} دسترسی`} · {fa(list.filter((u) => u.role_id === r.id).length)} حساب</small></div>
              {!r.is_manager && <Icon name="edit" size={18} className="muted" />}
            </button>
          ))}
        </div>
      </section>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'حساب جدید' : `ویرایش حساب ${edit?.full_name ?? ''}`}
        footer={<div className="row-gap">
          {!isNew && edit?.id !== me.id && <Button variant="ghost-danger" icon="trash" onClick={() => { setDel(edit); setEdit(null) }}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>{isNew ? 'ساخت حساب' : 'ذخیره'}</Button>
        </div>}>
        {edit && (
          <div className="form">
            <div className="grid2">
              <Field label="نام نمایشی"><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
              <Field label="نام کاربری"><input className="input" dir="ltr" autoCapitalize="none" autoComplete="off" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            </div>
            {isNew && <Field label="رمز عبور" hint="حداقل ۶ کاراکتر؛ به حروف بزرگ و کوچک حساس است">
              <input className="input" dir="ltr" autoCapitalize="none" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>}
            <div className="grid2">
              <Field label="نقش">
                <select className="input" value={edit.role_id || ''} onChange={(e) => pickRole(e.target.value)} disabled={edit.id === me.id}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              {!isNew && edit.id !== me.id && <Field label="وضعیت"><select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                <option value="1">فعال</option><option value="0">غیرفعال</option></select></Field>}
            </div>
            <Field label="دسترسی‌های این حساب" hint={roleOf(edit.role_id)?.is_manager ? 'نقش مدیر همهٔ دسترسی‌ها را دارد.' : 'با انتخاب نقش، دسترسی‌های آن تیک می‌خورد؛ می‌توانید برای این شخص تغییرشان دهید.'}>
              <PermTable value={edit.perms} onChange={(perms) => setEdit({ ...edit, perms })} disabled={!!roleOf(edit.role_id)?.is_manager} />
            </Field>
          </div>
        )}
      </Sheet>

      <Sheet open={!!roleEdit} onClose={() => setRoleEdit(null)} title={roleEdit?.id ? 'ویرایش نقش' : 'نقش جدید'}
        footer={<div className="row-gap">
          {roleEdit?.id && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={deleteRole}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={saveRole}>ذخیره</Button></div>}>
        {roleEdit && (
          <div className="form">
            <Field label="نام نقش"><input className="input" value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} placeholder="مثلاً منشی" autoFocus={!roleEdit.id} /></Field>
            <Field label="دسترسی‌های پیش‌فرض این نقش" hint="تغییر این الگو روی حساب‌های موجود اثر ندارد؛ برای آن‌ها از ویرایش حساب استفاده کنید.">
              <PermTable value={roleEdit.perms} onChange={(perms) => setRoleEdit({ ...roleEdit, perms })} />
            </Field>
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
