// VideoWindow 组件 - 最终修复版本
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Button, message, Space, Popconfirm } from 'antd';
import { 
  VideoCameraOutlined, 
  UploadOutlined, 
  DeleteOutlined, 
  CopyOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import './VideoWindow.css';
import api from '../api';

const { Dragger } = Upload;

/**
 * 视频窗口组件（最终修复版）
 * 修复了容器大小响应延迟和视频进度条控制问题
 */
const VideoWindow = ({ 
  window,
  boardId,
  onContentChange,
  onClose
}) => {
  const [videoUrl, setVideoUrl] = useState(window.content || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 300 });
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  // 同步外部内容变化，处理视频URL
  useEffect(() => {
    const content = window.content || '';
    if (content) {
      // 如果是相对路径，转换为完整URL
      if (content.startsWith('/api/videos/')) {
        const fullUrl = `${api.getBaseUrl()}${content}`;
        console.log(`🔄 [视频窗口] 转换相对URL为完整URL: ${content} -> ${fullUrl}`);
        setVideoUrl(fullUrl);
      } else {
        // 已经是完整URL，直接使用
        setVideoUrl(content);
      }
    } else {
      setVideoUrl('');
    }
  }, [window.content]);

  // 监听容器大小变化，实现响应式视频调整（最终修复版）
  useEffect(() => {
    // 检查运行环境
    if (typeof window === 'undefined') {
      console.log('服务器端渲染环境，跳过窗口大小监听');
      return;
    }

    const updateContainerSize = () => {
      if (containerRef.current) {
        // 使用offsetWidth/offsetHeight，与ImageWindow保持一致
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        const padding = 32; // 内边距
        
        const newWidth = Math.max(300, containerWidth - padding);
        const newHeight = Math.max(200, containerHeight - padding);
        
        // 只有当大小真正变化时才更新，避免不必要的重渲染
        setContainerSize(prevSize => {
          if (prevSize.width !== newWidth || prevSize.height !== newHeight) {
            console.log(`📐 [视频窗口-最终版] 容器大小更新: ${newWidth}x${newHeight} (原始: ${containerWidth}x${containerHeight})`);
            return { width: newWidth, height: newHeight };
          }
          return prevSize;
        });
      }
    };

    // 初始设置，稍微延迟确保DOM渲染完成
    const initialTimer = setTimeout(updateContainerSize, 50);

    // 创建ResizeObserver来监听容器大小变化（主要监听机制）
    let resizeObserver = null;
    if (window.ResizeObserver) {
      try {
        resizeObserver = new ResizeObserver((entries) => {
          // 使用requestAnimationFrame确保平滑的更新
          requestAnimationFrame(() => {
            console.log(`🔍 [视频窗口-最终版] ResizeObserver触发，entries数量:`, entries.length);
            updateContainerSize();
          });
        });

        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
          console.log(`👀 [视频窗口-最终版] 开始监听容器大小变化`);
        }
      } catch (error) {
        console.warn('ResizeObserver创建失败:', error);
      }
    }

    // 监听全局窗口大小变化作为备选方案
    const handleGlobalResize = () => {
      updateContainerSize();
    };
    
    if (window.addEventListener && typeof window.addEventListener === 'function') {
      try {
        window.addEventListener('resize', handleGlobalResize);
      } catch (error) {
        console.warn('窗口resize监听器添加失败:', error);
      }
    }

    // 添加MutationObserver监听DOM变化（捕获CSS样式变化）
    let mutationObserver = null;
    if (window.MutationObserver && containerRef.current) {
      try {
        mutationObserver = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && 
                (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
              shouldUpdate = true;
            }
          });
          if (shouldUpdate) {
            requestAnimationFrame(() => {
              console.log(`🔄 [视频窗口-最终版] MutationObserver触发大小更新`);
              updateContainerSize();
            });
          }
        });
        
        mutationObserver.observe(containerRef.current, {
          attributes: true,
          attributeFilter: ['style', 'class']
        });
        console.log(`🔍 [视频窗口-最终版] MutationObserver已启动`);
      } catch (error) {
        console.warn('MutationObserver创建失败:', error);
      }
    }

    // 进一步降低定时检查频率，主要依赖上述Observer机制
    const sizeCheckInterval = setInterval(() => {
      updateContainerSize();
    }, 2000); // 2秒检查一次作为最后保障，减少性能开销

    return () => {
      clearTimeout(initialTimer);
      
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
          console.log(`🛑 [视频窗口-最终版] 停止监听容器大小变化`);
        } catch (error) {
          console.warn('ResizeObserver清理失败:', error);
        }
      }
      
      if (mutationObserver) {
        try {
          mutationObserver.disconnect();
          console.log(`🛑 [视频窗口-最终版] 停止MutationObserver`);
        } catch (error) {
          console.warn('MutationObserver清理失败:', error);
        }
      }
      
      if (window.removeEventListener && typeof window.removeEventListener === 'function') {
        try {
          window.removeEventListener('resize', handleGlobalResize);
        } catch (error) {
          console.warn('窗口resize监听器移除失败:', error);
        }
      }
      
      clearInterval(sizeCheckInterval);
    };
  }, []);

  // 保存视频URL到后端 - 使用非阻塞异步方式
  const saveVideoUrl = (newVideoUrl, retryCount = 0) => {
    const maxRetries = 3;
    
    setSaving(true);
    console.log(`💾 [视频窗口] 开始保存视频URL (尝试 ${retryCount + 1}/${maxRetries + 1}): ${newVideoUrl?.substring(0, 100)}...`);
    
    // 使用Promise.then()而不是await，避免阻塞UI
    api.put(`/api/boards/${boardId}/windows/${window.id}`, {
      window: {
        ...window,
        content: newVideoUrl
      }
    }).then(response => {
      if (response) {
        console.log(`✅ [视频窗口] 视频URL保存成功: ${window.id}`);
        message.success('视频已保存');
        if (onContentChange) {
          onContentChange(newVideoUrl);
        }
      }
      setSaving(false);
    }).catch(error => {
      console.error(`❌ [视频窗口] 保存视频失败 (尝试 ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 指数退避：1s, 2s, 4s
        console.log(`🔄 [视频窗口] ${delay/1000}秒后重试保存...`);
        setTimeout(() => {
          saveVideoUrl(newVideoUrl, retryCount + 1);
        }, delay);
      } else {
        message.error(`保存失败: ${error.message} (已重试${maxRetries}次)`);
        setSaving(false);
      }
    });
  };

  // 处理文件上传 - 使用非阻塞异步方式
  const handleUpload = (file) => {
    setUploading(true);
    
    // 验证文件类型
    const isVideo = file.type.startsWith('video/');
    if (!isVideo) {
      message.error('只能上传视频文件！');
      setUploading(false);
      return false;
    }

    // 验证文件大小（100MB）
    const isLt100M = file.size / 1024 / 1024 < 100;
    if (!isLt100M) {
      message.error('视频大小不能超过100MB！');
      setUploading(false);
      return false;
    }

    // 创建预览URL
    const previewUrl = URL.createObjectURL(file);
    setVideoUrl(previewUrl);

    // 上传到服务器 - 使用Promise.then()而不是await，避免阻塞UI
    api.uploadVideo(file).then(uploadResponse => {
      console.log(`📤 [视频窗口] 视频上传API响应:`, uploadResponse);
      
      if (uploadResponse && uploadResponse.success && uploadResponse.url) {
        // 构建完整的视频URL，包含后端服务器地址
        const relativeUrl = uploadResponse.url;
        const fullVideoUrl = `${api.getBaseUrl()}${relativeUrl}`;
        
        console.log(`✅ [视频窗口] 视频上传成功`);
        console.log(`📁 [视频窗口] 相对URL: ${relativeUrl}`);
        console.log(`🌐 [视频窗口] 完整URL: ${fullVideoUrl}`);
        console.log(`💾 [视频窗口] 存储路径: ${uploadResponse.path}`);
        
        // 先设置视频URL，再保存到后端 
        // 注意：保存到后端仍使用相对URL，前端显示使用完整URL
        setVideoUrl(fullVideoUrl);
        saveVideoUrl(relativeUrl); // 后端保存相对路径，非阻塞调用
        
        // 清理预览URL
        URL.revokeObjectURL(previewUrl);
        console.log(`🧹 [视频窗口] 已清理预览URL`);
      } else {
        throw new Error(`视频上传失败: ${uploadResponse?.detail || '未知错误'}`);
      }
      setUploading(false);
    }).catch(error => {
      console.error('上传失败:', error);
      message.error('上传失败');
      setUploading(false);
    });
    
    return false; // 阻止自动上传
  };

  // 处理粘贴事件（支持视频文件粘贴）
  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      if (item.type.startsWith('video/')) {
        const file = item.getAsFile();
        if (file) {
          handleUpload(file);
          break;
        }
      }
    }
  };

  // 处理拖拽上传
  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: 'video/*',
    showUploadList: false,
    beforeUpload: handleUpload,
    disabled: uploading || saving
  };

  // 删除视频
  const handleDelete = async () => {
    try {
      const currentUrl = videoUrl;
      
      // 先清空视频显示
      setVideoUrl('');
      saveVideoUrl(''); // 非阻塞调用
      
      // 如果是已上传的视频，删除物理文件
      if (currentUrl && currentUrl.includes('/api/videos/view/')) {
        const filename = currentUrl.split('/api/videos/view/')[1];
        if (filename) {
          try {
            console.log(`🗑️ [视频窗口] 正在删除物理文件: ${filename}`);
            const deleteResponse = await api.deleteVideo(filename);
            console.log(`✅ [视频窗口] 物理文件删除成功:`, deleteResponse);
            message.success('视频及文件已完全删除');
          } catch (deleteError) {
            console.warn(`⚠️ [视频窗口] 物理文件删除失败:`, deleteError);
            message.success('视频已删除（但物理文件可能仍存在）');
          }
        } else {
          message.success('视频已删除');
        }
      } else {
        message.success('视频已删除');
      }
    } catch (error) {
      console.error('删除视频失败:', error);
      message.error('删除失败');
    }
  };

  // 复制视频URL
  const handleCopyUrl = () => {
    if (videoUrl) {
      navigator.clipboard.writeText(videoUrl).then(() => {
        message.success('视频链接已复制到剪贴板');
      }).catch(() => {
        message.error('复制失败');
      });
    }
  };

  // 选择文件
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // 文件选择处理
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  // 视频播放状态监听（简化日志，减少干扰）
  const handleVideoPlay = () => {
    setPlaying(true);
  };
  
  const handleVideoPause = () => {
    setPlaying(false);
  };

  const handleVideoEnded = () => {
    setPlaying(false);
  };

  // 视频加载事件处理
  const handleVideoLoadStart = () => {
    console.log('📥 [视频窗口] 开始加载视频');
  };

  const handleVideoLoadedData = () => {
    console.log('📹 [视频窗口] 视频数据已加载');
  };

  const handleVideoError = (e) => {
    console.error('❌ [视频窗口] 视频加载错误:', e);
  };

  return (
    <div 
      className="video-window" 
      data-window-id={window.id} 
      data-window-type="video"
      onPaste={handlePaste}
      tabIndex={-1}
      ref={containerRef}
      style={{ height: '100%', width: '100%' }}
    >
      {saving && (
        <div className="saving-indicator">
          保存中...
        </div>
      )}
      
      <div className="video-content">
        {videoUrl ? (
          <div className="video-display">
            <div 
              className="video-container-fixed" // 使用新的CSS类避免冲突
              style={{
                width: '100%',
                height: `${containerSize.height - 100}px`, // 预留控制按钮空间
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: '#000',
                borderRadius: '8px',
                position: 'relative' // 确保正确的层级
              }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  outline: 'none', // 移除焦点轮廓
                  zIndex: 1 // 确保video在最前面
                }}
                controls
                controlsList="nodownload noremoteplayback"
                preload="metadata"
                playsInline
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onEnded={handleVideoEnded}
                onLoadStart={handleVideoLoadStart}
                onLoadedData={handleVideoLoadedData}
                onError={handleVideoError}
              />
            </div>
            
            <div className="video-controls-panel">
              <Space>
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  onClick={handleSelectFile}
                  loading={uploading}
                >
                  更换视频
                </Button>
                
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopyUrl}
                >
                  复制链接
                </Button>
                
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    const content = window.content || '';
                    console.log(`🔄 [视频窗口] 手动刷新，重新加载视频:`, content);
                    if (content) {
                      // 强制重新设置视频URL
                      if (content.startsWith('/api/videos/')) {
                        const fullUrl = `${api.getBaseUrl()}${content}`;
                        setVideoUrl(fullUrl);
                      } else {
                        setVideoUrl(content);
                      }
                      message.success('视频已刷新');
                    } else {
                      message.warning('没有可刷新的视频内容');
                    }
                  }}
                >
                  刷新
                </Button>
                
                <Popconfirm
                  title="确定要删除这个视频吗？"
                  onConfirm={handleDelete}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          </div>
        ) : (
          <div className="video-upload" style={{ 
            height: `${containerSize.height - 80}px`,
            minHeight: '200px'
          }}>
            <Dragger {...uploadProps} style={{ 
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <p className="ant-upload-drag-icon">
                <VideoCameraOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
              </p>
              <p className="ant-upload-text">
                点击或拖拽视频到此区域上传
              </p>
              <p className="ant-upload-hint">
                支持 MP4、WebM、OGG、AVI、MOV 等格式，最大 100MB
                <br />
                也可以直接粘贴剪贴板中的视频 (Ctrl+V)
              </p>
            </Dragger>
            
            <div className="upload-actions">
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleSelectFile}
                loading={uploading}
              >
                选择视频文件
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default VideoWindow;