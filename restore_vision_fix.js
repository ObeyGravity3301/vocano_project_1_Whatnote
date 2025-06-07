#!/usr/bin/env node
const fs = require('fs');

console.log('🔄 恢复视觉识别修复前的版本...');

if (fs.existsSync('frontend/src/App.js.vision_fix_backup')) {
    const backup = fs.readFileSync('frontend/src/App.js.vision_fix_backup', 'utf8');
    fs.writeFileSync('frontend/src/App.js', backup);
    console.log('✅ 已恢复到修复前的版本');
} else {
    console.error('❌ 备份文件不存在');
    process.exit(1);
}
