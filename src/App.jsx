import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthPage } from './components/AuthPage.jsx'
import { BottomNav } from './components/BottomNav.jsx'
import { ConstructionChecklist } from './components/ConstructionChecklist.jsx'
import { DesktopWorkspace } from './components/DesktopWorkspace.jsx'
import { Icon } from './components/Icons.jsx'
import { MobileConsult, MobileHome, MobileProfile, MobileShop } from './components/MobilePages.jsx'
import { PlanCanvas } from './components/PlanCanvas.jsx'
import { RecommendationSheet } from './components/RecommendationSheet.jsx'
import { checklistGroups, recommendations } from './data.js'
import { useDismiss } from './useDismiss.js'

export default function App() {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState('plan')
  const [selectedId, setSelectedId] = useState('02')
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [activeNav, setActiveNav] = useState('projects')
  const [confirmedIds, setConfirmedIds] = useState([])
  const [gridAngle, setGridAngle] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCalibrating, setMobileCalibrating] = useState(false)
  const [menuFeedback, setMenuFeedback] = useState('')
  const [messages, setMessages] = useState([
    { id: 1, from: 'teacher', text: '罗莉家的5个重点位置已经整理好了，你可以点开方案逐项确认。' },
  ])
  const [cartIds, setCartIds] = useState([])
  const nextMessageId = useRef(2)
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)

  useDismiss([menuRef, menuButtonRef], mobileMenuOpen, () => setMobileMenuOpen(false))

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }

  useEffect(() => {
    if (!menuFeedback) return
    const timer = setTimeout(() => setMenuFeedback(''), 2400)
    return () => clearTimeout(timer)
  }, [menuFeedback])

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

  const sendConsultMessage = (text) => {
    setMessages((current) => [...current, { id: nextMessageId.current++, from: 'user', text }])
  }

  const toggleCartItem = (id) => {
    setCartIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const submitCartToConsult = () => {
    sendConsultMessage(`我在商城选好了 ${cartIds.length} 件布置物件，麻烦老师帮我确认是否合适。`)
    setActiveNav('consult')
  }

  const shareCurrentProject = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setMenuFeedback('方案链接已复制')
    } catch {
      setMenuFeedback('复制失败，请手动复制浏览器地址')
    }
  }

  const switchViewTab = (tab) => {
    setActiveTab(tab)
    if (tab === 'checklist') setSheetExpanded(false)
  }

  const onTabListKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const next = activeTab === 'plan' ? 'checklist' : 'plan'
    switchViewTab(next)
    const tabs = event.currentTarget.querySelectorAll('[role="tab"]')
    tabs[next === 'plan' ? 0 : 1]?.focus()
  }

  const mobileHeader = {
    home: ['宅序', '让每个建议落到准确位置'],
    projects: ['罗莉的住宅方案', confirmedIds.length ? `空间已确认 · ${confirmedIds.length}/5点位已复核` : '空间已确认 · 5个建议点位'],
    shop: ['商城', '方案配套好物'],
    consult: ['咨询', '一宸老师 · 方案沟通'],
    profile: ['我的', '账户与方案设置'],
  }[activeNav]

  if (!authChecked) return null
  if (!user) return <AuthPage onAuthed={setUser} />

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
          <button ref={menuButtonRef} className="header-icon" type="button" aria-label="更多操作" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((value) => !value)}>
            <Icon name="more" size={27} />
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="mobile-more-menu" ref={menuRef}>
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

        {activeNav === 'projects' && <div className="view-tabs" role="tablist" aria-label="方案视图" onKeyDown={onTabListKeyDown}>
          <button
            aria-selected={activeTab === 'plan'}
            className={activeTab === 'plan' ? 'is-active' : ''}
            onClick={() => switchViewTab('plan')}
            role="tab"
            tabIndex={activeTab === 'plan' ? 0 : -1}
            type="button"
          >
            平面图
          </button>
          <button
            aria-selected={activeTab === 'checklist'}
            className={activeTab === 'checklist' ? 'is-active' : ''}
            onClick={() => switchViewTab('checklist')}
            role="tab"
            tabIndex={activeTab === 'checklist' ? 0 : -1}
            type="button"
          >
            施工清单
          </button>
        </div>}

        <div className={`content-region ${activeNav === 'projects' ? '' : 'is-simple'}`}>
          {activeNav === 'home' && <MobileHome onOpenProject={() => setActiveNav('projects')} />}
          {activeNav === 'shop' && (
            <MobileShop cartIds={cartIds} onToggle={toggleCartItem} onCheckout={submitCartToConsult} />
          )}
          {activeNav === 'consult' && <MobileConsult messages={messages} onSend={sendConsultMessage} />}
          {activeNav === 'profile' && (
            <MobileProfile
              user={user}
              cartCount={cartIds.length}
              confirmedCount={confirmedIds.length}
              onLogout={logout}
            />
          )}
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
        onTabChange={switchViewTab}
        recommendations={recommendations}
        selected={selected}
        selectedId={selectedId}
        gridAngle={gridAngle}
        onGridAngleChange={setGridAngle}
        confirmedIds={confirmedIds}
        user={user}
        onLogout={logout}
      />
    </div>
  )
}
