import {sub,norm,dot,length} from './math.js';
const hasCivilianTag=x=>x.machine.tags?.includes('civilian');
const missionTargets=(condition,id)=>!!condition&&(condition.conditions?condition.conditions.some(c=>missionTargets(c,id)):['destroy','seize'].includes(condition.type)&&condition.entityId===id);
export function mayEngage(b,u,target){
 if(!target||target===u||target.side===u.side)return false;
 if(!hasCivilianTag(target))return true;
 const command=u.commandAssignment;if(command?.source==='player'&&['attack','screen'].includes(command.type)&&command.targetId===target.id)return true;
 if(b.mission?.priorities?.[u.side]?.primaryEntityId===target.id||missionTargets(b.mission?.victory?.[u.side],target.id))return true;
 const seen=u.contacts.get(target.id);if(!seen||b.t-seen.observedAt>.8)return false;
 if(seen.aimTargetIds?.includes(u.id))return true;
 if(!(u.pilotState.strategies?.['reckless-clearance']>0))return false;
 const delta=sub(seen.position,u.position),range=Math.max(0,...u.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.effectiveRangeM));
 return length(delta)<=range&&length(seen.velocity)>30&&dot(u.forward,norm(delta))>.65;
}
