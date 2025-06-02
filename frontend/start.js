// 自定义启动脚本，绕过webpack-dev-server配置问题
const { spawn } = require('child_process');
const path = require('path');

console.log('正在启动React应用...');
console.log('设置代理配置: http://127.0.0.1:8000');

// 设置环境变量
process.env.PORT = 3000;
process.env.DANGEROUSLY_DISABLE_HOST_CHECK = 'true';
process.env.BROWSER = 'none';
process.env.REACT_APP_BACKEND_URL = 'http://127.0.0.1:8000';
process.env.WDS_SOCKET_HOST = 'localhost';

// 告知用户使用setupProxy.js配置
console.log('使用setupProxy.js配置代理，API请求将被转发到后端');

// 启动react-scripts
const scriptsPath = path.resolve(__dirname, 'node_modules', '.bin', 'react-scripts');
const args = ['start'];

const child = spawn(scriptsPath, args, {
  stdio: 'inherit',
  env: { ...process.env },
  shell: true,
});

child.on('error', (err) => {
  console.error('启动失败:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`进程以代码 ${code} 退出`);
    process.exit(code);
  }
});

console.log('React应用启动命令已执行，等待开发服务器启动...'); 