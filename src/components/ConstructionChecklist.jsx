import { useState } from 'react'
import { Icon } from './Icons.jsx'

export function ConstructionChecklist({ groups }) {
  const [selectedItem, setSelectedItem] = useState('')

  return (
    <section className="checklist" aria-label="施工清单">
      <div className="checklist-heading">
        <h2>按施工节点整理</h2>
        <p>共 5 项，确认做法后即可交底</p>
      </div>
      <div className="checklist-groups">
        {groups.map((group, groupIndex) => (
          <div className="checklist-group" key={group.title}>
            <div className="checklist-group-title">
              <span>{String(groupIndex + 1).padStart(2, '0')}</span>
              <h3>{group.title}</h3>
              <small>{group.count}项</small>
            </div>
            <ul>
              {group.items.map((item) => (
                <li className={selectedItem === item ? 'is-selected' : ''} key={item}>
                  <button aria-pressed={selectedItem === item} type="button" onClick={() => setSelectedItem(item)}>
                    <span className="check-circle" />
                    <span>{item}</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {selectedItem && (
        <div className="checklist-selection" role="status">
          <Icon name="check" size={17} />
          已选择：{selectedItem}
        </div>
      )}
    </section>
  )
}
