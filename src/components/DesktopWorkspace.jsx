import { useEffect, useRef, useState } from 'react'
import { ConstructionChecklist } from './ConstructionChecklist.jsx'
import { DesktopInspector } from './DesktopInspector.jsx'
import { DesktopSidebar } from './DesktopSidebar.jsx'
import { Icon } from './Icons.jsx'
import { PlanCanvas } from './PlanCanvas.jsx'

function WebSectionPage({ activeNav, ruleSelection, onRuleSelect, onOpenReview }) {
  if (activeNav === 'projects') {
    return (
      <section className="web-section-page">
        <header><div><h1>项目</h1><p>管理客户住宅方案与当前进度</p></div></header>
        <div className="web-page-body">
          <h2>进行中的项目</h2>
          <button className="web-project-row" type="button" onClick={onOpenReview}>
            <img src="/assets/demo-floor-plan.png" alt="罗莉住宅户型缩略图" />
            <span><strong>罗莉的住宅方案</strong><small>空间已确认 · 5个建议点位</small></span>
            <em>继续审核</em>
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="web-section-page">
      <header><div><h1>规则库</h1><p>维护老师确认过的布局规则与施工模板</p></div></header>
      <div className="web-page-body">
        <h2>规则分类</h2>
        <div className="rule-library-list">
          <button type="button" onClick={() => onRuleSelect('水局规则')}><span>水局规则</span><small>2条待补充</small><Icon name="chevronRight" size={19} /></button>
          <button type="button" onClick={() => onRuleSelect('土局规则')}><span>土局规则</span><small>1条待补充</small><Icon name="chevronRight" size={19} /></button>
          <button type="button" onClick={() => onRuleSelect('入户门处理')}><span>入户门处理</span><small>3条已审核</small><Icon name="chevronRight" size={19} /></button>
        </div>
        {ruleSelection && (
          <div className="rule-selection-detail" role="status">
            <strong>{ruleSelection}</strong>
            <span>已打开该分类，后续可在这里维护触发条件和施工模板。</span>
          </div>
        )}
      </div>
    </section>
  )
}

export function DesktopWorkspace({
  activeTab,
  checklistGroups,
  onNext,
  onSelectPoint,
  onTabChange,
  recommendations,
  selected,
  selectedId,
  gridAngle,
  onGridAngleChange,
  confirmedIds,
}) {
  const [activeNav, setActiveNav] = useState('review')
  const [calibrating, setCalibrating] = useState(false)
  const [exported, setExported] = useState(false)
  const [ruleSelection, setRuleSelection] = useState('')
  const exportTimer = useRef(null)

  useEffect(() => () => clearTimeout(exportTimer.current), [])

  const exportReport = () => {
    const report = [
      '罗莉的住宅方案',
      '空间已确认 · 5个建议点位',
      '',
      ...recommendations.map((item) => `${item.id} ${item.sector} · ${item.place}\n${item.advice}\n${item.schedule}\n${item.warning}\n`),
    ].join('\n')
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '罗莉的住宅方案.txt'
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
    clearTimeout(exportTimer.current)
    exportTimer.current = setTimeout(() => setExported(false), 3000)
  }

  const onTabListKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const next = activeTab === 'plan' ? 'checklist' : 'plan'
    onTabChange(next)
    const tabs = event.currentTarget.querySelectorAll('[role="tab"]')
    tabs[next === 'plan' ? 0 : 1]?.focus()
  }

  return (
    <main className="web-shell">
      <DesktopSidebar active={activeNav} onChange={setActiveNav} />

      {activeNav !== 'review' ? (
        <WebSectionPage
          activeNav={activeNav}
          ruleSelection={ruleSelection}
          onRuleSelect={setRuleSelection}
          onOpenReview={() => setActiveNav('review')}
        />
      ) : <>

      <header className="web-header">
        <div>
          <h1>罗莉的住宅方案</h1>
          <p>空间已确认 · 5个建议点位</p>
        </div>
        <div className="web-header-actions">
          <button
            className={calibrating ? 'is-active' : ''}
            onClick={() => setCalibrating((value) => !value)}
            type="button"
          >
            <Icon name="calibrate" size={21} />
            {calibrating ? '完成校准' : '重新校准'}
          </button>
          <button onClick={exportReport} type="button">
            <Icon name="export" size={21} />
            {exported ? '报告已生成' : '导出报告'}
          </button>
        </div>
      </header>

      <section className="web-canvas-pane">
        <div className="web-view-tabs" role="tablist" aria-label="桌面方案视图" onKeyDown={onTabListKeyDown}>
          <button
            aria-selected={activeTab === 'plan'}
            className={activeTab === 'plan' ? 'is-active' : ''}
            onClick={() => onTabChange('plan')}
            role="tab"
            tabIndex={activeTab === 'plan' ? 0 : -1}
            type="button"
          >
            平面图
          </button>
          <button
            aria-selected={activeTab === 'checklist'}
            className={activeTab === 'checklist' ? 'is-active' : ''}
            onClick={() => onTabChange('checklist')}
            role="tab"
            tabIndex={activeTab === 'checklist' ? 0 : -1}
            type="button"
          >
            施工清单
          </button>
        </div>

        <div className={`web-canvas-content ${calibrating ? 'is-calibrating' : ''}`}>
          {activeTab === 'plan' ? (
            <PlanCanvas
              recommendations={recommendations}
              selectedId={selectedId}
              onSelect={onSelectPoint}
              variant="desktop"
              showFloorControl
              gridAngle={gridAngle}
              confirmedIds={confirmedIds}
            />
          ) : (
            <ConstructionChecklist groups={checklistGroups} />
          )}
          {calibrating && (
            <label className="calibration-note">
              <span>旋转方位线校准正北：{gridAngle}°</span>
              <input
                aria-label="方位线角度"
                max="30"
                min="-30"
                onInput={(event) => onGridAngleChange(Number(event.currentTarget.value))}
                type="range"
                value={gridAngle}
              />
            </label>
          )}
        </div>
      </section>

      <DesktopInspector item={selected} onNext={onNext} />
      </>}
    </main>
  )
}
