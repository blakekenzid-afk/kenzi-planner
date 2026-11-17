var SS_ID='1K2XpLiM2qvtgIpQgLIAmSwXhJuMypo6AkRE1rM1smr0';
var HTML_FILE_ID='1QsYmn9qil4OtC41mxi6HUjvham2Yj_Ro';
var T={brain:'🧠 Brain Dump',week:'📅 This Week',meals:'🍽️ Meals & Groceries',bills:'💸 Bills',kids:'🎒 Kids & School'};
function doGet(){if(Session.getActiveUser().getEmail()!=='blakekenzid@gmail.com')return HtmlService.createHtmlOutput('🌸 This planner is private.');var h=DriveApp.getFileById(HTML_FILE_ID).getBlob().getDataAsString('UTF-8');return HtmlService.createHtmlOutput(h).setTitle("Kenzi's Planner").addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');}
var _ss,_tz;function ss_(){return _ss||(_ss=SpreadsheetApp.openById(SS_ID));}function tz_(){return _tz||(_tz=ss_().getSpreadsheetTimeZone());}
function sh_(k){return ss_().getSheetByName(T[k]);}
function d_(v){return v instanceof Date?Utilities.formatDate(v,tz_(),'yyyy-MM-dd'):(v===''||v==null?'':String(v));}
function getAll(){
 var tz=tz_(),o={today:Utilities.formatDate(new Date(),tz,'yyyy-MM-dd')};
 o.brain=sh_('brain').getRange(2,1,299,6).getValues().map(function(r,i){return{row:i+2,done:r[0]===true,thought:r[1],type:r[2],when:d_(r[3]),captured:d_(r[4]),notes:r[5]};}).filter(function(x){return x.thought!=='';});
 var w=sh_('week');o.weekTitle=w.getRange('B2').getDisplayValue();
 o.week=w.getRange(6,2,7,5).getValues().map(function(r){return{day:r[0],date:d_(r[1]),work:r[2],home:r[3],wear:r[4]};});
 o.todos=w.getRange(15,2,26,5).getValues().map(function(r,i){return{row:i+15,done:r[0]===true,text:r[1],when:d_(r[4])};}).filter(function(x){return x.text!=='';});
 var m=sh_('meals');
 o.dinners=m.getRange(6,2,14,5).getValues().map(function(r,i){return{row:i+6,made:r[0]===true,date:d_(r[1]),dinner:r[3],notes:r[4]};});
 o.list=m.getRange(6,8,60,1).getValues().map(function(r){return r[0];}).filter(String);
 o.groceries=m.getRange(23,2,58,5).getValues().map(function(r,i){return{row:i+23,got:r[0]===true,qty:r[1],store:r[2],item:r[3],notes:r[4]};}).filter(function(x){return x.item!=='';});
 o.bills=sh_('bills').getRange(6,2,15,9).getValues().map(function(r,i){return{row:i+6,name:r[0],amount:r[1],due:d_(r[2]),often:r[3],paidWith:r[4],auto:r[5],paid:r[7]===true,notes:r[8]};}).filter(function(x){return x.name!=='';});
 o.kids=sh_('kids').getRange(6,2,55,4).getValues().map(function(r,i){return{row:i+6,date:d_(r[0]),what:r[1],who:r[2],notes:r[3]};}).filter(function(x){return x.what!=='';});
 return o;}
var CHECK={brain:1,week:2,meals:2,bills:9};
function setCheck(k,row,v){if(!CHECK[k]||row<2)throw 'bad';sh_(k).getRange(row,CHECK[k]).setValue(!!v);return true;}
function setDinner(row,v){if(row<6||row>19)throw 'bad';sh_('meals').getRange(row,5).setValue(v);return true;}
function firstBlank_(sh,startRow,col,n){var v=sh.getRange(startRow,col,n,1).getValues();for(var i=0;i<n;i++)if(v[i][0]==='')return startRow+i;return -1;}
function addThought(t,type,when,notes){var sh=sh_('brain'),r=firstBlank_(sh,2,2,299);if(r<0){sh.appendRow(['']);r=sh.getLastRow();sh.getRange(r,1).insertCheckboxes();}
 var today=Utilities.formatDate(new Date(),tz_(),'yyyy-MM-dd');sh.getRange(r,1,1,6).setValues([[false,t,type||'',when||'',today,notes||'']]);return r;}
function deleteThought(row){if(row<2)throw 'bad';var sh=sh_('brain');sh.getRange(row,2,1,5).clearContent();sh.getRange(row,1).setValue(false);return true;}
function addTodo(t,when){var sh=sh_('week'),r=firstBlank_(sh,15,3,26);if(r<0)throw 'full';sh.getRange(r,2,1,2).setValues([[false,t]]);sh.getRange(r,2).insertCheckboxes();if(when)sh.getRange(r,6).setValue(when);return r;}
function addGrocery(item,qty){var sh=sh_('meals'),r=firstBlank_(sh,23,5,58);if(r<0)throw 'full';sh.getRange(r,2,1,5).setValues([[false,qty||1,'Walmart',item,'']]);sh.getRange(r,2).insertCheckboxes();return r;}
function addMeal(n){var sh=sh_('meals'),r=firstBlank_(sh,6,8,55);if(r<0)throw 'full';sh.getRange(r,8).setValue(n);return r;}
function removeMeal(n){var rg=sh_('meals').getRange(6,8,55,1),v=rg.getValues().map(function(r){return r[0];}).filter(function(x){return x!==''&&x!==n;});while(v.length<55)v.push('');rg.setValues(v.map(function(x){return[x];}));return true;}
var CLR={brain:['brain',2,299,1,2,5],todos:['week',15,26,2,3,4],groc:['meals',23,58,2,3,4]};
function clearChecked(k){var c=CLR[k];if(!c)throw 'bad';var sh=sh_(c[0]),v=sh.getRange(c[1],c[3],c[2],1).getValues(),n=0;for(var i=0;i<c[2];i++)if(v[i][0]===true){sh.getRange(c[1]+i,c[4],1,c[5]).clearContent();sh.getRange(c[1]+i,c[3]).setValue(false);n++;}return n;}
function setCells(k,row,col,vals){if(!T[k]||row<2||col<1)throw 'bad';sh_(k).getRange(row,col,vals.length,vals[0].length).setValues(vals);return true;}

// ===== Planner v2 API (Firestore, no Sheets) — 2026-11-15 =====
var APP_URL='https://blakekenzid-afk.github.io/kenzi-planner/';
var FS_PROJECT='kenzi-planner';
var FS_BASE='https://firestore.googleapis.com/v1/projects/'+FS_PROJECT+'/databases/(default)/documents/';
var PTZ='America/Indiana/Indianapolis';
var COLS={groceries:1,meals:1,todos:1,events:1,reminders:1,brain:1,bills:1,lists:1,kids:1};
var API_FNS={list:1,listAll:1,put:1,del:1,getLayout:1,saveLayout:1,getSettings:1,saveSettings:1,saveToken:1,testPush:1,addReminder:1,getReminders:1,deleteReminder:1,status:1,setupFirestore:1,putImagePart:1,putImage:1,getImage:1,listImages:1,delImage:1};
function props_(){return PropertiesService.getScriptProperties();}
function doPost(e){var out;try{var b=JSON.parse(e.postData.contents),key=props_().getProperty('PLANNER_KEY');
 if(!key||b.k!==key)throw 'locked';
 if(b.action&&!b.fn){var a=b.action;if(a==='put'){b.fn='put';b.args=[b.collection,b.item];}else if(a==='del'){b.fn='del';b.args=[b.collection,b.id];}else if(a==='list'){b.fn='list';b.args=[b.collection];}else{b.fn=a;b.args=b.args||[];}}
 if(!API_FNS[b.fn])throw 'bad fn';
 out={ok:true,r:globalThis[b.fn].apply(null,b.args||[])};}catch(err){out={ok:false,e:String(err&&err.message||err)};}
 return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);}
function b64u_(x){return Utilities.base64EncodeWebSafe(x).replace(/=+$/,'');}
function saToken_(scope,ck){var c=CacheService.getScriptCache(),t=c.get(ck);if(t)return t;var sa=props_().getProperty('FCM_SA');if(!sa)throw 'FCM_SA missing';
 var j=JSON.parse(sa),now=Math.floor(Date.now()/1000);
 var h=b64u_(JSON.stringify({alg:'RS256',typ:'JWT'})),cl=b64u_(JSON.stringify({iss:j.client_email,scope:scope,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
 var sig=b64u_(Utilities.computeRsaSha256Signature(h+'.'+cl,j.private_key));
 var r=JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+cl+'.'+sig}}).getContentText());
 c.put(ck,r.access_token,3000);return r.access_token;}
function fcmToken_(){return saToken_('https://www.googleapis.com/auth/firebase.messaging','fcm_at');}
function fsToken_(){return saToken_('https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform','fs_at2');}
// --- Firestore REST helpers: each item is one document; whole item kept as JSON in field "j"
function fsReq_(method,url,body){var o={method:method,headers:{Authorization:'Bearer '+fsToken_()},muteHttpExceptions:true,contentType:'application/json'};if(body)o.payload=JSON.stringify(body);
 var r=UrlFetchApp.fetch(url,o),c=r.getResponseCode(),t=r.getContentText();if(c===404&&method==='get')return null;if(c>=300)throw 'store '+c+': '+t.slice(0,300);return t?JSON.parse(t):{};}
function col_(c){if(!COLS[c])throw 'unknown collection '+c;return c;}
function id_(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function docGet_(path){var d=fsReq_('get',FS_BASE+path);return d&&d.fields&&d.fields.j?JSON.parse(d.fields.j.stringValue):null;}
function docSet_(path,obj){var s=JSON.stringify(obj);if(s.length>200000)throw 'too big';fsReq_('patch',FS_BASE+path,{fields:{j:{stringValue:s},u:{timestampValue:new Date().toISOString()}}});return obj;}
function list(c){col_(c);var out=[],tok='';do{var d=fsReq_('get',FS_BASE+c+'?pageSize=300'+(tok?'&pageToken='+encodeURIComponent(tok):''));if(!d)break;
 (d.documents||[]).forEach(function(x){try{var o=JSON.parse(x.fields.j.stringValue);o.id=x.name.split('/').pop();out.push(o);}catch(e){}});tok=d.nextPageToken||'';}while(tok);return out;}
function listAll(){var o={};Object.keys(COLS).forEach(function(c){o[c]=list(c);});return o;}
function put(c,item){col_(c);if(!item||typeof item!=='object'||Array.isArray(item))throw 'item must be an object';if(!item.id)item.id=id_();if(!/^[A-Za-z0-9_-]{1,60}$/.test(item.id))throw 'bad id';
 if(!item.created)item.created=Date.now();if(c==='reminders')props_().deleteProperty('REM_NEXT');return docSet_(c+'/'+item.id,item);}
function del(c,id){col_(c);if(!/^[A-Za-z0-9_-]{1,60}$/.test(String(id)))throw 'bad id';fsReq_('delete',FS_BASE+c+'/'+id);if(c==='reminders')props_().deleteProperty('REM_NEXT');return true;}
function getLayout(){return docGet_('meta/layout');}
function saveLayout(o){return docSet_('meta/layout',o||{});}
function getSettings(){return docGet_('meta/settings')||{};}
function saveSettings(o){return docSet_('meta/settings',o||{});}
function status(){var db=fsReq_('get','https://firestore.googleapis.com/v1/projects/'+FS_PROJECT+'/databases/(default)');return {db:db?{type:db.type,location:db.locationId}:null,tokens:JSON.parse(props_().getProperty('TOKENS')||'[]').length};}
function setupFirestore(){var url='https://firestore.googleapis.com/v1/projects/'+FS_PROJECT+'/databases';var cur=fsReq_('get',url+'/(default)');if(cur)return {exists:true,type:cur.type,location:cur.locationId};
 var r=UrlFetchApp.fetch(url+'?databaseId=(default)',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+fsToken_()},muteHttpExceptions:true,payload:JSON.stringify({type:'FIRESTORE_NATIVE',locationId:'nam5'})});
 return {created:r.getResponseCode(),body:r.getContentText().slice(0,600)};}
// --- push notifications (FCM, unchanged behavior)
function saveToken(t){if(!t)throw 'no token';var a=JSON.parse(props_().getProperty('TOKENS')||'[]');if(a.indexOf(t)<0)a.push(t);if(a.length>10)a=a.slice(-10);props_().setProperty('TOKENS',JSON.stringify(a));ensureTrigger_();return a.length;}
function ensureTrigger_(){if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='checkReminders';}))ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();}
function sendPush_(title,body){var a=JSON.parse(props_().getProperty('TOKENS')||'[]');if(!a.length)return {sent:0,err:'no devices yet'};
 var at=fcmToken_(),keep=[],sent=0,err='';
 a.forEach(function(tok){var res=UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/kenzi-planner/messages:send',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+at},muteHttpExceptions:true,
  payload:JSON.stringify({message:{token:tok,notification:{title:title,body:body},webpush:{fcm_options:{link:APP_URL},notification:{icon:APP_URL+'icon-192.png'}}}})});
  var code=res.getResponseCode(),txt=res.getContentText();if(code===200){sent++;keep.push(tok);}else{err=code+' '+txt.slice(0,300);if(!(code===404||/UNREGISTERED/.test(txt)))keep.push(tok);}});
 props_().setProperty('TOKENS',JSON.stringify(keep));return {sent:sent,err:err};}
function testPush(){return sendPush_('☕ Hi Kenzi!','Notifications are working on your planner.');}
// --- reminders, stored in Firestore collection "reminders": {id,when(ms),text,repeat:''|'daily'|'weekly',sent}
function addReminder(ms,text,repeat){if(!text||!ms)throw 'need time and text';var r=put('reminders',{when:Number(ms),text:String(text),repeat:repeat||'',sent:false});ensureTrigger_();return r.id;}
function getReminders(){return list('reminders').filter(function(x){return x.text&&x.when&&!x.sent;}).sort(function(a,b){return a.when-b.when;});}
function deleteReminder(id){return del('reminders',id);}
function checkReminders(){var p=props_(),now=Date.now(),nx=Number(p.getProperty('REM_NEXT')||0),chk=Number(p.getProperty('REM_CHK')||0);
 if(nx&&now+30000<nx&&now-chk<1800000)return; // nothing due yet; full re-check every 30 min
 var all=list('reminders'),next=now+1800000;
 all.forEach(function(r){if(!r.text||!r.when||r.sent)return;
  if(r.when<=now+30000){sendPush_('⏰ '+r.text,Utilities.formatDate(new Date(r.when),PTZ,'h:mm a')+' · from your planner ☕');var rp=String(r.repeat||'').toLowerCase();
   if(rp==='daily'||rp==='weekly'){var d=new Date(r.when);do{d.setDate(d.getDate()+(rp==='daily'?1:7));}while(d.getTime()<=now);r.when=d.getTime();}else{r.sent=true;r.sentAt=now;}
   docSet_('reminders/'+r.id,r);}
  if(!r.sent&&r.when<next)next=r.when;});
 p.setProperties({REM_NEXT:String(next),REM_CHK:String(now)});}
// ===== Phase 2: "My photos" image storage in Firestore (free, no Firebase Storage) — 2026-11-16 =====
// images/{id}: small meta doc {id,name,w,h,bytes,kind,thumb,parts,created}; imgparts/{id}_{n}: field "d" = a piece of the data URL (<= 900k chars each)
function imgId_(id){id=String(id||'');if(!/^[A-Za-z0-9_-]{1,60}$/.test(id))throw 'bad id';return id;}
function putImagePart(id,i,data){imgId_(id);i=Number(i);if(!(i>=0&&i<12&&i===Math.floor(i)))throw 'bad part';data=String(data||'');if(!data||data.length>900000)throw 'part too big';
 fsReq_('patch',FS_BASE+'imgparts/'+id+'_'+i,{fields:{d:{stringValue:data}}});return true;}
function putImage(meta){if(!meta||typeof meta!=='object')throw 'bad meta';var id=imgId_(meta.id);meta.parts=Number(meta.parts)||1;if(meta.parts<1||meta.parts>12)throw 'bad parts';
 if(!meta.created)meta.created=Date.now();return docSet_('images/'+id,meta);}
function getImage(id){imgId_(id);var m=docGet_('images/'+id);if(!m)return null;var s='';for(var i=0;i<(m.parts||1);i++){var d=fsReq_('get',FS_BASE+'imgparts/'+id+'_'+i);if(!d||!d.fields||!d.fields.d)throw 'image piece missing';s+=d.fields.d.stringValue;}
 return {meta:m,data:s};}
function listImages(){var out=[],tok='';do{var d=fsReq_('get',FS_BASE+'images?pageSize=300'+(tok?'&pageToken='+encodeURIComponent(tok):''));if(!d)break;
 (d.documents||[]).forEach(function(x){try{var o=JSON.parse(x.fields.j.stringValue);o.id=x.name.split('/').pop();out.push(o);}catch(e){}});tok=d.nextPageToken||'';}while(tok);
 return out.sort(function(a,b){return (b.created||0)-(a.created||0);});}
function delImage(id){imgId_(id);var m=docGet_('images/'+id),n=m&&m.parts?m.parts:1;for(var i=0;i<n;i++)fsReq_('delete',FS_BASE+'imgparts/'+id+'_'+i);fsReq_('delete',FS_BASE+'images/'+id);return true;}

// ===== Phase 5: Google Calendar two-way sync (personal + work) — 2026-11-17 =====
// Uses the Advanced Service "Google Calendar API" (identifier: Calendar). Every write uses sendUpdates:'none'
// and refuses events that have other guests, events organized by someone else, or special event types.
var GCALS={personal:'blakekenzid@gmail.com',work:'kenzi_diskey@olemiss.k12.in.us'};
['gcalList','gcalPut','gcalDel','gcalStatus'].forEach(function(f){API_FNS[f]=1;});
function gcalId_(w){var id=GCALS[w];if(!id)throw 'unknown calendar '+w;return id;}
function gcalDay_(s){s=String(s||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw 'bad date';return s;}
function gcalTime_(t){var m=String(t||'').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);if(!m)return '';var h=+m[1];if(m[3]){var pm=/p/i.test(m[3]);if(h===12)h=0;if(pm)h+=12;}if(h>23)return '';return ('0'+h).slice(-2)+':'+m[2];}
function gcalAddDay_(ds,n){var p=ds.split('-'),d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]+n));return d.toISOString().slice(0,10);}
function gcalEvId_(id){id=String(id||'');if(!/^[A-Za-z0-9_@.\-]{1,1024}$/.test(id))throw 'bad event id';return id;}
function gcalRole_(w){var c=CacheService.getScriptCache(),k='gcrole_'+w,r=c.get(k);if(r)return r;
 var cl=Calendar.CalendarList.get(gcalId_(w));r=cl.accessRole||'none';c.put(k,r,21600);c.put('gccolor_'+w,cl.backgroundColor||'',21600);return r;}
function gcalText_(s){return String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();}
function gcalRo_(w,cal,e,role){if(role!=='owner'&&role!=='writer')return 'access';
 if(e.eventType&&e.eventType!=='default')return 'type';
 var org=e.organizer||{};if(!(org.self||org.email===cal||org.email===GCALS.personal))return 'guest';
 var others=(e.attendees||[]).filter(function(a){return !a.self&&!a.resource&&!a.organizer&&a.email!==cal;}).length;if(others)return 'guests';
 return '';}
function gcalNorm_(w,cal,e,role){var st=e.start||{},en=e.end||{},o={k:w,id:e.id,t:e.summary||'(no title)'};
 if(st.date){o.ad=1;o.d=st.date;o.ed=en.date?gcalAddDay_(en.date,-1):st.date;if(o.ed<o.d)o.ed=o.d;}
 else{var s=new Date(st.dateTime),x=new Date(en.dateTime||st.dateTime);o.d=Utilities.formatDate(s,PTZ,'yyyy-MM-dd');o.tm=Utilities.formatDate(s,PTZ,'HH:mm');
  o.ed=Utilities.formatDate(x,PTZ,'yyyy-MM-dd');o.et=Utilities.formatDate(x,PTZ,'HH:mm');
  if(o.et==='00:00'&&o.ed>o.d){o.ed=gcalAddDay_(o.ed,-1);o.et='';if(o.ed<o.d)o.ed=o.d;}}
 if(e.description)o.n=gcalText_(e.description).slice(0,800);if(e.location)o.l=String(e.location).slice(0,200);
 if(e.recurringEventId)o.rec=1;if(e.htmlLink)o.u=e.htmlLink;
 var ro=gcalRo_(w,cal,e,role);if(ro)o.ro=ro;
 if(e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.planner)o.p=1;
 return o;}
function gcalStatus(){var o={};Object.keys(GCALS).forEach(function(w){try{var c=Calendar.CalendarList.get(GCALS[w]);o[w]={ok:true,role:c.accessRole,color:c.backgroundColor,name:c.summaryOverride||c.summary,tz:c.timeZone};}catch(e){o[w]={ok:false,err:String(e&&e.message||e)};}});return o;}
function gcalList(from,to){from=gcalDay_(from);to=gcalDay_(to);if(to<from)throw 'bad range';
 if((new Date(to)-new Date(from))/864e5>500)throw 'range too long';
 var out={from:from,to:to,cals:{},ev:[],at:Date.now()},tMin=gcalAddDay_(from,-1)+'T00:00:00Z',tMax=gcalAddDay_(to,2)+'T00:00:00Z';
 Object.keys(GCALS).forEach(function(w){var cal=GCALS[w];
  try{var cl=Calendar.CalendarList.get(cal),role=cl.accessRole;out.cals[w]={ok:true,role:role,color:cl.backgroundColor||'',name:cl.summaryOverride||cl.summary};
   var tok=null,n=0;do{var r=Calendar.Events.list(cal,{timeMin:tMin,timeMax:tMax,singleEvents:true,orderBy:'startTime',maxResults:2500,pageToken:tok||undefined});
    (r.items||[]).forEach(function(e){if(e.status==='cancelled'||e.eventType==='workingLocation'||e.eventType==='focusTime')return;
     var o=gcalNorm_(w,cal,e,role);if(o.ed<from||o.d>to)return;out.ev.push(o);});
    tok=r.nextPageToken;n++;}while(tok&&n<10);
  }catch(err){out.cals[w]={ok:false,err:String(err&&err.message||err)};}});
 return out;}
function gcalBody_(ev,isNew){var title=String(ev.title||'').trim().slice(0,300);if(!title)throw 'need a title';
 var d=gcalDay_(ev.date),ed=ev.endDate?gcalDay_(ev.endDate):d;if(ed<d)ed=d;
 var tm=gcalTime_(ev.time),et=gcalTime_(ev.end),b={summary:title,description:String(ev.note||'').slice(0,4000),location:String(ev.loc||'').slice(0,300)};
 if(!tm){b.start={date:d};b.end={date:gcalAddDay_(ed,1)};}
 else{var endD=ed,endT=et;
  if(!endT||(endD===d&&endT<=tm)){var h=+tm.slice(0,2)+1;endD=d;if(h>23){h-=24;endD=gcalAddDay_(d,1);}endT=('0'+h).slice(-2)+tm.slice(2);}
  b.start={dateTime:d+'T'+tm+':00',timeZone:PTZ};b.end={dateTime:endD+'T'+endT+':00',timeZone:PTZ};}
 if(isNew){var R={daily:'FREQ=DAILY',weekly:'FREQ=WEEKLY',biweekly:'FREQ=WEEKLY;INTERVAL=2',monthly:'FREQ=MONTHLY',yearly:'FREQ=YEARLY'}[ev.repeat||''];
  if(R){var u=ev.until?gcalDay_(ev.until):'';if(u)R+=';UNTIL='+(tm?gcalAddDay_(u,1).replace(/-/g,'')+'T045959Z':u.replace(/-/g,''));b.recurrence=['RRULE:'+R];}
  b.extendedProperties={private:{planner:'1'}};}
 return b;}
function gcalPut(w,ev){var cal=gcalId_(w);if(!ev||typeof ev!=='object'||Array.isArray(ev))throw 'bad event';
 var role=gcalRole_(w);if(role!=='owner'&&role!=='writer')throw 'read-only calendar';
 if(!ev.id){var made=Calendar.Events.insert(gcalBody_(ev,true),cal,{sendUpdates:'none'});return gcalNorm_(w,cal,made,role);}
 var id=gcalEvId_(ev.id),fromW=ev.from&&GCALS[ev.from]?ev.from:w,fromCal=GCALS[fromW];
 var cur=Calendar.Events.get(fromCal,id),ro=gcalRo_(fromW,fromCal,cur,gcalRole_(fromW));if(ro)throw 'read-only event ('+ro+')';
 if(fromW!==w){if(cur.recurringEventId||cur.recurrence)throw 'cannot move a repeating event';cur=Calendar.Events.move(fromCal,id,cal,{sendUpdates:'none'});}
 var b=gcalBody_(ev,false);cur.summary=b.summary;cur.description=b.description;cur.location=b.location;cur.start=b.start;cur.end=b.end;
 var saved=Calendar.Events.update(cur,cal,cur.id,{sendUpdates:'none'});return gcalNorm_(w,cal,saved,role);}
function gcalDel(w,id){var cal=gcalId_(w);id=gcalEvId_(id);var cur;
 try{cur=Calendar.Events.get(cal,id);}catch(e){if(/not ?found|404|410|deleted/i.test(String(e&&e.message||e)))return true;throw e;}
 if(cur.status==='cancelled')return true;
 var ro=gcalRo_(w,cal,cur,gcalRole_(w));if(ro)throw 'read-only event ('+ro+')';
 Calendar.Events.remove(cal,id,{sendUpdates:'none'});return true;}
function gcalAuthorize(){return gcalStatus();}
