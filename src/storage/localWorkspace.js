const DATABASE = 'jiaju-layout-local-v1'
let databasePromise
function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('plans', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { databasePromise = undefined; reject(request.error) }
  })
  return databasePromise
}
async function transaction(mode, action) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plans', mode)
    const store = tx.objectStore('plans')
    let result
    action(store, value => { result = value })
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('存储操作已中止'))
  })
}
export function listPlans() {
  return transaction('readonly', (store, done) => {
    const request = store.getAll()
    request.onsuccess = () => done(request.result.sort((a,b) => b.updatedAt - a.updatedAt))
  })
}
export function createPlan(blob) {
  const record = { id: crypto.randomUUID(), blob, name: blob.name.replace(/\.[^.]+$/, '') || '未命名户型', filename: blob.name, createdAt: Date.now(), updatedAt: Date.now(), angle: 0, points: [], layers: null, step: 1 }
  return transaction('readwrite', (store, done) => { store.add(record); done(record) })
}
export function updatePlan(id, changes) {
  return transaction('readwrite', (store, done) => {
    const request = store.get(id)
    request.onsuccess = () => {
      if (!request.result) { done(null); return }
      const next = { ...request.result, ...changes, id, updatedAt: Date.now() }
      store.put(next)
      done(next)
    }
  })
}
export function deletePlan(id) { return transaction('readwrite', (store) => store.delete(id)) }
const PROFILE_KEY = 'jiaju-layout-device-profile'
export function readDisplayName() {
  try { return localStorage.getItem(PROFILE_KEY) || '' } catch { return '' }
}
export function writeDisplayName(value) {
  if (value) localStorage.setItem(PROFILE_KEY, value)
  else localStorage.removeItem(PROFILE_KEY)
}
