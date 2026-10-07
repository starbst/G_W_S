// 高达战争模拟器 · 酒馆助手全局脚本。启用挂载唯一魔法棒入口；停用同时关闭悬浮入口。
const host=window.parent,doc=host.document,owner=crypto.randomUUID();
let mountedApi=null;
function mount(){
 const menu=doc.getElementById('extensionsMenu'),api=host.GundamWarSimulator;
 if(!menu||!api)return;
 let item=doc.getElementById('gws-wand-entry');
 if(!item){
  item=doc.createElement('div');item.id='gws-wand-entry';item.className='extension_container';
  const button=doc.createElement('div');button.className='list-group-item flex-container flexGap5';button.tabIndex=0;button.setAttribute('role','button');
  const icon=doc.createElement('i');icon.className='fa-solid fa-robot';const label=doc.createElement('span');label.textContent='高达战斗模拟器';button.append(icon,label);
  const open=()=>{host.GundamWarSimulator?.open();menu.style.display='none';};
  button.addEventListener('click',open);button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  item.append(button);menu.append(item);
 }
 item.dataset.owner=owner;const wand=doc.getElementById('extensionsMenuButton');if(wand)wand.style.display='flex';
 if(mountedApi!==api){mountedApi=api;api.setEnabled(true);}
}
mount();const timer=setInterval(mount,500);
window.addEventListener('pagehide',()=>{
 clearInterval(timer);const item=doc.getElementById('gws-wand-entry');if(item?.dataset.owner!==owner)return;
 item.remove();host.GundamWarSimulator?.setEnabled(false);
});
