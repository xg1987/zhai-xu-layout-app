import {api} from './auth-client.js';
const register=location.pathname.startsWith('/register');
const form=document.querySelector('#authForm'),feedback=document.querySelector('#authFeedback'),submit=document.querySelector('#submitAuth');
document.title=(register?'注册账号':'登录')+' · 家居风水';
document.querySelector('#authTitle').textContent=register?'注册账号':'登录';
submit.firstChild.textContent=register?'提交注册申请 ':'登录 ';
document.querySelectorAll('.register-field').forEach(node=>{node.hidden=!register;node.querySelectorAll('input').forEach(input=>input.required=register);if(node.matches('label'))node.querySelector('input').required=register;});
document.querySelector('#password').autocomplete=register?'new-password':'current-password';
document.querySelector('#switchAuth').textContent=register?'已有账号？立即登录':'注册账号';
document.querySelector('#switchAuth').href=register?'/login':'/register';
document.querySelector('#togglePassword').onclick=event=>{const input=document.querySelector('#password'),visible=input.type==='password';input.type=visible?'text':'password';event.currentTarget.setAttribute('aria-pressed',String(visible));event.currentTarget.setAttribute('aria-label',visible?'隐藏密码':'显示密码');};
form.onsubmit=async event=>{
 event.preventDefault();if(submit.disabled)return;feedback.hidden=true;
 const body=Object.fromEntries(new FormData(form));
 if(register&&body.password!==body.confirm){feedback.textContent='两次输入的密码不一致';feedback.hidden=false;return;}
 delete body.confirm;submit.disabled=true;
 try{
  const data=await api(register?'/api/register':'/api/login','POST',body);
  if(data.pendingApproval){form.reset();feedback.textContent='申请已提交，管理员审核通过后即可登录。';feedback.hidden=false;}
  else location.assign(data.user.role==='admin'?'/admin':'/');
 }catch(error){feedback.textContent=error.message;feedback.hidden=false;}
 finally{form.elements.password.value='';form.elements.confirm.value='';submit.disabled=false;}
};
const video=document.querySelector('video'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
function syncVideo(){if(reduced.matches||document.hidden){video.pause();return;}if(!video.getAttribute('src'))video.src='/assets/auth-residential-loop-v2.mp4';video.muted=true;video.play().catch(()=>{});}
reduced.addEventListener('change',syncVideo);document.addEventListener('visibilitychange',syncVideo);syncVideo();
window.addEventListener('pagehide',()=>{form.elements.password.value='';form.elements.confirm.value='';});

if(register){const invite=new URLSearchParams(location.search).get('invite');if(invite)form.elements.inviteCode.value=invite;}
