export function validateOutline(points){
 if(!Array.isArray(points)||points.length<3||points.length>80||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1000)))throw new Error('请标出至少三个有效的外墙顶点');
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-7&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<.1)throw new Error('轮廓有重复顶点');for(let j=i+1;j<points.length;j++){if(j===i+1||(i===0&&j===points.length-1))continue;const c=points[j],d=points[(j+1)%points.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw new Error('轮廓线不能交叉，请重新标记');}}
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}if(Math.abs(area)<200)throw new Error('轮廓面积过小，请重新标记');return points;
}
export function analyzePlan({outline,northAngleDeg,width,height}){
 validateOutline(outline);if(!Number.isFinite(northAngleDeg)||northAngleDeg<0||northAngleDeg>=360)throw new Error('请确认北向角度（0–359.9°）');
 const p=outline.map(([x,y])=>[x*width/1000,y*height/1000]);let twice=0,cx=0,cy=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],c=a[0]*b[1]-b[0]*a[1];twice+=c;cx+=(a[0]+b[0])*c;cy+=(a[1]+b[1])*c;}cx/=3*twice;cy/=3*twice;
 const inside=(x,y)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]),minX=Math.min(...xs),minY=Math.min(...ys),dx=(Math.max(...xs)-minX)/180,dy=(Math.max(...ys)-minY)/180,counts=Array(8).fill(0);let total=0;
 for(let x=0;x<180;x++)for(let y=0;y<180;y++){const px=minX+(x+.5)*dx,py=minY+(y+.5)*dy;if(!inside(px,py))continue;const bearing=(Math.atan2(px-cx,cy-py)*180/Math.PI-northAngleDeg+720)%360;counts[Math.floor((bearing+22.5)%360/45)]++;total++;}
 if(!total)throw new Error('无法计算轮廓面积');
 const dirs=['北','东北','东','东南','南','西南','西','西北'],gua=['坎','艮','震','巽','离','坤','兑','乾'],elements=['水','土','木','木','火','土','金','金'];
 return {version:1,northAngleDeg,outline,center:[cx/width*1000,cy/height*1000],centerInside:inside(cx,cy),sectors:counts.map((n,i)=>({direction:dirs[i],palace:gua[i],element:elements[i],percent:Math.round(n/total*1000)/10})),method:'按确认的外墙轮廓面积重心划分八方，面积占比为网格估算；无尺寸比例，不计算平方米。不据此推断健康、命运或吉凶。'};
}
