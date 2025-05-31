const CACHE_NAME = 'whatnote-v1.0.0';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// 安装Service Worker
self.addEventListener('install', (event) => {
  console.log('📦 WhatNote Service Worker 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📥 缓存资源...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker 安装完成');
        return self.skipWaiting(); // 立即激活新的service worker
      })
  );
});

// 激活Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 WhatNote Service Worker 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker 激活完成');
      return self.clients.claim(); // 立即控制所有页面
    })
  );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  // 只缓存GET请求
  if (event.request.method !== 'GET') {
    return;
  }
  
  // 跳过API请求的缓存
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果缓存中有，直接返回
        if (response) {
          return response;
        }
        
        // 否则从网络获取
        return fetch(event.request).then(
          (response) => {
            // 检查是否为有效响应
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // 克隆响应用于缓存
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          }
        );
      })
  );
});

// 处理消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 