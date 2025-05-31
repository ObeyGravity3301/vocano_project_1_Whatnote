const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // 文件对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 菜单事件监听
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => {
      callback(action);
    });
  },
  
  // 移除菜单事件监听
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  
  // 应用控制
  isElectron: true,
  platform: process.platform
});

// 在窗口加载时设置应用模式
window.addEventListener('DOMContentLoaded', () => {
  console.log('🖥️ Electron环境检测: WhatNote桌面应用');
  
  // 添加Electron应用标识
  document.body.classList.add('app-mode', 'electron-app');
  
  // 添加平台标识
  document.body.classList.add(`platform-${process.platform}`);
  
  // 禁用某些浏览器快捷键
  document.addEventListener('keydown', (e) => {
    // 禁用刷新快捷键（由Electron菜单处理）
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
    }
    
    // 禁用开发者工具快捷键（在生产环境）
    if (e.key === 'F12' && !window.electronAPI.isDev) {
      e.preventDefault();
    }
  });
  
  // 添加桌面应用信息显示
  const appInfo = document.createElement('div');
  appInfo.className = 'app-info electron-info';
  appInfo.innerHTML = `
    <div>📱 WhatNote Desktop</div>
    <div>Platform: ${process.platform}</div>
    <div>Electron: ${process.versions.electron}</div>
  `;
  document.body.appendChild(appInfo);
});

console.log('🔌 Electron预加载脚本已加载'); 