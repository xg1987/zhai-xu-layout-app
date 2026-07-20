import { useState } from 'react'
import { Icon } from './Icons.jsx'

export function DesktopInspector({ item, onNext }) {
  const [showRule, setShowRule] = useState(false)

  return (
    <aside className="web-inspector" aria-live="polite">
      <header className="inspector-title">
        <Icon name="pin" size={29} strokeWidth={1.7} />
        <h2><strong>{item.id}</strong> {item.sector} · {item.place}</h2>
      </header>

      <section className="inspector-section advice-section">
        <h3>布局建议</h3>
        <div className="inspector-value">
          <div className="desktop-mountain-mark" aria-hidden="true">
            <svg viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="19" />
              <path d="m8 27 7-11 4 7 5-12 10 16M9 30h24M12 33h18" />
            </svg>
          </div>
          <p>{item.advice}</p>
        </div>
      </section>

      <section className="inspector-section">
        <h3>实施节点</h3>
        <div className="inspector-value">
          <span className="inspector-icon"><Icon name="clock" size={26} /></span>
          <p>{item.schedule}</p>
        </div>
      </section>

      <section className="inspector-section warning-section">
        <h3>待确认</h3>
        <div className="inspector-value">
          <span className="inspector-icon"><Icon name="warning" size={30} /></span>
          <p>{item.warning.replace('待确认：', '')}</p>
        </div>
      </section>

      {showRule && (
        <div className="rule-evidence">
          <span>规则依据</span>
          <p>该建议来自当前项目的专家口述记录，正式施工参数仍需老师复核。</p>
        </div>
      )}

      <div className="inspector-actions">
        <button className="web-primary-action" type="button" onClick={() => setShowRule((value) => !value)}>
          <Icon name="book" size={21} />
          查看规则依据
        </button>
        <button className="web-secondary-action" type="button" onClick={onNext}>
          <Icon name="check" size={21} />
          确认准确位置
        </button>
      </div>
    </aside>
  )
}
