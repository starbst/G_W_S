// Defensive ammunition is deployed against observed beam threats, never fired as a damaging missile.
import {add,sub,mul,norm,length,dot,bodyBasis,segmentSphere} from './math.js';
export function deployCountermeasures(b,u){if(!u.alive||u.docked||b.tick%5!==0)return;
 const screen=u.weapons.find(w=>w.definition.sim.countermeasure==='beam-screen'&&!w.disabled&&!w.formDisabled&&w.ammo>0&&b.t>=w.readyAt);if(!screen)return;
 const own=b.units.filter(a=>a.alive&&a.side===u.side&&length(sub(a.position,u.position))<2500),observed=[];
 for(const foe of b.enemies(u)||[]){const contact=u.contacts.get(foe.id);if(!contact||b.t-contact.observedAt>1)continue;
 for(const w of foe.weapons)if(w.attack&&w.definition.kind==='beam'&&own.some(a=>a.id===w.attack.targetId)){const delta=sub(contact.position,u.position);observed.push({foe,delta,time:w.attack.at-b.t+length(delta)/w.definition.sim.projectileSpeedMps});}}
 for(const shot of b.projectiles){if(shot.kind!=='beam'||b.unitById.get(shot.owner)?.side===u.side||!own.some(a=>a.id===shot.target)||!b.canSee(u.position,shot.position))continue;const delta=sub(shot.position,u.position);if(dot(norm(shot.velocity),norm(mul(delta,-1)))>.8)observed.push({delta,time:length(delta)/length(shot.velocity)});}
 observed.sort((a,z)=>a.time-z.time);const threat=observed[0];if(!threat)return;
 const s=screen.definition.sim,count=Math.min(s.burst,screen.ammo),range=Math.min(900,length(threat.delta)*.25),flight=range/s.projectileSpeedMps;if(threat.time<flight)return;
 const axis=norm(threat.delta),basis=bodyBasis(axis),origin=add(u.position,mul(axis,u.machine.sim.radiusM+30));screen.ammo-=count;screen.readyAt=b.t+s.cooldownS;
 for(let i=0;i<count;i++)b.objects.push({id:'beam-screen-'+ ++b.sequence,owner:u.id,side:u.side,name:screen.definition.name,entityType:'pod',shape:'module',position:add(origin,mul(basis.right,(i-(count-1)/2)*80)),previous:[...origin],velocity:mul(axis,s.projectileSpeedMps),forward:axis,radius:2,life:flight+.2,screenAt:b.t+flight,screenRadius:s.blastRadiusM,screenCapacity:s.screenCapacity,screenDuration:s.screenDurationS,screenAbsorption:s.screenAbsorption});
 b.emit('countermeasure',u.id,u.machine.name+' 发射 '+screen.definition.name+'，在来袭光束方向布置防御幕',{weapon:screen.definition.id,count,readyAt:screen.readyAt});
}
export function guideCountermeasure(b,o){if(o.screenAt==null||b.t<o.screenAt||o.life<=0)return;b.clouds.push({id:o.id,type:'beam-screen',position:[...o.position],radiusM:o.screenRadius,capacity:o.screenCapacity,absorption:o.screenAbsorption,until:b.t+o.screenDuration,visualOcclusion:false});o.life=0;b.emit('beam-screen',o.owner,'反光束幕扩散',{object:o.id,position:[...o.position]});}
export function attenuateBeam(b,shot,next){if(shot.kind!=='beam')return;for(const cloud of b.clouds){if(cloud.type!=='beam-screen'||cloud.until<=b.t||cloud.capacity<=0||shot.screenedBy?.includes(cloud.id)||!segmentSphere(sub(shot.position,cloud.position),sub(next,cloud.position),cloud.radiusM))continue;
 const multiplier=b.rules.damageMultiplier||1,raw=shot.weapon.damage*multiplier,blocked=Math.min(cloud.capacity,raw*cloud.absorption);cloud.capacity-=blocked;shot.weapon={...shot.weapon,damage:Math.max(0,shot.weapon.damage-blocked/multiplier)};(shot.screenedBy??=[]).push(cloud.id);b.emit('beam-attenuated',shot.owner,'光束穿过防御幕，实际能量被削减',{object:cloud.id,damage:blocked,position:[...cloud.position]});}
}
