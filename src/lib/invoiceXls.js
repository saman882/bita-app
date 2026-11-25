import { toEn, normalizeFa, isoFromJ } from './fmt'

/*
 * Reads a sales-invoice export ("SaleFactorRpt", نرم‌افزار پارسیان) — one invoice per sheet.
 * The layout is right-to-left: each label ("سند :", "خريدار :", "ساعت :") has its value in the
 * nearest filled cell to its left. The item table starts at the header row that contains
 * «کد کالا» and «شرح کالا», and ends at «جمع کل».
 */
const clean = (v) => normalizeFa(toEn(String(v ?? ''))).replace(/‌/g, ' ').replace(/\s+/g, ' ').trim()
const isLabel = (v) => /[:：]\s*$|^\s*:/.test(String(v))
const num = (v) => {
  if (typeof v === 'number') return v
  const n = Number(clean(v).replace(/[,٬،\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function cellGrid(XLSX, ws) {
  const ref = ws['!ref']
  if (!ref) return []
  const r = XLSX.utils.decode_range(ref)
  const g = []
  for (let y = r.s.r; y <= r.e.r; y++) {
    const row = []
    for (let x = r.s.c; x <= r.e.c; x++) { const c = ws[XLSX.utils.encode_cell({ r: y, c: x })]; row.push(c ? c.v : '') }
    g.push(row)
  }
  return g
}

function valueLeftOf(g, y, x) {
  for (let c = x - 1; c >= 0; c--) {
    const v = g[y][c]
    if (v === '' || v == null) continue
    return isLabel(v) ? '' : v
  }
  return ''
}
function findLabel(g, re) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
    const v = g[y][x]
    if (typeof v === 'string' && re.test(clean(v)) && isLabel(v)) return valueLeftOf(g, y, x)
  }
  return ''
}

function parseTime(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const m = Math.round(v * 1440)
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }
  const m = clean(v).match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}
function parseDate(v) {
  const m = clean(v).match(/(1[34]\d\d)[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (!m) return ''
  try { return isoFromJ(+m[1], +m[2], +m[3]) } catch { return '' }
}

export function parseInvoiceSheet(XLSX, ws) {
  const g = cellGrid(XLSX, ws)
  const head = g.findIndex((row) => row.some((v) => /کد کالا/.test(clean(v))) && row.some((v) => /شرح کالا|نام کالا/.test(clean(v))))
  if (head < 0) return null
  const col = (re) => g[head].findIndex((v) => re.test(clean(v)))
  const C = { code: col(/کد کالا/), name: col(/شرح کالا|نام کالا/), qty: col(/^مقدار|تعداد/), price: col(/قیمت واحد|فی/), total: col(/قیمت کل|مبلغ کل/) }
  const lines = []
  for (let y = head + 1; y < g.length; y++) {
    const row = g[y]
    if (row.some((v) => /جمع کل|جمع تعداد|خالص فاکتور/.test(clean(v)))) break
    const name = clean(row[C.name]), code = clean(row[C.code])
    if (!name && !code) continue
    const qty = num(row[C.qty]) ?? 0
    let price = C.price >= 0 ? num(row[C.price]) : null
    const total = C.total >= 0 ? num(row[C.total]) : null
    if (price == null && total != null && qty) price = total / qty
    lines.push({ code, name, qty, price: price ?? 0, unit: '' })
  }
  if (!lines.length) return null
  const buyer = clean(findLabel(g, /^خریدار/)).replace(/\*+$/, '').trim()
  return {
    invoice_no: clean(findLabel(g, /^(سند|شماره فاکتور|شماره سند)/)),
    date: parseDate(findLabel(g, /^تاریخ/)),
    time: parseTime(findLabel(g, /^ساعت/)),
    customer: { name: buyer || 'اشخاص متفرقه', mobile: clean(findLabel(g, /^موبایل/)), phone: clean(findLabel(g, /^تلفن/)), address: clean(findLabel(g, /^آدرس/)) },
    lines,
    net: num(findLabel(g, /^خالص فاکتور/)),
  }
}

/** All invoices in one workbook file (one per sheet). */
export async function readInvoiceFile(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const out = []
  for (const name of wb.SheetNames) {
    const inv = parseInvoiceSheet(XLSX, wb.Sheets[name])
    if (inv) out.push({ ...inv, file: file.name, sheet: name })
  }
  return out
}
