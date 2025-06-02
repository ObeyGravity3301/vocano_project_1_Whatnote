import React, { useState, useEffect } from 'react';
import './AnnotationStyleSelector.css';

const AnnotationStyleSelector = ({ boardId, apiClient, onStyleChange }) => {
  const [currentStyle, setCurrentStyle] = useState('detailed');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  // 加载当前风格
  useEffect(() => {
    if (boardId && apiClient) {
      loadCurrentStyle();
    }
  }, [boardId, apiClient]);

  const loadCurrentStyle = async () => {
    try {
      setIsLoading(true);
      const url = getApiUrl(`/api/boards/${boardId}/annotation-style`);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setCurrentStyle(data.annotation_style || 'detailed');
        setCustomPrompt(data.custom_prompt || '');
        setShowCustomInput(data.annotation_style === 'custom');
      } else {
        console.error('加载注释风格失败:', response.status, response.statusText);
        // 如果代理失败，尝试直接访问后端
        if (response.status === 404) {
          await loadCurrentStyleDirect();
        }
      }
    } catch (error) {
      console.error('加载注释风格失败:', error);
      // 网络错误时尝试直接访问后端
      await loadCurrentStyleDirect();
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentStyleDirect = async () => {
    try {
      const directUrl = `http://127.0.0.1:8000/api/boards/${boardId}/annotation-style`;
      console.log('尝试直接访问后端:', directUrl);
      const response = await fetch(directUrl);
      if (response.ok) {
        const data = await response.json();
        setCurrentStyle(data.annotation_style || 'detailed');
        setCustomPrompt(data.custom_prompt || '');
        setShowCustomInput(data.annotation_style === 'custom');
        console.log('直接访问后端成功');
      }
    } catch (error) {
      console.error('直接访问后端也失败:', error);
    }
  };

  const handleStyleChange = async (newStyle) => {
    try {
      setIsLoading(true);
      
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
        setCurrentStyle(newStyle);
        setShowCustomInput(newStyle === 'custom');
        
        // 通知父组件风格已改变
        if (onStyleChange) {
          onStyleChange(newStyle, customPrompt);
        }
        console.log('注释风格设置成功:', newStyle);
      } else {
        console.error('设置注释风格失败:', response.status, response.statusText);
        // 如果代理失败，尝试直接访问后端
        if (response.status === 404) {
          await handleStyleChangeDirect(newStyle, requestData);
        }
      }
    } catch (error) {
      console.error('设置注释风格失败:', error);
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
      console.log('尝试直接设置风格到后端:', directUrl);
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
        
        if (onStyleChange) {
          onStyleChange(newStyle, requestData.custom_prompt);
        }
        console.log('直接设置后端风格成功:', newStyle);
      } else {
        console.error('直接设置后端风格也失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('直接设置后端风格异常:', error);
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
          } else if (response.status === 404) {
            // 尝试直接访问后端
            await handleStyleChangeDirect('custom', {
              style: 'custom',
              custom_prompt: newPrompt
            });
          }
        } catch (error) {
          console.error('保存自定义提示词失败:', error);
          // 尝试直接访问后端
          await handleStyleChangeDirect('custom', {
            style: 'custom',
            custom_prompt: newPrompt
          });
        }
      }, 1000); // 1秒后保存
    }
  };

  return (
    <div className="annotation-style-selector">
      <div className="selector-header">
        <span className="selector-label">注释风格</span>
        {isLoading && <div className="loading-indicator">⏳</div>}
      </div>
      
      <div className="style-options">
        {styleOptions.map((option) => (
          <button
            key={option.value}
            className={`style-option ${currentStyle === option.value ? 'active' : ''}`}
            onClick={() => handleStyleChange(option.value)}
            disabled={isLoading}
            title={option.description}
          >
            <span className="style-icon">{option.icon}</span>
            <span className="style-label">{option.label}</span>
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
    </div>
  );
};

export default AnnotationStyleSelector; 