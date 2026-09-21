export async function api(path,method='GET',body){
 const response=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 let data;try{data=await response.json();}catch{throw new Error('服务暂不可用，请稍后重试');}
 if(!response.ok){const error=new Error(data.error||'操作未完成');error.status=response.status;throw error;}return data;
}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
