import {clearReactions} from './defense-plans.js';
import {initializeLoadouts} from './loadouts.js';
// SEED capabilities use data, geometry and finite resources; no character names or scenario clocks.
import {hasUnlimitedEnergy} from './energy-policy.js';
import {add,sub,mul,dot,length,norm,clamp,arcSolution,cross,rotateToward} from './math.js';
import {environmentAt} from './battlefield.js';
import {globalPoint} from './collision.js';

export function remotePermission(b,u,w){
 const c=w.remoteControl;if(!c)return true;
 const env=environmentAt(b,u.position);
 return c.environments.includes(env.medium)&&(u.pilotState.capabilities?.spatialAwareness??0)>=c.requiredSpatial;
}
export function remoteQuota(b,u){
 // Allocate the finite renderer/runtime pool across eligible owners, before the
 // launch loop can favor the first faction. This is a capacity rule, not combat AI.
 if(b.remoteBudget?.tick!==b.tick){
  const owners=b.units.filter(x=>x.alive&&!x.docked&&x.weapons.some(w=>w.definition.remoteControl&&!w.disabled&&!w.formDisabled&&w.ammo!==0&&remotePermission(b,x,w.definition)));
  const legacy=b.drones.filter(d=>!d.dead&&!b.unitById.get(d.owner)?.weapons.some(w=>w.definition.id===d.weaponId&&w.definition.remoteControl)).length;
  b.remoteBudget={tick:b.tick,owners:new Set(owners.map(x=>x.id)),quota:Math.max(0,Math.floor((192-legacy)/Math.max(1,owners.length)))};
 }
 return b.remoteBudget.owners.has(u.id)?b.remoteBudget.quota:0;
}
export function remoteDelay(u,w){const c=w.remoteControl;return c?c.controlDelayS*(1-.35*(u.pilotState.capabilities?.spatialAwareness??0)):.38;}
export function mountedRemote(b,u,w){return !!w.remoteControl?.mounted&&!remotePermission(b,u,w);}
export function initializeSeed(u){
 initializeLoadouts(u);
 if(u.machine.forms){u.formBases={sim:{...u.machine.sim},mobility:structuredClone(u.machine.mobility),tags:[...u.machine.tags]};applyForm(u,u.initialFormId||'ms');}
 if(u.machine.defenses){u.defenseActive=true;u.defenseIntegrity=Object.fromEntries(u.machine.defenses.flatMap((d,i)=>d.capacity?[[i,d.capacity]]:[]));}
}
export function applyForm(u,id){
 const m=u.machine,form=m.forms.find(f=>f.id===id);if(!form)throw Error('未知变形形态 '+id);u.formId=id;
 for(const key of ['maxSpeedMps','thrustN','turnRateDeg'])m.sim[key]=u.formBases.sim[key]*({maxSpeedMps:form.speedFactor,thrustN:form.thrustFactor,turnRateDeg:form.turnFactor}[key])*(u.skillRuntime?.factors[{maxSpeedMps:'speed',thrustN:'thrust',turnRateDeg:'turn'}[key]]??1);
 m.mobility.pitchRateDeg=u.formBases.mobility.pitchRateDeg*form.turnFactor*(u.skillRuntime?.factors.turn??1);m.tags=[...form.tags];u.defenseEnabledIndices=form.defenseIndices?new Set(form.defenseIndices):null;
 for(const state of u.weapons){state.formDisabled=!form.weaponIds.includes(state.definition.id);if(state.formDisabled){state.attack=null;state.salvo=null;}}
 for(const slot of Object.keys(u.slotSelected)){const next=u.weapons.find(w=>w.definition.slot===slot&&!w.formDisabled&&!w.disabled);if(next)u.slotSelected[slot]=next.definition.id;}
 if(u.weapons.find(w=>w.definition.id===u.selected)?.formDisabled)u.selected=Object.values(u.slotSelected).find(id=>!u.weapons.find(w=>w.definition.id===id)?.formDisabled)||u.selected;
}
export function updateSeedSystems(b,u,dt){
 if(!u.alive||u.docked)return;
 const m=u.machine,p=u.pilotState;
 if(m.defenses){const previousPhase=u.phaseArmorObserved;const cost=m.defenses.reduce((n,d,i)=>n+(!u.defenseEnabledIndices||u.defenseEnabledIndices.has(i)?d.upkeep:0),0)*dt;const restart=m.defenses.reduce((n,d,i)=>n+((!u.defenseEnabledIndices||u.defenseEnabledIndices.has(i))?(d.restartEnergy??0):0),0);const starting=u.defenseActive===false;u.defenseActive=u.energy>0&&u.totalEnergy>0&&u.energy>=cost+(starting?restart:0)&&u.totalEnergy>=cost+(starting?restart:0);if(u.defenseActive)b.spend(u,cost+(starting?restart:0));const phase=m.defenses.some(d=>["ps","tp","vps"].includes(d.type));if(phase){u.phaseArmorObserved=u.defenseActive;if(previousPhase!==undefined&&previousPhase!==u.phaseArmorObserved&&b.t>=(u.phaseNoticeAt||0)){u.phaseNoticeAt=b.t+1;b.emit(u.phaseArmorObserved?"phase-restored":"phase-down",u.id,m.name+(u.phaseArmorObserved?" PS装甲重新供电":" PS装甲供电中断"),{energy:u.energy,totalEnergy:u.totalEnergy});}}}
 // Reassess forms and concealment at the same bounded decision rate as the pilot.
 if(b.t>=u.nextDecision){
  const target=b.targetFor(u),seen=u.contacts?.get(target.id),distance=seen?length(sub(seen.position,u.position)):Infinity;
  if(m.forms&&b.t>=(u.formReadyAt||0)){
   const captureForm=u.captureIntent||u.grappleTarget||u.lastStrategyId==='capture-position';
   const vulnerable=seen&&(seen.phaseArmorActive===false||seen.propulsionDisabled===true);
   // A fast alternate form can lose its hand shield. Compare that real cost
   // against observed beam coverage before choosing speed for an approach.
   const ms=m.forms.find(f=>f.id==='ms'),ma=m.forms.find(f=>f.id==='ma');
   const shieldLost=ms?.defenseIndices?.some(i=>m.defenses?.[i]?.type==='shield'&&!ma?.defenseIndices?.includes(i)&&(u.defenseIntegrity?.[i]??m.defenses[i].capacity)>0);
   const exposed=shieldLost&&seen&&b.t-seen.observedAt<.8&&target.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind==='beam'&&distance<w.definition.sim.effectiveRangeM&&arcSolution(seen.forward,sub(u.position,seen.position),w.definition.sim).inside);
   const needGrip=(u.captureIntent||u.grappleTarget||captureForm&&vulnerable);
   const desired=!seen||b.t-seen.observedAt>.8?u.formId:needGrip?m.grappleSystem?.formId||'ma':exposed?'ms':captureForm?'ma':distance>1800&&b.t>=u.evadeUntil?'ma':'ms',form=m.forms.find(f=>f.id===desired);
   if(form&&u.formId!==desired){
    u.formId=desired;u.formReadyAt=b.t+1.2;
    applyForm(u,desired);
    b.emit('form-change',u.id,m.name+' 切换为 '+form.name,{form:form.id});
   }
  }
  if(m.stealth){const c=m.stealth,coverBlade=u.bladeSupportTargetId===target?.id&&b.t<(u.bladeSupportUntil||0),blade=coverBlade&&b.bestBlade(u,target),closure=seen?Math.max(0,dot(sub(u.velocity,seen.velocity),norm(sub(seen.position,u.position)))):0,bladeWindow=blade&&distance<blade.definition.sim.rangeM+closure*(blade.definition.sim.windupS+p.sim.reactionS+.1),attackWindow=(!coverBlade||bladeWindow)&&seen&&b.t-seen.observedAt<.6&&distance<4000&&u.stability>.65&&dot(u.forward,norm(sub(seen.position,u.position)))>.9,desired=!attackWindow&&p.traits.ambush&&u.energy>c.energyPerS*2&&(distance>600||coverBlade&&!bladeWindow)&&b.t-(u.lastFiredAt??-100)>c.revealS&&(u.stealthActive||b.t>=(u.stealthReadyAt||0));
   if(!!u.stealthActive!==!!desired){u.stealthActive=!!desired;if(!desired)u.stealthReadyAt=b.t+c.revealS;b.emit('stealth',u.id,m.name+(desired?' 启动海市蜃楼':' 解除海市蜃楼'),{active:!!desired});}}
 }
 if(u.stealthActive){const cost=m.stealth.energyPerS*dt;if(b.spend(u,cost)<cost*.99)u.stealthActive=false;}
 // Directed replenishment transfers energy from one finite reservoir to another.
 const power=m.powerSystem;
 if(!hasUnlimitedEnergy(u)&&power?.receiveDeuterion&&(u.totalEnergy<m.sim.totalEnergy*.5||u.energy<m.sim.energyCapacity*.35)&&b.tick%5===0){
  const ship=(b.spatial.sides[u.side]||[]).filter(x=>x!==u&&x.alive&&!x.docked&&x.machine.powerSystem?.supplyRate>0&&x.totalEnergy>x.machine.sim.energyCapacity*2).sort((a,z)=>length(sub(a.position,u.position))-length(sub(z.position,u.position)))[0];
  if(ship){const supply=ship.machine.powerSystem,distance=length(sub(u.position,ship.position));if(distance<=supply.supplyRangeM&&u.stability>.45&&length(sub(u.velocity,ship.velocity))/Math.max(1,distance)<.12&&b.canSee(ship.position,u.position)&&dot(ship.forward,norm(sub(u.position,ship.position)))>Math.cos(Math.PI/3)){
   const amount=b.spend(ship,Math.min(supply.supplyRate*dt*5*clamp(1-distance/supply.supplyRangeM,.1,1),m.sim.totalEnergy-u.totalEnergy));u.totalEnergy+=amount;u.energy=Math.min(m.sim.energyCapacity,u.energy+amount);
   if(amount>0&&b.t>=(u.supplyNoticeAt||0)){u.supplyNoticeAt=b.t+2;b.emit('deuterion-transfer',ship.id,ship.machine.name+' 向 '+m.name+' 转移氘核能源',{target:u.id,energy:amount});}
  }}
 }
}
export function concealedFrom(b,observer,target){
 if(!target.stealthActive)return false;
 return length(sub(observer.position,target.position))>target.machine.stealth.closeDetectionM;
}
export function damageParts(shot,raw){
 const c=shot.weapon.damageClass,f=c==='hybrid'?shot.weapon.beamFraction??.65:c==='energy'?1:c==='physical'?0:['beam','funnel','melee'].includes(shot.kind)?1:0;
 return {physical:raw*(1-f),beam:raw*f};
}
// A held shield can stop a ray without an active blade parry, but its coverage
// against a close moving edge is limited unless the pilot actually braces it.
const bladeShieldCoverage=(u,kind,type)=>kind==='melee'&&type==='shield'?(u.order==='shieldGuard'&&u.stability>.35?1:.2):1;

// Preview only: observed equipment and remaining charged buffer; never spends energy or reveals hidden aim.
export function predictedProtectionCost(u,weapon,raw,bearing=null,distance=Infinity){
 let parts=damageParts({weapon:weapon.sim,kind:weapon.kind},raw),energy=u.energy,cost=0;
 for(const [index,d] of (u.machine.defenses||[]).entries()){if(distance<d.minRangeM)continue;if(u.defenseEnabledIndices&&!u.defenseEnabledIndices.has(index))continue;if(u.defenseActive===false&&(d.upkeep>0||d.energyPerDamage>0))continue;if(d.arcDeg<180&&(!bearing||dot(u.forward,norm(bearing))<Math.cos(d.arcDeg*Math.PI/180)))continue;if(['reflector','laminated','deflect','femto'].includes(d.type)&&weapon.kind==='melee')continue;
 const phase=['ps','tp','vps'].includes(d.type),coverage=bladeShieldCoverage(u,weapon.kind,d.type),physical=(phase||d.type==='shield')?parts.physical*d.strength*coverage:0,beam=parts.beam*(phase||d.type==='shield'?(d.beamStrength??0):d.strength)*coverage,wanted=physical+beam,capacity=d.capacity!==undefined?Math.min(1,(u.defenseIntegrity?.[index]??d.capacity)/Math.max(.001,wanted)):1,wantedCost=wanted*capacity*d.energyPerDamage,paid=wantedCost>0?Math.min(1,energy/wantedCost):1;parts.physical-=physical*capacity*paid;parts.beam-=beam*capacity*paid;energy-=wantedCost*paid;cost+=wantedCost*paid;
 }return {remainingDamage:parts.physical+parts.beam,energyCost:cost};
}
export function seedDefense(b,u,shot,raw){
 shot.defensePhysicalBlocked=0;
 let parts=damageParts(shot,raw);
 for(const [index,d] of (u.machine.defenses||[]).entries()){
  if(u.defenseEnabledIndices&&!u.defenseEnabledIndices.has(index))continue;
  // Impact protection takes its payment from the charged buffer, never directly from uncharged reserves.
  if(u.defenseActive===false&&(d.upkeep>0||d.energyPerDamage>0||['ps','tp','vps'].includes(d.type)))continue;
  const distance=shot.traveled??Infinity;if(distance<d.minRangeM)continue;
  if(d.arcDeg<180&&dot(u.forward,norm(mul(shot.velocity,-1)))<Math.cos(d.arcDeg*Math.PI/180))continue;
  const phase=['ps','tp','vps'].includes(d.type),noBlade=['reflector','laminated','deflect','femto'].includes(d.type)&&shot.kind==='melee';
  if(noBlade)continue;
  const coverage=bladeShieldCoverage(u,shot.kind,d.type);
   let physicalWanted=phase||d.type==='shield'?parts.physical*d.strength*coverage:0,beamWanted=parts.beam*(phase||d.type==='shield'?(d.beamStrength??0):d.strength)*coverage;
   if(d.capacity!==undefined){u.defenseIntegrity??={};u.defenseIntegrity[index]??=d.capacity;const ratio=Math.min(1,u.defenseIntegrity[index]/Math.max(.001,physicalWanted+beamWanted));physicalWanted*=ratio;beamWanted*=ratio;}
  const physicalCost=physicalWanted*d.energyPerDamage,physicalPaid=physicalCost>0?b.spend(u,physicalCost)/physicalCost:1,physicalBlocked=physicalWanted*physicalPaid;
  const beamCost=beamWanted*d.energyPerDamage,beamPaid=beamCost>0?b.spend(u,beamCost)/beamCost:1,beamBlocked=beamWanted*beamPaid;
  parts.physical-=physicalBlocked;parts.beam-=beamBlocked;shot.defensePhysicalBlocked+=physicalBlocked;
  const blocked=physicalBlocked+beamBlocked;if(d.capacity!==undefined)u.defenseIntegrity[index]=Math.max(0,u.defenseIntegrity[index]-blocked);
  if(blocked>0&&b.t>=(u.defenseNoticeAt||0)){u.defenseNoticeAt=b.t+.6;b.emit('defense',u.id,u.machine.name+' 防护削减来袭伤害',{defense:d.type,blocked,physicalBlocked,beamBlocked,energy:physicalCost*physicalPaid+beamCost*beamPaid});}
  if(d.type==='reflector'&&shot.kind==='beam'&&!shot.reflected&&beamBlocked>1&&b.projectiles.length<192){
   const direction=norm(sub(shot.velocity,mul(u.forward,2*dot(shot.velocity,u.forward)))),origin=add(u.position,mul(direction,u.machine.sim.radiusM+5));
   (b.pendingReflections??=[]).push({...shot,id:++b.sequence,owner:u.id,weaponId:u.weapons[0]?.definition.id??shot.weaponId,target:shot.owner,weapon:{...shot.weapon,damage:shot.weapon.damage*d.strength*beamPaid},position:origin,previous:[...origin],velocity:mul(direction,length(shot.velocity)),age:0,traveled:0,trace:[origin],reflected:true});
   b.effects.push({type:'beam',actor:u.id,t:b.t,life:.55,from:origin,to:add(origin,mul(direction,1200))});
  }
 }
 return parts.physical+parts.beam;
}

export function validateSeedMachine(m){
 const fail=s=>{throw Error(m.id+' SEED能力：'+s);};
 const fields=(x,names)=>{if(!x||Array.isArray(x)||Object.keys(x).some(k=>!names.includes(k)))fail('未知字段');};
 const num=(v,lo,hi)=>{if(!Number.isFinite(v)||v<lo||v>hi)fail('数值越界');};
 if(m.powerSystem){const p=m.powerSystem;fields(p,['type','ratedOutputKw','njc','receiveDeuterion','supplyRate','supplyRangeM']);if(!['battery','nuclear','deuterion','hyper-deuterion','fusion'].includes(p.type))fail('能源类型');if(p.ratedOutputKw!==null)num(p.ratedOutputKw,1,1e8);if(typeof p.njc!=='boolean'||typeof p.receiveDeuterion!=='boolean')fail('能源开关');num(p.supplyRate,0,100);num(p.supplyRangeM,0,60000);}
 if(m.defenses){if(!Array.isArray(m.defenses)||m.defenses.length>4)fail('防护层数量');for(const d of m.defenses){fields(d,['type','strength','energyPerDamage','upkeep','arcDeg','minRangeM','beamStrength','capacity','restartEnergy']);if(!['ps','tp','vps','beam-shield','reflector','laminated','deflect','femto','shield'].includes(d.type))fail('防护类别');num(d.strength,0,1);if(d.beamStrength!==undefined)num(d.beamStrength,0,.9);num(d.energyPerDamage,0,5);num(d.upkeep,0,30);num(d.arcDeg,5,180);num(d.minRangeM,0,5000);if(d.capacity!==undefined)num(d.capacity,1,20000);if(d.restartEnergy!==undefined)num(d.restartEnergy,0,300);}}
 if(m.stealth){fields(m.stealth,['energyPerS','closeDetectionM','revealS']);num(m.stealth.energyPerS,0,30);num(m.stealth.closeDetectionM,10,1000);num(m.stealth.revealS,.2,10);}
 if(m.forms){if(!Array.isArray(m.forms)||m.forms.length!==2||!m.forms.some(f=>f.id==='ms')||!m.forms.some(f=>f.id==='ma'))fail('形态需MS/MA各一个');for(const f of m.forms){fields(f,['id','name','speedFactor','thrustFactor','turnFactor','tags','weaponIds','defenseIndices']);for(const k of ['speedFactor','thrustFactor','turnFactor'])num(f[k],.3,2);if(typeof f.name!=='string'||!Array.isArray(f.tags)||f.tags.some(t=>!/^[a-z][a-z0-9-]*$/.test(t)))fail('形态标签');if(!Array.isArray(f.weaponIds)||new Set(f.weaponIds).size!==f.weaponIds.length||f.weaponIds.some(id=>!m.weapons.some(w=>w.id===id)))fail('形态武器引用');if(f.defenseIndices!==undefined&&(!Array.isArray(f.defenseIndices)||new Set(f.defenseIndices).size!==f.defenseIndices.length||f.defenseIndices.some(i=>!Number.isInteger(i)||!m.defenses?.[i])))fail('形态防御引用');if(m.sim.turnRateDeg*f.turnFactor>180||m.mobility.pitchRateDeg*f.turnFactor>180)fail('形态转速');}}
 if(m.moduleSystem){fields(m.moduleSystem,['separationM','radiusM','durationS','cooldownS','energyCost','recoveryFraction','coreFlight']);for(const [k,lo,hi]of [['separationM',10,200],['radiusM',1,20],['durationS',.2,3],['cooldownS',.3,10],['energyCost',1,100]])num(m.moduleSystem[k],lo,hi);if(m.moduleSystem.recoveryFraction!==undefined)num(m.moduleSystem.recoveryFraction,.1,1);if(m.moduleSystem.coreFlight){const c=m.moduleSystem.coreFlight;fields(c,['massKg','thrustN','maxSpeedMps','turnRateDeg','radiusM','structure','energyPerS','energyPerDeltaV','rechargePerS']);for(const[k,lo,hi]of [['massKg',500,20000],['thrustN',10000,1e7],['maxSpeedMps',100,2000],['turnRateDeg',90,720],['radiusM',1,15],['structure',1,300],['energyPerS',0,50],['energyPerDeltaV',0,1],['rechargePerS',0,150]])num(c[k],lo,hi);}}
 if(m.moduleSupply){fields(m.moduleSupply,['count','rangeM','speedMps']);num(m.moduleSupply.count,1,12);if(!Number.isInteger(m.moduleSupply.count))fail('备用件数量');num(m.moduleSupply.rangeM,500,60000);num(m.moduleSupply.speedMps,200,10000);}
 for(const w of m.weapons){if(!w.remoteControl)continue;const c=w.remoteControl;fields(c,['system','generation','requiredSpatial','assisted','environments','controlDelayS','channels','wireLengthM','mounted','projectileKind']);if(w.kind!=='funnel'||!['dragoon','wired'].includes(c.system))fail('远程系统');num(c.generation,1,2);num(c.requiredSpatial,0,1);num(c.controlDelayS,.1,2);num(c.channels,1,24);num(c.wireLengthM,0,20000);if(!Number.isInteger(c.channels)||!Array.isArray(c.environments)||!c.environments.length||c.environments.some(e=>!['space','orbit','air','surface','water','ground'].includes(e)))fail('终端环境');if(typeof c.assisted!=='boolean'||typeof c.mounted!=='boolean')fail('控制开关');if(c.projectileKind!==undefined&&!['beam','ballistic'].includes(c.projectileKind))fail('终端弹体类别');if(c.system==='wired'&&c.wireLengthM<=0)fail('有线长度');}
}

// Predict interception from observed charge and friendly positions; never teleport to a future hit.
export function bodyguardCourse(b,u){
 if(!u.pilotState.traits.bodyguard||u.entityType==='ship'||!u.alive)return null;
 const allies=(b.spatial.sides[u.side]||[]).filter(a=>a!==u&&a.alive&&a.entityType==='ship');let best=null;
 for(const foe of b.enemies(u)||[]){const contact=u.contacts.get(foe.id);if(!contact||b.t-contact.observedAt>.7)continue;
 for(const state of foe.weapons){const attack=state.attack;if(!attack||state.definition.sim.damage<90)continue;const ally=allies.find(a=>a.id===attack.targetId);if(!ally)continue;
 const line=sub(ally.position,contact.position),axis=norm(line),offset=clamp(dot(sub(u.position,contact.position),axis),Math.max(500,length(line)*.1),Math.max(500,length(line)-ally.machine.sim.radiusM-u.machine.sim.radiusM-20)),point=add(contact.position,mul(axis,offset)),distance=length(sub(point,u.position));
 const horizon=attack.at-b.t+offset/state.definition.sim.projectileSpeedMps,uSpeed=length(u.velocity),accel=u.machine.sim.thrustN/u.machine.sim.massKg*10;
 const reachable=distance<=uSpeed*Math.max(0,horizon)+.5*accel*horizon*horizon&&horizon>u.pilotState.sim.reactionS;
 if(!reachable)continue;const danger=state.definition.sim.damage*(b.rules.damageMultiplier||3.25)/Math.max(1,ally.structure),score=danger*(u.pilotState.tactics.missionValue||9)/Math.max(.1,distance/1000);
 if(!best||score>best.score)best={heading:norm(sub(contact.position,u.position)),desired:add(ally.velocity,mul(norm(sub(point,u.position)),Math.min(u.machine.sim.maxSpeedMps,distance/Math.max(.1,horizon)))),order:'bodyguard',score,ally:ally.id,attacker:foe.id,point,horizon,allyVelocity:ally.velocity};
 }}return best;
}
export function trySeparate(b,u,r){
 const c=u.machine.moduleSystem;if(!c||!u.pilotState.traits.modularEvasion||r.light||r.missile||b.t<(u.moduleReadyAt||0)||u.energy<c.energyCost)return false;
 const bladeThreat=r.kind==='melee',attacker=bladeThreat?b.unitById.get(r.attacker):null;
 const shot=b.projectiles.find(p=>p.id===r.shotId),remaining=(r.impactAt??b.t+.3)-b.t;if(remaining<.05||remaining>c.durationS*.5)return false;
 if(bladeThreat&&(!attacker||!u.visible||length(sub(attacker.position,u.position))>350||!attacker.weapons.some(w=>w.definition.kind==='melee'&&w.attack?.targetId===u.id)))return false;
 const axis=norm(r.direction),up=norm(sub([0,1,0],mul(axis,axis[1]))),escapeAxis=length(up)>.1?up:[0,0,1];
 const padding=(shot?.weapon.blastRadiusM??0)*.35,required=u.machine.sim.radiusM+padding+2;
 const accel=u.machine.sim.thrustN/u.machine.sim.massKg*u.pilotState.tactics.dodgeThrustMultiplier*u.components.engine;
 const pulse=Math.min(remaining,u.pilotState.tactics.dodgePulseS),ordinaryReach=accel*pulse*(remaining-.5*pulse);
 const spreadSpeed=Math.min(450,c.separationM/Math.max(.1,remaining)),splitReach=u.machine.sim.radiusM*.45+spreadSpeed*remaining;
 // Choose separation only when an ordinary powered sidestep cannot clear the incoming ray in time.
 if((!bladeThreat&&ordinaryReach>=required)||splitReach<c.radiusM+padding+2)return false;
 if(bladeThreat&&u.stability>.65&&!(u.pilotState.strategies?.['modular-counter']>0))return false;
 b.spend(u,c.energyCost);u.moduleSeparatedUntil=b.t+c.durationS;u.moduleReadyAt=b.t+c.cooldownS;b.cancelAttacks(u);u.stability=clamp(u.stability-.12);
 for(const sign of [-1,1])b.objects.push({id:'module-'+u.id+'-'+ ++b.sequence,owner:u.id,side:u.side,name:sign>0?'上体分离模块':'下体分离模块',entityType:'vehicle',shape:'module',position:add(u.position,mul(escapeAxis,sign*u.machine.sim.radiusM*.45)),previous:[...u.position],velocity:add(u.velocity,mul(escapeAxis,sign*spreadSpeed)),forward:[...u.forward],radius:c.radiusM,life:c.durationS,signature:.4,occluder:false,module:true,moduleAxis:mul(escapeAxis,sign),moduleStart:b.t,moduleDuration:c.durationS,moduleSpreadSpeed:spreadSpeed});
 b.emit('module-separation',u.id,u.machine.name+(bladeThreat?' 预判挥刃，结构分离避开中心斩击':' 比较横移与结构分离，分体让开来袭射线'),{until:u.moduleSeparatedUntil,separationM:c.separationM,kind:r.kind,attacker:r.attacker,threat:r.shotId||null,ordinaryReach,splitReach,required});u.nextDecision=b.t;return true;
}
export function guideModule(b,o,dt){
 if(!o.module)return;const u=b.unitById.get(o.owner);if(!u?.alive){o.life=0;return;}
 const nextAge=Math.min(o.moduleDuration,b.t-o.moduleStart+dt),half=o.moduleDuration*.5;
 const offset=nextAge<=half?u.machine.sim.radiusM*.45+o.moduleSpreadSpeed*nextAge:(u.machine.sim.radiusM*.45+o.moduleSpreadSpeed*half)*(1-(nextAge-half)/half);
 const desired=add(add(u.position,mul(u.velocity,dt)),mul(o.moduleAxis,Math.max(0,offset)));
 o.velocity=mul(sub(desired,o.position),1/dt);o.forward=[...u.forward];
 if(nextAge>=o.moduleDuration&&!u.moduleRejoinReported){u.moduleRejoinReported=true;b.emit('module-rejoin',u.id,u.machine.name+' 分离模块归位',{position:[...u.position]});}
 if(nextAge<o.moduleDuration)u.moduleRejoinReported=false;
}
export function serviceModules(b,u,dt){
 if(b.tick%5!==0||(!u.alive&&!u.disabled)||!u.machine.moduleSystem)return;
 const c=u.machine.moduleSystem,parts=Object.values(u.componentState||{}).filter(p=>u.disabled||p.health<p.structure*.25&&!p.critical);
 if(!parts.length)return;
 const carrier=(b.spatial.sides[u.side]||[]).find(a=>a.alive&&a.machine.moduleSupply&&(a.moduleStock??a.machine.moduleSupply.count)>0&&length(sub(a.position,u.position))<a.machine.moduleSupply.rangeM&&b.canSee(a.position,u.position));
 if(!carrier||b.objects.some(o=>o.supplyTarget===u.id))return;
 carrier.moduleStock??=carrier.machine.moduleSupply.count;carrier.moduleStock--;
 const part=parts[0],toward=norm(sub(u.position,carrier.position)),origin=add(carrier.position,mul(toward,carrier.machine.sim.radiusM+40));
 b.objects.push({id:'supply-'+u.id+'-'+ ++b.sequence,owner:carrier.id,side:u.side,name:'替换模块',entityType:'pod',shape:'module',position:origin,previous:origin,velocity:mul(toward,carrier.machine.moduleSupply.speedMps),forward:toward,radius:4,life:30,signature:.2,occluder:false,supplyTarget:u.id,componentId:part.id});
 b.emit('module-supply',carrier.id,carrier.machine.name+' 发出有限备用模块',{target:u.id,component:part.id,stock:carrier.moduleStock});
}
export function guideSupply(b,o,dt){
 if(o.life<=0||!o.supplyTarget)return;const u=b.unitById.get(o.supplyTarget);if(!u||!u.alive&&!u.disabled){o.life=0;return;}
 const delta=sub(u.position,o.position),distance=length(delta),speed=length(o.velocity);o.velocity=mul(norm(delta),speed);
 if(distance>Math.max(45,speed*dt))return;
 const part=u.componentState[o.componentId];if(!part){o.life=0;return;}
 if(u.disabled){const core=b.objects.find(x=>x.id===u.coreFlightId&&x.life>0);if(u.coreFlightId&&!core){o.life=0;return;}if(core){u.position=[...core.position];u.velocity=[...core.velocity];u.forward=[...core.forward];core.life=0;u.coreFlightId=null;u.coreActive=false;u.coreStructure=null;}u.disabled=false;u.alive=true;const fraction=u.machine.moduleSystem.recoveryFraction??.65;u.structure=u.machine.sim.structure*fraction;u.armor=Math.max(u.armor,u.machine.sim.armor*fraction);u.stability=.65;u.components={...u.components,engine:1,weapon:1,sensor:1,power:1};for(const p of Object.values(u.componentState||{}))p.health=p.structure*fraction;for(const w of u.weapons){w.disabled=false;w.attack=null;w.salvo=null;}clearReactions(u);u.swing=null;u.meleeBreakUntil=0;u.order='recover';u.nextDecision=b.t;u.targetId=null;u.disabledRecovered=(u.disabledRecovered||0)+1;b.emit('reactivated',u.id,u.machine.name+' 接收有限备用组件，换装后恢复作战',{component:part.id,structure:u.structure,remainingEnergy:u.totalEnergy});o.life=0;return;}
 part.health=part.structure;u.structure=Math.min(u.machine.sim.structure,u.structure+part.structure*.7);
 if(part.role==='turret')for(const w of u.weapons)if(w.definition.slot===part.slot)w.disabled=false;
 if(part.role==='power')u.components.power=1;if(part.role==='sensor')u.components.sensor=1;if(part.role==='engine')u.components.engine=1;
 u.stability=clamp(u.stability-.18);u.nextDecision=b.t;o.life=0;
 b.emit('module-replace',u.id,u.machine.name+' 接收并重接备用模块',{component:part.id,structure:u.structure});
}

export function bestBlade(b,u,target){
 const candidates=u.weapons.filter(w=>w.definition.kind==='melee'&&!w.disabled&&!w.formDisabled&&w.ammo!==0&&u.energy>=w.definition.sim.energyCost);
 const seen=target&&u.contacts?.get(target.id),delta=target?sub(seen?.position||target.position,u.position):null,relative=target?sub(seen?.velocity||target.velocity,u.velocity):null;
 let best=null,score=-Infinity;
 for(const state of candidates){
  const w=state.definition,s=w.sim,delay=Math.max(0,state.readyAt-b.t)+(u.slotSelected[w.slot]===w.id?0:s.switchS??.18)+s.windupS;
  // At a fast crossing, a weapon with a better damage rate can still miss the
  // entire contact window. Prefer a stroke that can actually reach that window.
  let windowFactor=1;
  if(delta&&target.entityType!=='ship'){
   const aa=dot(relative,relative),bb=2*dot(delta,relative),cc=dot(delta,delta)-(s.rangeM+target.machine.sim.radiusM)**2,disc=bb*bb-4*aa*cc;
   if(aa>1&&disc>=0){const entry=(-bb-Math.sqrt(disc))/(2*aa),exit=(-bb+Math.sqrt(disc))/(2*aa);
    if(exit>0&&entry<1.5&&delay>exit)windowFactor=.08;
   }
  }
  const parts=damageParts({kind:'melee',weapon:s},s.damage),ps=seen?.phaseArmorActive&&target?.machine.defenses?.find(d=>['ps','tp','vps'].includes(d.type)),physical=ps?parts.physical*(1-ps.strength):parts.physical;
  const value=(physical+parts.beam)/Math.max(.3,delay+.45)*windowFactor-s.energyCost*.12;
  if(value>score){score=value;best=state;}
 }
 return best;
}

// Remote terminals are physical targets. Only observed, in-arc threats are considered for a spare weapon slot.
export function remoteTarget(b,id){
 const d=b.drones.find(d=>d.id===id&&!d.dead);if(!d)return null;
 return {id:d.id,entityType:'remote',side:d.side,alive:true,position:d.position,velocity:d.velocity,forward:d.forward,acceleration:[0,0,0],machine:{sim:{radiusM:2,structure:12}},weapons:[],components:{engine:1,sensor:1,weapon:1},stability:1,lastSeenAt:-100};
}
export function remoteOpportunities(b,u){
 if(!u.alive||u.docked||u.stealthActive||(u.pilotState.strategies?.['remote-intercept']??0)<=0)return [];
 const reserve=u.machine.sim.energyCapacity*u.pilotState.tactics.energyReserveFraction,choices=[];
 for(const d of b.drones){
  if(!d.targetable||d.dead||d.side===u.side||d.target!==u.id||d.phase==='return'||!b.canSee(u.position,d.position))continue;
  const delta=sub(d.position,u.position),distance=length(delta);if(distance>4500)continue;
  // Attacking a terminal while it relocates is useful even if its current shot is already unavoidable.
  const deadline=d.aim?.at??Math.max(b.t+.35,d.nextAt??b.t)+.35;
  for(const state of u.weapons){const w=state.definition,s=w.sim;
   if(!['beam','ballistic'].includes(w.kind)||state.attack||state.salvo||state.disabled||state.formDisabled||state.ammo===0||distance>s.effectiveRangeM)continue;
   if(s.powerSource==='reactor'&&u.energy-s.energyCost<reserve)continue;
   const facing=state.turretForward||u.forward,angle=Math.acos(clamp(dot(facing,norm(delta)),-1,1)),turnRate=(w.turret?.turnRateDeg??u.machine.sim.turnRateDeg)*Math.PI/180;
   const turn=Math.max(0,angle-Math.min(s.arcYawDeg,s.arcPitchDeg)*Math.PI/180)/Math.max(.1,turnRate),arrival=Math.max(0,state.readyAt-b.t,u.slotReadyAt[w.slot]-b.t||0)+turn+s.windupS+distance/s.projectileSpeedMps;
   if(arrival>deadline-b.t+.15||!b.available(u,state))continue;
   choices.push({d,state,turn,score:s.damage/Math.max(.15,arrival)/(1+s.energyCost*.05)});
  }
 }
 return choices.sort((a,z)=>z.score-a.score||a.d.id.localeCompare(z.d.id));
}
export function counterRemote(b,u){
 if(b.t<u.evadeUntil||u.stability<.3)return;
 const best=remoteOpportunities(b,u).find(x=>arcSolution(x.state.turretForward||u.forward,sub(x.d.position,u.position),x.state.definition.sim).inside);if(!best)return;
 b.selectWeapon(u,best.state,'遥控终端拦截');b.beginAttack(u,remoteTarget(b,best.d.id),best.state);
 if(best.state.attack&&b.t>=(u.remoteNoticeAt||0)){u.remoteNoticeAt=b.t+1;b.emit('remote-intercept',u.id,u.machine.name+' 使用独立武器槽射击可见遥控终端',{terminal:best.d.id,weapon:best.state.definition.id});}
}

// A defeated modular machine may retain a lightweight, vulnerable core craft.
// This craft cannot attack and does not undo mission defeat until a finite spare arrives.
export function launchCore(b,u,velocity){
 const c=u.machine.moduleSystem?.coreFlight;if(!c||u.coreFlightId)return;
 const v=length(velocity)>c.maxSpeedMps?mul(norm(velocity),c.maxSpeedMps):[...velocity];
 const o={id:'core-'+u.id+'-'+ ++b.sequence,owner:u.id,coreUnitId:u.id,side:u.side,name:'核心战机',entityType:'vehicle',shape:'core-fighter',position:[...u.position],previous:[...u.position],velocity:v,forward:[...u.forward],radius:c.radiusM,health:c.structure,life:7200,signature:.3,occluder:false,bornAt:b.t};
 u.coreFlightId=o.id;u.coreActive=true;u.coreStructure=o.health;u.velocity=[...v];b.objects.push(o);b.emit('core-flight',u.id,u.machine.name+' 失能后以核心战机脱离，等待备用组件',{core:o.id});
}
export function guideCore(b,o,dt){
 if(!o.coreUnitId||o.life<=0)return;const u=b.unitById.get(o.coreUnitId),c=u?.machine.moduleSystem?.coreFlight;
 if(!u?.disabled||!c){o.life=0;return;}
 if(b.t>=(o.nextDecision??0)){
  o.nextDecision=b.t+.15;
  const carrier=b.units.filter(x=>x.side===u.side&&x.alive&&x.machine.moduleSupply).sort((a,z)=>length(sub(a.position,o.position))-length(sub(z.position,o.position)))[0];
  const env=environmentAt(b,o.position),goal=carrier?add(carrier.position,mul(carrier.velocity,.6)):add(o.position,mul(o.forward,1500));
  if(['air','surface','ground'].includes(env.medium))goal[1]=Math.max(goal[1],180);
  const delta=sub(goal,o.position),distance=length(delta);o.desired=add(carrier?.velocity??[0,0,0],mul(norm(delta),Math.min(c.maxSpeedMps,Math.max(120,distance*.65))));
  if(b.t>=(o.evadeUntil??0)){
   let threat=null;for(const p of b.projectiles){if(p.side===o.side||p.owner===u.id||p.intercepted)continue;const d=sub(p.position,o.position),rv=sub(p.velocity,o.velocity),t=-dot(d,rv)/Math.max(1,dot(rv,rv));if(t<=u.pilotState.sim.reactionS||t>2.4||length(d)>6500)continue;const miss=length(add(d,mul(rv,t)));if(miss>o.radius+(p.weapon.blastRadiusM??0)+90||!b.canSee(o.position,p.position))continue;const danger=p.weapon.damage/Math.max(.08,t);if(!threat||danger>threat.danger)threat={p,t,danger};}
   if(threat){let axis=norm(cross(norm(threat.p.velocity),[0,1,0]));if(length(axis)<.1)axis=[1,0,0];if(dot(axis,delta)<0)axis=mul(axis,-1);o.pendingEvade={at:b.t+u.pilotState.sim.reactionS,axis};o.evadeUntil=b.t+u.pilotState.sim.reactionS+.65;b.emit('core-evasion',u.id,'核心战机判断来袭弹道，反应后侧向脱离',{projectile:threat.p.id});}
  }
 }
 if(o.pendingEvade&&b.t>=o.pendingEvade.at){o.evadeAxis=o.pendingEvade.axis;o.pendingEvade=null;b.effects.push({type:'dodge-jet',t:b.t,life:.35,actor:u.id,position:[...o.position],direction:mul(o.evadeAxis,-1)});}
 let desired=o.desired||o.velocity;if(o.evadeAxis&&b.t<o.evadeUntil)desired=add(o.velocity,mul(o.evadeAxis,c.maxSpeedMps*.7));else o.evadeAxis=null;
 const refill=Math.min(c.rechargePerS*(hasUnlimitedEnergy(u)?1:Math.sqrt(clamp(u.totalEnergy/(u.machine.sim.totalEnergy??u.machine.sim.energyCapacity*12))))*dt,Math.max(0,u.machine.sim.energyCapacity-u.energy),hasUnlimitedEnergy(u)?Infinity:Math.max(0,u.totalEnergy-u.energy));u.energy+=refill;
 const dv=sub(desired,o.velocity),max=c.thrustN/c.massKg*dt*(.25+.75*Math.sqrt(clamp(u.energy/u.machine.sim.energyCapacity))),change=mul(norm(dv),Math.min(length(dv),max)),cost=c.energyPerS*dt+length(change)*c.energyPerDeltaV,paid=cost>0?b.spend(u,cost)/cost:1;
 o.velocity=add(o.velocity,mul(change,paid));if(length(o.velocity)>c.maxSpeedMps)o.velocity=mul(norm(o.velocity),c.maxSpeedMps);
 o.forward=rotateToward(o.forward,norm(length(desired)?desired:o.velocity),c.turnRateDeg*Math.PI/180*dt);
}
export function coreHit(b,o,shot){
 if(!o.coreUnitId)return false;const u=b.unitById.get(o.coreUnitId);o.health=Math.max(0,o.health-shot.weapon.damage*b.rules.damageMultiplier);if(u)u.coreStructure=o.health;
 if(o.health<=0){o.life=0;if(u){u.coreActive=false;u.coreFlightId=null;u.disabled=false;b.emit('destroyed',u.id,u.machine.name+' 核心战机被击毁，无法重组');b.effects.push({type:'explosion',t:b.t,life:1.2,position:[...o.position],actor:u.id});}}else b.emit('core-hit',u?.id,'核心战机受击',{structure:o.health});return true;
}
