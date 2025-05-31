import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Button, Spin, Typography, message, Card, Tag, Empty, List, Collapse, Modal, Avatar, Space, Divider, Badge, Tooltip } from 'antd';
import { SendOutlined, GlobalOutlined, HomeOutlined, FilePdfOutlined, 
         AppstoreOutlined, FileTextOutlined, RobotOutlined, SyncOutlined, UserOutlined, LoadingOutlined, InfoCircleOutlined, CloseOutlined, ClearOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MarkdownMathRenderer from './MarkdownMathRenderer';
import './NoteWindow.css';
import api from '../api'; // 导入API客户端

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

/**
 * 管家LLM交互面板
 * 
 * 用于与管家LLM进行交互，处理全局操作和多展板协调
 */
const ButlerPanel = ({ onAction }) => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appState, setAppState] = useState(null);
  const [loadingState, setLoadingState] = useState(false);
  const messagesEndRef = useRef(null);
  const [commandConfirmVisible, setCommandConfirmVisible] = useState(false);
  const [currentCommand, setCurrentCommand] = useState(null);
  const [commandExecutionStatus, setCommandExecutionStatus] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingMessageIndex, setStreamingMessageIndex] = useState(null);
  const [streamSocket, setStreamSocket] = useState(null);

  // 对话历史的本地存储键
  const BUTLER_HISTORY_KEY = 'whatnote-butler-history';

  // 从localStorage加载对话历史
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(BUTLER_HISTORY_KEY);
      if (savedHistory) {
        const history = JSON.parse(savedHistory);
        setMessages(history);
      } else {
        // 首次使用时添加欢迎消息
        setMessages([
          {
            role: 'assistant',
            content: "欢迎使用WhatNote管家助手。我可以帮助您管理文件结构、协调各展板内容、执行复杂任务等。请问有什么我可以帮助您的？"
          }
        ]);
      }
    } catch (error) {
      console.error('加载管家对话历史失败:', error);
      // 出错时使用默认欢迎消息
      setMessages([
        {
          role: 'assistant',
          content: "欢迎使用WhatNote管家助手。我可以帮助您管理文件结构、协调各展板内容、执行复杂任务等。请问有什么我可以帮助您的？"
        }
      ]);
    }
    
    // 获取应用状态
    fetchAppState();
    
    // 设置定时刷新，每30秒刷新一次应用状态
    const refreshInterval = setInterval(() => {
      fetchAppState();
    }, 30000);
    
    // 清理函数，组件卸载时清除定时器
    return () => clearInterval(refreshInterval);
  }, []);

  // 保存对话历史到localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(BUTLER_HISTORY_KEY, JSON.stringify(messages));
      } catch (error) {
        console.error('保存管家对话历史失败:', error);
      }
    }
  }, [messages]);

  // 获取应用状态
  const fetchAppState = async () => {
    setLoadingState(true);
    
    try {
      // 使用API客户端获取应用状态
      const data = await api.getAppState();
      
      // 保存到本地以支持离线模式
      try {
        localStorage.setItem('whatnote-last-app-state', JSON.stringify(data));
      } catch (storageError) {
        console.warn('无法缓存应用状态:', storageError);
      }
      
      // 更新状态
      setAppState(data);
      return data;
    } catch (error) {
      console.error('获取应用状态错误:', error);
      
      // 检查是否是连接问题（服务器未启动）
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message.error('无法连接到后端服务器，请确保后端服务已启动');
        
        // 启用离线模式 - 使用本地存储的最后已知状态
        const lastKnownState = localStorage.getItem('whatnote-last-app-state');
        if (lastKnownState) {
          try {
            const parsedState = JSON.parse(lastKnownState);
            setAppState(parsedState);
            message.warning('使用本地缓存的应用状态（离线模式）');
            return parsedState;
          } catch (parseError) {
            console.error('解析缓存状态失败:', parseError);
          }
        }
        
        // 如果没有缓存或解析失败，使用空状态
        const emptyState = { 
          course_folders: [], 
          boards: [] 
        };
        setAppState(emptyState);
        return emptyState;
      } else {
        message.error(`获取应用状态失败: ${error.message}`);
      }
      
      // 返回空状态
      return { course_folders: [], boards: [] };
    } finally {
      setLoadingState(false);
    }
  };

  // 获取展板列表
  const fetchBoards = async () => {
    try {
      // 使用API客户端获取展板列表
      return await api.getBoards();
    } catch (error) {
      console.error('获取展板列表错误:', error);
      return [];
    }
  };

  // 获取PDF列表 - 可以根据实际API进行调整
  const fetchPDFs = async () => {
    try {
      // 由于没有专门的PDF列表API，使用应用状态中的PDF数据
      // 如果有专门的PDF列表API，可以替换为对应的实现
      const response = await fetch('/api/app-state');
      if (!response.ok) throw new Error('获取PDF列表失败');
      
      const data = await response.json();
      return data.pdfs || [];
    } catch (error) {
      console.error('获取PDF列表错误:', error);
      return [];
    }
  };

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 关闭WebSocket连接函数
  const closeStreamSocket = () => {
    if (streamSocket) {
      streamSocket.close();
      setStreamSocket(null);
    }
  };
  
  // 清理WebSocket连接
  useEffect(() => {
    return () => closeStreamSocket();
  }, []);

  // 发送消息到管家LLM - 流式输出版本
  const sendMessage = async () => {
    if (!userInput.trim()) return;
    
    // 关闭之前的WebSocket连接
    closeStreamSocket();
    
    // 添加用户消息到列表
    const newMessages = [
      ...messages,
      { role: 'user', content: userInput }
    ];
    
    // 添加一个占位的助手消息，用于流式输出
    const updatedMessages = [
      ...newMessages,
      { role: 'assistant', content: '' }
    ];
    
    setMessages(updatedMessages);
    setStreamingMessageIndex(updatedMessages.length - 1);
    setUserInput('');
    setStreaming(true);
    
    try {
      // 准备应用状态日志
      const statusLog = JSON.stringify({
        boards: appState?.boards || [],
        pdfs: appState?.pdfs || [],
        commandStatus: commandExecutionStatus,
      });
      
      // 创建WebSocket连接
      const socket = new WebSocket(`ws://${window.location.host}/api/assistant/stream`);
      setStreamSocket(socket);
      
      // 处理WebSocket事件
      socket.onopen = () => {
        // 发送查询数据
        socket.send(JSON.stringify({
          query: userInput,
          status_log: statusLog,
          history: messages.slice(-5)  // 只发送最近5条消息作为历史上下文
        }));
      };
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // 处理流式块
        if (data.chunk) {
          setMessages(prev => {
            const updated = [...prev];
            updated[streamingMessageIndex].content += data.chunk;
            return updated;
          });
        }
        
        // 处理完成信号
        if (data.done) {
          // 记录交互日志
          const interactionLog = {
            id: `butler-stream-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'butler',
            query: userInput,
            response: data.full_response,
            fullResponse: data.full_response,
            command: data.command,
            metadata: {
              historyLength: messages.length,
              statusSize: statusLog.length,
              isStreaming: true
            }
          };
          
          // 分发交互日志事件
          const logEvent = new CustomEvent('llm-interaction', {
            detail: interactionLog
          });
          window.dispatchEvent(logEvent);
          
          // 如果返回了命令，执行它
          if (data.command) {
            // 清除之前的命令状态
            setCommandExecutionStatus(null);
            
            console.log('收到命令:', data.command);
            
            // 设置当前命令并显示确认对话框
            setCurrentCommand(data.command);
            setCommandConfirmVisible(true);
          }
          
          // 清理流式状态
          setStreaming(false);
          setStreamingMessageIndex(null);
          closeStreamSocket();
        }
        
        // 处理错误
        if (data.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[streamingMessageIndex].content = `错误: ${data.error}`;
            return updated;
          });
          
          message.error(`管家LLM错误: ${data.error}`);
          setStreaming(false);
          setStreamingMessageIndex(null);
          closeStreamSocket();
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket错误:', error);
        message.error('连接错误，请稍后重试');
        
        setMessages(prev => {
          const updated = [...prev];
          updated[streamingMessageIndex].content = '连接错误，请稍后重试';
          return updated;
        });
        
        setStreaming(false);
        setStreamingMessageIndex(null);
      };
      
      socket.onclose = () => {
        console.log('WebSocket连接已关闭');
      };
      
    } catch (error) {
      console.error('发送消息错误:', error);
      message.error('发送消息失败');
      
      // 更新错误消息
      setMessages(prev => {
        const updated = [...prev];
        updated[streamingMessageIndex].content = `发送消息失败: ${error.message}`;
        return updated;
      });
      
      setStreaming(false);
      setStreamingMessageIndex(null);
    }
  };

  // 执行管家LLM返回的命令
  const executeCommand = (command) => {
    console.log('准备执行命令:', command);
    
    // 显示命令确认对话框
    setCurrentCommand(command);
    setCommandConfirmVisible(true);
    
    // 返回一个Promise对象，允许调用者等待命令的执行结果
    return new Promise((resolve, reject) => {
      // 保存resolve和reject引用，以便在confirmExecuteCommand和cancelExecuteCommand中使用
      command._resolvePromise = resolve;
      command._rejectPromise = reject;
    });
  };
  
  // 确认执行命令
  const confirmExecuteCommand = () => {
    if (!currentCommand) return;
    
    console.log('执行命令:', currentCommand);
    setCommandConfirmVisible(false);
    
    // 设置执行状态为处理中
    setCommandExecutionStatus('processing');
    
    // 实际执行命令
    if (onAction) {
      onAction(currentCommand)
        .then(result => {
          console.log('命令执行成功:', result);
          
          // 更新命令执行状态
          setCommandExecutionStatus({
            success: true,
            message: result.message || '命令执行成功',
            data: result.data
          });
          
          // 添加成功消息到对话
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ 命令执行成功: ${currentCommand.type}/${currentCommand.action}\n${result.message || ''}`
          }]);
          
          // 立即验证命令执行结果
          verifyCommandExecution(currentCommand);
          
          // 立即获取最新应用状态 - 执行2次刷新，确保UI正确更新
          // 第一次立即刷新
          fetchAppState().then(newState => {
            // 成功后存储最新应用状态到本地存储
            if (newState) {
              localStorage.setItem('whatnote-last-app-state', JSON.stringify(newState));
            }
            
            // 延迟2秒后再次刷新，确保后端处理完毕
            setTimeout(() => {
              fetchAppState();
              
              // 触发全局刷新事件，通知CourseExplorer刷新
              const refreshEvent = new CustomEvent('whatnote-refresh-courses');
              window.dispatchEvent(refreshEvent);
              
              // 如果是多步操作中的一步，请求LLM继续执行下一步
              if (currentCommand.metadata && currentCommand.metadata.isMultiStep) {
                // 添加提示消息
                setMessages(prev => [...prev, {
                  role: 'system',
                  content: '继续执行下一步操作...',
                  meta: { isStatus: true }
                }]);
                
                // 自动发送询问下一步操作的消息
                setTimeout(() => {
                  const nextStepRequest = "请继续执行下一步操作";
                  setMessages(prev => [...prev, { role: 'user', content: nextStepRequest }]);
                  
                  // 记录开始查询时间
                  const queryStartTime = new Date();
                  
                  // 调用API
                  fetch('/api/assistant', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      query: nextStepRequest,
                      status_log: JSON.stringify({
                        boards: appState?.boards || [],
                        pdfs: appState?.pdfs || [],
                        commandStatus: {
                          success: true,
                          message: `已完成操作: ${currentCommand.type}/${currentCommand.action}`,
                          previousCommand: currentCommand,
                          requiresNextStep: true
                        },
                      }),
                      history: messages.slice(-10)  // 发送最近10条消息作为历史上下文
                    }),
                  })
                  .then(response => {
                    if (!response.ok) throw new Error('发送消息失败');
                    return response.json();
                  })
                  .then(data => {
                    // 记录查询结束时间
                    const queryEndTime = new Date();
                    const queryDuration = queryEndTime - queryStartTime;
                    
                    // 记录LLM交互日志
                    const interactionLog = {
                      id: `butler-${Date.now()}`,
                      timestamp: new Date().toISOString(),
                      llmType: 'butler',
                      query: nextStepRequest,
                      response: data.response,
                      fullResponse: data.response,
                      command: data.command,
                      metadata: {
                        duration: queryDuration,
                        isAutoFollowUp: true,
                      }
                    };
                    
                    // 分发日志事件
                    const logEvent = new CustomEvent('llm-interaction', {
                      detail: interactionLog
                    });
                    window.dispatchEvent(logEvent);
                    
                    // 添加助手回复
                    setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
                    
                    // 如果返回了命令，自动准备执行
                    if (data.command) {
                      // 自动设置命令为当前命令
                      setCurrentCommand({
                        ...data.command,
                        metadata: {
                          ...data.command.metadata,
                          isMultiStep: true
                        }
                      });
                      
                      // 显示命令确认对话框
                      setCommandConfirmVisible(true);
                    }
                  })
                  .catch(error => {
                    console.error('多步操作获取下一步错误:', error);
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `抱歉，获取下一步操作时发生了错误: ${error.message}`
                    }]);
                  });
                }, 1000);
              }
            }, 2000);
          });
          
          // 解析Promise
          if (currentCommand._resolvePromise) {
            currentCommand._resolvePromise(result);
          }
        })
        .catch(error => {
          console.error('命令执行失败:', error);
          
          // 更新命令执行状态
          setCommandExecutionStatus({
            success: false,
            message: error.message || '命令执行失败'
          });
          
          // 添加失败消息到对话
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `❌ 命令执行失败: ${currentCommand.type}/${currentCommand.action}\n${error.message || '未知错误'}`
          }]);
          
          // 获取最新应用状态
          fetchAppState();
          
          // 拒绝Promise
          if (currentCommand._rejectPromise) {
            currentCommand._rejectPromise(error);
          }
        });
    }
  };
  
  // 取消执行命令
  const cancelExecuteCommand = () => {
    setCommandConfirmVisible(false);
    
    // 添加取消消息
    setMessages(prev => [...prev, {
      role: 'system',
      content: '❗ 用户取消了命令执行',
      meta: { isStatus: true }
    }]);
    
    // 拒绝原始Promise
    if (currentCommand && currentCommand._rejectPromise) {
      currentCommand._rejectPromise(new Error('用户取消了命令执行'));
    }
    
    setCurrentCommand(null);
  };
  
  // 验证命令执行结果
  const verifyCommandExecution = async (command) => {
    // 根据命令类型设置不同的验证策略
    switch (command.type) {
      case 'file_operation':
        await verifyFileOperation(command);
        break;
      case 'board_operation':
        await verifyBoardOperation(command);
        break;
      // 其他操作类型的验证...
      default:
        console.log('无法验证未知类型的命令:', command.type);
    }
    
    // 刷新应用状态以获取最新数据
    fetchAppState();
  };
  
  // 验证文件操作
  const verifyFileOperation = async (command) => {
    // 实现文件操作验证逻辑
    if (command.action === 'create_course_folder') {
      try {
        // 检查文件夹是否已创建
        const response = await fetch(`/api/course-folders/${command.params.folder_name}/exists`);
        
        if (response.ok) {
          const { exists } = await response.json();
          
          if (exists) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `已验证课程文件夹"${command.params.folder_name}"创建成功。您可以继续操作了。`
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `警告：未找到课程文件夹"${command.params.folder_name}"，可能创建失败。请检查系统状态或重试。`
            }]);
          }
        }
      } catch (error) {
        console.error('验证文件操作错误:', error);
      }
    }
  };
  
  // 验证展板操作
  const verifyBoardOperation = async (command) => {
    // 实现展板操作验证逻辑
    if (command.action === 'create_board') {
      try {
        // 检查展板是否已创建
        const response = await fetch('/api/boards/list');
        
        if (response.ok) {
          const boards = await response.json();
          const boardExists = boards.some(board => 
            board.name === command.params.board_name && 
            board.course_folder === command.params.course_folder
          );
          
          if (boardExists) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `已验证展板"${command.params.board_name}"在"${command.params.course_folder}"下创建成功。您可以继续操作了。`
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `警告：未找到展板"${command.params.board_name}"，可能创建失败。请检查系统状态或重试。`
            }]);
          }
        }
      } catch (error) {
        console.error('验证展板操作错误:', error);
      }
    }
  };

  // 规划全局任务
  const planGlobalTask = async (task) => {
    setLoading(true);
    const taskDescription = task.description || '帮我整理当前应用的所有资源';
    
    // 添加用户消息
    const newMessages = [
      ...messages,
      { role: 'user', content: `请${taskDescription}` }
    ];
    setMessages(newMessages);
    
    try {
      // 调用API
      const response = await fetch('/api/global-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: taskDescription,
          context: JSON.stringify(appState)
        }),
      });
      
      if (!response.ok) throw new Error('规划任务失败');
      
      const data = await response.json();
      
      // 添加计划到消息列表
      setMessages([
        ...newMessages,
        { role: 'assistant', content: data.plan }
      ]);
    } catch (error) {
      console.error('规划任务错误:', error);
      message.error('规划任务失败');
      
      // 添加错误消息
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `抱歉，规划任务时发生了错误: ${error.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 执行常用任务
  const executeCommonTask = (task) => {
    setUserInput(task);
    sendMessage();
  };

  // 渲染消息
  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const isError = message.meta?.isError;
    
    // 系统状态消息样式不同
    if (isSystem) {
      return (
        <div 
          key={index}
          className="system-message"
          style={{ 
            textAlign: 'center',
            marginBottom: '8px'
          }}
        >
          <Tag color={isError ? 'error' : 'blue'}>
            {message.content}
          </Tag>
        </div>
      );
    }
    
    return (
      <div 
        key={index}
        className={`message ${isUser ? 'user-message' : 'assistant-message'}`}
        style={{ 
          textAlign: isUser ? 'right' : 'left',
          marginBottom: '16px'
        }}
      >
        <Card
          style={{ 
            display: 'inline-block',
            maxWidth: '80%',
            borderRadius: '8px',
            backgroundColor: isUser ? '#e6f7ff' : '#f0f0f0',
            borderColor: isUser ? '#91d5ff' : '#d9d9d9'
          }}
          styles={{ 
            body: { padding: '12px 16px' }
          }}
        >
          {isUser ? (
            <Text strong>{message.content}</Text>
          ) : (
            <div className="message-content">
              {message.role === 'assistant' ? (
                <>
                  <MarkdownMathRenderer>{typeof message.content === 'string' ? message.content : String(message.content || '')}</MarkdownMathRenderer>
                  {message.commands && message.commands.length > 0 && (
                    <div className="butler-commands">
                      <Divider>系统操作</Divider>
                      <List
                        size="small"
                        dataSource={message.commands}
                        renderItem={(cmd) => (
                          <List.Item
                            actions={[
                              <Button type="primary" size="small" key="run" onClick={() => executeCommand(cmd)}>
                                执行
                              </Button>
                            ]}
                          >
                            <Typography.Text code>{cmd.type}: {cmd.action}</Typography.Text>
                          </List.Item>
                        )}
                      />
                    </div>
                  )}
                </>
              ) : (
                <Typography.Text>{message.content}</Typography.Text>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  };

  // 常用任务列表
  const commonTasks = [
    '创建一个新的课程展板',
    '整理所有展板的内容',
    '帮我查找所有数学相关的PDF',
    '总结所有笔记内容',
    '帮我规划学习路径'
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <Title level={4}>
          <GlobalOutlined /> 管家LLM助手
        </Title>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        height: 'calc(100% - 120px)'
      }}>
        {/* 主聊天区域 */}
        <div style={{ 
          flex: 3, 
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}>
          <div style={{ 
            flex: 1, 
            overflow: 'auto', 
            padding: '16px',
            backgroundColor: '#f9f9f9'
          }}>
            {/* 消息列表 */}
            <div className="messages-container">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <TextArea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="输入消息..."
                autoSize={{ minRows: 2, maxRows: 6 }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={loading}
                style={{ flex: 1, marginRight: '8px' }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                loading={loading}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              按Enter发送，Shift+Enter换行
            </div>
          </div>
        </div>

        {/* 侧边栏 - 应用状态和常用任务 */}
        <div style={{ 
          flex: 1, 
          borderLeft: '1px solid #f0f0f0', 
          padding: '16px',
          overflow: 'auto'
        }}>
          {loadingState ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin />
              <Paragraph style={{ marginTop: '8px' }}>加载应用状态...</Paragraph>
            </div>
          ) : (
            <>
              <Title level={5}>
                <AppstoreOutlined /> 应用概览
              </Title>
              
              {appState ? (
                <Collapse 
                  defaultActiveKey={['boards', 'tasks']}
                  items={[
                    {
                      key: 'boards',
                      label: '展板',
                      children: appState.boards && appState.boards.length > 0 ? (
                        <List
                          size="small"
                          dataSource={appState.boards}
                          renderItem={board => (
                            <List.Item>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <RobotOutlined style={{ marginRight: '8px' }} />
                                <div>
                                  <div>{board.name}</div>
                                  <div style={{ fontSize: '12px', color: '#888' }}>
                                    <FilePdfOutlined /> {board.pdfs} 个PDF
                                    <AppstoreOutlined style={{ marginLeft: '8px' }} /> {board.windows} 个窗口
                                  </div>
                                </div>
                              </div>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty description="暂无展板" />
                      )
                    },
                    {
                      key: 'pdfs',
                      label: '最近PDF',
                      children: appState.pdfs && appState.pdfs.length > 0 ? (
                        <List
                          size="small"
                          dataSource={appState.pdfs}
                          renderItem={pdf => (
                            <List.Item>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <FilePdfOutlined style={{ marginRight: '8px' }} />
                                <div>{pdf.name}</div>
                              </div>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty description="暂无PDF" />
                      )
                    },
                    {
                      key: 'tasks',
                      label: '常用任务',
                      children: (
                        <List
                          size="small"
                          dataSource={commonTasks}
                          renderItem={task => (
                            <List.Item>
                              <a onClick={() => executeCommonTask(task)}>{task}</a>
                            </List.Item>
                          )}
                        />
                      )
                    }
                  ]}
                />
              ) : (
                <Empty description="暂无状态信息" />
              )}
              
              <div style={{ marginTop: '16px' }}>
                <Button 
                  type="primary" 
                  icon={<FileTextOutlined />}
                  onClick={() => planGlobalTask({ description: '整理所有资源并提供学习建议' })}
                  block
                >
                  规划全局任务
                </Button>
                
                <Button 
                  style={{ marginTop: '8px' }} 
                  icon={<SyncOutlined />}
                  onClick={fetchAppState}
                  block
                >
                  刷新应用状态
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 命令确认对话框 */}
      <Modal
        title="执行命令确认"
        open={commandConfirmVisible}
        onOk={confirmExecuteCommand}
        onCancel={cancelExecuteCommand}
        okText="确认执行"
        cancelText="取消"
      >
        <div>
          <Paragraph>管家LLM 请求执行以下操作：</Paragraph>
          
          {currentCommand && (
            <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f5f5f5' }}>
              <Title level={5}>
                {currentCommand.type === 'file_operation' && '文件操作'}
                {currentCommand.type === 'board_operation' && '展板操作'}
                {currentCommand.type === 'content' && '内容操作'}
                {currentCommand.type === 'window' && '窗口操作'}
                {!['file_operation', 'board_operation', 'content', 'window'].includes(currentCommand.type) && currentCommand.type}
              </Title>
              
              <Paragraph>
                <Text strong>动作: </Text>
                {currentCommand.action}
              </Paragraph>
              
              <Paragraph>
                <Text strong>参数: </Text>
              </Paragraph>
              
              <pre style={{ backgroundColor: '#fff', padding: 8, borderRadius: 4 }}>
                {JSON.stringify(currentCommand.params, null, 2)}
              </pre>
            </Card>
          )}
          
          <Paragraph>是否允许执行此操作？</Paragraph>
        </div>
      </Modal>
    </div>
  );
};

export default ButlerPanel; 