import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthPage } from './components/AuthPage.jsx'
import { BottomNav } from './components/BottomNav.jsx'
import { ConstructionChecklist } from './components/ConstructionChecklist.jsx'
import { DesktopWorkspace } from './components/DesktopWorkspace.jsx'
import { Icon } from './components/Icons.jsx'
import { MobileConsult, MobileHome, MobileProfile, MobileProjects, MobileShop } from './components/MobilePages.jsx'
import { PlanCanvas } from './components/PlanCanvas.jsx'
import { RecommendationSheet } from './components/RecommendationSheet.jsx'
import { checklistGroups, recommendations } from './data.js'
import { useDismiss } from './useDismiss.js'

const PROJECTS_STORAGE_KEY = 'zx_projects'

const demoProject = {
  id: 'demo',
  title: '罗莉的住宅方案',
  note: '空间已确认 · 还有5项细节待补全',
  image: '/assets/demo-floor-plan.png',
  summary: '',
  points: recommendations,
}

const loadSavedProjects = () => {
  try {
    const list = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const buildChecklist = (points) => {
  const groups = new Map()
  for (const point of points) {
    const key = point.schedule || '待安排'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(`${point.sector}${point.place} · ${point.short}`)
  }
  return [...groups].map(([title, items]) => ({ title, items }))
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState('plan')
  const [selectedId, setSelectedId] = useState('02')
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [activeNav, setActiveNav] = useState('home')
  const [projectOpen, setProjectOpen] = useState(false)
  const [confirmedMap, setConfirmedMap] = useState({})
  const [gridAngle, setGridAngle] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCalibrating, setMobileCalibrating] = useState(false)
  const [menuFeedback, setMenuFeedback] = useState('')
  const [messages, setMessages] = useState([
    { id: 1, from: 'teacher', text: '罗莉家的5个重点位置已经整理好了，你可以点开方案逐项确认。' },
  ])
  const [cartIds, setCartIds] = useState([])
  const [savedProjects, setSavedProjects] = useState(loadSavedProjects)
  const [activeProjectId, setActiveProjectId] = useState(() => loadSavedProjects()[0]?.id || 'demo')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
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

  const projects = useMemo(() => [...savedProjects, demoProject], [savedProjects])
  const activeProject = projects.find((item) => item.id === activeProjectId) || demoProject
  const activeRecommendations = activeProject.points
  const confirmedIds = confirmedMap[activeProject.id] || []
  const totalPoints = activeRecommendations.length

  const activeChecklist = useMemo(
    () => (activeProject.id === 'demo' ? checklistGroups : buildChecklist(activeProject.points)),
    [activeProject],
  )

  const selected = useMemo(
    () => activeRecommendations.find((item) => item.id === selectedId) || activeRecommendations[0],
    [selectedId, activeRecommendations],
  )

  const openProject = (id) => {
    const project = projects.find((item) => item.id === id)
    if (!project) return
    setActiveProjectId(id)
    setSelectedId(project.points[0]?.id || '01')
    setSheetExpanded(false)
    setActiveTab('plan')
  }

  const selectPoint = (id) => {
    setSelectedId(id)
    setSheetExpanded(false)
  }

  const confirmAndSelectNextPoint = () => {
    setConfirmedMap((current) => {
      const list = current[activeProject.id] || []
      if (list.includes(selectedId)) return current
      return { ...current, [activeProject.id]: [...list, selectedId] }
    })
    const index = activeRecommendations.findIndex((item) => item.id === selectedId)
    const next = activeRecommendations[(index + 1) % activeRecommendations.length]
    setSelectedId(next.id)
    setSheetExpanded(false)
  }

  const analyzeFloorPlanImage = async (file) => {
    setAnalysisError('')
    setAnalyzing(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('读取图片失败，请重新选择'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/analyze-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl.split(',')[1] || '', mediaType: file.type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'AI 分析失败，请稍后重试')

      const now = new Date()
      const project = {
        id: `p${now.getTime()}`,
        title: `我的住宅方案 · ${now.getMonth() + 1}月${now.getDate()}日`,
        note: `AI 已分析 · ${data.points.length}个建议点位`,
        image: dataUrl,
        summary: data.summary,
        points: data.points,
      }
      setSavedProjects((current) => {
        const next = [project, ...current]
        try {
          localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // 图片过大导致 localStorage 存不下时，方案仅保留在本次会话内存中
        }
        return next
      })
      setActiveProjectId(project.id)
      setSelectedId(data.points[0]?.id || '01')
      setSheetExpanded(false)
      setMessages((current) => [...current, {
        id: nextMessageId.current++,
        from: 'teacher',
        text: `你的户型图我已经分析好了：${data.summary}共整理出 ${data.points.length} 个重点点位，已保存到「项目」里，可以逐项确认。`,
      }])
      setActiveNav('projects')
      setProjectOpen(true)
      setActiveTab('plan')
      return true
    } catch (error) {
      setAnalysisError(error.message)
      return false
    } finally {
      setAnalyzing(false)
    }
  }

  const sendConsultMessage = (text) => {
    setMessages((current) => [...current, { id: nextMessageId.current++, from: 'user', text }])
  }

  const toggleCartItem = (id) => {
    setCartIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const submitCartToConsult = () => {
    sendConsultMessage(`我在商城选好了 ${cartIds.length} 件布置物件，请帮我确认是否合适。`)
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

  const inProjectDetail = activeNav === 'projects' && projectOpen

  const mobileHeader = {
    home: ['宅序', '让每个建议落到准确位置'],
    projects: projectOpen
      ? [activeProject.title, confirmedIds.length ? `空间已确认 · ${confirmedIds.length}/${totalPoints}点位已复核` : `空间已确认 · ${totalPoints}个建议点位`]
      : ['项目', `${projects.length}个住宅方案`],
    shop: ['商城', '方案配套好物'],
    consult: ['咨询', 'AI 布局助手 · 方案沟通'],
    profile: ['我的', '账户与方案设置'],
  }[activeNav]

  if (!authChecked) return null
  if (!user) return <AuthPage onAuthed={setUser} />

  return (
    <div className="product-root">
      <main className="app-shell mobile-shell">
        <header className="app-header">
          {activeNav === 'projects' ? (
            <button
              className="header-icon"
              type="button"
              aria-label={projectOpen ? '返回项目列表' : '返回首页'}
              onClick={() => (projectOpen ? setProjectOpen(false) : setActiveNav('home'))}
            >
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
                setProjectOpen(true)
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

        {inProjectDetail && <div className="view-tabs" role="tablist" aria-label="方案视图" onKeyDown={onTabListKeyDown}>
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

        <div className={`content-region ${inProjectDetail ? '' : 'is-simple'}`}>
          {activeNav === 'home' && (
            <MobileHome
              onOpenProject={() => {
                setActiveNav('projects')
                setProjectOpen(true)
              }}
              onUpload={analyzeFloorPlanImage}
              analyzing={analyzing}
              analysisError={analysisError}
              projectTitle={activeProject.title}
              projectNote={activeProject.note}
              planImage={activeProject.image}
              pointCount={totalPoints}
            />
          )}
          {activeNav === 'projects' && !projectOpen && (
            <MobileProjects
              projects={projects}
              activeId={activeProject.id}
              onOpen={(id) => {
                openProject(id)
                setProjectOpen(true)
              }}
            />
          )}
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
          {inProjectDetail && (activeTab === 'plan' ? (
            <>
              <PlanCanvas
                recommendations={activeRecommendations}
                selectedId={selectedId}
                onSelect={selectPoint}
                gridAngle={gridAngle}
                confirmedIds={confirmedIds}
                planImage={activeProject.image}
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
            <ConstructionChecklist groups={activeChecklist} />
          ))}
        </div>

        <BottomNav
          active={activeNav}
          onChange={(next) => {
            setActiveNav(next)
            if (next === 'projects') setProjectOpen(false)
            setMobileMenuOpen(false)
          }}
        />
      </main>

      <DesktopWorkspace
        activeTab={activeTab}
        checklistGroups={activeChecklist}
        onNext={confirmAndSelectNextPoint}
        onSelectPoint={selectPoint}
        onTabChange={switchViewTab}
        recommendations={activeRecommendations}
        selected={selected}
        selectedId={selectedId}
        gridAngle={gridAngle}
        onGridAngleChange={setGridAngle}
        confirmedIds={confirmedIds}
        user={user}
        onLogout={logout}
        cartIds={cartIds}
        onToggleCartItem={toggleCartItem}
        onCheckout={submitCartToConsult}
        messages={messages}
        onSendMessage={sendConsultMessage}
        projects={projects}
        activeProject={activeProject}
        onOpenProject={openProject}
        onUploadFloorPlan={analyzeFloorPlanImage}
        analyzing={analyzing}
        analysisError={analysisError}
      />
    </div>
  )
}
