import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button, Tooltip, message } from 'antd';
import { LeftOutlined, RightOutlined, ReloadOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import './PDFViewer.css';

// 设置PDF.js的worker - 使用CDN路径
// pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
// 改用更可靠的方式
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const PDFViewer = ({ 
  file, 
  currentPage, 
  onPageChange,
  onGenerateNote,
  onGenerateAnnotation,
  isGeneratingNote,
  isGeneratingAnnotation,
  filename,
  onLoadError,
  onContextMenu,
  pdfId
}) => {
  const [numPages, setNumPages] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [fileError, setFileError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(currentPage || 1);
  const [containerWidth, setContainerWidth] = useState(800); // 新增状态来跟踪容器宽度
  const containerRef = useRef(null);
  const pdfDocument = useRef(null);

  // 同步currentPage属性与内部pageNumber状态
  useEffect(() => {
    if (currentPage && currentPage !== pageNumber) {
      console.log(`同步PDF页码: 从${pageNumber}更新为${currentPage}`);
      setPageNumber(currentPage);
    }
  }, [currentPage, pageNumber]);

  // 监听容器大小变化
  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const padding = 40; // 左右边距
        let newWidth = containerWidth - padding;
        
        // 设置合理的最小和最大宽度
        const minWidth = 300; // 最小宽度，确保可读性
        const maxWidth = 1200; // 最大宽度，避免在超大屏幕上PDF过于巨大
        
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        
        console.log(`PDF容器宽度更新: 容器=${containerWidth}px, PDF=${newWidth}px`);
        setContainerWidth(newWidth);
      }
    };

    // 初始设置
    updateContainerSize();

    // 创建ResizeObserver来监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      // 使用setTimeout来避免频繁更新
      setTimeout(updateContainerSize, 100);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // 也监听窗口大小变化作为备选方案
    window.addEventListener('resize', updateContainerSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateContainerSize);
    };
  }, []); // 移除containerWidth依赖，避免无限循环

  // 生成服务器文件URL
  const getServerFileUrl = useCallback((fname) => {
    if (!fname) return null;
    
    // 从各种可能的路径格式中提取实际文件名
    let actualFilename = fname;
    
    if (fname.startsWith('/api/materials/view/')) {
      actualFilename = fname.replace('/api/materials/view/', '');
    } else if (fname.startsWith('/materials/view/')) {
      actualFilename = fname.replace('/materials/view/', '');
    }
    
    // 先尝试解码再编码以确保正确处理
    try {
      actualFilename = decodeURIComponent(actualFilename);
    } catch (e) {
      console.log('文件名已经是解码状态');
    }
    
    const encodedName = encodeURIComponent(actualFilename);
    return `http://localhost:8000/materials/${encodedName}`;
  }, []);

  // 检查服务器文件是否存在
  const checkFileExists = useCallback(async (url) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('检查文件存在失败:', error);
      return false;
    }
  }, []);

  // 改进的文件URL处理
  useEffect(() => {
    console.log('PDF文件源变化:', { file, filename, type: file instanceof File ? 'File对象' : typeof file });
    
    // 清除之前的状态
    setFileError(false);
    setIsLoading(true);
    
    // 清理旧的URL
    if (fileUrl && fileUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(fileUrl);
        console.log('清理旧的Blob URL:', fileUrl);
      } catch (err) {
        console.warn('清理旧的URL失败:', err);
      }
    }
    
    if (!file) {
      setFileUrl(null);
      setIsLoading(false);
      return;
    }

    // 首先尝试使用服务器路径
    const tryServerPath = async () => {
      if (filename) {
        const serverUrl = getServerFileUrl(filename);
        // 先检查服务器文件是否存在
        const exists = await checkFileExists(serverUrl);
        if (exists) {
          console.log('服务器文件存在，使用服务器URL:', serverUrl);
          setFileUrl(serverUrl);
          return true;
        } else {
          console.warn('服务器文件不存在:', serverUrl);
          return false;
        }
      }
      return false;
    };

    // 处理不同类型的文件源
    const processFile = async () => {
      // 优先尝试服务器路径
      const serverFileExists = await tryServerPath();
      if (serverFileExists) return;

      if (file instanceof File) {
        try {
          const url = URL.createObjectURL(file);
          setFileUrl(url);
          console.log(`为文件 ${filename} 创建了新的Blob URL: ${url}`);
        } catch (err) {
          console.error('创建Blob URL失败:', err);
          setFileError(true);
          setIsLoading(false);
        }
      } else if (typeof file === 'string') {
        console.log('文件是字符串:', file);
        
        if (file.startsWith('blob:')) {
          try {
            // 尝试访问blob URL检查是否有效
            const blobValid = await fetch(file, { method: 'HEAD' })
              .then(() => true)
              .catch(() => false);
            
            if (blobValid) {
              console.log('Blob URL有效，使用:', file);
              setFileUrl(file);
            } else {
              console.warn('Blob URL无效，尝试服务器路径');
              const serverSuccess = await tryServerPath();
              if (!serverSuccess) {
                setFileError(true);
                setIsLoading(false);
              }
            }
          } catch (error) {
            console.warn('Blob URL检查失败，尝试服务器路径');
            const serverSuccess = await tryServerPath();
            if (!serverSuccess) {
              setFileError(true);
              setIsLoading(false);
            }
          }
        } else if (file.startsWith('http') || file.startsWith('data:')) {
          console.log('使用远程URL:', file);
          setFileUrl(file);
        } else if (file.startsWith('/api/') || file.startsWith('/materials/')) {
          // 提取实际文件名
          let actualFilename;
          if (file.startsWith('/api/materials/view/')) {
            actualFilename = file.replace('/api/materials/view/', '');
          } else if (file.startsWith('/materials/view/')) {
            actualFilename = file.replace('/materials/view/', '');
          } else {
            // 未识别的格式，使用整个路径
            actualFilename = file;
          }
          
          // 尝试解码以避免双重编码
          try {
            actualFilename = decodeURIComponent(actualFilename);
          } catch (e) {
            console.log('文件名已经是解码状态');
          }
          
          const serverUrl = `http://localhost:8000/materials/${encodeURIComponent(actualFilename)}`;
          console.log('修正为直接服务器路径:', serverUrl);
          setFileUrl(serverUrl);
        } else {
          // 处理服务器路径
          const serverUrl = getServerFileUrl(file);
          console.log('使用服务器路径URL:', serverUrl);
          setFileUrl(serverUrl);
        }
      } else {
        console.error('无效的文件类型:', file);
        // 最后尝试使用文件名
        if (!await tryServerPath()) {
          setFileError(true);
          setIsLoading(false);
        }
      }
    };

    processFile();
    
    // 组件清理时释放资源
    return () => {
      if (pdfDocument.current) {
        try {
          pdfDocument.current.destroy();
          pdfDocument.current = null;
        } catch (err) {
          console.warn('清理PDF文档失败:', err);
        }
      }
      
      if (fileUrl && fileUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(fileUrl);
        } catch (err) {
          console.warn('清理URL失败:', err);
        }
      }
    };
  }, [file, filename, getServerFileUrl, fileUrl, checkFileExists]);

  // 文档加载成功
  const onDocumentLoadSuccess = useCallback(({ numPages: pageCount, _pdfInfo }) => {
    console.log(`PDF加载成功，共${pageCount}页`);
    setNumPages(pageCount);
    setFileError(false);
    setIsLoading(false);
    setRetryCount(0); // 成功后重置重试计数
    
    if (_pdfInfo) {
      // 清理之前的PDF文档实例
      if (pdfDocument.current) {
        try {
          pdfDocument.current.destroy().catch(e => console.warn('清理旧PDF实例失败:', e));
        } catch (e) {
          console.warn('清理旧PDF实例出错:', e);
        }
      }
      
      pdfDocument.current = _pdfInfo.PDFDocumentProxy;
    }
  }, []);

  // 文档加载失败
  const onDocumentLoadError = useCallback(async (error) => {
    console.error('PDF加载错误:', error);
    
    // 如果blob URL失效且有文件名，尝试从服务器重新获取
    if (fileUrl?.startsWith('blob:') || error.name === 'MissingPDFException') {
      // 检查是否已经尝试过多次
      if (retryCount < 3) {
        console.log(`尝试第${retryCount + 1}次从服务器获取PDF`);
        setRetryCount(prev => prev + 1);
        
        if (filename) {
          const serverUrl = getServerFileUrl(filename);
          console.log('尝试服务器URL:', serverUrl);
          
          // 检查服务器文件是否存在
          const exists = await checkFileExists(serverUrl);
          if (exists) {
            console.log('服务器文件存在，使用服务器URL:', serverUrl);
            setFileUrl(serverUrl);
            setFileError(false);
            setIsLoading(true);
            return;
          } else {
            console.warn('服务器文件不存在:', serverUrl);
            // 尝试从服务器查询文件的真实路径
            try {
              const res = await fetch(`http://localhost:8000/materials/check/${encodeURIComponent(filename)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.exists && data.path) {
                  console.log('找到真实文件路径:', data.path);
                  setFileUrl(`http://localhost:8000/materials/view/${encodeURIComponent(data.path)}`);
                  setFileError(false);
                  setIsLoading(true);
                  return;
                }
              }
            } catch (err) {
              console.error('查询文件路径失败:', err);
            }
          }
        }
      }
      
      // 如果重试次数过多或没有文件名，设置错误状态
      setFileError(true);
      setIsLoading(false);
      
      // 通知上层组件
      if (onLoadError) {
        onLoadError({ 
          type: fileUrl?.startsWith('blob:') ? 'blob_error' : 'server_error', 
          message: fileUrl?.startsWith('blob:') ? 'Blob URL已失效' : '服务器文件不存在或无法访问',
          originalError: error
        });
      }
    } else {
      setFileError(true);
      setIsLoading(false);
      if (onLoadError) {
        onLoadError(error);
      }
    }
  }, [fileUrl, onLoadError, filename, retryCount, getServerFileUrl, checkFileExists]);

  // 切换到上一页
  const goToPrevPage = () => {
    if (pageNumber > 1 && onPageChange) {
      const newPage = pageNumber - 1;
      setPageNumber(newPage); // 更新内部状态
      onPageChange(newPage); // 通知父组件
      console.log(`导航到上一页: ${newPage}`);
    }
  };
  
  // 切换到下一页
  const goToNextPage = () => {
    if (numPages && pageNumber < numPages && onPageChange) {
      const newPage = pageNumber + 1;
      setPageNumber(newPage); // 更新内部状态
      onPageChange(newPage); // 通知父组件
      console.log(`导航到下一页: ${newPage}`);
    }
  };
  
  // 处理retry
  const handleRetry = () => {
    handleReload();
  };

  // 处理右键菜单
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 确保有pdfId，这是正确操作PDF的关键
    if (!pdfId) {
      console.error('PDF查看器缺少pdfId属性，无法正确处理右键菜单');
      message.error('无法识别PDF，请重新打开');
      return;
    }
    
    console.log('PDF查看器捕获右键点击', { pdfId, filename, pageNumber });
    
    // 默认菜单项，确保所有操作都带有正确的pdfId
    const defaultMenuItems = [
      {
        label: '上一页',
        onClick: goToPrevPage,
        disabled: pageNumber <= 1 || fileError,
        icon: <LeftOutlined />,
        command: 'prev_page',
        data: { pdfId, filename, pageNumber }
      },
      {
        label: '下一页',
        onClick: goToNextPage,
        disabled: pageNumber >= numPages || fileError,
        icon: <RightOutlined />,
        command: 'next_page',
        data: { pdfId, filename, pageNumber }
      },
      {
        label: '跳转到第一页',
        onClick: () => onPageChange(1),
        disabled: pageNumber === 1 || fileError,
        icon: <LeftOutlined />,
        command: 'goto_first_page',
        data: { pdfId, filename, pageNumber }
      },
      {
        label: '跳转到最后一页',
        onClick: () => numPages && onPageChange(numPages),
        disabled: pageNumber === numPages || fileError || !numPages,
        icon: <RightOutlined />,
        command: 'goto_last_page',
        data: { pdfId, filename, pageNumber }
      },
      { type: 'divider' },
      {
        label: '生成当前页笔记',
        icon: <FileTextOutlined />,
        onClick: () => {
          if (onGenerateAnnotation) {
            console.log('调用生成当前页笔记函数，pdfId:', pdfId);
            onGenerateAnnotation();
          }
        },
        command: 'generate_page_note',
        disabled: fileError || isLoading,
        data: { pdfId, filename, pageNumber }
      },
      {
        label: '生成整本笔记',
        icon: <FileTextOutlined />,
        onClick: () => {
          if (onGenerateNote) {
            console.log('调用生成整本笔记函数，pdfId:', pdfId);
            onGenerateNote();
          }
        },
        command: 'generate_full_note',
        disabled: fileError || isLoading,
        data: { pdfId, filename }
      },
      {
        label: '询问专家LLM',
        icon: <RobotOutlined />,
        command: 'ask_expert_llm',
        data: { pdfId, filename, boardId: pdfId }
      },
      {
        label: '刷新PDF',
        icon: <ReloadOutlined />,
        onClick: handleReload,
        command: 'refresh_pdf',
        data: { pdfId, filename }
      }
    ];
    
    // 如果提供了上下文菜单回调，使用它
    if (onContextMenu) {
      console.log('调用外部右键菜单回调');
      onContextMenu(e, defaultMenuItems);
    } else {
      console.log('没有提供上下文菜单回调，将使用默认菜单行为');
      // 如果没有提供回调，尝试使用全局右键菜单系统
      if (window.showContextMenu) {
        const menuItems = defaultMenuItems.filter(item => !item.disabled);
        window.showContextMenu(
          'pdf_viewer',
          menuItems,
          { x: e.clientX, y: e.clientY },
          { pdfId, filename, pageNumber }
        );
      } else {
        // 如果没有全局菜单系统，直接执行默认行为
        const menuItems = defaultMenuItems.filter(item => !item.disabled);
        
        // 显示一个简单的菜单
        // 这里只是模拟，实际上应该显示一个简单的内置菜单
        // 但为简单起见，我们只打印一条消息，并在控制台中显示可用操作
        console.log('可用菜单操作:', menuItems.map(item => item.label));
        // 可以直接执行第一个操作作为示例
        if (menuItems.length > 0 && menuItems[0].onClick) {
          menuItems[0].onClick();
        }
      }
    }
  };
  
  // 刷新PDF
  const handleReload = () => {
    if (fileUrl && fileUrl.startsWith('http')) {
      // 使用时间戳参数强制刷新
      const refreshUrl = fileUrl.includes('?') 
        ? `${fileUrl}&_refresh=${Date.now()}` 
        : `${fileUrl}?_refresh=${Date.now()}`;
      
      setFileUrl(refreshUrl);
      setIsLoading(true);
      message.info('正在刷新PDF...');
    } else if (filename) {
      // 重新从服务器获取
      const serverUrl = getServerFileUrl(filename);
      if (serverUrl) {
        setFileUrl(serverUrl);
        setIsLoading(true);
        message.info('正在重新加载PDF...');
      }
    }
  };

  return (
    <div className="pdf-viewer-container"
      data-filename={filename}
      data-page={pageNumber}
      data-pdf-id={pdfId || ''}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* 顶部控制栏 */}
      <div className="pdf-controls">
        <div className="pdf-navigation">
          <Button
            icon={<LeftOutlined />}
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || fileError}
            size="small"
            className="nav-button prev-button"
            title="上一页"
            type="link"
          />
          <span className="page-info">
            {pageNumber}/{numPages || '--'}
          </span>
          <Button
            icon={<RightOutlined />}
            onClick={goToNextPage}
            disabled={pageNumber >= numPages || fileError}
            size="small"
            className="nav-button next-button"
            title="下一页"
            type="link"
          />
        </div>
        
        <div className="pdf-actions">
          <Tooltip title="为当前页生成注释">
            <Button 
              type="primary"
              onClick={() => {
                console.log('点击生成注释按钮', {
                  fileError,
                  isLoading,
                  isGeneratingAnnotation,
                  pdfId,
                  pageNumber
                });
                if (onGenerateAnnotation) onGenerateAnnotation();
              }}
              loading={isGeneratingAnnotation}
              disabled={fileError}
              size="small"
            >
              注释
            </Button>
          </Tooltip>
          <Tooltip title="为整篇PDF生成笔记">
            <Button 
              onClick={() => {
                console.log('点击生成笔记按钮', {
                  fileError,
                  isLoading,
                  isGeneratingNote,
                  pdfId
                });
                if (onGenerateNote) onGenerateNote();
              }}
              loading={isGeneratingNote}
              disabled={fileError}
              size="small"
            >
              笔记
            </Button>
          </Tooltip>
        </div>
      </div>
      
      {/* PDF内容区 */}
      <div className="pdf-content" 
        ref={containerRef}
        onContextMenu={handleContextMenu}
        key={`pdf-content-${fileUrl}`}
      >
        {fileUrl ? (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="pdf-document"
            loading={<div className="pdf-message">正在加载PDF...</div>}
            error={<div className="pdf-message error">加载失败</div>}
            options={{
              cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.12.313/cmaps/',
              cMapPacked: true,
              standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.12.313/standard_fonts/'
            }}
            key={`document-${fileUrl}`}
          >
            {!fileError && (
              <Page
                pageNumber={pageNumber}
                className="pdf-page"
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<div className="pdf-message">正在渲染页面...</div>}
                error={<div className="pdf-message error">页面渲染失败</div>}
                width={containerWidth}
                key={`page-${pageNumber}-${fileUrl}`}
              />
            )}
          </Document>
        ) : (
          <div className="pdf-placeholder">
            {fileError ? (
              <div className="pdf-error-message">
                <p>PDF加载失败，请检查文件是否有效</p>
                <Button type="primary" onClick={handleRetry}>重新加载</Button>
              </div>
            ) : isLoading ? (
              <div className="pdf-message">正在准备PDF文件...</div>
            ) : (
              <p>未指定PDF文件</p>
            )}
          </div>
        )}
      </div>
      
      {/* 底部信息栏 */}
      <div className="pdf-footer">
        <span>文件名: {filename || "未命名PDF"}</span>
        {fileUrl && <span className="file-url-info">URL: {fileUrl.substring(0, 50)}...</span>}
      </div>
    </div>
  );
};

export default PDFViewer; 