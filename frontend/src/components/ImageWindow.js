import React, { useState, useEffect, useRef } from 'react';
import { Upload, Button, message, Image, Space, Popconfirm } from 'antd';
import { 
  PictureOutlined, 
  UploadOutlined, 
  DeleteOutlined, 
  CopyOutlined,
  ExpandOutlined
} from '@ant-design/icons';
import './ImageWindow.css';
import api from '../api';

const { Dragger } = Upload;

/**
 * 图片窗口组件
 * 支持图片上传、粘贴、显示和管理
 */
const ImageWindow = ({ 
  window,
  boardId,
  onContentChange,
  onClose
}) => {
  const [imageUrl, setImageUrl] = useState(window.content || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 300, height: 200 });
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // 同步外部内容变化，处理图片URL
  useEffect(() => {
    const content = window.content || '';
    if (content) {
      // 如果是相对路径，转换为完整URL
      if (content.startsWith('/api/images/')) {
        const fullUrl = `${api.getBaseUrl()}${content}`;
        console.log(`🔄 [图片窗口] 转换相对URL为完整URL: ${content} -> ${fullUrl}`);
        setImageUrl(fullUrl);
      } else {
        // 已经是完整URL，直接使用
        setImageUrl(content);
      }
    } else {
      setImageUrl('');
    }
  }, [window.content]);

  // 监听容器大小变化，实现响应式图片调整
  useEffect(() => {
    // 检查运行环境
    if (typeof window === 'undefined') {
      console.log('服务器端渲染环境，跳过窗口大小监听');
      return;
    }

    const updateContainerSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        const padding = 32; // 内边距
        
        const newWidth = Math.max(200, containerWidth - padding);
        const newHeight = Math.max(150, containerHeight - padding);
        
        console.log(`图片窗口容器大小更新: ${newWidth}x${newHeight}`);
        setContainerSize({ width: newWidth, height: newHeight });
      }
    };

    // 初始设置
    updateContainerSize();

    // 创建ResizeObserver来监听容器大小变化
    let resizeObserver = null;
    if (window.ResizeObserver) {
      try {
        resizeObserver = new ResizeObserver((entries) => {
          // 使用requestAnimationFrame确保平滑的更新
          requestAnimationFrame(() => {
            updateContainerSize();
          });
        });

        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }
      } catch (error) {
        console.warn('ResizeObserver创建失败:', error);
      }
    }

    // 也监听窗口大小变化作为备选方案
    if (window.addEventListener && typeof window.addEventListener === 'function') {
      try {
        window.addEventListener('resize', updateContainerSize);
      } catch (error) {
        console.warn('窗口resize监听器添加失败:', error);
      }
    }

    return () => {
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (error) {
          console.warn('ResizeObserver清理失败:', error);
        }
      }
      if (window.removeEventListener && typeof window.removeEventListener === 'function') {
        try {
          window.removeEventListener('resize', updateContainerSize);
        } catch (error) {
          console.warn('窗口resize监听器移除失败:', error);
        }
      }
    };
  }, []);

  // 保存图片URL到后端
  const saveImageUrl = async (newImageUrl, retryCount = 0) => {
    const maxRetries = 3;
    
    try {
      setSaving(true);
      console.log(`💾 [图片窗口] 开始保存图片URL (尝试 ${retryCount + 1}/${maxRetries + 1}): ${newImageUrl?.substring(0, 100)}...`);
      
      const response = await api.put(`/api/boards/${boardId}/windows/${window.id}`, {
        window: {
          ...window,
          content: newImageUrl
        }
      });
      
      if (response) {
        console.log(`✅ [图片窗口] 图片URL保存成功: ${window.id}`);
        message.success('图片已保存');
        if (onContentChange) {
          onContentChange(newImageUrl);
        }
      }
    } catch (error) {
      console.error(`❌ [图片窗口] 保存图片失败 (尝试 ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 指数退避：1s, 2s, 4s
        console.log(`🔄 [图片窗口] ${delay/1000}秒后重试保存...`);
        setTimeout(() => {
          saveImageUrl(newImageUrl, retryCount + 1);
        }, delay);
      } else {
        message.error(`保存失败: ${error.message} (已重试${maxRetries}次)`);
      }
    } finally {
      setSaving(false);
    }
  };

  // 处理文件上传
  const handleUpload = async (file) => {
    try {
      setUploading(true);
      
      // 验证文件类型
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('只能上传图片文件！');
        return false;
      }

      // 验证文件大小（10MB）
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('图片大小不能超过10MB！');
        return false;
      }

      // 创建预览URL
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);

      // 上传到服务器 - 使用专门的图片上传API
      const uploadResponse = await api.uploadImage(file);
      console.log(`📤 [图片窗口] 图片上传API响应:`, uploadResponse);
      
      if (uploadResponse && uploadResponse.success && uploadResponse.url) {
        // 构建完整的图片URL，包含后端服务器地址
        const relativeUrl = uploadResponse.url;
        const fullImageUrl = `${api.getBaseUrl()}${relativeUrl}`;
        
        console.log(`✅ [图片窗口] 图片上传成功`);
        console.log(`📁 [图片窗口] 相对URL: ${relativeUrl}`);
        console.log(`🌐 [图片窗口] 完整URL: ${fullImageUrl}`);
        console.log(`💾 [图片窗口] 存储路径: ${uploadResponse.path}`);
        
        // 先设置图片URL，再保存到后端 
        // 注意：保存到后端仍使用相对URL，前端显示使用完整URL
        setImageUrl(fullImageUrl);
        await saveImageUrl(relativeUrl); // 后端保存相对路径
        
        // 清理预览URL
        URL.revokeObjectURL(previewUrl);
        console.log(`🧹 [图片窗口] 已清理预览URL`);
      } else {
        throw new Error(`图片上传失败: ${uploadResponse?.detail || '未知错误'}`);
      }
      
      return false; // 阻止自动上传
    } catch (error) {
      console.error('上传失败:', error);
      message.error('上传失败');
      return false;
    } finally {
      setUploading(false);
    }
  };

  // 处理粘贴事件
  const handlePaste = async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          await handleUpload(file);
          break;
        }
      }
    }
  };

  // 处理拖拽上传
  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: handleUpload,
    disabled: uploading || saving
  };

  // 删除图片
  const handleDelete = async () => {
    try {
      const currentUrl = imageUrl;
      
      // 先清空图片显示
      setImageUrl('');
      await saveImageUrl('');
      
      // 如果是已上传的图片，删除物理文件
      if (currentUrl && currentUrl.includes('/api/images/view/')) {
        const filename = currentUrl.split('/api/images/view/')[1];
        if (filename) {
          try {
            console.log(`🗑️ [图片窗口] 正在删除物理文件: ${filename}`);
            const deleteResponse = await api.deleteImage(filename);
            console.log(`✅ [图片窗口] 物理文件删除成功:`, deleteResponse);
            message.success('图片及文件已完全删除');
          } catch (deleteError) {
            console.warn(`⚠️ [图片窗口] 物理文件删除失败:`, deleteError);
            message.success('图片已删除（但物理文件可能仍存在）');
          }
        } else {
          message.success('图片已删除');
        }
      } else {
        message.success('图片已删除');
      }
    } catch (error) {
      console.error('删除图片失败:', error);
      message.error('删除失败');
    }
  };

  // 复制图片URL
  const handleCopyUrl = () => {
    if (imageUrl) {
      navigator.clipboard.writeText(imageUrl).then(() => {
        message.success('图片链接已复制到剪贴板');
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

  return (
    <div 
      className="image-window" 
      data-window-id={window.id} 
      data-window-type="image"
      onPaste={handlePaste}
      tabIndex={-1}
      ref={containerRef}
      style={{ height: '100%', width: '100%' }}
    >
      <div className="image-content">
        {imageUrl ? (
          <div className="image-display">
            <div 
              className="image-container"
              style={{
                width: '100%',
                height: `${containerSize.height - 100}px`, // 预留控制按钮空间
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              <Image
                src={imageUrl}
                alt={window.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  transition: 'all 0.2s ease'
                }}
                preview={{
                  mask: (
                    <div>
                      <ExpandOutlined style={{ fontSize: '20px' }} />
                      <div style={{ marginTop: '8px' }}>查看大图</div>
                    </div>
                  )
                }}
              />
            </div>
            
            <div className="image-controls">
              <Space>
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  onClick={handleSelectFile}
                  loading={uploading}
                >
                  更换图片
                </Button>
                
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopyUrl}
                >
                  复制链接
                </Button>
                
                <Popconfirm
                  title="确定要删除这张图片吗？"
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
          <div className="image-upload" style={{ 
            height: `${containerSize.height - 80}px`,
            minHeight: '150px'
          }}>
            <Dragger {...uploadProps} style={{ 
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <p className="ant-upload-drag-icon">
                <PictureOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
              </p>
              <p className="ant-upload-text">
                点击或拖拽图片到此区域上传
              </p>
              <p className="ant-upload-hint">
                支持 JPG、PNG、GIF、WebP 格式，最大 10MB
                <br />
                也可以直接粘贴剪贴板中的图片 (Ctrl+V)
              </p>
            </Dragger>
            
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleSelectFile}
                loading={uploading}
              >
                选择图片文件
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default ImageWindow; 