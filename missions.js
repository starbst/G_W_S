import {swapMissionSides} from './side-swap.js';
import { length, sub } from "./math.js";

export function resolveMission(scenario,catalog){
 if(scenario.mission)return scenario.mission;
 const base=catalog.missions.find(m=>m.id===scenario.missionId)||null;
 return scenario.sidesSwapped?swapMissionSides(base):base;
}
export const CONDITION_LABELS={eliminate:'全歼阵营',destroy:'击毁目标',repel:'击退目标',disarm:'解除阵营武装',reach:'到达区域',protect:'限时保护',timeout:'时间到达',seize:'占领目标', 'complete-work':'完成作业','field-failed':'战场结构失效',all:'全部条件满足',any:'任一条件满足'};
export function defaultCondition(type,side,units){
 const own=units.find(u=>u.side===side)||units[0],enemy=units.find(u=>u.side!==side)||units[0];
 if(type==='all'||type==='any')return {type,conditions:[{type:'eliminate',side:side==='a'?'b':'a'}]};
 if(type==='field-failed')return {type};
 if(type==='eliminate'||type==='disarm')return {type,side:side==='a'?'b':'a'};
 if(type==='timeout')return {type,seconds:180};
 const worker=units.find(u=>u.side===side&&u.machine?.workSystem);const entityId=type==='complete-work'?(worker||own).id:['reach','protect'].includes(type)?own.id:enemy.id;
 if(type==='reach')return {type,entityId,point:[8000,0,0],radiusM:1000};
 if(type==='protect')return {type,entityId,seconds:180};
 if(type==='seize')return {type,entityId,side,radiusM:200,contestedRadiusM:500,holdS:10};
 return {type,entityId};
}
export function genericMission(type,units){
 const m={kind:'mission',id:'local-mission',name:'当局作战任务',victory:{}};
 const sides=[...new Set(units.map(u=>u.side))],first=side=>units.find(u=>u.side===side&&u.machine?.entityType==='ship')||units.find(u=>u.side===side);
 for(const side of sides)m.victory[side]=defaultCondition(type==='duel'?'destroy':'eliminate',side,units);
 if(type==='fleet'){for(const side of sides){const other=side==='a'?'b':'a',flagship=first(other);m.victory[side]={type:'any',conditions:[{type:'eliminate',side:other},{type:'destroy',entityId:flagship.id}]};}}
 if(type==='escort'||type==='defend'){
 const target=first('a');m.victory.a=type==='escort'?{type:'reach',entityId:target.id,point:[8000,target.position?.[1]||0,0],radiusM:1000}:{type:'protect',entityId:target.id,seconds:180};
 m.victory.b={type:'any',conditions:[{type:'destroy',entityId:target.id},{type:'eliminate',side:'a'}]};
 m.priorities={b:{primaryEntityId:target.id,primaryValue:8}};
 }
 return m;
}
export const missionConditionSchema={type:'object',additionalProperties:false,properties:{type:{type:'string',enum:Object.keys(CONDITION_LABELS)},conditions:{type:'array',minItems:1,maxItems:16,items:{$ref:'#/$defs/gwsMissionCondition'}},side:{type:'string',enum:['a','b','c']},entityId:{type:'string',pattern:'^[abc]-[0-9]+-[0-9]+$'},point:{type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-200000,maximum:200000}},radiusM:{type:'number',minimum:1,maximum:100000},contestedRadiusM:{type:'number',minimum:10,maximum:5000},holdS:{type:'number',minimum:1,maximum:120},seconds:{type:'number',minimum:1,maximum:86400}},required:['type']};
const unitRef={type:'string',pattern:'^[abc]-[0-9]+-[0-9]+$'},pointSchema={type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-200000,maximum:200000}};
export const missionSchema={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['mission']},id:{type:'string',maxLength:100},name:{type:'string',maxLength:200},victory:{type:'object',additionalProperties:false,properties:Object.fromEntries(['a','b','c'].map(s=>[s,{$ref:'#/$defs/gwsMissionCondition'}])),required:['a','b']},priorities:{type:'object',additionalProperties:false,properties:Object.fromEntries(['a','b','c'].map(s=>[s,{type:'object',additionalProperties:false,properties:{primaryEntityId:unitRef,primaryValue:{type:'number',minimum:0,maximum:100}},required:['primaryEntityId','primaryValue']}]))},withdrawals:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,properties:{entityId:unitRef,point:pointSchema,radiusM:{type:'number',minimum:50,maximum:10000},healthFraction:{type:'number',minimum:0,maximum:2},energyFraction:{type:'number',minimum:0,maximum:2},threatFraction:{type:'number',minimum:0,maximum:2},cohesionEntityId:unitRef,cohesionHealthFraction:{type:'number',minimum:.01,maximum:1}},required:['entityId','point','radiusM','healthFraction','energyFraction','threatFraction']}}},required:['kind','id','name','victory']};

const alive = b => b.units.filter(u => u.alive && u.combatant !== false);

function condition(b, c) {
    const units = b.units.filter(u => (!c.side || u.side === c.side) && (!c.entityId || u.id === c.entityId)), present = c.entityId?b.unitById.get(c.entityId):units[0];
    switch (c.type) {
      case "all":
        return c.conditions.every(x => condition(b, x));

      case "any":
        return c.conditions.some(x => condition(b, x));

      case "field-failed":
        return b.fieldFailed===true;

      case "eliminate":
        return !alive(b).some(u => u.side === c.side);

      case "disarm":
        return !alive(b).some(u=>u.side===c.side&&u.weapons.some(w=>!w.disabled&&w.ammo!==0&&w.definition.sim.damage>0));

      case "seize": {
        if(!present?.alive)return false;const contenders=b.units.filter(u=>u.alive&&!u.docked&&u.combatant!==false&&u.side===c.side&&length(sub(u.position,present.position))<=c.radiusM);const blocked=b.units.some(u=>u.alive&&!u.docked&&u.combatant!==false&&u.side!==c.side&&length(sub(u.position,present.position))<=c.contestedRadiusM);
        b.captureProgress??=new Map();const key=c.side+":"+c.entityId,old=b.captureProgress.get(key)||{t:b.t,elapsed:0},dt=Math.max(0,b.t-old.t);const elapsed=contenders.length&&!blocked?old.elapsed+dt:0;b.captureProgress.set(key,{t:b.t,elapsed});return elapsed>=c.holdS;
      }

      case "complete-work":
        return !!present?.alive&&present.workProgress>=1;

      case "repel":
        return !!present&&(!present.alive||present.withdrawn);

      case "destroy":
        return !!present && !present.alive && !present.withdrawn;

      case "reach":
        return !!present?.alive && !present.docked && length(sub(present.position, c.point)) <= c.radiusM;

      case "protect":
        return b.t >= c.seconds && !!present?.alive;

      case "timeout":
        return b.t >= c.seconds;

      default:
        throw Error("未知任务条件 " + c.type);
    }
}

export function captureObjective(b,u) {
    let goal=null;const visit=c=>{if(c.conditions)c.conditions.forEach(visit);if(c.type==="seize")goal=c;};const own=b.mission?.victory[u.side];if(own)visit(own);return goal;
}

export function missionResult(b) {
    if (!b.mission) return null;
    const achieved=Object.entries(b.mission.victory).filter(([side,c])=>condition(b,c)).map(([side])=>side);
    const a=achieved.includes("a"),c=achieved.includes("b");
    if (achieved.length) return {
        reason: achieved.length>1 ? "mutual-objective" : "objective",
        winner: achieved.length===1 ? achieved[0] : null,
        t: b.t,
        mission: b.mission.id
    };
    if (b.rules.maxSeconds>0&&b.t >= b.rules.maxSeconds) return {
        reason: "timeout",
        winner: null,
        t: b.t,
        mission: b.mission.id
    };
    return null;
}

export function missionPriority(b, u, x) {
    const p = b.mission?.priorities?.[u.side];
    return x.id === p?.primaryEntityId ? p.primaryValue ?? 8 : 0;
}

export function validateMission(m) {
    const allowed = [ "kind", "id", "name", "victory", "priorities", "withdrawals" ];
    if (!m || Object.keys(m).some(k => !allowed.includes(k)) || !m.victory || Object.keys(m.victory).some(k => ![ "a", "b", "c" ].includes(k))) throw Error("任务包含未知字段");
    for (const [side, p] of Object.entries(m.priorities || {})) if (![ "a", "b", "c" ].includes(side) || !p || Object.keys(p).some(k => ![ "primaryEntityId", "primaryValue" ].includes(k)) || !/^([abc])-\d+-\d+$/.test(p.primaryEntityId) || !Number.isFinite(p.primaryValue) || p.primaryValue < 0 || p.primaryValue > 100) throw Error("任务优先目标错误");
    for(const w of m.withdrawals||[]){if(!w||Object.keys(w).some(k=>!['entityId','point','radiusM','healthFraction','energyFraction','threatFraction','cohesionEntityId','cohesionHealthFraction'].includes(k))||!/^([abc])-\d+-\d+$/.test(w.entityId)||!Array.isArray(w.point)||w.point.length!==3||w.point.some(x=>!Number.isFinite(x)||Math.abs(x)>200000)||!Number.isFinite(w.radiusM)||w.radiusM<50||w.radiusM>10000)throw Error('撤离区域错误');for(const k of ['healthFraction','energyFraction','threatFraction'])if(!Number.isFinite(w[k])||w[k]<0||w[k]>2)throw Error('撤离阈值错误');if(w.cohesionEntityId!==undefined&&(!/^([abc])-\d+-\d+$/.test(w.cohesionEntityId)||w.cohesionEntityId[0]!==w.entityId[0]||!Number.isFinite(w.cohesionHealthFraction)||w.cohesionHealthFraction<=0||w.cohesionHealthFraction>1))throw Error('协同撤離阈值错误');if(w.cohesionHealthFraction!==undefined&&!w.cohesionEntityId)throw Error('协同撤離单位缺失');}if((m.withdrawals||[]).length>16)throw Error('撤离区域过多');
    const visit = (c, depth = 0) => {
        if (!c || depth > 8 || ![ "all", "any", "field-failed", "eliminate", "disarm", "destroy", "repel", "seize", "complete-work", "reach", "protect", "timeout" ].includes(c.type)) throw Error("任务条件错误");
        const allowedKeys = [ "type", ...c.type==="field-failed" ? [] : [ "all", "any" ].includes(c.type) ? [ "conditions" ] : ["eliminate","disarm"].includes(c.type) ? [ "side" ] : [ "destroy", "repel", "seize", "complete-work", "reach", "protect" ].includes(c.type) ? [ "entityId", ...c.type === "seize" ? ["side","radiusM","contestedRadiusM","holdS"] : [], ...c.type === "reach" ? [ "point", "radiusM" ] : c.type === "protect" ? [ "seconds" ] : [] ] : [ "seconds" ] ];
        if (Object.keys(c).some(k => !allowedKeys.includes(k))) throw Error("任务条件包含未知字段");
        if ([ "all", "any" ].includes(c.type)) {
            if (!Array.isArray(c.conditions) || !c.conditions.length || c.conditions.length > 16) throw Error("任务条件列表错误");
            c.conditions.forEach(x => visit(x, depth + 1));
        } else if (["eliminate","disarm"].includes(c.type) && ![ "a", "b", "c" ].includes(c.side)) throw Error("全歼阵营错误"); else if ([ "destroy", "repel", "seize", "complete-work", "reach", "protect" ].includes(c.type) && !/^([abc])-\d+-\d+$/.test(c.entityId)) throw Error("任务实体引用错误");
        if(c.type==="seize"&&(!["a","b","c"].includes(c.side)||!Number.isFinite(c.radiusM)||c.radiusM<10||c.radiusM>500||!Number.isFinite(c.contestedRadiusM)||c.contestedRadiusM<c.radiusM||c.contestedRadiusM>5000||!Number.isFinite(c.holdS)||c.holdS<1||c.holdS>120))throw Error("控制目标条件错误");
        if (c.type === "reach" && (!Array.isArray(c.point) || c.point.length !== 3 || c.point.some(x => !Number.isFinite(x)) || !(Number.isFinite(c.radiusM) && c.radiusM > 0 && c.radiusM <= 1e5))) throw Error("任务目标点错误");
        if ([ "protect", "timeout" ].includes(c.type) && !(c.seconds > 0 && c.seconds <= 86400)) throw Error("任务时限错误");
    };
    visit(m.victory?.a);
    visit(m.victory?.b);
    if(m.victory.c)visit(m.victory.c);
}

export function navigationGoal(b, u) {
    if(u.commandAssignment?.source==='player')return null;
    const withdrawal=b.mission?.withdrawals?.find(w=>w.entityId===u.id);if(u.withdrawing&&withdrawal)return withdrawal;
    let goal = null;
    const visit = c => {
        if (c.conditions) c.conditions.forEach(visit);
        if (c.type === "reach" && c.entityId === u.id) goal = c;
    };
    if (b.mission?.victory[u.side]) visit(b.mission.victory[u.side]);
    return goal;
}

export function withdrawalOption(b,u){if(u.commandAssignment?.source==='player')return null;const goal=b.mission?.withdrawals?.find(w=>w.entityId===u.id);if(!goal||u.entityType==='terrain'||!u.withdrawing&&u.components.engine<=.05)return null;
 const health=u.structure/u.machine.sim.structure,energy=u.energy/u.machine.sim.energyCapacity,threat=b.t-(u.observedHeavyAt??-100)<5?(u.observedHeavyDamage||0)/u.machine.sim.structure:0;
 const peer=goal.cohesionEntityId&&b.unitById.get(goal.cohesionEntityId),cohesion=peer&&peer.side===u.side&&(!peer.alive||peer.structure/peer.machine.sim.structure<goal.cohesionHealthFraction);
 return u.withdrawing||cohesion||health<goal.healthFraction||energy<goal.energyFraction||threat>=goal.threatFraction?{...goal,health,energy,threat}:null;
}
export function updateWithdrawals(b){for(const u of b.units){const goal=u.withdrawing&&b.mission?.withdrawals?.find(w=>w.entityId===u.id);if(!goal||!u.alive||length(sub(u.position,goal.point))>goal.radiusM)continue;u.withdrawn=true;u.alive=false;u.locked=false;u.order='withdrawn';b.cancelAttacks(u);for(const d of b.drones)if(d.owner===u.id){d.phase='return';d.aim=null;}b.emit('withdrawn',u.id,u.machine.name+' 脱离交战区',{position:[...u.position]});}}
