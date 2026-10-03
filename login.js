import { api } from './auth-client.js';

const register = location.pathname.startsWith('/register');
const form = document.querySelector('#authForm');
const feedback = document.querySelector('#authFeedback');
const submit = document.querySelector('#submitAuth');
const submitLabel = document.querySelector('#submitLabel');
const password = form.elements.password;
const recovery = document.querySelector('#recoveryDialog');
const errorIds = { login: 'loginError', name: 'nameError', inviteCode: 'inviteError', password: 'passwordError', confirm: 'confirmError' };
let busy = false;
let credentialError = false;

document.title = (register ? '注册账号' : '登录') + ' · 家居风水';
document.querySelector('#authTitle').textContent = register ? '注册账号' : '登录';
submitLabel.textContent = register ? '提交注册申请' : '登录';
document.querySelectorAll('.register-field').forEach(node => {
  node.hidden = !register;
  node.querySelectorAll('input').forEach(input => { input.required = register; });
});
password.autocomplete = register ? 'new-password' : 'current-password';
password.enterKeyHint = register ? 'next' : 'go';
document.querySelector('.auth-options').hidden = register;
document.querySelector('#switchHint').textContent = register ? '已有账号？' : '还没有账号？';
document.querySelector('#switchAuth').firstChild.textContent = register ? '立即登录 ' : '注册账号 ';
document.querySelector('#switchAuth').href = register ? '/login' : '/register';
document.body.classList.toggle('auth-register-page', register);

function setFieldError(name, message) {
  const input = form.elements[name], node = document.getElementById(errorIds[name]);
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  node.textContent = message || '';
  node.hidden = !message;
}

function showFeedback(message, state = 'error') {
  feedback.textContent = message;
  feedback.dataset.state = state;
  feedback.hidden = false;
}

function setBusy(value) {
  busy = value;
  submit.disabled = value;
  submit.setAttribute('aria-busy', String(value));
  form.setAttribute('aria-busy', String(value));
  document.querySelector('.auth-spinner').hidden = !value;
  document.querySelector('.auth-arrow').hidden = value;
  submitLabel.textContent = value ? (register ? '正在提交…' : '正在登录…') : (register ? '提交注册申请' : '登录');
  Array.from(form.elements).forEach(input => { if (input.tagName === 'INPUT') input.readOnly = value; });
}

function validate(body) {
  let first;
  const reject = (name, message) => { setFieldError(name, message); first ||= form.elements[name]; };
  if (!body.login.trim()) reject('login', '请输入登录账号');
  else if (body.login.trim().length < 3) reject('login', '账号至少需要 3 位');
  else if (register && !/^[a-z0-9][a-z0-9_.@+-]{2,63}$/i.test(body.login.trim())) reject('login', '请使用字母、数字或常用账号符号');
  if (register && !body.name.trim()) reject('name', '请输入显示名称');
  if (register && !body.inviteCode.trim()) reject('inviteCode', '请输入邀请码');
  if (!body.password) reject('password', '请输入密码');
  else if (body.password.length < 8) reject('password', '密码至少需要 8 位');
  else if (new TextEncoder().encode(body.password).length > 72) reject('password', '密码不能超过 72 字节');
  if (register && !body.confirm) reject('confirm', '请再次输入密码');
  else if (register && body.password !== body.confirm) reject('confirm', '两次输入的密码不一致');
  first?.focus();
  return !first;
}

for (const name of Object.keys(errorIds)) {
  form.elements[name].addEventListener('input', () => {
    setFieldError(name, '');
    if (credentialError && (name === 'login' || name === 'password')) {
      setFieldError('login', '');
      setFieldError('password', '');
      credentialError = false;
    }
    feedback.hidden = true;
  });
}

document.querySelector('#togglePassword').onclick = event => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
  event.currentTarget.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
};

document.querySelector('#forgotPassword').onclick = () => {
  const account = document.querySelector('#recoveryAccount'), value = form.elements.login.value.trim();
  account.textContent = value ? '登录账号：' + value : '';
  account.hidden = !value;
  recovery.showModal();
};
document.querySelector('#closeRecovery').onclick = document.querySelector('#recoveryDone').onclick = () => recovery.close();

form.onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  feedback.hidden = true;
  Object.keys(errorIds).forEach(name => setFieldError(name, ''));
  credentialError = false;
  const body = Object.fromEntries(new FormData(form));
  if (!validate(body)) return;
  delete body.confirm;
  setBusy(true);
  let navigating = false;
  try {
    const data = await api(register ? '/api/register' : '/api/login', 'POST', body);
    if (data.pendingApproval) {
      form.reset();
      showFeedback('申请已提交，管理员审核通过后即可登录。', 'success');
    } else {
      navigating = true;
      submitLabel.textContent = '登录成功，正在进入…';
      location.assign(data.user.role === 'admin' ? '/admin' : '/');
    }
  } catch (error) {
    showFeedback(error.message);
    if (!register && error.status === 401) {
      credentialError = true;
      form.elements.login.setAttribute('aria-invalid', 'true');
      password.setAttribute('aria-invalid', 'true');
      password.focus();
    }
  } finally {
    password.value = '';
    form.elements.confirm.value = '';
    password.type = 'password';
    document.querySelector('#togglePassword').setAttribute('aria-pressed', 'false');
    document.querySelector('#togglePassword').setAttribute('aria-label', '显示密码');
    if (!navigating) setBusy(false);
  }
};

const video = document.querySelector('video'), reduced = matchMedia('(prefers-reduced-motion:reduce)'), mobile = matchMedia('(max-width:600px)');
function syncVideo() {
  if (mobile.matches || reduced.matches || document.hidden) { video.pause(); return; }
  if (!video.getAttribute('src')) video.src = '/assets/auth-residential-loop-v2.mp4';
  video.muted = true;
  video.play().catch(() => {});
}
reduced.addEventListener('change', syncVideo);
mobile.addEventListener('change', syncVideo);
document.addEventListener('visibilitychange', syncVideo);
syncVideo();
window.addEventListener('pagehide', () => { password.value = ''; form.elements.confirm.value = ''; });

function fitViewport() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--auth-viewport-height', height + 'px');
  document.body.classList.toggle('auth-short-viewport', height < 600);
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.addEventListener('resize', fitViewport);
fitViewport();
if (register) {
  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) form.elements.inviteCode.value = invite;
}
