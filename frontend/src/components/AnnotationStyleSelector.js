import React, { useState, useEffect, useRef } from 'react';
import './AnnotationStyleSelector.css';

const AnnotationStyleSelector = ({ boardId, apiClient, onStyleChange }) => {
  const [currentStyle, setCurrentStyle] = useState('detailed');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  
  // 🎯 新增：自定义提示词方案管理
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [showPromptManager, setShowPromptManager] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(null);
  
  // 🎯 新增：界面折叠控制
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // 🔧 新增：使用ref跟踪当前展板ID，避免重复加载
  const currentBoardRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // 获取API基础URL
  const getApiUrl = (path) => {
    // 优先使用相对路径（通过代理）
    // 如果失败，则回退到直接访问后端
    return path;
  };

  // 🎯 新增：默认提示词方案
  const defaultPrompts = [
    {
      id: 'academic',
      name: '学术分析',
      prompt: '请对这段内容进行深入的学术分析，包括：\n1. 核心概念和理论背景\n2. 关键观点和论证逻辑\n3. 与其他理论的联系\n4. 实际应用价值\n请用专业术语和学术语言进行注释。',
      isDefault: true
    },
    {
      id: 'simple',
      name: '简明扼要',
      prompt: '请用简洁明了的语言解释这段内容的核心要点，适合快速理解和记忆。重点突出：\n1. 主要概念\n2. 关键信息\n3. 实用性总结',
      isDefault: true
    },
    {
      id: 'exam_prep',
      name: '考试重点',
      prompt: '请从考试复习的角度分析这段内容，标注：\n1. 可能的考点\n2. 重要概念定义\n3. 需要记忆的关键信息\n4. 相关的思考题或练习建议',
      isDefault: true
    },
    {
      id: 'practical',
      name: '实践应用',
      prompt: '请重点分析这段内容的实际应用价值：\n1. 现实中的应用场景\n2. 具体的操作方法\n3. 可能遇到的问题和解决方案\n4. 相关的案例和经验',
      isDefault: true
    }
  ];

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

  // 🎯 新增：加载保存的提示词方案
  const loadSavedPrompts = () => {
    try {
      const saved = localStorage.getItem('whatnote_custom_prompts');
      if (saved) {
        const userPrompts = JSON.parse(saved);
        setSavedPrompts([...defaultPrompts, ...userPrompts]);
      } else {
        setSavedPrompts(defaultPrompts);
      }
    } catch (error) {
      console.error('加载提示词方案失败:', error);
      setSavedPrompts(defaultPrompts);
    }
  };

  // 🎯 新增：保存提示词方案到本地存储
  const savePromptsToStorage = (prompts) => {
    try {
      const userPrompts = prompts.filter(p => !p.isDefault);
      localStorage.setItem('whatnote_custom_prompts', JSON.stringify(userPrompts));
    } catch (error) {
      console.error('保存提示词方案失败:', error);
    }
  };

  // 🎯 新增：添加新的提示词方案
  const handleAddPrompt = () => {
    if (!newPromptName.trim() || !customPrompt.trim()) {
      alert('请输入方案名称和提示词内容');
      return;
    }

    const newPrompt = {
      id: `user_${Date.now()}`,
      name: newPromptName.trim(),
      prompt: customPrompt.trim(),
      isDefault: false,
      createdAt: new Date().toISOString()
    };

    const updatedPrompts = [...savedPrompts, newPrompt];
    setSavedPrompts(updatedPrompts);
    savePromptsToStorage(updatedPrompts);
    setNewPromptName('');
    alert(`提示词方案 "${newPrompt.name}" 已保存！`);
  };

  // 🎯 新增：删除提示词方案
  const handleDeletePrompt = (promptId) => {
    const prompt = savedPrompts.find(p => p.id === promptId);
    if (prompt?.isDefault) {
      alert('默认方案不能删除');
      return;
    }

    if (confirm(`确定要删除提示词方案 "${prompt?.name}" 吗？`)) {
      const updatedPrompts = savedPrompts.filter(p => p.id !== promptId);
      setSavedPrompts(updatedPrompts);
      savePromptsToStorage(updatedPrompts);
    }
  };

  // 🎯 新增：选择提示词方案
  const handleSelectPrompt = (prompt) => {
    setCustomPrompt(prompt.prompt);
    setShowPromptManager(false);
    
    // 如果当前是自定义模式，立即保存
    if (currentStyle === 'custom') {
      handleCustomPromptChange(prompt.prompt);
    }
  };

  // 🎯 新增：编辑提示词方案
  const handleEditPrompt = (prompt) => {
    if (prompt.isDefault) {
      alert('默认方案不能编辑，但您可以基于它创建新方案');
      setCustomPrompt(prompt.prompt);
      setNewPromptName(`${prompt.name} - 副本`);
      return;
    }

    setEditingPrompt(prompt);
    setNewPromptName(prompt.name);
    setCustomPrompt(prompt.prompt);
  };

  // 🎯 新增：保存编辑的提示词方案
  const handleSaveEditedPrompt = () => {
    if (!editingPrompt || !newPromptName.trim() || !customPrompt.trim()) {
      alert('请输入方案名称和提示词内容');
      return;
    }

    const updatedPrompts = savedPrompts.map(p => 
      p.id === editingPrompt.id 
        ? { ...p, name: newPromptName.trim(), prompt: customPrompt.trim(), updatedAt: new Date().toISOString() }
        : p
    );

    setSavedPrompts(updatedPrompts);
    savePromptsToStorage(updatedPrompts);
    setEditingPrompt(null);
    setNewPromptName('');
    alert('提示词方案已更新！');
  };

  // 🔧 修复：确保每次boardId变化时都重新加载风格
  useEffect(() => {
    if (boardId && boardId !== currentBoardRef.current) {
      console.log(`🎨 [StyleSelector] 展板切换，重新加载风格: ${boardId}`);
      currentBoardRef.current = boardId;
      loadCurrentStyle();
    }
  }, [boardId]);

  // 🔧 修复：组件挂载时立即加载当前风格和提示词方案
  useEffect(() => {
    loadSavedPrompts();
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
    <div className={`annotation-style-selector ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="selector-header">
        <div className="header-content">
          <span className="selector-label">
            注释风格
            {/* 🔧 新增：显示最后同步时间 */}
            {lastSyncTime && !isCollapsed && (
              <small style={{color: '#666', marginLeft: '8px', fontSize: '11px'}}>
                (同步: {new Date(lastSyncTime).toLocaleTimeString()})
              </small>
            )}
            {/* 🎯 新增：折叠状态下显示当前风格 */}
            {isCollapsed && (
              <small style={{color: '#007bff', marginLeft: '8px', fontSize: '11px'}}>
                ({styleOptions.find(opt => opt.value === currentStyle)?.label || currentStyle})
              </small>
            )}
          </span>
          {isLoading && <div className="loading-indicator">⏳</div>}
        </div>
        
        {/* 🎯 新增：折叠/展开按钮 */}
        <button 
          className="collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "展开注释风格选择器" : "折叠注释风格选择器"}
        >
          {isCollapsed ? '📋' : '📤'}
        </button>
        
        {/* 🔧 隐藏开发模式调试信息 */}
        {false && process.env.NODE_ENV === 'development' && (
          <small style={{display: 'block', color: '#999', fontSize: '10px', marginTop: '2px'}}>
            [Debug] Board: {boardId} | Style: {currentStyle}
          </small>
        )}
      </div>
      
      {/* 🎯 新增：可折叠的内容区域 */}
      {!isCollapsed && (
        <div className="selector-content">
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
              <div className="custom-prompt-header">
                <label className="custom-prompt-label">自定义提示词：</label>
                <div className="prompt-actions">
                  <button 
                    className="prompt-manager-btn"
                    onClick={() => setShowPromptManager(!showPromptManager)}
                    title="管理提示词方案"
                  >
                    📋 方案管理
                  </button>
                </div>
              </div>
              
              <textarea
                className="custom-prompt-input"
                value={customPrompt}
                onChange={(e) => handleCustomPromptChange(e.target.value)}
                placeholder="请输入您的自定义注释生成提示词..."
                rows={4}
              />
              
              {/* 🎯 新增：提示词方案管理器 */}
              {showPromptManager && (
                <div className="prompt-manager">
                  <div className="prompt-manager-header">
                    <h4>📋 提示词方案管理</h4>
                    <button 
                      className="close-btn"
                      onClick={() => setShowPromptManager(false)}
                    >
                      ×
                    </button>
                  </div>
                  
                  {/* 保存当前提示词为新方案 */}
                  <div className="save-prompt-section">
                    <h5>💾 保存当前提示词</h5>
                    <div className="save-prompt-form">
                      <input
                        type="text"
                        placeholder="方案名称 (如：期末复习、论文写作等)"
                        value={newPromptName}
                        onChange={(e) => setNewPromptName(e.target.value)}
                        className="prompt-name-input"
                      />
                      <div className="save-actions">
                        {editingPrompt ? (
                          <>
                            <button onClick={handleSaveEditedPrompt} className="save-btn">
                              💾 保存修改
                            </button>
                            <button 
                              onClick={() => {
                                setEditingPrompt(null);
                                setNewPromptName('');
                              }}
                              className="cancel-btn"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button onClick={handleAddPrompt} className="save-btn">
                            💾 保存方案
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 已保存的方案列表 */}
                  <div className="saved-prompts-section">
                    <h5>📚 已保存的方案</h5>
                    <div className="saved-prompts-list">
                      {savedPrompts.map((prompt) => (
                        <div key={prompt.id} className="saved-prompt-item">
                          <div className="prompt-info">
                            <div className="prompt-name">
                              {prompt.isDefault && <span className="default-badge">默认</span>}
                              {prompt.name}
                            </div>
                            <div className="prompt-preview">
                              {prompt.prompt.length > 100 
                                ? `${prompt.prompt.substring(0, 100)}...` 
                                : prompt.prompt}
                            </div>
                            {prompt.createdAt && (
                              <div className="prompt-meta">
                                创建: {new Date(prompt.createdAt).toLocaleDateString()}
                                {prompt.updatedAt && ` | 更新: ${new Date(prompt.updatedAt).toLocaleDateString()}`}
                              </div>
                            )}
                          </div>
                          <div className="prompt-actions">
                            <button 
                              onClick={() => handleSelectPrompt(prompt)}
                              className="use-btn"
                              title="使用这个提示词"
                            >
                              ✅ 使用
                            </button>
                            <button 
                              onClick={() => handleEditPrompt(prompt)}
                              className="edit-btn"
                              title="编辑这个提示词"
                            >
                              ✏️ 编辑
                            </button>
                            {!prompt.isDefault && (
                              <button 
                                onClick={() => handleDeletePrompt(prompt.id)}
                                className="delete-btn"
                                title="删除这个提示词"
                              >
                                🗑️ 删除
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="custom-prompt-help">
                💡 提示：您可以指定特定的注释格式、重点关注的方面或分析角度。
                使用"方案管理"可以保存和重复使用您的提示词设置。
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 🔧 完全隐藏开发模式下的手动同步按钮 */}
      {false && process.env.NODE_ENV === 'development' && (
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