import {api} from './auth-client.js';
try{
 const {user}=await api('/api/me');
 if(!user)location.replace('/login');
 else{
  document.querySelector('.avatar').textContent=user.name.slice(0,1);
  const label=document.querySelector('#accountButton>span:not(.avatar)');if(label)label.textContent=user.name;
  const menu=document.querySelector('#accountPop');menu.replaceChildren();
  const name=document.createElement('strong');name.textContent=user.name;menu.append(name);
  if(user.role==='admin'){const link=document.createElement('a');link.href='/admin';link.textContent='管理后台';link.target='_top';menu.append(link);}
  const logout=document.createElement('button');logout.textContent='退出登录';logout.style.cssText='display:block;padding:14px 0 0;color:var(--accent)';logout.onclick=async()=>{logout.disabled=true;try{await api('/api/logout','POST',{});location.replace('/login');}catch{logout.textContent='退出失败，请重试';logout.disabled=false;}};menu.append(logout);
 }
}catch{location.replace('/login');}
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
