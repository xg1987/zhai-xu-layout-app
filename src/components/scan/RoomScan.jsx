import { useEffect, useRef, useState } from 'react'
import './scan.css'
import { Brand } from '../Brand.jsx'
import { APP_VERSION } from '../../version.js'
import RoomLayout from './RoomLayout.jsx'
import { draftFromRecord, emptyRoomDraft, prepareRoomPhotos, roomPayload, roomRequest } from './room-client.js'

function CameraIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 12l3-5h10l3 5h7a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z"/><circle cx="24" cy="26" r="8"/></svg>
}

function PhotoView({ image, objects, selectedId, onSelect, disabled }) {
  const [loadedId, setLoadedId] = useState(null)
  return <div className="scan-photo-stage"><div className="scan-photo-frame" style={{ position: 'relative' }}>
    <img src={image.dataUrl} alt="当前房间照片" onLoad={() => setLoadedId(image.id)} style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }}/>
    {loadedId === image.id && objects.filter(item => item.bbox).map(item => {
      const [x, y, width, height] = item.bbox
      return <button key={item.id} type="button" className={`scan-bbox${selectedId === item.id ? ' is-selected' : ''}`} style={{ position: 'absolute', left: `${x / 10}%`, top: `${y / 10}%`, width: `${width / 10}%`, height: `${height / 10}%` }} aria-label={`选择 ${item.label}`} aria-pressed={selectedId === item.id} disabled={disabled} onClick={() => onSelect(item.id)}><span>{item.label}</span></button>
    })}
  </div></div>
}

const dateTime = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

export default function RoomScan() {
  const [draft, setDraft] = useState(emptyRoomDraft), [dirty, setDirty] = useState(false), [tab, setTab] = useState('start')
  const [view, setView] = useState('photo'), [imageIndex, setImageIndex] = useState(0), [selectedId, setSelectedId] = useState(null), [newLabel, setNewLabel] = useState('')
  const [consent, setConsent] = useState(false), [ready, setReady] = useState(null), [statusError, setStatusError] = useState(''), [statusRevision, setStatusRevision] = useState(0)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [records, setRecords] = useState([]), [listLoading, setListLoading] = useState(false), [listError, setListError] = useState(''), [listRevision, setListRevision] = useState(0)
  const cameraInput = useRef(null), albumInput = useRef(null), controllers = useRef(new Set()), busyRef = useRef(null), mounted = useRef(true), leaveAllowed = useRef(false)
  const selected = draft.objects.find(item => item.id === selectedId)
  // Only photo-linked results lock the image order; editing room metadata does not.
  const lockedPhotos = draft.objects.length > 0 || draft.observations.length > 0 || draft.limitations.length > 0

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; for (const controller of controllers.current) controller.abort(); controllers.current.clear() }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const protect = event => { if (!leaveAllowed.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])
  useEffect(() => {
    const controller = new AbortController(); controllers.current.add(controller)
    setStatusError(''); setReady(null)
    roomRequest('/vision/status', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setReady(!!result.ready) }).catch(err => { if (!controller.signal.aborted) { setReady(false); setStatusError(err.message) } }).finally(() => controllers.current.delete(controller))
    return () => { controller.abort(); controllers.current.delete(controller) }
  }, [statusRevision])
  useEffect(() => {
    if (tab !== 'rooms') return
    const controller = new AbortController(); controllers.current.add(controller)
    setListLoading(true); setListError('')
    roomRequest('/rooms', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setRecords(result.records) }).catch(err => { if (!controller.signal.aborted) setListError(err.message) }).finally(() => { controllers.current.delete(controller); if (!controller.signal.aborted) setListLoading(false) })
    return () => { controller.abort(); controllers.current.delete(controller) }
  }, [tab, listRevision])

  function changeDraft(change) { leaveAllowed.current = false; setDraft(previous => typeof change === 'function' ? change(previous) : { ...previous, ...change }); setDirty(true); setNotice('') }
  function editObject(id, change) { changeDraft(previous => ({ ...previous, objects: previous.objects.map(item => item.id === id ? { ...item, confirmed: false, ...change } : item) })) }
  function startWork(kind) {
    if (busyRef.current) return null
    const controller = new AbortController(); controllers.current.add(controller); busyRef.current = controller
    setBusy(kind); setError(''); setNotice(''); return controller
  }
  function finishWork(controller) {
    controllers.current.delete(controller)
    if (busyRef.current === controller) { busyRef.current = null; if (mounted.current) setBusy('') }
  }
  function showError(err, controller) { if (mounted.current && !controller.signal.aborted && err.name !== 'AbortError') setError(err.message || '操作未完成，请重试') }
  function allowDiscard(action) { return !dirty || window.confirm(`当前房间有未保存的更改。确定放弃更改并${action}？如需保留，请取消并先保存。`) }
  function resetDraft() {
    setDraft(emptyRoomDraft()); setDirty(false); setSelectedId(null); setImageIndex(0); setNewLabel(''); setConsent(false); setView('photo'); setError(''); setNotice(''); setTab('start')
    if (cameraInput.current) cameraInput.current.value = ''
    if (albumInput.current) albumInput.current.value = ''
  }
  function newScan() { if (!busy && allowDiscard('新建扫描')) resetDraft() }

  async function addPhotos(event) {
    const input = event.currentTarget, files = Array.from(input.files || []); input.value = ''
    if (!files.length || lockedPhotos) return
    const controller = startWork('photos'); if (!controller) return
    try {
      const added = await prepareRoomPhotos(files, { existingCount: draft.images.length, signal: controller.signal })
      if (!controller.signal.aborted && mounted.current) { const index = draft.images.length; changeDraft(previous => ({ ...previous, images: [...previous.images, ...added] })); setImageIndex(index); setView('photo'); setConsent(false) }
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  function removePhoto() {
    if (lockedPhotos || busy) return
    changeDraft(previous => ({ ...previous, images: previous.images.filter((_, index) => index !== imageIndex) }))
    setImageIndex(index => Math.max(0, index - 1)); setConsent(false)
  }
  function clearRecognition() {
    if (busy || !window.confirm('清除识别和物品编辑结果后可重新拍摄，现有照片会保留。确定清除？')) return
    changeDraft({ objects: [], observations: [], limitations: [], roomType: 'unknown' }); setSelectedId(null); setConsent(false); setView('photo')
  }
  async function recognize() {
    if (!draft.images.length || !consent || !ready || (lockedPhotos && !window.confirm('重新识别会替换当前物品、人工修订和识别说明。确定继续？'))) return
    const controller = startWork('recognize'); if (!controller) return
    try {
      const result = await roomRequest('/vision/room', { method: 'POST', signal: controller.signal, body: { images: draft.images.map(item => item.dataUrl) } })
      if (controller.signal.aborted || !mounted.current) return
      if (!result.result?.isRoom) throw new Error('照片中未识别到可辨认的室内房间，请补拍更完整的房间照片')
      const recognized = result.result
      changeDraft({ roomType: recognized.roomType, objects: recognized.objects.map(item => ({ ...item, confirmed: false })), observations: recognized.observations, limitations: recognized.limitations })
      setSelectedId(recognized.objects[0]?.id || null)
      setNotice(`已由 ${result.provider} 识别${result.usedFallback ? '（备用模型）' : ''}，请逐项核对物品与位置。`)
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  function addObject(event) {
    event.preventDefault(); const label = newLabel.trim()
    if (!label || busy || draft.objects.length >= 30) return
    const item = { id: crypto.randomUUID(), label, category: 'unknown', sourceImageIndex: imageIndex, bbox: null, planPosition: null, confidence: 'low', note: '人工添加，位置待核对。', confirmed: false }
    changeDraft(previous => ({ ...previous, objects: [...previous.objects, item] })); setSelectedId(item.id); setNewLabel('')
  }
  function deleteObject(id) { if (busy) return; changeDraft(previous => ({ ...previous, objects: previous.objects.filter(item => item.id !== id) })); if (selectedId === id) setSelectedId(null) }
  function placeObject() { if (!selected) return; editObject(selected.id, { planPosition: [500, 500], note: `${selected.note.slice(0, 270)}${selected.note ? ' ' : ''}手动放置，位置待核对。` }); setView('layout') }
  function setCoordinate(axis, value) {
    if (!selected?.planPosition) return
    if (value === '') { editObject(selected.id, { planPosition: null }); return }
    const number = Number(value); if (!Number.isFinite(number)) return
    const next = [...selected.planPosition]; next[axis] = Math.max(0, Math.min(1000, number)); editObject(selected.id, { planPosition: next })
  }
  async function refreshRecords(signal) {
    try { const result = await roomRequest('/rooms', { signal }); if (!signal.aborted && mounted.current) { setRecords(result.records); setListError('') } } catch (err) { if (!signal.aborted && mounted.current) setListError(err.message) }
  }
  async function saveRoom() {
    if (!draft.images.length) { setError('请先添加至少一张房间照片'); return }
    if (!draft.name.trim()) { setError('请输入房间名称'); return }
    if (draft.objects.some(item => !item.label.trim())) { setError('请为每件物品填写名称'); return }
    if (draft.northAngle !== null && (!Number.isFinite(draft.northAngle) || draft.northAngle < 0 || draft.northAngle > 359.9)) { setError('实测北向应为 0 至 359.9 度，未校准请留空'); return }
    const controller = startWork('save'); if (!controller) return
    try {
      const result = await roomRequest(draft.id ? `/rooms/${encodeURIComponent(draft.id)}` : '/rooms', { method: draft.id ? 'PUT' : 'POST', signal: controller.signal, body: roomPayload(draft) })
      if (controller.signal.aborted || !mounted.current) return
      setDraft(draftFromRecord(result.record)); setDirty(false); setNotice('已保存。仅此账号在当前本机服务中可见。')
      await refreshRecords(controller.signal)
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  async function openRoom(id) {
    if (!allowDiscard('打开另一条房间记录')) return
    const controller = startWork('open'); if (!controller) return
    try {
      const result = await roomRequest(`/rooms/${encodeURIComponent(id)}`, { signal: controller.signal })
      if (controller.signal.aborted || !mounted.current) return
      setDraft(draftFromRecord(result.record)); setDirty(false); setImageIndex(0); setSelectedId(null); setConsent(false); setNewLabel(''); setView('photo'); setTab('start'); setNotice('已打开此账号保存的房间记录。')
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  async function deleteRoom(record) {
    if (!window.confirm(`确定删除“${record.name}”？此账号在本机服务中的这条房间记录将被永久删除。`)) return
    const controller = startWork('delete'); if (!controller) return
    try {
      await roomRequest(`/rooms/${encodeURIComponent(record.id)}`, { method: 'DELETE', signal: controller.signal })
      if (controller.signal.aborted || !mounted.current) return
      if (draft.id === record.id) { setDraft(previous => { const { id, revision, ...content } = previous; return content }); setDirty(true) }
      setNotice('房间记录已删除。'); await refreshRecords(controller.signal)
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }

  const photoControls = <div className="scan-capture-actions"><button type="button" className="scan-primary" onClick={() => cameraInput.current.click()} disabled={!!busy || lockedPhotos || draft.images.length >= 4}>拍摄房间</button><button type="button" className="scan-secondary" onClick={() => albumInput.current.click()} disabled={!!busy || lockedPhotos || draft.images.length >= 4}>从相册选择</button></div>
  return <div className="room-scan">
    <header className="scan-header"><Brand/><div className="scan-header-actions"><a href="/" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; if (!allowDiscard('返回工作台')) event.preventDefault(); else leaveAllowed.current = true }}>返回工作台</a><span>v{APP_VERSION}</span></div></header>
    <main className="scan-main">
      <div className="scan-heading"><div><h2>房间扫描</h2><p>拍摄房间，记录家具与摆放位置</p></div>{(draft.images.length > 0 || tab === 'rooms') && <button className="scan-secondary" type="button" disabled={!!busy} onClick={newScan}>新建扫描</button>}</div>
      <div className="scan-tabs" role="tablist" aria-label="房间扫描页面"><button id="scan-start-tab" role="tab" aria-selected={tab === 'start'} aria-controls="scan-start-panel" type="button" disabled={!!busy} onClick={() => setTab('start')}>开始扫描</button><button id="scan-rooms-tab" role="tab" aria-selected={tab === 'rooms'} aria-controls="scan-rooms-panel" type="button" disabled={!!busy} onClick={() => setTab('rooms')}>我的房间</button></div>
      <input ref={cameraInput} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden aria-label="拍摄房间照片" onChange={addPhotos} disabled={!!busy || lockedPhotos}/>
      <input ref={albumInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="选择房间照片" onChange={addPhotos} disabled={!!busy || lockedPhotos}/>
      {error && <p className="scan-feedback is-error" role="alert">{error}</p>}{notice && <p className="scan-feedback" role="status">{notice}</p>}
      {busy === 'photos' && <p className="scan-feedback" role="status">正在处理所选照片…<button type="button" onClick={() => busyRef.current?.abort()}>取消</button></p>}
      {tab === 'start' ? <section id="scan-start-panel" role="tabpanel" aria-labelledby="scan-start-tab">
        {!draft.images.length ? <><div className="scan-capture"><CameraIcon/><h3>添加房间照片</h3><p>从不同角度拍摄，最多 4 张</p></div>{photoControls}<section className="scan-tips"><h3>拍摄提示</h3><p>先拍摄整个房间</p><p>再补充门窗和主要家具</p><p>保持光线充足，避免遮挡</p><small>照片识别可辅助确认物品，精确尺寸需另行测量。单张原图最多 20 MB。</small></section></> : <>
          <div className="scan-workspace">
            <section className="scan-visual" aria-label="房间照片与布局草图">
              <div className="scan-visual-tabs" role="tablist" aria-label="查看方式"><button type="button" role="tab" aria-selected={view === 'photo'} disabled={!!busy} onClick={() => setView('photo')}>房间照片</button><button type="button" role="tab" aria-selected={view === 'layout'} disabled={!!busy} onClick={() => setView('layout')}>布局草图</button></div>
              <div className="scan-photo-tools"><label>查看照片<select aria-label="查看照片" value={imageIndex} disabled={!!busy} onChange={event => setImageIndex(Number(event.target.value))}>{draft.images.map((item, index) => <option key={item.id} value={index}>照片 {index + 1}</option>)}</select></label><span>{draft.images.length} / 4 张</span><button type="button" className="scan-text-button" disabled={!!busy || lockedPhotos} onClick={removePhoto}>删除这张照片</button></div>
              {view === 'photo' ? <PhotoView image={draft.images[imageIndex] || draft.images[0]} objects={draft.objects.filter(item => item.sourceImageIndex === imageIndex)} selectedId={selectedId} onSelect={setSelectedId} disabled={!!busy}/> : <RoomLayout objects={draft.objects} selectedId={selectedId} onSelect={setSelectedId} onMove={(id, planPosition) => editObject(id, { planPosition })} disabled={!!busy}/>}
              {lockedPhotos ? <div className="scan-photo-lock"><p>物品与识别信息对应当前照片，清除结果后可增删照片。</p><button type="button" className="scan-secondary" disabled={!!busy} onClick={clearRecognition}>清除识别重新拍摄</button></div> : photoControls}
              <p className="scan-note">照片会等比例压缩用于识别与保存。这里记录相对布局，实际尺寸和北向需要另行测量。</p>
              <div className="scan-consent"><label className="scan-check"><input type="checkbox" checked={consent} disabled={!!busy} onChange={event => setConsent(event.target.checked)}/>我同意将所选房间照片发送给管理员配置的识别模型，用于本次房间识别。</label></div>
              <div className="scan-recognition-actions"><button type="button" className="scan-primary" disabled={!!busy || !consent || !ready} onClick={recognize}>{busy === 'recognize' ? '正在识别房间与物品…' : lockedPhotos ? '重新识别房间与物品' : '识别房间与物品'}</button>{busy === 'recognize' && <button type="button" className="scan-secondary" onClick={() => busyRef.current?.abort()}>取消识别</button>}<p>{ready === null ? '正在检查识别服务…' : statusError || (!ready ? '管理员尚未配置识别模型。可先手动添加、核对并保存。' : '点击后才发送照片；识别结果需要人工核对。')}{statusError && <button type="button" className="scan-text-button" disabled={!!busy} onClick={() => setStatusRevision(value => value + 1)}>重新检查</button>}</p></div>
            </section>
            <aside className="scan-inspector" aria-label="房间与物品核对">
              <div className="scan-field"><label htmlFor="scan-room-name">房间名称</label><input id="scan-room-name" maxLength={60} value={draft.name} disabled={!!busy} onChange={event => changeDraft({ name: event.target.value })}/></div>
              <div className="scan-field"><label htmlFor="scan-room-type">房间类型</label><input id="scan-room-type" maxLength={48} value={draft.roomType === 'unknown' ? '' : draft.roomType} placeholder="待确认" disabled={!!busy} onChange={event => changeDraft({ roomType: event.target.value || 'unknown' })}/></div>
              <div className="scan-section-heading"><h3>主要物品</h3><span>{draft.objects.length} / 30</span></div>
              <div className="scan-object-list" aria-label="主要物品列表">{draft.objects.length ? draft.objects.map(item => <div key={item.id} className={`scan-object-row${selectedId === item.id ? ' is-selected' : ''}`}><button type="button" disabled={!!busy} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><span>{item.label || '未命名物品'}</span><small>{item.confirmed ? '已确认' : '待核对'}</small></button><button type="button" disabled={!!busy} className="scan-text-button" aria-label={`删除物品 ${item.label}`} onClick={() => deleteObject(item.id)}>删除</button></div>) : <p className="scan-empty-note">暂无物品，可识别照片或手动添加。</p>}</div>
              <form className="scan-add-object" onSubmit={addObject}><label htmlFor="scan-new-object">手动添加物品</label><div><input id="scan-new-object" placeholder="输入物品名称" maxLength={80} value={newLabel} disabled={!!busy || draft.objects.length >= 30} onChange={event => setNewLabel(event.target.value)}/><button type="submit" className="scan-secondary" disabled={!!busy || !newLabel.trim() || draft.objects.length >= 30}>添加</button></div></form>
              {selected && <section className="scan-object-editor" aria-label="编辑选中物品"><h3>核对物品</h3>
                <div className="scan-field"><label htmlFor="scan-object-label">物品名称</label><input id="scan-object-label" maxLength={80} value={selected.label} disabled={!!busy} onChange={event => editObject(selected.id, { label: event.target.value })}/></div>
                <div className="scan-field"><label htmlFor="scan-object-category">物品类别</label><input id="scan-object-category" maxLength={48} placeholder="待确认" value={selected.category === 'unknown' ? '' : selected.category} disabled={!!busy} onChange={event => editObject(selected.id, { category: event.target.value || 'unknown' })}/></div>
                <p className="scan-object-source">对应照片 {selected.sourceImageIndex + 1} · 识别把握：{{ high: '高', medium: '中', low: '低' }[selected.confidence]}</p>
                <div className="scan-field"><label htmlFor="scan-object-note">核对说明</label><textarea id="scan-object-note" maxLength={300} rows={3} value={selected.note} disabled={!!busy} onChange={event => editObject(selected.id, { note: event.target.value })}/></div>
                {!selected.planPosition && <button type="button" className="scan-secondary" disabled={!!busy} onClick={placeObject}>放入草图</button>}
                <div className="scan-coordinate-fields">{['横向位置', '纵向位置'].map((label, axis) => <div className="scan-field" key={label}><label htmlFor={`scan-position-${axis}`}>{label}</label><input id={`scan-position-${axis}`} type="number" min="0" max="1000" step="1" placeholder="未定位" value={selected.planPosition?.[axis] ?? ''} disabled={!!busy || !selected.planPosition} onChange={event => setCoordinate(axis, event.target.value)}/></div>)}</div>
                <p className="scan-note">范围 0–1000，为相对位置。放入草图属于人工定位；清空任一坐标可取消定位。</p>
                <label className="scan-check"><input type="checkbox" checked={!!selected.confirmed} disabled={!!busy} onChange={event => editObject(selected.id, { confirmed: event.target.checked })}/>我已核对这件物品与位置</label>
              </section>}
              <section className="scan-north"><div className="scan-field"><label htmlFor="scan-north-angle">实测北向（可选）</label><input id="scan-north-angle" type="number" min="0" max="359.9" step="0.1" placeholder="尚未校准" value={draft.northAngle ?? ''} disabled={!!busy} onChange={event => changeDraft({ northAngle: event.target.value === '' ? null : Number(event.target.value) })}/></div><p className="scan-note">请填写实际测得的北向角度；照片无法确定真实北向。草图仅显示上下左右。</p></section>
              {(draft.observations.length > 0 || draft.limitations.length > 0) && <section className="scan-messages">{draft.observations.length > 0 && <><h3>可见信息</h3><ul>{draft.observations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}{draft.limitations.length > 0 && <><h3>待核对事项</h3><ul>{draft.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}</section>}
              <div className="scan-save"><button type="button" className="scan-primary" disabled={!!busy} onClick={saveRoom}>{busy === 'save' ? '正在保存…' : '保存房间'}</button><p>{dirty ? '有未保存的更改' : draft.id ? '已保存 · 仅此账号在当前本机服务中可见' : '尚未保存'}</p></div>
            </aside>
          </div>
        </>}
      </section> : <section id="scan-rooms-panel" role="tabpanel" aria-labelledby="scan-rooms-tab" className="scan-records">
        <div className="scan-record-toolbar"><p>仅显示此账号在当前本机服务中保存的房间。</p><button type="button" className="scan-secondary" disabled={listLoading || !!busy} onClick={() => setListRevision(value => value + 1)}>刷新</button></div>
        {listError ? <p className="scan-feedback is-error" role="alert">{listError}<button type="button" onClick={() => setListRevision(value => value + 1)}>重试</button></p> : listLoading ? <p className="scan-feedback" role="status">正在读取房间记录…</p> : records.length ? records.map(record => <article key={record.id} className="scan-record-row"><div><h3>{record.name}</h3><p>{record.roomType === 'unknown' ? '类型待确认' : record.roomType} · {record.objectCount} 件物品</p><small>更新于 {dateTime(record.updatedAt)}</small></div><div className="scan-record-actions"><button type="button" className="scan-secondary" disabled={!!busy} onClick={() => openRoom(record.id)}>打开房间</button><button type="button" className="scan-text-button" disabled={!!busy} aria-label={`删除房间 ${record.name}`} onClick={() => deleteRoom(record)}>删除</button></div></article>) : <div className="scan-empty"><CameraIcon/><h3>暂无房间记录</h3><p>添加房间照片，核对后保存即可在这里查看。</p><button type="button" className="scan-secondary" onClick={() => setTab('start')}>开始扫描</button></div>}
      </section>}
    </main>
  </div>
}
