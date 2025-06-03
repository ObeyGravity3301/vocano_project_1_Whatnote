import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Console.css';

const Console = ({ isVisible, onClose, apiClient }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [multiStepContext, setMultiStepContext] = useState(null);
  
  const inputRef = useRef(null);
  const historyRef = useRef(null);
  const consoleRef = useRef(null);

  // 自动聚焦输入框
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  // 自动滚动到底部
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e) => {
    if (!isVisible) return;

    if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      // 如果焦点在输入框内，不关闭控制台
      if (document.activeElement === inputRef.current) {
        return;
      }
      e.preventDefault();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [isVisible, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 输入框键盘事件
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    } else if (e.key === '`' && input === '') {
      // 只有在输入框为空时才允许关闭
      e.preventDefault();
      onClose();
    }
  };

  // 历史记录导航
  const navigateHistory = (direction) => {
    if (commandHistory.length === 0) return;

    let newIndex;
    if (direction === 'up') {
      newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
    } else {
      newIndex = historyIndex === -1 ? -1 : Math.min(commandHistory.length - 1, historyIndex + 1);
      if (newIndex === commandHistory.length - 1) newIndex = -1;
    }

    setHistoryIndex(newIndex);
    setInput(newIndex === -1 ? '' : commandHistory[newIndex]);
  };

  // 添加消息到历史记录
  const addToHistory = (type, content, metadata = {}) => {
    const timestamp = new Date().toLocaleTimeString();
    setHistory(prev => [...prev, {
      id: Date.now() + Math.random(),
      type,
      content,
      timestamp,
      ...metadata
    }]);
  };

  // 执行命令
  const executeCommand = async () => {
    if (!input.trim() || isLoading) return;

    const command = input.trim();
    setInput('');
    setHistoryIndex(-1);

    // 添加到命令历史
    setCommandHistory(prev => {
      const newHistory = [...prev, command];
      return newHistory.slice(-50); // 保留最近50条命令
    });

    // 添加用户输入到显示历史
    addToHistory('user', command);

    setIsLoading(true);

    try {
      // 检查是否是内置命令
      if (await handleBuiltinCommand(command)) {
        setIsLoading(false);
        return;
      }

      // 发送到管家LLM
      const response = await apiClient.post('/butler/console', {
        command: command,
        multi_step_context: multiStepContext
      });

      if (response.data.status === 'success') {
        const result = response.data.result;
        
        // 显示响应
        addToHistory('assistant', result.response, {
          type: result.type || 'response'
        });

        // 处理多步操作
        if (result.multi_step_context) {
          setMultiStepContext(result.multi_step_context);
          if (result.multi_step_context.active) {
            addToHistory('system', `多步操作已启动: ${result.multi_step_context.task}`, {
              type: 'multi_step_start'
            });
          }
        }

        // 处理function call结果
        if (result.function_calls && result.function_calls.length > 0) {
          result.function_calls.forEach(call => {
            addToHistory('function', `执行: ${call.function} - ${call.result}`, {
              type: 'function_call',
              function: call.function,
              args: call.args,
              result: call.result
            });
          });
        }

      } else {
        addToHistory('error', response.data.message || '命令执行失败');
      }

    } catch (error) {
      console.error('Console command error:', error);
      addToHistory('error', `错误: ${error.response?.data?.detail || error.message}`);
    }

    setIsLoading(false);
  };

  // 处理内置命令
  const handleBuiltinCommand = async (command) => {
    const cmd = command.toLowerCase().trim();

    switch (cmd) {
      case 'clear':
      case 'cls':
        setHistory([]);
        addToHistory('system', '控制台已清空');
        return true;

      case 'help':
        showHelp();
        return true;

      case 'history':
        showCommandHistory();
        return true;

      case 'status':
        await showStatus();
        return true;

      case 'exit':
      case 'quit':
        onClose();
        return true;

      default:
        return false;
    }
  };

  // 显示帮助信息
  const showHelp = () => {
    const helpText = `
WhatNote 控制台帮助

内置命令:
  clear/cls    - 清空控制台
  help         - 显示此帮助信息
  history      - 显示命令历史
  status       - 显示系统状态
  exit/quit    - 关闭控制台

管家LLM功能:
  - 直接输入自然语言指令
  - 支持多步操作和function calling
  - 可以管理文件结构和展板
  - 协调各展板的专家LLM

快捷键:
  \` (反引号)   - 打开/关闭控制台
  Escape      - 关闭控制台
  ↑/↓         - 浏览命令历史
  Enter       - 执行命令

示例命令:
  "创建一个新的课程文件夹"
  "列出所有PDF文件"
  "帮我整理文件结构"
  "查看当前展板状态"
    `;
    addToHistory('system', helpText.trim());
  };

  // 显示命令历史
  const showCommandHistory = () => {
    if (commandHistory.length === 0) {
      addToHistory('system', '暂无命令历史');
      return;
    }

    const historyText = commandHistory
      .slice(-10)
      .map((cmd, index) => `${commandHistory.length - 10 + index + 1}. ${cmd}`)
      .join('\n');
    
    addToHistory('system', `最近命令历史:\n${historyText}`);
  };

  // 显示系统状态
  const showStatus = async () => {
    try {
      const response = await apiClient.get('/butler/status');
      if (response.data.status === 'success') {
        const status = response.data.data;
        const statusText = `
系统状态:
  应用状态: ${status.app_state || '运行中'}
  活跃展板: ${status.active_boards || 0}
  文件数量: ${status.file_count || 0}
  多步操作: ${multiStepContext?.active ? '进行中' : '无'}
        `.trim();
        addToHistory('system', statusText);
      }
    } catch (error) {
      addToHistory('error', '获取系统状态失败');
    }
  };

  // 渲染消息
  const renderMessage = (msg) => {
    const className = `console-message console-${msg.type}`;
    
    return (
      <div key={msg.id} className={className}>
        <span className="console-timestamp">{msg.timestamp}</span>
        <span className="console-prefix">
          {msg.type === 'user' && '> '}
          {msg.type === 'assistant' && '< '}
          {msg.type === 'system' && '# '}
          {msg.type === 'error' && '! '}
          {msg.type === 'function' && '@ '}
        </span>
        <pre className="console-content">{msg.content}</pre>
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className="console-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="console-container" ref={consoleRef}>
        <div className="console-header">
          <span className="console-title">WhatNote 控制台</span>
          <div className="console-controls">
            {multiStepContext?.active && (
              <span className="console-multi-step">
                多步操作: {multiStepContext.current_step + 1}/{multiStepContext.steps.length}
              </span>
            )}
            <button className="console-close" onClick={onClose}>×</button>
          </div>
        </div>
        
        <div className="console-history" ref={historyRef}>
          {history.length === 0 && (
            <div className="console-welcome">
              <p>欢迎使用 WhatNote 控制台</p>
              <p>输入 "help" 查看帮助信息</p>
            </div>
          )}
          {history.map(renderMessage)}
          {isLoading && (
            <div className="console-message console-loading">
              <span className="console-timestamp">{new Date().toLocaleTimeString()}</span>
              <span className="console-prefix">...</span>
              <span className="console-content">处理中...</span>
            </div>
          )}
        </div>

        <div className="console-input-container">
          <span className="console-prompt">$</span>
          <input
            ref={inputRef}
            type="text"
            className="console-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="输入命令或自然语言指令..."
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default Console; 