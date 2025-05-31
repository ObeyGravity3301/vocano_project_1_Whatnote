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
    
    return apiRequest('/materials/upload', {
      method: "POST",
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

      // 轮询等待结果
      return new Promise((resolve, reject) => {
        const poll = () => {
          pollCount++;
          console.log(`📊 PDF笔记任务轮询 ${pollCount}/${maxPolls}, 任务ID: ${task_id}`);
          
          apiRequest(`/expert/dynamic/result/${task_id}`, {
            method: 'GET'
          }).then(result => {
            if (result && result.status === 'completed') {
              console.log('✅ PDF笔记生成完成:', result);
              resolve({
                note: result.result || result.data || '无笔记内容', // 优先使用result字段
                session_id: sessionId
              });
            } else if (result && result.status === 'failed') {
              console.error('❌ PDF笔记任务失败:', result);
              reject(new Error(result.error || '任务执行失败'));
            } else if (result && result.status === 'running') {
              // 仍在进行中
              console.log(`⏳ PDF笔记任务进行中... (${pollCount}/${maxPolls})`);
              if (pollCount < maxPolls) {
                setTimeout(poll, pollInterval);
              } else {
                reject(new Error('PDF笔记生成任务超时'));
              }
            } else {
              // 未知状态，可能任务不存在或API错误
              console.warn('📋 任务状态未知:', result);
              if (pollCount < maxPolls) {
                setTimeout(poll, pollInterval);
              } else {
                reject(new Error('PDF笔记生成任务超时或失败'));
              }
            }
          }).catch(error => {
            console.error('❌ PDF笔记轮询错误:', error);
            if (pollCount < maxPolls) {
              setTimeout(poll, pollInterval);
            } else {
              reject(error);
            }
          });
        };
        
        // 立即开始第一次轮询，不延迟
        poll();
      });
    }).catch(error => {
      console.error('❌ PDF笔记并发API请求错误:', error);
      throw error;
    });
  },
  
  // 生成注释 - 使用并发API
  generateAnnotation: (filename, pageNumber, sessionId = null, currentAnnotation = null, improveRequest = null, boardId = null) => {
    console.log(`🚀 使用并发API生成注释: ${filename} 第${pageNumber}页`);
    
    if (!boardId) {
      console.error('❌ 并发API需要boardId');
      throw new Error('并发API需要boardId');
    }

    // 构建任务信息
    const task_info = {
      type: 'generate_annotation',
      params: {
        filename: filename,
        pageNumber: pageNumber,
        sessionId: sessionId,
        currentAnnotation: currentAnnotation,
        improveRequest: improveRequest
      }
    };

    const body = {
      board_id: boardId,
      task_info: task_info
    };

    console.log('📝 提交并发注释任务:', JSON.stringify(body));

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
      console.log('✅ 并发任务已提交:', data);
      
      // 返回任务ID，前端可以用它来轮询结果
      const taskId = data.task_id;
      
      // 轮询任务结果
      return new Promise((resolve, reject) => {
        const pollInterval = 1000; // 1秒轮询一次
        const maxPolls = 60; // 最多轮询60次（60秒）
        let pollCount = 0;
        
        const poll = () => {
          pollCount++;
          console.log(`🔄 轮询任务结果 (${pollCount}/${maxPolls}): ${taskId}`);
          
          // 获取任务结果
          fetch(`${API_BASE_URL}/api/expert/dynamic/result/${taskId}`)
            .then(response => response.json())
            .then(resultData => {
              if (resultData.status === 'completed') {
                console.log('✅ 任务完成:', resultData);
                // 格式化结果以兼容原有接口
                resolve({
                  annotation: resultData.result,
                  session_id: sessionId
                });
              } else if (resultData.status === 'failed') {
                console.error('❌ 任务失败:', resultData);
                reject(new Error(`任务执行失败: ${resultData.error || '未知错误'}`));
              } else {
                // 任务还在进行中
                if (pollCount < maxPolls) {
                  setTimeout(poll, pollInterval);
                } else {
                  reject(new Error('任务超时'));
                }
              }
            })
            .catch(error => {
              console.error('❌ 轮询错误:', error);
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
      console.error('❌ 并发API请求错误:', error);
      throw error;
    });
  },
  
  // 使用视觉模型生成注释
  generateVisionAnnotation: (filename, pageNumber, sessionId = null, currentAnnotation = null, improveRequest = null, boardId = null) => {
    const query = new URLSearchParams();
    if (sessionId) query.append('session_id', sessionId);
    
    // 构建API路径
    const endpoint = `/api/materials/${filename}/pages/${pageNumber}/vision-annotate?${query.toString()}`;
    console.log(`视觉识别注释请求路径: ${endpoint}`);
    
    // 构建请求体
    const body = {};
    
    // 判断是初次视觉识别还是改进已有注释
    const isImproveRequest = currentAnnotation !== null && currentAnnotation.length > 0;
    
    // 根据不同场景添加请求数据
    if (isImproveRequest) {
      // 改进模式 - 传递当前注释和改进请求
      body.current_annotation = currentAnnotation;
      if (improveRequest !== null) {
        body.improve_request = improveRequest;
        console.log(`视觉识别改进模式: 当前注释长度=${currentAnnotation.length}, 改进请求=${improveRequest || '无'}`);
      } else {
        console.log(`视觉识别改进模式: 当前注释长度=${currentAnnotation.length}, 改进请求=无`);
      }
    } else {
      // 初次识别模式 - 不传递当前注释
      console.log(`初次视觉识别模式: 不传递当前注释`);
      // 如果有改进请求但没有当前注释，仍然传递改进请求作为初始指导
      if (improveRequest !== null) {
        body.improve_request = improveRequest;
        console.log(`初次视觉识别的指导提示: ${improveRequest}`);
      }
    }
    
    // 添加展板ID
    if (boardId) {
      body.board_id = boardId;
      console.log(`使用展板ID: ${boardId}`);
    }
    
    // 日志完整请求体，便于调试
    console.log('视觉识别请求体:', JSON.stringify(body));
    
    // 使用直接fetch调用，不再依赖apiRequest自动添加/api前缀
    return fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`API请求失败: ${response.status} ${response.statusText}`, text);
          throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${text}`);
        });
      }
      return response.json();
    }).then(data => {
      console.log('视觉识别注释响应:', data);
      // 将response中的note字段映射到annotation字段，确保前端能正确识别
      if (data && data.note && !data.annotation) {
        data.annotation = data.note;
      }
      return data;
    }).catch(error => {
      console.error('API请求错误:', error);
      throw error;
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

  // 改进注释 - 新增函数
  improveAnnotation: (filename, pageNumber, currentAnnotation, improveRequest, sessionId = null, boardId = null) => {
    console.log(`API请求: 改进注释, 文件: ${filename}, 页码: ${pageNumber}`);
    console.log(`改进提示: ${improveRequest || '无'}`);
    
    const query = new URLSearchParams();
    if (sessionId) query.append('session_id', sessionId);
    
    const endpoint = `/materials/${filename}/pages/${pageNumber}/improve-annotation?${query.toString()}`;
    
    const body = {
      current_annotation: currentAnnotation,
      improve_request: improveRequest,
      board_id: boardId
    };
    
    console.log('改进注释请求体:', JSON.stringify(body));
    
    return apiRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
  deleteBoard: (boardId) => apiRequest(`/boards/${boardId}`, {
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
  }

};

export default api;