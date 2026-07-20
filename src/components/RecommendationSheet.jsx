import { Icon } from './Icons.jsx'

export function RecommendationSheet({ item, expanded, onExpandedChange, onNext }) {
  return (
    <aside className={`recommendation-sheet ${expanded ? 'is-expanded' : ''}`}>
      <button
        aria-label={expanded ? '收起方案详情' : '展开方案详情'}
        className="sheet-handle"
        onClick={() => onExpandedChange(!expanded)}
        type="button"
      >
        <span />
      </button>

      <header className="sheet-title-row">
        <div className="sheet-pin"><Icon name="pin" size={21} strokeWidth={1.9} /></div>
        <h2 aria-live="polite"><strong>{item.id}</strong> {item.sector} · {item.place}</h2>
        <button
          className="sheet-toggle"
          type="button"
          aria-label={expanded ? '收起' : '展开'}
          onClick={() => onExpandedChange(!expanded)}
        >
          <Icon name={expanded ? 'close' : 'chevronUp'} size={23} />
        </button>
      </header>

      <div className="recommendation-card">
        <div className="recommendation-row recommendation-main">
          <div className="mountain-mark" aria-hidden="true">
            <svg viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="19" />
              <path d="m8 27 7-11 4 7 5-12 10 16M9 30h24M12 33h18" />
            </svg>
          </div>
          <p>{item.advice}</p>
        </div>
        <div className="recommendation-row schedule-row">
          <Icon name="clock" size={21} />
          <span>{item.schedule}</span>
        </div>
        <div className="recommendation-row warning-row">
          <Icon name="warning" size={21} />
          <span>{item.warning}</span>
        </div>

        {expanded && (
          <div className="expanded-detail">
            <p>{item.detail || item.advice}</p>
            <div className="detail-rule">
              <span>点位状态</span>
              <strong>{item.status}</strong>
            </div>
            <button className="secondary-action" type="button" onClick={onNext}>
              确认准确位置
              <Icon name="check" size={18} />
            </button>
          </div>
        )}

        {!expanded && (
          <button className="primary-action" type="button" onClick={() => onExpandedChange(true)}>
            查看详细方案
            <Icon name="chevronRight" size={22} />
          </button>
        )}
      </div>
    </aside>
  )
}
