// Kenzi's Planner service worker — v2.2.0 (tabs). Bump VERSION to push a new app to phones.
var VERSION='planner-v2.2.0';
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:"AIzaSyC39hLDKkglPAU6W3re0nkmz4KNgqLegXI",authDomain:"kenzi-planner.firebaseapp.com",projectId:"kenzi-planner",storageBucket:"kenzi-planner.firebasestorage.app",messagingSenderId:"852694257543",appId:"1:852694257543:web:a4e4150706397152914d22"});
firebase.messaging();
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSION;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
// Network first for the app's own files (always fresh when online), cached copy when offline.
self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);if(u.origin!==location.origin)return;
 e.respondWith(fetch(r).then(function(res){if(res&&res.ok){var c=res.clone();caches.open(VERSION).then(function(ca){ca.put(r,c);});}return res;}).catch(function(){return caches.match(r).then(function(m){return m||caches.match('./');});}));});
self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(function(cs){for(var c of cs){if('focus' in c)return c.focus();}return clients.openWindow('./');}));});
