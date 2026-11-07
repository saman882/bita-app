import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, errText } from './lib/supabase'
import { syncServerClock } from './lib/clock'
import { Icon, Spinner, ToastProvider, Button } from './components/ui'
import Login from './pages/Login'
import Today from './pages/Today'
import Account from './pages/Account'
import { Live, Workers, Stages, Records } from './pages/Admin'

const Reports = lazy(() => import('./pages/Reports'))

const WORKER_TABS = [
  { id: 'today', label: 'امروز', icon: 'home' },
  { id: 'reports', label: 'گزارش من', icon: 'chart' },
  { id: 'account', label: 'حساب', icon: 'user' },
]
const ADMIN_TABS = [
  { id: 'live', label: 'زنده', icon: 'live' },
  { id: 'reports', label: 'گزارش‌ها', icon: 'chart' },
  { id: 'workers', label: 'نیروها', icon: 'users' },
  { id: 'stages', label: 'مراحل', icon: 'layers' },
  { id: 'records', label: 'اصلاح', icon: 'edit' },
  { id: 'today', label: 'ثبت من', icon: 'clock' },
  { id: 'account', label: 'حساب', icon: 'user' },
]

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
  useEffect(() => {
    if (!uid) { setProfile(null); return }
    setProfileErr('')
    syncServerClock()
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data, error }) => {
      if (error) setProfileErr(errText(error))
      else if (!data.active) setProfileErr('حساب شما غیرفعال شده است. با مدیر تماس بگیرید.')
      else setProfile(data)
    })
  }, [uid])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  if (profileErr) return (
    <div className="page-center full">
      <p>{profileErr}</p>
      <Button variant="ghost" icon="logout" onClick={() => supabase.auth.signOut()}>خروج</Button>
    </div>
  )
  if (!profile) return <Splash />
  return <Shell profile={profile} />
}

const Splash = () => (
  <div className="page-center full"><div className="logo pulse-soft"><Icon name="clock" size={30} /></div><Spinner /></div>
)

function Shell({ profile }) {
  const isAdmin = profile.role === 'admin'
  const tabs = isAdmin ? ADMIN_TABS : WORKER_TABS
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1)
    return tabs.some((t) => t.id === h) ? h : tabs[0].id
  })
  const [workers, setWorkers] = useState([])

  const loadWorkers = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setWorkers(data || [])
  }, [isAdmin])
  useEffect(() => { loadWorkers() }, [loadWorkers])

  const go = (id) => {
    setTab(id)
    history.replaceState(null, '', '#' + id)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className={`shell ${isAdmin ? 'is-admin' : ''}`}>
      <aside className="side">
        <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>بیتا</b></div>
        <nav>
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-user"><div className="avatar">{profile.full_name.trim()[0]}</div><div><b>{profile.full_name}</b><small className="muted">{isAdmin ? 'مدیر' : 'نیرو'}</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>بیتا</b></div>
          <button className="avatar sm" title="حساب کاربری" aria-label="حساب کاربری" onClick={() => go('account')}>{profile.full_name.trim()[0]}</button>
        </header>
        <div key={tab} className="view">
          {tab === 'today' && <Today profile={profile} />}
          {tab === 'reports' && <Suspense fallback={<div className="page-center"><Spinner size={28} /></div>}><Reports profile={profile} isAdmin={isAdmin} workers={workers} /></Suspense>}
          {tab === 'account' && <Account profile={profile} />}
          {tab === 'live' && <Live workers={workers} />}
          {tab === 'workers' && <Workers workers={workers} reload={loadWorkers} me={profile} />}
          {tab === 'stages' && <Stages />}
          {tab === 'records' && <Records workers={workers} me={profile} />}
        </div>
      </main>

      <nav className="bottom-nav">
        {tabs.filter((t) => !isAdmin || t.id !== 'account').map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
