import { useState } from 'react'
import { Icon } from './Icons.jsx'

export function MobileHome({ onOpenProject }) {
  return (
    <section className="mobile-page home-overview" aria-label="首页">
      <div className="home-intro">
        <h2>今天，继续完成住宅方案</h2>
        <p>把待确认的细节处理完，就可以生成完整报告。</p>
      </div>

      <button className="current-project" type="button" onClick={onOpenProject}>
        <div className="project-thumbnail">
          <img src="/assets/demo-floor-plan.png" alt="罗莉住宅户型缩略图" />
          <span>5个点位</span>
        </div>
        <div className="project-summary">
          <span>当前方案</span>
          <h3>罗莉的住宅方案</h3>
          <p>空间已确认 · 还有5项细节待补全</p>
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

export function MobileConsult() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    { id: 1, from: 'teacher', text: '罗莉家的5个重点位置已经整理好了，你可以点开方案逐项确认。' },
  ])

  const sendMessage = (event) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    setMessages((current) => [...current, { id: Date.now(), from: 'user', text: value }])
    setDraft('')
  }

  return (
    <section className="mobile-page consult-page" aria-label="咨询">
      <div className="teacher-row">
        <div className="teacher-avatar">宸</div>
        <div><h2>一宸老师</h2><p>方案咨询中</p></div>
      </div>
      <div className="message-list">
        {messages.map((message) => (
          <p className={message.from === 'user' ? 'message-user' : 'message-teacher'} key={message.id}>
            {message.text}
          </p>
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

export function MobileProfile() {
  const [activeSetting, setActiveSetting] = useState('')
  const settings = ['通知设置', '方案偏好', '关于宅序']

  return (
    <section className="mobile-page profile-page" aria-label="我的">
      <div className="profile-identity">
        <div className="profile-avatar"><Icon name="user" size={30} /></div>
        <div><h2>罗莉</h2><p>已保存 1 个住宅项目</p></div>
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
          已打开“{activeSetting}”
        </div>
      )}
    </section>
  )
}
