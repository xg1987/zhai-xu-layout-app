import { currentUser } from '../server/auth-core.mjs';
export async function onRequest(context){
 const url=new URL(context.request.url),path=url.pathname.replace(/\/+$/,'')||'/';
 if(['/', '/index.html','/phone','/phone.html','/admin','/admin.html'].includes(path)|| (path.startsWith('/admin/')&&path!=='/admin/login')){
  if(!context.env.DB)return new Response('账号服务暂不可用',{status:503});
  let user;try{user=await currentUser(context.request,context.env.DB);}catch{return new Response('账号服务暂不可用',{status:503});}
  const admin=path.startsWith('/admin');
  if(!user)return Response.redirect(new URL(admin?'/login?admin=1':'/login',url),302);
  if(admin&&user.role!=='admin')return Response.redirect(new URL('/',url),302);
  const next=admin&&path.startsWith('/admin/')?await context.env.ASSETS.fetch(new URL('/admin',url)):await context.next();const response=new Response(next.body,next);response.headers.set('Cache-Control','no-store');return response;
 }
 return context.next();
}
