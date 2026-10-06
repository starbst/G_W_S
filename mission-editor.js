import {unitLabel} from './unit-ui.js';
import {resolveMission,genericMission,defaultCondition,CONDITION_LABELS} from './missions.js';
// Edits a copy of the current battle mission. The worldbook is never mutated here.
export function renderMissionEditor({parent,scenario,catalog,units,onChange,onError}){
 const mission=structuredClone(resolveMission(scenario,catalog));
 const box=document.createElement('fieldset');box.className='gws-mission-editor';const legend=document.createElement('legend');legend.textContent='胜败任务 · 当局设置';box.append(legend);parent.append(box);
 const e=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
 const commit=fn=>{try{const next=structuredClone(mission);fn(next);onChange(next);}catch(error){onError(error.message);}};
 const nodeAt=(m,path)=>path.reduce((o,k)=>o[k],m);
 function choice(parent,label,options,value,change){const wrap=e('label',label),input=e('select');for(const [id,name]of options){const o=e('option',name);o.value=id;input.append(o);}input.value=value;input.addEventListener('change',()=>change(input.value));wrap.append(input);parent.append(wrap);return input;}
 function number(parent,label,value,min,max,change,step=1){const wrap=e('label',label),input=e('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=value;input.addEventListener('change',()=>{if(input.value===''||!input.validity.valid){onError(label+' 超出允许范围');return;}change(Number(input.value));});wrap.append(input);parent.append(wrap);return input;}
 function button(parent,text,action){const b=e('button',text);b.type='button';b.addEventListener('click',event=>{event.stopPropagation();action();});parent.append(b);return b;}
 const options=units.map(u=>[u.id,unitLabel(u)]);
 choice(box,'通用任务模板',[['current','当前配置 / 自定义'],['annihilation','全歼作战'],['duel','击毁指定目标'],['fleet','舰队决战'],['escort','护送到达'],['defend','限时保护']],'current',type=>{try{onChange(genericMission(type,units));}catch(error){onError(error.message);}});
 box.append(e('small','模板只是开始条件。下面可逐项编辑、增加或删除；我方胜利条件也就是敌方失败条件。全部修改仅作用于本局。'));
 const sides=[...new Set(units.map(u=>u.side))];
 function condition(c,path,side,parent,depth=0){
 const row=e('div',undefined,'gws-mission-condition');parent.append(row);
 const types=Object.entries(CONDITION_LABELS).filter(([id])=>(id!=='field-failed'||catalog.battlefields.find(f=>f.id===scenario.battlefieldId)?.failure)&&(id!=='complete-work'||units.some(u=>u.side===side&&u.machine?.workSystem)));
 choice(row,'条件',types,c.type,type=>commit(m=>{const p=nodeAt(m,path.slice(0,-1));p[path.at(-1)]=defaultCondition(type,side,units);}));
 const set=(key,value)=>commit(m=>nodeAt(m,path)[key]=value);
 if(c.conditions){
 c.conditions.forEach((child,index)=>{const wrapper=e('div',undefined,'gws-mission-child');row.append(wrapper);condition(child,[...path,'conditions',index],side,wrapper,depth+1);const remove=button(wrapper,'删除条件',()=>commit(m=>nodeAt(m,path).conditions.splice(index,1)));remove.disabled=c.conditions.length===1;});
 const add=button(row,'增加条件',()=>commit(m=>nodeAt(m,path).conditions.push(defaultCondition('destroy',side,units))));add.disabled=depth>=7||c.conditions.length>=16;
 }else{
 const fields=e('div',undefined,'gws-mission-fields');row.append(fields);
 if(c.side)choice(fields,'目标阵营',sides.map(s=>[s,s==='a'?'我方':s==='b'?'敌方':'第三方']),c.side,v=>set('side',v));
 if(c.entityId)choice(fields,'目标单位',options,c.entityId,v=>set('entityId',v));
 if(c.point)c.point.forEach((v,i)=>number(fields,'目标 '+['X','Y','Z'][i]+'（米）',v,-200000,200000,n=>commit(m=>nodeAt(m,path).point[i]=n),10));
 for(const [key,label,min,max]of [['radiusM','区域半径（米）',c.type==='seize'?10:1,c.type==='seize'?500:100000],['contestedRadiusM','敌方争夺半径（米）',c.radiusM||10,5000],['holdS','连续占领（秒）',1,120],['seconds','目标时间（秒）',1,86400]])if(c[key]!==undefined)number(fields,label,c[key],min,max,v=>set(key,v));
 }
 }
 for(const side of sides){const detail=e('details',undefined,'gws-mission-side');detail.open=true;detail.append(e('summary',(side==='a'?'我方':side==='b'?'敌方':'第三方')+'胜利条件'));box.append(detail);if(mission.victory[side])condition(mission.victory[side],['victory',side],side,detail);
 else button(detail,'添加胜利条件',()=>commit(m=>m.victory[side]=defaultCondition('eliminate',side,units)));
 const priorities=e('details');priorities.append(e('summary','作战优先目标'));detail.append(priorities);const checkLabel=e('label',undefined,'gws-mission-toggle'),check=e('input');check.type='checkbox';check.checked=!!mission.priorities?.[side];checkLabel.append(check,e('span','指挥重点目标'));priorities.append(checkLabel);check.addEventListener('change',()=>commit(m=>{m.priorities??={};if(check.checked)m.priorities[side]={primaryEntityId:units.find(u=>u.side!==side).id,primaryValue:8};else delete m.priorities[side];}));
 if(mission.priorities?.[side]){const p=mission.priorities[side];choice(priorities,'优先目标',options,p.primaryEntityId,v=>commit(m=>m.priorities[side].primaryEntityId=v));number(priorities,'指挥权重',p.primaryValue,0,100,v=>commit(m=>m.priorities[side].primaryValue=v),.5);}
 }
 const withdrawal=e('details');withdrawal.append(e('summary','撤离条件（'+(mission.withdrawals?.length||0)+'）'));box.append(withdrawal);withdrawal.append(e('small','低结构、低能源或近期受到重攻击时进入撤离航路；到达区域后退出本局。阈值为比例，1 表示 100%。'));
 for(const[wIndex,w]of (mission.withdrawals||[]).entries()){
 const row=e('div',undefined,'gws-mission-condition'),set=(k,v)=>commit(m=>m.withdrawals[wIndex][k]=v);withdrawal.append(row);choice(row,'撤离单位',options,w.entityId,v=>commit(m=>{const w=m.withdrawals[wIndex];w.entityId=v;if(w.cohesionEntityId&&w.cohesionEntityId[0]!==v[0]){delete w.cohesionEntityId;delete w.cohesionHealthFraction;}}));
 const fields=e('div',undefined,'gws-mission-fields');row.append(fields);w.point.forEach((v,i)=>number(fields,'撤离 '+['X','Y','Z'][i],v,-200000,200000,n=>commit(m=>m.withdrawals[wIndex].point[i]=n),10));
 for(const[k,label,min,max]of [['radiusM','撤离区域半径',50,10000],['healthFraction','结构撤离阈值',0,2],['energyFraction','能源撤离阈值',0,2],['threatFraction','近期重攻击阈值',0,2]])number(fields,label,w[k],min,max,v=>set(k,v),k==='radiusM'?10:.01);
 choice(row,'协同撤离参照',[['','无'],...options.filter(([id])=>id[0]===w.entityId[0])],w.cohesionEntityId||'',v=>commit(m=>{const w=m.withdrawals[wIndex];if(v){w.cohesionEntityId=v;w.cohesionHealthFraction??=.5;}else{delete w.cohesionEntityId;delete w.cohesionHealthFraction;}}));
 if(w.cohesionEntityId)number(row,'协同参照结构阈值',w.cohesionHealthFraction,.01,1,v=>set('cohesionHealthFraction',v),.01);
 button(row,'删除撤离条件',()=>commit(m=>m.withdrawals.splice(wIndex,1)));
 }
 const add=button(withdrawal,'增加撤离条件',()=>commit(m=>{m.withdrawals??=[];m.withdrawals.push({entityId:units[0].id,point:[-8000,0,0],radiusM:1000,healthFraction:.2,energyFraction:.1,threatFraction:.5});}));add.disabled=(mission.withdrawals?.length||0)>=16;
 return box;
}
