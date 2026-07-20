import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'

const ORBIT_PATH = 'M100,3 a97,97 0 1,1 -0.01,0'

function CompassArt() {
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5)
  return (
    <svg className="auth-compass" viewBox="0 0 200 200" aria-hidden="true">
      <g className="spin-slow">
        <circle cx="100" cy="100" r="97" />
        <circle cx="100" cy="100" r="88" />
        {ticks.map((angle) => (
          <line
            key={angle}
            x1="100"
            y1="4"
            x2="100"
            y2={angle % 45 === 0 ? 13 : 8.5}
            transform={`rotate(${angle} 100 100)`}
          />
        ))}
      </g>
      <g className="spin-reverse">
        <circle className="ring-dashed" cx="100" cy="100" r="72" />
      </g>
      <g className="spin-crawl">
        <circle cx="100" cy="100" r="58" />
        <path d="M100 12v16M100 172v16M12 100h16M172 100h16" />
      </g>
      <circle cx="100" cy="100" r="44" opacity="0.55" />
      <text x="100" y="38" textAnchor="middle">北</text>
      <text x="100" y="170" textAnchor="middle">南</text>
      <text x="165" y="104" textAnchor="middle">东</text>
      <text x="35" y="104" textAnchor="middle">西</text>
      <circle className="orbit-dot" r="1.7">
        <animateMotion dur="16s" repeatCount="indefinite" path={ORBIT_PATH} />
      </circle>
      <circle className="orbit-dot orbit-dot--trail" r="1.1">
        <animateMotion begin="-0.45s" dur="16s" repeatCount="indefinite" path={ORBIT_PATH} />
      </circle>
    </svg>
  )
}

function GoldDust() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      speed: 0.0002 + Math.random() * 0.0006,
      drift: (Math.random() - 0.5) * 0.0002,
      twinkle: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        const alpha = Math.max(0.06, 0.24 + 0.3 * Math.sin(p.twinkle))
        ctx.beginPath()
        ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(246, 219, 158, ${alpha})`
        ctx.fill()
      }
    }

    const tick = () => {
      for (const p of particles) {
        p.y -= p.speed
        p.x += p.drift
        p.twinkle += 0.02
        if (p.y < -0.02) {
          p.y = 1.02
          p.x = Math.random()
        }
      }
      draw()
      raf = requestAnimationFrame(tick)
    }

    if (reduced) draw()
    else tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="auth-dust" aria-hidden="true" />
}

const features = [
  { icon: 'calibrate', text: '罗盘校准 · 方位精准勘定' },
  { icon: 'pin', text: '点位建议 · 五行逐项确认' },
  { icon: 'review', text: '施工交底 · 进度全程可查' },
]

const HEADLINE = '家居风水 · 调至有序'

export function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cardRef = useRef(null)

  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  const tiltCard = (event) => {
    const card = cardRef.current
    if (!card) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = card.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    card.style.transform = `perspective(950px) rotateY(${(x * 6).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`
  }

  const resetTilt = () => {
    if (cardRef.current) cardRef.current.style.transform = ''
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const isLogin = mode === 'login'
      const res = await fetch(isLogin ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLogin ? { phone, password } : { name, phone, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '操作失败，请重试')
        return
      }
      onAuthed(data.user)
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <CompassArt />
      <GoldDust />

      <header className="auth-topbar">宅序 · 家居风水调整</header>

      <main className="auth-center">
        <h1 className="auth-headline" aria-label={HEADLINE}>
          {HEADLINE.split('').map((char, index) =>
            char === ' ' ? (
              <span aria-hidden="true" className="auth-headline-gap" key={index} />
            ) : (
              <span aria-hidden="true" key={index} style={{ animationDelay: `${0.15 + index * 0.06}s` }}>
                {char}
              </span>
            ),
          )}
        </h1>

        <section
          className="auth-card"
          ref={cardRef}
          onPointerMove={tiltCard}
          onPointerLeave={resetTilt}
        >
          <h2 className="auth-form-title">{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
          <p className="auth-form-sub">
            {mode === 'login' ? '登录后继续你的住宅布局方案' : '注册即可开始首次户型勘定'}
          </p>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                姓名
                <input
                  autoComplete="name"
                  maxLength={20}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="怎么称呼您"
                  required
                  value={name}
                />
              </label>
            )}
            <label>
              手机号
              <input
                autoComplete="tel"
                inputMode="numeric"
                maxLength={11}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                pattern="1\d{10}"
                placeholder="11 位手机号"
                required
                type="tel"
                value={phone}
              />
            </label>
            <label>
              密码
              <span className="auth-password">
                <input
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'login' ? '请输入密码' : '至少 8 位'}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} strokeWidth={1.7} />
                </button>
              </span>
            </label>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '立即注册' : '直接登录'}
            </button>
          </p>
        </section>
      </main>

      <ul className="auth-features">
        {features.map((feature) => (
          <li key={feature.icon}>
            <Icon name={feature.icon} size={17} strokeWidth={1.7} />
            {feature.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
