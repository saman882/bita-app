import { Component } from 'react'

/** Shows the error (and a way out) instead of a blank page if anything crashes while rendering. */
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[bita] crash', error, info?.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page-center full crash">
        <div className="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" /></svg></div>
        <b>مشکلی پیش آمد</b>
        <p className="muted">لطفاً از این صفحه عکس بگیرید و برای پشتیبانی بفرستید.</p>
        <pre className="crash-err" dir="ltr">{String(error?.message || error).slice(0, 400)}</pre>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={() => location.reload()}>تلاش دوباره</button>
          <button className="btn btn-ghost" onClick={() => window.bitaReset?.()}>پاک کردن حافظهٔ اپ</button>
        </div>
      </div>
    )
  }
}
