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

// ===== Home Screen app API + phone notifications (added 2026-11-15) =====
var APP_URL='https://blakekenzid-afk.github.io/kenzi-planner/';
var API_FNS={getAll:1,setCheck:1,setDinner:1,addThought:1,deleteThought:1,addTodo:1,addGrocery:1,addMeal:1,removeMeal:1,clearChecked:1,setCells:1,saveToken:1,testPush:1,addReminder:1,getReminders:1,deleteReminder:1};
function props_(){return PropertiesService.getScriptProperties();}
function doPost(e){var out;try{var b=JSON.parse(e.postData.contents),key=props_().getProperty('PLANNER_KEY');
 if(!key||b.k!==key)throw 'locked';if(!API_FNS[b.fn])throw 'bad fn';
 out={ok:true,r:globalThis[b.fn].apply(null,b.args||[])};}catch(err){out={ok:false,e:String(err)};}
 return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);}
function saveToken(t){if(!t)throw 'no token';var a=JSON.parse(props_().getProperty('TOKENS')||'[]');if(a.indexOf(t)<0)a.push(t);if(a.length>10)a=a.slice(-10);props_().setProperty('TOKENS',JSON.stringify(a));ensureTrigger_();return a.length;}
function ensureTrigger_(){if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='checkReminders';}))ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();}
function b64u_(x){return Utilities.base64EncodeWebSafe(x).replace(/=+$/,'');}
function fcmToken_(){var c=CacheService.getScriptCache(),t=c.get('fcm_at');if(t)return t;var sa=props_().getProperty('FCM_SA');if(!sa)throw 'FCM_SA missing';
 var j=JSON.parse(sa),now=Math.floor(Date.now()/1000);
 var h=b64u_(JSON.stringify({alg:'RS256',typ:'JWT'})),cl=b64u_(JSON.stringify({iss:j.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
 var sig=b64u_(Utilities.computeRsaSha256Signature(h+'.'+cl,j.private_key));
 var r=JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+cl+'.'+sig}}).getContentText());
 c.put('fcm_at',r.access_token,3000);return r.access_token;}
function sendPush_(title,body){var a=JSON.parse(props_().getProperty('TOKENS')||'[]');if(!a.length)return {sent:0,err:'no devices yet'};
 var at=fcmToken_(),keep=[],sent=0,err='';
 a.forEach(function(tok){var res=UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/kenzi-planner/messages:send',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+at},muteHttpExceptions:true,
  payload:JSON.stringify({message:{token:tok,notification:{title:title,body:body},webpush:{fcm_options:{link:APP_URL},notification:{icon:APP_URL+'icon-192.png'}}}})});
  var code=res.getResponseCode(),txt=res.getContentText();if(code===200){sent++;keep.push(tok);}else{err=code+' '+txt.slice(0,300);if(!(code===404||/UNREGISTERED/.test(txt)))keep.push(tok);}});
 props_().setProperty('TOKENS',JSON.stringify(keep));return {sent:sent,err:err};}
function testPush(){return sendPush_('🌸 Hi Kenzi!','Notifications are working on your planner.');}
function remSh_(){var s=ss_().getSheetByName('⏰ Reminders');if(!s){s=ss_().insertSheet('⏰ Reminders');s.getRange(1,1,1,4).setValues([['When','Reminder','Repeat (daily/weekly)','Sent']]).setFontWeight('bold').setBackground('#FCE4EC');s.setColumnWidth(1,170);s.setColumnWidth(2,340);s.setColumnWidth(3,150);s.setFrozenRows(1);}return s;}
function addReminder(ms,text,repeat){if(!text||!ms)throw 'need time and text';var s=remSh_(),r=s.getLastRow()+1;s.getRange(r,1,1,4).setValues([[new Date(Number(ms)),text,repeat||'',false]]);s.getRange(r,1).setNumberFormat('ddd m/d/yyyy h:mm am/pm');s.getRange(r,4).insertCheckboxes();ensureTrigger_();return r;}
function getReminders(){var s=remSh_(),n=s.getLastRow();if(n<2)return [];return s.getRange(2,1,n-1,4).getValues().map(function(v,i){return {row:i+2,when:v[0] instanceof Date?v[0].getTime():null,text:v[1],repeat:v[2],sent:v[3]===true};}).filter(function(x){return x.text&&x.when&&!x.sent;}).sort(function(a,b){return a.when-b.when;});}
function deleteReminder(row){if(row<2)throw 'bad';remSh_().deleteRow(row);return true;}
function checkReminders(){var s=remSh_(),n=s.getLastRow();if(n<2)return;var v=s.getRange(2,1,n-1,4).getValues(),now=Date.now();
 for(var i=0;i<v.length;i++){var w=v[i][0],t=v[i][1];if(!(w instanceof Date)||!t||v[i][3]===true)continue;
  if(w.getTime()<=now+30000){sendPush_('⏰ '+t,Utilities.formatDate(w,tz_(),'h:mm a')+' · from your planner 🌸');var rp=String(v[i][2]).toLowerCase().trim();
   if(rp==='daily'||rp==='weekly'){var nx=new Date(w.getTime());do{nx.setDate(nx.getDate()+(rp==='daily'?1:7));}while(nx.getTime()<=now);s.getRange(i+2,1).setValue(nx);}else s.getRange(i+2,4).setValue(true);}}}
