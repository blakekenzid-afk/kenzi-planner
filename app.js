/* Kenzi's Planner v2 — Autumn Coffeehouse. Data lives in Firestore through the planner API. */
(function(){
'use strict';
var VERSION='2.0.1';
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
function fmtTime(t){if(!t)return '';var p=t.split(':'),h=+p[0],m=p[1];return (h%12||12)+(m!=='00'?':'+m:'')+(h<12?'am':'pm');}
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
 OUT.push({op:'put',c:c,item:copy});persist();rerender();flush();return copy;}
function remove(c,id,silent){var old=find(c,id);applyOp({op:'del',c:c,id:id});OUT.push({op:'del',c:c,id:id});persist();rerender();flush();
 if(old&&!silent)toast('Removed',function(){save(c,old);});}
var flushing=false,retryT=null;
function setSync(s){var el=$('#sync');if(!el)return;el.className='sync'+(s==='busy'?' busy':s==='off'?' off':'');el.querySelector('span').textContent=s==='busy'?'saving…':s==='off'?'offline – will retry':'saved';}
function flush(){if(flushing||!PK)return;if(!OUT.length){setSync('ok');return;}flushing=true;setSync('busy');var op=OUT[0];
 var p=op.op==='put'?api('put',[op.c,op.item]):api('del',[op.c,op.id]);
 p.then(function(){OUT.shift();persist();flushing=false;flush();})
  .catch(function(e){flushing=false;setSync('off');clearTimeout(retryT);retryT=setTimeout(flush,15000);if(e==='locked')return;console.warn('save failed',e);});}
window.addEventListener('online',flush);
var loaded=false;
function loadAll(){setSync('busy');return api('listAll').then(function(r){COLS.forEach(function(c){DB[c]=r[c]||[];});OUT.forEach(applyOp);persist();loaded=true;rerender();setSync(OUT.length?'busy':'ok');flush();})
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
function buildNav(){$('#nav').innerHTML=TABS.map(function(t){return '<button class="tab'+(t[0]===cur?' on':'')+'" data-tab="'+t[0]+'" title="'+esc(t[1])+'"><svg><use href="#'+t[2]+'"/></svg><span>'+esc(t[1])+'</span></button>';}).join('')+
 '<button class="tab soon" data-soon title="Make it yours"><svg><use href="#i-spark"/></svg><span>Make it yours ✨<em>coming soon</em></span></button>';}
function go(t){if(t!==cur&&cur==='dashboard')killGrid();cur=t;localStorage.setItem('tab',t);try{history.replaceState(null,'','#'+t);}catch(e){}document.body.classList.remove('drawer');$('#shade').classList.remove('on');buildNav();render();window.scrollTo(0,0);}
function setCollapsed(c){document.body.classList.toggle('collapsed',c);$('#tog').textContent=c?'»':'«';localStorage.setItem('collapsed',c?'1':'');}

/* ---------------- render ---------------- */
var rq=null;function rerender(){if(rq)return;rq=requestAnimationFrame(function(){rq=null;if(cur==='dashboard'&&(grid||stackMode))refreshWidgets();else render(true);});}
function keepFocus(fn){var a=document.activeElement,key=a&&a.getAttribute&&(a.getAttribute('data-add')?'[data-add="'+a.getAttribute('data-add')+'"]'+(a.getAttribute('data-list')?'[data-list="'+a.getAttribute('data-list')+'"]':'')+(a.getAttribute('data-kid')?'[data-kid="'+a.getAttribute('data-kid')+'"]':''):null),
 wid=a&&a.closest&&a.closest('.grid-stack-item')?a.closest('.grid-stack-item').getAttribute('gs-id'):null,sx=window.scrollY;fn();
 if(key){var sel=(wid?'.grid-stack-item[gs-id="'+wid+'"] ':'')+key,el=document.querySelector(sel);if(el){el.focus({preventScroll:true});}}window.scrollTo(0,sx);}
function render(soft){var t=TABS.filter(function(x){return x[0]===cur;})[0];document.body.classList.toggle('dash',cur==='dashboard');$('#ptitle').textContent=t[1];
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
 if(calMode==='month'){var base=new Date(t.getFullYear(),t.getMonth()+calOff,1),start=monday(base);
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
 reminders:{name:'Upcoming reminders',em:'⏰',bg:'#E6E4C6',hdr:'olive',desc:'what I’ll ping you about',w:3,h:4}
};
var DEFAULT_LAYOUT=[{id:'w-welcome',type:'welcome',x:0,y:0,w:3,h:4},{id:'w-week',type:'week',x:3,y:0,w:6,h:4},{id:'w-todo',type:'todo',x:9,y:0,w:3,h:4},
 {id:'w-meals',type:'meals',x:0,y:4,w:3,h:5},{id:'w-grocery',type:'grocery',x:3,y:4,w:3,h:5},{id:'w-bills',type:'bills',x:6,y:4,w:3,h:5},{id:'w-brain',type:'brain',x:9,y:4,w:3,h:5},
 {id:'w-rem',type:'reminders',x:0,y:9,w:4,h:3}];
var LAYOUT=null;try{LAYOUT=JSON.parse(localStorage.getItem('layout2')||'null');}catch(e){}
if(!LAYOUT||!LAYOUT.widgets)LAYOUT={widgets:DEFAULT_LAYOUT.slice(),t:0};
var grid=null,layoutT=null,arranging=false;
function saveLayout(){LAYOUT.t=Date.now();localStorage.setItem('layout2',JSON.stringify(LAYOUT));clearTimeout(layoutT);layoutT=setTimeout(function(){api('saveLayout',[LAYOUT]).catch(function(){});},900);}
function widgetHead(w){var d=WDEF[w.type],extra='';
 if(w.type==='week')extra='<button class="ib" data-new="event" title="New event">+</button>';
 if(w.type==='reminders')extra='<button class="ib" data-openbell title="Add a reminder">+</button>';
 if(w.type==='bills')extra='<button class="ib" data-go="bills" title="Open Bills">↗</button>';
 var title={week:'Weekly calendar',todo:'To-do checklist',grocery:'Grocery list',meals:'This Week’s Meals',bills:'Bills Due',brain:'Brain Dump',reminders:'Reminders',welcome:''}[w.type];
 return '<div class="wh drag '+(d.hdr||'')+'">'+extra+'<span class="t">'+esc(title)+'</span><button class="ib wrm" data-wrm="'+w.id+'" title="Remove widget">✕</button></div>';}
function widgetBody(type){var td=iso(today());
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
 el.innerHTML='<div class="grid-stack-item-content"><div class="card '+(w.type==='brain'?'stickyc ':'')+(w.type==='welcome'?'welcome':'')+'" data-wtype="'+w.type+'">'+(w.type==='welcome'?'<div class="wh drag oat" style="background:transparent;border:0;padding:6px 10px 0;min-height:30px"><span class="t"></span><button class="ib wrm" data-wrm="'+w.id+'" title="Remove widget">✕</button></div>':widgetHead(w))+(stackMode&&arranging?'<div class="mv"><button class="round" data-mv="'+w.id+':-1" aria-label="Move up">↑</button><button class="round" data-mv="'+w.id+':1" aria-label="Move down">↓</button></div>':'')+'<div class="bd">'+widgetBody(w.type)+'</div>'+(['meals','bills'].indexOf(w.type)>=0?'<svg class="cup"><use href="#i-cup"/></svg>':'')+'</div></div>';
 return el;}
function isPhone(){return window.innerWidth<=760;}
var stackMode=false;
function mobileOrder(){var ids=LAYOUT.widgets.slice().sort(function(a,b){return ((a.y==null?999:a.y)-(b.y==null?999:b.y))||((a.x||0)-(b.x||0));}).map(function(w){return w.id;});
 var m=(LAYOUT.mobile||[]).filter(function(id){return ids.indexOf(id)>=0;});ids.forEach(function(id){if(m.indexOf(id)<0)m.push(id);});return m;}
function renderDash(){var v=$('#view');stackMode=isPhone();
 v.innerHTML='<div class="dashbar"><button class="btn" id="addw">+ Add widget</button><button class="btn soft sm'+(stackMode?'':' hide')+'" id="arr">'+(arranging?'✓ Done':'↕ Rearrange')+'</button><span class="hint" id="dhint">'+(stackMode?(arranging?'use the arrows to move cards':''):'drag a card by its top strip · pull the corner to resize')+'</span></div>'+(stackMode?'<div class="stack'+(arranging?' arranging':'')+'" id="gs"></div>':'<div class="grid-stack" id="gs"></div>');
 var gsEl=$('#gs');$('#addw').onclick=pickWidget;
 if(stackMode){mobileOrder().forEach(function(id){var w=LAYOUT.widgets.filter(function(x){return x.id===id;})[0];if(w&&WDEF[w.type])gsEl.appendChild(widgetEl(w));});
  $('#arr').onclick=function(){arranging=!arranging;renderDash();};grid=null;return;}
 LAYOUT.widgets.forEach(function(w){if(WDEF[w.type])gsEl.appendChild(widgetEl(w));});
 grid=GridStack.init({column:12,cellHeight:78,margin:0,handle:'.wh.drag',float:false,animate:true,resizable:{handles:'se'},draggable:{cancel:'button,input,.ib'},
  columnOpts:{breakpoints:[{w:560,c:1},{w:1000,c:6}]}},gsEl);
 grid.on('change',function(){if(grid.getColumn()!==12)return;grid.engine.nodes.forEach(function(n){var w=LAYOUT.widgets.filter(function(x){return x.id===n.id;})[0];if(w){w.x=n.x;w.y=n.y;w.w=n.w;w.h=n.h;}});saveLayout();});}
function moveMobile(id,dir){var m=mobileOrder(),i=m.indexOf(id),j=i+dir;if(i<0||j<0||j>=m.length)return;m[i]=m[j];m[j]=id;LAYOUT.mobile=m;saveLayout();renderDash();
 var el=document.querySelector('[gs-id="'+id+'"]');if(el)el.scrollIntoView({block:'center'});}
window.addEventListener('resize',function(){clearTimeout(window._pm);window._pm=setTimeout(function(){if(cur==='dashboard'&&isPhone()!==stackMode){killGrid();renderDash();}},250);});
function killGrid(){if(grid){try{grid.destroy(false);}catch(e){}grid=null;}stackMode=false;}
function refreshWidgets(){keepFocus(function(){document.querySelectorAll('#gs .card[data-wtype]').forEach(function(c){var b=c.querySelector('.bd');var a=document.activeElement;if(a&&b.contains(a)&&a.classList.contains('din'))return;b.innerHTML=widgetBody(c.getAttribute('data-wtype'));});});}
function pickWidget(){var veil=document.createElement('div');veil.className='veil';
 veil.innerHTML='<div class="dlg"><div class="dh2"><span>Add a widget</span><button class="ib" data-x>✕</button></div><div class="db"><div class="picks">'+Object.keys(WDEF).map(function(k){var d=WDEF[k];return '<button class="pk" data-pk="'+k+'"><span class="em" style="background:'+d.bg+'">'+d.em+'</span><span>'+esc(d.name)+'<small>'+esc(d.desc)+'</small></span></button>';}).join('')+'</div></div><div class="df"><span class="sp"></span><button class="btn soft sm" data-x>Close</button></div></div>';
 document.body.appendChild(veil);veil.addEventListener('click',function(e){if(e.target===veil||e.target.closest('[data-x]'))return veil.remove();var p=e.target.closest('[data-pk]');if(!p)return;veil.remove();
  var t=p.getAttribute('data-pk'),w={id:'w-'+uid(),type:t,w:WDEF[t].w,h:WDEF[t].h};LAYOUT.widgets.push(w);var el;
  if(grid){el=widgetEl(w);$('#gs').appendChild(el);grid.makeWidget(el);var n=el.gridstackNode;if(n){w.x=n.x;w.y=n.y;}}else{w.y=999;renderDash();el=document.querySelector('[gs-id="'+w.id+'"]');}saveLayout();setTimeout(function(){el&&el.scrollIntoView({behavior:'smooth',block:'center'});},100);toast(WDEF[t].name+' added ✨');});}
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

/* ---------------- events (delegated) ---------------- */
function pair(s){var p=s.split(':');return {c:p[0],id:p[1],f:p[2]};}
document.addEventListener('click',function(e){var t=e.target,el;
 if((el=t.closest('[data-tab]'))){go(el.getAttribute('data-tab'));return;}
 if(t.closest('[data-soon]')){toast('Backgrounds, fonts & colors are coming soon ✨');return;}
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
function boot(){buildNav();setCollapsed(!!localStorage.getItem('collapsed'));
 $('#tog').onclick=function(){setCollapsed(!document.body.classList.contains('collapsed'));};
 $('#menu').onclick=function(){document.body.classList.add('drawer');$('#shade').classList.add('on');};
 $('#shade').onclick=function(){document.body.classList.remove('drawer');closeN();$('#shade').classList.remove('on');};
 $('#bellbtn').onclick=openN;$('#nclose').onclick=closeN;$('#nen').onclick=enablePush;$('#ntest').onclick=testPush;$('#radd').onclick=addRem;
 render();nStatus();
 if(!PK){showLock();return;}
 loadAll();
 api('getLayout').then(function(L){if(L&&L.widgets&&L.widgets.length&&(L.t||0)>=(LAYOUT.t||0)&&JSON.stringify(L.widgets)!==JSON.stringify(LAYOUT.widgets)){LAYOUT=L;localStorage.setItem('layout2',JSON.stringify(LAYOUT));if(cur==='dashboard'){killGrid();render();}}}).catch(function(){});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function(){});
 setInterval(function(){if(document.visibilityState==='visible'&&!OUT.length)loadAll();},5*60000);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&loaded&&!OUT.length)loadAll();});}
window.__planner={DB:DB,LAYOUT:function(){return LAYOUT;},go:go,version:VERSION,outbox:function(){return OUT;}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
