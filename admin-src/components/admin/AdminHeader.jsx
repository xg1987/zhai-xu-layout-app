import { useEffect, useRef, useState } from 'react'
import { LogoutControl, useSession } from '../auth/SessionGate.jsx'
import './shell.css'
const navigation = [
 ['overview', '/admin/overview', '概览'], ['accounts', '/admin', '账号管理'],
 ['invitations', '/admin/invitations', '邀请码'], ['models', '/admin/models', '图片识别'], ['usage', '/admin/usage', '用量费用'],
 ['events', '/admin/events', '操作日志'],
]
export function AdminIcon({ name }) {
 const paths = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  accounts: <><circle cx="9" cy="8" r="3.5"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3.5 3.5 0 0 1 0 7M18 15a5 5 0 0 1 3 4v2"/></>,
  invitations: <><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Z"/><path d="M15 7v3m0 3v2m0 2v2"/></>,
  models: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
  usage: <><path d="M5 21V11M12 21V7M19 21V3M3 21h19"/></>,
  events: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
 }
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
function Navigation({ active, compact = false }) {
 return <nav className="admin-navigation" aria-label="管理导航">{navigation.map(([key, href, name]) => <a key={key} href={href} aria-current={active === key ? 'page' : undefined} aria-label={name} className={`nav-item nav-${key}`}><span className={`nav-icon-tile tile-${key}`}><AdminIcon name={key}/></span><span className="nav-item-label">{name}</span>{compact && <span className="nav-item-tooltip" aria-hidden="true">{name}</span>}{active === key && <i aria-hidden="true"/>}</a>)}</nav>
}
export default function AdminHeader({ active = 'accounts' }) {
 const user = useSession(), menu = useRef(null)
 const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('zx.admin.nav-collapsed.v1') !== 'false' } catch { return true } })
 function toggleNavigation() { const next = !collapsed; setCollapsed(next); try { localStorage.setItem('zx.admin.nav-collapsed.v1', String(next)) } catch { /* Navigation works without storage. */ } }
 const label = active === 'settings' ? '系统设置' : navigation.find(item => item[0] === active)?.[2] || '管理后台'
 return <>
  <aside className="admin-sidebar" data-collapsed={collapsed}><div className="admin-sidebar-head"><div className="admin-brand"><AdminBrand/><span>管理后台</span></div><button className="nav-collapse-toggle" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!collapsed} aria-controls="desktop-admin-navigation" onClick={toggleNavigation}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 4v16"/><path d={collapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'}/></svg></button></div><div id="desktop-admin-navigation" className="desktop-admin-navigation"><Navigation active={active} compact={collapsed}/></div></aside>
  <header className="admin-topbar">
   <button className="admin-menu-toggle" aria-label="打开管理导航" onClick={() => menu.current.showModal()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
   <div className="admin-breadcrumb"><span>管理后台</span><i>/</i><strong>{label}</strong></div>
   <AdminAccountMenu user={user} active={active}/>
  </header>
  <dialog className="admin-mobile-menu" ref={menu} aria-label="管理导航菜单" onClick={e => { if (e.target === e.currentTarget) menu.current.close() }}><div><div className="admin-mobile-brand"><AdminBrand/><button aria-label="关闭管理导航" onClick={() => menu.current.close()}>×</button></div><Navigation active={active}/></div></dialog>
 </>
}

function AdminBrand() {
 return <div className="brand"><svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.2"/><path d="m24 1 5 18 18 5-18 5-5 18-5-18L1 24l18-5Z" fill="currentColor" opacity=".9"/><path d="m24 6 0 18 17 0-13 4-4 13V24H7l13-4Z" fill="white" opacity=".9"/></svg><h1>家居风水</h1></div>
}

function AdminAccountMenu({ user, active }) {
 const [open, setOpen] = useState(false)
 const container = useRef(null), trigger = useRef(null)
 useEffect(() => {
  if (!open) return
  function onPointerDown(event) { if (!container.current?.contains(event.target)) setOpen(false) }
  function onKeyDown(event) { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('focusin', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('focusin', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
 }, [open])
 return <div className="admin-account" ref={container}>
  <button ref={trigger} type="button" className="admin-current-user" aria-label="账户菜单" aria-expanded={open} aria-controls="admin-account-panel" onClick={() => setOpen(value => !value)}>
   <span className="admin-avatar">{user?.name?.slice(0, 1) || '管'}</span><span><strong>{user?.name}</strong></span>
   <svg className="account-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
  </button>
  {open && <div id="admin-account-panel" className="admin-account-panel" role="region" aria-label="账户操作">
   <div className="admin-account-identity"><strong>{user?.name}</strong><span>{user?.phone}<i>管理员</i></span></div>
   {active === 'settings'
    ? <div className="admin-account-action admin-account-current" aria-current="page"><AdminIcon name="settings"/><span>系统设置</span><span className="admin-account-current-label">当前页面</span></div>
    : <a className="admin-account-action" href="/admin/settings"><AdminIcon name="settings"/><span>系统设置</span><span className="admin-account-arrow" aria-hidden="true">→</span></a>}
   <div className="admin-account-signout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5v16h5M10 12h11m-4-4 4 4-4 4"/></svg><LogoutControl showIdentity={false}/></div>
  </div>}
 </div>
}
