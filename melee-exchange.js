import {add,sub,mul,dot,length,norm,clamp,arcSolution} from './math.js';

// Closed numeric engagement model. A distance/attitude window authorizes an
// exchange; rendered blade meshes and physical hull collisions never score it.
export function meleeAbility(u){
 const p=u.pilotState.sim,tags=u.pilotState.tags||[];
 return clamp(p.melee??(.6*p.maneuver+.2*p.tracking+.2*p.composure+(tags.includes('blade-specialist')?.08:0)),.1,1);
}
export function meleeWeapon(u){
 const usable=u.weapons.filter(w=>w.definition.kind==='melee'&&!w.disabled&&!w.formDisabled&&w.ammo!==0);
 return usable.find(w=>w.definition.id===u.swing?.weaponId)||usable.find(w=>u.slotSelected[w.definition.slot||'slot1']===w.definition.id)||usable.toSorted((a,z)=>z.definition.sim.damage-a.definition.sim.damage)[0];
}
export function meleeOutput(u,time,anticipated=false){
 const boosted=u.bladeBoostUntil>time||anticipated&&u.pilotState.traits.maximumOutput&&u.energy>u.pilotState.tactics.maxOutputCost+12;
 return u.machine.sim.thrustN*(u.components.engine??1)*(u.components.weapon??1)*(u.machine.bladeOutput||1)*(boosted?1.8:1)*(boosted?1:clamp(u.energy/30));
}
export function estimateMeleeClash(u,target,closing,time,anticipated=false,weapon=meleeWeapon(u)?.definition,counter=meleeWeapon(target)?.definition){
 const ma=u.machine.sim.massKg,mb=target.machine.sim.massKg,momentum=ma*mb/Math.max(1,ma+mb)*Math.max(0,closing),pa=meleeOutput(u,time,anticipated),pb=meleeOutput(target,time,anticipated);
 const control=x=>(.35+.65*meleeAbility(x))*(.65+.35*x.pilotState.sim.composure),steel=w=>(w?.sim.guardEfficiency??1)*Math.sqrt(Math.max(.25,(w?.sim.damage??40)/60));
 // Keep speed contributions bounded: a fast pass adds risk to both sides and
 // cannot drown out a stronger actuator or a more skilled sword user.
 const inertiaA=clamp(Math.sqrt(ma/Math.max(1,mb)),.65,1.5),inertiaB=clamp(Math.sqrt(mb/Math.max(1,ma)),.65,1.5);
 const impact=clamp(momentum/8e7,0,.24),pressureA=Math.max(1,pa*.2*control(u)*steel(weapon)+momentum*.12*inertiaA),pressureB=Math.max(1,pb*.2*control(target)*steel(counter)+momentum*.12*inertiaB);
 const lossA=clamp((u.pilotState.tactics.meleeClashCost+impact)*Math.sqrt(pressureB/pressureA)/Math.sqrt(control(u)),.08,.88),lossB=clamp((target.pilotState.tactics.meleeClashCost+impact)*Math.sqrt(pressureA/pressureB)/Math.sqrt(control(target)),.08,.88);
 return {ma,mb,momentum,pa,pb,pressureA,pressureB,lossA,lossB,advantage:pressureA/pressureB};
}
export function meleeEngagementWindow(b,u,target,w,startDelta=null,committedFacing=u.forward){
 if(!u.alive||!target.alive||target.docked||u.side===target.side)return null;
 const end=sub(target.position,u.position),start=startDelta||end,travel=sub(end,start),travelSq=dot(travel,travel),closestT=clamp(-dot(start,travel)/Math.max(1e-9,travelSq));
 const reach=w.sim.rangeM+(target.entityType==='ship'?target.machine.sim.radiusM:0),slack=Math.min(18,w.sim.rangeM*.12),closest=add(start,mul(travel,closestT)),closestDistance=length(closest);
 if(closestDistance>reach+slack||!b.canSee(u.position,target.position))return null;
 // A fast crossing may leave the frontal arc by the nearest point. Authorize
 // the first distance-window entry too, instead of losing the entire exchange
 // between ticks. This uses abstract reach, never a hull or blade collision.
 const entryT=travelSq>1e-9?clamp(closestT-Math.sqrt(Math.max(0,(reach+slack)**2-closestDistance**2)/travelSq)):0;
 const candidates=[entryT,closestT,1,0].map(t=>add(start,mul(travel,t))).filter(d=>length(d)<=reach+slack+1e-6&&arcSolution(committedFacing,d,{...w.sim,arcYawDeg:Math.min(180,w.sim.arcYawDeg+12),arcPitchDeg:Math.min(180,w.sim.arcPitchDeg+12)}).inside);
 if(!candidates.length)return null;
 const delta=candidates.reduce((best,d)=>length(d)<length(best)?d:best),distance=length(delta);
 const n=norm(delta),relative=sub(u.velocity,target.velocity),closing=Math.max(0,dot(relative,n)),lateral=length(sub(relative,mul(n,dot(relative,n))));
 return {delta,n,distance,reach,rangeQuality:clamp(1-Math.max(0,distance-reach*.5)/Math.max(1,reach),.3,1),alignment:clamp((dot(committedFacing,n)+1)*.5),closing,lateral};
}
export function meleeContest(b,u,target,w,window,guarding,counter){
 const c=window||{delta:sub(target.position,u.position),closing:0,lateral:0,rangeQuality:1,alignment:1},skillA=meleeAbility(u),skillB=meleeAbility(target),p=u.pilotState.sim,q=target.pilotState.sim;
 const attack=(.35+.65*skillA)*(.4+.6*u.stability)*(.75+.25*p.tracking)*(w.sim.meleeAccuracy??1)*(.65+.35*c.alignment)*(.7+.3*c.rangeQuality);
 const facing=clamp((dot(target.forward,norm(mul(c.delta,-1)))+1)*.5),ready=guarding?1:clamp((b.t-(u.swing?.started??b.t)+.06)/Math.max(.04,q.reactionS));
 const maneuver=(.35+.65*skillB)*(.65+.35*q.maneuver)*(.45+.55*ready)*(.5+.5*facing),dodge=b.t<target.evadeUntil?1:0,slip=clamp(c.lateral/Math.max(150,length(u.velocity)+u.machine.sim.maxSpeedMps*.5));
 const hitChance=clamp(.76+.45*(attack-maneuver)+.12*(1-target.stability)-.2*dodge-.14*slip,.12,.97);
 const guardScore=(.35+.65*skillB)*(.35+.65*target.stability)*(counter?.sim.guardEfficiency??1)*(.7+.3*q.composure);
 const guardChance=guarding?clamp(.87+.16*(guardScore-attack),.66,.98):0;
 const momentumGain=clamp(c.closing/700,0,.35)*Math.sqrt(clamp(u.machine.sim.massKg/Math.max(1,target.machine.sim.massKg),.4,2));
 const outputGain=clamp(Math.sqrt(meleeOutput(u,b.t)/Math.max(1e4,target.machine.sim.thrustN)),.65,1.6);
 const damageFactor=clamp((.55+.55*skillA)*(.5+.5*u.stability)*(.8+.2*c.rangeQuality)*outputGain*(1+momentumGain),.22,1.85);
 return {attackScore:attack,defenseScore:maneuver,hitChance,guardChance,damageFactor,closing:c.closing,lateral:c.lateral,skillA,skillB};
}
