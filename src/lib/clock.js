import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let offset = 0 // serverMs - deviceMs
let synced = null

/** Measures the device-vs-server clock offset once per session (round-trip corrected). */
export function syncServerClock() {
  if (synced) return synced
  synced = (async () => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    const t1 = Date.now()
    if (!error && data) offset = Date.parse(data) - (t0 + t1) / 2
    return offset
  })()
  return synced
}
export const serverNow = () => Date.now() + offset

/** Re-renders every second with server-corrected "now". */
export function useNow(active = true) {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    if (!active) return
    syncServerClock().then(() => setNow(serverNow()))
    const id = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
