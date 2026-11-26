import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { fa, num, toEn, jDate, tehranIso } from '../lib/fmt'
import { readInvoiceFile } from '../lib/invoiceXls'
import { Icon, Button, Sheet, Field, NumInput, Empty, Spinner, useToast, SearchSelect, JDateInput } from '../components/ui'
import { DatePicker, useCatalog } from './Entry'

export const money = (v) => `${num(Math.round(Number(v) || 0))} ریال`

export function useCustomers() {
  const [list, setList] = useState([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').order('first_name')
    setList((data || []).map((c) => ({ ...c, name: `${c.first_name} ${c.last_name}`.trim(), sub: `کد ${fa(c.code)}${c.address ? ' · ' + c.address : ''}` })))
  }, [])
  useEffect(() => { load() }, [load])
  return [list, load]
}

const emptyLine = () => ({ key: Math.random(), product: null, qty: '', price: '' })

export default function SalesEntry({ date, setDate }) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [cat] = useCatalog()
  const [customers] = useCustomers()
  const [customer, setCustomer] = useState(null)
  const [nextStep, setNextStep] = useState(0)
  const [lines, setLines] = useState([emptyLine()])
  // Choosing a customer moves straight on to picking the first product.
  const pickCustomer = (v) => {
    setCustomer(v)
    if (v && !lines[0]?.product) setTimeout(() => setNextStep((n) => n + 1), 150)
  }
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)
  const [delId, setDelId] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sales_day', { p_date: date })
    if (error) toast(errText(error), 'bad')
    setRows(data || [])
  }, [date, toast])
  useEffect(() => { setRows(null); load() }, [load])

  const products = cat.products.filter((p) => p.active)
  const priceOf = (id) => cat.products.find((p) => p.id === id)?.price ?? 0
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)

  const byCustomer = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) {
      if (!m.has(r.customer_id)) m.set(r.customer_id, { id: r.customer_id, name: r.customer, code: r.code, items: [] })
      m.get(r.customer_id).items.push(r)
    }
    return [...m.values()]
  }, [rows])
  const dayQty = (rows || []).reduce((s, r) => s + Number(r.quantity), 0)
  const dayAmount = (rows || []).reduce((s, r) => s + Number(r.quantity) * Number(r.unit_price), 0)

  const save = async () => {
    if (!customer) return toast('مشتری را انتخاب کنید', 'bad')
    const filled = lines.filter((l) => l.product || l.qty)
    if (!filled.length) return toast('حداقل یک محصول وارد کنید', 'bad')
    for (const l of filled) {
      if (!l.product) return toast('برای همهٔ ردیف‌ها محصول را انتخاب کنید', 'bad')
      if (!(Number(l.qty) > 0)) return toast('تعداد هر محصول باید بیشتر از صفر باشد', 'bad')
    }
    setBusy(true)
    for (const l of filled) {
      const { error } = await supabase.rpc('save_sale', { p_id: null, p_date: date, p_customer: customer, p_product: l.product, p_qty: Number(l.qty), p_price: Number(l.price) || 0, p_note: null })
      if (error) { setBusy(false); toast(errText(error), 'bad'); load(); return }
    }
    setBusy(false)
    toast(`فروش ${fa(filled.length)} قلم ثبت شد`)
    setLines([emptyLine()]); setCustomer(null); load()
  }
  const remove = async (id) => {
    const { error } = await supabase.rpc('delete_sale', { p_id: id })
    if (error) return toast(errText(error), 'bad')
    toast('حذف شد'); setDelId(null); load()
  }

  return (
    <>
      <DatePicker date={date} setDate={setDate} kind="sales" extra={rows ? `${fa(rows.length)} قلم · ${num(dayQty)} عدد · ${money(dayAmount)}` : ''} />

      <section className="card import-card">
        <div className="card-head">
          <div><h2>ورود فاکتور از اکسل</h2><small className="muted">خروجی «فاکتور فروش» نرم‌افزار حسابداری (SaleFactorRpt)؛ چند فایل با هم هم می‌شود.</small></div>
          <Button icon="upload" onClick={() => setImporting(true)}>انتخاب فایل</Button>
        </div>
      </section>
      {importing && <ImportInvoices date={date} onClose={() => setImporting(false)} onDone={(d) => { setImporting(false); if (d && d !== date) setDate(d); else load() }} />}

      <section className="card">
        <div className="card-head"><h2>ثبت فروش جدید</h2></div>
        {customers.length === 0 ? (
          <Empty icon="users" title="هنوز مشتری‌ای تعریف نشده" text="از «اطلاعات پایه ← مشتریان» مشتری اضافه کنید." />
        ) : (
          <div className="form">
            <Field label="مشتری"><SearchSelect label="جستجوی مشتری (نام یا کد)" items={customers.filter((c) => c.active || c.id === customer)} value={customer} onChange={pickCustomer} placeholder="نام یا کد مشتری را جستجو کنید" /></Field>
            <div className="sale-lines">
              {lines.map((l, i) => (
                <div key={l.key} className="sale-line">
                  <div className="sale-line-head"><b>محصول {fa(i + 1)}</b>{lines.length > 1 && <button className="icon-btn" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="حذف ردیف"><Icon name="x" size={16} /></button>}</div>
                  <SearchSelect label="انتخاب محصول" items={products} value={l.product} group="type" placeholder="محصول را انتخاب کنید" openSignal={i === 0 ? nextStep : 0}
                    onChange={(v) => setLine(l.key, { product: v, price: l.price === '' || l.price === String(priceOf(l.product)) ? String(priceOf(v)) : l.price })} />
                  <div className="grid2">
                    <label className="field"><span className="field-label">تعداد</span><NumInput value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} placeholder="۰" /></label>
                    <label className="field"><span className="field-label">قیمت واحد (ریال)</span><NumInput value={l.price} onChange={(v) => setLine(l.key, { price: v })} placeholder="۰" /></label>
                  </div>
                  {Number(l.qty) > 0 && Number(l.price) > 0 && <small className="muted">جمع: {money(Number(l.qty) * Number(l.price))}</small>}
                </div>
              ))}
            </div>
            <Button variant="ghost" icon="plus" onClick={() => setLines([...lines, emptyLine()])}>افزودن محصول دیگر</Button>
            <div className="sale-total"><span>جمع کل</span><b>{money(total)}</b></div>
            <Button className="btn-block btn-lg" icon="check" loading={busy} onClick={save}>ثبت فروش</Button>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>فروش‌های این روز</h2></div>
        {!rows ? <Spinner /> : byCustomer.length === 0 ? <p className="muted">فروشی ثبت نشده.</p> : (
          <div className="days">
            {byCustomer.map((c) => {
              const q = c.items.reduce((s, r) => s + Number(r.quantity), 0), a = c.items.reduce((s, r) => s + Number(r.quantity) * Number(r.unit_price), 0)
              return (
                <div key={c.id} className="day open">
                  <div className="day-head static"><div><b>{c.name}</b>{[...new Set(c.items.map((r) => r.invoice_no).filter(Boolean))].map((n) => <span key={n} className="badge badge-soft">فاکتور {fa(n)}</span>)}<small className="muted">کد {fa(c.code)} · {fa(c.items.length)} قلم · {num(q)} عدد</small></div><b>{money(a)}</b></div>
                  <div className="day-body">
                    {c.items.map((r) => (
                      <div key={r.id} className="job">
                        <div className="grow">
                          <b>{r.product_name}</b>
                          <div className="job-meta"><span>{num(Number(r.quantity))} عدد × {money(r.unit_price)}</span><b>{money(Number(r.quantity) * Number(r.unit_price))}</b></div>
                        </div>
                        {delId === r.id ? (
                          <div className="job-confirm"><Button variant="danger" onClick={() => remove(r.id)}>حذف</Button><Button variant="ghost" onClick={() => setDelId(null)}>نه</Button></div>
                        ) : (
                          <div className="job-actions">
                            <button className="icon-btn" aria-label="ویرایش" onClick={() => setEdit({ ...r, qty: String(Number(r.quantity)), price: String(Number(r.unit_price)) })}><Icon name="edit" size={18} /></button>
                            <button className="icon-btn" aria-label="حذف" onClick={() => setDelId(r.id)}><Icon name="trash" size={18} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {edit && <SaleEditor sale={edit} date={date} customers={customers} products={cat.products} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function SaleEditor({ sale, date, customers, products, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(sale)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!(Number(toEn(f.qty)) > 0)) return toast('تعداد باید بیشتر از صفر باشد', 'bad')
    setBusy(true)
    const { error } = await supabase.rpc('save_sale', { p_id: sale.id, p_date: date, p_customer: f.customer_id, p_product: f.product_id, p_qty: Number(f.qty), p_price: Number(f.price) || 0, p_note: f.note || null })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    toast('ویرایش ذخیره شد'); onSaved()
  }
  return (
    <Sheet open onClose={onClose} title="ویرایش فروش" footer={<Button className="btn-block" icon="check" loading={busy} onClick={save}>ذخیره</Button>}>
      <div className="form">
        <Field label="مشتری"><SearchSelect label="مشتری" items={customers} value={f.customer_id} onChange={(v) => setF({ ...f, customer_id: v })} /></Field>
        <Field label="محصول"><SearchSelect label="محصول" items={products} value={f.product_id} onChange={(v) => setF({ ...f, product_id: v })} group="type" /></Field>
        <div className="grid2">
          <Field label="تعداد"><NumInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} /></Field>
          <Field label="قیمت واحد (ریال)"><NumInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        </div>
        <Field label="توضیح"><input className="input" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Sheet>
  )
}

/* ---------- Excel invoice import ---------- */
function ImportInvoices({ date, onClose, onDone }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const pick = async (files) => {
    if (!files?.length) return
    setReading(true)
    const out = [], bad = []
    for (const f of files) {
      try {
        const inv = await readInvoiceFile(f)
        if (!inv.length) bad.push(f.name)
        for (const i of inv) out.push({ ...i, key: `${f.name}|${i.sheet}|${i.invoice_no}`, date: i.date || date, dateFromFile: !!i.date })
      } catch { bad.push(f.name) }
    }
    setReading(false)
    if (bad.length) toast(`این فایل‌ها با قالب فاکتور فروش خوانده نشدند: ${bad.join('، ')}`, 'bad')
    setItems(out)
  }
  const setDate = (key, d) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, date: d } : x)))
  const run = async () => {
    setBusy(true)
    const res = []
    for (const inv of items) {
      const { data, error } = await supabase.rpc('import_sale_invoice', { p: { invoice_no: inv.invoice_no, date: inv.date, time: inv.time, customer: inv.customer, lines: inv.lines } })
      res.push({ inv, data, error: error ? errText(error) : null })
    }
    setBusy(false)
    setResult(res)
  }
  const lastDate = items?.length ? items[items.length - 1].date : null

  return (
    <Sheet open onClose={() => (result ? onDone(lastDate) : onClose())} title="ورود فاکتور فروش از اکسل"
      footer={result ? <Button className="btn-block" icon="check" onClick={() => onDone(lastDate)}>بستن</Button>
        : items?.length ? <Button className="btn-block btn-lg" icon="check" loading={busy} onClick={run}>ثبت {fa(items.length)} فاکتور</Button> : null}>
      {result ? (
        <div className="form">
          {result.map(({ inv, data, error }) => (
            <div key={inv.key} className={`imp-res ${error || !data ? 'bad' : 'ok'}`}>
              <b>فاکتور {fa(inv.invoice_no || '—')} · {inv.customer.name}</b>
              {error || !data ? <small className="tone-bad">{error || 'ثبت نشد'}</small> : (
                <small className="muted">
                  {fa(data.lines)} ردیف ثبت شد{data.replaced ? ' (جایگزین نسخهٔ قبلی همین فاکتور)' : ''}{data.new_customer ? ' · مشتری جدید ساخته شد' : ''}
                  {data.new_products?.length > 0 && <> · کالای جدید در گروه «سایر»: {data.new_products.join('، ')}</>}
                </small>
              )}
            </div>
          ))}
          {result.some((r) => r.data?.new_products?.length) && <p className="muted small">گروه کالاهای جدید را از «اطلاعات پایه ← محصولات و عملیات» درست کنید تا در گزارش‌ها در گروه درست بیایند.</p>}
        </div>
      ) : (
        <div className="form">
          <label className="file-drop">
            <input type="file" accept=".xls,.xlsx" multiple onChange={(e) => pick([...e.target.files])} />
            <Icon name="upload" size={26} />
            <b>{reading ? 'در حال خواندن…' : 'فایل‌های اکسل فاکتور را انتخاب کنید'}</b>
            <small className="muted">.xls یا .xlsx · اگر شمارهٔ فاکتوری قبلاً وارد شده باشد، ردیف‌هایش جایگزین می‌شود و تکراری ثبت نمی‌شود.</small>
          </label>
          {items?.length === 0 && <p className="muted">فاکتوری پیدا نشد.</p>}
          {items?.map((inv) => {
            const total = inv.lines.reduce((s, l) => s + l.qty * l.price, 0)
            return (
              <div key={inv.key} className="imp-inv">
                <div className="imp-inv-head"><b>فاکتور {fa(inv.invoice_no || '—')}</b><span className="muted small">{inv.file}</span></div>
                <small className="muted">خریدار: {inv.customer.name}{inv.time && ` · ساعت ${fa(inv.time)}`}</small>
                <ul className="imp-lines">{inv.lines.map((l, i) => <li key={i}><span>{l.name} <small className="muted">({fa(l.code)})</small></span><span>{num(l.qty)} × {money(l.price)}</span></li>)}</ul>
                <div className="imp-inv-foot">
                  <span>جمع: <b>{money(total)}</b></span>
                  <div className="imp-date"><span className="muted small">{inv.dateFromFile ? 'تاریخ فاکتور' : 'تاریخ (در فایل نیست)'}</span>
                    <JDateInput value={inv.date} onChange={(v) => setDate(inv.key, v > tehranIso() ? tehranIso() : v)} label="تاریخ فاکتور" /></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
