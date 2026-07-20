import { Icon } from './Icons.jsx'

const navItems = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'projects', label: '项目', icon: 'project' },
  { id: 'consult', label: '咨询', icon: 'chat' },
  { id: 'profile', label: '我的', icon: 'user' },
]

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="主要导航">
      {navItems.map((item) => (
        <button
          className={active === item.id ? 'is-active' : ''}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          <Icon name={item.icon} size={23} strokeWidth={1.65} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
