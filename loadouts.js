// Finite physical equipment delivery. No scenario IDs, plot clocks or forced outcomes.
import {add,sub,mul,norm,length,clamp,bodyBasis} from './math.js';
const activeGun=(u,id)=>u.weapons.find(w=>w.definition.id===id);
export function initializeLoadouts(u){const s=u.machine.loadoutSystem;if(!s)return;u.loadoutId=s.initialId;u.loadoutBase={sim:structuredClone(u.machine.sim),mobility:structuredClone(u.machine.mobility),tags:[...u.machine.tags]};applyLoadout(u,s.sets.find(x=>x.id===s.initialId));for(const w of u.weapons)if(w.formDisabled&&w.ammo>=0)w.ammo=0;}
function applyLoadout(u,set){const m=u.machine,base=u.loadoutBase;u.loadoutId=set.id;u.formId='loadout-'+set.id;
 for(const [key,factor] of [['massKg',null],['thrustN','thrust'],['maxSpeedMps','speed'],['turnRateDeg','turn']])m.sim[key]=(set[key]??base.sim[key])*(factor?u.skillRuntime?.factors[factor]??1:1);
 m.mobility.pitchRateDeg=base.mobility.pitchRateDeg*(set.turnRateDeg??base.sim.turnRateDeg)/base.sim.turnRateDeg*(u.skillRuntime?.factors.turn??1);
 m.tags=[...(set.tags??base.tags)];u.defenseEnabledIndices=set.defenseIndices?new Set(set.defenseIndices):null;
 for(const state of u.weapons){state.formDisabled=!set.weaponIds.includes(state.definition.id);state.attack=null;state.salvo=null;}
 for(const slot of Object.keys(u.slotSelected)){const next=u.weapons.find(w=>w.definition.slot===slot&&!w.formDisabled&&!w.disabled);if(next)u.slotSelected[slot]=next.definition.id;}
 u.selected=Object.values(u.slotSelected).find(id=>activeGun(u,id)&&!activeGun(u,id).formDisabled)||u.selected;
}
function utility(b,u,set,target){const contact=u.contacts.get(target.id);if(!contact)return 0;const d=length(sub(contact.position,u.position)),base=u.loadoutBase.sim;
 const guns=set.weaponIds.map(id=>activeGun(u,id)?.definition).filter(Boolean);
 const power=guns.reduce((n,w)=>{const s=w.sim;if(w.kind!=='melee'&&(d>s.rangeM||d<s.minRangeM))return n;const reach=w.kind==='melee'?Math.min(1,650/Math.max(1,d)):Math.min(1,s.effectiveRangeM/Math.max(1,d));return n+s.damage*(s.burst||1)/Math.max(1,s.cooldownS+s.windupS)*reach;},0);
 const capacity=(set.maxSpeedMps??base.maxSpeedMps)/base.maxSpeedMps;
 return power+12*capacity+Number((set.tags??u.loadoutBase.tags).includes('air-combat'))*10;
}
export function serviceLoadouts(b,u){const config=u.machine.loadoutSystem;if(!config||!u.alive||u.docked||b.t<(u.loadoutCheckAt||0))return;u.loadoutCheckAt=b.t+.5;
 if(b.objects.some(o=>o.loadoutTarget===u.id&&o.life>0))return;
 const target=b.targetFor(u),current=config.sets.find(s=>s.id===u.loadoutId),value=utility(b,u,current,target),low=u.totalEnergy/u.machine.sim.totalEnergy<.025+.175*(u.pilotState.capabilities?.energyDiscipline??.5);
 const choices=[];for(const carrier of b.spatial.sides[u.side]||[]){const supply=carrier.machine.loadoutSupply;if(!carrier.alive||!supply||length(sub(carrier.position,u.position))>supply.rangeM||!b.canSee(carrier.position,u.position))continue;
 carrier.loadoutStock??=supply.stock.map(s=>({...s}));for(const stock of carrier.loadoutStock){if(stock.family!==config.family||stock.count<=0)continue;const set=config.sets.find(s=>s.id===stock.setId);if(!set)continue;const score=utility(b,u,set,target),gain=score-value;
 if((set.id!==u.loadoutId&&gain>Math.max(5,value*.25))||low&&stock.energyStock>0)choices.push({carrier,supply,stock,set,score:gain+(low?stock.energyStock/100:0)});}}
 choices.sort((a,z)=>z.score-a.score||a.carrier.id.localeCompare(z.carrier.id));const choice=choices[0];if(!choice)return;
 const {carrier,supply,stock,set}=choice;stock.count--;const toward=norm(sub(u.position,carrier.position)),origin=add(add(carrier.position,mul(toward,carrier.machine.sim.radiusM+40)),mul(bodyBasis(carrier.forward).up,carrier.machine.sim.radiusM*.8));
 b.objects.push({id:'loadout-'+u.id+'-'+ ++b.sequence,owner:carrier.id,side:u.side,name:set.name,entityType:'pod',shape:'module',position:origin,previous:[...origin],velocity:mul(toward,supply.speedMps),forward:toward,radius:8,life:Math.min(120,supply.rangeM/supply.speedMps+10),signature:.2,occluder:false,loadoutTarget:u.id,setId:set.id,energyStock:stock.energyStock,ammo:structuredClone(stock.ammo||{}),installS:set.installS});
 b.emit('loadout-supply',carrier.id,carrier.machine.name+' 发出 '+set.name,{target:u.id,loadout:set.id,stock:stock.count});
}
export function guideLoadout(b,o,dt){if(!o.loadoutTarget||o.life<=0)return;const u=b.unitById.get(o.loadoutTarget);if(!u?.alive){o.life=0;return;}if(u.capturedBy){o.velocity=mul(norm(sub(u.position,o.position)),Math.min(length(o.velocity),Math.max(0,length(sub(u.position,o.position))-150)*.5));return;}
 if(o.assemblyUntil!=null){o.position=[...u.position];o.velocity=[...u.velocity];if(b.t<o.assemblyUntil)return;
 const set=u.machine.loadoutSystem?.sets.find(s=>s.id===o.setId);if(!set){o.life=0;return;}
 const old=u.machine.loadoutSystem.sets.find(s=>s.id===u.loadoutId);for(const id of old.weaponIds.filter(id=>!set.weaponIds.includes(id))){const state=activeGun(u,id);if(state)state.ammo=state.ammo>=0?0:state.ammo;if(state?.definition.kind!=='melee'){b.objects.push({id:'unmount-'+ ++b.sequence,owner:u.id,side:u.side,name:state.definition.name,entityType:'pod',shape:'module',position:[...u.position],previous:[...u.position],velocity:add(u.velocity,mul(u.forward,-25)),forward:[...u.forward],radius:4,life:8,signature:.3,occluder:false});}}
 applyLoadout(u,set);for(const [id,ammo] of Object.entries(o.ammo)){const w=activeGun(u,id);if(w&&w.ammo>=0)w.ammo=Math.min(w.definition.sim.ammo,w.ammo+ammo);}
 const amount=Math.min(o.energyStock,Math.max(0,u.machine.sim.totalEnergy-u.totalEnergy));u.totalEnergy+=amount;u.energy=Math.min(u.machine.sim.energyCapacity,u.energy+amount);u.stability=clamp(u.stability-.12);u.nextDecision=b.t;o.life=0;
 b.emit('loadout-installed',u.id,u.machine.name+' 接取 '+set.name,{loadout:set.id,energy:amount,massKg:u.machine.sim.massKg});return;}
 const delta=sub(add(u.position,mul(u.velocity,.15)),o.position),speed=length(o.velocity);o.velocity=mul(norm(delta),speed);o.forward=norm(delta);
 if(length(sub(u.position,o.position))<=Math.max(30,speed*dt)){o.assemblyUntil=b.t+o.installS;b.cancelAttacks(u);u.loadoutAssemblyUntil=o.assemblyUntil;b.emit('loadout-attach',u.id,u.machine.name+' 正在安装 '+o.name,{loadout:o.setId,duration:o.installS});}
}
