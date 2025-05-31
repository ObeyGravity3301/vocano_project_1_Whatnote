const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

// 启动Python后端服务
function startBackend() {
  console.log('🚀 启动Python后端服务...');
  
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const backendPath = isDev ? 
    path.join(__dirname, 'main.py') : 
    path.join(process.resourcesPath, 'main.py');
  
  backendProcess = spawn(pythonCmd, [backendPath], {
    cwd: isDev ? __dirname : process.resourcesPath,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  backendProcess.stdout.on('data', (data) => {
    console.log('Backend:', data.toString());
  });
  
  backendProcess.stderr.on('data', (data) => {
    console.error('Backend Error:', data.toString());
  });
  
  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
  
  // 等待后端服务启动
  return new Promise((resolve) => {
    setTimeout(resolve, 3000); // 等待3秒让后端启动
  });
}

// 创建主窗口
function createMainWindow() {
  console.log('📱 创建WhatNote主窗口...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    icon: path.join(__dirname, 'build/favicon.ico'),
    title: 'WhatNote - 智能笔记系统',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // 先隐藏，等待内容加载完成
    backgroundColor: '#f0f2f5'
  });

  // 加载应用
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'build/index.html')}`;
  
  console.log('🌐 加载应用URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // 窗口准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    console.log('✅ WhatNote窗口准备就绪');
    mainWindow.show();
    
    // 开发模式下打开开发者工具
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 阻止导航到外部URL
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });

  return mainWindow;
}

// 创建应用菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建课程',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-action', 'new-course');
          }
        },
        {
          label: '上传PDF',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-action', 'upload-pdf');
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '全屏',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        { label: '刷新', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制刷新', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'AI功能',
      submenu: [
        {
          label: '专家LLM对话',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-action', 'open-expert-llm');
          }
        },
        {
          label: '管家助手',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('menu-action', 'open-butler');
          }
        },
        {
          label: '调试面板',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-debug');
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于WhatNote',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于WhatNote',
              message: 'WhatNote - 智能笔记系统',
              detail: '版本: 1.0.0\n基于AI的智能PDF笔记生成系统\n支持视觉识别和智能注释',
              buttons: ['确定']
            });
          }
        },
        {
          label: '访问项目主页',
          click: () => {
            shell.openExternal('https://github.com/whatnote/whatnote');
          }
        }
      ]
    }
  ];

  // macOS特殊处理
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: '关于 ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏 ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: '隐藏其他', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// 应用事件处理
app.whenReady().then(async () => {
  console.log('🎯 WhatNote Electron应用启动');
  
  // 启动后端服务
  try {
    await startBackend();
    console.log('✅ 后端服务启动完成');
  } catch (error) {
    console.error('❌ 后端服务启动失败:', error);
  }
  
  // 创建窗口和菜单
  createMainWindow();
  createMenu();
  
  // macOS特殊处理
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  console.log('🛑 WhatNote应用退出中...');
  
  // 关闭后端进程
  if (backendProcess) {
    console.log('🔄 关闭后端服务...');
    backendProcess.kill();
  }
});

// 处理证书错误（开发环境）
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// 防止多个实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 有人试图运行第二个实例，聚焦到主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
} 