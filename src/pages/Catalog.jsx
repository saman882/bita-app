import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { fa, normalizeFa, toEn } from '../lib/fmt'
import { Icon, Button, Sheet, Field, Empty, Spinner, useToast, SearchBox, NumInput } from '../components/ui'

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']
const TABS = [['products', 'محصولات', 'box'], ['stages', 'عملیات‌ها', 'layers'], ['standards', 'زمان استاندارد', 'clock'], ['types', 'انواع محصول', 'tag']]

export default function Catalog() {
  const toast = useToast()
  const [tab, setTab] = useState('products')
  const [d, setD] = useState(null)

  const load = useCallback(async () => {
    const [t, p, s, sd, used] = await Promise.all([
      supabase.from('product_types').select('*').order('sort_order').order('id'),
      supabase.from('products').select('*').order('name'),
      supabase.from('stages').select('*').order('sort_order').order('id'),
      supabase.from('standards').select('*'),
      supabase.rpc('catalog_usage'),
    ])
    const err = t.error || p.error || s.error || sd.error
    if (err) toast(errText(err), 'bad')
    setD({ types: t.data || [], products: p.data || [], stages: s.data || [], standards: sd.data || [], used: used.data || {} })
  }, [toast])
  useEffect(() => { load() }, [load])

  return (
    <div className="page">
      <div className="page-title"><h1>محصولات و عملیات</h1></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={16} />{l}</button>
        ))}
      </div>
      {!d ? <div className="page-center"><Spinner size={28} /></div> : (
        <>
          {tab === 'products' && <Products d={d} reload={load} />}
          {tab === 'stages' && <Stages d={d} reload={load} />}
          {tab === 'standards' && <Standards d={d} reload={load} />}
          {tab === 'types' && <Types d={d} reload={load} />}
        </>
      )}
    </div>
  )
}

function useSave(reload) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (fn, ok) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? 'این نام قبلاً ثبت شده است' : /foreign key/i.test(error.message) ? 'این مورد در سوابق استفاده شده؛ به‌جای حذف، غیرفعالش کنید' : errText(error), 'bad')
      return false
    }
    toast(ok); reload(); return true
  }
  return [busy, run]
}

/* ---------------- products ---------------- */
function Products({ d, reload }) {
  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [edit, setEdit] = useState(null)
  const [busy, run] = useSave(reload)
  const typeName = Object.fromEntries(d.types.map((t) => [t.id, t.name]))
  const list = useMemo(() => {
    const t = normalizeFa(q).trim()
    return d.products.filter((p) => (typeF === 'all' || p.type_id === Number(typeF)) && (!t || normalizeFa(p.name).includes(t)))
      .sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name, 'fa') : a.active ? -1 : 1))
  }, [d.products, q, typeF])

  const save = async () => {
    const row = { name: normalizeFa(edit.name).replace(/\s+/g, ' ').trim(), type_id: Number(edit.type_id), active: edit.active }
    if (!row.name) return
    const ok = await run(() => edit.id ? supabase.from('products').update(row).eq('id', edit.id) : supabase.from('products').insert(row), edit.id ? 'محصول ذخیره شد' : 'محصول اضافه شد')
    if (ok) setEdit(null)
  }
  const del = async () => { if (await run(() => supabase.from('products').delete().eq('id', edit.id), 'محصول حذف شد')) setEdit(null) }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder={`جستجو در ${fa(d.products.length)} محصول…`} />
        <Button icon="plus" onClick={() => setEdit({ name: '', type_id: d.types[0]?.id, active: true })}>محصول جدید</Button>
      </div>
      <div className="chips">
        <button className={`chip ${typeF === 'all' ? 'on' : ''}`} onClick={() => setTypeF('all')}>همه</button>
        {d.types.map((t) => <button key={t.id} className={`chip ${typeF === String(t.id) ? 'on' : ''}`} onClick={() => setTypeF(String(t.id))}>{t.name}</button>)}
      </div>
      {list.length === 0 ? <Empty icon="box" title="محصولی پیدا نشد" /> : (
        <div className="list">
          {list.map((p) => (
            <button key={p.id} className={`list-item as-btn ${p.active ? '' : 'is-off'}`} onClick={() => setEdit({ ...p })}>
              <span className="stage-swatch sm" style={{ background: 'var(--brand)' }} />
              <div className="grow">
                <b>{p.name} {!p.active && <span className="badge badge-soft">غیرفعال</span>}</b>
                <small className="muted">{typeName[p.type_id]}{d.used.products?.[p.id] ? ` · ${fa(d.used.products[p.id])} بار ثبت شده` : ''}</small>
              </div>
              <Icon name="edit" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش محصول' : 'محصول جدید'}
        footer={<div className="row-gap">
          {edit?.id && !d.used.products?.[edit.id] && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={del}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>ذخیره</Button></div>}>
        {edit && (
          <div className="form">
            <Field label="نام محصول"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="مثلاً شلنگ پکیج یکسرمغزی 1/2*1/2 50سانتی" autoFocus={!edit.id} /></Field>
            <Field label="نوع محصول" hint="زمان استاندارد هر عملیات بر اساس نوع محصول تعیین می‌شود.">
              <select className="input" value={edit.type_id} onChange={(e) => setEdit({ ...edit, type_id: e.target.value })}>
                {d.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            {edit.id && (
              <Field label="وضعیت">
                <select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">فعال</option><option value="0">غیرفعال (در فهرست سرپرست نمی‌آید)</option>
                </select>
              </Field>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

/* ---------------- operations (stages) ---------------- */
function Stages({ d, reload }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [busy, run] = useSave(reload)
  const list = d.stages.filter((s) => !q || normalizeFa(s.name).includes(normalizeFa(q).trim()))
  const stdCount = (id) => d.standards.filter((x) => x.stage_id === id).length

  const save = async () => {
    const row = { name: normalizeFa(edit.name).trim(), color: edit.color, sort_order: Number(toEn(edit.sort_order)) || 0, active: edit.active, unit: 'عدد' }
    if (!row.name) return
    if (await run(() => edit.id ? supabase.from('stages').update(row).eq('id', edit.id) : supabase.from('stages').insert(row), 'عملیات ذخیره شد')) setEdit(null)
  }
  const del = async () => { if (await run(() => supabase.from('stages').delete().eq('id', edit.id), 'عملیات حذف شد')) setEdit(null) }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="جستجوی عملیات…" />
        <Button icon="plus" onClick={() => setEdit({ name: '', color: COLORS[d.stages.length % 10], sort_order: String(d.stages.length + 1), active: true })}>عملیات جدید</Button>
      </div>
      <div className="list">
        {list.map((s) => (
          <button key={s.id} className={`list-item as-btn ${s.active ? '' : 'is-off'}`} onClick={() => setEdit({ ...s, sort_order: String(s.sort_order) })}>
            <span className="stage-swatch" style={{ background: s.color }}><Icon name="layers" size={18} /></span>
            <div className="grow">
              <b>{s.name} {!s.active && <span className="badge badge-soft">غیرفعال</span>}</b>
              <small className="muted">{stdCount(s.id) ? `زمان استاندارد برای ${fa(stdCount(s.id))} نوع محصول` : 'زمان استاندارد تعریف نشده'}{d.used.stages?.[s.id] ? ` · ${fa(d.used.stages[s.id])} بار ثبت شده` : ''}</small>
            </div>
            <Icon name="edit" size={18} className="muted" />
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش عملیات' : 'عملیات جدید'}
        footer={<div className="row-gap">
          {edit?.id && !d.used.stages?.[edit.id] && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={del}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>ذخیره</Button></div>}>
        {edit && (
          <div className="form">
            <Field label="نام عملیات"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="مثلاً برش" autoFocus={!edit.id} /></Field>
            <Field label="رنگ"><div className="swatches">{COLORS.map((c) => <button key={c} type="button" className={`swatch ${edit.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label={c} />)}</div></Field>
            <div className="grid2">
              <Field label="ترتیب نمایش"><NumInput value={edit.sort_order} onChange={(v) => setEdit({ ...edit, sort_order: v })} /></Field>
              {edit.id && <Field label="وضعیت"><select className="input" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">فعال</option><option value="0">غیرفعال</option></select></Field>}
            </div>
            <p className="muted small">زمان استاندارد این عملیات را برای هر نوع محصول از زبانهٔ «زمان استاندارد» وارد کنید.</p>
          </div>
        )}
      </Sheet>
    </>
  )
}

/* ---------------- standards grid (operation × product type) ---------------- */
function Standards({ d, reload }) {
  const toast = useToast()
  const init = () => Object.fromEntries(d.standards.map((s) => [`${s.stage_id}|${s.type_id}`, String(Number(s.seconds))]))
  const [vals, setVals] = useState(init)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVals(init()) }, [d.standards]) // eslint-disable-line react-hooks/exhaustive-deps
  const orig = init()
  const changed = Object.keys({ ...vals, ...orig }).filter((k) => (vals[k] || '') !== (orig[k] || ''))

  const save = async () => {
    setBusy(true)
    const up = [], del = []
    for (const k of changed) {
      const [stage_id, type_id] = k.split('|').map(Number)
      const v = Number(vals[k])
      if (!vals[k] || !(v > 0)) del.push({ stage_id, type_id }); else up.push({ stage_id, type_id, seconds: v })
    }
    let error = null
    if (up.length) ({ error } = await supabase.from('standards').upsert(up))
    for (const x of del) { if (error) break; ({ error } = await supabase.from('standards').delete().eq('stage_id', x.stage_id).eq('type_id', x.type_id)) }
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('زمان‌های استاندارد ذخیره شد'); reload()
  }

  return (
    <div className="card">
      <p className="muted small">زمان لازم برای <b>یک عدد</b>، به <b>ثانیه</b>. خانهٔ خالی یعنی آن عملیات برای آن نوع محصول تعریف نشده. تغییرات فقط روی ثبت‌های بعدی اثر دارد؛ گزارش‌های گذشته با همان زمانِ لحظهٔ ثبت محاسبه می‌شوند.</p>
      <div className="table-wrap">
        <table className="table std-grid">
          <thead><tr><th>عملیات</th>{d.types.map((t) => <th key={t.id}>{t.name}</th>)}</tr></thead>
          <tbody>
            {d.stages.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'is-off'}>
                <td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                {d.types.map((t) => {
                  const k = `${s.id}|${t.id}`
                  return (
                    <td key={t.id}>
                      <input className={`input std-input ${(vals[k] || '') !== (orig[k] || '') ? 'dirty' : ''}`} inputMode="decimal" dir="ltr" placeholder="—"
                        value={fa(vals[k] || '')} onChange={(e) => setVals({ ...vals, [k]: toEn(e.target.value).replace(/[^\d.]/g, '') })} aria-label={`${s.name} — ${t.name}`} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button icon="check" loading={busy} disabled={!changed.length} onClick={save}>{changed.length ? `ذخیرهٔ ${fa(changed.length)} تغییر` : 'تغییری نیست'}</Button>
    </div>
  )
}

/* ---------------- product types ---------------- */
function Types({ d, reload }) {
  const [edit, setEdit] = useState(null)
  const [busy, run] = useSave(reload)
  const count = (id) => d.products.filter((p) => p.type_id === id).length
  const save = async () => {
    const row = { name: normalizeFa(edit.name).trim(), active: edit.active, sort_order: Number(toEn(edit.sort_order)) || 0 }
    if (!row.name) return
    if (await run(() => edit.id ? supabase.from('product_types').update(row).eq('id', edit.id) : supabase.from('product_types').insert(row), 'ذخیره شد')) setEdit(null)
  }
  const del = async () => { if (await run(() => supabase.from('product_types').delete().eq('id', edit.id), 'حذف شد')) setEdit(null) }
  return (
    <>
      <div className="toolbar"><span className="muted small grow">هر محصول یک نوع دارد و زمان استاندارد بر اساس نوع تعیین می‌شود.</span>
        <Button icon="plus" onClick={() => setEdit({ name: '', active: true, sort_order: String(d.types.length + 1) })}>نوع جدید</Button></div>
      <div className="list">
        {d.types.map((t) => (
          <button key={t.id} className={`list-item as-btn ${t.active ? '' : 'is-off'}`} onClick={() => setEdit({ ...t, sort_order: String(t.sort_order) })}>
            <span className="stage-swatch" style={{ background: 'var(--brand-2)' }}><Icon name="tag" size={18} /></span>
            <div className="grow"><b>{t.name}</b><small className="muted">{fa(count(t.id))} محصول</small></div>
            <Icon name="edit" size={18} className="muted" />
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'ویرایش نوع محصول' : 'نوع محصول جدید'}
        footer={<div className="row-gap">
          {edit?.id && !count(edit.id) && <Button variant="ghost-danger" icon="trash" loading={busy} onClick={del}>حذف</Button>}
          <Button className="grow" icon="check" loading={busy} onClick={save}>ذخیره</Button></div>}>
        {edit && <div className="form">
          <Field label="نام نوع"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus={!edit.id} /></Field>
          <Field label="ترتیب نمایش"><NumInput value={edit.sort_order} onChange={(v) => setEdit({ ...edit, sort_order: v })} /></Field>
        </div>}
      </Sheet>
    </>
  )
}
