
const mountains=['子','癸','丑','艮','寅','甲','卯','乙','辰','巽','巳','丙','午','丁','未','坤','申','庚','酉','辛','戌','乾','亥','壬'];
const palaces=[['坎','北',[0,1,0],'壬 · 子 · 癸'],['艮','东北',[1,0,0],'丑 · 艮 · 寅'],['震','东',[0,0,1],'甲 · 卯 · 乙'],['巽','东南',[1,1,0],'辰 · 巽 · 巳'],['离','南',[1,0,1],'丙 · 午 · 丁'],['坤','西南',[0,0,0],'未 · 坤 · 申'],['兑','西',[0,1,1],'庚 · 酉 · 辛'],['乾','西北',[1,1,1],'戌 · 乾 · 亥']];
const branches='子丑寅卯辰巳午未申酉戌亥'.split(''),animals=['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];let state='empty',selected=5,zoomLevel=1,angle=0,currentImage=null,activeView='work',motionEnabled=true; const records=[];const layers={mountains:true,palaces:true,branches:true};
// 正五行: each symbol keeps its own element across all compass rings.
const fiveElements={
  wood:{color:'#2f7653',symbols:'甲乙寅卯震巽东'},
  fire:{color:'#b13d32',symbols:'丙丁巳午离南'},
  earth:{color:'#8c682a',symbols:'戊己辰戌丑未艮坤'},
  metal:{color:'#68717d',symbols:'庚辛申酉乾兑西'},
  water:{color:'#29343d',symbols:'壬癸子亥坎北'}
};
const symbolElements=Object.fromEntries(Object.entries(fiveElements).flatMap(([element,{symbols}])=>[...symbols].map(symbol=>[symbol,element])));
const elementColor=symbol=>fiveElements[symbolElements[symbol]]?.color||'#333c2d';
const pt=(a,r)=>[400-Math.sin(a*Math.PI/180)*r,400+Math.cos(a*Math.PI/180)*r];
const line=(a,r1,r2,stroke='#d9dacf',w=1)=>{let p=pt(a,r1),q=pt(a,r2);return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${w}"/>`};
const txt=(a,r,t,size=17,color='#333c2d',weight=400,className='')=>{let p=pt(a,r);return `<text class="${className}" x="${p[0]}" y="${p[1]}" fill="${color}" font-size="${size}" font-weight="${weight}">${t}</text>`};
const circle=(r,fill='none',stroke='#dadcd2')=>`<circle cx="400" cy="400" r="${r}" fill="${fill}" stroke="${stroke}"/>`;
function wedge(a,b,r1,r2){let p=pt(a,r2),q=pt(b,r2),v=pt(b,r1),u=pt(a,r1);return `M${p} A${r2},${r2} 0 0 1 ${q} L${v} A${r1},${r1} 0 0 0 ${u} Z`}
function gua(bits,x,y,width=25){return bits.map((solid,j)=>solid?`<path d="M${x-width/2} ${y+j*6}h${width}"/>`:`<path d="M${x-width/2} ${y+j*6}h${width*.4}m${width*.2} 0h${width*.4}"/>`).join('')}
function plan(){if(!currentImage)return '';return `<g transform="rotate(${angle} 400 400)"><image href="${currentImage.url}" x="276" y="276" width="248" height="248" preserveAspectRatio="xMidYMid meet"/></g>`}
function draw(){let s=`<defs><radialGradient id="face"><stop stop-color="#ffffff"/><stop offset=".85" stop-color="#fbfcf8"/><stop offset="1" stop-color="#f4f5ef"/></radialGradient><linearGradient id="rim" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".55" stop-color="#eeefe7"/><stop offset="1" stop-color="#fff"/></linearGradient><filter id="shade" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#46503b" flood-opacity=".12"/></filter></defs>`;s+=`<g filter="url(#shade)">${circle(366,'url(#rim)','#e2e4da')}${circle(359,'url(#face)','#fafbf8')}</g>`;
s+=`<g class="outer-ring">`;
for(let i=0;i<360;i++)s+=line(i,i%10===0?340:i%5===0?345:348,352,i%10===0?'#6d7662':'#c1c7b7',i%10===0?1.3:.7);for(let i=0;i<360;i+=15)s+=txt(i,331,i===0?'0 / 360':i,11.5,'#637057',400,'degree-label');
s+=circle(318)+circle(278)+circle(231)+circle(190,'#fff');
if(state==='detail')s+=`<path d="${wedge(selected*45-22.5,selected*45+22.5,190,318)}" fill="#b63a2b0b" stroke="#b63a2b45"/>`;
if(layers.mountains){mountains.forEach((m,i)=>{s+=line(i*15-7.5,278,318);s+=txt(i*15,299,m,23,elementColor(m),500,'mountain-label')});}
s+=`</g><g class="palace-ring">`;
if(layers.palaces)palaces.forEach(([p,d,b],i)=>{s+=line(i*45-22.5,231,278);let [x,y]=pt(i*45,257);s+=`<g class="palace-hit" role="button" tabindex="0" aria-label="${d}${p}宫" onclick="selectPalace(${i})" onkeydown="if(event.key==='Enter')selectPalace(${i})" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="24" fill="transparent"/><text x="${x}" y="${y-8}" font-size="20" fill="${elementColor(p)}">${p}</text><g stroke="${elementColor(p)}" stroke-width="3">${gua(b,x,y+7,23)}</g></g>`});
s+=`</g><g class="branch-ring">`;
if(layers.branches)branches.forEach((b,i)=>{let[x,y]=pt(i*30,209);s+=`<g><text x="${x-15}" y="${y}" font-size="14" fill="${elementColor(b)}">${b}</text><svg x="${x-1}" y="${y-15}" width="30" height="30" viewBox="${i%4*362} ${Math.floor(i/4)*362} 362 362"><image href="assets/zodiac.png" width="1448" height="1086"/></svg></g>`});
s+=`</g>`;
[0,90,180,270].forEach((a,i)=>s+=txt(a,385,['北','东','南','西'][i],14,elementColor(['北','东','南','西'][i]),500,'direction-label'));

if(currentImage){s+=`<path d="M400 215v370M215 400h370" stroke="#c5cbbd" stroke-dasharray="4 5" stroke-width=".8"/>`+plan();s+=`<path d="M393 400h14m-7-7v14" stroke="#737b64"/>`;}
document.getElementById('luopan').innerHTML=s;document.getElementById('luopan').classList.toggle('is-idle',!currentImage&&motionEnabled);}
