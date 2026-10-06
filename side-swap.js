const flip=s=>s==='a'?'b':s==='b'?'a':s;
export function swapEntityId(id){return typeof id==='string'&&/^[ab]-\d+-\d+$/.test(id)?flip(id[0])+id.slice(1):id;}
export function swapMissionSides(mission){
 if(!mission)return null;const m=structuredClone(mission);
 const remap=c=>{if(c.conditions)c.conditions.forEach(remap);if(c.entityId)c.entityId=swapEntityId(c.entityId);if(c.side)c.side=flip(c.side);};
 const victory={};for(const[s,c]of Object.entries(m.victory)){remap(c);victory[flip(s)]=c;}m.victory=victory;
 if(m.priorities){const priorities={};for(const[s,p]of Object.entries(m.priorities))priorities[flip(s)]={...p,primaryEntityId:swapEntityId(p.primaryEntityId)};m.priorities=priorities;}
 for(const w of m.withdrawals||[]){w.entityId=swapEntityId(w.entityId);if(w.cohesionEntityId)w.cohesionEntityId=swapEntityId(w.cohesionEntityId);}
 return m;
}
export function swapScenarioSides(scenario){
 const s=structuredClone(scenario);if(s.mission)s.mission=swapMissionSides(s.mission);[s.aForces,s.bForces]=[s.bForces,s.aForces];
 for(const side of ['a','b','c'])for(const g of s[side+'Forces']||[])for(const key of ['carrierId','mountId'])if(g[key])g[key]=swapEntityId(g[key]);
 if(s.deployments)for(const d of s.deployments)d.id=swapEntityId(d.id);
 if(['a','b'].includes(s.focus))s.focus=flip(s.focus);else s.focus=swapEntityId(s.focus);
 if(s.sidesSwapped)delete s.sidesSwapped;else s.sidesSwapped=true;
 return s;
}
