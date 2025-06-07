#!/usr/bin/env node

/**
 * 修复视觉识别功能中的轮询错误
 * 解决 "Cannot read properties of null (reading 'status')" 错误
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 开始修复视觉识别功能...');

const appJsPath = 'frontend/src/App.js';

// 检查文件是否存在
if (!fs.existsSync(appJsPath)) {
    console.error('❌ App.js文件不存在:', appJsPath);
    process.exit(1);
}

// 读取文件内容
let content = fs.readFileSync(appJsPath, 'utf8');

// 备份原文件
const backupPath = appJsPath + '.vision_fix_backup';
if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content);
    console.log('✅ 已备份原文件:', backupPath);
}

// 1. 首先修复轮询函数中的null检查
console.log('🔍 检查轮询函数...');
const pollFunctionRegex = /const pollTaskResult = async \(taskId\) => \{[\s\S]*?throw new Error\('任务超时'\);\s*\};/;

if (!pollFunctionRegex.test(content)) {
    console.log('⚠️ 未找到完整的pollTaskResult函数，尝试修复个别问题点...');
    
    // 修复可能的直接status访问
    const directStatusPattern = /if\s*\(\s*result\.status\s*===\s*'completed'\s*\)/g;
    content = content.replace(directStatusPattern, 'if (result && result.status === \'completed\')');
    
    const directStatusPattern2 = /else\s+if\s*\(\s*result\.status\s*===\s*'failed'\s*\)/g;
    content = content.replace(directStatusPattern2, 'else if (result && result.status === \'failed\')');
    
    console.log('✅ 已添加基本的null检查');
} else {
    // 替换整个轮询函数
    const improvedPollFunction = `const pollTaskResult = async (taskId) => {
        const maxAttempts = 60; // 最多等待5分钟
        let attempts = 0;
        
        console.log(\`🔄 开始轮询视觉任务结果: \${taskId}\`);
        
        while (attempts < maxAttempts) {
          try {
            console.log(\`📊 轮询尝试 \${attempts + 1}/\${maxAttempts}\`);
            const resultResponse = await fetch(\`\${baseUrl}/api/expert/dynamic/result/\${taskId}\`);
            
            if (resultResponse.ok) {
              let result;
              try {
                result = await resultResponse.json();
              } catch (parseError) {
                console.error(\`❌ JSON解析失败:\`, parseError);
                console.log(\`原始响应:\`, await resultResponse.text());
                throw new Error('响应格式错误');
              }
              
              console.log(\`📋 轮询响应:\`, result);
              
              // 严格的null和undefined检查
              if (result !== null && result !== undefined && typeof result === 'object') {
                const status = result.status;
                
                if (status === 'completed') {
                  console.log('✅ 视觉任务已完成');
                  return result;
                } else if (status === 'failed') {
                  const errorMsg = result.error || '任务执行失败';
                  console.error(\`❌ 任务失败: \${errorMsg}\`);
                  throw new Error(errorMsg);
                } else if (status === 'pending' || status === 'processing') {
                  console.log(\`⏳ 任务处理中: \${status}\`);
                } else {
                  console.log(\`🔄 未知任务状态: \${status || 'undefined'}\`);
                }
              } else {
                console.warn('⚠️ 收到无效响应:', {
                  isNull: result === null,
                  isUndefined: result === undefined,
                  type: typeof result,
                  value: result
                });
              }
            } else {
              console.warn(\`⚠️ HTTP错误: \${resultResponse.status} \${resultResponse.statusText}\`);
              
              if (resultResponse.status === 404) {
                console.log('🔍 任务不存在，可能尚未创建');
              }
            }
          } catch (fetchError) {
            console.error(\`❌ 网络请求失败 (尝试 \${attempts + 1}):\`, fetchError.message);
          }
          
          // 等待5秒后重试
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        }
        
        console.error(\`⏰ 轮询超时: 已尝试 \${maxAttempts} 次\`);
        throw new Error(\`任务轮询超时: 超过 \${maxAttempts} 次尝试\`);
      };`;
    
    content = content.replace(pollFunctionRegex, improvedPollFunction);
    console.log('✅ 已替换轮询函数');
}

// 2. 修复数据提取时的null检查
console.log('🔍 修复数据提取逻辑...');
const dataExtractionPattern = /const data = await pollTaskResult\(taskData\.task_id\);\s*(\/\/ 修复数据提取逻辑[^\n]*\n)?\s*const annotationContent = data\.result/;

if (dataExtractionPattern.test(content)) {
    const improvedDataExtraction = `const data = await pollTaskResult(taskData.task_id);
      
      // 修复数据提取逻辑 - 增强null检查
      console.log('📋 收到任务结果:', data);
      
      if (!data || typeof data !== 'object') {
        throw new Error('无效的任务结果: 数据为空或格式不正确');
      }
      
      const annotationContent = data.result`;
    
    content = content.replace(dataExtractionPattern, improvedDataExtraction);
    console.log('✅ 已修复数据提取逻辑');
}

// 3. 添加额外的错误处理
console.log('🔍 增强错误处理...');
const catchBlockPattern = /} catch \(err\) \{\s*console\.error\("❌ 图像识别注释失败:", err\);/;

if (catchBlockPattern.test(content)) {
    const improvedCatchBlock = `} catch (err) {
      console.error("❌ 图像识别注释失败:", err);
      console.error("错误详情:", {
        name: err.name,
        message: err.message,
        stack: err.stack?.split('\\n').slice(0, 3).join('\\n')
      });`;
    
    content = content.replace(catchBlockPattern, improvedCatchBlock);
    console.log('✅ 已增强错误处理');
}

// 保存修复后的文件
fs.writeFileSync(appJsPath, content);
console.log('✅ 已保存修复后的文件');

// 创建恢复脚本
const restoreScript = `#!/usr/bin/env node
const fs = require('fs');

console.log('🔄 恢复视觉识别修复前的版本...');

if (fs.existsSync('${backupPath}')) {
    const backup = fs.readFileSync('${backupPath}', 'utf8');
    fs.writeFileSync('${appJsPath}', backup);
    console.log('✅ 已恢复到修复前的版本');
} else {
    console.error('❌ 备份文件不存在');
    process.exit(1);
}
`;

fs.writeFileSync('restore_vision_fix.js', restoreScript);
console.log('📝 已创建恢复脚本: restore_vision_fix.js');

console.log('\n🎯 修复完成总结:');
console.log('  ✅ 加强了轮询函数的null/undefined检查');
console.log('  ✅ 改进了JSON解析错误处理');
console.log('  ✅ 增强了数据提取的验证');
console.log('  ✅ 优化了错误日志记录');
console.log('\n🚀 现在视觉识别功能应该更加稳定!');
console.log('\n💡 如果仍有问题，请检查后端API是否正常返回数据'); 