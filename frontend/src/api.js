/**
 * API客户端
 * 用于处理与后端服务的通信
 */

// 获取后端API URL
const getBaseUrl = () => {
  // 如果环境变量中设置了后端URL，使用它
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  
  // 默认使用当前主机的8000端口
  return window.location.protocol + '//' + window.location.hostname + ':8000';
};

const API_BASE_URL = getBaseUrl();
console.log('API基础URL:', API_BASE_URL);

/**
 * 处理API请求
 * 
 * @param {string} endpoint - API端点路径
 * @param {Object} options - 请求选项
 * @returns {Promise} - 解析为响应JSON的Promise
 */
const apiRequest = async (endpoint, options = {}) => {
  // 处理URL中的空格，确保正确编码
  const encodedEndpoint = endpoint.replace(/ /g, '%20');
  
  // 确保端点以/api开头
  const apiEndpoint = encodedEndpoint.startsWith('/api/') 
    ? encodedEndpoint 
    : `/api${encodedEndpoint.startsWith('/') ? encodedEndpoint : '/' + encodedEndpoint}`;
  
  // 构建完整URL
  const url = `${API_BASE_URL}${apiEndpoint}`;
    
  console.log(`API请求: ${options.method || 'GET'} ${url}`);
  console.log(`请求选项:`, options);
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API请求失败: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
};

// 获取WebSocket URL
const getWebSocketBaseUrl = () => {
  const baseUrl = getBaseUrl();
  // 将http://转换为ws://，或将https://转换为wss://
  return baseUrl.replace(/^http/, 'ws');
};

// 导出获取WebSocket URL方法供其他组件使用
const WS_BASE_URL = getWebSocketBaseUrl();

// API端点函数
const api = {
  // 导出基础URL获取函数
  getBaseUrl,
  
  // 通用HTTP方法
  get: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  },
  
  post: (endpoint, data = null, options = {}) => {
    return apiRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : null,
      ...options
    });
  },
  
  put: (endpoint, data = null, options = {}) => {
    return apiRequest(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : null,
      ...options
    });
  },
  
  delete: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  },
  
  // 获取应用状态
  getAppState: () => apiRequest('/app-state'),
  
  // 获取展板列表
  getBoards: () => apiRequest('/boards/list'),
  
  // 获取指定展板信息
  getBoard: (boardId) => apiRequest(`/boards/${boardId}`),
  
  // 获取API配置状态
  getConfigStatus: () => apiRequest('/check-config'),
  
  // 获取WebSocket基础URL
  getWebSocketUrl: (path) => {
    // 确保WebSocket路径正确格式化
    const wsPath = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;
    return `${WS_BASE_URL}${wsPath}`;
  },
  
  // 上传文件
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    
    // 上传图片文件，不设置Content-Type让浏览器自动设置
    return apiRequest('/materials/upload', {
      method: "POST",
      headers: {}, // 清空headers让浏览器设置正确的multipart boundary
      body: formData,
    });
  },

  // 上传图片专用API
  uploadImage: async (file, windowId = null) => {
    const formData = new FormData();
    formData.append("file", file);
    
    // 如果提供了窗口ID，添加到表单数据中
    if (windowId) {
      formData.append("window_id", windowId);
    }
    
    // 使用专门的图片上传API
    return apiRequest('/images/upload', {
      method: "POST",
      headers: {}, // 清空headers让浏览器设置正确的multipart boundary
      body: formData,
    });
  },

  // 上传视频专用API - 非阻塞版本
  uploadVideo: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    
    // 使用专门的视频上传API，返回Promise而不是await
    return apiRequest('/videos/upload', {
      method: "POST",
      headers: {}, // 清空headers让浏览器设置正确的multipart boundary
      body: formData,
    });
  },
  
  // 创建课程文件夹
  createCourse: (name) => apiRequest('/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }),
  
  // 创建展板
  createBoard: (name, courseFolder) => apiRequest('/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, course_folder: courseFolder })
  }),
  
  // 创建课程文件
  createCourseFile: (courseId, fileName, pdfFilename = null) => apiRequest(`/courses/${courseId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, pdf_filename: pdfFilename })
  }),
  
  // 添加窗口到展板
  addBoardWindow: (boardId, windowData) => apiRequest(`/boards/${boardId}/windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ window: windowData })
  }),
  
  // 更新展板窗口
  updateBoardWindow: (boardId, windowId, windowData) => apiRequest(`/boards/${boardId}/windows/${windowId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ window: windowData })
  }),
  
  // 删除展板窗口
  removeBoardWindow: (boardId, windowId) => apiRequest(`/boards/${boardId}/windows/${windowId}`, {
    method: 'DELETE'
  }),
  
  // 获取LLM日志
  getLLMLogs: (params) => apiRequest('/llm-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  }),
  
  // 清空LLM日志
  clearLLMLogs: () => apiRequest('/llm-logs/clear', {
    method: 'POST'
  }),
  
  // 导出LLM日志
  exportLLMLogs: (params) => apiRequest('/llm-logs/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  }),
  
  // 生成整本PDF笔记 - 使用并发API
  generatePdfNote: (filename, sessionId = null, boardId = null) => {
    console.log(`🚀 使用并发API生成PDF笔记: ${filename}`);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      throw new Error('并发API需要boardId');
    }

    // 使用并发API
    const body = {
      board_id: boardId,
      filename: filename
    };

    console.log('🚀 提交PDF笔记生成任务:', body);

    // 提交任务
    return apiRequest('/expert/dynamic/generate-pdf-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      console.log('✅ PDF笔记任务已提交:', response);
      
      const task_id = response.task_id;
      const maxPolls = 60; // 最多轮询60次 (约2分钟)
      const pollInterval = 2000; // 轮询间隔2秒
      let pollCount = 0;

      const pollResult = () => {
        return apiRequest(`/expert/dynamic/result/${task_id}`)
          .then(pollResponse => {
            console.log(`📊 轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
            
            if (pollResponse.status === 'completed') {
              console.log('✅ PDF笔记生成完成');
              return { result: pollResponse.result };
            } else if (pollResponse.status === 'failed') {
              throw new Error(pollResponse.error || '笔记生成失败');
            } else {
              // 仍在处理中
              pollCount++;
              if (pollCount >= maxPolls) {
                throw new Error('笔记生成超时');
              }
              
              console.log('⏳ 继续等待笔记生成...');
              return new Promise(resolve => 
                setTimeout(() => resolve(pollResult()), pollInterval)
              );
            }
          });
      };

      return pollResult();
    });
  },
  
  // 分段生成PDF笔记
  generateSegmentedNote: (filename, startPage = 1, pageCount = 40, existingNote = '', boardId = null) => {
    console.log(`🚀 分段生成PDF笔记: ${filename}, 起始页: ${startPage}, 页数: ${pageCount}`);
    
    if (!boardId) {
      console.error('❌ 分段生成API需要boardId');
      throw new Error('分段生成API需要boardId');
    }

    const body = {
      board_id: boardId,
      filename: filename,
      start_page: startPage,
      page_count: pageCount,
      existing_note: existingNote
    };

    console.log('🚀 提交分段笔记生成任务:', body);

    // 提交任务
    return apiRequest('/expert/dynamic/generate-segmented-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      console.log('✅ 分段笔记任务已提交:', response);
      
      const task_id = response.task_id;
      const maxPolls = 60; // 最多轮询60次 (约2分钟)
      const pollInterval = 2000; // 轮询间隔2秒
      let pollCount = 0;

      const pollResult = () => {
        return apiRequest(`/expert/dynamic/result/${task_id}`)
          .then(pollResponse => {
            console.log(`📊 分段笔记轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
            
            if (pollResponse.status === 'completed') {
              console.log('✅ 分段笔记生成完成');
              // 解析JSON结果
              try {
                const result = JSON.parse(pollResponse.result);
                return { result: result };
              } catch (e) {
                console.error('解析分段笔记结果失败:', e);
                return { result: { note: pollResponse.result, error: true } };
              }
            } else if (pollResponse.status === 'failed') {
              throw new Error(pollResponse.error || '分段笔记生成失败');
            } else {
              // 仍在处理中
              pollCount++;
              if (pollCount >= maxPolls) {
                throw new Error('分段笔记生成超时');
              }
              
              console.log('⏳ 继续等待分段笔记生成...');
              return new Promise(resolve => 
                setTimeout(() => resolve(pollResult()), pollInterval)
              );
            }
          });
      };

      return pollResult();
    });
  },
  
  // 继续生成PDF笔记
  continueSegmentedNote: (filename, currentNote, nextStartPage, pageCount = 40, boardId = null) => {
    console.log(`🚀 继续生成PDF笔记: ${filename}, 起始页: ${nextStartPage}`);
    
    if (!boardId) {
      console.error('❌ 继续生成API需要boardId');
      throw new Error('继续生成API需要boardId');
    }

    const body = {
      board_id: boardId,
      filename: filename,
      current_note: currentNote,
      next_start_page: nextStartPage,
      page_count: pageCount
    };

    console.log('🚀 提交继续生成笔记任务:', body);

    // 提交任务
    return apiRequest('/expert/dynamic/continue-segmented-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      console.log('✅ 继续生成笔记任务已提交:', response);
      
      const task_id = response.task_id;
      const maxPolls = 60; // 最多轮询60次 (约2分钟)
      const pollInterval = 2000; // 轮询间隔2秒
      let pollCount = 0;

      const pollResult = () => {
        return apiRequest(`/expert/dynamic/result/${task_id}`)
          .then(pollResponse => {
            console.log(`📊 继续生成笔记轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
            
            if (pollResponse.status === 'completed') {
              console.log('✅ 继续生成笔记完成');
              // 解析JSON结果
              try {
                const result = JSON.parse(pollResponse.result);
                return { result: result };
              } catch (e) {
                console.error('解析继续生成笔记结果失败:', e);
                return { result: { note: pollResponse.result, error: true } };
              }
            } else if (pollResponse.status === 'failed') {
              throw new Error(pollResponse.error || '继续生成笔记失败');
            } else {
              // 仍在处理中
              pollCount++;
              if (pollCount >= maxPolls) {
                throw new Error('继续生成笔记超时');
              }
              
              console.log('⏳ 继续等待笔记生成...');
              return new Promise(resolve => 
                setTimeout(() => resolve(pollResult()), pollInterval)
              );
            }
          });
      };

      return pollResult();
    });
  },
  
  // 生成注释 - 使用并发API
  generateAnnotation: (filename, pageNumber, sessionId = null, currentAnnotation = null, improveRequest = null, boardId = null, systemPrompt = null) => {
    console.log(`🚀 使用并发API生成页面注释: ${filename} 第${pageNumber}页`);
    console.log(`🎯 系统提示词:`, systemPrompt);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      return Promise.reject(new Error('并发API需要boardId'));
    }

    // 构建任务信息
    const task_info = {
      type: 'generate_annotation',
      params: {
        filename: filename,
        pageNumber: pageNumber,
        sessionId: sessionId,
        currentAnnotation: currentAnnotation,
        improveRequest: improveRequest,
        systemPrompt: systemPrompt
      }
    };

    const body = {
      board_id: boardId,
      task_info: task_info
    };

    console.log('🚀 提交注释生成任务:', body);

    // 使用并发API提交任务
    return fetch(`${API_BASE_URL}/api/expert/dynamic/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`❌ 并发注释任务提交失败: ${response.status} ${response.statusText}`, text);
          throw new Error(`并发注释任务提交失败: ${response.status} ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    }).then(data => {
      console.log('✅ 并发注释任务已提交:', data);
      
      const taskId = data.task_id;
      
      // 轮询任务结果
      return new Promise((resolve, reject) => {
        const pollInterval = 1500; // 1.5秒轮询一次（注释生成较快）
        const maxPolls = 40; // 最多轮询40次（1分钟）
        let pollCount = 0;

        const pollResult = () => {
          return fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
            .then(response => {
              if (!response.ok) {
                throw new Error(`轮询失败: ${response.status} ${response.statusText}`);
              }
              return response.json();
            })
            .then(pollResponse => {
              console.log(`📊 注释轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
              
              if (pollResponse.status === 'completed') {
                console.log('✅ 注释生成完成');
                return { annotation: pollResponse.result };
              } else if (pollResponse.status === 'failed') {
                throw new Error(pollResponse.error || '注释生成失败');
              } else {
                // 仍在处理中
                pollCount++;
                if (pollCount >= maxPolls) {
                  throw new Error('注释生成超时');
                }
                
                console.log('⏳ 继续等待注释生成...');
                return new Promise(resolve => 
                  setTimeout(() => resolve(pollResult()), pollInterval)
                );
              }
            });
        };

        pollResult().then(resolve).catch(reject);
      });
    });
  },
  
  // 视觉识别注释 - 使用并发API
  generateVisionAnnotation: (filename, pageNumber, sessionId = null, boardId = null) => {
    console.log(`🚀 使用并发API生成视觉识别注释: ${filename} 第${pageNumber}页`);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      return Promise.reject(new Error('并发API需要boardId'));
    }

    // 构建任务信息
    const task_info = {
      type: 'vision_annotation',
      params: {
        filename: filename,
        pageNumber: pageNumber,
        sessionId: sessionId
      }
    };

    const body = {
      board_id: boardId,
      task_info: task_info
    };

    console.log('🚀 提交视觉识别注释任务:', body);

    // 使用并发API提交任务
    return fetch(`${API_BASE_URL}/api/expert/dynamic/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`❌ 并发视觉注释任务提交失败: ${response.status} ${response.statusText}`, text);
          throw new Error(`并发视觉注释任务提交失败: ${response.status} ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    }).then(data => {
      console.log('✅ 并发视觉注释任务已提交:', data);
      
      const taskId = data.task_id;
      
      // 轮询任务结果
      return new Promise((resolve, reject) => {
        const pollInterval = 2000; // 2秒轮询一次（视觉识别较慢）
        const maxPolls = 60; // 最多轮询60次（2分钟）
        let pollCount = 0;

        const pollResult = () => {
          return fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
            .then(response => {
              if (!response.ok) {
                throw new Error(`轮询失败: ${response.status} ${response.statusText}`);
              }
              return response.json();
            })
            .then(pollResponse => {
              console.log(`📊 视觉注释轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
              
              if (pollResponse.status === 'completed') {
                console.log('✅ 视觉注释生成完成');
                return { annotation: pollResponse.result };
              } else if (pollResponse.status === 'failed') {
                throw new Error(pollResponse.error || '视觉注释生成失败');
              } else {
                // 仍在处理中
                pollCount++;
                if (pollCount >= maxPolls) {
                  throw new Error('视觉注释生成超时');
                }
                
                console.log('⏳ 继续等待视觉注释生成...');
                return new Promise(resolve => 
                  setTimeout(() => resolve(pollResult()), pollInterval)
                );
              }
            });
        };

        pollResult().then(resolve).catch(reject);
      });
    });
  },
  
  // 改进笔记 - 使用并发API
  improveNote: (filename, currentNote, improveRequest, boardId = null) => {
    console.log(`🚀 使用并发API改进笔记: ${filename}`);
    console.log(`笔记改进提示: ${improveRequest || '无'}`);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      throw new Error('并发API需要boardId');
    }

    // 构建任务信息
    const task_info = {
      type: 'improve_pdf_note',
      params: {
        filename: filename,
        current_note: currentNote || '',
        improvement_request: improveRequest || '提高质量和可读性'
      }
    };

    const body = {
      board_id: boardId,
      task_info: task_info
    };

    console.log('🚀 提交PDF笔记改进任务:', JSON.stringify(body));

    // 使用并发API提交任务
    return fetch(`${API_BASE_URL}/api/expert/dynamic/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`❌ 并发任务提交失败: ${response.status} ${response.statusText}`, text);
          throw new Error(`并发任务提交失败: ${response.status} ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    }).then(data => {
      console.log('✅ 并发改进任务已提交:', data);
      
      const taskId = data.task_id;
      
      // 轮询任务结果
      return new Promise((resolve, reject) => {
        const pollInterval = 2000; // 2秒轮询一次
        const maxPolls = 60; // 最多轮询60次（2分钟）
        let pollCount = 0;
        
        const poll = () => {
          pollCount++;
          console.log(`🔄 轮询改进任务结果 (${pollCount}/${maxPolls}): ${taskId}`);
          
          // 获取任务结果
          fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
            .then(response => response.json())
            .then(resultData => {
              if (resultData.status === 'completed') {
                console.log('✅ 笔记改进任务完成:', resultData);
                resolve({
                  improved_note: resultData.result
                });
              } else if (resultData.status === 'failed') {
                console.error('❌ 笔记改进任务失败:', resultData);
                reject(new Error(`任务执行失败: ${resultData.error || '未知错误'}`));
              } else {
                // 任务还在进行中
                if (pollCount < maxPolls) {
                  setTimeout(poll, pollInterval);
                } else {
                  reject(new Error('笔记改进任务超时'));
                }
              }
            })
            .catch(error => {
              console.error('❌ 改进任务轮询错误:', error);
              if (pollCount < maxPolls) {
                setTimeout(poll, pollInterval);
              } else {
                reject(error);
              }
            });
        };
        
        // 开始轮询
        setTimeout(poll, pollInterval);
      });
    }).catch(error => {
      console.error('❌ 笔记改进并发API请求错误:', error);
      throw error;
    });
  },
  
  // 完善笔记内容
  improveMaterialNote: (filename, requestData) => {
    console.log(`API请求: 完善笔记内容, 文件名: ${filename}`);
    console.log(`笔记改进提示: ${requestData.improve_prompt || '无'}`);
    if (requestData.board_id) {
      console.log(`使用展板ID: ${requestData.board_id}`);
    }
    
    return apiRequest(`/materials/${filename}/improve-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
  },
  
  // 向PDF提问
  askQuestion: (filename, question) => {
    return apiRequest(`/materials/${filename}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
  },

  // 改进注释 - 使用并发API
  improveAnnotation: (filename, pageNumber, currentAnnotation, improveRequest, sessionId = null, boardId = null) => {
    console.log(`🚀 使用并发API改进页面注释: ${filename} 第${pageNumber}页`);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      return Promise.reject(new Error('并发API需要boardId'));
    }

    // 构建任务信息
    const task_info = {
      type: 'improve_annotation',
      params: {
        filename: filename,
        pageNumber: pageNumber,
        currentAnnotation: currentAnnotation,
        improveRequest: improveRequest,
        sessionId: sessionId
      }
    };

    const body = {
      board_id: boardId,
      task_info: task_info
    };

    console.log('🚀 提交注释改进任务:', body);

    // 使用并发API提交任务
    return fetch(`${API_BASE_URL}/api/expert/dynamic/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`❌ 并发注释改进任务提交失败: ${response.status} ${response.statusText}`, text);
          throw new Error(`并发注释改进任务提交失败: ${response.status} ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    }).then(data => {
      console.log('✅ 并发注释改进任务已提交:', data);
      
      const taskId = data.task_id;
      
      // 轮询任务结果
      return new Promise((resolve, reject) => {
        const pollInterval = 1500; // 1.5秒轮询一次
        const maxPolls = 40; // 最多轮询40次（1分钟）
        let pollCount = 0;

        const pollResult = () => {
          return fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
            .then(response => {
              if (!response.ok) {
                throw new Error(`轮询失败: ${response.status} ${response.statusText}`);
              }
              return response.json();
            })
            .then(pollResponse => {
              console.log(`📊 注释改进轮询结果 ${pollCount + 1}/${maxPolls}:`, pollResponse);
              
              if (pollResponse.status === 'completed') {
                console.log('✅ 注释改进完成');
                return { annotation: pollResponse.result };
              } else if (pollResponse.status === 'failed') {
                throw new Error(pollResponse.error || '注释改进失败');
              } else {
                // 仍在处理中
                pollCount++;
                if (pollCount >= maxPolls) {
                  throw new Error('注释改进超时');
                }
                
                console.log('⏳ 继续等待注释改进...');
                return new Promise(resolve => 
                  setTimeout(() => resolve(pollResult()), pollInterval)
                );
              }
            });
        };

        pollResult().then(resolve).catch(reject);
      });
    });
  },

  // 删除课程文件夹
  deleteCourse: (courseId) => apiRequest(`/courses/${courseId}`, {
    method: 'DELETE'
  }),

  // 删除课程文件
  deleteCourseFile: (fileId) => apiRequest(`/courses/files/${fileId}`, {
    method: 'DELETE'
  }),

  // 删除展板
  deleteBoard: (boardId) => apiRequest(`/api/boards/${boardId}`, {
    method: 'DELETE'
  }),

  // 清理多余的PDF展板文件
  cleanupDuplicatePdfFiles: () => apiRequest('/cleanup/duplicate-pdf-files', {
    method: 'POST'
  }),

  // 重命名课程文件夹
  renameCourse: (courseId, newName) => {
    console.log(`API请求: 重命名课程文件夹, ID: ${courseId}, 新名称: ${newName}`);
    return apiRequest(`/courses/${courseId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName })
    });
  },

  // 重命名课程文件
  renameCourseFile: (fileId, newName) => {
    console.log(`API请求: 重命名课程文件, ID: ${fileId}, 新名称: ${newName}`);
    return apiRequest(`/courses/files/${fileId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName })
    });
  },

  // 获取PDF引用信息
  async getPdfReferences(filename) {
    try {
      const response = await apiRequest(`/api/pdf/${encodeURIComponent(filename)}/references`);
      return response;
    } catch (error) {
      console.error('获取PDF引用失败:', error);
      throw error;
    }
  },

  // 获取并发任务状态
  getConcurrentStatus: (boardId) => {
    return fetch(`${API_BASE_URL}/api/expert/dynamic/concurrent-status/${boardId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取并发状态失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        return data.concurrent_status;
      });
  },

  // 获取任务结果
  getTaskResult: (taskId) => {
    return fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取任务结果失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      });
  },

  // 删除图片文件
  deleteImage: (filename) => {
    console.log(`API请求: 删除图片文件, 文件名: ${filename}`);
    return apiRequest(`/images/${filename}`, {
      method: 'DELETE'
    });
  },

  // 删除视频文件  
  deleteVideo: (filename) => {
    console.log(`API请求: 删除视频文件, 文件名: ${filename}`);
    return apiRequest(`/videos/${filename}`, {
      method: 'DELETE'
    });
  },

};

export default api;