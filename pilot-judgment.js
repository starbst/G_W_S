import {clamp,dot,norm} from './math.js';
// Planning reads coarse visible conditions. Resolution still uses actual physics.
export function judgmentQuality(u){const p=u.pilotState?.sim||{},c=u.pilotState?.capabilities||{};return clamp(.35*(p.composure??.65)+.25*(p.tracking??.65)+.2*(c.spatialAwareness??.65)+.2*(c.teamwork??.65));}
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0)/4294967296;};
// Only the current observation window is retained. Unit removal frees its cache.
const observations=new WeakMap();
export function perceivedValue(b,u,key,value,{step=1,relative=.06}={}){
 if(!Number.isFinite(value))return value;
 let cache=observations.get(u);
 if(!cache||cache.battle!==b){cache={battle:b,time:-1,errors:new Map()};observations.set(u,cache);}
 if(cache.time!==b.t){cache.time=b.t;const q=judgmentQuality(u),epoch=Math.floor(b.t/(1.25-.55*q));if(cache.q!==q||cache.epoch!==epoch){cache.errors.clear();cache.q=q;cache.epoch=epoch;}}
 const q=cache.q;let error=cache.errors.get(key);
 if(error===undefined){error=(hash(u.id+':'+key+':'+cache.epoch+':'+(b.seed??0))-.5)*2*(.035+(1-q)*.09);if(cache.errors.size>=192)cache.errors.clear();cache.errors.set(key,error);}
 const grain=Math.max(step,Math.abs(value)*relative*(1.2-.4*q));
 return Math.round(value*(1+error)/grain)*grain;
}
export function observedProtection(b,observer,target,weapon,raw,distance=Infinity){
 const contact=observer.contacts?.get(target.id),fresh=contact&&b.t-contact.observedAt<1.2;
 const fraction=weapon.sim.damageClass==='hybrid'?1-(weapon.sim.beamFraction??.65):weapon.sim.damageClass==='physical'?1:weapon.sim.damageClass==='energy'?0:['ballistic','missile','funnel-missile'].includes(weapon.kind)?1:0;
 let physical=raw*fraction;physical=clamp(physical,0,raw);let beam=raw-physical,cost=0;
 for(const d of target.machine.defenses||[]){if(distance<(d.minRangeM||0))continue;const phase=['ps','tp','vps'].includes(d.type);if(phase&&fresh&&contact.phaseArmorActive===false)continue;
 if(['reflector','laminated','deflect','femto'].includes(d.type)&&weapon.kind==='melee')continue;
 const frontal=d.arcDeg<180,front=fresh&&contact.forward?dot(contact.forward,norm(observer.position.map((v,i)=>v-contact.position[i])))>.35:false;
 const coverage=frontal?(front?.75:.3):.9;
 const p=physical*(phase||d.type==='shield'||d.type==='gn-field'?d.strength:0)*coverage,r=beam*(phase||d.type==='shield'||d.type==='gn-field'?(d.beamStrength??0):d.strength)*coverage;
 physical-=p;beam-=r;cost+=(p+r)*(d.energyPerDamage||0);
 }
 return {remainingDamage:perceivedValue(b,observer,'armor:'+target.id,physical+beam,{step:2,relative:.1}),energyCost:cost};
}
export function gradeStrategyChoices(b,u,choices){
 for(const x of choices){x.score=perceivedValue(b,u,'strategy:'+x.id,x.score,{step:2,relative:.08});}
 return choices;
}

export function perceivedContactDamage(b,u,target,w){
 if(w.kind!=='beam'||w.sim.beamClass==='large')return 1;
 // Evasive competence is learned from visible shot outcomes, not enemy stats.
 const exchange=b.exchangeState?.(u,target.id),misses=exchange?.rangedMisses??0;
 return perceivedValue(b,u,'evasive-read:'+target.id,misses>6?.45:misses>2?.55:.65,{step:.05,relative:.06});
}
