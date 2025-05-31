import React, { useState, useEffect } from 'react';
import './TaskStatusIndicator.css';

const TaskStatusIndicator = ({ boardId }) => {
  const [taskStatus, setTaskStatus] = useState({
    active_tasks: 0,
    max_concurrent: 3,
    active_task_ids: [],
    active_task_details: [],
    recently_completed: 0,
    available_slots: 3,
    system_status: 'ready',
    board_id: null
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [taskDetails, setTaskDetails] = useState({});
  const [apiError, setApiError] = useState(false);

  // 获取API基础URL - 确保使用正确的后端端口
  const getApiBaseUrl = () => {
    if (process.env.REACT_APP_BACKEND_URL) {
      return process.env.REACT_APP_BACKEND_URL;
    }
    return window.location.protocol + '//' + window.location.hostname + ':8000';
  };

  // 轮询获取任务状态
  useEffect(() => {
    if (!boardId) return;

    const fetchTaskStatus = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/api/expert/dynamic/concurrent-status/${boardId}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // 从后端响应中提取并发状态，并处理字段映射
          const backendStatus = data.concurrent_status || {};
          
          // 调试日志
          console.log('🔍 状态栏更新:', {
            boardId,
            active_tasks: backendStatus.active_tasks,
            max_concurrent_tasks: backendStatus.max_concurrent_tasks,
            timestamp: new Date().toLocaleTimeString()
          });
          
          setTaskStatus({
            active_tasks: backendStatus.active_tasks || 0,
            max_concurrent: backendStatus.max_concurrent_tasks || 3, // 映射字段名
            active_task_ids: backendStatus.active_task_ids || [],
            active_task_details: backendStatus.active_task_details || [],
            recently_completed: backendStatus.recently_completed || backendStatus.completed_tasks || 0,
            available_slots: backendStatus.available_slots || (backendStatus.max_concurrent_tasks - backendStatus.active_tasks) || 3,
            system_status: backendStatus.system_status || 'ready',
            board_id: backendStatus.board_id
          });
          setApiError(false);
          
          // 不再需要单独获取任务详情，因为后端已经在concurrent_status中提供了
          setTaskDetails({});
        } else {
          console.error('❌ 状态栏API错误:', response.status, response.statusText);
          setApiError(true);
        }
      } catch (error) {
        console.error('❌ 状态栏获取失败:', error);
        setApiError(true);
      }
    };

    // 初始获取
    fetchTaskStatus();
    
    // 定期轮询（每1秒，提高响应性）
    const interval = setInterval(fetchTaskStatus, 1000);
    
    return () => clearInterval(interval);
  }, [boardId]);

  // 获取任务类型的友好名称
  const getTaskTypeName = (taskId) => {
    if (taskId.includes('generate')) return '生成笔记';
    if (taskId.includes('improve')) return '改进笔记';
    if (taskId.includes('question')) return '回答问题';
    if (taskId.includes('image')) return '图像识别';
    return '处理任务';
  };

  // 获取任务运行时间
  const getTaskDuration = (taskDetail) => {
    if (!taskDetail || !taskDetail.started_at) return '未知';
    const duration = taskDetail.duration || 0;
    return `${duration.toFixed(1)}秒`;
  };

  // 获取状态颜色
  const getStatusColor = () => {
    if (apiError) return '#dc3545'; // 红色 - 错误
    if (taskStatus.active_tasks === 0) return '#28a745'; // 绿色 - 空闲
    if (taskStatus.active_tasks < taskStatus.max_concurrent) return '#007bff'; // 蓝色 - 工作中
    return '#ffc107'; // 黄色 - 满负荷
  };

  // 获取状态描述
  const getStatusText = () => {
    if (apiError) return '连接错误';
    if (!boardId) return '无展板';
    if (taskStatus.active_tasks === 0) return '专家LLM空闲';
    return '专家LLM工作中';
  };

  // 获取子状态描述
  const getSubStatusText = () => {
    if (apiError) return '无法连接';
    if (!boardId) return '请选择展板';
    return `${taskStatus.active_tasks}/${taskStatus.max_concurrent} 并发`;
  };

  // 如果没有boardId，显示基本状态
  if (!boardId) {
    return (
      <div className="task-status-indicator">
        <div 
          className="task-indicator-main"
          style={{ borderColor: '#6c757d', opacity: 0.7 }}
        >
          <div className="task-indicator-header">
            <div className="task-indicator-icon">
              <div 
                className="status-dot idle" 
                style={{ backgroundColor: '#6c757d' }}
              />
              <span className="task-count">-</span>
            </div>
            <div className="task-indicator-text">
              <div className="main-text">无活跃展板</div>
              <div className="sub-text">请选择展板</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-status-indicator">
      <div 
        className={`task-indicator-main ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ borderColor: getStatusColor() }}
      >
        <div className="task-indicator-header">
          <div className="task-indicator-icon">
            <div 
              className={`status-dot ${taskStatus.active_tasks === 0 && !apiError ? 'idle' : ''}`}
              style={{ backgroundColor: getStatusColor() }}
              data-error={apiError ? 'true' : 'false'}
            />
            <span 
              className="task-count"
              data-error={apiError ? 'true' : 'false'}
            >
              {apiError ? '!' : taskStatus.active_tasks}
            </span>
          </div>
          <div className="task-indicator-text">
            <div className="main-text">
              {getStatusText()}
            </div>
            <div className="sub-text">
              {getSubStatusText()}
            </div>
          </div>
          <div className="expand-arrow">
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>

        {isExpanded && (
          <div className="task-details">
            {apiError ? (
              <div style={{ 
                padding: '16px', 
                textAlign: 'center', 
                color: '#dc3545' 
              }}>
                <div>⚠️ 无法获取任务状态</div>
                <div style={{ fontSize: '12px', marginTop: '8px' }}>
                  请检查后端服务是否正常运行
                </div>
              </div>
            ) : (
              <>
                <div className="status-summary">
                  <div className="status-item">
                    <span className="label">活跃任务:</span>
                    <span className="value">{taskStatus.active_tasks}</span>
                  </div>
                  <div className="status-item">
                    <span className="label">可用槽位:</span>
                    <span className="value">{taskStatus.available_slots}</span>
                  </div>
                  <div className="status-item">
                    <span className="label">最近完成:</span>
                    <span className="value">{taskStatus.recently_completed}</span>
                  </div>
                  <div className="status-item">
                    <span className="label">展板ID:</span>
                    <span className="value" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                      {boardId || 'N/A'}
                    </span>
                  </div>
                </div>

                {taskStatus.active_tasks > 0 ? (
                  <div className="active-tasks">
                    <div className="section-title">正在进行的任务:</div>
                    {(taskStatus.active_task_details || []).map((taskDetail, index) => {
                      return (
                        <div key={taskDetail.task_id} className="task-item">
                          <div className="task-number">#{index + 1}</div>
                          <div className="task-info">
                            <div className="task-type">
                              {taskDetail.description || '未知任务'}
                            </div>
                            <div className="task-meta">
                              <span className="task-id">{taskDetail.task_id.split('_').pop()}</span>
                              <span className="task-duration">
                                运行: {taskDetail.duration ? `${taskDetail.duration.toFixed(1)}秒` : '未知时长'}
                              </span>
                            </div>
                          </div>
                          <div className="task-status-dot running" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="idle-status">
                    <div className="section-title">系统状态:</div>
                    <div style={{ 
                      padding: '12px', 
                      textAlign: 'center', 
                      color: '#28a745',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}>
                      <div>✅ 专家LLM已就绪</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', color: '#6c757d' }}>
                        等待新的并发任务
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskStatusIndicator; 