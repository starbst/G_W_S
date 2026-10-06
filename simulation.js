import {isAreaShot,fuseCrossing,detonateArea,evadeBeamContact,beamGuard} from './projectile-policy.js';
import {meleeEngagementWindow} from './melee-exchange.js';
import {updateAttackAim} from './fire-control.js';
import {mayEngage} from './target-policy.js';
import {groundLimited,groundHandling,motionSpeedLimit,atGround} from './locomotion.js';
import {damageShipCollision} from './ship-maneuvers.js';
import {captureFireHeld} from './capture-coordination.js';
import {hardwareBusy} from './weapon-hardware.js';
import {refreshReactions, scheduleReaction, releaseObservedCue, clearReactions, coastClearsThreat} from './defense-plans.js';
import {grappleImpact} from './grapples.js';
import {attenuateBeam} from './countermeasures.js';
import {isLightAutomatic,weaponDamageScale,isTacticalThreat,weaponVisual} from './weapon-semantics.js';
import {bladeTrade} from './pilot-strategies.js';
import {hasUnlimitedEnergy,affordableManeuver,maneuverEnergyCost,weaponEnergyCost,pilotControlAuthority,emergencyPulseSeconds,emergencyEnergyReserve} from './energy-policy.js';
export {weaponEnergyCost} from './energy-policy.js';
import {shipWeaponWindow,shipWeaponRole,shipShotCue,shipMainEnergyCost} from './ship-weapons.js';
import {disablesOnLethal} from './pilot-skills.js';
import {captureObjective} from './missions.js';
import {weaponTarget} from './weapon-allocation.js';
import {weaponUtility} from './weapon-choice.js';
import {applyPilotOptions,initializeSkills} from './pilot-skills.js';
import {initializeSeed,seedDefense,predictedProtectionCost,mountedRemote,concealedFrom,trySeparate,bestBlade,remoteTarget,launchCore,coreHit} from './seed-systems.js';
import {decideV5} from './tactics.js';
import {projectileContact,globalPoint,hullEntry} from './collision.js';
import {initV5,stepV5,prepareMaximumOutput,resolveBladeV5} from './battle-runtime.js';
import {componentImpact} from './entities.js';
import {environmentAt,environmentModifiers,lineVisible,smokeAtSurface,canObserve,damageObstacle,meleeAltitudeReachable} from './battlefield.js';
import { add, sub, mul, dot, length, norm, cross, clamp, rotateToward, segmentSphere, seededRandom, bodyBasis, arcSolution, rotateBody, limitBodyVector, interceptPoint } from './math.js';
import { validateScenario } from './domain.js';
import { DEFAULT_TACTICS } from './pilot-profiles.js';

const DEG=Math.PI/180;
const GUIDED=new Set(['missile','funnel-missile']);
const ORDER_NAMES={selfDestruct:"保持接触 · 自爆准备",bladeCover:"侧向近战援护",terminalIntercept:"危急舰体截击",supportApproach:"援护截击 · 进入有效射程",commandHold:"玩家指挥 · 保持位置",commandWithdraw:"指挥航路 · 撤离重整",capturePosition:"捕获占位 · 侧向匹配航速",shieldGuard:"惯性举盾 · 面向重攻击",captured:"被抓取 · 无法推进",captureTow:"保持抓取 · 携目标归舰",captureApproach:"匹配航速 · 接近抓取",missionTransit:'突破交战 · 抵达任务航点',trailingFire:'惯性回身射击',bladeEvade:'劣势避刀横切',pursuitBoost:'回身射后前向加速',disabled:'失能 · 无法移动与攻击',combatRecover:'受压保速回稳',energyEscape:'保留能源 · 离开射线',crossfireExit:'离开交叉火力',cruise:'航路机动', bodyguard:'射线截击 · 挡护友舰','ship-evasion':'舰体倾转避炮',suppress:'反浮游 · 集中压制',screen:'牵制护航单位',bypass:'绕开拦截向任务目标突入','funnel-control':'远程浮游炮控制',aim:'保持朝向稳瞄',escape:'保速脱离咬尾',recover:'恢复姿态稳定',approach:'斜向接敌',flank:'抢占侧翼',counter:'利用空档反击',extend:'脱离后重整',acquire:'转向重新搜索',evade:'定向短促急闪',melee:'近身攻击',cool:'保留惯性 · 回气重整',missileBreak:'导弹威胁 · 加速横切脱离'};
export function rangeFactor(w,d){return 1-(1-w.minimumDamageFactor)*clamp((d-w.effectiveRangeM)/Math.max(1,w.rangeM-w.effectiveRangeM));}
Object.assign(ORDER_NAMES,{closeAngle:'远射失利 · 斜切逼近刀战',rangeReset:'近战失利 · 拉开重建射线',tailBoost:'主动加速 · 拉开追尾',tailJink:'主动横切 · 改变攻击轴线',tailRoll:'滚动机动 · 脱离追尾',drift:'预判转向 · 惯性漂移抢射',boost:'射后转向 · 前推加速',disengage:'劣势脱离 · 寻找新窗口'});
export function aimDistanceFactor(w,d){const best=Math.max(1,w.preferredRangeM);return clamp(d<best?d/best:1-(d-best)/Math.max(1,w.rangeM-best),.12,1);}
export function fireControlError(velocity,acceleration,direction,distance,pilot,track){
 const transverse=length(cross(velocity,norm(direction))),maneuver=length(acceleration);
 const lag=pilot.reactionS*(.5+1-pilot.tracking)+(1-track)*.22;
 return (transverse*lag*.08+maneuver*lag*lag*.35)/Math.max(100,distance);
}
// Total energy includes the charged buffer. Recovery only transfers existing energy into it.
export function energyTotalCapacity(u){return u.machine.sim.totalEnergy??u.machine.sim.energyCapacity*12;}
export function energyRechargeRate(u){
 const reservoir=hasUnlimitedEnergy(u)?1:.45+.55*Math.sqrt(clamp((u.totalEnergy??energyTotalCapacity(u))/energyTotalCapacity(u)));
 const buffer=.85+.15*Math.sqrt(clamp(u.energy/u.machine.sim.energyCapacity));
 // Recent high output temporarily slows transfer into the buffer; this is not another resource bar.
 const power=u.machine.powerSystem?(u.components.power??1):u.components.engine;
  return u.machine.sim.energyRegen*(u.machine.sim.energyTransferMultiplier??(u.entityType==='ship'?1:2.25))*power*reservoir*buffer/(1+.35*(u.rechargeLoad||0));
}
export function rechargeEnergy(u,dt){const m=u.machine.sim,room=hasUnlimitedEnergy(u)?Infinity:Math.max(0,(u.totalEnergy??0)-u.energy);u.rechargeLoad=(u.rechargeLoad||0)*Math.exp(-dt/.25);u.energy+=Math.min(Math.max(0,m.energyCapacity-u.energy),room,energyRechargeRate(u)*dt);}
export function spendEnergy(u,requested){const total=u.totalEnergy??energyTotalCapacity(u),unlimited=hasUnlimitedEnergy(u),spent=Math.min(Math.max(0,requested),Math.max(0,u.energy),unlimited?Infinity:Math.max(0,total));u.energy=Math.max(0,u.energy-spent);if(!unlimited)u.totalEnergy=Math.max(0,total-spent);u.rechargeLoad=Math.min(2,(u.rechargeLoad||0)+spent/u.machine.sim.energyCapacity*1.5);return spent;}
export function terrainBrakeAcceleration(u){const m=u.machine.sim,p=u.pilotState.sim,power=clamp(u.energy/12);return m.thrustN/m.massKg*16*pilotControlAuthority(u)*u.components.engine*power*power*.65*u.machine.mobility.accel.up;}
export function stabilityRecoveryRate(u,time=Infinity){
 const p=u.pilotState.sim,c=u.pilotState.tactics;
 return (c.maneuverRecovery??2.6)*(.65+.35*p.composure)*(time<(u.recoveryDebuffUntil||0)?(c.impactRecoveryFactor??.16):1);
}
export function driftOpportunity(u,relative,delta,w,time=0){
 const c=u.pilotState.tactics,p=u.pilotState.sim,m=u.machine.sim,distance=length(delta),toward=norm(delta);
 const recovery=stabilityRecoveryRate(u,time),authority=pilotControlAuthority(u)*u.components.engine;
 const rate=Math.min(m.turnRateDeg,u.machine.mobility.pitchRateDeg)*DEG*authority;
 const angle=Math.acos(clamp(dot(u.forward,toward),-1,1)),leadTime=angle/(rate*c.turnMultiplier)+w.windupS;
 const heading=norm(add(delta,mul(relative,leadTime+distance/w.projectileSpeedMps)));
 const turnAngle=Math.acos(clamp(dot(u.forward,heading),-1,1));
 const burst=w.burst>1||w.cooldownS<.5,threshold=burst?c.burstStability:c.singleStability;
 const readyTime=mult=>{const turn=turnAngle/(rate*mult),penalty=clamp((rate*mult-.35)/1.8,.02,1);const stable=clamp(u.stability+turn*recovery*.12-turnAngle*(1.35-.45*p.maneuver)*c.turnStabilityCost*penalty);const recover=stabilityRecoveryRate({...u,stability:stable},time+turn);return turn+Math.max(burst?.04:.12,(threshold-stable)/recover)+w.windupS;};
 // Scan the same predicted trajectory against the frozen aiming direction for both alternatives.
 let window=c.driftWindowS;
 for(let t=leadTime;t<=c.driftWindowS;t+=.05){const future=add(delta,mul(relative,t));if(!arcSolution(heading,future,w).inside||length(future)>w.rangeM||length(future)<w.minRangeM){window=t;break;}}
 const fastReady=readyTime(c.turnMultiplier),normalReady=readyTime(1);
 return {heading,window,fastReady,normalReady,gain:normalReady-fastReady,usable:window-fastReady};
}
// All timing uses simulation seconds. No browser, model or network access.
export class Battle {
 constructor(catalog,scenario,seed){
  this.scenario=validateScenario(scenario,catalog);this.catalog=structuredClone({rules:catalog.rules,environments:catalog.environments,battlefields:catalog.battlefields,missions:catalog.missions});this.rules=this.catalog.rules;if(scenario.maxSeconds!==undefined)this.rules.maxSeconds=scenario.maxSeconds;
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('无效随机种子');
  scenario=this.scenario;this.seed=seed;this.random=seededRandom(seed);this.t=0;this.tick=0;this.sequence=0;this.events=[];this.effects=[];this.projectiles=[];this.result=null;
  this.environment=structuredClone(catalog.environments.find(x=>x.id===scenario.environmentId));
  const sidePlans=side=>scenario[side+'Forces'].flatMap((group,gi)=>Array.from({length:group.count},(_,i)=>({side,group,gi,i})));
  const sides=['a','b',...(scenario.cForces?['c']:[])],sideLists=sides.map(sidePlans),plans=[];for(let i=0;i<Math.max(...sideLists.map(x=>x.length));i++)for(const list of sideLists)if(list[i])plans.push(list[i]);
  this.units=plans.map(({side,group,gi,i},index)=>{
   const machine=structuredClone(catalog.machines.find(x=>x.id===group.machineId));
   const pilot=catalog.pilots.find(x=>x.id===group.pilotId)||{id:'unmanned',name:'无驾驶员',states:[{id:'automatic',name:'自动控制',sim:{reactionS:.2,aim:.5,tracking:.5,maneuver:.5,composure:1}}]},pilotState=applyPilotOptions(pilot.states.find(x=>x.id===group.stateId),group.pilotOptions);
   pilotState.tactics={...DEFAULT_TACTICS,...pilotState.tactics};pilotState.traits??={};
   const sign=side==='a'?1:-1,d=scenario.distanceM,h=scenario.altitudeM;
   const learned={}; // Historical experience is retained in books but ignored.
   const experience=Object.fromEntries(['aim','flank','melee','escape'].map(k=>[k,clamp((pilotState.weights?.[k]||0)+(learned[k]||0),-2,2)]));
   const id=side+'-'+gi+'-'+i,deployment=scenario.deployments?.find(x=>x.id===id),rank=plans.slice(0,index).filter(x=>x.side===side).length,row=Math.floor(rank/3),column=rank%3-1;
   const onLand=this.environment.medium==='ground',position=deployment?[deployment.x,deployment.y,deployment.z]:[-sign*d/2+row*sign*110,h+(onLand?0:Math.abs(column)*35),column*170+gi*280];if(onLand)position[1]=Math.max(machine.sim.radiusM*.5,position[1]);
   return {id,side,groupIndex:gi,pilotId:pilot.id,weights:{aim:experience.aim||0,flank:experience.flank||0,melee:experience.melee||0,escape:experience.escape||0},learning:{aim:0,flank:0,melee:0,escape:0},stableTime:0,machine,pilot:pilot.name,pilotState,position,velocity:[sign*100,0,sign*30],forward:[sign,0,0],desiredFacing:[sign,0,0],desired:[sign*100,0,sign*30],
    visible:false,detectionLocked:false,evasionMode:'reactive',nextThreatChoice:0,threatTargeted:false,stability:1,evadeStarted:0,evadeAxis:[sign,0,0],observedCooldownUntil:0,acceleration:[0,0,0],armor:machine.sim.armor,structure:machine.sim.structure,energy:machine.sim.energyCapacity,totalEnergy:machine.sim.totalEnergy??machine.sim.energyCapacity*12,components:{engine:1,sensor:1,weapon:1},track:0,locked:false,alive:true,
    weapons:machine.weapons.map(w=>({definition:w,ammo:w.sim.ammo,readyAt:0,shots:0,hits:0,attack:null,salvo:null})),slotSelected:Object.fromEntries(machine.weapons.map(w=>[w.slot||'slot1',machine.weapons.find(x=>(x.slot||'slot1')===(w.slot||'slot1')).id])),slotReadyAt:{},selected:machine.weapons[0]?.id||'unarmed',attack:null,
    nextDecision:0,evadeUntil:0,counterUntil:0,guardUntil:0,pendingReaction:null,escapeDirection:null,orbit:1,order:'approach',shots:0,hits:0,damage:0,
    observations:[],fireSolution:null,lastSeen:null,lastSeenAt:-100,noticeAt:{},outsideEnemyArc:false,arcEvaluated:false,threatLabel:'无攻击警报'};
  });
  initV5(this);
  for(const u of this.units){const initial=scenario[u.side+'Forces'][u.groupIndex].initialState;if(initial?.loadoutId)u.machine.loadoutSystem.initialId=initial.loadoutId;initializeSkills(this,u,catalog.skillTemplates||[]);u.initialFormId=initial?.formId;initializeSeed(u);if(initial){u.structure*=initial.structureFraction??1;u.armor*=initial.armorFraction??1;if(!hasUnlimitedEnergy(u))u.totalEnergy*=initial.totalEnergyFraction??1;u.energy=Math.min(hasUnlimitedEnergy(u)?u.machine.sim.energyCapacity:u.totalEnergy,u.energy*(initial.energyFraction??1));u.stability=u.entityType==='ship'?1:initial.stability??1;if(initial.velocity)u.velocity=[...initial.velocity];if(initial.forward)u.forward=norm(initial.forward);for(const w of u.weapons)if(initial.weaponAmmo?.[w.definition.id]!==undefined)w.ammo=initial.weaponAmmo[w.definition.id];}}
  for(const u of this.units)Object.defineProperty(u,'attack',{enumerable:true,configurable:true,get:()=>this.state(u).attack,set:value=>{this.state(u).attack=value;}});
  this.emit('start',null,'双方编队展开：'+this.units.filter(u=>u.side==='a').length+' 对 '+this.units.filter(u=>u.side==='b').length+'，整机武装与本地火控开始交战。');
 }
 spend(u,cost){return spendEnergy(u,cost);}
 remoteTarget(id){return remoteTarget(this,id);}
 bestBlade(u,target=this.targetFor(u)){return bestBlade(this,u,target);}
 enemies(u){
  if(this.scenario.cForces)return this.units.filter(x=>x.side!==u.side&&x.alive&&!x.docked&&(!x.capturedBy||this.unitById.get(x.capturedBy)?.side!==u.side));
  const basis=this.spatial.sides,epoch=this.captureEpoch||0;
  if(this.enemyCache?.basis!==basis||this.enemyCache.epoch!==epoch)this.enemyCache={basis,epoch,sides:new Map(),captured:this.units.some(x=>x.capturedBy)};
  const cache=this.enemyCache;if(cache.sides.has(u.side))return cache.sides.get(u.side);
  const foes=!this.scenario.cForces?basis[u.side==='a'?'b':'a']||[]:this.units.filter(x=>x.side!==u.side&&x.alive&&!x.docked);
  const list=cache.captured?foes.filter(x=>!x.capturedBy||this.unitById.get(x.capturedBy)?.side!==u.side):foes;cache.sides.set(u.side,list);return list;
 }
 targetFor(u){return this.unitById.get(u.targetId)||this.enemies(u)[0]||u;}
 emit(type,actor,text,extra={}){const e={id:++this.sequence,t:this.t,type,actor,text,...extra};this.events.push(e);return e;}
 notice(u,text,tone='info',key=text,interval=1.5){
  if(this.t-(u.noticeAt[key]??-100)<interval)return;u.noticeAt[key]=this.t;
  this.effects.push({type:'notice',t:this.t,life:tone==='damage'?1.1:.7,position:[...u.position],actor:u.id,text,tone});
 }
 gaussian(){return Math.sqrt(-2*Math.log(Math.max(1e-10,this.random())))*Math.cos(2*Math.PI*this.random());}
 adapt(u){u.nextDecision=this.t;} // No persistent learning or template-weight mutation.
 exchangeState(u,targetId=u.targetId){
  if(!u.exchange||u.exchange.targetId!==targetId)u.exchange={targetId,t:this.t,rangedMisses:0,rangedGain:0,rangedLoss:0,meleeGain:0,meleeLoss:0};
  const x=u.exchange,decay=Math.exp(-Math.max(0,this.t-x.t)/u.pilotState.tactics.exchangeMemoryS);
  for(const k of ['rangedMisses','rangedGain','rangedLoss','meleeGain','meleeLoss'])x[k]*=decay;
  x.t=this.t;return x;
 }
 recordExchange(u,targetId,kind,result,amount=0,weapon=null){
  // Heavy real ammunition is an engagement outcome too. Harmless head tracers
  // must not force a tactical switch or overwhelm this bounded memory.
  if(targetId!==u.targetId||weapon&&isLightAutomatic(weapon))return;
  const x=this.exchangeState(u,targetId),melee=kind==='melee';
  if(result==='miss'&&!melee)x.rangedMisses=Math.min(8,x.rangedMisses+(kind==='ballistic'?.25:GUIDED.has(kind)?.4:1));
  if(result==='gain'||result==='loss')x[(melee?'melee':'ranged')+(result==='gain'?'Gain':'Loss')]+=Math.min(1,amount/u.machine.sim.structure);
  u.nextDecision=this.t;
 }

 cancelAttacks(u){for(const s of u.weapons){s.attack=null;s.salvo=null;}}
 selectWeapon(u,state,reason){
  const slot=state.definition.slot||'slot1',old=u.slotSelected[slot];
  if(old===state.definition.id){if(!isLightAutomatic(state.definition)||isLightAutomatic(this.state(u).definition))u.selected=state.definition.id;return state;}
  const prev=this.state(u,old);prev.attack=null;prev.salvo=null;
  u.slotSelected[slot]=state.definition.id;u.slotReadyAt[slot]=this.t+(state.definition.sim.switchS??.18);
  if(!isLightAutomatic(state.definition)||isLightAutomatic(this.state(u).definition))u.selected=state.definition.id;
  u.weaponReason=reason;return state;
 }

 // An offensive pulse uses the same bounded thrust/energy envelope as a dodge.
 // Predict only fresh observed motion; movement and swept blade contact remain authoritative.
 meleeDashPlan(u,target,blade=this.bestBlade(u,target)){
  const contact=u.contacts.get(target?.id),c=u.pilotState.tactics,m=u.machine.sim;
  if(!target?.alive||!blade||!['ms','ma'].includes(u.entityType)||!u.alive||u.docked||u.mountId||u.capturedBy||u.grappleTarget||u.captureIntent||u.stealthActive||!u.visible||!contact||this.t-contact.observedAt>.4||this.t<u.evadeUntil||this.t<(u.meleeBreakUntil||0)||this.t<(u.separationUntil||0)||u.stability<.25||(u.pilotState.strategies?.['melee-dash']??1)<=0)return null;
  if(u.breakaway&&this.t<u.breakaway.until||u.pendingReaction||u.missileThreat||u.weapons.some(w=>w.definition.kind==='melee'&&(w.attack||w.salvo))||u.swing)return null;
  if(u.commandAssignment?.source==='player'&&['hold','withdraw','move'].includes(u.commandAssignment.type)||!mayEngage(this,u,target))return null;
  const w=blade.definition,s=w.sim,point=add(contact.position,mul(contact.velocity,Math.max(0,this.t-contact.observedAt))),delta=sub(point,u.position),distance=length(delta),reach=s.rangeM+(target.entityType==='ship'?target.machine.sim.radiusM:0),closing=dot(sub(u.velocity,contact.velocity),norm(delta));
  if(distance<=reach+12||distance>reach+motionSpeedLimit(this,u,true)*c.meleeDashLookaheadS||dot(u.forward,norm(delta))<.7||!this.available(u,blade)||this.meleeFriendlyBlocked(u,target,w)||!meleeAltitudeReachable(this,u,contact,reach)||!this.canSee(u.position,point))return null;
  if(s.environments&&(!s.environments.includes(environmentAt(this,u.position).medium)||!s.environments.includes(environmentAt(this,point).medium)))return null;
  const trade=bladeTrade(this,u,target,Math.max(0,closing));if(trade.unsafe)return null;
  const pulse=c.meleeDashPulseS,slot=w.slot||'slot1',prepare=Math.max(0,blade.readyAt-this.t,(u.slotReadyAt[slot]||0)-this.t,u.slotSelected[slot]===w.id?0:s.switchS??.18)+s.windupS;
  const bladeCost=weaponEnergyCost(w),reserve=Math.max(m.dodgeEnergyCost??5,m.energyCapacity*c.energyReserveFraction*.5),budgetUnit={...u,energy:Math.max(0,u.energy-bladeCost-reserve)},budget=affordableManeuver(budgetUnit,c.dodgeThrustMultiplier,pulse,this.environment.medium,true);
  if(budget.multiplier<=10||prepare>c.meleeDashLookaheadS)return null;
  const relative=sub(u.velocity,contact.velocity),lateral=sub(relative,mul(norm(delta),dot(relative,norm(delta)))),axis=norm(add(delta,mul(lateral,-Math.min(.35,c.meleeDashLookaheadS*.5)))),plan={target:target.id,style:'boost',meleeDash:true,translationAxis:axis,axis,heading:norm(delta),started:this.t,duration:pulse,until:this.t+pulse,thrustMultiplier:budget.multiplier};
  if(dot(axis,norm(delta))<.65)return null;
  const forecast=this.forecastBreakaway(u,plan,c.meleeDashLookaheadS),trace=forecast.trajectory;
  let contactIn=null;for(let i=1;i<trace.length;i++){const previous=trace[i-1],next=trace[i],a=sub(previous.position,add(point,mul(contact.velocity,previous.at))),z=sub(next.position,add(point,mul(contact.velocity,next.at))),hit=segmentSphere(a,z,reach*.92);if(hit){const step=sub(z,a),aa=dot(step,step),bb=2*dot(a,step),cc=dot(a,a)-(reach*.92)**2,entry=cc<=0?0:clamp((-bb-Math.sqrt(Math.max(0,bb*bb-4*aa*cc)))/Math.max(1e-9,2*aa));contactIn=previous.at+(next.at-previous.at)*entry;break;}}
  if(contactIn===null||contactIn<prepare-this.rules.stepSeconds||closing>30&&(distance-reach)/closing<Math.max(prepare+.1,pulse*.6))return null;
  return {...plan,blade,contactIn,cost:budget.cost,startup:budget.startup,expectedDistance:distance};
 }
 serviceMeleeDash(u,target){
  const active=u.breakaway?.meleeDash&&this.t<u.breakaway.until,allowed=['melee','closeAngle','bladeCover'].includes(u.order)&&target?.alive&&u.targetId===target.id;
  if(active){if(!allowed||this.t<u.evadeUntil||u.pendingReaction||u.missileThreat||!u.visible)u.breakaway=null;return false;}
  if(!allowed||u.breakaway&&this.t<u.breakaway.until)return false;
  const plan=this.meleeDashPlan(u,target);if(!plan)return false;
  this.selectWeapon(u,plan.blade,'短促冲刺 · 提前拔刀');
  if(this.t<(u.slotReadyAt[plan.blade.definition.slot||'slot1']||0)){u.nextDecision=Math.min(u.nextDecision,this.t+this.rules.stepSeconds);return false;}
  this.spend(u,plan.startup);u.breakaway=plan;u.stability=clamp(u.stability-.04);u.stableTime=0;u.flightMode='normal';u.desiredFacing=plan.heading;u.nextDecision=Math.min(u.nextDecision,this.t+this.rules.stepSeconds);
  this.emit('melee-dash',u.id,u.machine.name+' 短促推进冲刺，预判接触并拔刀',{target:target.id,weapon:plan.blade.definition.id,pulseS:plan.duration,contactIn:plan.contactIn,thrustMultiplier:plan.thrustMultiplier,startupEnergy:plan.startup});
  this.notice(u,'冲刺接刀','warning','melee-dash',.6);this.effects.push({type:'dodge-jet',t:this.t,life:plan.duration+.12,position:[...u.position],direction:mul(plan.axis,-1),actor:u.id});
  if(this.canSee(target.position,u.position))this.warn(target,u,plan.blade.definition,'dash',norm(sub(target.position,u.position)),{position:[...u.position],tti:plan.contactIn});
  return true;
 }
 meleeEncounter(u,target){
  const blade=this.bestBlade(u,target);if(!blade||!u.visible||!u.lastSeen||u.stability<.2||this.t<(u.meleeBreakUntil||0))return null;
  const delta=sub(this.observed(u,target),u.position),relative=sub(u.lastSeen.velocity,u.velocity),distance=length(delta);
  const time=clamp(-dot(delta,relative)/Math.max(1,dot(relative,relative)),0,u.pilotState.tactics.meleeLookaheadS);
  const miss=length(add(delta,mul(relative,time)));
  const imminent=distance<=blade.definition.sim.rangeM+40||time>0&&time<=u.pilotState.tactics.meleeLookaheadS&&miss<blade.definition.sim.rangeM+60;
  return {blade,distance,time,miss,imminent};
 }
 bladeReserve(u,target,encounter=this.meleeEncounter(u,target)){
  if(u.breakaway?.meleeDash&&u.breakaway.target===target.id&&this.t<u.breakaway.until)return true;
  if(u.bladeSupportTargetId===target.id&&this.t<(u.bladeSupportUntil||0))return true;
  if(!encounter)return false;const s=encounter.blade.definition.sim,delta=sub(this.observed(u,target),u.position),closing=Math.max(0,dot(sub(u.velocity,u.lastSeen?.velocity||target.velocity),norm(delta))),contact=closing>30?(length(delta)-s.rangeM)/closing:Infinity;
  const current=this.state(u,u.slotSelected[encounter.blade.definition.slot||'slot1']).definition.sim;
  return length(delta)<s.rangeM+60||encounter.imminent&&contact<current.windupS+(current.burstIntervalS??.14)*(current.burst-1)+(s.switchS??.18)+u.pilotState.tactics.meleeReserveS;
 }
 prepareBlade(u,target,blade,reason){
  // Movement intent and slot service share the same contact deadline.
  if(this.bladeReserve(u,target))this.selectWeapon(u,blade,reason);
 }
 state(u,id=u.selected){return u.weapons.find(w=>w.definition.id===id)||u.weapons[0]||{definition:{id:'unarmed',name:'无武装',kind:'ballistic',sim:{rangeM:1,arcYawDeg:0,arcPitchDeg:0,edgeSpreadMultiplier:1}},ammo:0,readyAt:Infinity,shots:0,hits:0};}
 available(u,w){const cost=shipMainEnergyCost(u,w.definition)??weaponEnergyCost(w.definition);return !w.disabled&&!w.formDisabled&&w.ammo!==0&&u.energy>=cost&&(u.totalEnergy??energyTotalCapacity(u))>=cost;}
 observed(u,target){
  if(target.entityType==='remote')return [...target.position];
  if((u.pilotState.strategies?.['parallel-fire']??0)>0&&target.id!==u.targetId){const c=u.contacts.get(target.id);return c?add(c.position,mul(c.velocity,Math.min(12,Math.max(0,this.t-c.observedAt)))):[...target.position];}
  if(u.lastSeen)return add(u.lastSeen.position,mul(u.lastSeen.velocity,Math.min(12,this.t-u.lastSeenAt)));
  // Initial mission bearing is known; it is not a fire-control lock.
  return [...target.position];
 }
 setOrder(u,order){if(u.order===order)return;if(order==='escape')u.escapeBegan=this.t;u.order=order;this.emit('decision',u.id,u.machine.name+' → '+ORDER_NAMES[order],{order});this.notice(u,ORDER_NAMES[order],order==='evade'?'warning':'info','order',0.7);}

 sense(u,target,dt){
  if(!u.alive||!target.alive)return;const m=u.machine.sim,e=this.environment.sim,p=u.pilotState.sim;
  const delta=sub(target.position,u.position),distance=length(delta),toward=norm(delta);
  // Search is omnidirectional in this duel. Orientation and stability affect only fire control.
  const seen=distance<Math.min(m.sensorRangeM,e.visibilityM)&&!e.visualOccluded&&!concealedFrom(this,u,target)&&((u.pilotState.strategies?.["sensor-sharing"]??0)>0?canObserve(this,u,target):this.canSee(u.position,target.position));
  u.visible=seen;u.detectionLocked=seen;
  const angular=length(cross(sub(target.velocity,u.velocity),toward))/Math.max(distance,1);
  const seaPenalty=e.seaClutter*Math.exp(-Math.min(u.position[1],target.position[1])/300);
  const motionPenalty=angular*(.12+(1-p.tracking)*.2) + Math.min(.18,length(target.acceleration)/9000);
  const facing=arcSolution(u.forward,delta,this.state(u).definition.sim).inside;
  const quality=seen?clamp(1-distance/(m.sensorRangeM*3)-motionPenalty-seaPenalty*.5)*(.82+.18*p.tracking)*(.85+.15*u.components.sensor)*(.8+.2*u.stability)*(facing?1:.18):0;

  if(seen){u.lastSeen={position:[...target.position],velocity:[...target.velocity],forward:[...target.forward],weaponId:target.weapons.find(s=>s.attack)?.definition.id||target.selected};u.lastSeenAt=this.t;}
  if(seen)u.observations.push({t:this.t,position:[...target.position],velocity:[...target.velocity],acceleration:[...target.acceleration]});
  const delay=u.locked?.05:p.reactionS*.5+(1-u.track)*.08;
  while(u.observations.length>1&&u.observations[1].t<=this.t-delay)u.observations.shift();
  u.fireSolution=u.observations[0]?.t<=this.t-delay?u.observations[0]:null;
  if(u.observations.length>80)u.observations.shift();
  return;}
 chooseThreatResponse(u,target){
  const targeted=target.alive&&target.lockedTargetId===u.id&&target.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&isTacticalThreat(w.definition,u,this.rules.damageMultiplier));
  if(!targeted){u.threatTargeted=false;return;}
  if(u.threatTargeted&&this.t<u.nextThreatChoice)return;
  u.threatTargeted=true;u.nextThreatChoice=this.t+2.5;
  const p=u.pilotState.sim,anticipate=clamp(.2+p.tracking*.25+(1-u.stability)*.2+u.weights.escape*.08,.1,.7);
  u.evasionMode=this.random()<anticipate?'predictive':'reactive';
  this.emit('defense',u.id,u.machine.name+(u.evasionMode==='predictive'?' 预判敌方火控，准备侧闪':' 保持瞄准，等待攻击警报再闪避'));
  // Lock alone does not cause endless random dodging. Attack cues authorize a maneuver.
 }

  forecastDodge(u,axis,horizon){
   const m=u.machine.sim,p=u.pilotState.sim,c=u.pilotState.tactics,mob=u.machine.mobility,env=environmentAt(this,u.position),e=env.sim,ground=groundLimited(this,u,env);
   const power=clamp(u.energy/12),authority=pilotControlAuthority(u)*u.components.engine;
   const base=m.thrustN/m.massKg*(ground?environmentModifiers(u.machine,env).thrust:1)*(u.dodgeForecastMultiplier??c.dodgeThrustMultiplier)*authority*power;
   let velocity=[...u.velocity],offset=[0,0,0];const steps=Math.max(1,Math.ceil(horizon/.05)),dt=horizon/steps;
   for(let i=0;i<steps;i++){
    const braking=dot(axis,velocity)<0?mob.brakeMultiplier:1;
    let acceleration=limitBodyVector(mul(axis,base),u.forward,mob.accel,base*braking);if(ground){acceleration[1]=atGround(u)?0:-e.gravity;}
    const air=sub(velocity,e.windMps);acceleration=sub(acceleration,mul(air,m.dragCoefficient*e.density*length(air)));
    velocity=add(velocity,mul(acceleration,dt));const speed=length(velocity);const cap=motionSpeedLimit(this,u,true,env);if(ground){const horizontal=Math.hypot(velocity[0],velocity[2]);if(horizontal>cap){velocity[0]*=cap/horizontal;velocity[2]*=cap/horizontal;}if(atGround(u))velocity[1]=0;}else if(speed>cap)velocity=mul(velocity,cap/speed);
    offset=add(offset,mul(sub(velocity,u.velocity),dt));
   }
   return {offset,velocity};
  }
  chooseEscape(u,target,kind,direction,threat,horizon=.2){
   const incoming=norm(direction||sub(u.position,this.observed(u,target))),basis=bodyBasis(incoming),missile=GUIDED.has(kind);
   const transverse=sub(u.velocity,mul(incoming,dot(u.velocity,incoming)));
   const candidates=[basis.right,mul(basis.right,-1),basis.up,mul(basis.up,-1),norm(add(basis.right,basis.up)),norm(sub(basis.right,basis.up)),norm(sub(basis.up,basis.right)),norm(mul(add(basis.right,basis.up),-1))];
   if(length(u.velocity)>60)candidates.push(mul(norm(u.velocity),-1));
   if(length(transverse)>30)candidates.push(norm(transverse),mul(norm(transverse),-1));
   if(u.escapeDirection)candidates.push(u.escapeDirection);
   let best=candidates[0],score=-Infinity;horizon=clamp(horizon,.08,.38);
    // A visible volley is one geometry problem, not independent dice for each ray.
    // Only emitted, observed projectiles are used; never read an enemy's hidden aim point.
    const volley=[];
    if(u.machine.powerSystem)for(const shot of this.projectiles){
     if(shot.owner===u.id||this.unitById.get(shot.owner)?.side===u.side||shot.intercepted||(GUIDED.has(shot.kind)&&!missile)||shot.remoteTarget)continue;
     const relative=sub(shot.velocity,u.velocity),offset=sub(u.position,shot.position),time=dot(offset,relative)/Math.max(1,dot(relative,relative));
     if(time<=0||time>.45||length(offset)>u.machine.sim.sensorRangeM*u.components.sensor||!this.canSee(u.position,shot.position))continue;
     const radius=u.machine.sim.radiusM+(shot.weapon.blastRadiusM??0)*(isAreaShot(shot)?1:.35)+5,clearance=length(sub(offset,mul(relative,time)));
     const guidance=GUIDED.has(shot.kind)&&!shot.seekerFailed ? .5*(shot.weapon.maxLateralAccelMps2??140)*time*time:0;
     if(clearance>radius+u.machine.sim.maxSpeedMps*time*.4+guidance)continue;
     const risk=(shot.weapon.damage??10)/Math.max(1,time);volley.push({shot,time,radius,risk});volley.sort((a,b)=>b.risk-a.risk);if(volley.length>8)volley.pop();
    }
   for(const rawAxis of candidates){
    const ground=groundLimited(this,u),axis=ground?norm([rawAxis[0],0,rawAxis[2]]):rawAxis;if(length(axis)<.1)continue;
    const forecast=this.forecastDodge(u,axis,horizon),lateral=sub(forecast.offset,mul(incoming,dot(forecast.offset,incoming)));
    const height=u.position[1]+u.velocity[1]*horizon+forecast.offset[1];
    if(this.environment.medium!=='ground'&&(this.environment.sim.gravity>0)&&height<50&&axis[1]<0)continue;
    // Compare achievable displacement, including the speed cap, rather than nominal thrust direction.
    let value=length(add(mul(transverse,horizon),lateral))/Math.max(1,u.machine.sim.radiusM);
    if(kind==='melee'){const contact=u.contacts.get(target.id);if(contact&&this.t-contact.observedAt<.8){const relative=sub(add(add(u.position,mul(u.velocity,horizon)),forecast.offset),add(contact.position,mul(contact.velocity,horizon)));value+=length(sub(relative,mul(incoming,dot(relative,incoming))))/Math.max(1,u.machine.sim.radiusM);}}
    if(u.escapeDirection&&this.t<u.evadeUntil)value+=Math.max(0,dot(axis,u.escapeDirection))*.4;
    if(missile){
     const tti=threat?.tti||horizon,carry=mul(transverse,tti);
     value+=length(add(carry,lateral))/Math.max(1,u.machine.sim.radiusM)*.65;
    }
    if(threat?.fusePoint){const future=add(u.position,add(mul(u.velocity,threat.tti),forecast.offset));value+=length(sub(future,threat.fusePoint))/Math.max(1,u.machine.sim.radiusM+(threat.blastRadiusM??0));}
    if(threat?.position&&threat.velocity){
     const future=sub(add(u.position,add(mul(u.velocity,threat.tti),forecast.offset)),add(threat.position,mul(threat.velocity,threat.tti)));
     const relative=norm(sub(threat.velocity,u.velocity));value+=length(sub(future,mul(relative,dot(future,relative))))/Math.max(1,u.machine.sim.radiusM);
    }
    const trajectory=new Map();const projected=time=>{const bucket=Math.max(1,Math.ceil(Math.min(.38,time)/.05)),end=bucket*.05;if(!trajectory.has(bucket))trajectory.set(bucket,this.forecastDodge(u,axis,end));const value=trajectory.get(bucket),ratio=Math.min(.38,time)/end;return {offset:mul(value.offset,ratio*ratio),velocity:add(u.velocity,mul(sub(value.velocity,u.velocity),ratio))};};
    for(const cue of volley){
      const local=projected(cue.time),future=add(add(u.position,mul(u.velocity,cue.time)),local.offset),ray=add(cue.shot.position,mul(cue.shot.velocity,cue.time));
      let separation=length(sub(future,ray));
      if(GUIDED.has(cue.shot.kind)&&!cue.shot.seekerFailed){
        // Predict the same bounded turn authority as live guidance. No perfect
        // homing assumption and no instantaneous reversal of the victim velocity.
        let position=[...cue.shot.position],velocity=[...cue.shot.velocity],previousVictim=[...u.position];
        const steps=Math.max(1,Math.ceil(cue.time/.05)),dt=cue.time/steps;separation=Infinity;
        for(let i=1;i<=steps;i++){
          const time=i*dt,defense=projected(time),victim=add(add(u.position,mul(u.velocity,time)),defense.offset),delta=sub(previousVictim,position),heading=norm(velocity);
          if(dot(heading,norm(delta))>Math.cos(Math.min(75,cue.shot.weapon.seekerHalfAngleDeg)*DEG)){
            const lead=add(previousVictim,mul(defense.velocity,Math.min(.5,length(delta)/cue.shot.weapon.projectileSpeedMps))),turn=Math.min(cue.shot.weapon.turnRateDeg*DEG,(cue.shot.weapon.maxLateralAccelMps2??140)/Math.max(1,length(velocity)));
            velocity=mul(rotateToward(heading,norm(sub(lead,position)),turn*dt),cue.shot.weapon.projectileSpeedMps);
          }
          const next=add(position,mul(velocity,dt)),offset=sub(position,previousVictim),relative=sub(sub(next,position),sub(victim,previousVictim)),along=clamp(-dot(offset,relative)/Math.max(1,dot(relative,relative)));
          separation=Math.min(separation,length(add(offset,mul(relative,along))));position=next;previousVictim=victim;
        }
      }
      const penetration=clamp(1-separation/cue.radius);value-=penetration*penetration*Math.min(12,(cue.shot.weapon.damage??10)/8);
     }
     if(missile&&u.escapeDirection&&this.t<u.evadeUntil)value+=Math.max(0,dot(axis,u.escapeDirection))*.35;
     value+=(dot(axis,basis.right)*u.orbit)*.015;
    if(value>score){score=value;best=axis;}
   }
   return best;
  }
 assessMissiles(){
  // Compare the whole visible physical salvo with the charged PS buffer. A cheap
  // armour payment should not force repeated evasive maneuvers into beam fire.
  const protectedSalvos=new Map(),defenseBudgets=new Map();
  for(const shot of this.projectiles){if(!GUIDED.has(shot.kind)||shot.intercepted)continue;const u=this.unitById.get(shot.target);if(!u?.alive)continue;
   const distance=length(sub(u.position,shot.position));if(distance>Math.min(u.machine.sim.sensorRangeM*u.components.sensor,this.environment.sim.visibilityM)||this.environment.sim.visualOccluded)continue;
   const raw=shot.weapon.damage*(this.rules.damageMultiplier||1),definition={kind:shot.kind,sim:shot.weapon},cost=predictedProtectionCost(u,definition,raw);
    const relative=sub(shot.velocity,u.velocity),delta=sub(u.position,shot.position),closing=dot(relative,norm(delta)),phase=u.machine.defenses?.some(d=>['ps','tp','vps'].includes(d.type));
    const closest=dot(delta,relative)/Math.max(1,dot(relative,relative)),tti=closing>0?distance/closing:Infinity;
    const clearance=length(sub(delta,mul(relative,Math.max(0,closest)))),guidance=shot.seekerFailed?0:.5*(shot.weapon.maxLateralAccelMps2??140)*tti*tti;
    const credible=closing>0&&tti<3&&clearance<=u.machine.sim.radiusM+shot.weapon.blastRadiusM*.35+guidance+20&&this.canSee(u.position,shot.position);
    if(phase&&credible){
     // Budget the full visible salvo at a charged buffer. An empty buffer must not
     // make the planner conclude that future PS payments cost nothing.
     const full=predictedProtectionCost({...u,energy:u.machine.sim.energyCapacity,defenseActive:true},definition,raw,norm(mul(shot.velocity,-1)));
     if(full.remainingDamage<raw*.15)defenseBudgets.set(u.id,(defenseBudgets.get(u.id)||0)+full.energyCost);
    }
   if(credible&&cost.remainingDamage<raw*.08)protectedSalvos.set(u.id,(protectedSalvos.get(u.id)||0)+cost.energyCost);
  }
  const activeIds=new Set(this.projectiles.map(s=>s.id));
   for(const u of this.units){u.predictedArmorSalvoCost=defenseBudgets.get(u.id)||0;u.defenseEnergyReserve=Math.min(u.machine.sim.energyCapacity*.75,(defenseBudgets.get(u.id)||0)>0?(defenseBudgets.get(u.id)||0)*1.25+(u.machine.sim.dodgeEnergyCost||0):0);u.missileThreat=null;if(u.missileChoices)for(const id of u.missileChoices.keys())if(!activeIds.has(id))u.missileChoices.delete(id);}
  for(const shot of this.projectiles){
   if(!GUIDED.has(shot.kind))continue;
   if(shot.intercepted)continue;const target=this.unitById.get(shot.target);if(!target?.alive)continue;
   const delta=sub(target.position,shot.position),distance=length(delta),direction=norm(delta),relative=sub(shot.velocity,target.velocity),closing=dot(relative,direction);
   // A local contact, not its distant launcher, supplies the missile warning.
   if(closing<=0||distance>Math.min(target.machine.sim.sensorRangeM*target.components.sensor,this.environment.sim.visibilityM)||this.environment.sim.visualOccluded)continue;
   const tti=distance/closing,closestTime=dot(delta,relative)/Math.max(1,dot(relative,relative));
   const clearance=length(sub(delta,mul(relative,closestTime))),radius=target.machine.sim.radiusM+shot.weapon.blastRadiusM*.35;
   const guidanceReach=shot.seekerFailed?0:.5*(shot.weapon.maxLateralAccelMps2??140)*tti*tti;
   if(tti>target.pilotState.tactics.missileWarningS||clearance>radius+guidanceReach+20)continue;
   const raw=shot.weapon.damage*(this.rules.damageMultiplier||1),protection=predictedProtectionCost(target,{kind:shot.kind,sim:shot.weapon},raw),reserve=target.machine.sim.energyCapacity*target.pilotState.tactics.energyReserveFraction;
   if(protection.remainingDamage<raw*.08&&target.energy>=Math.max(target.machine.sim.dodgeEnergyCost, reserve*.5)+(protectedSalvos.get(target.id)||0)*1.25){
    if(this.t>=(target.armorTrustAt||0)){target.armorTrustAt=this.t+1;this.emit('armor-trust',target.id,target.machine.name+' 比较整组实弹的PS耗能，保留当前机动与光束防御窗口',{weapon:shot.weaponId,expectedDamage:protection.remainingDamage,expectedEnergyCost:protectedSalvos.get(target.id)||0});}
    continue;
   }
   const threat={id:shot.id,tti,clearance,radius,guidanceReach,direction:norm(shot.velocity),position:[...shot.position],velocity:[...shot.velocity],weaponId:shot.weaponId,owner:shot.owner};
   if(!target.missileThreat||tti<target.missileThreat.tti)target.missileThreat=threat;
  }
  for(const target of this.units){
   const threat=target.missileThreat;if(!threat)continue;
   const owner=this.unitById.get(threat.owner),c=target.pilotState.tactics;
   const movingAside=this.t<target.evadeUntil&&target.escapeDirection&&Math.abs(dot(target.escapeDirection,threat.direction))<.5;
    if(movingAside){
    target.dodgeGuided=true;
    // Keep the achieved lateral velocity until the salvo has passed; do not undo the dodge early.
    target.evadeHoldUntil=Math.max(target.evadeHoldUntil||0,this.t+Math.min(threat.tti,c.missileWarningS)+.1);
    target.evadeUntil=Math.max(target.evadeUntil,target.evadeHoldUntil+.1);
    // Nominal lateral thrust can still leave a collision course; only actual clearance permits holding.
    if(threat.clearance>threat.radius+(threat.guidanceReach||0)*.35)continue;
    // Homing can erase early clearance: keep the earned side-thrust while
    // the observed terminal path can still intersect. Live movement pays energy.
    target.dodgePulseUntil=Math.max(target.dodgePulseUntil||0,this.t+Math.min(.35,threat.tti+.05));
   }
   const known=target.missileChoices?.get(threat.id),canReplan=known===true&&!target.pendingReaction&&(!movingAside||this.t-target.evadeStarted>=c.dodgePulseS);
    if(threat.tti<=target.pilotState.sim.reactionS+c.missileDodgeLeadS&&(known!==false||threat.tti<=target.pilotState.sim.reactionS+.15)&&(target.lastMissileResponse!==threat.id||canReplan)){
    this.warn(target,owner,this.state(owner,threat.weaponId).definition,'terminal',threat.direction,threat);
   }else if(this.t>=(target.missileBreakNoticeAt||0)){
    target.missileBreakNoticeAt=this.t+1;target.nextDecision=this.t;
    this.emit('defense',target.id,target.machine.name+' 发现接近导弹，先加速横切保留末段急闪',{missile:threat.id,tti:threat.tti});
    this.notice(target,'导弹接近 · 加速脱离','warning','missile-approach',.8);
   }
  }
 }
 resolveBlade(u,target,w,contactDelta,window){return resolveBladeV5(this,u,target,w,contactDelta,window);}
 interrupt(u,reason){
  if(u.drift||u.breakaway?.meleeDash||u.weapons.some(s=>s.attack||s.salvo)||u.swing)this.emit('interruption',u.id,u.machine.name+' 中断当前动作：'+reason,{order:u.order});
  u.captureIntent=null;u.grappleContactSince=null;u.drift=null;u.breakaway=null;u.engagementPlan=null;this.cancelAttacks(u);u.swing=null;u.flightMode='normal';u.driftReadyAt=this.t+u.pilotState.tactics.strategyRetryS;u.nextDecision=this.t;
 }
 sweepMelee(previous){
  // Only committed exchanges are evaluated. There is no scan for an accidental
  // blade mesh collision or friendly victim; macro/body collisions stay below.
  for(let i=0;i<this.units.length;i++){
   const u=this.units[i],swing=u.swing,target=this.unitById.get(swing?.targetId);
   if(!swing)continue;
   if(!u.alive||!target?.alive||!mayEngage(this,u,target)){u.swing=null;continue;}
   if(this.t>swing.until){this.emit('blade-miss',u.id,u.machine.name+' 近战交锋窗口已关闭',{target:target.id,weapon:swing.weaponId,reason:'expired'});u.swing=null;this.recordExchange(u,target.id,'melee','miss');continue;}
   if(this.t<(u.meleeContactUntil||0))continue;
   const w=this.state(u,swing.weaponId).definition,j=this.unitIndices.get(target.id),startDelta=previous?.[i]&&previous?.[j]?sub(previous[j],previous[i]):null;
   const window=meleeEngagementWindow(this,u,target,w,startDelta,swing.forward||u.forward);
   if(window){this.resolveBlade(u,target,w,window.delta,window);u.swing=null;}
   else if(this.t>=swing.until){this.emit('blade-miss',u.id,u.machine.name+' 近战交锋窗口已关闭',{target:target.id,weapon:w.id,reason:'range-or-facing'});u.swing=null;this.recordExchange(u,target.id,'melee','miss');}
  }
  this.resolveBodyContacts();
 }
 resolveBodyContacts(){
  for(let i=0;i<this.units.length;i++)for(let j=i+1;j<this.units.length;j++){
   const a=this.units[i],b=this.units[j];if(!a.alive||!b.alive||a.docked||b.docked||a.mountId===b.id||b.mountId===a.id||a.mountId&&a.mountId===b.mountId)continue;const radius=a.machine.sim.radiusM+b.machine.sim.radiusM,dx=b.position[0]-a.position[0],dy=b.position[1]-a.position[1],dz=b.position[2]-a.position[2];if(Math.abs(dx)>=radius||Math.abs(dy)>=radius||Math.abs(dz)>=radius)continue;const distance=Math.hypot(dx,dy,dz);if(distance>=radius)continue;const delta=[dx,dy,dz];
   const n=distance>1e-6?mul(delta,1/distance):[1,0,0],ma=a.machine.sim.massKg,mb=b.machine.sim.massKg;
   // Resolve hull overlap after a numerical exchange without adding a second
   // physical parry penalty. Other body/ship collisions remain independent.
   const resolvedMelee=a.entityType!=='ship'&&b.entityType!=='ship'&&a.meleeExchangePartner===b.id&&b.meleeExchangePartner===a.id&&this.t-(a.meleeExchangeAt??-Infinity)<.15&&this.t-(b.meleeExchangeAt??-Infinity)<.15;
   const speed=resolvedMelee?0:Math.max(0,dot(sub(a.velocity,b.velocity),n)),impulse=1.15*speed/(1/ma+1/mb);
   a.velocity=sub(a.velocity,mul(n,impulse/ma));b.velocity=add(b.velocity,mul(n,impulse/mb));
   a.position=sub(a.position,mul(n,(radius-distance)*mb/(ma+mb)));b.position=add(b.position,mul(n,(radius-distance)*ma/(ma+mb)));
   for(const unit of [a,b]){if(unit.entityType!=='ship'){unit.stability=clamp(unit.stability-speed/700);if(speed>80){unit.recoveryDebuffUntil=Math.max(unit.recoveryDebuffUntil||0,this.t+unit.pilotState.tactics.clashRecoveryS);unit.recoveryDebuff='碰撞冲击';}if(unit.stability<.2)unit.meleeBreakUntil=this.t+1.6;}unit.nextDecision=this.t;}
   damageShipCollision(this,a,b,speed);
   if(speed>10)this.emit('collision',null,'近距离机体碰撞，按质量与接近速度分离',{closingSpeed:speed,impulse});
  }
 }
 warn(target,attacker,weapon,phase='windup',incoming,threat){
  if(!target.alive||!attacker||target.entityType==='remote')return;const distance=length(sub(target.position,attacker.position));
  const guided=GUIDED.has(weapon.kind),contactDistance=threat?length(sub(target.position,threat.position)):distance;
  if(contactDistance>=Math.min(target.machine.sim.sensorRangeM*target.components.sensor,this.environment.sim.visibilityM)||this.environment.sim.visualOccluded)return;
  if(guided&&phase!=='terminal')return;
  const c=target.pilotState.tactics,p=target.pilotState.sim,rawThreat=weapon.sim.damage*weaponDamageScale(weapon,target)*(this.rules.damageMultiplier||1),protection=predictedProtectionCost(target,weapon,rawThreat,norm(sub(attacker.position,target.position))),armored=weapon.kind!=='beam'&&protection.remainingDamage<rawThreat*.08&&protection.energyCost<target.energy*.12;
  if(armored&&target.energy>target.machine.sim.energyCapacity*c.energyReserveFraction+protection.energyCost*2){if(phase==='launch'&&this.t>=(target.armorTrustAt||0)){target.armorTrustAt=this.t+1;this.emit('armor-trust',target.id,target.machine.name+' 判断装甲可抵消攻击，保留机动与攻击窗口',{weapon:weapon.id,expectedDamage:protection.remainingDamage,expectedEnergyCost:protection.energyCost});}return;}
  if(weapon.kind==='beam'||rawThreat>target.structure*.2){target.observedHeavyAt=this.t;target.observedHeavyDamage=protection.remainingDamage;target.observedHeavyAttacker=attacker.id;}
  const light=isLightAutomatic(weapon)&&(!isTacticalThreat(weapon,target,this.rules.damageMultiplier)||protection.remainingDamage*weapon.sim.burst<target.structure*.2);
  if(light)return; // Non-lethal light fire does not consume a reaction or interrupt the current tactic.
  const delay=p.reactionS*(1+(1-target.components.sensor)*.4+(1-p.composure)*.2);
  const cue=threat?.cueDroneId?this.drones.find(d=>d.id===threat.cueDroneId&&d.owner===attacker.id)?.aim:attacker.weapons.find(s=>s.definition.id===weapon.id)?.attack;
  const contactAxis=norm(sub(target.position,attacker.position)),closing=Math.max(0,dot(sub(attacker.velocity,target.velocity),contactAxis));
  const tti=threat?.tti??((weapon.kind==='melee')?Math.max(cue?cue.at-this.t:0,Math.max(0,distance-weapon.sim.rangeM)/Math.max(1,closing)):((phase==='windup'?Math.max(0,(cue?.at??this.t+weapon.sim.windupS)-this.t):0)+distance/Math.max(1,weapon.sim.projectileSpeedMps)));
  const direction=incoming||norm(sub(target.position,attacker.position));
  let existing=target.pendingReaction;
  // Releasing the observed shot completes its cue; it must not invalidate an already earned reaction.
  if(phase==='launch'&&releaseObservedCue(this,target,attacker,weapon,threat,direction,tti))return;
  refreshReactions(this,target);existing=target.pendingReaction;
  const heavyPreparation=this.enemies(target).some(u=>u.weapons.some(s=>s.attack?.targetId===target.id&&s.definition.kind==='beam'));
  if(light&&(target.missileThreat||existing&&!existing.light||target.dodgeGuided&&this.t<target.evadeUntil||heavyPreparation))return;
  if(threat?.direct&&threat.clearance>target.machine.sim.radiusM+weapon.sim.blastRadiusM*(weapon.sim.impactMode==='area'?1:.35)+8)return;
  this.adapt(target,'threat');
  if(weapon.kind!=='melee'){
   let chance=phase==='windup'?(target.evasionMode==='predictive'?c.predictiveDodgeChance:c.reactionDodgeChance):c.reactionDodgeChance;
   if(weapon.kind==='beam'&&phase==='windup'){
    chance=Math.max(c.reactionDodgeChance,c.predictiveDodgeChance);
    if(chance>0)chance+=(1-chance)*p.tracking*(distance/Math.max(1,weapon.sim.projectileSpeedMps)<delay?1:.5);
   }
   // A clearly intersecting, consequential ray is not a coin toss about survival.
   const damage=weapon.sim.damage*(this.rules.damageMultiplier||1),urgent=tti<delay+.35;
   if(!light&&chance>0&&urgent&&(weapon.kind==='beam'||damage>target.structure*.12||guided&&threat?.direct))chance=Math.max(chance,.96+.04*p.tracking);
   if(light)chance*=.1;
   if((weapon.sim.salvoSuppression))chance=Math.min(1,chance*(1+weapon.sim.salvoSuppression*.2));
   if(guided&&threat){target.lastMissileResponse=threat.id;target.missileChoices??=new Map();if(target.missileChoices.has(threat.id)&&(!urgent||target.missileChoices.get(threat.id)))chance=target.missileChoices.get(threat.id)?1:0;}
   const accepted=((this.randomFor(target.id,'reaction')()))<chance;if(guided&&threat)target.missileChoices.set(threat.id,accepted);
   if(!accepted)return;
  }
  const duration=guided?.5:weapon.kind==='melee'?.4:.36;
  // Rank the actual harm after protection; a small missile must not steal a lethal beam's reaction window.
  const consequence=Math.max(.05,protection.remainingDamage/Math.max(1,target.structure)),priority=(light?.12:Math.min(8,.6+3*consequence)*(guided?1.1:1))/Math.max(.12,tti);
  let evadeAt=this.t+delay;
  if(target.machine.powerSystem&&phase==='windup'&&weapon.kind!=='melee'&&!light){
   const acceleration=target.machine.sim.thrustN/target.machine.sim.massKg*affordableManeuver(target,c.dodgeThrustMultiplier,emergencyPulseSeconds(target,this.rules.stepSeconds,weapon.sim.blastRadiusM),this.environment.medium,true).multiplier*target.machine.mobility.accel.lateral*target.components.engine*pilotControlAuthority(target)*clamp(target.energy/12);
   const clearance=target.machine.sim.radiusM+weapon.sim.blastRadiusM*(weapon.sim.impactMode==='area'?1:.35)+5,lead=Math.sqrt(2*clearance/Math.max(1,acceleration))+.05;
   // A visible charge allows waiting for the useful clearance window instead of spending a pulse that ends before emission.
   evadeAt=Math.max(evadeAt,this.t+tti-lead);
  }
  target.nextDecision=Math.min(target.nextDecision,this.t+delay);
  const pending={at:evadeAt,cueWeaponId:weapon.id,cueAt:phase==='windup'?cue?.at:null,cueDroneId:threat?.cueDroneId,kind:weapon.kind,attacker:attacker.id,direction,duration,missile:guided?threat?.id:undefined,shotId:threat?.direct?threat.id:undefined,tti,impactAt:this.t+tti,priority,light,plannedAt:this.t};
  if(weapon.kind==='melee'){if(!target.pendingGuard||pending.at<target.pendingGuard.at)target.pendingGuard=pending;}
  else scheduleReaction(this,target,pending);
  target.threatLabel=weapon.name+(phase==='windup'?'攻击准备':'来袭');
  if(this.t-(target.noticeAt['warning-event']??-100)>1){this.emit('warning',target.id,target.machine.name+' 发现 '+weapon.name+'，反应延迟 '+delay.toFixed(2)+'s',{weapon:weapon.id,phase,drone:threat?.cueDroneId,missile:guided?threat?.id:undefined,tti,reactionS:delay});this.notice(target,target.threatLabel,'warning','warning-event',1);}
 }
 reactionCueActive(r){
  if(r.cueDroneId)return this.drones.some(d=>d.id===r.cueDroneId&&d.owner===r.attacker&&d.aim?.at===r.cueAt);
  return this.unitById.get(r.attacker)?.weapons.some(s=>s.definition.id===r.cueWeaponId&&s.attack?.at===r.cueAt);
 }
 react(u,target){
  if(u.pendingGuard&&u.pendingGuard.at<=this.t){const saved=u.pendingReaction;u.pendingReaction=u.pendingGuard;u.pendingGuard=null;this.react(u,target);u.pendingReaction=saved;}
  const r=u.pendingReaction;if(!r||r.at>this.t||!u.alive)return;u.pendingReaction=null;
  if(r.cueAt!=null&&!r.cueReleased&&!(r.cueValid??this.reactionCueActive(r)))return;
  if(r.kind==='melee'&&trySeparate(this,u,r))return;
  const attacker=this.unitById.get(r.attacker)||target,contact=u.contacts.get(attacker?.id),freshContact=contact&&this.t-contact.observedAt<.8;
   const closing=freshContact?Math.max(0,-dot(sub(contact.velocity,u.velocity),norm(sub(contact.position,u.position)))):0;
   const trade=r.kind==='melee'&&freshContact?bladeTrade(this,u,attacker,closing):null,safeGuard=!trade?.unsafe,canDodge=u.energy>=(u.machine.sim.dodgeEnergyCost??5)&&u.components.engine>.1;
   if(r.kind==='melee'&&(!canDodge||safeGuard)&&u.stability>.12&&this.t>=(u.meleeBreakUntil||0)){
    const blade=this.bestBlade(u,attacker);
    if(blade&&this.available(u,blade)){
      if(u.drift)this.interrupt(u,'拔刀迎击');
      this.selectWeapon(u,blade,'拔刀迎击');
      const slot=blade.definition.slot||'slot1';
      u.guardReadyAt=Math.max(u.guardUntil>this.t?(u.guardReadyAt||this.t):this.t+(blade.definition.sim.windupS||0)*.4,u.slotReadyAt[slot]||0);
      u.guardUntil=this.t+Math.max(.9,u.pilotState.tactics.meleeLookaheadS+.5);u.nextDecision=this.t;
      this.emit('reaction',u.id,u.machine.name+' 拔刀迎击',{weaponKind:r.kind,weapon:blade.definition.id,readyAt:u.guardReadyAt});return;
    }
   }
  if(r.missile&&!this.projectiles.some(s=>s.id===r.missile&&s.target===u.id&&dot(sub(s.velocity,u.velocity),sub(u.position,s.position))>0))return;
  if(r.light&&(u.breakaway||u.missileThreat||u.dodgeGuided&&this.t<u.evadeUntil))return;
   // Large hulls use their own reachable-angle maneuver; MS-like pulses would interrupt every turret.
  if(u.entityType==='ship'&&u.machine.powerSystem){u.nextDecision=this.t;return;}
  if(u.order==='shieldGuard'&&r.kind!=='melee'&&attacker){
   const shot=this.projectiles.find(s=>s.id===(r.shotId??r.missile)),state=attacker.weapons.find(w=>w.definition.id===r.cueWeaponId),weapon=shot?{kind:shot.kind,sim:shot.weapon}:state?.definition;
   if(weapon){const raw=weapon.sim.damage*(this.rules.damageMultiplier||1),bearing=shot?norm(mul(shot.velocity,-1)):norm(sub(attacker.position,u.position)),guard=predictedProtectionCost(u,weapon,raw,bearing);
    if(guard.remainingDamage<u.structure*.12&&guard.energyCost<(u.machine.sim.dodgeEnergyCost??5)*.5){this.emit('defense-continue',u.id,u.machine.name+' 实体盾当前迎角可削弱攻击，保留急闪能源',{weapon:r.cueWeaponId,expectedDamage:guard.remainingDamage,expectedEnergyCost:guard.energyCost});return;}
   }
  }
  const dodgeCost=u.machine.sim.dodgeEnergyCost??5;
  if(r.missile&&u.defenseActive!==false){
   const shot=this.projectiles.find(s=>s.id===r.missile);
   if(shot){const raw=shot.weapon.damage*(this.rules.damageMultiplier||1),protection=predictedProtectionCost(u,{kind:shot.kind,sim:shot.weapon},raw,norm(mul(shot.velocity,-1))),salvoCost=Math.max(protection.energyCost,u.predictedArmorSalvoCost||0);
    if(protection.remainingDamage<raw*.08&&u.energy>=salvoCost*1.25+dodgeCost&&protection.energyCost<dodgeCost*.75){if(this.t>=(u.armorTrustAt||0)){u.armorTrustAt=this.t+1;this.emit('defense-continue',u.id,u.machine.name+' 当前装甲可支付近端齐射，保留急闪应对光束',{missile:r.missile,armorCost:salvoCost,dodgeCost});}return;}
   }
  }
  if(trySeparate(this,u,r))return;
  if(u.machine.powerSystem&&this.t<Math.max(u.evadeStarted+(u.activeDodgePulse??0),u.dodgePulseUntil||0)&&u.escapeDirection){
   const currentAttacker=this.unitById.get(r.attacker)||target,currentShot=this.projectiles.find(p=>p.id===(r.missile??r.shotId)),remaining=Math.max(.08,(r.impactAt??this.t+.2)-this.t),axis=this.chooseEscape(u,currentAttacker,r.kind,currentShot?norm(currentShot.velocity):r.direction,currentShot?{position:currentShot.position,velocity:currentShot.velocity,tti:remaining}:u.missileThreat,remaining);
   if(dot(axis,u.escapeDirection)>.9){u.dodgePulseUntil=Math.max(u.dodgePulseUntil||0,this.t+Math.min(.35,remaining+this.rules.stepSeconds));u.evadeUntil=Math.max(u.evadeUntil,u.dodgePulseUntil+.06);if(r.missile){u.dodgeGuided=true;u.evadeHoldUntil=Math.max(u.evadeHoldUntil||0,this.t+remaining+.1);u.evadeUntil=Math.max(u.evadeUntil,u.evadeHoldUntil+.1);}if(this.t>=(u.dodgeContinueAt||0)){u.dodgeContinueAt=this.t+.25;this.emit('defense-continue',u.id,u.machine.name+' 当前横移方向仍能处理新威胁，延续出力而不重复启动急闪',{weapon:r.cueWeaponId,missile:r.missile,energyCost:0});}return;}
  }
  // An emitted shot is observable geometry. Do not restart a maneuver for a
  // ray the present trajectory already clears; homing retains its turn budget.
  const observedShot=this.projectiles.find(s=>s.id===(r.missile??r.shotId));
  if(observedShot&&this.canSee(u.position,observedShot.position)&&coastClearsThreat(u,observedShot,this.t,r.impactAt,this.rules.stepSeconds)){
   u.defenseCoastUntil=Math.max(u.defenseCoastUntil||0,Math.min(r.impactAt+this.rules.stepSeconds,this.t+.45));
   if(this.t>=(u.coastDefenseNoticeAt||0)){u.coastDefenseNoticeAt=this.t+.5;this.emit('defense-continue',u.id,u.machine.name+' 当前运动已避开来袭弹道，保留急闪能源',{threat:observedShot.id,energyCost:0});}return;
  }
  if(u.energy<dodgeCost||(u.totalEnergy??energyTotalCapacity(u))<dodgeCost){this.notice(u,'能源不足 · 急闪出力受限','warning','energy-dodge',.7);u.nextDecision=this.t;return;}
  const shot=this.projectiles.find(s=>s.id===(r.missile??r.shotId)),pulse=r.kind==='melee'?Math.min(.4,Math.max(u.pilotState.tactics.dodgePulseS,(r.impactAt??this.t+.2)-this.t+this.rules.stepSeconds)):emergencyPulseSeconds(u,this.rules.stepSeconds,(shot?.weapon.blastRadiusM??0)*(shot?.weapon.impactMode==='area'?1/.35:1));
  const budget=affordableManeuver(u,u.pilotState.tactics.dodgeThrustMultiplier,pulse,this.environment.medium,true);
  if(budget.multiplier<=0){u.nextDecision=this.t;return;}
  u.activeDodgeThrust=budget.multiplier;u.dodgeForecastMultiplier=budget.multiplier;
  spendEnergy(u,dodgeCost);
  const activeMissile=u.missileThreat;
   const liveThreat=shot?{position:shot.position,velocity:shot.velocity,...(isAreaShot(shot)?{fusePoint:shot.fusePoint,blastRadiusM:shot.weapon.blastRadiusM}:{}),tti:Math.max(.05,(r.impactAt??this.t+(r.tti||.2))-this.t)}:activeMissile;
   u.dodgeGuided=!!r.missile||!!activeMissile;u.evadeHoldUntil=u.dodgeGuided?Math.max(u.evadeHoldUntil||0,this.t+Math.max(.12,activeMissile?.tti??((r.tti||.5)-(this.t-(r.plannedAt??r.at))))+.1):0;
   if(r.plannedAt!=null)r.escape=this.chooseEscape(u,this.unitById.get(r.attacker)||target,r.kind,shot?norm(shot.velocity):r.direction,liveThreat,Math.max(.08,(r.impactAt??this.t+.2)-this.t));
  const measuredPulse=u.dodgeGuided?u.pilotState.tactics.dodgePulseS:pulse;
  u.activeDodgePulse=measuredPulse;u.dodgePulseUntil=this.t+Math.max(measuredPulse,Math.min(.35,Math.max(0,(r.impactAt??this.t)-this.t)+this.rules.stepSeconds));
   u.escapeDirection=r.escape||this.chooseEscape(u,target,r.kind,r.direction);u.dodgeStyle=dot(u.escapeDirection,norm(u.velocity))<-.75?'brake':'side';u.evadeStarted=this.t;u.evadeAxis=length(u.velocity)>20?norm(u.velocity):[...u.forward];u.evadeUntil=Math.max(u.evadeUntil,this.t+(u.machine.powerSystem&&!u.dodgeGuided?Math.max(measuredPulse+.06,Math.min(r.duration,(r.impactAt??this.t+.2)-this.t+.08)):r.duration),u.evadeHoldUntil+(u.dodgeGuided?.1:0));u.nextDecision=this.t;
  u.dodgeForecastMultiplier=null;if(u.entityType!=='ship')u.stability=clamp(u.stability-.18);u.stableTime=0;this.interrupt(u,'来袭闪避');
  if(r.kind==='melee'&&safeGuard&&u.weapons.some(w=>w.definition.kind==='melee'&&this.available(u,w)))u.guardUntil=this.t+0.8;
  this.emit('reaction',u.id,u.machine.name+' 执行 '+(GUIDED.has(r.kind)?'导弹横切规避':r.kind==='melee'?'后撤/格挡':'变向闪避'),{weapon:r.cueWeaponId,weaponKind:r.kind,dodgeStyle:u.dodgeStyle,escape:[...u.escapeDirection],missile:r.missile,tti:r.tti,energyCost:dodgeCost});
  this.effects.push({type:'dodge-jet',t:this.t,life:.45,position:[...u.position],direction:mul(u.escapeDirection,-1),actor:u.id});
  this.notice(u,GUIDED.has(r.kind)?'导弹横切规避':r.kind==='melee'?'近战防御':'急转闪避','warning','reaction',.7);
 }
 // Pre-emptive defence uses only the most recent observed contact, not an unseen attack cue.
 tailPressure(u,target){
  const seen=u.lastSeen,c=u.pilotState.tactics;if(!seen||this.t-u.lastSeenAt>.6)return null;
  const delta=sub(seen.position,u.position),distance=length(delta),toward=norm(delta),carry=length(u.velocity)>60?norm(u.velocity):u.forward;
  const weapon=this.state(target,seen.weaponId).definition,range=Math.min(c.tailThreatRangeM,weapon.sim.rangeM);
  if(!isTacticalThreat(weapon,u,this.rules.damageMultiplier))return null;
  const behind=length(u.velocity)>60?dot(carry,toward)<-.2:dot(u.forward,toward)<-.3;
  const aiming=arcSolution(seen.forward,mul(delta,-1),weapon.sim).inside;
  if(!behind||!aiming||distance>range||distance<Math.max(90,u.machine.sim.radiusM*4))return null;
  const closing=dot(sub(u.velocity,seen.velocity),toward);
  return {distance,toward,carry,closing,weapon,seen};
 }
 breakawayAcceleration(u,plan,time){
  const c=u.pilotState.tactics,m=u.machine.sim,age=Math.max(0,time-plan.started),basis=bodyBasis(plan.heading);
  if(plan.meleeDash&&age>=plan.duration)return [0,0,0];
  let lateral=[0,0,0];
  if(plan.style==='jink')lateral=mul(plan.axis,age<plan.duration*.65?1:0);
  if(plan.style==='roll'){const phase=age/plan.duration*Math.PI*2;lateral=add(mul(plan.axis,Math.cos(phase)),mul(basis.up,Math.sin(phase)*plan.sign));}
  const drive=plan.translationAxis||u.forward,force=add(mul(drive,plan.style==='boost'?1:.65),mul(lateral,c.tailLateralWeight));
  return mul(force,m.thrustN/m.massKg*(plan.thrustMultiplier??c.tailThrustMultiplier)*pilotControlAuthority(u)*u.components.engine*clamp(u.energy/12));
 }
 forecastBreakaway(u,plan,horizon){
  const m=u.machine.sim,mob=u.machine.mobility,env=environmentAt(this,u.position),e=env.sim,p=u.pilotState.sim,handling=groundHandling(this,u,env);
  const ghost={...u,position:[...u.position],velocity:[...u.velocity],forward:[...u.forward]},steps=plan.meleeDash?Math.max(1,Math.ceil(horizon/this.rules.stepSeconds)):8,dt=horizon/steps,trajectory=plan.meleeDash?[{at:0,position:[...u.position]}]:null;
  const traction=handling.acceleration*(handling.limited?environmentModifiers(u.machine,env).thrust:1),base=m.thrustN/m.massKg*traction*(plan.thrustMultiplier??u.pilotState.tactics.tailThrustMultiplier)*pilotControlAuthority(u)*u.components.engine*clamp(u.energy/12);
  for(let i=0;i<steps;i++){
   ghost.forward=rotateBody(ghost.forward,plan.heading,m.turnRateDeg*DEG*pilotControlAuthority(u)*u.components.engine*u.pilotState.tactics.turnMultiplier*handling.turn,mob.pitchRateDeg*DEG*pilotControlAuthority(u)*u.components.engine*u.pilotState.tactics.turnMultiplier,dt);
   let acceleration=mul(this.breakawayAcceleration(ghost,plan,this.t+i*dt),traction);
   acceleration=limitBodyVector(acceleration,ghost.forward,mob.accel,base*(dot(acceleration,ghost.velocity)<0?mob.brakeMultiplier:1));
   const air=sub(ghost.velocity,e.windMps);acceleration=sub(acceleration,mul(air,m.dragCoefficient*e.density*length(air)));if(handling.limited)acceleration[1]=atGround(u)?0:-e.gravity;
   ghost.velocity=add(ghost.velocity,mul(acceleration,dt));const speed=length(ghost.velocity);const cap=motionSpeedLimit(this,ghost,!plan.meleeDash||i*dt<plan.duration,env);if(handling.limited){const horizontal=Math.hypot(ghost.velocity[0],ghost.velocity[2]);if(horizontal>cap){ghost.velocity[0]*=cap/horizontal;ghost.velocity[2]*=cap/horizontal;}if(atGround(u))ghost.velocity[1]=0;}else if(speed>cap)ghost.velocity=mul(ghost.velocity,cap/speed);
   ghost.position=add(ghost.position,mul(ghost.velocity,dt));if(trajectory)trajectory.push({at:(i+1)*dt,position:[...ghost.position]});
  }
  if(trajectory)ghost.trajectory=trajectory;return ghost;
 }
 proactiveBreakaway(u,target,safeWindow){
  const c=u.pilotState.tactics,pressure=this.tailPressure(u,target);
  if(u.tailContactId!==target.id){u.tailContactId=target.id;u.breakaway=null;u.tailAttempt=null;u.tailFailures=0;u.tailSuppressedUntil=0;u.tailEpisodeAt=null;u.tailClearAt=null;}
  if(!pressure){
   u.tailClearAt??=this.t;
   if(this.t-u.tailClearAt>.8){u.tailAttempt=null;u.tailFailures=0;u.tailSuppressedUntil=0;u.tailEpisodeAt=null;}
  }else {u.tailClearAt=null;if(u.tailEpisodeAt==null)u.tailEpisodeAt=this.t;}
  if(pressure&&u.tailAttempt&&this.t>=u.tailAttempt.evaluateAt){
   const attempt=u.tailAttempt,rangeGain=pressure.distance-attempt.distance,improved=rangeGain>Math.max(100,attempt.distance*.15)&&u.structure>=attempt.structure*.95;
   u.tailFailures=improved?0:Math.min(4,(u.tailFailures||0)+1);u.tailAttempt=null;
   if(!improved){u.tailSuppressedUntil=this.t+Math.min(3,.9*u.tailFailures);u.breakaway=null;this.emit('strategy',u.id,u.machine.name+' 主动摆脱未获得更好态势，降低重复机动权重，重评反击与回稳',{strategy:'tail-reassess',rangeGain,failures:u.tailFailures});}
  }
  if(u.breakaway&&(this.t>=u.breakaway.until||!pressure||safeWindow)){u.breakaway=null;u.nextTailChoice=this.t+c.tailRecheckS;}
  if(!pressure||safeWindow||u.energy<12||!u.components.engine){u.breakaway=null;return null;}
  if(!u.breakaway&&((u.tailFailures||0)>=2||this.t<(u.tailSuppressedUntil||0)))return null;
  if(!u.breakaway&&this.t>=(u.nextTailChoice||0)){
   const ground=groundLimited(this,u),heading=norm(add(mul(pressure.carry,.92),mul(pressure.toward,-.18))),basis=bodyBasis(heading),candidates=[];
   for(const style of (ground?['boost','jink']:['boost','jink','roll']))for(const sign of style==='boost'?[1]:[-1,1]){
    const axis=mul(basis.right,sign),course=style==='boost'?heading:norm(add(mul(pressure.carry,.55),mul(axis,.85)));
    const budget=affordableManeuver(u,c.tailThrustMultiplier,c.tailBreakSeconds,this.environment.medium);
    if(budget.multiplier<10)continue;
    const plan={target:target.id,style,sign,axis,heading:course,started:this.t,duration:c.tailBreakSeconds,until:this.t+c.tailBreakSeconds,thrustMultiplier:budget.multiplier};
    const horizon=Math.min(1,plan.duration),pred=this.forecastBreakaway(u,plan,horizon),enemyFuture=add(pressure.seen.position,mul(pressure.seen.velocity,horizon));
    const offset=sub(pred.position,add(u.position,mul(u.velocity,horizon))),lateral=length(cross(offset,pressure.toward)),separation=length(sub(pred.position,enemyFuture));
    const height=pred.position[1],descent=Math.max(0,-pred.velocity[1]);if(!ground&&this.environment.sim.gravity>0&&height<60+descent*.12)continue;
    // Break the opponent's existing lead while preserving speed; boost wins when it truly opens range.
    const gain=(separation-pressure.distance)/Math.max(80,pressure.distance*.15),courseChange=lateral/Math.max(12,u.machine.sim.radiusM*3);
    const lateralSpeed=length(cross(sub(pred.velocity,pressure.seen.velocity),pressure.toward));
    const resourceCost=(style==='boost'?.08:style==='jink'?.15:.2)+budget.cost/Math.max(1,u.energy)*.4;
    const score=courseChange*.55+gain*.75+lateralSpeed/600+length(pred.velocity)/u.machine.sim.maxSpeedMps*.3-resourceCost;
    candidates.push({plan,score,separation,lateral});
   }
   if(!candidates.length)return null;candidates.sort((a,b)=>b.score-a.score);
   const near=candidates.filter(x=>x.score>=candidates[0].score-.12),chosen=near[Math.min(near.length-1,Math.floor(this.random()*near.length))];
   this.interrupt(u,'提前摆脱追尾');u.breakaway=chosen.plan;u.retreat=null;this.effects.push({type:'dodge-jet',actor:u.id,t:this.t,life:.45,position:[...u.position],direction:mul(chosen.plan.axis,-1)});u.tailAttempt??={evaluateAt:chosen.plan.until,distance:pressure.distance,structure:u.structure};
   this.emit('strategy',u.id,u.machine.name+' 发现追尾射击态势，主动'+({boost:'加速拉开',jink:'大范围横切变向',roll:'滚动横向机动'}[chosen.plan.style]),{strategy:'tail-break',target:target.id,style:chosen.plan.style,distance:pressure.distance,closing:pressure.closing,predictedLateral:chosen.lateral,predictedSeparation:chosen.separation});
  }
  const plan=u.breakaway;if(!plan)return null;
  return {order:plan.style==='boost'?'tailBoost':plan.style==='roll'?'tailRoll':'tailJink',heading:plan.heading,desired:mul(plan.heading,u.machine.sim.maxSpeedMps)};
 }
 pilotManeuver(u,target,distance,toward,tailed,encounter){
  const p=u.pilotState.sim,c=u.pilotState.tactics,traits=u.pilotState.traits,m=u.machine.sim;
  const damagePressure=(u.recentDamage||0)*Math.exp(-(this.t-(u.lastDamageAt||0))/4)/m.structure;
  const danger=(1-u.structure/m.structure)*.35+(1-u.stability)*(tailed||u.threatTargeted?.38:.16)+(1-u.energy/m.energyCapacity)*.14+(1-(u.totalEnergy??energyTotalCapacity(u))/energyTotalCapacity(u))*.08+damagePressure*.9;
  u.disadvantage=danger;
  if(traits.rationalRetreat&&!u.retreat&&this.t>=(u.retreatReadyAt||0)&&danger>=c.retreatThreshold){
   // Preserve a usable escape vector instead of instantly reversing momentum.
   const away=mul(toward,-1),velocity=length(u.velocity)>50?norm(u.velocity):away;
   const side=bodyBasis(toward).right;
   const heading=norm(add(add(mul(away,1.4),mul(velocity,.6)),mul(side,.35*u.orbit)));
   u.retreat={until:this.t+c.retreatSeconds,minUntil:this.t+1.2,heading};u.drift=null;u.attack=null;
   this.emit('strategy',u.id,u.machine.name+' 判断明显劣势，优先脱离重整',{danger});this.notice(u,'劣势 · 加速脱离','warning','retreat',1);
  }
  if(u.retreat){
   if(this.t>=u.retreat.until||(this.t>=u.retreat.minUntil&&distance>=c.retreatDistanceM&&u.stability>.55)){
    u.retreat=null;u.retreatReadyAt=this.t+c.retreatCooldownS;u.counterUntil=this.t+2;
    this.emit('strategy',u.id,u.machine.name+' 脱离阶段结束，重新评估攻击窗口');
   }else return {order:'disengage',heading:u.retreat.heading,desired:mul(u.retreat.heading,m.maxSpeedMps)};
  }
  if(u.drift){
   const d=u.drift,w=this.state(u,d.weaponId);
   if(d.phase!=='boost'&&(!u.visible||distance>w.definition.sim.rangeM||length(u.velocity)<c.driftMinSpeed*.8)){this.interrupt(u,'抢射条件失效');return null;}
   if(d.phase!=='boost'&&(this.t>=d.until||!this.available(u,w)||u.stability<.08)){d.phase='boost';d.boostUntil=this.t+c.boostSeconds;u.attack=null;}
   if(d.phase==='boost'){
    if(this.t>=d.boostUntil){u.drift=null;u.driftReadyAt=this.t+c.driftCooldownS;return null;}
    return {order:'boost',heading:d.cruise,desired:mul(d.cruise,m.maxSpeedMps)};
   }
   this.selectWeapon(u,w,'维持抢射武器');return {order:'drift',heading:d.heading,desired:[...u.velocity],flightMode:'coast'};
  }
  if(encounter&&(encounter.imminent||distance<c.meleeCommitM))return null;
  if(!traits.driftShot||!u.visible||this.t<(u.driftReadyAt||0)||length(u.velocity)<c.driftMinSpeed||distance<350||u.stability<.32||tailed||this.t<u.evadeUntil)return null;
  const candidates=u.weapons.filter(w=>(w.definition.slot||'slot1')===(this.state(u).definition.slot||'slot1')&&['beam','ballistic'].includes(w.definition.kind)&&this.available(u,w)&&w.readyAt<=this.t&&distance>w.definition.sim.minRangeM&&distance<w.definition.sim.effectiveRangeM);
  // Prefer accuracy near the weapon's best distance; a burst can start stabilizing fire earlier.
  candidates.sort((a,b)=>aimDistanceFactor(b.definition.sim,distance)-aimDistanceFactor(a.definition.sim,distance));
  for(const state of candidates){
   const w=state.definition.sim,relative=sub(u.lastSeen.velocity,u.velocity);
   const opportunity=driftOpportunity(u,relative,mul(toward,distance),w,this.t),{heading,window}=opportunity;
   if(opportunity.usable<.12||opportunity.gain<c.driftMinGainS||u.attack)continue;
   const chance=c.driftChance===1?1:clamp(c.driftChance*(.65+.35*p.composure+Math.min(.15,opportunity.gain*.1)),0,1),roll=this.random();
   u.driftReadyAt=this.t+c.strategyRetryS;
   this.emit('strategy-roll',u.id,u.machine.name+' 满足高速抢射条件，选择'+(roll<chance?'抢射':'继续当前机动'),{chance,roll,accepted:roll<chance});
   if(roll>=chance)return null;
   u.drift={phase:'aim',weaponId:state.definition.id,heading,cruise:norm(u.velocity),until:this.t+window};this.selectWeapon(u,state,'抢射窗口');u.attack=null;
   this.emit('strategy',u.id,u.machine.name+' 预判轨迹，快速转向争取回稳射击窗口',{windowSeconds:window,weapon:state.definition.id,...opportunity});
   return {order:'drift',heading,desired:[...u.velocity],flightMode:'coast'};
  }
  return null;
 }
 recharge(u,dt){rechargeEnergy(u,dt);}
 decide(u,target){return decideV5(this,u,target);}
 move(u,dt){
  if(!u.alive)return;if(u.breakaway&&this.t>=u.breakaway.until)u.breakaway=null;const m=u.machine.sim,p=u.pilotState.sim,e=this.environment.sim,mob=u.machine.mobility;
  const authority=pilotControlAuthority(u)*u.components.engine;
  const handling=groundHandling(this,u,this.environment),oldForward=[...u.forward];
  if(this.t<u.evadeUntil){const target=this.targetFor(u),closeBlade=u.controller!=='survive'&&u.stability>.25&&!bladeTrade(this,u,target).unsafe&&u.lastStrategyId!=='blade-denial'&&(u.pilotState.strategies?.['parallel-fire']??0)>0&&u.dodgeStyle==='side'&&target?.alive&&u.visible&&length(sub(this.observed(u,target),u.position))<400&&u.weapons.some(w=>w.definition.kind==='melee'&&this.available(u,w));u.desiredFacing=closeBlade?norm(sub(this.observed(u,target),u.position)):u.forward;u.desired=add(u.velocity,mul(u.escapeDirection||bodyBasis(u.forward).right,80));}
  const microControl=this.t<(u.microControlUntil||0)&&this.t>=u.evadeUntil;
  if(microControl)u.desiredFacing=[...u.forward];
  const tuning=u.pilotState.tactics;
  u.forward=rotateBody(u.forward,u.desiredFacing,m.turnRateDeg*DEG*authority*clamp(u.energy/12)*tuning.turnMultiplier*handling.turn,mob.pitchRateDeg*DEG*authority*clamp(u.energy/12)*tuning.turnMultiplier,dt);
  const angle=Math.acos(clamp(dot(oldForward,u.forward),-1,1)),rate=angle/dt,turning=rate>.35;
  u.stableTime=turning?0:u.stableTime+dt;
  if(u.entityType!=='ship'){
  const recoveryRate=stabilityRecoveryRate(u,this.t)*(u.domainRecoveryFactor||1);
  const turnPenalty=clamp((rate-.35)/1.8,.02,1);
  u.stability=clamp(u.stability+dt*recoveryRate*(turning||this.t<u.evadeUntil?.12:1)-angle*(1.35-.45*p.maneuver)*tuning.turnStabilityCost*turnPenalty);
  {u.meleeStrain=(u.meleeStrain||0)*Math.exp(-dt/(this.rules.clashStrainRecoveryS??45));u.stability=Math.min(u.stability,Math.max(1-(this.rules.clashStrainCap??.55),1-u.meleeStrain));}
  }else{u.stability=1;u.stableTime=0;} // Constant legacy codec field; ships have no combat-stability mechanic.
  const landMotor=handling.limited,grounded=landMotor&&atGround(u)&&this.t>=(u.jumpBoostUntil||0),groundOnly=!u.machine.tags.includes('air-combat')&&!u.machine.tags.includes('all-domain'),speedLimit=motionSpeedLimit(this,u,this.t<u.evadeUntil||!!u.breakaway?.meleeDash,this.environment);
  const intent=grounded&&groundOnly?[u.desired[0],0,u.desired[2]]:u.desired;
  const desired=limitBodyVector(intent,u.forward,mob.speed,speedLimit);
  let acceleration=mul(sub(desired,u.velocity),1/(.22+p.reactionS*.35));
  if(u.flightMode==='coast')acceleration=(this.environment.medium==='space')?[0,0,0]:[0,clamp(-u.velocity[1]*2+(this.scenario.altitudeM-u.position[1])*.08,-m.thrustN/m.massKg*.6,m.thrustN/m.massKg*.6),0];
  if(u.order==='boost')acceleration=dot(u.forward,u.desiredFacing)>.85?mul(u.forward,m.thrustN/m.massKg*10*authority):[0,0,0];
  if(u.breakaway&&this.t>=u.evadeUntil)acceleration=this.breakawayAcceleration(u,u.breakaway,this.t);
  if(microControl||this.t<(u.defenseCoastUntil||0)&&this.t>=u.evadeUntil)acceleration=[0,0,0];
   if(this.t<u.evadeUntil){const pulse=u.activeDodgePulse??tuning.dodgePulseS,age=this.t-u.evadeStarted,axis=u.escapeDirection||bodyBasis(u.forward).right;
   acceleration=mul(axis,m.thrustN/m.massKg*(u.activeDodgeThrust??tuning.dodgeThrustMultiplier)*(this.t<=Math.max(u.evadeStarted+pulse,u.dodgePulseUntil||0)?1:u.dodgeGuided&&this.t<u.evadeHoldUntil?0:0));
    if((u.pressuredAdvance)&&!u.dodgeGuided&&age>pulse){const forward=mul(u.forward,m.thrustN/m.massKg*10*authority*tuning.defenseForwardFraction),residual=mul(axis,-m.thrustN/m.massKg*3);acceleration=add(forward,residual);}
   }
  const descent=Math.max(0,-u.velocity[1]),power=clamp(u.energy/12);
  const rescueAcceleration=m.thrustN/m.massKg*16*authority*power*.65*mob.accel.up;
  const waterDescent=u.machine.tags.includes('water-combat')&&(u.desired[1]<0||this.environment.medium==='water');
  const terrainRisk=(u.entityType!=='ship'||m.airLift>0)&&m.thrustN>0&&authority>.02&&!waterDescent&&!landMotor&&this.environment.medium!=='ground'&&(e.gravity>0)&&((descent>5&&u.position[1]<this.rules.minimumAltitudeM+70+descent*descent/(2*Math.max(2,rescueAcceleration)))||u.position[1]<this.rules.minimumAltitudeM+20||u.terrainRecovering&&u.velocity[1]<10);
  const base=m.thrustN/m.massKg*(this.t>=u.evadeUntil?handling.acceleration:1)*(this.t<u.evadeUntil?(u.activeDodgeThrust??tuning.dodgeThrustMultiplier):terrainRisk?16:u.breakaway?(u.breakaway.thrustMultiplier??tuning.tailThrustMultiplier):10)*authority*power;
  // Safety reserves thrust for upward braking; coasting or lateral dodges cannot consume it.
  u.terrainRecovering=terrainRisk;if(terrainRisk){
   // Reserve vertical braking without discarding all lateral pursuit. Otherwise
   // a submerged contact can pin the pursuer above the surface indefinitely.
   const up=Math.max(0,base*.65),horizontal=Math.hypot(acceleration[0],acceleration[2]),budget=base*Math.sqrt(1-.65*.65),scale=horizontal>budget?budget/horizontal:1;
   acceleration=[acceleration[0]*scale,Math.max(acceleration[1],up),acceleration[2]*scale];this.notice(u,'海面迫近 · 保留横向机动抬升','warning','terrain',2);
  }
  const braking=dot(acceleration,u.velocity)<0?mob.brakeMultiplier:1;
  if(m.airLift&&['air','surface'].includes(this.environment.medium)&&this.t>=(u.powerCutUntil||0))acceleration=add(acceleration,[0,e.gravity*m.airLift,0]);
  acceleration=limitBodyVector(acceleration,u.forward,mob.accel,base*braking);
  if(groundOnly&&(grounded||landMotor&&(u.jumping||this.t>=(u.jumpBoostUntil||0))))acceleration[1]=0;
  const effort=clamp(length(acceleration)/Math.max(1,base));
  const thrustScale=this.t<u.evadeUntil?(u.activeDodgeThrust??tuning.dodgeThrustMultiplier)/10:terrainRisk?16/10:u.breakaway?(u.breakaway.thrustMultiplier??tuning.tailThrustMultiplier)/10:1;
   if(u.breakaway&&u.entityType!=='ship'){const cost=u.breakaway.style==='boost'?.025:.09;u.stability=clamp(u.stability-cost*dt);}
  const flightCost=u.machine.tags.includes('minovsky-flight')?m.flightPower*.35*power:0;
  const driveCost=(maneuverEnergyCost(u,thrustScale*10,1,this.environment.medium)*effort*power*power+angle/dt*(m.turnEnergyCost??.35)+flightCost)*dt;
  const protectedBuffer=this.t<u.evadeUntil||terrainRisk?0:Math.max(u.defenseEnergyReserve||0,emergencyEnergyReserve(u,this.t,this.environment.medium,this.rules.stepSeconds)),supplied=spendEnergy(u,Math.min(driveCost,Math.max(0,u.energy-protectedBuffer))),driveFraction=driveCost>1e-9?supplied/driveCost:1;
  acceleration=mul(acceleration,driveFraction);
  const flight=u.machine.tags.includes('minovsky-flight')?clamp(u.energy/10)*driveFraction:0;
  const air=sub(u.velocity,e.windMps),drag=mul(air,m.dragCoefficient*e.density*length(air)*(u.position[1]<0?5:1));
  acceleration=add(sub(acceleration,drag),[0,-e.gravity*(1-flight)*(this.environment.medium==='water'?1-(m.waterBuoyancy??0):1),0]);if(u.position[1]<0&&(this.environment.medium==='water'))acceleration=mul(acceleration,.72);
  const speedBefore=length(u.velocity);
  u.acceleration=acceleration;u.velocity=add(u.velocity,mul(acceleration,dt));const speed=length(u.velocity);if(speed>speedLimit){if(landMotor){const horizontal=Math.hypot(u.velocity[0],u.velocity[2]);if(horizontal>speedLimit){u.velocity[0]*=speedLimit/horizontal;u.velocity[2]*=speedLimit/horizontal;}}else u.velocity=mul(u.velocity,speedLimit/speed);}u.speedRate=(length(u.velocity)-speedBefore)/dt;u.position=add(u.position,mul(u.velocity,dt));
  rechargeEnergy(u,dt);
  const armor=m.energyArmor;if(armor){const idle=armor.idleCostPerS*dt;u.energyArmorActive=u.energy>=idle&&u.totalEnergy>=idle;if(u.energyArmorActive)spendEnergy(u,idle);}
  if(!hasUnlimitedEnergy(u)&&(u.totalEnergy??0)<=0)this.notice(u,'总能源耗尽','warning','energy-empty',2);
  if((this.environment.medium==='water')&&u.position[1]<0){const damping=u.machine.tags.includes('water-specialized')?0:u.machine.tags.includes('water-combat')?(u.entityType==='ship'?.08:.18):1.5;u.velocity=mul(u.velocity,Math.exp(-damping*dt));if(u.entityType!=='ship')u.stability=clamp(u.stability-.18*dt);u.submerged=true;}else u.submerged=false;
 }
 friendlyFireBlocked(u,target){
  if(u.lineCache?.tick!==this.tick)u.lineCache={tick:this.tick,targets:new Map()};const cache=u.lineCache.targets;if(cache.has(target.id))return cache.get(target.id);const end=this.observed(u,target);const blocked=this.units.some(x=>x!==u&&x.alive&&!x.docked&&x.side===u.side&&hullEntry(x,u.position,end,x.position,2)!==null);cache.set(target.id,blocked);return blocked;
 }
 meleeFriendlyBlocked(u,target,w){
  // Sword contact covers a swept sector, wider than a gun's center ray. Use the
  // same range/arc with three short velocity projections before starting a cut.
  const observed=this.observed(u,target),axis=norm(sub(observed,u.position));
  for(const ally of this.spatial.sides[u.side]||[]){
   if(ally===u||!ally.alive||ally.docked||ally.id===u.mountId||ally.mountId===u.id||u.mountId&&ally.mountId===u.mountId)continue;
   const offset=sub(ally.position,u.position),relative=sub(ally.velocity,u.velocity),far=w.sim.rangeM+length(relative)*(w.sim.windupS+.35)+ally.machine.sim.radiusM;
   if(length(offset)>far)continue;
   for(const ahead of [0,w.sim.windupS,w.sim.windupS+.35]){
    const point=add(offset,mul(relative,ahead));
    if(length(point)>w.sim.rangeM+ally.machine.sim.radiusM)continue;
    const enemy=add(sub(observed,u.position),mul(sub(target.velocity,u.velocity),ahead));
    if(length(point)<=length(enemy)+ally.machine.sim.radiusM&&arcSolution(axis,point,w.sim).inside)return true;
   }
  }
  return false;
 }
 weaponDecision(u,target,state){
  if(this.t<(u.microControlUntil||0)||!mayEngage(this,u,target))return false;
  if(captureFireHeld(this,u,target)||hardwareBusy(u,state)||u.capturedBy||u.grappleTarget||u.captureIntent===target.id||target.capturedBy&&this.unitById.get(target.capturedBy)?.side===u.side)return false;
  if(state.definition.sim.countermeasure||captureObjective(this,u)?.entityId===target.id||!shipWeaponWindow(this,u,target,state))return false;
  const w=state.definition,s=w.sim,locked=(state.fireControl?.locked??u.locked),delta=sub(this.observed(u,target),u.position),distance=length(delta);
  if(state.disabled||state.formDisabled||this.t<(u.loadoutAssemblyUntil||0)||this.t<(u.moduleSeparatedUntil||0)||u.stealthActive||w.kind==='funnel'&&!mountedRemote(this,u,w))return false;
  if(s.environments&&(!s.environments.includes(environmentAt(this,u.position).medium)||!s.environments.includes(environmentAt(this,this.observed(u,target)).medium)))return false;
   if(target.entityType==='remote')return this.available(u,state)&&['beam','ballistic'].includes(w.kind)&&u.stability>.3&&this.t>=u.evadeUntil&&distance<s.rangeM&&this.canSee(u.position,target.position)&&arcSolution(state.turretForward||u.forward,delta,s).inside;
  const dashWindup=w.kind==='melee'&&u.breakaway?.meleeDash&&u.breakaway.target===target.id&&this.t<u.breakaway.until&&u.breakaway.started+u.breakaway.contactIn>this.t-this.rules.stepSeconds;
  if((w.kind==='melee')&&!dashWindup){const relative=sub(target.velocity,u.velocity),contactTime=clamp(-dot(delta,relative)/Math.max(1,dot(relative,relative)),0,.8),miss=length(add(delta,mul(relative,contactTime)));if(miss>s.rangeM+25+(target.entityType==='ship'?target.machine.sim.radiusM:0)&&distance>s.rangeM+(target.entityType==='ship'?target.machine.sim.radiusM:0))return false;}
  if((u.suppressing)&&s.suppressionStage){const earlier=u.weapons.filter(x=>!x.disabled&&x.definition.sim.suppressionStage&&x.definition.sim.suppressionStage<s.suppressionStage);if(earlier.some(x=>x.ammo!==0||x.attack||x.salvo))return false;}
  if(!this.available(u,state)||!(state.fireControl?.targetId===target.id?state.fireControl.visible:u.visible)||distance<s.minRangeM||!arcSolution(state.turretForward||u.forward,delta,s).inside)return false;
  if(w.kind==='melee')return !this.meleeFriendlyBlocked(u,target,w)&&this.t>=(u.meleeBreakUntil||0)&&u.stability>=.2&&(dashWindup||distance<s.rangeM+((target.entityType==='ship')?target.machine.sim.radiusM:0)+Math.max(0,dot(sub(u.velocity,target.velocity),norm(delta)))*(s.windupS+.35));
  if(!GUIDED.has(w.kind)&&((u.pilotState.strategies?.['parallel-fire']??0)>0?this.friendlyFireBlocked(u,target):this.units.some(x=>x!==u&&x.alive&&x.side===u.side&&length(sub(x.position,u.position))<distance&&segmentSphere(sub(u.position,x.position),sub(target.position,x.position),x.machine.sim.radiusM*1.5))))return false;
  if(distance>s.rangeM)return false;
  const pulseDone=this.t>=Math.max(u.evadeStarted+(u.activeDodgePulse??u.pilotState.tactics.dodgePulseS),u.dodgePulseUntil||0),safeFollowup=pulseDone&&!u.dodgeGuided&&(!u.pendingReaction||u.pendingReaction.impactAt>this.t+s.windupS+.2);
   if(u.order==='disengage'||this.t<u.evadeUntil&&!safeFollowup||u.order==='cool'&&weaponEnergyCost(w)>0)return false;
  const reserve=Math.max(u.defenseEnergyReserve||0,emergencyEnergyReserve(u,this.t,this.environment.medium,this.rules.stepSeconds),u.machine.sim.energyCapacity*(shipMainEnergyCost(u,w)!==null?.08:u.pilotState.tactics.energyReserveFraction));
  if(w.kind!=='melee'&&(shipMainEnergyCost(u,w)??weaponEnergyCost(w))>0&&u.energy-(shipMainEnergyCost(u,w)??weaponEnergyCost(w))<reserve&&!(!(u.defenseEnergyReserve>0)&&!emergencyEnergyReserve(u,this.t,this.environment.medium,this.rules.stepSeconds)&&locked&&u.stability>.7&&u.observedCooldownUntil>this.t+s.windupS))return false;
  if(GUIDED.has(w.kind))return locked&&distance>650&&this.projectiles.filter(x=>x.owner===u.id&&x.weaponId===w.id).length<12;
  if(w.kind==='ballistic')return distance<s.rangeM&&(locked||distance<s.effectiveRangeM)&&u.stability>.15;
  // A hand-held beam is allowed on approach unless its burst consumes the blade-ready window.
  if((w.slot||'slot1')==='slot1'){
   const encounter=this.meleeEncounter(u,target),closing=-dot(sub(target.velocity,u.velocity),norm(delta));
   const contact=closing>30?(distance-(encounter?.blade.definition.sim.rangeM||85))/closing:Infinity;
   if(encounter?.imminent&&contact<s.windupS+(s.burstIntervalS??.14)*(s.burst-1)+u.pilotState.tactics.meleeReserveS)return false;
  }
  return u.stability>(u.order==='trailingFire'?.03:.12);
 }
 beginAttack(u,target,state=this.state(u)){
  const evasiveBlade=(u.pilotState.strategies?.['parallel-fire']??0)>0&&state.definition.kind==='melee'&&u.dodgeStyle==='side'&&u.stability>=.2;
  if(!u.alive||u.docked||u.capturedBy||u.grappleTarget||state.disabled||!target.alive||state.attack||state.salvo||u.stability<(u.order==='trailingFire'?.03:.08)||this.t<u.evadeUntil&&!evasiveBlade&&!this.weaponDecision(u,target,state)||this.projectiles.length>=192)return;
  const w=state.definition,s=w.sim,slot=w.slot||'slot1';
  if(this.t<(u.slotReadyAt[slot]||0)||this.t<state.readyAt||!this.weaponDecision(u,target,state))return;
  if(u.order==='boost'&&slot==='slot1')return;
  if(u.order==='drift'&&w.kind==='beam'){
   const c=u.pilotState.tactics,burst=s.burst>1||s.cooldownS<.5,urgent=(u.drift?.until-this.t)<s.windupS+.2;
   if(u.entityType!=='ship'&&(u.stability<(urgent?.16:burst?c.burstStability:c.singleStability)||u.stableTime<(burst?.04:.12)))return;
  }
  if(w.kind==='melee'){
   const delta=sub(this.observed(u,target),u.position),d=length(delta),lead=s.rangeM+((target.entityType==='ship')?target.machine.sim.radiusM:0)+Math.max(0,dot(sub(u.velocity,target.velocity),norm(delta)))*(s.windupS+.25);
   if(d>lead&&!(u.breakaway?.meleeDash&&u.breakaway.target===target.id&&this.t<u.breakaway.until))return;
  }
  const solution=target.entityType==='remote'?{position:target.position,velocity:target.velocity,t:this.t}:((state.fireControl?.solution))||u.fireSolution||u.lastSeen||{position:target.position,velocity:target.velocity,t:this.t};
  state.attack={weaponId:w.id,targetId:target.id,at:Math.ceil((this.t+s.windupS)/this.rules.stepSeconds-1e-9)*this.rules.stepSeconds,solution:{position:[...solution.position],velocity:[...solution.velocity],t:solution.t??this.t}};
  state.attack.aimCommitAt=Math.max(this.t,state.attack.at-Math.max(this.rules.stepSeconds,u.pilotState.sim.reactionS*(1-u.pilotState.sim.tracking*.5)));
   if(s.windupS>0){this.emit('aim',u.id,u.machine.name+' '+w.name+(w.kind==='melee'?'挥斩准备':'瞄准准备'),{weapon:w.id,kind:w.kind,slot,target:target.id,readyAt:state.attack.at});
   this.notice(u,w.kind==='melee'?'光束军刀起手':w.name+'瞄准','info','aim-'+slot,1.4);this.warn(target,u,w,'windup');}
 }
 fullSalvoWindow(u,target,state){
  const c=u.pilotState.tactics,d=length(sub(target.position,u.position)),s=state.definition.sim;
  return target.alive&&u.visible&&u.locked&&u.stability>.45&&d>s.minRangeM&&d<s.effectiveRangeM&&(length(target.velocity)<c.allOutMaxSpeed||target.speedRate<-120)&&dot(sub(target.velocity,u.velocity),norm(sub(target.position,u.position)))<200;
 }
 releaseAttack(u,target,state=this.state(u)){
  if(this.t<(u.microControlUntil||0)){this.cancelAttacks(u);return;}
  const w=state.definition,s=w.sim;updateAttackAim(this,u,state);
  if(state.attack&&state.attack.at<=this.t){
   const attack=state.attack;state.attack=null;target=this.units.find(x=>x.id===attack.targetId)||this.remoteTarget(attack.targetId)||{alive:false};
   if(captureFireHeld(this,u,target))return;
   // A committed sword stroke is not silently cancelled by its own tracking turn.
    // Impacts, evasions and slot changes already interrupt attack preparation.
    const bladeContinuation=(w.kind==='melee')&&this.t>=(u.meleeBreakUntil||0)&&this.available(u,state)&&u.visible&&arcSolution(u.forward,sub(this.observed(u,target),u.position),s).inside;
    if(!target.alive||!bladeContinuation&&!this.weaponDecision(u,target,state)||this.t<u.evadeUntil&&w.kind==='melee'&&!bladeContinuation)return;
   let count=(u.suppressing)?Math.min(s.salvoBurst||s.burst,state.ammo):s.burst,allOut=false;const c=u.pilotState.tactics;
   if(GUIDED.has(w.kind)&&s.salvoBurst>s.burst&&this.t>=(u.salvoRetryAt||0)&&this.fullSalvoWindow(u,target,state)){
    u.salvoRetryAt=this.t+c.allOutRetryS;const roll=this.random();if(roll<c.allOutChance*((Math.min(1.25,u.pilotState.strategies?.['low-speed-barrage']??1)))){count=s.salvoBurst;allOut=true;this.emit('strategy',u.id,u.machine.name+' 抓住低速/制动窗口，全弹射击',{weapon:w.id,target:target.id,roll,chance:c.allOutChance});}
   }
   count=Math.min(count,state.ammo<0?count:state.ammo,(shipMainEnergyCost(u,w)??weaponEnergyCost(w))===0?count:Math.floor(u.energy/(shipMainEnergyCost(u,w)??weaponEnergyCost(w))));if(count<1)return;
   state.readyAt=this.t+s.cooldownS+(count-1)*(s.burstIntervalS??.14);
    if(['main-battery','heavy-main'].includes(shipWeaponRole(u,w)))u.mainBusReadyAt=this.t+Math.max(3,s.cooldownS*.4);
   state.salvo={targetId:target.id,remaining:count,total:count,index:0,nextAt:this.t,allOut,committedBlade:bladeContinuation,solution:attack.solution||{position:[...target.position],velocity:[...target.velocity],t:this.t}};
  }
  const salvo=state.salvo;if(!salvo||salvo.nextAt>this.t)return;
  target=this.units.find(x=>x.id===salvo.targetId)||this.remoteTarget(salvo.targetId);
  const committedBlade=(salvo.committedBlade)&&w.kind==='melee'&&this.t>=(u.meleeBreakUntil||0)&&this.available(u,state)&&u.visible&&(this.t>=u.evadeUntil||(u.pilotState.strategies?.['parallel-fire']??0)>0&&u.dodgeStyle==='side'&&u.stability>=.2)&&arcSolution(u.forward,sub(this.observed(u,target),u.position),s).inside;
  if(!u.alive||!target?.alive||captureFireHeld(this,u,target)||!committedBlade&&!this.weaponDecision(u,target,state)||(salvo.allOut&&!this.fullSalvoWindow(u,target,state))){state.salvo=null;return;}
  if(w.kind!=='melee'&&this.projectiles.length>=192){salvo.nextAt=this.t+this.rules.stepSeconds;return;}
  salvo.index++;salvo.remaining--;salvo.nextAt=this.t+(s.burstIntervalS??.14);
  if(state.ammo>=0)state.ammo--;spendEnergy(u,shipMainEnergyCost(u,w)??weaponEnergyCost(w));state.shots++;state.shotsByTarget={...state.shotsByTarget,[target.id]:(state.shotsByTarget?.[target.id]||0)+1};u.shots++;u.lastFiredAt=this.t;
  const nextReady=Math.min(...u.weapons.filter(x=>this.available(u,x)&&x.definition.kind!=='melee'&&!isLightAutomatic(x.definition)).map(x=>x.salvo?.remaining>0?x.salvo.nextAt:Math.max(this.t,x.readyAt)+x.definition.sim.windupS+(u.slotSelected[x.definition.slot||'slot1']===x.definition.id?0:(x.definition.sim.switchS??.18))));
  if(this.t-target.lastSeenAt<.5&&target.targetId===u.id)target.observedCooldownUntil=Number.isFinite(nextReady)?nextReady:this.t;
  const distance=length(sub(target.position,u.position)),toward=norm(sub(target.position,u.position));
  this.emit('shot',u.id,u.machine.name+' 使用 '+w.name,{weapon:w.id,kind:w.kind,slot:w.slot||'slot1',burst:1,burstIndex:salvo.index,plannedBurst:salvo.total,allOut:salvo.allOut,target:target.id,order:u.order,stability:u.stability,stableTime:u.stableTime,distance});
  this.notice(u,w.name+(salvo.total>1?' '+salvo.index+'/'+salvo.total:''),'info','fire-'+(w.slot||'slot1'),w.kind==='melee'?.65:.55);const weaponNotice=this.effects.at(-1);if(weaponNotice?.type==='notice'&&weaponNotice.actor===u.id)weaponNotice.weaponNotice=true;
  if((state.ammo===0)){this.emit('magazine-empty',u.id,u.machine.name+' '+w.name+' 弹药射空',{weapon:w.id,target:target.id});this.notice(u,w.name+' 射空','warning','empty-'+w.id,.9);}
  if(s.recoilCost&&u.entityType!=='ship')u.stability=clamp(u.stability-s.recoilCost);
  if(w.kind==='melee'){
   prepareMaximumOutput(this,u,state);
   u.stability=clamp(u.stability-u.pilotState.tactics.meleeSwingCost);u.stableTime=0;
   this.effects.push({type:'slash',t:this.t,life:.42,from:[...u.position],to:add(u.position,mul(toward,s.rangeM)),actor:u.id,reachM:s.rangeM,meleeStyle:weaponVisual(w)});
   // A committed stroke enters one bounded numerical exchange after movement.
    // Effects depict it; rendered blade intersection cannot score the attack.
    u.swing={weaponId:w.id,targetId:target.id,started:this.t,forward:[...u.forward],until:this.t+.35};
  }else{
   // Aim commits before the defender reacts. No beam homing after emission.
   // Each burst aim is prepared between shots, not snapped to a fresh solution on the firing tick.
   const observed=target.entityType==='remote'?{position:target.position,velocity:target.velocity,t:this.t}:salvo.solution;
   const age=Math.max(0,this.t-observed.t),current=add(observed.position,mul(observed.velocity,age)),flightLimit=Math.min(s.lifeS,s.rangeM/Math.max(1,s.projectileSpeedMps)),muzzleBase=w.turret?globalPoint(u,w.turret.position):u.position;
   const firstLead=interceptPoint(muzzleBase,current,observed.velocity,s.projectileSpeedMps,flightLimit).position,muzzle=add(muzzleBase,mul(norm(sub(firstLead,muzzleBase)),w.turret?5:u.machine.sim.radiusM+4));
   const lead=interceptPoint(muzzle,current,observed.velocity,s.projectileSpeedMps,flightLimit).position;
   if((u.suppressing)&&s.suppressionStage){
    const samples=u.observations||[],a=samples.at(-2),z=samples.at(-1),sampleDt=a&&z?Math.max(.05,z.t-a.t):1;
    const measured=a&&z?mul(sub(z.velocity,a.velocity),1/sampleDt):[0,0,0],accel=mul(measured,Math.min(1,120/Math.max(1,length(measured))));
    const horizon=Math.min(.65,distance/s.projectileSpeedMps),axis=bodyBasis(toward);
    const lane=s.suppressionStage===1?((salvo.index-1)%3-1)*Math.min(45,distance*.009):0;
    const adjusted=add(lead,add(mul(accel,.5*horizon*horizon),mul(axis.right,lane)));
    for(let i=0;i<3;i++)lead[i]=adjusted[i];
   }
   const basis=bodyBasis(toward),arc=arcSolution(state.turretForward||u.forward,toward,s),precision=(target.entityType==='remote'||(state.fireControl?.locked??u.locked))?.22:1.1;
   const spread=s.spreadRad*precision*arc.spreadMultiplier*(1+(1-u.pilotState.sim.aim)+(1-u.stability)*2+(1-u.components.weapon)) / Math.max(.5,aimDistanceFactor(s,distance));
   const offset=add(mul(basis.right,clamp(this.gaussian(),-2,2)*distance*spread),mul(basis.up,clamp(this.gaussian(),-2,2)*distance*spread));
   const aimPoint=add(lead,offset),dir=norm(sub(aimPoint,u.position)),origin=w.turret?add(globalPoint(u,w.turret.position),mul(dir,5)):add(u.position,mul(dir,u.machine.sim.radiusM+4));
   const firedKind=mountedRemote(this,u,w)?(w.remoteControl.projectileKind||'beam'):w.kind;
   const pelletCount=(Math.min(s.pellets||1,192-this.projectiles.length));for(let pellet=0;pellet<pelletCount;pellet++){const angle=pellet/pelletCount*Math.PI*2,rad=pelletCount>1&&pellet?Math.sqrt(pellet/pelletCount)*s.spreadRad:0;const pelletDir=norm(add(dir,add(mul(basis.right,Math.cos(angle)*rad),mul(basis.up,Math.sin(angle)*rad))));this.projectiles.push({order:u.order,id:++this.sequence,owner:u.id,target:target.id,weaponId:w.id,kind:firedKind,...(firedKind==='ballistic'&&s.impactMode==='area'?{fuseDistance:Math.min(s.rangeM,length(sub(aimPoint,origin))),fusePoint:[...aimPoint]}:{}),remoteTarget:target.entityType==='remote',position:origin,previous:[...origin],velocity:mul(pelletDir,s.projectileSpeedMps),age:0,traveled:0,weapon:s,lane:salvo.index%2?1:-1,guiding:true,trace:[[...origin]]});if(pelletCount>1)this.effects.push({type:'tracer',vulcan:false,scatter:true,visualProfile:'scatter',projectileSpeedMps:s.projectileSpeedMps,t:this.t,life:Math.min(s.lifeS,s.rangeM/s.projectileSpeedMps+.15),from:[...origin],to:add(origin,mul(pelletDir,s.rangeM)),actor:u.id});}
   const visualRange=Math.min(s.rangeM,Math.max(distance+100,length(sub(aimPoint,origin))+target.machine.sim.radiusM));
   if(!GUIDED.has(w.kind)&&pelletCount===1)this.effects.push({type:firedKind==='beam'?'beam':'tracer',vulcan:weaponVisual(w,firedKind)==='vulcan',visualProfile:weaponVisual(w,firedKind),projectileSpeedMps:s.projectileSpeedMps,beamClass:s.beamClass,beamRifle:w.kind==='beam'&&(w.template==='beam-rifle'||w.tags?.includes('beam-rifle')||w.id.endsWith('-rifle')),t:this.t,life:firedKind==='beam'?.55:Math.min(s.lifeS,visualRange/s.projectileSpeedMps+.12),from:origin,to:add(origin,mul(dir,visualRange)),actor:u.id,...shipShotCue(u,w),...(shipWeaponRole(u,w)==='heavy-main'?{life:1.6}:shipWeaponRole(u,w)==='main-battery'?{life:1.05}:{})});
   const candidates=this.projectiles.slice(-pelletCount),delta=sub(target.position,origin);
   const threatOf=fired=>{if(isAreaShot(fired)){const tti=fired.fuseDistance/Math.max(1,length(fired.velocity));return {fired,tti,clearance:length(sub(add(target.position,mul(target.velocity,tti)),fired.fusePoint))};}const relative=sub(fired.velocity,target.velocity),tti=Math.max(0,dot(delta,relative)/Math.max(1,dot(relative,relative)));return {fired,tti,clearance:length(sub(delta,mul(relative,tti)))};};
   const closestThreat=candidates.map(threatOf).sort((a,b)=>a.clearance-b.clearance||a.tti-b.tti)[0],fired=closestThreat.fired,relative=sub(fired.velocity,target.velocity),closest=closestThreat.tti;
   this.warn(target,u,firedKind===w.kind?w:{...w,kind:firedKind},'launch',dir,{id:fired.id,direct:!GUIDED.has(w.kind),position:origin,velocity:fired.velocity,tti:closest,clearance:closestThreat.clearance,...(isAreaShot(fired)?{fusePoint:fired.fusePoint,blastRadiusM:s.blastRadiusM}:{} )});
  }
  // Retain the committed solution; updateSalvoAim corrects it between rounds.
  if(salvo.remaining>0)salvo.aimSampleAt=salvo.solution?.t;
  if(salvo.remaining<=0){state.salvo=null;if(u.drift?.phase==='aim'&&u.drift.weaponId===w.id){u.drift.phase='boost';u.drift.boostUntil=this.t+u.pilotState.tactics.boostSeconds;u.nextDecision=this.t;}}
 }
 serviceWeapons(u){
  if(!u.alive)return;const target=this.targetFor(u);
  for(const [slot,id]of Object.entries(u.slotSelected)){
   const states=u.weapons.filter(x=>(x.definition.slot||'slot1')===slot&&!x.disabled&&!x.formDisabled);
   let state=this.state(u,id);
   if(!state.attack&&!state.salvo){
    const encounter=['trailingFire','bladeEvade'].includes(u.order)?null:this.meleeEncounter(u,target),closing=encounter?Math.max(0,dot(sub(u.velocity,u.lastSeen?.velocity||target.velocity),norm(sub(this.observed(u,target),u.position)))):0;
    const reserve=encounter&&(this.bladeReserve(u,target,encounter)||(u.order==='melee'||u.guardUntil>this.t)&&encounter.distance<encounter.blade.definition.sim.rangeM+closing*(encounter.blade.definition.sim.windupS+(encounter.blade.definition.sim.switchS??.18)+u.pilotState.sim.reactionS+.4)+80);
    const blade=reserve?this.bestBlade(u,target):null,ownsBlade=blade&&blade.definition.slot===slot;
    const best=ownsBlade?blade:states.map(x=>({state:x,score:weaponUtility(this,u,x,target)})).filter(x=>Number.isFinite(x.score)).sort((a,z)=>z.score-a.score)[0]?.state;if(best)state=this.selectWeapon(u,best,ownsBlade?'交会接触保留刀槽':'独立武器槽');
   }
   if(state.definition.kind==='funnel'&&!mountedRemote(this,u,state.definition)){this.launchRemote?.(u,target,state);continue;}
   const mountTarget=weaponTarget(this,u,state,target);this.beginAttack(u,mountTarget,state);this.releaseAttack(u,mountTarget,state);
  }
 }
 flyProjectiles(previous,dt){
  const remaining=[],projectileStarts=(new Map(this.projectiles.map(p=>[p.id,[...p.position]])));
  for(const shot of this.projectiles){
   const target=this.units.find(u=>u.id===shot.target)||this.remoteTarget(shot.target),owner=this.units.find(u=>u.id===shot.owner),idx=this.units.indexOf(target),w=shot.weapon;
   if(!owner||!target&&!shot.remoteTarget||target&&idx<0&&target.entityType!=='remote')continue;
   shot.age+=dt;shot.previous=[...shot.position];
   if(isAreaShot(shot)&&Number.isFinite(shot.fuseDistance)){const tti=Math.max(0,(shot.fuseDistance-shot.traveled)/Math.max(1,length(shot.velocity)));if(tti<=1.2){shot.areaWarnings??=[];for(const unit of this.units){if(unit===owner||!unit.alive||unit.docked||shot.areaWarnings.includes(unit.id))continue;const clearance=length(sub(add(unit.position,mul(unit.velocity,tti)),shot.fusePoint));if(clearance>unit.machine.sim.radiusM+w.blastRadiusM+8)continue;shot.areaWarnings.push(unit.id);const definition=owner.weapons.find(x=>x.definition.id===shot.weaponId)?.definition||{id:shot.weaponId,name:'区域炮弹',kind:shot.kind,sim:w};this.warn(unit,owner,definition,'launch',norm(shot.velocity),{id:shot.id,direct:true,position:shot.position,velocity:shot.velocity,tti,clearance,fusePoint:shot.fusePoint,blastRadiusM:w.blastRadiusM});}}}
   if(GUIDED.has(shot.kind)&&(target?.alive||target?.coreActive)){
    const delta=sub(target.position,shot.position),distance=length(delta),heading=norm(shot.velocity);
    const seeker=!shot.seekerFailed&&distance<this.environment.sim.visibilityM&&dot(heading,norm(delta))>Math.cos(Math.min(75,w.seekerHalfAngleDeg)*DEG);
    shot.blindTime=seeker?0:(shot.blindTime||0)+dt;if(shot.blindTime>=.25)shot.seekerFailed=true;
    if(seeker){
     let aim=add(target.position,mul(target.velocity,Math.min(.5,distance/w.projectileSpeedMps)));
     if(shot.kind==='funnel-missile'&&shot.age<.5){const side=bodyBasis(norm(delta)).right;aim=add(aim,mul(side,shot.lane*Math.min(35,distance*.035)*(1-shot.age/.5)));}
     const maxTurn=Math.min(w.turnRateDeg*DEG,(w.maxLateralAccelMps2??140)/Math.max(1,length(shot.velocity)));
     shot.velocity=mul(rotateToward(heading,norm(sub(aim,shot.position)),maxTurn*dt),w.projectileSpeedMps);
    }else if(shot.guiding){this.emit('seeker-lost',target.id,target.machine.name+' 切出导弹导引视场');this.notice(target,'导弹失去导引','good','seeker',1.8);}
    shot.guiding=seeker;
   }
   const travel=Math.min(length(shot.velocity)*dt,Math.max(0,w.rangeM-shot.traveled));
   let next=add(shot.position,mul(norm(shot.velocity),travel));shot.traveled+=travel;const fuse=fuseCrossing(shot,travel);if(fuse!==null){next=add(shot.position,mul(sub(next,shot.position),fuse));shot.traveled-=travel*(1-fuse);}attenuateBeam(this,shot,next);
   if(w.environments&&!w.environments.includes(environmentAt(this,next).medium)){this.emit("medium-stop",shot.owner,"弹体离开可作战介质，推进/制导失效",{weapon:shot.weaponId,position:next});continue;}
   if((shot.interceptTarget)){const missile=this.projectiles.find(p=>p.id===shot.interceptTarget&&!p.intercepted),start=projectileStarts.get(missile?.id);if(missile&&start&&segmentSphere(sub(shot.position,start),sub(next,add(start,mul(missile.velocity,dt))),Math.max(2,missile.weapon.blastRadiusM*.12))){missile.intercepted=true;this.emit('intercept',shot.owner,'近防弹道在实际交会点击毁来袭弹体',{projectile:missile.id});continue;}}
   // Sweep relative motion against all bodies and resolve the first intersected hull.
   let victim=null,contact=Infinity;
   // Ordinary beams may pass a contacted pilot who wins a micro-control save.
   // Query again so an obstacle or second body on this same segment still blocks.
   let hit=projectileContact(this,shot,next,previous,dt),saved=0;while(hit?.unit&&saved<this.units.length&&evadeBeamContact(this,shot,hit.unit)){shot.ignoredUnitIds??=[];shot.ignoredUnitIds.push(hit.unit.id);saved++;hit=projectileContact(this,shot,next,previous,dt);}

   {if(hit?.unit){victim=hit.unit;contact=hit.at;shot.segmentEnd=next;shot.componentId=hit.componentId||null;}else if(hit){const position=add(shot.position,mul(sub(next,shot.position),hit.at));if(isAreaShot(shot)){if(hit.obstacle)damageObstacle(this,hit.obstacle,shot,position);if(hit.object&&!coreHit(this,hit.object,shot))hit.object.life=0;if(hit.drone){hit.drone.health=Math.max(0,(hit.drone.health??12)-w.damage*this.rules.damageMultiplier);hit.drone.dead=hit.drone.health<=0;}detonateArea(this,shot,position);smokeAtSurface(this,position,w.damage);continue;}if(hit.obstacle)damageObstacle(this,hit.obstacle,shot,position);this.effects.push({type:'impact',t:this.t,life:.5,position,actor:hit.object?.id??null});if(hit.drone){hit.drone.health=Math.max(0,(hit.drone.health??12)-w.damage*this.rules.damageMultiplier);if(hit.drone.health<=0){hit.drone.dead=true;const parent=this.unitById.get(hit.drone.owner),state=parent?.weapons.find(w=>w.definition.id===hit.drone.weaponId);if(state){state.droneLost??=[];state.droneLost[hit.drone.batteryIndex]=true;}this.emit('remote-destroyed',shot.owner,'真实弹道击毁遥控终端',{terminal:hit.drone.id,owner:hit.drone.owner});}owner.hits++;const state=owner.weapons.find(w=>w.definition.id===shot.weaponId);if(state)state.hits++;}if(hit.object?.module){const host=this.unitById.get(hit.object.owner);if(host?.alive)this.damage(host,{...shot,weapon:{...w,damage:w.damage*.55}});}if(hit.object&&!coreHit(this,hit.object,shot)){hit.object.life=0;this.emit('debris-hit',shot.owner,'攻击被卸装物拦截',{object:hit.object.id,position});}smokeAtSurface(this,position,w.damage);continue;}}
   if(victim){
    shot.contactPoint=add(shot.position,mul(sub(next,shot.position),contact));
    shot.traveled-=length(sub(next,shot.position))*(1-contact);if(isAreaShot(shot)){detonateArea(this,shot,shot.contactPoint);smokeAtSurface(this,shot.contactPoint,w.damage);continue;}this.damage(victim,shot);if(GUIDED.has(shot.kind))this.effects.push({type:'explosion',t:this.t,life:.9,position:[...victim.position],actor:victim.id});
   }else if(fuse!==null){detonateArea(this,shot,next);smokeAtSurface(this,next,w.damage);
   }else if(shot.age<w.lifeS&&shot.traveled<w.rangeM&&(true)){shot.position=next;shot.trace.push([...next]);if(shot.trace.length>10)shot.trace.shift();remaining.push(shot);}
   else {if(!shot.remoteTarget)this.recordExchange(owner,shot.target,shot.kind,'miss',0,owner.weapons.find(w=>w.definition.id===shot.weaponId)?.definition);if(!isLightAutomatic(owner.weapons.find(w=>w.definition.id===shot.weaponId)?.definition||{kind:shot.kind,sim:shot.weapon}))this.adapt(owner,'miss',shot.order);this.emit('miss',owner.id,owner.machine.name+' 攻击未命中，重新评估策略');if(target?.alive&&target.entityType!=='remote')this.notice(target,'攻击落空','good','dodge',1.5);}
  }
  this.projectiles=remaining.filter(p=>!p.intercepted);
  if(this.pendingReflections?.length){this.projectiles.push(...this.pendingReflections);this.pendingReflections=[];}
 }
 damage(u,shot){
  this.random=this.randomFor(shot.owner,'damage');
  const attacker=this.unitById.get(shot.owner),hitWeapon=attacker?.weapons.find(w=>w.definition.id===shot.weaponId),light=isLightAutomatic(hitWeapon?.definition||{kind:shot.kind,sim:shot.weapon});
   const baseRaw=shot.weapon.damage*weaponDamageScale(hitWeapon?.definition||{kind:shot.kind,sim:shot.weapon},u)*(this.rules.damageMultiplier??3.25)*rangeFactor(shot.weapon,shot.traveled||0)*(1+(this.random()*2-1)*this.rules.damageVariance);
  const protectedRaw=seedDefense(this,u,shot,baseRaw),guard=protectedRaw>.001?beamGuard(this,shot,u):null,raw=protectedRaw*(guard?.damageFactor??1);
   if(guard){this.emit('guard',u.id,u.machine.name+(guard.shield?' 举盾格挡':' 架势格挡'),{attacker:shot.owner,weapon:shot.weaponId,kind:shot.kind,shield:guard.shield,reduction:1-guard.damageFactor,stabilityReduction:1-guard.stabilityFactor,position:[...u.position]});this.notice(u,guard.shield?'举盾格挡':'格挡','good','guard',.35);}
  if(u.machine.powerSystem&&raw<.001){if(!light)grappleImpact(this,u,(shot.defensePhysicalBlocked||0)*.25,shot.owner);const attacker=this.unitById.get(shot.owner);if(attacker){attacker.hits++;const hitWeapon=attacker.weapons.find(w=>w.definition.id===shot.weaponId);if(hitWeapon)hitWeapon.hits++;}this.emit('blocked',u.id,u.machine.name+' 防护抵消攻击',{attacker:shot.owner,weapon:shot.weaponId,kind:shot.kind});return;}
  const stabilityBefore=u.stability;
  const frontal=dot(u.forward,norm(mul(shot.velocity,-1)))>.25;
  const energyArmor=u.machine.sim.energyArmor,armorCost=energyArmor&&energyArmor.types.includes(shot.kind)?raw*energyArmor.costPerDamage:0;
  const armorBoost=armorCost>0&&u.energyArmorActive!==false?energyArmor.absorptionBoost*spendEnergy(u,armorCost)/armorCost:0;
  const absorption=clamp(this.rules.armorAbsorption+armorBoost,0,.95)*(frontal?1:.55)*(shot.kind==='melee'?.55:1);
  const absorbed=Math.min(u.armor,raw*absorption),penetrated=raw-absorbed;
  // A melee result without an actual contact point is hull damage, not an invented center/cockpit hit.
  const geometricComponent=light||shot.areaDamage||u.machine.powerSystem&&shot.kind==='melee'&&!shot.position&&!shot.contactPoint?null:componentImpact(this,u,shot,penetrated);
  const localPart=u.machine.powerSystem&&geometricComponent&&!geometricComponent.critical;
  const hullDamage=localPart?penetrated*.2:penetrated;
  const consequence=u.machine.powerSystem?hullDamage+absorbed*.2+(localPart?penetrated*.3:0):penetrated;
  if(!light){u.recentDamage=(u.recentDamage||0)*Math.exp(-(this.t-(u.lastDamageAt||0))/4)+consequence;u.lastDamageAt=this.t;}
  u.armor=Math.max(0,u.armor-absorbed);u.structure=Math.max(0,u.structure-hullDamage);
  const impact=u.machine.powerSystem?consequence:raw,severe=!light&&impact>0&&(shot.kind!=='ballistic'||impact/u.machine.sim.structure>=.04);
  if(!light&&u.entityType!=='ship'){
  u.stability=clamp(u.stability-Math.min(.85,impact/u.machine.sim.structure*(severe?2.8:1.2))*(guard?.stabilityFactor??1));
  if(severe){this.interrupt(u,'受击失稳');u.recoveryDebuffUntil=Math.max(u.recoveryDebuffUntil||0,this.t+u.pilotState.tactics.impactRecoveryS);u.recoveryDebuff='受击震荡';this.cancelAttacks(u);}
  else if(u.stability<.12){this.cancelAttacks(u);u.nextDecision=this.t;}
  }
  if(!light)u.nextDecision=this.t;
  // Impact motion is calibrated to a 75-ton suit and decreases with hull mass.
  // This is a bounded gameplay impulse, separate from actual armor/component damage.
  const impulse=norm(shot.velocity),impactSpeed=light?0:Math.min(16,impact*.3)*Math.min(1,75000/u.machine.sim.massKg);u.velocity=add(u.velocity,mul(impulse,impactSpeed));if(!light&&u.entityType!=='ship')u.forward=rotateToward(u.forward,norm(add(u.forward,mul(bodyBasis(u.forward).up,(this.random()-.5)*1.3))),Math.min(.4,impact*.008));
  if(!light&&u.entityType!=='ship')this.notice(u,(severe?'受击失稳':'轻弹命中')+' · 稳定 '+Math.round(u.stability*100)+'%','damage','stability',.3);
  const component=geometricComponent?.role||[null,'sensor','weapon'][Math.floor(this.random()*3)];if(!light&&component&&!Object.keys(u.componentState||{}).length)u.components[component]=Math.max(.35,u.components[component]-penetrated*this.rules.componentDamageFraction);
  attacker.hits++;attacker.damage+=hullDamage;if(hitWeapon)hitWeapon.hits++;
  const exchangeWeapon=attacker.weapons.find(w=>w.definition.id===shot.weaponId)?.definition||{kind:shot.kind,sim:shot.weapon};
  this.recordExchange(attacker,u.id,shot.kind,'gain',consequence+absorbed*.35,exchangeWeapon);this.recordExchange(u,attacker.id,shot.kind,'loss',consequence+absorbed*.35,exchangeWeapon);
  if(!light){this.adapt(attacker,'hit',shot.order);this.adapt(u,'hurt');}
  if(!light)grappleImpact(this,u,hullDamage+absorbed*.25+(shot.defensePhysicalBlocked||0)*.25,shot.owner);
  this.emit('hit',shot.owner,attacker.machine.name+' 命中 '+u.machine.name+'，装甲 -'+absorbed.toFixed(1)+' / 结构 -'+hullDamage.toFixed(1),{target:u.id,armorDamage:absorbed,structureDamage:hullDamage,component,weapon:shot.weaponId,kind:shot.kind,guarded:!!guard,shieldGuard:!!guard?.shield,position:[...u.position],stabilityLoss:clamp(stabilityBefore-u.stability)});
  this.notice(u,(frontal?'':'侧后受击 ')+ '结构 -'+hullDamage.toFixed(0),'damage','damage',.12);
  this.effects.push({type:'impact',t:this.t,life:.55,position:[...u.position],actor:u.id,kind:shot.kind,guarded:!!guard,severity:light?0:Math.max(clamp(stabilityBefore-u.stability),clamp(penetrated/u.machine.sim.structure))});
  if(u.components[component]<.65)this.notice(u,({engine:'推进',sensor:'传感',weapon:'武器'})[component]+'受损','damage','component-'+component,3);
  if(u.structure<=0)this.destroy(u,'结构失效',shot);if(u.disabled&&!u.coreActive){u.velocity=[0,0,0];u.acceleration=[0,0,0];}
 }
 disable(u,reason){if(!u.alive)return;const velocity=[...u.velocity];u.disabled=true;u.alive=false;u.structure=0;u.stability=0;u.velocity=[0,0,0];u.acceleration=[0,0,0];u.desired=[0,0,0];clearReactions(u);u.pendingGuard=null;u.swing=null;u.evadeUntil=0;u.stealthActive=false;u.defenseActive=false;u.energyArmorActive=false;u.locked=false;u.lockedTargetId=null;u.order='disabled';this.cancelAttacks(u);for(const d of this.drones||[])if(d.owner===u.id){d.phase='return';d.aim=null;}this.emit('disabled',u.id,u.machine.name+' 失能：无法攻击与移动',{reason});this.notice(u,'失能 · 等待救援','warning','disabled',1.2);launchCore(this,u,velocity);}
 destroy(u,reason,shot){if(!u.alive)return;const attacker=shot&&this.unitById.get(shot.owner);if(attacker&&attacker.side!==u.side&&disablesOnLethal(attacker)){this.disable(u,reason);return;}u.alive=false;clearReactions(u);u.structure=0;u.locked=false;this.cancelAttacks(u);this.emit('destroyed',u.id,u.machine.name+' 被击毁：'+reason);this.notice(u,'机体击毁','damage','destroyed',0);this.effects.push({type:'explosion',t:this.t,life:3,position:[...u.position],actor:u.id});}
 step(){return stepV5(this);}
 snapshot(){
  const attackers=new Map();for(const x of this.units){const target=this.unitById.get(x.lockedTargetId);if(x.alive&&target&&x.side!==target.side&&!attackers.has(target.id))attackers.set(target.id,x.id);}
  return {commandTargets:[...new Set(this.units.filter(u=>u.side==='a'&&u.alive).flatMap(u=>[...u.contacts].filter(([id,c])=>this.t-c.observedAt<=.8&&this.unitById.get(id)?.alive).map(([id])=>id)))],commands:this.units.filter(u=>u.commandAssignment).map(u=>({unitId:u.id,...u.commandAssignment})),learning:[],t:this.t,tick:this.tick,result:this.result,units:this.units.map(u=>{
   const state=this.state(u),w=state.definition,target=this.targetFor(u),direction=sub(this.observed(u,target),u.position),arc=arcSolution(u.forward,direction,w.sim);
   return {...(hasUnlimitedEnergy(u)?{unlimitedEnergy:true}:{}),...(u.disabled!==undefined?{disabled:u.disabled,...(u.machine.moduleSystem?.coreFlight?{coreActive:!!u.coreActive,coreStructure:u.coreStructure??null}:{})}:{}),...(u.machine.defenses?{defenseLayers:u.machine.defenses.map(d=>({type:d.type,capacity:d.capacity,active:d.upkeep>0||d.energyPerDamage>0||['ps','tp','vps'].includes(d.type)}))}:{}),...(u.machine.defenses?.some(d=>d.capacity)?{defenseIntegrity:{...u.defenseIntegrity}}:{}),...(u.machine.moduleSystem?{moduleSeparated:this.t<(u.moduleSeparatedUntil||0)}:{}),...((u.machine.forms||u.machine.loadoutSystem)?{formId:u.formId}:{}),...(u.machine.stealth?{stealthActive:u.stealthActive||false}:{}),...(u.machine.defenses?{defenseActive:u.defenseActive??false}:{}),capturedBy:u.capturedBy||null,grappleTarget:u.grappleTarget||null,carrierId:u.carrierId||u.mountId||null,entityType:u.entityType||'ms',renderProfile:u.machine.renderProfile,docked:u.docked??false,powerCut:this.t<(u.powerCutUntil||0),roll:u.roll||0,componentState:u.componentState?structuredClone(u.componentState):undefined,side:u.side,groupIndex:u.groupIndex,visible:u.visible,detectionLocked:u.detectionLocked,evasionMode:u.evasionMode,estimatedTarget:this.observed(u,target),strategyWeights:{...u.weights},stableTime:u.stableTime,recoveryDebuff:this.t<(u.recoveryDebuffUntil||0)?u.recoveryDebuff:null,recoveryDebuffRemaining:Math.max(0,(u.recoveryDebuffUntil||0)-this.t),id:u.id,name:u.machine.name,pilot:u.pilot,pilotState:u.pilotState.name,weapon:w.name,weaponKind:w.kind,position:[...u.position],velocity:[...u.velocity],forward:[...u.forward],armor:u.armor,maxArmor:u.machine.sim.armor,structure:u.structure,maxStructure:u.machine.sim.structure,energy:u.energy,maxEnergy:u.machine.sim.energyCapacity,totalEnergy:u.totalEnergy,maxTotalEnergy:energyTotalCapacity(u),energyRecoveryRate:energyRechargeRate(u),energyArmorActive:u.energyArmorActive??false,components:{...u.components},track:u.track,locked:u.locked,alive:u.alive,order:u.order,orderLabel:ORDER_NAMES[u.order],shots:u.shots,hits:u.hits,damage:u.damage,radius:u.machine.sim.radiusM,
    speedRate:u.speedRate||0,stability:u.stability,targetId:u.targetId,lockedTargetId:u.lockedTargetId||null,targetedBy:attackers.get(u.id)||null,aiming:u.weapons.some(s=>!!s.attack),aimingWeapons:u.weapons.filter(s=>s.attack).map(s=>s.definition.name),decisionReason:ORDER_NAMES[u.order],outsideEnemyArc:u.arcEvaluated?u.outsideEnemyArc:null,fireArc:{yaw:w.sim.arcYawDeg,pitch:w.sim.arcPitchDeg,effectiveRange:w.sim.effectiveRangeM,range:w.sim.rangeM,inside:arc.inside,edge:arc.edge},reactionRemaining:u.pendingReaction?Math.max(0,u.pendingReaction.at-this.t):0,threat:u.pendingReaction||this.t<u.evadeUntil?u.threatLabel:u.missileThreat?'导弹接近 · 加速脱离':'无攻击警报',
    weapons:u.weapons.map(s=>({id:s.definition.id,name:s.definition.name,kind:s.definition.kind,mount:s.definition.mount,slot:s.definition.slot||'slot1',disabled:!!(s.disabled||s.formDisabled),track:s.fireControl?.track,locked:s.fireControl?.locked,ammo:s.ammo,readyIn:Math.max(0,s.readyAt-this.t),active:s.definition.id===u.slotSelected[s.definition.slot||'slot1'],windup:!!s.attack,windupUntil:s.attack?.at??0,windupS:s.definition.sim.windupS,projectileSpeedMps:s.definition.sim.projectileSpeedMps,burstRemaining:s.salvo?.remaining||0,shots:s.shots,hits:s.hits,arcYawDeg:s.definition.sim.arcYawDeg,arcPitchDeg:s.definition.sim.arcPitchDeg}))};
  }),objects:(this.objects.map(o=>({...o}))),drones:(this.drones.map(d=>({id:d.id,owner:d.owner,side:d.side,position:[...d.position],forward:[...d.forward],velocity:[...d.velocity],target:d.target,weaponId:d.weaponId,phase:d.phase}))),clouds:(structuredClone(this.clouds)),mission:this.mission?.name,battlefield:this.field?.id,geometry:(this.field?.obstacles||[]).map(o=>({id:o.id,name:o.name,position:[...o.position],radiusM:o.radiusM,...(o.dimensions?{dimensions:[...o.dimensions]}:{}),structure:o.structure??null,health:o.health??o.structure??null})),effects:structuredClone(this.effects),projectiles:this.projectiles.filter(p=>GUIDED.has(p.kind)).map(p=>({id:p.id,owner:p.owner,kind:p.kind,position:[...p.position],previous:[...p.previous],trace:p.trace.map(v=>[...v]),guiding:p.guiding}))};
 }
}
