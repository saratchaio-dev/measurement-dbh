import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { STORAGE_KEY, normalizeDecision, csvText, syncReviews } from './reviews.js?v=feedback-1';

const $ = id => document.getElementById(id);
const DECISION_STORAGE_KEY = STORAGE_KEY;
const state = {records: [], filtered: [], current: null, details: null, token: 0, overview: null, detail: null, markers: [], groups: {}, decisions: loadDecisions(), learning: null, savedDates: {}, releaseDates: {}, syncQueue: Promise.resolve()};
const colors = {STANDARD_DBH:0x4d9cd8, ALTERNATIVE_POM:0xcca749, MANUAL_REVIEW:0xbb8b62};
const statusText = {STANDARD_DBH:'Standard DBH', ALTERNATIVE_POM:'Alternative POM', MANUAL_REVIEW:'ต้องตรวจทาน'};
const names = {baseline:'V3.1 เดิม',point_weighted_control:'Control · ฟิตให้น้ำหนักตามจำนวนจุด',sector_balanced:'เปลี่ยนน้ำหนักให้สมดุลรอบหน้าตัด',ground_only:'เพิ่มการประเมินพื้นเฉพาะต้น',axis_only:'เพิ่มการประเมินแกนแบบ robust',combined_without_stability:'รวมพื้น + แกน + ความต่อเนื่อง',combined:'รวมทั้งหมด + ทดสอบความเสถียร'};
const reasons = {GROUND_SECTORS_INSUFFICIENT:'จุดรองรับระดับพื้นไม่ครบรอบต้น',GROUND_SPATIALLY_UNSTABLE:'ระดับพื้นไม่สม่ำเสมอ',GROUND_SHIFT_UNSUPPORTED:'ระดับพื้นต่างจากเดิมเกินเกณฑ์',INDEPENDENT_ELLIPSE_DISAGREES:'หน้าตัดไม่สอดคล้องกับวงกลม',MIXED_OR_NONCIRCULAR_SECTION:'จุดหลายส่วนปะปน / หน้าตัดไม่กลม',INCOMPLETE_ANGULAR_SUPPORT:'หลักฐานรอบหน้าตัดไม่ครบ',LARGE_UNOBSERVED_SECTOR:'มีมุมอับขนาดใหญ่',OPERATIONAL_RADIUS_GUARDRAIL:'รัศมีเกินเกณฑ์อัตโนมัติ 0.18 m',AXIS_CENTERS_INCONSISTENT:'ศูนย์กลางหลายระดับไม่ต่อเนื่อง',AXIS_NOT_BRACKETED_BY_OBSERVATIONS:'แกนไม่มีหลักฐานคร่อมระดับวัด',CONTINUITY_REQUIRES_THREE_LEVELS:'ขาดหลักฐานต่อเนื่อง 3 ระดับ',SENSITIVITY_VARIANT_FAILS_GEOMETRY:'บางเงื่อนไขทดสอบความเสถียรไม่ผ่าน',NOT_TESTED_GEOMETRY_OR_AXIS_GROUND_FAILED:'ยังทดสอบความเสถียรไม่ได้: รูปทรง/พื้น/แกนไม่ผ่าน',PASSES_EXPERIMENTAL_GEOMETRY_GATES:'ผ่านเกณฑ์เรขาคณิตรุ่นทดลอง',NOT_FIELD_VALIDATED:'ยังไม่ผ่านการตรวจสอบภาคสนาม'};
const fmt = (v,d=2) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function json(url) {const r=await fetch(url); if(!r.ok) throw Error(`${url}: ${r.status}`); return r.json();}
function failure(error) {$('loadError').hidden=false;$('loadError').textContent=`ไม่สามารถแสดงผลได้: ${error.message}`;}
function loadDecisions() {
  try {
    const raw = JSON.parse(localStorage.getItem(DECISION_STORAGE_KEY)||'{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.values(raw).map(normalizeDecision).map(r=>[r.tree_id,r]));
  } catch { return {}; }
}
function persistDecisions() {
  let browserSaved=false;
  try { localStorage.setItem(DECISION_STORAGE_KEY, JSON.stringify(state.decisions)); browserSaved=true; }
  catch { $('reviewSync').textContent = 'ยังบันทึกใน browser ไม่สำเร็จ กำลังลองบันทึกลงเครื่อง'; }
  state.syncQueue = state.syncQueue.catch(()=>{}).then(async () => {
    try {
      const records = await syncReviews(Object.values(state.decisions));
      for (const row of records) {
        state.savedDates[row.tree_id] = row.updated_at;
        const local = state.decisions[row.tree_id];
        if (!local || Date.parse(local.updated_at) <= Date.parse(row.updated_at)) state.decisions[row.tree_id] = row;
      }
      try { localStorage.setItem(DECISION_STORAGE_KEY, JSON.stringify(state.decisions)); } catch {}
      $('reviewSync').textContent = 'บันทึกคำตอบลงเครื่องแล้ว ' + records.filter(r=>r.action!=='UNREVIEWED').length + ' ต้น';
      if (state.current) renderDecision(state.current, false);
      filterRecords(); updateDecisionDownload();
    } catch (error) {
      const deployed = location.protocol === 'https:';
      $('reviewSync').textContent = error.message + (deployed?' — รุ่น deploy เก็บคำตอบไว้ใน browser และส่งออก CSV ได้':' — '+(browserSaved?'เก็บคำตอบใน browser ไว้ก่อน':'ยังบันทึกไม่ได้ กรุณาดาวน์โหลด CSV ก่อนปิดหน้า'));
    }
  });
}
function decisionText(action){return {KEEP:'เอาต้นนี้',REJECT:'ไม่เอาต้นนี้',EDIT:'แก้ไขแล้ว'}[action]||'ยังไม่บันทึก';}
function currentDecision(record) {
  const row = record ? state.decisions[record.tree_id] : null;
  return row && row.action !== 'UNREVIEWED' ? row : null;
}
function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
function decisionValue(record){return normalizeDecision(record).action;}
function updateDecisionDownload() {
  const link=$('decisionDownload'); if(!link)return;
  try {
    const rows = Object.values(state.decisions);
    const text = csvText(rows);
    if(state.decisionUrl?.startsWith('blob:')) URL.revokeObjectURL(state.decisionUrl);
    state.decisionUrl=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    link.href=state.decisionUrl;
    link.textContent='บันทึกการตัดสินใจ CSV ('+rows.filter(r=>r.action!=='UNREVIEWED').length+') ↗';
  } catch(error) { $('reviewSync').textContent=error.message; link.removeAttribute('href'); }
}
function renderDecision(record, resetForm=true) {
  const saved=currentDecision(record);
  for (const [key,id] of Object.entries({KEEP:'decisionKeep',REJECT:'decisionReject',EDIT:'decisionEdit'})) {
    $(id).classList.toggle('active',saved?.action===key);
    $(id).setAttribute('aria-pressed', String(saved?.action===key));
  }
  const durable = saved && Date.parse(state.savedDates[record.tree_id]) === Date.parse(saved.updated_at);
  const released = saved && state.releaseDates[record.tree_id] === saved.updated_at;
  $('decisionSaved').textContent=saved ? decisionText(saved.action)+' · '+(durable?'บันทึกลงเครื่องแล้ว':released?'โหลดจากชุดข้อมูลที่ deploy แล้ว':'เก็บใน browser') : 'ยังไม่บันทึก';
  if (resetForm) {
    $('decisionForm').hidden=true;
    $('decisionStatus').value=saved?.action||'EDIT';
    $('decisionPom').value=saved?.pom_m??'';
    $('decisionDiameter').value=saved?.diameter_cm??'';
    $('decisionNote').value=saved?.note??'';
  }
  renderLearningRecord(record);
}
function openDecisionForm() {
  if (!state.current) return;
  const saved=currentDecision(state.current);
  $('decisionStatus').value=saved?.action||'EDIT';
  $('decisionPom').value=saved?.pom_m??'';
  $('decisionDiameter').value=saved?.diameter_cm??'';
  $('decisionNote').value=saved?.note||'';
  $('decisionForm').hidden=false; $('decisionNote').focus();
}
function saveDecision(action, values={}) {
  const record=state.current; if(!record)return;
  const previous=currentDecision(record)||{};
  const value=(key)=>Object.hasOwn(values,key) ? (values[key]===''?null:Number(values[key])) : (previous[key]??null);
  const saved={...previous,tree_id:record.tree_id,action,decision:action,label:decisionText(action),
    pom_m:value('pom_m'),diameter_cm:value('diameter_cm'),note:String(values.note??previous.note??''),
    source_status:record.status,source_algorithm:'experimental',updated_at:new Date().toISOString()};
  state.decisions[record.tree_id]=saved; renderDecision(record); updateDecisionDownload(); renderList(); persistDecisions();
}
function drawCrossSection(record,e){const canvas=$('crossSectionCanvas'),status=$('sectionStatus'),note=$('sectionNote');const focus=e?.focus;const plane=focus?.plane;if(!canvas)return;const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#17291f';ctx.fillRect(0,0,width,height);if(!focus||!plane){status.textContent='ไม่มีหน้าตัด';note.textContent='ต้นนี้ยังไม่มีหลักฐานหน้าตัดที่ผ่านการคัดเลือก จึงไม่สร้างวงหรือจุดขึ้นมาแทนข้อมูลจริง';return;}const accepted=focus.accepted_xyz||[],rejected=focus.rejected_xyz||[],u=plane.basis_u,v=plane.basis_v,center=plane.center_xyz;const project=p=>{const q=p.map((x,i)=>x-center[i]);return [q.reduce((s,x,i)=>s+x*u[i],0),q.reduce((s,x,i)=>s+x*v[i],0)];};const points2d=[...accepted.slice(0,16000).map(project),...rejected.slice(0,16000).map(project)];const radius=(Number(focus.diagnostic_diameter_cm)||0)/200;const maxObserved=points2d.reduce((m,p)=>Math.max(m,Math.hypot(...p)),0);const extent=Math.max(.08,radius*1.6,maxObserved*1.16);const scale=Math.min(width,height)*.42/extent;const ox=width/2,oy=height/2;const screen=p=>[ox+p[0]*scale,oy-p[1]*scale];ctx.save();ctx.strokeStyle='#456452';ctx.lineWidth=1;ctx.setLineDash([3,5]);for(let i=-2;i<=2;i++){const x=ox+i*extent/2*scale;const y=oy+i*extent/2*scale;ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,height-18);ctx.stroke();ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(width-18,y);ctx.stroke();}ctx.setLineDash([]);ctx.strokeStyle='#a7c9a9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(18,oy);ctx.lineTo(width-18,oy);ctx.moveTo(ox,18);ctx.lineTo(ox,height-18);ctx.stroke();if(radius){ctx.beginPath();ctx.arc(ox,oy,radius*scale,0,Math.PI*2);ctx.strokeStyle='#efb357';ctx.lineWidth=2;ctx.stroke();}const draw=(arr,color,size)=>{ctx.fillStyle=color;for(const p of arr.slice(0,16000)){const [x,y]=screen(project(p));if(x<0||x>width||y<0||y>height)continue;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();}};draw(rejected,'#ee806e',1.35);draw(accepted,'#41da94',1.7);ctx.fillStyle='#d7e6d6';ctx.font='11px Segoe UI, sans-serif';ctx.fillText('u',width-25,oy-7);ctx.fillText('v',ox+7,24);ctx.fillStyle='#efb357';ctx.fillText(radius?`D = ${fmt(focus.diagnostic_diameter_cm,2)} cm`:'ไม่มีวงฟิต',18,20);ctx.restore();status.textContent=`POM ${fmt(e.focus_height_agl_m)} m${e.focus_is_diagnostic_only?' · วินิจฉัยเท่านั้น':''}`;note.textContent=`จุดสีเขียว ${accepted.length.toLocaleString()} จุด · จุดสีแดง ${rejected.length.toLocaleString()} จุด · วงสีส้มคือวงฟิตเทียบเท่า ไม่ใช่เส้นรอบรูปที่สังเกตได้จริง`;
}

function makeView(id) {
  const host=$(id);host.replaceChildren();
  try {
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x17291f);
    const camera=new THREE.PerspectiveCamera(45,1,0.01,500);camera.up.set(0,0,1);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));host.append(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
    const view={scene,camera,renderer,controls,host};
    const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(host);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);view.afterRender?.();});return view;
  } catch(error) {host.innerHTML='<p class="canvas-message">อุปกรณ์นี้เปิด WebGL ไม่ได้ ข้อมูล ตาราง และหลักฐานดาวน์โหลดด้านล่างยังใช้ได้</p>';return null;}
}
function points(xyz,rgb,color,size,origin=[0,0,0]) {
  const positions=new Float32Array(xyz.length*3);const colorsArray=rgb?new Float32Array(xyz.length*3):null;
  xyz.forEach((p,i)=>{positions.set(p.map((v,j)=>v-origin[j]),i*3);if(rgb)colorsArray.set(rgb[i].map(v=>v/255),i*3);});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  if(rgb)geometry.setAttribute('color',new THREE.BufferAttribute(colorsArray,3));
  return new THREE.Points(geometry,new THREE.PointsMaterial({color:rgb?0xffffff:color,size,sizeAttenuation:true,vertexColors:!!rgb,transparent:true,opacity:rgb?0.55:0.92}));
}
function line(xyz,color,origin=[0,0,0]) {
  const geometry=new THREE.BufferGeometry().setFromPoints(xyz.map(p=>new THREE.Vector3(...p.map((v,j)=>v-origin[j]))));
  return new THREE.Line(geometry,new THREE.LineBasicMaterial({color}));
}
function clear(group) {group.traverse(obj=>{obj.geometry?.dispose();if(obj.material){if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material.dispose();}});group.removeFromParent();}
function setCamera(view,target,distance) {if(!view)return;const p=new THREE.Vector3(...target);view.controls.target.copy(p);view.camera.position.copy(p).add(new THREE.Vector3(distance,-distance,distance*.65));view.controls.update();}

async function initOverview() {
  const view=state.overview=makeView('overview');if(!view)return;
  const response=await fetch('data/overview.bin');if(!response.ok)throw Error('โหลด overview ไม่สำเร็จ');
  const data=new DataView(await response.arrayBuffer());const count=data.byteLength/18;
  const positions=new Float32Array(count*3),rgb=new Float32Array(count*3);
  for(let i=0;i<count;i++)for(let j=0;j<3;j++){positions[i*3+j]=data.getFloat32(i*18+j*4,true);const c=data.getUint16(i*18+12+j*2,true);rgb[i*3+j]=(c>255?c>>8:c)/255;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));
  view.scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({size:0.055,vertexColors:true,transparent:true,opacity:0.64})));
  state.records.forEach(r=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),new THREE.MeshBasicMaterial({color:colors[r.status],depthTest:false,depthWrite:false,transparent:true,opacity:1}));marker.position.set(r.location.x,r.location.y,r.local_ground_z_m+1.3);marker.userData.treeId=r.tree_id;marker.renderOrder=5;view.scene.add(marker);state.markers.push(marker);});
  const label=document.createElement('span');label.className='selected-label';view.host.append(label);
  view.afterRender=()=>{const marker=state.markers.find(m=>m.userData.treeId===state.current?.tree_id);if(!marker||!marker.visible){label.hidden=true;return;}const p=marker.position.clone().project(view.camera);label.hidden=Math.abs(p.x)>1||Math.abs(p.y)>1||p.z>1;label.textContent=marker.userData.treeId;label.style.left=`${(p.x+1)*view.host.clientWidth/2+10}px`;label.style.top=`${(1-p.y)*view.host.clientHeight/2-18}px`;};
  let down=null;
  view.renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  view.renderer.domElement.addEventListener('pointerup',event=>{if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)return;const rect=view.renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,view.camera);const hit=ray.intersectObjects(state.markers.filter(m=>m.visible))[0];if(hit)choose(hit.object.userData.treeId);});
  $('overviewStatus').textContent=`${count.toLocaleString()} จุดตัวอย่าง · 67,177,038 จุดต้นฉบับ`;
  frameOverview();updateMarkers();
}
function frameOverview(){const values=state.records;const center=[values.reduce((s,r)=>s+r.location.x,0)/values.length,values.reduce((s,r)=>s+r.location.y,0)/values.length,-4];setCamera(state.overview,center,29);}
function updateMarkers(){const visible=new Set(state.filtered.map(r=>r.tree_id));for(const m of state.markers){m.visible=visible.has(m.userData.treeId);const selected=m.userData.treeId===state.current?.tree_id;m.scale.setScalar(selected?1.8:1);m.material.color.setHex(selected?0x77e8b0:colors[state.records.find(r=>r.tree_id===m.userData.treeId).status]);}}
function filterRecords() {
  const q=$('search').value.trim().toUpperCase(), f=$('filter').value;
  state.filtered=state.records.filter(r=>{
    const human=currentDecision(r)?.action;
    const learned=state.learning?.records.find(x=>x.tree_id===r.tree_id);
    const match=f==='ALL'||(f==='CHANGED'?r.changed_from_baseline:
      f==='REVIEW_KEEP'?human==='KEEP':f==='REVIEW_REJECT'?human==='REJECT':f==='REVIEW_EDIT'?human==='EDIT':
      f==='DISAGREE'?['KEEP','REJECT'].includes(human)&&learned?.suggestion&&human!==learned.suggestion:r.status===f);
    return (!q||r.tree_id.includes(q))&&match;
  });
  $('count').textContent=state.filtered.length; renderList(); updateMarkers();
}
function renderList() {
  $('trees').replaceChildren(...state.filtered.map(r=>{
    const button=document.createElement('button');
    button.className='tree-button'+(state.current?.tree_id===r.tree_id?' selected-tree':'');
    button.dataset.tree=r.tree_id;
    button.setAttribute('aria-pressed',String(state.current?.tree_id===r.tree_id));
    const saved=currentDecision(r);
    button.innerHTML='<span><i class="dot" style="background:#'+colors[r.status].toString(16)+'"></i>'+esc(r.tree_id)+'</span><small>'+esc(saved?decisionText(saved.action):'ยังไม่ตรวจ')+'</small>';
    button.addEventListener('click',()=>choose(r.tree_id)); return button;
  }));
}

async function choose(tid){
  const record=state.records.find(r=>r.tree_id===tid);if(!record)return;
  state.current=record;state.details=null;const token=++state.token;history.replaceState(null,'',`?tree=${encodeURIComponent(tid)}`);renderList();updateMarkers();
  $('treeTitle').textContent=tid;$('treeStatus').textContent=statusText[record.status];$('evidenceNote').textContent='กำลังโหลดหลักฐานต้นที่เลือก…';
  if(state.groups.evidence){clear(state.groups.evidence);state.groups.evidence=null;}
  renderRecord(record);
  try{const details=await json(record.evidence_url);if(token!==state.token)return;state.details=details;renderEvidence(record,details);}catch(error){if(token===state.token)failure(error);}
}
function renderRecord(r){
  const baseline=r.baseline;
  $('comparison').innerHTML=`<div><p class="eyebrow">BASELINE · V3.1</p><strong>${baseline.diameter_cm==null?'ยังไม่ปล่อยค่า':fmt(baseline.diameter_cm)+' cm'}</strong><small>${statusText[baseline.status]} · POM ${fmt(baseline.height_m)} m</small></div><div><p class="eyebrow">EXPERIMENTAL · CURRENT</p><strong>${r.diameter_at_pom_cm==null?'ยังไม่ปล่อยค่า':fmt(r.diameter_at_pom_cm)+' cm'}</strong><small>${statusText[r.status]} · POM ${fmt(r.measurement_height_agl_m)} m · πD ${fmt(r.circumference_pi_d_cm)} cm</small></div>`;
  $('reasons').innerHTML=r.reason_codes.map(code=>`<span class="reason" title="${esc(code)}">${esc(reasons[code]||code)}</span>`).join('');
  $('ablation').innerHTML=Object.entries(r.ablation).sort(([a],[b])=>Object.keys(names).indexOf(a)-Object.keys(names).indexOf(b)).map(([key,v])=>`<tr><td>${esc(names[key])}</td><td>${statusText[v.status]}</td><td>${fmt(v.height_m)}</td><td>${fmt(v.diameter_cm)}</td></tr>`).join('');
  renderDecision(r);
}
function renderEvidence(r,e){
  if(state.groups.evidence){clear(state.groups.evidence);state.groups.evidence=null;}
  $('reasons').innerHTML=(e.failures||r.reason_codes).map(code=>`<span class="reason" title="${esc(code)}">${esc(reasons[code]||code)}</span>`).join('');
  state.detail ||= makeView('treeView');const view=state.detail;
  const focus=e.focus;const p=focus?.plane;
  const origin=[r.location.x,r.location.y,r.local_ground_z_m];
  if(view){const group=new THREE.Group();state.groups.evidence=group;view.scene.add(group);
    const cloud=points(e.tube_xyz,e.tube_rgb,null,0.018,origin);cloud.visible=$('showContext').checked;state.groups.context=cloud;group.add(cloud);
    if(focus){group.add(points(focus.rejected_xyz,null,0xee806e,.022,origin));group.add(points(focus.accepted_xyz,null,0x41da94,.026,origin));}
    if(p){const c=p.center_xyz,axis=p.axis_direction,u=p.basis_u,v=p.basis_v;const extent=Math.max(.22,(focus.diagnostic_diameter_cm||20)/200*1.5);const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>c.map((value,j)=>value+extent*(a*u[j]+b*v[j])-origin[j]));const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,2,0,2,3].flatMap(i=>corners[i]),3));const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xada4fa,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));group.add(mesh);group.add(line([-1.5,1.5].map(t=>p.axis_center_xyz.map((x,j)=>x+axis[j]*t)),0xefe59c,origin));
      const radius=(focus.diagnostic_diameter_cm||0)/200;if(radius){const outline=Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return c.map((x,j)=>x+radius*(Math.cos(t)*u[j]+Math.sin(t)*v[j]));});group.add(line(outline,e.focus_is_diagnostic_only?0xefb357:0x74e9d7,origin));}
    }
    const groundPoints=e.ground.sector_anchors_xyz;if(groundPoints?.length)group.add(points(groundPoints,null,0xd6e6a0,.04,origin));setCamera(view,[0,0,e.focus_height_agl_m||1.9],3.4);
  }
  const candidate=e.candidate_profile.find(c=>c.height_agl_m===e.focus_height_agl_m);const m=candidate?.fit||{};
  const metrics=[['ระดับหลักฐานที่แสดง',`${fmt(e.focus_height_agl_m)} m${e.focus_is_diagnostic_only?' · วินิจฉัยเท่านั้น':''}`],['จุด LAS รอบต้น',r.tube_point_count.toLocaleString()],['พื้น: จำนวนส่วนรอบต้น',`${r.ground.supporting_sectors} / 12`],['พื้น: ช่วงความไม่แน่นอน',`${fmt(r.ground.uncertainty_m,3)} m · ไม่ใช่ CI`],['มุมหน้าตัดที่รองรับ',`${fmt(m.coverage_deg,0)}°`],['ช่องว่างรอบหน้าตัดมากสุด',`${fmt(m.largest_gap_deg,0)}°`],['จุดที่ใช้ฟิต',fmt(m.inlier_count,0)],['Residual RMSE',`${fmt(m.rmse_m,4)} m`],['อัตราส่วนแกนวงรีอิสระ',fmt(m.independent_ellipse_axis_ratio,3)],['วิธีฟิต',m.method||'—'],['ตรงระนาบเดิม',r.same_physical_plane_as_baseline?'ใช่':'ไม่ตรง / ไม่มีผลวัด'],['เส้นรอบรูปจากหน้าตัดจริง','ยังไม่รายงาน']];
  $('metrics').innerHTML=metrics.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('evidenceNote').textContent=`แสดงจุดตัวอย่าง ${e.tube_xyz.length.toLocaleString()} จุด จาก ${r.tube_point_count.toLocaleString()} จุดรอบต้น${e.focus_is_diagnostic_only?' · วงฟิตสีส้มเป็นหลักฐานวินิจฉัย ไม่ใช่ค่าที่ระบบรับรอง':''}`;
  $('profile').innerHTML=e.candidate_profile.map(c=>{const reasonsList=[...(c.variants?.combined?.failures||c.failures||[]),...(c.continuity_failures||[])];return `<tr><td>${fmt(c.height_agl_m)}</td><td>${fmt(c.fit?.diameter_cm)}</td><td>${fmt(c.fit?.coverage_deg,0)}°</td><td>${fmt(c.fit?.largest_gap_deg,0)}°</td><td>${esc([...new Set(reasonsList)].join(' · ')||'ผ่านเกณฑ์เพิ่ม; ยังต้องผ่าน baseline gate')}</td></tr>`;}).join('');
  drawCrossSection(r,e);
}
async function loadLearning() {
  try {
    state.learning=await json('data/learning/records.json');
    const s=state.learning.summary, c=s.review_counts, v=s.validation.learned;
    $('learningSummary').textContent=`ใช้คำตอบ ${s.reviewed_trees} ต้น: เอา ${c.KEEP||0} · ไม่เอา ${c.REJECT||0} · แก้ไข ${c.EDIT||0} — โมเดลคัดต้นทายตรง ${v.correct}/${v.n} ต้น (${fmt(v.accuracy*100,1)}%) เมื่อกันพื้นที่ทดสอบออกจากชุดฝึก`;
    if(state.current) renderLearningRecord(state.current);
    filterRecords();
  } catch(error) { $('learningSummary').textContent='ยังโหลดผลเรียนรู้ไม่ได้: '+error.message; }
}
async function hydrateDecisions() {
  try {
    const payload=await json('data/learning/reviews.json');
    const rows=Array.isArray(payload)?payload:payload.records||[];
    for(const raw of rows){
      const row=normalizeDecision(raw), local=state.decisions[row.tree_id];
      state.releaseDates[row.tree_id]=row.updated_at;
      if(!local||Date.parse(local.updated_at)<Date.parse(row.updated_at))state.decisions[row.tree_id]=row;
    }
  } catch {}
}
function renderLearningRecord(record) {
  const host=$('learningRecord'), saved=currentDecision(record);
  const learned=state.learning?.records.find(r=>r.tree_id===record.tree_id);
  if(!learned){host.textContent='กำลังโหลดผลเรียนรู้ของต้นนี้';return;}
  const stale=(saved?.action||'UNREVIEWED')!==learned.human_decision || (saved?.pom_m??null)!==learned.human_pom_m || (saved?.note||'')!==learned.human_note;
  const rejected=saved?.action==='REJECT';
  host.innerHTML=`<div><p class="eyebrow">คำตอบของคุณ</p><h3>${esc(decisionText(saved?.action))}</h3><p>${esc(saved?.note||'ไม่มีหมายเหตุเพิ่มเติม')}</p>${saved?.pom_m!=null?`<p>ระดับที่ระบุ ${fmt(saved.pom_m)} m</p>`:''}<small>${rejected?'ตัดออกจากผลวัดที่คัดแล้ว':saved?.action==='EDIT'?'รวมไว้ตรวจแก้ ยังไม่อนุมัติค่าขนาด':'การเอาต้นนี้ไม่ได้ยืนยันค่าขนาดโดยอัตโนมัติ'}</small></div><div><p class="eyebrow">คำแนะนำจากการเรียนรู้</p><h3>${esc(decisionText(learned.suggestion))}${saved&&['KEEP','REJECT'].includes(saved.action)&&saved.action!==learned.suggestion?' · เห็นต่างจากคุณ':''}</h3><p>คะแนนเอา ${fmt(learned.learned_keep_score,3)} / 1 · ไม่ใช่ความแม่นของ DBH</p><small>${learned.prediction_source==='SPATIALLY_HELD_OUT'?'คำทำนายนี้ไม่ได้ฝึกด้วยต้นนี้และต้นใกล้เคียงในพื้นที่ทดสอบ':'ต้นแก้ไขยังไม่ใช้เป็นคำตอบเอา/ไม่เอาของโมเดล'}</small></div><div><p class="eyebrow">ตรวจหน้าตัดต่อ</p><p>${stale?'คำตอบเปลี่ยนแล้ว กำลังรอประมวลผลใหม่':rejected?'ต้นนี้ไม่ส่งต่อเป็นผลวัด':learned.refit_url?`คำนวณจากจุดเต็มใหม่ที่ ${fmt(learned.suggested_pom_m)} m ตามคำขอ`:learned.measurement_diameter_cm!=null?`ผลผ่านเกณฑ์เรขาคณิต D ${fmt(learned.measurement_diameter_cm)} cm ที่ ${fmt(learned.measurement_pom_m)} m`:'ยังไม่มีค่าขนาดที่ผ่านเกณฑ์'}</p>${!stale&&!rejected&&learned.refit_url?'<button id="showReviewPlane">ดูหน้าตัดที่คำนวณใหม่</button><button id="showOriginalPlane">ดูหลักฐานเดิม</button><small>วงฟิตวินิจฉัย ยังไม่ปล่อยเป็นค่าขนาด</small>':''}</div>`;
  const display=async url=>{
    const token=++state.token;
    try {
      const evidence=await json(url);
      if(token!==state.token||state.current?.tree_id!==record.tree_id)return;
      if(!evidence.focus||!evidence.tube_xyz){$('evidenceNote').textContent='ไม่มีหลักฐานรองรับระดับที่ขอ: '+(evidence.failures||[]).join(', ');return;}
      state.details=evidence; renderEvidence(record,evidence);
      $('sectionStatus').scrollIntoView({block:'center',behavior:'smooth'});
    } catch(error) {if(token===state.token)failure(error);}
  };
  $('showReviewPlane')?.addEventListener('click',()=>display(learned.refit_url));
  $('showOriginalPlane')?.addEventListener('click',()=>display(record.evidence_url));
}
async function pollLearning() {
  if(state.polling)return;
  state.polling=true;
  try {
    const status=await json('/api/learning');
    $('trainReviews').disabled=status.running;
    $('learningStatus').textContent=status.error?'ประมวลผลไม่สำเร็จ: '+status.error:status.running?'กำลังเรียนรู้จากคำตอบล่าสุด…':'เมื่อบันทึกคำตอบใหม่ ระบบจะเรียนรู้อีกครั้งอัตโนมัติ';
    if(!status.running&&status.summary?.label_sha256!==state.learning?.summary.label_sha256&&status.summary)await loadLearning();
  } catch { $('learningStatus').textContent=location.protocol==='https:'?'เว็บ deploy ใช้ชุดการเรียนรู้ที่เผยแพร่แล้ว การฝึกใหม่ทำใน local viewer':'ยังเชื่อมตัวบันทึกในเครื่องไม่ได้ กรุณาเปิดด้วย start-review.ps1'; }
  finally {state.polling=false;}
}
async function init(){
  const [payload,summary,synthetic]=await Promise.all([json('data/measurements.json'),json('data/summary.json'),json('data/synthetic-summary.json')]);state.records=payload.records;
  const c=summary.status_counts;$('stats').innerHTML=[['Tree IDs ที่รักษาไว้',summary.tree_count,'ต้น · อ้างอิง TD_008 เดิม'],['Standard DBH',c.STANDARD_DBH||0,`baseline ${summary.baseline_counts.STANDARD_DBH||0} ต้น`],['Alternative POM',c.ALTERNATIVE_POM||0,`baseline ${summary.baseline_counts.ALTERNATIVE_POM||0} ต้น`],['ต้องตรวจทาน',c.MANUAL_REVIEW||0,`baseline ${summary.baseline_counts.MANUAL_REVIEW||0} ต้น`]].map(([label,n,small])=>`<div><span>${label}</span><b>${n}</b><small>${small}</small></div>`).join('');
  $('synthetic').textContent=`${synthetic.known_geometry_cases} กรณีรูปทรงจำลอง + ${synthetic.sensitivity_cases} เงื่อนไข sensitivity · ยังไม่มีค่าภาคสนามจับคู่`;
  $('search').addEventListener('input',filterRecords);
  $('filter').addEventListener('change',filterRecords);
  $('overviewReset').addEventListener('click',frameOverview);
  $('detailReset').addEventListener('click',()=>setCamera(state.detail,[0,0,state.details?.focus_height_agl_m||1.9],3.4));
  $('showContext').addEventListener('change',()=>{if(state.groups.context)state.groups.context.visible=$('showContext').checked;});
  $('decisionKeep').addEventListener('click',()=>saveDecision('KEEP'));
  $('decisionReject').addEventListener('click',()=>saveDecision('REJECT'));
  $('decisionEdit').addEventListener('click',openDecisionForm);
  $('decisionCancel').addEventListener('click',()=>renderDecision(state.current));
  $('decisionClear').addEventListener('click',()=>saveDecision('UNREVIEWED'));
  $('decisionForm').addEventListener('submit',event=>{
    event.preventDefault();
    saveDecision($('decisionStatus').value,{pom_m:$('decisionPom').value,diameter_cm:$('decisionDiameter').value,note:$('decisionNote').value});
  });
  $('trainReviews').addEventListener('click',async()=>{
    await state.syncQueue;
    try {
      const response=await fetch('/api/train',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!response.ok)throw Error('ไม่สามารถเริ่มประมวลผลได้');
      await pollLearning();
    } catch(error){$('learningStatus').textContent=error.message;}
  });
  await hydrateDecisions(); updateDecisionDownload(); persistDecisions(); await state.syncQueue; await loadLearning(); updateDecisionDownload();
  new ResizeObserver(()=>{if(state.current&&state.details)drawCrossSection(state.current,state.details);}).observe($('crossSectionCanvas'));
  await pollLearning(); setInterval(pollLearning,3000);
  filterRecords();initOverview().catch(failure);const preferred=new URLSearchParams(location.search).get('tree');await choose(state.records.find(r=>r.tree_id===preferred)?.tree_id||'TREE_0050');
  window.experimentalReview={state,choose,filterRecords};
}
init().catch(failure);
