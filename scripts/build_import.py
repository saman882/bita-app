"""Builds SQL that loads the Excel workbook into the v3 schema. Usage: build_import.py <xlsx> <out.sql>"""
import sys, re, json, datetime, collections
import openpyxl

def j2g(jy, jm, jd):
    # jalaali -> gregorian (standard algorithm)
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33) + 3) // 4 + jd + ((jm - 1) * 31 if jm < 7 else ((jm - 7) * 30) + 186)
    gy = 400 * (days // 146097); days %= 146097
    if days > 36524:
        days -= 1; gy += 100 * (days // 36524); days %= 36524
        if days >= 365: days += 1
    gy += 4 * (days // 1461); days %= 1461
    if days > 365:
        gy += (days - 1) // 365; days = (days - 1) % 365
    gd = days + 1
    sal_a = [0, 31, 29 if (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 13 and gd > sal_a[gm]:
        gd -= sal_a[gm]; gm += 1
    return datetime.date(gy, gm, gd)

norm = lambda s: re.sub(r'\s+', ' ', str(s)).strip().replace('ي', 'ی').replace('ك', 'ک') if s is not None else None
q = lambda s: "'" + str(s).replace("'", "''") + "'"

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)

# --- base info: operations x product types
base = wb['اطلاعات پایه']
types = [norm(base.cell(5, c).value) for c in range(2, 10) if base.cell(5, c).value]
ops, standards = [], {}
for r in range(6, 31):
    name = norm(base.cell(r, 1).value)
    if not name: continue
    ops.append(name)
    for ci, t in enumerate(types):
        v = base.cell(r, 2 + ci).value
        if isinstance(v, (int, float)): standards[(name, t)] = v

# --- data rows
ws = wb['مهر1405 ']
rows, skipped = [], []
for r in range(2, ws.max_row + 1):
    v = [ws.cell(r, c).value for c in range(1, 14)]
    if not any(v[:8]): continue
    date, product, op, ptype, qty, st, en, operator = v[:8]
    note = norm(v[12])
    product, op, ptype, operator = map(norm, (product, op, ptype, operator))
    if not (product and op and ptype and operator and isinstance(qty, (int, float))):
        skipped.append(dict(row=r, date=date, operator=operator, qty=qty, start=str(st), end=str(en), product=product, op=op)); continue
    jy, jm, jd = map(int, str(date).split('/'))
    rows.append(dict(row=r, date=j2g(jy, jm, jd), product=product, op=op, ptype=ptype, qty=qty,
                     st=st if isinstance(st, datetime.time) else None, en=en if isinstance(en, datetime.time) else None,
                     operator=operator, note=note))

# workers: names from 'مدت کارکرد' + any operator in data
wk = wb['مدت کارکرد']
workers = [norm(wk.cell(2, c).value) for c in range(2, wk.max_column + 1) if wk.cell(2, c).value and 'Total' not in str(wk.cell(2, c).value)]
for x in rows:
    if x['operator'] not in workers: workers.append(x['operator'])

products = {}
for x in rows: products.setdefault(x['product'], x['ptype'])
colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

L = ['begin;']
L.append('insert into public.product_types (name, sort_order) values ' + ', '.join(f'({q(t)}, {i+1})' for i, t in enumerate(types)) + ';')
L.append('insert into public.stages (name, unit, color, sort_order) values ' + ', '.join(f"({q(o)}, 'عدد', {q(colors[i % 10])}, {i+1})" for i, o in enumerate(ops)) + ';')
L.append('insert into public.standards (stage_id, type_id, seconds) select s.id, t.id, v.sec from (values ' +
         ', '.join(f'({q(o)}, {q(t)}, {sec})' for (o, t), sec in standards.items()) +
         ') v(op, typ, sec) join public.stages s on s.name = v.op join public.product_types t on t.name = v.typ;')
L.append('insert into public.workers (full_name) values ' + ', '.join(f'({q(w)})' for w in workers) + ';')
L.append('insert into public.products (name, type_id) select v.n, t.id from (values ' + ', '.join(f'({q(p)}, {q(t)})' for p, t in products.items()) +
         ') v(n, typ) join public.product_types t on t.name = v.typ;')
vals = []
for x in rows:
    st = q(x['st'].strftime('%H:%M:%S')) + '::time' if x['st'] and x['en'] else 'null::time'
    en = q(x['en'].strftime('%H:%M:%S')) + '::time' if x['st'] and x['en'] else 'null::time'
    note = q(x['note']) if x['note'] else 'null'
    vals.append(f"({q(x['operator'])}, {q(x['date'].isoformat())}::date, {q(x['product'])}, {q(x['op'])}, {x['qty']}, {st}, {en}, {note})")
L.append('insert into public.jobs (worker_id, work_date, product_id, stage_id, quantity, start_time, end_time, std_seconds, note, source) '
         'select w.id, v.d, p.id, s.id, v.qty, v.st, v.en, sd.seconds, v.note, \'excel\' from (values ' + ',\n'.join(vals) +
         ') v(w, d, p, s, qty, st, en, note) join public.workers w on w.full_name = v.w join public.products p on p.name = v.p '
         'join public.stages s on s.name = v.s left join public.standards sd on sd.stage_id = s.id and sd.type_id = p.type_id;')
L.append('commit;')
open(out, 'w').write('\n'.join(L))

summary = dict(types=types, ops=ops, standards=len(standards), workers=workers, products=len(products), rows=len(rows),
               rows_no_time=sum(1 for x in rows if not (x['st'] and x['en'])), skipped=skipped,
               no_std=collections.Counter((x['op'], x['ptype']) for x in rows if (x['op'], x['ptype']) not in standards))
print(json.dumps(summary, ensure_ascii=False, default=str, indent=1))
