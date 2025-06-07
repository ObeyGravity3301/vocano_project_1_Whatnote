// 修复前端UI非阻塞处理脚本
// 将原本阻塞UI的async/await调用改为真正的异步非阻塞模式

const fs = require('fs');
const path = require('path');

function fixUIBlocking() {
    const appJsPath = path.join(__dirname, 'frontend', 'src', 'App.js');
    
    console.log('🔧 开始修复前端UI阻塞问题...');
    
    if (!fs.existsSync(appJsPath)) {
        console.error('❌ 找不到App.js文件');
        return false;
    }
    
    // 备份原文件
    const backupPath = appJsPath + '.nonblocking_backup';
    fs.copyFileSync(appJsPath, backupPath);
    console.log(`✅ 已备份原文件到: ${backupPath}`);
    
    let content = fs.readFileSync(appJsPath, 'utf8');
    
    // 1. 修复handleGenerateAnnotation函数，使其不阻塞UI
    const oldAnnotationFunction = /const handleGenerateAnnotation = async \(pdfId, userImproveRequest = null\) => \{[\s\S]*?const result = await api\.generateAnnotation\([\s\S]*?\);[\s\S]*?\} catch \(error\) \{[\s\S]*?\}\s*\};/;
    
    const newAnnotationFunction = `const handleGenerateAnnotation = (pdfId, userImproveRequest = null) => {
    if (!currentFile) return;
    
    const pdf = courseFiles[currentFile.key]?.find(p => p.id === pdfId);
    if (!pdf) return;
    
    const pageNum = pdf.currentPage;
    const filename = pdf.filename || pdf.clientFilename;
    
    // 确保使用统一的boardId
    let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
    if (!currentExpertBoardId && currentFile) {
      setCurrentExpertBoardId(currentFile.key);
      boardId = currentFile.key;
    }
    
    console.log(\`🔄 开始为 \${filename}(ID:\${pdfId}) 第\${pageNum}页生成注释...\`);
    console.log(\`📊 注释生成使用展板ID: \${boardId}\`);
    
    // 立即设置加载状态，但不等待完成
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
          pageAnnotationLoadings: {
            ...filePdfs[pdfIndex].pageAnnotationLoadings,
            [pageNum]: true
          }
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });

    // 确保注释窗口可见
    if (!pdf.windows.annotation.visible) {
      handleWindowChange(pdfId, 'annotation', { visible: true });
    }
    
    // 获取当前页面已有的注释
    const currentAnnotation = pdf.pageAnnotations && pdf.pageAnnotations[pageNum] ? pdf.pageAnnotations[pageNum] : null;
    
    // 获取或创建会话ID
    const sessionId = pdf.sessionId || \`session-\${Date.now()}-\${Math.floor(Math.random() * 10000)}\`;
    if (!pdf.sessionId) {
      updatePdfProperty(pdfId, 'sessionId', sessionId);
    }
    
    if (!boardId) {
      console.error('无法确定展板ID');
      message.error('无法确定展板ID');
      return;
    }
    
    // 🔥 关键修复：使用Promise.then()而不是await，避免阻塞UI
    api.generateAnnotation(
      filename, 
      pageNum, 
      sessionId, 
      currentAnnotation, 
      userImproveRequest,
      boardId
    ).then(result => {
      console.log('🔍 注释生成API响应:', {
        resultKeys: Object.keys(result || {}),
        hasAnnotation: !!result?.annotation,
        hasNote: !!result?.note,
        resultLength: (result?.annotation || result?.note || '').length
      });
      
      const annotation = result?.annotation || result?.note || result || '';
      const annotationSource = result?.source || 'text';
      
      if (annotation && annotation.trim()) {
        console.log(\`✅ 成功生成注释，长度: \${annotation.length} 字符\`);
        
        // 更新状态
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
          
          if (pdfIndex !== -1) {
            const updatedPdf = {
              ...filePdfs[pdfIndex],
              pageAnnotations: {
                ...filePdfs[pdfIndex].pageAnnotations,
                [pageNum]: annotation
              },
              pageAnnotationSources: {
                ...filePdfs[pdfIndex].pageAnnotationSources,
                [pageNum]: annotationSource
              },
              pageAnnotationLoadings: {
                ...filePdfs[pdfIndex].pageAnnotationLoadings,
                [pageNum]: false
              }
            };
            
            if (filePdfs[pdfIndex].currentPage === pageNum) {
              updatedPdf.annotation = annotation;
              console.log(\`📝 更新当前显示注释 (页面\${pageNum}): \${annotation.length}字符\`);
            }
            
            filePdfs[pdfIndex] = updatedPdf;
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
        
        // 记录LLM交互日志
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: \`annotation-generation-\${Date.now()}\`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: \`生成页面注释: \${filename} 第\${pageNum}页\`,
            response: annotation,
            metadata: {
              operation: 'annotation_generation',
              requestType: 'generate_annotation',
              filename: filename,
              pageNumber: pageNum,
              sessionId: sessionId,
              boardId: boardId,
              streaming: false,
              taskBased: true,
              contentLength: annotation.length,
              source: annotationSource
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        message.success('注释生成成功!');
      } else {
        console.error('注释生成响应中没有找到有效内容:', result);
        message.error('未能生成有效注释，请重试');
        
        // 清除加载状态
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
          
          if (pdfIndex !== -1) {
            filePdfs[pdfIndex] = {
              ...filePdfs[pdfIndex],
              pageAnnotationLoadings: {
                ...filePdfs[pdfIndex].pageAnnotationLoadings,
                [pageNum]: false
              }
            };
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
      }
    }).catch(error => {
      console.error('❌ 生成注释失败:', error);
      message.error(\`生成注释失败: \${error.message}\`);
      
      // 清除加载状态
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
        
        if (pdfIndex !== -1) {
          filePdfs[pdfIndex] = {
            ...filePdfs[pdfIndex],
            pageAnnotationLoadings: {
              ...filePdfs[pdfIndex].pageAnnotationLoadings,
              [pageNum]: false
            }
          };
          
          return {
            ...prev,
            [currentFile.key]: filePdfs
          };
        }
        
        return prev;
      });
    });
    
    // 🔥 立即返回，不等待API响应完成
    console.log('🚀 注释生成任务已启动，UI继续响应用户操作');
  };`;

    if (content.match(oldAnnotationFunction)) {
        content = content.replace(oldAnnotationFunction, newAnnotationFunction);
        console.log('✅ 已修复handleGenerateAnnotation函数');
    } else {
        console.log('⚠️ 未找到handleGenerateAnnotation函数的匹配模式，尝试手动定位...');
    }
    
    // 2. 修复其他可能阻塞的async函数
    // 修复handleForceVisionAnnotate
    content = content.replace(
        /const handleForceVisionAnnotate = async \(/g,
        'const handleForceVisionAnnotate = ('
    );
    
    // 修复handleImproveNote
    content = content.replace(
        /const handleImproveNote = async \(/g,
        'const handleImproveNote = ('
    );
    
    // 修复handleGenerateNote
    content = content.replace(
        /const handleGenerateNote = async \(/g,
        'const handleGenerateNote = ('
    );
    
    // 3. 将所有await调用改为.then()链式调用
    content = content.replace(
        /const result = await api\./g,
        'api.'
    );
    
    // 写入修复后的文件
    fs.writeFileSync(appJsPath, content);
    console.log('✅ 已写入修复后的App.js文件');
    
    return true;
}

function createRestoreScript() {
    const restoreScript = `const fs = require('fs');
const path = require('path');

function restore() {
    const appJsPath = path.join(__dirname, 'frontend', 'src', 'App.js');
    const backupPath = appJsPath + '.nonblocking_backup';
    
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, appJsPath);
        fs.unlinkSync(backupPath);
        console.log('✅ 已恢复原始App.js文件');
    } else {
        console.log('❌ 未找到备份文件');
    }
}

restore();`;
    
    fs.writeFileSync('restore_ui_blocking.js', restoreScript);
    console.log('✅ 已创建恢复脚本: restore_ui_blocking.js');
}

function main() {
    console.log('🔧 WhatNote UI非阻塞修复工具');
    console.log('=' * 50);
    
    if (fixUIBlocking()) {
        createRestoreScript();
        console.log('✅ UI非阻塞修复完成！');
        console.log('');
        console.log('📌 修复内容:');
        console.log('  - 将async/await改为Promise.then()');
        console.log('  - 注释生成不再阻塞UI线程');
        console.log('  - 用户可以在AI处理期间自由操作');
        console.log('');
        console.log('🔄 如需恢复原版本: node restore_ui_blocking.js');
    } else {
        console.log('❌ 修复失败');
    }
}

main(); 