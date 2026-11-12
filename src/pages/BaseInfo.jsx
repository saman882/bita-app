import { useState } from 'react'
import { useAccess, can } from '../lib/access'
import { fa } from '../lib/fmt'
import { Icon } from '../components/ui'
import Catalog from './Catalog'
import Customers from './Customers'
import { Workers } from './People'

/** اطلاعات پایه: کارکنان، محصولات و عملیات، مشتریان */
export default function BaseInfo({ workers, reloadWorkers, me }) {
  const access = useAccess()
  const [section, setSection] = useState(null)
  const back = () => setSection(null)

  const cards = [
    { id: 'staff', title: 'کارکنان', text: 'همکاران، کد پرسنلی و وضعیت', icon: 'users', meta: `${fa(workers.filter((w) => w.active).length)} همکار فعال`, show: true },
    { id: 'catalog', title: 'محصولات و عملیات', text: 'انواع محصول، محصولات، عملیات‌ها و زمان استاندارد', icon: 'box', show: can(access, 'catalog', 'standards') },
    { id: 'customers', title: 'مشتریان', text: 'کد مشتری، نام، آدرس و لوکیشن', icon: 'pin', show: can(access, 'customers', 'entry_sales') },
  ].filter((c) => c.show)

  if (section === 'staff') return <Workers workers={workers} reload={reloadWorkers} me={me} onBack={back} />
  if (section === 'catalog') return <Catalog onBack={back} />
  if (section === 'customers') return <Customers onBack={back} />

  return (
    <div className="page">
      <div className="page-title"><h1>اطلاعات پایه</h1></div>
      <div className="hub">
        {cards.map((c) => (
          <button key={c.id} className="hub-card" onClick={() => setSection(c.id)}>
            <span className="hub-ic"><Icon name={c.icon} size={26} /></span>
            <div className="grow"><b>{c.title}</b><small className="muted">{c.text}</small>{c.meta && <small className="hub-meta">{c.meta}</small>}</div>
            <Icon name="chev" size={18} className="flip muted" />
          </button>
        ))}
      </div>
    </div>
  )
}
