import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileAddOutlined, 
  FolderOpenOutlined, 
  DeleteOutlined, 
  FileTextOutlined, 
  PictureOutlined, 
  ReloadOutlined, 
  SettingOutlined,
  PlusOutlined,
  FilePdfOutlined,
  CopyOutlined,
  ScissorOutlined,
  RobotOutlined
} from '@ant-design/icons';
import './ContextMenu.css';

// 菜单区域类型
const MENU_AREAS = {
  DEFAULT: 'default',
  PDF_VIEWER: 'pdf_viewer',
  NOTE_EDITOR: 'note_editor',
  SIDEBAR: 'sidebar',
  COURSE_ITEM: 'course_item',
  PDF_ITEM: 'pdf_item',
  MAIN_AREA: 'main_area',
  BOARD_AREA: 'board_area'
};

const GlobalContextMenu = ({ onCommand }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = useState([]);
  const [area, setArea] = useState(MENU_AREAS.DEFAULT);
  const [targetData, setTargetData] = useState(null);
  const menuRef = useRef(null);
  const [customMenuItems, setCustomMenuItems] = useState([]);
  const [customMenuPosition, setCustomMenuPosition] = useState(null);
  const [activeBoardIds, setActiveBoardIds] = useState([]);

  // 添加监听展板加载事件
  useEffect(() => {
    const handleBoardLoaded = (event) => {
      const { boardId } = event.detail;
      console.log('收到展板加载事件:', boardId);
      if (boardId && !activeBoardIds.includes(boardId)) {
        setActiveBoardIds(prev => [...prev, boardId]);
      }
    };
    
    window.addEventListener('board-loaded', handleBoardLoaded);
    return () => window.removeEventListener('board-loaded', handleBoardLoaded);
  }, [activeBoardIds]);

  // 处理点击菜单外部区域
  const handleClickOutside = useCallback((e) => {
    if (menuRef.current && !menuRef.current.contains(e.target)) {
      setVisible(false);
    }
  }, [menuRef]);

  // 公开显示自定义菜单的方法
  const showCustomMenu = useCallback((areaKey, items, menuPosition, contextData) => {
    console.log('显示自定义菜单', areaKey, items, menuPosition, contextData);
    
    // 设置自定义菜单项和位置
    setCustomMenuItems(items || []);
    setCustomMenuPosition(menuPosition);
    setArea(areaKey || MENU_AREAS.DEFAULT);
    setTargetData(contextData || null);
    setVisible(true);
  }, []);

  // 将showCustomMenu方法暴露给父组件
  useEffect(() => {
    // 如果提供了onShowCustomMenu回调，将showCustomMenu方法传递给它
    if (typeof window !== 'undefined') {
      window.showContextMenu = showCustomMenu;
      console.log('已全局注册右键菜单方法');
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete window.showContextMenu;
        console.log('已清理右键菜单方法');
      }
    };
  }, [showCustomMenu]);

  // 处理右键点击
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    console.log('捕获到右键点击事件', e.target);
    
    // 重置自定义菜单项
    setCustomMenuItems([]);
    setCustomMenuPosition(null);
    
    // 获取右键点击的元素
    const target = e.target;
    
    // 判断点击区域类型
    let areaType = MENU_AREAS.DEFAULT;
    let data = null;
    
    // 查找最近的展板区域 - 提前检查展板区域，因为其他元素可能嵌套在展板内
    const boardAreaElement = target.closest('.board-area');
    if (boardAreaElement) {
      areaType = MENU_AREAS.BOARD_AREA;
      data = {
        boardId: boardAreaElement.getAttribute('data-board-id'),
        boardName: boardAreaElement.getAttribute('data-board-name')
      };
      console.log('检测到展板区域', data);
    }
    
    // 特殊情况：如果点击的是展板背景（没有其他特定容器），确保正确识别为BOARD_AREA
    if (target.classList.contains('board-area') || 
        target.classList.contains('board-container') ||
        target.classList.contains('board-background')) {
      areaType = MENU_AREAS.BOARD_AREA;
      // 尝试从元素获取展板ID
      const boardId = target.getAttribute('data-board-id');
      if (boardId) {
        data = {
          boardId: boardId,
          boardName: target.getAttribute('data-board-name') || boardId
        };
      } 
      // 如果找不到展板ID，使用第一个活跃展板
      else if (activeBoardIds.length > 0) {
        data = {
          boardId: activeBoardIds[0],
          boardName: `展板 ${activeBoardIds[0]}`
        };
      }
      // 如果没有活跃展板，仍然提供默认展板信息
      else {
        data = {
          boardId: 'default-board',
          boardName: '默认展板'
        };
      }
      console.log('检测到展板背景区域', data);
    }
    
    // 查找最近的PDF查看器容器
    const pdfViewerElement = target.closest('.pdf-viewer-container');
    if (pdfViewerElement) {
      areaType = MENU_AREAS.PDF_VIEWER;
      data = {
        filename: pdfViewerElement.getAttribute('data-filename'),
        pageNumber: pdfViewerElement.getAttribute('data-page'),
        pdfId: pdfViewerElement.getAttribute('data-pdf-id')
      };
      
      // 如果PDF在展板内，添加展板ID
      if (boardAreaElement) {
        data.boardId = boardAreaElement.getAttribute('data-board-id');
      }
      
      console.log('检测到PDF查看器区域', data);
    }
    
    // 查找最近的编辑器容器
    const noteEditorElement = target.closest('.note-editor-container');
    if (noteEditorElement) {
      areaType = MENU_AREAS.NOTE_EDITOR;
      data = {
        type: noteEditorElement.getAttribute('data-note-type'),
        id: noteEditorElement.getAttribute('data-note-id')
      };
      
      // 如果笔记在展板内，添加展板ID
      if (boardAreaElement) {
        data.boardId = boardAreaElement.getAttribute('data-board-id');
      }
      
      console.log('检测到笔记编辑器区域', data);
    }
    
    // 查找侧边栏区域
    const sidebarElement = target.closest('.app-sider');
    if (sidebarElement) {
      areaType = MENU_AREAS.SIDEBAR;
      console.log('检测到侧边栏区域');
    }
    
    // 查找课程项
    const courseItemElement = target.closest('.course-item');
    if (courseItemElement) {
      areaType = MENU_AREAS.COURSE_ITEM;
      data = {
        courseId: courseItemElement.getAttribute('data-course-id'),
        courseName: courseItemElement.getAttribute('data-course-name')
      };
      console.log('检测到课程项区域', data);
    }
    
    // 查找PDF项
    const pdfItemElement = target.closest('.pdf-list-item');
    if (pdfItemElement) {
      areaType = MENU_AREAS.PDF_ITEM;
      data = {
        pdfId: pdfItemElement.getAttribute('data-pdf-id'),
        filename: pdfItemElement.getAttribute('data-filename')
      };
      console.log('检测到PDF项区域', data);
    }
    
    // 查找主要内容区域
    const mainAreaElement = target.closest('.app-content');
    if (mainAreaElement && areaType === MENU_AREAS.DEFAULT) {
      areaType = MENU_AREAS.MAIN_AREA;
      // 尝试获取当前课程文件信息作为boardId
      const courseExplorer = document.querySelector('.course-explorer');
      if (courseExplorer) {
        const activeCourse = courseExplorer.getAttribute('data-active-course');
        if (activeCourse) {
          data = { ...data, boardId: activeCourse };
        }
      }
      console.log('检测到主内容区域', data);
    }
    
    // 保存目标数据
    setTargetData(data);
    
    // 设置菜单区域类型
    setArea(areaType);
    
    // 计算显示位置，确保不超出屏幕边界
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setPosition({ x, y });
    
    // 根据区域类型生成菜单项
    const items = getMenuItemsByArea(areaType, data);
    setMenuItems(items);
    
    // 显示菜单
    setVisible(true);
    console.log('已显示菜单', areaType, items.length);
  }, []);
  
  // 根据区域类型获取菜单项
  const getMenuItemsByArea = (areaType, data) => {
    switch (areaType) {
      case MENU_AREAS.PDF_VIEWER:
        return [
          {
            label: '问专家LLM',
            icon: <RobotOutlined />,
            command: 'ask_expert_llm',
            data
          },
          { type: 'divider' },
          {
            label: '生成当前页笔记',
            icon: <FileTextOutlined />,
            command: 'generate_page_note',
            data
          },
          {
            label: '生成整本笔记',
            icon: <FileTextOutlined />,
            command: 'generate_full_note',
            data
          },
          {
            label: '使用视觉模型重新分析',
            icon: <PictureOutlined />,
            command: 'vision_analyze',
            data
          },
          { type: 'divider' },
          {
            label: '刷新PDF',
            icon: <ReloadOutlined />,
            command: 'refresh_pdf',
            data
          }
        ];
        
      case MENU_AREAS.NOTE_EDITOR:
        return [
          {
            label: '复制笔记内容',
            icon: <CopyOutlined />,
            command: 'copy_note',
            data
          },
          {
            label: '改进笔记内容',
            icon: <FileTextOutlined />,
            command: 'improve_note',
            data
          },
          { type: 'divider' },
          {
            label: '复制到我的笔记',
            icon: <CopyOutlined />,
            command: 'copy_to_user_note',
            data
          }
        ];
        
      case MENU_AREAS.SIDEBAR:
        return [
          {
            label: '添加新课程',
            icon: <FolderOpenOutlined />,
            command: 'add_course',
            data
          },
          {
            label: '刷新课程列表',
            icon: <ReloadOutlined />,
            command: 'refresh_courses',
            data
          }
        ];
        
      case MENU_AREAS.COURSE_ITEM:
        return [
          {
            label: '上传PDF到此课程',
            icon: <FilePdfOutlined />,
            command: 'upload_pdf',
            data
          },
          {
            label: '打开课程笔记',
            icon: <FileTextOutlined />,
            command: 'open_course_note',
            data
          },
          { type: 'divider' },
          {
            label: '删除课程',
            icon: <DeleteOutlined />,
            command: 'delete_course',
            data,
            danger: true
          }
        ];
        
      case MENU_AREAS.PDF_ITEM:
        return [
          {
            label: '打开PDF',
            icon: <FilePdfOutlined />,
            command: 'open_pdf',
            data
          },
          {
            label: '添加窗口',
            icon: <PlusOutlined />,
            children: [
              {
                label: 'PDF查看器',
                command: 'add_pdf_window',
                data: { ...data, windowType: 'pdf' }
              },
              {
                label: 'AI笔记窗口',
                command: 'add_pdf_window',
                data: { ...data, windowType: 'note' }
              },
              {
                label: 'AI注释窗口',
                command: 'add_pdf_window',
                data: { ...data, windowType: 'annotation' }
              },
              {
                label: '我的笔记窗口',
                command: 'add_pdf_window',
                data: { ...data, windowType: 'userNote' }
              }
            ]
          },
          { type: 'divider' },
          {
            label: '删除PDF',
            icon: <DeleteOutlined />,
            command: 'delete_pdf',
            data,
            danger: true
          }
        ];
        
      case MENU_AREAS.MAIN_AREA:
        return [
          {
            label: '上传PDF文件',
            icon: <FilePdfOutlined />,
            command: 'upload_pdf',
            data
          },
          {
            label: '打开展板笔记',
            icon: <FileTextOutlined />,
            command: 'open_board_note',
            data
          },
          {
            label: '问专家LLM',
            icon: <RobotOutlined />,
            command: 'ask_expert_llm',
            data
          },
          { type: 'divider' },
          {
            label: '整理窗口排列',
            icon: <SettingOutlined />,
            command: 'arrange_windows',
            data
          },
          {
            label: '关闭所有窗口',
            icon: <DeleteOutlined />,
            command: 'close_all_windows',
            data,
            danger: true
          }
        ];
        
      case MENU_AREAS.BOARD_AREA:
        return [
          {
            label: '问专家LLM',
            icon: <RobotOutlined />,
            command: 'ask_expert_llm',
            data
          },
          { type: 'divider' },
          {
            label: '上传PDF文件',
            icon: <FilePdfOutlined />,
            command: 'upload_pdf',
            data
          },
          {
            label: '打开展板笔记',
            icon: <FileTextOutlined />,
            command: 'open_board_note',
            data
          },
          { type: 'divider' },
          {
            label: '刷新展板',
            icon: <ReloadOutlined />,
            command: 'refresh_board',
            data
          }
        ];
        
      default:
        return [
          {
            label: '刷新',
            icon: <ReloadOutlined />,
            command: 'refresh',
            data
          }
        ];
    }
  };
  
  // 处理点击菜单项
  const handleItemClick = (item) => {
    console.log('点击菜单项:', item);
    if (item.command) {
      console.log('执行命令:', item.command, item.data || targetData);
      
      // 触发全局菜单命令事件，通知相关组件
      const commandEvent = new CustomEvent('menu-command', {
        detail: {
          command: item.command,
          data: item.data || targetData
        }
      });
      window.dispatchEvent(commandEvent);
      
      // 如果提供了回调，也执行回调
      if (onCommand) {
        onCommand(item.command, item.data || targetData);
      }
    } else {
      console.warn('无法执行命令:', item);
    }
    setVisible(false);
  };
  
  // 处理点击菜单外部区域
  useEffect(() => {
    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('wheel', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('wheel', handleClickOutside);
    };
  }, [visible, handleClickOutside]);
  
  // 绑定全局右键菜单事件
  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    console.log('已绑定全局右键菜单事件');
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      console.log('已解绑全局右键菜单事件');
    };
  }, [handleContextMenu]);
  
  // 渲染子菜单项
  const renderMenuItems = (items) => {
    return items.map((item, index) => {
      if (item.type === 'divider') {
        return <hr key={`divider-${index}`} />;
      }
      
      if (item.children) {
        return (
          <li 
            key={index} 
            className="has-submenu"
            onMouseEnter={(e) => {
              // 为子菜单计算位置
              const rect = e.currentTarget.getBoundingClientRect();
              const subMenu = e.currentTarget.querySelector('.sub-menu');
              if (subMenu) {
                subMenu.style.top = '0';
                subMenu.style.left = `${rect.width}px`;
                
                // 确保子菜单不超出屏幕右侧
                const subMenuRect = subMenu.getBoundingClientRect();
                if (subMenuRect.right > window.innerWidth) {
                  subMenu.style.left = `-${subMenuRect.width}px`;
                }
              }
            }}
          >
            <span className="menu-icon">{item.icon}</span>
            {item.label}
            <span className="submenu-arrow">▶</span>
            <ul className="sub-menu">
              {renderMenuItems(item.children)}
            </ul>
          </li>
        );
      }
      
      return (
        <li 
          key={index} 
          onClick={() => handleItemClick(item)}
          className={`${item.danger ? 'danger' : ''} ${item.command === 'ask_expert_llm' ? 'ask-expert-llm' : ''}`.trim()}
        >
          {item.icon && <span className="menu-icon">{item.icon}</span>}
          {item.label}
        </li>
      );
    });
  };
  
  // 创建菜单
  return createPortal(
    visible && (
      <div
        className="context-menu-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'transparent'
        }}
        onClick={handleClickOutside}
        onContextMenu={(e) => {
          e.preventDefault();
          handleClickOutside(e);
        }}
      >
        <div
          className="context-menu"
          style={{
            left: customMenuPosition ? customMenuPosition.x : position.x,
            top: customMenuPosition ? customMenuPosition.y : position.y,
            zIndex: 10000
          }}
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
        >
          {renderMenuItems(customMenuItems.length > 0 ? customMenuItems : menuItems)}
        </div>
      </div>
    ),
    document.body
  );
};

export default GlobalContextMenu;
export { MENU_AREAS }; 