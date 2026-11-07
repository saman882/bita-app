import { useState } from 'react'
import { supabase, usernameToEmail, errText } from '../lib/supabase'
import { toEn } from '../lib/fmt'
import { Icon, Spinner } from '../components/ui'

export default function Login() {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!u.trim() || !p) return setErr('نام کاربری و رمز عبور را وارد کنید')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(toEn(u)), password: toEn(p) })
    setBusy(false)
    if (error) setErr(errText(error))
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="logo"><Icon name="clock" size={30} stroke={2.2} /></div>
        <h1>بیتا</h1>
        <p className="muted">سامانهٔ حضور، تولید و بهره‌وری نیروها</p>

        <label className="field">
          <span className="field-label">نام کاربری</span>
          <div className="input-ic">
            <Icon name="user" size={18} />
            <input className="input" dir="ltr" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
          </div>
        </label>
        <label className="field">
          <span className="field-label">رمز عبور</span>
          <div className="input-ic">
            <Icon name="key" size={18} />
            <input className="input" dir="ltr" type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
            <button type="button" className="icon-btn eye" onClick={() => setShow(!show)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}><Icon name="eye" size={18} /></button>
          </div>
        </label>
        {err && <div className="form-err"><Icon name="alert" size={16} /> {err}</div>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <Spinner /> : <Icon name="login" size={18} />}<span>ورود</span>
        </button>
      </form>
    </div>
  )
}
