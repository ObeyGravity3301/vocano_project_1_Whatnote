// 测试VideoWindow模块导入
const path = require('path');
const fs = require('fs');

console.log('🔍 测试VideoWindow模块导入...');

const videoWindowPath = path.join(__dirname, 'frontend/src/components/VideoWindow.js');

if (fs.existsSync(videoWindowPath)) {
  console.log('✅ VideoWindow.js 文件存在');
  
  const content = fs.readFileSync(videoWindowPath, 'utf8');
  
  // 检查关键内容
  if (content.includes('export default VideoWindow')) {
    console.log('✅ 找到正确的默认导出语句');
  } else {
    console.log('❌ 未找到默认导出语句');
  }
  
  if (content.includes('const VideoWindow = ({')) {
    console.log('✅ 找到组件定义');
  } else {
    console.log('❌ 未找到组件定义');
  }
  
  if (content.includes('import React')) {
    console.log('✅ 找到React导入');
  } else {
    console.log('❌ 未找到React导入');
  }
  
  // 检查语法错误
  try {
    // 简单的语法检查
    const lines = content.split('\n');
    let braceCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
    }
    
    if (braceCount === 0) {
      console.log('✅ 大括号匹配正确');
    } else {
      console.log(`❌ 大括号不匹配，差值: ${braceCount}`);
    }
    
  } catch (error) {
    console.log('❌ 语法检查失败:', error.message);
  }
  
} else {
  console.log('❌ VideoWindow.js 文件不存在');
}

console.log('\n📋 建议解决方案:');
console.log('1. 重启前端开发服务器');
console.log('2. 清除浏览器缓存');
console.log('3. 硬刷新页面 (Ctrl+Shift+R)');
console.log('4. 检查浏览器控制台是否有其他错误');