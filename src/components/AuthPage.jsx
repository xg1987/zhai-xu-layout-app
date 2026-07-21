import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../version.js'
import { Icon } from './Icons.jsx'

function BrandMark({ card = false }) {
  return (
    <div className={`auth-brand ${card ? 'auth-brand--card' : ''}`}>
      <span className="auth-brand-seal" aria-hidden="true">宅</span>
      <span className="auth-brand-copy">
        <strong>宅序</strong>
        <small>家居风水调整平台</small>
      </span>
    </div>
  )
}

function AtmosphereMotion() {
  return (
    <div className="auth-atmosphere" aria-hidden="true">
      <div className="auth-compass">
        <div className="auth-compass-ring auth-compass-ring--outer" />
        <div className="auth-compass-ring auth-compass-ring--inner" />
        <div className="auth-compass-scan"><span /></div>
        <div className="auth-compass-core" />
      </div>
      <div className="auth-amber-breath" />
      <div className="auth-house-echo" />
      <div className="auth-house-aura" />
    </div>
  )
}

function GoldDust() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let frame = 0
    let lastTime = performance.now()

    const resize = () => {
      canvas.width = Math.round(canvas.offsetWidth * dpr)
      canvas.height = Math.round(canvas.offsetHeight * dpr)
    }

    const particles = Array.from({ length: window.innerWidth <= 760 ? 58 : 92 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.65 + Math.random() * 1.55,
      alpha: 0.16 + Math.random() * 0.3,
      speed: 0.000012 + Math.random() * 0.000024,
      phase: Math.random() * Math.PI * 2,
      drift: 0.002 + Math.random() * 0.004,
      glow: Math.random() > 0.68,
    }))

    const draw = (time) => {
      const delta = Math.min(time - lastTime, 32)
      lastTime = time
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((particle) => {
        const shimmer = 0.72 + Math.sin(time * 0.0012 + particle.phase) * 0.28
        const x = particle.x + Math.sin(time * particle.drift * 0.02 + particle.phase) * 0.009
        ctx.beginPath()
        ctx.arc(x * canvas.width, particle.y * canvas.height, particle.radius * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(240, 198, 112, ${particle.alpha * shimmer})`
        ctx.shadowColor = particle.glow ? 'rgba(238, 184, 78, 0.7)' : 'transparent'
        ctx.shadowBlur = particle.glow ? 7 * dpr : 0
        ctx.fill()
        if (!reduced) {
          particle.y -= particle.speed * delta
          if (particle.y < -0.02) particle.y = 1.02
        }
      })
      ctx.shadowBlur = 0
      if (!reduced && !document.hidden) frame = requestAnimationFrame(draw)
    }

    const handleVisibility = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden && !reduced) {
        lastTime = performance.now()
        frame = requestAnimationFrame(draw)
      }
    }

    resize()
    draw(performance.now())
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return <canvas ref={ref} className="auth-dust" aria-hidden="true" />
}

const features = [
  { icon: 'calibrate', title: '精准方案', detail: '量身定制布局方案' },
  { icon: 'pin', title: '点位指导', detail: '关键方位精准标注' },
  { icon: 'review', title: '施工落地', detail: '施工实施 进度可查' },
]

const legalCopy = {
  agreement: ['用户协议', '宅序仅为用户提供住宅布局方案记录、沟通与施工交底工具。具体实施请结合现场条件，由专业人员复核后进行。'],
  privacy: ['隐私政策', '我们仅在登录、方案保存和服务沟通所必需的范围内处理您的手机号与账户资料，并采取合理措施保护信息安全。'],
}

export function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [legalDoc, setLegalDoc] = useState(null)

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setNotice('')
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

  const title = mode === 'login' ? '欢迎回到宅序' : '创建宅序账号'
  const subtitle = mode === 'login' ? '登录后继续完善您的住宅布局方案' : '注册后即可建立您的第一份住宅方案'

  return (
    <div className="auth-page">
      <div className="auth-page-shade" aria-hidden="true" />
      <AtmosphereMotion />
      <GoldDust />

      <header className="auth-topbar">
        <BrandMark />
        <p>理气定向 · 宅居有序 · 家和人安</p>
      </header>

      <main className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-headline">
          <h1 id="auth-headline">
            <span>家居风水，</span>
            <span>调至有序</span>
          </h1>
          <p>科学布局 · 趋吉避凶 · 家宅兴旺</p>
        </section>

        <section className={`auth-card ${mode === 'register' ? 'is-register' : ''}`} aria-label={title}>
          <BrandMark card />
          <div className="auth-card-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label className="auth-field">
                <span className="sr-only">姓名</span>
                <Icon name="user" size={19} strokeWidth={1.65} />
                <input
                  autoComplete="name"
                  maxLength={20}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="请输入您的姓名"
                  required
                  value={name}
                />
              </label>
            )}

            <label className="auth-field">
              <span className="sr-only">手机号</span>
              <Icon name="phone" size={18} strokeWidth={1.65} />
              <input
                autoComplete="tel"
                inputMode="numeric"
                maxLength={11}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                pattern="1\d{10}"
                placeholder="请输入手机号"
                required
                type="tel"
                value={phone}
              />
            </label>

            <label className="auth-field">
              <span className="sr-only">密码</span>
              <Icon name="lock" size={18} strokeWidth={1.65} />
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'login' ? '请输入密码' : '请设置至少 8 位密码'}
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} strokeWidth={1.65} />
              </button>
            </label>

            {mode === 'login' && (
              <button
                className="auth-forgot"
                onClick={() => setNotice('请联系一宸老师协助重置密码')}
                type="button"
              >
                忘记密码？
              </button>
            )}

            {notice && <p className="auth-notice" role="status">{notice}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? '请稍候…' : mode === 'login' ? '登录并继续方案' : '注册并开始方案'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '立即注册' : '直接登录'}
            </button>
          </p>

          <p className="auth-consent">
            <Icon name="shield" size={15} strokeWidth={1.6} />
            登录即代表您已同意
            <button onClick={() => setLegalDoc('agreement')} type="button">《用户协议》</button>
            和
            <button onClick={() => setLegalDoc('privacy')} type="button">《隐私政策》</button>
          </p>
        </section>
      </main>

      <section className="auth-feature-rail" aria-label="平台能力">
        {features.map((feature) => (
          <article key={feature.title}>
            <span><Icon name={feature.icon} size={25} strokeWidth={1.55} /></span>
            <div>
              <strong>{feature.title}</strong>
              <small>{feature.detail}</small>
            </div>
          </article>
        ))}
      </section>

      <p className="auth-mobile-consent">
        <Icon name="shield" size={15} strokeWidth={1.6} />
        登录即代表您已同意
        <button onClick={() => setLegalDoc('agreement')} type="button">《用户协议》</button>
        和
        <button onClick={() => setLegalDoc('privacy')} type="button">《隐私政策》</button>
      </p>

      <footer className="auth-footer">
        <span>© 2026 宅序 · 家居风水调整平台 · v{APP_VERSION}</span>
        <i aria-hidden="true" />
        <span>让每一处空间，都有好气场</span>
      </footer>

      {legalDoc && (
        <div className="auth-legal-backdrop" role="presentation" onMouseDown={() => setLegalDoc(null)}>
          <section
            aria-labelledby="auth-legal-title"
            aria-modal="true"
            className="auth-legal-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button aria-label="关闭" className="auth-legal-close" onClick={() => setLegalDoc(null)} type="button">
              <Icon name="close" size={22} />
            </button>
            <h2 id="auth-legal-title">{legalCopy[legalDoc][0]}</h2>
            <p>{legalCopy[legalDoc][1]}</p>
            <button className="auth-legal-confirm" onClick={() => setLegalDoc(null)} type="button">我知道了</button>
          </section>
        </div>
      )}
    </div>
  )
}
