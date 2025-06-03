/**
 * 注释风格UI同步修复脚本
 * 解决风格选择器按钮状态与实际生成风格不一致的问题
 */

// 1. 首先修复 AnnotationStyleSelector 组件的状态管理
const fixAnnotationStyleSelector = () => {
  console.log('🔧 修复 AnnotationStyleSelector 组件状态管理');
  
  // 这个脚本应该应用到 frontend/src/components/AnnotationStyleSelector.js
  const fixedComponent = `
import React, { useState, useEffect, useRef } from 'react';
import './AnnotationStyleSelector.css';

const AnnotationStyleSelector = ({ boardId, apiClient, onStyleChange }) => {
  const [currentStyle, setCurrentStyle] = useState('detailed');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  
  // 使用 ref 追踪当前的 boardId，避免重复加载
  const currentBoardRef = useRef(null);

  // 获取API基础URL
  const getApiUrl = (path) => {
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

  // 🔧 修复：确保每次 boardId 变化时都重新加载风格
  useEffect(() => {
    if (boardId && boardId !== currentBoardRef.current) {
      console.log(\`🎨 [StyleSelector] 展板切换，重新加载风格: \${boardId}\`);
      currentBoardRef.current = boardId;
      loadCurrentStyle();
    }
  }, [boardId]);

  // 🔧 修复：组件挂载时立即加载当前风格
  useEffect(() => {
    if (boardId) {
      console.log(\`🎨 [StyleSelector] 组件挂载，加载风格: \${boardId}\`);
      loadCurrentStyle();
    }
  }, []);

  const loadCurrentStyle = async () => {
    if (!boardId) {
      console.warn('🎨 [StyleSelector] 没有 boardId，跳过风格加载');
      return;
    }

    try {
      setIsLoading(true);
      console.log(\`🎨 [StyleSelector] 开始加载展板 \${boardId} 的风格设置\`);
      
      const url = getApiUrl(\`/api/boards/\${boardId}/annotation-style\`);
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const style = data.annotation_style || 'detailed';
        const prompt = data.custom_prompt || '';
        
        console.log(\`✅ [StyleSelector] 风格加载成功: \${style}\`);
        
        // 🔧 关键修复：立即更新UI状态
        setCurrentStyle(style);
        setCustomPrompt(prompt);
        setShowCustomInput(style === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        // 🔧 立即通知父组件当前风格
        if (onStyleChange) {
          onStyleChange(style, prompt);
        }
        
      } else {
        console.error(\`❌ [StyleSelector] 加载风格失败: \${response.status}\`);
        // 尝试直接访问后端
        await loadCurrentStyleDirect();
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 加载风格异常:', error);
      await loadCurrentStyleDirect();
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentStyleDirect = async () => {
    try {
      const directUrl = \`http://127.0.0.1:8000/api/boards/\${boardId}/annotation-style\`;
      console.log('🔗 [StyleSelector] 尝试直接访问后端:', directUrl);
      
      const response = await fetch(directUrl);
      if (response.ok) {
        const data = await response.json();
        const style = data.annotation_style || 'detailed';
        const prompt = data.custom_prompt || '';
        
        console.log(\`✅ [StyleSelector] 直接访问成功，风格: \${style}\`);
        
        setCurrentStyle(style);
        setCustomPrompt(prompt);
        setShowCustomInput(style === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        if (onStyleChange) {
          onStyleChange(style, prompt);
        }
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 直接访问也失败:', error);
    }
  };

  const handleStyleChange = async (newStyle) => {
    try {
      setIsLoading(true);
      console.log(\`🎨 [StyleSelector] 用户切换风格: \${currentStyle} → \${newStyle}\`);
      
      const requestData = {
        style: newStyle,
        custom_prompt: newStyle === 'custom' ? customPrompt : ''
      };

      const url = getApiUrl(\`/api/boards/\${boardId}/annotation-style\`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        console.log(\`✅ [StyleSelector] 风格设置成功: \${newStyle}\`);
        
        // 🔧 关键修复：立即更新UI状态
        setCurrentStyle(newStyle);
        setShowCustomInput(newStyle === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        // 🔧 立即通知父组件
        if (onStyleChange) {
          onStyleChange(newStyle, requestData.custom_prompt);
        }
        
        // 🔧 新增：延迟验证风格是否正确保存
        setTimeout(async () => {
          try {
            const verifyResponse = await fetch(url);
            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              const savedStyle = verifyData.annotation_style;
              
              if (savedStyle === newStyle) {
                console.log(\`✅ [StyleSelector] 风格验证成功: \${savedStyle}\`);
              } else {
                console.error(\`❌ [StyleSelector] 风格验证失败! UI显示: \${newStyle}, 后端保存: \${savedStyle}\`);
                // 如果不一致，重新加载正确的状态
                await loadCurrentStyle();
              }
            }
          } catch (e) {
            console.warn('⚠️ [StyleSelector] 风格验证失败:', e);
          }
        }, 1000);
        
      } else {
        console.error(\`❌ [StyleSelector] 风格设置失败: \${response.status}\`);
        if (response.status === 404) {
          await handleStyleChangeDirect(newStyle, requestData);
        }
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 风格设置异常:', error);
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
      const directUrl = \`http://127.0.0.1:8000/api/boards/\${boardId}/annotation-style\`;
      console.log('🔗 [StyleSelector] 直接设置风格:', directUrl);
      
      const response = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        console.log(\`✅ [StyleSelector] 直接设置成功: \${newStyle}\`);
        
        setCurrentStyle(newStyle);
        setShowCustomInput(newStyle === 'custom');
        setLastSyncTime(new Date().toISOString());
        
        if (onStyleChange) {
          onStyleChange(newStyle, requestData.custom_prompt);
        }
      } else {
        console.error(\`❌ [StyleSelector] 直接设置也失败: \${response.status}\`);
      }
    } catch (error) {
      console.error('❌ [StyleSelector] 直接设置异常:', error);
    }
  };

  const handleCustomPromptChange = async (newPrompt) => {
    setCustomPrompt(newPrompt);
    
    if (currentStyle === 'custom') {
      clearTimeout(window.customPromptSaveTimeout);
      window.customPromptSaveTimeout = setTimeout(async () => {
        try {
          const url = getApiUrl(\`/api/boards/\${boardId}/annotation-style\`);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              style: 'custom',
              custom_prompt: newPrompt
            })
          });
          
          if (response.ok) {
            console.log('✅ [StyleSelector] 自定义提示保存成功');
            if (onStyleChange) {
              onStyleChange('custom', newPrompt);
            }
          }
        } catch (error) {
          console.error('❌ [StyleSelector] 自定义提示保存失败:', error);
        }
      }, 1000);
    }
  };

  // 🔧 新增：提供手动同步方法
  const forceSync = async () => {
    console.log('🔄 [StyleSelector] 强制同步风格状态');
    await loadCurrentStyle();
  };

  // 🔧 新增：暴露当前状态给开发者调试
  React.useEffect(() => {
    if (window.debugStyleSelector) {
      window.debugStyleSelector = {
        boardId,
        currentStyle,
        customPrompt,
        lastSyncTime,
        forceSync
      };
    }
  }, [boardId, currentStyle, customPrompt, lastSyncTime]);

  return (
    <div className="annotation-style-selector">
      <div className="selector-header">
        <span className="selector-label">
          注释风格 
          {lastSyncTime && (
            <small style={{color: '#666', marginLeft: '8px'}}>
              (最后同步: {new Date(lastSyncTime).toLocaleTimeString()})
            </small>
          )}
        </span>
        {isLoading && <div className="loading-indicator">⏳</div>}
        
        {/* 🔧 新增：调试信息 */}
        {process.env.NODE_ENV === 'development' && (
          <small style={{display: 'block', color: '#999', fontSize: '11px'}}>
            Board: {boardId} | Style: {currentStyle}
          </small>
        )}
      </div>
      
      <div className="style-options">
        {styleOptions.map((option) => (
          <button
            key={option.value}
            className={\`style-option \${currentStyle === option.value ? 'active' : ''}\`}
            onClick={() => handleStyleChange(option.value)}
            disabled={isLoading}
            title={\`\${option.description} \${currentStyle === option.value ? '(当前选中)' : ''}\`}
          >
            <span className="style-icon">{option.icon}</span>
            <span className="style-label">{option.label}</span>
            {currentStyle === option.value && (
              <span className="active-indicator">✓</span>
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
      
      {/* 🔧 新增：手动同步按钮（开发模式） */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{marginTop: '8px'}}>
          <button 
            onClick={forceSync} 
            style={{fontSize: '12px', padding: '4px 8px'}}
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
  `;
  
  return fixedComponent;
};

// 2. 修复 App.js 中的风格处理逻辑
const fixAppStyleHandling = () => {
  console.log('🔧 修复 App.js 中的风格处理逻辑');
  
  // 这些修改应该应用到 frontend/src/App.js
  const suggestions = `
// 在 App.js 中添加风格状态管理
const [currentAnnotationStyle, setCurrentAnnotationStyle] = useState({});

// 修改 handleGenerateAnnotation 函数，确保风格确认
const handleGenerateAnnotation = async (pdfId, userImproveRequest = null) => {
  // ... 现有代码 ...
  
  // 🔧 新增：在生成注释前，显式确认当前风格
  try {
    console.log('🎨 [App] 生成注释前确认风格设置...');
    const styleResponse = await fetch(\`\${api.getBaseUrl()}/api/boards/\${boardId}/annotation-style\`);
    
    if (styleResponse.ok) {
      const styleData = await styleResponse.json();
      const currentStyle = styleData.annotation_style || 'detailed';
      
      console.log(\`🎨 [App] 确认使用风格: \${currentStyle}\`);
      
      // 更新本地状态
      setCurrentAnnotationStyle(prev => ({
        ...prev,
        [boardId]: {
          style: currentStyle,
          customPrompt: styleData.custom_prompt || '',
          timestamp: new Date().toISOString()
        }
      }));
      
    } else {
      console.warn('⚠️ [App] 无法获取风格设置，使用默认风格');
    }
  } catch (error) {
    console.warn('⚠️ [App] 风格确认失败:', error);
  }
  
  // ... 继续现有的注释生成逻辑 ...
};

// 修改 NoteWindow 的 onStyleChange 回调
const handleStyleChange = (style, customPrompt) => {
  console.log(\`🎨 [App] 风格变化通知: \${style}\`);
  
  // 立即更新本地状态
  if (currentFile && currentFile.key) {
    setCurrentAnnotationStyle(prev => ({
      ...prev,
      [currentFile.key]: {
        style: style,
        customPrompt: customPrompt,
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  // 显示确认消息
  message.success(\`注释风格已切换为: \${
    style === 'keywords' ? '关键词解释' : 
    style === 'translation' ? '文本翻译' : 
    style === 'detailed' ? '详细注释' : 
    '自定义风格'
  }\`);
  
  console.log('🎨 [App] 风格设置已更新，下次生成注释将使用新风格');
};

// 在 renderPdfWindow 中传递风格变化处理器
<AnnotationStyleSelector
  boardId={currentFile ? currentFile.key : null}
  onStyleChange={handleStyleChange}  // 🔧 使用新的处理器
/>
  `;
  
  return suggestions;
};

// 3. 调试工具
const createDebugTools = () => {
  console.log('🔧 创建风格同步调试工具');
  
  // 在浏览器控制台中可用的调试工具
  const debugScript = `
window.debugStyleSelector = {
  getCurrentStyle: async (boardId) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/boards/' + boardId + '/annotation-style');
      const data = await response.json();
      console.log('当前后端风格设置:', data);
      return data;
    } catch (error) {
      console.error('获取风格失败:', error);
    }
  },
  
  setStyle: async (boardId, style, customPrompt = '') => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/boards/' + boardId + '/annotation-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, custom_prompt: customPrompt })
      });
      const data = await response.json();
      console.log('风格设置结果:', data);
      return data;
    } catch (error) {
      console.error('设置风格失败:', error);
    }
  },
  
  testStyleSync: async (boardId) => {
    console.log('🧪 测试展板 ' + boardId + ' 的风格同步');
    
    // 1. 设置翻译风格
    await window.debugStyleSelector.setStyle(boardId, 'translation');
    
    // 2. 等待1秒
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. 验证设置
    const result = await window.debugStyleSelector.getCurrentStyle(boardId);
    
    if (result.annotation_style === 'translation') {
      console.log('✅ 风格同步测试通过');
    } else {
      console.error('❌ 风格同步测试失败');
    }
    
    return result;
  }
};`;
  
  console.log('🎯 调试工具已创建，可在控制台使用:');
  console.log('- window.debugStyleSelector.getCurrentStyle(boardId)');
  console.log('- window.debugStyleSelector.setStyle(boardId, style)');
  console.log('- window.debugStyleSelector.testStyleSync(boardId)');
  
  return debugScript;
};

// 执行修复
console.log('🚀 开始执行注释风格UI同步修复');

const fixedComponent = fixAnnotationStyleSelector();
const appSuggestions = fixAppStyleHandling();
const debugScript = createDebugTools();

console.log('✅ 修复脚本准备完成');
console.log('\n📝 应用修复的步骤:');
console.log('1. 将修复后的 AnnotationStyleSelector 组件代码应用到对应文件');
console.log('2. 在 App.js 中应用建议的风格处理逻辑');
console.log('3. 在浏览器中使用调试工具验证同步是否正常');
console.log('4. 测试风格切换和注释生成的一致性');

export { fixAnnotationStyleSelector, fixAppStyleHandling, createDebugTools }; 