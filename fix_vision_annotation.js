// 🔧 修复图像识别状态更新逻辑
// 替换 handleForceVisionAnnotate 函数中 "确保PDF仍然是当前活动的PDF" 之后的代码

      // 修复数据提取逻辑 - API返回的结构是 {status: 'completed', result: '内容'}
      const annotationContent = data.result || data.note || data.annotation || "无注释内容";
      const annotationSource = data.source || "vision"; // 获取注释来源，视觉模型默认为vision
      
      // 🔧 修复：直接更新状态，移除过于严格的条件检查
      console.log(`🔄 准备更新图像识别结果: ${annotationContent.length}字符`);
      
      // 一次性更新所有相关属性
      setCourseFiles(prev => {
        const courseKey = currentFile.key;
        const pdfs = [...(prev[courseKey] || [])];
        const pdfIndex = pdfs.findIndex(pdf => pdf.id === pdfId);
        
        if (pdfIndex !== -1) {
          // 创建更新后的PDF对象
          const updatedPdf = {
            ...pdfs[pdfIndex],
            pageAnnotations: {
              ...pdfs[pdfIndex].pageAnnotations,
              [currentPage]: annotationContent
            },
            pageAnnotationSources: {
              ...pdfs[pdfIndex].pageAnnotationSources || {},
              [currentPage]: annotationSource
            },
            pageAnnotationLoadings: {
              ...pdfs[pdfIndex].pageAnnotationLoadings,
              [currentPage]: false  // 只清除当前页面的加载状态
            }
          };
          
          // 🔧 关键修复：只有当生成的注释是当前页面时，才更新当前显示的annotation
          if (pdfs[pdfIndex].currentPage === currentPage) {
            updatedPdf.annotation = annotationContent;
            console.log(`📝 更新当前显示的图像识别注释 (页面${currentPage}): ${annotationContent.length}字符`);
          } else {
            console.log(`📝 图像识别注释已存储但不更新显示 (生成页面${currentPage}, 当前页面${pdfs[pdfIndex].currentPage})`);
          }
          
          pdfs[pdfIndex] = updatedPdf;
          
          return {
            ...prev,
            [courseKey]: pdfs
          };
        }
        
        return prev;
      });
    
      console.log(`✅ 页面${currentPage}图像识别注释获取成功: ${annotationContent.length}字符`);
      
      // 记录LLM交互日志到调试面板
      const logEvent = new CustomEvent('llm-interaction', {
        detail: {
          id: `vision-annotation-${Date.now()}`,
          timestamp: new Date().toISOString(),
          llmType: 'expert',
          query: `图像识别注释: ${safeImproveRequest || '标准识别'}`,
          response: annotationContent || '无响应',
          requestBody: {
            filename: serverFilename,
            page_number: currentPage,
            session_id: sessionId,
            current_annotation: isInitialRecognition ? null : currentAnnotation,
            improve_request: safeImproveRequest
          },
          metadata: {
            operation: 'vision_annotation',
            requestType: 'vision_annotation',
            filename: serverFilename,
            pageNumber: currentPage,
            sessionId: sessionId,
            streaming: false,
            taskBased: true,
            isInitialRecognition
          }
        }
      });
      window.dispatchEvent(logEvent);
      
      message.success('图像识别注释生成成功'); 