const matches=(event,rule)=>(!rule.actorPrefix||event.actor?.startsWith(rule.actorPrefix))&&Object.entries(rule.oneOf||{}).every(([k,values])=>values.includes(event[k]))&&Object.entries(rule.match||{}).every(([k,v])=>event[k]===v)&&Object.entries(rule.minimum||{}).every(([k,v])=>Number.isFinite(event[k])&&event[k]>=v)&&Object.entries(rule.maximum||{}).every(([k,v])=>Number.isFinite(event[k])&&event[k]<=v);
export function evaluate(contract,b){const checks={};for(const rule of contract.criteria){
 if(rule.type==='units')checks[rule.id]=rule.units.every(id=>{const u=b.unitById.get(id);return !!u&&u.alive===rule.alive;});
 else if(rule.type==='event-actors')checks[rule.id]=rule.actors.every(actor=>b.events.some(e=>e.actor===actor&&matches(e,rule)));
 else if(rule.type==='event')checks[rule.id]=b.events.filter(e=>matches(e,rule)).length>=(rule.count||1);
 else if(rule.type==='sequence'){let i=0;for(const e of b.events)if(i<rule.events.length&&matches(e,rule.events[i]))i++;checks[rule.id]=i===rule.events.length;}
 else if(rule.type==='last-hit')checks[rule.id]=matches(b.events.findLast(e=>e.type==='hit'&&e.target===rule.target)||{},rule);
 else if(rule.type==='velocity-course'){const u=b.unitById.get(rule.unit),speed=u?Math.hypot(...u.velocity):0;checks[rule.id]=!!u&&speed>=rule.minimumSpeed&&u.velocity.reduce((n,v,i)=>n+v*rule.axis[i],0)/Math.max(.01,speed)/Math.hypot(...rule.axis)>=rule.minimumCosine;}
 else if(rule.type==='position-progress'){const unit=b.unitById.get(rule.unit),start=b.scenario.deployments?.find(x=>x.id===rule.unit);const distance=p=>Math.hypot(...p.map((v,i)=>v-rule.point[i]));checks[rule.id]=!!unit&&!!start&&distance([start.x,start.y,start.z])-distance(unit.position)>=rule.minimumM;}
 else if(rule.type==='position-near'){const u=b.unitById.get(rule.unit);checks[rule.id]=!!u?.alive&&Math.hypot(...u.position.map((v,i)=>v-rule.point[i]))<=rule.radiusM;}
 else if(rule.type==='unit'){const unit=b.unitById.get(rule.unit);checks[rule.id]=!!unit&&(!Object.hasOwn(rule,'alive')||unit.alive===rule.alive)&&Object.entries(rule.match||{}).every(([k,v])=>unit[k]===v)&&Object.entries(rule.minimum||{}).every(([k,v])=>Number.isFinite(unit[k])&&unit[k]>=v)&&Object.entries(rule.maximum||{}).every(([k,v])=>Number.isFinite(unit[k])&&unit[k]<=v);}
 else if(rule.type==='winner')checks[rule.id]=b.result?.winner===rule.side;
 else throw Error('Unknown case criterion '+rule.type);
 }return {checks,all:Object.values(checks).every(Boolean)};}
