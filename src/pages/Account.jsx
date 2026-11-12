import { useState } from 'react'
import { supabase, errText, normPw, normUser, adminUsers } from '../lib/supabase'
import { normalizeFa } from '../lib/fmt'
import { Button, Field, useToast } from '../components/ui'
import { useAccess, can } from '../lib/access'

/** Any role: change own display name, username and password. */
export default function Account({ profile, onChanged, onPurge }) {
  const toast = useToast()
  const access = useAccess()
  const [name, setName] = useState(profile.full_name)
  const [user, setUser] = useState(profile.username)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(null)

  const saveInfo = async () => {
    const full_name = normalizeFa(name).trim()
    const username = normUser(user)
    if (!full_name) return toast('نام نمایشی نمی‌تواند خالی باشد', 'bad')
    setBusy('info')
    try {
      await adminUsers({ action: 'self_update', full_name, username })
      toast(username !== profile.username ? `ذخیره شد. از این به بعد با «${username}» وارد شوید.` : 'ذخیره شد')
      onChanged?.()
    } catch (e) { toast(errText(e), 'bad') } finally { setBusy(null) }
  }

  const savePw = async () => {
    const a = normPw(p1)
    if (a.length < 6) return toast('رمز باید حداقل ۶ کاراکتر باشد', 'bad')
    if (a !== normPw(p2)) return toast('تکرار رمز یکسان نیست', 'bad')
    setBusy('pw')
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(null)
    if (error) return toast(/different|same/i.test(error.message) ? 'رمز جدید باید با رمز فعلی فرق داشته باشد' : errText(error), 'bad')
    setP1(''); setP2('')
    toast('رمز عبور تغییر کرد')
  }

  return (
    <div className="page">
      <div className="profile-card">
        <div className="avatar xl">{profile.full_name.trim()[0]}</div>
        <div>
          <h1>{profile.full_name}</h1>
          <p className="muted"><span dir="ltr">{profile.username}</span> · {access.role}</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>نام و نام کاربری</h2></div>
        <div className="form">
          <Field label="نام نمایشی" hint="مثلاً به‌جای «مدیر» بنویسید «گودرزی»"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="نام کاربری" hint="حروف انگلیسی و عدد؛ به حروف بزرگ و کوچک حساس نیست">
            <input className="input" dir="ltr" autoCapitalize="none" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
          </Field>
          <Button icon="check" loading={busy === 'info'} disabled={name === profile.full_name && normUser(user) === profile.username} onClick={saveInfo}>ذخیره</Button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>تغییر رمز عبور</h2></div>
        <div className="form">
          <Field label="رمز جدید" hint="به حروف بزرگ و کوچک حساس است"><input className="input" dir="ltr" type="password" autoCapitalize="none" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
          <Field label="تکرار رمز جدید"><input className="input" dir="ltr" type="password" autoCapitalize="none" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
          <Button icon="key" loading={busy === 'pw'} onClick={savePw}>ذخیرهٔ رمز</Button>
        </div>
      </section>

      {can(access, 'data_purge') && onPurge && <Button variant="ghost" icon="trash" className="btn-block" onClick={onPurge}>پاک‌سازی داده‌ها</Button>}
      <Button variant="ghost-danger" icon="logout" className="btn-block" onClick={() => supabase.auth.signOut()}>خروج از حساب</Button>
    </div>
  )
}
