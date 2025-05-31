import React, { useState, useEffect } from 'react';
import { Card, Table, Input, Button, Select, DatePicker, Space, Tag, Drawer, Typography, message, Spin } from 'antd';
import { SearchOutlined, DownloadOutlined, DeleteOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveAs } from 'file-saver';
import MarkdownMathRenderer from './MarkdownMathRenderer';
import './NoteWindow.css';
import api from '../api';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title, Paragraph } = Typography;

/**
 * LLM调试面板组件
 * 
 * 用于记录、查看、过滤和导出LLM交互日志
 */
const LLMDebugPanel = () => {
  // 状态管理
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState({
    llm_type: 'all',
    keyword: '',
    time_range: null,
  });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentLog, setCurrentLog] = useState(null);
  const [sortOrder, setSortOrder] = useState('descend'); // 默认按时间降序排列

  // 初始加载和监听LLM交互事件
  useEffect(() => {
    // 获取初始日志数据
    fetchLogs();

    // 监听LLM交互事件
    const handleLLMInteraction = (event) => {
      console.log('收到LLM交互日志:', event.detail);
      // 如果监听到新的交互，主动刷新日志
      setTimeout(() => fetchLogs(), 500);
    };

    window.addEventListener('llm-interaction', handleLLMInteraction);

    // 清理函数
    return () => {
      window.removeEventListener('llm-interaction', handleLLMInteraction);
    };
  }, []);

  // 当过滤条件或分页变化时重新获取日志
  useEffect(() => {
    fetchLogs();
  }, [filter, currentPage, pageSize, sortOrder]);

  // 获取日志数据
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        llm_type: filter.llm_type,
        keyword: filter.keyword,
        time_range: filter.time_range,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      };
      
      const data = await api.getLLMLogs(params);
      
      setLogs(data.records);
      setTotal(data.total);
    } catch (error) {
      console.error('获取LLM日志失败:', error);
      message.error(`获取日志失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 清空所有日志
  const clearLogs = async () => {
    if (!window.confirm('确定要清空所有日志吗？此操作不可撤销！')) {
      return;
    }

    setLoading(true);
    try {
      const result = await api.clearLLMLogs();
      
      if (result.status === 'success') {
        message.success('日志已清空');
        setLogs([]);
        setTotal(0);
      } else {
        message.warning(result.message || '没有日志需要清空');
      }
    } catch (error) {
      console.error('清空日志失败:', error);
      message.error(`清空日志失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 导出所有日志
  const exportLogs = async () => {
    setLoading(true);
    try {
      // 准备导出参数
      const exportParams = {
        llm_type: filter.llm_type,
        keyword: filter.keyword,
        time_range: filter.time_range,
        limit: 1000, // 最多导出1000条记录
        offset: 0,
      };
      
      // 使用API导出日志
      const data = await api.getLLMLogs(exportParams);
      const logRecords = data.records;

      // 转换为JSONL格式
      const jsonlContent = logRecords.map(log => JSON.stringify(log)).join('\n');
      
      // 使用file-saver保存文件
      const blob = new Blob([jsonlContent], { type: 'application/x-jsonlines' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveAs(blob, `llm-logs-${timestamp}.jsonl`);
      
      message.success(`已导出 ${logRecords.length} 条日志记录`);
    } catch (error) {
      console.error('导出日志失败:', error);
      message.error(`导出日志失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      ellipsis: true,
      render: (text) => <Text ellipsis>{text ? text.substring(0, 8) : 'N/A'}</Text>,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (text) => text ? new Date(text).toLocaleString() : 'N/A',
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      sortOrder: sortOrder,
    },
    {
      title: 'LLM类型',
      dataIndex: 'llmType',
      key: 'llmType',
      width: 120,
      render: (text, record) => {
        // 处理旧格式（llm_type）或未定义的情况
        const llmType = text || 'unknown';
        const requestType = record.metadata?.requestType || 
                           record.metadata?.operation || 
                           (record.metadata?.streaming ? 'stream' : 'normal');
        
        return (
          <div>
            <Tag color={llmType === 'expert' ? 'blue' : 'green'}>
              {llmType === 'expert' ? '专家LLM' : '管家LLM'}
            </Tag>
            <br />
            <Tag size="small" color={
              requestType === 'stream' ? 'orange' : 
              requestType === 'vision' ? 'purple' : 
              requestType === 'improve_annotation' ? 'cyan' :
              requestType === 'vision_annotation' ? 'magenta' :
              requestType === 'intelligent' ? 'blue' :
              'default'
            }>
              {requestType === 'stream' ? '流式' :
               requestType === 'vision' ? '图像' :
               requestType === 'improve_annotation' ? '改进' :
               requestType === 'vision_annotation' ? '视觉识别' :
               requestType === 'intelligent' ? '智能' :
               requestType === 'normal' ? '普通' :
               requestType || '未知'}
            </Tag>
          </div>
        );
      },
    },
    {
      title: '查询',
      dataIndex: 'query',
      key: 'query',
      ellipsis: true,
      render: (text) => <Text ellipsis>{text || 'N/A'}</Text>,
    },
    {
      title: '回复',
      dataIndex: 'response',
      key: 'response',
      ellipsis: true,
      render: (text) => <Text ellipsis>{text || 'N/A'}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button 
          type="link" 
          onClick={() => { 
            setCurrentLog(record);
            setDrawerVisible(true);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  // 渲染搜索和过滤区域
  const renderFilterSection = () => (
    <Space style={{ marginBottom: 16 }} wrap>
      <Input
        placeholder="搜索关键词"
        value={filter.keyword}
        onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
        style={{ width: 200 }}
        prefix={<SearchOutlined />}
        allowClear
        onPressEnter={() => fetchLogs()}
      />
      <Select
        value={filter.llm_type}
        onChange={(value) => setFilter({ ...filter, llm_type: value })}
        style={{ width: 150 }}
      >
        <Option value="all">所有LLM类型</Option>
        <Option value="butler">管家LLM</Option>
        <Option value="expert">专家LLM</Option>
      </Select>
      <RangePicker
        onChange={(dates) => {
          if (dates) {
            setFilter({
              ...filter,
              time_range: [dates[0].toISOString(), dates[1].toISOString()],
            });
          } else {
            setFilter({ ...filter, time_range: null });
          }
        }}
      />
      <Button type="primary" onClick={() => fetchLogs()}>
        搜索
      </Button>
      <Button icon={<ReloadOutlined />} onClick={() => {
        setFilter({ llm_type: 'all', keyword: '', time_range: null });
        setCurrentPage(1);
      }}>
        重置筛选
      </Button>
    </Space>
  );

  // 渲染操作按钮区域
  const renderActionButtons = () => (
    <Space style={{ marginBottom: 16 }}>
      <Button 
        type="primary" 
        icon={<DownloadOutlined />} 
        onClick={exportLogs}
        disabled={logs.length === 0}
      >
        导出日志
      </Button>
      <Button 
        danger 
        icon={<DeleteOutlined />} 
        onClick={clearLogs}
        disabled={logs.length === 0}
      >
        清空日志
      </Button>
      <Button 
        icon={<ReloadOutlined />} 
        onClick={() => fetchLogs()}
      >
        刷新
      </Button>
    </Space>
  );

  // 渲染日志详情
  const renderLogDetails = () => {
    if (!currentLog) return null;

    return (
      <Drawer
        title="LLM交互详情"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={600}
      >
        <Spin spinning={!currentLog}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Card title="基本信息" size="small">
              <p><Text strong>ID:</Text> {currentLog.id || 'N/A'}</p>
              <p><Text strong>时间:</Text> {currentLog.timestamp ? new Date(currentLog.timestamp).toLocaleString() : 'N/A'}</p>
              <p>
                <Text strong>LLM类型:</Text> 
                <Tag color={currentLog.llmType === 'expert' ? 'blue' : 'green'} style={{ marginLeft: 8 }}>
                  {currentLog.llmType === 'expert' ? '专家LLM' : currentLog.llmType ? '管家LLM' : '未知'}
                </Tag>
              </p>
            </Card>
            
            <Card title="用户输入" size="small">
              <Paragraph
                ellipsis={{ rows: 5, expandable: true, symbol: '更多' }}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {currentLog.query || 'N/A'}
              </Paragraph>
            </Card>
            
            {currentLog.requestBody && (
              <Card title="请求体详情" size="small">
                <pre style={{ 
                  background: '#f6f8fa', 
                  padding: '12px', 
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflow: 'auto',
                  fontSize: '12px'
                }}>
                  {typeof currentLog.requestBody === 'string' ? 
                    currentLog.requestBody : 
                    JSON.stringify(currentLog.requestBody, null, 2)
                  }
                </pre>
              </Card>
            )}
            
            <Card title="LLM回复" size="small">
              <div style={{ marginTop: '8px' }}>
                <strong>响应: </strong>
                <div className="debug-log-response">
                  <MarkdownMathRenderer>{typeof (currentLog.fullResponse || currentLog.response) === 'string' ? (currentLog.fullResponse || currentLog.response || 'N/A') : String(currentLog.fullResponse || currentLog.response || 'N/A')}</MarkdownMathRenderer>
                </div>
              </div>
            </Card>
            
            {currentLog.command && (
              <Card title="执行命令" size="small">
                <pre style={{ 
                  background: '#f6f8fa', 
                  padding: '12px', 
                  borderRadius: '4px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(currentLog.command, null, 2)}
                </pre>
              </Card>
            )}
            
            {currentLog.metadata && Object.keys(currentLog.metadata).length > 0 && (
              <Card title="元数据" size="small">
                <pre style={{ 
                  background: '#f6f8fa', 
                  padding: '12px', 
                  borderRadius: '4px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(currentLog.metadata, null, 2)}
                </pre>
              </Card>
            )}
          </Space>
        </Spin>
      </Drawer>
    );
  };

  return (
    <Card 
      title={
        <Space>
          <InfoCircleOutlined />
          <span>LLM交互调试面板</span>
          <Tag color="blue">{total} 条记录</Tag>
        </Space>
      } 
      style={{ width: '100%' }}
    >
      {renderFilterSection()}
      {renderActionButtons()}
      
      <Table
        columns={columns}
        dataSource={logs}
        rowKey={(record, index) => record.id || `log-${index}`}
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) => {
            setCurrentPage(page);
            setPageSize(pageSize);
          },
        }}
        onChange={(pagination, filters, sorter) => {
          if (sorter.order) {
            setSortOrder(sorter.order);
          }
        }}
      />
      
      {renderLogDetails()}
    </Card>
  );
};

export default LLMDebugPanel; 