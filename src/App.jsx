import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, errText } from './lib/supabase'
import { syncServerClock } from './lib/clock'
import { Icon, Spinner, ToastProvider, Button } from './components/ui'
import Login from './pages/Login'
import Account from './pages/Account'
import Board from './pages/Board'
import { Workers, Users } from './pages/People'
import { Stages, Records } from './pages/Admin'

const Reports = lazy(() => import('./pages/Reports'))

const SUPERVISOR_TABS = [
  { id: 'board', label: 'ثبت', icon: 'clock' },
  { id: 'workers', label: 'نیروها', icon: 'users' },
  { id: 'account', label: 'حساب', icon: 'user' },
]
const ADMIN_TABS = [
  { id: 'board', label: 'ثبت و وضعیت', short: 'ثبت', icon: 'live' },
  { id: 'reports', label: 'گزارش‌ها', icon: 'chart' },
  { id: 'workers', label: 'نیروها', icon: 'users' },
  { id: 'stages', label: 'مراحل و استاندارد', short: 'مراحل', icon: 'layers' },
  { id: 'records', label: 'اصلاح ثبت‌ها', short: 'اصلاح', icon: 'edit' },
  { id: 'users', label: 'کاربران', icon: 'key' },
  { id: 'account', label: 'حساب', icon: 'user' },
]
const MOBILE_HIDDEN = new Set(['account', 'users']) // reachable from the avatar menu on mobile

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
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data, error }) => {
      if (error) setProfileErr(errText(error))
      else if (!data) setProfileErr('این حساب دیگر دسترسی ندارد. با مدیر تماس بگیرید.')
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
  const tabs = isAdmin ? ADMIN_TABS : SUPERVISOR_TABS
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1)
    return tabs.some((t) => t.id === h) ? h : tabs[0].id
  })
  const [workers, setWorkers] = useState([])
  const [menu, setMenu] = useState(false)

  const loadWorkers = useCallback(async () => {
    const { data } = await supabase.from('workers').select('*').order('full_name')
    setWorkers(data || [])
  }, [])
  useEffect(() => { loadWorkers() }, [loadWorkers])

  const go = (id) => {
    setTab(id)
    setMenu(false)
    history.replaceState(null, '', '#' + id)
    window.scrollTo({ top: 0 })
    if (id === 'workers' || id === 'reports' || id === 'records') loadWorkers()
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>بیتا</b></div>
        <nav>
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-user"><div className="avatar">{profile.full_name.trim()[0]}</div><div><b>{profile.full_name}</b><small className="muted">{isAdmin ? 'مدیر' : 'سرپرست'}</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>بیتا</b><span className="role-chip">{isAdmin ? 'مدیر' : 'سرپرست'}</span></div>
          <div className="menu-wrap">
            <button className="avatar sm" aria-label="منوی حساب" aria-expanded={menu} onClick={() => setMenu(!menu)}>{profile.full_name.trim()[0]}</button>
            {menu && (
              <div className="menu" role="menu">
                {isAdmin && <button role="menuitem" onClick={() => go('users')}><Icon name="key" size={18} />کاربران سامانه</button>}
                <button role="menuitem" onClick={() => go('account')}><Icon name="user" size={18} />حساب من</button>
                <button role="menuitem" className="danger" onClick={() => supabase.auth.signOut()}><Icon name="logout" size={18} />خروج</button>
              </div>
            )}
          </div>
        </header>
        <div key={tab} className="view" onClick={() => menu && setMenu(false)}>
          {tab === 'board' && <Board isAdmin={isAdmin} />}
          {tab === 'workers' && <Workers workers={workers} reload={loadWorkers} isAdmin={isAdmin} me={profile} />}
          {tab === 'account' && <Account profile={profile} />}
          {isAdmin && tab === 'reports' && <Suspense fallback={<div className="page-center"><Spinner size={28} /></div>}><Reports workers={workers} /></Suspense>}
          {isAdmin && tab === 'stages' && <Stages />}
          {isAdmin && tab === 'records' && <Records workers={workers} me={profile} />}
          {isAdmin && tab === 'users' && <Users me={profile} />}
        </div>
      </main>

      <nav className="bottom-nav">
        {tabs.filter((t) => !isAdmin || !MOBILE_HIDDEN.has(t.id)).map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.short || t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
