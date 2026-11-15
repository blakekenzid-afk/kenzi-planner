importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:"AIzaSyC39hLDKkglPAU6W3re0nkmz4KNgqLegXI",authDomain:"kenzi-planner.firebaseapp.com",projectId:"kenzi-planner",storageBucket:"kenzi-planner.firebasestorage.app",messagingSenderId:"852694257543",appId:"1:852694257543:web:a4e4150706397152914d22"});
firebase.messaging();
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(function(cs){for(var c of cs){if('focus' in c)return c.focus();}return clients.openWindow('./');}));});
