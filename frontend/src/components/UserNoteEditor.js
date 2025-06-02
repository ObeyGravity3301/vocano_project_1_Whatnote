import React, { useState, useEffect, useRef } from 'react';
import { Tabs, Button, Tooltip, Spin, message } from 'antd';
import { EditOutlined, EyeOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import MarkdownMathRenderer from './MarkdownMathRenderer';
import './AnimatedDiffView.css';

const { TabPane } = Tabs;

const UserNoteEditor = ({ 
  aiContent = '', 
  content = '', 
  onSave,
  loading = false,
  editorTitle = '用户笔记',
  color = '#1890ff',
  onAIImprove = null,
  showGenerateButton = false,
  onGenerate = null
}) => {
  console.log('🔍 UserNoteEditor渲染 - 收到props:', { 
    contentLength: content?.length || 0,
    contentPreview: content ? content.substring(0, 50) + '...' : '无内容',
    loading,
    showGenerateButton,
    timestamp: new Date().toLocaleTimeString()
  });
  
  // 简化状态管理 - 只维护必要的状态
  const [localContent, setLocalContent] = useState(content || '');
  const [editMode, setEditMode] = useState(!content);
  const [activeTab, setActiveTab] = useState(content ? 'user' : 'ai');
  const [isImproving, setIsImproving] = useState(false);
  const [autoSaveVisible, setAutoSaveVisible] = useState(false);
  
  // refs
  const autoSaveTimerRef = useRef(null);
  const lastContentRef = useRef(content);
  
  // 监听外部content变化，直接同步到本地状态
  useEffect(() => {
    console.log('📡 UserNoteEditor - content props变化检测:', {
      newContent: content ? content.substring(0, 50) + '...' : '无内容',
      oldContent: lastContentRef.current ? lastContentRef.current.substring(0, 50) + '...' : '无内容',
      hasChanged: content !== lastContentRef.current,
      newLength: content?.length || 0,
      oldLength: lastContentRef.current?.length || 0
    });
    
    // 如果外部content发生了实质性变化，立即同步到本地状态
    if (content !== lastContentRef.current) {
      console.log('✅ UserNoteEditor - 同步外部content到本地状态');
      setLocalContent(content || '');
      lastContentRef.current = content;
      
      // 如果有内容且当前在AI标签页，切换到用户标签页
      if (content && activeTab === 'ai') {
        setActiveTab('user');
      }
    }
  }, [content, activeTab]);
  
  // 自动保存逻辑
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // 只有在编辑模式且内容与外部props不同时才自动保存
    if (editMode && localContent !== content && onSave) {
      autoSaveTimerRef.current = setTimeout(() => {
        console.log('💾 UserNoteEditor - 自动保存内容到父组件');
        onSave(localContent);
        setAutoSaveVisible(true);
        setTimeout(() => setAutoSaveVisible(false), 2000);
      }, 2000);
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [localContent, content, editMode, onSave]);
  
  // 切换编辑模式
  const toggleEditMode = () => {
    console.log('🔀 UserNoteEditor - 切换编辑模式:', !editMode);
    if (editMode && onSave && localContent !== content) {
      console.log('💾 UserNoteEditor - 保存内容并切换到预览模式');
      onSave(localContent);
    }
    setEditMode(!editMode);
    if (!editMode) {
      setActiveTab('user');
    }
  };
  
  // 处理文本区域内容变化
  const handleContentChange = (e) => {
    const newValue = e.target.value;
    console.log('📝 UserNoteEditor - 文本内容变化:', newValue.length, '字符');
    setLocalContent(newValue);
  };
  
  // 合并AI内容
  const mergeAiContent = () => {
    console.log('🔄 UserNoteEditor - 合并AI内容');
    const mergedContent = localContent ? `${localContent}\n\n--- AI内容 ---\n${aiContent}` : aiContent;
    setLocalContent(mergedContent);
    setActiveTab('user');
    setEditMode(true);
    if (onSave) {
      onSave(mergedContent);
    }
  };
  
  // AI改进笔记
  const handleAIImprove = async () => {
    console.log('🚀 UserNoteEditor - 开始AI改进');
    if (!onAIImprove) return;
    
    setIsImproving(true);
    
    try {
      console.log('📤 UserNoteEditor - 发送内容长度:', localContent?.length || 0);
      
      // 调用父组件的改进函数
      const improvedContent = await onAIImprove(localContent);
      
      console.log('📥 UserNoteEditor - 收到改进内容:', {
        length: improvedContent?.length || 0,
        preview: improvedContent ? improvedContent.substring(0, 100) + '...' : '无内容'
      });
      
      if (improvedContent && improvedContent.trim().length > 0) {
        console.log('✅ UserNoteEditor - 直接应用改进内容');
        
        // 直接更新本地状态
        setLocalContent(improvedContent);
        setEditMode(true);
        setActiveTab('user');
        
        // 立即保存到父组件
        if (onSave) {
          console.log('💾 UserNoteEditor - 立即保存改进内容');
          onSave(improvedContent);
        }
        
        message.success('笔记已成功改进！');
      } else {
        console.warn('⚠️ UserNoteEditor - 改进内容为空或无效');
        message.warning('改进内容为空，请重试');
      }
    } catch (error) {
      console.error('❌ UserNoteEditor - AI改进失败:', error);
      message.error('笔记改进失败，请重试');
    } finally {
      setIsImproving(false);
    }
  };
  
  // 组件卸载清理
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  
  return (
    <div className="user-note-editor">
      <div className="editor-toolbar" style={{ borderColor: color }}>
        <div className="editor-toolbar-left">
          <span style={{ fontWeight: 'bold', color }}>{editorTitle}</span>
          {process.env.NODE_ENV !== 'production' && (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#999' }}>
              长度: {localContent?.length || 0} | {new Date().toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="editor-toolbar-right">
          {activeTab === 'user' && (
            <>
              {editMode ? (
                <>
                  {onAIImprove && (
                    <Tooltip title="AI完善笔记">
                      <Button 
                        type="text" 
                        icon={<RobotOutlined />} 
                        onClick={handleAIImprove}
                        disabled={loading || isImproving}
                        loading={isImproving}
                      />
                    </Tooltip>
                  )}
                  {showGenerateButton && onGenerate && (
                    <Tooltip title="AI生成笔记">
                      <Button 
                        type="text" 
                        icon={<FileTextOutlined />} 
                        onClick={onGenerate}
                        disabled={loading || isImproving}
                        style={{ color: color }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="预览模式">
                    <Button 
                      type="text" 
                      icon={<EyeOutlined />} 
                      onClick={toggleEditMode}
                      disabled={loading || isImproving}
                    />
                  </Tooltip>
                </>
              ) : (
                <>
                  {showGenerateButton && onGenerate && !localContent && (
                    <Tooltip title="AI生成笔记">
                      <Button 
                        type="text" 
                        icon={<FileTextOutlined />} 
                        onClick={onGenerate}
                        disabled={loading || isImproving}
                        style={{ color: color }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="编辑">
                    <Button 
                      type="text" 
                      icon={<EditOutlined />} 
                      onClick={toggleEditMode}
                      disabled={loading || isImproving}
                    />
                  </Tooltip>
                </>
              )}
            </>
          )}
          {aiContent && activeTab === 'ai' && (
            <Tooltip title="合并到我的笔记">
              <Button 
                type="text" 
                icon={<FileTextOutlined />} 
                onClick={mergeAiContent}
                disabled={loading || isImproving}
              />
            </Tooltip>
          )}
        </div>
      </div>
      
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        size="small"
        tabBarStyle={{ margin: '0 16px' }}
        className="note-tabs"
      >
        <TabPane 
          tab={<span><FileTextOutlined /> 我的笔记</span>} 
          key="user"
        >
          <div className="tabs-content" style={{ position: 'relative' }}>
            {/* 加载遮罩 */}
            {(loading || isImproving) && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(255, 255, 255, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <Spin size="large" tip={isImproving ? "AI正在改进笔记..." : "处理中..."} />
              </div>
            )}
            
            {editMode ? (
              <div className="note-editor-container" style={{ position: 'relative' }}>
                <textarea
                  className="note-editor"
                  value={localContent}
                  onChange={handleContentChange}
                  placeholder="在这里记录你的笔记..."
                  disabled={loading || isImproving}
                  style={{ 
                    width: '100%', 
                    height: '300px', 
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    padding: '8px',
                    resize: 'vertical'
                  }}
                />
                {autoSaveVisible && (
                  <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    background: '#52c41a',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    已自动保存
                  </div>
                )}
              </div>
            ) : (
              <div className="preview-display" style={{ 
                padding: '16px', 
                overflow: 'auto', 
                maxHeight: '300px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fafafa'
              }}>
                <MarkdownMathRenderer>
                  {localContent || '暂无笔记内容'}
                </MarkdownMathRenderer>
              </div>
            )}
          </div>
        </TabPane>
        
        {aiContent && (
          <TabPane 
            tab={<span><RobotOutlined /> AI内容</span>} 
            key="ai"
          >
            <div className="tabs-content">
              <div style={{ 
                padding: '16px', 
                overflow: 'auto', 
                maxHeight: '300px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#f6ffed'
              }}>
                <MarkdownMathRenderer>
                  {aiContent || '暂无AI内容'}
                </MarkdownMathRenderer>
              </div>
            </div>
          </TabPane>
        )}
      </Tabs>
    </div>
  );
};

export default UserNoteEditor; 