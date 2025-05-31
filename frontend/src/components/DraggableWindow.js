import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { CloseOutlined, PushpinOutlined, BgColorsOutlined } from '@ant-design/icons';
import { ColorPicker, Button, Popconfirm } from 'antd';
import ContextMenu from './ContextMenu';
import './DraggableWindow.css';

const DraggableWindow = ({ 
  children, 
  title, 
  defaultPosition = { x: 100, y: 100 },
  defaultSize = { width: 400, height: 300 },
  titleBarColor = '#1890ff',
  onClose,
  onDragStop,
  onResize,
  zIndex = 10,
  onBringToFront,  // 窗口前置回调
  onBringToTop,    // 窗口置顶回调
  windowId,        // 窗口唯一标识
  windowType,      // 窗口类型
  onContextMenu,   // 右键菜单回调，返回菜单项列表
  isPinned = false, // 窗口是否已被置顶
  onTogglePin,     // 切换置顶状态回调
  noPin = false,   // 是否隐藏置顶按钮
  showColorPicker = false, // 是否显示颜色选择器
  onColorChange,   // 颜色变化回调
  currentColor     // 当前颜色
}) => {
  // 直接获取视口大小的Ref - 在每次渲染时更新
  const viewportRef = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });
  
  // 使用defaultPosition和defaultSize作为初始值
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState('');
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    position: { x: 0, y: 0 },
    items: []
  });
  
  // 颜色选择器相关状态
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState(currentColor || titleBarColor);
  
  // 同步外部颜色变化
  useEffect(() => {
    setSelectedColor(currentColor || titleBarColor);
  }, [currentColor, titleBarColor]);
  
  // 鼠标偏移量和拖拽状态
  const dragState = useRef({
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    isDragging: false
  });
  const windowRef = useRef(null);
  
  // 使用直接的DOM参考获取侧边栏元素
  const siderRef = useRef(null);
  const headerRef = useRef(null);
  
  // 从DOM直接获取实际位置和尺寸
  useEffect(() => {
    // 更新视口尺寸
    const updateViewportSize = () => {
      viewportRef.current = {
        width: window.innerWidth,
        height: window.innerHeight
      };
    };
    
    // 获取侧边栏和头部引用
    siderRef.current = document.querySelector('.app-sider');
    headerRef.current = document.querySelector('.app-header');
    
    // 初始更新
    updateViewportSize();
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateViewportSize);
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);
  
  // 前置窗口 - 先定义这个函数，因为它被其他函数引用
  const handleBringToFront = useCallback(() => {
    if (onBringToFront) {
      onBringToFront();
    }
  }, [onBringToFront]);
  
  // 置顶窗口
  const handleBringToTop = useCallback(() => {
    if (onTogglePin) {
      onTogglePin(windowId);
    } else if (onBringToTop) {
      // 如果没有提供切换置顶回调，则使用传统置顶方法
      onBringToTop();
    }
  }, [onTogglePin, onBringToTop, windowId]);
  
  // 获取侧边栏宽度
  const getSiderWidth = useCallback(() => {
    const siderElement = document.querySelector('.app-sider');
    if (!siderElement) return 280; // 默认值
    
    const siderRect = siderElement.getBoundingClientRect();
    return siderRect.width;
  }, []);
  
  // 获取顶部导航栏高度
  const getHeaderHeight = useCallback(() => {
    const headerElement = document.querySelector('.app-header');
    if (!headerElement) return 64; // 默认值
    
    const headerRect = headerElement.getBoundingClientRect();
    return headerRect.height;
  }, []);
  
  // 计算侧边栏宽度和顶部高度
  const siderWidth = getSiderWidth();
  const headerHeight = getHeaderHeight();

  // 直接操作DOM的拖动函数 - 减少延迟
  const handleMouseMove = useCallback((e) => {
    if (!dragState.current.isDragging) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 确保所有值都是有效数字
    if (typeof dragState.current.startX !== 'number' || 
        typeof dragState.current.startY !== 'number' ||
        typeof dragState.current.startLeft !== 'number' ||
        typeof dragState.current.startTop !== 'number' ||
        typeof clientX !== 'number' ||
        typeof clientY !== 'number') {
      return;
    }
    
    // 计算位移
    const deltaX = clientX - dragState.current.startX;
    const deltaY = clientY - dragState.current.startY;
    
    // 计算新位置
    const newLeft = Math.max(0, dragState.current.startLeft + deltaX);
    const newTop = Math.max(0, dragState.current.startTop + deltaY);
    
    // 直接修改DOM样式以避免React渲染延迟
    if (windowRef.current) {
      windowRef.current.style.left = `${newLeft}px`;
      windowRef.current.style.top = `${newTop}px`;
      dragState.current.currentLeft = newLeft;
      dragState.current.currentTop = newTop;
    }
  }, []);
  
  const handleMouseUp = useCallback(() => {
    if (!dragState.current.isDragging) return;
    
    // 清除事件监听
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleMouseMove);
    document.removeEventListener('touchend', handleMouseUp);
    
    // 更新React状态以保持同步
    if (dragState.current.currentLeft !== undefined && 
        dragState.current.currentTop !== undefined) {
      setPosition({
        x: dragState.current.currentLeft,
        y: dragState.current.currentTop
      });
    }
    
    dragState.current.isDragging = false;
    setIsDragging(false);
    
    // 触发回调
    if (onDragStop) {
      onDragStop(null, {
        x: dragState.current.currentLeft || position.x,
        y: dragState.current.currentTop || position.y
      });
    }
  }, [onDragStop, position.x, position.y]);
  
  // 处理拖拽开始
  const handleDragStart = useCallback((e) => {
    // 阻止默认行为和事件冒泡
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 确保位置值有效
    const startLeft = typeof position.x === 'number' ? position.x : 0;
    const startTop = typeof position.y === 'number' ? position.y : 0;
    
    // 记录起始位置
    dragState.current = {
      startX: clientX,
      startY: clientY,
      startLeft: startLeft,
      startTop: startTop,
      isDragging: true
    };
    
    setIsDragging(true);
    
    // 前置窗口
    handleBringToFront();
    
    // 直接添加事件监听，不通过React的useEffect
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);
  }, [position, handleBringToFront, handleMouseMove, handleMouseUp]);
  
  // 开始调整大小
  const handleResizeStart = useCallback((e, type) => {
    e.stopPropagation();
    e.preventDefault();
    
    // 立即设置resize状态并前置窗口，确保第一次拖动生效
    setIsResizing(true);
    setResizeType(type);
    
    // 前置窗口
    handleBringToFront();
    
    // 记录起始位置和大小信息
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 确保值有效
    const currentWidth = typeof size.width === 'number' ? size.width : 400;
    const currentHeight = typeof size.height === 'number' ? size.height : 300;
    const currentLeft = typeof position.x === 'number' ? position.x : 0;
    const currentTop = typeof position.y === 'number' ? position.y : 0;
    
    dragState.current = {
      startX: clientX,
      startY: clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      startLeft: currentLeft,
      startTop: currentTop,
      isResizing: true,
      resizeType: type
    };
    
    // 改变鼠标样式以提供视觉反馈
    if (type === 'right') document.body.style.cursor = 'e-resize';
    else if (type === 'bottom') document.body.style.cursor = 's-resize';
    else if (type === 'corner') document.body.style.cursor = 'nwse-resize';
    
    // 注意：不在这里添加事件监听，而是通过useEffect统一管理
  }, [size, position, handleBringToFront]);
  
  // 处理右键菜单
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 如果提供了onContextMenu回调，则调用它获取菜单项
    if (onContextMenu) {
      const menuItems = onContextMenu({
        windowId,
        windowType,
        position
      });
      
      // 默认菜单项
      const defaultItems = [
        {
          label: isPinned ? '取消置顶' : '窗口置顶',
          onClick: handleBringToTop,
          icon: <PushpinOutlined style={{ color: isPinned ? '#1890ff' : 'inherit' }} />
        },
        {
          label: '关闭窗口',
          onClick: onClose,
          icon: <CloseOutlined />
        }
      ];
      
      // 合并自定义菜单项和默认菜单项
      const items = menuItems ? [...menuItems, ...defaultItems] : defaultItems;
      
      setContextMenu({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        items
      });
    } else {
      // 即使没有提供onContextMenu，也至少显示默认项
      const defaultItems = [
        {
          label: isPinned ? '取消置顶' : '窗口置顶',
          onClick: handleBringToTop,
          icon: <PushpinOutlined style={{ color: isPinned ? '#1890ff' : 'inherit' }} />
        },
        {
          label: '关闭窗口',
          onClick: onClose,
          icon: <CloseOutlined />
        }
      ];
      
      setContextMenu({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        items: defaultItems
      });
    }
    
    // 确保窗口置于前台
    handleBringToFront();
    
    return false; // 阻止默认右键菜单
  }, [onContextMenu, windowId, windowType, position, handleBringToTop, onClose, handleBringToFront, isPinned]);
  
  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);
  
  // 使用useEffect来监听调整大小过程中的事件
  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e) => {
        if (!dragState.current.isResizing) return;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // 确保所有值有效
        if (typeof dragState.current.startX !== 'number' ||
            typeof dragState.current.startY !== 'number' ||
            typeof dragState.current.startWidth !== 'number' ||
            typeof dragState.current.startHeight !== 'number' ||
            typeof clientX !== 'number' ||
            typeof clientY !== 'number') {
          return;
        }
        
        // 计算大小变化
        const deltaX = clientX - dragState.current.startX;
        const deltaY = clientY - dragState.current.startY;
        
        // 根据不同的调整类型处理大小
        let newWidth = dragState.current.startWidth;
        let newHeight = dragState.current.startHeight;
        
        if (dragState.current.resizeType === 'right' || dragState.current.resizeType === 'corner') {
          newWidth = Math.max(200, dragState.current.startWidth + deltaX);
        }
        
        if (dragState.current.resizeType === 'bottom' || dragState.current.resizeType === 'corner') {
          newHeight = Math.max(150, dragState.current.startHeight + deltaY);
        }
        
        // 确保结果不是NaN
        if (isNaN(newWidth) || isNaN(newHeight)) {
          console.error('调整大小计算出现NaN:', {
            clientX, clientY, dragState: {...dragState.current}, deltaX, deltaY
          });
          return;
        }
        
        // 更新大小
        setSize({
          width: newWidth,
          height: newHeight
        });
      };
      
      const handleMouseUp = () => {
        // 清除拖动状态
        dragState.current.isResizing = false;
        setIsResizing(false);
        setResizeType('');
        
        // 恢复默认光标
        document.body.style.cursor = '';
        
        // 调用回调
        if (onResize) {
          onResize(null, null, { offsetWidth: size.width, offsetHeight: size.height }, null, null);
        }
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleMouseMove);
      document.addEventListener('touchend', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleMouseMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isResizing, size, onResize]);
  
  return (
    <div 
      className={`draggable-window ${isPinned ? 'pinned-window' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onClick={handleBringToFront}
      onContextMenu={handleContextMenu}
      ref={windowRef}
      data-window-id={windowId}
      data-window-type={windowType}
      data-pinned={isPinned ? "true" : "false"}
    >
      <div className="window-content">
        <div 
          className="window-title-bar" 
          style={{ backgroundColor: titleBarColor }}
          onMouseDown={(e) => {
            // 检查是否点击的是控制按钮或其子元素
            if (e.target.closest('.window-controls')) {
              return; // 如果是控制按钮区域，不处理拖拽
            }
            
            if (e.button === 0) { // 只响应左键
              handleDragStart(e);
            }
          }}
          onTouchStart={(e) => {
            // 检查是否点击的是控制按钮或其子元素
            if (e.target.closest('.window-controls')) {
              return; // 如果是控制按钮区域，不处理拖拽
            }
            
            handleDragStart(e);
          }}
        >
          <div className="window-title">
            {isPinned && <PushpinOutlined style={{ marginRight: '8px', color: '#fff' }} />}
            {title}
          </div>
          <div className="window-controls">
            {showColorPicker && (
              <Popconfirm
                title="选择窗口颜色"
                description={
                  <div style={{ padding: '8px 0' }}>
                    <ColorPicker
                      value={selectedColor}
                      onChange={(color) => setSelectedColor(color.toHexString())}
                      showText
                      format="hex"
                      presets={[
                        {
                          label: '推荐颜色',
                          colors: [
                            '#1890ff', '#52c41a', '#722ed1', '#fa8c16',
                            '#eb2f96', '#faad14', '#13c2c2', '#f5222d'
                          ]
                        }
                      ]}
                    />
                  </div>
                }
                onConfirm={() => {
                  if (onColorChange) {
                    onColorChange(selectedColor);
                  }
                  setColorPickerVisible(false);
                }}
                onCancel={() => {
                  setSelectedColor(currentColor || titleBarColor);
                  setColorPickerVisible(false);
                }}
                okText="确定"
                cancelText="取消"
                open={colorPickerVisible}
                placement="bottomRight"
              >
                <button 
                  className="window-control-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setColorPickerVisible(!colorPickerVisible);
                  }}
                  title="更改窗口颜色"
                  type="button"
                >
                  <BgColorsOutlined />
                </button>
              </Popconfirm>
            )}
            {!noPin && (
              <button 
                className={`window-control-button ${isPinned ? 'active-control' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onTogglePin) {
                    console.log('点击窗口置顶按钮');
                    onTogglePin(windowId);
                  } else if (handleBringToTop) {
                    // 向后兼容
                    handleBringToTop();
                  }
                }}
                title={isPinned ? "取消置顶" : "窗口置顶"}
                type="button"
                style={isPinned ? {color: '#fff', backgroundColor: 'rgba(255, 255, 255, 0.2)'} : {}}
              >
                <PushpinOutlined />
              </button>
            )}
            <button 
              className="window-control-button window-close-button" 
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (onClose) {
                  console.log('点击关闭按钮');
                  onClose();
                }
              }}
              title="关闭窗口"
              type="button"
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        <div className="window-body">
          {children}
        </div>
      </div>
      
      {/* 调整大小的手柄 - 更大的感应区域和更明显的视觉提示 */}
      <>
        <div 
          className="resize-handle resize-handle-right"
          onMouseDown={(e) => handleResizeStart(e, 'right')}
          onTouchStart={(e) => handleResizeStart(e, 'right')}
          style={{ width: '16px', backgroundColor: isResizing && resizeType === 'right' ? 'rgba(24, 144, 255, 0.3)' : undefined }}
        />
        <div 
          className="resize-handle resize-handle-bottom"
          onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          onTouchStart={(e) => handleResizeStart(e, 'bottom')}
          style={{ height: '16px', backgroundColor: isResizing && resizeType === 'bottom' ? 'rgba(24, 144, 255, 0.3)' : undefined }}
        />
        <div 
          className="resize-handle resize-handle-corner"
          onMouseDown={(e) => handleResizeStart(e, 'corner')}
          onTouchStart={(e) => handleResizeStart(e, 'corner')}
          style={{ width: '24px', height: '24px', backgroundColor: isResizing && resizeType === 'corner' ? 'rgba(24, 144, 255, 0.3)' : undefined }}
        />
      </>
      
      {contextMenu.visible && (
        <ContextMenu 
          visible={contextMenu.visible}
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

export default memo(DraggableWindow); 