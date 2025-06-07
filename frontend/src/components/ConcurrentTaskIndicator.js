import React, { useState, useEffect } from 'react';
import { Badge, Button, Drawer, List, Progress, Typography, Tag, Tooltip, Spin } from 'antd';
import { RobotOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import api from '../api';
import './ConcurrentTaskIndicator.css';

const { Text, Title } = Typography;

const ConcurrentTaskIndicator = ({ boardId, visible = true }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // 获取并发状态
  const fetchConcurrentStatus = async () => {
    if (!boardId) return;
    
    try {
      setLoading(true);
      const status = await api.getConcurrentStatus(boardId);
      setTaskStatus(status);
    } catch (error) {
      console.error('获取并发状态失败:', error);
      setTaskStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时和boardId变化时获取状态
  useEffect(() => {
    if (boardId && visible) {
      fetchConcurrentStatus();
      
      // 设置定时刷新（只有在有活跃任务时才频繁刷新）
      const interval = setInterval(async () => {
        if (taskStatus && taskStatus.active_tasks > 0) {
          await fetchConcurrentStatus();
        }
      }, 2000); // 2秒刷新一次
      
      setRefreshInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [boardId, visible, taskStatus?.active_tasks]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);

  // 获取任务类型的显示文本
  const getTaskTypeDisplay = (taskType) => {
    const typeMap = {
      'annotation': '页面注释',
      'generate_annotation': '页面注释',
      'improve_annotation': '注释改进',
      'vision_annotation': '视觉识别',
      'generate_note': 'PDF笔记',
      'generate_segmented_note': '分段笔记',
      'generate_board_note': '展板笔记',
      'improve_board_note': '展板笔记改进',
      'answer_question': '专家问答'
    };
    return typeMap[taskType] || taskType;
  };

  // 格式化持续时间
  const formatDuration = (seconds) => {
    if (seconds < 60) {
      return `${Math.floor(seconds)}秒`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}分${Math.floor(seconds % 60)}秒`;
    } else {
      return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
    }
  };

  // 获取任务状态图标
  const getTaskStatusIcon = (task) => {
    return <LoadingOutlined style={{ color: '#1890ff' }} />;
  };

  // 获取任务进度
  const getTaskProgress = (task) => {
    // 基于持续时间估算进度
    const duration = task.duration || 0;
    const taskType = task.task_type;
    
    // 不同任务类型的预估完成时间（秒）
    const estimatedTimes = {
      'annotation': 20,
      'generate_annotation': 20,
      'improve_annotation': 15,
      'vision_annotation': 45,
      'generate_note': 120,
      'generate_segmented_note': 80,
      'generate_board_note': 60,
      'answer_question': 30
    };
    
    const estimatedTime = estimatedTimes[taskType] || 30;
    const progress = Math.min((duration / estimatedTime) * 100, 95); // 最高显示95%
    
    return Math.floor(progress);
  };

  if (!visible || !boardId) return null;

  const hasActiveTasks = taskStatus && taskStatus.active_tasks > 0;
  const activeTasks = taskStatus?.active_task_details || [];

  return (
    <>
      {/* 浮动指示器按钮 */}
      <div className="concurrent-task-indicator">
        <Tooltip
          title={
            hasActiveTasks 
              ? `${taskStatus.active_tasks}个任务正在后台运行` 
              : '无后台任务'
          }
        >
          <Badge 
            count={hasActiveTasks ? taskStatus.active_tasks : 0} 
            size="small"
            showZero={false}
          >
            <Button
              type="primary"
              shape="circle"
              icon={loading ? <LoadingOutlined /> : <RobotOutlined />}
              onClick={() => setDrawerVisible(true)}
              className={hasActiveTasks ? 'has-active-tasks' : ''}
              size="large"
            />
          </Badge>
        </Tooltip>
      </div>

      {/* 任务详情抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined />
            <span>后台任务状态</span>
            {loading && <Spin size="small" />}
          </div>
        }
        placement="right"
        width={400}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={
          <Button 
            size="small" 
            onClick={fetchConcurrentStatus}
            loading={loading}
          >
            刷新
          </Button>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            展板ID: {boardId} | 
            活跃任务: {taskStatus?.active_tasks || 0} | 
            可用槽位: {taskStatus?.available_slots || 0}
          </Text>
        </div>

        {!hasActiveTasks ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            <CheckCircleOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <div>当前没有正在运行的后台任务</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              在展板中进行LLM操作时，任务会在这里显示
            </div>
          </div>
        ) : (
          <List
            dataSource={activeTasks}
            renderItem={(task) => (
              <List.Item
                key={task.task_id}
                style={{ padding: '12px 0' }}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getTaskStatusIcon(task)}
                      <Text strong>{getTaskTypeDisplay(task.task_type)}</Text>
                    </div>
                    <Tag color="processing">{formatDuration(task.duration)}</Tag>
                  </div>
                  
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {task.description || task.task_id}
                    </Text>
                  </div>
                  
                  <Progress
                    percent={getTaskProgress(task)}
                    size="small"
                    status="active"
                    showInfo={false}
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068',
                    }}
                  />
                </div>
              </List.Item>
            )}
          />
        )}

        <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: 4 }}>
          <Text style={{ fontSize: 12, color: '#666' }}>
            💡 后台任务允许您在LLM生成过程中自由切换展板和执行其他操作，无需等待
          </Text>
        </div>
      </Drawer>
    </>
  );
};

export default ConcurrentTaskIndicator; 