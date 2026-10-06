// A bounded factual handoff for RP. The full event stream stays in the recording/log UI.
export const RP_REPORT_LIMIT=4000;
export const RP_REPORT_FOOTER="击毁、失能只代表机体退出作战，不判定驾驶员死亡。驾驶员是否战死、弃机或获救由RP根据上下文判断。以上为模拟器原始结算摘要，供RP参考。玩家可在战报编辑区或本轮输入中明确修订，续写以玩家确认的版本为准；未列出的动作与对白可合理补写。";
const SIDE={a:'阵营A',b:'阵营B',c:'阵营C'};
function sideName(side,units){const group=units.filter(u=>u.side===side),names=[...new Set([...group.filter(u=>u.entityType==='ship'),...group].map(u=>clean(u.name,28)).filter(Boolean))];return (SIDE[side]||'参战阵营')+(names.length?'（'+names.slice(0,3).join('、')+(names.length>3?'等':'')+'）':'');}
function neutralText(value,units,actor){const side=actor?.side,others=[...new Set(units.map(u=>u.side))].filter(s=>s!==side),opponent=side&&others.length===1?SIDE[others[0]]:'对手阵营';return String(value??'').replace(/我方/g,SIDE[side]||'指定参战方').replace(/敌方/g,opponent).replace(/我机/g,'该机体').replace(/敌机/g,'对手机体');}
const MEDIUM={space:'太空',orbit:'近轨空域',air:'大气空域',surface:'海面',water:'水下',ground:'陆地'};
const clean=(value,max=120)=>String(value??'').replace(/[\r\n\t<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const ratio=(n,max)=>Number.isFinite(n)&&max>0?Math.max(0,Math.min(1,n/max)):null;
const below=(n,max,threshold)=>{const r=ratio(n,max);return r!==null&&r<threshold;};
function outcome(u){return u.withdrawn||u.order==='withdrawn'?'脱离交战':u.coreActive?'失能，核心战机飞行中':u.disabled?'失能，不能攻击或移动':!u.alive?'击毁':below(u.structure,u.maxStructure,.4)?'存活，重创':below(u.structure,u.maxStructure,.75)?'存活，受损':'存活';}
function condition(u){
 const notes=[];if(!u.alive)return notes;
 if(!u.unlimitedEnergy&&below(u.totalEnergy,u.maxTotalEnergy,.12))notes.push('总能源接近耗尽');else if(below(u.energy,u.maxEnergy,.15))notes.push('当前能源不足');
 if(Number.isFinite(u.stability)&&u.stability<.2)notes.push('姿态失稳');
 const failed=Object.values(u.componentState||{}).filter(p=>p.structure>0&&p.health<=p.structure*.15);
 for(const [role,label]of [['engine','推进严重受损'],['sensor','传感器严重受损'],['power','供电严重受损']])if(failed.some(p=>p.role===role))notes.push(label);
 if(u.weapons?.length&&u.weapons.every(w=>w.disabled||w.ammo===0))notes.push('无法使用武器');return notes;
}
function resultText(result,units){
 if(result?.winner){const winner=SIDE[result.winner]?sideName(result.winner,units):clean(units.find(u=>u.id===result.winner)?.name||'获胜参战单位',60);return winner+'完成任务 / 获胜';}
 return ({mutual:'双方均失去作战能力',timeout:'时限内未分胜负',aborted:'玩家结束，未判定胜负',error:'计算异常中止，未判定胜负',interrupted:'中断片段，未判定胜负','preview-window':'片段结束，未判定胜负'})[result?.reason]||'尚未结算';
}
function unitLines(units,focus){
 const groups=new Map();for(const u of units){const text=outcome(u),extra=condition(u).join('、'),key=[u.side,u.name,u.pilot,u.pilotState,text,extra].join('|');let g=groups.get(key);if(!g){g={u,text,extra,count:0,focused:false};groups.set(key,g);}g.count++;if(u.id===focus)g.focused=true;}
 return [...groups.values()].sort((a,b)=>Number(b.focused)-Number(a.focused)||Number(b.u.entityType==='ship')-Number(a.u.entityType==='ship')||Number(!b.u.alive)-Number(!a.u.alive)).map(g=>clean(SIDE[g.u.side]||'单位',12)+'：'+clean(g.u.name,45)+(g.count>1?' ×'+g.count:'')+' / '+clean(g.u.pilot,30)+(g.u.pilotState?'（'+clean(g.u.pilotState,25)+'）':'')+'：'+g.text+(g.extra?'；'+g.extra:''));
}
function milestones(log,units,end){
 const byId=new Map(units.map(u=>[u.id,u])),groups=new Map(),lastHit=new Map();
 const label=id=>{const u=byId.get(id);return u?clean(u.name,40)+'（'+(u.pilot?clean(u.pilot,22)+' · ':'')+(SIDE[u.side]||'参战单位')+' · '+clean(u.id,24)+'）':'单位';};
 const put=(key,e,text,rank)=>{const g=groups.get(key);if(g){g.count++;g.last=e.t;if(rank>g.rank){g.text=text;g.rank=rank;}if(e.type==='parry')g.text=label(e.actor)+'与'+label(e.opponent)+'多次拼刀交锋';return;}groups.set(key,{t:e.t,last:e.t,text,rank,count:1});};
 for(const e of log||[]){if(!Number.isFinite(e.t)||e.t>end+.001)continue;const a=byId.get(e.actor),z=byId.get(e.target),name=label(e.actor);let rank=0,text='',key=e.type+'|'+e.actor+'|'+(e.target||e.opponent||'');
  if(e.type==='hit'){
   lastHit.set(e.target,e);const damage=ratio(e.structureDamage,z?.maxStructure),loss=e.stabilityLoss||0;if(!(damage>=.2||loss>=.6))continue;
   const weapon=a?.weapons?.find(w=>w.id===e.weapon),kind=weapon?.name||({melee:'近战',beam:'光束',ballistic:'实弹',missile:'飞弹'})[e.kind]||'攻击';
   text=name+'以'+clean(kind,35)+'命中'+label(e.target)+(damage>=.2?'，造成重创':'，使其明显失稳');rank=50+Math.min(20,(damage||0)*20);key='heavy-hit|'+e.target+'|'+(e.weapon||e.kind||'');
  }else if(['destroyed','disabled'].includes(e.type)){
   const hit=lastHit.get(e.actor),cause=hit&&e.t-hit.t<=.6?label(hit.actor)+'使':'',status=e.type==='disabled'?'失能':'被击毁';text=cause+name+status;rank=100;key=e.type+'|'+(a?.side||'')+'|'+(a?.name||e.actor)+'|'+Math.floor(e.t/5);
   if(e.text?.includes('核心战机'))text=name+'的核心战机被击毁，无法重组';
  }else if(e.type==='withdrawn'){text=name+'脱离交战区域';rank=95;
  }else if(e.type==='self-destruct'){text=name+'启动机体自爆，波及'+label(e.target);rank=95;
  }else if(e.type==='self-destruct-armed'){text=name+'保持抓取并准备自爆';rank=80;
  }else if(e.type==='self-destruct-aborted'){text=name+'接触自爆被打断';rank=80;
  }else if(e.type==='captured'){text=name+'近距抓取'+label(e.target);rank=85;
  }else if(e.type==='capture-released'){text=label(e.target)+'摆脱抓取，'+clean(neutralText(e.text,units,a),100);rank=85;
  }else if(e.type==='phase-down'){text=name+'PS装甲供电中断，实弹防护失效';rank=70;
  }else if(e.type==='loadout-installed'){text=name+'接取'+clean(e.loadout||'新背包',30)+'，更换武装';rank=65;
  }else if(e.type==='reactivated'){text=name+'收到备用组件，重组恢复作战';rank=110;
  }else if(e.type==='core-flight'){text=name+'以核心战机脱离，等待重组';rank=95;
  }else if(e.type==='parry'){text=name+'与'+label(e.opponent)+'拼刀'+(e.text?.includes('交错')?'后交错飞过':e.text?.includes('黏')?'并短暂缠斗':'后分离');rank=65;key='parry|'+[e.actor,e.opponent].sort().join('|');
  }else if(e.type==='counter-thrust'){text=name+'反推进喷射，抵消拼刀冲击';rank=85;
  }else if(['jettison','detach'].includes(e.type)){text=name+'抛弃外挂武装，减重突进';rank=80;key='jettison|'+e.actor;
  }else if(e.type==='skill'){text=clean(neutralText(e.text,units,a),120);rank=80;key+='|'+(e.skill||'');
  }else if(e.type==='component-hit'){
   const part=a?.componentState?.[e.component];if(!(e.health===0||part?.health===0))continue;text=clean(neutralText(e.text,units,a),120);rank=75;key+='|'+(e.component||'');
  }else if(e.type==='module-separation'){text=name+'分离机体模块躲过来袭射线';rank=70;
  }else if(['module-replace','deuterion-transfer'].includes(e.type)){text=e.type==='module-replace'?name+'接收备用模块，修复损伤':name+'向'+label(e.target)+'补充氘核能源';rank=60;
  }else if(e.type==='battlefield-failure'){text=clean(neutralText(e.text||'关键支撑累计受损，战场结构失效',units,a),120);rank=95;key='battlefield-failure|'+(e.battlefield||'');
  }else if(e.type==='environment'){text=clean(neutralText(e.text,units,a),120);rank=45;key+='|'+(e.environment||'');
  }else if(e.type==='decoy-lock'){text=name+'的浮游炮误锁'+(e.target&&byId.has(e.target)?label(e.target)+'的':'对手的')+'卸装诱饵';rank=65;
  }else if(e.type==='launch'){text=clean(neutralText(e.text,units,a),120);rank=40;key='launch|'+(a?.side||'')+'|'+(a?.name||e.actor);
  }else if(e.type==='decision'&&['closeAngle','rangeReset','bypass','screen','disengage'].includes(e.order)){text=clean(neutralText(e.text,units,a),120);rank=35;key='decision|'+(a?.side||'')+'|'+(a?.name||e.actor)+'|'+e.order;
  }
  if(text)put(key,e,text,rank);
 }
 return [...groups.values()].sort((a,b)=>b.rank-a.rank||a.t-b.t).slice(0,12).sort((a,b)=>a.t-b.t).map(g=>g.t.toFixed(1)+(g.count>1&&g.last>g.t?'—'+g.last.toFixed(1):'')+'秒：'+g.text+(g.count>1?'（同类关键情况共'+g.count+'次）':''));
}
export function buildRpBattleReport(snapshot,log=[],record={}){
 if(!snapshot)return '';const units=snapshot.units||[],result=snapshot.result||record?.result,end=Number.isFinite(snapshot.t)?snapshot.t:0,footer=RP_REPORT_FOOTER;
 const lines=['GWS_BATTLE_REPORT','作战：'+clean(record?.battleName||record?.name||'高达战斗',100)];
 if(snapshot.mission)lines.push('任务：'+clean(neutralText(snapshot.mission,units),140));const env=record?.environment?.medium;if(MEDIUM[env])lines.push('战场：'+MEDIUM[env]);
 lines.push('结果：'+resultText(result,units),'时长：'+end.toFixed(1)+'秒','阵营编号仅区分本场参战编组；RP视角及角色归属以原聊天为准。');
 for(const side of ['a','b','c']){const group=units.filter(u=>u.side===side);if(group.length)lines.push(sideName(side,units)+'：'+group.length+'单位，保留作战能力'+group.filter(u=>u.alive).length+'，失能'+group.filter(u=>u.disabled).length+'，击毁'+group.filter(u=>!u.alive&&!u.disabled&&!u.withdrawn&&u.order!=='withdrawn').length+(group.some(u=>u.withdrawn||u.order==='withdrawn')?'，脱离'+group.filter(u=>u.withdrawn||u.order==='withdrawn').length:''));}
 let length=lines.join('\n').length;const append=(line,budget)=>{if(length+line.length+1>budget)return false;lines.push(line);length+=line.length+1;return true;};
 append('重要最终状态：',1800);const states=unitLines(units,record?.startConditions?.scenario?.focus);let added=0;for(const line of states)if(added<12&&append(line,1800))added++;if(added<states.length)append('其余单位已计入各方统计，省略重复细节。',1900);
 append('关键过程（已合并重复事件）：',RP_REPORT_LIMIT-footer.length-2);const events=milestones(log,units,end);if(!events.length)append('没有记录到值得单独列出的重大转折。',RP_REPORT_LIMIT-footer.length-2);for(const line of events)append(line,RP_REPORT_LIMIT-footer.length-2);
 return lines.concat(footer).join('\n');
}
