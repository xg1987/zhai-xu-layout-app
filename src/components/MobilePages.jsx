import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../version.js'
import { Icon } from './Icons.jsx'

export function MobileHome({ onOpenProject, onUpload, analyzing = false, analysisError = '', projectTitle = '罗莉的住宅方案', projectNote = '空间已确认 · 还有5项细节待补全', planImage = '/assets/demo-floor-plan.png', pointCount = 5 }) {
  const pickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload?.(file)
  }

  return (
    <section className="mobile-page home-overview" aria-label="首页">
      <div className="home-intro">
        <h2>今天，继续完成住宅方案</h2>
        <p>把待确认的细节处理完，就可以生成完整报告。</p>
      </div>

      <div className="upload-card">
        <h3>上传我的户型图</h3>
        <p>AI 会识别户型格局，找出需要调整的位置并生成布置方案。</p>
        <label className={`upload-button ${analyzing ? 'is-busy' : ''}`}>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="上传户型图"
            disabled={analyzing}
            onChange={pickFile}
            type="file"
          />
          <Icon name={analyzing ? 'clock' : 'plus'} size={18} strokeWidth={1.9} />
          {analyzing ? 'AI 正在分析户型，请稍候…' : '上传户型图，开始 AI 分析'}
        </label>
        {analysisError && <span className="upload-error" role="alert">{analysisError}</span>}
      </div>

      <button className="current-project" type="button" onClick={onOpenProject}>
        <div className="project-thumbnail">
          <img src={planImage} alt="住宅户型缩略图" />
          <span>{pointCount}个点位</span>
        </div>
        <div className="project-summary">
          <span>当前方案</span>
          <h3>{projectTitle}</h3>
          <p>{projectNote}</p>
          <strong>继续查看方案 <Icon name="chevronRight" size={18} /></strong>
        </div>
      </button>

      <div className="home-next">
        <h3>下一步</h3>
        <div><span>01</span><p>确认水局、土局的具体做法</p></div>
        <div><span>02</span><p>核对公共区域的施工范围</p></div>
      </div>
    </section>
  )
}

export function MobileProjects({ projects, activeId, onOpen }) {
  return (
    <section className="mobile-page projects-page" aria-label="项目">
      <div className="home-intro">
        <h2>已生成的住宅方案</h2>
        <p>AI 分析过的户型都会保存在这里，点击任意方案继续查看和确认。</p>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <button
            className={`project-row ${project.id === activeId ? 'is-active' : ''}`}
            key={project.id}
            onClick={() => onOpen(project.id)}
            type="button"
          >
            <img src={project.image} alt={`${project.title}户型缩略图`} />
            <span>
              <strong>{project.title}</strong>
              <small>{project.note || `${project.points.length}个建议点位`}</small>
            </span>
            <Icon name="chevronRight" size={19} />
          </button>
        ))}
      </div>
    </section>
  )
}

export function MobileConsult({ messages, onSend }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const sendMessage = (event) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    onSend(value)
    setDraft('')
  }

  return (
    <section className="mobile-page consult-page" aria-label="咨询">
      <div className="teacher-row">
        <div className="teacher-avatar">AI</div>
        <div><h2>AI 布局助手</h2><p>方案咨询中</p></div>
      </div>
      <div className="message-list" ref={listRef}>
        {messages.map((message) => (
          <p className={message.from === 'user' ? 'message-user' : 'message-teacher'} key={message.id}>
            {message.text}
          </p>
        ))}
      </div>
      <div className="consult-quick" aria-label="常见问题">
        {['水局的具体做法有哪些？', '施工顺序可以调整吗？', '泰山石如何挑选？'].map((question) => (
          <button key={question} type="button" onClick={() => onSend(question)}>
            {question}
          </button>
        ))}
      </div>
      <form className="message-composer" onSubmit={sendMessage}>
        <input
          aria-label="咨询内容"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入要咨询的问题"
          value={draft}
        />
        <button type="submit" aria-label="发送咨询">
          <Icon name="chevronRight" size={20} />
        </button>
      </form>
    </section>
  )
}

const shopCategories = ['全部', '摆件', '绿植', '灯具', '收纳']

const shopProducts = [
  { id: 's1', name: '黄铜罗盘摆件', category: '摆件', price: 268, note: '适配 01 玄关点位', mark: '铜' },
  { id: 's2', name: '琉璃水养绿萝', category: '绿植', price: 89, note: '适配 02 水局布置', mark: '植' },
  { id: 's3', name: '陶土聚宝盆', category: '摆件', price: 158, note: '适配 03 土局布置', mark: '陶' },
  { id: 's4', name: '暖光落地灯', category: '灯具', price: 420, note: '客厅明堂补光', mark: '灯' },
  { id: 's5', name: '樟木收纳箱', category: '收纳', price: 199, note: '杂物归位不挡气口', mark: '樟' },
  { id: 's6', name: '五帝钱挂饰', category: '摆件', price: 68, note: '入户门楣悬挂', mark: '钱' },
]

export function MobileShop({ cartIds, onToggle, onCheckout }) {
  const [activeCategory, setActiveCategory] = useState('全部')

  const visible = activeCategory === '全部'
    ? shopProducts
    : shopProducts.filter((product) => product.category === activeCategory)
  const cartTotal = cartIds.reduce(
    (sum, id) => sum + shopProducts.find((product) => product.id === id).price,
    0,
  )

  return (
    <section className="mobile-page shop-page" aria-label="商城">
      <div className="home-intro">
        <h2>为方案挑选合适的物件</h2>
        <p>按方案中的点位建议，挑选对应的布置好物。</p>
      </div>

      <div className="shop-categories" role="tablist" aria-label="商品分类">
        {shopCategories.map((category) => (
          <button
            aria-selected={activeCategory === category}
            className={activeCategory === category ? 'is-active' : ''}
            key={category}
            onClick={() => setActiveCategory(category)}
            role="tab"
            type="button"
          >
            {category}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {visible.map((product) => {
          const inCart = cartIds.includes(product.id)
          return (
            <article className="shop-card" key={product.id}>
              <div className="shop-card-visual">{product.mark}</div>
              <div className="shop-card-body">
                <h3>{product.name}</h3>
                <p>{product.note}</p>
                <div className="shop-card-footer">
                  <strong>¥{product.price}</strong>
                  <button
                    aria-label={inCart ? `移出清单：${product.name}` : `加入清单：${product.name}`}
                    aria-pressed={inCart}
                    className={inCart ? 'is-added' : ''}
                    onClick={() => onToggle(product.id)}
                    type="button"
                  >
                    <Icon name={inCart ? 'check' : 'plus'} size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {cartIds.length > 0 && (
        <button className="shop-cart-bar" type="button" onClick={onCheckout}>
          <span>已选 {cartIds.length} 件 · 合计 ¥{cartTotal}</span>
          <strong>发给 AI 助手确认 <Icon name="chevronRight" size={16} /></strong>
        </button>
      )}
    </section>
  )
}

export function MobileProfile({ user, cartCount, confirmedCount, onLogout }) {
  const [activeSetting, setActiveSetting] = useState('')
  const settings = ['通知设置', '方案偏好', '收货地址', '关于宅序']
  const shortcuts = [
    { count: 1, label: '方案报告' },
    { count: confirmedCount, label: '确认点位' },
    { count: cartCount, label: '商城清单' },
  ]
  const maskedPhone = user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')

  return (
    <section className="mobile-page profile-page" aria-label="我的">
      <div className="profile-identity">
        <div className="profile-avatar"><Icon name="user" size={30} /></div>
        <div><h2>{user.name}</h2><p>{maskedPhone} · 已保存 1 个住宅项目</p></div>
      </div>
      <div className="profile-shortcuts">
        {shortcuts.map((shortcut) => (
          <button key={shortcut.label} type="button" onClick={() => setActiveSetting(shortcut.label)}>
            <strong>{shortcut.count}</strong>
            <span>{shortcut.label}</span>
          </button>
        ))}
      </div>
      <div className="profile-settings">
        {settings.map((setting) => (
          <button key={setting} type="button" onClick={() => setActiveSetting(setting)}>
            <span>{setting}</span>
            <Icon name="chevronRight" size={18} />
          </button>
        ))}
      </div>
      {activeSetting && (
        <div className="setting-feedback">
          <Icon name="check" size={18} />
          {activeSetting === '关于宅序' ? `宅序 v${APP_VERSION} · 家居风水调整平台` : `已打开“${activeSetting}”`}
        </div>
      )}
      <button className="logout-button" type="button" onClick={onLogout}>
        退出登录
      </button>
    </section>
  )
}
