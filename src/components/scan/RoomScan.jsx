import { useEffect, useId, useRef, useState } from 'react'
import './scan.css'
import { Brand } from '../Brand.jsx'
import { APP_VERSION } from '../../version.js'
import RoomLayout from './RoomLayout.jsx'
import { draftFromRecord, emptyRoomDraft, prepareRoomPhotos, roomPayload, roomRequest } from './room-client.js'
import { prepareRoomVideo } from './video-client.js'
import ScanIcon from './ScanIcon.jsx'

function ScanConfirmation({ prompt, onResolve }) {
  const dialog = useRef(null), cancelButton = useRef(null), titleId = useId(), messageId = useId()
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current
    if (!element.open) element.showModal()
    cancelButton.current?.focus({ preventScroll: true })
    return () => {
      if (element.open) element.close()
      const target = previous?.isConnected && !previous.disabled ? previous : document.querySelector('.scan-tabs button:not(:disabled)')
      target?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="scan-confirm-dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onCancel={event => { event.preventDefault(); onResolve(false) }}>
    <h3 id={titleId}>{prompt.title}</h3>
    <p id={messageId}>{prompt.message}</p>
    <div className="scan-confirm-actions"><button ref={cancelButton} type="button" className="scan-secondary" onClick={() => onResolve(false)}>{prompt.cancelLabel || '取消'}</button><button type="button" className={`scan-primary${prompt.destructive ? ' scan-confirm-danger' : ''}`} onClick={() => onResolve(true)}>{prompt.confirmLabel}</button></div>
  </dialog>
}

function PhotoView({ image, objects, selectedId, onSelect, disabled }) {
  const [loadedId, setLoadedId] = useState(null)
  return <div className="scan-photo-stage"><div className="scan-photo-frame" style={{ position: 'relative' }}>
    <img src={image.dataUrl} alt="当前房间画面" onLoad={() => setLoadedId(image.id)} style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }}/>
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
  const [videoProgress, setVideoProgress] = useState(null)
  const [confirmation, setConfirmation] = useState(null), confirmationRef = useRef(null)
  const [records, setRecords] = useState([]), [listLoading, setListLoading] = useState(false), [listError, setListError] = useState(''), [listRevision, setListRevision] = useState(0)
  const videoCaptureInput = useRef(null), videoImportInput = useRef(null), albumInput = useRef(null), controllers = useRef(new Set()), busyRef = useRef(null), mounted = useRef(true), leaveAllowed = useRef(false)
  const selected = draft.objects.find(item => item.id === selectedId)
  const hasImages = draft.images.length > 0
  // Only photo-linked results lock the image order; editing room metadata does not.
  const lockedPhotos = draft.objects.length > 0 || draft.observations.length > 0 || draft.limitations.length > 0

  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }, [tab, view, hasImages])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const pending = confirmationRef.current; confirmationRef.current = null; pending?.resolve(false)
      for (const controller of controllers.current) controller.abort()
      controllers.current.clear()
    }
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
  function askConfirmation(prompt) {
    if (!mounted.current || busyRef.current || confirmationRef.current) return Promise.resolve(false)
    return new Promise(resolve => { confirmationRef.current = { resolve }; setConfirmation(prompt) })
  }
  function resolveConfirmation(accepted) {
    const pending = confirmationRef.current
    if (!pending) return
    confirmationRef.current = null
    if (mounted.current) setConfirmation(null)
    pending.resolve(!!accepted)
  }
  async function allowDiscard(action) {
    if (!dirty) return true
    return askConfirmation({ title: '放弃未保存的更改？', message: `当前房间有未保存的更改。继续后将放弃这些更改并${action}。如需保留，请先取消并保存房间。`, confirmLabel: `放弃更改并${action}`, cancelLabel: '继续编辑', destructive: true })
  }
  async function returnToWorkspace(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (busyRef.current || !(await allowDiscard('返回工作台')) || !mounted.current || busyRef.current) return
    leaveAllowed.current = true
    window.location.assign('/')
  }
  function resetDraft() {
    setDraft(emptyRoomDraft()); setDirty(false); setSelectedId(null); setImageIndex(0); setNewLabel(''); setConsent(false); setView('photo'); setError(''); setNotice(''); setTab('start')
    setVideoProgress(null)
    if (videoCaptureInput.current) videoCaptureInput.current.value = ''
    if (videoImportInput.current) videoImportInput.current.value = ''
    if (albumInput.current) albumInput.current.value = ''
  }
  async function newScan() { if (!busyRef.current && await allowDiscard('新建扫描') && mounted.current && !busyRef.current) resetDraft() }

  async function addPhotos(event) {
    const input = event.currentTarget, files = Array.from(input.files || []); input.value = ''
    if (!files.length || lockedPhotos) return
    const controller = startWork('photos'); if (!controller) return
    try {
      const added = await prepareRoomPhotos(files, { existingCount: draft.images.length, signal: controller.signal })
      if (!controller.signal.aborted && mounted.current) { const index = draft.images.length; changeDraft(previous => ({ ...previous, images: [...previous.images, ...added] })); setImageIndex(index); setView('photo'); setConsent(false) }
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  async function addVideo(event) {
    const input = event.currentTarget, file = input.files?.[0]; input.value = ''
    if (!file || lockedPhotos || busyRef.current) return
    if (draft.images.length && !(await askConfirmation({ title: '替换扫描画面？', message: '使用新视频会替换当前全部画面，房间名称会保留。取消处理或处理失败时，原有画面保持不变。', confirmLabel: '使用新视频', cancelLabel: '保留当前画面' }))) return
    if (!mounted.current || busyRef.current) return
    const controller = startWork('video'); if (!controller) return
    setVideoProgress(null)
    try {
      const frames = await prepareRoomVideo(file, { signal: controller.signal, onProgress: progress => {
        if (!controller.signal.aborted && mounted.current) setVideoProgress(progress)
      } })
      if (controller.signal.aborted || !mounted.current) return
      if (!Array.isArray(frames) || frames.length !== 4) throw new Error('未能提取完整的扫描画面，请重新选择房间视频')
      const images = frames.map(({ id, dataUrl }) => ({ id, dataUrl }))
      changeDraft({ images })
      setImageIndex(0); setSelectedId(null); setNewLabel(''); setView('photo'); setConsent(false)
      setNotice(`已选取 ${frames.length} 个扫描画面，请核对后继续。`)
    } catch (err) {
      if (mounted.current && (controller.signal.aborted || err.name === 'AbortError')) setNotice('已取消视频处理，原有画面未更改。')
      else showError(err, controller)
    } finally { if (mounted.current) setVideoProgress(null); finishWork(controller) }
  }
  function removePhoto() {
    if (lockedPhotos || busy) return
    changeDraft(previous => ({ ...previous, images: previous.images.filter((_, index) => index !== imageIndex) }))
    setImageIndex(index => Math.max(0, index - 1)); setConsent(false)
  }
  async function clearRecognition() {
    if (busyRef.current || !(await askConfirmation({ title: '清除识别与物品编辑？', message: '将清除当前识别说明、物品和人工编辑结果，现有画面会保留。清除后可重新扫描或增删画面。', confirmLabel: '清除识别结果', cancelLabel: '保留识别结果', destructive: true })) || !mounted.current || busyRef.current) return
    changeDraft({ objects: [], observations: [], limitations: [], roomType: 'unknown' }); setSelectedId(null); setConsent(false); setView('photo')
  }
  async function recognize() {
    if (!draft.images.length || !consent || !ready || busyRef.current) return
    if (lockedPhotos && !(await askConfirmation({ title: '替换当前识别结果？', message: '重新识别会替换当前物品、人工修订和识别说明。识别失败时，当前草稿仍会保留。', confirmLabel: '重新识别', cancelLabel: '保留当前结果' }))) return
    if (!mounted.current || busyRef.current) return
    const controller = startWork('recognize'); if (!controller) return
    try {
      const result = await roomRequest('/vision/room', { method: 'POST', signal: controller.signal, body: { images: draft.images.map(item => item.dataUrl) } })
      if (controller.signal.aborted || !mounted.current) return
      if (!result.result?.isRoom) throw new Error('画面中未识别到可辨认的室内房间，请重新录制更完整的房间视频或补充照片')
      const recognized = result.result
      changeDraft({ roomType: recognized.roomType, objects: recognized.objects.map(item => ({ ...item, confirmed: false })), observations: recognized.observations, limitations: recognized.limitations })
      setSelectedId(recognized.objects[0]?.id || null)
      setView('objects')
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
    if (!draft.images.length) { setError('请先扫描房间视频或选择房间照片'); return }
    if (!draft.name.trim()) { setError('请输入房间名称'); return }
    if (draft.objects.some(item => !item.label.trim())) { setError('请为每件物品填写名称'); return }
    if (draft.northAngle !== null && (!Number.isFinite(draft.northAngle) || draft.northAngle < 0 || draft.northAngle > 359.9)) { setError('实测北向应为 0 至 359.9 度，未校准请留空'); return }
    const controller = startWork('save'); if (!controller) return
    try {
      const result = await roomRequest(draft.id ? `/rooms/${encodeURIComponent(draft.id)}` : '/rooms', { method: draft.id ? 'PUT' : 'POST', signal: controller.signal, body: roomPayload(draft) })
      if (controller.signal.aborted || !mounted.current) return
      setDraft(draftFromRecord(result.record)); setDirty(false); setNotice('已保存。房间记录仅此账号可见。')
      await refreshRecords(controller.signal)
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  async function openRoom(id) {
    if (busyRef.current || !(await allowDiscard('打开这条房间记录')) || !mounted.current || busyRef.current) return
    const controller = startWork('open'); if (!controller) return
    try {
      const result = await roomRequest(`/rooms/${encodeURIComponent(id)}`, { signal: controller.signal })
      if (controller.signal.aborted || !mounted.current) return
      setDraft(draftFromRecord(result.record)); setDirty(false); setImageIndex(0); setSelectedId(null); setConsent(false); setNewLabel(''); setView('photo'); setTab('start'); setNotice('已打开此账号保存的房间记录。')
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }
  async function deleteRoom(record) {
    if (busyRef.current || !(await askConfirmation({ title: '删除房间记录？', message: `“${record.name}”这条房间记录将被永久删除。`, confirmLabel: '删除房间记录', cancelLabel: '保留记录', destructive: true })) || !mounted.current || busyRef.current) return
    const controller = startWork('delete'); if (!controller) return
    try {
      await roomRequest(`/rooms/${encodeURIComponent(record.id)}`, { method: 'DELETE', signal: controller.signal })
      if (controller.signal.aborted || !mounted.current) return
      if (draft.id === record.id) { setDraft(previous => { const { id, revision, ...content } = previous; return content }); setDirty(true) }
      setNotice('房间记录已删除。'); await refreshRecords(controller.signal)
    } catch (err) { showError(err, controller) } finally { finishWork(controller) }
  }

  const roomMetadata = <details className="scan-disclosure scan-room-metadata">
    <summary>房间信息与核对说明</summary>
    <div className="scan-disclosure-content">
      <div className="scan-field"><label htmlFor="scan-room-type">房间类型</label><input id="scan-room-type" maxLength={48} value={draft.roomType === 'unknown' ? '' : draft.roomType} placeholder="待确认" disabled={!!busy} onChange={event => changeDraft({ roomType: event.target.value || 'unknown' })}/></div>
      <section className="scan-north"><div className="scan-field"><label htmlFor="scan-north-angle">实测北向（可选）</label><input id="scan-north-angle" type="number" min="0" max="359.9" step="0.1" placeholder="尚未校准" value={draft.northAngle ?? ''} disabled={!!busy} onChange={event => changeDraft({ northAngle: event.target.value === '' ? null : Number(event.target.value) })}/></div><p className="scan-note">请填写实际测得的北向角度。画面无法确定真实北向，草图仅显示上下左右。</p></section>
      {(draft.observations.length > 0 || draft.limitations.length > 0) && <section className="scan-messages">{draft.observations.length > 0 && <><h3>可见信息</h3><ul>{draft.observations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}{draft.limitations.length > 0 && <><h3>待核对事项</h3><ul>{draft.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}</section>}
    </div>
  </details>

  const objectInspector = <section className="scan-inspector" aria-label="房间与物品核对">
    <div className="scan-section-heading"><h3>主要物品</h3><span>{draft.objects.length} / 30</span></div>
    <div className="scan-object-list" aria-label="主要物品列表">{draft.objects.length ? draft.objects.map(item => <div key={item.id} className={`scan-object-row${selectedId === item.id ? ' is-selected' : ''}`}>
      <button type="button" disabled={!!busy} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><ScanIcon name="cube"/><span>{item.label || '未命名物品'}</span><small>{item.confirmed ? '已确认' : '待核对'}</small></button>
      <button type="button" disabled={!!busy} className="scan-text-button" aria-label={`删除物品 ${item.label}`} onClick={() => deleteObject(item.id)}><ScanIcon name="trash"/></button>
    </div>) : <div className="scan-object-empty"><ScanIcon name="cube"/><p>暂无物品，可手动添加，也可返回画面进行识别。</p></div>}</div>
    <form className="scan-add-object" onSubmit={addObject}><label htmlFor="scan-new-object">手动添加物品</label><div><input id="scan-new-object" placeholder="输入物品名称" maxLength={80} value={newLabel} disabled={!!busy || draft.objects.length >= 30} onChange={event => setNewLabel(event.target.value)}/><button type="submit" className="scan-secondary" disabled={!!busy || !newLabel.trim() || draft.objects.length >= 30}><ScanIcon name="plus"/>添加</button></div></form>
    {selected && <section className="scan-object-editor" aria-label="编辑选中物品">
      <div className="scan-field"><label htmlFor="scan-object-label">物品名称</label><input id="scan-object-label" maxLength={80} value={selected.label} disabled={!!busy} onChange={event => editObject(selected.id, { label: event.target.value })}/></div>
      <p className="scan-object-source">依据画面 {selected.sourceImageIndex + 1} · 识别把握：{{ high: '高', medium: '中', low: '低' }[selected.confidence]}<button type="button" className="scan-text-button" disabled={!!busy} onClick={() => { setImageIndex(selected.sourceImageIndex); setView('photo') }}>查看依据画面</button></p>
      <details className="scan-disclosure" key={`${selected.id}-details`}><summary>物品类别与核对说明</summary><div className="scan-disclosure-content">
        <div className="scan-field"><label htmlFor="scan-object-category">物品类别</label><input id="scan-object-category" maxLength={48} placeholder="待确认" value={selected.category === 'unknown' ? '' : selected.category} disabled={!!busy} onChange={event => editObject(selected.id, { category: event.target.value || 'unknown' })}/></div>
        <div className="scan-field"><label htmlFor="scan-object-note">核对说明</label><textarea id="scan-object-note" maxLength={300} rows={3} value={selected.note} disabled={!!busy} onChange={event => editObject(selected.id, { note: event.target.value })}/></div>
      </div></details>
      {!selected.planPosition && <button type="button" className="scan-secondary scan-place-object" disabled={!!busy} onClick={placeObject}><ScanIcon name="cube"/>放入草图</button>}
      <details className="scan-disclosure scan-position-disclosure" key={`${selected.id}-${view}-position`} open={view === 'layout'}><summary>相对位置与坐标</summary><div className="scan-disclosure-content">
        <div className="scan-coordinate-fields">{['横向位置', '纵向位置'].map((label, axis) => <div className="scan-field" key={label}><label htmlFor={`scan-position-${axis}`}>{label}</label><input id={`scan-position-${axis}`} type="number" min="0" max="1000" step="1" placeholder="未定位" value={selected.planPosition?.[axis] ?? ''} disabled={!!busy || !selected.planPosition} onChange={event => setCoordinate(axis, event.target.value)}/></div>)}</div>
        <p className="scan-note">范围 0–1000，为相对位置。放入草图属于人工定位；清空任一坐标可取消定位。</p>
      </div></details>
      <label className="scan-check"><input type="checkbox" checked={!!selected.confirmed} disabled={!!busy} onChange={event => editObject(selected.id, { confirmed: event.target.checked })}/>我已核对这件物品与位置</label>
    </section>}
    {roomMetadata}
  </section>

  return <div className={`room-scan${hasImages ? ' has-frames' : ' is-entry'}`}>
    <header className="scan-header"><a className="scan-back" href="/" aria-label="返回工作台" title="返回工作台" aria-disabled={!!busy} onClick={returnToWorkspace}><ScanIcon name="left"/></a><Brand/><span className="scan-version">v{APP_VERSION}</span></header>
    <main className="scan-main">
      <div className="scan-heading"><div><h2>{tab === 'rooms' ? '我的房间' : hasImages ? '核对房间' : '扫描房间'}</h2><p>{tab === 'rooms' ? '查看已保存的房间与物品' : hasImages ? '查看扫描画面，再开始识别' : '用一段视频，记录房间与家具摆放'}</p></div>{(hasImages || tab === 'rooms') && <button className="scan-heading-action scan-text-button" type="button" disabled={!!busy} onClick={newScan}><ScanIcon name="plus"/><span>新建扫描</span></button>}</div>
      <input ref={videoCaptureInput} type="file" accept="video/*" capture="environment" hidden aria-label="录制房间扫描视频" onChange={addVideo} disabled={!!busy || lockedPhotos}/>
      <input ref={videoImportInput} type="file" accept="video/*" hidden aria-label="导入房间视频文件" onChange={addVideo} disabled={!!busy || lockedPhotos}/>
      <input ref={albumInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="选择房间照片" onChange={addPhotos} disabled={!!busy || lockedPhotos}/>
      {error && <p className="scan-feedback is-error" role="alert">{error}</p>}{notice && <p className="scan-feedback" role="status">{notice}</p>}
      {busy === 'photos' && <div className="scan-feedback scan-processing" role="status"><span>正在处理所选照片…</span><button type="button" className="scan-text-button" onClick={() => busyRef.current?.abort()}>取消</button></div>}
      {busy === 'video' && <div className="scan-feedback scan-video-progress" role="status"><div><span>正在本地提取视频画面{videoProgress ? `（${videoProgress.completed} / ${videoProgress.total}）` : '…'}</span><button type="button" className="scan-text-button" onClick={() => busyRef.current?.abort()}>取消处理</button></div>{videoProgress && <progress aria-label="视频画面提取进度" value={videoProgress.completed} max={videoProgress.total}/>}<small>原视频仅在当前设备处理，不会上传。</small></div>}
      {tab === 'start' ? <section id="scan-start-panel" role="tabpanel" aria-labelledby="scan-start-tab">
        {!hasImages ? <div className="scan-entry">
          <figure className="scan-illustration"><img src="/assets/room-scan-illustration-v1.png" alt="房间扫描功能示意，不是已扫描的房间"/><div className="scan-corners" aria-hidden="true"><span/><span/><span/><span/></div><figcaption className="scan-illustration-caption">扫描示意</figcaption></figure>
          <div className="scan-capture-actions"><button type="button" className="scan-primary" onClick={() => videoCaptureInput.current.click()} disabled={!!busy}><ScanIcon name="video"/><span>开始视频扫描</span><ScanIcon name="right" className="scan-action-arrow"/></button></div>
          <div className="scan-alternative-actions"><button type="button" className="scan-secondary" onClick={() => videoImportInput.current.click()} disabled={!!busy}><ScanIcon name="play"/>导入视频</button><button type="button" className="scan-secondary" onClick={() => albumInput.current.click()} disabled={!!busy}><ScanIcon name="image"/>选择照片</button></div>
          <p className="scan-limit-note">建议 15–30 秒 · 最长 60 秒 / 80 MB</p>
          <section className="scan-tips"><h3>拍摄小贴士</h3><ol><li><span>1</span>缓慢环拍，拍全门窗与家具</li><li><span>2</span>保持光线充足，避免快速移动</li></ol></section>
          <p className="scan-privacy">原视频仅在本地处理，识别前由你确认</p>
        </div> : <div className="scan-workspace">
          <div className="scan-room-name scan-field"><label htmlFor="scan-room-name">房间名称</label><div className="scan-name-input"><input id="scan-room-name" maxLength={60} value={draft.name} disabled={!!busy} onChange={event => changeDraft({ name: event.target.value })}/><ScanIcon name="edit"/></div></div>
          <div className="scan-review-tabs" role="tablist" aria-label="查看方式">{[['photo', '画面', 'play'], ['objects', '物品', 'cube'], ['layout', '草图', 'image']].map(([value, label, icon]) => <button type="button" key={value} id={`scan-${value}-tab`} role="tab" aria-selected={view === value} aria-controls={`scan-${value}-panel`} disabled={!!busy} onClick={() => setView(value)}><ScanIcon name={icon}/><span>{label}</span></button>)}</div>
          {view === 'photo' ? <section id="scan-photo-panel" role="tabpanel" aria-labelledby="scan-photo-tab" className="scan-visual" aria-label="房间画面核对">
            <PhotoView image={draft.images[imageIndex] || draft.images[0]} objects={draft.objects.filter(item => item.sourceImageIndex === imageIndex)} selectedId={selectedId} onSelect={id => { setSelectedId(id); setView('objects') }} disabled={!!busy}/>
            <div className="scan-thumbnails" aria-label="扫描画面列表">{draft.images.map((image, index) => <button type="button" key={image.id} aria-label={`查看画面 ${index + 1}`} aria-pressed={imageIndex === index} className={imageIndex === index ? 'is-selected' : ''} disabled={!!busy} onClick={() => setImageIndex(index)}><img src={image.dataUrl} alt=""/><span>{index + 1}</span></button>)}</div>
            <div className="scan-frame-actions"><button type="button" className="scan-text-button" disabled={!!busy} aria-describedby={lockedPhotos ? 'scan-evidence-note' : undefined} onClick={lockedPhotos ? clearRecognition : () => videoCaptureInput.current.click()}><ScanIcon name="reset"/>重新扫描</button><button type="button" className="scan-text-button" disabled={!!busy || lockedPhotos} aria-describedby={lockedPhotos ? 'scan-evidence-note' : undefined} onClick={removePhoto}><ScanIcon name="trash"/>删除画面</button><details className="scan-capture-menu"><summary aria-label="其他采集方式">更多</summary><div className="scan-capture-menu-panel"><div className="scan-alternative-actions"><button type="button" className="scan-secondary" disabled={!!busy || lockedPhotos} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); videoImportInput.current.click() }}><ScanIcon name="play"/>导入视频</button><button type="button" className="scan-secondary" disabled={!!busy || lockedPhotos || draft.images.length >= 4} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); albumInput.current.click() }}><ScanIcon name="image"/>选择照片</button></div><p className="scan-limit-note">最多 4 个画面 · 单张照片原图最多 20 MB</p></div></details></div>
            {lockedPhotos && <p className="scan-evidence-lock scan-visually-hidden" id="scan-evidence-note"><ScanIcon name="lock"/><span>画面已绑定物品，重新扫描前需先清除识别结果。</span></p>}
            {ready === true && <div className="scan-consent"><label className="scan-check"><input type="checkbox" checked={consent} disabled={!!busy} onChange={event => setConsent(event.target.checked)}/><span>我同意将所选画面发送给识别模型<small>原视频不上传，识别结果需人工核对</small></span></label></div>}
            <div className={`scan-footer-action scan-recognition-actions${ready !== true ? ' is-manual' : ''}`}>{ready === true || busy === 'recognize' ? <><button type="button" className="scan-primary" disabled={!!busy || !consent || !ready} onClick={recognize}><ScanIcon name="play"/><span>{busy === 'recognize' ? '正在识别房间与物品…' : '识别房间与物品'}</span><ScanIcon name="right" className="scan-action-arrow"/></button>{busy === 'recognize' ? <button type="button" className="scan-text-button scan-manual-action" onClick={() => busyRef.current?.abort()}>取消识别</button> : <button type="button" className="scan-text-button scan-manual-action" disabled={!!busy} onClick={() => setView('objects')}>手动记录</button>}</> : <>{ready !== true && <div className="scan-model-status" role="status"><p>{ready === null ? '正在检查识别服务…' : statusError ? '识别服务暂不可用，可先手动记录。' : '自动识别暂未开通，可先手动记录。'}</p>{statusError && <button type="button" className="scan-text-button" title={statusError} disabled={!!busy} onClick={() => setStatusRevision(value => value + 1)}>重新检查</button>}</div>}<button type="button" className="scan-primary" disabled={!!busy} onClick={() => setView('objects')}><ScanIcon name="cube"/><span>手动记录</span><ScanIcon name="right" className="scan-action-arrow"/></button><button type="button" className="scan-text-button scan-unavailable-action" disabled title={ready === null ? '正在检查识别服务' : '自动识别暂不可用'}><ScanIcon name="play"/>识别房间与物品</button></>}</div>
            <p className="scan-relative-note">草图仅为相对位置，精确尺寸需另行测量</p>
          </section> : <section id={`scan-${view}-panel`} role="tabpanel" aria-labelledby={`scan-${view}-tab`} className={view === 'layout' ? 'scan-layout-panel' : 'scan-objects-panel'}>
            {view === 'layout' && <RoomLayout objects={draft.objects} selectedId={selectedId} onSelect={setSelectedId} onMove={(id, planPosition) => editObject(id, { planPosition })} disabled={!!busy}/>}
            {objectInspector}
            <div className="scan-footer-action scan-save"><button type="button" className="scan-primary" disabled={!!busy} onClick={saveRoom}><ScanIcon name="save"/><span>{busy === 'save' ? '正在保存…' : '保存房间'}</span><ScanIcon name="right" className="scan-action-arrow"/></button><p>{dirty ? '有未保存的更改' : draft.id ? '已保存 · 仅此账号可见' : '尚未保存'}</p></div>
          </section>}
        </div>}
      </section> : <section id="scan-rooms-panel" role="tabpanel" aria-labelledby="scan-rooms-tab" className="scan-records">
        <div className="scan-record-toolbar"><p>当前账号保存的房间记录</p><button type="button" className="scan-text-button" disabled={listLoading || !!busy} onClick={() => setListRevision(value => value + 1)}><ScanIcon name="reset"/>刷新</button></div>
        {listError ? <p className="scan-feedback is-error" role="alert">{listError}<button type="button" className="scan-text-button" onClick={() => setListRevision(value => value + 1)}>重试</button></p> : listLoading ? <p className="scan-feedback" role="status">正在读取房间记录…</p> : records.length ? records.map(record => <article key={record.id} className="scan-record-row"><div className="scan-record-icon"><ScanIcon name="folder"/></div><div className="scan-record-content"><h3>{record.name}</h3><p>{record.roomType === 'unknown' ? '类型待确认' : record.roomType} · {record.objectCount} 件物品</p><small>更新于 {dateTime(record.updatedAt)}</small></div><div className="scan-record-actions"><button type="button" className="scan-text-button" disabled={!!busy} onClick={() => openRoom(record.id)}>打开房间<ScanIcon name="right"/></button><button type="button" className="scan-text-button" disabled={!!busy} aria-label={`删除房间 ${record.name}`} onClick={() => deleteRoom(record)}><ScanIcon name="trash"/></button></div></article>) : <div className="scan-empty"><ScanIcon name="folder"/><h3>暂无房间记录</h3><p>扫描房间视频，核对后保存即可在这里查看。</p><button type="button" className="scan-secondary" onClick={() => setTab('start')}>开始扫描</button></div>}
      </section>}
    </main>
    <nav className="scan-bottom-nav scan-tabs" role="tablist" aria-label="房间扫描页面"><button id="scan-start-tab" role="tab" aria-selected={tab === 'start'} aria-controls="scan-start-panel" type="button" disabled={!!busy} onClick={() => setTab('start')}><ScanIcon name="scan"/><span>扫描房间</span></button><button id="scan-rooms-tab" role="tab" aria-selected={tab === 'rooms'} aria-controls="scan-rooms-panel" type="button" disabled={!!busy} onClick={() => setTab('rooms')}><ScanIcon name="folder"/><span>我的房间</span></button></nav>
    {confirmation && <ScanConfirmation prompt={confirmation} onResolve={resolveConfirmation}/>}
  </div>
}
