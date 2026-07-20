import { useState } from 'react'
import { Icon } from './Icons.jsx'

function CompassArt() {
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5)
  return (
    <svg className="auth-compass" viewBox="0 0 200 200" aria-hidden="true">
      <g className="compass-spin">
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
      <circle cx="100" cy="100" r="72" />
      <circle cx="100" cy="100" r="58" />
      <path d="M100 12v16M100 172v16M12 100h16M172 100h16" />
      <text x="100" y="38" textAnchor="middle">北</text>
      <text x="100" y="170" textAnchor="middle">南</text>
      <text x="165" y="104" textAnchor="middle">东</text>
      <text x="35" y="104" textAnchor="middle">西</text>
    </svg>
  )
}

const features = [
  { icon: 'calibrate', text: '罗盘校准 · 方位精准勘定' },
  { icon: 'pin', text: '点位建议 · 五行逐项确认' },
  { icon: 'review', text: '施工交底 · 进度全程可查' },
]

export function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (next) => {
    setMode(next)
    setError('')
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
      <CompassArt />

      <header className="auth-topbar">宅序 · 家居风水调整</header>

      <main className="auth-center">
        <h1 className="auth-headline">家居风水 · 调至有序</h1>

        <section className="auth-card">
          <h2 className="auth-form-title">{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
          <p className="auth-form-sub">
            {mode === 'login' ? '登录后继续你的住宅布局方案' : '注册即可开始首次户型勘定'}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => switchMode('login')}
              role="tab"
              type="button"
            >
              登录
            </button>
            <button
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => switchMode('register')}
              role="tab"
              type="button"
            >
              注册
            </button>
          </div>

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
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'login' ? '请输入密码' : '至少 8 位'}
                required
                type="password"
                value={password}
              />
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
