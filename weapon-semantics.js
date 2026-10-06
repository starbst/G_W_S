// Mount location is not a threat class: a head/body mount can carry a heavy cannon.
export function isLightAutomatic(w){return w.kind==='ballistic'&&w.sim.damage<=8&&w.sim.windupS<=.1&&(w.mount==='head'||w.tags?.includes('burst-defense')||w.template==='head-vulcan');}
// Light automatic fire chips intact armor; unarmored contacts remain vulnerable.
// This is a gameplay calibration shared by damage and utility, not a canon statistic.
export function weaponDamageScale(w,target){return isLightAutomatic(w)?(target?.armor>0?.04:.32):1;}
// Do not spend a tactical change on harmless tracers. A nearly destroyed target
// can still treat a light volley as consequential, rather than ignoring a lethal shot.
export function isTacticalThreat(w,target,damageMultiplier=1){return !isLightAutomatic(w)||w.sim.damage*weaponDamageScale(w,target)*(w.sim.burst||1)*damageMultiplier>=Math.max(.01,target?.structure??Infinity)*.2;}

// A compact cue class is decided once per shot, not once per render frame.
export function weaponVisual(w,kind=w.kind){
 const t=w.template||w.id;
 if(kind==='melee')return ['seed-knife','seed-claw'].includes(t)?'thrust':'slash';
 if(['missile','funnel-missile'].includes(kind))return ['seed-bazooka','rocket-launcher'].includes(t)?'rocket':'missile';
 if(kind==='beam')return w.sim.beamClass==='large'?'large-beam':(w.remoteControl||kind!==w.kind)?'remote-beam':['seed-rifle','beam-rifle'].includes(t)||w.tags?.includes('beam-rifle')?'rifle-beam':'beam';
 if(kind==='funnel')return 'remote-beam';
 if(t==='seed-boomerang')return 'boomerang';if(t==='seed-anchor')return 'anchor';
 if(isLightAutomatic(w))return 'vulcan';
 if((w.sim.pellets||1)>1)return 'scatter';
 if(w.sim.impactMode==='area')return 'shell';
 if(['seed-rail','seed-linear'].includes(t)||w.tags?.includes('railgun'))return 'rail';
 return 'round';
}
