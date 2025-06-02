import React, { useState, useEffect, useRef } from 'react';
import './TaskList.css';

const TaskList = ({ boardId, apiClient }) => {
  const [tasks, setTasks] = useState([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting, connected, disconnected, error
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // 清理函数
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // 连接SSE事件流
  useEffect(() => {
    if (!boardId || !mountedRef.current) return;

    console.log(`📻 [TaskList] 连接任务事件流: ${boardId}`);
    
    const connectEventStream = () => {
      try {
        // 关闭之前的连接
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // 创建新的EventSource连接
        const eventSource = new EventSource(`http://localhost:8000/api/expert/dynamic/task-events/${boardId}`);
        eventSourceRef.current = eventSource;
        
        setConnectionStatus('connecting');

        eventSource.onopen = () => {
          if (!mountedRef.current) return;
          console.log(`✅ [TaskList] SSE连接成功: ${boardId}`);
          setConnectionStatus('connected');
        };

        eventSource.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          try {
            const eventData = JSON.parse(event.data);
            console.log(`📨 [TaskList] 收到事件:`, eventData);
            
            switch (eventData.type) {
              case 'task_list_update':
              case 'task_started':
              case 'task_completed':
              case 'task_failed':
              case 'task_progress':
                if (eventData.tasks) {
                  // 处理任务数据，添加显示信息
                  const enhancedTasks = eventData.tasks.map(task => ({
                    id: task.task_id,
                    type: task.task_type,
                    description: task.description || task.display_name || getTaskDisplayName(task.task_type),
                    duration: task.duration || 0,
                    status: task.status || 'running',
                    startTime: task.start_time,
                    displayName: task.display_name || getTaskDisplayName(task.task_type)
                  }));
                  
                  setTasks(enhancedTasks);
                  
                  // 如果有新任务且当前是收起状态，自动展开
                  if (eventData.type === 'task_started' && !isExpanded && enhancedTasks.length > 0) {
                    setIsExpanded(true);
                  }
                }
                break;
              
              case 'heartbeat':
                // 心跳包，保持连接活跃
                console.log(`💓 [TaskList] 心跳: ${boardId}`);
                break;
              
              default:
                console.log(`🔍 [TaskList] 未知事件类型: ${eventData.type}`);
            }
          } catch (error) {
            console.error('📻 [TaskList] 解析事件数据失败:', error, event.data);
          }
        };

        eventSource.onerror = (error) => {
          if (!mountedRef.current) return;
          
          console.error(`❌ [TaskList] SSE连接错误:`, error);
          setConnectionStatus('error');
          
          // 自动重连
          if (eventSource.readyState === EventSource.CLOSED) {
            console.log(`🔄 [TaskList] 3秒后重连: ${boardId}`);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current) {
                connectEventStream();
              }
            }, 3000);
          }
        };

      } catch (error) {
        console.error('📻 [TaskList] 创建EventSource失败:', error);
        setConnectionStatus('error');
      }
    };

    connectEventStream();

    // 清理函数
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [boardId, isExpanded]);

  const getTaskDisplayName = (taskType) => {
    const displayNames = {
      'annotation': '生成注释',
      'improve_annotation': '改进注释',
      'generate_note': '生成笔记',
      'generate_segmented_note': '分段生成笔记',
      'generate_board_note': '生成展板笔记',
      'improve_board_note': '改进展板笔记',
      'answer_question': '回答问题',
      'vision_annotation': '视觉识别注释',
      'general_query': '通用查询'
    };
    return displayNames[taskType] || taskType;
  };

  const getTaskProgressText = (task) => {
    if (task.duration < 5) {
      return '启动中...';
    } else if (task.duration < 15) {
      return '处理中...';
    } else if (task.duration < 30) {
      return '深度分析中...';
    } else {
      return '即将完成...';
    }
  };

  const getTaskIcon = (taskType) => {
    const icons = {
      'annotation': '📝',
      'improve_annotation': '✨',
      'generate_note': '📄',
      'generate_segmented_note': '📋',
      'generate_board_note': '📊',
      'improve_board_note': '🔧',
      'answer_question': '❓',
      'vision_annotation': '👁️',
      'general_query': '🔍'
    };
    return icons[taskType] || '⚙️';
  };

  const formatDuration = (duration) => {
    if (duration < 60) {
      return `${Math.floor(duration)}秒`;
    } else {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      return `${minutes}分${seconds}秒`;
    }
  };

  const getConnectionStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connecting':
        return '🔄';
      case 'connected':
        return '🟢';
      case 'disconnected':
        return '🔴';
      case 'error':
        return '⚠️';
      default:
        return '❓';
    }
  };

  // 如果没有任务，显示空状态
  if (tasks.length === 0) {
    return (
      <div className="task-list-container collapsed task-list-empty">
        <div className="task-list-header task-list-header-empty" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="task-list-title">
            <span className="task-list-icon-empty">💤</span>
            <span>任务监控</span>
            <span className="task-count">(0/5)</span>
          </div>
          <div className="task-list-toggle">
            {getConnectionStatusIndicator()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`task-list-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="task-list-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="task-list-title">
          <span className="task-list-icon">⚡</span>
          <span>正在进行的任务</span>
          <span className="task-count">({tasks.length}/5)</span>
        </div>
        <div className="task-list-toggle">
          {getConnectionStatusIndicator()} {isExpanded ? '🔽' : '▶️'}
        </div>
      </div>

      {isExpanded && (
        <div className="task-list-content">
          {tasks.map(task => (
            <div key={task.id} className="task-item">
              <div className="task-item-header">
                <span className="task-icon">{getTaskIcon(task.type)}</span>
                <span className="task-name">{task.displayName}</span>
                <span className="task-duration">{formatDuration(task.duration)}</span>
              </div>
              <div className="task-item-details">
                <div className="task-description">{task.description}</div>
                <div className="task-progress">{getTaskProgressText(task)}</div>
                <div className="progress-bar">
                  <div className="progress-bar-fill"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskList;