export async function adminRequest(path, options = {}) {
 const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
 const data = await response.json().catch(() => { throw new Error('服务暂不可用，请稍后重试') })
 if (response.status === 401) { window.location.replace('/admin/login'); throw new Error('请重新登录') }
 if (!response.ok) throw new Error(data.error || '操作未完成，请重试')
 return data
}
export const dateTime = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'
export const eventNames = { 'account.approve': '通过注册审核', 'account.reject': '拒绝注册申请', 'invitation.create': '创建邀请码', 'invitation.enable': '启用邀请码', 'invitation.disable': '停用邀请码', 'account.create': '新建账号', 'account.edit': '编辑账号', 'account.enable': '启用账号', 'account.disable': '停用账号', 'account.role': '调整角色', 'account.password': '重置密码', 'account.login': '登录', 'account.logout': '退出登录', 'account.register': '注册账号', 'profile.edit': '修改资料', 'password.change': '修改密码', 'model.save': '保存模型配置', 'model.remove': '移除模型配置', 'model.test': '测试模型连接' }
