import { useState } from 'react'

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
      <main className="auth-card">
        <h1 className="auth-brand">宅序</h1>
        <p className="auth-sub">让每个建议落到准确位置</p>

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
      </main>
    </div>
  )
}
