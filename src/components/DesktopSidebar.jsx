import { useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { useDismiss } from '../useDismiss.js'

const items = [
  { id: 'projects', label: '项目', icon: 'home' },
  { id: 'review', label: '方案审核', icon: 'review' },
  { id: 'rules', label: '规则库', icon: 'book' },
]

export function DesktopSidebar({ active, onChange, user, onLogout }) {
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef(null)

  useDismiss([accountRef], accountOpen, () => setAccountOpen(false))

  return (
    <aside className="web-sidebar">
      <div className="web-brand">宅序</div>
      <nav aria-label="老师端导航">
        {items.map((item) => (
          <button
            className={active === item.id ? 'is-active' : ''}
            key={item.id}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <Icon name={item.icon} size={24} strokeWidth={1.65} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="web-account-wrap" ref={accountRef}>
        {accountOpen && (
          <div className="account-popover">
            <strong>{user.name}</strong>
            <span>方案审核账号</span>
            <button type="button" onClick={onLogout}>退出登录</button>
          </div>
        )}
        <button className="web-account" aria-expanded={accountOpen} type="button" onClick={() => setAccountOpen((value) => !value)}>
          <span className="account-avatar"><Icon name="user" size={22} /></span>
          <span>{user.name}</span>
          <Icon name="chevronDown" size={17} />
        </button>
      </div>
    </aside>
  )
}
