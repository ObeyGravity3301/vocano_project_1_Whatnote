import React, { useState, useEffect, useRef } from 'react';
import './AnnotationStyleSelector.css';

const AnnotationStyleSelector = ({ boardId, apiClient, onStyleChange }) => {
  const [currentStyle, setCurrentStyle] = useState('detailed');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  
  // 🔧 新增：使用ref跟踪当前展板ID，避免重复加载
  const currentBoardRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // 获取API基础URL
  const getApiUrl = (path) => {
    // 优先使用相对路径（通过代理）
    // 如果失败，则回退到直接访问后端
    return path;
  };

  const styleOptions = [
    {
      value: 'keywords',
      label: '关键词解释',
      description: '提取关键概念，中英对照',
      icon: '🔑'
    },
    {
      value: 'translation',
      label: '文本翻译',
      description: '单纯翻译文本内容',
      icon: '🌐'
    },
    {
      value: 'detailed',
      label: '详细注释',
      description: '深入的学术分析注释',
      icon: '📚'
    },
    {
      value: 'custom',
      label: '自定义',
      description: '使用自定义提示词',
      icon: '⚙️'
    }
  ];

  // 🔧 修复：确保每次boardId变化时都重新加载风格
  useEffect(() => {
    if (boardId && boardId !== currentBoardRef.current) {
      console.log(`🎨 [StyleSelector] 展板切换，重新加载风格: ${boardId}`);
      currentBoardRef.current = boardId;
      loadCurrentStyle();
    }
  }, [boardId]);

  // 🔧 修复：组件挂载时立即加载当前风格
  useEffect(() => {
    if (boardId) {
      console.log(`🎨 [StyleSelector] 组件挂载，加载风格: ${boardId}`);
      loadCurrentStyle();
    }
  }, []);

  const loadCurrentStyle = async () => {
    if (!boardId) {
      console.warn('🎨 [StyleSelector] 没有boardId，跳过风格加载');
      return;
    }

    try {
      setIsLoading(true);
      console.log(`🎨 [StyleSelector] 开始加载展板 ${boardId} 的风格设置`);
      
      const url = getApiUrl(`/api/boards/${boardId}/annotation-style`);
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const style = data.annotation_style || 'detailed';
        const prompt = data.custom_prompt || '';
        
        console.log(`✅ [StyleSelector] 风格加载成功: ${style}`);
        
        // 🔧 关键修复：立即更新UI状态并记录时间
        setCurrentStyle(style);
        setCustomPrompt(prompt);
        setShowCustomInput(style === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        // 🔧 立即通知父组件当前风格
        if (onStyleChange) {
          onStyleChange(style, prompt);
        }
        
        console.log(`🎨 [StyleSelector] UI状态已更新为: ${style}`);
        
      } else {
        console.error(`❌ [StyleSelector] 加载风格失败: ${response.status}`);
        // 如果代理失败，尝试直接访问后端
        if (response.status === 404) {
          await loadCurrentStyleDirect();
        }
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 加载风格异常:', error);
      // 网络错误时尝试直接访问后端
      await loadCurrentStyleDirect();
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentStyleDirect = async () => {
    try {
      const directUrl = `http://127.0.0.1:8000/api/boards/${boardId}/annotation-style`;
      console.log('🔗 [StyleSelector] 尝试直接访问后端:', directUrl);
      const response = await fetch(directUrl);
      if (response.ok) {
        const data = await response.json();
        const style = data.annotation_style || 'detailed';
        const prompt = data.custom_prompt || '';
        
        console.log(`✅ [StyleSelector] 直接访问成功，风格: ${style}`);
        
        setCurrentStyle(style);
        setCustomPrompt(prompt);
        setShowCustomInput(style === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        if (onStyleChange) {
          onStyleChange(style, prompt);
        }
        console.log('✅ [StyleSelector] 直接访问后端成功');
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 直接访问后端也失败:', error);
    }
  };

  const handleStyleChange = async (newStyle) => {
    // 🔧 修复：防止重复点击
    if (isLoading || newStyle === currentStyle) {
      console.log(`🎨 [StyleSelector] 风格已是 ${newStyle} 或正在加载，跳过`);
      return;
    }

    try {
      setIsLoading(true);
      console.log(`🎨 [StyleSelector] 用户切换风格: ${currentStyle} → ${newStyle}`);
      
      const requestData = {
        style: newStyle,
        custom_prompt: newStyle === 'custom' ? customPrompt : ''
      };

      const url = getApiUrl(`/api/boards/${boardId}/annotation-style`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        console.log(`✅ [StyleSelector] 风格设置成功: ${newStyle}`);
        
        // 🔧 关键修复：立即更新UI状态
        setCurrentStyle(newStyle);
        setShowCustomInput(newStyle === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        // 🔧 立即通知父组件
        if (onStyleChange) {
          onStyleChange(newStyle, requestData.custom_prompt);
        }
        
        // 🔧 新增：延迟验证风格是否正确保存
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        syncTimeoutRef.current = setTimeout(async () => {
          try {
            console.log(`🔍 [StyleSelector] 验证风格是否正确保存: ${newStyle}`);
            const verifyResponse = await fetch(url);
            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              const savedStyle = verifyData.annotation_style;
              
              if (savedStyle === newStyle) {
                console.log(`✅ [StyleSelector] 风格验证成功: ${savedStyle}`);
              } else {
                console.error(`❌ [StyleSelector] 风格验证失败! UI显示: ${newStyle}, 后端保存: ${savedStyle}`);
                // 如果不一致，重新加载正确的状态
                console.log('🔄 [StyleSelector] 重新同步正确的风格状态');
                await loadCurrentStyle();
              }
            }
          } catch (e) {
            console.warn('⚠️ [StyleSelector] 风格验证失败:', e);
          }
        }, 1500);
        
      } else {
        console.error(`❌ [StyleSelector] 设置注释风格失败: ${response.status}`);
        // 如果代理失败，尝试直接访问后端
        if (response.status === 404) {
          await handleStyleChangeDirect(newStyle, requestData);
        }
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 设置注释风格失败:', error);
      // 网络错误时尝试直接访问后端
      await handleStyleChangeDirect(newStyle, {
        style: newStyle,
        custom_prompt: newStyle === 'custom' ? customPrompt : ''
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStyleChangeDirect = async (newStyle, requestData) => {
    try {
      const directUrl = `http://127.0.0.1:8000/api/boards/${boardId}/annotation-style`;
      console.log('🔗 [StyleSelector] 尝试直接设置风格到后端:', directUrl);
      const response = await fetch(directUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        setCurrentStyle(newStyle);
        setShowCustomInput(newStyle === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        if (onStyleChange) {
          onStyleChange(newStyle, requestData.custom_prompt);
        }
        console.log('✅ [StyleSelector] 直接设置后端风格成功:', newStyle);
      } else {
        console.error('❌ [StyleSelector] 直接设置后端风格也失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 直接设置后端风格异常:', error);
    }
  };

  const handleCustomPromptChange = async (newPrompt) => {
    setCustomPrompt(newPrompt);
    
    if (currentStyle === 'custom') {
      // 延迟保存自定义提示词
      clearTimeout(window.customPromptSaveTimeout);
      window.customPromptSaveTimeout = setTimeout(async () => {
        try {
          const url = getApiUrl(`/api/boards/${boardId}/annotation-style`);
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              style: 'custom',
              custom_prompt: newPrompt
            })
          });
          
          if (response.ok) {
            if (onStyleChange) {
              onStyleChange('custom', newPrompt);
            }
            console.log('✅ [StyleSelector] 自定义提示保存成功');
          } else if (response.status === 404) {
            // 尝试直接访问后端
            await handleStyleChangeDirect('custom', {
              style: 'custom',
              custom_prompt: newPrompt
            });
          }
        } catch (error) {
          console.error('❌ [StyleSelector] 保存自定义提示词失败:', error);
          // 尝试直接访问后端
          await handleStyleChangeDirect('custom', {
            style: 'custom',
            custom_prompt: newPrompt
          });
        }
      }, 1000); // 1秒后保存
    }
  };

  // 🔧 新增：提供手动同步方法
  const forceSync = async () => {
    console.log('🔄 [StyleSelector] 手动强制同步风格状态');
    await loadCurrentStyle();
  };

  // 🔧 新增：开发模式下暴露调试信息
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.debugStyleSelector = {
        boardId,
        currentStyle,
        customPrompt,
        lastSyncTime,
        forceSync,
        component: 'AnnotationStyleSelector'
      };
    }
  }, [boardId, currentStyle, customPrompt, lastSyncTime]);

  return (
    <div className="annotation-style-selector">
      <div className="selector-header">
        <span className="selector-label">
          注释风格
          {/* 🔧 新增：显示最后同步时间 */}
          {lastSyncTime && (
            <small style={{color: '#666', marginLeft: '8px', fontSize: '11px'}}>
              (同步: {new Date(lastSyncTime).toLocaleTimeString()})
            </small>
          )}
        </span>
        {isLoading && <div className="loading-indicator">⏳</div>}
        
        {/* 🔧 新增：开发模式调试信息 */}
        {process.env.NODE_ENV === 'development' && (
          <small style={{display: 'block', color: '#999', fontSize: '10px', marginTop: '2px'}}>
            [Debug] Board: {boardId} | Style: {currentStyle}
          </small>
        )}
      </div>
      
      <div className="style-options">
        {styleOptions.map((option) => (
          <button
            key={option.value}
            className={`style-option ${currentStyle === option.value ? 'active' : ''}`}
            onClick={() => handleStyleChange(option.value)}
            disabled={isLoading}
            title={`${option.description}${currentStyle === option.value ? ' (当前选中)' : ''}`}
          >
            <span className="style-icon">{option.icon}</span>
            <span className="style-label">{option.label}</span>
            {/* 🔧 新增：当前选中状态指示器 */}
            {currentStyle === option.value && (
              <span className="active-indicator" style={{marginLeft: '4px', color: '#1890ff'}}>✓</span>
            )}
          </button>
        ))}
      </div>

      {showCustomInput && (
        <div className="custom-prompt-section">
          <label className="custom-prompt-label">自定义提示词：</label>
          <textarea
            className="custom-prompt-input"
            value={customPrompt}
            onChange={(e) => handleCustomPromptChange(e.target.value)}
            placeholder="请输入您的自定义注释生成提示词..."
            rows={3}
          />
          <div className="custom-prompt-help">
            提示：您可以指定特定的注释格式、重点关注的方面或分析角度
          </div>
        </div>
      )}
      
      {/* 🔧 新增：开发模式下的手动同步按钮 */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{marginTop: '8px', textAlign: 'center'}}>
          <button 
            onClick={forceSync} 
            style={{
              fontSize: '11px', 
              padding: '2px 6px', 
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              background: '#fafafa',
              cursor: 'pointer'
            }}
            disabled={isLoading}
          >
            🔄 强制同步
          </button>
        </div>
      )}
    </div>
  );
};

export default AnnotationStyleSelector; 