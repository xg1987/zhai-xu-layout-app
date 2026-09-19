// Isolated device-only preview records. No credentials or customer profile keys.
const KEY = 'jiaju-admin-preview-accounts-v1'
export function listPreviewAccounts(){
 const raw=localStorage.getItem(KEY)
 if(!raw)return []
 const rows=JSON.parse(raw)
 if(!Array.isArray(rows))throw new Error('无法读取本机预览资料')
 return rows
}
export function validateAccount(draft,rows,id){
 const errors={}
 const login=draft.login.trim(),name=draft.name.trim()
 if(!login)errors.login='请输入登录账号'
 else if(!/^[a-zA-Z0-9][a-zA-Z0-9_.@+-]{2,63}$/.test(login))errors.login='账号需为 3–64 位字母、数字或 _ . @ + -，以字母或数字开头'
 else if(rows.some(r=>r.id!==id&&r.login.toLowerCase()===login.toLowerCase()))errors.login='该登录账号已存在于本机预览'
 if(!name)errors.name='请输入姓名'
 else if(name.length>24)errors.name='姓名最多 24 个字'
 return errors
}
export function savePreviewAccount(draft,id){
 const rows=listPreviewAccounts(),errors=validateAccount(draft,rows,id)
 if(Object.keys(errors).length){const error=new Error('请检查输入内容');error.fields=errors;throw error}
 const previous=id?rows.find(r=>r.id===id):null
 if(id&&!previous)throw new Error('此预览记录已不存在，请刷新列表')
 const record={id:previous?.id||crypto.randomUUID(),login:draft.login.trim(),name:draft.name.trim(),role:draft.role==='admin'?'admin':'user',status:draft.status==='disabled'?'disabled':'enabled',createdAt:previous?.createdAt||Date.now(),updatedAt:Date.now()}
 localStorage.setItem(KEY,JSON.stringify(previous?rows.map(r=>r.id===id?record:r):[record,...rows]))
 return record
}
export function deletePreviewAccount(id){
 const rows=listPreviewAccounts().filter(r=>r.id!==id)
 if(rows.length)localStorage.setItem(KEY,JSON.stringify(rows));else localStorage.removeItem(KEY)
}
