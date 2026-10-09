const controls=new WeakMap();
const normalize=text=>String(text).normalize('NFKC').toLocaleLowerCase().replace(/[\s·・／/_.-]+/g,'');
function matches(text,query){
 let at=0;for(const char of query){at=text.indexOf(char,at);if(at<0)return false;at++;}return true;
}

export function searchableSelect(id,label,options,value,parent){
 const wrap=document.createElement('label');wrap.className='gws-search-select';
 const caption=document.createElement('span');caption.textContent=label;
 const field=document.createElement('span');field.className='gws-search-field';
 const input=document.createElement('input');input.type='text';input.id='gws-'+id+'-query';input.autocomplete='off';input.spellcheck=false;
 input.className='gws-combo-input';input.placeholder='输入名称筛选…';input.setAttribute('role','combobox');input.setAttribute('aria-label',label);
 input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','gws-search-results');
 const arrow=document.createElement('span');arrow.className='gws-search-arrow';arrow.textContent='▾';arrow.setAttribute('aria-hidden','true');
 const select=document.createElement('select');select.id='gws-'+id;select.hidden=true;select.tabIndex=-1;
 const rows=options.map(([value,text,aliases=[]])=>{const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);return {value,text,search:normalize([text,value,...aliases].join(' '))};});
 select.value=value;input.value=select.selectedOptions[0]?.textContent||'';
 controls.set(input,{input,select,rows});field.append(input,arrow);wrap.append(caption,field,select);parent.append(wrap);return select;
}

// One popup and one set of delegated listeners for all formation selectors.
export function bindSearchSelect(root,signal){
 const popup=document.createElement('div');popup.id='gws-search-results';popup.className='gws-search-results';popup.setAttribute('role','listbox');popup.hidden=true;root.append(popup);
 let active=null,rows=[],cursor=-1;
 const close=()=>{if(active){active.input.value=active.select.selectedOptions[0]?.textContent||'';active.input.setAttribute('aria-expanded','false');active.input.removeAttribute('aria-activedescendant');}active=null;popup.hidden=true;popup.replaceChildren();};
 const position=()=>{
  if(!active||!active.input.isConnected||active.input.disabled){close();return;}
  const rect=active.input.getBoundingClientRect(),vv=window.visualViewport,left=vv?.offsetLeft||0,top=vv?.offsetTop||0,width=vv?.width||innerWidth,height=vv?.height||innerHeight;
  const below=top+height-rect.bottom-12,above=rect.top-top-12;
  const down=below>=100||below>=above,available=Math.max(0,down?below:above);
  popup.style.width=Math.min(rect.width,width-16)+'px';popup.style.maxHeight=Math.min(260,available)+'px';
  const x=Math.max(left+8,Math.min(rect.left,left+width-popup.offsetWidth-8));
  const y=down?rect.bottom+4:rect.top-4-popup.offsetHeight;
  popup.style.left=x+'px';popup.style.top=y+'px';
  const actual=popup.getBoundingClientRect();popup.style.left=(x+x-actual.x)+'px';popup.style.top=(y+y-actual.y)+'px';
 };
 const mark=()=>{for(const [i,node]of [...popup.children].entries()){node.classList.toggle('is-active',i===cursor);node.setAttribute('aria-selected',String(rows[i]?.value===active?.select.value));}const option=popup.children[cursor];if(option){active.input.setAttribute('aria-activedescendant',option.id);if(option.offsetTop<popup.scrollTop)popup.scrollTop=option.offsetTop;else if(option.offsetTop+option.offsetHeight>popup.scrollTop+popup.clientHeight)popup.scrollTop=option.offsetTop+option.offsetHeight-popup.clientHeight;}else active?.input.removeAttribute('aria-activedescendant');};
 const render=query=>{
  const needle=normalize(query);rows=active.rows.filter(row=>matches(row.search,needle));cursor=needle&&rows.length?0:rows.findIndex(row=>row.value===active.select.value);
  popup.replaceChildren();const fragment=document.createDocumentFragment();
  for(const [i,row]of rows.entries()){const item=document.createElement('div');item.id='gws-search-result-'+i;item.dataset.resultIndex=i;item.className='gws-search-result';item.setAttribute('role','option');item.textContent=row.text;fragment.append(item);}
  if(!rows.length){const empty=document.createElement('div');empty.className='gws-search-empty';empty.textContent='没有匹配项';fragment.append(empty);}
  popup.append(fragment);popup.hidden=false;active.input.setAttribute('aria-expanded','true');position();mark();
 };
 const open=input=>{const state=controls.get(input);if(!state||input.disabled)return;if(active===state)return;close();active=state;render('');input.select();};
 const choose=index=>{if(!active||!rows[index])return;const select=active.select,changed=select.value!==rows[index].value;select.value=rows[index].value;close();if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));};
 root.addEventListener('focusin',event=>open(event.target),{signal});
 root.addEventListener('click',event=>{const item=event.target.closest('[data-result-index]');if(item&&popup.contains(item)){choose(Number(item.dataset.resultIndex));return;}const input=event.target.closest('.gws-search-field')?.querySelector('input');if(input){input.focus();open(input);}},{signal});
 root.addEventListener('input',event=>{if(!controls.has(event.target))return;open(event.target);if(active)render(event.target.value);},{signal});
 // Editing a query never changes the actual formation or triggers a form rebuild.
 root.addEventListener('change',event=>{if(controls.has(event.target))event.stopPropagation();},{signal,capture:true});
 root.addEventListener('keydown',event=>{
  if(!controls.has(event.target))return;
  if(['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))event.preventDefault();
  if(event.key==='Escape'){close();return;}if(event.key==='Tab'){close();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){open(event.target);cursor=Math.max(0,Math.min(rows.length-1,cursor+(event.key==='ArrowDown'?1:-1)));mark();}
  if(event.key==='Enter'&&active)choose(cursor);
 },{signal});
 popup.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')event.preventDefault();},{signal});
 document.addEventListener('pointerdown',event=>{if(active&&!popup.contains(event.target)&&!active.input.parentElement.contains(event.target))close();},{signal,capture:true});
 root.addEventListener('focusout',()=>queueMicrotask(()=>{if(active&&document.activeElement!==active.input&&!popup.contains(document.activeElement))close();}),{signal});
 root.addEventListener('scroll',event=>{if(active&&!popup.contains(event.target))position();},{signal,capture:true});
 window.addEventListener('resize',position,{signal});window.visualViewport?.addEventListener('resize',position,{signal});window.visualViewport?.addEventListener('scroll',position,{signal});
 signal.addEventListener('abort',()=>{close();popup.remove();},{once:true});return close;
}
