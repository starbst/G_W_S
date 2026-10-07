import {perceivedValue} from './pilot-judgment.js';
import {mayEngage} from './target-policy.js';
import {shipWeaponRole} from './ship-weapons.js';
import {add,sub,mul,norm,length,dot,clamp,arcSolution,insideArc} from './math.js';
import {navigationGoal,withdrawalOption} from './missions.js';

export const COMMAND_LABELS=Object.freeze({attack:'集中攻击',screen:'牵制掩护',escort:'护卫援护',withdraw:'撤离重整',hold:'保持位置',auto:'交回AI'});
const live=u=>u.alive&&!u.docked&&!u.disabled&&u.combatant!==false;
const range=u=>Math.max(0,...u.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.effectiveRangeM||w.definition.sim.rangeM));
const fresh=(b,u,id)=>{const c=u.contacts.get(id);return c&&b.t-c.observedAt<=.8?c:null;};
const walk=(c,out=[])=>{if(!c)return out;if(c.conditions)for(const x of c.conditions)walk(x,out);else out.push(c);return out;};

// Reassigning a unit costs a real engagement window as well as travel time.
// This is a bid penalty, so a captured/critical mission ally can still outrank it.
export function engagementOpportunity(b,u,requestTargetId){
 const opponent=b.unitById.get(u.targetId),seen=opponent&&fresh(b,u,opponent.id);
 if(!opponent?.alive||!seen||opponent.id===requestTargetId)return 0;
 const delta=sub(seen.position,u.position),distance=length(delta),axis=norm(delta);
 const blade=b.bestBlade(u,opponent),closing=Math.max(0,-dot(sub(seen.velocity,u.velocity),axis));
 const committed=!!u.swing||u.weapons.some(w=>w.definition.kind==='melee'&&(w.attack||w.salvo));
 const contactWindow=blade&&distance<=blade.definition.sim.rangeM+closing*2.5;
 const counter=(seen.threatTargetIds??seen.aimTargetIds)?.includes(u.id)||u.observedHeavyAttacker===opponent.id&&b.t-(u.observedHeavyAt??-100)<1.5;
 const primary=b.mission?.priorities?.[u.side],mission=primary?.primaryEntityId===opponent.id;
 return (committed?10:contactWindow?6:0)+(counter?4:0)+(mission&&(contactWindow||committed)?Math.min(6,(primary.primaryValue||8)/3):0);
}

// Mission escorts keep a common moving protection anchor even when they have
// their own later recovery waypoint. Only observed enemies may shape the screen.
export function escortObjective(b,u){
 const assignment=u.commandAssignment,assigned=assignment?.type==='escort'&&b.unitById.get(assignment.allyId||(assignment.source==='player'?assignment.targetId:null));
 if(assigned?.alive&&assigned.side===u.side)return assigned;
 if(u.controller!=='escort')return null;
 const protectedIds=new Set(walk(b.mission?.victory?.[u.side]).filter(c=>['reach','protect','complete-work'].includes(c.type)).map(c=>c.entityId));
 for(const[side,goal]of Object.entries(b.mission?.victory||{}))if(side!==u.side)for(const c of walk(goal))if(['destroy','seize'].includes(c.type))protectedIds.add(c.entityId);
 const allies=(b.spatial.sides[u.side]||[]).filter(a=>a.alive&&a!==u);
 return allies.find(a=>protectedIds.has(a.id))||allies.find(a=>a.entityType==='ship')||null;
}
function screeningTarget(b,u,ally,views,allocations){
 let best=null,score=-Infinity,retained=null,retainedScore=-Infinity;
 for(const[id,c]of views){if(!fresh(b,u,id))continue;const foe=b.unitById.get(id);if(!mayEngage(b,u,foe)||foe.entityType==='ship'||foe.combatant===false)continue;
  const delta=sub(ally.position,c.position),distance=length(delta),closing=dot(sub(c.velocity,ally.velocity),norm(delta));
  const guns=foe.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0),reach=Math.max(0,...guns.map(w=>w.definition.sim.effectiveRangeM||w.definition.sim.rangeM));
  const active=(c.threatTargetIds??c.aimTargetIds)?.includes(ally.id)||ally.supportUntil>b.t&&ally.supportTarget===id;
  if(!reach||distance>Math.max(reach*1.4,reach+Math.max(0,closing)*8+ally.machine.sim.radiusM+1200))continue;
  if(!active&&closing<=20&&distance>reach)continue;
  const value=(active?8:0)+Math.max(0,12-(distance-reach)/Math.max(80,closing))-length(sub(c.position,u.position))/3000-(allocations.get(id)||0)*6;
  if(u.commandAssignment?.type==='escort'&&u.commandAssignment.allyId===ally.id&&u.commandAssignment.targetId===id){retained=foe;retainedScore=value;}
  if(value>score){best=foe;score=value;}
 }
 return retained&&retainedScore>=score-3?retained:best;
}
// Keep one geometric screen for macro orders and local avoidance. A battery far
// beyond our own range must be intercepted forward, not met behind the carrier.
export function escortScreenCourse(b,u,ally,contact=null){
 const reach=range(u)*.85,m=u.machine.sim;if(!ally?.alive||ally.side!==u.side||!reach)return null;
 // Mounted defenders cannot move their own hull. They keep their turret/fire
 // decision unless their actual carrier is the motor (handled elsewhere).
 if(u.mountId&&b.unitById.get(u.mountId)?.entityType==='ship')return null;
 const goal=navigationGoal(b,ally),rear=goal?mul(norm(sub(goal.point,ally.position)),-1):length(ally.velocity)>10?mul(norm(ally.velocity),-1):mul(ally.forward,-1);
 let station=add(ally.position,mul(rear,Math.max(700,reach*.55)));
 if(contact&&b.t-contact.observedAt<=.8){
  const targetDelta=sub(contact.position,u.position),guardDelta=sub(u.position,ally.position),leash=Math.max(3000,reach*1.8+ally.machine.sim.radiusM);
  // A retreating enemy must not drag an escort away from the common anchor.
  const anchorDistance=length(sub(contact.position,ally.position));
  if(anchorDistance>leash+reach)contact=null;
  if(contact){
  if(length(targetDelta)<=reach&&dot(guardDelta,targetDelta)>=0)return null;
  const incoming=sub(contact.position,ally.position),distance=length(incoming),closing=Math.max(0,dot(sub(contact.velocity,ally.velocity),mul(norm(incoming),-1)));
  const horizon=Math.min(1.5,Math.max(0,distance-reach)/Math.max(100,m.maxSpeedMps+closing)),point=add(contact.position,mul(contact.velocity,horizon));
  const axis=norm(sub(point,ally.position)),stand=Math.max(ally.machine.sim.radiusM+m.radiusM+80,length(sub(point,ally.position))-reach);
  station=add(ally.position,mul(axis,Math.min(stand,leash)));
  }
 }
 const error=sub(station,u.position),desired=add(ally.velocity,mul(norm(error),Math.min(m.maxSpeedMps*.85,length(error)*.7))),correction=sub(desired,u.velocity);
 const facing=contact?norm(sub(contact.position,u.position)):length(error)>30?norm(error):ally.forward;
 const approach=length(correction)>60&&length(error)>reach*.4,buffer=clamp(u.energy/m.energyCapacity/.3);
 return {order:contact?'screen':'supportApproach',heading:approach&&buffer>.3?norm(correction):facing,desired:add(u.velocity,mul(correction,buffer)),flightMode:length(correction)*buffer<25?'coast':'normal'};
}

function pursuitTarget(b,u,views){
 if(!(u.pilotState.strategies?.['fixated-pursuit']>0))return null;
 const retained=b.unitById.get(u.fixatedTargetId);if(retained?.alive&&!retained.disabled&&mayEngage(b,u,retained)&&fresh(b,u,retained.id))return retained;
 if(retained?.alive&&!retained.disabled)return null; // Losing sight does not license reading hidden positions.
 let best=null,score=-Infinity;
 for(const[id,c]of views){const foe=b.unitById.get(id);if(!fresh(b,u,id)||!mayEngage(b,u,foe)||!['ms','ma'].includes(foe.entityType))continue;
  const value=((c.threatTargetIds??c.aimTargetIds)?.includes(u.id)?4:0)-length(sub(c.position,u.position))/3000;
  if(value>score){best=foe;score=value;}
 }
 if(best)u.fixatedTargetId=best.id;return best;
}
export function initCommand(b){b.command={nextAt:0,epoch:0,signature:'',sides:new Map(),player:new Map(),energySamples:new Map(),threatMemory:new Map()};}
function setAssignment(b,u,next){
 const old=u.commandAssignment;
 const sameRoute=old?.point&&next.point&&old?.refugeId&&old.refugeId===next.refugeId;
 if(old?.source===next.source&&old?.type===next.type&&old?.targetId===next.targetId&&old?.allyId===next.allyId&&(sameRoute||JSON.stringify(old?.point)===JSON.stringify(next.point))){u.commandAssignment={...next,issuedAt:old.issuedAt};return;}
 u.commandAssignment={...next,issuedAt:b.t};u.nextDecision=b.t;
 b.emit('command',u.id,u.machine.name+'：'+(next.source==='player'?'玩家指挥 · ':'战场指挥 · ')+COMMAND_LABELS[next.type]+(next.targetId?' '+(b.unitById.get(next.targetId)?.machine.name||next.targetId):''),{source:next.source,command:next.type,target:next.targetId||null,ally:next.allyId||null,reason:next.reason});
}

// Validate the entire selection before changing any order; player intent persists
// until revoked/completed/invalidated. No command can teleport, grant hits or skip energy.
export function issuePlayerCommand(b,side,input){
 if(!b.command)initCommand(b);
 if(b.result)throw Error('战斗已经结束');
 if(side!=='a'||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['type','unitIds','targetId','point'].includes(k)))throw Error('战术指令格式错误');
 if(!Object.hasOwn(COMMAND_LABELS,input.type)||!Array.isArray(input.unitIds)||!input.unitIds.length||input.unitIds.length>64||new Set(input.unitIds).size!==input.unitIds.length)throw Error('指令或单位选择错误');
 const selected=input.unitIds.map(id=>b.unitById.get(id));if(selected.some(u=>!u||u.side!==side||!live(u)))throw Error('只能指挥本方在场且可行动的单位');
 const target=input.targetId&&b.unitById.get(input.targetId);
 if(['attack','screen'].includes(input.type)&&(!target?.alive||target.docked||target.side===side))throw Error('攻击目标须为在场敌方单位；失去观测时先搜索，不能直接开火');
 if(input.type==='escort'&&(!target?.alive||target.side!==side||selected.some(u=>u.id===target.id)))throw Error('护卫目标须为其他本方单位');
 if(input.type==='withdraw'&&(!Array.isArray(input.point)||input.point.length!==3||input.point.some(x=>!Number.isFinite(x)||Math.abs(x)>200000)))throw Error('撤离点须为有效XYZ坐标');
 for(const u of selected){
  if(input.type==='auto'){b.command.player.delete(u.id);u.commandAssignment=null;u.supportIntent=null;u.nextDecision=b.t;continue;}
  const order={source:'player',type:input.type,...(target?{targetId:target.id}:{}),...(['hold','withdraw'].includes(input.type)?{point:input.type==='hold'?[...u.position]:[...input.point]}:{}),reason:'玩家指令优先于本方AI改派'};
  u.withdrawing=false;u.operationalPlan=null;u.supportIntent=null;u.captureIntent=null;u.grappleContactSince=null;
  b.command.player.set(u.id,order);setAssignment(b,u,order);
  b.cancelAttacks(u);
 }
 b.command.nextAt=0;b.command.epoch++;
 return selected.map(u=>u.id);
}
function validPlayer(b,u,p){
 if(!live(u))return false;
 if(p.targetId&&!b.unitById.get(p.targetId)?.alive)return false;
 if(p.type==='withdraw'&&length(sub(u.position,p.point))<Math.max(80,u.machine.sim.radiusM*2))return false;
 return true;
}

// Each side gets only its friendly status and fresh contacts its own units know.
// Low-frequency bids cover urgent friendly threats before allocating excess fire.
export function updateCommand(b){
 if(!b.command)initCommand(b);const state=b.command;
 if(b.rules.commandEnabled===false){for(const u of b.units)if(!state.player.has(u.id))u.commandAssignment=null;}
 const signature=b.units.map(u=>u.id+Number(u.alive)+Number(!!u.disabled)+Number(u.defenseActive!==false)+(u.capturedBy||'')+':'+(u.swing?.targetId||u.meleeIntent?.targetId||'')).join('|');
 if(b.t<state.nextAt&&signature===state.signature)return;
 state.signature=signature;state.nextAt=b.t+(b.rules.commandIntervalS??.75);
 for(const[key,memory]of state.threatMemory)if(memory.until<=b.t)state.threatMemory.delete(key);
 // Index observable incoming shots once per command update. Projectile count
 // must not multiply every ally/contact comparison on a large battlefield.
 const armsById=new Map();
 const commandArms=foe=>{
  let cached=armsById.get(foe.id);if(cached)return cached;
  const usable=foe.weapons.filter(w=>!w.disabled&&!w.formDisabled),melee=usable.filter(w=>w.definition.kind==='melee'&&w.ammo!==0),ranged=usable.filter(w=>w.definition.kind!=='melee');
  const power=new Map(usable.map(w=>[w,w.definition.sim.damage*(b.rules.damageMultiplier||1)/Math.max(.5,w.definition.sim.cooldownS+w.definition.sim.windupS)]));
  const main=new Set(ranged.filter(w=>['main-battery','heavy-main'].includes(shipWeaponRole(foe,w.definition))));
  cached={melee,ranged,power,main,maxRange:Math.max(0,...usable.map(w=>w.definition.sim.rangeM))};armsById.set(foe.id,cached);return cached;
 };
 const incomingByTarget=new Map();
 for(const p of b.projectiles){const target=b.unitById.get(p.target);if(!target?.alive||p.intercepted||length(sub(p.position,target.position))>target.machine.sim.sensorRangeM*target.components.sensor||!b.canSee(target.position,p.position))continue;
  if(p.kind!=='missile'&&dot(sub(p.velocity,target.velocity),sub(target.position,p.position))<=0)continue;
  if(!incomingByTarget.has(target.id))incomingByTarget.set(target.id,new Set());incomingByTarget.get(target.id).add(p.owner);
 }
 for(const side of ['a','b','c']){
  const allies=(b.spatial.sides[side]||[]).filter(live);if(!allies.length)continue;
  const views=new Map();for(const u of allies)for(const[id,c]of u.contacts){const foe=b.unitById.get(id);if(foe?.alive&&foe.side!==side&&b.t-c.observedAt<=.8&&(!views.has(id)||views.get(id).observedAt<c.observedAt))views.set(id,c);}
  const goals=walk(b.mission?.victory?.[side]),protectedIds=new Set(goals.filter(c=>['reach','protect','complete-work'].includes(c.type)&&b.unitById.get(c.entityId)?.side===side).map(c=>c.entityId));
  // Enemy destroy/seize conditions expose the mission, never hidden enemy orders.
  for(const[s,victory]of Object.entries(b.mission?.victory||{}))if(s!==side)for(const c of walk(victory))if(['destroy','seize'].includes(c.type)&&b.unitById.get(c.entityId)?.side===side)protectedIds.add(c.entityId);
  const requests=[];
  for(const ally of allies){
   const old=state.energySamples.get(ally.id),elapsed=old?b.t-old.at:0;
   const burn=elapsed>0?Math.max(0,(old.total-ally.totalEnergy)/elapsed):0,rate=old?old.rate*.4+burn*.6:0;
   state.energySamples.set(ally.id,{at:b.t,total:ally.totalEnergy,rate});
   const batterySeconds=ally.machine.sim.unlimitedEnergy||rate<1?Infinity:Math.max(0,ally.totalEnergy-ally.machine.sim.dodgeEnergyCost)/rate;
   const draining=batterySeconds<15;
   const exposure=[];for(const[id,c]of views){const foe=b.unitById.get(id),delta=sub(ally.position,c.position),distance=length(delta);
    const aimed=(c.threatTargetIds??c.aimTargetIds)?.includes(ally.id),incoming=incomingByTarget.get(ally.id)?.has(id)===true,recent=ally.observedHeavyAttacker===id&&b.t-(ally.observedHeavyAt??-100)<2.5;
    const key=side+':'+ally.id+':'+id,remembered=state.threatMemory.get(key);
    const closing=Math.max(0,dot(sub(c.velocity,ally.velocity),norm(delta)));
     const arms=commandArms(foe),held=remembered&&b.t<remembered.until;
     if(distance>arms.maxRange+closing*1.5&&!held)continue;
     const imminentBlade=(aimed||closing>80&&dot(c.forward||foe.forward,norm(delta))>.65)&&arms.melee.find(w=>distance<=w.definition.sim.rangeM+closing*1.5&&insideArc(c.forward||foe.forward,delta,w.definition.sim));
     const contactTime=imminentBlade?Math.max(.15,(distance-imminentBlade.definition.sim.rangeM)/Math.max(1,closing)):Infinity;
     let power=imminentBlade?arms.power.get(imminentBlade):0;
     for(const w of arms.ranged){if(arms.main.has(w)&&ally.entityType!=='ship'&&ally.machine.sim.radiusM<50)continue;
      if(distance<=w.definition.sim.rangeM&&(aimed||incoming||recent||w.ammo!==0&&insideArc(c.forward||foe.forward,delta,w.definition.sim)))power=Math.max(power,arms.power.get(w));
     }
    if(aimed||incoming||recent){power=Math.max(power,remembered?.power||0);if(power)state.threatMemory.set(key,{until:b.t+2.5,power});}
    if(!power&&!held)continue;
    if(held)power=Math.max(power,remembered.power);
    exposure.push({id,c,power,distance,contactTime,active:aimed||incoming||recent||!!held});
   }
   const health=ally.structure/ally.machine.sim.structure,empty=ally.defenseActive===false&&ally.machine.defenses?.some(d=>['ps','vps','tp'].includes(d.type));
   const bladeDeadline=Math.min(Infinity,...exposure.map(x=>x.contactTime));
    const critical=ally.capturedBy||protectedIds.has(ally.id)||health<.5||empty||draining||bladeDeadline<1.5;
   const confirmed=ally.capturedBy||ally.pendingReaction||ally.missileThreat||bladeDeadline<1.5||b.t-(ally.observedHeavyAt??-100)<1.5||exposure.some(x=>x.active);
   if(!confirmed||!(ally.capturedBy&&views.has(ally.capturedBy)||critical&&exposure.length||exposure.length>=2))continue;
   const damage=exposure.reduce((n,x)=>n+x.power*(x.active?1:.15),0),survival=clamp((ally.structure+ally.armor*.25)/Math.max(1,damage)*3,2,60);
   const deadline=Math.min(bladeDeadline,draining&&!empty?Math.min(30,batterySeconds+survival):survival);
   const ordered=exposure.sort((a,z)=>a.contactTime-z.contactTime||Number(z.active)-Number(a.active)||z.power-a.power||a.distance-z.distance);
   const previous=allies.find(u=>u.commandAssignment?.source==='ai'&&u.commandAssignment.type==='escort'&&u.commandAssignment.allyId===ally.id)?.commandAssignment;
   const retained=ordered.find(x=>x.id===previous?.targetId),strongest=ordered[0];
   // Retain effective pressure unless a faster contact or materially stronger
   // attack needs intervention. This never holds an invalid/hidden opponent.
   const stable=retained&&strongest&&retained.active&&retained.contactTime<=strongest.contactTime+.3&&retained.power>=strongest.power*.7;
   const chosen=ally.capturedBy?exposure.find(x=>x.id===ally.capturedBy)||{id:ally.capturedBy,c:views.get(ally.capturedBy),power:damage}:stable?retained:strongest;
   if(chosen?.c)requests.push({ally,targetId:chosen.id,contact:chosen.c,deadline,urgency:(ally.capturedBy?8:0)+(protectedIds.has(ally.id)?4:0)+(empty?3:draining?2:0)+(1-health)*3+exposure.length+(bladeDeadline<1.5?4:0)});
  }
  // A full-health carrier can absorb pressure much longer than an exhausted MS.
  // Allocate by loss risk per available response time, rather than enemy count alone.
  const requestValue=r=>r.urgency/Math.max(2,r.deadline)*(allies.some(u=>u.commandAssignment?.source==='ai'&&u.commandAssignment?.type==='escort'&&u.commandAssignment.allyId===r.ally.id)?1.3:1);
  requests.sort((a,z)=>requestValue(z)-requestValue(a)||a.ally.id.localeCompare(z.ally.id));
  const assigned=new Map(),used=new Set();
  for(const u of allies){const p=state.player.get(u.id);if(p&&!validPlayer(b,u,p)){state.player.delete(u.id);u.commandAssignment=null;b.emit('command-complete',u.id,u.machine.name+' 玩家指令完成或目标失效，交回AI',{command:p.type});}else if(p){assigned.set(u.id,p);used.add(u.id);}}
  if(b.rules.commandEnabled!==false)for(const request of requests){
   let best=null,bid=-Infinity;
   for(const u of allies){if(used.has(u.id)||u.pilotState.strategies?.['fixated-pursuit']>0||u===request.ally||u.entityType==='ship'||u.controller==='simple'||navigationGoal(b,u)&&u.controller!=='escort'||withdrawalOption(b,u)||u.capturedBy||u.structure/u.machine.sim.structure<.5||u.components.engine<.4||!(u.pilotState.strategies?.['cover-ally']>0))continue;
    const c=fresh(b,u,request.targetId);if(!c)continue;
    const reach=range(u),distance=length(sub(c.position,u.position)),axis=norm(sub(c.position,u.position)),engine=u.components.engine||0;
    if(!reach||engine<.1||u.energy<u.machine.sim.energyCapacity*.08)continue;
    const accel=u.machine.sim.thrustN/u.machine.sim.massKg*10*engine,away=Math.max(0,-dot(u.velocity,axis));
    const arrival=Math.max(0,distance-reach*.85)/Math.max(1,u.machine.sim.maxSpeedMps*.85)+away/Math.max(1,accel)+Math.acos(clamp(dot(u.forward,axis),-1,1))/Math.max(.1,u.machine.sim.turnRateDeg*Math.PI/180);
    if(arrival>request.deadline)continue;
    const ownGoal=b.unitById.get(b.mission?.priorities?.[side]?.primaryEntityId),goalView=ownGoal&&fresh(b,u,ownGoal.id),leaving=goalView&&dot(goalView.velocity,norm(sub(goalView.position,request.ally.position)))>Math.max(30,ownGoal.machine.sim.maxSpeedMps*.15);
    const worthwhile=goalView&&length(sub(goalView.position,u.position))<=reach;
    const opportunity=u.controller==='objective'&&ownGoal?.alive&&worthwhile&&!leaving?6:0,stay=u.commandAssignment?.allyId===request.ally.id?1.5:0;
    const interruption=engagementOpportunity(b,u,request.targetId);
     const selfRisk=u.controller==='survive'?(1-u.structure/u.machine.sim.structure)*8+(u.pendingReaction?5:0):0;
     const value=perceivedValue(b,u,'support:'+request.allyId,request.urgency*u.pilotState.strategies['cover-ally']-arrival*.7-opportunity-interruption-selfRisk+stay,{step:1,relative:.06});
    if(value>bid&&value>2){best=u;bid=value;}
   }
   if(best){assigned.set(best.id,{source:'ai',type:'escort',targetId:request.targetId,allyId:request.ally.id,reason:'比较任务收益、集中火力和真实援护可达时间',deadline:request.deadline,urgency:request.urgency});used.add(best.id);}
  }
  const allocations=new Map();
  for(const u of allies){let order=assigned.get(u.id);
   if(!order&&b.rules.commandEnabled!==false){
    const goal=navigationGoal(b,u),withdraw=withdrawalOption(b,u),guard=escortObjective(b,u),screen=guard&&screeningTarget(b,u,guard,views,allocations),fixated=pursuitTarget(b,u,views),primary=b.unitById.get(b.mission?.priorities?.[side]?.primaryEntityId);
    const hurt=u.structure/u.machine.sim.structure<.5||u.components.engine<.4;
    const danger=u.pendingReaction||u.missileThreat||b.t-(u.observedHeavyAt??-100)<1.5;
    const priorRefuge=u.commandAssignment?.source==='ai'&&u.commandAssignment.type==='withdraw'&&allies.find(a=>a.id===u.commandAssignment.refugeId);
    // A gap between shots does not complete a damaged unit's trip to cover.
    const stillTravelling=priorRefuge&&length(sub(priorRefuge.position,u.position))>Math.max(400,range(priorRefuge)*.25);
    const refuge=!(u.pilotState.strategies?.['fixated-pursuit']>0)&&hurt&&(danger||stillTravelling)&&u.entityType!=='ship'&&(priorRefuge||allies.filter(a=>a!==u&&a.entityType==='ship').sort((a,z)=>length(sub(a.position,u.position))-length(sub(z.position,u.position)))[0]);
    if(withdraw){u.withdrawing=true;order={source:'ai',type:'withdraw',point:[...withdraw.point],reason:'损伤或威胁超过可承担范围'};}
    else if(refuge)order={source:'ai',type:'withdraw',refugeId:refuge.id,point:add(refuge.position,mul(refuge.velocity,3)),reason:'本机受损无法继续承担前线任务，向友军防护区域重整'};
    else if(fixated)order={source:'ai',type:'attack',targetId:fixated.id,reason:'执着追击已识别对手，接受更高风险；防御反应与资源限制保留'};
     else if(screen)order={source:'ai',type:'escort',targetId:screen.id,allyId:guard.id,screening:true,urgency:4,reason:'在撤退舰与已观察的来袭MS之间建立移动拦截屏障'};
     else if(guard&&navigationGoal(b,guard)&&length(sub(guard.position,navigationGoal(b,guard).point))>navigationGoal(b,guard).radiusM)order={source:'ai',type:'escort',targetId:null,allyId:guard.id,screening:true,urgency:2,reason:'保持撤离舰后方掩护位置，等待可见威胁'};
     else if(goal)order={source:'ai',type:'withdraw',point:[...goal.point],reason:'继续完成任务航路'};
    else{let target=null,value=-Infinity;for(const[id,c]of views){if(!fresh(b,u,id))continue;const foe=b.unitById.get(id);if(!mayEngage(b,u,foe))continue;const d=length(sub(c.position,u.position));
     const goalValue=id===primary?.id?(b.mission.priorities[side].primaryValue||8)*(u.controller==='objective'?1:.3):0;
     const score=perceivedValue(b,u,'command-target:'+id,goalValue+(id===u.targetId?2:0)-d/5000-(allocations.get(id)||0)*4+(foe.entityType!=='ship'?2:0),{step:1,relative:.06});
     if(score>value){target=foe;value=score;}}
     order={source:'ai',type:u.controller==='screen'?'screen':'attack',targetId:target?.id||null,reason:'按任务和已知目标分摊作战压力'};
     if(target)allocations.set(target.id,(allocations.get(target.id)||0)+1);
    }
   }
   if(order?.screening&&order.targetId)allocations.set(order.targetId,(allocations.get(order.targetId)||0)+1);
    if(order)setAssignment(b,u,order);
  }
  state.sides.set(side,{t:b.t,requests:requests.length,contacts:views.size});
 }
}

export function commandTargetBonus(b,u,target){
 const c=u.commandAssignment;if(!c)return 0;
 if(c.source==='player'&&['attack','screen'].includes(c.type))return target.id===c.targetId?1e6:-1e6;
 if(c.source==='player'&&c.type==='escort'){
  const ally=b.unitById.get(c.targetId),seen=fresh(b,u,target.id);if(!ally||!seen)return 0;
  return Math.max(0,10000-length(sub(seen.position,ally.position)))/500;
 }
 if(c.source==='ai'&&u.fixatedTargetId===target.id&&u.pilotState.strategies?.['fixated-pursuit']>0)return 60;
 return target.id===c.targetId&&c.type==='escort'?25+Math.min(70,(c.urgency||0)*6):0;
}

// Commands shape locomotion, not reaction eligibility, aim or damage rules.
export function commandCourse(b,u,target){
 const c=u.commandAssignment;if(!live(u)||u.capturedBy||b.t<u.evadeUntil||u.missileThreat)return null;
 // AI may temporarily assign an escort a counter-target. The mission anchor
 // still bounds pursuit, including when that contact later disappears.
 if(c?.source!=='player'&&u.controller==='escort'){
  const ally=escortObjective(b,u),leash=Math.max(3500,range(u)*1.8+(ally?.machine.sim.radiusM||0));
  if(ally?.alive&&length(sub(u.position,ally.position))>leash){
   const seen=target?.alive?fresh(b,u,target.id):null,delta=seen&&sub(seen.position,u.position),near=delta&&length(delta)<800;
   if(!near&&!u.swing&&!u.pendingReaction)return escortScreenCourse(b,u,ally,null);
  }
 }
 if(!c)return null;
 if(c.source==='ai'&&(c.type!=='escort'||!c.screening)&&(c.type!=='withdraw'||u.withdrawing||navigationGoal(b,u)))return null;const speed=u.machine.sim.maxSpeedMps;
 if(c.type==='hold'||c.type==='withdraw'){
  const delta=sub(c.point,u.position),d=length(delta),wanted=d<30?[0,0,0]:mul(norm(delta),Math.min(speed*.9,d*.8));
  return {order:c.type==='hold'?'commandHold':'commandWithdraw',heading:length(sub(wanted,u.velocity))>30?norm(sub(wanted,u.velocity)):u.forward,desired:wanted,flightMode:'normal'};
 }
 if(c.type==='escort'){
  const ally=b.unitById.get(c.source==='ai'?c.allyId:c.targetId);if(!ally?.alive)return null;
  if(c.source==='ai'){
   const seen=target?.alive&&target!==u?fresh(b,u,target.id):null;
   if(seen){const blade=b.bestBlade(u,target),enemyBlade=target.weapons.find(w=>!w.disabled&&!w.formDisabled&&w.definition.kind==='melee'),delta=sub(seen.position,u.position),closing=Math.max(0,-dot(sub(seen.velocity,u.velocity),norm(delta)));
    if((blade||enemyBlade)&&length(delta)<=Math.max(blade?.definition.sim.rangeM||0,enemyBlade?.definition.sim.rangeM||0)+closing*1.5+180)return null;
   }
   return escortScreenCourse(b,u,ally,seen);
  }
  const goal=navigationGoal(b,ally),rear=goal?mul(norm(sub(goal.point,ally.position)),-1):mul(ally.forward,-1),station=add(ally.position,mul(rear,Math.max(700,range(u)*.45))),delta=sub(station,u.position),d=length(delta);
  const reach=Math.max(600,range(u)*.5);if(d>reach)return {order:'supportApproach',heading:norm(delta),desired:add(ally.velocity,mul(norm(delta),Math.min(speed*.9,(d-reach)*.8))),flightMode:'normal'};
 }
 if(c.type==='screen'&&target?.id===c.targetId){const seen=fresh(b,u,target.id);if(!seen)return null;const delta=sub(seen.position,u.position),axis=norm(delta),stand=Math.max(500,range(u)*.75),radial=clamp((length(delta)-stand)*.6,-speed*.7,speed*.8);return {order:'screen',heading:axis,desired:add(mul(seen.velocity,.6),mul(axis,radial)),flightMode:'normal'};}
 return null;
}

// A defensive detour retains the destination, including a player route or an AI
// refuge not represented by a mission withdrawal condition.
export function commandRouteGoal(b,u){
 const c=u.commandAssignment;if(c?.type==='withdraw'&&c.point)return {point:c.point,radiusM:80};
 const ally=escortObjective(b,u),goal=ally&&navigationGoal(b,ally);
 if(u.controller==='escort'&&ally?.alive&&(!goal||length(sub(ally.position,goal.point))>goal.radiusM)){
  const rear=goal?mul(norm(sub(goal.point,ally.position)),-1):mul(ally.forward,-1);
  return {point:add(ally.position,mul(rear,Math.max(700,range(u)*.6))),radiusM:600};
 }
 return navigationGoal(b,u);
}
