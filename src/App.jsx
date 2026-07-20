import { useMemo, useState } from 'react'
import { BottomNav } from './components/BottomNav.jsx'
import { ConstructionChecklist } from './components/ConstructionChecklist.jsx'
import { DesktopWorkspace } from './components/DesktopWorkspace.jsx'
import { Icon } from './components/Icons.jsx'
import { MobileConsult, MobileHome, MobileProfile } from './components/MobilePages.jsx'
import { PlanCanvas } from './components/PlanCanvas.jsx'
import { RecommendationSheet } from './components/RecommendationSheet.jsx'
import { checklistGroups, recommendations } from './data.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('plan')
  const [selectedId, setSelectedId] = useState('02')
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [activeNav, setActiveNav] = useState('projects')
  const [confirmedIds, setConfirmedIds] = useState([])
  const [gridAngle, setGridAngle] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCalibrating, setMobileCalibrating] = useState(false)
  const [menuFeedback, setMenuFeedback] = useState('')

  const selected = useMemo(
    () => recommendations.find((item) => item.id === selectedId) || recommendations[0],
    [selectedId],
  )

  const selectPoint = (id) => {
    setSelectedId(id)
    setSheetExpanded(false)
  }

  const confirmAndSelectNextPoint = () => {
    setConfirmedIds((current) => current.includes(selectedId) ? current : [...current, selectedId])
    const index = recommendations.findIndex((item) => item.id === selectedId)
    const next = recommendations[(index + 1) % recommendations.length]
    setSelectedId(next.id)
    setSheetExpanded(false)
  }

  const shareCurrentProject = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setMenuFeedback('方案链接已复制')
    } catch {
      setMenuFeedback('方案链接已准备')
    }
  }

  const mobileHeader = {
    home: ['宅序', '让每个建议落到准确位置'],
    projects: ['罗莉的住宅方案', confirmedIds.length ? `空间已确认 · ${confirmedIds.length}/5点位已复核` : '空间已确认 · 5个建议点位'],
    consult: ['咨询', '一宸老师 · 方案沟通'],
    profile: ['我的', '账户与方案设置'],
  }[activeNav]

  return (
    <div className="product-root">
      <main className="app-shell mobile-shell">
        <header className="app-header">
          {activeNav === 'projects' ? (
            <button className="header-icon" type="button" aria-label="返回首页" onClick={() => setActiveNav('home')}>
              <Icon name="back" size={27} strokeWidth={1.7} />
            </button>
          ) : <span className="header-spacer" />}
          <div>
            <h1>{mobileHeader[0]}</h1>
            <p>{mobileHeader[1]}</p>
          </div>
          <button className="header-icon" type="button" aria-label="更多操作" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((value) => !value)}>
            <Icon name="more" size={27} />
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="mobile-more-menu">
            <button type="button" onClick={shareCurrentProject}>分享当前方案</button>
            <button
              type="button"
              onClick={() => {
                setActiveNav('projects')
                setActiveTab('plan')
                setMobileCalibrating((value) => !value)
                setMobileMenuOpen(false)
              }}
            >
              {mobileCalibrating ? '结束方位校准' : '重新校准'}
            </button>
            <button type="button" onClick={() => { setActiveNav('profile'); setMobileMenuOpen(false) }}>项目设置</button>
            {menuFeedback && <span>{menuFeedback}</span>}
          </div>
        )}

        {activeNav === 'projects' && <div className="view-tabs" role="tablist" aria-label="方案视图">
          <button
            aria-selected={activeTab === 'plan'}
            className={activeTab === 'plan' ? 'is-active' : ''}
            onClick={() => setActiveTab('plan')}
            role="tab"
            type="button"
          >
            平面图
          </button>
          <button
            aria-selected={activeTab === 'checklist'}
            className={activeTab === 'checklist' ? 'is-active' : ''}
            onClick={() => {
              setActiveTab('checklist')
              setSheetExpanded(false)
            }}
            role="tab"
            type="button"
          >
            施工清单
          </button>
        </div>}

        <div className={`content-region ${activeNav === 'projects' ? '' : 'is-simple'}`}>
          {activeNav === 'home' && <MobileHome onOpenProject={() => setActiveNav('projects')} />}
          {activeNav === 'consult' && <MobileConsult />}
          {activeNav === 'profile' && <MobileProfile />}
          {activeNav === 'projects' && (activeTab === 'plan' ? (
            <>
              <PlanCanvas
                recommendations={recommendations}
                selectedId={selectedId}
                onSelect={selectPoint}
                gridAngle={gridAngle}
                confirmedIds={confirmedIds}
              />
              {mobileCalibrating && (
                <label className="mobile-calibration-control">
                  <span>校准正北：{gridAngle}°</span>
                  <input
                    aria-label="手机方位线角度"
                    max="30"
                    min="-30"
                    onInput={(event) => setGridAngle(Number(event.currentTarget.value))}
                    type="range"
                    value={gridAngle}
                  />
                </label>
              )}
              <RecommendationSheet
                item={selected}
                expanded={sheetExpanded}
                onExpandedChange={setSheetExpanded}
                onNext={confirmAndSelectNextPoint}
              />
            </>
          ) : (
            <ConstructionChecklist groups={checklistGroups} />
          ))}
        </div>

        <BottomNav
          active={activeNav}
          onChange={(next) => {
            setActiveNav(next)
            setMobileMenuOpen(false)
          }}
        />
      </main>

      <DesktopWorkspace
        activeTab={activeTab}
        checklistGroups={checklistGroups}
        onNext={confirmAndSelectNextPoint}
        onSelectPoint={selectPoint}
        onTabChange={(tab) => {
          setActiveTab(tab)
          setSheetExpanded(false)
        }}
        recommendations={recommendations}
        selected={selected}
        selectedId={selectedId}
        gridAngle={gridAngle}
        onGridAngleChange={setGridAngle}
        confirmedIds={confirmedIds}
      />
    </div>
  )
}
