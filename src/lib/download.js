/** Save a file: share sheet on iOS / installed app / in-app browsers, normal download elsewhere. */
export async function saveBlob(blob, name) {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
  if (ios || standalone || /Telegram|Instagram|WhatsApp|; wv\)/i.test(ua)) {
    const file = new File([blob], name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
