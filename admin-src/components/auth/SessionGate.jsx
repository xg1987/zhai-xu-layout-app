import { createContext, useContext, useEffect, useState } from 'react'
const Session = createContext(null)
export const useSession = () => useContext(Session)
export function LogoutControl({ showIdentity = true }) {
 const user = useSession(), [error, setError] = useState('')
 return <span className="session-controls">{showIdentity && <span>{user?.name}</span>}<button onClick={async () => { try { const res = await fetch('/api/logout', { method: 'POST' }); if (!res.ok) throw new Error(); window.location.assign(user?.role === 'admin' ? '/admin/login' : '/login') } catch { setError('退出失败，请重试') } }}>退出登录</button>{error && <span role="alert">{error}</span>}</span>
}
export function SessionGate({ admin, children }) {
 const [user, setUser] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0)
 useEffect(() => {
  const refresh = () => setRevision(v => v + 1)
  window.addEventListener('account-profile-updated', refresh)
  window.addEventListener('online', refresh)
  return () => { window.removeEventListener('account-profile-updated', refresh); window.removeEventListener('online', refresh) }
 }, [])
 useEffect(() => {
  const controller = new AbortController(); setError('')
  fetch(admin ? '/api/admin/access' : '/api/me', { signal: controller.signal }).then(async res => {
   const data = await res.json(); if (controller.signal.aborted) return
   if (res.status === 403) { setError('此账号没有管理员权限'); return }
   if (res.status === 401 || (res.ok && !data.user)) { window.location.replace(admin ? '/admin/login' : '/login'); return }
   if (!res.ok) throw new Error()
   setUser(data.user)
  }).catch(() => { if (!controller.signal.aborted) setError('暂时无法连接服务，请重试') })
  return () => controller.abort()
 }, [admin, revision])
 if (error) return <div className="session-message"><p role="alert">{error}</p><button onClick={() => setRevision(v => v + 1)}>重新连接</button><a href={admin ? '/admin/login' : '/login'}>返回登录</a></div>
 if (!user) return <div className="session-message">正在验证登录状态…</div>
 return <Session.Provider value={user}>{children}</Session.Provider>
}
