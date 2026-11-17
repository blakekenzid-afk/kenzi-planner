/* Kenzi's Planner v2 — Autumn Coffeehouse. Data lives in Firestore through the planner API. */
(function(){
'use strict';
var VERSION='2.4.0';
var PLANNER_API=window.PLANNER_API_OVERRIDE||'https://script.google.com/macros/s/AKfycby2K77ahxWPKILsKQNSUwa199QUB7uymfJbCbZUT9eRmwBT-8f6wZW-WVovfLPS7cZ4bQ/exec';
var COLS=['groceries','meals','todos','events','reminders','brain','bills','lists','kids'];
var PK=localStorage.getItem('pk')||'';
(function(){var m=(location.search+location.hash).match(/[?&#]k=([^&#]+)/);if(m){PK=decodeURIComponent(m[1]);localStorage.setItem('pk',PK);try{history.replaceState(null,'',location.pathname);}catch(e){}}})();

/* ---------------- helpers ---------------- */
var $=function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function pad(n){return (n<10?'0':'')+n;}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parseD(s){if(!s)return null;var p=String(s).split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function addDays(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function today(){var n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());}
function monday(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()),w=(x.getDay()+6)%7;return addDays(x,-w);}
var DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],DNL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
function nice(s){var d=parseD(s);if(!d)return '';var t=today(),diff=Math.round((d-t)/864e5);if(diff===0)return 'Today';if(diff===1)return 'Tomorrow';if(diff===-1)return 'Yesterday';
 return DN[d.getDay()]+' '+MN[d.getMonth()].slice(0,3)+' '+d.getDate();}
function fmtTime(t){t=normT(t)||t;if(!t)return '';var p=t.split(':'),h=+p[0],m=p[1];return (h%12||12)+(m!=='00'?':'+m:'')+(h<12?'am':'pm');}
function money(v){var n=parseFloat(String(v).replace(/[^0-9.\-]/g,''));if(isNaN(n))return '';var s=n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return '$'+s.replace(/\.00$/,'');}
function num(v){var n=parseFloat(String(v).replace(/[^0-9.\-]/g,''));return isNaN(n)?0:n;}
function monthKey(d){d=d||today();return d.getFullYear()+'-'+pad(d.getMonth()+1);}
var isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;if(isTouch)document.documentElement.classList.add('touch');

/* ---------------- API + local store ---------------- */
function api(fn,args){return fetch(PLANNER_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({k:PK,fn:fn,args:args||[]})})
 .then(function(r){return r.json();}).then(function(j){if(!j.ok){if(j.e==='locked')showLock();throw j.e;}return j.r;});}
var DB={};COLS.forEach(function(c){DB[c]=[];});
try{var cached=JSON.parse(localStorage.getItem('db2')||'null');if(cached)COLS.forEach(function(c){DB[c]=cached[c]||[];});}catch(e){}
var OUT=[];try{OUT=JSON.parse(localStorage.getItem('outbox2')||'[]');}catch(e){OUT=[];}
function persist(){try{localStorage.setItem('db2',JSON.stringify(DB));localStorage.setItem('outbox2',JSON.stringify(OUT));}catch(e){}}
function find(c,id){for(var i=0;i<DB[c].length;i++)if(DB[c][i].id===id)return DB[c][i];return null;}
function applyOp(op){var a=DB[op.c];if(op.op==='put'){for(var i=0;i<a.length;i++)if(a[i].id===op.item.id){a[i]=op.item;return;}a.push(op.item);}else{DB[op.c]=a.filter(function(x){return x.id!==op.id;});}}
function save(c,item){if(!item.id)item.id=uid();if(!item.created)item.created=Date.now();var copy=JSON.parse(JSON.stringify(item));applyOp({op:'put',c:c,item:copy});
 OUT=OUT.filter(function(o,i){if(i===0&&flushing)return true;return !(o.op==='put'&&o.c===c&&o.item.id===item.id);});
 OUT.push({op:'put',c:c,item:copy});persist();rerender();flush();remHook(c,copy);return copy;}
function remove(c,id,silent){var old=find(c,id);applyOp({op:'del',c:c,id:id});OUT.push({op:'del',c:c,id:id});persist();rerender();flush();if(old)remHook(c,old,true);
 if(old&&!silent)toast('Removed',function(){save(c,old);});}
var flushing=false,retryT=null;
function setSync(s){var el=$('#sync');if(!el)return;el.className='sync'+(s==='busy'?' busy':s==='off'?' off':'');el.querySelector('span').textContent=s==='busy'?'saving…':s==='off'?'offline – will retry':'saved';}
function flush(){if(flushing||!PK)return;if(!OUT.length){setSync('ok');return;}flushing=true;setSync('busy');var op=OUT[0];
 var p=op.op==='put'?api('put',[op.c,op.item]):api('del',[op.c,op.id]);
 p.then(function(){OUT.shift();persist();flushing=false;flush();})
  .catch(function(e){flushing=false;setSync('off');clearTimeout(retryT);retryT=setTimeout(flush,15000);if(e==='locked')return;console.warn('save failed',e);});}
window.addEventListener('online',flush);
var loaded=false;
function loadAll(){setSync('busy');return api('listAll').then(function(r){COLS.forEach(function(c){DB[c]=r[c]||[];});OUT.forEach(applyOp);persist();loaded=true;rerender();remSyncAll();gRemSyncAll();setSync(OUT.length?'busy':'ok');flush();})
 .catch(function(e){setSync('off');if(e!=='locked')toast('Showing your saved copy – I’ll sync when I can');});}

/* ---------------- toast ---------------- */
var tT;function toast(msg,undo){var t=$('#toast');t.innerHTML=esc(msg)+(undo?' &nbsp;<button class="link" style="color:#F6DE8A" id="undo">Undo</button>':'');t.classList.add('on');
 if(undo)$('#undo').onclick=function(){undo();t.classList.remove('on');};clearTimeout(tT);tT=setTimeout(function(){t.classList.remove('on');},undo?5000:2600);}

/* ---------------- dialog (cozy form) ---------------- */
var COLORS=[['oat','#EADBC4'],['mustard','#E9B65A'],['rust','#D7774C'],['caramel','#D9A574'],['olive','#8E8B4F'],['berry','#B3655A']];
var NOTE_COLORS=['yellow','peach','sage','cream','rose','tan'],NOTE_HEX={yellow:'#F6DE8A',peach:'#F4C7A1',sage:'#D3D8A6',cream:'#FBF1D9',rose:'#EDC0B0',tan:'#E3C9A3'};
function form(o){var v=Object.assign({},o.values||{}),veil=document.createElement('div');veil.className='veil';
 var h='<div class="dlg" role="dialog"><div class="dh2" style="background:'+(o.color||'var(--caramel)')+'"><span>'+esc(o.title)+'</span><button class="ib" data-x>✕</button></div><div class="db">';
 o.fields.forEach(function(f){var val=v[f.k]==null?'':v[f.k];
  if(f.t==='swatch'){h+='<div class="field"><span>'+esc(f.label)+'</span><div class="swatches" data-k="'+f.k+'">'+(f.opts||COLORS).map(function(c){return '<button type="button" class="sw'+(val===c[0]?' on':'')+'" data-v="'+c[0]+'" style="background:'+c[1]+'" aria-label="'+c[0]+'"></button>';}).join('')+'</div></div>';}
  else if(f.t==='chips'){h+='<div class="field"><span>'+esc(f.label)+'</span><div class="chips2" data-k="'+f.k+'">'+f.opts.map(function(c){return '<button type="button" class="'+(val===c[0]?'on':'')+'" data-v="'+esc(c[0])+'">'+esc(c[1])+'</button>';}).join('')+'</div></div>';}
  else if(f.t==='select'){h+='<label class="field"><span>'+esc(f.label)+'</span><select data-k="'+f.k+'">'+f.opts.map(function(c){return '<option value="'+esc(c[0])+'"'+(String(val)===String(c[0])?' selected':'')+'>'+esc(c[1])+'</option>';}).join('')+'</select></label>';}
  else if(f.t==='area'){h+='<label class="field"><span>'+esc(f.label)+'</span><textarea data-k="'+f.k+'" placeholder="'+esc(f.ph||'')+'">'+esc(val)+'</textarea></label>';}
  else h+='<label class="field"><span>'+esc(f.label)+'</span><input data-k="'+f.k+'" type="'+(f.t||'text')+'" value="'+esc(val)+'" placeholder="'+esc(f.ph||'')+'"'+(f.t==='number'?' inputmode="decimal"':'')+(f.min!=null?' min="'+f.min+'"':'')+(f.max!=null?' max="'+f.max+'"':'')+'></label>';});
 h+='</div><div class="df">'+(o.onDelete?'<button class="del" data-del>Delete</button>':'')+'<span class="sp"></span><button class="btn soft sm" data-x>Cancel</button><button class="btn" data-ok>'+esc(o.ok||'Save')+'</button></div></div>';
 veil.innerHTML=h;document.body.appendChild(veil);
 function close(){veil.remove();}
 function collect(){veil.querySelectorAll('[data-k]').forEach(function(el){var k=el.getAttribute('data-k');if(el.classList.contains('swatches')||el.classList.contains('chips2')){var on=el.querySelector('.on');v[k]=on?on.getAttribute('data-v'):(v[k]||'');}else v[k]=el.value.trim();});return v;}
 veil.addEventListener('click',function(e){var t=e.target;if(t===veil||t.closest('[data-x]'))return close();
  var sw=t.closest('.sw,.chips2 button');if(sw){sw.parentNode.querySelectorAll('.on').forEach(function(x){x.classList.remove('on');});sw.classList.add('on');return;}
  if(t.closest('[data-del]')){close();o.onDelete();return;}
  if(t.closest('[data-ok]')){var r=collect();if(o.required&&!r[o.required]){var f=veil.querySelector('[data-k="'+o.required+'"]');f&&f.focus();return;}close();o.onSave(r);}});
 veil.addEventListener('keydown',function(e){if(e.key==='Escape')close();if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();veil.querySelector('[data-ok]').click();}});
 setTimeout(function(){var f=veil.querySelector('input,textarea');if(f&&!isTouch)f.focus();},60);}

/* ---------------- shared bits ---------------- */
function empty(e,msg){return '<div class="empty"><div class="e">'+e+'</div><p>'+msg+'</p></div>';}
function addLine(col,ph,cls,extra){return '<div class="addline"><input data-add="'+col+'" '+(extra||'')+' placeholder="'+esc(ph)+'" enterkeyhint="done" autocomplete="off"><button class="plus '+(cls||'')+'" data-addbtn="'+col+'" aria-label="Add">+</button></div>';}
function byCreated(a,b){return (a.created||0)-(b.created||0);}
function todosSorted(){return DB.todos.slice().sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;var ad=a.due||'9999',bd=b.due||'9999';if(ad!==bd)return ad<bd?-1:1;return byCreated(a,b);});}
function todoRow(t){var due=t.due?'<span class="pill'+(t.due<iso(today())&&!t.done?' rust':'')+'">'+esc(nice(t.due))+'</span>':'';
 return '<div class="row'+(t.done?' done':'')+'"><input type="checkbox" class="ck" data-tog="todos:'+t.id+':done"'+(t.done?' checked':'')+'><div class="tx" data-edit="todos:'+t.id+'">'+esc(t.text)+'</div>'+due+'<button class="x" data-rm="todos:'+t.id+'" aria-label="Remove">✕</button></div>';}
function groceryRow(g){return '<div class="row'+(g.got?' done':'')+'"><input type="checkbox" class="ck mustard" data-tog="groceries:'+g.id+':got"'+(g.got?' checked':'')+'><div class="tx" data-edit="groceries:'+g.id+'">'+esc(g.item)+'</div>'+(g.qty&&g.qty!=='1'?'<span class="pill mustard">×'+esc(g.qty)+'</span>':'')+'<button class="x" data-rm="groceries:'+g.id+'" aria-label="Remove">✕</button></div>';}
function grocSorted(){return DB.groceries.slice().sort(function(a,b){if(!!a.got!==!!b.got)return a.got?1:-1;return byCreated(a,b);});}
function mealFor(ds){for(var i=0;i<DB.meals.length;i++)if(DB.meals[i].date===ds)return DB.meals[i];return null;}
function eventsOn(ds){return DB.events.filter(function(e){return e.date===ds;}).sort(function(a,b){return (a.time||'99')<(b.time||'99')?-1:1;});}
function chip(e,short){return '<span class="chip '+esc(e.color||'oat')+'" data-ev="'+e.id+'" title="'+esc(e.title)+'">'+(e.time&&!short?'<span class="tm">'+fmtTime(e.time)+'</span>':'')+esc(e.title)+'</span>';}
function billNext(b){var t=today(),d=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);function mk(y,m){var last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d,last));}
 var x=mk(t.getFullYear(),t.getMonth());if(b.paidFor===monthKey(t)||x<t)x=mk(t.getFullYear(),t.getMonth()+1);return x;}
function billPaid(b){return b.paidFor===monthKey();}
function brainSorted(){return DB.brain.slice().sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;return (b.created||0)-(a.created||0);});}

/* ---------------- editors ---------------- */
function editTodo(t){t=t||{};form({title:t.id?'Edit to-do':'New to-do',color:'var(--rust)',required:'text',values:t,fields:[{k:'text',label:'To-do',ph:'Rake leaves'},{k:'due',label:'Due date (optional)',t:'date'}],
 onSave:function(v){save('todos',Object.assign({},t,{text:v.text,due:v.due,done:!!t.done}));},onDelete:t.id?function(){remove('todos',t.id);}:null});}
function editGrocery(g){form({title:'Edit grocery item',color:'var(--mustard)',required:'item',values:g,fields:[{k:'item',label:'Item'},{k:'qty',label:'How many?',ph:'1'},{k:'note',label:'Note (brand, size…)'}],
 onSave:function(v){save('groceries',Object.assign({},g,v));},onDelete:function(){remove('groceries',g.id);}});}
function editEvent(e,date){e=e||{date:date||iso(today()),color:'mustard'};form({title:e.id?'Edit event':'New event',color:'var(--mustard)',required:'title',values:e,
 fields:[{k:'title',label:'What’s happening?',ph:'Soccer practice'},{k:'date',label:'Date',t:'date'},{k:'time',label:'Time (optional)',t:'time'},{k:'color',label:'Color',t:'swatch'},{k:'note',label:'Notes',t:'area',ph:'Bring snacks'}],
 onSave:function(v){if(!v.date)v.date=iso(today());save('events',Object.assign({},e,v));},onDelete:e.id?function(){remove('events',e.id);}:null});}
function editBill(b){b=b||{};form({title:b.id?'Edit bill':'New bill',color:'var(--olive)',required:'name',values:b,fields:[{k:'name',label:'Bill',ph:'Electric'},{k:'amount',label:'Amount',t:'number',ph:'85.00'},{k:'dueDay',label:'Due day of the month',t:'number',min:1,max:31,ph:'15'},{k:'note',label:'Notes (autopay, card…)',t:'area'}],
 onSave:function(v){v.dueDay=Math.min(Math.max(parseInt(v.dueDay,10)||1,1),31);save('bills',Object.assign({},b,v));},onDelete:b.id?function(){remove('bills',b.id);}:null});}
function editBrain(n){n=n||{color:NOTE_COLORS[Math.floor(Math.random()*NOTE_COLORS.length)]};form({title:n.id?'Edit note':'New note',color:'#C9A23A',required:'text',values:n,
 fields:[{k:'text',label:'Your thought',t:'area',ph:'Idea for costume…'},{k:'color',label:'Note color',t:'swatch',opts:NOTE_COLORS.map(function(c){return [c,NOTE_HEX[c]];})}],
 onSave:function(v){save('brain',Object.assign({},n,v));},onDelete:n.id?function(){remove('brain',n.id);}:null});}
var KIDS=['Weston','Holden'];
var KTYPES=[['note','📝 Note'],['form','📄 Form to sign'],['item','🎒 Bring / buy'],['date','📅 Date to remember']];
var KEMO={note:'📝',form:'📄',item:'🎒',date:'📅'};
function editKid(k,kid){k=k||{kid:kid||'Weston',type:'note'};form({title:k.id?'Edit':'Add for '+(k.kid==='Both'?'both boys':k.kid),color:'var(--caramel)',required:'title',values:k,
 fields:[{k:'title',label:'What is it?',ph:'Field trip form'},{k:'kid',label:'Who',t:'chips',opts:[['Weston','Weston'],['Holden','Holden'],['Both','Both']]},{k:'type',label:'Kind',t:'chips',opts:KTYPES},{k:'date',label:'Date (optional)',t:'date'},{k:'note',label:'Notes',t:'area'}],
 onSave:function(v){save('kids',Object.assign({},k,v,{done:!!k.done}));},onDelete:k.id?function(){remove('kids',k.id);}:null});}
function editList(l){l=l||{emoji:'📝',color:'caramel',items:[]};form({title:l.id?'Edit list':'New list',color:'var(--caramel)',required:'name',values:l,
 fields:[{k:'name',label:'List name',ph:'Cricut projects'},{k:'emoji',label:'Little icon',t:'chips',opts:[['📝','📝'],['✂️','✂️'],['🎄','🎄'],['🏡','🏡'],['🎁','🎁'],['📚','📚'],['🧺','🧺'],['✨','✨']]},{k:'color',label:'Color',t:'swatch'}],
 onSave:function(v){save('lists',Object.assign({},l,v,{items:l.items||[]}));},onDelete:l.id?function(){remove('lists',l.id);}:null});}
function editListItem(l,it){form({title:'Edit item',color:'var(--caramel)',required:'text',values:it,fields:[{k:'text',label:'Item'}],
 onSave:function(v){var L=JSON.parse(JSON.stringify(l));L.items.forEach(function(x){if(x.id===it.id)x.text=v.text;});save('lists',L);},
 onDelete:function(){var L=JSON.parse(JSON.stringify(l));L.items=L.items.filter(function(x){return x.id!==it.id;});save('lists',L);}});}

/* ---------------- quick adds ---------------- */
function quickAdd(col,text,el){text=text.trim();if(!text)return;
 if(col==='todos')save('todos',{text:text,done:false,due:''});
 else if(col==='groceries')save('groceries',{item:text,qty:'1',got:false});
 else if(col==='brain')save('brain',{text:text,done:false,color:NOTE_COLORS[DB.brain.length%NOTE_COLORS.length]});
 else if(col==='kids'){save('kids',{kid:el.getAttribute('data-kid')||'Weston',title:text,type:'note',done:false,date:''});}
 else if(col==='listitem'){var l=find('lists',el.getAttribute('data-list'));if(!l)return;var L=JSON.parse(JSON.stringify(l));L.items=L.items||[];L.items.push({id:uid(),text:text,done:false});save('lists',L);}
}

/* ---------------- navigation ---------------- */
var TABS=[['dashboard','Dashboard','i-home'],['meals','Meals & Groceries','i-meal'],['todo','To-Do & Calendar','i-todo'],['lists','Lists & Projects','i-lists'],['brain','Brain Dump','i-brain'],['bills','Bills','i-bills'],['kids','Kids & School','i-kids']];
var SUBS={dashboard:'',meals:'what’s for dinner?',todo:'one cozy step at a time',lists:'projects, wish lists & more',brain:'get it out of your head',bills:'little money check-in',kids:'Weston & Holden'};
var cur=(location.hash.replace('#','')||localStorage.getItem('tab')||'dashboard');if(!TABS.some(function(t){return t[0]===cur;}))cur='dashboard';
function buildNav(){$('#nav').innerHTML=tabsList().map(function(t){return '<button class="tab'+(t.id===cur?' on':'')+'" data-tab="'+t.id+'" title="'+esc(t.name)+'">'+tabIconHtml(t)+'<span>'+esc(t.name)+'</span></button>';}).join('')+
 '<button class="tab mine" data-custom title="Make it yours"><svg><use href="#i-spark"/></svg><span>Make it yours ✨<em>colors, fonts & photos</em></span></button>';}
function go(t){if(t!==cur&&cur==='dashboard')killGrid();cur=t;localStorage.setItem('tab',t);try{history.replaceState(null,'','#'+t);}catch(e){}document.body.classList.remove('drawer');$('#shade').classList.remove('on');buildNav();render();window.scrollTo(0,0);}
function setCollapsed(c){document.body.classList.toggle('collapsed',c);$('#tog').textContent=c?'»':'«';localStorage.setItem('collapsed',c?'1':'');}

/* ---------------- render ---------------- */
var rq=null;function rerender(){if(rq)return;rq=requestAnimationFrame(function(){rq=null;if(cur==='dashboard'&&(grid||stackMode))refreshWidgets();else render(true);});}
function keepFocus(fn){var a=document.activeElement,key=a&&a.getAttribute&&(a.getAttribute('data-add')?'[data-add="'+a.getAttribute('data-add')+'"]'+(a.getAttribute('data-list')?'[data-list="'+a.getAttribute('data-list')+'"]':'')+(a.getAttribute('data-kid')?'[data-kid="'+a.getAttribute('data-kid')+'"]':''):null),
 wid=a&&a.closest&&a.closest('.grid-stack-item')?a.closest('.grid-stack-item').getAttribute('gs-id'):null,sx=window.scrollY;fn();
 if(key){var sel=(wid?'.grid-stack-item[gs-id="'+wid+'"] ':'')+key,el=document.querySelector(sel);if(el){el.focus({preventScroll:true});}}window.scrollTo(0,sx);}
function render(soft){document.body.classList.toggle('dash',cur==='dashboard');$('#ptitle').textContent=tabName(cur);
 var sub=cur==='dashboard'?DNL[new Date().getDay()]+', '+MN[new Date().getMonth()]+' '+new Date().getDate():SUBS[cur];$('#psub').textContent=sub;
 if(cur==='dashboard'){if(!grid&&!stackMode)renderDash();else refreshWidgets();return;}
 keepFocus(function(){$('#view').innerHTML='<div class="page">'+PAGES[cur]()+'</div>';});}

/* ---- Meals & Groceries ---- */
var mealWeek=0;
function mealsPage(){var m=addDays(monday(today()),mealWeek*7),td=iso(today()),rows='';
 for(var i=0;i<7;i++){var d=addDays(m,i),ds=iso(d),me=mealFor(ds)||{};rows+='<div class="dayrow'+(ds===td?' today':'')+'"><div class="dn">'+DN[d.getDay()]+'<small>'+MN[d.getMonth()].slice(0,3)+' '+d.getDate()+'</small></div><input class="din" data-din="'+ds+'" value="'+esc(me.dinner||'')+'" placeholder="what’s for dinner?" autocomplete="off" enterkeyhint="done"><input type="checkbox" class="ck olive" title="Made it!" data-made="'+ds+'"'+(me.made?' checked':'')+(me.dinner?'':' disabled style="opacity:.35"')+'></div>';}
 var g=grocSorted(),got=g.filter(function(x){return x.got;}).length;
 return '<div class="cols">'+
 '<div class="card"><div class="wh oat"><span class="t">Dinner plan</span></div><div class="bd"><div class="hand">tap a day and type · ✓ when it’s made</div><div class="weeknav"><button class="round" data-mw="-1" aria-label="Previous week">‹</button><b>'+(mealWeek===0?'This week':mealWeek===1?'Next week':mealWeek===-1?'Last week':'Week of '+MN[m.getMonth()].slice(0,3)+' '+m.getDate())+'</b><button class="round" data-mw="1" aria-label="Next week">›</button></div>'+rows+'</div></div>'+
 '<div class="card"><div class="wh mustard"><span class="t">Grocery list</span></div><div class="bd">'+addLine('groceries','add an item…','mustard')+'<div style="margin-top:6px">'+(g.length?g.map(groceryRow).join(''):empty('🧺','Your list is empty.<br>Add milk, eggs, coffee beans…'))+'</div>'+
 (got?'<div class="toolbar"><span class="pill">'+got+' in the cart</span><button class="link" data-clear="groceries">Clear checked items</button></div>':'')+'</div></div></div>';}

/* ---- To-Do & Calendar ---- */
var calMode=localStorage.getItem('calMode')||'month',calOff=0;
function todoPage(){var t=todosSorted(),done=t.filter(function(x){return x.done;}).length;
 var left='<div class="card"><div class="wh rust"><span class="t">To-do list</span><button class="ib" data-new="todo" title="Add with a date">📅</button></div><div class="bd">'+addLine('todos','add a to-do…')+'<div style="margin-top:6px">'+(t.length?t.map(todoRow).join(''):empty('🍂','All clear! Add something<br>when it pops into your head.'))+'</div>'+
 (done?'<div class="toolbar"><span class="pill olive">'+done+' done 🎉</span><button class="link" data-clear="todos">Clear finished</button></div>':'')+'</div></div>';
 return '<div class="cols c2">'+left+'<div class="card"><div class="wh mustard"><span class="t">Calendar</span><button class="ib" data-new="event" title="New event">+</button></div><div class="bd">'+calendar()+'</div></div></div>';}
function calendar(){var t=today(),td=iso(t),h='';
 if(calMode==='month'){var base=new Date(t.getFullYear(),t.getMonth()+calOff,1),start=monday(base);gcEnsure(iso(start),iso(addDays(start,41)));
  h+='<div class="calhead"><button class="round" data-co="-1" aria-label="Previous">‹</button><b>'+MN[base.getMonth()]+' '+base.getFullYear()+'</b><button class="round" data-co="1" aria-label="Next">›</button>'+segHtml()+'</div><div class="month">';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d){h+='<div class="wd">'+d+'</div>';});
  for(var i=0;i<42;i++){var d=addDays(start,i),ds=iso(d),ev=eventsOn(ds);if(i===35&&d.getMonth()!==base.getMonth())break;
   h+='<div class="d'+(d.getMonth()!==base.getMonth()?' o':'')+(ds===td?' today':'')+'" data-day="'+ds+'"><span class="n">'+d.getDate()+'</span>'+ev.slice(0,3).map(function(e){return chip(e,true);}).join('')+(ev.length>3?'<span class="more">+'+(ev.length-3)+' more</span>':'')+'</div>';}
  h+='</div>';}
 else{var m=addDays(monday(t),calOff*7),e6=addDays(m,6);
  h+='<div class="calhead"><button class="round" data-co="-1" aria-label="Previous">‹</button><b>'+MN[m.getMonth()].slice(0,3)+' '+m.getDate()+' – '+MN[e6.getMonth()].slice(0,3)+' '+e6.getDate()+'</b><button class="round" data-co="1" aria-label="Next">›</button>'+segHtml()+'</div><div class="wkview">';
  for(var j=0;j<7;j++){var dd=addDays(m,j),s=iso(dd),evs=eventsOn(s);h+='<div class="d'+(s===td?' today':'')+'" data-day="'+s+'"><div class="dh">'+DN[dd.getDay()]+'<small>'+dd.getDate()+'</small></div>'+evs.map(function(e){return chip(e);}).join('')+'</div>';}
  h+='</div>';}
 return h+'<div class="hand" style="margin-top:8px">tap a day to add an event</div>';}
function segHtml(){return '<span class="seg"><button data-cm="month" class="'+(calMode==='month'?'on':'')+'">Month</button><button data-cm="week" class="'+(calMode==='week'?'on':'')+'">Week</button></span>';}

/* ---- Lists & Projects ---- */
function listsPage(){var ls=DB.lists.slice().sort(byCreated);
 return '<div class="listgrid">'+ls.map(function(l){var items=l.items||[],done=items.filter(function(x){return x.done;}).length;
  return '<div class="card"><div class="wh '+esc(l.color||'caramel')+'"><span class="t">'+esc(l.emoji||'📝')+' '+esc(l.name)+'</span><button class="ib" data-editlist="'+l.id+'" title="Rename or delete">✎</button></div><div class="bd">'+
  (items.length?items.map(function(it){return '<div class="row'+(it.done?' done':'')+'"><input type="checkbox" class="ck" data-li="'+l.id+':'+it.id+'"'+(it.done?' checked':'')+'><div class="tx" data-lie="'+l.id+':'+it.id+'">'+esc(it.text)+'</div><button class="x" data-lirm="'+l.id+':'+it.id+'" aria-label="Remove">✕</button></div>';}).join(''):empty('✂️','Nothing here yet.'))+
  addLine('listitem','add to this list…','',' data-list="'+l.id+'"')+(done?'<div class="toolbar"><span class="pill olive">'+done+'/'+items.length+' done</span><button class="link" data-liclear="'+l.id+'">Clear done</button></div>':'')+'</div></div>';}).join('')+
 '<div class="newlist" data-new="list"><div><div class="p">+</div>start a new list</div></div></div>';}

/* ---- Brain Dump ---- */
function brainPage(){var n=brainSorted();
 return '<div class="capture"><textarea id="cap" placeholder="What’s on your mind? Type it here…"></textarea><button class="btn mustard" id="capbtn">Save it</button></div>'+
 (n.length?'<div class="notes">'+n.map(function(x){return '<div class="note c-'+esc(x.color||'yellow')+(x.done?' done':'')+'" data-edit="brain:'+x.id+'"><span class="pin"></span><div class="nt">'+esc(x.text).replace(/\n/g,'<br>')+'</div><div class="nb"><input type="checkbox" class="ck olive" data-tog="brain:'+x.id+':done"'+(x.done?' checked':'')+' title="Done"><span>'+(x.created>1e12?nice(iso(new Date(x.created))):'')+'</span><button class="x" data-rm="brain:'+x.id+'" aria-label="Remove">✕</button></div></div>';}).join('')+'</div>':
 '<div class="card"><div class="bd">'+empty('💡','Your brain dump is empty.<br>Ideas, worries, “don’t forget”s – toss them here.')+'</div></div>');}

/* ---- Bills ---- */
function billsPage(){var b=DB.bills.slice().sort(function(x,y){return billNext(x)-billNext(y);}),tot=0,paid=0;
 b.forEach(function(x){tot+=num(x.amount);if(billPaid(x))paid+=num(x.amount);});
 return '<div class="billsum"><div class="stat"><div class="k">Bills each month</div><div class="v">'+money(tot||0)+'</div></div><div class="stat"><div class="k">Paid in '+MN[today().getMonth()]+'</div><div class="v" style="color:var(--olive)">'+money(paid||0)+'</div></div><div class="stat"><div class="k">Still to pay</div><div class="v">'+money(Math.max(tot-paid,0))+'</div></div></div>'+
 '<div class="card"><div class="wh olive"><span class="t">My bills</span><button class="ib" data-new="bill" title="Add a bill">+</button></div><div class="bd">'+
 (b.length?b.map(billRow).join(''):empty('💌','No bills yet. Tap + to add rent, phone, electric…'))+
 '<div style="margin-top:12px;text-align:center"><button class="btn olive" data-new="bill">+ Add a bill</button></div></div></div>';}
function billRow(x){var p=billPaid(x),nx=billNext(x),dl=Math.round((nx-today())/864e5);
 return '<div class="bill"><div class="bn" data-edit="bills:'+x.id+'"><b>'+esc(x.name)+'</b><span class="pill'+(!p&&dl<=3?' rust':'')+'">'+(p?'next due '+nice(iso(nx)):dl===0?'due today':dl===1?'due tomorrow':'due '+nice(iso(nx))+' · '+dl+' days')+'</span></div><span class="amt">'+esc(money(x.amount))+'</span><button class="paid'+(p?' on':'')+'" data-paid="'+x.id+'">'+(p?'✓ Paid':'Mark paid')+'</button></div>';}

/* ---- Kids & School ---- */
var kidFilter='all';
function kidsPage(){var cols={Weston:'rust',Holden:'olive'};
 return '<div class="cols">'+KIDS.map(function(k){var items=DB.kids.filter(function(x){return x.kid===k||x.kid==='Both';}).sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;var ad=a.date||'9999',bd=b.date||'9999';return ad<bd?-1:ad>bd?1:byCreated(a,b);});
  return '<div class="card"><div class="wh '+cols[k]+'"><span class="t">'+k+'</span><button class="ib" data-newkid="'+k+'" title="Add with details">+</button></div><div class="bd">'+
  (items.length?items.map(function(x){return '<div class="row'+(x.done?' done':'')+'"><input type="checkbox" class="ck'+(k==='Holden'?' olive':'')+'" data-tog="kids:'+x.id+':done"'+(x.done?' checked':'')+'><span title="'+esc(x.type)+'">'+(KEMO[x.type]||'📝')+'</span><div class="tx" data-edit="kids:'+x.id+'">'+esc(x.title)+(x.note?'<div class="meta" style="white-space:normal;font-weight:600">'+esc(x.note)+'</div>':'')+'</div>'+(x.kid==='Both'?'<span class="pill">both</span>':'')+(x.date?'<span class="pill mustard">'+esc(nice(x.date))+'</span>':'')+'<button class="x" data-rm="kids:'+x.id+'" aria-label="Remove">✕</button></div>';}).join(''):empty('🎒','Forms, notes, spirit days<br>and things to bring go here.'))+
  addLine('kids','add for '+k+'…',k==='Holden'?'olive':'',' data-kid="'+k+'"')+'</div></div>';}).join('')+'</div>';}

var PAGES={meals:mealsPage,todo:todoPage,lists:listsPage,brain:brainPage,bills:billsPage,kids:kidsPage};

/* ---------------- dashboard ---------------- */
var WDEF={
 welcome:{name:'Welcome',em:'☕',bg:'#F1E3CC',desc:'a cozy hello & today’s date',w:3,h:4},
 week:{name:'Weekly calendar',em:'📅',bg:'#EADBC4',hdr:'oat',desc:'your events this week',w:6,h:4},
 todo:{name:'To-do checklist',em:'✅',bg:'#F5D9C9',hdr:'rust',desc:'check things off',w:3,h:4},
 grocery:{name:'Grocery list',em:'🛒',bg:'#F7E6BA',hdr:'mustard',desc:'quick add & check off',w:3,h:4},
 meals:{name:'This week’s meals',em:'🍲',bg:'#EADBC4',hdr:'oat',desc:'dinner plan by day',w:3,h:5},
 bills:{name:'Bills due',em:'💌',bg:'#E6E4C6',hdr:'oat',desc:'upcoming payments',w:3,h:4},
 brain:{name:'Brain dump',em:'💡',bg:'#F6DE8A',desc:'a sticky note for thoughts',w:3,h:4},
 reminders:{name:'Upcoming reminders',em:'⏰',bg:'#E6E4C6',hdr:'olive',desc:'what I’ll ping you about',w:3,h:4},
 photo:{name:'Photo',em:'📷',bg:'#F4C7A1',desc:'a favorite picture in a cute frame',w:3,h:4},
 sticker:{name:'Sticker',em:'🍂',bg:'#F7E6BA',desc:'a cute little doodle',w:2,h:2},
 quote:{name:'Quote or note',em:'✍️',bg:'#FBF1D9',desc:'your own words, handwritten',w:3,h:3}
};
var DEFAULT_LAYOUT=[{id:'w-welcome',type:'welcome',x:0,y:0,w:3,h:4},{id:'w-week',type:'week',x:3,y:0,w:6,h:4},{id:'w-todo',type:'todo',x:9,y:0,w:3,h:4},
 {id:'w-meals',type:'meals',x:0,y:4,w:3,h:5},{id:'w-grocery',type:'grocery',x:3,y:4,w:3,h:5},{id:'w-bills',type:'bills',x:6,y:4,w:3,h:5},{id:'w-brain',type:'brain',x:9,y:4,w:3,h:5},
 {id:'w-rem',type:'reminders',x:0,y:9,w:4,h:3}];
var LAYOUT=null;try{LAYOUT=JSON.parse(localStorage.getItem('layout2')||'null');}catch(e){}
if(!LAYOUT||!LAYOUT.widgets)LAYOUT={widgets:DEFAULT_LAYOUT.slice(),t:0};
var grid=null,layoutT=null,arranging=false;
function saveLayout(){LAYOUT.t=Date.now();localStorage.setItem('layout2',JSON.stringify(LAYOUT));clearTimeout(layoutT);layoutT=setTimeout(function(){api('saveLayout',[LAYOUT]).catch(function(){});},900);}
function widgetHead(w){var d=WDEF[w.type],extra='',st=w.style||{};
 if(w.type==='week')extra='<button class="ib" data-new="event" title="New event">+</button>';
 if(w.type==='reminders')extra='<button class="ib" data-openbell title="Add a reminder">+</button>';
 if(w.type==='bills')extra='<button class="ib" data-go="bills" title="Open Bills">↗</button>';
 var title=(st.title||'').trim()||DEFTITLE[w.type]||'';
 return '<div class="wh drag '+(d.hdr||'')+(st.hdr?' cust':'')+'"'+(st.hdr?' style="background:'+st.hdr+';color:'+onColor(st.hdr)+'"':'')+'>'+extra+'<span class="t">'+esc(title)+'</span><button class="ib wst" data-wstyle="'+w.id+'" title="Change how this card looks">🎨</button><button class="ib wrm" data-wrm="'+w.id+'" title="Remove widget">✕</button></div>';}
function widgetBody(type,w){var td=iso(today());if(type==='photo'||type==='sticker'||type==='quote')return newWidgetBody(type,w||{});
 if(type==='welcome'){var h=new Date().getHours(),g=h<12?'Good morning':h<17?'Good afternoon':'Good evening',left=DB.todos.filter(function(x){return !x.done;}).length,me=mealFor(td),
   due=DB.bills.filter(function(b){return !billPaid(b)&&(billNext(b)-today())/864e5<=7;}).length,ev=eventsOn(td).length,
   Q=['Slow down, sip your coffee ☕','You’ve got this, one thing at a time.','Cozy days ahead 🍂','Small steps still count.','Be kind to yourself today.'];
  return '<svg class="wdood"><use href="#i-cup"/></svg><div class="hi">'+g+',<br>Kenzi</div><div class="dt">'+DNL[new Date().getDay()]+', '+MN[new Date().getMonth()]+' '+new Date().getDate()+'</div><div class="stats">'+(left?'<span class="pill rust">'+left+' to-do'+(left===1?'':'s')+' left</span>':'<span class="pill olive">to-dos all done 🎉</span>')+(ev?'<span class="pill mustard">'+ev+' event'+(ev===1?'':'s')+' today</span>':'')+(due?'<span class="pill olive">'+due+' bill'+(due===1?'':'s')+' due soon</span>':'')+'</div>'+
  (me&&me.dinner?'<div class="quote">Tonight: '+esc(me.dinner)+' 🍲</div>':'<div class="quote">'+Q[new Date().getDate()%Q.length]+'</div>');}
 if(type==='week'){var m=monday(today()),c='<div class="wk">';for(var i=0;i<7;i++){var d=addDays(m,i),ds=iso(d);c+='<div class="col'+(ds===td?' today':'')+'" data-day="'+ds+'"><div class="dh">'+DN[d.getDay()]+'<small>'+d.getDate()+'</small></div>'+eventsOn(ds).map(function(e){return chip(e);}).join('')+'</div>';}return c+'</div>';}
 if(type==='todo'){var t=todosSorted();return (t.length?t.map(todoRow).join(''):empty('🍂','All clear!'))+addLine('todos','add a to-do…');}
 if(type==='grocery'){var g=grocSorted();return (g.length?g.map(groceryRow).join(''):empty('🧺','Nothing on the list.'))+addLine('groceries','add an item…','mustard');}
 if(type==='meals'){var mm=monday(today()),r='<div class="hand">Dinner</div>';for(var j=0;j<7;j++){var dd=addDays(mm,j),s=iso(dd),me2=mealFor(s)||{};r+='<div class="dayrow'+(s===td?' today':'')+'" style="padding:3px 0"><div class="dn" style="width:44px;flex-basis:44px">'+DN[dd.getDay()]+'</div><input class="din" style="font-size:21px" data-din="'+s+'" value="'+esc(me2.dinner||'')+'" placeholder="…" autocomplete="off" enterkeyhint="done"></div>';}return r;}
 if(type==='bills'){var b=DB.bills.filter(function(x){return !billPaid(x);}).sort(function(x,y){return billNext(x)-billNext(y);});
  return '<div class="hand">Upcoming payments</div>'+(b.length?b.slice(0,8).map(function(x){var nx=billNext(x),dl=Math.round((nx-today())/864e5);return '<div class="row"><input type="checkbox" class="ck olive" data-paid="'+x.id+'" title="Mark paid"><div class="tx" data-edit="bills:'+x.id+'">'+esc(x.name)+' <span class="meta">('+MN[nx.getMonth()].slice(0,3)+' '+nx.getDate()+')</span></div><span class="pill'+(dl<=3?' rust':'')+'">'+esc(money(x.amount)||'')+'</span></div>';}).join(''):empty('🌿',DB.bills.length?'All paid this month!':'Add bills in the Bills tab.'));}
 if(type==='brain'){var n=brainSorted().filter(function(x){return !x.done;});return (n.length?n.map(function(x){return '<div class="row"><div class="tx" data-edit="brain:'+x.id+'">'+esc(x.text)+'</div><button class="x" data-tog2="brain:'+x.id+'" title="Done">✓</button></div>';}).join(''):empty('✍️','Jot a thought…'))+addLine('brain','jot it down…','mustard');}
 if(type==='reminders'){return '<div data-remw>'+remHtml(true)+'</div>';}
 return '';}
function widgetEl(w){var el=document.createElement('div');el.className=stackMode?'stack-item':'grid-stack-item';el.setAttribute('gs-id',w.id);
 ['x','y','w','h'].forEach(function(k){if(w[k]!=null)el.setAttribute('gs-'+k,w[k]);});if(w.x==null)el.setAttribute('gs-auto-position','true');el.setAttribute('gs-min-w','2');el.setAttribute('gs-min-h','2');
 el.innerHTML='<div class="grid-stack-item-content">'+cardHtml(w)+'</div>';
 return el;}
function isPhone(){return window.innerWidth<=760;}
var stackMode=false;
function mobileOrder(){var ids=LAYOUT.widgets.slice().sort(function(a,b){return ((a.y==null?999:a.y)-(b.y==null?999:b.y))||((a.x||0)-(b.x||0));}).map(function(w){return w.id;});
 var m=(LAYOUT.mobile||[]).filter(function(id){return ids.indexOf(id)>=0;});ids.forEach(function(id){if(m.indexOf(id)<0)m.push(id);});return m;}
function renderDash(){var v=$('#view');stackMode=isPhone();
 v.innerHTML='<div class="dashbar"><button class="btn" id="addw">+ Add widget</button><button class="btn soft sm" id="dashcz">✨ Make it yours</button><button class="btn soft sm'+(stackMode?'':' hide')+'" id="arr">'+(arranging?'✓ Done':'↕ Rearrange')+'</button><span class="hint" id="dhint">'+(stackMode?(arranging?'use the arrows to move cards':''):'drag a card by its top strip · pull the corner to resize')+'</span></div>'+(stackMode?'<div class="stack'+(arranging?' arranging':'')+'" id="gs"></div>':'<div class="grid-stack" id="gs"></div>');
 var gsEl=$('#gs');$('#addw').onclick=pickWidget;
 if(stackMode){mobileOrder().forEach(function(id){var w=LAYOUT.widgets.filter(function(x){return x.id===id;})[0];if(w&&WDEF[w.type])gsEl.appendChild(widgetEl(w));});
  $('#arr').onclick=function(){arranging=!arranging;renderDash();};grid=null;fillImgs(gsEl);return;}
 LAYOUT.widgets.forEach(function(w){if(WDEF[w.type])gsEl.appendChild(widgetEl(w));});fillImgs(gsEl);
 grid=GridStack.init({column:12,cellHeight:78,margin:0,handle:'.wh.drag,.card[data-wtype="photo"],.card[data-wtype="sticker"],.card[data-wtype="welcome"],.card[data-wtype="quote"]',float:false,animate:true,resizable:{handles:'se'},draggable:{cancel:'button,input,.ib'},
  columnOpts:{layout:'list',breakpoints:[{w:560,c:1},{w:800,c:6}]}},gsEl);
 grid.on('change',function(){if(grid.getColumn()!==12)return;grid.engine.nodes.forEach(function(n){var w=LAYOUT.widgets.filter(function(x){return x.id===n.id;})[0];if(w){w.x=n.x;w.y=n.y;w.w=n.w;w.h=n.h;}});saveLayout();});}
function moveMobile(id,dir){var m=mobileOrder(),i=m.indexOf(id),j=i+dir;if(i<0||j<0||j>=m.length)return;m[i]=m[j];m[j]=id;LAYOUT.mobile=m;saveLayout();renderDash();
 var el=document.querySelector('[gs-id="'+id+'"]');if(el)el.scrollIntoView({block:'center'});}
window.addEventListener('resize',function(){clearTimeout(window._pm);window._pm=setTimeout(function(){if(cur==='dashboard'&&isPhone()!==stackMode){killGrid();renderDash();}},250);});
function killGrid(){if(grid){try{grid.destroy(false);}catch(e){}grid=null;}stackMode=false;}
function refreshWidgets(){keepFocus(function(){document.querySelectorAll('#gs .card[data-wtype]').forEach(function(c){var ty=c.getAttribute('data-wtype');if(ty==='photo'||ty==='sticker'||ty==='quote')return;var b=c.querySelector('.bd');var a=document.activeElement;if(a&&b.contains(a)&&a.classList.contains('din'))return;b.innerHTML=widgetBody(ty,wById(c.getAttribute('data-wid')));});});}
function pickWidget(){var veil=document.createElement('div');veil.className='veil';
 veil.innerHTML='<div class="dlg"><div class="dh2"><span>Add a widget</span><button class="ib" data-x>✕</button></div><div class="db"><div class="picks">'+Object.keys(WDEF).map(function(k){var d=WDEF[k];return '<button class="pk" data-pk="'+k+'"><span class="em" style="background:'+d.bg+'">'+d.em+'</span><span>'+esc(d.name)+'<small>'+esc(d.desc)+'</small></span></button>';}).join('')+'</div></div><div class="df"><span class="sp"></span><button class="btn soft sm" data-x>Close</button></div></div>';
 document.body.appendChild(veil);veil.addEventListener('click',function(e){if(e.target===veil||e.target.closest('[data-x]'))return veil.remove();var p=e.target.closest('[data-pk]');if(!p)return;veil.remove();
  var t=p.getAttribute('data-pk'),w={id:'w-'+uid(),type:t,w:WDEF[t].w,h:WDEF[t].h};if(t==='sticker')w.sticker=STICKER_ORDER[Math.floor(Math.random()*6)];LAYOUT.widgets.push(w);var el;
  LAYOUT.mobile=[w.id].concat(mobileOrder().filter(function(id){return id!==w.id;}));
  if(grid&&grid.getColumn()===12){w.x=0;w.y=0;el=widgetEl(w);$('#gs').appendChild(el);grid.makeWidget(el);grid.engine.nodes.forEach(function(n){var x=wById(n.id);if(x){x.x=n.x;x.y=n.y;x.w=n.w;x.h=n.h;}});}
  else{LAYOUT.widgets.forEach(function(x){if(x!==w&&x.y!=null)x.y+=w.h;});w.y=0;killGrid();renderDash();el=document.querySelector('[gs-id="'+w.id+'"]');}
  if(el){fillImgs(el);el.classList.add('wnew');setTimeout(function(){el.classList.remove('wnew');},2600);}saveLayout();setTimeout(function(){el&&el.scrollIntoView({behavior:'smooth',block:'center'});},120);toast(WDEF[t].name+' added at the top ✨');
  if(t==='photo')setTimeout(function(){photoDialog(w.id);},250);if(t==='quote')setTimeout(function(){quoteDialog(w.id);},250);});}
function removeWidget(id){var w=LAYOUT.widgets.filter(function(x){return x.id===id;})[0];if(!w)return;var el=document.querySelector('.grid-stack-item[gs-id="'+id+'"]');
 LAYOUT.widgets=LAYOUT.widgets.filter(function(x){return x.id!==id;});if(el){if(grid)grid.removeWidget(el);else el.remove();}saveLayout();
 toast(WDEF[w.type].name+' removed',function(){LAYOUT.widgets.push(w);if(grid){var e2=widgetEl(w);$('#gs').appendChild(e2);grid.makeWidget(e2);}else renderDash();saveLayout();});}

/* ---------------- reminders + push ---------------- */
function fmtW(ms){var d=new Date(ms);return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function remList(){return DB.reminders.filter(function(r){return r.text&&r.when&&!r.sent;}).sort(function(a,b){return a.when-b.when;});}
function remHtml(small){var a=remList();if(!a.length)return small?empty('🔔','No reminders yet.<br>Tap + to add one.'):'<div class="nstat">Nothing yet. Add one above!</div>';
 return a.slice(0,small?6:50).map(function(r){return '<div class="rem"><div style="flex:1;min-width:0"><div style="font-weight:800;overflow-wrap:anywhere">'+esc(r.text)+'</div><div class="w">'+fmtW(r.when)+(r.repeat?' · '+(r.repeat==='daily'?'every day':'every week'):'')+'</div></div><button class="x" data-rm="reminders:'+r.id+'" aria-label="Delete">✕</button></div>';}).join('');}
var FB_CONFIG={apiKey:"AIzaSyC39hLDKkglPAU6W3re0nkmz4KNgqLegXI",authDomain:"kenzi-planner.firebaseapp.com",projectId:"kenzi-planner",storageBucket:"kenzi-planner.firebasestorage.app",messagingSenderId:"852694257543",appId:"1:852694257543:web:a4e4150706397152914d22"};
var VAPID="BCYL92AWH-hnEsysR2dd25WgTCrlXIT3PTQbRmogu5l-3v_o3oFixVPTkotO50zVX_tDndlr-GVA1slShFlYFMM";
try{firebase.initializeApp(FB_CONFIG);}catch(e){}
function standalone(){return window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches;}
function nStatus(){var s=$('#nstat'),b=$('#nen');b.style.display='';
 if(!('Notification' in window)){s.textContent=/iPhone|iPad/.test(navigator.userAgent)&&!standalone()?'First add me to your Home Screen: tap Share, then “Add to Home Screen”, then open me from there.':'This browser can’t do notifications.';b.style.display='none';}
 else if(Notification.permission==='granted'&&localStorage.getItem('pushOn')){s.textContent='✅ On for this device.';b.textContent='Refresh notifications';}
 else if(Notification.permission==='denied'){s.textContent='Notifications are blocked. Turn them on in Settings › Notifications › Planner.';b.style.display='none';}
 else s.textContent='Off for this device. Tap below to turn them on.';
 $('#belldot').classList.toggle('hide',('Notification' in window)&&Notification.permission==='granted'&&!!localStorage.getItem('pushOn'));}
function enablePush(){var s=$('#nstat');s.textContent='Asking your phone…';
 Notification.requestPermission().then(function(p){if(p!=='granted')throw 'You tapped Don’t Allow. You can change it in Settings.';
  return navigator.serviceWorker.register('firebase-messaging-sw.js').then(function(reg){return navigator.serviceWorker.ready.then(function(){return firebase.messaging().getToken({vapidKey:VAPID,serviceWorkerRegistration:reg});});});})
 .then(function(tok){if(!tok)throw 'No token';return api('saveToken',[tok]);})
 .then(function(){localStorage.setItem('pushOn','1');nStatus();toast('Notifications are on 🔔');})
 .catch(function(e){s.textContent='Hmm, that didn’t work: '+e;});}
function testPush(){var s=$('#nstat');s.textContent='Sending…';api('testPush',[]).then(function(r){s.textContent=r.sent?'Sent! Check your phone ☕':'Not sent yet – turn on notifications first.';}).catch(function(){s.textContent='Couldn’t send right now.';});}
function addRem(){var t=$('#rtext').value.trim(),w=$('#rwhen').value,rp=$('#rrep').value;if(!t){$('#rtext').focus();return;}if(!w){$('#rwhen').focus();toast('Pick a day and time ⏰');return;}
 var ms=new Date(w).getTime();save('reminders',{when:ms,text:t,repeat:rp,sent:false});$('#rtext').value='';$('#rwhen').value='';drawRems();toast('Reminder set for '+fmtW(ms));}
function drawRems(){$('#rlist').innerHTML=remHtml(false);}
function openN(){$('#npanel').classList.add('open');$('#shade').classList.add('on');nStatus();drawRems();api('getReminders').then(function(a){DB.reminders=DB.reminders.filter(function(r){return r.sent;}).concat(a);OUT.filter(function(o){return o.c==='reminders';}).forEach(applyOp);persist();drawRems();rerender();}).catch(function(){});}
function closeN(){$('#npanel').classList.remove('open');if(!document.body.classList.contains('drawer'))$('#shade').classList.remove('on');}
try{firebase.messaging().onMessage(function(p){var n=p.notification||{};navigator.serviceWorker.ready.then(function(r){r.showNotification(n.title||'Planner',{body:n.body||'',icon:'icon-192.png'});});});}catch(e){}

/* ================= Phase 2: Make it yours ✨ ================= */
/* ---- little color helpers ---- */
function hexRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');var n=parseInt(h,16);if(isNaN(n)||h.length!==6)return [200,180,160];return [n>>16&255,n>>8&255,n&255];}
function rgbHex(a){return '#'+a.map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?'0':'')+v.toString(16);}).join('').toUpperCase();}
function mix(a,b,t){var x=hexRgb(a),y=hexRgb(b);return rgbHex([x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t]);}
function lum(h){var c=hexRgb(h).map(function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function isDark(h){return lum(h)<.33;}
function onColor(h){var L=lum(h),cw=1.05/(L+.05),cd=(L+.05)/(.012+.05);return cd>=cw*1.12?mix(h,'#2A1A10',.84):mix(h,'#FFFFFF',.94);}
function rgba(h,a){var c=hexRgb(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
function svgUri(s){return 'url("data:image/svg+xml,'+encodeURIComponent(s)+'")';}

/* ---- themes ---- */
var THEMES={
 coffee:{name:'Autumn Coffeehouse',tag:'cozy kraft & caramel',c:{oat:'#F3EBDD',paper:'#FFFBF3',cream:'#FBF6EC',side:'#C9A27A',rust:'#B5542B',mustard:'#D9A23A',caramel:'#C98B4E',olive:'#6E6B35',berry:'#9B4A3C',ink:'#4A3426',ink2:'#7A5C48',head:'#7A3A1E',strip:'#EADBC4',line:'#E7DAC6',sticky:'#F6DE8A',
   side1:'#CFAA82',side2:'#C29A70',tab1:'#D8BC97',tab2:'#CBAA80',tabOn1:'#F4E6D0',tabOn2:'#E9D6B9',sideInk:'#4A2E1C',tabInk:'#3F2717',onRust:'#FFF4E6',onMustard:'#3A250F',onOlive:'#FBF3DF',onCaramel:'#FFF6EA',onBerry:'#FFF1E8',soft:'#F1E3CC',softInk:'#6B4127',field:'#F6EEE1',fieldFocus:'#FFF9EE',day:'#FBF4E8',dayHover:'#F5E9D6',muted:'#A68C78',ph:'#B39A83',ckb:'#B89C80',ckbg:'#FFFDF8',stripInk:'#3F2717'},
   fonts:{head:'Fraunces',body:'Nunito',hand:'Caveat'},bg:{kind:'pattern',id:'paper'}},
 garden:{name:'Cottage Garden',tag:'sage, rose & linen',c:{oat:'#EEF0E3',paper:'#FDFCF5',cream:'#F8F7EE',side:'#9DB08C',rust:'#B5646E',mustard:'#E2B65E',caramel:'#C7967F',olive:'#5F7A52',berry:'#9C4F5C',ink:'#3A4232',ink2:'#66705A',head:'#4E6943',strip:'#E2E7D4',line:'#E1E5D3',sticky:'#F3E3A3'},
   fonts:{head:'Lora',body:'Quicksand',hand:'Patrick Hand'},bg:{kind:'pattern',id:'leaves'}},
 pastel:{name:'Sweet Pastel',tag:'cotton candy & mint',c:{oat:'#FBF0F3',paper:'#FFFFFF',cream:'#FFF8FA',side:'#F2BDCD',rust:'#E0849F',mustard:'#F3CB72',caramel:'#B7A3E0',olive:'#7FC0AC',berry:'#C56A8C',ink:'#5A4253',ink2:'#8E7389',head:'#B4527C',strip:'#F7E3EA',line:'#F2E0E7',sticky:'#FCE8A6'},
   fonts:{head:'Baloo 2',body:'Quicksand',hand:'Gochi Hand'},bg:{kind:'pattern',id:'dots'}},
 winter:{name:'Cozy Winter Cabin',tag:'pine, cranberry & plaid',c:{oat:'#ECEFEA',paper:'#FDFDFB',cream:'#F6F7F3',side:'#3F5E54',rust:'#A8322D',mustard:'#D6B05A',caramel:'#8A6A55',olive:'#3F5E54',berry:'#7E2A2A',ink:'#2E3A36',ink2:'#5C6B66',head:'#2F4A42',strip:'#E0E6E2',line:'#DFE4E0',sticky:'#F1E2A8'},
   fonts:{head:'Playfair Display',body:'Lato',hand:'Dancing Script'},bg:{kind:'pattern',id:'plaid'}},
 pumpkin:{name:'Pumpkin Spice',tag:'warm orange & cinnamon',c:{oat:'#F8EAD8',paper:'#FFF9F0',cream:'#FFF4E6',side:'#D9803F',rust:'#C4561E',mustard:'#E5A03A',caramel:'#B87333',olive:'#7A5A2E',berry:'#9A3B22',ink:'#4B2C1A',ink2:'#7D5843',head:'#8E3B12',strip:'#F3DFC5',line:'#EEDCC6',sticky:'#F8DA8A'},
   fonts:{head:'Young Serif',body:'Mulish',hand:'Indie Flower'},bg:{kind:'pattern',id:'knit'}},
 cocoa:{name:'Midnight Cocoa',tag:'dark & dreamy',dark:true,c:{oat:'#211814',paper:'#33261F',cream:'#3A2C24',side:'#4A362B',rust:'#D98A4E',mustard:'#D9A23A',caramel:'#B07A50',olive:'#8E9A5A',berry:'#C0675A',ink:'#F3E6D6',ink2:'#CDB7A2',head:'#F1C89A',strip:'#47362C',line:'#4A3A30',sticky:'#F0D98A',
   soft:'#47362C',softInk:'#F1DCC4',field:'#2A201B',fieldFocus:'#3A2C24',day:'#2C221D',dayHover:'#3A2C24',muted:'#9C8573',ph:'#8F7867',ckb:'#8F7867',ckbg:'#2A201B',tabOn1:'#5E4536',tabOn2:'#553E31'},
   fonts:{head:'Fraunces',body:'Nunito',hand:'Caveat'},bg:{kind:'pattern',id:'stars'}}
};
var THEME_ORDER=['coffee','garden','pastel','winter','pumpkin','cocoa'];

/* ---- fonts ---- */
var FONTS={
 'Fraunces':{q:'Fraunces:opsz,wght,SOFT@9..144,400..800,0..100',f:"'Fraunces',Georgia,serif"},
 'Playfair Display':{q:'Playfair+Display:wght@400..900',f:"'Playfair Display',Georgia,serif"},
 'Lora':{q:'Lora:wght@400..700',f:"'Lora',Georgia,serif"},
 'DM Serif Display':{q:'DM+Serif+Display',f:"'DM Serif Display',Georgia,serif"},
 'Young Serif':{q:'Young+Serif',f:"'Young Serif',Georgia,serif"},
 'Cormorant Garamond':{q:'Cormorant+Garamond:wght@500;600;700',f:"'Cormorant Garamond',Georgia,serif"},
 'Baloo 2':{q:'Baloo+2:wght@400..800',f:"'Baloo 2',system-ui,sans-serif"},
 'Comfortaa':{q:'Comfortaa:wght@300..700',f:"'Comfortaa',system-ui,sans-serif"},
 'Nunito':{q:'Nunito:wght@400..900',f:"'Nunito',system-ui,sans-serif"},
 'Quicksand':{q:'Quicksand:wght@400..700',f:"'Quicksand',system-ui,sans-serif"},
 'Poppins':{q:'Poppins:wght@400;500;600;700;800',f:"'Poppins',system-ui,sans-serif"},
 'Lato':{q:'Lato:wght@400;700;900',f:"'Lato',system-ui,sans-serif"},
 'Mulish':{q:'Mulish:wght@400..900',f:"'Mulish',system-ui,sans-serif"},
 'Varela Round':{q:'Varela+Round',f:"'Varela Round',system-ui,sans-serif"},
 'Patrick Hand':{q:'Patrick+Hand',f:"'Patrick Hand',cursive"},
 'Caveat':{q:'Caveat:wght@400..700',f:"'Caveat',cursive"},
 'Pacifico':{q:'Pacifico',f:"'Pacifico',cursive"},
 'Amatic SC':{q:'Amatic+SC:wght@400;700',f:"'Amatic SC',cursive"},
 'Shadows Into Light':{q:'Shadows+Into+Light',f:"'Shadows Into Light',cursive"},
 'Indie Flower':{q:'Indie+Flower',f:"'Indie Flower',cursive"},
 'Dancing Script':{q:'Dancing+Script:wght@400..700',f:"'Dancing Script',cursive"},
 'Gochi Hand':{q:'Gochi+Hand',f:"'Gochi Hand',cursive"},
 'Kalam':{q:'Kalam:wght@400;700',f:"'Kalam',cursive"}
};
var FONT_SETS={head:['Fraunces','Playfair Display','Lora','DM Serif Display','Young Serif','Cormorant Garamond','Baloo 2','Comfortaa'],
 body:['Nunito','Quicksand','Comfortaa','Poppins','Lato','Mulish','Varela Round','Patrick Hand'],
 hand:['Caveat','Patrick Hand','Pacifico','Amatic SC','Shadows Into Light','Indie Flower','Dancing Script','Gochi Hand','Kalam']};
var SIZES=[[.9,'Small'],[1,'Medium'],[1.12,'Large'],[1.25,'Extra large']];
function fontHref(names){var seen={},q=[];names.forEach(function(n){if(FONTS[n]&&!seen[n]){seen[n]=1;q.push('family='+FONTS[n].q);}});return q.length?'https://fonts.googleapis.com/css2?'+q.join('&')+'&display=swap':'';}
function ensureFontLink(id,href){if(!href)return;var l=document.getElementById(id);if(!l){l=document.createElement('link');l.rel='stylesheet';l.id=id;document.head.appendChild(l);}if(l.getAttribute('href')!==href)l.setAttribute('href',href);}

/* ---- swatches ---- */
var ACCENTS=[['#B5542B','rust'],['#D9A23A','mustard'],['#C98B4E','caramel'],['#6E6B35','olive'],['#9B4A3C','berry'],['#C9A27A','kraft'],['#E0849F','rose'],['#F4B183','peach'],['#9DB08C','sage'],['#7FC0AC','mint'],['#8FB9C9','sky'],['#B7A3E0','lavender'],['#7C93A6','slate'],['#3F5E54','pine'],['#5A3A2E','cocoa'],['#4A4A5E','night']];
var CARDCOLORS=[['#FFFBF3','paper'],['#FBF1D9','cream'],['#F6DE8A','butter'],['#F4C7A1','peach'],['#EDC0B0','rose'],['#F6DEDF','blush'],['#D3D8A6','sage'],['#DCE8F0','sky'],['#E6DFF2','lavender'],['#EADBC4','oat'],['#5A4034','cocoa'],['#2F3A36','pine']];
var SOLIDS=[['#FBF3E4','cream'],['#F3EBDD','oat'],['#E8D5BD','latte'],['#DDE5D2','sage'],['#F6DEDF','blush'],['#DCE8F0','sky'],['#E6DFF2','lavender'],['#FBF0C8','butter'],['#F4D9C6','peach'],['#3A2A22','cocoa'],['#22302C','pine'],['#262A3A','midnight']];

/* ---- built-in backgrounds (drawn with CSS/SVG, so they're free & tiny) ---- */
var PATTERNS=[['paper','Paper'],['linen','Linen'],['knit','Knit'],['plaid','Plaid'],['gingham','Gingham'],['dots','Polka dots'],['stripes','Stripes'],['leaves','Falling leaves'],['stars','Starry'],['hearts','Hearts']];
function patternCss(id,base,a1,a2,dark){var ink=dark?'#FFFFFF':'#5A3A24',L;
 if(id==='paper')return {img:svgUri("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .45 0 0 0 0 .33 0 0 0 0 .2 0 0 0 "+(dark?'.12':'.05')+" 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")+',radial-gradient(ellipse at 80% 0%,'+(dark?'rgba(255,255,255,.05)':'rgba(255,255,255,.3)')+',transparent 60%),radial-gradient(ellipse at 10% 100%,'+rgba(a2,.06)+',transparent 55%)',size:'220px 220px,auto,auto',color:base};
 if(id==='linen')return {img:'repeating-linear-gradient(0deg,'+rgba(ink,.045)+' 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,'+rgba(ink,.045)+' 0 1px,transparent 1px 4px),repeating-linear-gradient(45deg,'+rgba(ink,.02)+' 0 2px,transparent 2px 9px)',size:'auto',color:base};
 if(id==='knit'){L=mix(base,a2,.35);return {img:svgUri("<svg xmlns='http://www.w3.org/2000/svg' width='24' height='26'><g fill='none' stroke='"+L+"' stroke-width='4' stroke-linecap='round'><path d='M3 2l9 10 9-10'/><path d='M3 15l9 10 9-10'/></g><g fill='none' stroke='"+mix(L,base,.5)+"' stroke-width='1.2' opacity='.8'><path d='M3 4l9 10 9-10'/><path d='M3 17l9 10 9-10'/></g></svg>"),size:'24px 26px',color:base};}
 if(id==='plaid')return {img:'repeating-linear-gradient(90deg,'+rgba(a1,.16)+' 0 26px,transparent 26px 70px,'+rgba(a2,.14)+' 70px 76px,transparent 76px 112px),repeating-linear-gradient(0deg,'+rgba(a1,.16)+' 0 26px,transparent 26px 70px,'+rgba(a2,.14)+' 70px 76px,transparent 76px 112px)',size:'auto',color:base};
 if(id==='gingham')return {img:'linear-gradient(90deg,'+rgba(a1,.16)+' 50%,transparent 50%),linear-gradient(0deg,'+rgba(a1,.16)+' 50%,transparent 50%)',size:'34px 34px,34px 34px',color:base};
 if(id==='dots')return {img:'radial-gradient('+rgba(a1,.32)+' 3.6px,transparent 4.2px),radial-gradient('+rgba(a2,.26)+' 3.6px,transparent 4.2px)',size:'34px 34px,34px 34px',pos:'0 0,17px 17px',color:base};
 if(id==='stripes')return {img:'repeating-linear-gradient(90deg,'+rgba(a1,.13)+' 0 16px,transparent 16px 40px,'+rgba(a2,.12)+' 40px 43px,transparent 43px 64px)',size:'auto',color:base};
 if(id==='leaves'){var l1=rgba(a1,dark?.35:.28),l2=rgba(a2,dark?.32:.26);return {img:svgUri("<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><g stroke='none'><path fill='"+l1+"' d='M30 20c10 2 16 10 14 22-12-1-18-9-14-22z'/><path fill='"+l2+"' d='M120 40c12 0 20 8 20 20-12 2-20-6-20-20z'/><path fill='"+l1+"' d='M80 110c4 10 0 20-12 24-4-10 0-20 12-24z'/><path fill='"+l2+"' d='M150 130c8 6 9 16 2 24-8-6-9-16-2-24z'/><path fill='"+l2+"' d='M20 140c10-2 18 4 20 14-10 2-18-4-20-14z'/><circle fill='"+l1+"' cx='100' cy='20' r='3'/><circle fill='"+l2+"' cx='60' cy='70' r='2.5'/><circle fill='"+l1+"' cx='160' cy='90' r='2.5'/></g></svg>"),size:'180px 180px',color:base};}
 if(id==='stars'){var s1=dark?'rgba(255,236,190,.55)':rgba(a2,.4),s2=dark?'rgba(255,255,255,.35)':rgba(a1,.3);return {img:svgUri("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><path fill='"+s1+"' d='M30 22l2.6 6 6.4.6-4.8 4.2 1.4 6.2-5.6-3.3-5.6 3.3 1.4-6.2-4.8-4.2 6.4-.6z'/><path fill='"+s1+"' d='M118 96l2 4.6 5 .5-3.8 3.3 1.1 4.9-4.3-2.6-4.3 2.6 1.1-4.9-3.8-3.3 5-.5z'/><circle fill='"+s2+"' cx='90' cy='30' r='2'/><circle fill='"+s2+"' cx='140' cy='50' r='1.6'/><circle fill='"+s2+"' cx='60' cy='120' r='2.2'/><circle fill='"+s2+"' cx='20' cy='80' r='1.4'/><circle fill='"+s2+"' cx='150' cy='145' r='1.8'/></svg>"),size:'160px 160px',color:base};}
 if(id==='hearts'){var h1=rgba(a1,.25),h2=rgba(a2,.22);return {img:svgUri("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><path fill='"+h1+"' d='M30 42c-8-6-14-10-14-17a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 7-6 11-14 17z'/><path fill='"+h2+"' d='M90 102c-6-4.5-10.5-7.5-10.5-12.8a5.3 5.3 0 0 1 10.5-1.5 5.3 5.3 0 0 1 10.5 1.5c0 5.3-4.5 8.3-10.5 12.8z'/></svg>"),size:'120px 120px',color:base};}
 return {img:'none',size:'auto',color:base};}

/* ---- settings ---- */
function defaultSettings(){return {v:1,t:0,theme:'coffee',colors:{side:'',strips:'',buttons:''},fonts:{head:'',body:'',hand:''},size:1,bg:null,tabs:{order:[],names:{},icons:{}}};}
var S=defaultSettings();
try{var _cs=JSON.parse(localStorage.getItem('settings2')||'null');if(_cs&&_cs.v)S=Object.assign(defaultSettings(),_cs);}catch(e){}
function normS(){var d=defaultSettings();['colors','fonts','tabs'].forEach(function(k){S[k]=Object.assign({},d[k],S[k]||{});});S.tabs.names=S.tabs.names||{};S.tabs.icons=S.tabs.icons||{};S.tabs.order=S.tabs.order||[];if(!THEMES[S.theme])S.theme='coffee';}
normS();
function theme(){return THEMES[S.theme]||THEMES.coffee;}
function curBg(){var t=theme();return S.bg||{kind:t.bg.kind,id:t.bg.id};}
function curFonts(){var t=theme();return {head:S.fonts.head||t.fonts.head,body:S.fonts.body||t.fonts.body,hand:S.fonts.hand||t.fonts.hand};}
/* every CSS variable the look needs, worked out from the theme + her picks */
function themeVars(){var t=theme(),c=Object.assign({},t.c),dark=!!t.dark,v={};
 if(S.colors.side){c.side=S.colors.side;['side1','side2','tab1','tab2','tabOn1','tabOn2','sideInk','tabInk'].forEach(function(k){delete c[k];});}
 var side=c.side,sd=isDark(side);
 v['--oat']=c.oat;v['--paper']=c.paper;v['--cream']=c.cream;v['--rust']=c.rust;v['--mustard']=c.mustard;v['--caramel']=c.caramel;v['--olive']=c.olive;v['--berry']=c.berry;v['--ink']=c.ink;v['--ink2']=c.ink2;v['--line']=c.line;v['--sticky']=c.sticky;
 v['--head']=c.head;v['--strip']=c.strip;v['--stripInk']=c.stripInk||onColor(c.strip);
 v['--kraft']=side;v['--kraftlt']=mix(side,'#FFFFFF',.35);
 v['--side1']=c.side1||mix(side,'#FFFFFF',.08);v['--side2']=c.side2||mix(side,'#000000',.06);
 v['--tab1']=c.tab1||(sd?mix(side,'#FFFFFF',.14):mix(side,'#FFFFFF',.32));v['--tab2']=c.tab2||(sd?mix(side,'#FFFFFF',.06):mix(side,'#FFFFFF',.18));
 v['--tabOn1']=c.tabOn1||(dark?mix(side,'#FFFFFF',.2):mix(c.cream,side,.1));v['--tabOn2']=c.tabOn2||(dark?mix(side,'#FFFFFF',.12):mix(c.cream,side,.22));
 v['--sideInk']=c.sideInk||(sd?mix(side,'#FFFFFF',.9):mix(side,'#1E120A',.78));
 v['--tabInk']=c.tabInk||onColor(v['--tab1']);v['--tabOnInk']=dark?c.ink:(c.tabInk||mix(c.ink,'#000000',.1));
 var acc=S.colors.buttons||c.rust;v['--accent']=acc;v['--accentDk']=mix(acc,'#000000',.32);v['--onAccent']=onColor(acc);
 ['rust','mustard','caramel','olive','berry'].forEach(function(k){var n='on'+k[0].toUpperCase()+k.slice(1);v['--'+n]=c[n]||onColor(c[k]);});
 var acc0=S.colors.buttons||c.rust;if(!S.colors.buttons&&c.onRust)v['--onAccent']=c.onRust;
 v['--soft']=c.soft||mix(c.paper,side,.2);v['--softInk']=c.softInk||mix(c.ink,c.head,.45);
 v['--field']=c.field||mix(c.paper,side,.11);v['--fieldFocus']=c.fieldFocus||mix(c.paper,'#FFFFFF',.6);
 v['--day']=c.day||mix(c.paper,side,.06);v['--dayHover']=c.dayHover||mix(c.paper,side,.13);
 v['--muted']=c.muted||mix(c.ink,c.paper,.5);v['--ph']=c.ph||mix(c.ink,c.paper,.55);v['--ckb']=c.ckb||mix(c.ink,c.paper,.5);v['--ckbg']=c.ckbg||mix(c.paper,'#FFFFFF',.5);
 v['--sheen']=dark?'linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 40%)':'linear-gradient(180deg,rgba(255,255,255,.6),rgba(255,255,255,0) 40%)';
 v['--shadow']=dark?'0 2px 0 rgba(0,0,0,.25),0 10px 24px -8px rgba(0,0,0,.55)':'0 2px 0 rgba(120,88,56,.06),0 10px 24px -8px '+rgba(mix(c.ink,side,.3),.3);
 if(S.colors.strips){v['--stripAll']=S.colors.strips;v['--stripAllInk']=onColor(S.colors.strips);}
 var f=curFonts();v['--serif']=FONTS[f.head]?FONTS[f.head].f:"'Fraunces',Georgia,serif";v['--sans']=FONTS[f.body]?FONTS[f.body].f:"'Nunito',system-ui,sans-serif";v['--hand']=FONTS[f.hand]?FONTS[f.hand].f:"'Caveat',cursive";
 v['--ts']=String(S.size||1);
 return v;}
var _imgUrl={};
function applyLook(){var v=themeVars(),d=document.documentElement,arr=[];Object.keys(v).forEach(function(k){d.style.setProperty(k,v[k]);arr.push([k,v[k]]);});
 var t=theme();document.body.classList.toggle('darkth',!!t.dark);document.body.classList.toggle('onestrip',!!S.colors.strips);
 var f=curFonts(),href=fontHref([f.head,f.body,f.hand]);ensureFontLink('fontsel',href);
 try{localStorage.setItem('tv2',JSON.stringify(arr));localStorage.setItem('tf2',href);}catch(e){}
 var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',v['--kraft']);
 applyBg();}
function bgLayer(){var l=$('#bgl');if(!l){l=document.createElement('div');l.id='bgl';l.innerHTML='<div class="bgi"></div><div class="bgo"></div>';document.body.insertBefore(l,document.body.firstChild);}return l;}
function applyBg(){var b=curBg(),t=theme(),c=themeVars(),l=bgLayer(),bi=l.querySelector('.bgi'),bo=l.querySelector('.bgo'),dark=!!t.dark,photo=false,bgDark=dark;
 bi.style.cssText='';bo.style.cssText='';
 if(b.kind==='photo'&&b.img){photo=true;var u=_imgUrl[b.img];bi.style.backgroundColor=c['--oat'];
  if(u){bi.style.backgroundImage='url("'+u+'")';}else{var m=imgMeta(b.img);if(m&&m.thumb)bi.style.backgroundImage='url("'+m.thumb+'")';getImgUrl(b.img).then(function(u2){if(u2&&curBg().img===b.img)applyBg();}).catch(function(){});}
  if(b.fit==='tile'){bi.style.backgroundSize='380px auto';bi.style.backgroundRepeat='repeat';}else{bi.style.backgroundSize='cover';bi.style.backgroundPosition='center';bi.style.backgroundRepeat='no-repeat';}
  var bl=+b.blur||0;if(bl){bi.style.filter='blur('+bl+'px)';bi.style.inset=(-bl*2)+'px';}
  var dm=b.dim==null?25:+b.dim;bo.style.background=rgba(c['--oat'],dm/100);}
 else if(b.kind==='solid'){bi.style.background=b.color||c['--oat'];bgDark=isDark(b.color||c['--oat']);var p0=patternCss('paper',b.color||c['--oat'],c['--rust'],c['--caramel'],bgDark);bi.style.backgroundImage=p0.img.split(',radial')[0];bi.style.backgroundSize='220px 220px';
  if(b.dim)bo.style.background=rgba(c['--oat'],(+b.dim)/100);}
 else{var p=patternCss(b.id||'paper',c['--oat'],c['--rust'],c['--caramel'],dark);bi.style.backgroundColor=p.color;bi.style.backgroundImage=p.img;bi.style.backgroundSize=p.size;if(p.pos)bi.style.backgroundPosition=p.pos;
  if(b.dim)bo.style.background=rgba(c['--oat'],(+b.dim)/100);}
 document.body.classList.toggle('photobg',photo);document.body.classList.toggle('frost',photo||bgDark!==dark);}

/* ---- photos: shrink in the browser, keep in Firestore ("images"), cache on the device ---- */
var IMGS=[];try{IMGS=JSON.parse(localStorage.getItem('imgs2')||'[]');}catch(e){IMGS=[];}
function saveImgsList(){try{localStorage.setItem('imgs2',JSON.stringify(IMGS));}catch(e){}}
function imgMeta(id){for(var i=0;i<IMGS.length;i++)if(IMGS[i].id===id)return IMGS[i];return null;}
var imgsLoaded=false;
function refreshImgs(){return api('listImages').then(function(a){IMGS=a||[];imgsLoaded=true;saveImgsList();return IMGS;});}
var idbP=null;
function idb(){if(idbP)return idbP;idbP=new Promise(function(res,rej){try{var r=indexedDB.open('planner-imgs',1);r.onupgradeneeded=function(){r.result.createObjectStore('i');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});return idbP;}
function idbGet(k){return idb().then(function(db){return new Promise(function(res){try{var q=db.transaction('i').objectStore('i').get(k);q.onsuccess=function(){res(q.result||null);};q.onerror=function(){res(null);};}catch(e){res(null);}});}).catch(function(){return null;});}
function idbPut(k,v){return idb().then(function(db){try{db.transaction('i','readwrite').objectStore('i').put(v,k);}catch(e){}}).catch(function(){});}
function idbDel(k){return idb().then(function(db){try{db.transaction('i','readwrite').objectStore('i').delete(k);}catch(e){}}).catch(function(){});}
function dataToUrl(data){try{var p=data.split(','),mime=(p[0].match(/data:([^;]+)/)||[])[1]||'image/jpeg',bin=atob(p[1]),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([u],{type:mime}));}catch(e){return data;}}
var _imgWait={};
function getImgUrl(id){if(!id)return Promise.resolve(null);if(_imgUrl[id])return Promise.resolve(_imgUrl[id]);if(_imgWait[id])return _imgWait[id];
 _imgWait[id]=idbGet('img:'+id).then(function(d){if(d)return d;return api('getImage',[id]).then(function(r){if(!r||!r.data)return null;idbPut('img:'+id,r.data);if(r.meta&&!imgMeta(id)){IMGS.unshift(r.meta);saveImgsList();}return r.data;});})
  .then(function(d){delete _imgWait[id];if(!d)return null;_imgUrl[id]=dataToUrl(d);return _imgUrl[id];},function(e){delete _imgWait[id];throw e;});
 return _imgWait[id];}
function loadImageFile(file){return new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){res(im);};im.onerror=function(){URL.revokeObjectURL(u);rej('decode');};im.src=u;});}
var _webpOK=null;
function encodeImg(im,maxDim,limit,thumb){var w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,scale=Math.min(1,maxDim/Math.max(w,h)),out=null;
 for(var round=0;round<9;round++){var cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale)),cv=document.createElement('canvas');cv.width=cw;cv.height=ch;var cx=cv.getContext('2d');
  if(_webpOK===null){var tc=document.createElement('canvas');tc.width=tc.height=2;_webpOK=tc.toDataURL('image/webp',.8).indexOf('data:image/webp')===0;}
  var webp=_webpOK&&!thumb;if(!webp){cx.fillStyle='#FFFFFF';cx.fillRect(0,0,cw,ch);}cx.drawImage(im,0,0,cw,ch);
  var qs=thumb?[.72,.6]:[.84,.76,.68,.6,.52];
  for(var i=0;i<qs.length;i++){var d=cv.toDataURL(webp?'image/webp':'image/jpeg',qs[i]);out={data:d,w:cw,h:ch};if(d.length<=limit)return out;}
  scale*=.82;}
 return out;}
var MAX_FILE=30*1024*1024,IMG_LIMIT=700000,PART=800000;
function friendlyImgError(file,e){var heic=/\.(heic|heif)$/i.test(file.name||'')||/hei[cf]/i.test(file.type||'');
 if(heic)return 'That looks like an iPhone “HEIC” photo, and this browser can’t open those. Tip: in Photos, tap Share › Options › “Most Compatible”, or on iPhone go to Settings › Camera › Formats › “Most Compatible”. Then try again 💛';
 return 'Hmm, I couldn’t open that picture. Try a JPG or PNG photo 💛';}
/* the whole upload: checks → shrink → save in pieces → done.  onStep(text, pct) drives the cute progress bar */
function uploadImage(file,kind,onStep){onStep=onStep||function(){};
 if(!file)return Promise.reject('No picture picked');
 var heic=/\.(heic|heif)$/i.test(file.name||'')||/hei[cf]/i.test(file.type||'');
 if(!heic&&file.type&&file.type.indexOf('image/')!==0)return Promise.reject('That file isn’t a picture. Pick a photo (JPG, PNG, or iPhone photo) 📷');
 if(file.size>MAX_FILE)return Promise.reject('That photo is really big ('+Math.round(file.size/1048576)+' MB). Pick one under 30 MB 💛');
 onStep('Opening your photo…',10);
 return loadImageFile(file).catch(function(e){throw friendlyImgError(file,e);}).then(function(im){onStep('Making it a cozy size…',30);
  return new Promise(function(r){setTimeout(function(){r(im);},30);});}).then(function(im){
  var big=encodeImg(im,kind==='bg'?1600:900,IMG_LIMIT),th=encodeImg(im,200,40000,true);
  if(!big||big.data.length>950000*12)throw 'That photo is too detailed to save. Try a smaller one 💛';
  var id='img'+uid(),n=Math.ceil(big.data.length/PART),meta={id:id,name:(file.name||'photo').slice(0,60),kind:kind,w:big.w,h:big.h,bytes:big.data.length,thumb:th?th.data:'',parts:n,created:Date.now()};
  var chain=Promise.resolve(),done=0;
  onStep('Saving to your planner…',45);
  for(var i=0;i<n;i++)(function(i){chain=chain.then(function(){return api('putImagePart',[id,i,big.data.slice(i*PART,(i+1)*PART)]);}).then(function(){done++;onStep('Saving to your planner…',45+Math.round(45*done/n));});})(i);
  return chain.then(function(){return api('putImage',[meta]);}).then(function(){onStep('All saved!',100);IMGS.unshift(meta);saveImgsList();idbPut('img:'+id,big.data);_imgUrl[id]=dataToUrl(big.data);return meta;});});}
function pickFile(cb){var inp=document.createElement('input');inp.type='file';inp.accept='image/*,.heic,.heif';inp.style.display='none';document.body.appendChild(inp);
 inp.onchange=function(){var f=inp.files&&inp.files[0];inp.remove();if(f)cb(f);};inp.click();setTimeout(function(){if(inp.parentNode&&!inp.files.length){}},60000);}
/* a small progress card used by every uploader */
function progressBox(host){var el=document.createElement('div');el.className='upl';el.innerHTML='<div class="upl-t"><span class="upl-cup">☕</span><span class="upl-m">Getting ready…</span></div><div class="upl-bar"><i></i></div>';host.appendChild(el);
 return {step:function(t,p){el.querySelector('.upl-m').textContent=t;el.querySelector('i').style.width=p+'%';},
  fail:function(msg){el.classList.add('bad');el.innerHTML='<div class="upl-t"><span class="upl-cup">🍂</span><span class="upl-m"></span></div><button class="link upl-x">OK</button>';el.querySelector('.upl-m').textContent=msg;el.querySelector('.upl-x').onclick=function(){el.remove();};},
  done:function(){el.classList.add('ok');setTimeout(function(){el.remove();},900);}};}
function doUpload(kind,host,then){pickFile(function(f){var pb=progressBox(host);uploadImage(f,kind,pb.step).then(function(m){pb.done();then&&then(m);}).catch(function(e){pb.fail(typeof e==='string'?e:(e==='decode'?friendlyImgError(f):'Couldn’t save that photo right now. Check your internet and try again 💛'));if(typeof e!=='string')console.warn('upload failed',e);});});}
function imgUses(id){var u=[];if(S.bg&&S.bg.kind==='photo'&&S.bg.img===id)u.push('your background');LAYOUT.widgets.forEach(function(w){if(w.type==='photo'&&w.img===id)u.push('a photo card');});return u;}
function deleteImage(id,after){var uses=imgUses(id);
 confirmBox(uses.length?'This photo is on '+uses.join(' and ')+'. Delete it anyway?':'Delete this photo from your planner?','Delete photo',function(){
  api('delImage',[id]).then(function(){IMGS=IMGS.filter(function(x){return x.id!==id;});saveImgsList();idbDel('img:'+id);
   if(S.bg&&S.bg.img===id){S.bg=null;touchS();}
   var ch=false;LAYOUT.widgets.forEach(function(w){if(w.type==='photo'&&w.img===id){w.img='';ch=true;}});if(ch){saveLayout();if(cur==='dashboard'){killGrid();renderDash();}}
   toast('Photo deleted');after&&after();}).catch(function(){toast('Couldn’t delete right now – try again in a bit');});});}
function confirmBox(msg,okText,cb){var veil=document.createElement('div');veil.className='veil';veil.innerHTML='<div class="dlg sm"><div class="dh2"><span>Just checking</span><button class="ib" data-x>✕</button></div><div class="db"><p class="cfm"></p></div><div class="df"><span class="sp"></span><button class="btn soft sm" data-x>Keep it</button><button class="btn" data-ok></button></div></div>';
 veil.querySelector('.cfm').textContent=msg;veil.querySelector('[data-ok]').textContent=okText||'OK';document.body.appendChild(veil);
 veil.addEventListener('click',function(e){if(e.target===veil||e.target.closest('[data-x]'))return veil.remove();if(e.target.closest('[data-ok]')){veil.remove();cb();}});}

/* ---- cute stickers (inline SVG, chunky outlines like the rest of the app) ---- */
var SO='stroke="#3F2717" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';
var STICKERS={
 coffee:['Coffee','<path d="M38 12c-4 5 4 8 0 14M50 9c-4 5 4 8 0 14M62 12c-4 5 4 8 0 14" fill="none" '+SO+'/><path d="M20 36h56l-5 38a12 12 0 0 1-12 10H37a12 12 0 0 1-12-10z" fill="#B5542B" '+SO+'/><path d="M76 44h5a10 10 0 0 1 0 20h-7" fill="none" '+SO+'/><path d="M48 56c-4-4-10-1-8 4 1 3 8 8 8 8s7-5 8-8c2-5-4-8-8-4z" fill="#FBE3D0" stroke="#3F2717" stroke-width="2.5"/><ellipse cx="48" cy="90" rx="34" ry="5" fill="#E8D5BD" stroke="#3F2717" stroke-width="3"/>'],
 leaf:['Maple leaf','<path d="M50 8l7 16 13-6-4 15 16 2-12 11 8 14-16-3-2 15-10-11-10 11-2-15-16 3 8-14-12-11 16-2-4-15 13 6z" fill="#D7774C" '+SO+'/><path d="M50 30v62M50 52l-14-10M50 52l14-10M50 66l-16-4M50 66l16-4" fill="none" stroke="#3F2717" stroke-width="2.6" stroke-linecap="round"/>'],
 pumpkin:['Pumpkin','<path d="M50 24c-2-8 2-14 10-16" fill="none" stroke="#6E6B35" stroke-width="6" stroke-linecap="round"/><path d="M50 24c-2-8 2-14 10-16" fill="none" '+SO+'/><path d="M60 16c8-4 16 0 18 6-8 3-14 1-18-6z" fill="#8E8B4F" '+SO+'/><ellipse cx="50" cy="60" rx="38" ry="30" fill="#E58A3A" '+SO+'/><path d="M50 30c-10 8-12 52 0 60M50 30c10 8 12 52 0 60M30 34c-12 10-12 42 0 52M70 34c12 10 12 42 0 52" fill="none" stroke="#3F2717" stroke-width="2.6"/>'],
 heart:['Heart','<path d="M50 86C26 68 12 56 12 38a19 19 0 0 1 38-6 19 19 0 0 1 38 6c0 18-14 30-38 48z" fill="#E0849F" '+SO+'/><path d="M28 34a9 9 0 0 1 9-8" fill="none" stroke="#FFF4F7" stroke-width="4" stroke-linecap="round"/>'],
 star:['Star','<path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#F3C64E" '+SO+'/><circle cx="40" cy="52" r="3" fill="#3F2717"/><circle cx="60" cy="52" r="3" fill="#3F2717"/><path d="M44 62c4 4 8 4 12 0" fill="none" stroke="#3F2717" stroke-width="2.6" stroke-linecap="round"/>'],
 flowers:['Flowers','<path d="M50 54v38M50 76c-8-6-16-6-20-2 6 6 14 6 20 2zM50 70c8-6 16-6 20-2-6 6-14 6-20 2z" fill="#8E8B4F" '+SO+'/><g fill="#FFF8EE" '+SO+'><circle cx="50" cy="22" r="11"/><circle cx="68" cy="34" r="11"/><circle cx="62" cy="54" r="11"/><circle cx="38" cy="54" r="11"/><circle cx="32" cy="34" r="11"/></g><circle cx="50" cy="40" r="10" fill="#F3C64E" '+SO+'/>'],
 books:['Books','<rect x="14" y="66" width="72" height="18" rx="3" fill="#6E6B35" '+SO+'/><rect x="20" y="48" width="62" height="18" rx="3" fill="#D9A23A" '+SO+'/><rect x="16" y="30" width="66" height="18" rx="3" fill="#B5542B" '+SO+'/><path d="M24 39h40M28 57h38M22 75h44" stroke="#FFF4E6" stroke-width="3" stroke-linecap="round"/><path d="M64 10l12 6-6 14-6-8-6 8z" fill="#E0849F" '+SO+'/>'],
 scissors:['Scissors','<circle cx="28" cy="72" r="13" fill="#FFF8EE" '+SO+'/><circle cx="72" cy="72" r="13" fill="#FFF8EE" '+SO+'/><path d="M36 62L68 12M64 62L32 12" fill="none" stroke="#3F2717" stroke-width="7" stroke-linecap="round"/><path d="M36 62L68 12M64 62L32 12" fill="none" stroke="#C9CDD2" stroke-width="3.5" stroke-linecap="round"/><circle cx="50" cy="40" r="4" fill="#B5542B" stroke="#3F2717" stroke-width="2.5"/><circle cx="28" cy="72" r="6" fill="#E0849F"/><circle cx="72" cy="72" r="6" fill="#E0849F"/>'],
 crafter:['Craft machine','<rect x="10" y="40" width="80" height="30" rx="10" fill="#F2BDCD" '+SO+'/><rect x="20" y="30" width="60" height="14" rx="5" fill="#FFF8EE" '+SO+'/><rect x="44" y="46" width="12" height="18" rx="3" fill="#7FC0AC" '+SO+'/><path d="M4 76h92" stroke="#3F2717" stroke-width="3.5" stroke-linecap="round"/><rect x="14" y="70" width="72" height="10" rx="2" fill="#8FB9C9" '+SO+'/><path d="M30 18l3 6 6 1-5 4 2 6-6-3-6 3 2-6-5-4 6-1z" fill="#F3C64E" stroke="#3F2717" stroke-width="2"/>'],
 acorn:['Acorn','<path d="M26 44c0-14 10-22 24-22s24 8 24 22z" fill="#8A5A34" '+SO+'/><path d="M50 22v-10" stroke="#3F2717" stroke-width="5" stroke-linecap="round"/><path d="M30 44h40c0 24-10 40-20 44-10-4-20-20-20-44z" fill="#D9A574" '+SO+'/><path d="M34 32l6 6M46 28l6 6M58 30l6 6" stroke="#3F2717" stroke-width="2" stroke-linecap="round"/>'],
 mushroom:['Mushroom','<path d="M14 54c0-24 16-40 36-40s36 16 36 40z" fill="#D7574C" '+SO+'/><path d="M38 54h24l4 30a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6z" fill="#FFF8EE" '+SO+'/><circle cx="34" cy="36" r="6" fill="#FFF8EE"/><circle cx="58" cy="28" r="5" fill="#FFF8EE"/><circle cx="70" cy="44" r="4" fill="#FFF8EE"/>'],
 rainbow:['Rainbow','<path d="M10 74a40 40 0 0 1 80 0" fill="none" stroke="#E0849F" stroke-width="10"/><path d="M20 74a30 30 0 0 1 60 0" fill="none" stroke="#F3C64E" stroke-width="10"/><path d="M30 74a20 20 0 0 1 40 0" fill="none" stroke="#7FC0AC" stroke-width="10"/><path d="M5 74a45 45 0 0 1 90 0M35 74a15 15 0 0 1 30 0" fill="none" stroke="#3F2717" stroke-width="3"/><ellipse cx="18" cy="78" rx="14" ry="9" fill="#FFF8EE" '+SO+'/><ellipse cx="82" cy="78" rx="14" ry="9" fill="#FFF8EE" '+SO+'/>'],
 apple:['Teacher apple','<path d="M50 30c-14-10-36-4-36 22 0 22 16 38 28 38 4 0 6-2 8-2s4 2 8 2c12 0 28-16 28-38 0-26-22-32-36-22z" fill="#C7433A" '+SO+'/><path d="M50 30c0-8 2-14 6-18" fill="none" stroke="#3F2717" stroke-width="4" stroke-linecap="round"/><path d="M56 18c8-8 20-6 22 0-8 6-16 6-22 0z" fill="#8E8B4F" '+SO+'/><path d="M28 44c2-6 6-8 10-8" fill="none" stroke="#FFF4E6" stroke-width="4" stroke-linecap="round"/>'],
 pencil:['Pencil','<path d="M20 80l8-22 44-44 14 14-44 44z" fill="#F3C64E" '+SO+'/><path d="M72 14l14 14 6-6a6 6 0 0 0 0-8l-6-6a6 6 0 0 0-8 0z" fill="#E0849F" '+SO+'/><path d="M28 58l14 14M20 80l4-10 6 6z" fill="#3F2717" '+SO+'/><path d="M34 52l36-36" stroke="#3F2717" stroke-width="2"/>'],
 moon:['Sleepy moon','<path d="M62 10a40 40 0 1 0 28 56A32 32 0 0 1 62 10z" fill="#F3D27A" '+SO+'/><path d="M34 52c3 3 7 3 10 0M52 62c3 3 7 3 10 0" fill="none" stroke="#3F2717" stroke-width="2.6" stroke-linecap="round"/><path d="M82 16l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#FFF8EE" stroke="#3F2717" stroke-width="2"/>'],
 cup2:['Hot cocoa','<path d="M22 40h50v32a14 14 0 0 1-14 14H36a14 14 0 0 1-14-14z" fill="#F2BDCD" '+SO+'/><path d="M72 48h4a9 9 0 0 1 0 18h-4" fill="none" '+SO+'/><g fill="#FFF8EE" '+SO+'><circle cx="34" cy="36" r="7"/><circle cx="48" cy="32" r="8"/><circle cx="61" cy="37" r="7"/></g><path d="M36 60h22" stroke="#3F2717" stroke-width="2.6" stroke-linecap="round"/>']
};
var STICKER_ORDER=Object.keys(STICKERS);
function stickerSvg(k){var s=STICKERS[k]||STICKERS.coffee;return '<svg viewBox="0 0 100 100" aria-label="'+esc(s[0])+'">'+s[1]+'</svg>';}

/* ---- saving settings (backend + device cache) ---- */
var sT=null;
function touchS(){S.t=Date.now();try{localStorage.setItem('settings2',JSON.stringify(S));}catch(e){}applyLook();setCzSaved('saving');clearTimeout(sT);
 sT=setTimeout(function(){api('saveSettings',[S]).then(function(){setCzSaved('ok');}).catch(function(){setCzSaved('off');clearTimeout(sT);sT=setTimeout(function(){touchSRetry();},15000);});},700);}
function touchSRetry(){api('saveSettings',[S]).then(function(){setCzSaved('ok');}).catch(function(){setCzSaved('off');});}
function setCzSaved(s){var el=$('#czsaved');if(!el)return;el.className='czsaved '+s;el.textContent=s==='saving'?'saving…':s==='off'?'will save when online':'saved ✓';}
function loadSettings(){return api('getSettings').then(function(r){if(r&&r.v&&(r.t||0)>(S.t||0)){S=Object.assign(defaultSettings(),r);normS();try{localStorage.setItem('settings2',JSON.stringify(S));}catch(e){}applyLook();buildNav();render();if($('#czpanel.open'))drawCz();}
 else if((S.t||0)>((r&&r.t)||0))api('saveSettings',[S]).catch(function(){});}).catch(function(){});}

/* ---- sidebar tabs: names, icons, order ---- */
var TAB_EMOJI=['🏠','☕','🍲','🛒','✅','📅','📝','✂️','💡','🧠','💌','💰','🎒','📚','🍎','🌻','🍂','🎄','⭐','❤️','🌙','🐾','🎨','🧺','🏡','🌸'];
function tabsList(){var ids=TABS.map(function(t){return t[0];}),o=(S.tabs.order||[]).filter(function(id){return ids.indexOf(id)>=0;});ids.forEach(function(id){if(o.indexOf(id)<0)o.push(id);});
 return o.map(function(id){var t=TABS.filter(function(x){return x[0]===id;})[0];return {id:id,name:(S.tabs.names[id]||'').trim()||t[1],icon:S.tabs.icons[id]||'',svg:t[2],defName:t[1]};});}
function tabName(id){var n=(S.tabs.names[id]||'').trim();if(n)return n;var t=TABS.filter(function(x){return x[0]===id;})[0];return t?t[1]:'';}
function tabIconHtml(t){return t.icon?'<i class="temo">'+esc(t.icon)+'</i>':'<svg><use href="#'+t.svg+'"/></svg>';}

/* ---- the drawer ---- */
var czSec='themes';
var CZ_SECS=[['themes','🎨','Themes'],['colors','🖍️','Colors'],['fonts','🔤','Fonts'],['bg','🖼️','Background'],['photos','📷','Photos'],['menu','🗂️','Menu']];
function openCz(sec){if(sec)czSec=sec;var p=$('#czpanel');if(!p){p=document.createElement('div');p.id='czpanel';p.className='panel cz';p.setAttribute('aria-hidden','true');
  p.innerHTML='<div class="ph"><h2>Make it yours ✨</h2><span class="czsaved ok" id="czsaved">saved ✓</span><button class="ib" id="czclose" aria-label="Close">✕</button></div><div class="cznav" id="cznav"></div><div class="pb" id="czbody"></div><div class="czfoot"><button class="btn soft sm" id="czreset">↺ Reset to Coffeehouse</button><button class="btn sm" id="czdone">Done</button></div>';
  document.body.appendChild(p);$('#czclose').onclick=closeCz;$('#czdone').onclick=closeCz;$('#czreset').onclick=resetLook;wireCz(p);}
 ensureFontLink('fontall',fontHref(Object.keys(FONTS)));
 document.body.classList.remove('drawer');p.classList.add('open');p.setAttribute('aria-hidden','false');document.body.classList.add('czopen');$('#shade').classList.add('on','light');drawCz();
 if(!imgsLoaded)refreshImgs().then(function(){if(czSec==='bg'||czSec==='photos')drawCz();}).catch(function(){});}
function closeCz(){var p=$('#czpanel');if(p){p.classList.remove('open');p.setAttribute('aria-hidden','true');}document.body.classList.remove('czopen');$('#shade').classList.remove('on','light');}
function resetLook(){confirmBox('Go back to the original Autumn Coffeehouse look? (Your menu names and photos stay.)','Reset the look',function(){var tabs=S.tabs;S=defaultSettings();S.tabs=tabs;touchS();drawCz();buildNav();render();toast('Back to cozy Coffeehouse ☕');});}
function drawCz(){var nav=$('#cznav'),b=$('#czbody');if(!nav)return;
 nav.innerHTML=CZ_SECS.map(function(s){return '<button class="'+(s[0]===czSec?'on':'')+'" data-czsec="'+s[0]+'"><span>'+s[1]+'</span>'+s[2]+'</button>';}).join('');
 var st=b.scrollTop;b.innerHTML=({themes:czThemes,colors:czColors,fonts:czFonts,bg:czBg,photos:czPhotos,menu:czMenu})[czSec]();b.scrollTop=st;
 b.querySelectorAll('[data-imgthumb]').forEach(function(el){var m=imgMeta(el.getAttribute('data-imgthumb'));if(m&&m.thumb)el.style.backgroundImage='url("'+m.thumb+'")';});}
function secHead(t,sub){return '<div class="czh"><b>'+t+'</b>'+(sub?'<span>'+sub+'</span>':'')+'</div>';}
function themeMini(k){var t=THEMES[k],c=t.c,p=patternCss(t.bg.id,c.oat,c.rust,c.caramel,!!t.dark);
 return '<span class="tmini" style="background-color:'+p.color+';background-image:'+p.img.replace(/"/g,"'")+';background-size:'+p.size+'"><i class="ts" style="background:'+(c.side1||c.side)+'"><b style="background:'+(c.tabOn1||mix(c.cream,c.side,.1))+'"></b><b style="background:'+(c.tab1||mix(c.side,'#FFFFFF',.3))+'"></b><b style="background:'+(c.tab1||mix(c.side,'#FFFFFF',.3))+'"></b></i>'+
  '<i class="tc" style="background:'+c.paper+'"><i class="tw" style="background:'+c.rust+'"></i><i class="tl" style="color:'+c.head+';font-family:'+FONTS[t.fonts.head].f.replace(/"/g,"'")+'">Aa</i><i class="th" style="color:'+c.ink2+';font-family:'+FONTS[t.fonts.hand].f.replace(/"/g,"'")+'">cozy day</i></i>'+
  '<i class="tc2" style="background:'+c.paper+'"><i class="tw" style="background:'+c.mustard+'"></i><i class="tdots"><u style="background:'+c.olive+'"></u><u style="background:'+c.caramel+'"></u><u style="background:'+c.berry+'"></u></i></i></span>';}
function czThemes(){return secHead('Pick a look','one tap changes colors, fonts & background together')+'<div class="tgrid">'+THEME_ORDER.map(function(k){var t=THEMES[k];
 return '<button class="tcard'+(S.theme===k?' on':'')+'" data-theme="'+k+'">'+themeMini(k)+'<span class="tn">'+esc(t.name)+(S.theme===k?' <em>✓</em>':'')+'<small>'+esc(t.tag)+'</small></span></button>';}).join('')+'</div>'+
 '<p class="czhint">Tip: after picking a theme, you can still change colors, fonts, or the background in the other tabs above.</p>';}
function swRow(key,list,cur,defLabel,defColor){return '<div class="swrow"><button class="sw2 def'+(!cur?' on':'')+'" data-czc="'+key+':" title="'+esc(defLabel)+'"><span style="background:'+defColor+'"></span>'+esc(defLabel)+'</button>'+
 list.map(function(c){return '<button class="sw'+(cur&&cur.toUpperCase()===c[0]?' on':'')+'" data-czc="'+key+':'+c[0]+'" style="background:'+c[0]+'" title="'+c[1]+'" aria-label="'+c[1]+'"></button>';}).join('')+
 '<label class="sw any'+(cur&&!list.some(function(c){return c[0]===cur.toUpperCase();})?' on':'')+'" title="Pick any color"'+(cur&&!list.some(function(c){return c[0]===cur.toUpperCase();})?' style="background:'+cur+'"':'')+'><input type="color" data-czany="'+key+'" value="'+(cur||(/^#[0-9a-f]{6}$/i.test(defColor)?defColor:'#C98B4E'))+'"><span>+</span></label></div>';}
function czColors(){var t=theme(),c=t.c;
 return secHead('Menu color','the sidebar on the left')+swRow('side',ACCENTS,S.colors.side,'Theme',c.side1||c.side)+
 secHead('Card tops','the colored strip on top of each card')+swRow('strips',ACCENTS,S.colors.strips,'Mixed','linear-gradient(90deg,'+c.rust+' 0 33%,'+c.mustard+' 33% 66%,'+c.olive+' 66%)')+
 secHead('Buttons & checkmarks','“Add” buttons, + buttons, and checked boxes')+swRow('buttons',ACCENTS,S.colors.buttons,'Theme',c.rust)+
 '<div class="czprev"><div class="card"><div class="wh '+(S.colors.strips?'':'rust')+'"><span class="t">Little preview</span></div><div class="bd"><div class="row"><input type="checkbox" class="ck" checked><div class="tx">Buy pumpkins</div></div><div class="row"><input type="checkbox" class="ck"><div class="tx">Call Mom</div></div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm">Add</button><button class="plus">+</button></div></div></div></div>';}
function czFonts(){var f=curFonts(),t=theme();
 function grp(key,title,sub,sample){return secHead(title,sub)+'<div class="fgrid">'+FONT_SETS[key].map(function(n){var on=f[key]===n;return '<button class="fopt'+(on?' on':'')+'" data-czf="'+key+':'+n+'" style="font-family:'+FONTS[n].f.replace(/"/g,"'")+'"><b>'+sample+'</b><small>'+esc(n)+(n===t.fonts[key]?' · theme':'')+'</small></button>';}).join('')+'</div>';}
 var si=0;SIZES.forEach(function(s,i){if(Math.abs(s[0]-(S.size||1))<.01)si=i;});
 return grp('head','Headings','titles like “Dashboard” and card tops','Kenzi’s Planner')+grp('body','Everyday text','lists, to-dos, buttons','Buy pumpkins')+grp('hand','Handwritten touches','little notes & tips','have a cozy day')+
 secHead('Text size','make everything a little smaller or bigger')+'<div class="sizer"><span style="font-size:14px">A</span><input type="range" min="0" max="'+(SIZES.length-1)+'" step="1" value="'+si+'" data-czsize><span style="font-size:24px">A</span></div><div class="sizelbl" id="sizelbl">'+SIZES[si][1]+'</div>';}
function czBg(){var b=curBg(),t=theme(),c=t.c,dark=!!t.dark,h=secHead('Cozy patterns','they match your theme colors')+'<div class="bgrid">';
 PATTERNS.forEach(function(p){var css=patternCss(p[0],c.oat,c.rust,c.caramel,dark),on=b.kind==='pattern'&&b.id===p[0];
  h+='<button class="bgt'+(on?' on':'')+'" data-czbg="pattern:'+p[0]+'"><span style="background-color:'+css.color+';background-image:'+css.img.replace(/"/g,"'")+';background-size:'+css.size+(css.pos?';background-position:'+css.pos:'')+'"></span>'+p[1]+(p[0]===t.bg.id?' <em>theme</em>':'')+'</button>';});
 h+='</div>'+secHead('Solid colors')+'<div class="swrow">'+SOLIDS.map(function(s){return '<button class="sw'+(b.kind==='solid'&&(b.color||'').toUpperCase()===s[0]?' on':'')+'" data-czbg="solid:'+s[0]+'" style="background:'+s[0]+'" title="'+s[1]+'" aria-label="'+s[1]+'"></button>';}).join('')+
  '<label class="sw any" title="Pick any color"><input type="color" data-czbgany value="'+(b.kind==='solid'&&b.color?b.color:c.oat)+'"><span>+</span></label></div>'+
  secHead('Your own photo','a favorite picture behind everything')+'<div class="bgrid photos" id="bgphotos"><button class="bgt up" data-czup="bg"><span class="upicon">📷<b>Upload a photo</b></span>From your phone or computer</button>'+
  IMGS.map(function(m){var on=b.kind==='photo'&&b.img===m.id;return '<button class="bgt'+(on?' on':'')+'" data-czbg="photo:'+m.id+'"><span class="thumb" data-imgthumb="'+m.id+'"></span>'+(on?'Using this ✓':'Use this')+'</button>';}).join('')+'</div>';
 if(b.kind==='photo'){var dm=b.dim==null?25:b.dim;h+='<div class="bgopts"><div class="czh"><b>Photo options</b></div><div class="chips2"><button class="'+(b.fit!=='tile'?'on':'')+'" data-czfit="fill">Fill the screen</button><button class="'+(b.fit==='tile'?'on':'')+'" data-czfit="tile">Repeat (tile)</button></div>'+
  '<label class="slide"><span>Blur <em id="blurv">'+(b.blur||0)+'</em></span><input type="range" min="0" max="20" step="1" value="'+(b.blur||0)+'" data-czr="blur"></label>'+
  '<label class="slide"><span>Soften so cards are easy to read <em id="dimv">'+dm+'%</em></span><input type="range" min="0" max="85" step="5" value="'+dm+'" data-czr="dim"></label></div>';}
 else h+='<label class="slide"><span>Soften the background <em id="dimv">'+(b.dim||0)+'%</em></span><input type="range" min="0" max="85" step="5" value="'+(b.dim||0)+'" data-czr="dim"></label>';
 return h+'<button class="link" data-czbg="reset" style="margin-top:6px">Use the theme’s background</button>';}
function czPhotos(){return secHead('My photos','pictures you’ve added, ready to reuse')+'<div class="upwrap" id="upwrap"><button class="btn" data-czup="photo">📷 Add a photo</button><span class="czhint" style="margin:0">Big photos are shrunk automatically.</span></div>'+
 (IMGS.length?'<div class="gal">'+IMGS.map(function(m){var u=imgUses(m.id);return '<div class="gi"><span class="thumb" data-imgthumb="'+m.id+'"></span><button class="gdel" data-czdel="'+m.id+'" title="Delete photo" aria-label="Delete photo">🗑</button><div class="gb"><button class="link" data-czbg="photo:'+m.id+'">Use as background</button></div>'+(u.length?'<em class="inuse">on '+esc(u.join(' & '))+'</em>':'')+'</div>';}).join('')+'</div>':
 '<div class="empty"><div class="e">🖼️</div><p>No photos yet.<br>Add one for a background or a photo card!</p></div>')+(imgsLoaded?'':'<p class="czhint">Checking for your photos…</p>');}
function czMenu(){var tl=tabsList();return secHead('Your menu','rename tabs, pick an icon, and move them up or down')+'<div class="mlist">'+tl.map(function(t,i){
 return '<div class="mrow" data-mid="'+t.id+'"><button class="micon" data-czicon="'+t.id+'" title="Change icon">'+tabIconHtml(t)+'</button><input class="cozy" data-czname="'+t.id+'" value="'+esc(t.name)+'" placeholder="'+esc(t.defName)+'" maxlength="28"><button class="round" data-czmv="'+t.id+':-1" aria-label="Move up"'+(i===0?' disabled':'')+'>↑</button><button class="round" data-czmv="'+t.id+':1" aria-label="Move down"'+(i===tl.length-1?' disabled':'')+'>↓</button></div>'+
  (czIconFor===t.id?'<div class="emopick"><button class="'+(!t.icon?'on':'')+'" data-czemo="'+t.id+':"><svg><use href="#'+t.svg+'"/></svg></button>'+TAB_EMOJI.map(function(e){return '<button class="'+(t.icon===e?'on':'')+'" data-czemo="'+t.id+':'+e+'">'+e+'</button>';}).join('')+'</div>':'');}).join('')+'</div>'+
 '<button class="link" data-czmenureset>Put the menu back to normal</button>';}
var czIconFor='';
function wireCz(p){
 p.addEventListener('click',function(e){var t=e.target,el;
  if((el=t.closest('[data-czsec]'))){czSec=el.getAttribute('data-czsec');czIconFor='';$('#czbody').scrollTop=0;drawCz();if((czSec==='bg'||czSec==='photos')&&!imgsLoaded)refreshImgs().then(drawCz).catch(function(){});return;}
  if((el=t.closest('[data-theme]'))){S.theme=el.getAttribute('data-theme');S.colors={side:'',strips:'',buttons:''};S.fonts={head:'',body:'',hand:''};S.bg=null;touchS();drawCz();rerenderDashLook();toast(THEMES[S.theme].name+' ✨');return;}
  if((el=t.closest('[data-czc]'))){var a=el.getAttribute('data-czc').split(':');S.colors[a[0]]=a[1]||'';touchS();drawCz();return;}
  if((el=t.closest('[data-czf]'))){var f=el.getAttribute('data-czf').split(':');S.fonts[f[0]]=f[1]===theme().fonts[f[0]]?'':f[1];touchS();drawCz();rerenderDashLook();return;}
  if((el=t.closest('[data-czbg]'))){var v=el.getAttribute('data-czbg');if(v==='reset')S.bg=null;else{var k=v.split(':');var old=S.bg||{};
    if(k[0]==='photo')S.bg={kind:'photo',img:k[1],fit:old.fit||'fill',blur:old.kind==='photo'?old.blur||0:0,dim:old.kind==='photo'&&old.dim!=null?old.dim:25};
    else if(k[0]==='solid')S.bg={kind:'solid',color:k[1],dim:0};else S.bg={kind:'pattern',id:k[1],dim:0};}
   touchS();if(czSec==='photos'){czSec='bg';}drawCz();return;}
  if((el=t.closest('[data-czfit]'))){S.bg=Object.assign({},curBg(),{fit:el.getAttribute('data-czfit')});touchS();drawCz();return;}
  if((el=t.closest('[data-czup]'))){var kind=el.getAttribute('data-czup'),host=kind==='bg'?$('#bgphotos'):$('#upwrap');
   doUpload(kind==='bg'?'bg':'photo',host,function(m){if(kind==='bg'){S.bg={kind:'photo',img:m.id,fit:'fill',blur:0,dim:25};touchS();toast('Your photo is the background now 🖼️');}else toast('Photo saved 📷');drawCz();});return;}
  if((el=t.closest('[data-czdel]'))){deleteImage(el.getAttribute('data-czdel'),drawCz);return;}
  if((el=t.closest('[data-czicon]'))){var id=el.getAttribute('data-czicon');czIconFor=czIconFor===id?'':id;drawCz();return;}
  if((el=t.closest('[data-czemo]'))){var q=el.getAttribute('data-czemo'),i=q.indexOf(':');S.tabs.icons[q.slice(0,i)]=q.slice(i+1);czIconFor='';touchS();buildNav();drawCz();return;}
  if((el=t.closest('[data-czmv]'))){var m=el.getAttribute('data-czmv').split(':'),ids=tabsList().map(function(x){return x.id;}),ix=ids.indexOf(m[0]),j=ix+(+m[1]);if(j<0||j>=ids.length)return;ids[ix]=ids[j];ids[j]=m[0];S.tabs.order=ids;touchS();buildNav();drawCz();
   var r=$('#czbody [data-mid="'+m[0]+'"]');if(r){r.classList.add('flash');setTimeout(function(){r.classList.remove('flash');},700);}return;}
  if(t.closest('[data-czmenureset]')){S.tabs={order:[],names:{},icons:{}};touchS();buildNav();render();drawCz();toast('Menu is back to normal');return;}
 });
 p.addEventListener('input',function(e){var t=e.target;
  if(t.hasAttribute('data-czany')){var k=t.getAttribute('data-czany');S.colors[k]=t.value.toUpperCase();t.parentNode.style.background=t.value;applyLookSoon();return;}
  if(t.hasAttribute('data-czbgany')){S.bg={kind:'solid',color:t.value.toUpperCase(),dim:0};applyLookSoon();return;}
  if(t.hasAttribute('data-czsize')){S.size=SIZES[+t.value][0];$('#sizelbl').textContent=SIZES[+t.value][1];applyLookSoon();return;}
  if(t.hasAttribute('data-czr')){var r=t.getAttribute('data-czr'),b=Object.assign({},curBg());b[r]=+t.value;S.bg=b;var lbl=$(r==='blur'?'#blurv':'#dimv');if(lbl)lbl.textContent=t.value+(r==='dim'?'%':'');applyLookSoon();return;}
  if(t.hasAttribute('data-czname')){S.tabs.names[t.getAttribute('data-czname')]=t.value;buildNav();$('#ptitle').textContent=tabName(cur);clearTimeout(window._czn);window._czn=setTimeout(touchS,600);return;}
 });
 p.addEventListener('change',function(e){var t=e.target;if(t.hasAttribute('data-czany')||t.hasAttribute('data-czbgany')||t.hasAttribute('data-czsize')||t.hasAttribute('data-czr')){touchS();drawCz();}});}
var _alT=null;function applyLookSoon(){if(_alT)return;_alT=requestAnimationFrame(function(){_alT=null;applyLook();});}
function rerenderDashLook(){if(cur==='dashboard'&&grid){setTimeout(function(){try{grid.onResize&&grid.onResize();}catch(e){}},300);}}

/* ---- dashboard cards: per-card style + the new photo / sticker / note cards ---- */
var DEFTITLE={week:'Weekly calendar',todo:'To-do checklist',grocery:'Grocery list',meals:'This Week’s Meals',bills:'Bills Due',brain:'Brain Dump',reminders:'Reminders',welcome:'',photo:'',sticker:'',quote:''};
var CLEAR_TYPES={welcome:1,photo:1,sticker:1,quote:1};
var FRAMES=[['polaroid','Polaroid'],['tape','Washi tape'],['round','Round'],['simple','Simple'],['stamp','Stamp']];
function wById(id){return LAYOUT.widgets.filter(function(x){return x.id===id;})[0];}
function cardHtml(w){var st=w.style||{},cls='card',css='';
 if(w.type==='brain')cls+=' stickyc';if(w.type==='welcome')cls+=' welcome';if(w.type==='photo')cls+=' photoc';if(w.type==='sticker')cls+=' stickerc';if(w.type==='quote')cls+=' quotec';
 var alpha=+st.alpha||0;
 if(st.card){css+='background-color:'+st.card+';background-color:color-mix(in srgb,'+st.card+' '+(100-alpha)+'%,transparent);';cls+=isDark(st.card)?' inklight':' inkdark';}
 else if(alpha){var base=w.type==='brain'?'var(--sticky)':'var(--paper)';css+='background-color:color-mix(in srgb,'+base+' '+(100-alpha)+'%,transparent);';}
 if(alpha)cls+=' seethru';if(st.card||alpha)cls+=' custom';
 var head;
 if(CLEAR_TYPES[w.type])head='<div class="wh drag clear"><span class="t"></span><button class="ib wst" data-wstyle="'+w.id+'" title="Change how this card looks">🎨</button><button class="ib wrm" data-wrm="'+w.id+'" title="Remove widget">✕</button></div>';
 else head=widgetHead(w);
 return '<div class="'+cls+'" data-wtype="'+w.type+'" data-wid="'+w.id+'"'+(css?' style="'+css+'"':'')+'>'+head+(stackMode&&arranging?'<div class="mv"><button class="round" data-mv="'+w.id+':-1" aria-label="Move up">↑</button><button class="round" data-mv="'+w.id+':1" aria-label="Move down">↓</button></div>':'')+
  '<div class="bd">'+widgetBody(w.type,w)+'</div>'+(['meals','bills'].indexOf(w.type)>=0?'<svg class="cup"><use href="#i-cup"/></svg>':'')+'</div>';}
function newWidgetBody(type,w){
 if(type==='photo'){if(!w.img)return '<button class="phempty" data-wphoto="'+w.id+'"><span>📷</span>Tap to add a photo</button>';
  return '<div class="phw" data-wphoto="'+w.id+'"><div class="frame f-'+esc(w.frame||'polaroid')+'"><div class="im" data-wimg="'+esc(w.img)+'"></div>'+(w.caption?'<div class="cap">'+esc(w.caption)+'</div>':'')+'</div></div>';}
 if(type==='sticker')return '<div class="stw" data-wsticker="'+w.id+'">'+stickerSvg(w.sticker||'coffee')+'</div>';
 if(type==='quote'){var tx=w.text||'',n=tx.length,fs=n<30?34:n<70?28:n<140?24:20;
  return '<div class="qw" data-wquote="'+w.id+'"><span class="qm">“</span><div class="qt" style="font-size:calc('+fs+'px * var(--ts,1))">'+(tx?esc(tx).replace(/\n/g,'<br>'):'<span class="qph">Tap to write something sweet ✍️</span>')+'</div></div>';}
 return '';}
function fillImgs(root){(root||document).querySelectorAll('[data-wimg]').forEach(function(el){var id=el.getAttribute('data-wimg');if(_imgUrl[id]){el.style.backgroundImage='url("'+_imgUrl[id]+'")';return;}
 var m=imgMeta(id);if(m&&m.thumb){el.style.backgroundImage='url("'+m.thumb+'")';el.classList.add('loading');}else el.classList.add('loading');
 getImgUrl(id).then(function(u){if(u){el.style.backgroundImage='url("'+u+'")';el.classList.remove('loading');}else{el.classList.remove('loading');el.classList.add('gone');}}).catch(function(){});});}
function redrawWidget(w){document.querySelectorAll('[gs-id="'+w.id+'"]>.grid-stack-item-content').forEach(function(el){el.innerHTML=cardHtml(w);fillImgs(el);});}

/* 🎨 per-card look */
function styleDialog(id){var w=wById(id);if(!w)return;var orig=JSON.stringify(w.style||{}),st=JSON.parse(orig),clear=!!CLEAR_TYPES[w.type],veil=document.createElement('div');veil.className='veil';
 function row(key,list,label,defLabel,defBg){var cur=st[key]||'';return '<div class="field"><span>'+label+'</span><div class="swrow"><button class="sw2 def'+(!cur?' on':'')+'" data-stc="'+key+':"><span style="background:'+defBg+'"></span>'+defLabel+'</button>'+
  list.map(function(c){return '<button class="sw'+(cur.toUpperCase()===c[0]?' on':'')+'" data-stc="'+key+':'+c[0]+'" style="background:'+c[0]+'" title="'+c[1]+'" aria-label="'+c[1]+'"></button>';}).join('')+
  '<label class="sw any" title="Pick any color"'+(cur&&!list.some(function(c){return c[0]===cur.toUpperCase();})?' style="background:'+cur+'"':'')+'><input type="color" data-stany="'+key+'" value="'+(cur||'#C98B4E')+'"><span>+</span></label></div></div>';}
 function draw(){var nm=(WDEF[w.type]||{}).name||'card';
  veil.innerHTML='<div class="dlg"><div class="dh2"><span>🎨 '+esc(nm)+'</span><button class="ib" data-x>✕</button></div><div class="db">'+
  (clear?'':'<label class="field"><span>Card name</span><input data-stname value="'+esc(st.title||'')+'" placeholder="'+esc(DEFTITLE[w.type]||nm)+'" maxlength="40"></label>')+
  (clear?'':row('hdr',ACCENTS,'Top strip color','Theme','var(--strip)'))+
  row('card',CARDCOLORS,'Card color','Theme',w.type==='brain'?'var(--sticky)':'var(--paper)')+
  '<label class="slide"><span>See-through <em id="alv">'+(st.alpha||0)+'%</em></span><input type="range" min="0" max="80" step="5" value="'+(st.alpha||0)+'" data-stalpha></label>'+
  '</div><div class="df"><button class="del" data-streset>Reset this card</button><span class="sp"></span><button class="btn soft sm" data-x>Cancel</button><button class="btn" data-ok>Save</button></div></div>';}
 function preview(){w.style=clean(st);redrawWidget(w);}
 function clean(o){var r={};Object.keys(o).forEach(function(k){if(o[k]!==''&&o[k]!=null&&o[k]!==0)r[k]=o[k];});return r;}
 draw();document.body.appendChild(veil);
 function cancel(){w.style=JSON.parse(orig);redrawWidget(w);veil.remove();}
 veil.addEventListener('click',function(e){var t=e.target,el;if(t===veil||t.closest('[data-x]'))return cancel();
  if((el=t.closest('[data-stc]'))){var a=el.getAttribute('data-stc').split(':');st[a[0]]=a[1]||'';preview();draw();return;}
  if(t.closest('[data-streset]')){st={};preview();draw();return;}
  if(t.closest('[data-ok]')){w.style=clean(st);if(!Object.keys(w.style).length)delete w.style;saveLayout();redrawWidget(w);veil.remove();toast('Card updated ✨');}});
 veil.addEventListener('input',function(e){var t=e.target;
  if(t.hasAttribute('data-stany')){st[t.getAttribute('data-stany')]=t.value.toUpperCase();t.parentNode.style.background=t.value;preview();return;}
  if(t.hasAttribute('data-stalpha')){st.alpha=+t.value;veil.querySelector('#alv').textContent=t.value+'%';preview();return;}
  if(t.hasAttribute('data-stname')){st.title=t.value;preview();}});
 veil.addEventListener('keydown',function(e){if(e.key==='Escape')cancel();});}

/* 📷 photo card */
function photoDialog(id){var w=wById(id);if(!w)return;var sel={img:w.img||'',frame:w.frame||'polaroid',caption:w.caption||''},veil=document.createElement('div');veil.className='veil';
 function draw(){veil.innerHTML='<div class="dlg wide"><div class="dh2"><span>📷 Photo card</span><button class="ib" data-x>✕</button></div><div class="db">'+
  '<div class="field"><span>Pick a photo</span><div class="gal pick" id="pgal"><button class="gi up" data-pup><span class="upicon">📷<b>Upload</b></span></button>'+
  IMGS.map(function(m){return '<button class="gi'+(sel.img===m.id?' on':'')+'" data-psel="'+m.id+'"><span class="thumb" data-imgthumb="'+m.id+'"></span></button>';}).join('')+'</div>'+(imgsLoaded?'':'<div class="czhint">Looking for your photos…</div>')+'</div>'+
  '<div class="field"><span>Frame</span><div class="chips2">'+FRAMES.map(function(f){return '<button class="'+(sel.frame===f[0]?'on':'')+'" data-pfr="'+f[0]+'">'+f[1]+'</button>';}).join('')+'</div></div>'+
  '<label class="field"><span>Caption (optional)</span><input data-pcap value="'+esc(sel.caption)+'" placeholder="our fall day 🍂" maxlength="60"></label>'+
  '</div><div class="df"><span class="sp"></span><button class="btn soft sm" data-x>Cancel</button><button class="btn" data-ok>Save</button></div></div>';
  veil.querySelectorAll('[data-imgthumb]').forEach(function(el){var m=imgMeta(el.getAttribute('data-imgthumb'));if(m&&m.thumb)el.style.backgroundImage='url("'+m.thumb+'")';});}
 draw();document.body.appendChild(veil);
 if(!imgsLoaded)refreshImgs().then(function(){if(veil.parentNode){sel.caption=(veil.querySelector('[data-pcap]')||{}).value||sel.caption;draw();}}).catch(function(){});
 veil.addEventListener('click',function(e){var t=e.target,el;if(t===veil||t.closest('[data-x]'))return veil.remove();
  if((el=t.closest('[data-psel]'))){sel.img=el.getAttribute('data-psel');sel.caption=veil.querySelector('[data-pcap]').value;draw();return;}
  if((el=t.closest('[data-pfr]'))){sel.frame=el.getAttribute('data-pfr');sel.caption=veil.querySelector('[data-pcap]').value;draw();return;}
  if(t.closest('[data-pup]')){doUpload('photo',veil.querySelector('.db'),function(m){sel.img=m.id;sel.caption=veil.querySelector('[data-pcap]').value;draw();});return;}
  if(t.closest('[data-ok]')){if(!sel.img){toast('Pick or upload a photo first 📷');return;}w.img=sel.img;w.frame=sel.frame;w.caption=veil.querySelector('[data-pcap]').value.trim();saveLayout();redrawWidget(w);veil.remove();toast('Photo card saved 📷');}});}

/* 🍂 sticker card */
function stickerDialog(id){var w=wById(id);if(!w)return;var veil=document.createElement('div');veil.className='veil';
 veil.innerHTML='<div class="dlg wide"><div class="dh2"><span>Pick a sticker</span><button class="ib" data-x>✕</button></div><div class="db"><div class="stgrid">'+STICKER_ORDER.map(function(k){return '<button class="stk'+((w.sticker||'coffee')===k?' on':'')+'" data-stk="'+k+'">'+stickerSvg(k)+'<small>'+esc(STICKERS[k][0])+'</small></button>';}).join('')+'</div></div><div class="df"><span class="sp"></span><button class="btn soft sm" data-x>Close</button></div></div>';
 document.body.appendChild(veil);
 veil.addEventListener('click',function(e){var t=e.target,el;if(t===veil||t.closest('[data-x]'))return veil.remove();if((el=t.closest('[data-stk]'))){w.sticker=el.getAttribute('data-stk');saveLayout();redrawWidget(w);veil.remove();}});}

/* ✍️ quote / note card */
function quoteDialog(id){var w=wById(id);if(!w)return;var st=w.style||{};
 form({title:'✍️ Your note',color:'var(--caramel)',values:{text:w.text||'',card:st.card||''},fields:[{k:'text',label:'Write anything – a quote, a reminder, a sweet note',t:'area',ph:'Be kind to yourself today 🍂'},{k:'card',label:'Paper color',t:'swatch',opts:[['','var(--paper)']].concat(CARDCOLORS.slice(0,10).map(function(c){return [c[0],c[0]];}))}],
  onSave:function(v){w.text=v.text;w.style=Object.assign({},w.style||{});if(v.card)w.style.card=v.card;else delete w.style.card;if(!Object.keys(w.style).length)delete w.style;saveLayout();redrawWidget(w);}});}

/* ================= Phase 3: the tabs (v2.2.0) ================= */
/* Later function declarations replace the Phase 1 versions of the same name. */

/* ---------- shared ---------- */
var TTAGS=[['','None'],['home','🏡 Home'],['school','🍎 School'],['kids','🎒 Kids'],['errands','🚗 Errands'],['me','🌸 Me'],['crafts','✂️ Crafts']];
var TTAGMAP={};TTAGS.forEach(function(t){TTAGMAP[t[0]]=t[1];});
var REPS=[['','Doesn’t repeat'],['daily','Every day'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month'],['yearly','Every year']];
var REPNAME={daily:'daily',weekly:'weekly',biweekly:'every 2 wks',monthly:'monthly',yearly:'yearly'};
function daysBetween(a,b){return Math.round((b-a)/864e5);}
function advance(ds,rep){var d=parseD(ds)||today();
 if(rep==='daily')d=addDays(d,1);else if(rep==='weekly')d=addDays(d,7);else if(rep==='biweekly')d=addDays(d,14);
 else if(rep==='monthly'){var dd=d.getDate(),n=new Date(d.getFullYear(),d.getMonth()+1,1),last=new Date(n.getFullYear(),n.getMonth()+1,0).getDate();d=new Date(n.getFullYear(),n.getMonth(),Math.min(dd,last));}
 else if(rep==='yearly')d=new Date(d.getFullYear()+1,d.getMonth(),d.getDate());return iso(d);}
function sheet(title,color,body,foot){var veil=document.createElement('div');veil.className='veil';
 veil.innerHTML='<div class="dlg wide" role="dialog"><div class="dh2" style="background:'+color+'"><span>'+esc(title)+'</span><button class="ib" data-x>✕</button></div><div class="db">'+body+'</div>'+(foot?'<div class="df">'+foot+'</div>':'')+'</div>';
 document.body.appendChild(veil);veil.addEventListener('click',function(e){if(e.target===veil||e.target.closest('[data-x]'))veil.remove();});
 veil.addEventListener('keydown',function(e){if(e.key==='Escape')veil.remove();});return veil;}
function closeSheets(){document.querySelectorAll('.veil').forEach(function(v){v.remove();});}
function progress(done,total,cls){var p=total?Math.round(done*100/total):0;return '<div class="prog '+(cls||'')+'"><i style="width:'+p+'%"></i></div>';}
function filterChips(name,cur,opts){return '<div class="fchips" data-fgroup="'+name+'">'+opts.map(function(o){return '<button class="'+(cur===o[0]?'on':'')+'" data-f="'+name+':'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join('')+'</div>';}
var DOWS={sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,weds:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
function parseWhen(text){var m=text.match(/\s+(today|tonight|tomorrow|tmrw|(?:on |by |next )?(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday))\s*$/i);
 if(!m)return {text:text,due:''};var w=m[1].toLowerCase().replace(/^(on|by|next) /,''),t=today(),d;
 if(w==='today'||w==='tonight')d=t;else if(w==='tomorrow'||w==='tmrw')d=addDays(t,1);else{var g=DOWS[w],diff=(g-t.getDay()+7)%7;d=addDays(t,diff===0?7:diff);}
 return {text:text.slice(0,m.index).trim()||text,due:iso(d)};}

/* ---------- to-dos ---------- */
var todoF=localStorage.getItem('todoF')||'all';
function todoWhenGroup(t){if(t.done)return 4;if(!t.due)return 3;var dl=daysBetween(today(),parseD(t.due));if(dl<0)return 0;if(dl===0)return 1;if(dl<=7)return 2;return 3;}
function todosSorted(){return DB.todos.slice().sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;if(!!a.star!==!!b.star&&!a.done)return a.star?-1:1;var ad=a.due||'9999',bd=b.due||'9999';if(ad!==bd)return ad<bd?-1:1;return byCreated(a,b);});}
function todoRow(t){var td=iso(today()),due='';
 if(t.due){var late=t.due<td&&!t.done;due='<span class="pill'+(late?' rust':t.due===td?' mustard':'')+'">'+(late?'late · ':'')+esc(nice(t.due))+'</span>';}
 var meta=(t.repeat?'<span class="tiny">🔁 '+esc(REPNAME[t.repeat]||t.repeat)+'</span>':'')+(t.tag&&TTAGMAP[t.tag]?'<span class="tiny">'+esc(TTAGMAP[t.tag])+'</span>':'')+(t.remind&&!t.done?'<span class="tiny">🔔</span>':'')+(t.note?'<span class="tiny">📝</span>':'');
 return '<div class="row'+(t.done?' done':'')+(t.star&&!t.done?' starred':'')+'"><input type="checkbox" class="ck" data-tog="todos:'+t.id+':done"'+(t.done?' checked':'')+'><button class="star'+(t.star?' on':'')+'" data-star="'+t.id+'" aria-label="Important">'+(t.star?'★':'☆')+'</button><div class="tx" data-edit="todos:'+t.id+'">'+esc(t.text)+(meta?'<div class="meta2">'+meta+'</div>':'')+'</div>'+due+'<button class="x" data-rm="todos:'+t.id+'" aria-label="Remove">✕</button></div>';}
function editTodo(t){t=t||{};form({title:t.id?'Edit to-do':'New to-do',color:'var(--rust)',required:'text',values:Object.assign({},t,{star:t.star?'1':''}),fields:[
 {k:'text',label:'To-do',ph:'Rake leaves'},{k:'due',label:'Due date (optional)',t:'date'},
 {k:'star',label:'Important?',t:'chips',opts:[['','Regular'],['1','⭐ Important']]},
 {k:'tag',label:'Category',t:'chips',opts:TTAGS},
 {k:'repeat',label:'Repeat',t:'select',opts:REPS},
 {k:'remind',label:'🔔 Remind me',t:'select',opts:REM_DAY},
 {k:'note',label:'Notes',t:'area',ph:'Details, phone number…'}],
 onSave:function(v){if((v.repeat||v.remind)&&!v.due)v.due=iso(today());save('todos',Object.assign({},t,{text:v.text,due:v.due,star:!!v.star,tag:v.tag,repeat:v.repeat,remind:v.remind,note:v.note,done:!!t.done}));if(v.remind!==(t.remind||''))remNudge(v);},
 onDelete:t.id?function(){remove('todos',t.id);}:null});}
function todoMatches(t){var td=iso(today());
 if(todoF==='all')return true;if(todoF==='today')return !t.done&&t.due&&t.due<=td;
 if(todoF==='week')return !t.done&&t.due&&t.due<=iso(addDays(today(),7));if(todoF==='star')return !!t.star&&!t.done;
 return t.tag===todoF;}
function todoListHtml(){var all=todosSorted(),list=all.filter(todoMatches),GN=['⚠️ Overdue','☀️ Today','📅 This week','🌿 Later','✓ Done'],h='',last=-1;
 if(!list.length)return empty('🍂',todoF==='all'?'All clear! Add something<br>when it pops into your head.':'Nothing here right now.');
 list.forEach(function(t){var g=todoWhenGroup(t);if(g!==last){h+='<div class="ghead'+(g===0?' late':'')+'">'+GN[g]+'</div>';last=g;}h+=todoRow(t);});return h;}
function todoPage(){var t=DB.todos,done=t.filter(function(x){return x.done;}).length,open=t.length-done,td=iso(today()),
 late=t.filter(function(x){return !x.done&&x.due&&x.due<td;}).length,
 tagsUsed=TTAGS.filter(function(g){return g[0]&&t.some(function(x){return x.tag===g[0];});});
 var left='<div class="card"><div class="wh rust"><span class="t">To-do list</span><button class="ib" data-new="todo" title="Add with details">+</button></div><div class="bd">'+
 '<div class="minis"><span class="pill">'+open+' to do</span>'+(late?'<span class="pill rust">'+late+' late</span>':'')+(done?'<span class="pill olive">'+done+' done 🎉</span>':'')+'</div>'+
 addLine('todos',isPhone()?'add a to-do…':'add a to-do… try “call dentist tomorrow”')+
 filterChips('todo',todoF,[['all','All'],['today','Today'],['week','This week'],['star','⭐ Important']].concat(tagsUsed))+
 '<div style="margin-top:4px">'+todoListHtml()+'</div>'+
 (done?'<div class="toolbar"><button class="link" data-clear="todos">Clear finished</button></div>':'')+'</div></div>';
 return '<div class="cols c2">'+left+'<div class="card"><div class="wh mustard"><span class="t">Calendar</span><button class="ib" data-new="event" title="New event">+</button></div><div class="bd">'+calendar()+'</div></div></div>';}

/* ---------- calendar ---------- */
var calOverlay=localStorage.getItem('calOv')!=='0';
if(!localStorage.getItem('calMode')&&window.innerWidth<=760)calMode='list';
function occursOn(e,ds){if(!e.date)return false;if(e.date===ds||(e.endDate&&!e.repeat&&ds>e.date&&ds<=e.endDate))return true;var r=e.repeat;if(!r||ds<e.date)return false;if(e.until&&ds>e.until)return false;
 var a=parseD(e.date),b=parseD(ds),diff=daysBetween(a,b);
 if(r==='daily')return true;if(r==='weekly')return diff%7===0;if(r==='biweekly')return diff%14===0;
 if(r==='monthly'){var last=new Date(b.getFullYear(),b.getMonth()+1,0).getDate();return b.getDate()===Math.min(a.getDate(),last);}
 if(r==='yearly')return a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();return false;}
function plannerEventsOn(ds){return DB.events.filter(function(e){return occursOn(e,ds)&&!(e.skip&&e.skip.indexOf(ds)>=0);}).sort(function(a,b){return (a.time||'99')<(b.time||'99')?-1:1;});}
function extrasOn(ds){var out=[];if(!calOverlay)return out;
 DB.bills.forEach(function(b){var n=billNext(b);if(n&&iso(n)===ds&&!billPaid(b))out.push({k:'bill',id:b.id,t:'💌 '+b.name+(b.amount?' '+money(b.amount):'')});});
 DB.kids.forEach(function(k){if(k.date===ds&&!k.done)out.push({k:'kid',id:k.id,t:(KEMO[k.type]||'🎒')+' '+(k.kid==='Both'?'':k.kid+': ')+k.title});});
 DB.todos.forEach(function(t){if(t.due===ds&&!t.done&&t.star)out.push({k:'todo',id:t.id,t:'⭐ '+t.text});});return out;}
function xchip(x){return '<span class="chip ghost '+x.k+'" data-xc="'+x.k+':'+x.id+'" title="'+esc(x.t)+'">'+esc(x.t)+'</span>';}
function chipBase(e,short){return '<span class="chip '+esc(e.color||'oat')+'" data-ev="'+e.id+'" title="'+esc(e.title)+'">'+(e.time&&!short?'<span class="tm">'+fmtTime(e.time)+'</span>':'')+(e.repeat&&!short?'🔁 ':'')+(e.remind&&!short?'🔔 ':'')+esc(e.title)+'</span>';}
function segHtml(){return '<span class="seg"><button data-cm="month" class="'+(calMode==='month'?'on':'')+'">Month</button><button data-cm="week" class="'+(calMode==='week'?'on':'')+'">Week</button><button data-cm="list" class="'+(calMode==='list'?'on':'')+'">List</button></span>';}
function calendar(){var t=today(),td=iso(t),h='';
 var tools='<div class="caltools"><button class="link" data-cal="today">Today</button>'+gcTools()+'<label class="tgl"><input type="checkbox" data-cal="ov"'+(calOverlay?' checked':'')+'> show bills &amp; school</label></div>';
 if(calMode==='month'){var base=new Date(t.getFullYear(),t.getMonth()+calOff,1),start=monday(base);gcEnsure(iso(start),iso(addDays(start,41)));
  h+='<div class="calhead"><button class="round" data-co="-1" aria-label="Previous">‹</button><b>'+MN[base.getMonth()]+' '+base.getFullYear()+'</b><button class="round" data-co="1" aria-label="Next">›</button>'+segHtml()+'</div>'+tools+'<div class="month">';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d){h+='<div class="wd">'+d+'</div>';});
  for(var i=0;i<42;i++){var d=addDays(start,i),ds=iso(d),ev=eventsOn(ds),xs=extrasOn(ds),all=ev.length+xs.length;if(i===35&&d.getMonth()!==base.getMonth())break;
   h+='<div class="d'+(d.getMonth()!==base.getMonth()?' o':'')+(ds===td?' today':'')+'" data-day="'+ds+'"><span class="n">'+d.getDate()+'</span>'+ev.slice(0,3).map(function(e){return chip(e,true);}).join('')+xs.slice(0,Math.max(0,3-ev.length)).map(xchip).join('')+(all>3?'<span class="more">+'+(all-3)+' more</span>':'')+(xs.length&&ev.length>=3?'<i class="dotx"></i>':'')+'</div>';}
  h+='</div>';}
 else if(calMode==='week'){var m=addDays(monday(t),calOff*7),e6=addDays(m,6);gcEnsure(iso(m),iso(e6));
  h+='<div class="calhead"><button class="round" data-co="-1" aria-label="Previous">‹</button><b>'+MN[m.getMonth()].slice(0,3)+' '+m.getDate()+' – '+MN[e6.getMonth()].slice(0,3)+' '+e6.getDate()+'</b><button class="round" data-co="1" aria-label="Next">›</button>'+segHtml()+'</div>'+tools+'<div class="wkview">';
  for(var j=0;j<7;j++){var dd=addDays(m,j),s=iso(dd);h+='<div class="d'+(s===td?' today':'')+'" data-day="'+s+'"><div class="dh">'+DN[dd.getDay()]+'<small>'+dd.getDate()+'</small></div>'+eventsOn(s).map(function(e){return chip(e);}).join('')+extrasOn(s).map(xchip).join('')+'</div>';}
  h+='</div>';}
 else{var st=addDays(t,calOff*30),any=false;gcEnsure(iso(st),iso(addDays(st,30)));
  h+='<div class="calhead"><button class="round" data-co="-1" aria-label="Earlier">‹</button><b>'+(calOff===0?'Next 30 days':MN[st.getMonth()].slice(0,3)+' '+st.getDate()+' onward')+'</b><button class="round" data-co="1" aria-label="Later">›</button>'+segHtml()+'</div>'+tools+'<div class="agenda">';
  for(var k=0;k<30;k++){var ad=addDays(st,k),as=iso(ad),evs=eventsOn(as),xx=extrasOn(as);if(!evs.length&&!xx.length)continue;any=true;
   h+='<div class="aday'+(as===td?' today':'')+'"><div class="adate" data-day="'+as+'"><b>'+ad.getDate()+'</b><span>'+DN[ad.getDay()]+'</span></div><div class="aitems">'+
   evs.map(function(e){return '<div class="aev '+esc(e.color||'oat')+'" data-ev="'+e.id+'"><span class="atm">'+(e.time?fmtTime(e.time)+(e.end?'–'+fmtTime(e.end):''):'all day')+'</span>'+esc(e.title)+(e.repeat?' <small>🔁</small>':'')+gBadge(e)+'</div>';}).join('')+
   xx.map(function(x){return '<div class="aev ghost" data-xc="'+x.k+':'+x.id+'">'+esc(x.t)+'</div>';}).join('')+'</div></div>';}
  if(!any)h+=empty('🗓️','Nothing planned yet.<br>Tap + to add an event.');h+='</div>';}
 return h+'<div class="hand" style="margin-top:8px">tap a day to see everything & add an event</div>';}
function editEvent(e,date){e=e||{date:date||iso(today()),color:'mustard'};form({title:e.id?'Edit event':'New event',color:'var(--mustard)',required:'title',values:e,
 fields:[{k:'title',label:'What’s happening?',ph:'Soccer practice'},{k:'date',label:e.repeat?'Starts on':'Date',t:'date'},{k:'time',label:'Start time (optional)',t:'time'},{k:'end',label:'End time (optional)',t:'time'},
  {k:'repeat',label:'Repeat',t:'select',opts:REPS},{k:'until',label:'Repeat until (optional)',t:'date'},{k:'remind',label:'🔔 Remind me',t:'select',opts:REM_EVT},
  {k:'color',label:'Color',t:'swatch'},{k:'note',label:'Notes',t:'area',ph:'Bring snacks'}],
 onSave:function(v){if(!v.date)v.date=iso(today());if(!v.repeat)v.until='';var was=e.remind||'';save('events',Object.assign({},e,v));if(v.remind!==was)remNudge(v);},onDelete:e.id?function(){remove('events',e.id);}:null});}
function dayDialog(ds){var d=parseD(ds),ev=eventsOn(ds),me=mealFor(ds),td=DB.todos.filter(function(t){return t.due===ds;}),
 bl=DB.bills.filter(function(b){var n=billNext(b);return n&&iso(n)===ds;}),kd=DB.kids.filter(function(k){return k.date===ds;}),b='';
 function sec(title,inner){return inner?'<div class="dsec"><div class="ghead">'+title+'</div>'+inner+'</div>':'';}
 b+=sec('📅 Events',ev.map(function(e){return '<div class="row"><span class="dotc '+esc(e.color||'oat')+'"></span><div class="tx" data-ev="'+e.id+'">'+(e.time?'<b>'+fmtTime(e.time)+(e.end?'–'+fmtTime(e.end):'')+'</b> ':'')+esc(e.title)+gBadge(e)+(e.repeat?' <span class="tiny">🔁 '+esc(REPNAME[e.repeat]||'')+'</span>':'')+(e.note?'<div class="meta" style="white-space:normal">'+esc(e.note)+'</div>':'')+'</div>'+(e.repeat&&e.date!==ds?'<button class="link" data-skip="'+e.id+':'+ds+'">skip this day</button>':'')+'</div>';}).join(''));
 b+=sec('✅ To-dos due',td.map(todoRow).join(''));
 b+=sec('💌 Bills due',bl.map(function(x){return '<div class="row"><div class="tx" data-edit="bills:'+x.id+'">'+esc(x.name)+' <b>'+esc(money(x.amount))+'</b></div><button class="paid'+(billPaid(x)?' on':'')+'" data-paid="'+x.id+'">'+(billPaid(x)?'✓ Paid':'Mark paid')+'</button></div>';}).join(''));
 b+=sec('🎒 Kids & school',kd.map(function(k){return '<div class="row'+(k.done?' done':'')+'"><input type="checkbox" class="ck" data-tog="kids:'+k.id+':done"'+(k.done?' checked':'')+'><div class="tx" data-edit="kids:'+k.id+'">'+(KEMO[k.type]||'')+' '+esc(k.kid==='Both'?'Both':k.kid)+': '+esc(k.title)+'</div></div>';}).join(''));
 b+=sec('🍲 Dinner',me&&me.dinner?'<div class="row"><div class="tx">'+esc(me.dinner)+(me.made?' ✓':'')+'</div></div>':'');
 if(!b)b=empty('☕','Nothing on this day yet.');
 var v=sheet(DNL[d.getDay()]+', '+MN[d.getMonth()]+' '+d.getDate(),'var(--mustard)','<div data-dayds="'+ds+'">'+b+'</div>','<button class="btn soft sm" data-daytodo="'+ds+'">+ To-do</button><span class="sp"></span><button class="btn" data-dayev="'+ds+'">+ Add event</button>');
 return v;}
function refreshDay(){var w=document.querySelector('[data-dayds]');if(!w)return;var ds=w.getAttribute('data-dayds');closeSheets();dayDialog(ds);}

/* ---------- groceries ---------- */
var AISLES=[['produce','🥦 Produce'],['dairy','🥛 Dairy & eggs'],['meat','🍗 Meat & fish'],['bakery','🍞 Bakery & bread'],['pantry','🥫 Pantry'],['frozen','🧊 Frozen'],['snacks','🍪 Snacks & drinks'],['house','🧻 Household'],['care','🧴 Personal care'],['kids','🧸 Baby & kids'],['other','🛒 Other']];
var AISLEMAP={};AISLES.forEach(function(a){AISLEMAP[a[0]]=a[1];});
var AISLEKW={produce:'apple banana orange grape berr strawberr blueberr lemon lime avocado tomato potato onion garlic lettuce salad spinach carrot celery broccoli pepper cucumber corn mushroom fruit veg cilantro herb squash pumpkin zucchini kale cabbage peach pear melon pineapple',
 dairy:'milk egg cheese butter yogurt yoghurt cream sour creamer cottage half',
 meat:'chicken beef pork turkey ham bacon sausage steak ground fish salmon tuna shrimp hot dog meat roast',
 bakery:'bread bun roll bagel tortilla muffin cake pie croissant',
 pantry:'rice pasta noodle flour sugar salt oil vinegar sauce soup bean can cereal oat peanut jelly jam honey spice seasoning broth stock syrup ketchup mustard mayo coffee tea baking mix',
 frozen:'frozen ice pizza waffle nugget fries tater popsicle',
 snacks:'chip cracker cookie snack candy soda juice water pop gatorade goldfish pretzel popcorn bar drink',
 house:'paper towel toilet trash bag detergent soap dish foil wrap napkin clean bleach sponge battery batteries laundry dryer',
 care:'shampoo conditioner toothpaste toothbrush deodorant lotion razor tampon pad floss vitamin medicine tylenol advil band',
 kids:'diaper wipe formula pull-up pullup baby'};
function guessAisle(item){var s=' '+String(item||'').toLowerCase()+' ',best='';
 Object.keys(AISLEKW).forEach(function(k){if(best)return;AISLEKW[k].split(' ').some(function(w){if(w&&s.indexOf(w)>=0){best=k;return true;}return false;});});return best||'other';}
function groceryRow(g){return '<div class="row'+(g.got?' done':'')+'"><input type="checkbox" class="ck mustard" data-tog="groceries:'+g.id+':got"'+(g.got?' checked':'')+'><div class="tx" data-edit="groceries:'+g.id+'">'+esc(g.item)+(g.note?'<div class="meta2"><span class="tiny">'+esc(g.note)+'</span></div>':'')+'</div>'+(g.gf?'<span class="pill olive">GF</span>':'')+(g.qty&&g.qty!=='1'?'<span class="pill mustard">×'+esc(g.qty)+'</span>':'')+'<button class="x" data-rm="groceries:'+g.id+'" aria-label="Remove">✕</button></div>';}
function grocSorted(){return DB.groceries.slice().sort(function(a,b){if(!!a.got!==!!b.got)return a.got?1:-1;return byCreated(a,b);});}
function groceryGrouped(){var g=grocSorted(),open=g.filter(function(x){return !x.got;}),got=g.filter(function(x){return x.got;}),h='';
 AISLES.forEach(function(a){var items=open.filter(function(x){return (x.aisle||guessAisle(x.item))===a[0];});if(items.length)h+='<div class="ghead">'+a[1]+'</div>'+items.map(groceryRow).join('');});
 if(got.length)h+='<div class="ghead">✓ In the cart</div>'+got.map(groceryRow).join('');return h;}
function editGrocery(g){form({title:'Edit grocery item',color:'var(--mustard)',required:'item',values:Object.assign({},g,{aisle:g.aisle||guessAisle(g.item),gf:g.gf?'1':''}),fields:[{k:'item',label:'Item'},{k:'qty',label:'How many?',ph:'1'},
 {k:'aisle',label:'Aisle',t:'select',opts:AISLES},{k:'gf',label:'Gluten-free?',t:'chips',opts:[['','Any'],['1','GF only']]},{k:'note',label:'Note (brand, size…)'}],
 onSave:function(v){v.gf=!!v.gf;save('groceries',Object.assign({},g,v));},onDelete:function(){remove('groceries',g.id);}});}
function addGrocery(text,extra){text=String(text||'').trim();if(!text)return;var q='1',m=text.match(/^(\d+)\s*x?\s+(.+)$/i)||null,m2=text.match(/^(.+?)\s+x\s*(\d+)$/i);
 if(m){q=m[1];text=m[2];}else if(m2){text=m2[1];q=m2[2];}
 var dup=DB.groceries.filter(function(x){return !x.got&&x.item.toLowerCase()===text.toLowerCase();})[0];if(dup&&!extra)return save('groceries',Object.assign({},dup,{qty:String((parseInt(dup.qty,10)||1)+(parseInt(q,10)||1))}));
 if(dup)return dup;return save('groceries',Object.assign({item:text,qty:q,got:false,aisle:guessAisle(text)},extra||{}));}
function quickAdd(col,text,el){text=text.trim();if(!text)return;
 if(col==='todos'){var p=parseWhen(text);save('todos',{text:p.text,done:false,due:p.due});if(p.due)toast('Added for '+nice(p.due));}
 else if(col==='groceries')addGrocery(text);
 else if(col==='brain')save('brain',{text:text,done:false,color:NOTE_COLORS[DB.brain.length%NOTE_COLORS.length]});
 else if(col==='kids'){save('kids',{kid:el.getAttribute('data-kid')||'Weston',title:text,type:'note',done:false,date:''});}
 else if(col==='listitem'){var l=find('lists',el.getAttribute('data-list'));if(!l)return;var L=JSON.parse(JSON.stringify(l));L.items=L.items||[];L.items.push({id:uid(),text:text,done:false});save('lists',L);}
 else if(col==='idea'){var I=ideasDoc();I.items.push({id:uid(),text:text,ingr:'',gf:false});save('lists',I);}
}

/* ---------- meals & meal ideas ---------- */
function ideasDoc(){var d=find('lists','meal-ideas');return d?JSON.parse(JSON.stringify(d)):{id:'meal-ideas',kind:'meals',name:'Meal ideas',emoji:'🍲',color:'oat',items:[]};}
function ideaByName(n){n=String(n||'').trim().toLowerCase();if(!n)return null;return (ideasDoc().items||[]).filter(function(x){return x.text.toLowerCase()===n;})[0]||null;}
function ingrList(s){return String(s||'').split(/\n|,/).map(function(x){return x.trim();}).filter(Boolean);}
function addIngredients(idea){var n=0,gf=!!idea.gf;ingrList(idea.ingr).forEach(function(x){var had=DB.groceries.some(function(g){return !g.got&&g.item.toLowerCase()===x.toLowerCase();});if(!had){addGrocery(x,{gf:false});n++;}});
 toast(n?n+' ingredient'+(n===1?'':'s')+' added to groceries 🛒':'Everything’s already on your list');}
function setDinner(ds,text){var me=mealFor(ds);if(!text){if(me)remove('meals',me.id,true);return;}save('meals',Object.assign({id:'d'+ds.replace(/-/g,''),date:ds,made:false},me||{},{dinner:text}));}
function editIdea(it){var I=ideasDoc();it=it||{};form({title:it.id?'Edit meal idea':'New meal idea',color:'var(--caramel)',required:'text',values:Object.assign({},it,{gf:it.gf?'1':''}),fields:[
 {k:'text',label:'Meal',ph:'Crockpot chili'},{k:'ingr',label:'Ingredients (one per line)',t:'area',ph:'ground beef\nbeans\nchili seasoning'},
 {k:'gf',label:'Gluten-free?',t:'chips',opts:[['','Not marked'],['1','🌾 GF friendly']]},{k:'link',label:'Recipe link (optional)',ph:'https://…'}],
 onSave:function(v){v.gf=!!v.gf;if(it.id)I.items=I.items.map(function(x){return x.id===it.id?Object.assign({},x,v):x;});else I.items.push(Object.assign({id:uid()},v));save('lists',I);},
 onDelete:it.id?function(){var old=find('lists','meal-ideas');I.items=I.items.filter(function(x){return x.id!==it.id;});save('lists',I);toast('Removed',function(){save('lists',old);});}:null});}
function planIdea(it){var opts=[],m=monday(today());for(var i=0;i<14;i++){var d=addDays(m,i),ds=iso(d);if(ds<iso(today()))continue;var me=mealFor(ds);opts.push([ds,(i<7?'':'Next ')+DNL[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate()+(me&&me.dinner?' (has '+me.dinner+')':'')]);}
 form({title:'Plan “'+it.text+'”',color:'var(--caramel)',ok:'Plan it',values:{day:opts[0][0],ing:ingrList(it.ingr).length?'1':''},fields:[{k:'day',label:'Which night?',t:'select',opts:opts},{k:'ing',label:'Groceries',t:'chips',opts:[['1','🛒 Add ingredients'],['','Skip']]}],
 onSave:function(v){setDinner(v.day,it.text);if(v.ing)addIngredients(it);else toast('Planned for '+nice(v.day)+' 🍲');}});}
function pickIdea(ds){var I=ideasDoc().items||[];if(!I.length){toast('Add a few meal ideas first 💡');return;}
 var d=parseD(ds),v=sheet('Dinner for '+DNL[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate(),'var(--caramel)','<div class="ideapick">'+I.map(function(x){return '<button class="ideab" data-pickidea="'+ds+':'+x.id+'">'+esc(x.text)+(x.gf?' <span class="pill olive">GF</span>':'')+'</button>';}).join('')+'</div>');return v;}
var mealWeek=0;
function mealsPage(){var m=addDays(monday(today()),mealWeek*7),td=iso(today()),rows='';
 for(var i=0;i<7;i++){var d=addDays(m,i),ds=iso(d),me=mealFor(ds)||{},idea=ideaByName(me.dinner);
  rows+='<div class="dayrow'+(ds===td?' today':'')+'"><div class="dn">'+DN[d.getDay()]+'<small>'+MN[d.getMonth()].slice(0,3)+' '+d.getDate()+'</small></div><input class="din" data-din="'+ds+'" value="'+esc(me.dinner||'')+'" placeholder="what’s for dinner?" autocomplete="off" enterkeyhint="done" list="ideaopts">'+
  (idea&&ingrList(idea.ingr).length?'<button class="ib2" data-ingr="'+idea.id+'" title="Add ingredients to groceries">🛒</button>':'<button class="ib2" data-pickday="'+ds+'" title="Pick from meal ideas">💡</button>')+
  '<input type="checkbox" class="ck olive" title="Made it!" data-made="'+ds+'"'+(me.made?' checked':'')+(me.dinner?'':' disabled style="opacity:.35"')+'></div>';}
 var g=DB.groceries,got=g.filter(function(x){return x.got;}).length,I=ideasDoc().items||[];
 var dl='<datalist id="ideaopts">'+I.map(function(x){return '<option value="'+esc(x.text)+'">';}).join('')+'</datalist>';
 return '<div class="cols">'+
 '<div class="card"><div class="wh oat"><span class="t">Dinner plan</span></div><div class="bd"><div class="hand">type a meal, or tap 💡 to pick an idea</div><div class="weeknav"><button class="round" data-mw="-1" aria-label="Previous week">‹</button><b>'+(mealWeek===0?'This week':mealWeek===1?'Next week':mealWeek===-1?'Last week':'Week of '+MN[m.getMonth()].slice(0,3)+' '+m.getDate())+'</b><button class="round" data-mw="1" aria-label="Next week">›</button></div>'+rows+dl+
 '<div class="toolbar"><button class="link" data-mealcopy="'+iso(m)+'">Copy last week</button><button class="link" data-mealclear="'+iso(m)+'">Clear week</button></div></div></div>'+
 '<div class="card"><div class="wh mustard"><span class="t">Grocery list</span></div><div class="bd">'+addLine('groceries','add an item… “2 milk” works','mustard')+'<div style="margin-top:6px">'+(g.length?groceryGrouped():empty('🧺','Your list is empty.<br>Add milk, eggs, coffee beans…'))+'</div>'+
 (got?'<div class="toolbar"><span class="pill">'+got+' in the cart</span><button class="link" data-clear="groceries">Clear checked items</button></div>':'')+'</div></div>'+
 '<div class="card"><div class="wh caramel"><span class="t">Meal ideas</span><button class="ib" data-newidea title="Add with ingredients">+</button></div><div class="bd"><div class="hand">your go-to dinners · tap one to plan it</div>'+
 (I.length?I.map(function(x){var n=ingrList(x.ingr).length;return '<div class="row"><div class="tx" data-planidea="'+x.id+'">'+esc(x.text)+'<div class="meta2">'+(n?'<span class="tiny">🛒 '+n+' ingredient'+(n===1?'':'s')+'</span>':'<span class="tiny">no ingredients yet</span>')+(x.link?'<span class="tiny">🔗 recipe</span>':'')+'</div></div>'+(x.gf?'<span class="pill olive">GF</span>':'')+'<button class="ib2" data-editidea="'+x.id+'" title="Edit">✎</button></div>';}).join(''):empty('💡','Save the dinners you make<br>again and again.'))+
 addLine('idea','add a meal idea…')+'</div></div></div>';}

/* ---------- lists ---------- */
var LTPL=[['','✨ Blank'],['pack','🧳 Packing'],['gifts','🎁 Christmas gifts'],['cricut','✂️ Cricut project'],['clean','🧽 Cleaning'],['party','🎉 Party']];
var LTPLITEMS={pack:['Pajamas','Toothbrushes','Phone chargers','Snacks for the car','Medicine','Extra socks'],gifts:['Blake','Weston','Holden','Teachers','Stocking stuffers'],
 cricut:['Pick design','Buy vinyl / blanks','Cut & weed','Press or apply','Photo for Facebook'],clean:['Dishes','Laundry','Wipe counters','Vacuum','Bathrooms','Take out trash'],party:['Guest list','Invites','Food','Decorations','Cake','Party favors']};
var LTPLEMO={pack:'🧳',gifts:'🎁',cricut:'✂️',clean:'🧺',party:'🎄'};
function editList(l){var isNew=!l;l=l||{emoji:'📝',color:'caramel',items:[]};var fields=[{k:'name',label:'List name',ph:'Cricut projects'}];
 if(isNew)fields.push({k:'tpl',label:'Start from',t:'chips',opts:LTPL});
 fields.push({k:'emoji',label:'Little icon',t:'chips',opts:[['📝','📝'],['✂️','✂️'],['🎄','🎄'],['🏡','🏡'],['🎁','🎁'],['📚','📚'],['🧺','🧺'],['✨','✨'],['🧳','🧳'],['🎉','🎉']]},{k:'color',label:'Color',t:'swatch'},{k:'note',label:'Notes (optional)',t:'area'});
 form({title:isNew?'New list':'Edit list',color:'var(--caramel)',required:'name',values:Object.assign({tpl:''},l),fields:fields,
 onSave:function(v){var items=l.items||[];if(isNew&&v.tpl){items=LTPLITEMS[v.tpl].map(function(t){return {id:uid(),text:t,done:false};});if(v.emoji==='📝'&&LTPLEMO[v.tpl])v.emoji=LTPLEMO[v.tpl];}delete v.tpl;save('lists',Object.assign({},l,v,{items:items}));},
 onDelete:!isNew?function(){remove('lists',l.id);}:null,
 extra:!isNew});}
function listsPage(){var ls=DB.lists.filter(function(l){return !l.kind;}).sort(function(a,b){return (a.order!=null?a.order:a.created||0)-(b.order!=null?b.order:b.created||0);});
 return '<div class="listgrid">'+ls.map(function(l,li){var items=l.items||[],done=items.filter(function(x){return x.done;}).length,open=items.filter(function(x){return !x.done;}),fin=items.filter(function(x){return x.done;});
  function itemRow(it){var idx=items.indexOf(it);return '<div class="row'+(it.done?' done':'')+'"><input type="checkbox" class="ck" data-li="'+l.id+':'+it.id+'"'+(it.done?' checked':'')+'><div class="tx" data-lie="'+l.id+':'+it.id+'">'+esc(it.text)+'</div>'+(!it.done&&idx>0?'<button class="x up" data-liup="'+l.id+':'+it.id+'" aria-label="Move up" title="Move up">↑</button>':'')+'<button class="x" data-lirm="'+l.id+':'+it.id+'" aria-label="Remove">✕</button></div>';}
  return '<div class="card"><div class="wh '+esc(l.color||'caramel')+'"><span class="t">'+esc(l.emoji||'📝')+' '+esc(l.name)+'</span>'+(li>0?'<button class="ib" data-lmove="'+l.id+':-1" title="Move list left">‹</button>':'')+'<button class="ib" data-ldup="'+l.id+'" title="Make a copy">⧉</button><button class="ib" data-editlist="'+l.id+'" title="Rename or delete">✎</button></div><div class="bd">'+
  (items.length?'<div class="minis"><span class="pill'+(done===items.length?' olive':'')+'">'+done+' of '+items.length+' done'+(done===items.length?' 🎉':'')+'</span></div>'+progress(done,items.length):'')+
  (l.note?'<div class="lnote">'+esc(l.note)+'</div>':'')+
  (items.length?open.map(itemRow).join('')+fin.map(itemRow).join(''):empty('✂️','Nothing here yet.'))+
  addLine('listitem','add to this list…','',' data-list="'+l.id+'"')+(done?'<div class="toolbar"><button class="link" data-liuncheck="'+l.id+'">Uncheck all</button><button class="link" data-liclear="'+l.id+'">Clear done</button></div>':'')+'</div></div>';}).join('')+
 '<div class="newlist" data-new="list"><div><div class="p">+</div>start a new list<br><small>packing, gifts, Cricut & more</small></div></div></div>';}

/* ---------- brain dump ---------- */
var brainQ='',brainC='';
function brainSorted(){return DB.brain.slice().sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;if(!!a.pin!==!!b.pin)return a.pin?-1:1;return (b.created||0)-(a.created||0);});}
function editBrain(n){var isNew=!n;n=n||{color:NOTE_COLORS[Math.floor(Math.random()*NOTE_COLORS.length)]};var fields=[{k:'text',label:'Your thought',t:'area',ph:'Idea for costume…'},{k:'color',label:'Note color',t:'swatch',opts:NOTE_COLORS.map(function(c){return [c,NOTE_HEX[c]];})},{k:'pin',label:'Pin to the top?',t:'chips',opts:[['','No'],['1','📌 Pin it']]}];
 if(!isNew)fields.push({k:'move',label:'Turn it into…',t:'chips',opts:[['','Keep as a note'],['todo','✅ To-do'],['grocery','🛒 Grocery'],['event','📅 Event'],['kid','🎒 Kids & school'],['idea','🍲 Meal idea']]});
 form({title:isNew?'New note':'Edit note',color:'#C9A23A',required:'text',values:Object.assign({},n,{pin:n.pin?'1':'',move:''}),fields:fields,
 onSave:function(v){var mv=v.move;delete v.move;v.pin=!!v.pin;if(!mv){save('brain',Object.assign({},n,v));return;}convertNote(Object.assign({},n,v),mv);},onDelete:!isNew?function(){remove('brain',n.id);}:null});}
function convertNote(n,mv){var old=find('brain',n.id),txt=n.text.split('\n')[0].trim(),made=null;
 if(mv==='todo'){var p=parseWhen(txt);made=['todos',save('todos',{text:p.text,due:p.due,done:false,note:n.text.indexOf('\n')>0?n.text:''})];}
 else if(mv==='grocery'){var items=n.text.split(/\n|,/).map(function(x){return x.trim();}).filter(Boolean);items.forEach(function(x){addGrocery(x);});remove('brain',n.id,true);toast(items.length+' added to groceries 🛒',function(){save('brain',old);});return;}
 else if(mv==='kid')made=['kids',save('kids',{kid:'Both',title:txt,type:'note',done:false,date:'',note:n.text.indexOf('\n')>0?n.text:''})];
 else if(mv==='idea'){var I=ideasDoc();I.items.push({id:uid(),text:txt,ingr:n.text.split('\n').slice(1).join('\n'),gf:false});save('lists',I);made=['lists',null];}
 else if(mv==='event'){remove('brain',n.id,true);editEvent({title:txt,date:iso(today()),color:'mustard',note:n.text.indexOf('\n')>0?n.text:''});return;}
 remove('brain',n.id,true);var lbl={todo:'to-do',kid:'Kids & School',idea:'meal ideas'}[mv];
 toast('Moved to '+lbl+' ✨',function(){save('brain',old);if(made&&made[1])remove(made[0],made[1].id,true);});}
function notesHtml(){var q=brainQ.toLowerCase(),n=brainSorted().filter(function(x){return (!q||String(x.text).toLowerCase().indexOf(q)>=0)&&(!brainC||x.color===brainC);});
 if(!n.length)return '<div class="card"><div class="bd">'+empty('💡',DB.brain.length?'No notes match.':'Your brain dump is empty.<br>Ideas, worries, “don’t forget”s – toss them here.')+'</div></div>';
 return '<div class="notes">'+n.map(function(x){return '<div class="note c-'+esc(x.color||'yellow')+(x.done?' done':'')+(x.pin?' pinned':'')+'" data-edit="brain:'+x.id+'"><span class="pin"></span>'+(x.pin?'<span class="pinmark">📌</span>':'')+'<div class="nt">'+esc(x.text).replace(/\n/g,'<br>')+'</div><div class="nb"><input type="checkbox" class="ck olive" data-tog="brain:'+x.id+':done"'+(x.done?' checked':'')+' title="Done"><span>'+(x.created>1e12?nice(iso(new Date(x.created))):'')+'</span><button class="x" data-rm="brain:'+x.id+'" aria-label="Remove">✕</button></div></div>';}).join('')+'</div>';}
function brainPage(){var done=DB.brain.filter(function(x){return x.done;}).length;
 return '<div class="capture"><textarea id="cap" placeholder="What’s on your mind? Type it here…"></textarea><button class="btn mustard" id="capbtn">Save it</button></div>'+
 (DB.brain.length?'<div class="bfilter"><input class="cozy sm" id="bq" type="search" placeholder="🔎 search notes" value="'+esc(brainQ)+'" autocomplete="off"><div class="swatches mini"><button class="sw'+(brainC?'':' on')+' allc" data-bc="" aria-label="All colors">all</button>'+NOTE_COLORS.map(function(c){return '<button class="sw'+(brainC===c?' on':'')+'" data-bc="'+c+'" style="background:'+NOTE_HEX[c]+'" aria-label="'+c+'"></button>';}).join('')+'</div>'+(done?'<button class="link" data-clear="brain">Clear done ('+done+')</button>':'')+'</div><div class="hand" style="margin:-4px 0 8px">tap a note to edit, pin it, or turn it into a to-do, grocery or event</div>':'')+
 '<div id="notesw">'+notesHtml()+'</div>';}

/* ---------- bills ---------- */
var BCATS=[['','None'],['home','🏡 Housing'],['util','💡 Utilities'],['phone','📱 Phone & internet'],['subs','📺 Subscriptions'],['car','🚗 Car'],['kids','🎒 Kids & school'],['debt','💳 Cards & loans'],['ins','🛡️ Insurance'],['other','✨ Other']];
var BCATMAP={};BCATS.forEach(function(c){BCATMAP[c[0]]=c[1];});
function billNext(b){var t=today(),f=b.freq||'monthly';
 if(f==='once'){return parseD(b.dueDate)||t;}
 if(f==='yearly'){var mo=Math.min(Math.max(parseInt(b.dueMonth,10)||1,1),12)-1,dd=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);
  function mky(y){var last=new Date(y,mo+1,0).getDate();return new Date(y,mo,Math.min(dd,last));}
  var y=mky(t.getFullYear());if(b.paidFor===String(y.getFullYear()))y=mky(t.getFullYear()+1);else if(y<t&&daysBetween(y,t)>31)y=mky(t.getFullYear()+1);return y;}
 var d=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);function mk(y,m){var last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d,last));}
 var x=mk(t.getFullYear(),t.getMonth());if(b.paidFor===monthKey(t))x=mk(t.getFullYear(),t.getMonth()+1);return x;}
function billKey(b){var f=b.freq||'monthly';if(f==='once')return 'once';if(f==='yearly')return String(billNext(Object.assign({},b,{paidFor:''})).getFullYear());return monthKey();}
function billPaid(b){var f=b.freq||'monthly';if(b.auto&&f!=='once'&&!b.paidFor){var dn=billNext(Object.assign({},b,{paidFor:''}));if(dn<=today()&&daysBetween(dn,today())<=31)return true;}if(f==='once')return b.paidFor==='once';if(f==='yearly')return b.paidFor===String(billNext(Object.assign({},b,{paidFor:''})).getFullYear());return b.paidFor===monthKey();}
function togglePaid(id){var b=find('bills',id);if(!b)return;var was=billPaid(b),k=billKey(b),h=(b.history||[]).filter(function(x){return x.k!==k;});
 if(!was)h.push({k:k,on:iso(today()),amt:b.amount||''});save('bills',Object.assign({},b,{paidFor:was?'':k,history:h.slice(-24)}));if(!was)toast(b.name+' marked paid 🌿');}
function editBill(b){b=b||{freq:'monthly'};form({title:b.id?'Edit bill':'New bill',color:'var(--olive)',required:'name',values:Object.assign({},b,{freq:b.freq||'monthly',auto:b.auto?'1':'',dueMonth:b.dueMonth?String(b.dueMonth):''}),fields:[
 {k:'name',label:'Bill',ph:'Electric'},{k:'amount',label:'Amount',t:'number',ph:'85.00'},
 {k:'freq',label:'How often?',t:'chips',opts:[['monthly','Every month'],['yearly','Once a year'],['once','Just once']]},
 {k:'dueDay',label:'Due day of the month (monthly & yearly)',t:'number',min:1,max:31,ph:'15'},
 {k:'dueMonth',label:'Month (yearly bills)',t:'select',opts:[['','–']].concat(MN.map(function(m,i){return [String(i+1),m];}))},
 {k:'dueDate',label:'Due date (one-time bills)',t:'date'},
 {k:'cat',label:'Category',t:'select',opts:BCATS},{k:'auto',label:'Autopay?',t:'chips',opts:[['','I pay it'],['1','🔁 Autopay']]},
 {k:'remind',label:'🔔 Remind me',t:'select',opts:REM_BILL},
 {k:'note',label:'Notes (card, account…)',t:'area'}],
 onSave:function(v){v.dueDay=Math.min(Math.max(parseInt(v.dueDay,10)||1,1),31);v.auto=!!v.auto;if(v.freq==='once'&&!v.dueDate)v.dueDate=iso(today());var was=b.remind||'';save('bills',Object.assign({},b,v));if(v.remind!==was)remNudge(v);},onDelete:b.id?function(){remove('bills',b.id);}:null});
 setTimeout(billFormSync,30);}
function billFormSync(){var dlg=document.querySelector('.veil:last-child .dlg');if(!dlg)return;var fc=dlg.querySelector('[data-k="freq"]');if(!fc)return;
 function upd(){var on=fc.querySelector('.on'),f=on?on.getAttribute('data-v'):'monthly';function show(k,y){var el=dlg.querySelector('[data-k="'+k+'"]');if(el){var fld=el.closest('.field');if(fld)fld.style.display=y?'':'none';}}
  show('dueDay',f!=='once');show('dueMonth',f==='yearly');show('dueDate',f==='once');}
 fc.addEventListener('click',function(){setTimeout(upd,0);});upd();}
function billsInMonth(){var t=today(),out=[];DB.bills.forEach(function(b){var f=b.freq||'monthly';
 if(f==='monthly'){out.push(b);return;}var n=billNext(Object.assign({},b,{paidFor:''}));if(n.getFullYear()===t.getFullYear()&&n.getMonth()===t.getMonth())out.push(b);});return out;}
function billsPage(){var t=today(),mb=billsInMonth(),tot=0,paid=0;mb.forEach(function(x){tot+=num(x.amount);if(billPaid(x))paid+=num(x.amount);});
 var all=DB.bills.slice().sort(function(x,y){return billNext(x)-billNext(y);}),late=[],week=[],later=[],done=[];
 all.forEach(function(b){if(billPaid(b)){done.push(b);return;}var dl=daysBetween(t,billNext(b));if(dl<0)late.push(b);else if(dl<=7)week.push(b);else later.push(b);});
 function grp(title,arr,cls){return arr.length?'<div class="ghead'+(cls?' '+cls:'')+'">'+title+'</div>'+arr.map(billRow).join(''):'';}
 var yearly=DB.bills.filter(function(b){return (b.freq||'monthly')==='monthly';}).reduce(function(s,b){return s+num(b.amount);},0)*12+DB.bills.filter(function(b){return b.freq==='yearly';}).reduce(function(s,b){return s+num(b.amount);},0);
 var cats={};DB.bills.forEach(function(b){if((b.freq||'monthly')!=='monthly')return;var c=b.cat||'other';cats[c]=(cats[c]||0)+num(b.amount);});
 var catH=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];}).map(function(c){return '<div class="catrow"><span>'+esc(BCATMAP[c]||'✨ Other')+'</span><b>'+money(cats[c])+'</b></div>';}).join('');
 return '<div class="billsum"><div class="stat"><div class="k">Due in '+MN[t.getMonth()]+'</div><div class="v">'+money(tot||0)+'</div></div><div class="stat"><div class="k">Paid so far</div><div class="v" style="color:var(--olive)">'+money(paid||0)+'</div></div><div class="stat"><div class="k">Still to pay</div><div class="v">'+money(Math.max(tot-paid,0))+'</div></div></div>'+
 (tot?progress(paid,tot,'big olive'):'')+
 '<div class="cols c2"><div class="card"><div class="wh olive"><span class="t">My bills</span><button class="ib" data-new="bill" title="Add a bill">+</button></div><div class="bd">'+
 (all.length?grp('🌿 Not marked paid yet',late,'late')+grp('⏳ Due in the next 7 days',week)+grp('📅 Coming up',later)+grp('✓ Paid',done):empty('💌','No bills yet. Tap + to add rent, phone, electric…'))+
 '<div style="margin-top:12px;text-align:center"><button class="btn olive" data-new="bill">+ Add a bill</button></div></div></div>'+
 '<div class="card"><div class="wh oat"><span class="t">Where it goes</span></div><div class="bd"><div class="hand">monthly bills by category</div>'+(catH||empty('🌿','Add bills to see the breakdown.'))+
 (yearly?'<div class="catrow tot"><span>About a year of bills</span><b>'+money(Math.round(yearly))+'</b></div>':'')+'</div></div></div>';}
function billRow(x){var p=billPaid(x),nx=billNext(x),dl=daysBetween(today(),nx),f=x.freq||'monthly',last=(x.history||[]).slice(-1)[0];
 var when=p?(f==='once'?'paid'+(last?' '+nice(last.on):''):'paid'+(last&&last.on?' '+nice(last.on):'')+' · next '+nice(iso(nx))):dl<0?'was due '+nice(iso(nx)):dl===0?'due today':dl===1?'due tomorrow':'due '+nice(iso(nx))+' · '+dl+' days';
 return '<div class="bill"><div class="bn" data-edit="bills:'+x.id+'"><b>'+esc(x.name)+'</b><span class="bmeta"><span class="pill'+(!p&&dl<=3?' rust':p?' olive':'')+'">'+when+'</span>'+(x.auto?'<span class="tiny">🔁 autopay</span>':'')+(x.remind?'<span class="tiny">🔔</span>':'')+(f!=='monthly'?'<span class="tiny">'+(f==='yearly'?'yearly':'one-time')+'</span>':'')+(x.cat&&BCATMAP[x.cat]?'<span class="tiny">'+esc(BCATMAP[x.cat])+'</span>':'')+'</span></div><span class="amt">'+esc(money(x.amount))+'</span><button class="paid'+(p?' on':'')+'" data-paid="'+x.id+'">'+(p?'✓ Paid':'Mark paid')+'</button></div>';}

/* ---------- kids & school ---------- */
var kidF=localStorage.getItem('kidF')||'all';
function kidItem(x,k){return '<div class="row'+(x.done?' done':'')+'"><input type="checkbox" class="ck'+(k==='Holden'?' olive':'')+'" data-tog="kids:'+x.id+':done"'+(x.done?' checked':'')+'><span title="'+esc(x.type)+'">'+(KEMO[x.type]||'📝')+'</span><div class="tx" data-edit="kids:'+x.id+'">'+esc(x.title)+(x.note?'<div class="meta" style="white-space:normal;font-weight:600">'+esc(x.note)+'</div>':'')+'</div>'+(x.remind&&!x.done?'<span title="reminder on">🔔</span>':'')+(x.kid==='Both'?'<span class="pill">both</span>':'')+(x.date?'<span class="pill'+(x.date<iso(today())&&!x.done?' rust':' mustard')+'">'+esc(nice(x.date))+'</span>':'')+'<button class="x" data-rm="kids:'+x.id+'" aria-label="Remove">✕</button></div>';}
function kidsPage(){var cols={Weston:'rust',Holden:'olive'},td=iso(today()),lim=iso(addDays(today(),14));
 var soon=DB.kids.filter(function(x){return !x.done&&x.date&&x.date>=td&&x.date<=lim;}).sort(function(a,b){return a.date<b.date?-1:1;});
 var strip='<div class="card soon"><div class="wh mustard"><span class="t">Coming up · next 2 weeks</span><button class="ib" data-newkid="Both" title="Add for both boys">+</button></div><div class="bd">'+
 (soon.length?'<div class="soonrow">'+soon.map(function(x){var d=parseD(x.date);return '<div class="soonc '+(x.kid==='Holden'?'h':x.kid==='Both'?'b':'w')+'" data-edit="kids:'+x.id+'"><div class="sd"><b>'+d.getDate()+'</b>'+DN[d.getDay()]+'</div><div class="st">'+(KEMO[x.type]||'')+' '+esc(x.title)+'<small>'+esc(x.kid==='Both'?'both boys':x.kid)+'</small></div></div>';}).join('')+'</div>':'<div class="hand">nothing with a date in the next two weeks 🍂</div>')+'</div></div>';
 var fl=filterChips('kid',kidF,[['all','All'],['form','📄 Forms'],['item','🎒 Bring / buy'],['date','📅 Dates'],['note','📝 Notes'],['open','Not done']]);
 return strip+fl+'<div class="cols">'+KIDS.map(function(k){var items=DB.kids.filter(function(x){return (x.kid===k||x.kid==='Both')&&(kidF==='all'||(kidF==='open'?!x.done:x.type===kidF));}).sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;var ad=a.date||'9999',bd=b.date||'9999';return ad<bd?-1:ad>bd?1:byCreated(a,b);});
  var open=DB.kids.filter(function(x){return (x.kid===k||x.kid==='Both')&&!x.done;}).length;
  return '<div class="card"><div class="wh '+cols[k]+'"><span class="t">'+k+(open?' · '+open+' open':'')+'</span><button class="ib" data-newkid="'+k+'" title="Add with details">+</button></div><div class="bd">'+
  (items.length?items.map(function(x){return kidItem(x,k);}).join(''):empty('🎒',kidF==='all'?'Forms, notes, spirit days<br>and things to bring go here.':'Nothing here.'))+
  addLine('kids','add for '+k+'…',k==='Holden'?'olive':'',' data-kid="'+k+'"')+(DB.kids.some(function(x){return (x.kid===k)&&x.done;})?'<div class="toolbar"><button class="link" data-kclear="'+k+'">Clear done</button></div>':'')+'</div></div>';}).join('')+'</div>';}

/* ---------- click / input handling for the tabs ---------- */
function tabClick(e,t){var el;
 if((el=t.closest('[data-tog]'))){var p=pair(el.getAttribute('data-tog'));if(p.c==='todos'){var it=find('todos',p.id);if(it&&it.repeat&&!it.done){var nd=advance(it.due||iso(today()),it.repeat);if(nd<=iso(today()))nd=advance(iso(today()),it.repeat);save('todos',Object.assign({},it,{due:nd,done:false}));toast('Done! Next one '+nice(nd)+' 🔁',function(){save('todos',it);});setTimeout(refreshDay,0);return true;}}
  setTimeout(refreshDay,0);return false;}
 if((el=t.closest('[data-paid]'))){togglePaid(el.getAttribute('data-paid'));setTimeout(refreshDay,0);return true;}
 if((el=t.closest('[data-star]'))){var s=find('todos',el.getAttribute('data-star'));if(s)save('todos',Object.assign({},s,{star:!s.star}));return true;}
 if((el=t.closest('[data-f]'))){var f=el.getAttribute('data-f').split(':');if(f[0]==='todo'){todoF=f[1];localStorage.setItem('todoF',todoF);}else if(f[0]==='kid'){kidF=f[1];localStorage.setItem('kidF',kidF);}render();return true;}
 if((el=t.closest('[data-xc]'))){e.stopPropagation();var x=el.getAttribute('data-xc').split(':');if(x[0]==='bill'){var b=find('bills',x[1]);if(b)editBill(b);}else if(x[0]==='kid'){var k=find('kids',x[1]);if(k)editKid(k);}else if(x[0]==='todo'){var td=find('todos',x[1]);if(td)editTodo(td);}return true;}
 if((el=t.closest('[data-ev]'))){e.stopPropagation();var ev=find('events',el.getAttribute('data-ev'));closeSheets();if(ev)editEvent(ev);return true;}
 if((el=t.closest('[data-edit]'))&&el.closest('.veil')){var q=pair(el.getAttribute('data-edit')),xx=find(q.c,q.id);closeSheets();if(xx)({todos:editTodo,bills:editBill,kids:editKid})[q.c](xx);return true;}
 if((el=t.closest('[data-day]'))&&!t.closest('.month .chip,.wkview .chip')){dayDialog(el.getAttribute('data-day'));return true;}
 if((el=t.closest('[data-dayev]'))){var ds=el.getAttribute('data-dayev');closeSheets();editEvent(null,ds);return true;}
 if((el=t.closest('[data-daytodo]'))){var ds2=el.getAttribute('data-daytodo');closeSheets();editTodo({due:ds2});return true;}
 if((el=t.closest('[data-skip]'))){var sk=el.getAttribute('data-skip').split(':'),se=find('events',sk[0]);if(se){var old=se;save('events',Object.assign({},se,{skip:(se.skip||[]).concat([sk[1]])}));toast('Skipped that day',function(){save('events',old);});}refreshDay();return true;}
 if((el=t.closest('[data-cal]'))){var c=el.getAttribute('data-cal');if(c==='today'){calOff=0;render();}else if(c==='ov'){calOverlay=el.checked;localStorage.setItem('calOv',calOverlay?'1':'0');render();}return true;}
 if((el=t.closest('[data-pickday]'))){pickIdea(el.getAttribute('data-pickday'));return true;}
 if((el=t.closest('[data-pickidea]'))){var pi=el.getAttribute('data-pickidea').split(':'),id=(ideasDoc().items||[]).filter(function(z){return z.id===pi[1];})[0];closeSheets();if(id){setDinner(pi[0],id.text);toast(id.text+' planned 🍲'+(ingrList(id.ingr).length?' · tap 🛒 for groceries':''));}return true;}
 if((el=t.closest('[data-ingr]'))){var ig=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-ingr');})[0];if(ig)addIngredients(ig);return true;}
 if(t.closest('[data-newidea]')){editIdea();return true;}
 if((el=t.closest('[data-editidea]'))){var ei=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-editidea');})[0];if(ei)editIdea(ei);return true;}
 if((el=t.closest('[data-planidea]'))){var pl=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-planidea');})[0];if(pl)planIdea(pl);return true;}
 if((el=t.closest('[data-mealcopy]'))){var wk=parseD(el.getAttribute('data-mealcopy')),n=0,undo=[];for(var i=0;i<7;i++){var from=mealFor(iso(addDays(wk,i-7))),tds=iso(addDays(wk,i));if(from&&from.dinner&&!(mealFor(tds)||{}).dinner){setDinner(tds,from.dinner);undo.push(tds);n++;}}
  toast(n?'Copied '+n+' dinner'+(n===1?'':'s'):'Nothing to copy (or this week’s already filled)',n?function(){undo.forEach(function(d){setDinner(d,'');});}:null);return true;}
 if((el=t.closest('[data-mealclear]'))){var wk2=parseD(el.getAttribute('data-mealclear')),gone=[];for(var j=0;j<7;j++){var me=mealFor(iso(addDays(wk2,j)));if(me){gone.push(me);remove('meals',me.id,true);}}
  if(gone.length)toast('Cleared the week',function(){gone.forEach(function(m){save('meals',m);});});return true;}
 if((el=t.closest('[data-liup]'))){var a=el.getAttribute('data-liup').split(':'),L=find('lists',a[0]);if(L){L=JSON.parse(JSON.stringify(L));var ix=L.items.map(function(z){return z.id;}).indexOf(a[1]);if(ix>0){var tmp=L.items[ix-1];L.items[ix-1]=L.items[ix];L.items[ix]=tmp;save('lists',L);}}return true;}
 if((el=t.closest('[data-liuncheck]'))){var L2=find('lists',el.getAttribute('data-liuncheck'));if(L2){var o2=L2;L2=JSON.parse(JSON.stringify(L2));L2.items.forEach(function(z){z.done=false;});save('lists',L2);toast('All unchecked',function(){save('lists',o2);});}return true;}
 if((el=t.closest('[data-ldup]'))){var L3=find('lists',el.getAttribute('data-ldup'));if(L3){var c3=JSON.parse(JSON.stringify(L3));delete c3.id;delete c3.created;delete c3.order;c3.name=L3.name+' (copy)';c3.items=(c3.items||[]).map(function(z){return {id:uid(),text:z.text,done:false};});save('lists',c3);toast('Copied “'+L3.name+'”');}return true;}
 if((el=t.closest('[data-lmove]'))){var lm=el.getAttribute('data-lmove').split(':'),ls=DB.lists.filter(function(l){return !l.kind;}).sort(function(a,b){return (a.order!=null?a.order:a.created||0)-(b.order!=null?b.order:b.created||0);}),ids=ls.map(function(l){return l.id;}),k2=ids.indexOf(lm[0]);
  if(k2>0){ids.splice(k2,1);ids.splice(k2-1,0,lm[0]);ids.forEach(function(id,i){var l=find('lists',id);if(l.order!==i)save('lists',Object.assign({},l,{order:i}));});}return true;}
 if((el=t.closest('[data-bc]'))){brainC=el.getAttribute('data-bc');render();return true;}
 if((el=t.closest('[data-kclear]'))){var kk=el.getAttribute('data-kclear'),g2=DB.kids.filter(function(z){return z.kid===kk&&z.done;});g2.forEach(function(z){remove('kids',z.id,true);});toast('Cleared '+g2.length,function(){g2.forEach(function(z){save('kids',z);});});return true;}
 return false;}
document.addEventListener('input',function(e){if(e.target&&e.target.id==='bq'){brainQ=e.target.value;var w=document.getElementById('notesw');if(w)w.innerHTML=notesHtml();}});

/* ================= Phase 4: reminders on anything (v2.3.0) ================= */
var REMCOLS={todos:1,events:1,bills:1,kids:1};
var REM_DAY=[['','No reminder'],['d0@8','Morning of · 8 AM'],['d1@19','Night before · 7 PM'],['d1@8','Day before · 8 AM'],['d2@8','2 days before · 8 AM'],['w1@8','1 week before · 8 AM']];
var REM_EVT=[['','No reminder'],['m15','15 minutes before'],['m30','30 minutes before'],['m60','1 hour before'],['m120','2 hours before']].concat(REM_DAY.slice(1));
var REM_BILL=[['','No reminder'],['d0@8','On the due day · 8 AM'],['d1@19','Night before · 7 PM'],['d3@8','3 days before · 8 AM'],['w1@8','1 week before · 8 AM']];
var REMNAME={};REM_EVT.concat(REM_BILL).forEach(function(o){if(o[0])REMNAME[o[0]]=o[1];});
var remSyncing=false;
function remKey(c,id){return c+':'+id;}
function remBase(c,id){return ('r_'+c+'_'+String(id).replace(/[^A-Za-z0-9_-]/g,'_')).slice(0,48);}
function hm(s,dflt){var m=String(s||'').match(/^(\d{1,2}):(\d{2})/);return m?[+m[1],+m[2]]:dflt;}
/* when to fire for one occurrence: date string ds, start time (HH:MM or ''), preset */
function fireFor(ds,time,pre){var d=parseD(ds);if(!d||!pre)return 0;var m;
 if((m=pre.match(/^m(\d+)$/))){var t=hm(time,null);if(!t)return new Date(d.getFullYear(),d.getMonth(),d.getDate(),8,0).getTime();
  return new Date(d.getFullYear(),d.getMonth(),d.getDate(),t[0],t[1]).getTime()-(+m[1])*60000;}
 if((m=pre.match(/^([dw])(\d+)@(\d+)$/))){var back=(+m[2])*(m[1]==='w'?7:1),x=addDays(d,-back);return new Date(x.getFullYear(),x.getMonth(),x.getDate(),+m[3],0).getTime();}
 return 0;}
function dayWord(ds,fireMs){var f=new Date(fireMs),fd=new Date(f.getFullYear(),f.getMonth(),f.getDate()),n=daysBetween(fd,parseD(ds));
 if(n===0)return 'today';if(n===1)return 'tomorrow';if(n<7)return 'on '+parseD(ds).toLocaleDateString('en-US',{weekday:'long'});return 'on '+parseD(ds).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}
/* list of {when,ds} occurrences of an item that still need a reminder (future only) */
function remOccurrences(c,it){var out=[],now=Date.now()+60000,pre=it.remind;if(!pre)return out;
 if(c==='todos'){if(it.done)return out;var ds=it.due||iso(today()),w=fireFor(ds,'',pre);if(w>now)out.push({when:w,ds:ds});}
 else if(c==='kids'){if(it.done||!it.date)return out;var w2=fireFor(it.date,'',pre);if(w2>now)out.push({when:w2,ds:it.date});}
 else if(c==='bills'){billDates(it).forEach(function(bd){if(out.length>=3)return;var bds=iso(bd),w3=fireFor(bds,'',pre);if(w3>now)out.push({when:w3,ds:bds});});}
 else if(c==='events'){var t0=today();for(var k=-1;k<400&&out.length<(it.repeat?3:1);k++){var dd=iso(addDays(t0,k));
   if(occursOn(it,dd)&&!(it.skip&&it.skip.indexOf(dd)>=0)){var w4=fireFor(dd,it.time,pre);if(w4>now)out.push({when:w4,ds:dd});}
   if(!it.repeat&&dd>it.date)break;}}
 return out;}
/* upcoming due dates of a bill, skipping the period already marked paid */
function billDates(b){var f=b.freq||'monthly',t=today(),out=[],dd=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);
 function mk(y,m){var last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(dd,last));}
 if(f==='once'){if(b.paidFor!=='once'&&b.dueDate)out.push(parseD(b.dueDate));return out;}
 if(f==='yearly'){var mo=Math.min(Math.max(parseInt(b.dueMonth,10)||1,1),12)-1;for(var y=t.getFullYear()-1;y<=t.getFullYear()+2;y++){var d=mk(y,mo);if(d<addDays(t,-7))continue;if(b.paidFor===String(y))continue;out.push(d);}return out;}
 for(var i=-1;i<5;i++){var d2=mk(t.getFullYear(),t.getMonth()+i);if(d2<addDays(t,-7))continue;if(b.paidFor===d2.getFullYear()+'-'+pad(d2.getMonth()+1))continue;out.push(d2);}return out;}
function remText(c,it,o){var when=dayWord(o.ds,o.when);
 if(c==='todos')return '📝 '+it.text+(when==='today'?' (due today)':' (due '+when+')');
 if(c==='kids')return '🎒 '+(it.kid&&it.kid!=='Both'?it.kid+': ':'')+it.title+' '+when;
 if(c==='bills')return '💵 '+it.name+' is due '+when+(money(it.amount)?' · '+money(it.amount):'')+(it.auto?' (autopay)':'');
 if(c==='events')return '📅 '+it.title+' '+when+(it.time?' at '+fmtTime(it.time):'');return '';}
function remSync(c,it,del){if(!REMCOLS[c]||!it)return;var key=remKey(c,it.id),want=del?[]:remOccurrences(c,it),have=DB.reminders.filter(function(r){return r.ref===key;}),base=remBase(c,it.id);
 remSyncing=true;try{
  have.forEach(function(r){var m=null;for(var i=0;i<want.length;i++)if(!want[i].done&&want[i].when===r.when){m=want[i];break;}
   if(r.sent||!m){remove('reminders',r.id,true);return;}m.done=true;var tx=remText(c,it,m);if(tx!==r.text)save('reminders',Object.assign({},r,{text:tx}));});
  want.forEach(function(o){if(o.done)return;save('reminders',{id:base+'_'+o.when.toString(36),when:o.when,text:remText(c,it,o),repeat:'',sent:false,ref:key});});
 }finally{remSyncing=false;}}
function remHook(c,item,del){if(remSyncing||!REMCOLS[c]||!loaded)return;try{remSync(c,item,del);}catch(e){console.warn('rem',e);}}
/* re-arm repeating items and tidy old ones each time the planner loads */
function remSyncAll(){if(!loaded)return;try{Object.keys(REMCOLS).forEach(function(c){DB[c].forEach(function(it){if(it.remind)remSync(c,it,false);});});
  DB.reminders.filter(function(r){if(!r.ref||r.ref.indexOf('gcal:')===0)return false;var p=r.ref.split(':'),it=REMCOLS[p[0]]?find(p[0],p[1]):null;return !it||!it.remind;}).forEach(function(r){remSyncing=true;try{remove('reminders',r.id,true);}finally{remSyncing=false;}});
 }catch(e){console.warn('remAll',e);}}
function pushIsOn(){return ('Notification' in window)&&Notification.permission==='granted'&&!!localStorage.getItem('pushOn');}
function remNudge(v){if(!v||!v.remind)return;setTimeout(function(){if(pushIsOn())toast('🔔 I’ll remind you · '+(REMNAME[v.remind]||'').toLowerCase());else toast('Reminder saved. Tap the 🔔 up top to turn on notifications.');},350);}
/* bell panel list: show where each reminder came from */
var REMSRC={todos:'To-do',events:'Calendar',bills:'Bill',kids:'Kids & School',gcal:'Google Calendar'};
function remHtml(small){var a=remList();if(!a.length)return small?empty('🔔','No reminders yet.<br>Tap 🔔 on any to-do, event or bill.'):'<div class="nstat">Nothing yet. Add one above, or pick “Remind me” when you add a to-do, event, bill or school item.</div>';
 return a.slice(0,small?6:50).map(function(r){var src=r.ref?REMSRC[r.ref.split(':')[0]]:'';
  return '<div class="rem"><div style="flex:1;min-width:0"><div style="font-weight:800;overflow-wrap:anywhere">'+esc(r.text)+'</div><div class="w">'+fmtW(r.when)+(r.repeat?' · '+(r.repeat==='daily'?'every day':'every week'):'')+(src?' · from '+src:'')+'</div></div><button class="x" data-rm="reminders:'+r.id+'" aria-label="Delete">✕</button></div>';}).join('');}
/* deleting a linked reminder in the bell panel also turns off "remind me" on its item */
function remClick(e,t){var el=t.closest('[data-rm^="reminders:"]');if(!el)return false;var id=el.getAttribute('data-rm').split(':')[1],r=find('reminders',id);
 if(!r||!r.ref)return false;e.stopPropagation();if(r.ref.indexOf('gcal:')===0){gRemOff(r);drawRems();return true;}var p=r.ref.split(':'),it=find(p[0],p[1]);
 if(it){var old=JSON.parse(JSON.stringify(it));save(p[0],Object.assign({},it,{remind:''}));toast('Reminder off',function(){save(p[0],old);drawRems();});}else remove('reminders',id,true);
 drawRems();return true;}
function editKid(k,kid){k=k||{kid:kid||'Weston',type:'note'};form({title:k.id?'Edit':'Add for '+(k.kid==='Both'?'both boys':k.kid),color:'var(--caramel)',required:'title',values:k,
 fields:[{k:'title',label:'What is it?',ph:'Field trip form'},{k:'kid',label:'Who',t:'chips',opts:[['Weston','Weston'],['Holden','Holden'],['Both','Both']]},{k:'type',label:'Kind',t:'chips',opts:KTYPES},{k:'date',label:'Date (optional)',t:'date'},{k:'remind',label:'🔔 Remind me (needs a date)',t:'select',opts:REM_DAY},{k:'note',label:'Notes',t:'area'}],
 onSave:function(v){var was=k.remind||'';if(v.remind&&!v.date)v.date=iso(today());save('kids',Object.assign({},k,v,{done:!!k.done}));if(v.remind!==was)remNudge(v);},onDelete:k.id?function(){remove('kids',k.id);}:null});}

/* ================= Phase 5: Google Calendar two-way sync (v2.4.0) ================= */
var GCAL_DEF={personal:{name:'Personal',color:'#9fe1e7'},work:{name:'Work',color:'#fa573c'}},GCAL_KEYS=['personal','work'];
var GC=null;try{GC=JSON.parse(localStorage.getItem('gcal1')||'null');}catch(e){GC=null;}
if(!GC||!GC.ev)GC={ev:[],cals:{},from:'',to:'',at:0};
var GIDX=null,GOCC=[],gcBusy=false,gcErr='',gcLoadedNow=false,gcPend={},gcXBusy='';
var gcHide={};try{gcHide=JSON.parse(localStorage.getItem('gcHide')||'{}')||{};}catch(e){gcHide={};}
function normT(t){var m=String(t||'').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);if(!m)return '';var h=+m[1];if(m[3]){var pm=/p/i.test(m[3]);if(h===12)h=0;if(pm)h+=12;}return h>23?'':pad(h)+':'+m[2];}
function gcName(k){return GCAL_DEF[k]?GCAL_DEF[k].name:k;}
function gcColor(k){var c=GC.cals&&GC.cals[k];return (c&&c.color)||(GCAL_DEF[k]||{}).color||'#C9AE8E';}
function gcOk(k){var c=GC.cals&&GC.cals[k];return !c||c.ok!==false;}
function gcCanWrite(k){var c=GC.cals&&GC.cals[k];return !c||!c.role||c.role==='owner'||c.role==='writer';}
function gcKey(o){return o.k+'|'+o.id;}
function gcSave(){try{localStorage.setItem('gcal1',JSON.stringify(GC));}catch(e){}}
function gcRange(){var t=today();return [iso(addDays(t,-62)),iso(addDays(t,420))];}
function gcAll(){var a=(GC.ev||[]).slice();if(GC.x&&GC.x.ev)a=a.concat(GC.x.ev);return a;}
function gcFind(key){var a=gcAll();for(var i=0;i<a.length;i++)if(gcKey(a[i])===key)return a[i];return null;}
/* calendar colors as css classes */
function gcStyle(){var css='';GCAL_KEYS.forEach(function(k){var c=gcColor(k),bg=mix(c,'#FFFFFF',.55),ink=onColor(bg),st=lum(c)>.5?mix(c,'#2A1A10',.28):c,abg=mix(c,'#FFFFFF',.7);
  css+='.chip.gc-'+k+'{background:'+bg+';color:'+ink+';box-shadow:inset 3px 0 0 '+st+',0 2px 0 rgba(110,72,40,.15)}'+
  '.aev.gc-'+k+'{background:'+abg+';color:'+onColor(abg)+';box-shadow:inset 4px 0 0 '+st+'}'+
  '.dotc.gc-'+k+',.gdot.gc-'+k+'{background:'+c+';box-shadow:0 0 0 1.5px '+st+'}'+
  '.gbadge.gc-'+k+',.gpill.gc-'+k+' i{background:'+c+';color:'+onColor(c)+'}';});
 var el=document.getElementById('gcstyle');if(!el){el=document.createElement('style');el.id='gcstyle';document.head.appendChild(el);}if(el.textContent!==css)el.textContent=css;}
/* ---- loading ---- */
function gcLoad(){if(gcBusy||!PK)return Promise.resolve();gcBusy=true;var r=gcRange();
 return api('gcalList',[r[0],r[1]]).then(function(d){if(!d||!d.ev)throw 'no data';var keepX=GC.x;
   GC={ev:d.ev,cals:d.cals||{},from:d.from,to:d.to,at:Date.now(),x:keepX};gcLoadedNow=true;
   var bad=GCAL_KEYS.filter(function(k){return d.cals&&d.cals[k]&&d.cals[k].ok===false;});gcErr=bad.length?bad.map(gcName).join(' & ')+' calendar didn’t load':'';
   gcSave();GIDX=null;gcStyle();rerender();refreshDay();gRemSyncAll();})
  .catch(function(e){gcErr=String(e)==='locked'?'':'Couldn’t reach Google just now, showing your saved copy';if(cur==='todo')rerender();})
  .then(function(){gcBusy=false;});}
/* a month outside the cached window: fetch just that stretch */
function gcEnsure(a,b){if(!GC.from||(a>=GC.from&&b<=GC.to))return;if(GC.x&&a>=GC.x.from&&b<=GC.x.to)return;var key=a+b;if(gcXBusy===key)return;gcXBusy=key;
 api('gcalList',[a,b]).then(function(d){GC.x={ev:d.ev||[],from:d.from,to:d.to};gcSave();GIDX=null;rerender();}).catch(function(){}).then(function(){gcXBusy='';});}
function gcStale(){return Date.now()-(GC.at||0)>120000;}
/* ---- index by day ---- */
function nTitle(s){return String(s||'').toLowerCase().replace(/^\s*(work|school|personal)\s*[:\-–]\s*/,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
var STOPW={the:1,a:1,an:1,and:1,of:1,'for':1,to:1,at:1,'in':1,on:1,day:0,after:1,with:1,no:1};
function tWords(s){return nTitle(s).split(' ').filter(function(w){return w.length>2&&!STOPW[w];});}
function tSim(a,b){var x=tWords(a),y=tWords(b);if(!x.length||!y.length)return 0;var n=0;x.forEach(function(w){if(y.indexOf(w)>=0)n++;});return n/Math.min(x.length,y.length);}
function gcIndex(){if(GIDX)return GIDX;GIDX={};GOCC=[];var groups={},order=[];
 gcAll().forEach(function(o){if(gcHide[o.k]||gcPend[gcKey(o)]==='del')return;var sig=nTitle(o.t)+'|'+o.d+'|'+(o.tm||'')+'|'+o.ed;
  if(!groups[sig]){groups[sig]=[];order.push(sig);}if(!groups[sig].some(function(z){return gcKey(z)===gcKey(o);}))groups[sig].push(o);});
 var P=gcPrefs();
 order.forEach(function(sig){var g=groups[sig],o=g.filter(function(z){return !z.ro;})[0]||g[0];
  var n=Math.min(Math.max(daysBetween(parseD(o.d),parseD(o.ed||o.d))+1,1),62),key=gcKey(o);
  for(var i=0;i<n;i++){var ds=iso(addDays(parseD(o.d),i)),ix=GOCC.length;
   var occ={id:'g~'+ix,g:o,gk:key,cal:o.k,title:o.t,date:ds,time:i===0?(o.tm||''):'',end:i===n-1&&i===0?(o.et||''):'',allDay:!!o.ad||i>0,span:n>1?{i:i+1,n:n}:null,
    color:'gc gc-'+o.k,note:o.n||'',remind:(P.remind||{})[key]||'',dupes:g.length-1};
   GOCC.push(occ);(GIDX[ds]=GIDX[ds]||[]).push(occ);}});
 return GIDX;}
function gcIsCopy(e,g){var et=normT(e.time),work=/^\s*work\s*:/i.test(e.title||'');
 return g.some(function(o){var s=tSim(e.title,o.title),same=et&&o.time&&et===o.time;return s>=.6||(work&&o.cal==='work'&&(same||s>=.34));});}
function evSort(a,b){var ta=normT(a.time),tb=normT(b.time);if(!ta&&tb)return -1;if(ta&&!tb)return 1;return ta<tb?-1:ta>tb?1:0;}
function eventsOn(ds){var p=plannerEventsOn(ds),g=gcIndex()[ds]||[];if(g.length)p=p.filter(function(e){return !gcIsCopy(e,g);});return p.concat(g).sort(evSort);}
function hiddenCopies(){var n=[];DB.events.forEach(function(e){if(!e.date||e.repeat)return;var g=gcIndex()[e.date]||[];if(g.length&&gcIsCopy(e,g))n.push(e);});return n;}
/* ---- rendering helpers ---- */
function chip(e,short){if(!e.g)return chipBase(e,short);var o=e.g,t=(e.span&&e.span.i>1?'↳ ':'')+e.title;
 return '<span class="chip '+esc(e.color)+'" data-ev="'+e.id+'" title="'+esc(e.title+' · '+gcName(e.cal)+' calendar'+(e.span?' · day '+e.span.i+' of '+e.span.n:''))+'">'+(e.time&&!short?'<span class="tm">'+fmtTime(e.time)+'</span>':'')+(e.remind&&!short?'🔔 ':'')+esc(t)+'</span>';}
function gBadge(e){return e&&e.g?' <span class="gbadge gc-'+e.cal+'">'+esc(gcName(e.cal))+'</span>'+(e.span?' <small class="tiny">day '+e.span.i+' of '+e.span.n+'</small>':'')+(e.remind?' <small>🔔</small>':''):'';}
function gcWhen(o){var s=nice(o.d)+(o.tm?' · '+fmtTime(o.tm)+(o.et?'–'+fmtTime(o.et):''):'');if(o.ed&&o.ed!==o.d)s=nice(o.d)+' – '+nice(o.ed)+(o.tm?' · '+fmtTime(o.tm):'');else if(!o.tm)s+=' · all day';return s;}
function gcAgo(){if(!GC.at)return 'not synced yet';var m=Math.round((Date.now()-GC.at)/60000);return m<1?'synced just now':m<60?'synced '+m+' min ago':'synced '+Math.round(m/60)+' hr ago';}
function gcTools(){gcStyle();return '<span class="gtools">'+GCAL_KEYS.map(function(k){return '<button class="gpill gc-'+k+(gcHide[k]?' off':'')+'" data-gtog="'+k+'" title="'+(gcHide[k]?'Show':'Hide')+' your '+gcName(k)+' Google calendar"><i></i>'+gcName(k)+'</button>';}).join('')+
 '<button class="gsync'+(gcBusy?' busy':'')+'" data-gsync title="Check Google Calendar now">↻ <span>'+esc(gcErr?'⚠ '+gcErr:gcAgo())+'</span></button></span>';}
/* ---- prefs (remember last calendar + reminders on Google events), kept in a hidden lists doc ---- */
function gcPrefs(){return find('lists','gcal-prefs')||{id:'gcal-prefs',kind:'gcal',remind:{},last:''};}
function gcSetPrefs(ch){var p=JSON.parse(JSON.stringify(gcPrefs()));Object.keys(ch).forEach(function(k){p[k]=ch[k];});p.kind='gcal';p.name='(Google Calendar settings)';p.items=[];save('lists',p);return p;}
function gcLastCal(){var l=gcPrefs().last||localStorage.getItem('gcLast')||'personal';return l==='planner'||GCAL_DEF[l]?l:'personal';}
/* ---- reminders on Google events ---- */
function gRemText(o,w){var when=dayWord(o.d,w);return '📅 '+o.t+' '+when+(o.tm?' at '+fmtTime(o.tm):'');}
function gRemSync(key,pre){var o=gcFind(key),ref='gcal:'+key,have=DB.reminders.filter(function(r){return r.ref===ref;}),want=[];
 if(o&&pre){var w=fireFor(o.d,o.tm||'',pre);if(w>Date.now()+60000)want.push(w);}
 remSyncing=true;try{have.forEach(function(r){var i=want.indexOf(r.when);if(r.sent||i<0){remove('reminders',r.id,true);return;}want.splice(i,1);var tx=gRemText(o,r.when);if(tx!==r.text)save('reminders',Object.assign({},r,{text:tx}));});
  want.forEach(function(w){save('reminders',{id:(remBase('gcal',key.replace(/\|/g,'_'))).slice(0,40)+'_'+w.toString(36),when:w,text:gRemText(o,w),repeat:'',sent:false,ref:ref});});}finally{remSyncing=false;}}
function gRemSyncAll(){if(!loaded||!gcLoadedNow)return;try{var R=(gcPrefs().remind)||{},gone=[];Object.keys(R).forEach(function(k){var o=gcFind(k);if(!o&&GC.from&&k){gone.push(k);gRemSync(k,'');}else gRemSync(k,R[k]);});
  DB.reminders.forEach(function(r){if(r.ref&&r.ref.indexOf('gcal:')===0&&!R[r.ref.slice(5)]){remSyncing=true;try{remove('reminders',r.id,true);}finally{remSyncing=false;}}});
  if(gone.length){var nr=Object.assign({},R);gone.forEach(function(k){delete nr[k];});gcSetPrefs({remind:nr});}}catch(e){console.warn('gRem',e);}}
function gSetRemind(key,pre){var R=Object.assign({},gcPrefs().remind||{});if(pre)R[key]=pre;else delete R[key];gcSetPrefs({remind:R});GIDX=null;gRemSync(key,pre);rerender();}
function gRemOff(r){var key=r.ref.slice(5),old=(gcPrefs().remind||{})[key];gSetRemind(key,'');toast('Reminder off',old?function(){gSetRemind(key,old);drawRems();}:null);}
/* ---- writes ---- */
function gcPutLocal(o){var arr=GC.ev||[];var ix=-1;for(var i=0;i<arr.length;i++)if(gcKey(arr[i])===gcKey(o)){ix=i;break;}if(ix>=0)arr[ix]=o;else arr.push(o);GC.ev=arr;
 if(GC.x&&GC.x.ev)GC.x.ev=GC.x.ev.filter(function(z){return gcKey(z)!==gcKey(o);});gcSave();GIDX=null;}
function gcDropLocal(key){GC.ev=(GC.ev||[]).filter(function(z){return gcKey(z)!==key;});if(GC.x&&GC.x.ev)GC.x.ev=GC.x.ev.filter(function(z){return gcKey(z)!==key;});gcSave();GIDX=null;}
function gcErrMsg(e){e=String(e||'');if(/read-only/.test(e))return 'Google says that one can’t be changed from here';if(/Failed to fetch|NetworkError|Load failed/i.test(e))return 'You look offline, so Google wasn’t updated. Try again when you’re back online';return 'Google didn’t take that change ('+e.slice(0,60)+')';}
function gcSaveEvent(cal,v,old){var body={title:v.title,date:v.date,endDate:v.endDate&&v.endDate>v.date?v.endDate:'',time:normT(v.time),end:normT(v.end)};
 if(old){body.id=old.id;body.from=old.k;if(v.note!==(old.n||''))body.note=v.note;}else{body.note=v.note||'';body.repeat=v.repeat||'';body.until=v.repeat?v.until||'':'';}
 var tmp=null,oldKey=old?gcKey(old):null;
 /* show it right away; Google confirms a moment later */
 tmp={k:cal,id:old&&old.k===cal?old.id:'tmp'+uid(),t:body.title,d:body.date,ed:body.endDate||body.date,tm:body.time||undefined,et:body.time?(body.end||''):undefined,ad:body.time?undefined:1,n:v.note||'',pend:1};
 if(old&&old.k!==cal)gcDropLocal(oldKey);gcPutLocal(tmp);rerender();refreshDay();setSync('busy');
 return api('gcalPut',[cal,body]).then(function(o){if(gcKey(tmp)!==gcKey(o))gcDropLocal(gcKey(tmp));gcPutLocal(o);
   var pre=v.remind||'',R=gcPrefs().remind||{},ok=gcKey(o);if(oldKey&&oldKey!==ok&&R[oldKey]){gSetRemind(oldKey,'');}
   if((R[ok]||'')!==pre)gSetRemind(ok,pre);else gRemSync(ok,pre);
   setSync('ok');rerender();refreshDay();toast((old?'Updated in':'Added to')+' your '+gcName(cal)+' Google calendar ✓');if(pre)remNudge({remind:pre});return o;})
  .catch(function(e){gcDropLocal(gcKey(tmp));if(old)gcPutLocal(old);setSync('ok');rerender();refreshDay();toast(gcErrMsg(e));throw e;});}
function gcDelete(o){var key=gcKey(o);gcPend[key]='del';GIDX=null;rerender();refreshDay();var done=false;
 var t=setTimeout(go,4500);function go(){if(done)return;done=true;clearTimeout(t);window.removeEventListener('pagehide',go);
  api('gcalDel',[o.k,o.id]).then(function(){delete gcPend[key];gcDropLocal(key);if((gcPrefs().remind||{})[key])gSetRemind(key,'');rerender();})
   .catch(function(e){delete gcPend[key];GIDX=null;rerender();toast(gcErrMsg(e));});}
 window.addEventListener('pagehide',go);
 toast('Deleted from your '+gcName(o.k)+' Google calendar',function(){if(done)return;done=true;clearTimeout(t);window.removeEventListener('pagehide',go);delete gcPend[key];GIDX=null;rerender();refreshDay();});}
/* ---- the event dialog (planner + Google) ---- */
function calOpts(){var o=GCAL_KEYS.filter(function(k){return gcOk(k)&&gcCanWrite(k);}).map(function(k){return [k,'📆 '+gcName(k)];});return o.concat([['planner','🗒️ Just the planner']]);}
function editEvent(e,date){var isG=!!(e&&e.g),o=isG?e.g:null;if(o&&o.ro)return gcView(o);
 var isNew=!e||(!e.id&&!isG);e=e||{date:date||iso(today()),color:'mustard'};
 var vals=isG?{title:o.t,date:o.d,endDate:o.ed&&o.ed!==o.d?o.ed:'',time:o.tm||'',end:o.et||'',note:o.n||'',remind:e.remind||'',cal:o.k}:Object.assign({},e,{cal:isNew?gcLastCal():'planner',time:normT(e.time)||e.time||'',end:normT(e.end)||e.end||''});
 var fields=[{k:'title',label:'What’s happening?',ph:'Soccer practice'},{k:'cal',label:'Which calendar?',t:'chips',opts:calOpts()},{k:'date',label:(e.repeat?'Starts on':'Date'),t:'date'},{k:'endDate',label:'Ends on (optional, for multi-day)',t:'date'},
  {k:'time',label:'Start time (optional)',t:'time'},{k:'end',label:'End time (optional)',t:'time'}];
 if(!o||!o.rec)fields.push({k:'repeat',label:'Repeat',t:'select',opts:REPS},{k:'until',label:'Repeat until (optional)',t:'date'});
 fields.push({k:'remind',label:'🔔 Remind me',t:'select',opts:REM_EVT},{k:'color',label:'Color',t:'swatch'},{k:'note',label:'Notes',t:'area',ph:'Bring snacks'});
 form({title:isG?'Edit event':(e.id?'Edit event':'New event'),color:'var(--mustard)',required:'title',values:vals,fields:fields,
  onSave:function(v){var cal=v.cal||'planner';delete v.cal;if(!v.date)v.date=iso(today());if(v.endDate&&v.endDate<=v.date)v.endDate='';
   if(isNew){localStorage.setItem('gcLast',cal);if(gcPrefs().last!==cal)gcSetPrefs({last:cal});}
   if(cal!=='planner'){if(isG){gcSaveEvent(cal,v,o).catch(function(){});return;}
    var from=e.id?e:null;gcSaveEvent(cal,v,null).then(function(){if(from)remove('events',from.id,true);}).catch(function(){});return;}
   if(isG){toast('That one lives in Google. Pick Personal or Work to keep it there');return;}
   if(!v.repeat)v.until='';if(v.repeat)v.endDate='';var was=e.remind||'';save('events',Object.assign({},e,v));if(v.remind!==was)remNudge(v);},
  onDelete:isG?function(){gcDelete(o);}:(e.id?function(){remove('events',e.id);}:null)});
 var veil=document.querySelectorAll('.veil'),vv=veil[veil.length-1];if(!vv)return;var db=vv.querySelector('.db');
 if(isG){var hint=document.createElement('div');hint.className='ghint';hint.innerHTML='<span class="gbadge gc-'+o.k+'">'+esc(gcName(o.k))+'</span> Saved in Google Calendar · nobody gets emailed'+(o.rec?'<br>🔁 This repeats in Google — changes here apply to <b>this day only</b>.':'')+(e.dupes?'<br>Google has '+(e.dupes+1)+' copies of this event; the planner shows one.':'')+(o.u?' <a href="'+esc(o.u)+'" target="_blank" rel="noopener">Open in Google ↗</a>':'');db.insertBefore(hint,db.firstChild);}
 function sync(){var on=vv.querySelector('[data-k="cal"] .on'),c=on?on.getAttribute('data-v'):'planner',sw=vv.querySelector('[data-k="color"]');if(sw)sw.closest('.field').style.display=c==='planner'?'':'none';
  var rp=vv.querySelector('[data-k="repeat"]');if(rp&&isG)rp.closest('.field').style.display='none';}
 vv.addEventListener('click',function(ev){if(ev.target.closest('[data-k="cal"] button'))setTimeout(sync,0);});sync();}
function gcView(o){var key=gcKey(o),pre=(gcPrefs().remind||{})[key]||'',why={guest:'This is an invite from someone else, so it can only be changed in Google Calendar.',guests:'Other people are on this event, so it can only be changed in Google Calendar.',type:'Google made this one (like a birthday), so it can’t be changed here.',access:'You can see this calendar but not change it.'}[o.ro]||'';
 var b='<div class="gview"><div class="gvt">'+esc(o.t)+'</div><div class="gvm"><span class="gbadge gc-'+o.k+'">'+esc(gcName(o.k))+'</span> '+esc(gcWhen(o))+'</div>'+(o.l?'<div class="gvm">📍 '+esc(o.l)+'</div>':'')+(o.n?'<div class="gvn">'+esc(o.n)+'</div>':'')+
  '<label class="field"><span>🔔 Remind me</span><select data-gremind="'+esc(key)+'">'+REM_EVT.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===pre?' selected':'')+'>'+esc(c[1])+'</option>';}).join('')+'</select></label>'+
  '<div class="ghint">🔒 '+esc(why)+'</div></div>';
 sheet('Google Calendar event','var(--mustard)',b,(o.u?'<a class="btn soft sm" href="'+esc(o.u)+'" target="_blank" rel="noopener">Open in Google ↗</a>':'')+'<span class="sp"></span><button class="btn" data-x>Done</button>');}
function gcalClick(e,t){var el;
 if((el=t.closest('[data-ev^="g~"]'))){e.stopPropagation();var occ=GOCC[+el.getAttribute('data-ev').slice(2)];closeSheets();if(occ)editEvent(occ);return true;}
 if((el=t.closest('[data-gtog]'))){var k=el.getAttribute('data-gtog');gcHide[k]=!gcHide[k];if(!gcHide[k])delete gcHide[k];localStorage.setItem('gcHide',JSON.stringify(gcHide));GIDX=null;render();return true;}
 if(t.closest('[data-gsync]')){gcLoad().then(function(){if(!gcErr)toast('Google Calendar is up to date ✓');});render();return true;}
 return false;}
document.addEventListener('change',function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute('data-gremind')!=null){var k=t.getAttribute('data-gremind');gSetRemind(k,t.value);if(t.value)remNudge({remind:t.value});else toast('Reminder off');}});
function gcStart(){gcStyle();setTimeout(gcLoad,400);setInterval(function(){if(document.visibilityState==='visible')gcLoad();},4*60000);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&gcStale())gcLoad();});}

/* ---------------- events (delegated) ---------------- */
function pair(s){var p=s.split(':');return {c:p[0],id:p[1],f:p[2]};}
document.addEventListener('click',function(e){var t=e.target,el;if(remClick(e,t)||gcalClick(e,t)||tabClick(e,t))return;
 if((el=t.closest('[data-tab]'))){go(el.getAttribute('data-tab'));return;}
 if(t.closest('[data-custom]')||t.id==='dashcz'){openCz();return;}
 if((el=t.closest('[data-wstyle]'))){styleDialog(el.getAttribute('data-wstyle'));return;}
 if((el=t.closest('[data-wphoto]'))){photoDialog(el.getAttribute('data-wphoto'));return;}
 if((el=t.closest('[data-wsticker]'))){stickerDialog(el.getAttribute('data-wsticker'));return;}
 if((el=t.closest('[data-wquote]'))){quoteDialog(el.getAttribute('data-wquote'));return;}
 if((el=t.closest('[data-go]'))){go(el.getAttribute('data-go'));return;}
 if(t.closest('[data-openbell]')){openN();setTimeout(function(){$('#rtext').focus();},300);return;}
 if((el=t.closest('[data-mv]'))){var mv=el.getAttribute('data-mv').split(':');moveMobile(mv[0],+mv[1]);return;}
 if((el=t.closest('[data-wrm]'))){removeWidget(el.getAttribute('data-wrm'));return;}
 if((el=t.closest('[data-tog]'))){var p=pair(el.getAttribute('data-tog')),it=find(p.c,p.id);if(it){var c=Object.assign({},it);c[p.f]=!it[p.f];save(p.c,c);}return;}
 if((el=t.closest('[data-tog2]'))){var p2=pair(el.getAttribute('data-tog2')),i2=find(p2.c,p2.id);if(i2){save(p2.c,Object.assign({},i2,{done:true}));toast('Nice – checked off',function(){save(p2.c,Object.assign({},i2,{done:false}));});}return;}
 if((el=t.closest('[data-rm]'))){e.stopPropagation();var r=pair(el.getAttribute('data-rm'));remove(r.c,r.id);if(r.c==='reminders')drawRems();return;}
 if((el=t.closest('[data-paid]'))){var b=find('bills',el.getAttribute('data-paid'));if(b){var was=billPaid(b);save('bills',Object.assign({},b,{paidFor:was?'':monthKey()}));if(!was)toast(b.name+' marked paid 🌿');}return;}
 if((el=t.closest('[data-ev]'))){e.stopPropagation();var ev=find('events',el.getAttribute('data-ev'));if(ev)editEvent(ev);return;}
 if((el=t.closest('[data-edit]'))){var q=pair(el.getAttribute('data-edit')),x=find(q.c,q.id);if(!x)return;({todos:editTodo,groceries:editGrocery,bills:editBill,brain:editBrain,kids:editKid})[q.c](x);return;}
 if((el=t.closest('[data-day]'))){editEvent(null,el.getAttribute('data-day'));return;}
 if((el=t.closest('[data-new]'))){var n=el.getAttribute('data-new');({todo:function(){editTodo();},event:function(){editEvent();},bill:function(){editBill();},list:function(){editList();}})[n]();return;}
 if((el=t.closest('[data-newkid]'))){editKid(null,el.getAttribute('data-newkid'));return;}
 if((el=t.closest('[data-addbtn]'))){var inp=el.parentNode.querySelector('input');quickAdd(inp.getAttribute('data-add'),inp.value,inp);inp.value='';inp.focus();return;}
 if((el=t.closest('[data-clear]'))){var col=el.getAttribute('data-clear'),f=col==='groceries'?'got':'done',gone=DB[col].filter(function(x){return x[f];});gone.forEach(function(x){remove(col,x.id,true);});toast('Cleared '+gone.length,function(){gone.forEach(function(x){save(col,x);});});return;}
 if((el=t.closest('[data-mw]'))){mealWeek+=+el.getAttribute('data-mw');render();return;}
 if((el=t.closest('[data-co]'))){calOff+=+el.getAttribute('data-co');render();return;}
 if((el=t.closest('[data-cm]'))){calMode=el.getAttribute('data-cm');calOff=0;localStorage.setItem('calMode',calMode);render();return;}
 if((el=t.closest('[data-editlist]'))){var l=find('lists',el.getAttribute('data-editlist'));if(l)editList(l);return;}
 if((el=t.closest('[data-li]'))){var a=el.getAttribute('data-li').split(':'),L=find('lists',a[0]);if(L){L=JSON.parse(JSON.stringify(L));L.items.forEach(function(x){if(x.id===a[1])x.done=!x.done;});save('lists',L);}return;}
 if((el=t.closest('[data-lie]'))){var a2=el.getAttribute('data-lie').split(':'),L2=find('lists',a2[0]);if(L2){var it2=(L2.items||[]).filter(function(x){return x.id===a2[1];})[0];if(it2)editListItem(L2,it2);}return;}
 if((el=t.closest('[data-lirm]'))){var a3=el.getAttribute('data-lirm').split(':'),L3=find('lists',a3[0]);if(L3){var old=L3;L3=JSON.parse(JSON.stringify(L3));L3.items=L3.items.filter(function(x){return x.id!==a3[1];});save('lists',L3);toast('Removed',function(){save('lists',old);});}return;}
 if((el=t.closest('[data-liclear]'))){var L4=find('lists',el.getAttribute('data-liclear'));if(L4){var o4=L4;L4=JSON.parse(JSON.stringify(L4));L4.items=L4.items.filter(function(x){return !x.done;});save('lists',L4);toast('Cleared',function(){save('lists',o4);});}return;}
 if((el=t.closest('[data-made]'))){var me=mealFor(el.getAttribute('data-made'));if(me)save('meals',Object.assign({},me,{made:!me.made}));return;}
 if(t.id==='capbtn'){var v=$('#cap').value.trim();if(v){save('brain',{text:v,done:false,color:NOTE_COLORS[DB.brain.length%NOTE_COLORS.length]});toast('Saved to your brain dump 💡');}return;}
});
document.addEventListener('keydown',function(e){var t=e.target;
 if(e.key==='Enter'&&t.getAttribute&&t.getAttribute('data-add')){e.preventDefault();var v=t.value;t.value='';quickAdd(t.getAttribute('data-add'),v,t);return;}
 if(e.key==='Enter'&&t.classList&&t.classList.contains('din')){e.preventDefault();t.blur();return;}
 if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&t.id==='cap'){$('#capbtn').click();}});
document.addEventListener('change',function(e){var t=e.target;if(t.classList&&t.classList.contains('din')){var ds=t.getAttribute('data-din'),v=t.value.trim(),me=mealFor(ds);
 if(me&&!v){remove('meals',me.id,true);return;}if(!v)return;if(me&&me.dinner===v)return;save('meals',Object.assign({id:'d'+ds.replace(/-/g,''),date:ds,made:false},me||{},{dinner:v}));}});

/* ---------------- lock screen ---------------- */
function showLock(){if($('#lock'))return;var d=document.createElement('div');d.id='lock';d.className='lock';
 d.innerHTML='<div class="card"><svg style="width:70px;height:70px"><use href="#i-cup"/></svg><h2>Welcome back</h2><p>Type your planner code to unlock.</p><input class="cozy" id="lockin" placeholder="planner code" autocapitalize="off" autocomplete="off"><button class="btn" id="lockbtn" style="width:100%">Unlock</button></div>';
 document.body.appendChild(d);var go2=function(){var v=$('#lockin').value.trim();if(v){localStorage.setItem('pk',v);location.reload();}};$('#lockbtn').onclick=go2;$('#lockin').onkeydown=function(e){if(e.key==='Enter')go2();};}

/* ---------------- boot ---------------- */
function boot(){try{applyLook();}catch(e){console.warn('look',e);}buildNav();setCollapsed(!!localStorage.getItem('collapsed'));
 $('#tog').onclick=function(){setCollapsed(!document.body.classList.contains('collapsed'));};
 $('#menu').onclick=function(){document.body.classList.add('drawer');$('#shade').classList.add('on');};
 $('#shade').onclick=function(){document.body.classList.remove('drawer');closeN();closeCz();$('#shade').classList.remove('on','light');};
 $('#bellbtn').onclick=openN;$('#nclose').onclick=closeN;$('#nen').onclick=enablePush;$('#ntest').onclick=testPush;$('#radd').onclick=addRem;
 render();nStatus();
 if(!PK){showLock();return;}
 loadAll();loadSettings();gcStart();
 api('getLayout').then(function(L){if(L&&L.widgets&&L.widgets.length&&(L.t||0)>=(LAYOUT.t||0)&&JSON.stringify(L.widgets)!==JSON.stringify(LAYOUT.widgets)){LAYOUT=L;localStorage.setItem('layout2',JSON.stringify(LAYOUT));if(cur==='dashboard'){killGrid();render();}}}).catch(function(){});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function(){});
 setInterval(function(){if(document.visibilityState==='visible'&&!OUT.length)loadAll();},5*60000);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&loaded&&!OUT.length)loadAll();});}
window.__planner={GC:function(){return GC;},gcLoad:gcLoad,hiddenCopies:hiddenCopies,S:function(){return S;},IMGS:function(){return IMGS;},openCz:openCz,DB:DB,LAYOUT:function(){return LAYOUT;},go:go,version:VERSION,outbox:function(){return OUT;}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
