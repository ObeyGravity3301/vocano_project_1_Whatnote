import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Button, Spin, Typography, Divider, message, Card, Space, List, Avatar, Tag, Tooltip, Modal, Badge } from 'antd';
import { SendOutlined, RobotOutlined, SyncOutlined, FileTextOutlined, FilePdfOutlined, ReloadOutlined, CloseOutlined, InfoCircleOutlined, BulbOutlined, QuestionCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import MarkdownMathRenderer from './MarkdownMathRenderer';
import './NoteWindow.css';
import api from '../api'; // 导入API客户端

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

/**
 * 展板专家LLM交互面板
 * 
 * 用于与特定展板的专家LLM进行交互，发送消息和接收回复
 */
const BoardExpertPanel = ({ boardId, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [boardInfo, setBoardInfo] = useState(null);
  const [loadingBoardInfo, setLoadingBoardInfo] = useState(true);
  const messagesEndRef = useRef(null);
  const [updatingContext, setUpdatingContext] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingMessageIndex, setStreamingMessageIndex] = useState(null);
  const [streamSocket, setStreamSocket] = useState(null);
  const [intelligentMode, setIntelligentMode] = useState(false);
  
  // 使用ref来保持流式消息索引的稳定引用
  const streamingIndexRef = useRef(null);

  // 每个展板专家对话历史的本地存储键前缀
  const EXPERT_HISTORY_KEY_PREFIX = 'whatnote-expert-history-';

  // 收集展板内容函数
  const collectBoardContent = async () => {
    try {
      // 获取展板DOM元素
      const boardElement = document.querySelector(`.board-area[data-board-id="${boardId}"]`);
      if (!boardElement) {
        console.warn(`未找到展板元素: ${boardId}`);
        return null;
      }
      
      // 收集窗口和内容信息
      const windows = [];
      const pdfFrames = boardElement.querySelectorAll('.pdf-viewer-container');
      const noteFrames = boardElement.querySelectorAll('.note-editor-container');
      
      // 处理PDF窗口 - 增强信息收集
      for (const pdfFrame of pdfFrames) {
        const pdfId = pdfFrame.getAttribute('data-pdf-id');
        const filename = pdfFrame.getAttribute('data-filename');
        const currentPage = pdfFrame.getAttribute('data-page');
        
        // 获取可见的PDF内容文本（优化长度）
        let visibleContent = '';
        const textLayer = pdfFrame.querySelector('.textLayer');
        if (textLayer) {
          visibleContent = textLayer.innerText || '';
        }
        
        // 获取PDF标题信息
        const titleElement = pdfFrame.querySelector('.draggable-window-title, .window-title');
        const title = titleElement ? titleElement.innerText : filename;
        
        windows.push({
          type: 'pdf',
          id: pdfId,
          filename: filename,
          title: title,
          currentPage: currentPage,
          contentPreview: visibleContent.substring(0, 800), // 增加预览长度
          isVisible: !pdfFrame.style.display || pdfFrame.style.display !== 'none',
          position: {
            x: pdfFrame.offsetLeft,
            y: pdfFrame.offsetTop
          }
        });
      }
      
      // 处理笔记窗口 - 增强类型识别
      for (const noteFrame of noteFrames) {
        const noteId = noteFrame.getAttribute('data-note-id');
        const noteType = noteFrame.getAttribute('data-note-type');
        
        // 获取可见的笔记内容
        let noteContent = '';
        const editor = noteFrame.querySelector('.editor-content, .ant-input, textarea, .note-content');
        if (editor) {
          noteContent = editor.innerText || editor.value || '';
        }
        
        // 尝试从标题识别笔记类型
        const titleElement = noteFrame.querySelector('.draggable-window-title, .window-title');
        const title = titleElement ? titleElement.innerText : '笔记';
        
        // 根据标题和内容推断更具体的类型
        let specificType = noteType || 'note';
        if (title.includes('AI笔记') || title.includes('整本笔记')) {
          specificType = 'ai_note';
        } else if (title.includes('注释') || title.includes('页注释')) {
          specificType = 'annotation';
        } else if (title.includes('我的笔记') || title.includes('用户笔记')) {
          specificType = 'user_note';
        } else if (title.includes('页面笔记')) {
          specificType = 'page_note';
        }
        
        windows.push({
          type: specificType,
          id: noteId,
          title: title,
          contentPreview: noteContent.substring(0, 500), // 笔记内容预览
          contentLength: noteContent.length,
          isVisible: !noteFrame.style.display || noteFrame.style.display !== 'none',
          position: {
            x: noteFrame.offsetLeft,
            y: noteFrame.offsetTop
          }
        });
      }
      
      // 获取当前活跃/焦点窗口信息
      const activeWindow = document.querySelector('.draggable-window:focus-within, .draggable-window.active');
      let activeWindowInfo = null;
      if (activeWindow) {
        const activeId = activeWindow.getAttribute('data-window-id');
        activeWindowInfo = windows.find(w => w.id === activeId || activeWindow.querySelector(`[data-pdf-id="${w.id}"]`));
      }
      
      // 收集展板级别的统计信息
      const stats = {
        totalWindows: windows.length,
        pdfWindows: windows.filter(w => w.type === 'pdf').length,
        noteWindows: windows.filter(w => w.type !== 'pdf').length,
        visibleWindows: windows.filter(w => w.isVisible).length,
        totalContentLength: windows.reduce((sum, w) => sum + (w.contentPreview?.length || 0), 0)
      };
      
      // 尝试截取展板区域图像（可选，失败不影响功能）
      let screenshotBase64 = null;
      try {
        if (windows.length > 0) { // 只有在有窗口时才截图
          const canvas = await html2canvas(boardElement, {
            logging: false,
            useCORS: true,
            scale: 0.3, // 进一步降低比例以减少数据量
            width: Math.min(boardElement.offsetWidth, 800),
            height: Math.min(boardElement.offsetHeight, 600)
          });
          screenshotBase64 = canvas.toDataURL('image/jpeg', 0.5);
        }
      } catch (error) {
        console.warn('获取展板截图失败:', error);
      }
      
      // 返回完整的展板内容信息
      const contextData = {
        boardId: boardId,
        timestamp: new Date().toISOString(),
        windows: windows,
        activeWindow: activeWindowInfo,
        stats: stats,
        screenshot: screenshotBase64,
        // 生成摘要信息供LLM快速理解
        summary: {
          description: `展板包含${stats.totalWindows}个窗口（${stats.pdfWindows}个PDF，${stats.noteWindows}个笔记）`,
          visiblePdfs: windows.filter(w => w.type === 'pdf' && w.isVisible).map(w => `${w.filename}(第${w.currentPage}页)`),
          activeNotes: windows.filter(w => w.type !== 'pdf' && w.isVisible && w.contentLength > 0).length,
          hasContent: stats.totalContentLength > 100
        }
      };
      
      console.log('收集展板内容完成:', {
        boardId,
        windowsCount: windows.length,
        contentLength: stats.totalContentLength,
        hasScreenshot: !!screenshotBase64
      });
      
      return contextData;
    } catch (error) {
      console.error('收集展板内容错误:', error);
      return null;
    }
  };

  // 更新展板上下文函数
  const updateBoardContext = async (silent = false) => {
    if (updatingContext) {
      console.log('正在更新上下文，跳过本次更新');
      return;
    }
    
    setUpdatingContext(true);
    try {
      // 收集展板内容
      const contextData = await collectBoardContent();
      if (!contextData) {
        if (!silent) message.warning('未能获取展板内容');
        return;
      }
      
      // 设置3秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      // 发送到后端 - 使用api客户端
      const response = await fetch(`${api.getBaseUrl()}/api/boards/${boardId}/send-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contextData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error('更新展板上下文失败');
      
      // 更新状态
      setLastUpdated(new Date());
      if (!silent) message.success('展板信息已更新');
      
      // 向用户反馈（仅在非静默模式下）
      if (!silent) {
        setMessages(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `我已接收到最新展板信息，包含${contextData.windows.length}个窗口。` +
                    `其中有${contextData.visiblePdfs.length}个PDF文件和${contextData.activeNotes}个笔记窗口。` +
                    `现在我可以更好地理解和回答关于您当前工作内容的问题了。`
          }
        ]);
      }
    } catch (error) {
      console.error('更新展板上下文错误:', error);
      if (!silent && error.name !== 'AbortError') {
        message.error('更新展板信息失败');
      }
    } finally {
      setUpdatingContext(false);
    }
  };

  // 静默更新函数
  const updateBoardContextSilent = () => updateBoardContext(true);

  // 获取展板信息并加载对话历史
  useEffect(() => {
    const fetchBoardInfo = async () => {
      try {
        setLoadingBoardInfo(true);
        
        // 设置10秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${api.getBaseUrl()}/api/boards/${boardId}`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'max-age=300' // 5分钟缓存
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // 尝试创建一个默认的展板信息
          console.warn(`获取展板 ${boardId} 信息失败，使用默认信息`);
          
          // 创建默认展板信息
          const defaultBoardInfo = {
            id: boardId,
            name: `展板 ${boardId}`,
            state: "active", 
            pdfs: [],
            windows: []
          };
          
          setBoardInfo(defaultBoardInfo);
          return;
        }
        
        const data = await response.json();
        setBoardInfo(data);
      } catch (error) {
        console.error('获取展板信息错误:', error);
        
        // 创建默认展板信息作为备选
        const defaultBoardInfo = {
          id: boardId,
          name: `展板 ${boardId}`,
          state: "active",
          pdfs: [],
          windows: []
        };
        
        setBoardInfo(defaultBoardInfo);
        
        if (error.name !== 'AbortError') {
          message.warning('无法获取完整展板信息，使用默认配置');
        }
      } finally {
        setLoadingBoardInfo(false);
      }
    };

    if (boardId) {
      fetchBoardInfo();
      
      // 从localStorage加载该展板的对话历史
      try {
        const historyKey = `${EXPERT_HISTORY_KEY_PREFIX}${boardId}`;
        const savedHistory = localStorage.getItem(historyKey);
        if (savedHistory) {
          const history = JSON.parse(savedHistory);
          setMessages(history);
        } else {
          // 首次打开时添加欢迎消息
          setMessages([
            {
              role: 'assistant',
              content: `欢迎使用专家LLM助手，我负责处理展板 "${boardId}" 的所有内容。请问有什么我可以帮助您的？`
            }
          ]);
        }
      } catch (error) {
        console.error('加载专家对话历史失败:', error);
        // 出错时使用默认欢迎消息
        setMessages([
          {
            role: 'assistant',
            content: `欢迎使用专家LLM助手，我负责处理展板 "${boardId}" 的所有内容。请问有什么我可以帮助您的？`
          }
        ]);
      }
      
      // 注册菜单命令事件监听器，确保可以从右键菜单触发专家LLM
      const handleMenuCommand = (event) => {
        const { command, data } = event.detail;
        console.log('收到菜单命令:', command, data);
        
        // 检查是否是当前展板的专家LLM命令
        if (command === 'ask_expert_llm' && data && data.boardId === boardId) {
          console.log('激活专家LLM对话窗口:', boardId);
          // 如果窗口被最小化，则恢复窗口
          const expertPanel = document.querySelector(`.expert-panel[data-board-id="${boardId}"]`);
          if (expertPanel && expertPanel.classList.contains('minimized')) {
            // 触发还原窗口事件
            const restoreEvent = new CustomEvent('restore-window', {
              detail: { windowId: `expert-${boardId}` }
            });
            window.dispatchEvent(restoreEvent);
          }
          
          // 聚焦到输入框
          setTimeout(() => {
            const inputElement = document.querySelector(`.expert-panel[data-board-id="${boardId}"] textarea`);
            if (inputElement) {
              inputElement.focus();
            }
          }, 300);
        }
      };
      
      window.addEventListener('menu-command', handleMenuCommand);
      return () => window.removeEventListener('menu-command', handleMenuCommand);
    }
  }, [boardId]);

  // 添加自动更新逻辑 - 使用10分钟间隔，减少频率
  useEffect(() => {
    // 延迟触发事件，避免重复加载
    const boardLoadedTimer = setTimeout(() => {
      // 触发事件通知展板加载完成，用于初始化右键菜单
      const boardLoadedEvent = new CustomEvent('board-loaded', {
        detail: { boardId }
      });
      window.dispatchEvent(boardLoadedEvent);
      console.log('触发展板加载事件:', boardId);
    }, 500); // 延迟500ms

    const intervalId = setInterval(() => {
      // 只在空闲状态且展板有内容时自动更新，减少频率
      if (!loading && !updatingContext && boardInfo && document.visibilityState === 'visible') {
        // 静默更新，不向用户显示消息
        updateBoardContextSilent();
      }
    }, 10 * 60 * 1000); // 改为10分钟
    
    return () => {
      clearTimeout(boardLoadedTimer);
      clearInterval(intervalId);
    };
  }, [boardId]);

  // 在关键操作后自动更新上下文
  useEffect(() => {
    // 监听自定义事件
    const handleBoardChange = () => {
      if (!loading && !updatingContext) {
        // 延迟1秒执行，确保UI更新完成
        setTimeout(() => updateBoardContextSilent(), 1000);
      }
    };
    
    window.addEventListener('board-content-changed', handleBoardChange);
    return () => window.removeEventListener('board-content-changed', handleBoardChange);
  }, [loading, updatingContext]);

  // 保存对话历史到localStorage
  useEffect(() => {
    if (boardId && messages.length > 0) {
      try {
        const historyKey = `${EXPERT_HISTORY_KEY_PREFIX}${boardId}`;
        localStorage.setItem(historyKey, JSON.stringify(messages));
      } catch (error) {
        console.error('保存专家对话历史失败:', error);
      }
    }
  }, [boardId, messages]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 清理WebSocket连接
  const closeStreamSocket = () => {
    if (streamSocket && streamSocket.readyState !== WebSocket.CLOSED) {
      try {
        streamSocket.close();
      } catch (err) {
        console.error('关闭WebSocket错误:', err);
      }
    }
    setStreamSocket(null);
  };
  
  // 清理WebSocket连接
  useEffect(() => {
    return () => closeStreamSocket();
  }, []);

  // 发送消息到专家LLM - 支持智能模式和普通模式
  const sendMessage = async () => {
    if (!userInput.trim()) return;
    
    // 根据模式选择不同的处理方式
    if (intelligentMode) {
      // 智能模式：使用智能专家LLM
      await sendIntelligentMessage();
    } else {
      // 普通模式：检测执行类指令并使用传统流式输出
      const userInputLower = userInput.toLowerCase();
      const executionKeywords = ['请执行', '执行', '开始执行', '帮我执行', '进行', '生成', '创建'];
      const isExecutionRequest = executionKeywords.some(keyword => userInputLower.includes(keyword));
      
      // 如果检测到执行类指令，显示确认框
      if (isExecutionRequest) {
        Modal.confirm({
          title: '确认执行指令',
          content: (
            <div>
              <p>检测到您想要执行以下指令：</p>
              <div style={{ 
                background: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '4px', 
                margin: '8px 0',
                border: '1px solid #d9d9d9'
              }}>
                <Text code style={{ whiteSpace: 'pre-wrap' }}>{userInput}</Text>
              </div>
              <p>是否确认执行此指令？</p>
            </div>
          ),
          okText: '确认执行',
          cancelText: '取消',
          width: 500,
          onOk: () => {
            // 用户确认后执行原始逻辑
            executeActualSend();
          },
          onCancel: () => {
            console.log('用户取消了指令执行');
          }
        });
        return; // 等待用户确认
      }
      
      // 如果不是执行类指令，直接发送
      executeActualSend();
    }
  };

  // 智能专家LLM发送消息
  const sendIntelligentMessage = async () => {
    // 保存当前用户输入
    const currentUserInput = userInput;
    
    // 添加用户消息到列表
    const newMessages = [
      ...messages,
      { role: 'user', content: currentUserInput }
    ];
    
    // 添加一个占位的助手消息，用于显示状态
    const updatedMessages = [
      ...newMessages,
      { role: 'assistant', content: '🔍 正在进行智能分析...', isProcessing: true }
    ];
    
    setMessages(updatedMessages);
    setUserInput('');
    setLoading(true);
    
    try {
      // 创建WebSocket连接到智能专家端点
      const wsBaseUrl = api.getBaseUrl().replace(/^http/, 'ws');
      const wsSocket = new WebSocket(`${wsBaseUrl}/api/expert/intelligent`);
      
      wsSocket.onopen = () => {
        const payload = JSON.stringify({
          query: currentUserInput,
          board_id: boardId
        });
        console.log('发送智能查询:', payload);
        wsSocket.send(payload);
      };
      
      wsSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('收到智能专家消息:', data);
          
          // 处理状态更新
          if (data.status) {
            setMessages(prev => {
              const updated = [...prev];
              // 更新最后一条消息（处理状态消息）
              if (updated.length > 0 && updated[updated.length - 1].isProcessing) {
                updated[updated.length - 1].content = data.status;
              }
              return updated;
            });
          }
          
          // 处理最终答案
          if (data.answer) {
            setMessages(prev => {
              const updated = [...prev];
              // 替换处理状态消息为最终答案
              if (updated.length > 0 && updated[updated.length - 1].isProcessing) {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: data.answer,
                  isProcessing: false
                };
              }
              return updated;
            });
          }
          
          // 处理完成信号
          if (data.done) {
            setLoading(false);
            wsSocket.close();
          }
          
          // 处理错误
          if (data.error) {
            console.error('智能专家错误:', data.error);
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].isProcessing) {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: `❌ 错误: ${data.error}`,
                  isProcessing: false
                };
              }
              return updated;
            });
            setLoading(false);
            wsSocket.close();
          }
        } catch (parseError) {
          console.error('解析智能专家消息错误:', parseError);
          setLoading(false);
          wsSocket.close();
        }
      };
      
      wsSocket.onerror = (error) => {
        console.error('智能专家WebSocket错误:', error);
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].isProcessing) {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: '❌ 连接错误，请稍后重试',
              isProcessing: false
            };
          }
          return updated;
        });
        setLoading(false);
      };
      
      wsSocket.onclose = () => {
        console.log('智能专家WebSocket连接关闭');
        setLoading(false);
      };
      
    } catch (error) {
      console.error('智能专家查询错误:', error);
      message.error('智能查询失败');
      setLoading(false);
    }
  };
  
  const executeActualSend = async () => {
    // 关闭之前的WebSocket连接
    closeStreamSocket();
    
    // 保存当前用户输入，因为稍后会清空userInput状态
    const currentUserInput = userInput;
    
    // 添加用户消息到列表
    const newMessages = [
      ...messages,
      { role: 'user', content: currentUserInput }
    ];
    
    // 添加一个占位的助手消息，用于流式输出
    const updatedMessages = [
      ...newMessages,
      { role: 'assistant', content: '' }
    ];
    
    setMessages(updatedMessages);
    setStreamingMessageIndex(updatedMessages.length - 1);
    streamingIndexRef.current = updatedMessages.length - 1; // 同步更新ref
    setUserInput('');
    setStreaming(true);
    
    try {
      // 先尝试更新展板上下文（静默模式）
      await updateBoardContextSilent();
      
      // 创建WebSocket连接 - 使用正确的后端端口
      const wsBaseUrl = api.getBaseUrl().replace(/^http/, 'ws');
      const wsSocket = new WebSocket(`${wsBaseUrl}/api/expert/stream`);
      setStreamSocket(wsSocket);
      
      // 处理WebSocket事件
      wsSocket.onopen = () => {
        // 发送查询数据
        const payload = JSON.stringify({
          query: currentUserInput,
          board_id: boardId,
          history: messages.slice(-5) // 只发送最近5条消息作为历史上下文
        });
        console.log('发送WebSocket数据:', payload);
        wsSocket.send(payload);
      };
      
      wsSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('收到WebSocket消息:', data);
          
          // 处理步骤状态信息 - 显示智能分析进度
          if (data.step) {
            const stepMessage = {
              role: 'system',
              content: `🔧 [进度] ${data.step}`,
              isStep: true,
              timestamp: new Date().toISOString()
            };
            
            setMessages(prev => {
              const updated = [...prev];
              const currentStreamingIndex = streamingIndexRef.current;
              
              // 如果正在流式输出，将步骤消息插入到流式消息之前
              if (currentStreamingIndex !== null && currentStreamingIndex < updated.length) {
                updated.splice(currentStreamingIndex, 0, stepMessage);
                // 更新流式输出索引，因为数组中插入了新元素
                streamingIndexRef.current = currentStreamingIndex + 1;
                setStreamingMessageIndex(currentStreamingIndex + 1);
              } else {
                // 如果没有流式输出，直接添加到末尾
                updated.push(stepMessage);
              }
              
              return updated;
            });
          }
          
          // 处理调试信息（保留原有功能）
          if (data.debug) {
            const debugMessage = {
              role: 'system',
              content: `🔧 [调试] ${data.debug}`,
              isDebug: true,
              timestamp: new Date().toISOString()
            };
            
            setMessages(prev => {
              const updated = [...prev];
              const currentStreamingIndex = streamingIndexRef.current;
              
              // 如果正在流式输出，将调试消息插入到流式消息之前
              if (currentStreamingIndex !== null && currentStreamingIndex < updated.length) {
                updated.splice(currentStreamingIndex, 0, debugMessage);
                // 更新流式输出索引，因为数组中插入了新元素
                streamingIndexRef.current = currentStreamingIndex + 1;
                setStreamingMessageIndex(currentStreamingIndex + 1);
              } else {
                // 如果没有流式输出，直接添加到末尾
                updated.push(debugMessage);
              }
              
              return updated;
            });
          }
          
          // 处理流式块 - 添加安全检查
          if (data.chunk) {
            console.log('📦 收到流式数据块:', data.chunk);
            setMessages(prev => {
              const updated = [...prev];
              // 使用ref中的索引，更加稳定
              const currentIndex = streamingIndexRef.current;
              // 安全检查：确保索引有效且消息存在
              if (currentIndex !== null && 
                  currentIndex >= 0 && 
                  currentIndex < updated.length &&
                  updated[currentIndex]) {
                updated[currentIndex].content += data.chunk;
              } else {
                console.warn('流式消息索引无效:', currentIndex, '数组长度:', updated.length);
              }
              return updated;
            });
          }
          
          // 处理完成信号
          if (data.done) {
            // 记录交互日志
            const interactionLog = {
              id: `expert-intelligent-${Date.now()}`,
              timestamp: new Date().toISOString(),
              llmType: 'expert',
              query: currentUserInput,
              response: data.full_response || '',
              fullResponse: data.full_response || '',
              metadata: {
                boardId: boardId,
                historyLength: messages.length,
                requestType: 'intelligent',
                streaming: false,
                toolSupport: true,
                intelligentMode: data.intelligent_mode || true
              }
            };
            
            // 分发日志事件
            const logEvent = new CustomEvent('llm-interaction', {
              detail: interactionLog
            });
            window.dispatchEvent(logEvent);
            
            // 尝试将日志发送到服务器 - 使用正确的端点
            try {
              fetch(`${api.getBaseUrl()}/api/llm-logs`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(interactionLog),
              }).catch(err => console.warn('记录日志到服务器失败:', err));
            } catch (logErr) {
              console.warn('发送日志到服务器时出错:', logErr);
            }
            
            // 清理流式状态
            setStreaming(false);
            setStreamingMessageIndex(null);
            streamingIndexRef.current = null; // 清理ref
            closeStreamSocket();
          }
          
          // 处理错误
          if (data.error) {
            console.error('WebSocket错误响应:', data.error);
            setMessages(prev => {
              const updated = [...prev];
              // 使用ref中的索引
              const currentIndex = streamingIndexRef.current;
              // 安全检查
              if (currentIndex !== null && 
                  currentIndex >= 0 && 
                  currentIndex < updated.length &&
                  updated[currentIndex]) {
                updated[currentIndex].content = `错误: ${data.error}`;
              }
              return updated;
            });
            
            message.error(`专家LLM错误: ${data.error}`);
            setStreaming(false);
            setStreamingMessageIndex(null);
            streamingIndexRef.current = null; // 清理ref
            closeStreamSocket();
          }
        } catch (parseError) {
          console.error('解析WebSocket消息错误:', parseError, '原始消息:', event.data);
          setMessages(prev => {
            const updated = [...prev];
            // 使用ref中的索引
            const currentIndex = streamingIndexRef.current;
            // 安全检查
            if (currentIndex !== null && 
                currentIndex >= 0 && 
                currentIndex < updated.length &&
                updated[currentIndex]) {
              updated[currentIndex].content = '解析响应错误，请重试';
            }
            return updated;
          });
          setStreaming(false);
          setStreamingMessageIndex(null);
          streamingIndexRef.current = null; // 清理ref
          closeStreamSocket();
        }
      };
      
      wsSocket.onerror = (error) => {
        console.error('WebSocket错误:', error);
        message.error('连接错误，请稍后重试');
        
        setMessages(prev => {
          const updated = [...prev];
          updated[streamingMessageIndex].content = '连接错误，请稍后重试';
          return updated;
        });
        
        setStreaming(false);
        setStreamingMessageIndex(null);
        streamingIndexRef.current = null; // 清理ref
        closeStreamSocket();
      };
      
      wsSocket.onclose = (event) => {
        console.log('WebSocket连接已关闭:', event);
        if (streaming && streamingIndexRef.current !== null) {
          setMessages(prev => {
            const updated = [...prev];
            const currentIndex = streamingIndexRef.current;
            if (currentIndex !== null && 
                currentIndex >= 0 && 
                currentIndex < updated.length &&
                updated[currentIndex] &&
                updated[currentIndex].content === '') {
              updated[currentIndex].content = '连接已关闭，未收到完整响应';
            }
            return updated;
          });
          setStreaming(false);
          setStreamingMessageIndex(null);
          streamingIndexRef.current = null; // 清理ref
        }
      };
      
    } catch (error) {
      console.error('发送消息错误:', error);
      message.error('发送消息失败');
      
      // 如果发生错误，也清理流式状态
      setStreaming(false);
      setStreamingMessageIndex(null);
      streamingIndexRef.current = null; // 清理ref
      closeStreamSocket();
    }
  };

  // 执行预定义任务
  const executeTask = async (task) => {
    // 添加用户任务消息
    const newMessages = [
      ...messages,
      { role: 'user', content: `请${task.description}` }
    ];
    setMessages(newMessages);
    setLoading(true);
    
    try {
      // 先尝试更新展板上下文（静默模式）
      await updateBoardContextSilent();
      
      // 调用相应的API
      const response = await fetch(`${api.getBaseUrl()}${task.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task.params || {}),
      });
      
      if (!response.ok) throw new Error(`${task.description}失败`);
      
      const data = await response.json();
      
      // 处理不同类型的响应
      let resultContent = '';
      
      if (task.endpoint.includes('/dynamic/')) {
        // 动态任务需要轮询结果
        const taskId = data.task_id;
        if (taskId) {
          // 添加等待消息
          setMessages([
            ...newMessages,
            { role: 'assistant', content: '任务已提交，正在处理中，请稍候...' }
          ]);
          
          // 轮询结果
          const maxPolls = 30; // 最多轮询30次
          const pollInterval = 2000; // 2秒间隔
          let pollCount = 0;
          
          const pollResult = async () => {
            while (pollCount < maxPolls) {
              pollCount++;
              
              try {
                const resultResponse = await fetch(`${api.getBaseUrl()}/api/expert/dynamic/result/${taskId}`);
                if (resultResponse.ok) {
                  const resultData = await resultResponse.json();
                  
                  if (resultData.status === 'completed') {
                    resultContent = task.processResult ? task.processResult(resultData) : resultData.result || resultData.data || '任务已完成';
                    break;
                  } else if (resultData.status === 'failed') {
                    throw new Error(resultData.error || '任务执行失败');
                  }
                  // 如果还在运行中，继续轮询
                }
              } catch (pollError) {
                console.error('轮询错误:', pollError);
              }
              
              // 等待后继续轮询
              await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            
            if (!resultContent) {
              throw new Error('任务超时，请稍后重试');
            }
          };
          
          await pollResult();
        } else {
          throw new Error('未获取到任务ID');
        }
      } else {
        // 直接响应
        resultContent = task.processResult ? task.processResult(data) : data.response || data.result || '任务已完成';
      }
      
      // 添加执行结果
      setMessages([
        ...newMessages,
        { role: 'assistant', content: resultContent }
      ]);
      
      // 如果任务完成后需要刷新展板信息
      if (task.refreshBoardInfo) {
        const boardResponse = await fetch(`${api.getBaseUrl()}/api/boards/${boardId}`);
        if (boardResponse.ok) {
          const boardData = await boardResponse.json();
          setBoardInfo(boardData);
        }
      }
    } catch (error) {
      console.error('执行任务错误:', error);
      message.error(`${task.description}失败`);
      
      // 添加错误消息
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `抱歉，${task.description}时发生了错误: ${error.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 带确认的任务执行
  const executeTaskWithConfirmation = (taskName, task) => {
    Modal.confirm({
      title: `确认执行任务`,
      content: `是否要执行"${taskName}"？这将${task.description}。`,
      okText: '确认执行',
      cancelText: '取消',
      onOk: () => {
        executeTask(task);
      },
      onCancel: () => {
        console.log('用户取消了任务执行');
      }
    });
  };

  // 生成快速任务按钮
  const generateTaskButtons = () => {
    // 根据展板信息生成可用任务
    if (!boardInfo) return [];
    
    const tasks = [];
    
    // 如果有PDF，添加相关任务 - 增强安全检查
    if (boardInfo.pdfs && Array.isArray(boardInfo.pdfs) && boardInfo.pdfs.length > 0) {
      const firstPdf = boardInfo.pdfs[0];
      
      // 确保firstPdf存在且有filename
      if (firstPdf && firstPdf.filename) {
        tasks.push({
          icon: <FileTextOutlined />,
          description: '生成PDF笔记',
          endpoint: `/api/expert/dynamic/generate-pdf-note`,
          params: {
            board_id: boardId,
            filename: firstPdf.filename
          },
          refreshBoardInfo: true,
          processResult: (data) => `PDF笔记已生成完成！\n\n${data.result || data.data || '笔记内容已保存到系统中。'}`
        });
        
        tasks.push({
          icon: <BulbOutlined />,
          description: '分析PDF内容',
          endpoint: `/api/expert/dynamic/answer-question`,
          params: {
            board_id: boardId,
            question: `请分析当前PDF文件"${firstPdf.filename}"的主要内容，包括：1. 核心概念和要点 2. 章节结构 3. 学习重点 4. 可能的考试要点`,
            context: `当前正在查看PDF文件：${firstPdf.filename}，第${firstPdf.currentPage || '未知'}页`
          },
          processResult: (data) => `PDF内容分析完成：\n\n${data.result || data.data || '分析结果已生成。'}`
        });
      }
    }
    
    // 添加通用任务
    tasks.push({
      icon: <QuestionCircleOutlined />,
      description: '学习建议',
      endpoint: `/api/expert/dynamic/answer-question`,
      params: {
        board_id: boardId,
        question: '基于当前展板的内容，请为我制定一个学习计划和建议，包括重点关注的内容和学习方法。',
        context: '用户希望获得个性化的学习建议'
      },
      processResult: (data) => `学习建议：\n\n${data.result || data.data || '建议已生成。'}`
    });
    
    tasks.push({
      icon: <SyncOutlined />,
      description: '总结展板',
      endpoint: `/api/expert/dynamic/answer-question`,
      params: {
        board_id: boardId,
        question: '请总结当前展板的所有内容，包括打开的PDF文件、笔记内容、以及主要的学习要点。',
        context: '用户需要展板内容的全面总结'
      },
      processResult: (data) => `展板总结：\n\n${data.result || data.data || '总结已完成。'}`
    });
    
    return tasks;
  };

  // 渲染消息
  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isDebug = message.isDebug || message.role === 'system';
    const isStep = message.isStep; // 新增：步骤进度消息
    const isProcessing = message.isProcessing;
    
    return (
      <div 
        key={index}
        className={`message ${isUser ? 'user-message' : 
                             isStep ? 'step-message' :
                             isDebug ? 'debug-message' : 'assistant-message'}`}
        style={{ 
          textAlign: isUser ? 'right' : 'left',
          marginBottom: isDebug || isStep ? '8px' : '16px',
          opacity: isDebug ? 0.8 : isStep ? 0.9 : 1
        }}
      >
        <Card
          style={{ 
            display: 'inline-block',
            maxWidth: isDebug || isStep ? '95%' : '80%',
            borderRadius: '8px',
            backgroundColor: isUser ? '#e6f7ff' : 
                           isStep ? '#f0f9ff' : 
                           isDebug ? '#f6ffed' : 
                           isProcessing ? '#fff7e6' : '#f0f0f0',
            borderColor: isUser ? '#91d5ff' : 
                        isStep ? '#69c0ff' :
                        isDebug ? '#b7eb8f' : 
                        isProcessing ? '#ffc53d' : '#d9d9d9',
            fontSize: isDebug || isStep ? '12px' : '14px',
            borderLeft: isStep ? '4px solid #1890ff' : 'none'
          }}
          styles={{ 
            body: { padding: isDebug || isStep ? '6px 12px' : '12px 16px' }
          }}
        >
          {isUser ? (
            <Text strong>{message.content}</Text>
          ) : isStep ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div 
                style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  backgroundColor: '#1890ff',
                  animation: 'pulse 1.5s infinite'
                }}
              />
              <Text style={{ color: '#1890ff', fontWeight: '500' }}>
                {message.content}
              </Text>
            </div>
          ) : isDebug ? (
            <Text style={{ color: '#52c41a', fontFamily: 'monospace' }}>
              {message.content}
            </Text>
          ) : isProcessing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Spin size="small" />
              <Text style={{ color: '#d46b08' }}>{message.content}</Text>
            </div>
          ) : (
            <div className="message-content">
              <MarkdownMathRenderer>{typeof message.content === 'string' ? message.content : String(message.content || '')}</MarkdownMathRenderer>
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
      <div style={{ 
        padding: '16px', 
        borderBottom: '1px solid #f0f0f0', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        backgroundColor: '#fafafa'
      }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined style={{ color: '#1890ff' }} /> 专家LLM助手
          </Title>
          {boardInfo && (
            <div style={{ marginTop: '4px' }}>
              <Space size="small">
                <Badge 
                  count={boardInfo.pdfs?.length || 0} 
                  style={{ backgroundColor: '#52c41a' }}
                  title="PDF文件数量"
                >
                  <Tag icon={<FilePdfOutlined />} color="blue">PDF文件</Tag>
                </Badge>
                <Badge 
                  count={boardInfo.windows?.length || 0} 
                  style={{ backgroundColor: '#faad14' }}
                  title="窗口数量"
                >
                  <Tag icon={<FileTextOutlined />} color="orange">窗口</Tag>
                </Badge>
                {lastUpdated && (
                  <Tooltip title={`上次更新: ${lastUpdated.toLocaleString()}`}>
                    <Tag icon={<ClockCircleOutlined />} color="green">
                      {lastUpdated.toLocaleTimeString()}
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            </div>
          )}
        </div>
        
        <Space>
          <Tooltip title={intelligentMode ? "切换到普通模式" : "切换到智能模式"}>
            <Button 
              type={intelligentMode ? "primary" : "default"}
              icon={<BulbOutlined />}
              onClick={() => setIntelligentMode(!intelligentMode)}
              size="small"
            >
              {intelligentMode ? "智能模式" : "普通模式"}
            </Button>
          </Tooltip>
          <Tooltip title="更新展板信息，获取最新内容">
            <Button 
              type="primary"
              icon={<SyncOutlined spin={updatingContext} />}
              onClick={() => updateBoardContext(false)}
              loading={updatingContext}
              disabled={loading}
              size="small"
            >
              更新信息
            </Button>
          </Tooltip>
          <Tooltip title="关闭专家LLM窗口">
            <Button 
              icon={<CloseOutlined />}
              onClick={onClose}
              size="small"
            />
          </Tooltip>
        </Space>
      </div>

      {/* 主内容区域 */}
      <div style={{ 
        flex: 1, 
        overflow: 'auto', 
        padding: '16px',
        backgroundColor: '#f9f9f9'
      }}>
        {loadingBoardInfo ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px', color: '#666' }}>加载展板信息...</div>
          </div>
        ) : (
          <>
            {/* 展板状态信息 */}
            {boardInfo && (
              <Card 
                size="small" 
                style={{ marginBottom: '16px' }}
                title={
                  <Space>
                    <InfoCircleOutlined />
                    <span>展板状态</span>
                  </Space>
                }
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div>
                    <Text strong>展板ID:</Text> <Text code>{boardInfo.board_id || boardId}</Text>
                  </div>
                  {boardInfo.pdfs && boardInfo.pdfs.length > 0 && (
                    <div>
                      <Text strong>当前PDF:</Text>
                      <div style={{ marginTop: '4px' }}>
                        {boardInfo.pdfs.map((pdf, index) => (
                          <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                            {pdf.filename} (第{pdf.currentPage}页)
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Text strong>状态:</Text> 
                    <Tag color={boardInfo.state === 'active' ? 'green' : 'orange'}>
                      {boardInfo.state === 'active' ? '活跃' : '非活跃'}
                    </Tag>
                  </div>
                </Space>
              </Card>
            )}

            {/* 快速操作按钮 */}
            <Card 
              size="small" 
              style={{ marginBottom: '16px' }}
              title={
                <Space>
                  <BulbOutlined />
                  <span>快速操作</span>
                </Space>
              }
            >
              <Space wrap>
                {Array.isArray(generateTaskButtons()) && generateTaskButtons().map((task, index) => (
                  <Button 
                    key={index}
                    icon={task.icon}
                    onClick={() => executeTaskWithConfirmation(task.description, task)}
                    disabled={loading}
                    size="small"
                  >
                    {task.description}
                  </Button>
                ))}
                <Button 
                  icon={<QuestionCircleOutlined />}
                  onClick={() => setUserInput('请介绍一下当前展板的内容和你能提供的帮助。')}
                  disabled={loading}
                  size="small"
                >
                  功能介绍
                </Button>
                <Button 
                  icon={<BulbOutlined />}
                  onClick={() => executeTaskWithConfirmation('查询特定页面', {
                    description: '查询PDF特定页面内容',
                    endpoint: `/api/expert/query-page`,
                    params: {
                      board_id: boardId,
                      filename: boardInfo?.pdfs?.[0]?.filename,
                      page_number: 21,  // 示例页码
                      query: '请详细说明这一页的内容'
                    },
                    processResult: (data) => `页面内容查询结果：\n\n${data.response}`
                  })}
                  disabled={loading || !boardInfo?.pdfs?.[0]?.filename}
                  size="small"
                >
                  查询第21页
                </Button>
              </Space>
            </Card>

            {/* 消息列表 */}
            <div className="messages-container" style={{ minHeight: '200px' }}>
              {Array.isArray(messages) && messages.map(renderMessage)}
              {streaming && streamingMessageIndex !== null && (
                <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                  <Card
                    style={{ 
                      display: 'inline-block',
                      maxWidth: '80%',
                      borderRadius: '8px',
                      backgroundColor: '#f0f0f0',
                      borderColor: '#d9d9d9'
                    }}
                    styles={{ 
                      body: { padding: '12px 16px' }
                    }}
                  >
                    <Spin size="small" style={{ marginRight: '8px' }} />
                    <Text type="secondary">正在思考...</Text>
                  </Card>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div style={{ 
        padding: '16px', 
        borderTop: '1px solid #f0f0f0',
        backgroundColor: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <TextArea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="输入您的问题或需求..."
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={loading || streaming}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={loading || streaming}
            disabled={!userInput.trim()}
            size="large"
          />
        </div>
        <div style={{ 
          fontSize: '12px', 
          color: '#888', 
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>按Enter发送，Shift+Enter换行</span>
          {(loading || streaming) && (
            <span style={{ color: '#1890ff' }}>
              <Spin size="small" style={{ marginRight: '4px' }} />
              正在处理...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BoardExpertPanel; 