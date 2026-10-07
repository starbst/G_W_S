import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseWorldbook} from '../domain.js';
import {Battle} from '../simulation.js';
import {weaponPotential,weaponUtility,meaningfulThreat} from '../weapon-choice.js';
import {bladeTrade} from '../pilot-strategies.js';
import {estimateMeleeClash,meleeEngagementWindow} from '../melee-exchange.js';
import {resolveBladeV5} from '../combat.js';
import {length,sub,norm} from '../math.js';
const c=parseWorldbook(JSON.parse(await fs.readFile(new URL('../worldbook-seed.json',import.meta.url))));
const initial={"battlefieldId":"seed-heliopolis-interior","missionId":"ce-local-duel","environmentId":"land","distanceM":240,"altitudeM":0,"focus":"overall","mode":"auto","aForces":[{"machineId":"seed-strike-unarmed-start","pilotId":"seed-kira","stateId":"period-1","count":1,"strategy":"attack","pilotOptions":{"skills":{"seed-focus":false,"mercy-strike":false,"battle-os-adaptation":true},"strategies":{"drift-window":false,"pursuit-fire":false}},"initialState":{"velocity":[0,0,0]}}],"bForces":[{"machineId":"seed-ginn-miguel","pilotId":"seed-miguel","stateId":"period-1","count":1,"strategy":"attack","initialState":{"velocity":[0,0,0]}}],"deployments":[{"id":"a-0-0","x":-120,"y":0,"z":0},{"id":"b-0-0","x":120,"y":0,"z":0}],"maxSeconds":180,"seed":741389496};
let checks=0;function check(label,fn){fn();checks++;console.log('PASS '+label);}
function setup(plan=initial,seed=741389496){const b=new Battle(c,structuredClone(plan),seed);b.step();return b;}
function pose(b,d){const [u,v]=b.units;u.position=[0,50,0];v.position=[d,50,0];u.forward=[1,0,0];v.forward=[-1,0,0];u.velocity=v.velocity=[0,0,0];u.visible=v.visible=true;for(const [a,z]of [[u,v],[v,u]]){const contact={position:[...z.position],velocity:[...z.velocity],forward:[...z.forward],observedAt:b.t,t:b.t};a.contacts.set(z.id,contact);a.lastSeen=contact;a.lastSeenAt=b.t;}u.stability=v.stability=1;u.pendingReaction=v.pendingReaction=null;u.pendingGuard=v.pendingGuard=null;return [u,v];}
check('close-range knife is worth much more than auxiliary vulcan',()=>{const b=setup(),[u,v]=pose(b,30),knife=u.weapons.find(w=>w.definition.kind==='melee'),light=u.weapons.find(w=>w.definition.mount==='head');assert.ok(weaponPotential(b,u,knife,v)>weaponPotential(b,u,light,v)*10);});
check('melee cannot be selected as an actual attack outside reachable range',()=>{const b=setup(),[u,v]=pose(b,900);assert.equal(weaponUtility(b,u,u.weapons.find(w=>w.definition.kind==='melee'),v),-Infinity);});
check('expired range and unavailable ammunition have no offensive value',()=>{const b=setup(),[u,v]=pose(b,3000),light=u.weapons[0];assert.equal(weaponPotential(b,u,light,v),0);pose(b,200);light.ammo=0;assert.equal(weaponPotential(b,u,light,v),0);});
check('real closure is used without an invented 250m/s floor',()=>{const b=setup(),[u,v]=pose(b,200),trade=bladeTrade(b,u,v,80),expected=estimateMeleeClash(u,v,80,b.t,true);assert.equal(trade.estimate.momentum,expected.momentum);assert.ok(trade.estimate.momentum<estimateMeleeClash(u,v,250,b.t,true).momentum);});
check('broken stability still prohibits parry and blade attack',()=>{const b=setup(),[u,v]=pose(b,30);u.stability=.05;assert.equal(bladeTrade(b,u,v,60).canParry,false);assert.equal(b.weaponDecision(u,v,u.weapons[1]),false);});
check('armor-aware threat does not cancel an approach for absorbed machinegun fire',()=>{const b=setup(),[u,v]=pose(b,300),mg=v.weapons[0];assert.equal(meaningfulThreat(b,v,mg.definition,u,300,[-1,0,0]),false);u.defenseActive=false;assert.equal(meaningfulThreat(b,v,mg.definition,u,300,[-1,0,0]),true);});
check('an offensive dash draws its blade without an early empty-air stroke',()=>{const b=setup(),[u,v]=pose(b,200),blade=u.weapons[1];u.order='melee';u.breakaway={meleeDash:true,target:v.id,started:b.t,contactIn:.9,until:b.t+.3};u.slotReadyAt.slot1=b.t;blade.attack=blade.salvo=null;b.beginAttack(u,v,blade);assert.equal(blade.attack,null);});
check('main blade stays displayed while independent light slot fires',()=>{const b=setup(),[u,v]=pose(b,200);u.order='melee';u.meleeIntent={targetId:v.id};b.prepareBlade(u,v,u.weapons[1],'test');b.selectWeapon(u,u.weapons[0],'auxiliary');assert.equal(u.selected,u.weapons[1].definition.id);});
check('light tracers are ignored against intact armor, not against a dying unarmored unit',()=>{const b=setup(),[u,v]=pose(b,100),light=u.weapons.find(w=>w.definition.mount==='head').definition;v.defenseActive=false;v.armor=100;assert.equal(meaningfulThreat(b,u,light,v,100,[-1,0,0]),false);v.armor=0;v.structure=.5;assert.equal(meaningfulThreat(b,u,light,v,100,[-1,0,0]),true);});
for(const pilotId of ['elite-pilot','ace-pilot'])for(const machineId of ['seed-strike','seed-duel']){
 check('slot selection favors close blade and distant rifle: '+machineId+' / '+pilotId,()=>{const plan=structuredClone(initial);plan.aForces[0]={machineId,pilotId,stateId:'standard',count:1,strategy:'attack'};let b=setup(plan),[u,v]=pose(b,30);for(const w of u.weapons){w.attack=w.salvo=null;w.readyAt=b.t;}u.order='melee';b.serviceWeapons(u);assert.equal(u.weapons.find(w=>w.definition.id===u.slotSelected.slot1).definition.kind,'melee');b=setup(plan);[u,v]=pose(b,1200);u.order='aim';u.locked=true;for(const w of u.weapons){w.attack=w.salvo=null;w.fireControl.locked=true;w.readyAt=b.t;}b.serviceWeapons(u);assert.equal(u.weapons.find(w=>w.definition.id===u.slotSelected.slot1).definition.kind,'beam');});
}
check('successful yielding guard takes less stability loss than a head-on clash',()=>{function clash(mode){const b=setup(),[u,v]=pose(b,30),blade=u.weapons.find(w=>w.definition.kind==='melee'),counter=v.weapons.find(w=>w.definition.kind==='melee');v.slotSelected[counter.definition.slot]=counter.definition.id;v.slotReadyAt[counter.definition.slot]=b.t;v.guardUntil=b.t+1;v.guardReadyAt=b.t;v.guardMode=mode;u.swing={started:b.t-.5,weaponId:blade.definition.id};b.randomFor=()=>()=>0;const window=meleeEngagementWindow(b,u,v,blade.definition);resolveBladeV5(b,u,v,blade.definition,window.delta,window);return b.events.findLast(e=>e.type==='melee-exchange');}const yielding=clash('deflect'),headOn=clash('brace');assert.match(yielding.outcome,/卸力格挡/);assert.ok(yielding.lossB<headOn.lossB);});
const reports=[];
for(const seed of [741389496,1,17,29,53]){
 const b=setup(initial,seed);let started=0,cancelled=0;const begin=b.beginAttack,release=b.releaseAttack;
 b.beginAttack=function(u,v,w){const previous=w.attack;begin.call(this,u,v,w);if(u.id==='a-0-0'&&w.definition.kind==='melee'&&!previous&&w.attack)started++;};
 b.releaseAttack=function(u,v,w){const previous=w.attack,shots=w.shots;release.call(this,u,v,w);if(u.id==='a-0-0'&&w.definition.kind==='melee'&&previous&&previous.at<=this.t&&w.shots===shots)cancelled++;};
 while(b.t<90&&!b.result)b.step();const u=b.units[0],blade=u.weapons.find(w=>w.definition.kind==='melee'),clashes=b.events.filter(e=>e.type==='melee-exchange'&&(e.actor===u.id||e.target===u.id));
 check('short-blade battle uses blade contacts and guard: seed '+seed,()=>{assert.ok(blade.shots>=3,'knife shots '+blade.shots);assert.ok(clashes.length>=3);assert.ok(cancelled<started*.5,'cancelled '+cancelled+'/'+started);});
 reports.push({seed,started,cancelled,bladeShots:blade.shots,contacts:clashes.length,time:b.t});
}
console.log(JSON.stringify({checks,passed:checks,reports}));
