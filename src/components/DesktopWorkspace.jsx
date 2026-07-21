import { useEffect, useRef, useState } from 'react'
import { BottomNav } from './BottomNav.jsx'
import { ConstructionChecklist } from './ConstructionChecklist.jsx'
import { DesktopInspector } from './DesktopInspector.jsx'
import { Icon } from './Icons.jsx'
import { MobileConsult, MobileHome, MobileProfile, MobileShop } from './MobilePages.jsx'
import { PlanCanvas } from './PlanCanvas.jsx'

const sectionHeaders = {
  home: ['宅序', '让每个建议落到准确位置'],
  shop: ['商城', '方案配套好物'],
  consult: ['咨询', 'AI 布局助手 · 方案沟通'],
  profile: ['我的', '账户与方案设置'],
}

function WebSectionPage({ activeNav, children }) {
  const [title, subtitle] = sectionHeaders[activeNav]
  return (
    <section className="web-section-page">
      <header><div><h1>{title}</h1><p>{subtitle}</p></div></header>
      <div className="web-page-body">{children}</div>
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
  user,
  onLogout,
  cartIds,
  onToggleCartItem,
  onCheckout,
  messages,
  onSendMessage,
  planImage,
  projectTitle,
  onUploadFloorPlan,
  analyzing,
  analysisError,
  hasAnalysis,
}) {
  const [activeNav, setActiveNav] = useState('home')
  const [calibrating, setCalibrating] = useState(false)
  const [exported, setExported] = useState(false)
  const exportTimer = useRef(null)

  useEffect(() => () => clearTimeout(exportTimer.current), [])

  const exportReport = () => {
    const report = [
      projectTitle,
      `空间已确认 · ${recommendations.length}个建议点位`,
      '',
      ...recommendations.map((item) => `${item.id} ${item.sector} · ${item.place}\n${item.advice}\n${item.schedule}\n${item.warning}\n`),
    ].join('\n')
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${projectTitle}.txt`
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
      {activeNav !== 'review' ? (
        <WebSectionPage activeNav={activeNav}>
          {activeNav === 'home' && (
            <MobileHome
              onOpenProject={() => setActiveNav('review')}
              onUpload={async (file) => {
                const ok = await onUploadFloorPlan(file)
                if (ok) setActiveNav('review')
              }}
              analyzing={analyzing}
              analysisError={analysisError}
              projectTitle={projectTitle}
              projectNote={hasAnalysis ? `AI 已分析 · ${recommendations.length}个建议点位` : '空间已确认 · 还有5项细节待补全'}
              planImage={planImage}
              pointCount={recommendations.length}
            />
          )}
          {activeNav === 'shop' && (
            <MobileShop
              cartIds={cartIds}
              onToggle={onToggleCartItem}
              onCheckout={() => {
                onCheckout()
                setActiveNav('consult')
              }}
            />
          )}
          {activeNav === 'consult' && <MobileConsult messages={messages} onSend={onSendMessage} />}
          {activeNav === 'profile' && (
            <MobileProfile
              user={user}
              cartCount={cartIds.length}
              confirmedCount={confirmedIds.length}
              onLogout={onLogout}
            />
          )}
        </WebSectionPage>
      ) : <>

      <header className="web-header">
        <div>
          <h1>{projectTitle}</h1>
          <p>空间已确认 · {recommendations.length}个建议点位</p>
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
              planImage={planImage}
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

      <BottomNav
        active={activeNav === 'review' ? 'projects' : activeNav}
        onChange={(next) => setActiveNav(next === 'projects' ? 'review' : next)}
      />
    </main>
  )
}
