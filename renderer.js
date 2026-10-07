import {mapUnitLabel} from './unit-ui.js';
import { add, sub, mul, dot, cross, norm, length, lerp, clamp, bodyBasis } from './math.js';
export function unitColor(id){const text=String(id||''),side=text.startsWith('a')?'a':text.startsWith('c')?'c':'b',parts=text.split('-'),index=(Number(parts[1])||0)*3+(Number(parts[2])||0);return (side==='c'?['#bfa5ff','#e2b4e8','#adb9ff','#e0d1a2','#bbbdde','#dccde7']:side==='a'?['#6adeee','#79d9a5','#8eafff','#c4dc75','#6fbde0','#a1e0cd']:['#f7aa79','#f47e9c','#e6cf79','#d69bf0','#e89075','#e2b8cb'])[index%6];}
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function shoulderPose(position,yaw,pitch,distance){
 const facing=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],right=norm(cross(facing,[0,1,0]));
 const eye=add(add(position,mul(facing,-distance)),add(mul(right,distance*.12),[0,distance*.16,0]));
 return {eye,target:add(position,mul(facing,distance*.75))};
}

// Framing is presentation only: neither camera selection nor interpolation changes orders.
export function battleFraming(units,focus='overall'){
 const active=units.filter(u=>u.alive&&!u.docked),focused=units.find(u=>u.id===focus),small=u=>!['ship','terrain'].includes(u.entityType);
 if(focused){
  const side=focused.side??focused.id.split('-')[0],foes=active.filter(u=>u!==focused&&(u.side??u.id.split('-')[0])!==side).map(u=>({u,d:length(sub(u.position,focused.position))})).sort((a,b)=>a.d-b.d||a.u.id.localeCompare(b.u.id));
  const nearest=foes[0]?.d??Infinity,near=foes.filter(x=>x.d<=nearest*1.7+350).slice(0,3),members=[focused,...near.map(x=>x.u)];
  let center=mul(focused.position,2);for(const x of near)center=add(center,x.u.position);center=mul(center,1/(2+near.length));
  const axis=near.length?norm(sub(near[0].u.position,focused.position)):focused.forward;
  return {center,members,enemyId:near[0]?.u.id||null,enemyIds:near.map(x=>x.u.id),yaw:Math.atan2(-axis[2],axis[0]),pitch:.38};
 }
 const pool=active.length?active:units.filter(u=>!u.docked);if(!pool.length)return {center:[0,0,0],members:[],enemyId:null,yaw:.7,pitch:.43};
 const combat=pool.filter(small),anchors=combat.length?combat:pool;
 const middle=[0,1,2].map(axis=>{const values=anchors.map(u=>u.position[axis]).sort((a,b)=>a-b);return values[Math.floor(values.length/2)];});
 const members=anchors.length>=8?anchors.map(u=>({u,d:length(sub(u.position,middle))})).sort((a,b)=>a.d-b.d).slice(0,Math.ceil(anchors.length*.9)).map(x=>x.u):anchors;
 // Ships contribute a small centering hint; distant hulls never set the zoom
 // envelope while mobile combatants remain. All-ship battles still fit hulls.
 let sum=[0,0,0],weight=0;for(const u of members){const w=['pod','vehicle','turret'].includes(u.entityType)?.8:1;sum=add(sum,mul(u.position,w));weight+=w;}
 if(combat.length){const spread=Math.max(800,...members.map(u=>length(sub(u.position,middle))));for(const u of pool.filter(u=>!small(u))){const w=.08*clamp(spread/Math.max(1,length(sub(u.position,middle))));sum=add(sum,mul(u.position,w));weight+=w;}}
 return {center:mul(sum,1/Math.max(.01,weight)),members,enemyId:null,enemyIds:[],yaw:.7,pitch:.43};
}
export function framingDistance(plan,yaw,pitch,width,height){
 const outward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],view=mul(outward,-1),right=norm(cross(view,[0,1,0])),up=cross(right,view),focal=Math.min(width,height)*1.15;
 let distance=0;
 for(const u of plan.members){const delta=sub(u.position,plan.center),radius=Math.max(u.radius||17,(u.renderProfile?.dimensions?.[0]||0)*.5),depth=dot(delta,view);
  distance=Math.max(distance,radius+30-depth,(Math.abs(dot(delta,right))+radius)*focal/(width*.4)-depth,(Math.abs(dot(delta,up))+radius)*focal/(height*.34)-depth);
 }
 return distance;
}

// Constant yaw/pitch boundary, matching the simulator's rectangular angular envelope.
export function arcBoundary(forward,arc,range,steps=12){
 const b=bodyBasis(forward),point=(yaw,pitch)=>{const y=yaw*Math.PI/180,p=pitch*Math.PI/180;return mul(add(add(mul(b.forward,Math.cos(p)*Math.cos(y)),mul(b.right,Math.cos(p)*Math.sin(y))),mul(b.up,Math.sin(p))),range);};
 const ring=[];for(let edge=0;edge<4;edge++)for(let i=0;i<steps;i++){const t=i/steps;const y=edge===0?-arc.yaw+2*arc.yaw*t:edge===1?arc.yaw:edge===2?arc.yaw-2*arc.yaw*t:-arc.yaw;const p=edge===0?-arc.pitch:edge===1?-arc.pitch+2*arc.pitch*t:edge===2?arc.pitch:arc.pitch-2*arc.pitch*t;ring.push(point(y,p));}return ring;
}
export function clashShake(effects,t,reducedMotion=false,focus='overall'){
 if(reducedMotion||focus==='overall'||!focus)return [0,0];let amplitude=0;
 for(const e of effects){const age=t-e.t;if(age<0||age>=.4)continue;
  const involved=e.type==='impact'?e.actor===focus:e.type==='clash'&&(e.actor===focus||e.opponent===focus);
  if(!involved)continue;const severity=e.type==='impact'?(e.severity??.35):(e.losses?.[focus]??(e.intensity||.5)*.45);
  amplitude=Math.max(amplitude,clamp(severity)*32*(1-age/.4)**2);
 }
 return amplitude?[Math.sin(t*109)*amplitude,Math.cos(t*137)*amplitude*.65]:[0,0];
}
// Blade geometry lives in the owner's body frame, including roll. A diagonal plane
// retains visible area from the shoulder camera instead of collapsing into a line.
export function bladeSweep(u,progress=0,hand=1,reach=85){
 const basis=bodyBasis(u.forward),roll=u.roll||0,b={forward:basis.forward,right:add(mul(basis.right,Math.cos(roll)),mul(basis.up,-Math.sin(roll))),up:add(mul(basis.up,Math.cos(roll)),mul(basis.right,Math.sin(roll)))},r=u.radius||17;
 const pivot=add(u.position,add(mul(b.right,hand*r*.9),mul(b.up,-r*.2)));
 const axis=norm(add(mul(b.forward,.75),mul(b.up,.55))),candidate=add(mul(b.right,.9),mul(b.up,.45)),side=norm(sub(candidate,mul(axis,dot(candidate,axis))));
 const extent=clamp(reach,r*2.5,r*5.5),p=clamp(progress),angle=hand*(-1.15+2.3*p),trail=hand*Math.min(.95,.16+p*1.8);
 const edge=a=>add(pivot,mul(add(mul(axis,Math.cos(a)),mul(side,Math.sin(a))),extent));
 const points=[pivot];for(let i=0;i<=12;i++)points.push(edge(angle-trail+trail*i/12));
 return {pivot,points,tip:edge(angle)};
}
// At contact the leading edges of both blades cross the same contact point.
// The tips extend beyond contact, so the collision has visible overlapping fans.
// Roots still follow each hand;
// after the brief clash hold, each arm follows through into its own body sweep.
export function clashBladeSweep(u,contact,age,hand=1,reach=85){
 const sweep=bladeSweep(u,bladeProgress(age,true),hand,reach),follow=clamp((age-.14)/.22);
 const toward=sub(contact,sweep.pivot),contactDistance=length(toward),contactTip=add(sweep.pivot,mul(norm(toward),Math.max(contactDistance*1.8,(u.radius||17)*4)));
 const tip=lerp(contactTip,sweep.tip,follow),axis=norm(sub(tip,sweep.pivot)),extent=length(sub(tip,sweep.pivot));
 const b=bodyBasis(u.forward),candidate=add(mul(b.right,hand*.85),mul(b.up,.6));
 let tangent=norm(sub(candidate,mul(axis,dot(candidate,axis))));if(length(tangent)<.1)tangent=bodyBasis(axis).right;
 const points=[sweep.pivot];for(let i=0;i<=12;i++){const angle=-.9+.9*i/12;points.push(add(sweep.pivot,mul(add(mul(axis,Math.cos(angle)),mul(tangent,Math.sin(angle))),extent)));}
 return {pivot:sweep.pivot,tip,points,contactPoint:follow===0?contact:null};
}
export function bladeProgress(age,contact=false){
 // Contact briefly arrests the blade, then the arm follows through. It never
 // leaves a static held-saber column on top of the moving sweep.
 return contact?clamp(.5+Math.max(0,age-.045)/.18*.5):clamp(age/.24);
}
export class FocusedImpactFeedback {
 reset(){this.focus=null;this.time=null;this.impulse=null;this.wall=null;}
 constructor(){this.reset();}
 sample(effects,t,focus,now,enabled=true){
  if(this.focus!==focus||this.time!==null&&t<this.time){this.reset();this.focus=focus;}
  const advancing=this.time===null||t>this.time;
  if(advancing){
   let severity=0,duration=.28;
   for(const e of effects||[]){if(e.t>t||e.t<Math.max(this.time??t-.4,t-.6)||this.time!==null&&e.t<=this.time)continue;
    const involved=e.type==='impact'?e.actor===focus:e.type==='clash'&&(e.actor===focus||e.opponent===focus);
    if(involved){const value=clamp((e.type==='impact'?(e.severity??.35):(e.losses?.[focus]??(e.intensity||.5)*.45))*(e.type==='clash'?1.35:1));if(value>severity){severity=value;duration=e.type==='clash'?.34:.28;}}
   }
   if(severity>0)this.impulse={severity,duration,age:0};
   else if(this.impulse)this.impulse.age+=Math.max(0,Math.min(.1,(now-(this.wall??now))/1000));
  }
  this.time=t;this.wall=now;
  if(!enabled||focus==='overall'||!focus||!this.impulse||this.impulse.age>=this.impulse.duration)return [0,0];
  const {severity,age,duration}=this.impulse,amplitude=severity*32*(1-age/duration)**2;
  return [Math.cos(age*97)*amplitude,Math.sin(age*127+.7)*amplitude*.65];
 }
}
export function motionCue(u){
 const rate=u.speedRate;
 if(!u.alive||!Number.isFinite(rate)||Math.abs(rate)<12||length(u.velocity)<5)return null;
 return {braking:rate<0,strength:clamp(Math.abs(rate)/350,.15,1)};
}

// Perspective XYZ scene rendered onto canvas. This module never advances combat.
// Camera, projected meshes, trails and effects are presentation only.
export class BattleRenderer {
 constructor(canvas) {
  this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('浏览器无法创建画布');
  this.yaw=0.7;this.pitch=0.43;this.distance=3000;this.focus='overall';this.showFireArcs=true;this.target=[0,500,0];this.pan=[0,0,0];this.targetPan=[0,0,0];this.followYaw=null;this.cameraZoom=1;this.cameraCenter=null;
  this.projectileTrails=new Map();this.trails=new Map();this.lastTrailTick=-1;this.drag=null;this.abort=new AbortController();
  this.impactFeedback=new FocusedImpactFeedback();this.impactShakeEnabled=true;this.motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const opts={signal:this.abort.signal};
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts);
  this.touchPoints=new Map();
  const gesture=()=>{const [a,b]=[...this.touchPoints.values()];return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,gap:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))}:null;};
  const rotate=(dx,dy)=>{this.yaw-=dx*.006;this.pitch=clamp(this.pitch+dy*.006,this.focus==='overall'?.04:-1.45,1.45);};
  const pan=(dx,dy)=>{const scale=this.distance/800;this.targetPan[0]-=(Math.cos(this.yaw)*dx+Math.sin(this.yaw)*dy)*scale;this.targetPan[2]+=(Math.sin(this.yaw)*dx-Math.cos(this.yaw)*dy)*scale;this.panHoldUntil=performance.now()+2500;};
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&![0,2].includes(e.button))return;e.preventDefault();canvas.focus({preventScroll:true});this.touchCamera(performance.now());if(e.pointerType==='touch'){this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});this.touchGesture=gesture();this.drag={touch:true};}else this.drag={x:e.clientX,y:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId);},opts);
  canvas.addEventListener('pointermove',e=>{
   if(e.pointerType==='touch'){const previous=this.touchPoints.get(e.pointerId);if(!previous)return;e.preventDefault();this.touchCamera(performance.now());this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=gesture();if(next&&this.touchGesture){pan(next.x-this.touchGesture.x,next.y-this.touchGesture.y);const ratio=this.touchGesture.gap/next.gap;this.cameraZoom=clamp(this.cameraZoom*ratio,.25,4);this.manualDistance=clamp(this.distance*ratio,130,180000);}else if(!next)rotate(e.clientX-previous.x,e.clientY-previous.y);this.touchGesture=next;return;}
   if(!this.drag||this.drag.touch)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.touchCamera(performance.now());if(this.drag.button===2)pan(dx,dy);else rotate(dx,dy);this.drag={...this.drag,x:e.clientX,y:e.clientY};
  },opts);
  const endPointer=e=>{if(e.pointerType==='touch'){this.touchPoints.delete(e.pointerId);this.touchGesture=gesture();this.drag=this.touchPoints.size?{touch:true}:null;}else this.drag=null;this.touchCamera(performance.now());};
  canvas.addEventListener('pointerup',endPointer,opts);canvas.addEventListener('pointercancel',endPointer,opts);canvas.addEventListener('lostpointercapture',endPointer,opts);
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.cameraZoom=clamp(this.cameraZoom*Math.exp(e.deltaY*0.001),.25,4);this.touchCamera(performance.now());this.manualDistance=clamp(this.distance*Math.exp(e.deltaY*.001),130,180000);},{...opts,passive:false});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','w','a','s','d'].includes(e.key)){e.preventDefault();this.touchCamera(performance.now());}if(e.key==='ArrowLeft')this.yaw-=0.12;if(e.key==='ArrowRight')this.yaw+=0.12;if(e.key==='ArrowUp')this.pitch=clamp(this.pitch+0.1,0.04,1.45);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch-0.1,0.04,1.45);if(e.key==='+'){this.cameraZoom=clamp(this.cameraZoom*.85,.25,4);this.manualDistance=clamp(this.distance*.85,130,180000);}if(e.key==='-'){this.cameraZoom=clamp(this.cameraZoom/.85,.25,4);this.manualDistance=clamp(this.distance/.85,130,180000);}if(['w','a','s','d'].includes(e.key)){this.targetPan[2]+=(e.key==='w'?-1:e.key==='s'?1:0)*150;this.targetPan[0]+=(e.key==='a'?-1:e.key==='d'?1:0)*150;this.panHoldUntil=performance.now()+2500;}},opts);
 }
 reset(){this.touchPoints.clear();this.touchGesture=null;this.drag=null;this.impactFeedback.reset();this.projectileTrails.clear();this.trails.clear();this.lastTrailTick=-1;this.yaw=0.7;this.pitch=0.43;this.distance=3000;this.pan=[0,0,0];this.targetPan=[0,0,0];this.followYaw=null;this.lastFocus=null;this.cameraTime=null;this.cameraCenter=null;this.cameraZoom=1;this.panHoldUntil=0;this.cameraHoldUntil=0;this.manualDistance=null;}
 fitPreparation(units){if(this.focus!=='overall'||!units.length)return;this.cameraZoom=1;this.cameraCenter=null;this.lastFocus=null;}
 touchCamera(now){this.cameraHoldUntil=now+1800;this.manualDistance=this.distance;}
 updateCamera(units,now){
  const plan=battleFraming(units,this.focus),focused=units.find(u=>u.id===this.focus),changed=this.lastFocus!==this.focus,dt=Math.max(0,Math.min(.1,(now-(this.cameraTime??now-16))/1000)),blend=1-Math.exp(-dt*1.4);
  this.cameraTime=now;
  if(changed){this.targetPan=[0,0,0];this.lastFocus=this.focus;} // Never snap position, orbit or zoom on focus changes.
  const manual=!!this.drag||now<(this.cameraHoldUntil||0);
  if(!this.cameraCenter)this.cameraCenter=[...plan.center];
  if(!manual){this.yaw+=angleDelta(plan.yaw??.7,this.yaw)*blend;this.pitch+=((plan.pitch??.43)-this.pitch)*blend;this.cameraCenter=lerp(this.cameraCenter,plan.center,blend);this.targetPan=lerp(this.targetPan,[0,0,0],blend);this.cameraZoom+=(1-this.cameraZoom)*blend;}
  this.pan=lerp(this.pan,this.targetPan,1-Math.exp(-dt*8));this.target=add(this.cameraCenter,this.pan);
  const fit=clamp(framingDistance(plan,this.yaw,this.pitch,this.w,this.h),focused?260:1500,180000),wanted=manual?(this.manualDistance??this.distance):clamp(fit*this.cameraZoom,130,180000);
  this.distance+=(wanted-this.distance)*(1-Math.exp(-dt*1.4));
  this.eye=add(this.target,[Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance]);
  this.view=norm(sub(this.target,this.eye));this.right=norm(cross(this.view,[0,1,0]));this.up=cross(this.right,this.view);this.focal=Math.min(this.w,this.h)*1.15;
  this.cameraFraming={members:plan.members.map(u=>u.id),enemyId:plan.enemyId,enemyIds:plan.enemyIds,fitDistance:fit,manual};
 }
 dispose(){this.abort.abort();this.trails.clear();}
 project(p) {
  const r=sub(p,this.eye),z=dot(r,this.view);if(z<10)return null;
  return {x:this.w/2+dot(r,this.right)*this.focal/z,y:this.h/2-dot(r,this.up)*this.focal/z,z,scale:this.focal/z};
 }
 line(a,b,color,width=1,dash=[]) {
  const p=this.project(a),q=this.project(b);if(!p||!q)return;
  const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();c.setLineDash([]);
 }
 trail(points,color,width=1.5,opacity=.20) {
  if(points.length<2)return;
  const c=this.ctx,projected=points.map(p=>this.project(p)),segments=points.length-1,buckets=Math.min(8,segments),alpha=c.globalAlpha;
  c.strokeStyle=color;c.lineWidth=width;c.setLineDash([]);
  // Keep the full path; batch adjacent segments with similar opacity.
  for(let bucket=0;bucket<buckets;bucket++){
   const start=1+Math.floor(bucket*segments/buckets),end=1+Math.floor((bucket+1)*segments/buckets);let drawn=false;
   c.beginPath();for(let i=start;i<end;i++){const a=projected[i-1],b=projected[i];if(!a||!b)continue;c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);drawn=true;}
   if(drawn){c.globalAlpha=alpha*opacity*((start+end-1)/2)/points.length;c.stroke();}
  }
  c.globalAlpha=alpha;
 }
 polygon(points,fill,stroke) {
  const ps=points.map(p=>this.project(p));if(ps.some(p=>!p))return;
  const c=this.ctx;c.beginPath();ps.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=0.8;c.stroke();}
 }
 arrow(a,b,color) {
  this.line(a,b,color,1.8);const p=this.project(a),q=this.project(b);if(!p||!q)return;
  const angle=Math.atan2(q.y-p.y,q.x-p.x),c=this.ctx;c.fillStyle=color;c.beginPath();c.moveTo(q.x,q.y);c.lineTo(q.x-8*Math.cos(angle-0.4),q.y-8*Math.sin(angle-0.4));c.lineTo(q.x-8*Math.cos(angle+0.4),q.y-8*Math.sin(angle+0.4));c.closePath();c.fill();
 }
 motionLines(u,t){
  const cue=motionCue(u),p=this.project(u.position);if(!cue||!p)return;
  const q=this.project(add(u.position,mul(norm(u.velocity),150)));if(!q)return;
  const dx=q.x-p.x,dy=q.y-p.y,projected=Math.hypot(dx,dy),c=this.ctx;
  c.save();c.strokeStyle='#a2a8ad';c.lineWidth=.8;c.globalAlpha=.05+cue.strength*.06;
  if(projected>2){
   const x=dx/projected,y=dy/projected,phase=this.motionPreference?.matches?0:(t*3)%1;
   for(let i=0;i<5;i++){
    const side=(i-2)*9,offset=20+(i%3)*7+phase*8,extent=20+cue.strength*55;
    const along=cue.braking?offset:-offset-extent;
    c.beginPath();c.moveTo(p.x+x*along-y*side,p.y+y*along+x*side);
    c.lineTo(p.x+x*(along+extent)-y*side*.8,p.y+y*(along+extent)+x*side*.8);c.stroke();
   }
  }else{
   // Head-on view: a compact broken ring retains the speed-change cue.
   for(let i=0;i<8;i++){c.beginPath();c.arc(p.x,p.y,23+cue.strength*15,i*Math.PI/4,i*Math.PI/4+.4);c.stroke();}
  }
  c.restore();
 }
 updatePreparations(events,t,units){
  if(!Array.isArray(events)){this.preparationEvents=null;this.preparationCursor=0;this.preparationStates?.clear();this.preparationTime=null;return;}
  if(this.preparationEvents!==events||t<(this.preparationTime??-Infinity)){this.preparationEvents=events;this.preparationCursor=0;this.preparationStates=new Map();}
  this.preparationTime=t;
  while(this.preparationCursor<events.length&&events[this.preparationCursor].t<=t){
   const event=events[this.preparationCursor++];
   if(event.type==='interruption'||event.type==='destroyed'||event.type==='disabled'){this.preparationStates.delete(event.actor);continue;}
   if(event.type==='shot'){this.preparationStates.get(event.actor)?.delete(event.weapon);continue;}
   if(event.type!=='aim')continue;
   const weapon=units.find(u=>u.id===event.actor)?.weapons?.find(w=>w.id===event.weapon);
   if(!weapon||!['beam','melee'].includes(weapon.kind))continue;
   const until=Number.isFinite(event.readyAt)?event.readyAt:weapon.windupUntil>event.t?weapon.windupUntil:event.t+(weapon.windupS||0);
   if(!(until>event.t))continue;
   if(!this.preparationStates.has(event.actor))this.preparationStates.set(event.actor,new Map());
   this.preparationStates.get(event.actor).set(event.weapon,{...weapon,windup:true,windupUntil:until,startedAt:event.t});
  }
 }
 preparation(u,t){
  if(!u.alive)return;const p=this.project(u.position);if(!p)return;
  const c=this.ctx;
  const weapons=this.preparationEvents?(this.preparationStates?.get(u.id)?.values()||[]):u.weapons||[];
  for(const weapon of weapons){
   const start=weapon.startedAt??weapon.windupUntil-weapon.windupS;
   if(!weapon.windup||!(weapon.windupUntil>start)||!(weapon.windupUntil>t)||t<start)continue;
   const progress=clamp((t-start)/(weapon.windupUntil-start));
   if(weapon.kind==='beam'){
    const radius=9+48*(1-progress),glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,radius+13);
    glow.addColorStop(0,'#ffd9d95e');glow.addColorStop(.28,'#ff727246');glow.addColorStop(.72,'#ff45451c');glow.addColorStop(1,'#ff454500');
    c.save();c.fillStyle=glow;c.beginPath();c.arc(p.x,p.y,radius+13,0,Math.PI*2);c.fill();
    c.strokeStyle='#ff767636';c.lineWidth=9;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.stroke();
    c.strokeStyle='#ffbaba9c';c.lineWidth=2.5;c.stroke();c.restore();
   }else if(weapon.kind==='melee'){
    this.line(u.position,add(u.position,mul(u.forward,(u.radius||17)*2)),unitColor(u.id)+'65',1.5);
   }
  }
 }
 tracerDots(e,t){
  const delta=sub(e.to,e.from),distance=length(delta),direction=norm(delta),travel=Math.min(distance,(t-e.t)*(e.projectileSpeedMps??1000)),c=this.ctx;
  c.save();c.fillStyle='#ffe066';
  for(let i=0;i<5;i++){const at=travel-i*22;if(at<0)continue;const p=this.project(add(e.from,mul(direction,at)));if(!p)continue;c.globalAlpha*=.85;c.beginPath();c.arc(p.x,p.y,Math.max(1,2-i*.2),0,Math.PI*2);c.fill();}
  c.restore();
 }
 mesh(u,t) {
  const center=u.position,p=this.project(center);if(!p||u.docked)return;
  this.motionLines(u,t);
  this.preparation(u,t);
  const color=unitColor(u.id);
  if(u.gnSystem&&u.alive){const key=u.transAmActive?'trans-am':u.gnSystem==='gn-tau'?'tau':'drive';this.gnGlows??={};if(!this.gnGlows[key]){const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const ctx=sprite.getContext('2d'),glow=ctx.createRadialGradient(32,32,1,32,32,32),tint=key==='trans-am'?'#ff5777':key==='tau'?'#ffa75a':'#78ef9b';glow.addColorStop(0,tint+'45');glow.addColorStop(1,tint+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);this.gnGlows[key]=sprite;}const r=Math.min(60,Math.max(9,u.radius*p.scale*1.8));this.ctx.drawImage(this.gnGlows[key],p.x-r,p.y-r,r*2,r*2);}
  const basis=bodyBasis(u.forward),f=basis.forward,roll=u.roll||0,side=add(mul(basis.right,Math.cos(roll)),mul(basis.up,-Math.sin(roll))),up=add(mul(basis.up,Math.cos(roll)),mul(basis.right,Math.sin(roll)));
  // Tactical silhouette is visually enlarged at long range only. Hit radius stays physical.
  const size=Math.max(u.radius,8/p.scale),pt=(x,y,z)=>add(center,add(add(mul(side,x*size),mul(up,y*size)),mul(f,z*size)));
  const wing=u.name.includes('佩涅')?2.0:1.5;
  const faces=[
   {p:[pt(0,.5,1.4),pt(-wing,0,-.9),pt(0,-.35,-.55)],f:'#b9cddd'},
   {p:[pt(0,.5,1.4),pt(wing,0,-.9),pt(0,-.35,-.55)],f:'#72899f'},
   {p:[pt(0,.5,1.4),pt(-wing,0,-.9),pt(0,.7,-.8)],f:'#d5e1eb'},
   {p:[pt(0,.5,1.4),pt(wing,0,-.9),pt(0,.7,-.8)],f:'#8da5bb'},
   {p:[pt(-.4,-.35,-.5),pt(-.85,-1.5,-1),pt(-.1,-1.4,-.3)],f:'#8ca0b3'},
   {p:[pt(.4,-.35,-.5),pt(.85,-1.5,-1),pt(.1,-1.4,-.3)],f:'#70859c'},
  ];
  faces.sort((a,b)=>this.project(a.p[0])?.z<this.project(b.p[0])?.z?1:-1);
  if(u.moduleSeparated){this.line(pt(-.5,0,0),pt(.5,0,0),color+'55',1);}else if(u.coreActive||u.coreStructure===0){this.polygon([pt(0,.12,1),pt(-.7,0,-.6),pt(0,.1,-.35),pt(.7,0,-.6)],'#b0becd',color+'90');this.line(pt(0,0,-.5),pt(0,0,-1.25-Math.sin(t*35)*.15),color+'66',2);}else if(u.entityType==='ship')this.shipHull(u,color);else if(u.entityType&& !['ms','ma'].includes(u.entityType)){this.polygon([pt(0,0,1),pt(-1,0,-1),pt(1,0,-1)],'#91a3b5',color);}else for(const face of faces)this.polygon(face.p,u.alive?face.f:'#554c50',color+'80');
  if(u.alive&&!u.moduleSeparated&&(!u.entityType||['ms','ma'].includes(u.entityType))) {
   if(u.weapons?.some(w=>!w.disabled&&w.kind!=='melee'&&w.mount!=='head'))this.line(pt(.9,-.2,.1),pt(.9,-.2,2.1),'#cbd8dd',3);
   if(u.weapons?.some(w=>!w.disabled&&w.id==='sj-missile'))for(const hand of [-1,1])this.polygon([pt(hand*.85,.4,0),pt(hand*1.5,.4,-1),pt(hand*1.5,1,-1),pt(hand*.85,1,0)],'#8d9b92',color+'70');
   if(u.weaponKind==='melee'&&!this.saberActions?.has(u.id)){const held=bladeSweep({...u,radius:size},.07,1,size*3.6);this.line(held.pivot,held.tip,color+'4d',7);this.line(held.pivot,held.tip,'#f0fcff',2);}
   this.line(pt(-.8,-.1,0),pt(-.8,-.7,.5),'#91a6bb',4); // armor/shield symbol
   const exhaust=1.3+0.25*Math.sin(t*43);
   if(!u.powerCut&&(u.energy??1)>0&&(u.totalEnergy??1)>0)this.plume(pt(0,0,-.8),mul(f,-1),color,t,.4+Math.min(.6,Math.abs(u.speedRate||0)/400),exhaust);
  }
  if(u.alive&&this.remoteBarrierOwners?.has(u.id))this.polygon([pt(0,3.2,0),pt(-3,-1.5,.4),pt(3,-1.5,.4)],'#98e6ff12','#b4eaff48');
  if(u.alive&&u.renderProfile?.ucStyle){const style=u.renderProfile.ucStyle;
   if(style==='binders')for(const x of [-1,1])for(const y of [-1,1]){this.polygon([pt(x*.65,y*.4,-.25),pt(x*1.8,y*1.25,-.7),pt(x*2.15,y*.45,-1.2),pt(x*1.1,y*.05,-1.1)],'#637b69',color+'65');}
   if(style==='psycho-frame'&&u.activeSkills?.some(s=>['uc-skill-ntd','uc-skill-resolve'].includes(s.id))){const glow=u.activeSkills.some(s=>s.id==='uc-skill-resolve')?'#8affe0':'#ff7486';for(const x of [-1,1]){this.line(pt(x*.25,.5,.3),pt(x*.6,-.35,.05),glow+'62',4);this.line(pt(x*.65,-.4,-.1),pt(x*.7,-1.15,-.65),glow+'62',3);this.line(pt(x*.25,.5,.3),pt(x*.6,-.35,.05),glow+'ba',1);}}
   if(style==='wing-of-light'&&!u.powerCut&&u.energy>0&&length(u.velocity)>150){const pulse=1+Math.sin(t*20)*.07,alpha=Math.round(20+Math.min(28,length(u.velocity)/25)).toString(16).padStart(2,'0');for(const x of [-1,1])this.polygon([pt(x*.3,.15,-.6),pt(x*3.1,.8,-2.3*pulse),pt(x*1.8,-.25,-2.1*pulse)],'#8ccaff'+alpha,'#bce8ff35');}
  }
  this.arrow(center,add(center,mul(f,Math.max(95,size*4))),color+'60');
  if(length(u.velocity)>1)this.arrow(center,add(center,mul(norm(u.velocity),Math.max(120,size*5))),'#c9d5e540');
  this.line(center,[center[0],0,center[2]],'#bcd3dc22',1,[3,7]);
  const c=this.ctx,labelY=p.y+(u.labelShift||0);c.font='11px system-ui';c.textAlign='left';c.fillStyle=color;c.fillText(mapUnitLabel(u)+(u.coreActive?' · 核心战机 / 等待重组':u.disabled?' · 失能':''),p.x+18,labelY-16);
  if(this.focus===u.id){c.fillStyle='#d2deeb';c.font='10px monospace';c.fillText(Math.round(center[1])+'m  '+Math.round(length(u.velocity))+'m/s',p.x+18,labelY-3);}
  c.strokeStyle=color+'50';c.lineWidth=1;c.strokeRect(p.x-14,p.y-14,28,28);
  const health=clamp(u.structure/u.maxStructure);c.fillStyle='#101827';c.fillRect(p.x+18,labelY,70,3);c.fillStyle=color;c.fillRect(p.x+18,labelY,70*health,3);
  if(u.entityType!=='ship'){c.font='10px system-ui';c.fillStyle=(u.stability??1)<.25?'#ff918e':color;c.fillText('稳 '+Math.round((u.stability??1)*100)+'%',p.x+94,labelY+3);}
  if(u.aiming){c.fillStyle=color;c.fillText('瞄准 · '+(u.aimingWeapons?.slice(0,2).join(' / ')||u.weapon),p.x+18,labelY+15);}
  const damageParts=Object.values(u.componentState||{}).filter(x=>x.health<x.structure*.65).sort((a,b)=>a.health/a.structure-b.health/b.structure).slice(0,2);
  const degraded=damageParts.map(x=>x.name+(x.health<=0?'损毁':'受损'));
  if(!degraded.length)for(const [id,name]of [['engine','推进器'],['sensor','传感器'],['weapon','武器系统']])if((u.components?.[id]??1)<.65)degraded.push(name+'受损');
  if(degraded.length&&u.alive){c.fillStyle='#ff555d';c.font='bold 11px system-ui';c.fillText(degraded.slice(0,2).join(' / '),p.x+18,labelY+42);}
  // Black/gold badges are state-driven; no repeated popup effects or per-frame logs.
  if(u.alive&&u.activeSkills?.length){c.save();c.font='bold 11px system-ui';c.textAlign='left';
   const names=u.activeSkills.map(s=>s.name),rows=names.slice(0,4);if(names.length>4)rows[3]+=' +'+(names.length-4);
   rows.forEach((name,i)=>{const text='◆ '+name,x=p.x+18,y=labelY+61+i*19,width=Math.min(270,c.measureText(text).width+14);c.fillStyle='#10100feb';c.strokeStyle='#a7873aaa';c.lineWidth=1;c.beginPath();c.roundRect(x-5,y-13,width,17,4);c.fill();c.stroke();c.strokeStyle='#000';c.lineWidth=2;c.strokeText(text,x,y);c.fillStyle='#f1d17d';c.fillText(text,x,y);});c.restore();
  }
  if(u.targetedBy){c.save();const enemy=unitColor(u.targetedBy),radius=32+Math.sin(t*6)*2;c.strokeStyle=enemy+'60';c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.stroke();c.shadowBlur=0;for(let i=0;i<4;i++){const a=i*Math.PI/2;c.beginPath();c.moveTo(p.x+Math.cos(a)*(radius-7),p.y+Math.sin(a)*(radius-7));c.lineTo(p.x+Math.cos(a)*(radius+8),p.y+Math.sin(a)*(radius+8));c.stroke();}c.fillStyle=enemy+'cc';c.font='bold 11px system-ui';c.textAlign='center';c.fillText('被锁定',p.x,p.y-radius-8);c.restore();}
  if(u.entityType!=='ship'&&u.stability<.2){c.fillStyle='#ff918e';c.font='10px system-ui';c.fillText('失稳',p.x+18,labelY+28);}
 }
 debrisMesh(o,t){
  if(o.shape==='core-fighter')return;
  const p=this.project(o.position);if(!p)return;
  const b=bodyBasis(o.forward),r=Math.max(o.radius||10,4/p.scale),spin=(t-(o.bornAt??0))*1.3,axis=add(mul(b.right,Math.cos(spin)),mul(b.up,Math.sin(spin))),up=add(mul(b.up,Math.cos(spin)),mul(b.right,-Math.sin(spin)));
  const point=(x,y,z)=>add(o.position,add(mul(axis,x*r),add(mul(up,y*r),mul(b.forward,z*r))));
  const color=unitColor(o.owner);
  if(o.shape==='missile-rack'){
   const corners=[point(-.65,-.4,-1),point(.65,-.4,-1),point(.65,.4,-1),point(-.65,.4,-1)],front=[point(-.65,-.4,1),point(.65,-.4,1),point(.65,.4,1),point(-.65,.4,1)];
   this.polygon(front,'#839184',color+'99');for(let i=0;i<4;i++)this.polygon([corners[i],corners[(i+1)%4],front[(i+1)%4],front[i]],'#556759',color+'66');
   for(let i=-1;i<=1;i++)this.line(point(i*.35,0,1),point(i*.35,0,.7),'#27352d',2);
  }else{
   this.polygon([point(-.4,-.35,-1.5),point(.4,-.35,-1.5),point(.4,.35,1.5),point(-.4,.35,1.5)],'#899a97',color+'aa');
   this.line(point(0,0,-1.5),point(0,0,1.5),'#d6ddd4',2);
  }
  if(t-(o.bornAt??-10)<1.1){this.line(o.position,sub(o.position,mul(o.velocity,.04)),color+'45',1);this.ctx.fillStyle=color+'bb';this.ctx.font='10px system-ui';this.ctx.fillText(o.name,p.x+8,p.y-8);}
 }
 shipHull(u,color){
  const baseDim=u.renderProfile?.dimensions||[146,55,75],projection=this.project(u.position),visualScale=Math.max(1,50/Math.max(1,baseDim[0]*(projection?.scale||1))),dim=baseDim.map(x=>x*visualScale),f=norm(u.forward),b=bodyBasis(f),roll=u.roll||0,up=add(mul(b.up,Math.cos(roll)),mul(b.right,Math.sin(roll))),right=add(mul(b.right,Math.cos(roll)),mul(b.up,-Math.sin(roll)));const point=(x,y,z)=>add(u.position,add(mul(f,x*dim[0]),add(mul(up,y*dim[1]),mul(right,z*dim[2]))));
  const nose=point(.5,0,0),tail=point(-.5,0,0),corners=[point(.1,.45,.45),point(.1,.45,-.45),point(.1,-.45,-.45),point(.1,-.45,.45)];const faces=[];for(let i=0;i<4;i++){faces.push([nose,corners[i],corners[(i+1)%4]]);faces.push([tail,corners[(i+1)%4],corners[i]]);}faces.sort((a,b)=>length(sub(b[0],this.eye))-length(sub(a[0],this.eye)));for(const [i,face]of faces.entries())this.polygon(face,u.alive?['#637565','#a1b3a5','#738c79'][i%3]:'#554c50',color+'80');
  for(const part of Object.values(u.componentState||{})){const p=this.project(add(u.position,add(mul(f,part.position[0]*visualScale),add(mul(up,part.position[1]*visualScale),mul(right,part.position[2]*visualScale)))));if(p){this.ctx.fillStyle=part.health<=0?'#d86666':part.critical?'#f7d29b':'#b5c9be';this.ctx.fillRect(p.x-2,p.y-2,4,4);}}
 }
 fireCone(u){
  if(!u.alive||!u.fireArc)return;
  const arc=u.fireArc;if(!Number.isFinite(arc.range)||!Number.isFinite(arc.yaw)||!Number.isFinite(arc.pitch))return;
  const color=unitColor(u.id);
  const outer=arcBoundary(u.forward,arc,arc.range).map(v=>add(u.position,v));
  const effective=arcBoundary(u.forward,arc,Math.min(arc.range,arc.effectiveRange||arc.range)).map(v=>add(u.position,v));
  for(let i=0;i<outer.length;i++){const j=(i+1)%outer.length;
   this.polygon([u.position,effective[i],effective[j]],color+'03');
   this.line(outer[i],outer[j],color+'20',.7,[3,5]);
   this.line(effective[i],effective[j],color+'30',.8);
   if(i%12===0)this.line(u.position,outer[i],color+'20',.7);
  }
 }
 // Tapered translucent flame with a narrow bright core; local presentation only.
 plume(position,direction,color,t,strength=1,variation=1,reach=90){
  const p=this.project(position),q=this.project(add(position,mul(direction,reach)));if(!p||!q)return;
  const heading=Math.atan2(q.y-p.y,q.x-p.x),extent=clamp(Math.hypot(q.x-p.x,q.y-p.y),22,75)*(.65+.35*strength),width=(2+3*strength)*variation,c=this.ctx;
  c.save();c.translate(p.x,p.y);c.rotate(heading);c.globalCompositeOperation='screen';
  const flutter=Math.sin(t*61+position[0]*.01)*width*.35,gradient=c.createLinearGradient(0,0,extent,0);
  gradient.addColorStop(0,'#e6faffdd');gradient.addColorStop(.18,color+'b0');gradient.addColorStop(.58,color+'45');gradient.addColorStop(1,color+'00');
  c.fillStyle=gradient;c.globalAlpha*=strength;c.beginPath();c.moveTo(0,-width*.35);c.bezierCurveTo(extent*.18,-width,extent*.65,-width*.3,extent,flutter);c.bezierCurveTo(extent*.6,width*.35,extent*.2,width,0,width*.35);c.closePath();c.fill();
  c.fillStyle='#eefcffb0';c.beginPath();c.moveTo(0,-width*.17);c.lineTo(extent*.5,flutter*.3);c.lineTo(0,width*.17);c.closePath();c.fill();c.restore();
 }
 bladeTrail(u,age,life,hand=1,reach=85,contact=false,contactPoint=null){
  const projection=this.project(u.position),visualRadius=Math.max(u.radius||17,8/(projection?.scale||1));
  const pose={...u,radius:visualRadius},shape=contactPoint?clashBladeSweep(pose,contactPoint,age,hand,Math.max(reach,visualRadius*2.5)):bladeSweep(pose,bladeProgress(age,contact),hand,Math.max(reach,visualRadius*2.5)),c=this.ctx;
  const fade=age<.18?1:clamp(1-(age-.18)/Math.max(.01,life-.18));c.save();c.globalAlpha*=fade;
  this.polygon(shape.points,unitColor(u.id)+'72',unitColor(u.id)+'c0');
  const edge=shape.points.slice(1);for(let i=1;i<edge.length;i++)this.line(edge[i-1],edge[i],'#f0fcffe0',2);
  this.line(shape.pivot,shape.tip,unitColor(u.id)+'d0',2.4);c.restore();
 }
 strikeFeedback(position,age,strength=1,clash=false){
   const duration=clash?.78:.3,p=this.project(position);if(!p||age>duration)return;
   const c=this.ctx,fade=(1-age/duration)**1.5,scale=.7+.6*clamp(strength),core=clash?34:18;
   c.save();c.globalAlpha*=fade;
   const radius=(core+age*(clash?48:20))*scale,g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
   g.addColorStop(0,age<.14?'#fffcecf5':'#fff0b3a0');g.addColorStop(.18,'#ffe69ed0');g.addColorStop(.48,'#ffb44368');g.addColorStop(1,'#ff863000');
   c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fill();
   // Fixed small particle count: strong contact, then expanding ember streaks.
   const count=clash?8:4;for(let i=0;i<count;i++){const angle=i*Math.PI*2/count+.37,travel=age*(70+(i%3)*25),inner=3+travel,outer=inner+(clash?18:8)*(1-age/duration);
    c.strokeStyle=i%2?'#ffc563':'#fff1c2';c.lineWidth=clash?2:1.3;c.beginPath();c.moveTo(p.x+Math.cos(angle)*inner,p.y+Math.sin(angle)*inner);c.lineTo(p.x+Math.cos(angle)*outer,p.y+Math.sin(angle)*outer);c.stroke();
   }
   if(clash&&age<.12){c.globalAlpha*=1-age/.12;c.strokeStyle='#fff8dd';c.lineWidth=3;c.beginPath();c.moveTo(p.x-24*scale,p.y);c.lineTo(p.x+24*scale,p.y);c.moveTo(p.x,p.y-12*scale);c.lineTo(p.x,p.y+12*scale);c.stroke();}
   c.restore();
  }

 effect(e,t,slot=0,poses=new Map()) {
  const age=t-e.t;if(age<0||age>e.life)return;const c=this.ctx,fade=1-age/e.life;c.save();c.globalAlpha=e.type==='clash'?1:fade;
  if(e.type==='slash'){
   const u=poses.get(e.actor)||{id:e.actor,position:e.from,forward:norm(sub(e.to,e.from)),radius:17};
   if(e.meleeStyle==='thrust'){const axis=bodyBasis(u.forward),phase=Math.sin(Math.min(1,age/e.life)*Math.PI),reach=(e.reachM??55)*(.3+.7*phase),pivot=add(u.position,mul(axis.right,12)),tip=add(pivot,mul(axis.forward,reach));this.line(pivot,tip,unitColor(u.id)+'35',8);this.line(pivot,tip,unitColor(u.id),3);this.line(pivot,tip,'#f3ffff',1);}else this.bladeTrail(u,age,e.life,e.hand??1,e.reachM??85);
  }else if(e.type==='clash'){
   const a=poses.get(e.actor),b=poses.get(e.opponent);
   const contact=a&&b?mul(add(a.position,b.position),.5):e.position;
   if(a)this.bladeTrail(a,age,e.life,1,85,true,contact);if(b)this.bladeTrail(b,age,e.life,1,85,true,contact);
   this.strikeFeedback(age<.14?contact:e.position,age,e.intensity||.6,true);
  }else if(e.type==='dodge-jet'){
   const u=poses.get(e.actor),position=u?.position||e.position;
   if(e.counterThrust&&u){
    const basis=bodyBasis(u.forward),visualRadius=Math.max(u.radius||17,8/(this.project(u.position)?.scale||1)),v=e.localDirection,direction=v?add(add(mul(basis.right,v[0]),mul(basis.up,v[1])),mul(basis.forward,v[2])):e.direction;
    for(const hand of [-1,1])this.plume(add(position,add(mul(basis.right,hand*visualRadius*.65),mul(basis.forward,visualRadius*.7))),direction,unitColor(e.actor),t,Math.min(1,fade*2),2.3,180);
    const p=this.project(position);if(p){c.globalAlpha=fade;c.fillStyle='#dbfaff';c.font='bold 12px system-ui';c.textAlign='center';c.fillText('前向反推 · 抵消冲击',p.x,p.y-38);}
   }else this.plume(position,e.direction,unitColor(e.actor),t,fade,1);
  }else if(e.type==='decoy-track'){
   const from=poses.get(e.drone)?.position||e.from,to=poses.get(e.object)?.position||e.to;this.line(from,to,unitColor(e.actor)+'55',1,[4,5]);const p=this.project(to);if(p){c.strokeStyle=unitColor(e.actor)+'88';c.beginPath();c.arc(p.x,p.y,12,0,Math.PI*2);c.stroke();c.fillStyle='#eac5a5';c.font='11px system-ui';c.fillText('卸装物误锁',p.x+15,p.y-8);}
  }else if(e.type==='jettison'){
   const u=poses.get(e.actor),p=this.project(u?.position||e.position);if(p){c.fillStyle=unitColor(e.actor);c.font='bold 12px system-ui';c.textAlign='center';c.fillText('卸装 '+Math.round(e.removedMassKg/1000)+'t · 推重比 ×'+e.accelerationGain.toFixed(2),p.x,p.y-46);}
  }else if(e.type==='tracer'&&['boomerang','anchor'].includes(e.visualProfile)){
   const delta=sub(e.to,e.from),distance=length(delta),direction=norm(delta),at=age*(e.projectileSpeedMps||1400);
   if(at<=distance){const tip=add(e.from,mul(direction,at)),basis=bodyBasis(direction),size=e.visualProfile==='boomerang'?30:14;
    if(e.visualProfile==='anchor')this.line(poses.get(e.actor)?.position||e.from,tip,unitColor(e.actor)+'38',1);
    const spin=e.visualProfile==='boomerang'?age*24:0,axis=add(mul(basis.right,Math.cos(spin)),mul(basis.up,Math.sin(spin))),left=add(tip,mul(axis,size)),right=add(tip,mul(axis,-size)),back=add(tip,mul(direction,-size*.7)),color=e.visualProfile==='boomerang'?unitColor(e.actor):'#bdc9d5';
    this.line(left,back,color+'40',6);this.line(back,right,color+'40',6);this.line(left,back,color,2);this.line(back,right,color,2);
   }
  }else if(e.type==='tracer'&&(e.vulcan===true||e.visualProfile==='vulcan')){this.tracerDots(e,t);}
  else if(e.type==='tracer'&&e.scatter){
   const delta=sub(e.to,e.from),dist=length(delta),direction=norm(delta),at=Math.min(dist,age*(e.projectileSpeedMps||1000)),tail=Math.max(0,at-110);
   this.line(add(e.from,mul(direction,tail)),add(e.from,mul(direction,at)),unitColor(e.actor)+'b0',1.8);
  }
  else if(e.type==='beam'&&['main-battery','heavy-main'].includes(e.shipRole)){
   const color=unitColor(e.actor),heavy=e.shipRole==='heavy-main',opacity=clamp(fade*1.3);c.globalAlpha=opacity;
   this.line(e.from,e.to,color+'18',heavy?28:18);this.line(e.from,e.to,color+'55',heavy?15:9);this.line(e.from,e.to,color,heavy?7:4);this.line(e.from,e.to,'#fff6e5',heavy?3:1.6);
  }
  else if(e.type==='tracer'&&e.shipRole==='secondary-battery'){
   const delta=sub(e.to,e.from),direction=norm(delta),at=Math.min(length(delta),age*(e.projectileSpeedMps||4000));this.line(add(e.from,mul(direction,Math.max(0,at-140))),add(e.from,mul(direction,at)),unitColor(e.actor),2.5);
  }
  else if(e.type==='beam'&&e.beamClass==='large'){const color=unitColor(e.actor);this.line(e.from,e.to,color+'20',15);this.line(e.from,e.to,color+'70',7);this.line(e.from,e.to,color,3.5);this.line(e.from,e.to,'#ffeecf',1.2);}
  else if(e.type==='tracer'&&['rail','shell'].includes(e.visualProfile)){
   const delta=sub(e.to,e.from),distance=length(delta),at=age*(e.projectileSpeedMps||4000);
   if(at<=distance+30){const axis=norm(delta),tip=add(e.from,mul(axis,Math.min(distance,at))),tail=add(e.from,mul(axis,Math.max(0,at-(e.visualProfile==='rail'?75:22))));this.line(tail,tip,e.visualProfile==='rail'?'#c7e7ff88':'#ffcc8788',e.visualProfile==='rail'?2:3);}
  }
  else if(e.type==='tracer'){
   // A round is a moving short streak, never a muzzle-to-range laser curtain.
   const delta=sub(e.to,e.from),distance=length(delta),at=age*(e.projectileSpeedMps||1000);
   if(at<=distance+50){const direction=norm(delta),tip=Math.min(distance,at),tail=Math.max(0,tip-Math.min(55,(e.projectileSpeedMps||1000)*.035));this.line(add(e.from,mul(direction,tail)),add(e.from,mul(direction,tip)),'#ffe8a6b0',1.5);}
  }
  else if(e.type==='beam'&&e.visualProfile==='gn-tracer'){const delta=sub(e.to,e.from);for(let i=0;i<7;i++){const point=this.project(add(e.from,mul(delta,(i+.5)/7)));if(point){c.fillStyle='#ffa9df';c.beginPath();c.arc(point.x,point.y,1.2,0,Math.PI*2);c.fill();}}}
  else if(e.type==='beam'){const color=e.beamRifle===true||e.visualProfile==='rifle-beam'?'#ff354a':unitColor(e.actor);this.line(e.from,e.to,color+'35',7);this.line(e.from,e.to,color,2);}
  else if(e.type==='notice'){const p=this.project(e.position);if(p){const tone={info:'#d6ebf5',good:'#98f3c5',warning:'#ffd28d',damage:'#ff918e'}[e.tone]||'#d6ebf5';c.font='bold 12px system-ui';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#10202c';const y=p.y-48-slot*17-age*14;c.strokeText(e.text,p.x,y);c.fillStyle=tone;c.fillText(e.text,p.x,y);}}
  else if(e.position){if(e.type==='impact'&&e.kind==='melee')this.strikeFeedback(e.position,age,e.severity);const p=this.project(e.position);if(p){const radius=Math.max(6,(e.type==='area-blast'?(e.radius||30):e.type==='explosion'?90:25)*p.scale)*(0.7+age*2);const g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);g.addColorStop(0,'#fffadc');g.addColorStop(.25,'#ffd58d');g.addColorStop(.65,'#f57a3944');g.addColorStop(1,'#f57a3900');c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fill();}}
  c.restore();
 }
 draw(snapshot,environment,previous,alpha=1,now=performance.now()) {
  const c=this.ctx,canvas=this.canvas;const bounds=canvas.getBoundingClientRect();if(bounds.width<5||bounds.height<5)return;
  this.w=bounds.width;this.h=bounds.height;const dpr=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(this.w*dpr)||canvas.height!==Math.round(this.h*dpr)){canvas.width=Math.round(this.w*dpr);canvas.height=Math.round(this.h*dpr);}
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,this.w,this.h);
  c.save();this.lastShake=this.impactFeedback.sample(snapshot.effects,snapshot.t,this.focus,now,this.impactShakeEnabled!==false);c.translate(...this.lastShake);
  const previousById=new Map((previous?.units||[]).map(u=>[u.id,u]));
  const units=snapshot.units.map(u=>{const prev=previousById.get(u.id);return prev?{...u,position:lerp(prev.position,u.position,alpha),forward:norm(lerp(prev.forward,u.forward,alpha))}:{...u};});
  this.updatePreparations(snapshot.events,snapshot.t,units);
  this.updateCamera(units,now);
  const visual=environment.visual;const sky=c.createLinearGradient(0,0,0,this.h);sky.addColorStop(0,visual.sky);sky.addColorStop(.68,visual.horizon);sky.addColorStop(1,visual.sea);c.fillStyle=sky;c.fillRect(0,0,this.w,this.h);
  // Ocean tiles have real XYZ positions and move only with camera projection.
  const space=environment.medium==='space'||environment.medium==='orbit';
  if(space){for(let i=0;i<140;i++){const x=(Math.sin(i*127.1)*43758.5453%1+1)%1*this.w,y=(Math.sin(i*311.7)*9612.53%1+1)%1*this.h;c.fillStyle=i%7?'#b5c3d54a':'#d5e7ff88';c.fillRect(x,y,i%7?1:2,i%7?1:2);}}
  const step=500,ox=Math.round(this.target[0]/step)*step,oz=Math.round(this.target[2]/step)*step;
  const tiles=[];
  if(!space)for(let ix=-12;ix<12;ix++)for(let iz=-12;iz<12;iz++){const x=ox+ix*step,z=oz+iz*step,pts=[[x,0,z],[x+step,0,z],[x+step,0,z+step],[x,0,z+step]],q=this.project([x+step/2,0,z+step/2]);if(q)tiles.push({pts,z:q.z,shade:(ix+iz)%2===0});}
  tiles.sort((a,b)=>b.z-a.z);for(const tile of tiles)this.polygon(tile.pts,visual.sea,tile.shade?'#92c7d111':'#92c7d107');
  if(!space)for(let i=0;i<65;i++){const x=ox+Math.sin(i*31)*4400,z=oz+Math.cos(i*17)*4400;this.line([x,1,z],[x+75+25*Math.sin(snapshot.t+i),1,z],'#abd9e019',1);}
  if(this.lastTrailTick!==snapshot.tick){for(const u of snapshot.units){const trail=this.trails.get(u.id)||[];trail.push([...u.position]);if(trail.length>260)trail.shift();this.trails.set(u.id,trail);}this.lastTrailTick=snapshot.tick;}
  for(const [id,trail]of this.trails)this.trail(trail,unitColor(id));
  for(const o of snapshot.geometry||[]){if(o.health===0)continue;const p=this.project(o.position);if(!p)continue;if(o.dimensions){const d=o.dimensions,corners=[];for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)corners.push(this.project(add(o.position,[(x-.5)*d[0],(y-.5)*d[1],(z-.5)*d[2]])));c.save();c.lineWidth=1;c.fillStyle=o.structure&&o.health<o.structure?'#584b40a0':'#384958b0';c.strokeStyle='#a7bfcd55';for(const face of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]){if(face.some(i=>!corners[i]))continue;c.beginPath();face.forEach((i,n)=>n?c.lineTo(corners[i].x,corners[i].y):c.moveTo(corners[i].x,corners[i].y));c.closePath();c.fill();c.stroke();}c.restore();continue;}const radius=Math.max(2,o.radiusM*p.scale);c.save();c.fillStyle='#384958b0';c.strokeStyle='#a7bfcd55';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.ellipse(p.x,p.y,radius,radius*.32,.3,0,Math.PI*2);c.stroke();if(o.structure&&o.health<o.structure){c.strokeStyle='#ffa88999';c.beginPath();c.moveTo(p.x-radius*.35,p.y-radius*.6);c.lineTo(p.x+radius*.18,p.y);c.lineTo(p.x-radius*.15,p.y+radius*.6);c.stroke();}c.restore();}
  for(const o of snapshot.objects||[])this.debrisMesh(o,snapshot.t);for(const d of snapshot.drones||[]){const p=this.project(d.position);if(p){c.fillStyle=unitColor(d.owner);c.beginPath();c.arc(p.x,p.y,2.5,0,Math.PI*2);c.fill();this.line(d.position,add(d.position,mul(norm(d.velocity),-60)),unitColor(d.owner)+'20',1);}}
  for(const cloud of snapshot.clouds||[]){const p=this.project(cloud.position);if(p){c.save();const screen=cloud.type==='beam-screen';c.fillStyle=screen?'#8ed7f31c':'#bfc9ce22';c.beginPath();c.arc(p.x,p.y,Math.max(3,cloud.radiusM*p.scale),0,Math.PI*2);c.fill();if(screen){c.strokeStyle='#a1ddef35';c.lineWidth=1;c.stroke();}c.restore();}}
  if(this.showFireArcs)units.forEach(u=>this.fireCone(u));
  // Legacy recordings used targetedBy as an outgoing target; normalize presentation only.
  const outgoing=new Map(units.map(u=>[u.id,Object.hasOwn(u,'lockedTargetId')?u.lockedTargetId:u.locked?u.targetedBy:null]));
  for(const u of units)if(!Object.hasOwn(u,'lockedTargetId'))u.targetedBy=units.find(x=>x.alive&&outgoing.get(x.id)===u.id)?.id||null;
  for(const u of units){const target=units.find(x=>x.id===outgoing.get(u.id));if(u.alive&&u.locked&&target?.alive)this.line(u.position,target.position,unitColor(u.id)+'48',1.2,[7,5]);}
  const liveProjectileIds=new Set((snapshot.projectiles||[]).map(p=>p.id));for(const id of this.projectileTrails.keys())if(!liveProjectileIds.has(id))this.projectileTrails.delete(id);
  for(let p of snapshot.projectiles||[]){if(!p.trace||p.trace.length<2){const path=this.projectileTrails.get(p.id)||[];if(!path.length||length(sub(path.at(-1),p.position))>1)path.push([...p.position]);if(path.length>10)path.shift();this.projectileTrails.set(p.id,path);p={...p,trace:path};}if(p.trace?.length>1&&!['beam','ballistic'].includes(p.kind)){c.save();for(let i=1;i<p.trace.length;i++){c.globalAlpha=.10+.20*i/p.trace.length;this.line(p.trace[i-1],p.trace[i],unitColor(p.owner),1.1);}c.restore();}const q=this.project(p.position);if(q){c.fillStyle=unitColor(p.owner);if(['missile','funnel-missile'].includes(p.kind)&&p.trace?.length>1){const prev=this.project(p.trace.at(-2)),angle=prev?Math.atan2(q.y-prev.y,q.x-prev.x):0;c.save();c.translate(q.x,q.y);c.rotate(angle);c.fillStyle='#e8edf2';c.beginPath();c.moveTo(5,0);c.lineTo(-3,-2);c.lineTo(-3,2);c.closePath();c.fill();c.fillStyle=unitColor(p.owner)+'75';c.beginPath();c.moveTo(-3,-1.6);c.lineTo(-12,0);c.lineTo(-3,1.6);c.closePath();c.fill();c.restore();}else if(p.kind!=='beam'){c.beginPath();c.arc(q.x,q.y,1.7,0,Math.PI*2);c.fill();}}}
  for(let i=1;i<units.length;i++){const pa=this.project(units[i-1].position),pb=this.project(units[i].position);if(pa&&pb&&Math.abs(pa.x-pb.x)<175&&Math.abs(pa.y-pb.y)<90)units[i].labelShift=66;}
  const live=(snapshot.effects||[]).filter(e=>e.t<=snapshot.t&&e.t+e.life>=snapshot.t);
  this.saberActions=new Set(live.filter(e=>e.type==='slash'||e.type==='clash').flatMap(e=>[e.actor,e.opponent]));
  this.remoteBarrierOwners=new Set((snapshot.drones||[]).filter(d=>d.phase==='barrier').map(d=>d.owner));
  units.sort((a,b)=>length(sub(b.position,this.eye))-length(sub(a.position,this.eye)));units.forEach(u=>this.mesh(u,snapshot.t));
  const notices=new Map();
  const contacts=new Set(live.filter(e=>['clash','jettison'].includes(e.type)||e.counterThrust).flatMap(e=>[e.actor,e.opponent]));
  for(const e of live.filter(e=>e.type==='notice').reverse()){if(contacts.has(e.actor)&&e.tone!=='damage'&&!e.weaponNotice)continue;const n=notices.get(e.actor)||[];if(n.length<2&&!n.some(x=>x.text===e.text))n.push(e);notices.set(e.actor,n);}
  const poses=new Map([...units,...(snapshot.objects||[]),...(snapshot.drones||[])].map(u=>[u.id,u])),blades=new Map(),clashing=new Map();
  for(const e of live)if(e.type==='clash'){clashing.set(e.actor,e);if(e.opponent)clashing.set(e.opponent,e);}
  for(const e of live){if(e.type==='clash'&&(clashing.get(e.actor)!==e||e.opponent&&clashing.get(e.opponent)!==e))continue;if(e.type==='slash'){if(!clashing.has(e.actor))blades.set(e.actor,e);}else if(e.type!=='notice')this.effect(e,snapshot.t,0,poses);}
  for(const e of blades.values())this.effect(e,snapshot.t,0,poses);for(const list of notices.values())list.forEach((e,i)=>this.effect(poses.has(e.actor)?{...e,position:poses.get(e.actor).position}:e,snapshot.t,i,poses));
  c.restore();
 }
}
