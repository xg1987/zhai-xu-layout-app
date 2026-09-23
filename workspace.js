const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={close:'<path d="m6 6 12 12M18 6 6 18"/>',report:'<path d="M6 3h9l4 4v14H5V3zM14 3v5h5M9 12h6M9 16h4"/>',history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',arrow:'<path d="m9 5 7 7-7 7"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||''}</svg>`;
function heading(title){return `<div class="panel-heading"><h2>${title}</h2><button class="icon-button" onclick="closePanel()" aria-label="关闭面板">${icon('close')}</button></div>`}
function layerList(){return [['mountains','二十四山'],['palaces','后天八卦'],['branches','地支生肖']].map(([key,label])=>`<div class="layer"><span>${label}</span><button class="toggle" role="switch" aria-label="${label}" aria-checked="${layers[key]}" onclick="toggle('${key}')"></button></div>`).join('')}
function toggle(key){layers[key]=!layers[key];draw();document.querySelectorAll(`[aria-label="${{mountains:'二十四山',palaces:'后天八卦',branches:'地支生肖'}[key]}"]`).forEach(b=>b.setAttribute('aria-checked',layers[key]))}
function renderPanel(){const panel=$('inspector');panel.hidden=state==='empty'||activeView==='history';if(panel.hidden)return;
if(state==='calibrate'){panel.innerHTML=heading('方位校准')+`<label class="field-label" for="angleInput">北向角度</label><div class="input-wrap"><input id="angleInput" class="input" type="number" min="0" max="359.9" step="0.1" value="${angle.toFixed(1)}" oninput="updateAngle(this.value)" aria-label="北向校准角度"><span>°</span></div><p class="subtle">按户型图上的北向标记调整</p><button class="primary" onclick="requestAnalysis()">确认分析家居图 ${icon('arrow')}</button><section class="section"><h3>显示图层</h3>${layerList()}</section>`;}
else if(state==='results'){panel.innerHTML=heading('分析结果')+`<div class="empty-result"><div class="result-symbol">${icon('report')}</div><h3>${currentImage?'尚未生成分析结果':'暂无分析结果'}</h3><p>${currentImage?'完成方位与轮廓确认后，<br>在这里查看各宫位的分析。':'上传户型图后，<br>在这里查看分析结果。'}</p></div>`+(currentImage?`<section class="section"><h3>宫位信息</h3><div class="palace-grid">${palaces.map(([p,d],i)=>`<button onclick="selectPalace(${i})" aria-label="查看${d}${p}宫">${p}<small>${d}</small></button>`).join('')}</div></section><button class="neutral-button" onclick="navigate('work')">返回工作台</button>`:`<button class="neutral-button" onclick="navigate('work')">返回工作台</button>`);}
else if(state==='detail'){const[p,d,b,shan]=palaces[selected];panel.innerHTML=heading(`${d} · ${p}宫`)+`<div class="detail-code"><svg viewBox="0 0 48 35" fill="none" stroke="#ad3b2e" stroke-width="4">${gua(b,24,8,38)}</svg><div><b>${selected*45}°</b><small>宫位中心方位角</small></div></div><section class="section"><div class="data-row"><span>方位</span><b>${d}</b></div><div class="data-row"><span>宫位</span><b>${p}宫</b></div><div class="data-row"><span>二十四山</span><b>${shan}</b></div></section><button class="neutral-button" onclick="openResults()">返回分析结果</button>`;}}
function navSelection(view){activeView=view;syncMobileNavigation(view==='history'||view==='results'?'history':'work');const selectedView=view==='results'?'history':view;['work','history'].forEach(id=>{$(id).classList.toggle('selected',id===selectedView);if(id===selectedView)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current')})}
function navigate(view){if($('mobileTools').open)$('mobileTools').close();$('sizePop').hidden=true;$('sizeButton').setAttribute('aria-expanded','false');$('layersPop').hidden=true;$('layersButton').setAttribute('aria-expanded','false');navSelection(view);$('workspace').hidden=view==='history';$('historyPage').hidden=view!=='history';if(view==='history'){renderHistory();$('inspector').hidden=true;return}setState(view==='results'?'results':'empty');if(view==='results')focusMobilePanel()}
function setState(next){state=next;$('upload').hidden=false;$('uploadButton').hidden=!!currentImage;$('fileAction').hidden=!currentImage;$('angleReadout').hidden=true;$('analyzeImage').hidden=!currentImage;if(currentImage){$('readout').textContent=angle.toFixed(1)+'°'}draw();renderPanel()}
function openResults(){navigate('results')}
function selectPalace(i){selected=i;if(!currentImage){showToast(palaces[i][1]+' · '+palaces[i][0]+'宫 · '+palaces[i][3]);return}navSelection('results');setState('detail');focusMobilePanel()}
function focusMobilePanel(){if(matchMedia('(max-width:750px)').matches)$('inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'})}
function closePanel(){navSelection('work');state='empty';$('inspector').hidden=true;draw()}
function updateAngle(value){const n=Number(value);if(value===''||!Number.isFinite(n)||n<0||n>=360)return;angle=n;if(currentImage)currentImage.angle=n;$('readout').textContent=angle.toFixed(1)+'°';draw()}
function zoom(delta){zoomLevel=Math.max(.8,Math.min(1.2,zoomLevel+delta));$('luopan').style.transform=`scale(${zoomLevel})`;$('zoom').textContent=Math.round(zoomLevel*100)+'%';if($('mobileZoomValue'))$('mobileZoomValue').textContent=Math.round(zoomLevel*100)+'%';if($('mobileZoomRange'))$('mobileZoomRange').value=Math.round(zoomLevel*100)}
function fitWindow(){zoomLevel=1;zoom(0)}
let uploadScrollTop=0;function chooseImage(){uploadScrollTop=window.scrollY;$('imageInput').click()}
async function loadImage(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){showToast('请选择 JPG、PNG 或 WebP 图片');return}if(file.size>20*1024*1024){showToast('图片大小不能超过 20 MB');return}const url=URL.createObjectURL(file);const img=new Image();img.src=url;try{await img.decode()}catch{URL.revokeObjectURL(url);showToast('图片无法读取，请重新选择');return}currentImage={id:Date.now(),name:file.name,url,angle:0,created:new Date()};records.unshift(currentImage);angle=0;zoomLevel=1;zoom(0);navigate('work');requestAnimationFrame(()=>window.scrollTo({top:uploadScrollTop,behavior:'instant'}));$('imageInput').value=''}
function deleteImage(){if(!currentImage)return;const i=records.indexOf(currentImage);if(i>=0)records.splice(i,1);URL.revokeObjectURL(currentImage.url);currentImage=null;angle=0;$('imageInput').value='';zoomLevel=1;zoom(0);navigate('work')}
function renderHistory(){$('historyPage').innerHTML=`<h2>历史记录</h2>`+(records.length?records.map(r=>`<button class="record" onclick="openRecord(${r.id})"><img src="${r.url}" alt=""><span><strong>${escapeHtml(r.name)}</strong><small>${r.created.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></span>${icon('arrow')}</button>`).join(''):`<div class="empty-result"><div class="result-symbol">${icon('history')}</div><h3>暂无历史记录</h3></div>`)}
function openRecord(id){currentImage=records.find(r=>r.id===id);if(!currentImage)return;angle=currentImage.angle;navigate('work')}
let toastTimer;function showToast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2500)}
['work','history'].forEach(id=>$(id).onclick=()=>navigate(id));$('uploadButton').onclick=chooseImage;$('replaceImage').onclick=chooseImage;$('deleteImage').onclick=deleteImage;$('imageInput').onchange=e=>loadImage(e.target.files[0]);$('zoomIn').onclick=()=>zoom(.1);$('zoomOut').onclick=()=>zoom(-.1);$('zoom').onclick=fitWindow;$('fitWindow').onclick=fitWindow;
$('layersButton').onclick=()=>{if(matchMedia('(max-width:750px)').matches){openMobileTool('layers');return}const p=$('layersPop');p.innerHTML='<h3>显示图层</h3>'+layerList();p.hidden=!p.hidden;$('layersButton').setAttribute('aria-expanded',String(!p.hidden))};
$('accountButton').onclick=()=>{$('accountPop').hidden=!$('accountPop').hidden;$('accountButton').setAttribute('aria-expanded',String(!$('accountPop').hidden))};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('layersPop').hidden=true;$('layersButton').setAttribute('aria-expanded','false');$('accountPop').hidden=true;$('accountButton').setAttribute('aria-expanded','false')}});
document.addEventListener('click',e=>{if(!$('mobileTools').open&&!e.target.closest('.popover-anchor')){$('layersPop').hidden=true;$('layersButton').setAttribute('aria-expanded','false')}if(!e.target.closest('.account,.account-pop')){$('accountPop').hidden=true;$('accountButton').setAttribute('aria-expanded','false')}});
$('workspace').addEventListener('dragover',e=>{e.preventDefault()});$('workspace').addEventListener('drop',e=>{e.preventDefault();loadImage(e.dataTransfer.files[0])});setState('empty');

const mobileToolQuery=matchMedia('(max-width:750px)');
function placeCompassTools(){const tools=document.querySelector('.rail-tools');(mobileToolQuery.matches?$('canvasToolSlot'):document.querySelector('.rail')).append(tools)}
mobileToolQuery.addEventListener('change',placeCompassTools);placeCompassTools();

function alignSpaceSwitch(){const header=document.querySelector('.header');const canvas=document.querySelector('.canvas-wrap');const headerRect=header.getBoundingClientRect();const canvasRect=canvas.getBoundingClientRect();const center=canvasRect.width>0?canvasRect.left+canvasRect.width/2-headerRect.left:headerRect.width/2;header.style.setProperty('--mode-center',center+'px')}
const spaceAlignmentObserver=new ResizeObserver(alignSpaceSwitch);spaceAlignmentObserver.observe(document.querySelector('.canvas-wrap'));spaceAlignmentObserver.observe(document.querySelector('.header'));alignSpaceSwitch();

$('sizeButton').onclick=()=>{if(matchMedia('(max-width:750px)').matches){openMobileTool('size');return}$('sizePop').hidden=!$('sizePop').hidden;$('sizeButton').setAttribute('aria-expanded',String(!$('sizePop').hidden))};
document.addEventListener('click',e=>{if(!$('mobileTools').open&&!e.target.closest('.scale-anchor')){$('sizePop').hidden=true;$('sizeButton').setAttribute('aria-expanded','false')}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('sizePop').hidden=true;$('sizeButton').setAttribute('aria-expanded','false')}});
document.querySelectorAll('.motion-cta').forEach(button=>{
  button.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||matchMedia('(prefers-reduced-motion:reduce)').matches)return;const r=button.getBoundingClientRect();const x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;button.style.setProperty('--analysis-rx',((.5-y)*5)+'deg');button.style.setProperty('--analysis-ry',((x-.5)*5)+'deg');button.style.setProperty('--analysis-light-x',(x*100)+'%');button.style.setProperty('--analysis-light-y',(y*100)+'%')});
  button.addEventListener('pointerleave',()=>{button.style.setProperty('--analysis-rx','0deg');button.style.setProperty('--analysis-ry','0deg')});
});

zoom(0);


// Touch tools use a native modal sheet; desktop keeps its anchored popovers.
function syncMobileNavigation(id){const rail=document.querySelector('.rail');rail.dataset.active=id}
function openMobileTool(tool){
  const button=$(tool==='layers'?'layersButton':'sizeButton');
  $('layersPop').hidden=true;$('sizePop').hidden=true;
  $('mobileToolTitle').textContent=tool==='layers'?'图层':'大小';
  $('mobileToolContent').innerHTML=tool==='layers'?`<div class="sheet-layers">${layerList()}</div>`:`<div class="sheet-zoom"><div class="sheet-zoom-stepper"><button aria-label="缩小罗盘" onclick="zoom(-.05)"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><output id="mobileZoomValue">${Math.round(zoomLevel*100)}%</output><button aria-label="放大罗盘" onclick="zoom(.05)"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg></button></div><input id="mobileZoomRange" type="range" min="80" max="120" step="5" value="${Math.round(zoomLevel*100)}" aria-label="罗盘缩放比例" oninput="zoom(Number(this.value)/100-zoomLevel)"><button class="sheet-fit" onclick="fitWindow()">适应窗口</button></div>`;
  button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls','mobileTools');
  syncMobileNavigation(button.id);$('mobileTools').showModal();
}
$('closeMobileTools').onclick=()=>$('mobileTools').close();
$('mobileTools').addEventListener('close',()=>{
  ['layers','size'].forEach(tool=>{$(tool+'Button').setAttribute('aria-expanded','false');$(tool+'Button').setAttribute('aria-controls',tool+'Pop')});
  syncMobileNavigation(activeView==='history'||activeView==='results'?'history':'work');
});
$('mobileTools').addEventListener('click',event=>{if(event.target!==$('mobileTools'))return;const r=$('mobileTools').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('mobileTools').close()});
matchMedia('(max-width:750px)').addEventListener('change',()=>{if($('mobileTools').open)$('mobileTools').close();$('layersPop').hidden=true;$('sizePop').hidden=true;['layers','size'].forEach(tool=>$(tool+'Button').setAttribute('aria-expanded','false'))});
syncMobileNavigation(activeView==='history'?'history':'work');
