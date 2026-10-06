const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const panels=new WeakMap();
export const mapUnitLabel=u=>[u?.name||'未知机体',u?.pilot||'无驾驶员'].join(' · ');
export const unitLabel=u=>[u?.id||'未知编号',u?.name||'未知机体',u?.pilot||'无驾驶员'].join(' · ');
export function commandRecipients(units,selection='all',type='attack',targetId=null){
 return units.filter(u=>u.side==='a'&&u.alive&&!u.docked&&!u.disabled&&(selection==='all'||selection===u.id||selection==='group:'+u.groupIndex)&&(type!=='escort'||u.id!==targetId));
}
export function commandTargetUnits(units,type,selection='all'){
 if(!['attack','screen','escort'].includes(type))return [];
 if(type!=='escort')return units.filter(u=>u.side!=='a'&&u.alive&&!u.docked);
 return units.filter(u=>u.side==='a'&&u.alive&&!u.docked&&commandRecipients(units,selection,type,u.id).length>0);
}
function meter(label,value,max,percentage=false){const row=node('label',label),bar=node('progress');bar.max=max||1;bar.value=value??0;row.append(bar,node('span',percentage?Math.round((value??0)*100)+'%':Math.round(value??0)+' / '+Math.round(max??0)));return row;}
function fullCard(u,focus){const activeProtection=u.defenseActive!=null&&(u.defenseLayers?.length?u.defenseLayers.some(d=>d.active):true);const card=node('article','', 'gws-unit-hud'+(focus===u.id?' is-focused':''));card.append(node('strong',unitLabel(u)),node('small',u.pilot+' · '+u.pilotState+' · 编组 '+(u.groupIndex+1)));
 for(const [label,value,max,percentage]of [['结构',u.structure,u.maxStructure],['装甲',u.armor,u.maxArmor],['能源',u.energy,u.maxEnergy],['稳定',u.stability??1,1,true],['跟踪',u.track,1,true]])if(label!=='稳定'||u.entityType!=='ship')card.append(meter(label,value,max,percentage));
 card.append(node('small','速度 '+Math.hypot(...u.velocity).toFixed(0)+'m/s · 高度 '+u.position[1].toFixed(0)+'m'),node('small',u.weapon+' · '+u.shots+' 发 / '+u.hits+' 命中'));
 if(!u.alive)card.append(node('small',u.coreActive?'失能 · 核心战机飞行中 · 等待有限组件重组':u.disabled?'失能 · 无法移动与攻击 · 可等待有限组件换装':'击毁'));
 if(u.totalEnergy!==undefined)card.append(node('small','总能源 '+(u.unlimitedEnergy?'∞':u.totalEnergy.toFixed(0)+' / '+u.maxTotalEnergy)+' · 回气 '+(u.energyRecoveryRate??0).toFixed(1)+'/s'+(u.energyArmorActive?' · 能量装甲启用':'')));
 if(u.coreActive)card.append(node('small','核心战机结构 '+Math.round(u.coreStructure??0)));
 if(u.formId||u.stealthActive||activeProtection||u.moduleSeparated)card.append(node('small',[u.formId?'形态 '+(u.formId==='ms'?'MS':'MA'):null,u.stealthActive?'海市蜃楼运行':null,activeProtection?'主动防护 '+(u.defenseActive?'运行':'能源不足'):null,u.moduleSeparated?'模块分离避射':null].filter(Boolean).join(' · ')));
 for(const [i,d] of (u.defenseLayers||[]).entries())if(d.capacity)card.append(meter('盾牌耐久',u.defenseIntegrity?.[i]??d.capacity,d.capacity));
 if(u.recoveryDebuff)card.append(node('small',u.recoveryDebuff+' · 回稳减速 '+(u.recoveryDebuffRemaining??0).toFixed(1)+'s'));
 if(u.weapons)card.append(node('small',u.weapons.map(w=>(w.slot?w.slot+' · ':'')+w.name+(w.ammo<0?'':' '+w.ammo)+' / '+(w.disabled?'形态禁用 / 部件受损':w.windup?'准备':w.readyIn>0?w.readyIn.toFixed(1)+'s':'待命')).join(' · ')));
 if(u.visible!==undefined)card.append(node('small','索敌：'+(u.visible?'位置可见':'保留估计方位')+' · 火控：'+(u.locked?'已锁定':'解算中')+' · 防御：'+(u.evasionMode==='predictive'?'预判侧闪':'警报后反应')));
 return card;
}
export function renderUnitPanel(box,units,side,focus){let panel=panels.get(box);if(!panel){const header=node('div','', 'gws-hud-header'),title=node('strong',side==='a'?'我方单位':side==='c'?'第三方单位':'敌方单位'),toggle=node('button','展开详情'),cards=node('div','', 'gws-hud-cards');toggle.type='button';cards.id=box.id+'-cards';toggle.setAttribute('aria-controls',cards.id);toggle.setAttribute('aria-expanded','false');header.append(title,toggle);box.replaceChildren(header,cards);panel={toggle,cards,expanded:false,units:[],focus:'overall'};panels.set(box,panel);toggle.addEventListener('click',()=>{panel.expanded=!panel.expanded;draw(panel);});}
 panel.units=units.filter(u=>u.side===side);panel.focus=focus;draw(panel);
}
function draw(panel){panel.toggle.textContent=panel.expanded?'收起详情':'展开详情';panel.toggle.setAttribute('aria-expanded',String(panel.expanded));panel.cards.classList.toggle('is-compact',!panel.expanded);panel.cards.replaceChildren();
 for(const u of panel.units){if(panel.expanded){panel.cards.append(fullCard(u,panel.focus));continue;}const card=node('article','', 'gws-unit-compact'+(panel.focus===u.id?' is-focused':'')+(!u.alive?' is-destroyed':''));card.append(node('strong',unitLabel(u)),meter(u.disabled?'结构 · 失能':'结构',u.structure,u.maxStructure));panel.cards.append(card);}
}
