import { useEffect, useRef } from 'react'

const POSTER = '/assets/auth-residential-video-poster-v2.jpg'
const VIDEO = '/assets/auth-residential-loop-v2.mp4'

export default function ResidentialScene() {
  const ref = useRef(null)
  useEffect(() => {
    const video = ref.current
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    const fallback = () => { video.dataset.ready = 'false' }
    const playing = () => {
      if (!disposed && !reduced.matches) video.dataset.ready = 'true'
    }
    const sync = () => {
      if (disposed) return
      if (reduced.matches) {
        video.pause()
        fallback()
        if (video.hasAttribute('src')) {
          video.removeAttribute('src')
          video.load()
        }
        return
      }
      if (document.hidden) { video.pause(); return }
      if (!video.hasAttribute('src')) {
        video.src = VIDEO
        video.load()
      }
      video.play()?.catch(() => { if (!disposed) fallback() })
    }
    video.muted = true
    video.addEventListener('playing', playing)
    video.addEventListener('error', fallback)
    document.addEventListener('visibilitychange', sync)
    reduced.addEventListener('change', sync)
    sync()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', sync)
      reduced.removeEventListener('change', sync)
      video.removeEventListener('playing', playing)
      video.removeEventListener('error', fallback)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [])
  return (
    <div className="residential-scene" aria-hidden="true">
      <img src={POSTER} alt="" fetchPriority="high" />
      <video ref={ref} poster={POSTER} autoPlay loop muted playsInline preload="metadata" tabIndex={-1} disablePictureInPicture />
    </div>
  )
}
