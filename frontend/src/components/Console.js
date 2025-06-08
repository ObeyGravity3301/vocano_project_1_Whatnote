import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Console.css';

const Console = ({ isVisible, onClose, apiClient, onNavigation }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(() => {
    // 从localStorage恢复历史记录
    try {
      const saved = localStorage.getItem('whatnote-console-history');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load console history:', error);
      return [];
    }
  });
  const [commandHistory, setCommandHistory] = useState(() => {
    // 从localStorage恢复命令历史
    try {
      const saved = localStorage.getItem('whatnote-console-command-history');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load command history:', error);
      return [];
    }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [multiStepContext, setMultiStepContext] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  
  // 新增：导航状态管理
  const [currentPath, setCurrentPath] = useState(['whatnote']); // 路径数组
  const [pathContext, setPathContext] = useState({
    type: 'root', // root, course, board, pdf
    courseId: null,
    boardId: null,
    pdfId: null,
    courseName: null,
    boardName: null,
    pdfName: null
  });
  
  const inputRef = useRef(null);
  const historyRef = useRef(null);
  const consoleRef = useRef(null);

  // CLI命令列表，根据当前路径动态调整
  const getContextualCommands = () => {
    const baseCommands = ['pwd', 'cd', 'ls', 'help', 'clear', 'history', 'status', 'exit'];
    
    switch (pathContext.type) {
      case 'root':
        return [...baseCommands, 'course create', 'course list', 'course delete', 'course rename'];
      case 'course':
        return [...baseCommands, 'board create', 'board list', 'board delete', 'board open', 'pdf upload'];
      case 'board':
        return [...baseCommands, 'note generate', 'note annotate', 'board-note generate', 'pdf open', 'pdf list'];
      case 'pdf':
        return [...baseCommands, 'pdf goto', 'pdf next', 'pdf prev', 'note generate', 'note annotate', 'note improve'];
      default:
        return baseCommands;
    }
  };

  // 获取当前路径显示字符串
  const getCurrentPrompt = () => {
    const pathStr = currentPath.join('/');
    return `${pathStr}> `;
  };

  // 自动聚焦输入框并保持焦点
  useEffect(() => {
    if (isVisible && inputRef.current) {
      // 延迟聚焦确保DOM更新完成
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  }, [isVisible]);

  // 在命令执行后重新聚焦输入框
  useEffect(() => {
    if (!isLoading && isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  }, [isLoading, isVisible]);

  // 自动滚动到底部
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  // 自动补全逻辑
  const updateSuggestions = useCallback((inputValue) => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const contextualCommands = getContextualCommands();
    const filtered = contextualCommands.filter(cmd => 
      cmd.toLowerCase().startsWith(inputValue.toLowerCase())
    );

    if (filtered.length > 0 && inputValue.length > 1) {
      setSuggestions(filtered.slice(0, 5)); // 最多显示5个建议
      setShowSuggestions(true);
      setSelectedSuggestion(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [pathContext.type]);

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
    // 处理自动补全建议选择
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        return;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (selectedSuggestion >= 0) {
          setInput(suggestions[selectedSuggestion]);
        } else if (suggestions.length > 0) {
          setInput(suggestions[0]);
        }
        setShowSuggestions(false);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
        return;
      }
    }

    // 处理命令执行和历史导航
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && selectedSuggestion >= 0) {
        setInput(suggestions[selectedSuggestion]);
        setShowSuggestions(false);
      } else {
        executeCommand();
      }
    } else if (e.key === 'ArrowUp' && !showSuggestions) {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown' && !showSuggestions) {
      e.preventDefault();  
      navigateHistory('down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Tab键自动补全
      if (suggestions.length > 0) {
        setInput(suggestions[0]);
        setShowSuggestions(false);
      }
    } else if (e.key === '`' && input === '') {
      // 只有在输入框为空时才允许关闭
      e.preventDefault();
      onClose();
    }
  };

  // 修复历史记录导航
  const navigateHistory = (direction) => {
    if (commandHistory.length === 0) return;

    let newIndex;
    if (direction === 'up') {
      if (historyIndex === -1) {
        newIndex = commandHistory.length - 1;
      } else {
        newIndex = Math.max(0, historyIndex - 1);
      }
    } else { // down
      if (historyIndex === -1) {
        return; // 已经在最新位置，不做操作
      } else if (historyIndex === commandHistory.length - 1) {
        newIndex = -1; // 回到空输入状态
      } else {
        newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
      }
    }

    setHistoryIndex(newIndex);
    if (newIndex === -1) {
      setInput('');
    } else {
      setInput(commandHistory[newIndex]);
    }
    
    // 隐藏自动补全建议
    setShowSuggestions(false);
  };

  // 处理输入变化
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    setHistoryIndex(-1); // 重置历史索引
    updateSuggestions(value);
  };

  // 添加消息到历史记录
  const addToHistory = (type, content, metadata = {}) => {
    const timestamp = new Date().toLocaleTimeString();
    const newMessage = {
      id: Date.now() + Math.random(),
      type,
      content,
      timestamp,
      ...metadata
    };
    
    setHistory(prev => {
      const newHistory = [...prev, newMessage];
      // 保存到localStorage（限制最多保存100条记录）
      const historyToSave = newHistory.slice(-100);
      try {
        localStorage.setItem('whatnote-console-history', JSON.stringify(historyToSave));
      } catch (error) {
        console.warn('Failed to save console history:', error);
      }
      return newHistory;
    });
  };

  // 执行命令
  const executeCommand = async () => {
    if (!input.trim() || isLoading) return;

    const command = input.trim();
    setInput('');
    setHistoryIndex(-1);
    setShowSuggestions(false);

    // 添加到命令历史
    setCommandHistory(prev => {
      const filtered = prev.filter(cmd => cmd !== command); // 避免重复
      const newHistory = [...filtered, command];
      const historyToSave = newHistory.slice(-50); // 保留最近50条命令
      
      // 保存到localStorage
      try {
        localStorage.setItem('whatnote-console-command-history', JSON.stringify(historyToSave));
      } catch (error) {
        console.warn('Failed to save command history:', error);
      }
      
      return historyToSave;
    });

    // 添加用户输入到显示历史
    addToHistory('user', command);

    setIsLoading(true);

    try {
      // 检查是否是内置命令
      if (await handleBuiltinCommand(command)) {
        setIsLoading(false);
        // 确保输入框重新获得焦点
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }

      // 发送直接命令到后端API (不再需要LLM处理)
      const response = await apiClient.post('/api/butler/console', {
        command: command,  // 直接发送原始命令
        multi_step_context: multiStepContext,
        // 新增：发送当前路径上下文
        current_path: {
          path: currentPath,
          context: pathContext
        }
      });

      // 更安全的响应检查
      if (response && response.status === 'success') {
        const result = response.result;
        
        // 显示响应，并传递样式信息
        addToHistory('assistant', result.response, {
          type: result.type || 'response',
          style: result.style || null,  // 保存样式信息
          resultType: result.type || 'response'  // 保存结果类型用于样式判断
        });

        // 处理导航信息（新的字段名）
        if (result.navigation) {
          console.log(`🧭 [Console DEBUG] 检测到导航信息:`, result.navigation);
          updatePathContext(result.navigation);
          // 如果是导航操作，通知父组件
          if (onNavigation && result.navigation.action) {
            console.log(`📞 [Console DEBUG] 调用 onNavigation，action: ${result.navigation.action}`);
            onNavigation(result.navigation);
            console.log(`✅ [Console DEBUG] onNavigation 调用完成`);
          } else {
            console.warn(`⚠️ [Console DEBUG] onNavigation为空或navigation.action为空:`, {
              onNavigation: !!onNavigation,
              action: result.navigation.action
            });
          }
        } else {
          console.log(`❌ [Console DEBUG] 没有检测到导航信息，result:`, result);
        }

        // 🔧 修复：检查是否为创建相关命令，自动触发刷新
        const commandLower = command.toLowerCase();
        const isCreateCommand = (
          commandLower.includes('create') || 
          commandLower.includes('board create') ||
          commandLower.includes('course create') ||
          commandLower.includes('window create') ||
          commandLower.includes('new') ||
          commandLower.includes('add')
        );
        
        // 处理刷新标记
        if (result.refresh_needed || isCreateCommand) {
          // 通知父组件需要刷新
          if (onNavigation) {
            if (result.refresh_needed) {
              onNavigation({ action: 'refresh_needed' });
            } else {
              // 自动触发命令完成刷新
              onNavigation({ action: 'command_completed', command: command });
            }
          }
          addToHistory('system', '✅ 已通知界面刷新', {
            type: 'refresh_notification'
          });
        }

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

        // 更新路径上下文（兼容旧的字段名）
        if (result.path_update) {
          updatePathContext(result.path_update);
        }

      } else {
        // 处理API返回的错误
        const errorMsg = response?.detail || response?.message || '命令执行失败';
        addToHistory('error', errorMsg);
      }

    } catch (error) {
      console.error('Console command error:', error);
      
      // 更详细的错误处理
      let errorMessage = '命令执行失败';
      
      if (error.response) {
        // API返回了错误响应
        errorMessage = error.response.data?.detail || error.response.data?.message || `服务器错误: ${error.response.status}`;
      } else if (error.request) {
        // 请求发出但没有响应
        errorMessage = '网络连接超时，请检查服务器状态';
      } else {
        // 其他错误
        errorMessage = error.message || '未知错误';
      }
      
      addToHistory('error', `错误: ${errorMessage}`);
    }

    setIsLoading(false);
    // 确保输入框重新获得焦点
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 准备上下文相关的消息
  const prepareContextualMessage = (command) => {
    const pathStr = currentPath.join('/');
    let contextualCommand = command;

    // 为相对命令添加上下文
    const simpleCommands = ['create', 'list', 'delete', 'open', 'generate', 'annotate', 'improve'];
    const commandWords = command.toLowerCase().split(/\s+/);
    
    if (simpleCommands.includes(commandWords[0])) {
      switch (pathContext.type) {
        case 'course':
          if (['create', 'list', 'delete', 'open'].includes(commandWords[0])) {
            contextualCommand = `board ${command}`;
          }
          break;
        case 'board':
          if (['generate', 'annotate', 'improve'].includes(commandWords[0])) {
            contextualCommand = `note ${command}`;
          }
          break;
        case 'pdf':
          if (['generate', 'annotate', 'improve'].includes(commandWords[0])) {
            contextualCommand = `note ${command}`;
          }
          break;
      }
    }

    return `[路径: ${pathStr}] ${contextualCommand}`;
  };

  // 更新路径上下文
  const updatePathContext = (navigationInfo) => {
    if (!navigationInfo) return;
    
    // 处理新的导航格式
    if (navigationInfo.action === 'enter_course') {
      setCurrentPath(['whatnote', navigationInfo.course_name]);
      setPathContext({
        type: 'course',
        courseId: navigationInfo.course_id,
        courseName: navigationInfo.course_name,
        boardId: null,
        boardName: null,
        pdfId: null,
        pdfName: null
      });
      addToHistory('system', `✅ 已导航到课程: ${navigationInfo.course_name}`, {
        type: 'navigation_success'
      });
    } else if (navigationInfo.action === 'enter_board') {
      setCurrentPath(prev => [...prev, navigationInfo.board_name]);
      setPathContext(prev => ({
        ...prev,
        type: 'board',
        boardId: navigationInfo.board_id,
        boardName: navigationInfo.board_name
      }));
      addToHistory('system', `✅ 已导航到展板: ${navigationInfo.board_name}`, {
        type: 'navigation_success'
      });
    } else if (navigationInfo.action === 'go_back') {
      setCurrentPath(prev => prev.slice(0, -1));
      // 根据路径长度确定类型
      const newPath = currentPath.slice(0, -1);
      if (newPath.length === 1) {
        setPathContext({
          type: 'root',
          courseId: null,
          courseName: null,
          boardId: null,
          boardName: null,
          pdfId: null,
          pdfName: null
        });
      } else if (newPath.length === 2) {
        setPathContext(prev => ({
          ...prev,
          type: 'course',
          boardId: null,
          boardName: null,
          pdfId: null,
          pdfName: null
        }));
      }
      addToHistory('system', `✅ 已返回上级目录`, {
        type: 'navigation_success'
      });
    }
    
    // 兼容旧格式
    else if (navigationInfo.type === 'course_created') {
      // 课程创建后可能需要更新
    } else if (navigationInfo.type === 'board_opened') {
      // 展板打开后自动导航
      if (navigationInfo.board_name && pathContext.type === 'course') {
        setCurrentPath(prev => [...prev, navigationInfo.board_name]);
        setPathContext(prev => ({
          ...prev,
          type: 'board',
          boardId: navigationInfo.board_id,
          boardName: navigationInfo.board_name
        }));
        addToHistory('system', `已自动导航到展板: ${navigationInfo.board_name}`);
      }
    } else if (navigationInfo.type === 'pdf_opened') {
      // PDF打开后自动导航
      if (navigationInfo.pdf_name && pathContext.type === 'board') {
        setCurrentPath(prev => [...prev, navigationInfo.pdf_name]);
        setPathContext(prev => ({
          ...prev,
          type: 'pdf',
          pdfId: navigationInfo.pdf_id,
          pdfName: navigationInfo.pdf_name
        }));
        addToHistory('system', `已自动导航到PDF: ${navigationInfo.pdf_name}`);
      }
    }
  };

  // 处理内置命令
  const handleBuiltinCommand = async (command) => {
    const cmd = command.toLowerCase().trim();
    const args = command.trim().split(/\s+/);

    switch (cmd.split(' ')[0]) {
      case 'clear':
      case 'cls':
        setHistory([]);
        // 清空localStorage中的历史记录
        try {
          localStorage.removeItem('whatnote-console-history');
        } catch (error) {
          console.warn('Failed to clear console history from localStorage:', error);
        }
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

      // 新增导航命令
      case 'pwd':
        addToHistory('system', `当前路径: ${currentPath.join('/')}`);
        return true;

      case 'cd':
        await handleCdCommand(args.slice(1));
        return true;

      case 'ls':
        await handleLsCommand();
        return true;

      default:
        return false;
    }
  };

  // 处理cd命令
  const handleCdCommand = async (args) => {
    if (args.length === 0) {
      // cd 无参数，回到根目录
      setCurrentPath(['whatnote']);
      setPathContext({
        type: 'root',
        courseId: null,
        boardId: null,
        pdfId: null,
        courseName: null,
        boardName: null,
        pdfName: null
      });
      addToHistory('system', '已返回根目录');
      return;
    }

    const target = args[0];

    // 处理特殊目录
    if (target === '..' || target === '../') {
      await navigateUp();
      return;
    }

    if (target === '/' || target === '~') {
      setCurrentPath(['whatnote']);
      setPathContext({
        type: 'root',
        courseId: null,
        boardId: null,
        pdfId: null,
        courseName: null,
        boardName: null,
        pdfName: null
      });
      addToHistory('system', '已返回根目录');
      return;
    }

    // 根据当前路径上下文导航
    try {
      await navigateToTarget(target);
    } catch (error) {
      addToHistory('error', `导航失败: ${error.message}`);
    }
  };

  // 向上导航
  const navigateUp = async () => {
    if (pathContext.type === 'root') {
      addToHistory('system', '已在根目录');
      return;
    }

    switch (pathContext.type) {
      case 'pdf':
        // 从PDF回到展板
        setCurrentPath(prev => prev.slice(0, -1));
        setPathContext(prev => ({
          ...prev,
          type: 'board',
          pdfId: null,
          pdfName: null
        }));
        addToHistory('system', `已返回展板: ${pathContext.boardName}`);
        break;

      case 'board':
        // 从展板回到课程
        setCurrentPath(prev => prev.slice(0, -1));
        setPathContext(prev => ({
          ...prev,
          type: 'course',
          boardId: null,
          boardName: null
        }));
        addToHistory('system', `已返回课程: ${pathContext.courseName}`);
        break;

      case 'course':
        // 从课程回到根目录
        setCurrentPath(['whatnote']);
        setPathContext({
          type: 'root',
          courseId: null,
          courseName: null,
          boardId: null,
          boardName: null,
          pdfId: null,
          pdfName: null
        });
        addToHistory('system', '已返回根目录');
        break;
    }
  };

  // 导航到目标
  const navigateToTarget = async (target) => {
    switch (pathContext.type) {
      case 'root':
        // 在根目录，导航到课程
        await navigateToCourse(target);
        break;

      case 'course':
        // 在课程目录，导航到展板
        await navigateToBoard(target);
        break;

      case 'board':
        // 在展板目录，导航到PDF
        await navigateToPdf(target);
        break;

      case 'pdf':
        addToHistory('error', 'PDF是最深层级，无法继续导航');
        break;

      default:
        addToHistory('error', '未知的路径上下文');
    }
  };

  // 导航到课程
  const navigateToCourse = async (courseName) => {
    // 直接使用cd命令验证和导航
    try {
      const response = await apiClient.post('/api/butler/console', {
        command: `cd "${courseName}"`,
        current_path: {
          path: currentPath,
          context: pathContext
        }
      });

      // 检查响应是否为导航成功
      if (response && response.status === 'success' && response.result) {
        if (response.result.navigation && response.result.navigation.action === 'enter_course') {
          // 导航成功 - 后端已经处理了验证和导航逻辑
          const courseInfo = response.result.navigation;
          
          // 更新控制台内部状态
          setCurrentPath(['whatnote', courseInfo.course_name]);
          setPathContext({
            type: 'course',
            courseName: courseInfo.course_name,
            courseId: courseInfo.course_id,
            boardId: null,
            pdfId: null,
            boardName: null,
            pdfName: null
          });
          
          // 显示后端返回的响应消息
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
          
          // 如果有导航回调，通知父组件
          if (onNavigation && onNavigation.navigateToCourse) {
            onNavigation.navigateToCourse(courseInfo.course_name);
          }
        } else if (response.result.type === 'error') {
          // 验证失败 - 显示错误信息
          addToHistory('error', response.result.response);
        } else {
          // 其他响应类型
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
        }
      } else {
        // 处理API错误
        const errorMsg = response?.detail || response?.message || '命令执行失败';
        addToHistory('error', errorMsg);
      }
    } catch (error) {
      console.error('Navigate to course error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || '网络连接失败';
      addToHistory('error', `无法导航到课程: ${errorMsg}`);
    }
  };

  // 导航到展板
  const navigateToBoard = async (boardName) => {
    try {
      const response = await apiClient.post('/api/butler/console', {
        command: `cd "${boardName}"`,
        current_path: {
          path: currentPath,
          context: pathContext
        }
      });

      // 检查响应是否为导航成功
      if (response && response.status === 'success' && response.result) {
        if (response.result.navigation && response.result.navigation.action === 'enter_board') {
          // 导航成功
          const boardInfo = response.result.navigation;
          
          // 更新控制台内部状态
          setCurrentPath(prev => [...prev, boardInfo.board_name]);
          setPathContext(prev => ({
            ...prev,
            type: 'board',
            boardName: boardInfo.board_name,
            boardId: boardInfo.board_id
          }));
          
          // 显示后端返回的响应消息
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
          
          // 如果有导航回调，通知父组件
          if (onNavigation && onNavigation.navigateToBoard) {
            onNavigation.navigateToBoard(boardInfo.board_name);
          }
        } else if (response.result.type === 'error') {
          // 验证失败
          addToHistory('error', response.result.response);
        } else {
          // 其他响应类型
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
        }
      } else {
        // 处理API错误
        const errorMsg = response?.detail || response?.message || '命令执行失败';
        addToHistory('error', errorMsg);
      }
    } catch (error) {
      console.error('Navigate to board error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || '网络连接失败';
      addToHistory('error', `无法导航到展板: ${errorMsg}`);
    }
  };

  // 导航到PDF
  const navigateToPdf = async (pdfName) => {
    try {
      const response = await apiClient.post('/api/butler/console', {
        command: `cd "${pdfName}"`,
        current_path: {
          path: currentPath,
          context: pathContext
        }
      });

      // 检查响应是否为导航成功
      if (response && response.status === 'success' && response.result) {
        if (response.result.navigation && response.result.navigation.action === 'open_pdf') {
          // PDF打开成功
          const pdfInfo = response.result.navigation;
          
          // 更新控制台内部状态
          setCurrentPath(prev => [...prev, pdfInfo.pdf_name]);
          setPathContext(prev => ({
            ...prev,
            type: 'pdf',
            pdfName: pdfInfo.pdf_name,
            pdfId: null
          }));
          
          // 显示后端返回的响应消息
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
          
          // 如果有导航回调，通知父组件
          if (onNavigation && onNavigation.navigateToPdf) {
            const currentBoardId = pathContext.type === 'board' ? pathContext.boardId : 
                                 (pathContext.type === 'course' ? pathContext.courseName : null);
            onNavigation.navigateToPdf(pdfInfo.pdf_name, currentBoardId);
          }
        } else if (response.result.type === 'error') {
          // 验证失败
          addToHistory('error', response.result.response);
        } else {
          // 其他响应类型
          addToHistory('assistant', response.result.response, {
            type: response.result.type,
            style: response.result.style
          });
        }
      } else {
        // 处理API错误
        const errorMsg = response?.detail || response?.message || '命令执行失败';
        addToHistory('error', errorMsg);
      }
    } catch (error) {
      console.error('Navigate to PDF error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || '网络连接失败';
      addToHistory('error', `无法打开PDF: ${errorMsg}`);
    }
  };

  // 处理ls命令
  const handleLsCommand = async () => {
    try {
      const response = await apiClient.post('/api/butler/console', {
        command: 'ls',
        multi_step_context: multiStepContext,
        current_path: {
          path: currentPath,
          context: pathContext
        }
      });

      // 更安全的响应检查
      if (response && response.status === 'success') {
        const result = response.result;
        addToHistory('assistant', result.response, {
          type: 'directory_listing'
        });

        // 如果有具体的文件列表，也显示
        if (result.command_result) {
          const listResult = result.command_result;
          if (listResult.course_folders && listResult.course_folders.length > 0) {
            addToHistory('system', `课程文件夹: ${listResult.course_folders.join(', ')}`);
          }
          if (listResult.boards && listResult.boards.length > 0) {
            addToHistory('system', `展板: ${listResult.boards.join(', ')}`);
          }
          if (listResult.pdf_files && listResult.pdf_files.length > 0) {
            addToHistory('system', `PDF文件: ${listResult.pdf_files.join(', ')}`);
          }
        }
      } else {
        const errorMsg = response?.detail || response?.message || '无法列出目录内容';
        addToHistory('error', errorMsg);
      }
    } catch (error) {
      console.error('List directory error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || '网络连接失败';
      addToHistory('error', `列出目录失败: ${errorMsg}`);
    }
  };

  // 显示改进的帮助信息
  const showHelp = () => {
    const currentContext = pathContext.type;
    const pathStr = currentPath.join('/');
    
    const helpText = `
🎯 WhatNote 控制台帮助 - 当前位置: ${pathStr}

🧭 导航命令:
  pwd                       显示当前路径
  cd <目标>                 切换到目标目录
  cd ..                     返回上级目录
  cd / 或 cd ~              返回根目录
  ls                        列出当前目录内容

📚 在 ${currentContext} 可用的命令:
${getContextualHelpCommands(currentContext)}

🗨️ 自然语言 (智能理解):
  "请帮我创建一个机器学习的课程文件夹"
  "我想查看当前系统状态"
  "生成当前页面的详细注释"

💡 快捷操作:
  ↑/↓     浏览命令历史
  Tab     自动补全命令
  Enter   执行命令
  Esc     关闭控制台
  \`       切换控制台

🔧 内置命令:
  help    显示帮助
  clear   清空控制台
  history 命令历史
  status  系统状态
  exit    关闭控制台

💡 使用示例:
  ${getUsageExamples(currentContext)}
    `;
    addToHistory('system', helpText.trim());
  };

  // 获取上下文相关的帮助命令
  const getContextualHelpCommands = (context) => {
    switch (context) {
      case 'root':
        return `  course create "名称"       创建课程文件夹
  course list               列出所有课程
  course delete "名称"      删除课程
  cd <课程名>               进入课程目录`;
      case 'course':
        return `  board create "名称"        创建展板
  board list                列出当前课程的展板
  board open "名称"         打开展板
  pdf upload                上传PDF文件
  cd <展板名>               进入展板目录`;
      case 'board':
        return `  note generate             生成笔记
  note annotate             添加注释
  board-note generate       生成展板笔记
  pdf open "名称"           打开PDF
  pdf list                  列出PDF文件
  cd <PDF名>                进入PDF文件`;
      case 'pdf':
        return `  pdf goto <页码>           跳转到指定页面
  pdf next                  下一页
  pdf prev                  上一页
  note generate             生成当前页笔记
  note annotate             添加页面注释
  note improve              改进现有注释`;
      default:
        return '  未知上下文';
    }
  };

  // 获取使用示例
  const getUsageExamples = (context) => {
    switch (context) {
      case 'root':
        return `cd "机器学习课程"  # 进入课程
  course create "数据结构"  # 创建新课程`;
      case 'course':
        return `cd "第一章"  # 进入展板
  create "作业展板"  # 创建展板（自动识别为board create）`;
      case 'board':
        return `cd "教材.pdf"  # 进入PDF
  generate  # 生成笔记（自动识别为note generate）`;
      case 'pdf':
        return `pdf goto 25  # 跳转到第25页
  annotate  # 添加注释（自动识别为note annotate）`;
      default:
        return '无示例';
    }
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
      const response = await apiClient.get('/api/butler/status');
      
      // 更安全的响应检查
      if (response && response.status === 'success') {
        const status = response.data;
        const statusText = `
系统状态:
  应用状态: ${status.app_state || '运行中'}
  活跃展板: ${status.active_boards || 0}
  文件数量: ${status.file_count || 0}
  多步操作: ${multiStepContext?.active ? '进行中' : '无'}
        `.trim();
        addToHistory('system', statusText);
      } else {
        const errorMsg = response?.detail || response?.message || '无法获取系统状态';
        addToHistory('error', errorMsg);
      }
    } catch (error) {
      console.error('Get status error:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || '网络连接失败';
      addToHistory('error', `获取系统状态失败: ${errorMsg}`);
    }
  };

  // 渲染消息
  const renderMessage = (msg) => {
    const className = `console-message console-${msg.type}`;
    
    // 解析后端返回的CSS样式字符串
    const parseInlineStyle = (styleString) => {
      if (!styleString) return {};
      
      const styleObj = {};
      const styles = styleString.split(';').filter(s => s.trim());
      
      styles.forEach(style => {
        const [property, value] = style.split(':').map(s => s.trim());
        if (property && value) {
          // 转换CSS属性名为camelCase
          const camelProperty = property.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
          styleObj[camelProperty] = value;
        }
      });
      
      return styleObj;
    };
    
    const contentStyle = msg.style ? parseInlineStyle(msg.style) : {};
    
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
        <pre 
          className="console-content" 
          style={contentStyle}
        >
          {msg.content}
        </pre>
      </div>
    );
  };

  // 渲染自动补全建议
  const renderSuggestions = () => {
    if (!showSuggestions || suggestions.length === 0) return null;

    return (
      <div className="console-suggestions">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion}
            className={`console-suggestion ${index === selectedSuggestion ? 'selected' : ''}`}
            onClick={() => {
              setInput(suggestion);
              setShowSuggestions(false);
              inputRef.current?.focus();
            }}
          >
            {suggestion}
          </div>
        ))}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className="console-overlay">
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
              <p>🎯 欢迎使用 WhatNote 智能控制台</p>
              <p>💡 支持CLI指令和自然语言，输入 "help" 查看帮助</p>
              <p>⚡ 使用Tab键自动补全，↑↓键浏览历史</p>
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
          {renderSuggestions()}
          <span className="console-prompt" data-context={pathContext.type}>
            {getCurrentPrompt()}
          </span>
          <input
            ref={inputRef}
            type="text"
            className="console-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="输入CLI指令或自然语言..."
            disabled={isLoading}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
};

export default Console; 