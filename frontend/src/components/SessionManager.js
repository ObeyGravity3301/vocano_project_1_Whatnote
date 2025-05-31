import React, { createContext, useContext, useState, useEffect } from 'react';

// 创建会话上下文
const SessionContext = createContext();

// 会话管理提供者组件
export const SessionProvider = ({ children }) => {
  // 从本地存储中获取会话ID，如果没有则为null
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('whatnote_session_id') || null;
  });
  
  // 当前活动文件ID
  const [currentFileId, setCurrentFileId] = useState(null);
  
  // 会话ID映射 - 为每个文件保存不同的会话ID
  const [sessionMap, setSessionMap] = useState(() => {
    const savedMap = localStorage.getItem('whatnote_session_map');
    return savedMap ? JSON.parse(savedMap) : {};
  });
  
  // 当会话映射更改时，保存到本地存储
  useEffect(() => {
    localStorage.setItem('whatnote_session_map', JSON.stringify(sessionMap));
  }, [sessionMap]);
  
  // 获取指定文件的会话ID
  const getSessionId = (fileId) => {
    return sessionMap[fileId] || null;
  };
  
  // 设置指定文件的会话ID
  const setFileSessionId = (fileId, newSessionId) => {
    setSessionMap(prevMap => ({
      ...prevMap,
      [fileId]: newSessionId
    }));
    
    // 如果是当前活动文件，也更新当前会话ID
    if (fileId === currentFileId) {
      setSessionId(newSessionId);
      localStorage.setItem('whatnote_session_id', newSessionId);
    }
  };
  
  // 切换当前活动文件
  const switchFile = (fileId) => {
    setCurrentFileId(fileId);
    const fileSessionId = sessionMap[fileId] || null;
    setSessionId(fileSessionId);
    localStorage.setItem('whatnote_session_id', fileSessionId || '');
  };
  
  // 创建新会话
  const createNewSession = (fileId) => {
    // 这里在前端生成UUID，实际上后端API也会生成
    // 但这样可以在前端立即使用新的会话ID
    const newSessionId = crypto.randomUUID();
    setFileSessionId(fileId, newSessionId);
    return newSessionId;
  };
  
  // 清除指定文件的会话
  const clearSession = (fileId) => {
    const newSessionMap = { ...sessionMap };
    delete newSessionMap[fileId];
    setSessionMap(newSessionMap);
    
    if (fileId === currentFileId) {
      setSessionId(null);
      localStorage.removeItem('whatnote_session_id');
    }
  };
  
  // 清除所有会话
  const clearAllSessions = () => {
    setSessionMap({});
    setSessionId(null);
    localStorage.removeItem('whatnote_session_id');
    localStorage.removeItem('whatnote_session_map');
  };
  
  // 更新会话ID (当API返回新会话ID时)
  const updateSessionId = (fileId, newSessionId) => {
    if (!newSessionId) return;
    
    setFileSessionId(fileId, newSessionId);
  };
  
  return (
    <SessionContext.Provider 
      value={{
        sessionId,
        currentFileId,
        getSessionId,
        switchFile,
        createNewSession,
        clearSession,
        clearAllSessions,
        updateSessionId
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

// 自定义Hook，用于在组件中访问会话管理功能
export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession必须在SessionProvider内部使用');
  }
  return context;
};

// 使用示例
export const SessionExample = () => {
  const { 
    sessionId, 
    currentFileId,
    switchFile, 
    createNewSession,
    clearSession,
    updateSessionId
  } = useSession();
  
  // 示例API调用函数 - 生成注释
  const generateAnnotation = async (filename, pageNumber, forceVision = false) => {
    try {
      // 在URL中添加会话ID参数
      const url = `/materials/${filename}/pages/${pageNumber}/annotate?force_vision=${forceVision}${sessionId ? `&session_id=${sessionId}` : ''}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      // 如果API返回了会话ID，更新本地存储
      if (data.session_id) {
        updateSessionId(filename, data.session_id);
      }
      
      return data;
    } catch (error) {
      console.error("生成注释失败:", error);
      throw error;
    }
  };
  
  // 示例API调用函数 - 改进笔记
  const improveNote = async (filename, content, improvePrompt) => {
    try {
      const response = await fetch(`/materials/${filename}/improve-note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          improve_prompt: improvePrompt,
          session_id: sessionId // 在请求体中发送会话ID
        }),
      });
      
      const data = await response.json();
      
      // 如果API返回了会话ID，更新本地存储
      if (data.session_id) {
        updateSessionId(filename, data.session_id);
      }
      
      return data.improved_note;
    } catch (error) {
      console.error("改进笔记失败:", error);
      throw error;
    }
  };
  
  return (
    <div>
      <h3>当前会话ID: {sessionId || '无'}</h3>
      <h4>当前文件: {currentFileId || '无'}</h4>
      <button onClick={() => switchFile('example.pdf')}>
        切换到示例文件
      </button>
      <button onClick={() => createNewSession('example.pdf')}>
        创建新会话
      </button>
      <button onClick={() => clearSession('example.pdf')}>
        清除会话
      </button>
    </div>
  );
};

export default SessionProvider; 