import { useState } from 'react'
import { supabase, errText, normPw } from '../lib/supabase'
import { Button, Field, useToast } from '../components/ui'

export default function Account({ profile }) {
  const toast = useToast()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)

  const change = async () => {
    const a = normPw(p1), b = normPw(p2)
    if (a.length < 6) return toast('رمز باید حداقل ۶ کاراکتر باشد', 'bad')
    if (a !== b) return toast('تکرار رمز یکسان نیست', 'bad')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) return toast(errText(error), 'bad')
    setP1(''); setP2('')
    toast('رمز عبور تغییر کرد')
  }

  return (
    <div className="page">
      <div className="profile-card">
        <div className="avatar xl">{profile.full_name.trim()[0]}</div>
        <div>
          <h1>{profile.full_name}</h1>
          <p className="muted"><span dir="ltr">{profile.username}</span> · {profile.role === 'admin' ? 'مدیر' : 'سرپرست'}</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>تغییر رمز عبور</h2></div>
        <div className="form">
          <Field label="رمز جدید" hint="به حروف بزرگ و کوچک حساس نیست"><input className="input" dir="ltr" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
          <Field label="تکرار رمز جدید"><input className="input" dir="ltr" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
          <Button icon="key" loading={busy} onClick={change}>ذخیرهٔ رمز</Button>
        </div>
      </section>

      <InstallHint />

      <Button variant="ghost-danger" icon="logout" className="btn-block" onClick={() => supabase.auth.signOut()}>خروج از حساب</Button>
    </div>
  )
}

function InstallHint() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  if (standalone) return null
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <section className="card install">
      <div className="card-head"><h2>نصب روی گوشی</h2></div>
      {ios ? (
        <p>در Safari دکمهٔ <b>Share</b> (مربع با فلش رو به بالا) را بزنید و <b>Add to Home Screen</b> را انتخاب کنید.</p>
      ) : (
        <p>در Chrome منوی <b>⋮</b> را باز کنید و <b>Install app</b> یا <b>Add to Home screen</b> را بزنید.</p>
      )}
    </section>
  )
}
