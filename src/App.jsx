import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, errText } from './lib/supabase'
import { syncServerClock } from './lib/clock'
import { Icon, Spinner, ToastProvider, Button } from './components/ui'
import Login from './pages/Login'
import Account from './pages/Account'
import Entry from './pages/Entry'
import Catalog from './pages/Catalog'
import { Workers, Users, ROLE } from './pages/People'

const Reports = lazy(() => import('./pages/Reports'))

// who sees what
const TABS = {
  supervisor: [
    { id: 'entry', label: 'ثبت روزانه', short: 'ثبت', icon: 'cal' },
    { id: 'workers', label: 'نیروها', icon: 'users' },
    { id: 'account', label: 'حساب من', short: 'حساب', icon: 'user' },
  ],
  admin: [
    { id: 'entry', label: 'ثبت روزانه', short: 'ثبت', icon: 'cal' },
    { id: 'catalog', label: 'محصولات و عملیات', short: 'محصولات', icon: 'box' },
    { id: 'workers', label: 'نیروها', icon: 'users' },
    { id: 'account', label: 'حساب من', short: 'حساب', icon: 'user' },
  ],
  manager: [
    { id: 'reports', label: 'گزارش‌ها', icon: 'chart' },
    { id: 'entry', label: 'ثبت روزانه', short: 'ثبت', icon: 'cal' },
    { id: 'catalog', label: 'محصولات و عملیات', short: 'محصولات', icon: 'box' },
    { id: 'workers', label: 'نیروها', icon: 'users' },
    { id: 'users', label: 'حساب‌های کاربری', short: 'حساب‌ها', icon: 'key' },
    { id: 'account', label: 'حساب من', short: 'من', icon: 'user' },
  ],
}

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  )
}

function Root() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileErr, setProfileErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  const loadProfile = useCallback(() => {
    if (!uid) { setProfile(null); return }
    setProfileErr('')
    syncServerClock()
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data, error }) => {
      if (error) setProfileErr(errText(error))
      else if (!data) setProfileErr('این حساب دیگر دسترسی ندارد. با مدیر تماس بگیرید.')
      else if (!data.active) setProfileErr('حساب شما غیرفعال شده است. با مدیر تماس بگیرید.')
      else if (!TABS[data.role]) setProfileErr('نقش این حساب معتبر نیست.')
      else setProfile(data)
    })
  }, [uid])
  useEffect(() => { loadProfile() }, [loadProfile])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  if (profileErr) return (
    <div className="page-center full">
      <p>{profileErr}</p>
      <Button variant="ghost" icon="logout" onClick={() => supabase.auth.signOut()}>خروج</Button>
    </div>
  )
  if (!profile) return <Splash />
  return <Shell profile={profile} reloadProfile={loadProfile} />
}

const Splash = () => (
  <div className="page-center full"><div className="logo pulse-soft"><Icon name="clock" size={30} /></div><Spinner /></div>
)

function Shell({ profile, reloadProfile }) {
  const role = profile.role
  const isManager = role === 'manager'
  const tabs = TABS[role]
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1)
    return tabs.some((t) => t.id === h) ? h : tabs[0].id
  })
  const [workers, setWorkers] = useState([])

  const loadWorkers = useCallback(async () => {
    const { data } = await supabase.from('workers').select('*').order('full_name')
    setWorkers(data || [])
  }, [])
  useEffect(() => { loadWorkers() }, [loadWorkers])

  const go = (id) => {
    setTab(id)
    history.replaceState(null, '', '#' + id)
    window.scrollTo({ top: 0 })
    if (id === 'workers' || id === 'reports') loadWorkers()
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>رویای بیتا</b></div>
        <nav>
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-user"><div className="avatar">{profile.full_name.trim()[0]}</div><div><b>{profile.full_name}</b><small className="muted">{ROLE[role]}</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>رویای بیتا</b><span className="role-chip">{ROLE[role]}</span></div>
          <button className="avatar sm" aria-label="حساب من" onClick={() => go('account')}>{profile.full_name.trim()[0]}</button>
        </header>
        <div key={tab} className="view">
          {tab === 'entry' && <Entry isManager={isManager} />}
          {tab === 'workers' && <Workers workers={workers} reload={loadWorkers} canDelete={isManager} me={profile} />}
          {tab === 'account' && <Account profile={profile} onChanged={reloadProfile} />}
          {tab === 'catalog' && role !== 'supervisor' && <Catalog />}
          {tab === 'reports' && isManager && <Suspense fallback={<div className="page-center"><Spinner size={28} /></div>}><Reports workers={workers} /></Suspense>}
          {tab === 'users' && isManager && <Users me={profile} />}
        </div>
      </main>

      <nav className="bottom-nav">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.short || t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
