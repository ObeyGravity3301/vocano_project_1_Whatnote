import React, { useState, useEffect, useRef } from 'react';
import { Button, Tooltip, Modal, Spin, message, Input, Typography, Radio, Divider, Card } from 'antd';
import { FileSearchOutlined, FileImageOutlined, InfoCircleOutlined, SyncOutlined, EditOutlined, CopyOutlined, PictureOutlined, CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MarkdownMathRenderer from './MarkdownMathRenderer';
import AnnotationStyleSelector from './AnnotationStyleSelector';
import './NoteWindow.css';

const { TextArea } = Input;

const NoteWindow = ({ 
  content,
  type = 'note',
  loading = false,
  filename = '',
  pageNumber = 1,
  source = 'text',
  onForceVisionAnnotate,
  onImprove,
  onChange,
  onGenerate,
  // 分段生成相关props
  segmentedNoteStatus = null,
  onContinueGenerate = null,
  // 新增boardId prop用于风格选择器
  boardId = null,
  // 新增pdf对象用于获取页面加载状态
  pdf = null,
  // 新增批量注释相关props
  onBatchAnnotate = null
}) => {
  console.log('🎨 [DEBUG] NoteWindow 组件渲染:', {
    type,
    filename,
    pageNumber,
    contentLength: content?.length || 0,
    contentPreview: content?.substring(0, 100) + '...',
    loading,
    source,
    hasOnImprove: !!onImprove,
    hasOnForceVisionAnnotate: !!onForceVisionAnnotate,
    hasOnChange: !!onChange,
    componentKey: `${type}-${filename}-${pageNumber}-${content?.length || 0}`
  });

  // 确保content是字符串类型
  const ensureStringContent = (value) => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  };

  // 计算当前页面的加载状态
  const currentPageLoading = type === 'annotation' && pdf ? 
    pdf.pageAnnotationLoadings?.[pageNumber] || false : 
    loading;
    
  // 使用useEffect监控props变化
  useEffect(() => {
    }, [content, type, loading, filename, pageNumber, source]);

  // 安全获取内容
  const safeContent = ensureStringContent(content);
  
  const [displayContent, setDisplayContent] = useState(safeContent);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [improving, setImproving] = useState(false);
  const [improveModalVisible, setImproveModalVisible] = useState(false);
  const [improvePrompt, setImprovePrompt] = useState('');
  const [isVisionMode, setIsVisionMode] = useState(false);
  const [rawTextVisible, setRawTextVisible] = useState(false);
  const [rawText, setRawText] = useState('');
  const [loadingRawText, setLoadingRawText] = useState(false);
  const [autoSaveVisible, setAutoSaveVisible] = useState(false);

  // 批量注释相关状态
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchMode, setBatchMode] = useState('toEnd'); // 'toEnd', 'custom', 'preset'
  const [customPageCount, setCustomPageCount] = useState(10);
  const [presetPageCount, setPresetPageCount] = useState(5);
  const [selectedAnnotationStyle, setSelectedAnnotationStyle] = useState('detailed');
  const [customAnnotationPrompt, setCustomAnnotationPrompt] = useState('');
  const [batchInProgress, setBatchInProgress] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentPage: 0 });
  const [batchAbortController, setBatchAbortController] = useState(null);

  // 监听内容变化
  useEffect(() => {
    console.log('🔄 [DEBUG] NoteWindow content props 变化:', {
      oldContent: displayContent?.substring(0, 50) + '...',
      newContent: safeContent?.substring(0, 50) + '...',
      contentChanged: safeContent !== displayContent,
      oldLength: displayContent?.length || 0,
      newLength: safeContent?.length || 0
    });
    
    if (safeContent !== displayContent) {
      setDisplayContent(safeContent);
      
      // 如果正在改进中且内容发生变化，停止改进状态
      if (improving) {
        setImproving(false);
      }
    }
  }, [safeContent, displayContent, improving]);

  // 监听改进状态变化
  useEffect(() => {
    }, [improving]);

  // 自动保存计时器ref
  const autoSaveTimerRef = useRef(null);
  const autoSaveIndicatorTimerRef = useRef(null);
  // 改进状态重置计时器ref
  const improvingTimerRef = useRef(null);
  
  // 初始化显示内容
  useEffect(() => {
    const stringContent = ensureStringContent(content);
    console.log('🔧 NoteWindow - 初始化内容:', {
      originalType: typeof content,
      stringContent: stringContent.substring(0, 50) + (stringContent.length > 50 ? '...' : ''),
      stringLength: stringContent.length
    });
    setDisplayContent(stringContent);
    setEditedContent(stringContent);
  }, []);
  
  // 监听loading状态，自动更新improving状态
  useEffect(() => {
    if (!loading) {
      // 如果主加载完成，也重置改进状态
      setImproving(false);
    }
  }, [loading]);
  
  // 自动保存功能
  useEffect(() => {
    // 清除之前的计时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // 只有在编辑模式下且内容有变化时才设置自动保存计时器
    if (isEditing && editedContent !== displayContent) {
      autoSaveTimerRef.current = setTimeout(() => {
        saveContent();
        // 显示自动保存提示
        setAutoSaveVisible(true);
        // 2秒后隐藏提示
        if (autoSaveIndicatorTimerRef.current) {
          clearTimeout(autoSaveIndicatorTimerRef.current);
        }
        autoSaveIndicatorTimerRef.current = setTimeout(() => {
          setAutoSaveVisible(false);
        }, 2000);
      }, 2000); // 2秒后自动保存
    }
    
    // 组件卸载时清除计时器
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (autoSaveIndicatorTimerRef.current) {
        clearTimeout(autoSaveIndicatorTimerRef.current);
      }
    };
  }, [editedContent, isEditing]);
  
  // 保存内容
  const saveContent = () => {
    setDisplayContent(editedContent);
    
    // 如果提供了onChange回调，通知父组件内容已更新
    if (onChange) {
      onChange(editedContent);
    }
  };
  
  // 获取来源显示文本
  const getSourceText = () => {
    if (!source) return '未知来源';
    return source === 'text' ? '文本提取' : '图像识别';
  };
  
  // 查看原始提取的文本
  const handleViewRawText = async () => {
    if (!filename || !pageNumber) return;
    
    setLoadingRawText(true);
    try {
      const res = await fetch(`http://localhost:8000/materials/${filename}/pages/${pageNumber}/raw-text`);
      if (!res.ok) {
        throw new Error(`服务器返回错误: ${res.status}`);
      }
      
      const data = await res.json();
      setRawText(data.text || '无文本内容');
      setRawTextVisible(true);
    } catch (err) {
      console.error("获取原始文本失败:", err);
      message.error("获取原始文本失败");
    } finally {
      setLoadingRawText(false);
    }
  };
  
  // 处理使用视觉模型重新生成注释的请求
  const handleUseVisionAnnotate = () => {
    if (onForceVisionAnnotate) {
      try {
        // 关闭原始文本弹窗
        setRawTextVisible(false);
        
        // 打开改进提示对话框
        setImprovePrompt('');
        setImproveModalVisible(true);
        setIsVisionMode(true);
      } catch (error) {
        console.error('启动视觉模型生成失败:', error);
        message.error('操作失败，请重试');
      }
    }
  };
  
  // 改进笔记内容
  const handleImprove = async () => {
    // 清空改进提示
    setImprovePrompt('');
    // 设置为非视觉模式
    setIsVisionMode(false);
    // 打开改进对话框
    setImproveModalVisible(true);
  };
  
  // 提交改进请求
  const submitImproveRequest = async (e) => {
    try {
      // 关闭弹窗
      setImproveModalVisible(false);
      
      // 设置改进状态
      setImproving(true);
      
      // 获取改进提示
      const prompt = improvePrompt.trim();
      
      if (type === 'annotation') {
        if (isVisionMode && onForceVisionAnnotate) {
          // 如果是视觉模式，并且有视觉识别功能
          console.log("🔄 NoteWindow - 使用视觉模型重新生成注释，并传递改进建议:", prompt);
          await onForceVisionAnnotate(prompt || null);
        } else if (onImprove) {
          // 如果不是视觉模型生成或没有视觉识别功能，使用普通改进
          console.log("🔄 NoteWindow - 使用改进请求改进现有注释:", prompt);
          console.log(`🚀 NoteWindow - 调用父组件的onImprove回调，内容长度: ${displayContent?.length || 0}`);
          
          // 🔧 修复：确保内容为字符串类型后再调用trim
          const safeDisplayContent = ensureStringContent(displayContent);
          const hasContent = safeDisplayContent && safeDisplayContent.trim().length > 0;
          console.log(`🔍 NoteWindow - 当前内容状态: ${hasContent ? '有内容' : '无内容'}`);
          
          // 即使没有内容也继续调用API，我们已经修改了后端以支持这种情况
          await onImprove(safeDisplayContent || "", prompt || null);
        }
      } else {
        // 非注释类型的内容改进
        if (onImprove) {
          console.log(`🔄 NoteWindow - 改进${type === 'note' ? '笔记' : '内容'}:`, prompt);
          console.log(`🚀 NoteWindow - 调用父组件的onImprove回调，内容长度: ${displayContent?.length || 0}`);
          
          // 🔧 修复：确保内容为字符串类型
          const safeDisplayContent = ensureStringContent(displayContent);
          await onImprove(safeDisplayContent || "", prompt || null);
        }
      }
      
      // 成功提示
      message.success(isVisionMode 
        ? "正在使用视觉模型重新生成，请稍候..." 
        : `正在${type === 'annotation' ? '改进注释' : '改进笔记'}，请稍候...`);
      
      // 不再设置超时，让改进过程持续到内容更新
    } catch (error) {
      console.error('❌ NoteWindow - 改进请求失败:', error);
      message.error('操作失败，请重试');
      // 错误时立即重置状态
      setImproving(false);
    } finally {
      // 不在这里重置改进状态，而是在内容更新时重置
      // 清空改进提示
      setImprovePrompt('');
      // 重置视觉模式
      setIsVisionMode(false);
    }
  };
  
  // 切换编辑模式
  const toggleEditing = () => {
    if (isEditing) {
      // 如果当前是编辑模式，切换到预览模式前保存内容
      handleSaveEdit();
    } else {
      // 如果当前是预览模式，切换到编辑模式
      setEditedContent(displayContent);
      setIsEditing(true);
    }
  };
  
  // 添加一个专门用于强制视觉识别的函数
  const handleForceVisionRecognize = () => {
    if (onForceVisionAnnotate) {
      // 清空改进提示
      setImprovePrompt('');
      // 设置为视觉模式
      setIsVisionMode(true);
      // 打开改进对话框
      setImproveModalVisible(true);
    }
  };
  
  // 组件卸载时清理所有计时器
  useEffect(() => {
    return () => {
      // 清理自动保存计时器
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (autoSaveIndicatorTimerRef.current) {
        clearTimeout(autoSaveIndicatorTimerRef.current);
      }
      // 清理改进状态重置计时器
      if (improvingTimerRef.current) {
        clearTimeout(improvingTimerRef.current);
      }
    };
  }, []);
  
  // 监听content变化，更新显示内容和改进状态
  useEffect(() => {
    // 🔧 修复：确保内容处理为字符串类型
    const safeContent = ensureStringContent(content);
    
    // 记录详细日志便于调试
    console.log('NoteWindow接收到新内容:', {
      originalType: typeof content,
      safeContentPreview: safeContent ? `${safeContent.substring(0, 50)}${safeContent.length > 50 ? '...' : ''}` : '无内容',
      safeContentLength: safeContent?.length || 0
    });
    
    // 当改进中或非编辑状态时，更新显示内容
    if (improving || !isEditing) {
      setDisplayContent(safeContent);
      
      // 如果正在改进中，收到新内容后停止改进状态
      if (improving) {
        console.log('检测到内容更新，停止改进状态');
        setImproving(false);
        
        // 清除改进定时器
        if (improvingTimerRef.current) {
          clearTimeout(improvingTimerRef.current);
          improvingTimerRef.current = null;
        }
        
        // 显示成功提示
        message.success(`${type === 'annotation' ? '注释' : '笔记'}内容已更新`);
      }
    } else {
      // 即使在编辑状态下，也记录新内容以便对比
      console.log('当前处于编辑状态，新内容暂不更新到UI。新内容长度:', safeContent?.length || 0);
    }
  }, [content, isEditing, improving, type]);
  
  // 监听improving状态变化，移除超时重置机制
  useEffect(() => {
    console.log(`🔄 NoteWindow - 改进状态变化: ${improving}`);
    
    if (improving) {
      // 不再设置超时，让改进状态持续到内容更新
      // improvingTimerRef.current = setTimeout(() => {
      //   console.log("改进状态超时，强制重置");
      //   setImproving(false);
      //   improvingTimerRef.current = null;
      // }, 10000);
    } else {
      if (improvingTimerRef.current) {
        console.log(`🔄 NoteWindow - 清除改进状态计时器`);
        clearTimeout(improvingTimerRef.current);
        improvingTimerRef.current = null;
      }
    }

    return () => {
      if (improvingTimerRef.current) {
        clearTimeout(improvingTimerRef.current);
        improvingTimerRef.current = null;
      }
    };
  }, [improving]);
  
  // 监听显示内容变化
  useEffect(() => {
    // 🔧 修复：确保内容处理为字符串类型
    const safeContent = ensureStringContent(content);
    
    console.log(`📝 NoteWindow - 接收到新的内容，长度: ${safeContent?.length || 0}`);
    console.log(`📝 NoteWindow - 当前显示内容长度: ${displayContent?.length || 0}`);
    
    // 如果内容变化且不在编辑模式，更新显示内容
    if (content !== null && content !== undefined && !isEditing) {
      console.log(`📝 NoteWindow - 更新显示内容`);
      setDisplayContent(safeContent);
      // 如果正在改进中，说明这是改进后的内容，重置改进状态
      if (improving) {
        console.log(`✅ NoteWindow - 收到更新内容，重置改进状态`);
        setImproving(false);
      }
    }
    // 更新编辑内容（如果在编辑模式）
    if (content !== null && content !== undefined && isEditing) {
      console.log(`📝 NoteWindow - 更新编辑内容`);
      setEditedContent(safeContent);
    }
  }, [content, isEditing]);
  
  // 保存编辑内容
  const handleSaveEdit = () => {
    setDisplayContent(editedContent);
    setIsEditing(false);
    
    // 确保调用onChange回调来保存修改后的内容
    if (onChange) {
      onChange(editedContent);
    }
  };

  // 处理批量注释
  const handleBatchAnnotate = () => {
    if (!pdf || !onBatchAnnotate) {
      message.error('批量注释功能不可用');
      return;
    }
    
    setBatchModalVisible(true);
  };

  // 开始批量注释
  const startBatchAnnotation = async () => {
    if (!pdf || !onBatchAnnotate) {
      message.error('批量注释功能不可用');
      return;
    }

    setBatchModalVisible(false);
    setBatchInProgress(true);

    // 计算要处理的页面范围
    let startPage = pageNumber;
    let endPage;
    
    switch (batchMode) {
      case 'toEnd':
        endPage = pdf.totalPages;
        break;
      case 'preset':
        endPage = Math.min(startPage + presetPageCount - 1, pdf.totalPages);
        break;
      case 'custom':
        endPage = Math.min(startPage + customPageCount - 1, pdf.totalPages);
        break;
      default:
        endPage = pdf.totalPages;
    }

    const totalPages = endPage - startPage + 1;
    setBatchProgress({ current: 0, total: totalPages, currentPage: startPage });

    // 创建中止控制器
    const abortController = new AbortController();
    setBatchAbortController(abortController);

    try {
      // 构建批量注释配置
      const batchConfig = {
        startPage,
        endPage,
        annotationStyle: selectedAnnotationStyle,
        customPrompt: selectedAnnotationStyle === 'custom' ? customAnnotationPrompt : null,
        signal: abortController.signal
      };

      console.log('🚀 开始批量注释:', batchConfig);
      console.log('🎯 当前注释风格:', selectedAnnotationStyle);
      console.log('🎯 自定义提示词内容:', customAnnotationPrompt);
      console.log('🎯 是否为自定义风格:', selectedAnnotationStyle === 'custom');
      console.log('🎯 实际传递的自定义提示词:', selectedAnnotationStyle === 'custom' ? customAnnotationPrompt : null);
      message.success(`开始批量注释第${startPage}-${endPage}页，共${totalPages}页`);

      // 调用批量注释函数
      await onBatchAnnotate(batchConfig, (progress) => {
        setBatchProgress({
          current: progress.completed,
          total: progress.total,
          currentPage: progress.currentPage
        });
      });

      message.success(`批量注释完成！已处理${totalPages}页`);
    } catch (error) {
      if (error.name === 'AbortError') {
        message.info('批量注释已停止');
      } else {
        console.error('批量注释失败:', error);
        message.error('批量注释失败: ' + error.message);
      }
    } finally {
      setBatchInProgress(false);
      setBatchAbortController(null);
      setBatchProgress({ current: 0, total: 0, currentPage: 0 });
    }
  };

  // 停止批量注释
  const stopBatchAnnotation = () => {
    if (batchAbortController) {
      batchAbortController.abort();
      message.info('正在停止批量注释...');
    }
  };

  return (
    <div className="note-editor-container"
      data-note-type={type}
      data-filename={filename}
      data-page={pageNumber}
    >
      {/* 注释风格选择器 - 只在注释窗口显示 */}
      {type === 'annotation' && boardId && (
        <AnnotationStyleSelector
          boardId={boardId}
          onStyleChange={(style, customPrompt) => {
            message.success(`注释风格已切换为: ${style === 'keywords' ? '关键词解释' : style === 'translation' ? '文本翻译' : style === 'detailed' ? '详细注释' : '自定义风格'}`);
            console.log('注释风格已更改:', { style, customPrompt });
          }}
        />
      )}
      
      {/* 批量注释功能区 - 只在注释窗口显示 */}
      {type === 'annotation' && pdf && onBatchAnnotate && (
        <div className="batch-annotation-section">
          {batchInProgress ? (
            <div className="batch-progress-container">
              <div className="batch-progress-info">
                <span className="batch-progress-text">
                  🔄 批量注释进行中... ({batchProgress.current}/{batchProgress.total})
                </span>
                <span className="batch-current-page">
                  当前处理第{batchProgress.currentPage}页
                </span>
              </div>
              <div className="batch-progress-bar">
                <div 
                  className="batch-progress-fill"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <Button 
                size="small" 
                danger 
                onClick={stopBatchAnnotation}
                icon={<CloseOutlined />}
              >
                停止
              </Button>
            </div>
          ) : (
            <Button 
              type="primary" 
              size="small"
              onClick={handleBatchAnnotate}
              disabled={currentPageLoading}
              style={{ 
                background: 'linear-gradient(45deg, #1890ff, #722ed1)',
                border: 'none',
                fontWeight: 'bold'
              }}
            >
              📝 批量注释
            </Button>
          )}
        </div>
      )}
      
      <div className="note-editor-header">
        {source && (
          <div className="note-source">
            来源: {source === 'vision' ? 
              <><PictureOutlined /> 图像识别</> : 
              <><CopyOutlined /> 文本提取</>}
          </div>
        )}
        <div className="note-actions">
          {/* 所有类型的窗口都显示改进按钮，只要有onImprove回调 */}
          {onImprove && (
            <Button 
              onClick={handleImprove}
              size="small"
            >
              {type === 'annotation' ? '改进注释' : '改进笔记'}
            </Button>
          )}
          
          {/* 分段生成 - 继续生成按钮 */}
          {type === 'note' && segmentedNoteStatus && segmentedNoteStatus.hasMore && onContinueGenerate && (
            <Button 
              onClick={onContinueGenerate}
              size="small"
              type="primary"
              loading={currentPageLoading}
              disabled={currentPageLoading}
              style={{ marginLeft: 8 }}
              title={`继续生成第${segmentedNoteStatus.currentStartPage}页及后续内容`}
            >
              继续生成 ({segmentedNoteStatus.currentStartPage}+)
            </Button>
          )}
          
          {/* 只有注释窗口且支持视觉识别时才显示视觉模型按钮 */}
          {type === 'annotation' && onForceVisionAnnotate && (
            <Button 
              onClick={handleForceVisionRecognize}
              size="small"
              style={{ marginLeft: 8 }}
            >
              使用视觉模型
            </Button>
          )}
          <Button
            size="small"
            onClick={toggleEditing}
            icon={isEditing ? <EyeOutlined /> : <EditOutlined />}
            type={isEditing ? "primary" : "default"}
            title={isEditing ? "预览" : "编辑内容"}
          />
        </div>
      </div>
      
      {/* 分段生成状态信息 */}
      {type === 'note' && segmentedNoteStatus && segmentedNoteStatus.isSegmented && (
        <div className="segmented-note-status" style={{
          padding: '8px 16px',
          backgroundColor: '#f0f9ff',
          borderLeft: '3px solid #1890ff',
          margin: '8px 16px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              📝 分段笔记模式 | 当前已生成: {segmentedNoteStatus.currentRange || '第1-40页'} 
              {segmentedNoteStatus.totalPages > 0 && ` / 共${segmentedNoteStatus.totalPages}页`}
            </span>
            {segmentedNoteStatus.hasMore && (
              <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                还有更多内容可生成
              </span>
            )}
            {!segmentedNoteStatus.hasMore && (
              <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
                ✅ 已完整生成
              </span>
            )}
          </div>
        </div>
      )}
      
      <div className="note-content">
        {currentPageLoading ? (
          <div className="note-loading">正在生成内容，请稍候...</div>
        ) : improving ? (
          <div className="note-loading">
            <Spin spinning={true} size="large">
              <div className="spin-content">改进中...</div>
            </Spin>
          </div>
        ) : isEditing ? (
          <div className="note-editor-container">
          <TextArea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="note-editor-textarea"
            autoSize={{ minRows: 6, maxRows: 20 }}
          />
            <div className={`autosave-indicator ${autoSaveVisible ? 'visible' : ''}`}>
              已自动保存
            </div>
          </div>
        ) : displayContent ? (
          <div className="note-content-wrapper" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <MarkdownMathRenderer>{typeof displayContent === 'string' ? displayContent : String(displayContent || '')}</MarkdownMathRenderer>
          </div>
        ) : (
          <div className="note-placeholder">暂无内容</div>
        )}
      </div>
      
      {/* 原始文本弹窗 */}
      <Modal
        title="原始提取文本"
        open={rawTextVisible}
        onCancel={() => setRawTextVisible(false)}
        width={700}
        footer={[
          <Button key="close" onClick={() => setRawTextVisible(false)}>
            关闭
          </Button>,
          <Button 
            key="useVision" 
            type="primary" 
            onClick={handleUseVisionAnnotate}
            icon={<SyncOutlined />}
            disabled={!onForceVisionAnnotate}
          >
            使用图像识别重新生成
          </Button>
        ]}
      >
        {loadingRawText ? (
          <Spin spinning={true}>
            <div className="spin-content">加载中...</div>
          </Spin>
        ) : (
          <pre className="raw-text-content">
            {rawText}
          </pre>
        )}
      </Modal>
      
      {/* 改进内容弹窗 */}
      <Modal
        title={isVisionMode 
          ? "使用视觉模型重新识别" 
          : (type === 'annotation' ? "改进注释" : "改进笔记")}
        open={improveModalVisible}
        onOk={submitImproveRequest}
        onCancel={() => setImproveModalVisible(false)}
        okText="提交"
        cancelText="取消"
      >
        <div>
          <p>{isVisionMode 
            ? "请提供指导建议，帮助视觉模型更好地识别内容（选填）" 
            : (type === 'annotation' 
                ? "请提供改进建议，告诉AI如何改进当前注释（选填）" 
                : "请提供改进建议，告诉AI如何改进当前笔记（选填）")}
          </p>
          <Input.TextArea
            value={improvePrompt}
            onChange={(e) => setImprovePrompt(e.target.value)}
            placeholder={isVisionMode 
              ? "例如：请识别图中的公式并添加到注释中" 
              : (type === 'annotation'
                  ? "例如：请用中文重写，更详细地解释概念"
                  : "例如：简化语言，添加更多例子，突出重点")}
            rows={4}
          />
        </div>
        <div className="improve-hint">
          <p>改进建议示例：</p>
          <ul>
            <li>使语言更简洁易懂</li>
            <li>调整结构，使要点更突出</li>
            <li>添加更多具体的例子</li>
            <li>修正文本中的错误</li>
            <li>添加更详细的解释</li>
          </ul>
          <p>{type === 'annotation' 
            ? '提交后将使用您的建议重新生成注释，不填则直接重新生成' 
            : '提供建议可以使改进更有针对性，不填则系统将自动改进笔记质量'}</p>
        </div>
      </Modal>

      {/* 批量注释配置弹窗 */}
      <Modal
        title="批量注释配置"
        open={batchModalVisible}
        onOk={startBatchAnnotation}
        onCancel={() => setBatchModalVisible(false)}
        okText="开始批量注释"
        cancelText="取消"
        width={600}
      >
        <div className="batch-config-container">
          <div className="batch-section">
            <h4>📄 页面范围</h4>
            <Radio.Group 
              value={batchMode} 
              onChange={(e) => setBatchMode(e.target.value)}
              style={{ width: '100%' }}
            >
              <div className="batch-option">
                <Radio value="toEnd">批量注释到最后一页</Radio>
                <div className="batch-option-desc">
                  从第{pageNumber}页到第{pdf?.totalPages || 0}页 (共{pdf?.totalPages ? pdf.totalPages - pageNumber + 1 : 0}页)
                </div>
              </div>
              
              <div className="batch-option">
                <Radio value="preset">预设页数</Radio>
                <div className="batch-option-controls">
                  <Radio.Group 
                    value={presetPageCount}
                    onChange={(e) => setPresetPageCount(e.target.value)}
                    disabled={batchMode !== 'preset'}
                  >
                    <Radio.Button value={5}>5页</Radio.Button>
                    <Radio.Button value={10}>10页</Radio.Button>
                    <Radio.Button value={20}>20页</Radio.Button>
                  </Radio.Group>
                  <div className="batch-option-desc">
                    从第{pageNumber}页开始，向后{presetPageCount}页
                  </div>
                </div>
              </div>
              
              <div className="batch-option">
                <Radio value="custom">自定义页数</Radio>
                <div className="batch-option-controls">
                  <Input
                    type="number"
                    min="1"
                    max={pdf?.totalPages ? pdf.totalPages - pageNumber + 1 : 100}
                    value={customPageCount}
                    onChange={(e) => setCustomPageCount(parseInt(e.target.value) || 1)}
                    disabled={batchMode !== 'custom'}
                    style={{ width: 100 }}
                    addonAfter="页"
                  />
                  <div className="batch-option-desc">
                    从第{pageNumber}页开始，向后{customPageCount}页
                  </div>
                </div>
              </div>
            </Radio.Group>
          </div>

          <div className="batch-section">
            <h4>🎨 注释风格</h4>
            <Radio.Group 
              value={selectedAnnotationStyle} 
              onChange={(e) => setSelectedAnnotationStyle(e.target.value)}
              style={{ width: '100%' }}
            >
              <div className="annotation-style-options">
                <Radio value="detailed">📝 详细注释</Radio>
                <Radio value="keywords">🔑 关键词解释</Radio>
                <Radio value="translation">🌐 文本翻译</Radio>
                <Radio value="custom">⚙️ 自定义风格</Radio>
              </div>
            </Radio.Group>
            
            {selectedAnnotationStyle === 'custom' && (
              <div className="custom-prompt-section">
                <Input.TextArea
                  value={customAnnotationPrompt}
                  onChange={(e) => setCustomAnnotationPrompt(e.target.value)}
                  placeholder="请输入自定义注释风格的提示词，例如：请用简洁的中文总结要点，突出重要概念..."
                  rows={3}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}
          </div>

          <div className="batch-section">
            <h4>⚠️ 注意事项</h4>
            <ul className="batch-warnings">
              <li>批量注释将覆盖已有的注释内容</li>
              <li>处理过程中可以随时点击"停止"按钮中断</li>
              <li>建议在网络稳定的环境下进行批量操作</li>
              <li>大量页面的批量注释可能需要较长时间</li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NoteWindow; 