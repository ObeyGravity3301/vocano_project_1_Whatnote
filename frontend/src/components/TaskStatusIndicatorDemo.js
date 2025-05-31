import React, { useState } from 'react';
import { Button, Space, Card, Switch, Divider } from 'antd';
import TaskStatusIndicator from './TaskStatusIndicator';

const TaskStatusIndicatorDemo = () => {
  const [boardId, setBoardId] = useState('demo-board-123');
  const [showIndicator, setShowIndicator] = useState(true);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Card title="TaskStatusIndicator 演示" bordered={false}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <h3>功能说明：</h3>
            <p>TaskStatusIndicator 现在会始终显示在界面右下角，即使没有任务时也会显示空闲状态。</p>
            
            <h4>状态类型：</h4>
            <ul>
              <li><strong>空闲状态</strong>：绿色圆点，慢速脉冲动画，显示"专家LLM空闲"</li>
              <li><strong>工作状态</strong>：蓝色圆点，快速脉冲动画，显示"专家LLM工作中"</li>
              <li><strong>满负荷状态</strong>：黄色圆点，显示达到最大并发数</li>
              <li><strong>错误状态</strong>：红色圆点，带感叹号，显示"连接错误"</li>
              <li><strong>无展板状态</strong>：灰色圆点，显示"无活跃展板"</li>
            </ul>
          </div>

          <Divider />

          <div>
            <h3>控制面板：</h3>
            <Space wrap>
              <div>
                <span>显示指示器：</span>
                <Switch 
                  checked={showIndicator} 
                  onChange={setShowIndicator}
                  style={{ marginLeft: '8px' }}
                />
              </div>
              
              <Button 
                onClick={() => setBoardId('demo-board-123')}
                type={boardId === 'demo-board-123' ? 'primary' : 'default'}
              >
                设置展板ID
              </Button>
              
              <Button 
                onClick={() => setBoardId(null)}
                type={boardId === null ? 'primary' : 'default'}
              >
                清除展板ID
              </Button>
            </Space>
          </div>

          <div>
            <p><strong>当前展板ID：</strong> {boardId || '无'}</p>
            <p><strong>指示器显示：</strong> {showIndicator ? '开启' : '关闭'}</p>
          </div>

          <div style={{ 
            background: '#f5f5f5', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid #d9d9d9'
          }}>
            <h4>使用说明：</h4>
            <ol>
              <li>指示器固定显示在页面右下角</li>
              <li>点击指示器可以展开/收起详细信息</li>
              <li>即使没有并发任务，也会显示空闲状态</li>
              <li>不同状态有不同的颜色和动画效果</li>
              <li>展开时可以查看展板信息、任务统计等详细信息</li>
            </ol>
          </div>

          <div style={{ 
            background: '#e6f7ff', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid #91d5ff'
          }}>
            <h4>💡 提示：</h4>
            <p>查看页面右下角的TaskStatusIndicator！它现在会始终显示，方便您随时了解系统状态。</p>
          </div>
        </Space>
      </Card>

      {/* 实际的TaskStatusIndicator组件 */}
      {showIndicator && <TaskStatusIndicator boardId={boardId} />}
    </div>
  );
};

export default TaskStatusIndicatorDemo; 