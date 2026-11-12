import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] })

/** Tap the map to set a point. value: {lat, lng} | null */
export default function MapPicker({ value, onChange, height = 260 }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)

  useEffect(() => {
    const start = value ? [value.lat, value.lng] : [35.6997, 51.338] // Tehran
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(start, value ? 16 : 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.on('click', (e) => onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }))
    map.current = m
    setTimeout(() => m.invalidateSize(), 250)
    return () => { m.remove(); map.current = null; marker.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) { marker.current?.remove(); marker.current = null; return }
    const ll = [value.lat, value.lng]
    if (!marker.current) marker.current = L.marker(ll, { icon: pin }).addTo(m)
    else marker.current.setLatLng(ll)
    if (!m.getBounds().contains(ll)) m.setView(ll, 16)
  }, [value])

  return <div ref={box} className="map-box" style={{ height }} dir="ltr" />
}
