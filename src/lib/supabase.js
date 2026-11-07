import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://yfoyhlfvbveukdonuvug.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_91Sj0hYd1juCn3D5dOrEdw_9V-ZBE_x'
export const LOGIN_DOMAIN = 'bita.local'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export const usernameToEmail = (u) => `${u.trim().toLowerCase()}@${LOGIN_DOMAIN}`

/** Turns Supabase / Postgres errors into a readable Persian message. */
export function errText(e) {
  if (!e) return 'خطای ناشناخته'
  const m = e.message || String(e)
  if (/Invalid login credentials/i.test(m)) return 'نام کاربری یا رمز عبور اشتباه است'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'اتصال به سرور برقرار نشد؛ اینترنت را بررسی کنید'
  if (/JWT|session/i.test(m)) return 'نشست شما منقضی شده؛ دوباره وارد شوید'
  return m
}

/** Calls the admin-users edge function and surfaces its Persian error text. */
export async function adminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await error.context.json()
      if (j?.error) msg = j.error
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  return data
}
