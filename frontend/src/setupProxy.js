const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // 这个文件存在会使React脚本忽略package.json中的devServer配置
  console.log('初始化自定义代理配置 - API请求将代理到 http://127.0.0.1:8000');

  app.use(
    ['/api', '/materials'],
    createProxyMiddleware({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log(`代理请求: ${req.method} ${req.url} -> http://127.0.0.1:8000${req.url}`);
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`代理响应: ${req.method} ${req.url}, 状态: ${proxyRes.statusCode}`);
      },
      onError: (err, req, res) => {
        console.error('代理错误:', err);
        console.error(`请求失败: ${req.method} ${req.url}`);
        res.writeHead(500, {
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({ 
          error: 'API代理错误',
          message: '无法连接到后端API服务',
          details: err.message,
          url: req.url,
          method: req.method
        }));
      }
    })
  );
}; 