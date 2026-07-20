import { useState } from 'react'
import { Icon } from './Icons.jsx'

const items = [
  { id: 'projects', label: '项目', icon: 'home' },
  { id: 'review', label: '方案审核', icon: 'review' },
  { id: 'rules', label: '规则库', icon: 'book' },
]

export function DesktopSidebar({ active, onChange }) {
  const [accountOpen, setAccountOpen] = useState(false)

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
      <div className="web-account-wrap">
        {accountOpen && (
          <div className="account-popover" role="status">
            <strong>一宸老师</strong>
            <span>方案审核账号</span>
          </div>
        )}
        <button className="web-account" aria-expanded={accountOpen} type="button" onClick={() => setAccountOpen((value) => !value)}>
          <span className="account-avatar"><Icon name="user" size={22} /></span>
          <span>一宸老师</span>
          <Icon name="chevronDown" size={17} />
        </button>
      </div>
    </aside>
  )
}
