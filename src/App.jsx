import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, errText } from './lib/supabase'
import { syncServerClock } from './lib/clock'
import { AccessCtx, useAccess, can } from './lib/access'
import { Icon, Spinner, ToastProvider, Button } from './components/ui'
import Login from './pages/Login'
import Account from './pages/Account'
import Entry from './pages/Entry'
import BaseInfo from './pages/BaseInfo'
import Purge from './pages/Purge'
import { Users } from './pages/People'

const Reports = lazy(() => import('./pages/Reports'))

/** Tabs in display order; each is shown only with one of the listed permissions. */
const ALL_TABS = [
  { id: 'reports', label: 'گزارش‌ها', icon: 'chart', perms: ['reports_staff', 'reports_production', 'reports_sales'] },
  { id: 'entry', label: 'ثبت روزانه', short: 'ثبت', icon: 'cal', perms: ['entry_production', 'entry_sales'] },
  { id: 'base', label: 'اطلاعات پایه', short: 'اطلاعات', icon: 'box' },
  { id: 'users', label: 'حساب‌های کاربری', short: 'حساب‌ها', icon: 'key', perms: ['users'] },
  { id: 'purge', label: 'پاک‌سازی داده‌ها', icon: 'trash', perms: ['data_purge'], desktopOnly: true },
  { id: 'account', label: 'حساب من', short: 'من', icon: 'user' },
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
  const [access, setAccess] = useState(null)
  const [profileErr, setProfileErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  const loadProfile = useCallback(async () => {
    if (!uid) { setProfile(null); setAccess(null); return }
    setProfileErr('')
    syncServerClock()
    const [p, a] = await Promise.all([supabase.from('profiles').select('*').eq('id', uid).maybeSingle(), supabase.rpc('my_access')])
    if (p.error || a.error) return setProfileErr(errText(p.error || a.error))
    if (!p.data) return setProfileErr('این حساب دیگر دسترسی ندارد. با مدیر تماس بگیرید.')
    if (!p.data.active || !a.data) return setProfileErr('حساب شما غیرفعال شده است. با مدیر تماس بگیرید.')
    setProfile(p.data)
    setAccess(a.data)
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
  if (!profile || !access) return <Splash />
  return (
    <AccessCtx.Provider value={access}>
      <Shell profile={profile} reloadProfile={loadProfile} />
    </AccessCtx.Provider>
  )
}

const Splash = () => (
  <div className="page-center full"><div className="logo pulse-soft"><Icon name="clock" size={30} /></div><Spinner /></div>
)

function Shell({ profile, reloadProfile }) {
  const access = useAccess()
  const tabs = ALL_TABS.filter((t) => !t.perms || can(access, ...t.perms))
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1)
    return tabs.some((t) => t.id === h) ? h : tabs[0].id
  })
  const [workers, setWorkers] = useState([])
  const [navKey, setNavKey] = useState(0)

  const loadWorkers = useCallback(async () => {
    const { data } = await supabase.from('workers').select('*').order('full_name')
    setWorkers(data || [])
  }, [])
  useEffect(() => { loadWorkers() }, [loadWorkers])

  const go = (id) => {
    setTab(id)
    setNavKey((k) => k + 1) // re-open a section from its start (e.g. back to the base-info hub)
    history.replaceState(null, '', '#' + id)
    window.scrollTo({ top: 0 })
    if (id === 'base' || id === 'reports') loadWorkers()
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
        <div className="side-user"><div className="avatar">{profile.full_name.trim()[0]}</div><div><b>{profile.full_name}</b><small className="muted">{access.role}</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand"><span className="logo sm"><Icon name="clock" size={18} /></span><b>رویای بیتا</b><span className="role-chip">{access.role}</span></div>
          <button className="avatar sm" aria-label="حساب من" onClick={() => go('account')}>{profile.full_name.trim()[0]}</button>
        </header>
        <div key={`${tab}-${navKey}`} className="view">
          {tab === 'reports' && <Suspense fallback={<div className="page-center"><Spinner size={28} /></div>}><Reports workers={workers} /></Suspense>}
          {tab === 'entry' && <Entry />}
          {tab === 'base' && <BaseInfo workers={workers} reloadWorkers={loadWorkers} me={profile} />}
          {tab === 'users' && can(access, 'users') && <Users me={profile} onMeChanged={reloadProfile} />}
          {tab === 'purge' && can(access, 'data_purge') && <Purge />}
          {tab === 'account' && <Account profile={profile} onChanged={reloadProfile} onPurge={() => go('purge')} />}
        </div>
      </main>

      <nav className="bottom-nav">
        {tabs.filter((t) => !t.desktopOnly).map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.short || t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
