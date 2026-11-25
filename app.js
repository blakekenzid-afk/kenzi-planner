/* Kenzi's Home Planner v3 — NOVA style (same look as her Pre-K Planner), home content.
   Data: the same Firestore collections as v2 (groceries, meals, todos, events, reminders, brain, bills, lists, kids)
   through the Apps Script "Home Screen API". New sections (cleaning, appointments, birthdays, projects, library,
   budget, dashboard notes, settings) are docs in "lists" with kind:"home" (v2's Lists page hides any list with a kind).
   Pre-K Planner docs (kind:"prek", id prek_…) are dropped on load and never shown or written here. */
(function(){'use strict';
var VERSION='3.0.1';
var API=window.PLANNER_API_OVERRIDE||'https://script.google.com/macros/s/AKfycby2K77ahxWPKILsKQNSUwa199QUB7uymfJbCbZUT9eRmwBT-8f6wZW-WVovfLPS7cZ4bQ/exec';
var COLS=['groceries','meals','todos','events','reminders','brain','bills','lists','kids'];
var LSDB='h3db',LSOUT='h3out',LSUI='h3ui';
var STANDALONE=(window.navigator.standalone===true)||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);

/* ---------- key (shared with v2 on this site: localStorage "pk") ---------- */
var K=localStorage.getItem('pk')||'';
(function(){var m=(location.search+location.hash).match(/[?&#]k=([^&#]+)/);
 if(m){K=decodeURIComponent(m[1]);localStorage.setItem('pk',K);
  var keep=!STANDALONE&&/iPhone|iPad|iPod/.test(navigator.userAgent);
  try{history.replaceState(null,'',location.pathname+(keep?'?k='+encodeURIComponent(K):'')+(location.hash.replace(/[#&]?k=[^&#]+/,'')||''));}catch(e){}}})();

/* ---------- helpers ---------- */
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function pad(n){return (n<10?'0':'')+n;}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function today(){return iso(new Date());}
function nowTime(){var d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes());}
function pd(s){if(!s)return null;var p=String(s).split('-');if(p.length<3)return null;return new Date(+p[0],+p[1]-1,+p[2]);}
function addDays(s,n){var d=pd(s);d.setDate(d.getDate()+n);return iso(d);}
function monday(s){var d=pd(s||today()),w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return iso(d);}
function sunday(s){var d=pd(s||today());d.setDate(d.getDate()-d.getDay());return iso(d);}
function daysBetween(a,b){return Math.round((pd(b)-pd(a))/864e5);}
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],DOWL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtD(s){var d=pd(s);return d?DOW[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate():'';}
function fmtLong(s){var d=pd(s);return d?DOWL[d.getDay()]+', '+MON[d.getMonth()]+' '+d.getDate():'';}
function fmtMD(s){var d=pd(s);return d?MON[d.getMonth()].slice(0,3)+' '+d.getDate():'';}
function nice(s){var d=pd(s);if(!d)return '';var n=daysBetween(today(),s);if(n===0)return 'Today';if(n===1)return 'Tomorrow';if(n===-1)return 'Yesterday';return DOW[d.getDay()]+' '+MON[d.getMonth()].slice(0,3)+' '+d.getDate();}
function normT(t){var m=String(t||'').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);if(!m)return '';var h=+m[1];if(m[3]){var pm=/p/i.test(m[3]);if(h===12)h=0;if(pm)h+=12;}return h>23?'':pad(h)+':'+m[2];}
function fmtT(t){t=normT(t)||'';if(!t)return '';var p=t.split(':'),h=+p[0],m=p[1];return (h%12||12)+(m!=='00'?':'+m:'')+(h<12?' am':' pm');}
function fmtW(ms){var d=new Date(ms);return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function first(s,n){s=String(s||'').replace(/\s+/g,' ').trim();return s.length>(n||90)?s.slice(0,(n||90)-1)+'…':s;}
function num(v){var n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));return isNaN(n)?0:n;}
function money(v){var n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));if(isNaN(n))return '';return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/\.00$/,'');}
function monthKey(s){return (s||today()).slice(0,7);}
function clone(o){return JSON.parse(JSON.stringify(o));}
function hexRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');var n=parseInt(h,16);if(isNaN(n)||h.length!==6)return [200,200,200];return [n>>16&255,n>>8&255,n&255];}
function rgbHex(a){return '#'+a.map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?'0':'')+v.toString(16);}).join('').toUpperCase();}
function mix(a,b,t){var x=hexRgb(a),y=hexRgb(b);return rgbHex([x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t]);}
function lum(h){var c=hexRgb(h).map(function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
/* a dark partner for any pastel: darken until white text reads well on it */
function deepen(c){var d=c;for(var i=1;i<=12;i++){d=mix(c,'#1E1A30',i*.07);if(contrast(d,'#FFFFFF')>=5.2&&contrast(d,c)>=3.6)break;}return d;}
function pastel(c){return lum(c)<.55?mix(c,'#FFFFFF',.55):c;}

/* ---------- icons ---------- */
var IC={
 home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 grid:'<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
 start:'<circle cx="12" cy="12" r="9"/><path d="m10 8.2 5.6 3.8-5.6 3.8z"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
 cart:'<path d="M3 4h2.2l2.3 11h10.8l2.2-8H7"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
 dollar:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
 sparkle:'<path d="M12 3c.8 4.4 2.6 6.2 7 7-4.4.8-6.2 2.6-7 7-.8-4.4-2.6-6.2-7-7 4.4-.8 6.2-2.6 7-7z"/><path d="M19 16c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6z"/>',
 todo:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
 bulb:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
 bag:'<path d="M6 8h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 20z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M9.5 13h5"/>',
 steth:'<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
 gift:'<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8c-1.5-3.5-6-4-6-1.2C6 8 8 8 12 8zM12 8c1.5-3.5 6-4 6-1.2C18 8 16 8 12 8z"/>',
 hammer:'<path d="M14 6.5 17.5 3l3.5 3.5-3.5 3.5"/><path d="m15.7 8.3-11 11a1.6 1.6 0 0 0 2.3 2.3l11-11"/><path d="M11 5l3-3"/>',
 book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M10 3v7l2.5-1.8L15 10V3"/>',
 list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7"/>',
 star:'<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
 pen:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
 link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
 up:'<path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
 bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
 palette:'<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
 chevL:'<path d="m14.5 6-6 6 6 6"/>',chevR:'<path d="m9.5 6 6 6-6 6"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 sync:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>',
 google:'<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.3A9 9 0 0 0 12 21z"/><path d="M6.9 13.7a5.4 5.4 0 0 1 0-3.4V8H3.9a9 9 0 0 0 0 8z"/><path d="M12 6.5c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.9 8l3 2.3C7.6 8.1 9.6 6.5 12 6.5z"/>'};
function ic(n,sw){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(sw||2)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC[n]||'')+'</svg>';}

/* ---------- sections (each one has its own pastel c and deep partner d) ---------- */
var S=[
 {id:'start',ini:'GS',rail:'Start',tile:'Start Here',title:'Getting Started',over:'Getting started',sub:'How your planner works, notifications and backup',c:'#CDD3EE',d:'#3B4170',icon:'start'},
 {id:'calendar',ini:'CA',rail:'Calendar',tile:'Calendar',title:'Calendar',over:'Calendar',sub:'Your planner plus your Personal and Work Google Calendars',c:'#FCE3A3',d:'#7A5C0E',icon:'cal'},
 {id:'meals',ini:'MG',rail:'Meals',tile:'Meals & Groceries',title:'Meals & Groceries',over:'Meals & groceries',sub:'Plan dinners, keep the grocery list, save go-to meals',c:'#CFE5C6',d:'#3E6B35',icon:'cart'},
 {id:'bills',ini:'BB',rail:'Bills',tile:'Bills & Budget',title:'Bills & Budget',over:'Bills & budget',sub:'What’s due, what’s paid, and where the money goes',c:'#DDEBB8',d:'#4E6A1F',icon:'dollar'},
 {id:'cleaning',ini:'CL',rail:'Cleaning',tile:'Cleaning',title:'Cleaning Routine',over:'Cleaning',sub:'Room by room — check it off and it comes back when it’s due',c:'#C6E2F5',d:'#2A6283',icon:'sparkle'},
 {id:'todo',ini:'TD',rail:'To-Do',tile:'To-Do',title:'To-Do List',over:'To-do',sub:'Check it off — repeating ones come back on their own',c:'#F9CDB8',d:'#94492A',icon:'todo'},
 {id:'brain',ini:'BD',rail:'Brain',tile:'Brain Dump',title:'Brain Dump',over:'Brain dump',sub:'Get it out of your head — sort it later',c:'#E2D2F4',d:'#5E3A85',icon:'bulb'},
 {id:'kids',ini:'KS',rail:'Kids',tile:'Kids & School',title:'Kids & School',over:'Kids & school',sub:'Weston and Holden — forms, dates and things to bring',c:'#F7C6BA',d:'#7A3A2C',icon:'bag'},
 {id:'appts',ini:'AP',rail:'Appts',tile:'Appointments',title:'Appointments',over:'Appointments',sub:'Doctor, dentist, haircuts and everything with a time',c:'#B8E2E6',d:'#1D6670',icon:'steth'},
 {id:'bdays',ini:'BG',rail:'Birthdays',tile:'Birthdays & Gifts',title:'Birthdays & Gifts',over:'Birthdays & gifts',sub:'Never miss a birthday — gift ideas, budget and status',c:'#F6C6DA',d:'#8E3560',icon:'gift'},
 {id:'projects',ini:'HP',rail:'Projects',tile:'Home Projects',title:'Home Projects',over:'Home projects',sub:'Ideas, plans, steps and supplies — plus your checklists',c:'#FBD3AE',d:'#8F4F1A',icon:'hammer'},
 {id:'lib',ini:'RL',rail:'Library',tile:'Resource Library',title:'Resource Library',over:'Resource library',sub:'Links, recipes, manuals and printables, all in one place',c:'#EEDDC4',d:'#7A5A2E',icon:'book'},
 {id:'index',ini:'IX',rail:'Index',tile:'Index',title:'Index',over:'Every page',sub:'Tap any entry to jump straight to that page',c:'#D9CFF2',d:'#5B4B8A',icon:'list'}];
var DEFCOL={};S.forEach(function(s){DEFCOL[s.id]={c:s.c,d:s.d,title:s.title,rail:s.rail,tile:s.tile,ini:s.ini};});
var SM={};S.forEach(function(s){SM[s.id]=s;});
var HOME={id:'home',ini:'',rail:'Home',title:'Home Dashboard',over:'Home',sub:'Your command center — tap any tile to jump in',c:'#BFE3D6',d:'#2C6B55',icon:'grid'};
var DEFHOME={c:HOME.c,d:HOME.d,title:HOME.title};
var ORDER=S.map(function(s){return s.id;});
function rowColor(c){return mix(c,'#ffffff',.22);}
function vars(s){return '--c:'+s.c+';--d:'+s.d+';--row:'+rowColor(s.c)+';';}

/* ---------- local store + sync (same shapes as v2) ---------- */
var DB={},OUT=[],UI={};COLS.forEach(function(c){DB[c]=[];});
function isPrek(d){return !!d&&((typeof d.id==='string'&&d.id.indexOf('prek_')===0)||d.kind==='prek');}
try{var _c=JSON.parse(localStorage.getItem(LSDB)||'null');if(_c)COLS.forEach(function(c){DB[c]=(_c[c]||[]).filter(function(d){return !isPrek(d);});});}catch(e){}
try{OUT=JSON.parse(localStorage.getItem(LSOUT)||'[]')||[];}catch(e){OUT=[];}
try{UI=JSON.parse(localStorage.getItem(LSUI)||'{}')||{};}catch(e){UI={};}
function persist(){try{localStorage.setItem(LSDB,JSON.stringify(DB));localStorage.setItem(LSOUT,JSON.stringify(OUT));}catch(e){}}
function saveUI(){try{localStorage.setItem(LSUI,JSON.stringify(UI));}catch(e){}}
function api(fn,args){return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({k:K,fn:fn,args:args||[]})})
 .then(function(r){return r.json();}).then(function(j){if(!j.ok){if(j.e==='locked'){locked=true;render();}throw j.e;}return j.r;});}
var locked=false,loaded=false,flushing=false,retryT=null,loadingP=null;
function setSync(s){var el=$('#sync');if(!el)return;el.className='sync'+(s==='busy'||s==='load'?' busy':s==='off'?' off':'');
 el.querySelector('span').textContent=s==='busy'?'saving…':s==='off'?'offline – will retry':s==='load'?'syncing…':'saved';}
function find(c,id){var a=DB[c];for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function applyOp(o){var a=DB[o.c];if(!a)return;if(o.op==='put'){for(var i=0;i<a.length;i++)if(a[i].id===o.item.id){a[i]=o.item;return;}a.push(o.item);}else DB[o.c]=a.filter(function(x){return x.id!==o.id;});}
var hooks=[];
function save(c,item,quiet){if(isPrek(item))return item;if(!item.id)item.id=uid();if(!item.created)item.created=Date.now();if(c==='lists'&&item.kind==='home')item.updated=Date.now();var cp=clone(item);
 applyOp({op:'put',c:c,item:cp});OUT=OUT.filter(function(o,i){return (i===0&&flushing)||!(o.op==='put'&&o.c===c&&o.item.id===cp.id);});OUT.push({op:'put',c:c,item:cp});persist();
 hooks.forEach(function(h){h(c,cp,false);});if(!quiet)render();flush();return cp;}
function remove(c,id,quiet){var old=find(c,id);applyOp({op:'del',c:c,id:id});OUT=OUT.filter(function(o,i){return (i===0&&flushing)||!(o.op==='put'&&o.c===c&&o.item.id===id);});OUT.push({op:'del',c:c,id:id});persist();
 if(old)hooks.forEach(function(h){h(c,old,true);});if(!quiet)render();flush();}
function flush(){if(flushing||!K||locked)return;if(!OUT.length){setSync('ok');return;}flushing=true;setSync('busy');var o=OUT[0];
 var p=o.op==='put'?api('put',[o.c,o.item]):api('del',[o.c,o.id]);
 p.then(function(){OUT.shift();persist();flushing=false;flush();})
  .catch(function(e){flushing=false;setSync('off');clearTimeout(retryT);retryT=setTimeout(flush,15000);console.warn('save failed',e);});}
var onLoaded=[];
function load(){if(!K)return Promise.resolve();if(loadingP)return loadingP;setSync('load');
 loadingP=api('listAll').then(function(r){COLS.forEach(function(c){DB[c]=(r[c]||[]).filter(function(d){return !isPrek(d);});});OUT.forEach(applyOp);persist();loaded=true;locked=false;loadingP=null;
  onLoaded.forEach(function(f){try{f();}catch(e){console.warn(e);}});
  if(!$('#sheet.on')&&!busyTyping())render();setSync(OUT.length?'busy':'ok');flush();})
 .catch(function(e){loadingP=null;setSync('off');if(e!=='locked')toast('Showing your saved copy — I’ll sync when I can');});return loadingP;}
function busyTyping(){var a=document.activeElement;return !!(a&&a.closest&&(a.closest('[data-note]')||a.closest('.din')||a.id==='cap'||a.id==='libq'||a.id==='bq'||a.closest('.qadd')));}
window.addEventListener('online',flush);

/* home docs: kind "home" in lists, {id:'h3_<sec>_<uid>', kind:'home', sec, f:{…}} */
function hdocs(sec){return DB.lists.filter(function(d){return d.kind==='home'&&d.sec===sec&&!d.hidden;});}
function hget(id){return find('lists',id);}
function hsave(doc,quiet){doc.kind='home';return save('lists',doc,quiet);}
function hnew(sec,f){return {id:'h3_'+sec+'_'+uid(),kind:'home',sec:sec,f:f||{}};}
function single(id,sec){return hget(id)||{id:id,kind:'home',sec:sec,f:{}};}

/* ---------- routing ---------- */
function route(){var h=(location.hash||'').replace(/^#\/?/,'').split('/');return {sec:h[0]||'home',sub:h[1]||'',arg:decodeURIComponent(h.slice(2).join('/')||'')};}
function go(h){if(location.hash==='#'+h)render();else location.hash=h;}
window.addEventListener('hashchange',function(){closeSheet(true);render();window.scrollTo(0,0);});
/* ---------- look: themes, section colors, fonts, background (settings doc h3_settings) ---------- */
var THEMES={
 lavender:{name:'NOVA Lavender',tag:'the Pre-K Planner look',bg:'#F7F6FB',card:'#FFFFFF',ink:'#2E2A4A',muted:'#6B6585',line:'#3A3556',rail:'#FFFFFF',railLine:'#E4E0EF',field:'#FBFAFE',fieldLine:'#D9D4E7',note:'#CFCADF',head:'Lora',body:'Lato',pattern:'none'},
 coffee:{name:'Autumn Coffeehouse',tag:'your old cozy kraft & caramel look',bg:'#F3EBDD',card:'#FFFBF3',ink:'#4A3426',muted:'#7A5C48',line:'#6B4F3A',rail:'#EAD7BD',railLine:'#C9A27A',field:'#F8F1E5',fieldLine:'#E1CDB2',note:'#DCC6A8',head:'Fraunces',body:'Nunito',pattern:'paper',
  home:{c:'#E8D5BD',d:'#6B4127'},
  pal:{start:['#EADBC4','#5A3A24'],calendar:['#F1D49A','#6E4C0C'],meals:['#D9D9A8','#4D4B22'],bills:['#CDD3A2','#4A4F1C'],cleaning:['#D3DED3','#3A5548'],todo:['#EDBFA3','#88381A'],brain:['#F4DC8E','#664609'],
   kids:['#E6C29C','#77421D'],appts:['#D8C4C8','#6B3A47'],bdays:['#EBC0B0','#86392D'],projects:['#DDC5A3','#684724'],lib:['#E5D3B8','#684828'],index:['#D8C6B0','#58392A']}},
 garden:{name:'Cottage Garden',tag:'sage, rose & linen',bg:'#F2F4EA',card:'#FDFCF6',ink:'#343D2E',muted:'#626C57',line:'#4A5640',rail:'#FDFCF6',railLine:'#DCE2CD',field:'#F8F8EF',fieldLine:'#DCE1CC',note:'#D4DAC4',head:'Lora',body:'Quicksand',pattern:'dots'},
 blush:{name:'Sweet Pastel',tag:'cotton candy & mint',bg:'#FDF3F7',card:'#FFFFFF',ink:'#4C3647',muted:'#7E6578',line:'#5C4257',rail:'#FFFFFF',railLine:'#F2DDE6',field:'#FFF9FB',fieldLine:'#EED7E1',note:'#EBD3DE',head:'Baloo 2',body:'Quicksand',pattern:'dots'},
 winter:{name:'Cozy Winter',tag:'pine, cream & plaid',bg:'#EEF2F0',card:'#FFFFFF',ink:'#26332F',muted:'#5A6A64',line:'#33443F',rail:'#FFFFFF',railLine:'#D9E1DD',field:'#F7F9F8',fieldLine:'#D5DED9',note:'#CBD6D1',head:'Playfair Display',body:'Lato',pattern:'plaid'}};
var HFONTS=['Lora','Fraunces','Playfair Display','Baloo 2','Patrick Hand','Caveat'],BFONTS=['Lato','Nunito','Quicksand','Poppins','Mulish'];
var LOCALF={Lora:1,Lato:1};
var PATTERNS=[['none','Plain'],['dots','Polka dots'],['grid','Graph paper'],['gingham','Gingham'],['paper','Kraft paper'],['plaid','Soft plaid']];
var SWATCH=['#D9CFF2','#CDD3EE','#CBD3F3','#C6E2F5','#B8E2E6','#BFE6D8','#BFE3D6','#CFE5C6','#DDEBB8','#FCE3A3','#FBD3AE','#F9CDB8','#F7C6BA','#F4C2C9','#F6C6DA','#E2D2F4','#EEDDC4','#E5E1D8'];
function cfg(){var d=hget('h3_settings');return (d&&d.f)||{};}
function setCfg(ch,quiet){var d=clone(single('h3_settings','_settings'));d.f=d.f||{};Object.keys(ch).forEach(function(k){if(ch[k]===undefined)delete d.f[k];else d.f[k]=ch[k];});hsave(d,true);applyLook();if(!quiet)render();return d.f;}
function theme(){return THEMES[cfg().theme]||THEMES.lavender;}
function fontHref(names){var fam=names.filter(function(n){return n&&!LOCALF[n];}).map(function(n){return 'family='+encodeURIComponent(n).replace(/%20/g,'+')+':wght@400;600;700';});
 return fam.length?'https://fonts.googleapis.com/css2?'+fam.join('&')+'&display=swap':'';}
function patternCss(p,ink){var c=ink;switch(p){
 case 'dots':return 'radial-gradient('+mix(c,'#ffffff',.86)+' 1.2px,transparent 1.6px) 0 0/18px 18px';
 case 'grid':return 'linear-gradient('+mix(c,'#ffffff',.9)+' 1px,transparent 1px) 0 0/22px 22px,linear-gradient(90deg,'+mix(c,'#ffffff',.9)+' 1px,transparent 1px) 0 0/22px 22px';
 case 'gingham':return 'linear-gradient(90deg,'+rgba(c,.035)+' 50%,transparent 50%) 0 0/26px 26px,linear-gradient('+rgba(c,.035)+' 50%,transparent 50%) 0 0/26px 26px';
 case 'paper':return 'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .2  0 0 0 .09 0"/></filter><rect width="140" height="140" filter="url(#n)"/></svg>')+'")';
 case 'plaid':return 'linear-gradient(90deg,'+rgba(c,.04)+' 0 8px,transparent 8px 40px) 0 0/40px 40px,linear-gradient('+rgba(c,.04)+' 0 8px,transparent 8px 40px) 0 0/40px 40px';}
 return 'none';}
function rgba(h,a){var c=hexRgb(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
var BGURL='';
function applyLook(){var C=cfg(),T=theme(),r=document.documentElement.style,sec=C.secs||{};
 var head=C.head||T.head,body=C.body||T.body;
 [['--bg',T.bg],['--card',T.card],['--ink',T.ink],['--muted',T.muted],['--line',T.line],['--railbg',T.rail],['--railline',T.railLine],['--field',T.field],['--fieldline',T.fieldLine],['--noteline',T.note],
  ['--hf','"'+head+'",'+(head==='Lora'||head==='Fraunces'||head==='Playfair Display'?'Georgia,serif':'system-ui,sans-serif')],['--bf','"'+body+'",system-ui,-apple-system,"Segoe UI",sans-serif'],['--zoom',String(C.size||1)]].forEach(function(p){r.setProperty(p[0],p[1]);});
 var href=fontHref([head,body]),fl=$('#fontsel');if(href){if(!fl){fl=document.createElement('link');fl.rel='stylesheet';fl.id='fontsel';document.head.appendChild(fl);}if(fl.getAttribute('href')!==href)fl.href=href;}else if(fl)fl.remove();
 S.forEach(function(s){var D=DEFCOL[s.id],o=sec[s.id]||{},tp=T.pal&&T.pal[s.id];s.c=o.c||(tp?tp[0]:D.c);s.d=o.c?(o.d||deepen(o.c)):(tp?tp[1]:D.d);
  s.title=o.title||D.title;s.rail=o.title?shortName(o.title):D.rail;s.tile=o.title||D.tile;s.ini=o.title?initials(o.title):D.ini;s.hide=!!o.hide;});
 var ho=C.home||{};HOME.c=ho.c||(T.home?T.home.c:DEFHOME.c);HOME.d=ho.c?deepen(ho.c):(T.home?T.home.d:DEFHOME.d);HOME.title=C.dashTitle||DEFHOME.title;
 var bg=C.bg||{kind:'theme'},pat=bg.kind==='pattern'?bg.pattern:bg.kind==='theme'?T.pattern:'none',bgc=bg.kind==='solid'&&bg.color?bg.color:T.bg;
 r.setProperty('--pagebg',bgc);r.setProperty('--pat',pat&&pat!=='none'?patternCss(pat,T.ink):'none');
 var L=$('#bgl');if(L){if(bg.kind==='photo'&&BGURL){L.style.backgroundImage='url("'+BGURL+'")';L.style.opacity='1';L.style.setProperty('--wash',String((bg.soft==null?55:bg.soft)/100));L.classList.add('on');}else{L.classList.remove('on');L.style.backgroundImage='';}}
 if(bg.kind==='photo'&&bg.img&&!BGURL)loadBg(bg.img);
 var tc=$('meta[name=theme-color]');if(tc)tc.setAttribute('content',bgc);
 try{localStorage.setItem('h3look',JSON.stringify({bg:bgc,ink:T.ink,hf:head,bf:body}));}catch(e){}}
function shortName(t){t=String(t||'').trim();var w=t.split(/[\s&]+/).filter(Boolean);return (w[0]||t).slice(0,10);}
function initials(t){var w=String(t||'').replace(/[^A-Za-z0-9 &]/g,'').split(/[\s&]+/).filter(Boolean);return ((w[0]||'?').charAt(0)+(w[1]?w[1].charAt(0):(w[0]||'').charAt(1)||'')).toUpperCase();}
function visible(){return ORDER.filter(function(id){return !SM[id].hide||id==='index';});}
/* ---------- rail ---------- */
function rail(cur){var col=!!UI.collapsed,T=theme(),rh=T.home||{c:'#D9CFF2',d:'#5B4B8A'},h='<a class="rl'+(cur==='home'?' on':'')+'" href="#home" style="'+vars(rh)+'" aria-label="Home dashboard" title="Home dashboard"><span class="ci">'+ic('home')+'</span><b>Home</b></a>';
 visible().forEach(function(id){var s=SM[id];h+='<a class="rl'+(cur===id?' on':'')+'" href="#'+id+'" style="'+vars(s)+'" title="'+esc(s.title)+'"><span class="ci">'+esc(s.ini)+'</span><b>'+esc(s.rail)+'</b></a>';});
 h+='<span class="rsep"></span>'+
  '<button class="rl rx rtog" data-act="fold" style="'+vars(rh)+'" title="'+(col?'Show the menu labels':'Fold the menu')+'" aria-label="'+(col?'Open the menu':'Fold the menu')+'"><span class="ci">'+ic(col?'chevR':'chevL')+'</span><b>'+(col?'Open':'Fold')+'</b></button>';
 var r=$('#rail');r.innerHTML=h;document.body.classList.toggle('folded',col);var on=$('.rl.on',r);if(on&&window.innerWidth<=700){var x=on.offsetLeft-r.clientWidth/2+on.offsetWidth/2;r.scrollLeft=Math.max(0,x);}}
function banner(s,subOverride,pill){var p=pill==null?'<a class="pill" href="#home">'+ic('home')+'<span class="pl">Dashboard</span></a>':pill;
 var acts=K&&!locked?'<button class="pill ico" data-act="bell" title="Reminders & notifications" aria-label="Reminders and notifications">'+ic('bell')+'<i class="bdot'+(pushIsOn()?' hide':'')+'"></i></button><button class="pill ico" data-act="cz" title="Make it yours" aria-label="Make it yours">'+ic('palette')+'</button>':'';
 return '<header class="banner"><div class="badge">'+(s.id==='home'?ic('grid'):esc(s.ini))+'</div><div class="btxt"><div class="over">'+esc(s.over||s.title)+'</div><h1>'+esc(s.title)+'</h1><p>'+esc(subOverride||s.sub||'')+'</p></div><div class="bacts">'+acts+p+'</div></header>';}

/* ---------- render ---------- */
function render(){var r=route(),pg=$('#page');if(!pg)return;
 if(!K||locked){rail('home');pg.setAttribute('style',vars(HOME));pg.className='';pg.innerHTML=lockView();bindLock();return;}
 var s=r.sec==='home'?HOME:SM[r.sec];if(!s){s=HOME;r.sec='home';}
 rail(r.sec);pg.setAttribute('style',vars(s));pg.className=r.sec==='home'?'home':'sec sec-'+r.sec;
 if(r.sec==='home'){if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('[data-note]'))return;pg.innerHTML=dashboard();document.title=HOME.title+' · Planner';return;}
 if(r.sec==='lib'&&document.activeElement&&document.activeElement.id==='libq'&&$('#liblist')){libRefreshList();return;}
 if(r.sec==='brain'&&document.activeElement&&document.activeElement.id==='bq'&&$('#notesw')){$('#notesw').innerHTML=notesHtml();return;}
 if(r.sec==='index'){pg.innerHTML=banner(s)+'<section class="card">'+indexView()+'</section>';document.title='Index · Planner';return;}
 var y=window.scrollY;var body;try{body=secView(s,r);}catch(e){console.error(e);body=emptyHtml('Something went wrong here','Pull down to refresh, or tap another section.');}
 pg.innerHTML=banner(s,subLine(s))+'<section class="card">'+body+'</section>';document.title=s.title+' · Planner';
 if(r.sec==='lib')setTimeout(libThumbs,0);if(r.sec==='calendar')setTimeout(calAfter,0);
 if(UI._keepY){window.scrollTo(0,y);UI._keepY=0;}}
function rerender(){UI._keepY=1;render();}
function subLine(s){var n=count(s.id);return s.sub+(n?' · '+n:'');}
function count(id){switch(id){
 case 'todo':var a=DB.todos.filter(function(t){return !t.done;}).length;return a?a+' to do':'';
 case 'meals':var g=DB.groceries.filter(function(x){return !x.got;}).length;return g?g+' on the grocery list':'';
 case 'bills':var b=DB.bills.filter(function(x){return !billPaid(x)&&daysBetween(today(),iso(billNext(x)))<=7;}).length;return b?b+' due this week':'';
 case 'cleaning':var c=hdocs('cleaning').filter(function(d){return cleanDue(d)<=today();}).length;return c?c+' due':'';
 case 'brain':var n=DB.brain.filter(function(x){return !x.done;}).length;return n?n+' notes':'';
 case 'kids':var k=DB.kids.filter(function(x){return !x.done;}).length;return k?k+' open':'';
 case 'appts':var ap=hdocs('appts').filter(function(d){return (d.f.date||'')>=today();}).length;return ap?ap+' coming up':'';
 case 'bdays':var bd=hdocs('bdays').filter(function(d){var n=bdayNext(d.f);return n&&daysBetween(today(),n)<=30;}).length;return bd?bd+' this month':'';
 case 'projects':var p=hdocs('projects').filter(function(d){return d.f.status!=='Done';}).length;return p?p+' going':'';
 case 'lib':var l=hdocs('lib').length;return l?l+' saved':'';
 case 'calendar':var t=today(),e=addDays(t,6),cnt=0;for(var i=0;i<7;i++)cnt+=eventsOn(addDays(t,i)).length;return cnt?cnt+' this week':'';}
 return '';}

function lockView(){return banner(HOME,'Open your planner link once to unlock this device','')+
 '<section class="card"><div class="lock"><h1>Welcome, Kenzi 🌸</h1><p>This planner is private. Open the link Hark sent you once on this device, or type your planner code below.</p>'+
 '<div class="fld" style="text-align:left;margin:14px 0"><span>Planner code</span><input type="text" id="lockin" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="planner code"></div>'+
 '<button class="btn pri" id="lockbtn" style="width:100%">Unlock</button></div></section>';}
function bindLock(){var b=$('#lockbtn');if(!b)return;var g=function(){var v=$('#lockin').value.trim();if(v){K=v;localStorage.setItem('pk',v);locked=false;render();load().then(function(){gcLoad();});}};b.onclick=g;$('#lockin').onkeydown=function(e){if(e.key==='Enter')g();};}

/* ---------- shared bits ---------- */
function addBtn(sec,label,preset,act){return '<button class="add" '+(act?'data-act="'+act+'"':'data-new="'+sec+'"')+(preset?' data-preset="'+esc(JSON.stringify(preset))+'"':'')+'>'+ic('plus',2.5)+esc(label||'Add')+'</button>';}
function tabsHtml(sec,tabs,cur){return '<div class="tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" aria-selected="'+(t[0]===cur)+'" class="'+(t[0]===cur?'on':'')+'" data-go="'+sec+'/'+t[0]+'">'+esc(t[1])+'</button>';}).join('')+'</div>';}
function emptyHtml(t,sub){return '<div class="empty"><b>'+esc(t)+'</b>'+esc(sub||'')+'</div>';}
function chipsHtml(name,cur,opts){return '<div class="chips" data-chipgrp="'+name+'">'+opts.map(function(o){return '<button class="chip'+(cur===o[0]?' on':'')+'" data-chip="'+name+'|'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join('')+'</div>';}
function grp(t,cls){return '<div class="grp'+(cls?' '+cls:'')+'">'+esc(t)+'</div>';}
/* one row: lead (check / dot / custom), title, tags, meta, side */
function row(o){var lead=o.check!=null?'<button class="ck'+(o.check?' on':'')+'" data-'+(o.checkAttr||'tog')+'="'+esc(o.checkVal)+'" aria-label="'+(o.check?'Mark not done':'Mark done')+'">'+ic('check',3)+'</button>':(o.lead||'<i class="dot"></i>');
 var tags=(o.tags||[]).filter(Boolean).map(function(t){return '<span class="tag'+(t.cls?' '+t.cls:'')+'">'+esc(t.t||t)+'</span>';}).join('');
 return '<div class="row'+(o.done?' done':'')+(o.cls?' '+o.cls:'')+'" '+(o.attr||'')+' role="button" tabindex="0">'+lead+'<span class="rt"><b><span class="tt">'+esc(o.title||'(untitled)')+'</span>'+tags+'</b>'+(o.meta?'<small>'+esc(o.meta)+'</small>':'')+(o.side?'<small class="ms">'+esc(o.side)+'</small>':'')+'</span>'+(o.side?'<span class="side'+(o.sideCls?' '+o.sideCls:'')+'">'+esc(o.side)+'</span>':'')+(o.extra||'')+'<span class="chev">›</span></div>';}
function quickAddHtml(kind,ph,attrs){return '<div class="qadd"><input type="text" data-qadd="'+kind+'" placeholder="'+esc(ph)+'" autocomplete="off" enterkeyhint="done"'+(attrs||'')+'><button class="qbtn" data-qbtn="1" aria-label="Add">'+ic('plus',2.5)+'</button></div>';}

/* ---------- the add / edit sheet ---------- */
var FORM=null;
function optList(o){return (o||[]).map(function(x){return Array.isArray(x)?x:[x,x];});}
function openForm(spec){var s=spec.sec||HOME,v=clone(spec.values||{});
 (spec.fields||[]).forEach(function(fl){if(v[fl.k]==null)v[fl.k]=fl.def==='today'?today():fl.def==='now'?nowTime():fl.t==='multi'?[]:fl.t==='check'?false:(fl.def!=null?fl.def:'');});
 FORM={spec:spec,s:s,f:v};
 var h='<div class="sh-h" style="'+vars(s)+'"><div class="badge">'+(s.id==='home'?ic('grid'):esc(s.ini))+'</div><h2>'+esc(spec.title)+'</h2><button class="x" data-act="close" aria-label="Close">×</button></div><div class="sh-b" style="'+vars(s)+'">'+(spec.top||'');
 var fl=spec.fields||[],i=0;while(i<fl.length){if(fl[i].half&&fl[i+1]&&fl[i+1].half){h+='<div class="two">'+fieldHtml(fl[i],v)+fieldHtml(fl[i+1],v)+'</div>';i+=2;}else{h+=fieldHtml(fl[i],v);i++;}}
 h+=(spec.bottom||'')+'</div><div class="sh-f" style="'+vars(s)+'">'+(spec.onDelete?'<button class="btn del" data-act="delete">'+esc(spec.delLabel||'Delete')+'</button>':'')+(spec.footExtra||'')+'<span class="grow"></span>'+(spec.noCancel?'':'<button class="btn" data-act="close">Cancel</button>')+(spec.onSave?'<button class="btn pri" data-act="save">'+esc(spec.ok||'Save')+'</button>':'')+'</div>';
 var sh=$('#sheet');sh.setAttribute('style',vars(s));sh.className=spec.wide?'wide':'';sh.innerHTML=h;sh.classList.add('on');sh.setAttribute('aria-hidden','false');$('#shade').classList.add('on');document.body.classList.add('sheeton');
 formShow();if(spec.after)spec.after(sh);
 if(spec.focus!==false&&window.innerWidth>700){var fi=$('.sh-b input[type=text],.sh-b textarea',sh);if(fi&&!v.id)setTimeout(function(){try{fi.focus();}catch(e){}},60);}}
function fieldHtml(fl,f){var v=f[fl.k],lab='<span>'+esc(fl.l)+(fl.opt?' <em>(optional)</em>':'')+'</span>',id='f_'+fl.k,h='',hint=fl.hint?'<div class="hint">'+esc(fl.hint)+'</div>':'';
 switch(fl.t){
 case 'info':return '<div class="fld finfo" data-f="'+fl.k+'">'+fl.html+'</div>';
 case 'long':h='<label class="fld" data-f="'+fl.k+'">'+lab+'<textarea id="'+id+'" rows="'+(fl.rows||3)+'" placeholder="'+esc(fl.ph||'')+'">'+esc(v)+'</textarea>'+hint+'</label>';break;
 case 'date':case 'time':h='<label class="fld" data-f="'+fl.k+'">'+lab+'<input type="'+fl.t+'" id="'+id+'" value="'+esc(fl.t==='time'?(normT(v)||v):v)+'">'+hint+'</label>';break;
 case 'number':h='<label class="fld" data-f="'+fl.k+'">'+lab+'<input type="text" inputmode="decimal" id="'+id+'" value="'+esc(v)+'" placeholder="'+esc(fl.ph||'')+'">'+hint+'</label>';break;
 case 'select':var ol=optList(fl.opts);h='<label class="fld" data-f="'+fl.k+'">'+lab+'<select id="'+id+'">'+(fl.blank===false?'':'<option value="">'+esc(fl.blank||'—')+'</option>')+ol.map(function(o){return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(v)?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+(v&&!ol.some(function(o){return String(o[0])===String(v);})?'<option selected value="'+esc(v)+'">'+esc(v)+'</option>':'')+'</select>'+hint+'</label>';break;
 case 'pick':var po=optList(fl.opts);h='<div class="fld" data-f="'+fl.k+'">'+lab+'<div class="pick" data-pick="'+fl.k+'">'+po.map(function(o){return '<button type="button" class="'+(String(o[0])===String(v)?'on':'')+'" data-val="'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join('')+'</div>'+hint+'</div>';break;
 case 'multi':var mo=optList(fl.opts);h='<div class="fld" data-f="'+fl.k+'">'+lab+'<div class="pick" data-multi="'+fl.k+'">'+mo.map(function(o){return '<button type="button" class="'+((v||[]).indexOf(o[0])>=0?'on':'')+'" data-val="'+esc(o[0])+'">'+esc(o[1])+'</button>';}).join('')+'</div>'+hint+'</div>';break;
 case 'swatch':h='<div class="fld" data-f="'+fl.k+'">'+lab+'<div class="pick sw" data-pick="'+fl.k+'">'+optList(fl.opts).map(function(o){return '<button type="button" class="swb'+(o[0]===v?' on':'')+'" data-val="'+esc(o[0])+'" style="background:'+esc(o[1])+'" aria-label="'+esc(o[2]||o[0])+'" title="'+esc(o[2]||o[0])+'"></button>';}).join('')+'</div></div>';break;
 case 'check':h='<div class="fld" data-f="'+fl.k+'"><button type="button" class="cbox" data-cbox="'+fl.k+'"><span class="ck'+(v?' on':'')+'">'+ic('check',3)+'</span>'+esc(fl.l)+'</button>'+hint+'</div>';break;
 default:h='<label class="fld" data-f="'+fl.k+'">'+lab+'<input type="text" id="'+id+'" value="'+esc(v)+'" placeholder="'+esc(fl.ph||'')+'"'+(fl.cap?' autocapitalize="words"':'')+(fl.url?' inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"':'')+' autocomplete="off">'+hint+'</label>';}
 return h;}
function readForm(){var f=FORM.f,sh=$('#sheet');(FORM.spec.fields||[]).forEach(function(fl){var el=$('#f_'+fl.k,sh);if(!el)return;var v=el.value;if(typeof v==='string'&&fl.t!=='long')v=v.trim();if(fl.t==='time')v=normT(v)||'';f[fl.k]=v;});return f;}
function formShow(){if(!FORM)return;var sh=$('#sheet');readForm();(FORM.spec.fields||[]).forEach(function(fl){if(!fl.show)return;var el=$('[data-f="'+fl.k+'"]',sh);if(!el)return;var on=!!fl.show(FORM.f);var tw=el.parentNode.classList.contains('two')?el.parentNode:null;el.style.display=on?'':'none';if(tw){var any=$$('.fld',tw).some(function(x){return x.style.display!=='none';});tw.style.display=any?'':'none';}});}
function saveForm(){if(!FORM||!FORM.spec.onSave)return;var f=readForm(),bad=[];$$('.fld.err',$('#sheet')).forEach(function(e){e.classList.remove('err');});
 (FORM.spec.fields||[]).forEach(function(fl){if(fl.show&&!fl.show(f))return;var v=f[fl.k];if(fl.req&&(v==null||v===''||(Array.isArray(v)&&!v.length)))bad.push(fl);});
 if(bad.length){bad.forEach(function(fl){var e=$('[data-f="'+fl.k+'"]',$('#sheet'));if(e)e.classList.add('err');});toast('Please fill in: '+bad.map(function(x){return x.l;}).join(', '));return;}
 var spec=FORM.spec,keep=spec.onSave(clone(f));if(keep===false)return;if(FORM&&FORM.spec===spec)closeSheet();}
function deleteForm(){if(!FORM||!FORM.spec.onDelete)return;var spec=FORM.spec;if(spec.confirmDel!==false&&!confirm(spec.confirmDel||'Delete this?'))return;closeSheet();spec.onDelete();}
function closeSheet(){var sh=$('#sheet');if(!sh||!sh.classList.contains('on'))return;sh.classList.remove('on');sh.setAttribute('aria-hidden','true');$('#shade').classList.remove('on');document.body.classList.remove('sheeton');var was=FORM;FORM=null;if(was&&was.spec&&was.spec.onClose)was.spec.onClose();if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();}
/* a simple read-only sheet */
function infoSheet(s,title,body,foot){openForm({sec:s,title:title,top:body,fields:[],noCancel:true,footExtra:foot||'',focus:false,values:{}});}

/* ---------- toast ---------- */
var _tt=null;function toast(msg,undo){var t=$('#toast');if(!t)return;t.innerHTML='<span>'+esc(msg)+'</span>'+(undo?'<button>Undo</button>':'');t.classList.add('on');clearTimeout(_tt);
 if(undo)t.querySelector('button').onclick=function(){t.classList.remove('on');undo();};_tt=setTimeout(function(){t.classList.remove('on');},undo?6000:2800);}

/* ---------- repeating dates ---------- */
var REPS=[['','Doesn’t repeat'],['daily','Every day'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month'],['yearly','Every year']];
var REPNAME={daily:'daily',weekly:'weekly',biweekly:'every 2 wks',monthly:'monthly',yearly:'yearly'};
function advance(ds,rep){var d=pd(ds)||pd(today());
 if(rep==='daily')d.setDate(d.getDate()+1);else if(rep==='weekly')d.setDate(d.getDate()+7);else if(rep==='biweekly')d.setDate(d.getDate()+14);
 else if(rep==='monthly'){var dd=d.getDate(),n=new Date(d.getFullYear(),d.getMonth()+1,1),last=new Date(n.getFullYear(),n.getMonth()+1,0).getDate();d=new Date(n.getFullYear(),n.getMonth(),Math.min(dd,last));}
 else if(rep==='yearly')d=new Date(d.getFullYear()+1,d.getMonth(),d.getDate());return iso(d);}
var DOWS={sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,weds:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
function parseWhen(text){var m=text.match(/\s+(today|tonight|tomorrow|tmrw|(?:on |by |next )?(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday))\s*$/i);
 if(!m)return {text:text,due:''};var w=m[1].toLowerCase().replace(/^(on|by|next) /,''),t=today(),d;
 if(w==='today'||w==='tonight')d=t;else if(w==='tomorrow'||w==='tmrw')d=addDays(t,1);else{var g=DOWS[w],diff=(g-pd(t).getDay()+7)%7;d=addDays(t,diff===0?7:diff);}
 return {text:text.slice(0,m.index).trim()||text,due:d};}
/* ---------- dashboard ---------- */
var _tNote=null;
function dashDoc(){return single('h3_dash','_dash');}
function tileCount(id){var c=count(id);if(id==='start')return '';return c;}
function todayLines(){var t=today(),L=[];
 eventsOn(t).slice(0,4).forEach(function(e){L.push(['calendar',(e.time?fmtT(e.time)+' · ':'')+e.title,e.g?'gc gc-'+e.cal:'']);});
 var ev=eventsOn(t).length;if(ev>4)L.push(['calendar','+'+(ev-4)+' more on the calendar','']);
 hdocs('appts').filter(function(d){return d.f.date===t;}).forEach(function(d){L.push(['appts','🩺 '+(d.f.time?fmtT(d.f.time)+' · ':'')+apptTitle(d.f),'']);});
 var me=mealFor(t);L.push(['meals','🍽️ Dinner: '+(me&&me.dinner?me.dinner:'not planned yet'),'']);
 var bd=DB.bills.filter(function(b){if(billPaid(b))return false;var n=daysBetween(t,iso(billNext(b)));return n<=3;});if(bd.length)L.push(['bills','💵 '+bd.map(function(b){return b.name;}).slice(0,3).join(', ')+(bd.length===1?' is':' are')+' due soon','']);
 var td=DB.todos.filter(function(x){return !x.done&&x.due&&x.due<=t;}).length;if(td)L.push(['todo','✅ '+td+' to-do'+(td===1?'':'s')+' due today','']);
 var cl=hdocs('cleaning').filter(function(d){return cleanDue(d)<=t;}).length;if(cl)L.push(['cleaning','🧽 '+cl+' cleaning task'+(cl===1?'':'s')+' due','']);
 hdocs('bdays').forEach(function(d){var n=bdayNext(d.f);if(n&&daysBetween(t,n)<=7)L.push(['bdays','🎂 '+d.f.name+(n===t?' — today!':' · '+nice(n)),'']);});
 DB.kids.filter(function(k){return !k.done&&k.date&&k.date>=t&&k.date<=addDays(t,2);}).slice(0,2).forEach(function(k){L.push(['kids','🎒 '+(k.kid==='Both'?'':k.kid+': ')+k.title+' · '+nice(k.date),'']);});
 return L;}
function dashboard(){var D=dashDoc().f||{},t3=D.top||[{},{},{}];
 var h=banner(HOME,null,'<a class="pill" href="#index">'+ic('list')+'<span class="pl">Index</span></a>')+'<div class="dash"><div class="tiles">';
 visible().forEach(function(id){var s=SM[id],c=tileCount(id);h+='<a class="tile" href="#'+id+'" style="'+vars(s)+'"><span class="ic">'+ic(s.icon)+'</span><b>'+esc(s.tile)+'</b>'+(c?'<span class="cnt">'+esc(c)+'</span>':'')+'<i class="td"></i></a>';});
 h+='</div><div class="notes">';
 h+='<div class="note today"><span class="nl">Today · '+esc(fmtLong(today()))+'</span><ul class="tl">'+todayLines().map(function(l){return '<li><a href="#'+l[0]+'"'+(l[2]?' class="'+l[2]+'"':'')+'>'+esc(l[1])+'</a></li>';}).join('')+'</ul></div>';
 h+='<div class="note"><span class="nl">Today\u2019s Top 3</span>';
 for(var i=0;i<3;i++){var x=t3[i]||{};h+='<div class="t3'+(x.done?' done':'')+'"><button class="ck'+(x.done?' on':'')+'" data-top="'+i+'" aria-label="Done">'+ic('check',3)+'</button><input type="text" data-note="top'+i+'" placeholder="'+(i+1)+'." value="'+esc(x.t)+'" aria-label="Priority '+(i+1)+'"></div>';}
 h+='</div><div class="note"><label for="n-focus">This Week\u2019s Focus</label><textarea id="n-focus" data-note="focus" rows="2" placeholder="This week I\u2019m focusing on…">'+esc(D.focus)+'</textarea></div>'+
  '<div class="note"><label for="n-rem">Don\u2019t Forget</label><textarea id="n-rem" data-note="remember" rows="3" placeholder="Library books Friday, call the dentist…">'+esc(D.remember)+'</textarea></div>'+
  '<div class="note quote"><label for="n-q">Inspiration</label><textarea id="n-q" data-note="quote" rows="2">'+esc(D.quote==null?'\u201CHome is where our story begins.\u201D':D.quote)+'</textarea></div>'+
  '</div></div>';
 return h;}
function noteSaveSoon(){clearTimeout(_tNote);_tNote=setTimeout(noteSave,700);}
function noteSave(){clearTimeout(_tNote);_tNote=null;var d=clone(dashDoc()),f=d.f=d.f||{},top=[];
 $$('[data-note]').forEach(function(el){var k=el.getAttribute('data-note');if(/^top\d$/.test(k))return;f[k]=el.value;});
 for(var i=0;i<3;i++){var el=$('[data-note=top'+i+']'),old=(f.top||[])[i]||{};top.push({t:el?el.value:(old.t||''),done:!!old.done});}
 f.top=top;hsave(d,true);}

/* ---------- index ---------- */
function pagesOf(id){var P=[];function p(l,h){P.push([l,h]);}
 switch(id){
 case 'start':START.forEach(function(x,i){p(x[0],'start/p/'+i);});break;
 case 'calendar':p('Month','calendar/month');p('Week','calendar/week');p('Upcoming','calendar/list');p('Add an event','calendar/new');break;
 case 'meals':p('Dinner plan','meals/plan');p('Grocery list','meals/groceries');p('Meal ideas','meals/ideas');break;
 case 'bills':p('Bills','bills/bills');p('Budget','bills/budget');p('Add a bill','bills/new');break;
 case 'cleaning':p('Due now','cleaning/due');p('By room','cleaning/rooms');p('Add a task','cleaning/new');break;
 case 'todo':p('To do','todo/open');p('Done','todo/done');p('Add a to-do','todo/new');break;
 case 'brain':p('All notes','brain');p('Add a note','brain/new');break;
 case 'kids':p('Both boys','kids/all');p('Weston','kids/Weston');p('Holden','kids/Holden');break;
 case 'appts':p('Upcoming','appts/up');p('Past','appts/past');p('Add an appointment','appts/new');break;
 case 'bdays':p('Upcoming birthdays','bdays/up');p('Gift list','bdays/gifts');p('Add a birthday','bdays/new');break;
 case 'projects':p('Projects','projects/proj');p('Checklists','projects/lists');p('Add a project','projects/new');break;
 case 'lib':p('All resources','lib');p('Favorites first','lib/fav');p('Add a link','lib/new');p('Upload a file','lib/upload');break;}
 return P;}
function indexView(){var h='<div class="idx">';visible().filter(function(id){return id!=='index';}).forEach(function(id){var s=SM[id];
 h+='<div class="ib" style="'+vars(s)+'"><a class="ih" href="#'+id+'"><i class="dot"></i>'+esc(s.title)+'</a><ul>';
 pagesOf(id).forEach(function(x){h+='<li><a href="#'+x[1]+'">'+esc(x[0])+'</a></li>';});h+='</ul></div>';});return h+'</div>';}

/* ---------- start ---------- */
var START=[
 ['Welcome','<h3>Welcome to your Home Planner</h3><p>Everything for home in one place: the calendar (with your Google Calendars), meals and groceries, bills and budget, cleaning, to-dos, the boys\u2019 school stuff, appointments, birthdays, home projects and your resource library.</p><p>It has the same look as your Pre-K Planner, but the two keep their information completely separate.</p>'],
 ['How to use','<h3>How to use it</h3><ol><li>Tap a tile on the <b>Dashboard</b>, or a circle on the side (on your phone, the strip across the top).</li><li>Tap <b>+ Add</b> in any section. Tap any row to change or delete it.</li><li>Type straight into the notes on the Dashboard. They save on their own.</li><li>The <b>Fold</b> circle at the bottom of the menu makes the menu skinnier; tap <b>Open</b> to bring the labels back.</li></ol>'],
 ['Notifications & reminders','__bell__'],
 ['Make it yours','__cz__'],
 ['Sync & backup','__sync__']];
function startView(r){var i=r.sub==='p'?+r.arg:-1;
 if(i>=0&&START[i]){var c=START[i][1];
  if(c==='__sync__')c=syncInfo();
  else if(c==='__bell__')c='<h3>Notifications & reminders</h3><p>Pick <b>🔔 Remind me</b> when you add a to-do, event, bill, school item, appointment or birthday, and your phone buzzes at that time.</p><p><b>iPhone:</b> open the planner from your Home Screen (not Safari), tap <b>Remind</b> in the menu, then <b>Turn on notifications</b>.</p><p><button class="btn pri" data-act="bell">Open reminders</button></p>';
  else if(c==='__cz__')c='<h3>Make it yours</h3><p>Change the theme (including your old <b>Autumn Coffeehouse</b> look), each section\u2019s color and name, fonts, text size and the background. Tap <b>Style</b> in the menu any time.</p><p><button class="btn pri" data-act="cz">Open Make it yours</button></p>';
  return '<div class="bar"><button class="ghost" data-go="start">‹ All pages</button></div><div class="info">'+c+'</div>';}
 return START.map(function(x,i){return '<a class="row" href="#start/p/'+i+'"><i class="dot"></i><span class="rt"><b>'+esc(x[0])+'</b></span><span class="chev">›</span></a>';}).join('');}
function syncInfo(){var n=0;COLS.forEach(function(c){n+=DB[c].length;});return '<h3>Sync & backup</h3><p>'+n+' saved item'+(n===1?'':'s')+' on this device. '+(OUT.length?OUT.length+' change(s) waiting to upload.':'Everything is uploaded.')+'</p>'+
 '<p><button class="btn pri" data-act="syncnow">Sync now</button> &nbsp;<button class="btn" data-act="export">Download a copy</button></p><p class="hint">Planner version '+VERSION+'</p>';}

/* ---------- section dispatcher ---------- */
function secView(s,r){var sub=r.sub;
 if(sub==='new'||sub==='e'||sub==='upload'||sub==='fav'){var act=sub,arg=r.arg;setTimeout(function(){try{history.replaceState(null,'','#'+s.id);}catch(e){}newFor(s.id,act,arg);},30);sub='';}
 switch(s.id){
 case 'start':return startView(r);
 case 'calendar':return calView(sub);
 case 'meals':return mealsView(sub);
 case 'bills':return billsView(sub);
 case 'cleaning':return cleanView(sub);
 case 'todo':return todoView(sub);
 case 'brain':return brainView();
 case 'kids':return kidsView(sub);
 case 'appts':return apptsView(sub);
 case 'bdays':return bdaysView(sub);
 case 'projects':return projView(sub);
 case 'lib':return libView();}
 return '';}
function newFor(id,act,arg){if(act==='fav'){UI.libFav=true;UI.libCat='';saveUI();render();return;}
 if(act==='upload'){libForm(null,{type:'file'});return;}
 if(act==='e'){openEdit(arg);return;}
 ({calendar:function(){editEvent(null,UI.calSel||today());},meals:function(){editGrocery(null);},bills:function(){editBill(null);},cleaning:function(){editClean(null);},todo:function(){editTodo(null);},brain:function(){editBrain(null);},
  kids:function(){editKid(null,'Weston');},appts:function(){editAppt(null);},bdays:function(){editBday(null);},projects:function(){editProject(null);},lib:function(){libForm(null,{type:'link'});}}[id]||function(){})();}
/* ---------- calendar: planner events (v2 "events") + Google Calendar (Personal & Work) + overlay ---------- */
var EVC=[['oat','#EEDDC4','Oat'],['mustard','#FCE3A3','Butter'],['rust','#F9CDB8','Peach'],['caramel','#FBD3AE','Apricot'],['olive','#DDEBB8','Lime'],['berry','#F4C2C9','Rose'],['lilac','#E2D2F4','Lilac'],['sky','#C6E2F5','Sky'],['mint','#BFE6D8','Mint'],['pink','#F6C6DA','Pink']];
var EVHEX={};EVC.forEach(function(c){EVHEX[c[0]]=c[1];});
function occursOn(e,ds){if(!e.date)return false;if(e.date===ds||(e.endDate&&!e.repeat&&ds>e.date&&ds<=e.endDate))return true;var r=e.repeat;if(!r||ds<e.date)return false;if(e.until&&ds>e.until)return false;
 var a=pd(e.date),b=pd(ds),diff=daysBetween(e.date,ds);
 if(r==='daily')return true;if(r==='weekly')return diff%7===0;if(r==='biweekly')return diff%14===0;
 if(r==='monthly'){var last=new Date(b.getFullYear(),b.getMonth()+1,0).getDate();return b.getDate()===Math.min(a.getDate(),last);}
 if(r==='yearly')return a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();return false;}
function plannerEventsOn(ds){return DB.events.filter(function(e){return occursOn(e,ds)&&!(e.skip&&e.skip.indexOf(ds)>=0);});}

/* ---- Google Calendar (server: gcalList / gcalPut / gcalDel) ---- */
var GCAL_DEF={personal:{name:'Personal',color:'#9fe1e7'},work:{name:'Work',color:'#fa573c'}},GCAL_KEYS=['personal','work'];
var GC=null;try{GC=JSON.parse(localStorage.getItem('gcal1')||'null');}catch(e){GC=null;}
if(!GC||!GC.ev)GC={ev:[],cals:{},from:'',to:'',at:0};
var GIDX=null,GOCC=[],gcBusy=false,gcErr='',gcLoadedNow=false,gcPend={},gcXBusy='';
var gcHide={};try{gcHide=JSON.parse(localStorage.getItem('gcHide')||'{}')||{};}catch(e){gcHide={};}
function gcName(k){return GCAL_DEF[k]?GCAL_DEF[k].name:k;}
function gcColor(k){var c=GC.cals&&GC.cals[k];return (c&&c.color)||(GCAL_DEF[k]||{}).color||'#C9AE8E';}
function gcOk(k){var c=GC.cals&&GC.cals[k];return !c||c.ok!==false;}
function gcCanWrite(k){var c=GC.cals&&GC.cals[k];return !c||!c.role||c.role==='owner'||c.role==='writer';}
function gcKey(o){return o.k+'|'+o.id;}
function gcSave(){try{localStorage.setItem('gcal1',JSON.stringify(GC));}catch(e){}}
function gcRange(){var t=today();return [addDays(t,-62),addDays(t,420)];}
function gcAll(){var a=(GC.ev||[]).slice();if(GC.x&&GC.x.ev)a=a.concat(GC.x.ev);return a;}
function gcFind(key){var a=gcAll();for(var i=0;i<a.length;i++)if(gcKey(a[i])===key)return a[i];return null;}
function gcStyle(){var css='';GCAL_KEYS.forEach(function(k){var c=gcColor(k),bg=mix(c,'#FFFFFF',.62),st=mix(c,'#2A2340',.35);
  css+='.gc-'+k+'.ev,.gc-'+k+'.evr{background:'+bg+'!important;box-shadow:inset 3px 0 0 '+st+'}'+'.gdot.gc-'+k+',.gpill.gc-'+k+' i{background:'+c+';box-shadow:0 0 0 1.5px '+st+'}'+'.gbadge.gc-'+k+'{background:'+bg+';border-color:'+st+'}'+'.tl a.gc-'+k+':before{background:'+c+'}';});
 var el=document.getElementById('gcstyle');if(!el){el=document.createElement('style');el.id='gcstyle';document.head.appendChild(el);}if(el.textContent!==css)el.textContent=css;}
function gcLoad(){if(gcBusy||!K)return Promise.resolve();gcBusy=true;var r=gcRange();
 return api('gcalList',[r[0],r[1]]).then(function(d){if(!d||!d.ev)throw 'no data';var keepX=GC.x;
   GC={ev:d.ev,cals:d.cals||{},from:d.from,to:d.to,at:Date.now(),x:keepX};gcLoadedNow=true;
   var bad=GCAL_KEYS.filter(function(k){return d.cals&&d.cals[k]&&d.cals[k].ok===false;});gcErr=bad.length?bad.map(gcName).join(' & ')+' calendar didn’t load':'';
   gcSave();GIDX=null;gcStyle();if(!$('#sheet.on')&&!busyTyping())rerender();gRemSyncAll();})
  .catch(function(e){gcErr=String(e)==='locked'?'':'Couldn’t reach Google just now, showing your saved copy';})
  .then(function(){gcBusy=false;var b=$('[data-gsync]');if(b)b.classList.remove('busy');});}
function gcEnsure(a,b){if(!GC.from||(a>=GC.from&&b<=GC.to))return;if(GC.x&&a>=GC.x.from&&b<=GC.x.to)return;var key=a+b;if(gcXBusy===key)return;gcXBusy=key;
 api('gcalList',[a,b]).then(function(d){GC.x={ev:d.ev||[],from:d.from,to:d.to};gcSave();GIDX=null;rerender();}).catch(function(){}).then(function(){gcXBusy='';});}
function gcStale(){return Date.now()-(GC.at||0)>120000;}
function nTitle(s){return String(s||'').toLowerCase().replace(/^\s*(work|school|personal)\s*[:\-–]\s*/,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
var STOPW={the:1,a:1,an:1,and:1,of:1,'for':1,to:1,at:1,'in':1,on:1,after:1,with:1,no:1};
function tWords(s){return nTitle(s).split(' ').filter(function(w){return w.length>2&&!STOPW[w];});}
function tSim(a,b){var x=tWords(a),y=tWords(b);if(!x.length||!y.length)return 0;var n=0;x.forEach(function(w){if(y.indexOf(w)>=0)n++;});return n/Math.min(x.length,y.length);}
function gcIndex(){if(GIDX)return GIDX;GIDX={};GOCC=[];var groups={},order=[];
 gcAll().forEach(function(o){if(gcHide[o.k]||gcPend[gcKey(o)]==='del')return;var sig=nTitle(o.t)+'|'+o.d+'|'+(o.tm||'')+'|'+o.ed;
  if(!groups[sig]){groups[sig]=[];order.push(sig);}if(!groups[sig].some(function(z){return gcKey(z)===gcKey(o);}))groups[sig].push(o);});
 var P=gcPrefs();
 order.forEach(function(sig){var g=groups[sig],o=g.filter(function(z){return !z.ro;})[0]||g[0];
  var n=Math.min(Math.max(daysBetween(o.d,o.ed||o.d)+1,1),62),key=gcKey(o);
  for(var i=0;i<n;i++){var ds=addDays(o.d,i),ix=GOCC.length;
   var occ={id:'g~'+ix,g:o,gk:key,cal:o.k,title:o.t,date:ds,time:i===0?(o.tm||''):'',end:i===n-1&&i===0?(o.et||''):'',span:n>1?{i:i+1,n:n}:null,note:o.n||'',remind:(P.remind||{})[key]||'',dupes:g.length-1};
   GOCC.push(occ);(GIDX[ds]=GIDX[ds]||[]).push(occ);}});
 return GIDX;}
function gcIsCopy(e,g){var et=normT(e.time),work=/^\s*work\s*:/i.test(e.title||'');
 return g.some(function(o){var s=tSim(e.title,o.title),same=et&&o.time&&et===o.time;return s>=.6||(work&&o.cal==='work'&&(same||s>=.34));});}
function evSort(a,b){var ta=normT(a.time),tb=normT(b.time);if(!ta&&tb)return -1;if(ta&&!tb)return 1;return ta<tb?-1:ta>tb?1:0;}
function eventsOn(ds){var p=plannerEventsOn(ds),g=gcIndex()[ds]||[];if(g.length)p=p.filter(function(e){return !gcIsCopy(e,g);});return p.concat(g).sort(evSort);}
function gcPrefs(){return find('lists','gcal-prefs')||{id:'gcal-prefs',kind:'gcal',remind:{},last:''};}
function gcSetPrefs(ch){var p=clone(gcPrefs());Object.keys(ch).forEach(function(k){p[k]=ch[k];});p.kind='gcal';p.name='(Google Calendar settings)';p.items=[];save('lists',p,true);return p;}
function gcLastCal(){var l=gcPrefs().last||localStorage.getItem('gcLast')||'personal';return l==='planner'||GCAL_DEF[l]?l:'personal';}
function gcAgo(){if(!GC.at)return 'not synced yet';var m=Math.round((Date.now()-GC.at)/60000);return m<1?'synced just now':m<60?'synced '+m+' min ago':'synced '+Math.round(m/60)+' hr ago';}
function gcTools(){gcStyle();return '<div class="gtools">'+GCAL_KEYS.map(function(k){return '<button class="gpill gc-'+k+(gcHide[k]?' off':'')+'" data-gtog="'+k+'" aria-pressed="'+(!gcHide[k])+'" title="'+(gcHide[k]?'Show':'Hide')+' your '+gcName(k)+' Google calendar"><i></i>'+gcName(k)+'</button>';}).join('')+
 '<button class="gsync'+(gcBusy?' busy':'')+'" data-gsync title="Check Google Calendar now">'+ic('sync')+'<span>'+esc(gcErr?'⚠ '+gcErr:gcAgo())+'</span></button>'+
 '<button class="gpill ov'+(UI.calOv===false?' off':'')+'" data-calov aria-pressed="'+(UI.calOv!==false)+'" title="Show bills, school, appointments and birthdays"><i></i>Bills, school &amp; more</button></div>';}
function gcPutLocal(o){var arr=GC.ev||[],ix=-1;for(var i=0;i<arr.length;i++)if(gcKey(arr[i])===gcKey(o)){ix=i;break;}if(ix>=0)arr[ix]=o;else arr.push(o);GC.ev=arr;
 if(GC.x&&GC.x.ev)GC.x.ev=GC.x.ev.filter(function(z){return gcKey(z)!==gcKey(o);});gcSave();GIDX=null;}
function gcDropLocal(key){GC.ev=(GC.ev||[]).filter(function(z){return gcKey(z)!==key;});if(GC.x&&GC.x.ev)GC.x.ev=GC.x.ev.filter(function(z){return gcKey(z)!==key;});gcSave();GIDX=null;}
function gcErrMsg(e){e=String(e||'');if(/read-only/.test(e))return 'Google says that one can’t be changed from here';if(/Failed to fetch|NetworkError|Load failed/i.test(e))return 'You look offline, so Google wasn’t updated. Try again when you’re back online';return 'Google didn’t take that change ('+e.slice(0,60)+')';}
function gcSaveEvent(cal,v,old){var body={title:v.title,date:v.date,endDate:v.endDate&&v.endDate>v.date?v.endDate:'',time:normT(v.time),end:normT(v.end)};
 if(old){body.id=old.id;body.from=old.k;if(v.note!==(old.n||''))body.note=v.note;}else{body.note=v.note||'';body.repeat=v.repeat||'';body.until=v.repeat?v.until||'':'';}
 var oldKey=old?gcKey(old):null,tmp={k:cal,id:old&&old.k===cal?old.id:'tmp'+uid(),t:body.title,d:body.date,ed:body.endDate||body.date,tm:body.time||undefined,et:body.time?(body.end||''):undefined,ad:body.time?undefined:1,n:v.note||'',pend:1};
 if(old&&old.k!==cal)gcDropLocal(oldKey);gcPutLocal(tmp);rerender();setSync('busy');
 return api('gcalPut',[cal,body]).then(function(o){if(gcKey(tmp)!==gcKey(o))gcDropLocal(gcKey(tmp));gcPutLocal(o);
   var pre=v.remind||'',R=gcPrefs().remind||{},ok=gcKey(o);if(oldKey&&oldKey!==ok&&R[oldKey])gSetRemind(oldKey,'');
   if((R[ok]||'')!==pre)gSetRemind(ok,pre);else gRemSync(ok,pre);
   setSync('ok');rerender();toast((old?'Updated in':'Added to')+' your '+gcName(cal)+' Google calendar ✓');if(pre)remNudge(pre);return o;})
  .catch(function(e){gcDropLocal(gcKey(tmp));if(old)gcPutLocal(old);setSync('ok');rerender();toast(gcErrMsg(e));throw e;});}
function gcDelete(o){var key=gcKey(o);gcPend[key]='del';GIDX=null;rerender();var done=false;
 var t=setTimeout(go2,4500);function go2(){if(done)return;done=true;clearTimeout(t);window.removeEventListener('pagehide',go2);
  api('gcalDel',[o.k,o.id]).then(function(){delete gcPend[key];gcDropLocal(key);if((gcPrefs().remind||{})[key])gSetRemind(key,'');rerender();})
   .catch(function(e){delete gcPend[key];GIDX=null;rerender();toast(gcErrMsg(e));});}
 window.addEventListener('pagehide',go2);
 toast('Deleted from your '+gcName(o.k)+' Google calendar',function(){if(done)return;done=true;clearTimeout(t);window.removeEventListener('pagehide',go2);delete gcPend[key];GIDX=null;rerender();});}
function gcStart(){gcStyle();setTimeout(gcLoad,400);setInterval(function(){if(document.visibilityState==='visible')gcLoad();},4*60000);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&gcStale())gcLoad();});}

/* ---- overlay: bills, kids, appointments, birthdays, starred to-dos ---- */
var KEMO={note:'📝',form:'📄',item:'🎒',date:'📅'};
function extrasOn(ds){var out=[];if(UI.calOv===false)return out;
 DB.bills.forEach(function(b){var n=billNext(b);if(n&&iso(n)===ds&&!billPaid(b))out.push({k:'bills',id:b.id,t:'💵 '+b.name+(b.amount?' '+money(b.amount):''),sec:'bills'});});
 DB.kids.forEach(function(k){if(k.date===ds&&!k.done)out.push({k:'kids',id:k.id,t:(KEMO[k.type]||'🎒')+' '+(k.kid==='Both'?'':k.kid+': ')+k.title,sec:'kids'});});
 hdocs('appts').forEach(function(d){if(d.f.date===ds)out.push({k:'h',id:d.id,t:'🩺 '+(d.f.time?fmtT(d.f.time)+' ':'')+apptTitle(d.f),sec:'appts'});});
 hdocs('bdays').forEach(function(d){if(bdayOn(d.f,ds))out.push({k:'h',id:d.id,t:'🎂 '+d.f.name,sec:'bdays'});});
 DB.todos.forEach(function(t){if(t.due===ds&&!t.done&&t.star)out.push({k:'todos',id:t.id,t:'⭐ '+t.text,sec:'todo'});});return out;}

/* ---- views ---- */
function evBg(e){return e.g?'':' style="background:'+(EVHEX[e.color]||EVHEX.mustard)+'"';}
function evChip(e,ds){return '<span class="ev'+(e.g?' gc-'+e.cal:'')+'"'+evBg(e)+' data-ev="'+e.id+'" data-ds="'+(ds||'')+'" title="'+esc(e.title)+'">'+(e.time?'<i class="tm">'+fmtT(e.time).replace(' ','')+'</i> ':'')+esc((e.span&&e.span.i>1?'↳ ':'')+e.title)+'</span>';}
function xChip(x){return '<span class="ev xo" data-xo="'+x.k+':'+x.id+'" style="--xc:'+SM[x.sec].c+'" title="'+esc(x.t)+'">'+esc(x.t)+'</span>';}
function calView(tab){if(['month','week','list'].indexOf(tab)<0)tab=UI.calTab||(window.innerWidth<=700?'list':'month');UI.calTab=tab;saveUI();
 var h='<div class="bar">'+tabsHtml('calendar',[['month','Month'],['week','Week'],['list','Upcoming']],tab)+'<span class="grow"></span>'+addBtn('calendar','Add an event',null,'newev')+'</div>'+gcTools();
 if(tab==='month')h+=monthView();else if(tab==='week')h+=weekView();else h+=agendaView();
 return h;}
function monthView(){var ym=UI.calYM||today().slice(0,7),y=+ym.slice(0,4),m=+ym.slice(5,7)-1,f1=new Date(y,m,1),st=iso(new Date(y,m,1-f1.getDay())),t0=today();gcEnsure(st,addDays(st,41));
 var h='<div class="wnav"><button data-cal="-1" aria-label="Previous month">‹</button><b>'+MON[m]+' '+y+'</b><button data-cal="1" aria-label="Next month">›</button><button class="today" data-cal="0">Today</button></div>';
 h+='<div class="month">'+DOW.map(function(x){return '<div class="dow">'+x+'</div>';}).join('');
 for(var i=0;i<42;i++){var k=addDays(st,i),d=pd(k);if(i===35&&d.getMonth()!==m)break;var ev=eventsOn(k),xs=extrasOn(k),all=ev.length+xs.length,show=ev.slice(0,3).map(function(e){return evChip(e,k);}).concat(xs.slice(0,Math.max(0,3-ev.length)).map(xChip));
  h+='<button class="day'+(d.getMonth()!==m?' out':'')+(k===t0?' td':'')+(k===UI.calSel?' sel':'')+'" data-day="'+k+'" aria-label="'+esc(fmtLong(k))+(all?', '+all+' item'+(all===1?'':'s'):'')+'"><span class="n">'+d.getDate()+'</span>'+show.join('')+(all>3?'<span class="more">+'+(all-3)+' more</span>':'')+
   (all?'<span class="dots">'+ev.slice(0,3).map(function(e){return '<i class="'+(e.g?'gdot gc-'+e.cal:'')+'"'+(e.g?'':' style="background:'+mix(EVHEX[e.color]||EVHEX.mustard,'#000000',.35)+'"')+'></i>';}).join('')+(xs.length&&ev.length<3?'<i style="background:'+SM[xs[0].sec].d+'"></i>':'')+'</span>':'')+'</button>';}
 h+='</div>';var sel=UI.calSel;
 h+=sel?dayPanel(sel):'<div class="hint">Tap a day to see everything on it or add to it.</div>';return h;}
function weekView(){var w=sunday(UI.calWk||today()),t0=today();gcEnsure(w,addDays(w,6));
 var h='<div class="wnav"><button data-wk="-7" aria-label="Previous week">‹</button><b>'+fmtMD(w)+' – '+fmtMD(addDays(w,6))+'</b><button data-wk="7" aria-label="Next week">›</button>'+(w!==sunday()?'<button class="today" data-wk="0">This week</button>':'')+'</div><div class="wk">';
 for(var i=0;i<7;i++){var k=addDays(w,i),ev=eventsOn(k),xs=extrasOn(k);
  h+='<div class="wd'+(k===t0?' td':'')+'"><button class="wdh" data-day="'+k+'" data-dayopen="1"><b>'+DOW[pd(k).getDay()]+'</b><span>'+pd(k).getDate()+'</span></button><div class="wdl">'+ev.map(evChip).join('')+xs.map(xChip).join('')+(ev.length+xs.length?'':'<span class="wdn">—</span>')+'</div></div>';}
 return h+'</div><div class="hint">Tap a day to add to it. Tap an event to change it.</div>';}
function agendaView(){var st=UI.calFrom||today(),any=false,h='<div class="wnav"><button data-agn="-30" aria-label="Earlier">‹</button><b>'+(st===today()?'Next 30 days':fmtMD(st)+' onward')+'</b><button data-agn="30" aria-label="Later">›</button>'+(st!==today()?'<button class="today" data-agn="0">Today</button>':'')+'</div>';gcEnsure(st,addDays(st,30));
 for(var i=0;i<30;i++){var k=addDays(st,i),ev=eventsOn(k),xs=extrasOn(k);if(!ev.length&&!xs.length)continue;any=true;
  h+=grp(nice(k)+(nice(k)==='Today'||nice(k)==='Tomorrow'?' · '+fmtMD(k):''),k===today()?'now':'')+ev.map(function(e){return evRow(e,k);}).join('')+xs.map(xRow).join('');}
 if(!any)h+=emptyHtml('Nothing coming up','Tap “Add an event” to put something on the calendar.');return h;}
function evRow(e,ds){return row({title:(e.span&&e.span.i>1?'↳ ':'')+e.title,attr:'data-ev="'+e.id+'" data-ds="'+(ds||'')+'"',cls:'evr'+(e.g?' gc-'+e.cal:''),lead:'<i class="dot'+(e.g?' gdot gc-'+e.cal:'')+'"'+(e.g?'':' style="background:'+mix(EVHEX[e.color]||EVHEX.mustard,'#000000',.35)+'"')+'></i>',
 tags:[e.g?{t:gcName(e.cal),cls:'gbadge gc-'+e.cal}:'',e.repeat?'🔁 '+(REPNAME[e.repeat]||''):'',e.remind?'🔔':'',e.span?'day '+e.span.i+' of '+e.span.n:''],meta:first(e.note||'',80),side:e.time?fmtT(e.time)+(e.end?' – '+fmtT(e.end):''):'all day'});}
function xRow(x){return row({title:x.t,attr:'data-xo="'+x.k+':'+x.id+'"',cls:'xr',lead:'<i class="dot" style="background:'+SM[x.sec].d+'"></i>',side:SM[x.sec].rail});}
function dayPanel(ds){var ev=eventsOn(ds),xs=extrasOn(ds),me=mealFor(ds),td=DB.todos.filter(function(t){return t.due===ds&&!t.star;});
 var h='<div class="daylist">'+grp(fmtLong(ds))+(ev.length?ev.map(function(e){return evRow(e,ds);}).join(''):'')+xs.map(xRow).join('')+
  td.map(function(t){return row({title:t.text,attr:'data-open="todos:'+t.id+'"',check:!!t.done,checkVal:'todos:'+t.id,done:t.done,side:'To-do'});}).join('')+
  (me&&me.dinner?row({title:'Dinner: '+me.dinner,attr:'data-go="meals/plan"',lead:'<i class="dot" style="background:'+SM.meals.d+'"></i>',side:'Meals'}):'')+
  (!ev.length&&!xs.length&&!td.length?'<div class="hint">Nothing on this day yet.</div>':'')+
  '<div class="bar">'+addBtn('calendar','Add event',{date:ds},'newev')+'<button class="ghost" data-act="newtodo" data-preset="'+esc(JSON.stringify({due:ds}))+'">'+ic('plus')+'To-do</button><button class="ghost" data-act="newappt" data-preset="'+esc(JSON.stringify({date:ds}))+'">'+ic('plus')+'Appointment</button></div></div>';
 return h;}
function calAfter(){var s=$('.month .day.sel');if(s&&window.innerWidth<=700&&UI._scrollSel){UI._scrollSel=0;var dl=$('.daylist');if(dl)dl.scrollIntoView({block:'nearest',behavior:'smooth'});}}

/* ---- the event sheet (planner + Google) ---- */
function calOpts(){var o=GCAL_KEYS.filter(function(k){return gcOk(k)&&gcCanWrite(k);}).map(function(k){return [k,'📆 '+gcName(k)];});return o.concat([['planner','🗒️ Just the planner']]);}
function editEvent(e,date){var isG=!!(e&&e.g),o=isG?e.g:null;if(o&&o.ro)return gcView(o);
 var isNew=!e||(!e.id&&!isG);e=e||{date:date||today(),color:'mustard'};
 var vals=isG?{title:o.t,date:o.d,endDate:o.ed&&o.ed!==o.d?o.ed:'',time:o.tm||'',end:o.et||'',note:o.n||'',remind:e.remind||'',cal:o.k,color:''}:Object.assign({},e,{cal:isNew?gcLastCal():'planner',time:normT(e.time)||'',end:normT(e.end)||'',remind:e.remind||'',repeat:e.repeat||'',until:e.until||'',endDate:e.endDate||'',note:e.note||'',color:e.color||'mustard'});
 var notPlanner=function(f){return f.cal!=='planner';};
 var fields=[{k:'title',l:'What’s happening?',req:1,ph:'Soccer practice, date night, field trip…'},{k:'cal',l:'Which calendar?',t:'pick',opts:calOpts()},
  {k:'date',l:'Date',t:'date',req:1,half:1},{k:'endDate',l:'Ends on',t:'date',opt:1,half:1,hint:'For things that last more than a day'},
  {k:'time',l:'Start time',t:'time',opt:1,half:1},{k:'end',l:'End time',t:'time',opt:1,half:1}];
 if(!o||!o.rec)fields.push({k:'repeat',l:'Repeat',t:'select',opts:REPS,blank:false,half:1},{k:'until',l:'Repeat until',t:'date',opt:1,half:1,show:function(f){return !!f.repeat;}});
 fields.push({k:'remind',l:'🔔 Remind me',t:'select',opts:REM_EVT,blank:false},{k:'color',l:'Color',t:'swatch',opts:EVC,show:function(f){return f.cal==='planner';}},{k:'note',l:'Notes',t:'long',opt:1,ph:'Bring snacks, address, who’s driving…'});
 var top='';if(isG)top='<div class="ghint"><span class="gbadge gc-'+o.k+'">'+esc(gcName(o.k))+'</span> Saved in Google Calendar · nobody gets emailed'+(o.rec?'<br>🔁 This repeats in Google — changes here apply to <b>this day only</b>.':'')+(e.dupes?'<br>Google has '+(e.dupes+1)+' copies of this event; the planner shows one.':'')+(o.u?' <a href="'+esc(o.u)+'" target="_blank" rel="noopener">Open in Google ↗</a>':'')+'</div>';
 openForm({sec:SM.calendar,title:isNew?'New event':'Edit event',fields:fields,values:vals,top:top,
  onSave:function(v){var cal=v.cal||'planner';delete v.cal;if(v.endDate&&v.endDate<=v.date)v.endDate='';
   if(isNew){localStorage.setItem('gcLast',cal);if(gcPrefs().last!==cal)gcSetPrefs({last:cal});}
   if(cal!=='planner'){if(isG){gcSaveEvent(cal,v,o).catch(function(){});return;}var from=e.id?e:null;gcSaveEvent(cal,v,null).then(function(){if(from)remove('events',from.id,true);}).catch(function(){});return;}
   if(isG){toast('That one lives in Google. Pick Personal or Work to keep it there');return false;}
   if(!v.repeat)v.until='';if(v.repeat)v.endDate='';var was=e.remind||'';var it=Object.assign({},e,v);delete it.g;delete it._occ;save('events',it);if(v.remind!==was)remNudge(v.remind);toast(isNew?'Added to your planner ✓':'Updated ✓');},
  onDelete:isG?function(){gcDelete(o);}:(e.id?function(){var cp=clone(find('events',e.id)||e);remove('events',e.id);toast('Deleted',function(){save('events',cp);});}:null),
  footExtra:(!isG&&e.id&&e.repeat&&e._occ)?'<button class="btn" data-skip="'+e.id+':'+e._occ+'">Skip this day</button>':'',
  confirmDel:isG?'Delete this from your '+gcName(o.k)+' Google calendar?':'Delete this event?'});}
function gcView(o){var key=gcKey(o),pre=(gcPrefs().remind||{})[key]||'',why={guest:'This is an invite from someone else, so it can only be changed in Google Calendar.',guests:'Other people are on this event, so it can only be changed in Google Calendar.',type:'Google made this one (like a birthday), so it can’t be changed here.',access:'You can see this calendar but not change it.'}[o.ro]||'';
 var b='<div class="gview"><div class="gvt">'+esc(o.t)+'</div><div class="gvm"><span class="gbadge gc-'+o.k+'">'+esc(gcName(o.k))+'</span> '+esc(gcWhen(o))+'</div>'+(o.l?'<div class="gvm">📍 '+esc(o.l)+'</div>':'')+(o.n?'<div class="gvn">'+esc(o.n)+'</div>':'')+
  '<label class="fld"><span>🔔 Remind me</span><select data-gremind="'+esc(key)+'">'+REM_EVT.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===pre?' selected':'')+'>'+esc(c[1])+'</option>';}).join('')+'</select></label>'+
  '<div class="ghint">🔒 '+esc(why)+'</div></div>';
 infoSheet(SM.calendar,'Google Calendar event',b,(o.u?'<a class="btn" href="'+esc(o.u)+'" target="_blank" rel="noopener">Open in Google ↗</a>':''));}
function gcWhen(o){var s=nice(o.d)+(o.tm?' · '+fmtT(o.tm)+(o.et?' – '+fmtT(o.et):''):'');if(o.ed&&o.ed!==o.d)s=nice(o.d)+' – '+nice(o.ed)+(o.tm?' · '+fmtT(o.tm):'');else if(!o.tm)s+=' · all day';return s;}
function openEv(id,ds){if(id.indexOf('g~')===0){var occ=GOCC[+id.slice(2)];if(occ)editEvent(occ);return;}var e=find('events',id);if(e){var c=clone(e);if(ds)c._occ=ds;editEvent(c);}}
/* =================== TO-DO (v2 "todos") =================== */
var TTAGS=[['','None'],['home','🏡 Home'],['school','🍎 School'],['kids','🎒 Kids'],['errands','🚗 Errands'],['me','🌸 Me'],['crafts','✂️ Crafts']];
var TTAGMAP={};TTAGS.forEach(function(t){TTAGMAP[t[0]]=t[1];});
function todosSorted(a){return a.slice().sort(function(x,y){if(!!x.done!==!!y.done)return x.done?1:-1;if(!!x.star!==!!y.star&&!x.done)return x.star?-1:1;var p=x.due||'9999',q=y.due||'9999';if(p!==q)return p<q?-1:1;return (x.created||0)-(y.created||0);});}
function todoGroup(t){if(t.done)return 4;if(!t.due)return 3;var n=daysBetween(today(),t.due);if(n<0)return 0;if(n===0)return 1;if(n<=7)return 2;return 3;}
function todoView(tab){if(tab!=='open'&&tab!=='done')tab='open';var f=UI.todoF||'all',td=today();
 var all=DB.todos,a=all.filter(function(t){return tab==='done'?!!t.done:!t.done;});
 if(tab==='open'&&f!=='all')a=a.filter(function(t){if(f==='today')return t.due&&t.due<=td;if(f==='week')return t.due&&t.due<=addDays(td,7);if(f==='star')return !!t.star;return t.tag===f;});
 a=tab==='done'?a.sort(function(x,y){return (y.doneAt||y.created||0)-(x.doneAt||x.created||0);}):todosSorted(a);
 var used=TTAGS.filter(function(g){return g[0]&&all.some(function(x){return x.tag===g[0]&&!x.done;});});
 var h='<div class="bar">'+tabsHtml('todo',[['open','To do'],['done','Done']],tab)+'<span class="grow"></span>'+(tab==='done'&&a.length?'<button class="ghost" data-act="cleardone">Clear done</button>':'')+addBtn('todo','Add a to-do')+'</div>';
 if(tab==='open')h+=quickAddHtml('todo','Quick add… try “call dentist tomorrow” or “trash Fri”')+chipsHtml('todoF',f,[['all','All'],['today','Due today'],['week','This week'],['star','⭐ Important']].concat(used));
 if(!a.length)return h+emptyHtml(tab==='done'?'Nothing checked off yet':'All caught up!',tab==='done'?'':'Add anything that’s on your mind.');
 var GN=['⚠️ Overdue','☀️ Today','📅 This week','🌿 Later','✓ Done'],last=-1;
 a.forEach(function(t){var g=todoGroup(t);if(tab==='open'&&g!==last){h+=grp(GN[g],g===0?'late':'');last=g;}h+=todoRow(t);});return h;}
function todoRow(t){var late=t.due&&t.due<today()&&!t.done;
 return row({title:t.text,check:!!t.done,checkVal:'todos:'+t.id,done:t.done,attr:'data-open="todos:'+t.id+'"',cls:t.star&&!t.done?'starred':'',
  tags:[t.star&&!t.done?{t:'⭐',cls:'star'}:'',t.repeat?'🔁 '+(REPNAME[t.repeat]||''):'',t.tag&&TTAGMAP[t.tag]?TTAGMAP[t.tag]:'',t.remind&&!t.done?'🔔':''],meta:first(t.note,80),side:t.due?(late?'late · ':'')+nice(t.due):'',sideCls:late?'late':''});}
function editTodo(t,preset){var isNew=!t;t=t||Object.assign({},preset||{});
 openForm({sec:SM.todo,title:isNew?'New to-do':'Edit to-do',values:Object.assign({},t,{star:!!t.star}),fields:[
  {k:'text',l:'To-do',req:1,ph:'Rake leaves, call the dentist…'},{k:'due',l:'Due date',t:'date',opt:1,half:1},{k:'repeat',l:'Repeat',t:'select',opts:REPS,blank:false,half:1},
  {k:'star',l:'⭐ Important',t:'check'},{k:'tag',l:'Category',t:'pick',opts:TTAGS},{k:'remind',l:'🔔 Remind me',t:'select',opts:REM_DAY,blank:false},{k:'note',l:'Notes',t:'long',opt:1,ph:'Details, phone number…'}],
  onSave:function(v){if((v.repeat||v.remind)&&!v.due)v.due=today();var it=Object.assign({},t,{text:v.text,due:v.due,star:!!v.star,tag:v.tag,repeat:v.repeat,remind:v.remind,note:v.note,done:!!t.done});save('todos',it);if(v.remind!==(t.remind||''))remNudge(v.remind);toast(isNew?'Added ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(t);remove('todos',t.id);toast('Deleted',function(){save('todos',cp);});},confirmDel:'Delete this to-do?'});}
function toggleTodo(id){var it=find('todos',id);if(!it)return;
 if(it.repeat&&!it.done){var nd=advance(it.due||today(),it.repeat);if(nd<=today())nd=advance(today(),it.repeat);var old=clone(it);save('todos',Object.assign({},it,{due:nd,done:false}));toast('Done! Next one '+nice(nd)+' 🔁',function(){save('todos',old);});return;}
 var c=Object.assign({},it,{done:!it.done});if(c.done)c.doneAt=Date.now();save('todos',c);if(c.done)toast('Done ✓',function(){save('todos',Object.assign({},c,{done:false}));});}

/* =================== MEALS & GROCERIES (v2 "meals", "groceries", lists doc "meal-ideas") =================== */
var AISLES=[['produce','🥦 Produce'],['dairy','🥛 Dairy & eggs'],['meat','🍗 Meat & fish'],['bakery','🍞 Bakery & bread'],['pantry','🥫 Pantry'],['frozen','🧊 Frozen'],['snacks','🍪 Snacks & drinks'],['house','🧻 Household'],['care','🧴 Personal care'],['kids','🧸 Baby & kids'],['other','🛒 Other']];
var AISLEKW={produce:'apple banana grape berry berries strawberr lettuce salad spinach tomato potato onion garlic carrot celery pepper cucumber broccoli avocado lemon lime orange fruit veggie vegetable corn mushroom',
 dairy:'milk cheese yogurt butter egg cream sour half',meat:'chicken beef pork turkey ham bacon sausage hot dog fish salmon shrimp steak ground meat deli',
 bakery:'bread bun roll bagel tortilla muffin cake pie croissant',
 pantry:'rice pasta noodle flour sugar salt oil vinegar sauce soup bean can cereal oat peanut jelly jam honey spice seasoning broth stock syrup ketchup mustard mayo coffee tea baking mix',
 frozen:'frozen ice pizza waffle nugget fries tater popsicle',snacks:'chip cracker cookie snack candy soda juice water pop gatorade goldfish pretzel popcorn bar drink',
 house:'paper towel toilet trash bag detergent soap dish foil wrap napkin clean bleach sponge battery batteries laundry dryer',care:'shampoo conditioner toothpaste toothbrush deodorant lotion razor tampon pad floss vitamin medicine tylenol advil band',kids:'diaper wipe formula pull-up pullup baby'};
function guessAisle(item){var s=' '+String(item||'').toLowerCase()+' ',best='';Object.keys(AISLEKW).forEach(function(k){if(best)return;AISLEKW[k].split(' ').some(function(w){if(w&&s.indexOf(w)>=0){best=k;return true;}return false;});});return best||'other';}
function mealFor(ds){for(var i=0;i<DB.meals.length;i++)if(DB.meals[i].date===ds)return DB.meals[i];return null;}
function ideasDoc(){var d=find('lists','meal-ideas');return d?clone(d):{id:'meal-ideas',kind:'meals',name:'Meal ideas',emoji:'🍲',color:'oat',items:[]};}
function ingrList(s){return String(s||'').split(/\n|,/).map(function(x){return x.trim();}).filter(Boolean);}
function ideaByName(n){n=String(n||'').trim().toLowerCase();if(!n)return null;return (ideasDoc().items||[]).filter(function(x){return x.text.toLowerCase()===n;})[0]||null;}
function setDinner(ds,text){var me=mealFor(ds);if(!text){if(me)remove('meals',me.id,true);return;}save('meals',Object.assign({id:'d'+ds.replace(/-/g,''),date:ds,made:false},me||{},{dinner:text}),true);}
function addGrocery(text,extra){text=String(text||'').trim();if(!text)return null;var q='1',m=text.match(/^(\d+)\s*x?\s+(.+)$/i),m2=text.match(/^(.+?)\s+x\s*(\d+)$/i);
 if(m){q=m[1];text=m[2];}else if(m2){text=m2[1];q=m2[2];}
 var dup=DB.groceries.filter(function(x){return !x.got&&String(x.item).toLowerCase()===text.toLowerCase();})[0];
 if(dup){if(extra)return dup;return save('groceries',Object.assign({},dup,{qty:String((parseInt(dup.qty,10)||1)+(parseInt(q,10)||1))}),true);}
 return save('groceries',Object.assign({item:text,qty:q,got:false,aisle:guessAisle(text)},extra||{}),true);}
function addIngredients(idea){var n=0;ingrList(idea.ingr).forEach(function(x){var had=DB.groceries.some(function(g){return !g.got&&String(g.item).toLowerCase()===x.toLowerCase();});if(!had){addGrocery(x,{gf:false});n++;}});render();
 toast(n?n+' ingredient'+(n===1?'':'s')+' added to groceries 🛒':'Everything’s already on your list');}
function mealsView(tab){if(['plan','groceries','ideas'].indexOf(tab)<0)tab=UI.mealTab||'plan';UI.mealTab=tab;saveUI();
 var g=DB.groceries.filter(function(x){return !x.got;}).length,I=(ideasDoc().items||[]).length;
 var h='<div class="bar">'+tabsHtml('meals',[['plan','Dinner plan'],['groceries','Grocery list'+(g?' · '+g:'')],['ideas','Meal ideas'+(I?' · '+I:'')]],tab)+'<span class="grow"></span>'+
  (tab==='ideas'?addBtn('meals','Add a meal idea',null,'newidea'):tab==='groceries'?addBtn('meals','Add an item',null,'newgroc'):'')+'</div>';
 if(tab==='plan')return h+planView();if(tab==='groceries')return h+grocView();return h+ideasView();}
function planView(){var w=monday(addDays(today(),(UI.mealWk||0)*7)),td=today(),I=ideasDoc().items||[],h='';
 var lbl=UI.mealWk===1?'Next week':UI.mealWk===-1?'Last week':!UI.mealWk?'This week':'Week of '+fmtMD(w);
 h+='<div class="wnav"><button data-mwk="-1" aria-label="Previous week">‹</button><b>'+lbl+'</b><button data-mwk="1" aria-label="Next week">›</button>'+(UI.mealWk?'<button class="today" data-mwk="0">This week</button>':'')+'</div>';
 for(var i=0;i<7;i++){var ds=addDays(w,i),me=mealFor(ds)||{},idea=ideaByName(me.dinner);
  h+='<div class="row drow'+(ds===td?' now':'')+(me.made?' done':'')+'"><span class="dn"><b>'+DOW[pd(ds).getDay()]+'</b><small>'+fmtMD(ds)+'</small></span><input class="din" data-din="'+ds+'" value="'+esc(me.dinner||'')+'" placeholder="What’s for dinner?" autocomplete="off" enterkeyhint="done" list="ideaopts" aria-label="Dinner on '+esc(fmtLong(ds))+'">'+
  (idea&&ingrList(idea.ingr).length?'<button class="ib2" data-ingr="'+idea.id+'" title="Add ingredients to groceries" aria-label="Add ingredients to groceries">🛒</button>':'<button class="ib2" data-pickday="'+ds+'" title="Pick from meal ideas" aria-label="Pick from meal ideas">💡</button>')+
  '<button class="ck'+(me.made?' on':'')+'" data-made="'+ds+'" aria-label="Made it"'+(me.dinner?'':' disabled')+'>'+ic('check',3)+'</button></div>';}
 h+='<datalist id="ideaopts">'+I.map(function(x){return '<option value="'+esc(x.text)+'">';}).join('')+'</datalist>';
 h+='<div class="bar" style="margin-top:4px"><button class="ghost" data-mealcopy="'+w+'">Copy last week</button><button class="ghost" data-mealclear="'+w+'">Clear week</button><span class="grow"></span><span class="hint">Type a meal, or tap 💡 to pick one of your ideas</span></div>';
 return h;}
function grocView(){var g=DB.groceries.slice().sort(function(a,b){return (a.created||0)-(b.created||0);}),open=g.filter(function(x){return !x.got;}),got=g.filter(function(x){return x.got;}),h=quickAddHtml('groc','Add an item… “2 milk” works');
 if(!g.length)return h+emptyHtml('Your list is empty','Add milk, eggs, coffee… they sort themselves by aisle.');
 AISLES.forEach(function(a){var items=open.filter(function(x){return (x.aisle||guessAisle(x.item))===a[0];});if(items.length)h+=grp(a[1])+items.map(grocRow).join('');});
 if(got.length)h+=grp('✓ In the cart')+got.map(grocRow).join('')+'<div class="bar"><button class="ghost" data-act="cleargot">Clear checked items ('+got.length+')</button></div>';return h;}
function grocRow(x){return row({title:x.item,check:!!x.got,checkVal:'groceries:'+x.id,checkAttr:'got',done:x.got,attr:'data-open="groceries:'+x.id+'"',tags:[x.qty&&x.qty!=='1'?'×'+x.qty:'',x.gf?{t:'GF',cls:'gf'}:''],meta:x.note||''});}
function editGrocery(g){var isNew=!g;g=g||{};openForm({sec:SM.meals,title:isNew?'Add a grocery item':'Edit grocery item',values:Object.assign({qty:'1'},g,{aisle:g.aisle||(g.item?guessAisle(g.item):''),gf:!!g.gf}),fields:[
  {k:'item',l:'Item',req:1,ph:'Milk'},{k:'qty',l:'How many?',half:1,ph:'1'},{k:'aisle',l:'Aisle',t:'select',opts:AISLES,half:1,blank:'Guess for me'},{k:'gf',l:'Gluten-free only',t:'check'},{k:'note',l:'Note',opt:1,ph:'Brand, size…'}],
  onSave:function(v){v.gf=!!v.gf;if(!v.aisle)v.aisle=guessAisle(v.item);save('groceries',Object.assign({got:false},g,v));toast(isNew?'Added to groceries ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(g);remove('groceries',g.id);toast('Removed',function(){save('groceries',cp);});},confirmDel:false});}
function ideasView(){var I=ideasDoc().items||[],h='';if(!I.length)return emptyHtml('No meal ideas yet','Save the dinners you make again and again — with ingredients, so one tap adds them to groceries.');
 return I.slice().sort(function(a,b){return String(a.text).localeCompare(String(b.text));}).map(function(x){var n=ingrList(x.ingr).length;return row({title:x.text,attr:'data-idea="'+x.id+'"',tags:[x.gf?{t:'GF',cls:'gf'}:'',x.link?'🔗 recipe':''],meta:n?'🛒 '+n+' ingredient'+(n===1?'':'s'):'No ingredients yet',
  extra:'<button class="ghost sm" data-planidea="'+x.id+'">Plan it</button>'});}).join('');}
function editIdea(it){var I=ideasDoc(),isNew=!it;it=it||{};openForm({sec:SM.meals,title:isNew?'New meal idea':'Edit meal idea',values:Object.assign({},it,{gf:!!it.gf}),fields:[
  {k:'text',l:'Meal',req:1,ph:'Crockpot chili'},{k:'ingr',l:'Ingredients (one per line)',t:'long',rows:5,opt:1,ph:'ground beef\nbeans\nchili seasoning'},{k:'gf',l:'🌾 Gluten-free friendly',t:'check'},{k:'link',l:'Recipe link',opt:1,url:1,ph:'https://…'}],
  onSave:function(v){v.gf=!!v.gf;if(!isNew)I.items=I.items.map(function(x){return x.id===it.id?Object.assign({},x,v):x;});else I.items.push(Object.assign({id:uid()},v));save('lists',I);toast(isNew?'Saved to meal ideas ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var old=find('lists','meal-ideas');I.items=I.items.filter(function(x){return x.id!==it.id;});save('lists',I);toast('Removed',function(){save('lists',old);});},confirmDel:'Remove this meal idea?',
  footExtra:!isNew&&it.link?'<a class="btn" href="'+esc(it.link)+'" target="_blank" rel="noopener">Recipe ↗</a>':''});}
function planIdea(it){var opts=[],m=monday();for(var i=0;i<14;i++){var ds=addDays(m,i);if(ds<today())continue;var me=mealFor(ds);opts.push([ds,(i<7?'':'Next ')+DOWL[pd(ds).getDay()]+' '+fmtMD(ds)+(me&&me.dinner?' (has '+me.dinner+')':'')]);}
 openForm({sec:SM.meals,title:'Plan “'+it.text+'”',ok:'Plan it',values:{day:opts[0][0],ing:ingrList(it.ingr).length>0},fields:[{k:'day',l:'Which night?',t:'select',opts:opts,blank:false},{k:'ing',l:'🛒 Add the ingredients to groceries',t:'check'}],
  onSave:function(v){setDinner(v.day,it.text);if(v.ing&&ingrList(it.ingr).length)addIngredients(it);else{render();toast('Planned for '+nice(v.day)+' 🍲');}}});}
function pickIdea(ds){var I=ideasDoc().items||[];if(!I.length){toast('Add a few meal ideas first 💡');go('meals/ideas');return;}
 openForm({sec:SM.meals,title:'Dinner for '+fmtLong(ds),values:{},fields:[],noCancel:false,focus:false,top:'<div class="pick ideapick">'+I.map(function(x){return '<button type="button" data-pickidea="'+ds+'|'+x.id+'">'+esc(x.text)+'</button>';}).join('')+'</div>'});}

/* =================== BILLS & BUDGET (v2 "bills" + home docs sec "budget") =================== */
var BCATS=[['','None'],['home','🏡 Housing'],['util','💡 Utilities'],['phone','📱 Phone & internet'],['subs','📺 Subscriptions'],['car','🚗 Car'],['kids','🎒 Kids & school'],['debt','💳 Cards & loans'],['ins','🛡️ Insurance'],['other','✨ Other']];
var BCATMAP={};BCATS.forEach(function(c){BCATMAP[c[0]]=c[1];});
function billNext(b){var t=pd(today()),f=b.freq||'monthly';
 if(f==='once')return pd(b.dueDate)||t;
 var dd=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);
 if(f==='yearly'){var mo=Math.min(Math.max(parseInt(b.dueMonth,10)||1,1),12)-1;function mky(y){var last=new Date(y,mo+1,0).getDate();return new Date(y,mo,Math.min(dd,last));}
  var y=mky(t.getFullYear());if(b.paidFor===String(y.getFullYear()))y=mky(t.getFullYear()+1);else if(y<t&&daysBetween(iso(y),iso(t))>31)y=mky(t.getFullYear()+1);return y;}
 function mk(y,m){var last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(dd,last));}
 var x=mk(t.getFullYear(),t.getMonth());if(b.paidFor===monthKey())x=mk(t.getFullYear(),t.getMonth()+1);return x;}
function billKey(b){var f=b.freq||'monthly';if(f==='once')return 'once';if(f==='yearly')return String(billNext(Object.assign({},b,{paidFor:''})).getFullYear());return monthKey();}
function billPaid(b){var f=b.freq||'monthly';if(b.auto&&f!=='once'&&!b.paidFor){var dn=iso(billNext(Object.assign({},b,{paidFor:''})));if(dn<=today()&&daysBetween(dn,today())<=31)return true;}
 if(f==='once')return b.paidFor==='once';if(f==='yearly')return b.paidFor===String(billNext(Object.assign({},b,{paidFor:''})).getFullYear());return b.paidFor===monthKey();}
function togglePaid(id){var b=find('bills',id);if(!b)return;var was=billPaid(b),k=billKey(b),h=(b.history||[]).filter(function(x){return x.k!==k;});
 if(!was)h.push({k:k,on:today(),amt:b.amount||''});save('bills',Object.assign({},b,{paidFor:was?'':k,history:h.slice(-24)}));if(!was)toast(b.name+' marked paid 🌿');}
function billsInMonth(){var t=pd(today());return DB.bills.filter(function(b){var f=b.freq||'monthly';if(f==='monthly')return true;var n=billNext(Object.assign({},b,{paidFor:''}));return n.getFullYear()===t.getFullYear()&&n.getMonth()===t.getMonth();});}
function billsView(tab){if(tab!=='bills'&&tab!=='budget')tab=UI.billTab||'bills';UI.billTab=tab;saveUI();
 var h='<div class="bar">'+tabsHtml('bills',[['bills','Bills'],['budget','Budget']],tab)+'<span class="grow"></span>'+(tab==='bills'?addBtn('bills','Add a bill'):addBtn('bills','Add a budget line',null,'newbud'))+'</div>';
 var mb=billsInMonth(),tot=0,paid=0;mb.forEach(function(x){tot+=num(x.amount);if(billPaid(x))paid+=num(x.amount);});
 if(tab==='bills'){h+='<div class="stats"><div class="stat"><span>Due in '+MON[pd(today()).getMonth()]+'</span><b>'+(money(tot)||'$0')+'</b></div><div class="stat"><span>Paid so far</span><b>'+(money(paid)||'$0')+'</b></div><div class="stat"><span>Still to pay</span><b>'+(money(Math.max(tot-paid,0))||'$0')+'</b></div></div>'+(tot?'<div class="prog"><i style="width:'+Math.round(paid*100/tot)+'%"></i></div>':'');
  var all=DB.bills.slice().sort(function(x,y){return billNext(x)-billNext(y);}),late=[],week=[],later=[],done=[];
  all.forEach(function(b){if(billPaid(b)){done.push(b);return;}var dl=daysBetween(today(),iso(billNext(b)));if(dl<0)late.push(b);else if(dl<=7)week.push(b);else later.push(b);});
  if(!all.length)return h+emptyHtml('No bills yet','Add rent, phone, electric… and mark them paid each month.');
  [['🌿 Not marked paid yet',late,'late'],['⏳ Due in the next 7 days',week],['📅 Coming up',later],['✓ Paid',done]].forEach(function(g){if(g[1].length)h+=grp(g[0],g[2])+g[1].map(billRow).join('');});return h;}
 /* budget */
 var B=hdocs('budget'),inc=B.filter(function(d){return d.f.type==='income';}),plan=B.filter(function(d){return d.f.type!=='income';});
 var incT=inc.reduce(function(s,d){return s+num(d.f.amount);},0),planT=plan.reduce(function(s,d){return s+num(d.f.amount);},0),monthly=DB.bills.filter(function(b){return (b.freq||'monthly')==='monthly';}).reduce(function(s,b){return s+num(b.amount);},0);
 var left=incT-monthly-planT;
 h+='<div class="stats"><div class="stat"><span>Monthly income</span><b>'+(money(incT)||'$0')+'</b></div><div class="stat"><span>Bills + spending plan</span><b>'+(money(monthly+planT)||'$0')+'</b></div><div class="stat'+(left<0?' neg':'')+'"><span>'+(left<0?'Over by':'Left over')+'</span><b>'+(money(Math.abs(left))||'$0')+'</b></div></div>';
 h+=grp('💰 Income')+(inc.length?inc.map(budRow).join(''):'<div class="hint">Add your paychecks so you can see what’s left.</div>');
 h+=grp('🛒 Spending plan (groceries, gas, fun…)')+(plan.length?plan.map(budRow).join(''):'<div class="hint">Add what you plan to spend each month on things that aren’t bills.</div>');
 var cats={};DB.bills.forEach(function(b){if((b.freq||'monthly')!=='monthly')return;var c=b.cat||'other';cats[c]=(cats[c]||0)+num(b.amount);});
 var ck=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];});
 h+=grp('📊 Monthly bills by category')+(ck.length?ck.map(function(c){return row({title:BCATMAP[c]||'✨ Other',lead:'<i class="dot"></i>',side:money(cats[c]),attr:'data-go="bills/bills"'});}).join(''):'<div class="hint">Add bills to see where the money goes.</div>');
 var yearly=monthly*12+DB.bills.filter(function(b){return b.freq==='yearly';}).reduce(function(s,b){return s+num(b.amount);},0);
 if(yearly)h+='<div class="hint">About '+money(Math.round(yearly))+' a year in bills.</div>';return h;}
function budRow(d){return row({title:d.f.name,attr:'data-open="h:'+d.id+'"',lead:'<i class="dot"></i>',meta:d.f.note||'',side:money(d.f.amount)});}
function billRow(x){var p=billPaid(x),nx=iso(billNext(p?Object.assign({},x,{paidFor:billKey(x)}):x)),dl=daysBetween(today(),nx),f=x.freq||'monthly',last=(x.history||[]).slice(-1)[0];
 var when=p?(f==='once'?'paid':'paid'+(last&&last.on?' '+nice(last.on):'')+' · next '+nice(nx)):dl<0?'was due '+nice(nx):dl===0?'due today':dl===1?'due tomorrow':'due '+nice(nx);
 return row({title:x.name,check:p,checkVal:x.id,checkAttr:'paid',done:false,cls:p?'paid':'',attr:'data-open="bills:'+x.id+'"',tags:[x.auto?'🔁 autopay':'',x.remind?'🔔':'',f!=='monthly'?(f==='yearly'?'yearly':'one-time'):'',x.cat&&BCATMAP[x.cat]?BCATMAP[x.cat]:''],meta:when,side:money(x.amount),sideCls:!p&&dl<=3?'late':''});}
function editBill(b){var isNew=!b;b=b||{freq:'monthly'};
 openForm({sec:SM.bills,title:isNew?'New bill':'Edit bill',values:Object.assign({},b,{freq:b.freq||'monthly',auto:!!b.auto,dueMonth:b.dueMonth?String(b.dueMonth):'',dueDay:b.dueDay!=null?String(b.dueDay):'',remind:b.remind||''}),fields:[
  {k:'name',l:'Bill',req:1,ph:'Electric'},{k:'amount',l:'Amount',t:'number',ph:'85.00',half:1},{k:'cat',l:'Category',t:'select',opts:BCATS.slice(1),half:1},
  {k:'freq',l:'How often?',t:'pick',opts:[['monthly','Every month'],['yearly','Once a year'],['once','Just once']]},
  {k:'dueDay',l:'Due day of the month',t:'number',ph:'15',half:1,show:function(f){return f.freq!=='once';}},{k:'dueMonth',l:'Month',t:'select',half:1,opts:MON.map(function(m,i){return [String(i+1),m];}),show:function(f){return f.freq==='yearly';}},
  {k:'dueDate',l:'Due date',t:'date',show:function(f){return f.freq==='once';}},
  {k:'auto',l:'🔁 Autopay (counts as paid on its due day)',t:'check'},{k:'remind',l:'🔔 Remind me',t:'select',opts:REM_BILL,blank:false},{k:'note',l:'Notes',t:'long',opt:1,ph:'Card, account number hint, website…'}],
  onSave:function(v){v.dueDay=Math.min(Math.max(parseInt(v.dueDay,10)||1,1),31);v.auto=!!v.auto;v.freq=v.freq||'monthly';if(v.freq==='once'&&!v.dueDate)v.dueDate=today();var was=b.remind||'';save('bills',Object.assign({},b,v));if(v.remind!==was)remNudge(v.remind);toast(isNew?'Bill added ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(b);remove('bills',b.id);toast('Deleted',function(){save('bills',cp);});},confirmDel:'Delete this bill?'});}
function editBud(d){var isNew=!d;d=d||hnew('budget',{type:'plan'});openForm({sec:SM.bills,title:isNew?'New budget line':'Edit budget line',values:d.f,fields:[
  {k:'type',l:'Kind',t:'pick',opts:[['income','💰 Income'],['plan','🛒 Spending plan']]},{k:'name',l:'Name',req:1,ph:'Paycheck, groceries, gas, fun money…'},{k:'amount',l:'Amount per month',t:'number',req:1,ph:'400'},{k:'note',l:'Notes',opt:1}],
  onSave:function(v){d=clone(d);d.f=v;hsave(d);toast(isNew?'Added ✓':'Updated ✓');},onDelete:isNew?null:function(){var cp=clone(d);remove('lists',d.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this line?'});}

/* =================== CLEANING (home docs sec "cleaning") =================== */
var ROOMS=['Kitchen','Bathrooms','Bedrooms','Kids’ rooms','Living room','Laundry','Floors','Outside','Whole house'];
/* room colors: soft NOVA pastels per room; her picks live in settings (cfg().roomCol, keyed by roomKey) */
var ROOMDEF={kitchen:'#CFE5C6',bathroom:'#C6E2F5',bedroom:'#E2D2F4',kidsroom:'#F6C6DA',livingroom:'#FCE3A3',laundry:'#B8E2E6',floor:'#EEDDC4',outside:'#DDEBB8',wholehouse:'#F9CDB8'};
var ROOMX=['#CDD3EE','#F4C2C9','#FBD3AE','#BFE6D8','#E5E1D8','#D9CFF2','#F7C6BA','#CBD3F3'];
function roomKey(r){return String(r||'Whole house').toLowerCase().replace(/[^a-z]/g,'').replace(/s$/,'')||'wholehouse';}
function roomC(r){var k=roomKey(r),mine=(cfg().roomCol||{})[k];if(mine)return mine;if(ROOMDEF[k])return ROOMDEF[k];
 var extra=[];hdocs('cleaning').forEach(function(d){var x=roomKey(d.f.room);if(!ROOMDEF[x]&&extra.indexOf(x)<0)extra.push(x);});extra.sort();var i=extra.indexOf(k);if(i<0){i=0;for(var j=0;j<k.length;j++)i+=k.charCodeAt(j);}return ROOMX[i%ROOMX.length];}
function roomVars(r){var c=roomC(r),d=deepen(c),rw=rowColor(c);for(var i=0;i<10&&contrast(d,rw)<4.7;i++)d=mix(d,'#1E1A30',.1);return vars({c:c,d:d});}
function roomHead(r){return '<div class="grp rgrp" style="'+roomVars(r)+'"><span class="rname"><i></i>'+esc(r)+'</span><button class="rcol" data-roomcol="'+esc(r)+'" aria-label="Change the color of '+esc(r)+'" title="Room color">'+ic('palette')+'</button></div>';}
function roomColOpen(r){var k=roomKey(r),cur=roomC(r),mine=(cfg().roomCol||{})[k];
 var h='<p class="hint">Pick a color for '+esc(r)+'. Its title and tasks change together.</p><div class="czpal">'+SWATCH.map(function(c){return '<button class="swb'+(cur.toUpperCase()===c.toUpperCase()?' on':'')+'" style="background:'+c+'" data-roomset="'+esc(r)+'|'+c+'" aria-label="'+c+'"></button>';}).join('')+
  '<label class="anyc" title="Any color"><input type="color" value="'+esc(cur)+'" data-roomany="'+esc(r)+'"><span>Any color</span></label>'+(mine?'<button class="ghost sm" data-roomset="'+esc(r)+'|">Default</button>':'')+'</div>'+
  '<div class="rprev" style="'+roomVars(r)+'">'+roomHead(r).replace(/<button[\s\S]*<\/button>/,'')+row({title:'This is how '+r+' tasks look',check:false,checkVal:'',tags:[r],meta:'Every week'})+'</div>';
 openForm({sec:SM.cleaning,title:'Room color',fields:[],values:{},top:h,noCancel:true,focus:false,onSave:function(){},ok:'Done'});FORM.room=r;}
function roomColSet(r,c){var m=clone(cfg().roomCol||{}),k=roomKey(r);if(c)m[k]=c;else delete m[k];setCfg({roomCol:Object.keys(m).length?m:undefined},true);roomColOpen(r);rerender();}
var CFREQ=[['daily','Every day'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month'],['quarterly','Every 3 months'],['yearly','Once a year']];
var CFN={};CFREQ.forEach(function(c){CFN[c[0]]=c[1];});
function cleanDue(d){var f=d.f||{},last=f.last;if(!last)return f.start||today();var n={daily:1,weekly:7,biweekly:14,monthly:30,quarterly:91,yearly:365}[f.freq||'weekly']||7;return addDays(last,n);}
var STARTER=[['Dishes & wipe counters','Kitchen','daily'],['Quick tidy & reset','Living room','daily'],['Laundry','Laundry','weekly'],['Clean bathrooms','Bathrooms','weekly'],['Vacuum','Floors','weekly'],['Mop floors','Floors','biweekly'],['Change sheets','Bedrooms','weekly'],['Take out trash & recycling','Kitchen','weekly'],['Clean out the fridge','Kitchen','weekly'],['Dust','Living room','biweekly'],['Wipe appliances & microwave','Kitchen','biweekly'],['Clean windows & mirrors','Whole house','monthly'],['Wash rugs & throw blankets','Whole house','monthly'],['Change air filter','Whole house','quarterly']];
function cleanView(tab){if(tab!=='due'&&tab!=='rooms')tab=UI.cleanTab||'due';UI.cleanTab=tab;saveUI();var a=hdocs('cleaning'),t=today();
 var h='<div class="bar">'+tabsHtml('cleaning',[['due','Due now'],['rooms','By room']],tab)+'<span class="grow"></span>'+addBtn('cleaning','Add a task')+'</div>';
 if(!a.length)return h+emptyHtml('No cleaning routine yet','Add your own tasks, or start with a simple routine you can change.')+'<div class="bar" style="justify-content:center"><button class="btn pri" data-act="starter">Add a starter routine</button></div>';
 if(tab==='due'){var sorted=a.slice().sort(function(x,y){var p=cleanDue(x),q=cleanDue(y);return p<q?-1:p>q?1:String(x.f.task).localeCompare(String(y.f.task));});
  var G=[['🧽 Due today',function(d){return cleanDue(d)<=t;}],['📅 Later this week',function(d){var c=cleanDue(d);return c>t&&c<=addDays(t,7);}],['🌿 Coming up',function(d){return cleanDue(d)>addDays(t,7);}]];
  G.forEach(function(g){var it=sorted.filter(g[1]);if(it.length)h+=grp(g[0])+it.map(cleanRow).join('');});return h;}
 ROOMS.concat(a.map(function(d){return d.f.room;}).filter(function(r){return r&&ROOMS.indexOf(r)<0;})).forEach(function(r,i,arr){if(arr.indexOf(r)!==i)return;var it=a.filter(function(d){return (d.f.room||'Whole house')===r;});if(it.length)h+='<div class="rblk">'+roomHead(r)+it.sort(function(x,y){return cleanDue(x)<cleanDue(y)?-1:1;}).map(cleanRow).join('')+'</div>';});return h;}
function cleanRow(d){var f=d.f,due=cleanDue(d),od=due<today();return row({title:f.task,check:false,checkVal:d.id,checkAttr:'clean',cls:'rrow',attr:'data-open="h:'+d.id+'" style="'+roomVars(f.room||'Whole house')+'"',tags:[f.room,f.who&&f.who!=='Me'?f.who:'',f.remind?'🔔':''],meta:(CFN[f.freq]||'')+(f.last?' · last done '+nice(f.last):' · not done yet'),side:due<=today()?(od?'overdue':'today'):nice(due),sideCls:od?'late':''});}
function editClean(d){var isNew=!d;d=d||hnew('cleaning',{freq:'weekly',room:'Kitchen'});openForm({sec:SM.cleaning,title:isNew?'New cleaning task':'Edit cleaning task',values:d.f,fields:[
  {k:'task',l:'Task',req:1,ph:'Clean bathrooms'},{k:'room',l:'Room',t:'pick',opts:ROOMS},{k:'freq',l:'How often?',t:'select',opts:CFREQ,blank:false,half:1},{k:'last',l:'Last done',t:'date',opt:1,half:1},
  {k:'who',l:'Who does it',t:'pick',opts:['Me','Blake','Weston','Holden','Everyone']},{k:'note',l:'Notes',t:'long',opt:1,ph:'Products, steps…'}],
  onSave:function(v){d=clone(d);d.f=Object.assign({},d.f,v);if(isNew&&!v.last)d.f.start=today();hsave(d);toast(isNew?'Added ✓':'Updated ✓');},onDelete:isNew?null:function(){var cp=clone(d);remove('lists',d.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this task?'});$$('[data-pick=room] button').forEach(function(b){b.setAttribute('style',roomVars(b.getAttribute('data-val')));});}
function cleanDone(id){var d=hget(id);if(!d)return;var old=clone(d),c=clone(d);c.f.last=today();hsave(c);toast('Nice! “'+c.f.task+'” is done ✨ Next: '+nice(cleanDue(c)),function(){hsave(old);});}

/* =================== BRAIN DUMP (v2 "brain") =================== */
var NOTE_COLORS=['yellow','peach','sage','cream','rose','tan'],NOTE_HEX={yellow:'#FBEBA8',peach:'#F9D3B7',sage:'#DDE7C6',cream:'#FCF4E0',rose:'#F6CFD6',tan:'#EBDDC8'};
function brainView(){var a=DB.brain,done=a.filter(function(x){return x.done;}).length;
 var h='<div class="cap"><textarea id="cap" rows="2" placeholder="What’s on your mind? Type it here…" aria-label="New brain dump note"></textarea><button class="add" data-act="cap">'+ic('plus',2.5)+'Save it</button></div>';
 if(a.length)h+='<div class="bar"><label class="srch">'+ic('search')+'<input type="search" id="bq" placeholder="Search notes…" value="'+esc(UI.bq||'')+'" autocomplete="off" aria-label="Search notes"></label>'+
  '<div class="chips">'+[['','All']].concat(NOTE_COLORS.map(function(c){return [c,''];})).map(function(o){return '<button class="chip'+(o[0]?' cdot':'')+((UI.bc||'')===o[0]?' on':'')+'" data-chip="bc|'+o[0]+'"'+(o[0]?' style="background:'+NOTE_HEX[o[0]]+'" aria-label="'+o[0]+' notes"':'')+'>'+o[1]+'</button>';}).join('')+'</div>'+
  (done?'<button class="ghost" data-act="clearbrain">Clear done ('+done+')</button>':'')+'</div>';
 return h+'<div id="notesw">'+notesHtml()+'</div>';}
function notesHtml(){var q=String(UI.bq||'').toLowerCase(),bc=UI.bc||'',a=DB.brain.filter(function(x){return (!q||String(x.text).toLowerCase().indexOf(q)>=0)&&(!bc||x.color===bc);});
 a.sort(function(x,y){if(!!x.done!==!!y.done)return x.done?1:-1;if(!!x.pin!==!!y.pin)return x.pin?-1:1;return (y.created||0)-(x.created||0);});
 if(!a.length)return emptyHtml(DB.brain.length?'No notes match':'Your brain dump is empty','Ideas, worries, “don’t forget”s — toss them here and sort them later.');
 return '<div class="stickies">'+a.map(function(x){return '<div class="sticky'+(x.done?' done':'')+'" style="background:'+(NOTE_HEX[x.color]||NOTE_HEX.yellow)+'" data-open="brain:'+x.id+'" role="button" tabindex="0">'+(x.pin?'<span class="pinm" aria-label="pinned">📌</span>':'')+'<div class="st">'+esc(x.text).replace(/\n/g,'<br>')+'</div><div class="sb"><button class="ck'+(x.done?' on':'')+'" data-bdone="'+x.id+'" aria-label="Done">'+ic('check',3)+'</button><span>'+(x.created>1e12?nice(iso(new Date(x.created))):'')+'</span></div></div>';}).join('')+'</div>';}
function editBrain(n){var isNew=!n;n=n||{color:NOTE_COLORS[DB.brain.length%NOTE_COLORS.length]};var fields=[{k:'text',l:'Your thought',t:'long',rows:4,req:1,ph:'Idea for a costume…'},{k:'color',l:'Note color',t:'swatch',opts:NOTE_COLORS.map(function(c){return [c,NOTE_HEX[c]];})},{k:'pin',l:'📌 Pin to the top',t:'check'}];
 if(!isNew)fields.push({k:'move',l:'Turn it into…',t:'pick',opts:[['','Keep as a note'],['todo','✅ To-do'],['grocery','🛒 Grocery'],['event','📅 Event'],['kid','🎒 Kids & school'],['idea','🍲 Meal idea'],['project','🔨 Home project']]});
 openForm({sec:SM.brain,title:isNew?'New note':'Edit note',values:Object.assign({},n,{pin:!!n.pin,move:''}),fields:fields,
  onSave:function(v){var mv=v.move;delete v.move;v.pin=!!v.pin;var it=Object.assign({done:false},n,v);if(!mv){save('brain',it);return;}setTimeout(function(){convertNote(it,mv);},0);},
  onDelete:isNew?null:function(){var cp=clone(n);remove('brain',n.id);toast('Deleted',function(){save('brain',cp);});},confirmDel:false});}
function convertNote(n,mv){var old=find('brain',n.id),txt=n.text.split('\n')[0].trim(),rest=n.text.indexOf('\n')>0?n.text:'',made=null;
 if(mv==='todo'){var p=parseWhen(txt);made=['todos',save('todos',{text:p.text,due:p.due,done:false,note:rest},true)];}
 else if(mv==='grocery'){var items=n.text.split(/\n|,/).map(function(x){return x.trim();}).filter(Boolean);items.forEach(function(x){addGrocery(x);});remove('brain',n.id);toast(items.length+' added to groceries 🛒',function(){save('brain',old);});return;}
 else if(mv==='kid')made=['kids',save('kids',{kid:'Both',title:txt,type:'note',done:false,date:'',note:rest},true)];
 else if(mv==='idea'){var I=ideasDoc();I.items.push({id:uid(),text:txt,ingr:n.text.split('\n').slice(1).join('\n'),gf:false});save('lists',I,true);}
 else if(mv==='project')made=['lists',hsave(hnew('projects',{name:txt,status:'Idea',notes:rest}),true)];
 else if(mv==='event'){remove('brain',n.id,true);editEvent({title:txt,date:today(),color:'mustard',note:rest});return;}
 remove('brain',n.id);var lbl={todo:'To-Do',kid:'Kids & School',idea:'Meal ideas',project:'Home Projects'}[mv];
 toast('Moved to '+lbl+' ✨',function(){save('brain',old);if(made&&made[1])remove(made[0],made[1].id);});}

/* =================== KIDS & SCHOOL (v2 "kids") =================== */
var KIDS=['Weston','Holden'],KTYPES=[['note','📝 Note'],['form','📄 Form to sign'],['item','🎒 Bring / buy'],['date','📅 Date to remember']];
function kidsView(tab){if(['all','Weston','Holden'].indexOf(tab)<0)tab=UI.kidTab||'all';UI.kidTab=tab;saveUI();var kf=UI.kidF||'open',td=today();
 var h='<div class="bar">'+tabsHtml('kids',[['all','Both boys'],['Weston','Weston'],['Holden','Holden']],tab)+'<span class="grow"></span>'+addBtn('kids','Add',{kid:tab==='all'?'Both':tab},'newkid')+'</div>';
 var soon=DB.kids.filter(function(x){return !x.done&&x.date&&x.date>=td&&x.date<=addDays(td,14)&&(tab==='all'||x.kid===tab||x.kid==='Both');}).sort(function(a,b){return a.date<b.date?-1:1;});
 if(soon.length)h+='<div class="soon">'+soon.slice(0,8).map(function(x){var d=pd(x.date);return '<button class="sc k-'+esc(x.kid)+'" data-open="kids:'+x.id+'"><span class="sd"><b>'+d.getDate()+'</b>'+DOW[d.getDay()]+'</span><span class="stx">'+(KEMO[x.type]||'')+' '+esc(x.title)+'<small>'+esc(x.kid==='Both'?'both boys':x.kid)+'</small></span></button>';}).join('')+'</div>';
 h+=quickAddHtml('kid','Quick add for '+(tab==='all'?'both boys':tab)+'…',' data-kid="'+(tab==='all'?'Both':tab)+'"')+chipsHtml('kidF',kf,[['open','Not done'],['all','Everything'],['form','📄 Forms'],['item','🎒 Bring / buy'],['date','📅 Dates'],['note','📝 Notes']]);
 var who=tab==='all'?KIDS:[tab],any=false;
 who.forEach(function(k){var items=DB.kids.filter(function(x){return (x.kid===k||(x.kid==='Both'&&(tab!=='all'||k==='Weston')))&&(kf==='all'||(kf==='open'?!x.done:x.type===kf));});
  if(tab==='all'&&k==='Weston')items=items.filter(function(x){return x.kid!=='Both';});
  items.sort(function(a,b){if(!!a.done!==!!b.done)return a.done?1:-1;var p=a.date||'9999',q=b.date||'9999';return p<q?-1:p>q?1:(a.created||0)-(b.created||0);});
  if(tab==='all'){if(items.length)any=true;h+=grp(k+(items.length?' · '+items.filter(function(x){return !x.done;}).length+' open':''))+(items.length?items.map(kidRow).join(''):'<div class="hint">Nothing for '+k+' here.</div>');}
  else{if(items.length)any=true;h+=items.map(kidRow).join('');}});
 if(tab==='all'){var both=DB.kids.filter(function(x){return x.kid==='Both'&&(kf==='all'||(kf==='open'?!x.done:x.type===kf));});if(both.length){any=true;h+=grp('Both boys')+both.map(kidRow).join('');}}
 if(!any&&tab!=='all')h+=emptyHtml('Nothing here','Forms, notes, spirit days and things to bring go here.');
 if(DB.kids.some(function(x){return x.done&&(tab==='all'||x.kid===tab);}))h+='<div class="bar"><button class="ghost" data-act="clearkids" data-kid="'+tab+'">Clear done</button></div>';
 return h;}
function kidRow(x){var late=x.date&&x.date<today()&&!x.done;return row({title:x.title,check:!!x.done,checkVal:'kids:'+x.id,done:x.done,attr:'data-open="kids:'+x.id+'"',cls:'k-'+x.kid,
 tags:[KEMO[x.type]||'📝',x.kid==='Both'?'both':'',x.remind&&!x.done?'🔔':''],meta:first(x.note,80),side:x.date?nice(x.date):'',sideCls:late?'late':''});}
function editKid(k,kid){var isNew=!k;k=k||{kid:kid||'Weston',type:'note'};openForm({sec:SM.kids,title:isNew?'Add for '+(k.kid==='Both'?'both boys':k.kid):'Edit',values:k,fields:[
  {k:'title',l:'What is it?',req:1,ph:'Field trip form, pajama day, library book…'},{k:'kid',l:'Who',t:'pick',opts:[['Weston','Weston'],['Holden','Holden'],['Both','Both']]},{k:'type',l:'Kind',t:'pick',opts:KTYPES},
  {k:'date',l:'Date',t:'date',opt:1},{k:'remind',l:'🔔 Remind me',t:'select',opts:REM_DAY,blank:false},{k:'note',l:'Notes',t:'long',opt:1}],
  onSave:function(v){var was=k.remind||'';if(v.remind&&!v.date)v.date=today();save('kids',Object.assign({},k,v,{done:!!k.done}));if(v.remind!==was)remNudge(v.remind);toast(isNew?'Added ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(k);remove('kids',k.id);toast('Deleted',function(){save('kids',cp);});},confirmDel:false});}

/* =================== APPOINTMENTS (home docs sec "appts") =================== */
var WHO=['Me','Blake','Weston','Holden','Family','Pet'],ATYPES=['Doctor','Dentist','Eye doctor','Therapy','Haircut','Vet','Car','Other'];
function apptTitle(f){return (f.what||f.type||'Appointment')+(f.who&&f.who!=='Me'?' · '+f.who:'');}
function apptsView(tab){if(tab!=='up'&&tab!=='past')tab='up';var t=today(),a=hdocs('appts');
 var h='<div class="bar">'+tabsHtml('appts',[['up','Upcoming'],['past','Past']],tab)+'<span class="grow"></span>'+addBtn('appts','Add an appointment')+'</div>';
 a=a.filter(function(d){return tab==='up'?(d.f.date||'')>=t:(d.f.date||'')<t;}).sort(function(x,y){var p=(x.f.date||'')+(x.f.time||''),q=(y.f.date||'')+(y.f.time||'');return tab==='up'?(p<q?-1:1):(p<q?1:-1);});
 if(!a.length)return h+emptyHtml(tab==='up'?'No appointments coming up':'No past appointments','Doctor, dentist, haircuts, the vet — add them with a reminder.');
 var lm='';a.forEach(function(d){var m=(d.f.date||'').slice(0,7);if(m!==lm){lm=m;var x=pd(d.f.date);if(x)h+=grp(MON[x.getMonth()]+' '+x.getFullYear());}h+=apptRow(d);});return h;}
function apptRow(d){var f=d.f;return row({title:apptTitle(f),attr:'data-open="h:'+d.id+'"',lead:'<span class="av">'+esc((f.who||'Me').charAt(0))+'</span>',tags:[f.type&&f.type!==f.what?f.type:'',f.remind?'🔔':''],meta:[f.where,first(f.notes,60)].filter(Boolean).join(' · '),side:fmtD(f.date)+(f.time?' · '+fmtT(f.time):'')});}
function editAppt(d,preset){var isNew=!d;d=d||hnew('appts',Object.assign({who:'Me',type:'Doctor',date:today()},preset||{}));openForm({sec:SM.appts,title:isNew?'New appointment':'Edit appointment',values:d.f,fields:[
  {k:'who',l:'Who is it for?',t:'pick',opts:WHO},{k:'type',l:'Type',t:'pick',opts:ATYPES},{k:'what',l:'With / what',ph:'Dr. Smith checkup, cleaning, haircut…'},
  {k:'date',l:'Date',t:'date',req:1,half:1},{k:'time',l:'Time',t:'time',opt:1,half:1},{k:'where',l:'Where',opt:1,ph:'Office, address, phone…'},
  {k:'remind',l:'🔔 Remind me',t:'select',opts:REM_EVT,blank:false},{k:'notes',l:'Notes',t:'long',opt:1,ph:'Questions to ask, what to bring, copay…'}],
  onSave:function(v){var was=d.f.remind||'';d=clone(d);d.f=Object.assign({},d.f,v);hsave(d);if(v.remind!==was)remNudge(v.remind);toast(isNew?'Appointment saved ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(d);remove('lists',d.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this appointment?'});}

/* =================== BIRTHDAYS & GIFTS (home docs sec "bdays") =================== */
var GSTAT=['Idea','Bought','Wrapped','Given'];
function bdayMD(f){var d=f.date||'';var m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;}
function bdayNext(f){var x=bdayMD(f);if(!x)return '';var t=pd(today()),y=t.getFullYear();function mk(yy){var last=new Date(yy,x.m,0).getDate();return iso(new Date(yy,x.m-1,Math.min(x.d,last)));}var s=mk(y);if(s<today())s=mk(y+1);return s;}
function bdayOn(f,ds){var x=bdayMD(f);if(!x)return false;var d=pd(ds);var last=new Date(d.getFullYear(),x.m,0).getDate();return d.getMonth()===x.m-1&&d.getDate()===Math.min(x.d,last);}
function bdayAge(f){var x=bdayMD(f),n=bdayNext(f);if(!x||!f.knowYear||!n)return 0;return pd(n).getFullYear()-x.y;}
function bdaysView(tab){if(['up','gifts','all'].indexOf(tab)<0)tab='up';var a=hdocs('bdays');
 var h='<div class="bar">'+tabsHtml('bdays',[['up','Upcoming'],['gifts','Gift list'],['all','Everyone']],tab)+'<span class="grow"></span>'+addBtn('bdays','Add a birthday')+'</div>';
 if(!a.length)return h+emptyHtml('No birthdays yet','Add family and friends — with gift ideas, a budget and a reminder.');
 if(tab==='gifts'){var g=a.filter(function(d){return d.f.ideas||d.f.budget||(d.f.gstat&&d.f.gstat!=='Idea');}).sort(function(x,y){return bdayNext(x.f)<bdayNext(y.f)?-1:1;});
  var spent=g.reduce(function(s,d){return s+num(d.f.budget);},0);h+=g.length?'<div class="stats"><div class="stat"><span>People on the list</span><b>'+g.length+'</b></div><div class="stat"><span>Gift budget</span><b>'+(money(spent)||'$0')+'</b></div><div class="stat"><span>Still to buy</span><b>'+g.filter(function(d){return (d.f.gstat||'Idea')==='Idea';}).length+'</b></div></div>':'';
  return h+(g.length?g.map(function(d){return bdayRow(d,true);}).join(''):emptyHtml('No gift ideas yet','Open a birthday and add gift ideas or a budget.'));}
 a.sort(function(x,y){return tab==='all'?String(x.f.name).localeCompare(String(y.f.name)):(bdayNext(x.f)<bdayNext(y.f)?-1:1);});
 if(tab==='up'){var lm='';a.forEach(function(d){var n=bdayNext(d.f);if(!n)return;var m=n.slice(0,7);if(m!==lm){lm=m;h+=grp(MON[pd(n).getMonth()]+' '+pd(n).getFullYear());}h+=bdayRow(d);});return h;}
 return h+a.map(function(d){return bdayRow(d);}).join('');}
function bdayRow(d,gift){var f=d.f,n=bdayNext(f),age=bdayAge(f),dl=n?daysBetween(today(),n):0;
 return row({title:f.name,attr:'data-open="h:'+d.id+'"',lead:'<span class="av">🎂</span>',tags:[f.rel,age?'turns '+age:'',f.gstat?{t:'🎁 '+f.gstat,cls:'g-'+f.gstat}:'',f.remind?'🔔':''],meta:gift?[f.ideas&&('Ideas: '+first(f.ideas,60)),f.budget&&('Budget '+money(f.budget))].filter(Boolean).join(' · '):first(f.ideas?'🎁 '+f.ideas:'',70),side:n?(dl===0?'today! 🎉':dl===1?'tomorrow':fmtMD(n)+' · '+dl+' days'):'',sideCls:dl<=7?'soon':''});}
function editBday(d){var isNew=!d;d=d||hnew('bdays',{gstat:'Idea'});openForm({sec:SM.bdays,title:isNew?'New birthday':d.f.name,values:Object.assign({knowYear:false},d.f),fields:[
  {k:'name',l:'Name',req:1,cap:1,ph:'Grandma, Blake, Ava…'},{k:'date',l:'Birthday',t:'date',req:1,half:1,hint:'Any year is fine'},{k:'rel',l:'Who they are',half:1,opt:1,ph:'Mom, friend, cousin…'},
  {k:'knowYear',l:'That’s their real birth year (show their age)',t:'check'},
  {k:'ideas',l:'Gift ideas',t:'long',opt:1,ph:'Cricut shirt, Lego set, candle…'},{k:'budget',l:'Gift budget',t:'number',opt:1,half:1,ph:'25'},{k:'gstat',l:'Gift',t:'select',opts:GSTAT,blank:false,half:1},
  {k:'remind',l:'🔔 Remind me',t:'select',opts:REM_BDAY,blank:false},{k:'notes',l:'Notes',t:'long',opt:1,ph:'Sizes, favorite colors, address for cards…'}],
  onSave:function(v){v.knowYear=!!v.knowYear;var was=d.f.remind||'';d=clone(d);d.f=Object.assign({},d.f,v);hsave(d);if(v.remind!==was)remNudge(v.remind);toast(isNew?'Birthday saved 🎂':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(d);remove('lists',d.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this birthday?'});}

/* =================== HOME PROJECTS (home docs sec "projects") + checklists (v2 lists without a kind) =================== */
var PSTAT=['Idea','Planning','In progress','Done'],PAREAS=['Kitchen','Living room','Bedrooms','Bathrooms','Kids’ rooms','Outside','Garage','Crafts / Cricut','Whole house','Other'];
function projView(tab){if(tab!=='proj'&&tab!=='lists')tab=UI.projTab||'proj';UI.projTab=tab;saveUI();
 var h='<div class="bar">'+tabsHtml('projects',[['proj','Projects'],['lists','Checklists']],tab)+'<span class="grow"></span>'+(tab==='proj'?addBtn('projects','Add a project'):addBtn('projects','New checklist',null,'newlist'))+'</div>';
 if(tab==='lists')return h+listsView();
 var a=hdocs('projects');if(!a.length)return h+emptyHtml('No projects yet','Paint the bathroom, organize the garage, a Cricut project — plan the steps and supplies here.');
 PSTAT.forEach(function(st){var it=a.filter(function(d){return (d.f.status||'Idea')===st;}).sort(function(x,y){return (x.f.due||'9999')<(y.f.due||'9999')?-1:1;});if(it.length)h+=grp(st+' · '+it.length)+it.map(projRow).join('');});return h;}
function projRow(d){var f=d.f,st=f.steps||[],dn=st.filter(function(x){return x.done;}).length;
 return row({title:f.name,attr:'data-open="h:'+d.id+'"',done:f.status==='Done',lead:'<i class="dot"></i>',tags:[f.area,f.budget?money(f.budget):''],meta:st.length?dn+' of '+st.length+' steps done':first(f.notes,70),side:f.due?nice(f.due):'',
  extra:st.length?'<span class="mini"><i style="width:'+Math.round(dn*100/st.length)+'%"></i></span>':''});}
function stepsText(st){return (st||[]).map(function(x){return (x.done?'[x] ':'')+x.text;}).join('\n');}
function editProject(d){var isNew=!d;d=d||hnew('projects',{status:'Idea',steps:[]});var f=d.f,st=f.steps||[];
 var top=!isNew&&st.length?'<div class="fld"><span>Steps · tap to check off</span><div class="steps">'+st.map(function(x,i){return '<button type="button" class="stp'+(x.done?' on':'')+'" data-step="'+d.id+'|'+i+'"><span class="ck'+(x.done?' on':'')+'">'+ic('check',3)+'</span>'+esc(x.text)+'</button>';}).join('')+'</div></div>':'';
 openForm({sec:SM.projects,title:isNew?'New home project':f.name,values:Object.assign({},f,{stepsTxt:stepsText(st)}),top:top,fields:[
  {k:'name',l:'Project',req:1,ph:'Paint the bathroom'},{k:'area',l:'Where',t:'pick',opts:PAREAS},{k:'status',l:'Status',t:'pick',opts:PSTAT},
  {k:'due',l:'Finish by',t:'date',opt:1,half:1},{k:'budget',l:'Budget',t:'number',opt:1,half:1,ph:'150'},
  {k:'stepsTxt',l:'Steps (one per line)',t:'long',rows:5,opt:1,ph:'Pick paint color\nBuy supplies\nTape & prime\nPaint'},
  {k:'supplies',l:'Supplies to get',t:'long',opt:1,ph:'Paint, rollers, tape…',hint:'Tip: use “Add supplies to groceries” to put them on your shopping list.'},{k:'link',l:'Idea link',opt:1,url:1,ph:'Pinterest, YouTube…'},{k:'notes',l:'Notes',t:'long',opt:1}],
  footExtra:!isNew?'<button class="btn" data-supplies="'+d.id+'">Add supplies to groceries</button>':'',
  onSave:function(v){var old=(f.steps||[]),lines=String(v.stepsTxt||'').split('\n').map(function(x){return x.trim();}).filter(Boolean);
   v.steps=lines.map(function(t){var dn=/^\[x\]\s*/i.test(t);t=t.replace(/^\[x\]\s*/i,'');var o=old.filter(function(z){return z.text===t;})[0];return {text:t,done:dn||(o?!!o.done:false)};});delete v.stepsTxt;
   d=clone(d);d.f=Object.assign({},d.f,v);hsave(d);toast(isNew?'Project added ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(d);remove('lists',d.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this project?'});}
/* checklists: v2's "Lists & Projects" lists (no kind) — same data, so the classic app still shows them */
var LTPL=[['','✨ Blank'],['pack','🧳 Packing'],['gifts','🎁 Christmas gifts'],['cricut','✂️ Cricut project'],['clean','🧽 Cleaning'],['party','🎉 Party']];
var LTPLITEMS={pack:['Pajamas','Toothbrushes','Phone chargers','Snacks for the car','Medicine','Extra socks'],gifts:['Blake','Weston','Holden','Teachers','Stocking stuffers'],cricut:['Pick design','Buy vinyl / blanks','Cut & weed','Press or apply','Photo for Facebook'],clean:['Dishes','Laundry','Wipe counters','Vacuum','Bathrooms','Take out trash'],party:['Guest list','Invites','Food','Decorations','Cake','Party favors']};
var LTPLEMO={pack:'🧳',gifts:'🎁',cricut:'✂️',clean:'🧺',party:'🎉'};
function userLists(){return DB.lists.filter(function(l){return !l.kind;}).sort(function(a,b){return (a.order!=null?a.order:a.created||0)-(b.order!=null?b.order:b.created||0);});}
function listsView(){var ls=userLists();if(!ls.length)return emptyHtml('No checklists yet','Packing lists, Christmas gifts, Cricut projects, party plans…');
 return ls.map(function(l){var it=l.items||[],dn=it.filter(function(x){return x.done;}).length;
  return '<div class="lcard"><div class="lh"><b>'+esc(l.emoji||'📝')+' '+esc(l.name)+'</b><span class="hint">'+dn+' of '+it.length+' done</span><span class="grow"></span><button class="ghost sm" data-ldup="'+l.id+'">Copy</button><button class="ghost sm" data-editlist="'+l.id+'">Edit</button></div>'+
  (it.length?'<div class="prog"><i style="width:'+(it.length?Math.round(dn*100/it.length):0)+'%"></i></div>':'')+(l.note?'<div class="hint">'+esc(l.note)+'</div>':'')+
  it.filter(function(x){return !x.done;}).concat(it.filter(function(x){return x.done;})).map(function(x){return '<div class="li'+(x.done?' done':'')+'"><button class="ck'+(x.done?' on':'')+'" data-li="'+l.id+':'+x.id+'" aria-label="Check off">'+ic('check',3)+'</button><span>'+esc(x.text)+'</span><button class="lx" data-lirm="'+l.id+':'+x.id+'" aria-label="Remove">×</button></div>';}).join('')+
  quickAddHtml('li','Add to this list…',' data-list="'+l.id+'"')+(dn?'<div class="bar"><button class="ghost sm" data-liuncheck="'+l.id+'">Uncheck all</button><button class="ghost sm" data-liclear="'+l.id+'">Clear done</button></div>':'')+'</div>';}).join('');}
function editList(l){var isNew=!l;l=l||{emoji:'📝',color:'caramel',items:[]};var fields=[{k:'name',l:'List name',req:1,ph:'Cricut projects'}];
 if(isNew)fields.push({k:'tpl',l:'Start from',t:'pick',opts:LTPL});
 fields.push({k:'emoji',l:'Little icon',t:'pick',opts:['📝','✂️','🎄','🏡','🎁','📚','🧺','✨','🧳','🎉']},{k:'note',l:'Notes',t:'long',opt:1});
 openForm({sec:SM.projects,title:isNew?'New checklist':'Edit checklist',values:Object.assign({tpl:''},l),fields:fields,
  onSave:function(v){var items=l.items||[];if(isNew&&v.tpl){items=LTPLITEMS[v.tpl].map(function(t){return {id:uid(),text:t,done:false};});if(v.emoji==='📝'&&LTPLEMO[v.tpl])v.emoji=LTPLEMO[v.tpl];}delete v.tpl;save('lists',Object.assign({},l,v,{items:items}));toast(isNew?'Checklist made ✓':'Updated ✓');},
  onDelete:isNew?null:function(){var cp=clone(l);remove('lists',l.id);toast('Deleted',function(){save('lists',cp);});},confirmDel:'Delete this whole checklist?'});}
/* =================== reminders + push (server: checkReminders every minute → FCM) =================== */
var REM_DAY=[['','No reminder'],['d0@8','Morning of · 8 AM'],['d1@19','Night before · 7 PM'],['d1@8','Day before · 8 AM'],['d2@8','2 days before · 8 AM'],['w1@8','1 week before · 8 AM']];
var REM_EVT=[['','No reminder'],['m15','15 minutes before'],['m30','30 minutes before'],['m60','1 hour before'],['m120','2 hours before']].concat(REM_DAY.slice(1));
var REM_BILL=[['','No reminder'],['d0@8','On the due day · 8 AM'],['d1@19','Night before · 7 PM'],['d3@8','3 days before · 8 AM'],['w1@8','1 week before · 8 AM']];
var REM_BDAY=[['','No reminder'],['d0@8','Morning of · 8 AM'],['d1@19','Night before · 7 PM'],['w1@8','1 week before · 8 AM'],['w2@8','2 weeks before · 8 AM']];
var REMNAME={};REM_EVT.concat(REM_BILL,REM_BDAY).forEach(function(o){if(o[0])REMNAME[o[0]]=o[1];});
var REMCOLS={todos:1,events:1,bills:1,kids:1},HREM={appts:1,bdays:1};
var remSyncing=false;
function remBase(c,id){return ('r_'+c+'_'+String(id).replace(/[^A-Za-z0-9_-]/g,'_')).slice(0,48);}
function hm(s,dflt){var m=String(s||'').match(/^(\d{1,2}):(\d{2})/);return m?[+m[1],+m[2]]:dflt;}
function fireFor(ds,time,pre){var d=pd(ds);if(!d||!pre)return 0;var m;
 if((m=pre.match(/^m(\d+)$/))){var t=hm(normT(time),null);if(!t)return new Date(d.getFullYear(),d.getMonth(),d.getDate(),8,0).getTime();return new Date(d.getFullYear(),d.getMonth(),d.getDate(),t[0],t[1]).getTime()-(+m[1])*60000;}
 if((m=pre.match(/^([dw])(\d+)@(\d+)$/))){var back=(+m[2])*(m[1]==='w'?7:1),x=pd(addDays(ds,-back));return new Date(x.getFullYear(),x.getMonth(),x.getDate(),+m[3],0).getTime();}
 return 0;}
function dayWord(ds,fireMs){var f=new Date(fireMs),n=daysBetween(iso(f),ds);if(n===0)return 'today';if(n===1)return 'tomorrow';if(n<7)return 'on '+DOWL[pd(ds).getDay()];return 'on '+fmtD(ds);}
function billDates(b){var f=b.freq||'monthly',t=today(),out=[],dd=Math.min(Math.max(parseInt(b.dueDay,10)||1,1),31);
 function mk(y,m){var last=new Date(y,m+1,0).getDate();return iso(new Date(y,m,Math.min(dd,last)));}
 if(f==='once'){if(b.paidFor!=='once'&&b.dueDate)out.push(b.dueDate);return out;}var T=pd(t);
 if(f==='yearly'){var mo=Math.min(Math.max(parseInt(b.dueMonth,10)||1,1),12)-1;for(var y=T.getFullYear()-1;y<=T.getFullYear()+2;y++){var d=mk(y,mo);if(d<addDays(t,-7))continue;if(b.paidFor===String(y))continue;out.push(d);}return out;}
 for(var i=-1;i<5;i++){var d2=mk(T.getFullYear(),T.getMonth()+i);if(d2<addDays(t,-7))continue;if(b.paidFor===d2.slice(0,7))continue;out.push(d2);}return out;}
function remOccurrences(c,it){var out=[],now=Date.now()+60000,pre=c==='h'?(it.f||{}).remind:it.remind;if(!pre)return out;
 if(c==='todos'){if(it.done)return out;var ds=it.due||today(),w=fireFor(ds,'',pre);if(w>now)out.push({when:w,ds:ds});}
 else if(c==='kids'){if(it.done||!it.date)return out;var w2=fireFor(it.date,'',pre);if(w2>now)out.push({when:w2,ds:it.date});}
 else if(c==='bills'){billDates(it).forEach(function(bd){if(out.length>=3)return;var w3=fireFor(bd,'',pre);if(w3>now)out.push({when:w3,ds:bd});});}
 else if(c==='events'){for(var k=-1;k<400&&out.length<(it.repeat?3:1);k++){var dd=addDays(today(),k);
   if(occursOn(it,dd)&&!(it.skip&&it.skip.indexOf(dd)>=0)){var w4=fireFor(dd,it.time,pre);if(w4>now)out.push({when:w4,ds:dd});}if(!it.repeat&&dd>it.date)break;}}
 else if(c==='h'){var f=it.f||{};if(it.sec==='appts'&&f.date){var w5=fireFor(f.date,f.time,pre);if(w5>now)out.push({when:w5,ds:f.date});}
  if(it.sec==='bdays'){var n=bdayNext(f);if(n){var w6=fireFor(n,'',pre);if(w6<=now){n=(+n.slice(0,4)+1)+n.slice(4);if(n.slice(5)==='02-29')n=n.slice(0,5)+'02-28';w6=fireFor(n,'',pre);}if(w6>now)out.push({when:w6,ds:n});}}}
 return out;}
function remText(c,it,o){var when=dayWord(o.ds,o.when);
 if(c==='todos')return '📝 '+it.text+(when==='today'?' (due today)':' (due '+when+')');
 if(c==='kids')return '🎒 '+(it.kid&&it.kid!=='Both'?it.kid+': ':'')+it.title+' '+when;
 if(c==='bills')return '💵 '+it.name+' is due '+when+(money(it.amount)?' · '+money(it.amount):'')+(it.auto?' (autopay)':'');
 if(c==='events')return '📅 '+it.title+' '+when+(it.time?' at '+fmtT(it.time):'');
 if(c==='h'){var f=it.f||{};if(it.sec==='appts')return '🩺 '+apptTitle(f)+' '+when+(f.time?' at '+fmtT(f.time):'')+(f.where?' · '+f.where:'');if(it.sec==='bdays')return '🎂 '+f.name+'’s birthday is '+when+(bdayAge(f)?' (turns '+bdayAge(f)+')':'');}
 return '';}
function linkOf(r){return r.ref&&r.ref.indexOf('gcal:')!==0?r.ref:(r.href3||'');}
function remSync(c,it,del){var key=c==='h'?'h:'+it.id:c+':'+it.id,want=del?[]:remOccurrences(c,it),have=DB.reminders.filter(function(r){return linkOf(r)===key;}),base=remBase(c,it.id);
 remSyncing=true;try{
  have.forEach(function(r){var m=null;for(var i=0;i<want.length;i++)if(!want[i].done&&want[i].when===r.when){m=want[i];break;}
   if(r.sent||!m){remove('reminders',r.id,true);return;}m.done=true;var tx=remText(c,it,m);if(tx!==r.text)save('reminders',Object.assign({},r,{text:tx}),true);});
  want.forEach(function(o){if(o.done)return;var rr={id:base+'_'+o.when.toString(36),when:o.when,text:remText(c,it,o),repeat:'',sent:false};if(c==='h')rr.href3=key;else rr.ref=key;save('reminders',rr,true);});
 }finally{remSyncing=false;}}
hooks.push(function(c,item,del){if(remSyncing||!loaded)return;try{if(REMCOLS[c])remSync(c,item,del);else if(c==='lists'&&item.kind==='home'&&HREM[item.sec])remSync('h',item,del);}catch(e){console.warn('rem',e);}});
function remSyncAll(){if(!loaded)return;try{Object.keys(REMCOLS).forEach(function(c){DB[c].forEach(function(it){if(it.remind)remSync(c,it,false);});});
  DB.lists.forEach(function(d){if(d.kind==='home'&&HREM[d.sec]&&d.f&&d.f.remind)remSync('h',d,false);});
  DB.reminders.slice().forEach(function(r){var k=linkOf(r);if(!k)return;var p=k.split(':'),it=null,on=false;
   if(p[0]==='h'){it=find('lists',p.slice(1).join(':'));on=!!(it&&it.f&&it.f.remind);}else if(REMCOLS[p[0]]){it=find(p[0],p[1]);on=!!(it&&it.remind);}else return;
   if(!on){remSyncing=true;try{remove('reminders',r.id,true);}finally{remSyncing=false;}}});}catch(e){console.warn('remAll',e);}}
onLoaded.push(remSyncAll);onLoaded.push(gRemSyncAll);
/* reminders on Google events: prefs in the hidden lists doc gcal-prefs (same as v2) */
function gRemText(o,w){return '📅 '+o.t+' '+dayWord(o.d,w)+(o.tm?' at '+fmtT(o.tm):'');}
function gRemSync(key,pre){var o=gcFind(key),ref='gcal:'+key,have=DB.reminders.filter(function(r){return r.ref===ref;}),want=[];
 if(o&&pre){var w=fireFor(o.d,o.tm||'',pre);if(w>Date.now()+60000)want.push(w);}
 remSyncing=true;try{have.forEach(function(r){var i=want.indexOf(r.when);if(r.sent||i<0){remove('reminders',r.id,true);return;}want.splice(i,1);var tx=gRemText(o,r.when);if(tx!==r.text)save('reminders',Object.assign({},r,{text:tx}),true);});
  want.forEach(function(w){save('reminders',{id:remBase('gcal',key.replace(/\|/g,'_')).slice(0,40)+'_'+w.toString(36),when:w,text:gRemText(o,w),repeat:'',sent:false,ref:ref},true);});}finally{remSyncing=false;}}
function gRemSyncAll(){if(!loaded||!gcLoadedNow)return;try{var R=(gcPrefs().remind)||{},gone=[];Object.keys(R).forEach(function(k){var o=gcFind(k);if(!o&&GC.from&&k){gone.push(k);gRemSync(k,'');}else gRemSync(k,R[k]);});
  DB.reminders.slice().forEach(function(r){if(r.ref&&r.ref.indexOf('gcal:')===0&&!R[r.ref.slice(5)]){remSyncing=true;try{remove('reminders',r.id,true);}finally{remSyncing=false;}}});
  if(gone.length){var nr=Object.assign({},R);gone.forEach(function(k){delete nr[k];});gcSetPrefs({remind:nr});}}catch(e){console.warn('gRem',e);}}
function gSetRemind(key,pre){var R=Object.assign({},gcPrefs().remind||{});if(pre)R[key]=pre;else delete R[key];gcSetPrefs({remind:R});GIDX=null;gRemSync(key,pre);rerender();}
function pushIsOn(){return ('Notification' in window)&&Notification.permission==='granted'&&!!localStorage.getItem('pushOn');}
function remNudge(pre){if(!pre)return;setTimeout(function(){if(pushIsOn())toast('🔔 I’ll remind you · '+(REMNAME[pre]||'').toLowerCase());else toast('Reminder saved. Tap Remind in the menu to turn on notifications.');},400);}

/* push */
var FB_CONFIG={apiKey:"AIzaSyC39hLDKkglPAU6W3re0nkmz4KNgqLegXI",authDomain:"kenzi-planner.firebaseapp.com",projectId:"kenzi-planner",storageBucket:"kenzi-planner.firebasestorage.app",messagingSenderId:"852694257543",appId:"1:852694257543:web:a4e4150706397152914d22"};
var VAPID="BCYL92AWH-hnEsysR2dd25WgTCrlXIT3PTQbRmogu5l-3v_o3oFixVPTkotO50zVX_tDndlr-GVA1slShFlYFMM";
try{if(window.firebase)firebase.initializeApp(FB_CONFIG);}catch(e){}
function nStatusText(){if(!('Notification' in window))return /iPhone|iPad/.test(navigator.userAgent)&&!STANDALONE?'First add the planner to your Home Screen: tap Share, then “Add to Home Screen”, then open it from there.':'This browser can’t show notifications.';
 if(Notification.permission==='granted'&&localStorage.getItem('pushOn'))return '✅ On for this device.';if(Notification.permission==='denied')return 'Notifications are blocked. Turn them on in Settings › Notifications › Planner.';return 'Off for this device. Tap below to turn them on.';}
function enablePush(){var s=$('#nstat');if(s)s.textContent='Asking your phone…';
 Notification.requestPermission().then(function(p){if(p!=='granted')throw 'You tapped Don’t Allow. You can change it in Settings.';
  return navigator.serviceWorker.register('firebase-messaging-sw.js').then(function(reg){return navigator.serviceWorker.ready.then(function(){return firebase.messaging().getToken({vapidKey:VAPID,serviceWorkerRegistration:reg});});});})
 .then(function(tok){if(!tok)throw 'No token';return api('saveToken',[tok]);})
 .then(function(){localStorage.setItem('pushOn','1');render();bellOpen();toast('Notifications are on 🔔');})
 .catch(function(e){var s2=$('#nstat');if(s2)s2.textContent='Hmm, that didn’t work: '+e;});}
function testPush(){var s=$('#nstat');if(s)s.textContent='Sending…';api('testPush',[]).then(function(r){if(s)s.textContent=r&&r.sent?'Sent! Check your phone 🌸':'Not sent yet – turn on notifications first.';}).catch(function(){if(s)s.textContent='Couldn’t send right now.';});}
try{if(window.firebase)firebase.messaging().onMessage(function(p){var n=p.notification||{};navigator.serviceWorker.ready.then(function(r){r.showNotification(n.title||'Planner',{body:n.body||'',icon:'icon-192.png'});});});}catch(e){}
var REMSRC={todos:'To-Do',events:'Calendar',bills:'Bills',kids:'Kids & School',gcal:'Google Calendar',h:''};
function remList(){return DB.reminders.filter(function(r){return r.text&&r.when&&!r.sent;}).sort(function(a,b){return a.when-b.when;});}
function bellOpen(){var S0={id:'bell',ini:'🔔',title:'Reminders',c:SM.calendar.c,d:SM.calendar.d},a=remList(),canN='Notification' in window;
 var h='<div class="info"><b>Phone notifications</b><p id="nstat">'+esc(nStatusText())+'</p><div class="bar">'+(canN&&Notification.permission!=='denied'?'<button class="btn pri" data-act="pushon">'+(pushIsOn()?'Refresh notifications':'Turn on notifications')+'</button>':'')+'<button class="btn" data-act="pushtest">Send a test</button></div></div>'+
  '<div class="fld"><span>New reminder</span><input type="text" id="r_text" placeholder="Pick up library books" autocomplete="off"></div><div class="two"><label class="fld"><span>Day</span><input type="date" id="r_date" value="'+today()+'"></label><label class="fld"><span>Time</span><input type="time" id="r_time" value="'+pad((new Date().getHours()+1)%24)+':00"></label></div>'+
  '<div class="fld"><span>How often</span><div class="pick" data-pick="rrep"><button type="button" class="on" data-val="">Just once</button><button type="button" data-val="daily">Every day</button><button type="button" data-val="weekly">Every week</button></div></div><div><button class="add" data-act="addrem">'+ic('plus',2.5)+'Add reminder</button></div>'+
  grp('Coming up')+(a.length?a.slice(0,60).map(function(r){var k=linkOf(r)||r.ref||'',src=k?REMSRC[k.split(':')[0]]:'';if(k.indexOf('h:')===0){var it=find('lists',k.slice(2));src=it?SM[it.sec].title:'';}
   return '<div class="row rrow"><i class="dot"></i><span class="rt"><b>'+esc(r.text)+'</b><small>'+esc(fmtW(r.when)+(r.repeat?' · '+(r.repeat==='daily'?'every day':'every week'):'')+(src?' · from '+src:''))+'</small></span><button class="lx" data-rmrem="'+r.id+'" aria-label="Delete reminder">×</button></div>';}).join(''):'<div class="hint">Nothing yet. Pick “🔔 Remind me” when you add a to-do, event, bill, school item, appointment or birthday.</div>');
 openForm({sec:S0,title:'Reminders',fields:[],values:{rrep:''},top:h,noCancel:true,focus:false,footExtra:'<button class="btn" data-act="close">Done</button>'});FORM.bell=1;}
function addRemFromBell(){var t=$('#r_text').value.trim(),d=$('#r_date').value,tm=normT($('#r_time').value);if(!t){$('#r_text').focus();toast('What should I remind you about?');return;}if(!d||!tm){toast('Pick a day and time ⏰');return;}
 var p=d.split('-'),hh=tm.split(':'),ms=new Date(+p[0],+p[1]-1,+p[2],+hh[0],+hh[1]).getTime();if(ms<Date.now()){toast('That time already passed — pick a later one');return;}
 save('reminders',{when:ms,text:t,repeat:(FORM&&FORM.f.rrep)||'',sent:false},true);toast('Reminder set for '+fmtW(ms));bellOpen();}
function remDelete(id){var r=find('reminders',id);if(!r)return;var k=linkOf(r);
 if(r.ref&&r.ref.indexOf('gcal:')===0){var key=r.ref.slice(5),old=(gcPrefs().remind||{})[key];gSetRemind(key,'');toast('Reminder off',old?function(){gSetRemind(key,old);}:null);bellOpen();return;}
 if(k){var p=k.split(':');if(p[0]==='h'){var d=find('lists',p.slice(1).join(':'));if(d){var o=clone(d),c=clone(d);c.f.remind='';hsave(c,true);toast('Reminder off',function(){hsave(o,true);});bellOpen();return;}}
  else{var it=find(p[0],p[1]);if(it){var old2=clone(it);save(p[0],Object.assign({},it,{remind:''}),true);toast('Reminder off',function(){save(p[0],old2,true);});bellOpen();return;}}}
 var cp=clone(r);remove('reminders',id,true);toast('Reminder deleted',function(){save('reminders',cp,true);});bellOpen();}
/* =================== files on the server (Firestore "images" + "imgparts", free) =================== */
var _idb=null;
function idb(){if(_idb)return _idb;_idb=new Promise(function(res,rej){try{var r=indexedDB.open('h3-files',1);r.onupgradeneeded=function(){r.result.createObjectStore('f');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});return _idb;}
function iget(k){return idb().then(function(db){return new Promise(function(res){try{var q=db.transaction('f').objectStore('f').get(k);q.onsuccess=function(){res(q.result||null);};q.onerror=function(){res(null);};}catch(e){res(null);}});}).catch(function(){return null;});}
function iput(k,v){return idb().then(function(db){try{db.transaction('f','readwrite').objectStore('f').put(v,k);}catch(e){}}).catch(function(){});}
function idel(k){return idb().then(function(db){try{db.transaction('f','readwrite').objectStore('f').delete(k);}catch(e){}}).catch(function(){});}
var PART=850000;
function putPart(id,i,data,tries){return api('putImagePart',[id,i,data]).catch(function(e){if((tries||0)<2)return new Promise(function(r){setTimeout(r,1200);}).then(function(){return putPart(id,i,data,(tries||0)+1);});throw e;});}
/* dataUrl = "data:<mime>;base64,…"; meta gets id + parts */
function storeFile(id,dataUrl,meta,step){var n=Math.ceil(dataUrl.length/PART)||1;if(n>12)return Promise.reject('too big');var chain=Promise.resolve(),done=0;
 for(var i=0;i<n;i++)(function(i){chain=chain.then(function(){return putPart(id,i,dataUrl.slice(i*PART,(i+1)*PART));}).then(function(){done++;if(step)step(Math.round(100*done/n));});})(i);
 return chain.then(function(){var m=Object.assign({},meta,{id:id,parts:n});return api('putImage',[m]).then(function(){iput('d:'+id,dataUrl);return m;});});}
function fetchFile(id){return iget('d:'+id).then(function(d){if(d)return d;return api('getImage',[id]).then(function(r){if(!r||!r.data)throw 'missing';iput('d:'+id,r.data);return r.data;});});}
function dataToBlob(d){var p=d.split(','),mime=(p[0].match(/data:([^;]+)/)||[])[1]||'application/octet-stream',bin=atob(p[1]||''),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime});}
function readAsDataUrl(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result||''));};r.onerror=function(){rej('read');};r.readAsDataURL(blob);});}
function decodeImg(file){return new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){res(im);};im.onerror=function(){URL.revokeObjectURL(u);rej('decode');};im.src=u;});}
function canvasBlob(im,max,q){var w=im.naturalWidth,h=im.naturalHeight,sc=Math.min(1,max/Math.max(w,h)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(w*sc));cv.height=Math.max(1,Math.round(h*sc));
 var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(im,0,0,cv.width,cv.height);return new Promise(function(res){cv.toBlob(function(b){res(b);},'image/jpeg',q);});}
function heicMsg(file){return /hei[cf]/i.test(file.type||'')||/\.(heic|heif)$/i.test(file.name||'')?'This browser can’t open that iPhone (HEIC) photo. On your iPhone go to Settings › Camera › Formats › Most Compatible, or pick a screenshot, then try again.':'Hmm, I couldn’t open that picture. Try a JPG or PNG.';}

/* background photo */
function loadBg(id){fetchFile(id).then(function(d){BGURL=URL.createObjectURL(dataToBlob(d));applyLook();}).catch(function(){});}
function uploadBg(file){var bar=$('#czbg_prog');if(bar)bar.textContent='Getting your photo ready…';
 decodeImg(file).then(function(im){return canvasBlob(im,1600,.8);},function(){throw heicMsg(file);})
 .then(function(b){return readAsDataUrl(b);})
 .then(function(d){var id='h3bg_'+uid();return storeFile(id,d,{kind:'h3bg',name:'Background photo',created:Date.now()},function(p){if(bar)bar.textContent='Uploading… '+p+'%';}).then(function(){BGURL=URL.createObjectURL(dataToBlob(d));var old=(cfg().bg||{});setCfg({bg:{kind:'photo',img:id,soft:old.soft==null?55:old.soft}},true);
   if(old.kind==='photo'&&old.img&&old.img!==id){api('delImage',[old.img]).catch(function(){});idel('d:'+old.img);}czOpen();toast('Background updated 🌸');});})
 .catch(function(e){if(bar)bar.textContent=typeof e==='string'?e:'Couldn’t upload right now. Check your internet and try again.';});}

/* =================== Make it yours ✨ =================== */
function czOpen(){var C=cfg(),T=theme(),cur=C.theme||'lavender',bg=C.bg||{kind:'theme'},open=UI.czSec||'';
 var h='<div class="cz">'+grp('Theme')+'<div class="themes">'+Object.keys(THEMES).map(function(k){var t=THEMES[k],sw=(t.pal?['calendar','meals','todo','bdays'].map(function(s){return t.pal[s][0];}):['#FCE3A3','#CFE5C6','#F9CDB8','#F6C6DA']);
   return '<button class="thm'+(k===cur?' on':'')+'" data-theme="'+k+'" style="background:'+t.bg+';color:'+t.ink+';border-color:'+(k===cur?t.line:mix(t.line,'#ffffff',.6))+'"><span class="tsw">'+sw.map(function(c){return '<i style="background:'+c+';border-color:'+t.line+'"></i>';}).join('')+'</span><b style="font-family:\''+t.head+'\',Georgia,serif">'+esc(t.name)+'</b><small>'+esc(t.tag)+'</small></button>';}).join('')+'</div>'+
  '<p class="hint">Want the whole old app back for a bit? <a href="v2-backup/" target="_blank" rel="noopener">Open the classic Autumn Coffeehouse planner ↗</a> (same information).</p>';
 h+=grp('Sections — tap a circle to change its color')+'<div class="czsecs">'+[{id:'home',title:HOME.title,c:HOME.c,d:HOME.d,ini:'',hide:false}].concat(S).map(function(s){var isH=s.id==='home';
   return '<div class="czs'+(open===s.id?' open':'')+'"><button class="czc" data-czsec="'+s.id+'" style="'+vars(s)+'" aria-label="Change the color of '+esc(s.title)+'"><span class="ci">'+(isH?ic('home'):esc(s.ini))+'</span></button><input type="text" value="'+esc(s.title)+'" data-czname="'+s.id+'" aria-label="Name of '+esc(s.title)+'" maxlength="28">'+
   (isH||s.id==='index'?'':'<button class="ghost sm'+(s.hide?' off':'')+'" data-czhide="'+s.id+'" aria-pressed="'+(!s.hide)+'">'+(s.hide?'Hidden':'Shown')+'</button>')+
   (open===s.id?'<div class="czpal">'+SWATCH.map(function(c){return '<button class="swb'+(s.c.toUpperCase()===c.toUpperCase()?' on':'')+'" style="background:'+c+'" data-czcol="'+s.id+'|'+c+'" aria-label="'+c+'"></button>';}).join('')+'<label class="anyc" title="Any color"><input type="color" value="'+esc(s.c)+'" data-czany="'+s.id+'"><span>Any color</span></label><button class="ghost sm" data-czcol="'+s.id+'|">Default</button></div>':'')+'</div>';}).join('')+'</div>';
 h+=grp('Fonts & size')+'<div class="two"><label class="fld"><span>Headings</span><select data-czfont="head">'+HFONTS.map(function(f){return '<option'+((C.head||T.head)===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></label><label class="fld"><span>Everything else</span><select data-czfont="body">'+BFONTS.map(function(f){return '<option'+((C.body||T.body)===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></label></div>'+
  '<div class="pick" data-czsize="1">'+[[.92,'Smaller'],[1,'Normal'],[1.08,'Bigger'],[1.16,'Biggest']].map(function(o){return '<button type="button" class="'+((C.size||1)===o[0]?'on':'')+'" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';
 h+=grp('Background')+'<div class="pick" data-czbgk="1">'+[['theme','Theme’s own'],['solid','Solid color'],['pattern','Pattern'],['photo','My photo']].map(function(o){return '<button type="button" class="'+(bg.kind===o[0]?'on':'')+'" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';
 if(bg.kind==='solid')h+='<div class="pick sw">'+['#F7F6FB','#FDF3F7','#F2F4EA','#EEF2F0','#F3EBDD','#FFF8EC','#EEF4FB','#F6F1FA','#FFFFFF'].map(function(c){return '<button type="button" class="swb'+(bg.color===c?' on':'')+'" style="background:'+c+'" data-czbgc="'+c+'" aria-label="'+c+'"></button>';}).join('')+'<label class="anyc"><input type="color" value="'+esc(bg.color||T.bg)+'" data-czbgany="1"><span>Any color</span></label></div>';
 if(bg.kind==='pattern')h+='<div class="pick">'+PATTERNS.map(function(p){return '<button type="button" class="'+(bg.pattern===p[0]?'on':'')+'" data-czpat="'+p[0]+'">'+p[1]+'</button>';}).join('')+'</div>';
 if(bg.kind==='photo')h+='<div class="bar"><label class="pickf"><input type="file" accept="image/*" id="czbg_file"><span class="pfb">'+ic('up')+(bg.img?'Change photo':'Choose a photo')+'</span></label><span class="hint" id="czbg_prog">'+(bg.img?(BGURL?'Your photo is on.':'Loading your photo…'):'Big photos are shrunk automatically.')+'</span></div>'+
  (bg.img?'<label class="fld"><span>Soften the photo so words stay easy to read</span><input type="range" min="20" max="85" value="'+(bg.soft==null?55:bg.soft)+'" data-czsoft="1"></label>':'');
 h+=grp('Dashboard')+'<label class="fld"><span>Dashboard title</span><input type="text" data-czdash="1" value="'+esc(C.dashTitle||'')+'" placeholder="Home Dashboard" maxlength="40"></label>';
 h+='<div class="bar" style="margin-top:6px"><button class="ghost" data-act="czreset">Reset to the NOVA look</button></div></div>';
 openForm({sec:{id:'cz',ini:'✨',c:SM.bdays.c,d:SM.bdays.d,title:'Make it yours'},title:'Make it yours ✨',fields:[],values:{},top:h,noCancel:true,focus:false,wide:true,footExtra:'<span class="hint">Changes save on their own and show on your phone and Mac.</span>',onSave:function(){},ok:'Done'});FORM.cz=1;
 var fi=$('#czbg_file');if(fi)fi.onchange=function(){if(fi.files&&fi.files[0])uploadBg(fi.files[0]);};}
function czSecCfg(id,ch){var C=cfg();if(id==='home'){var ho=Object.assign({},C.home||{},ch);Object.keys(ho).forEach(function(k){if(ho[k]===''||ho[k]==null)delete ho[k];});setCfg({home:ho},true);if(ch.title!==undefined)setCfg({dashTitle:ch.title||undefined},true);return;}
 var secs=clone(C.secs||{}),o=Object.assign({},secs[id]||{},ch);Object.keys(o).forEach(function(k){if(o[k]===''||o[k]==null||o[k]===false)delete o[k];});if(Object.keys(o).length)secs[id]=o;else delete secs[id];setCfg({secs:secs},true);}
function czRefresh(){var y=$('.sh-b')?$('.sh-b').scrollTop:0;czOpen();var b=$('.sh-b');if(b)b.scrollTop=y;rerender();}
function czClick(e,t){var el;if(!FORM||!FORM.cz)return false;
 if((el=t.closest('[data-theme]'))){var k=el.getAttribute('data-theme');var ch={theme:k};if(k==='lavender')ch.theme=undefined;setCfg(ch,true);czRefresh();toast(THEMES[k].name+' ✨');return true;}
 if((el=t.closest('[data-czsec]'))){var id=el.getAttribute('data-czsec');UI.czSec=UI.czSec===id?'':id;czRefresh();return true;}
 if((el=t.closest('[data-czcol]'))){var p=el.getAttribute('data-czcol').split('|');czSecCfg(p[0],{c:p[1]||'',d:p[1]?deepen(p[1]):''});czRefresh();return true;}
 if((el=t.closest('[data-czhide]'))){var hid=el.getAttribute('data-czhide');czSecCfg(hid,{hide:!SM[hid].hide});czRefresh();return true;}
 if((el=t.closest('[data-czsize] button'))){setCfg({size:+el.getAttribute('data-val')},true);czRefresh();return true;}
 if((el=t.closest('[data-czbgk] button'))){var kind=el.getAttribute('data-val'),bg=Object.assign({},cfg().bg||{},{kind:kind});if(kind==='pattern'&&!bg.pattern)bg.pattern='dots';if(kind==='solid'&&!bg.color)bg.color=theme().bg;setCfg({bg:bg},true);czRefresh();return true;}
 if((el=t.closest('[data-czbgc]'))){setCfg({bg:Object.assign({},cfg().bg||{},{kind:'solid',color:el.getAttribute('data-czbgc')})},true);czRefresh();return true;}
 if((el=t.closest('[data-czpat]'))){setCfg({bg:Object.assign({},cfg().bg||{},{kind:'pattern',pattern:el.getAttribute('data-czpat')})},true);czRefresh();return true;}
 return false;}
document.addEventListener('change',function(e){var t=e.target;if(!t||!t.getAttribute)return;
 if(t.getAttribute('data-czany')){var c=t.value.toUpperCase();czSecCfg(t.getAttribute('data-czany'),{c:pastel(c),d:deepen(pastel(c))});czRefresh();}
 else if(t.getAttribute('data-czbgany')){setCfg({bg:Object.assign({},cfg().bg||{},{kind:'solid',color:t.value})},true);czRefresh();}
 else if(t.getAttribute('data-czfont')){var o={};o[t.getAttribute('data-czfont')]=t.value;setCfg(o,true);czRefresh();}
 else if(t.getAttribute('data-czname')){var id=t.getAttribute('data-czname'),v=t.value.trim();czSecCfg(id,{title:v&&v!==(id==='home'?DEFHOME.title:DEFCOL[id].title)?v:''});czRefresh();}
 else if(t.getAttribute('data-czdash')){setCfg({dashTitle:t.value.trim()||undefined},true);czRefresh();}
 else if(t.getAttribute('data-czsoft')){setCfg({bg:Object.assign({},cfg().bg||{},{soft:+t.value})},true);}});
document.addEventListener('input',function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute('data-czsoft')){var L=$('#bgl');if(L)L.style.setProperty('--wash',String(+t.value/100));}});
function czReset(){if(!confirm('Go back to the NOVA lavender look? Your section names and colors reset too (nothing else changes).'))return;var C=cfg();setCfg({theme:undefined,secs:undefined,home:undefined,head:undefined,body:undefined,size:undefined,bg:undefined,dashTitle:undefined},true);
 if(C.bg&&C.bg.img){api('delImage',[C.bg.img]).catch(function(){});idel('d:'+C.bg.img);BGURL='';}czRefresh();toast('Back to the NOVA look');}
/* =================== RESOURCE LIBRARY (home docs sec "lib"; file bytes in "images" as h3lib_… ) =================== */
var LIB_CATS=['Recipes','Cleaning tips','Crafts & Cricut','Kids activities','Home decor','Printables','Manuals & warranties','Money','Other'];
var LIB_MAX=5*1024*1024,LIB_IMG_IN=25*1024*1024,LIB_DELAY=9000;
var LIB={thumbs:{},urls:{},busy:false,blobs:{}};
function libDocs(){return hdocs('lib');}
function libCats(){var used={};libDocs().forEach(function(d){if(d.f.cat)used[d.f.cat]=1;});var out=LIB_CATS.slice();Object.keys(used).sort().forEach(function(c){if(out.indexOf(c)<0)out.splice(out.length-1,0,c);});return out;}
function libHost(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return '';}}
function libNormUrl(u){u=String(u||'').trim();if(!u)return '';if(!/^[a-z][a-z0-9+.-]*:/i.test(u))u='https://'+u;try{var x=new URL(u);if(!/^https?:$/.test(x.protocol))return '';if(!/\./.test(x.hostname)&&x.hostname!=='localhost')return '';return x.href;}catch(e){return '';}}
function libSize(n){if(!n&&n!==0)return '';return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
function libIsPdf(f){return f&&f.file&&/pdf/i.test(f.file.mime||'');}
function libMatch(d,q){if(!q)return true;var f=d.f||{},h=[f.title,f.url,f.notes,f.cat,(f.tags||[]).join(' '),f.file&&f.file.name].join(' ').toLowerCase();return q.toLowerCase().split(/\s+/).filter(Boolean).every(function(w){return h.indexOf(w)>=0;});}
function libList(){var q=UI.libQ||'',cat=UI.libCat||'',a=libDocs().filter(function(d){return (!cat||d.f.cat===cat)&&libMatch(d,q);});a.sort(function(x,y){if(UI.libFav&&!!x.f.fav!==!!y.f.fav)return x.f.fav?-1:1;return (y.created||0)-(x.created||0);});return a;}
function libView(){var all=libDocs(),cats=libCats().filter(function(c){return all.some(function(d){return d.f.cat===c;});});if(UI.libCat&&cats.indexOf(UI.libCat)<0)UI.libCat='';
 var h='<div class="bar">'+addBtn('lib','Add a link',{type:'link'},'liblink')+'<button class="ghost" data-act="libfile">'+ic('up')+'Upload a file</button><span class="grow"></span><button class="ghost fav'+(UI.libFav?' on':'')+'" data-libfav="1" aria-pressed="'+(UI.libFav?'true':'false')+'">'+ic('star')+'Favorites first</button></div>';
 if(!all.length)return h+emptyHtml('Your library is empty','Save recipes, how-to videos and websites you love, and upload manuals, receipts or printables (PDF or photo).');
 h+='<label class="srch">'+ic('search')+'<input type="search" id="libq" placeholder="Search titles, tags, notes…" value="'+esc(UI.libQ||'')+'" autocomplete="off" aria-label="Search the library"></label>';
 h+='<div class="chips"><button class="chip'+(!UI.libCat?' on':'')+'" data-libcat="">All · '+all.length+'</button>'+cats.map(function(c){var n=all.filter(function(d){return d.f.cat===c;}).length;return '<button class="chip'+(UI.libCat===c?' on':'')+'" data-libcat="'+esc(c)+'">'+esc(c)+' · '+n+'</button>';}).join('')+'</div>';
 return h+'<div id="liblist">'+libRows()+'</div>';}
function libRows(){var a=libList();if(!a.length)return emptyHtml('Nothing matches','Try another word or tap “All”.');
 return a.map(function(d){var f=d.f||{},isF=f.type==='file',host=isF?'':libHost(f.url),lead;
  if(isF){lead=libIsPdf(f)?'<span class="lth pdf"><span>PDF</span></span>':'<span class="lth img">'+(f.file&&f.file.thumb?'<img alt="" src="'+esc(f.file.thumb)+'">':'<span>IMG</span>')+'</span>';}
  else lead='<span class="lth fav"><span>'+esc((host||f.title||'?').charAt(0).toUpperCase())+'</span>'+(host?'<img alt="" src="https://www.google.com/s2/favicons?domain='+encodeURIComponent(host)+'&amp;sz=64" onerror="this.remove()">':'')+'</span>';
  var meta=[f.cat,isF?((libIsPdf(f)?'PDF':'Picture')+(f.file&&f.file.size?' · '+libSize(f.file.size):'')):host].filter(Boolean).join(' · ');
  var tags=(f.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('');
  return '<div class="row lrow" data-libopen="'+d.id+'" role="button" tabindex="0" title="'+(isF?'Open file':'Open website in a new tab')+'">'+lead+'<span class="rt"><b><span class="tt">'+esc(f.title||host||'(untitled)')+'</span>'+tags+'</b><small>'+esc(meta)+'</small>'+(f.notes?'<small class="nt">'+esc(first(f.notes,110))+'</small>':'')+'</span>'+
   '<button class="star'+(f.fav?' on':'')+'" data-libstar="'+d.id+'" aria-label="'+(f.fav?'Remove from favorites':'Add to favorites')+'">'+ic('star')+'</button><button class="ied" data-libedit="'+d.id+'" aria-label="Edit">'+ic('pen')+'</button></div>';}).join('');}
function libRefreshList(){var el=$('#liblist');if(el)el.innerHTML=libRows();}
function libThumbs(){}
function libForm(id,preset){var doc=id?hget(id):null;if(id&&!doc){toast('That entry was removed');return;}preset=preset||{};
 var s=SM.lib,f=doc?clone(doc.f):{type:preset.type==='file'?'file':'link',title:'',url:'',cat:UI.libCat||'',tags:[],notes:'',fav:false};
 var cats=libCats();if(f.cat&&cats.indexOf(f.cat)<0)cats.push(f.cat);
 var h='';if(!doc)h+='<div class="tabs ltype"><button type="button" class="'+(f.type==='link'?'on':'')+'" data-libtype="link">'+ic('link')+'Website link</button><button type="button" class="'+(f.type==='file'?'on':'')+'" data-libtype="file">'+ic('up')+'File / photo</button></div>';
 h+='<div class="lgrp lg-link"'+(f.type==='link'?'':' hidden')+'><label class="fld" data-f="url"><span>Website address</span><input type="url" id="l_url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://…" value="'+esc(f.url)+'"></label></div>';
 h+='<div class="lgrp lg-file"'+(f.type==='file'?'':' hidden')+'><div class="fld" data-f="file"><span>File <em>(PDF or picture, up to 5 MB)</em></span>'+
  (doc&&f.file?'<div class="curf">'+(libIsPdf(f)?'<span class="lth pdf"><span>PDF</span></span>':'<span class="lth img">'+(f.file.thumb?'<img alt="" src="'+esc(f.file.thumb)+'">':'<span>IMG</span>')+'</span>')+'<span class="cfn"><b>'+esc(f.file.name||'file')+'</b><small>'+esc(libSize(f.file.size))+'</small></span></div>':'')+
  '<label class="pickf"><input type="file" id="l_file" accept="application/pdf,.pdf,image/*"><span class="pfb">'+ic('up')+(doc?'Replace file':'Choose a file')+'</span><span class="pfn" id="l_fname">'+(doc?'':'From Photos, Files, or your Mac')+'</span></label>'+
  '<div class="hint">Bigger than 5 MB? Save it in Google Drive, tap Share › Copy link, and add it as a website link instead.</div></div></div>';
 h+='<label class="fld" data-f="title"><span>Title</span><input type="text" id="l_title" value="'+esc(f.title)+'" placeholder="'+(f.type==='file'?'Dishwasher manual':'Crockpot chicken tacos')+'"></label>';
 h+='<div class="fld" data-f="cat"><span>Category</span><div class="pick" data-pick="cat">'+cats.map(function(c){return '<button type="button" class="'+(c===f.cat?'on':'')+'" data-val="'+esc(c)+'">'+esc(c)+'</button>';}).join('')+'<button type="button" class="other" data-libnewcat="1">+ New category</button></div><input type="text" id="l_newcat" placeholder="New category name" hidden style="margin-top:6px"></div>';
 h+='<label class="fld" data-f="tags"><span>Tags <em>(optional, separate with commas)</em></span><input type="text" id="l_tags" value="'+esc((f.tags||[]).join(', '))+'" placeholder="dinner, gluten-free, kitchen"></label>';
 h+='<label class="fld" data-f="notes"><span>Notes <em>(optional)</em></span><textarea id="l_notes" rows="3" placeholder="Why I saved it, what to remember…">'+esc(f.notes)+'</textarea></label>';
 h+='<div class="fld"><button type="button" class="cbox" data-cbox="fav"><span class="ck'+(f.fav?' on':'')+'">'+ic('check',3)+'</span>Favorite ★</button></div><div class="upl" id="l_upl" hidden><div class="upl-m">Uploading…</div><div class="upl-bar"><i></i></div></div>';
 openForm({sec:s,title:doc?'Edit · '+(f.type==='file'?'File':'Link'):(f.type==='file'?'Upload a file':'Add a link'),fields:[],values:f,top:h,onSave:function(){libSave();return false;},onDelete:doc?function(){libDelete(doc);}:null,confirmDel:'Delete “'+(f.title||'this item')+'”?',focus:false});
 FORM.lib=1;FORM.doc=doc;FORM.file=null;
 var fi=$('#l_file');if(fi)fi.onchange=function(){var x=fi.files&&fi.files[0];FORM.file=x||null;$('#l_fname').textContent=x?(x.name+' · '+libSize(x.size)):'';
  if(x){var tt=$('#l_title');if(!tt.value.trim())tt.value=String(x.name||'').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[_-]+/g,' ').trim().slice(0,80);if(!libOkType(x))toast('Pick a PDF or a picture (JPG, PNG or an iPhone photo)');else if(!libIsImg(x)&&x.size>LIB_MAX)toast(libTooBig(x.size));}};
 if(!doc&&window.innerWidth>700)setTimeout(function(){var e=$(f.type==='file'?'#l_title':'#l_url');if(e)e.focus();},60);}
function libSetType(t){if(!FORM||!FORM.lib||FORM.doc)return;FORM.f.type=t;$$('.ltype button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-libtype')===t);});$('.lg-link').hidden=t!=='link';$('.lg-file').hidden=t!=='file';$('.sh-h h2').textContent=t==='file'?'Upload a file':'Add a link';}
function libIsImg(x){return /^image\//i.test(x.type||'')||/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(x.name||'');}
function libIsPdfFile(x){return /pdf/i.test(x.type||'')||/\.pdf$/i.test(x.name||'');}
function libOkType(x){return libIsImg(x)||libIsPdfFile(x);}
function libTooBig(n){return 'That file is '+libSize(n)+'. Files can be up to 5 MB here. For bigger ones, save it in Google Drive, copy the share link, and add it as a website link.';}
function libErr(m){var u=$('#l_upl');if(u){u.hidden=false;u.className='upl bad';u.innerHTML='<div class="upl-m"></div>';u.querySelector('.upl-m').textContent=m;}toast(m.length>90?'Couldn’t save that file':m);}
function libProg(t,p){var u=$('#l_upl');if(!u)return;u.hidden=false;u.className='upl';if(!u.querySelector('i'))u.innerHTML='<div class="upl-m"></div><div class="upl-bar"><i></i></div>';u.querySelector('.upl-m').textContent=t;u.querySelector('i').style.width=p+'%';}
function libReadForm(){var f=FORM.f;f.title=$('#l_title').value.trim();f.url=$('#l_url')?$('#l_url').value.trim():f.url;var nc=$('#l_newcat');if(nc&&!nc.hidden&&nc.value.trim())f.cat=nc.value.trim().slice(0,40);
 f.tags=$('#l_tags').value.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,12);f.notes=$('#l_notes').value;return f;}
function libSave(){if(LIB.busy)return;var f=libReadForm(),doc=FORM.doc,bad=null;$$('.fld.err',$('#sheet')).forEach(function(e){e.classList.remove('err');});
 if(f.type==='link'){var u=libNormUrl(f.url);if(!u)bad=['url','Please add the website address (like allrecipes.com)'];else{f.url=u;if(!f.title)f.title=libHost(u);}}
 else{if(!doc&&!FORM.file)bad=['file','Please choose a file to upload'];else if(FORM.file&&!libOkType(FORM.file))bad=['file','Pick a PDF or a picture (JPG, PNG or an iPhone photo)'];
  else if(FORM.file&&!libIsImg(FORM.file)&&FORM.file.size>LIB_MAX)bad=['file',libTooBig(FORM.file.size)];else if(FORM.file&&libIsImg(FORM.file)&&FORM.file.size>LIB_IMG_IN)bad=['file',libTooBig(FORM.file.size)];
  if(!bad&&!f.title)f.title=FORM.file?String(FORM.file.name||'File').replace(/\.[a-z0-9]{2,5}$/i,''):'File';}
 if(bad){var e=$('[data-f="'+bad[0]+'"]',$('#sheet'));if(e)e.classList.add('err');toast(bad[1]);return;}
 if(f.type==='link'){delete f.file;libCommit(f);return;}if(!FORM.file){libCommit(f);return;}
 if(!navigator.onLine){toast('Uploading needs the internet. Try again when you’re online.');return;}
 var form=FORM,btn=$('[data-act=save]',$('#sheet'));LIB.busy=true;if(btn){btn.disabled=true;btn.textContent='Uploading…';}
 libUpload(form.file,libProg).then(function(meta){LIB.busy=false;if(FORM!==form){libQueueDel(meta.key);return;}var old=form.doc&&form.doc.f.file;f.file=meta;libCommit(f);if(old&&old.key)libQueueDel(old.key);})
 .catch(function(e){LIB.busy=false;if(btn){btn.disabled=false;btn.textContent='Save';}libErr(typeof e==='string'&&e!=='too big'?e:(e==='too big'?libTooBig(form.file.size):'Couldn’t upload right now. Check your internet and try again.'));console.warn('upload',e);});}
function libCommit(f){var doc=FORM.doc?clone(FORM.doc):hnew('lib');var isNew=!FORM.doc;doc.f=f;closeSheet();hsave(doc);toast(isNew?'Saved to your library ✓':'Updated ✓');}
function pdfThumb(){var cv=document.createElement('canvas');cv.width=120;cv.height=120;var x=cv.getContext('2d');x.fillStyle='#FBE3E1';x.fillRect(0,0,120,120);x.fillStyle='#A33B35';x.font='bold 34px sans-serif';x.textAlign='center';x.fillText('PDF',60,72);return cv.toDataURL('image/png');}
function libUpload(file,step){step('Getting your file ready…',5);var key='h3lib_'+uid();
 var prep=libIsImg(file)?decodeImg(file).then(function(im){var big=file.size>1.5*1048576||Math.max(im.naturalWidth,im.naturalHeight)>2400||!/^image\/(jpe?g|png|gif|webp)$/i.test(file.type||'');
   return Promise.all([big?canvasBlob(im,2400,.85).then(function(b){return b&&b.size<=LIB_MAX?b:canvasBlob(im,1800,.75);}):Promise.resolve(file),canvasBlob(im,160,.7)]).then(function(r){if(!r[0])throw 'decode';
    return readAsDataUrl(r[1]).then(function(th){return {blob:r[0],mime:big?'image/jpeg':(file.type||'image/jpeg'),thumb:th,shrunk:big};});});},function(){throw heicMsg(file);})
  :Promise.resolve({blob:file,mime:'application/pdf',thumb:''});
 return prep.then(function(p){if(p.blob.size>LIB_MAX)throw libTooBig(p.blob.size);return readAsDataUrl(p.blob).then(function(d){if(d.indexOf('data:')!==0)throw 'read';
   if(p.mime==='application/pdf')d='data:application/pdf;base64,'+d.split(',')[1];step('Uploading…',12);
   var nm=String(file.name||'file');if(p.shrunk)nm=nm.replace(/\.[a-z0-9]{2,5}$/i,'')+'.jpg';
   return storeFile(key,d,{kind:'h3lib',name:nm.slice(0,80),mime:p.mime,size:p.blob.size,thumb:p.thumb||pdfThumb(),created:Date.now()},function(pc){step('Uploading… '+pc+'%',12+Math.round(pc*.86));})
    .then(function(m){step('Saved ✓',100);return {key:key,name:nm.slice(0,80),mime:p.mime,size:p.blob.size,parts:m.parts,thumb:p.thumb||''};});});});}
function libOpen(id){var d=hget(id);if(!d)return;var f=d.f||{};
 if(f.type!=='file'){var u=libNormUrl(f.url);if(u){var a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();}else toast('That link looks broken. Tap ✎ to fix it.');return;}
 var m=f.file||{},pdf=libIsPdf(f);
 infoSheet(SM.lib,f.title||m.name||'File','<div class="viewer"><div class="vwrap" id="l_view"><div class="upl"><div class="upl-m">Opening…</div><div class="upl-bar"><i style="width:30%"></i></div></div></div><div class="hint">'+esc([f.cat,(pdf?'PDF':'Picture')+' · '+libSize(m.size),m.name].filter(Boolean).join(' · '))+'</div></div>',
  '<button class="btn" data-libedit="'+id+'">Edit</button><span id="l_vbtns"></span>');var form=FORM;
 fetchFile(m.key).then(function(data){if(FORM!==form)return;if(!LIB.urls[m.key]){LIB.blobs[m.key]=dataToBlob(data);LIB.urls[m.key]=URL.createObjectURL(LIB.blobs[m.key]);}var url=LIB.urls[m.key],vw=$('#l_view');
  vw.innerHTML=pdf?(window.innerWidth>700?'<iframe title="PDF preview" src="'+url+'"></iframe>':'<a class="pdfbig" href="'+url+'" target="_blank" rel="noopener"><span class="lth pdf"><span>PDF</span></span><b>Tap to open the PDF</b></a>'):'<img alt="'+esc(f.title||'')+'" src="'+url+'">';
  var b='<a class="btn pri" href="'+url+'" target="_blank" rel="noopener">Open</a><a class="btn" href="'+url+'" download="'+esc(m.name||'file')+'">Download</a>';
  try{var fl=new File([LIB.blobs[m.key]],m.name||'file',{type:m.mime});if(navigator.canShare&&navigator.canShare({files:[fl]})){LIB.shareFile=fl;b+='<button class="btn" data-libshare="1">Share</button>';}}catch(e){}
  $('#l_vbtns').innerHTML=b;}).catch(function(e){if(FORM!==form)return;$('#l_view').innerHTML='<div class="upl bad"><div class="upl-m">Couldn’t open that file right now. Check your internet and try again.</div></div>';console.warn('open',e);});}
var LSBD='h3_bindel';
function libQueueDel(key){var q=[];try{q=JSON.parse(localStorage.getItem(LSBD)||'[]');}catch(e){}q.push({key:key,at:Date.now()+LIB_DELAY});try{localStorage.setItem(LSBD,JSON.stringify(q));}catch(e){}setTimeout(libDrain,LIB_DELAY+500);}
var _drain=false;
function libDrain(){if(_drain||!loaded||!K||OUT.length)return;var q=[];try{q=JSON.parse(localStorage.getItem(LSBD)||'[]');}catch(e){}if(!q.length)return;
 var used={};libDocs().forEach(function(x){if(x.f&&x.f.file&&x.f.file.key)used[x.f.file.key]=1;});
 var now=Date.now(),keep=[],gol=[];q.forEach(function(o){if(used[o.key])return;if(o.at>now)keep.push(o);else gol.push(o);});
 if(!gol.length){try{localStorage.setItem(LSBD,JSON.stringify(keep));}catch(e){}return;}
 _drain=true;var o=gol[0];api('delImage',[o.key]).then(function(){idel('d:'+o.key);var rest=gol.slice(1).concat(keep);try{localStorage.setItem(LSBD,JSON.stringify(rest));}catch(e){}_drain=false;if(gol.length>1)libDrain();}).catch(function(){_drain=false;});}
setInterval(libDrain,20000);
function libDelete(d){var copy=clone(d);remove('lists',d.id);if(copy.f.file&&copy.f.file.key)libQueueDel(copy.f.file.key);toast('Deleted',function(){save('lists',copy);});}
function libClick(e,t){var el;
 if((el=t.closest('[data-libstar]'))){e.stopPropagation();var d=hget(el.getAttribute('data-libstar'));if(!d)return true;d=clone(d);d.f.fav=!d.f.fav;hsave(d,true);libRefreshList();toast(d.f.fav?'Added to favorites ★':'Removed from favorites');return true;}
 if((el=t.closest('[data-libedit]'))){e.stopPropagation();var id=el.getAttribute('data-libedit');if(FORM)closeSheet();libForm(id,{});return true;}
 if((el=t.closest('[data-libopen]'))){libOpen(el.getAttribute('data-libopen'));return true;}
 if((el=t.closest('[data-libcat]'))){UI.libCat=el.getAttribute('data-libcat');saveUI();render();return true;}
 if((el=t.closest('[data-libfav]'))){UI.libFav=!UI.libFav;saveUI();render();return true;}
 if((el=t.closest('[data-libtype]'))){libSetType(el.getAttribute('data-libtype'));return true;}
 if((el=t.closest('[data-libnewcat]'))){var nc=$('#l_newcat');nc.hidden=false;nc.focus();$$('[data-pick=cat] button').forEach(function(b){b.classList.remove('on');});FORM.f.cat='';return true;}
 if(t.closest('[data-pick=cat] button')){var n2=$('#l_newcat');if(n2){n2.hidden=true;n2.value='';}return false;}
 if((el=t.closest('[data-libshare]'))){if(LIB.shareFile)navigator.share({files:[LIB.shareFile],title:''}).catch(function(){});return true;}
 return false;}
/* =================== events =================== */
function openEdit(key){var p=String(key||'').split(':'),c=p[0],id=p.slice(1).join(':');
 if(c==='h'){var d=hget(id);if(!d)return;({cleaning:editClean,appts:editAppt,bdays:editBday,projects:editProject,budget:editBud,lib:function(x){libForm(x.id);}}[d.sec]||function(){})(d);return;}
 var it=find(c,id);if(!it)return;({todos:editTodo,groceries:editGrocery,bills:editBill,brain:editBrain,kids:editKid,events:function(x){editEvent(clone(x));}}[c]||function(){})(it);}
function quickAdd(kind,text,el){text=String(text||'').trim();if(!text)return;
 if(kind==='todo'){var p=parseWhen(text);save('todos',{text:p.text,done:false,due:p.due});toast(p.due?'Added for '+nice(p.due)+' ✓':'Added ✓');}
 else if(kind==='groc'){addGrocery(text);render();}
 else if(kind==='kid'){save('kids',{kid:el.getAttribute('data-kid')||'Both',title:text,type:'note',done:false,date:''});}
 else if(kind==='li'){var l=find('lists',el.getAttribute('data-list'));if(!l)return;var L=clone(l);L.items=L.items||[];L.items.push({id:uid(),text:text,done:false});save('lists',L);}
 var n=$('[data-qadd="'+kind+'"]'+(kind==='li'?'[data-list="'+el.getAttribute('data-list')+'"]':''));if(n){n.value='';if(window.innerWidth>700)n.focus();}}
function preset(el){try{return JSON.parse(el.getAttribute('data-preset')||'{}');}catch(x){return {};}}
document.addEventListener('click',function(e){var t=e.target,el;if(!t.closest)return;
 if(libClick(e,t)||czClick(e,t))return;
 /* checkboxes first (they live inside clickable rows) */
 if((el=t.closest('[data-tog]'))){e.stopPropagation();var p=el.getAttribute('data-tog').split(':');if(p[0]==='todos')toggleTodo(p[1]);else{var it=find(p[0],p[1]);if(it){var c=Object.assign({},it,{done:!it.done});save(p[0],c);if(c.done)toast('Done ✓',function(){save(p[0],Object.assign({},c,{done:false}));});}}return;}
 if((el=t.closest('[data-got]'))){e.stopPropagation();var g=find('groceries',el.getAttribute('data-got').split(':')[1]);if(g)save('groceries',Object.assign({},g,{got:!g.got}));return;}
 if((el=t.closest('[data-paid]'))){e.stopPropagation();togglePaid(el.getAttribute('data-paid'));return;}
 if((el=t.closest('[data-clean]'))){e.stopPropagation();cleanDone(el.getAttribute('data-clean'));return;}
 if((el=t.closest('[data-bdone]'))){e.stopPropagation();var b=find('brain',el.getAttribute('data-bdone'));if(b)save('brain',Object.assign({},b,{done:!b.done}));return;}
 if((el=t.closest('[data-made]'))){e.stopPropagation();var me=mealFor(el.getAttribute('data-made'));if(me)save('meals',Object.assign({},me,{made:!me.made}));return;}
 if((el=t.closest('[data-li]'))){var a=el.getAttribute('data-li').split(':'),L=find('lists',a[0]);if(L){L=clone(L);L.items.forEach(function(x){if(x.id===a[1])x.done=!x.done;});save('lists',L);}return;}
 if((el=t.closest('[data-lirm]'))){var a3=el.getAttribute('data-lirm').split(':'),L3=find('lists',a3[0]);if(L3){var old=L3;L3=clone(L3);L3.items=L3.items.filter(function(x){return x.id!==a3[1];});save('lists',L3);toast('Removed',function(){save('lists',old);});}return;}
 if((el=t.closest('[data-liuncheck]'))){var L4=find('lists',el.getAttribute('data-liuncheck'));if(L4){var o4=L4;L4=clone(L4);L4.items.forEach(function(z){z.done=false;});save('lists',L4);toast('All unchecked',function(){save('lists',o4);});}return;}
 if((el=t.closest('[data-liclear]'))){var L5=find('lists',el.getAttribute('data-liclear'));if(L5){var o5=L5;L5=clone(L5);L5.items=L5.items.filter(function(x){return !x.done;});save('lists',L5);toast('Cleared',function(){save('lists',o5);});}return;}
 if((el=t.closest('[data-ldup]'))){var L6=find('lists',el.getAttribute('data-ldup'));if(L6){var c6=clone(L6);delete c6.id;delete c6.created;delete c6.order;c6.name=L6.name+' (copy)';c6.items=(c6.items||[]).map(function(z){return {id:uid(),text:z.text,done:false};});save('lists',c6);toast('Copied “'+L6.name+'”');}return;}
 if((el=t.closest('[data-editlist]'))){var L7=find('lists',el.getAttribute('data-editlist'));if(L7)editList(L7);return;}
 if((el=t.closest('[data-step]'))){var sp=el.getAttribute('data-step').split('|'),pd2=hget(sp[0]);if(pd2){pd2=clone(pd2);var st=pd2.f.steps[+sp[1]];st.done=!st.done;hsave(pd2,true);el.classList.toggle('on',st.done);el.querySelector('.ck').classList.toggle('on',st.done);
   var ta=$('#f_stepsTxt');if(ta)ta.value=stepsText(pd2.f.steps);if(FORM)FORM.spec.values=pd2.f;}return;}
 if((el=t.closest('[data-supplies]'))){var sd=hget(el.getAttribute('data-supplies'));if(sd){var items=ingrList(sd.f.supplies);if(!items.length){toast('Add supplies first (one per line)');return;}items.forEach(function(x){addGrocery(x,{aisle:'house'});});toast(items.length+' added to your grocery list 🛒');}return;}
 if((el=t.closest('[data-skip]'))){var sk=el.getAttribute('data-skip').split(':'),se=find('events',sk[0]);if(se){var old2=clone(se);closeSheet();save('events',Object.assign({},se,{skip:(se.skip||[]).concat([sk[1]])}));toast('Skipped that day',function(){save('events',old2);});}return;}
 if((el=t.closest('[data-top]'))){var i=+el.getAttribute('data-top');noteSave();var dd=clone(dashDoc());dd.f=dd.f||{};var tp=dd.f.top||[{},{},{}];tp[i]=tp[i]||{};tp[i].done=!tp[i].done;dd.f.top=tp;hsave(dd,true);el.classList.toggle('on',!!tp[i].done);el.parentNode.classList.toggle('done',!!tp[i].done);return;}
 /* calendar */
 if((el=t.closest('[data-ev]'))){e.stopPropagation();var dsx=el.getAttribute('data-ds')||'';openEv(el.getAttribute('data-ev'),dsx);return;}
 if((el=t.closest('[data-xo]'))){e.stopPropagation();openEdit(el.getAttribute('data-xo'));return;}
 if((el=t.closest('[data-gtog]'))){var k=el.getAttribute('data-gtog');gcHide[k]=!gcHide[k];if(!gcHide[k])delete gcHide[k];localStorage.setItem('gcHide',JSON.stringify(gcHide));GIDX=null;rerender();return;}
 if(t.closest('[data-gsync]')){var gb=t.closest('[data-gsync]');gb.classList.add('busy');gcLoad().then(function(){rerender();if(!gcErr)toast('Google Calendar is up to date ✓');});return;}
 if(t.closest('[data-calov]')){UI.calOv=UI.calOv===false?true:false;saveUI();rerender();return;}
 if((el=t.closest('[data-cal]'))){var n=+el.getAttribute('data-cal');if(!n){UI.calYM=today().slice(0,7);UI.calSel=today();}else{var ym=UI.calYM||today().slice(0,7),dt=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+n,1);UI.calYM=iso(dt).slice(0,7);UI.calSel='';}saveUI();render();return;}
 if((el=t.closest('[data-wk]'))){var w=+el.getAttribute('data-wk');UI.calWk=w?addDays(sunday(UI.calWk||today()),w):today();saveUI();render();return;}
 if((el=t.closest('[data-agn]'))){var ag=+el.getAttribute('data-agn');UI.calFrom=ag?addDays(UI.calFrom||today(),ag):today();if(UI.calFrom<addDays(today(),-90))UI.calFrom=addDays(today(),-90);saveUI();render();return;}
 if((el=t.closest('[data-day]'))){var k2=el.getAttribute('data-day');if(el.hasAttribute('data-dayopen')){UI.calSel=k2;UI.calYM=k2.slice(0,7);UI.calTab='month';saveUI();UI._scrollSel=1;render();return;}UI.calSel=UI.calSel===k2?'':k2;if(k2.slice(0,7)!==(UI.calYM||today().slice(0,7)))UI.calYM=k2.slice(0,7);saveUI();UI._scrollSel=1;rerender();return;}
 /* meals */
 if((el=t.closest('[data-mwk]'))){var mw=+el.getAttribute('data-mwk');UI.mealWk=mw?(UI.mealWk||0)+mw:0;saveUI();render();return;}
 if((el=t.closest('[data-pickday]'))){pickIdea(el.getAttribute('data-pickday'));return;}
 if((el=t.closest('[data-pickidea]'))){var pi=el.getAttribute('data-pickidea').split('|'),id=(ideasDoc().items||[]).filter(function(z){return z.id===pi[1];})[0];closeSheet();if(id){setDinner(pi[0],id.text);render();toast(id.text+' planned 🍲'+(ingrList(id.ingr).length?' · tap 🛒 to add the groceries':''));}return;}
 if((el=t.closest('[data-ingr]'))){var ig=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-ingr');})[0];if(ig)addIngredients(ig);return;}
 if((el=t.closest('[data-planidea]'))){e.stopPropagation();var pl=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-planidea');})[0];if(pl)planIdea(pl);return;}
 if((el=t.closest('[data-idea]'))){var ei=(ideasDoc().items||[]).filter(function(z){return z.id===el.getAttribute('data-idea');})[0];if(ei)editIdea(ei);return;}
 if((el=t.closest('[data-mealcopy]'))){var wk=el.getAttribute('data-mealcopy'),cnt=0,undo=[];for(var j=0;j<7;j++){var from=mealFor(addDays(wk,j-7)),tds=addDays(wk,j);if(from&&from.dinner&&!(mealFor(tds)||{}).dinner){setDinner(tds,from.dinner);undo.push(tds);cnt++;}}
  render();toast(cnt?'Copied '+cnt+' dinner'+(cnt===1?'':'s'):'Nothing to copy (or this week’s already filled)',cnt?function(){undo.forEach(function(d){setDinner(d,'');});render();}:null);return;}
 if((el=t.closest('[data-mealclear]'))){var wk2=el.getAttribute('data-mealclear'),gone=[];for(var q=0;q<7;q++){var m2=mealFor(addDays(wk2,q));if(m2){gone.push(clone(m2));remove('meals',m2.id,true);}}render();
  if(gone.length)toast('Cleared the week',function(){gone.forEach(function(m){save('meals',m,true);});render();});return;}
 /* cleaning room colors */
 if((el=t.closest('[data-roomcol]'))){e.stopPropagation();roomColOpen(el.getAttribute('data-roomcol'));return;}
 if((el=t.closest('[data-roomset]'))){var rs=el.getAttribute('data-roomset'),ri=rs.lastIndexOf('|');roomColSet(rs.slice(0,ri),rs.slice(ri+1));return;}
 /* generic */
 if((el=t.closest('[data-open]'))){openEdit(el.getAttribute('data-open'));return;}
 if((el=t.closest('[data-new]'))){newFor(el.getAttribute('data-new'),'new');return;}
 if((el=t.closest('[data-go]'))){go(el.getAttribute('data-go'));return;}
 if((el=t.closest('[data-chip]'))){var cp=el.getAttribute('data-chip').split('|');UI[cp[0]]=cp[1];saveUI();render();return;}
 if((el=t.closest('[data-qbtn]'))){var inp=el.parentNode.querySelector('input');quickAdd(inp.getAttribute('data-qadd'),inp.value,inp);return;}
 if((el=t.closest('[data-rmrem]'))){remDelete(el.getAttribute('data-rmrem'));return;}
 if((el=t.closest('[data-pick]'))&&t.closest('button')){var pb=t.closest('button'),on=pb.classList.contains('on'),key=el.getAttribute('data-pick');var keepOne=key==='rrep'||key==='cal'||key==='freq'||key==='type'||key==='status'||key==='who'||key==='color';
  if(on&&keepOne)return;$$('button',el).forEach(function(x){x.classList.remove('on');});if(!on)pb.classList.add('on');if(FORM)FORM.f[key]=on?'':pb.getAttribute('data-val');formShow();return;}
 if((el=t.closest('[data-multi]'))&&t.closest('button')){var b2=t.closest('button'),k3=el.getAttribute('data-multi');b2.classList.toggle('on');if(FORM)FORM.f[k3]=$$('button.on',el).map(function(x){return x.getAttribute('data-val');});return;}
 if((el=t.closest('[data-cbox]'))){var k4=el.getAttribute('data-cbox');if(!FORM)return;FORM.f[k4]=!FORM.f[k4];el.querySelector('.ck').classList.toggle('on',!!FORM.f[k4]);formShow();return;}
 if((el=t.closest('[data-act]'))){var ac=el.getAttribute('data-act');
  switch(ac){
  case 'close':closeSheet();break;case 'save':saveForm();break;case 'delete':deleteForm();break;
  case 'bell':bellOpen();break;case 'cz':UI.czSec='';czOpen();break;case 'czreset':czReset();break;
  case 'fold':UI.collapsed=!UI.collapsed;saveUI();rail(route().sec);break;
  case 'pushon':enablePush();break;case 'pushtest':testPush();break;case 'addrem':addRemFromBell();break;
  case 'newev':editEvent(null,preset(el).date||UI.calSel||today());break;
  case 'newtodo':editTodo(null,preset(el));break;case 'newappt':editAppt(null,preset(el));break;
  case 'newkid':editKid(null,preset(el).kid||'Weston');break;case 'newidea':editIdea(null);break;case 'newgroc':editGrocery(null);break;
  case 'newbud':editBud(null);break;case 'newlist':editList(null);break;
  case 'liblink':libForm(null,{type:'link'});break;case 'libfile':libForm(null,{type:'file'});break;
  case 'starter':var made=0;STARTER.forEach(function(s){hsave(hnew('cleaning',{task:s[0],room:s[1],freq:s[2],who:'Me',start:today()}),true);made++;});render();toast(made+' tasks added — change any of them to fit your home 🧽');break;
  case 'cap':var cv=$('#cap').value.trim();if(cv){save('brain',{text:cv,done:false,color:NOTE_COLORS[DB.brain.length%NOTE_COLORS.length]});toast('Saved to your brain dump 💡');}else $('#cap').focus();break;
  case 'clearbrain':var gb2=DB.brain.filter(function(x){return x.done;}).map(clone);gb2.forEach(function(x){remove('brain',x.id,true);});render();toast('Cleared '+gb2.length,function(){gb2.forEach(function(x){save('brain',x,true);});render();});break;
  case 'cleardone':var gt=DB.todos.filter(function(x){return x.done;}).map(clone);if(!gt.length||!confirm('Clear '+gt.length+' finished to-do'+(gt.length===1?'':'s')+'?'))break;gt.forEach(function(x){remove('todos',x.id,true);});render();toast('Cleared '+gt.length,function(){gt.forEach(function(x){save('todos',x,true);});render();});break;
  case 'cleargot':var gg=DB.groceries.filter(function(x){return x.got;}).map(clone);gg.forEach(function(x){remove('groceries',x.id,true);});render();toast('Cleared '+gg.length,function(){gg.forEach(function(x){save('groceries',x,true);});render();});break;
  case 'clearkids':var kk=el.getAttribute('data-kid'),gk=DB.kids.filter(function(x){return x.done&&(kk==='all'||x.kid===kk);}).map(clone);gk.forEach(function(x){remove('kids',x.id,true);});render();toast('Cleared '+gk.length,function(){gk.forEach(function(x){save('kids',x,true);});render();});break;
  case 'syncnow':flush();load().then(function(){gcLoad();toast('Synced ✓');});break;
  case 'export':var all={};COLS.forEach(function(c){all[c]=DB[c];});var blob=new Blob([JSON.stringify(all,null,1)],{type:'application/json'}),u=URL.createObjectURL(blob),ln=document.createElement('a');ln.href=u;ln.download='home-planner-backup-'+today()+'.json';document.body.appendChild(ln);ln.click();setTimeout(function(){URL.revokeObjectURL(u);ln.remove();},500);break;}
  return;}
});
document.addEventListener('keydown',function(e){var t=e.target;
 if(e.key==='Escape'&&FORM){closeSheet();return;}
 if(e.key==='Enter'&&t.getAttribute&&t.getAttribute('data-qadd')){e.preventDefault();quickAdd(t.getAttribute('data-qadd'),t.value,t);return;}
 if(e.key==='Enter'&&t.classList&&t.classList.contains('din')){e.preventDefault();t.blur();return;}
 if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&t.id==='cap'){e.preventDefault();var b=$('[data-act=cap]');if(b)b.click();return;}
 if((e.key==='Enter'||e.key===' ')&&t.matches&&t.matches('.row[role=button],.sticky[role=button]')){e.preventDefault();t.click();return;}
 if(e.key==='Enter'&&FORM&&t.matches&&t.matches('.sh-b input[type=text],.sh-b input[type=date],.sh-b input[type=time]')&&!FORM.cz&&!FORM.bell){e.preventDefault();saveForm();}
 if(e.key==='Enter'&&FORM&&FORM.bell&&t.id==='r_text'){e.preventDefault();addRemFromBell();}});
document.addEventListener('change',function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute('data-roomany')){var c=pastel(t.value.toUpperCase());if(lum(c)<.5)c=mix(c,'#FFFFFF',.4);roomColSet(t.getAttribute('data-roomany'),c);}});
document.addEventListener('change',function(e){var t=e.target;if(!t||!t.classList)return;
 if(t.classList.contains('din')){var ds=t.getAttribute('data-din'),v=t.value.trim(),me=mealFor(ds);if((me&&me.dinner)===v||(!me&&!v))return;setDinner(ds,v);var r=t.closest('.drow');if(r){var mk=r.querySelector('[data-made]');if(mk)mk.disabled=!v;}return;}
 if(t.getAttribute&&t.getAttribute('data-gremind')!=null){var k=t.getAttribute('data-gremind');gSetRemind(k,t.value);if(t.value)remNudge(t.value);else toast('Reminder off');return;}
 if(FORM&&t.closest&&t.closest('#sheet .sh-b'))formShow();});
document.addEventListener('input',function(e){var t=e.target;if(!t)return;
 if(t.closest&&t.closest('[data-note]'))noteSaveSoon();
 else if(t.id==='libq'){UI.libQ=t.value;saveUI();libRefreshList();}
 else if(t.id==='bq'){UI.bq=t.value;saveUI();var w=$('#notesw');if(w)w.innerHTML=notesHtml();}});
document.addEventListener('focusout',function(e){var t=e.target;if(t&&t.closest&&t.closest('[data-note]'))setTimeout(function(){if(_tNote)noteSave();},0);
 if(t&&t.classList&&t.classList.contains('din'))setTimeout(function(){var a=document.activeElement;if(!(a&&a.classList&&a.classList.contains('din'))&&route().sec==='meals')rerender();},150);});
window.addEventListener('pagehide',function(){if(_tNote)noteSave();});

/* =================== boot =================== */
function boot(){applyLook();
 $('#shade').addEventListener('click',function(){closeSheet();});
 $('#sync').addEventListener('click',function(){flush();load().then(function(){gcLoad();});});
 render();
 if(K){load();gcStart();}
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function(){});
 setInterval(function(){if(document.visibilityState==='visible'&&!OUT.length&&K&&!$('#sheet.on')&&!busyTyping())load();},5*60000);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&K&&loaded&&!flushing&&!OUT.length&&!$('#sheet.on')&&!busyTyping())load();});
 var lastDay=today();setInterval(function(){if(today()!==lastDay){lastDay=today();if(!$('#sheet.on')&&!busyTyping())render();}},60000);}
window.__planner={version:VERSION,DB:function(){return DB;},OUT:function(){return OUT;},UI:function(){return UI;},load:load,flush:flush,save:save,remove:remove,go:go,cfg:cfg,GC:function(){return GC;},gcLoad:gcLoad,openEdit:openEdit};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
