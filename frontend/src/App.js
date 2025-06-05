import React, { useState, useEffect, useRef } from "react";
import { Layout, Button, Input, message, Upload, Tooltip, Modal, List, Avatar, Dropdown, Menu, Spin, Tabs, ConfigProvider } from "antd";
import { FileAddOutlined, UploadOutlined, FilePdfOutlined, DeleteOutlined, PlusOutlined, DownOutlined, FileTextOutlined, VerticalAlignTopOutlined, ArrowsAltOutlined, CloseOutlined, RobotOutlined, BugOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Resizable } from 'react-resizable';
import "antd/dist/reset.css";
import "react-resizable/css/styles.css";
import "./App.css";

import PDFViewer from "./components/PDFViewer";
import NoteWindow from "./components/NoteWindow";
import CourseExplorer from "./components/CourseExplorer";
import DraggableWindow from "./components/DraggableWindow";
import UserNoteEditor from "./components/UserNoteEditor";
import GlobalContextMenu from "./components/GlobalContextMenu";
import BoardExpertPanel from "./components/BoardExpertPanel";
import ButlerPanel from "./components/ButlerPanel";
import LLMDebugPanel from "./components/LLMDebugPanel";
import MarkdownMathRenderer from "./components/MarkdownMathRenderer";
import TaskStatusIndicator from "./components/TaskStatusIndicator";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import Console from "./components/Console"; // 控制台
import TaskList from "./components/TaskList"; // 导入任务列表组件
import TextBoxWindow from "./components/TextBoxWindow"; // 导入文本框窗口组件
import api from './api'; // 导入API客户端

const { Header, Sider, Content } = Layout;
const { TabPane } = Tabs;

// 生成完整的文件URL
const getFullFileUrl = (filename) => {
  if (!filename) return null;
  return `${api.getBaseUrl()}/materials/${encodeURIComponent(filename)}`;
};

// 预定义的窗口颜色列表
const PDF_COLORS = [
  '#1890ff', // 蓝色
  '#52c41a', // 绿色
  '#722ed1', // 紫色
  '#fa8c16', // 橙色
  '#eb2f96', // 玫红
  '#faad14', // 黄色
  '#13c2c2', // 青色
  '#f5222d', // 红色
];

// 获取PDF颜色，根据ID分配固定颜色或使用自定义颜色
const getPdfColor = (pdfId, colorKey = 'primary', customColor = null) => {
  // 如果有自定义颜色，使用自定义颜色
  if (customColor) {
    switch (colorKey) {
      case 'primary':
        return customColor;
      case 'light':
        return `${customColor}20`; // 20是透明度
      case 'dark':
        // 转换为HSL并减少亮度
        const color = customColor;
        if (color.startsWith('#')) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          return `rgb(${Math.floor(r*0.8)}, ${Math.floor(g*0.8)}, ${Math.floor(b*0.8)})`;
        }
        return customColor;
      default:
        return customColor;
    }
  }
  
  // 如果没有ID，返回默认颜色
  if (!pdfId) return '#1890ff';
  
  // 通过ID生成固定的颜色索引
  const idSum = pdfId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const colorIndex = idSum % PDF_COLORS.length;
  
  // 根据colorKey返回不同色调
  switch (colorKey) {
    case 'primary':
      return PDF_COLORS[colorIndex];
    case 'light':
      return `${PDF_COLORS[colorIndex]}20`; // 20是透明度
    case 'dark':
      // 转换为HSL并减少亮度
      const color = PDF_COLORS[colorIndex];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgb(${Math.floor(r*0.8)}, ${Math.floor(g*0.8)}, ${Math.floor(b*0.8)})`;
    default:
      return PDF_COLORS[colorIndex];
  }
};

// 用于生成唯一ID的函数
const generateId = () => `id-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// 在App.js顶部添加一个辅助函数来生成独立的展板ID
const generateBoardId = (courseFileKey) => {
  // 为每个课程文件生成一个独立的展板ID
  // 格式: board-{courseFileKey}-{timestamp}
  const timestamp = Date.now();
  return `board-${courseFileKey}-${timestamp}`;
};





function App() {
  // 添加一个状态来维护课程文件到展板ID的映射
  const [courseFileBoardMap, setCourseFileBoardMap] = useState({});

  // 添加一个辅助函数来获取或创建课程文件对应的展板ID
  const getBoardIdForCourseFile = (courseFileKey) => {
    if (!courseFileKey) return null;
    
    // 检查是否已经有映射的展板ID
    if (courseFileBoardMap[courseFileKey]) {
      return courseFileBoardMap[courseFileKey];
    }
    
    // 为新的课程文件创建展板ID
    const newBoardId = generateBoardId(courseFileKey);
    setCourseFileBoardMap(prev => ({
      ...prev,
      [courseFileKey]: newBoardId
    }));
    
    console.log(`🆕 为课程文件 ${courseFileKey} 创建新展板 ${newBoardId}`);
    return newBoardId;
  };

  // 课程文件管理
  const [courseFiles, setCourseFiles] = useState({});
  const [currentFile, setCurrentFile] = useState(null);
  const [activePdfId, setActivePdfId] = useState(null);
  const [showPdfSelector, setShowPdfSelector] = useState(false);
  const [courseData, setCourseData] = useState([]); // 存储课程数据
  const [uploadModalVisible, setUploadModalVisible] = useState(false); // 上传PDF的Modal可见性
  const [filesLoadedStatus, setFilesLoadedStatus] = useState({}); // 文件加载状态
  
  // 展板管理
  const [currentBoardId, setCurrentBoardId] = useState(null);
  
  // 章节笔记相关状态
  const [chapterNotes, setChapterNotes] = useState({});
  const [showChapterNoteWindow, setShowChapterNoteWindow] = useState(false);
  const [chapterNoteWindowPosition, setChapterNoteWindowPosition] = useState({ x: 300, y: 100 });
  const [chapterNoteWindowSize, setChapterNoteWindowSize] = useState({ width: 600, height: 500 });
  const [chapterNoteLoading, setChapterNoteLoading] = useState(false);
  
  // 专家LLM相关状态
  const [expertWindowVisible, setExpertWindowVisible] = useState(false);
  const [currentExpertBoardId, setCurrentExpertBoardId] = useState(null);
  const [expertWindowPosition, setExpertWindowPosition] = useState({ x: 350, y: 150 });
  const [expertWindowSize, setExpertWindowSize] = useState({ width: 550, height: 450 });
  const [expertHistory, setExpertHistory] = useState({});  // 保存每个展板的专家对话历史
  
  // 展板笔记相关状态
  const [boardNotes, setBoardNotes] = useState({});
  const [boardNoteWindowVisible, setBoardNoteWindowVisible] = useState({});
  const [boardNoteLoading, setBoardNoteLoading] = useState({});
  const [boardNoteWindowPosition, setBoardNoteWindowPosition] = useState({ x: 200, y: 200 });
  const [boardNoteWindowSize, setBoardNoteWindowSize] = useState({ width: 600, height: 400 });
  
  // 管家LLM相关状态
  const [assistantQuery, setAssistantQuery] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantResponse, setAssistantResponse] = useState('');
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [assistantWindowVisible, setAssistantWindowVisible] = useState(false);
  const [assistantWindowPosition, setAssistantWindowPosition] = useState({ x: 400, y: 200 });
  const [assistantWindowSize, setAssistantWindowSize] = useState({ width: 520, height: 400 });
  const [pendingCommand, setPendingCommand] = useState(null);
  
  // 控制台相关状态
  const [consoleVisible, setConsoleVisible] = useState(false);
  
  // 自定义窗口相关状态
  const [customWindows, setCustomWindows] = useState({}); // 存储每个展板的自定义窗口
  const [customWindowsVisible, setCustomWindowsVisible] = useState({}); // 控制自定义窗口的可见性
  
  // 控制台处理函数
  const handleToggleConsole = () => {
    setConsoleVisible(!consoleVisible);
  };
  
  const handleConsoleCommand = async (command) => {
    try {
      const response = await api.post('/api/butler/console', {
        command: command,
        multi_step_context: null
      });
      
      return response;
    } catch (error) {
      console.error('控制台命令执行失败:', error);
      throw error;
    }
  };
  
  // 控制台导航回调函数
  const handleConsoleNavigation = (navigationInfo) => {
    // 处理刷新请求
    if (navigationInfo.action === 'refresh_needed') {
      console.log('🔄 控制台请求刷新界面');
      // 刷新课程数据
      refreshCourses();
      
      // 🔧 修复：触发CourseExplorer的全局刷新事件
      const refreshEvent = new CustomEvent('whatnote-refresh-courses');
      window.dispatchEvent(refreshEvent);
      
      message.success('界面已刷新');
      return;
    }
    
    // 🔧 新增：处理控制台命令执行完成后的自动刷新
    if (navigationInfo.action === 'command_completed') {
      console.log('🔄 控制台命令执行完成，自动刷新界面');
      
      // 延迟1秒后刷新，确保后端数据已经更新
      setTimeout(() => {
        // 触发CourseExplorer的全局刷新事件
        const refreshEvent = new CustomEvent('whatnote-refresh-courses');
        window.dispatchEvent(refreshEvent);
        
        // 同时刷新本地的课程数据
        refreshCourses();
        
        console.log('✅ 界面已自动刷新');
      }, 1000);
      
      return;
    }
    
    // 处理进入课程导航
    if (navigationInfo.action === 'enter_course') {
      const courseName = navigationInfo.course_name;
      console.log(`🧭 控制台导航到课程: ${courseName}`);
      // 在courseData中查找匹配的课程
      const course = courseData.find(c => c.name === courseName);
      if (course && course.children && course.children.length > 0) {
        // 自动选择第一个展板/文件
        const firstBoard = course.children[0];
        handleSelectFile(firstBoard);
        console.log(`✅ 已切换到课程 "${courseName}" 的第一个展板: ${firstBoard.title}`);
        return true;
      }
      console.warn(`❌ 找不到课程: ${courseName}`);
      return false;
    }
    
    // 处理进入展板导航
    if (navigationInfo.action === 'enter_board') {
      const boardName = navigationInfo.board_name;
      const boardId = navigationInfo.board_id;
      console.log(`🧭 [DEBUG] 控制台导航到展板: ${boardName}, ID: ${boardId}`);
      
      // 在courseData中查找匹配的展板
      for (const course of courseData) {
        if (course.children) {
          const board = course.children.find(b => 
            b.title === boardName || 
            b.key === boardId ||
            b.title.includes(boardName)
          );
          if (board) {
            console.log(`🎯 [DEBUG] 找到匹配的展板，自动选择: ${board.title} (${board.key})`);
            console.log(`🔄 [DEBUG] 调用 handleSelectFile:`, board);
            handleSelectFile(board);
            
            // 🔧 新增：立即加载自定义窗口
            setTimeout(() => {
              console.log(`⏰ [DEBUG] 延时100ms后调用 loadCustomWindows: ${board.key}`);
              loadCustomWindows(board.key);
              console.log(`📦 [DEBUG] 已加载展板 ${board.key} 的自定义窗口`);
            }, 100);
            
            console.log(`✅ [DEBUG] 已切换到展板: ${boardName}`);
            return true;
          }
        }
      }
      
      // 🔧 增强：如果在现有courseData中找不到，尝试直接用boardId设置currentFile
      if (boardId) {
        console.log(`🔄 [DEBUG] 未在courseData中找到展板，尝试直接使用boardId: ${boardId}`);
        
        // 创建虚拟的文件节点
        const virtualBoard = {
          key: boardId,
          title: boardName,
          isLeaf: true
        };
        
        console.log(`🎯 [DEBUG] 创建虚拟展板节点并自动选择: ${boardName} (${boardId})`);
        console.log(`🔄 [DEBUG] 虚拟展板节点:`, virtualBoard);
        setCurrentFile(virtualBoard);
        
        // 立即加载自定义窗口
        setTimeout(() => {
          console.log(`⏰ [DEBUG] 延时100ms后为虚拟展板调用 loadCustomWindows: ${boardId}`);
          loadCustomWindows(boardId);
          console.log(`📦 [DEBUG] 已加载虚拟展板 ${boardId} 的自定义窗口`);
        }, 100);
        
        message.success(`已切换到展板: ${boardName}`);
        return true;
      }
      
      console.warn(`❌ [DEBUG] 找不到展板: ${boardName}`);
      return false;
    }
    
    // 处理PDF导航  
    if (navigationInfo.action === 'enter_pdf') {
      const pdfName = navigationInfo.pdf_name;
      const boardId = navigationInfo.board_id;
      console.log(`🧭 控制台导航到PDF: ${pdfName}, 展板: ${boardId}`);
      // 在当前展板的PDF中查找
      if (boardId && courseFiles[boardId]) {
        const pdf = courseFiles[boardId].find(p => 
          p.filename === pdfName || 
          p.clientFilename === pdfName ||
          p.filename.includes(pdfName) ||
          (p.clientFilename && p.clientFilename.includes(pdfName))
        );
        if (pdf) {
          handleSelectPdf(pdf.id);
          console.log(`✅ 已打开PDF: ${pdfName}`);
          return true;
        }
      }
      console.warn(`❌ 找不到PDF: ${pdfName}`);
      return false;
    }
    
    // 处理返回上级目录
    if (navigationInfo.action === 'go_back') {
      console.log(`🧭 控制台请求返回上级目录`);
      // 这里可以实现返回逻辑，比如回到课程列表
      return true;
    }
    
    console.warn('未知的导航操作:', navigationInfo);
    return false;
  };
  
  // 侧边栏宽度相关状态
  const [siderWidth, setSiderWidth] = useState(280);
  const [isResizingSider, setIsResizingSider] = useState(false);
  
  // 处理侧边栏宽度调整开始
  const handleSiderResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startWidth = siderWidth;
    const startX = e.clientX;
    
    // 设置拖拽状态
    setIsResizingSider(true);
    document.body.classList.add('resizing-sider');
    
    const handleMouseMove = (moveEvent) => {
      // 计算拖动距离
      const deltaX = moveEvent.clientX - startX;
      
      // 限制最小和最大宽度
      const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
      
      // 实时更新状态
      setSiderWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      // 清除拖拽状态
      setIsResizingSider(false);
      document.body.classList.remove('resizing-sider');
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  // 当前激活的PDF文件和相关状态
  const [pdfListModalVisible, setPdfListModalVisible] = useState(false);
  
  // 页面布局保存到localStorage的键名
  const LAYOUT_STORAGE_KEY = 'whatnote-layout';

  // 置顶窗口跟踪
  const [pinnedWindows, setPinnedWindows] = useState([]);

  // 调试面板相关状态
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [debugPanelPosition, setDebugPanelPosition] = useState({ x: 50, y: 50 });
  const [debugPanelSize, setDebugPanelSize] = useState({ width: 900, height: 600 });
  
  // 窗口高度状态
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  // 初始化 - 从localStorage加载保存的布局
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (savedLayout) {
        const layoutData = JSON.parse(savedLayout);
        // 加载课程文件结构
        setCourseFiles(layoutData.courseFiles || {});
        
        // 如果有上次使用的当前文件，恢复它
        if (layoutData.currentFileKey) {
          // 找到对应的课程文件
          const courseFilesList = Object.entries(layoutData.courseFiles || {}).map(([key, pdfs]) => ({
            key,
            pdfs,
            title: key.split('-').slice(1).join('-') // 从key中提取课程名称
          }));
          
          const lastFile = courseFilesList.find(file => file.key === layoutData.currentFileKey);
          if (lastFile) {
            setCurrentFile(lastFile);
            // 如果有上次活跃的PDF，也恢复它
            if (layoutData.activePdfId) {
              const activePdf = lastFile.pdfs.find(pdf => pdf.id === layoutData.activePdfId);
              if (activePdf) {
                setActivePdfId(layoutData.activePdfId);
              }
            }
          }
        }
      }

      // 检查API密钥配置
      checkApiConfig();
      
      // 添加窗口大小变化监听
      const handleResize = () => {
        setWindowHeight(window.innerHeight);
      };
      
      window.addEventListener('resize', handleResize);
      
      // 清理函数
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } catch (error) {
      console.error('加载保存的布局失败:', error);
    }
  }, []);

  // 检查API配置是否正确
  const checkApiConfig = async () => {
    try {
      const data = await api.getConfigStatus();
      
      if (!data.qwen_api_configured) {
        message.warning('通义千问API密钥未配置，笔记生成功能可能不可用。请在.env文件中配置QWEN_API_KEY');
      }
      
      if (!data.qwen_vl_api_configured) {
        message.warning('通义千问视觉API密钥未配置，图像识别功能不可用。请在.env文件中配置QWEN_VL_API_KEY');
      }
    } catch (error) {
      console.error('检查API配置失败:', error);
      
      // 检查是否是连接错误
      if (error.message.includes('Failed to fetch')) {
        message.warning('无法连接到后端服务，请确保后端服务已启动');
      }
    }
  };

  // 保存当前布局到localStorage
  const saveLayout = () => {
    try {
      // 创建一个可以序列化的对象
      const serializableCourseFiles = {};
      
      for (const key in courseFiles) {
        serializableCourseFiles[key] = courseFiles[key].map(pdf => {
          // 创建一个不包含file对象的PDF副本
          const { file, ...pdfWithoutFile } = pdf;
          
          // 确保fileUrl被保存，这是关键
          if (!pdfWithoutFile.fileUrl && file instanceof File) {
            // 如果没有fileUrl但有file对象，则使用serverFilename
            pdfWithoutFile.fileUrl = getFullFileUrl(pdfWithoutFile.serverFilename);
          }
          
          // 如果fileUrl是blob URL，替换为服务器URL
          if (pdfWithoutFile.fileUrl && pdfWithoutFile.fileUrl.startsWith('blob:') && pdfWithoutFile.serverFilename) {
            pdfWithoutFile.fileUrl = getFullFileUrl(pdfWithoutFile.serverFilename);
            console.log(`将blob URL替换为服务器URL: ${pdfWithoutFile.fileUrl}`);
          }
          
          return pdfWithoutFile;
        });
      }
      
      const layoutData = {
        courseFiles: serializableCourseFiles,
        currentFileKey: currentFile?.key,
        activePdfId: activePdfId
      };
      
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutData));
      console.log('布局已保存');
    } catch (error) {
      console.error('保存布局失败:', error);
    }
  };

  // 每当courseFiles变化时自动保存布局
  useEffect(() => {
    if (Object.keys(courseFiles).length > 0) {
      saveLayout();
    }
  }, [courseFiles]);

  // 获取当前活跃的PDF对象
  const getActivePdf = () => {
    if (!currentFile || !activePdfId) return null;
    
    const pdfs = courseFiles[currentFile.key] || [];
    return pdfs.find(pdf => pdf.id === activePdfId) || null;
  };

  // 获取当前课程文件的所有可见PDF
  const getVisiblePdfs = () => {
    if (!currentFile) return [];
    return (courseFiles[currentFile.key] || []).filter(pdf => 
      pdf.windows.pdf.visible || 
      pdf.windows.note.visible || 
      pdf.windows.annotation.visible ||
      (pdf.windows.answer && pdf.windows.answer.visible)
    );
  };

  // 更新PDF对象的多个属性
  const updatePdfProperties = (pdfId, properties) => {
    if (!currentFile) return;
    
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
          ...properties
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });
  };

  // 更新PDF对象的某个属性
  const updatePdfProperty = (pdfId, propertyName, value) => {
    if (!currentFile) return;
    
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
          [propertyName]: value
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });
  };

  // 上传PDF
  const handleFileChange = async (file) => {
    if (!currentFile) {
      message.error('请先选择一个课程文件');
      return;
    }
    
    // 如果参数是事件对象(有target属性)，则从事件中获取文件
    // 否则假设参数直接就是文件对象(Upload组件的beforeUpload传入的)
    const pdfFile = file.target && file.target.files ? file.target.files[0] : file;
    
    if (!pdfFile) {
      console.warn('⚠️ 没有选择文件');
      return;
    }
    
    // 检查是否为PDF文件
    if (pdfFile.type !== 'application/pdf') {
      message.error('请上传PDF文件');
      console.error('❌ 上传的不是PDF文件:', pdfFile.type);
      return;
    }

    console.log('📄 开始上传PDF文件:', pdfFile.name);
    
    try {
      console.log('🔄 发送文件上传请求到服务器');
      
      // 使用API客户端上传文件
      const data = await api.uploadFile(pdfFile);
      
      if (!data || !data.filename) {
        throw new Error('服务器未返回有效的文件名');
      }
      
      // 创建新的PDF对象
      const newPdfId = generateId();
      
      // 创建服务器文件URL，不再使用blob URL
      const serverFilename = data.filename;
      const fileUrl = getFullFileUrl(serverFilename);
      
      console.log('服务器文件名:', serverFilename);
      console.log('服务器文件URL:', fileUrl);
      
      const newPdf = {
        id: newPdfId,
        file: pdfFile,  // 保留原始文件对象作为备份
        fileUrl: fileUrl,  // 使用服务器URL
        clientFilename: pdfFile.name,  // 添加客户端文件名
        filename: data.filename,
        serverFilename: serverFilename,
        currentPage: 1,
        totalPages: data.pages || 0,
        customColor: null,  // 添加自定义颜色字段
        note: "",           // AI生成的整篇笔记
        userNote: "",       // 用户的整篇笔记
        pageAnnotations: {}, // AI生成的页面注释 {pageNum: "内容"}
        pageAnnotationSources: {}, // 页面注释的来源 {pageNum: "text"|"vision"}
        userPageNotes: {},   // 用户的页面笔记 {pageNum: "内容"}
        pageAnnotationLoadings: {}, // 页面级注释加载状态 {pageNum: boolean}
        windows: {
          pdf: {
            visible: true,
            position: { x: 50, y: 20 },
            size: { width: 680, height: 720 },
            zIndex: 100
          },
          note: {
            visible: false,
            position: { x: 750, y: 20 },
            size: { width: 520, height: 350 },
            zIndex: 101
          },
          annotation: {
            visible: false,
            position: { x: 750, y: 390 },
            size: { width: 520, height: 350 },
            zIndex: 102
          },
          answer: {
            visible: false,
            position: { x: 300, y: 200 },
            size: { width: 600, height: 350 },
            zIndex: 103
          },
          userNote: {         // 用户整篇笔记窗口
            visible: false,
            position: { x: 750, y: 20 },
            size: { width: 520, height: 350 },
            zIndex: 104
          },
          userPageNote: {     // 用户页面笔记窗口
            visible: false,
            position: { x: 750, y: 390 },
            size: { width: 520, height: 350 },
            zIndex: 105
          }
        }
      };
      
      // 在后端创建课程文件记录
      try {
        console.log('🔄 创建课程文件记录');
        const courseId = currentFile.key;
        
        // 如果当前选择的是文件而不是课程文件夹，尝试获取其父级课程ID
        let targetCourseId = courseId;
        if (currentFile.isLeaf) {
          // 从当前文件ID提取课程ID
          const match = courseId.match(/^file-(course-\d+)/);
          if (match && match[1]) {
            targetCourseId = match[1];
          } else {
            // 如果无法从文件ID提取课程ID，则使用文件所属的课程ID
            targetCourseId = currentFile.course_id || courseId;
          }
        }
        
        // ⚠️ 注意：这里不应该创建课程文件记录，因为上传PDF不等于创建新的展板文件
        // PDF应该关联到当前选中的展板文件，而不是创建新的文件记录
        // 创建课程文件记录
        // await api.createCourseFile(targetCourseId, pdfFile.name, serverFilename);
        
        console.log('✅ PDF文件已上传，关联到当前展板文件:', currentFile.title);
        // 创建成功后刷新左侧文件树（可选，如果需要显示更新后的状态）
        // refreshCourses();
      } catch (fileErr) {
        console.error('❌ 处理PDF文件关联时出错:', fileErr);
        // 这里的错误不应该影响PDF的正常使用，因为文件已经成功上传到服务器
      }
      
      // 将新PDF添加到当前课程文件
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        filePdfs.push(newPdf);
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      });
      
      // 设置新上传的PDF为当前激活的PDF
      setActivePdfId(newPdfId);
      
      console.log(`✅ 文件上传成功: ${data.filename}`);
      message.success(`PDF文件 "${pdfFile.name}" 上传成功`);
    } catch (err) {
      console.error('❌ 文件上传失败:', err);
      message.error(`上传PDF失败: ${err.message}`);
    } finally {
      setUploadModalVisible(false);
      
      // 清理上传组件的状态
      const uploadInput = document.querySelector('input[type="file"]');
      if (uploadInput) {
        uploadInput.value = '';
      }
    }
  };

  // 生成整本笔记
  const handleGenerateNote = async (pdfId) => {
    // 获取指定的PDF文件，而不是依赖当前活动的PDF
    const targetPdf = pdfId && currentFile ? 
      courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId) : 
      getActivePdf();
      
    if (!targetPdf) {
      message.warning('请先选择一个PDF文件');
      return;
    }
    
    console.log('🎯 [DEBUG] 目标PDF文件:', {
      pdfId: targetPdf.id,
      filename: targetPdf.filename,
      clientFilename: targetPdf.clientFilename,
      serverFilename: targetPdf.serverFilename,
      currentNote: targetPdf.note?.substring(0, 100) + '...'
    });
    
    // 使用目标PDF的ID，而不是活动PDF的ID
    const targetPdfId = targetPdf.id;
    const serverFilename = targetPdf.serverFilename;
    
    console.log(`🔄 开始为 ${targetPdf.clientFilename || targetPdf.filename}(ID:${targetPdfId}) 生成分段笔记...`);
    
    // 显示笔记窗口
    updatePdfProperty(targetPdfId, 'windows', {
      ...targetPdf.windows,
      note: {
        ...targetPdf.windows.note,
        visible: true
      }
    });
    
    // 设置加载状态和分段生成状态
    updatePdfProperty(targetPdfId, 'noteLoading', true);
    updatePdfProperty(targetPdfId, 'segmentedNoteStatus', {
      isSegmented: true,
      currentStartPage: 1,
      pageCount: 40,
      hasMore: false,
      totalPages: targetPdf.totalPages || 0
    });
    
    try {
      // 确保使用统一的boardId
      let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
      if (!currentExpertBoardId && currentFile) {
        setCurrentExpertBoardId(currentFile.key);
        boardId = currentFile.key;
      }
      
      if (!boardId) {
        throw new Error('无法确定展板ID');
      }
      
      console.log(`📊 分段笔记生成使用展板ID: ${boardId}`);
      
      // 调用分段生成API - 首次生成前40页
      const result = await api.generateSegmentedNote(serverFilename, 1, 40, '', boardId);
      
      // 提取分段生成结果
      const segmentedResult = result?.result || {};
      const noteContent = segmentedResult.note || '';
      const nextStartPage = segmentedResult.next_start_page;
      const hasMore = segmentedResult.has_more;
      const totalPages = segmentedResult.total_pages;
      const currentRange = segmentedResult.current_range;
      
      console.log('📝 [DEBUG] 分段生成结果:', {
        noteLength: noteContent.length,
        nextStartPage,
        hasMore,
        totalPages,
        currentRange,
        notePreview: noteContent.substring(0, 200) + '...'
      });
      
      if (noteContent && noteContent.trim()) {
        console.log(`✅ 成功生成分段笔记，长度: ${noteContent.length} 字符`);
        
        // 更新PDF状态
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === targetPdfId);
          
          if (pdfIndex !== -1) {
            filePdfs[pdfIndex] = {
              ...filePdfs[pdfIndex],
              note: noteContent,  // 存储笔记内容
              noteLoading: false,
              segmentedNoteStatus: {
                isSegmented: true,
                currentStartPage: nextStartPage || 1,
                pageCount: 40,
                hasMore: hasMore,
                totalPages: totalPages,
                currentRange: currentRange
              }
            };
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
        
        // 记录LLM交互日志到调试面板
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: `segmented-note-generation-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: `生成分段PDF笔记: ${targetPdf.clientFilename || targetPdf.filename} (${currentRange})`,
            response: noteContent,
            requestBody: {
              filename: serverFilename,
              start_page: 1,
              page_count: 40,
              existing_note: '',
              board_id: boardId
            },
            metadata: {
              operation: 'segmented_note_generation',
              requestType: 'generate_segmented_note',
              filename: serverFilename,
              boardId: boardId,
              streaming: false,
              taskBased: true,
              contentLength: noteContent.length,
              currentRange: currentRange,
              hasMore: hasMore
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        if (hasMore) {
          message.success(`笔记生成成功! (${currentRange}，还有更多内容可继续生成)`);
        } else {
          message.success('笔记生成成功!');
        }
      } else {
        console.error('❌ [DEBUG] 分段笔记生成响应中没有找到有效内容:', result);
        message.error('未能生成有效笔记，请重试');
        updatePdfProperty(targetPdfId, 'noteLoading', false);
      }
    } catch (error) {
      console.error('❌ [DEBUG] 生成分段笔记异常:', error);
      message.error(`生成笔记失败: ${error.message}`);
      updatePdfProperty(targetPdfId, 'noteLoading', false);
    }
    
    };

  // 继续生成笔记功能
  const handleContinueNote = async (pdfId) => {
    const targetPdf = pdfId && currentFile ? 
      courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId) : 
      getActivePdf();
      
    if (!targetPdf) {
      message.warning('请先选择一个PDF文件');
      return;
    }
    
    const segmentedStatus = targetPdf.segmentedNoteStatus;
    if (!segmentedStatus || !segmentedStatus.hasMore) {
      message.info('没有更多内容需要生成');
      return;
    }
    
    const targetPdfId = targetPdf.id;
    const serverFilename = targetPdf.serverFilename;
    const currentNote = targetPdf.note || '';
    const nextStartPage = segmentedStatus.currentStartPage;
    const pageCount = segmentedStatus.pageCount || 40;
    
    console.log(`🔄 继续生成笔记: ${targetPdf.clientFilename || targetPdf.filename}, 起始页: ${nextStartPage}`);
    
    // 设置加载状态
    updatePdfProperty(targetPdfId, 'noteLoading', true);
    
    try {
      // 确保使用统一的boardId
      let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
      if (!currentExpertBoardId && currentFile) {
        setCurrentExpertBoardId(currentFile.key);
        boardId = currentFile.key;
      }
      
      if (!boardId) {
        throw new Error('无法确定展板ID');
      }
      
      console.log(`📊 继续生成笔记使用展板ID: ${boardId}`);
      
      // 调用继续生成API
      const result = await api.continueSegmentedNote(serverFilename, currentNote, nextStartPage, pageCount, boardId);
      
      // 提取生成结果
      const segmentedResult = result?.result || {};
      const newNoteSegment = segmentedResult.note || '';
      const nextStartPageNew = segmentedResult.next_start_page;
      const hasMore = segmentedResult.has_more;
      const totalPages = segmentedResult.total_pages;
      const currentRange = segmentedResult.current_range;
      
      if (newNoteSegment && newNoteSegment.trim()) {
        console.log(`✅ 成功继续生成笔记，新段落长度: ${newNoteSegment.length} 字符`);
        
        // 将新内容追加到现有笔记
        const combinedNote = currentNote + '\n\n' + newNoteSegment;
        
        // 更新PDF状态
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === targetPdfId);
          
          if (pdfIndex !== -1) {
            filePdfs[pdfIndex] = {
              ...filePdfs[pdfIndex],
              note: combinedNote,  // 合并后的笔记内容
              noteLoading: false,
              segmentedNoteStatus: {
                ...segmentedStatus,
                currentStartPage: nextStartPageNew || nextStartPage,
                hasMore: hasMore,
                totalPages: totalPages,
                currentRange: currentRange
              }
            };
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
        
        // 记录LLM交互日志
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: `continue-note-generation-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: `继续生成PDF笔记: ${targetPdf.clientFilename || targetPdf.filename} (${currentRange})`,
            response: newNoteSegment,
            requestBody: {
              filename: serverFilename,
              current_note: currentNote,
              next_start_page: nextStartPage,
              page_count: pageCount,
              board_id: boardId
            },
            metadata: {
              operation: 'continue_note_generation',
              requestType: 'continue_segmented_note',
              filename: serverFilename,
              boardId: boardId,
              streaming: false,
              taskBased: true,
              contentLength: newNoteSegment.length,
              currentRange: currentRange,
              hasMore: hasMore
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        if (hasMore) {
          message.success(`笔记继续生成成功! (${currentRange}，还有更多内容可继续生成)`);
        } else {
          message.success('笔记已完整生成!');
        }
      } else {
        console.error('❌ [DEBUG] 继续生成笔记响应中没有找到有效内容:', result);
        message.error('未能生成有效的续写内容，请重试');
        updatePdfProperty(targetPdfId, 'noteLoading', false);
      }
    } catch (error) {
      console.error('❌ [DEBUG] 继续生成笔记异常:', error);
      message.error(`继续生成笔记失败: ${error.message}`);
      updatePdfProperty(targetPdfId, 'noteLoading', false);
    }
    
    };

  // 改进笔记功能
  const handleImproveNote = async (pdfId, improvePrompt) => {
    // 获取指定的PDF文件
    const targetPdf = pdfId && currentFile ? 
      courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId) : 
      getActivePdf();
      
    if (!targetPdf) {
      message.warning('请先选择一个PDF文件');
      return;
    }
    
    const currentNote = targetPdf.note || '';
    const serverFilename = targetPdf.serverFilename;
    
    console.log(`🔄 开始改进 ${targetPdf.clientFilename || targetPdf.filename}(ID:${pdfId}) 的笔记...`);
    console.log(`📝 当前笔记长度: ${currentNote.length}`);
    console.log(`👤 改进提示: "${improvePrompt || '无'}"`);
    
    // 设置加载状态
    updatePdfProperty(pdfId, 'noteLoading', true);
    
    try {
      // 确保使用统一的boardId
      let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
      if (!currentExpertBoardId && currentFile) {
        setCurrentExpertBoardId(currentFile.key);
        boardId = currentFile.key;
      }
      
      if (!boardId) {
        throw new Error('无法确定展板ID');
      }
      
      console.log(`📊 笔记改进使用展板ID: ${boardId}`);
      
      // 调用API改进笔记
      const result = await api.improveNote(serverFilename, currentNote, improvePrompt, boardId);
      
      console.log('🔍 [DEBUG] 笔记改进API响应:', {
        resultKeys: Object.keys(result || {}),
        hasResult: !!result?.result,
        resultLength: result?.result?.length || 0,
        resultPreview: result?.result?.substring(0, 200) + '...'
      });
      
      // 统一数据提取：API返回格式为 {result: "改进后的笔记内容"}
      const improvedNote = result?.result || result?.note || result || '';
      
      if (improvedNote && improvedNote.trim()) {
        console.log(`✅ 成功改进笔记，长度: ${improvedNote.length} 字符`);
      
      // 更新笔记内容
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
          
          if (pdfIndex !== -1) {
            filePdfs[pdfIndex] = {
              ...filePdfs[pdfIndex],
              note: improvedNote,
              noteLoading: false
            };
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
        
        // 记录LLM交互日志到调试面板
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: `note-improvement-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: `改进PDF笔记: ${targetPdf.clientFilename || targetPdf.filename}`,
            response: improvedNote,
            requestBody: {
              filename: serverFilename,
              current_note: currentNote,
              improve_prompt: improvePrompt,
              board_id: boardId
            },
            metadata: {
              operation: 'note_improvement',
              requestType: 'improve_note',
              filename: serverFilename,
              boardId: boardId,
              streaming: false,
              taskBased: true,
              contentLength: improvedNote.length
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        message.success('笔记改进成功!');
      } else {
        console.error('❌ [DEBUG] 笔记改进响应中没有找到有效内容:', result);
        message.error('未能生成有效的改进笔记，请重试');
        updatePdfProperty(pdfId, 'noteLoading', false);
      }
    } catch (error) {
      console.error('❌ [DEBUG] 改进笔记异常:', error);
      message.error(`改进笔记失败: ${error.message}`);
      updatePdfProperty(pdfId, 'noteLoading', false);
    }
    
  };

  // 为指定页面生成注释
  const handleGenerateAnnotation = async (pdfId, userImproveRequest = null) => {
    if (!currentFile) return;
    
    const pdf = courseFiles[currentFile.key]?.find(p => p.id === pdfId);
    if (!pdf) return;
    
    const pageNum = pdf.currentPage;
    const filename = pdf.filename || pdf.clientFilename;
    
    // 确保使用统一的boardId - 移到函数开始处
    let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
    if (!currentExpertBoardId && currentFile) {
      setCurrentExpertBoardId(currentFile.key);
      boardId = currentFile.key;
    }
    
    console.log(`🔄 开始为 ${filename}(ID:${pdfId}) 第${pageNum}页生成注释...`);
    console.log(`📊 注释生成使用展板ID: ${boardId}`);
    
    // 更新状态为"正在生成注释" - 按页面管理
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
          pageAnnotationLoadings: {
            ...filePdfs[pdfIndex].pageAnnotationLoadings,
            [pageNum]: true  // 只为当前页面设置加载状态
          }
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });
    
    try {
      // 确保注释窗口可见
      if (!pdf.windows.annotation.visible) {
        handleWindowChange(pdfId, 'annotation', { visible: true });
      }
      
      // 获取当前页面已有的注释（如果有）
      const currentAnnotation = pdf.pageAnnotations && pdf.pageAnnotations[pageNum] ? pdf.pageAnnotations[pageNum] : null;
      
      // 获取或创建会话ID
      const sessionId = pdf.sessionId || `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      if (!pdf.sessionId) {
        updatePdfProperty(pdfId, 'sessionId', sessionId);
      }
      
      if (!boardId) {
        throw new Error('无法确定展板ID');
      }
      
      // 调用API客户端生成注释
      const result = await api.generateAnnotation(
        filename, 
        pageNum, 
        sessionId, 
        currentAnnotation, 
        userImproveRequest,
        boardId
      );
      
      console.log('🔍 注释生成API响应:', {
        resultKeys: Object.keys(result || {}),
        hasAnnotation: !!result?.annotation,
        hasNote: !!result?.note,
        resultLength: (result?.annotation || result?.note || '').length
      });
      
      // 🔧 统一数据提取：API可能返回annotation或note字段
      const annotation = result?.annotation || result?.note || result || '';
      const annotationSource = result?.source || 'text';
      
      if (annotation && annotation.trim()) {
        console.log(`✅ 成功生成注释，长度: ${annotation.length} 字符`);
        
        // 🔧 直接更新状态，确保数据正确存储
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
          
          if (pdfIndex !== -1) {
            const updatedPdf = {
              ...filePdfs[pdfIndex],
              pageAnnotations: {
                ...filePdfs[pdfIndex].pageAnnotations,
                [pageNum]: annotation  // 存储到pageAnnotations
              },
              pageAnnotationSources: {
                ...filePdfs[pdfIndex].pageAnnotationSources,
                [pageNum]: annotationSource
              },
              pageAnnotationLoadings: {
                ...filePdfs[pdfIndex].pageAnnotationLoadings,
                [pageNum]: false  // 只清除当前页面的加载状态
              }
            };
            
            // 🔧 关键修复：只有当生成的注释是当前页面时，才更新当前显示的annotation
            if (filePdfs[pdfIndex].currentPage === pageNum) {
              updatedPdf.annotation = annotation;
              console.log(`📝 更新当前显示注释 (页面${pageNum}): ${annotation.length}字符`);
            } else {
              console.log(`📝 注释已存储但不更新显示 (生成页面${pageNum}, 当前页面${filePdfs[pdfIndex].currentPage})`);
            }
            
            filePdfs[pdfIndex] = updatedPdf;
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
        
        // 记录LLM交互日志到调试面板
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: `annotation-generation-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: `生成页面注释: ${filename} 第${pageNum}页`,
            response: annotation,
            requestBody: {
              filename: filename,
              page_number: pageNum,
              session_id: sessionId,
              current_annotation: currentAnnotation,
              improve_request: userImproveRequest,
              board_id: boardId
            },
            metadata: {
              operation: 'annotation_generation',
              requestType: 'generate_annotation',
              filename: filename,
              pageNumber: pageNum,
              sessionId: sessionId,
              boardId: boardId,
              streaming: false,
              taskBased: true,
              contentLength: annotation.length,
              source: annotationSource
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        message.success('注释生成成功!');
      } else {
        console.error('注释生成响应中没有找到有效内容:', result);
        message.error('未能生成有效注释，请重试');
        
        // 失败时也要清除当前页面的加载状态
        setCourseFiles(prev => {
          const filePdfs = [...(prev[currentFile.key] || [])];
          const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
          
          if (pdfIndex !== -1) {
            filePdfs[pdfIndex] = {
              ...filePdfs[pdfIndex],
              pageAnnotationLoadings: {
                ...filePdfs[pdfIndex].pageAnnotationLoadings,
                [pageNum]: false  // 清除当前页面的加载状态
              }
            };
            
            return {
              ...prev,
              [currentFile.key]: filePdfs
            };
          }
          
          return prev;
        });
      }
    } catch (error) {
      console.error('❌ 生成注释失败:', error);
      message.error(`生成注释失败: ${error.message}`);
      
      // 错误时也要清除当前页面的加载状态
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
        
        if (pdfIndex !== -1) {
          filePdfs[pdfIndex] = {
            ...filePdfs[pdfIndex],
            pageAnnotationLoadings: {
              ...filePdfs[pdfIndex].pageAnnotationLoadings,
              [pageNum]: false  // 清除当前页面的加载状态
            }
          };
          
          return {
            ...prev,
            [currentFile.key]: filePdfs
          };
        }
        
        return prev;
      });
    }
  };

  // 使用图像识别重新生成注释
  const handleForceVisionAnnotate = async (pdfId, userImproveRequest = null) => {
    const clickStartTime = performance.now();
    console.log(`🚀 [FRONTEND-CLICK] 用户点击注释生成，时间戳: ${clickStartTime}`);
    
    // 如果没有传入pdfId，尝试使用当前活动的PDF
    if (!pdfId) {
      const activePdf = getActivePdf();
      if (!activePdf) {
        message.warning('请先选择一个PDF文件');
        return;
      }
      pdfId = activePdf.id;
    }
    
    const pdfFindTime = performance.now();
    console.log(`📋 [FRONTEND-CLICK] PDF验证完成，耗时: ${(pdfFindTime - clickStartTime).toFixed(3)}ms`);
    
    // 从课程文件中获取指定的PDF
    let targetPdf = null;
    if (currentFile && courseFiles[currentFile.key]) {
      targetPdf = courseFiles[currentFile.key].find(pdf => pdf.id === pdfId);
    }
    
    if (!targetPdf) {
      message.error('未找到指定的PDF文件');
      return;
    }
    
    const dataExtractionTime = performance.now();
    const currentPage = targetPdf.currentPage;
    const serverFilename = targetPdf.serverFilename;
    
    console.log(`📄 [FRONTEND-CLICK] 数据提取完成，文件: ${serverFilename}, 页码: ${currentPage}, 耗时: ${(dataExtractionTime - pdfFindTime).toFixed(3)}ms`);
    
    // 设置加载状态
    const loadingStateTime = performance.now();
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
          pageAnnotationLoadings: {
            ...filePdfs[pdfIndex].pageAnnotationLoadings,
            [currentPage]: true  // 只为当前页面设置加载状态
          }
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });
    console.log(`⏳ [FRONTEND-CLICK] 加载状态设置完成，耗时: ${(performance.now() - loadingStateTime).toFixed(3)}ms`);
    
    // 显示注释窗口（如果未显示）
    const windowShowTime = performance.now();
    if (!targetPdf.windows.annotation.visible) {
      updatePdfProperty(pdfId, 'windows', {
        ...targetPdf.windows,
        annotation: {
          ...targetPdf.windows.annotation,
          visible: true
        }
      });
    }
    console.log(`🪟 [FRONTEND-CLICK] 窗口显示检查完成，耗时: ${(performance.now() - windowShowTime).toFixed(3)}ms`);
    
    try {
      // 使用sessionStorage存储当前会话ID
      const sessionId = sessionStorage.getItem('annotation-session-id') || 
                      `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      sessionStorage.setItem('annotation-session-id', sessionId);
      
      // 获取当前注释内容（如果有）
      const currentAnnotation = targetPdf.pageAnnotations?.[currentPage] || targetPdf.annotation || '';
      
      console.log(`使用API客户端发送图像识别注释请求，当前注释长度: ${currentAnnotation.length}字符`);
      
      // 安全处理improveRequest，确保它是一个字符串而不是对象或DOM元素
      let safeImproveRequest = null;
      if (userImproveRequest) {
        // 如果是字符串，直接使用
        if (typeof userImproveRequest === 'string') {
          safeImproveRequest = userImproveRequest;
        } 
        // 如果是对象且有值字段，使用值字段
        else if (typeof userImproveRequest === 'object' && userImproveRequest.value) {
          safeImproveRequest = userImproveRequest.value;
        }
        // 如果是事件对象或其他情况，使用默认值
        else {
          safeImproveRequest = "重新使用图像识别生成注释";
        }
      }
      
      // 判断是初次视觉识别还是有已存在的注释
      const isInitialRecognition = !currentAnnotation || currentAnnotation.length === 0;
      
      if (isInitialRecognition) {
        console.log(`首次视觉识别，无需传递当前注释`);
      } else {
        console.log(`基于已有注释(${currentAnnotation.length}字符)改进，传递改进提示: "${safeImproveRequest || '无'}"`);
      }
      
      // 获取当前展板ID
      // 确保使用统一的boardId - 优先使用currentExpertBoardId，然后是currentFile.key
      let boardId = currentExpertBoardId || (currentFile ? currentFile.key : null);
      
      // 如果没有currentExpertBoardId，设置它为currentFile.key确保一致性
      if (!currentExpertBoardId && currentFile) {
        setCurrentExpertBoardId(currentFile.key);
        boardId = currentFile.key;
      }
      
      console.log(`📊 图像识别使用展板ID: ${boardId || '无'}`);
      
      if (!boardId) {
        throw new Error('无法确定展板ID');
      }
      
      // 🔄 提交图像识别任务到动态任务队列
      const baseUrl = api.getBaseUrl();
      
      // 提交动态任务
      const taskResponse = await fetch(`${baseUrl}/api/expert/dynamic/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          board_id: boardId,
          task_info: {
            type: 'vision_annotation',
            params: {
              filename: serverFilename,
              page_number: currentPage,
              session_id: sessionId,
              current_annotation: isInitialRecognition ? null : currentAnnotation,
              improve_request: safeImproveRequest
            }
          }
        })
      });

      if (!taskResponse.ok) {
        throw new Error(`任务提交失败: ${taskResponse.status}`);
      }

      const taskData = await taskResponse.json();
      console.log(`✅ 图像识别任务已提交: ${taskData.task_id}`);
      
      // 等待任务完成（轮询）
      const pollTaskResult = async (taskId) => {
        const maxAttempts = 60; // 最多等待5分钟
        let attempts = 0;
        
        while (attempts < maxAttempts) {
          const resultResponse = await fetch(`${baseUrl}/api/expert/dynamic/result/${taskId}`);
          if (resultResponse.ok) {
            const result = await resultResponse.json();
            if (result.status === 'completed') {
              return result;  // 返回完整的result对象，而不只是result.result
            } else if (result.status === 'failed') {
              throw new Error(result.error || '任务执行失败');
            }
          }
          
          // 等待5秒后重试
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        }
        
        throw new Error('任务超时');
      };
      
      const data = await pollTaskResult(taskData.task_id);
      
      // 修复数据提取逻辑 - API返回的结构是 {status: 'completed', result: '内容'}
      const annotationContent = data.result || data.note || data.annotation || "无注释内容";
      const annotationSource = data.source || "vision"; // 获取注释来源，视觉模型默认为vision
      
      // 确保PDF仍然是当前活动的PDF
      if (activePdfId === pdfId || !activePdfId) {
        // 准备更新页面注释缓存
        const updatedPageAnnotations = {
        ...targetPdf.pageAnnotations,
        [currentPage]: annotationContent
        };
      
        // 准备更新注释来源缓存
        const updatedAnnotationSources = {
        ...targetPdf.pageAnnotationSources || {},
        [currentPage]: annotationSource
        };
        
        // 一次性更新所有相关属性
        setCourseFiles(prev => {
          const courseKey = currentFile.key;
          const pdfs = [...(prev[courseKey] || [])];
          const pdfIndex = pdfs.findIndex(pdf => pdf.id === pdfId);
          
          if (pdfIndex !== -1) {
            // 创建更新后的PDF对象
            pdfs[pdfIndex] = {
              ...pdfs[pdfIndex],
              pageAnnotations: updatedPageAnnotations,
              pageAnnotationSources: updatedAnnotationSources,
              annotation: annotationContent,  // 设置当前显示的注释内容
              pageAnnotationLoadings: {
                ...pdfs[pdfIndex].pageAnnotationLoadings,
                [currentPage]: false  // 只清除当前页面的加载状态
              }
            };
            
            return {
              ...prev,
              [courseKey]: pdfs
            };
          }
          
          return prev;
        });
      
        console.log(`✅ 页面${currentPage}图像识别注释获取成功: ${annotationContent.length}字符`);
        
        // 记录LLM交互日志到调试面板
        const logEvent = new CustomEvent('llm-interaction', {
          detail: {
            id: `vision-annotation-${Date.now()}`,
            timestamp: new Date().toISOString(),
            llmType: 'expert',
            query: `图像识别注释: ${safeImproveRequest || '标准识别'}`,
            response: annotationContent || '无响应',
            requestBody: {
              filename: serverFilename,
              page_number: currentPage,
              session_id: sessionId,
              current_annotation: isInitialRecognition ? null : currentAnnotation,
              improve_request: safeImproveRequest
            },
            metadata: {
              operation: 'vision_annotation',
              requestType: 'vision_annotation',
              filename: serverFilename,
              pageNumber: currentPage,
              sessionId: sessionId,
              streaming: false,
              taskBased: true,
              isInitialRecognition
            }
          }
        });
        window.dispatchEvent(logEvent);
        
        message.success('图像识别注释生成成功');
      }
    } catch (err) {
      console.error("❌ 图像识别注释失败:", err);
      message.error("图像识别注释失败");
      
      // 清理页面级加载状态 - 失败时也要清理
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        const pdfIndex = filePdfs.findIndex(p => p.id === pdfId);
        
        if (pdfIndex !== -1) {
          filePdfs[pdfIndex] = {
            ...filePdfs[pdfIndex],
            pageAnnotationLoadings: {
              ...filePdfs[pdfIndex].pageAnnotationLoadings,
              [currentPage]: false  // 清除当前页面的加载状态
            }
          };
          
          return {
            ...prev,
            [currentFile.key]: filePdfs
          };
        }
        
        return prev;
      });
    }
  };

  // 处理页面变化，使用特定PDF的ID而不是活跃PDF
  const handlePageChange = (newPage, specificPdfId = null) => {
    // 如果提供了具体的PDF ID，使用它；否则使用活跃的PDF
    const pdfId = specificPdfId || (getActivePdf()?.id);
    if (!pdfId) {
      console.error('handlePageChange: 无有效的PDF ID');
      return;
    }
    
    console.log(`更新PDF(${pdfId})的页码从${currentFile && courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId)?.currentPage || '未知'}到: ${newPage}`);
    
    // 从课程文件中获取对应的PDF
    const targetPdf = currentFile && courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId);
    if (!targetPdf) {
      console.error('handlePageChange: 找不到目标PDF:', pdfId);
      return;
    }
    
    // 更新当前页码
    setCourseFiles(prev => {
      const courseKey = currentFile.key;
      const pdfs = [...(prev[courseKey] || [])];
      const pdfIndex = pdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        const updatedPdf = {
          ...pdfs[pdfIndex],
          currentPage: newPage
        };
        
        // 如果该页已有缓存的注释，则更新当前显示的注释内容
        if (updatedPdf.pageAnnotations && updatedPdf.pageAnnotations[newPage]) {
          // 更新当前显示的注释内容为当前页的缓存注释
          updatedPdf.annotation = updatedPdf.pageAnnotations[newPage];
          console.log(`页面${newPage}已有缓存注释，内容长度: ${updatedPdf.pageAnnotations[newPage].length}字符`);
        } else {
          // 如果这个页面没有缓存的注释，清空当前显示的注释内容
          // 避免显示上一页的注释内容
          updatedPdf.annotation = '';
          console.log(`页面${newPage}没有缓存的注释，显示为空`);
        }
        
        // 注意：不再自动显示注释窗口，保留窗口当前的可见状态
        
        pdfs[pdfIndex] = updatedPdf;
        
        return {
          ...prev,
          [courseKey]: pdfs
        };
      }
      
      return prev;
    });
  };

  // 处理窗口位置和大小变化
  const handleWindowChange = (pdfId, windowName, changes) => {
    setCourseFiles(prev => {
      const courseKey = currentFile.key;
      const pdfs = [...(prev[courseKey] || [])];
      const pdfIndex = pdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        // 创建更新后的窗口配置
        const updatedWindows = {
          ...pdfs[pdfIndex].windows,
          [windowName]: {
            ...pdfs[pdfIndex].windows[windowName],
            ...changes
          }
        };
        
        // 确保所有位置和大小更新都被正确保存
        if (changes.position) {
          updatedWindows[windowName].position = changes.position;
        }
        
        if (changes.size) {
          updatedWindows[windowName].size = changes.size;
        }
        
        // 创建更新后的PDF对象
        const updatedPdf = {
          ...pdfs[pdfIndex],
          windows: updatedWindows
        };
        
        // 更新PDF数组
        pdfs[pdfIndex] = updatedPdf;
        
        // 确保在状态更新后立即保存到localStorage
        const updatedCourseFiles = {
          ...prev,
          [courseKey]: pdfs
        };
        
        // 延迟保存到localStorage以提高性能
        setTimeout(() => saveLayout(), 100);
        
        return updatedCourseFiles;
      }
      
      return prev;
    });
  };

  // 处理窗口关闭
  const handleWindowClose = (pdfId, windowName) => {
    setCourseFiles(prev => {
      const courseKey = currentFile.key;
      const pdfs = [...(prev[courseKey] || [])];
      const pdfIndex = pdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        const updatedWindows = {
          ...pdfs[pdfIndex].windows,
          [windowName]: {
            ...pdfs[pdfIndex].windows[windowName],
            visible: false
          }
        };
        
        pdfs[pdfIndex] = {
          ...pdfs[pdfIndex],
          windows: updatedWindows
        };
        
        return {
          ...prev,
          [courseKey]: pdfs
        };
      }
      
      return prev;
    });
  };

  // 获取全局最高z-index（考虑所有窗口类型）
  const getGlobalMaxZIndex = () => {
    let maxZIndex = 100;
    
    // 检查所有课程的PDF窗口
    Object.values(courseFiles).forEach(pdfs => {
      const pdfArray = Array.isArray(pdfs) ? pdfs : [];
      pdfArray.forEach(pdf => {
        Object.values(pdf.windows).forEach(window => {
          if (window.zIndex > maxZIndex) {
            maxZIndex = window.zIndex;
          }
        });
      });
    });
    
    // 检查置顶窗口列表中的所有窗口
    pinnedWindows.forEach(w => {
      if (w.zIndex && w.zIndex > maxZIndex) {
        maxZIndex = w.zIndex;
      }
    });
    
    // 检查其他固定z-index的窗口
    if (debugPanelVisible) {
      maxZIndex = Math.max(maxZIndex, 1000);
    }
    
    if (expertWindowVisible) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    if (assistantWindowVisible) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    if (showChapterNoteWindow) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    return maxZIndex;
  };

  // 获取当前最高的zIndex
  const getMaxZIndex = () => {
    let maxZIndex = 100;
    
    // 检查PDF窗口
    if (currentFile) {
      const pdfs = courseFiles[currentFile.key] || [];
      
      pdfs.forEach(pdf => {
        Object.values(pdf.windows).forEach(window => {
          if (window.zIndex > maxZIndex) {
            maxZIndex = window.zIndex;
          }
        });
      });
    }
    
    // 检查置顶窗口列表中的所有窗口
    pinnedWindows.forEach(w => {
      if (w.zIndex && w.zIndex > maxZIndex) {
        maxZIndex = w.zIndex;
      }
    });
    
    // 检查其他固定z-index的窗口
    // 调试面板：1000
    if (debugPanelVisible) {
      maxZIndex = Math.max(maxZIndex, 1000);
    }
    
    // 如果专家LLM窗口可见
    if (expertWindowVisible) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    // 如果管家LLM窗口可见
    if (assistantWindowVisible) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    // 如果章节笔记窗口可见
    if (showChapterNoteWindow) {
      maxZIndex = Math.max(maxZIndex, 500);
    }
    
    return maxZIndex;
  };

  // 获取普通窗口和置顶窗口的基础zIndex
  const getBaseZIndices = () => {
    // 普通窗口基础z-index: 100-999
    const normalBase = 100;
    
    // 置顶窗口使用更高的范围: 1000以上
    const pinnedBase = 1000;
    
    return { normalBase, pinnedBase };
  };

  // 通用窗口前置函数（处理非PDF窗口）
  const handleBringNonPdfWindowToFront = (windowId, windowType) => {
    console.log('🔼 非PDF窗口前置:', { windowId, windowType });
    
    // 检查窗口是否已经被置顶
    const [type, id] = windowId.split(':');
    const isPinned = pinnedWindows.some(w => w.pdfId === type && w.windowName === id);
    const { normalBase, pinnedBase } = getBaseZIndices();
    
    console.log('🔍 非PDF窗口状态:', { isPinned, normalBase, pinnedBase, windowId });
    
    // 🔧 关键修复：获取全局所有PDF窗口的z-index信息
    const allGlobalPdfWindows = [];
    
    // 遍历所有课程文件，收集所有PDF窗口信息
    Object.values(courseFiles).forEach(pdfs => {
      const pdfArray = Array.isArray(pdfs) ? pdfs : [];
      pdfArray.forEach(pdf => {
        Object.entries(pdf.windows).forEach(([wName, wData]) => {
          if (wData.visible) {
            allGlobalPdfWindows.push({
              pdfId: pdf.id,
              windowName: wName,
              isPinned: pinnedWindows.some(w => w.pdfId === pdf.id && w.windowName === wName),
              zIndex: wData.zIndex,
              visible: wData.visible
            });
          }
        });
      });
    });
    
    // 获取当前所有非PDF窗口的z-index
    const allNonPdfWindows = [];
    
    // 添加专家LLM窗口
    if (expertWindowVisible) {
      allNonPdfWindows.push({
        id: `expert:${currentExpertBoardId}`,
        zIndex: pinnedWindows.find(w => w.pdfId === 'expert' && w.windowName === currentExpertBoardId)?.zIndex || 500,
        isPinned: pinnedWindows.some(w => w.pdfId === 'expert' && w.windowName === currentExpertBoardId)
      });
    }
    
    // 添加管家LLM窗口
    if (assistantWindowVisible) {
      allNonPdfWindows.push({
        id: 'butler:assistant',
        zIndex: pinnedWindows.find(w => w.pdfId === 'butler' && w.windowName === 'assistant')?.zIndex || 500,
        isPinned: pinnedWindows.some(w => w.pdfId === 'butler' && w.windowName === 'assistant')
      });
    }
    
    // 添加章节笔记窗口
    if (showChapterNoteWindow && currentFile) {
      allNonPdfWindows.push({
        id: `chapter:${currentFile.key}`,
        zIndex: pinnedWindows.find(w => w.pdfId === 'chapter' && w.windowName === currentFile.key)?.zIndex || 500,
        isPinned: pinnedWindows.some(w => w.pdfId === 'chapter' && w.windowName === currentFile.key)
      });
    }
    
    // 添加调试面板
    if (debugPanelVisible) {
      allNonPdfWindows.push({
        id: 'debug:panel',
        zIndex: 1000,
        isPinned: true // 调试面板总是置顶
      });
    }
    
    // 🔧 合并PDF窗口和非PDF窗口的z-index信息
    const allWindowsZIndices = [
      ...allGlobalPdfWindows.map(w => ({ ...w, windowType: 'pdf' })),
      ...allNonPdfWindows.map(w => ({ ...w, windowType: 'nonPdf' }))
    ];
    
    // 分离置顶和普通窗口
    const pinnedZIndices = allWindowsZIndices
      .filter(w => w.isPinned)
      .map(w => w.zIndex)
      .filter(z => typeof z === 'number');
    
    const normalZIndices = allWindowsZIndices
      .filter(w => !w.isPinned)
      .map(w => w.zIndex)
      .filter(z => typeof z === 'number');
    
    console.log('📊 全局窗口Z-index分布:', { 
      pinnedZIndices: pinnedZIndices.sort((a, b) => a - b), 
      normalZIndices: normalZIndices.sort((a, b) => a - b),
      totalPdfWindows: allGlobalPdfWindows.length,
      totalNonPdfWindows: allNonPdfWindows.length,
      windowId
    });
    
    // 计算新的zIndex
    let newZIndex;
    if (isPinned) {
      newZIndex = pinnedZIndices.length > 0 
        ? Math.max(...pinnedZIndices) + 1 
        : pinnedBase;
      console.log('📌 置顶非PDF窗口新z-index:', newZIndex);
    } else {
      newZIndex = normalZIndices.length > 0 
        ? Math.max(...normalZIndices) + 1 
        : Math.max(normalBase, 500); // 非PDF窗口至少从500开始
      
      // 确保不超过置顶窗口的范围
      if (newZIndex >= pinnedBase) {
        newZIndex = pinnedBase - 1;
      }
      
      console.log('🔢 普通非PDF窗口新z-index:', newZIndex);
    }
    
    // 根据窗口类型更新对应的状态
    if (type === 'expert') {
      // 更新专家LLM窗口状态（通过pinnedWindows或直接CSS操作）
      const expertWindow = document.querySelector(`[data-window-id="expert:${id}"]`);
      if (expertWindow) {
        expertWindow.style.zIndex = newZIndex;
        console.log(`✅ 专家LLM窗口 z-index更新: → ${newZIndex}`);
      }
    } else if (type === 'butler') {
      // 更新管家LLM窗口状态
      const butlerWindow = document.querySelector(`[data-window-id="butler:${id}"]`);
      if (butlerWindow) {
        butlerWindow.style.zIndex = newZIndex;
        console.log(`✅ 管家LLM窗口 z-index更新: → ${newZIndex}`);
      }
    } else if (type === 'chapter') {
      // 更新章节笔记窗口状态
      const chapterWindow = document.querySelector(`[data-window-id="chapter:${id}"]`);
      if (chapterWindow) {
        chapterWindow.style.zIndex = newZIndex;
        console.log(`✅ 章节笔记窗口 z-index更新: → ${newZIndex}`);
      }
    }
    
    // 如果窗口被置顶，更新pinnedWindows中的zIndex
    if (isPinned) {
      setPinnedWindows(prev => prev.map(w => {
        if (w.pdfId === type && w.windowName === id) {
          return { ...w, zIndex: newZIndex };
        }
        return w;
      }));
    }
    
    return newZIndex;
  };

  // 切换窗口置顶状态
  const handleToggleWindowPin = (windowId) => {
    console.log('切换窗口置顶状态:', windowId);
    
    // 解析windowId（格式: pdfId:windowName 或 type:id）
    const parts = windowId.split(':');
    if (parts.length !== 2) {
      console.error('无效的窗口ID格式:', windowId);
      message.error('窗口置顶操作失败：无效的窗口ID');
      return;
    }
    
    const [type, id] = parts;
    
    // 检查窗口是否已被置顶
    const isPinned = pinnedWindows.some(w => 
      (w.pdfId === type && w.windowName === id) || 
      (w.pdfId === windowId) // 支持旧格式
    );
    
    const { normalBase, pinnedBase } = getBaseZIndices();
    
    if (isPinned) {
      // 取消置顶
      setPinnedWindows(prev => prev.filter(w => 
        !(w.pdfId === type && w.windowName === id) && 
        w.pdfId !== windowId
      ));
      
      // 🔧 修复：取消置顶时，重新设置窗口z-index到正常范围
      if (type !== 'expert' && type !== 'butler' && type !== 'chapter') {
        setCourseFiles(prev => {
          if (!currentFile || !currentFile.key) return prev;
          
          const courseKey = currentFile.key;
          const pdfs = [...(prev[courseKey] || [])];
          const pdfIndex = pdfs.findIndex(pdf => pdf.id === type);
          
          if (pdfIndex !== -1) {
            // 计算普通窗口的新z-index
            const allNormalWindows = pdfs.flatMap(pdf => 
              Object.entries(pdf.windows)
                .filter(([wName, wData]) => !pinnedWindows.some(w => w.pdfId === pdf.id && w.windowName === wName))
                .map(([wName, wData]) => wData.zIndex)
            );
            
            const maxNormalZIndex = allNormalWindows.length > 0 ? Math.max(...allNormalWindows) : normalBase;
            const newZIndex = Math.min(maxNormalZIndex + 1, pinnedBase - 1);
            
            const updatedWindows = {
              ...pdfs[pdfIndex].windows,
              [id]: {
                ...pdfs[pdfIndex].windows[id],
                zIndex: newZIndex
              }
            };
            
            pdfs[pdfIndex] = {
              ...pdfs[pdfIndex],
              windows: updatedWindows
            };
            
            console.log('取消置顶，重新设置PDF窗口z-index为:', newZIndex);
            
            return {
              ...prev,
              [courseKey]: pdfs
            };
          }
          
          return prev;
        });
      }
      
      console.log('窗口已取消置顶');
      message.info('窗口已取消置顶');
    } else {
      // 置顶窗口 - 找到当前所有置顶窗口的最高z-index
      let maxPinnedZIndex = pinnedBase;
      
      // 遍历置顶窗口列表
      pinnedWindows.forEach(w => {
        if (w.zIndex && w.zIndex > maxPinnedZIndex) {
          maxPinnedZIndex = w.zIndex;
        }
      });
      
      // 遍历PDF窗口（用于兼容）
      if (currentFile && currentFile.key) {
        const pdfs = courseFiles[currentFile.key] || [];
        pdfs.forEach(pdf => {
          Object.entries(pdf.windows).forEach(([wName, wData]) => {
            const wIsPinned = pinnedWindows.some(w => w.pdfId === pdf.id && w.windowName === wName);
            if (wIsPinned && wData.zIndex > maxPinnedZIndex) {
              maxPinnedZIndex = wData.zIndex;
            }
          });
        });
      }
      
      // 使新置顶的窗口z-index比现有置顶窗口更高
      const newZIndex = Math.max(maxPinnedZIndex + 1, pinnedBase);
      console.log('设置新的z-index:', newZIndex);
      
      // 对于PDF窗口，更新其z-index
      if (type !== 'expert' && type !== 'butler' && type !== 'chapter') {
        setCourseFiles(prev => {
          if (!currentFile || !currentFile.key) return prev;
          
          const courseKey = currentFile.key;
          const pdfs = [...(prev[courseKey] || [])];
          const pdfIndex = pdfs.findIndex(pdf => pdf.id === type);
          
          if (pdfIndex !== -1) {
            const updatedWindows = {
              ...pdfs[pdfIndex].windows,
              [id]: {
                ...pdfs[pdfIndex].windows[id],
                zIndex: newZIndex
              }
            };
            
            pdfs[pdfIndex] = {
              ...pdfs[pdfIndex],
              windows: updatedWindows
            };
            
            console.log('更新PDF窗口z-index为:', newZIndex);
            
            return {
              ...prev,
              [courseKey]: pdfs
            };
          }
          
          return prev;
        });
      }
      
      // 添加到置顶窗口列表
      setPinnedWindows(prev => [...prev, { 
        pdfId: type, 
        windowName: id, 
        zIndex: newZIndex,
        windowType: type === 'expert' ? 'expertLLM' : 
                   type === 'butler' ? 'butlerLLM' : 
                   type === 'chapter' ? 'chapterNote' : 'pdf'
      }]);
      
      console.log('窗口已置顶');
      message.success('窗口已置顶');
    }
  };
  
  // 窗口置顶（所有PDF的所有窗口中）- 保留向后兼容
  const handleBringWindowToTop = (pdfId, windowName) => {
    handleToggleWindowPin(`${pdfId}:${windowName}`);
  };

  // AI问答
  const handleAsk = async (question) => {
    const activePdf = getActivePdf();
    if (!activePdf) {
      message.warning('请先选择一个PDF文件');
      return;
    }
    
    if (!question.trim()) {
      message.warning('请输入问题');
      return;
    }
    
    // 保存当前PDF的ID，防止异步请求过程中活动PDF变化
    const pdfId = activePdf.id;
    
    // 更新问题和加载状态
    updatePdfProperty(pdfId, 'question', question);
    updatePdfProperty(pdfId, 'answerLoading', true);
    
    // 显示回答窗口
    updatePdfProperty(pdfId, 'windows', {
      ...activePdf.windows,
      answer: {
        visible: true,
        position: { x: 300, y: 200 },
        size: { width: 600, height: 350 },
        zIndex: 103
      }
    });
    
    console.log(`🔄 开始AI问答，问题: "${question}"...`);
    
    // 初始化答案内容为空
    updatePdfProperty(pdfId, 'answer', '');
    
    try {
      // 使用WebSocket流式获取回答
      const useStreamingApi = true; // 控制是否使用流式API
      
      if (useStreamingApi) {
        // 创建WebSocket连接
        const serverFilename = activePdf.serverFilename;
        const wsUrl = api.getWebSocketUrl(`/materials/${serverFilename}/ask/stream`);
        const socket = new WebSocket(wsUrl);
        
        socket.onopen = function() {
          console.log('WebSocket连接已打开');
          // 发送问题
          socket.send(JSON.stringify({ question }));
        };
        
        socket.onmessage = function(event) {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error('WebSocket错误:', data.error);
            message.error('获取回答失败');
            // 确保PDF仍然是当前活动的PDF
            if (activePdfId === pdfId) {
              updatePdfProperty(pdfId, 'answerLoading', false);
            }
            socket.close();
            return;
          }
          
          if (data.chunk) {
            // 确保PDF仍然是当前活动的PDF
            if (activePdfId === pdfId) {
            // 更新答案，添加新的文本块
              updatePdfProperty(pdfId, 'answer', prev => {
                const currentPdf = getActivePdf();
                if (currentPdf && currentPdf.id === pdfId) {
                  const currentAnswer = currentPdf.answer || "";
              return currentAnswer + data.chunk;
                }
                return prev;
            });
            }
          }
          
          if (data.done) {
            console.log('回答完成');
            // 确保PDF仍然是当前活动的PDF
            if (activePdfId === pdfId) {
              updatePdfProperty(pdfId, 'answerLoading', false);
            message.success('回答生成完成');
            }
            socket.close();
          }
        };
        
        socket.onerror = function(error) {
          console.error('WebSocket错误:', error);
          message.error('连接服务器失败');
          // 确保PDF仍然是当前活动的PDF
          if (activePdfId === pdfId) {
            updatePdfProperty(pdfId, 'answerLoading', false);
          }
        };
        
        socket.onclose = function() {
          console.log('WebSocket连接已关闭');
          // 确保PDF仍然是当前活动的PDF
          if (activePdfId === pdfId) {
            updatePdfProperty(pdfId, 'answerLoading', false);
          }
        };
      } else {
        // 使用原有的REST API
        const serverFilename = activePdf.serverFilename;
        
        // 调用API客户端发送问题
        const data = await api.askQuestion(serverFilename, question);
        const answerContent = data.answer || "无回答";
        
        // 确保PDF仍然是当前活动的PDF
        if (activePdfId === pdfId) {
        // 更新回答内容
          updatePdfProperty(pdfId, 'answer', answerContent);
        console.log(`✅ 获取AI回答成功: ${answerContent.length}字符`);
        message.success('回答生成成功');
        }
      }
    } catch (err) {
      console.error("❌ AI问答失败:", err);
      message.error("获取回答失败");
    } finally {
      // 确保PDF仍然是当前活动的PDF
      if (activePdfId === pdfId) {
        updatePdfProperty(pdfId, 'answerLoading', false);
      }
      setAssistantLoading(false);
      setAssistantQuery(''); // 清空输入框
    }
  };

  // 处理课程文件选择
  const handleSelectFile = (fileNode) => {
    console.log(`🎯 [DEBUG] handleSelectFile 被调用，文件节点:`, fileNode);
    console.log(`📋 [DEBUG] 文件节点键值: ${fileNode.key}`);
    console.log(`📋 [DEBUG] 文件节点标题: ${fileNode.title}`);
    
    setCurrentFile(fileNode);
    
    // 🔧 强化：无条件加载自定义窗口
    if (fileNode.key) {
      console.log(`🔄 [DEBUG] 准备调用 loadCustomWindows，boardId: ${fileNode.key}`);
      
      // 立即调用
      loadCustomWindows(fileNode.key);
      console.log(`📞 [DEBUG] loadCustomWindows 调用完成 (立即)`);
      
      // 🔧 新增：延时再次调用，确保数据加载
      setTimeout(() => {
        console.log(`⏰ [DEBUG] 延时500ms后再次调用 loadCustomWindows: ${fileNode.key}`);
        loadCustomWindows(fileNode.key);
        console.log(`📞 [DEBUG] loadCustomWindows 延时调用完成`);
      }, 500);
      
      // 🔧 新增：强制设置customWindowsVisible
      setTimeout(() => {
        console.log(`👁️ [DEBUG] 强制设置 customWindowsVisible[${fileNode.key}] = true`);
        setCustomWindowsVisible(prev => ({
          ...prev,
          [fileNode.key]: true
        }));
        console.log(`✅ [DEBUG] customWindowsVisible 设置完成`);
      }, 600);
      
    } else {
      console.warn(`⚠️ [DEBUG] 文件节点没有key，无法加载自定义窗口`);
    }
    
    const hasPdfs = courseFiles[fileNode.key] && courseFiles[fileNode.key].length > 0;
    console.log(`📄 [DEBUG] 该展板是否有PDF文件: ${hasPdfs}`);
    
    if (hasPdfs) {
      // 检查是否有PDF窗口已经打开
      const pdfsWithOpenWindows = courseFiles[fileNode.key].filter(pdf => 
        pdf.windows.pdf.visible || 
        pdf.windows.note.visible || 
        pdf.windows.annotation.visible ||
        (pdf.windows.answer && pdf.windows.answer.visible)
      );
      
      if (pdfsWithOpenWindows.length > 0) {
        // 如果有已打开的PDF窗口，显示PDF选择列表
        setPdfListModalVisible(true);
      } else {
        // 如果没有打开的PDF窗口，但有PDF文件，自动打开最近使用的PDF
        const mostRecentPdf = courseFiles[fileNode.key].reduce((latest, current) => {
          if (!latest) return current;
          // 可以根据lastUsed时间或者其他标准来选择最近的PDF
          // 这里简单选择第一个
          return latest;
        }, null);
        
        if (mostRecentPdf) {
          console.log('自动重新打开PDF:', mostRecentPdf.clientFilename || mostRecentPdf.filename);
          
          // 自动选择并打开该PDF
          setActivePdfId(mostRecentPdf.id);
          
          // 确保文件URL有效
          if (mostRecentPdf.serverFilename) {
            const serverUrl = `/materials/${encodeURIComponent(mostRecentPdf.serverFilename)}`;
            if (!mostRecentPdf.fileUrl || mostRecentPdf.fileUrl.startsWith('blob:')) {
              updatePdfProperty(mostRecentPdf.id, 'fileUrl', serverUrl);
            }
          }
          
          // 打开PDF查看器窗口
          updatePdfProperty(mostRecentPdf.id, 'windows', {
            ...mostRecentPdf.windows,
            pdf: {
              ...mostRecentPdf.windows.pdf,
              visible: true
            }
          });
          
          message.success(`已重新打开 ${mostRecentPdf.clientFilename || mostRecentPdf.filename}`);
        } else {
          // 备选方案：显示PDF选择列表
          setPdfListModalVisible(true);
        }
      }
    } else {
      // 如果没有PDF，直接提示上传
      message.info(`请为 ${fileNode.title} 上传PDF文件`);
    }
    
    // 如果章节笔记窗口已经打开，更新其标题
    if (showChapterNoteWindow) {
      // 这里只是更新窗口，不会自动打开
      setShowChapterNoteWindow(true);
    }
    
    console.log(`✅ [DEBUG] handleSelectFile 执行完成`);
  };

  // 选择PDF文件
  const handleSelectPdf = (pdfId) => {
    setActivePdfId(pdfId);
    
    // 获取选择的PDF对象
    const selectedPdf = courseFiles[currentFile.key].find(pdf => pdf.id === pdfId);
    
    if (selectedPdf) {
      // 优先使用服务器URL，而不是blob URL
      if (selectedPdf.serverFilename) {
        // 使用服务器文件名创建新的URL
        const serverUrl = getFullFileUrl(selectedPdf.serverFilename);
        console.log('使用服务器URL:', serverUrl);
        
        // 如果当前URL是blob URL或无效，替换为服务器URL
        if (!selectedPdf.fileUrl || selectedPdf.fileUrl.startsWith('blob:')) {
          updatePdfProperty(pdfId, 'fileUrl', serverUrl);
        }
      } 
      // 如果没有服务器文件名但有文件对象，创建blob URL
      else if (selectedPdf.file instanceof File && (!selectedPdf.fileUrl || !selectedPdf.fileUrl.startsWith('blob:'))) {
        try {
          const newUrl = URL.createObjectURL(selectedPdf.file);
          console.log('创建新的blob URL:', newUrl);
          updatePdfProperty(pdfId, 'fileUrl', newUrl);
        } catch (error) {
          console.error('创建blob URL失败:', error);
        }
      }
      
      // 如果该PDF当前没有任何可见窗口，则显示PDF查看器
      if (!selectedPdf.windows.pdf.visible && 
          !selectedPdf.windows.note.visible && 
          !selectedPdf.windows.annotation.visible && 
          !(selectedPdf.windows.answer && selectedPdf.windows.answer.visible)) {
        
        // 更新windows状态，显示PDF查看器
        updatePdfProperty(pdfId, 'windows', {
          ...selectedPdf.windows,
          pdf: {
            ...selectedPdf.windows.pdf,
            visible: true
          }
        });
      }
    }
    
    setPdfListModalVisible(false);
  };

  // 上传到选中的课程文件
  const handleUploadToCourse = () => {
    if (!currentFile) {
      message.warning('请先选择一个课程文件');
      return;
    }
    
    setUploadModalVisible(true);
  };
  
  // 删除PDF文件
  const handleDeletePdf = async (pdfId) => {
    if (!currentFile) return;
    
    // 首先获取要删除的PDF文件信息
    const pdfToDelete = courseFiles[currentFile.key]?.find(pdf => pdf.id === pdfId);
    if (!pdfToDelete) {
      message.error('未找到要删除的PDF文件');
      return;
    }
    
    const filename = pdfToDelete.serverFilename || pdfToDelete.filename;
    
    try {
      // 1. 首先检查PDF文件的引用情况
      message.loading({ content: '正在检查文件引用情况...', key: 'delete-pdf' });
      
      const referencesData = await api.getPdfReferences(filename);
      const referenceCount = referencesData.reference_count;
      const references = referencesData.references;
      
      // 2. 显示删除确认对话框，包含引用信息
      const { Modal } = await import('antd');
      
      let confirmMessage = `您确定要删除PDF文件 "${pdfToDelete.clientFilename || pdfToDelete.filename}" 吗？`;
      
      if (referenceCount > 1) {
        confirmMessage += `\n\n⚠️ 警告：此文件被 ${referenceCount} 个展板使用：`;
        references.forEach(ref => {
          confirmMessage += `\n• ${ref.folder_name} - ${ref.board_name}`;
        });
        confirmMessage += `\n\n点击"确定"仅从当前展板删除，点击"取消"后可选择完全删除。`;
      } else if (referenceCount === 1) {
        confirmMessage += `\n\n此文件仅在当前展板中使用，删除后将完全移除。`;
      } else {
        confirmMessage += `\n\n此文件没有被任何展板使用，将直接删除。`;
      }
      
              Modal.confirm({
        title: '确认删除PDF文件',
        content: confirmMessage,
        okText: referenceCount > 1 ? '仅从当前展板删除' : '确定删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => handleDeletePdfFromBoard(filename, pdfId, pdfToDelete, currentFile.key),
        onCancel: () => {
          if (referenceCount > 1) {
            // 如果有多个引用，提供完全删除选项
              Modal.confirm({
              title: '完全删除确认',
              content: `是否要从所有 ${referenceCount} 个展板中删除此PDF文件？这将永久删除文件及其所有相关数据。`,
              okText: '完全删除',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () => handleDeletePdfCompletely(filename, pdfId, pdfToDelete)
            });
          }
        }
      });
      
      message.destroy('delete-pdf');
      
      } catch (error) {
        console.error('命令执行过程中出现全局错误:', error);
        message.error(`命令执行失败: ${error.message}`);
      }
  };

  // 更新右键菜单处理函数，支持自定义菜单项
  const handleContextMenu = (area, items, position, data) => {
    console.log('应用调用handleContextMenu:', area, position, data);
    // 使用全局暴露的showContextMenu方法显示菜单
    if (window.showContextMenu) {
      try {
      window.showContextMenu(area, items, position, data);
      } catch (error) {
        console.error('显示右键菜单失败:', error);
      }
    } else {
      console.warn('未找到全局右键菜单方法');
    }
  };

  // 渲染调试面板
  const renderDebugPanel = () => {
    if (!debugPanelVisible) return null;

  return (
      <DraggableWindow
        title="LLM交互调试面板"
        position={debugPanelPosition}
        onPositionChange={setDebugPanelPosition}
        size={debugPanelSize}
        onSizeChange={setDebugPanelSize}
        onClose={() => setDebugPanelVisible(false)}
        zIndex={1000}  // 确保在最上层
        resizable
      >
        <LLMDebugPanel />
      </DraggableWindow>
    );
  };

  // 刷新课程和文件列表
  const refreshCourses = async () => {
    try {
      console.log('🔄 刷新课程和文件列表');
      // 使用API客户端而不是直接fetch
      const data = await api.getAppState();
      setCourseData(data.course_folders || []);
      console.log('✅ 课程数据刷新成功');
    } catch (error) {
      console.error('❌ 刷新课程数据失败:', error);
      message.error(`刷新课程数据失败: ${error.message}`);
    }
  };

  // 测试并发注释生成功能
  const handleConcurrentAnnotationTest = async () => {
    if (!currentFile) {
      message.warning('请先选择一个课程文件');
      return;
    }

    const boardId = currentExpertBoardId || currentFile.key;
    if (!boardId) {
      message.warning('无法确定展板ID');
      return;
    }

    console.log(`🎯 并发测试 - 当前展板ID: ${boardId}`);
    console.log(`🎯 并发测试 - currentExpertBoardId: ${currentExpertBoardId}`);
    console.log(`🎯 并发测试 - currentFile.key: ${currentFile?.key}`);

    const pdfs = courseFiles[currentFile.key] || [];
    const visiblePdfs = pdfs.filter(pdf => pdf.windows.pdf.visible);

    if (visiblePdfs.length === 0) {
      message.warning('没有可见的PDF窗口来测试并发功能');
      return;
    }

    try {
      message.info(`🚀 开始测试并发注释生成 - ${visiblePdfs.length}个PDF同时处理`);

      // 获取API基础URL
      const baseUrl = api.getBaseUrl();

      // 为每个可见的PDF提交动态任务
      const taskPromises = visiblePdfs.map(async (pdf, index) => {
        const filename = pdf.filename || pdf.clientFilename;
        const pageNum = pdf.currentPage || 1;
        
        // 提交动态任务
        const response = await fetch(`${baseUrl}/api/expert/dynamic/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            board_id: boardId,
            task_info: {
              type: 'answer_question',
              params: {
                question: `请为 ${filename} 第${pageNum}页生成简明扼要的笔记（任务${index + 1}）`,
                context: `这是并发测试任务 ${index + 1}/${visiblePdfs.length}`
              }
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`任务${index + 1}提交失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`✅ 任务${index + 1}已提交: ${data.task_id}`);
        
        return {
          taskId: data.task_id,
          pdfId: pdf.id,
          filename: filename,
          pageNum: pageNum,
          index: index + 1
        };
      });

      const submittedTasks = await Promise.all(taskPromises);
      
      message.success(`🎉 成功提交${submittedTasks.length}个并发任务！请查看右下角的任务状态指示器`);
      
      // 可选：自动监控任务完成状态
      setTimeout(() => {
        message.info('💡 提示：点击右下角的任务指示器可以查看详细的执行状态');
      }, 2000);

    } catch (error) {
      console.error('并发测试失败:', error);
      message.error(`并发测试失败: ${error.message}`);
    }
  };

  // 清理多余的PDF展板文件
  const handleCleanupDuplicatePdfFiles = async () => {
    try {
      console.log('🔄 开始清理多余的PDF展板文件');
      message.loading({ content: '正在清理多余的PDF展板文件...', key: 'cleanup' });

      // 使用API客户端方法
      const data = await api.cleanupDuplicatePdfFiles();
      
      console.log('✅ 清理完成:', data);
      
      if (data.cleaned_count > 0) {
        message.success({ 
          content: `清理完成！删除了 ${data.cleaned_count} 个多余的PDF展板文件`, 
          key: 'cleanup' 
        });
        
        // 刷新课程列表以更新UI
        setTimeout(() => {
          const refreshEvent = new CustomEvent('whatnote-refresh-courses');
          window.dispatchEvent(refreshEvent);
        }, 1000);
      } else {
        message.info({ 
          content: '没有发现需要清理的多余PDF展板文件', 
          key: 'cleanup' 
        });
      }

    } catch (error) {
      console.error('❌ 清理失败:', error);
      message.error({ 
        content: `清理失败: ${error.message}`, 
        key: 'cleanup' 
      });
    }
  };

  // 更新PDF颜色
  const updatePdfColor = (pdfId, color) => {
    if (!currentFile) return;
    
    setCourseFiles(prev => {
      const filePdfs = [...(prev[currentFile.key] || [])];
      const pdfIndex = filePdfs.findIndex(pdf => pdf.id === pdfId);
      
      if (pdfIndex !== -1) {
        filePdfs[pdfIndex] = {
          ...filePdfs[pdfIndex],
            customColor: color,
        };
        
        return {
          ...prev,
          [currentFile.key]: filePdfs
        };
      }
      
      return prev;
    });
  };

  // 获取PDF的当前颜色
  const getPdfCurrentColor = (pdfId) => {
    if (!currentFile) return null;
    
    const pdf = courseFiles[currentFile.key]?.find(p => p.id === pdfId);
    return pdf?.customColor || getPdfColor(pdfId);
  };

  // 窗口前置（移到最上层但在各自的范围内）- 专门处理PDF窗口
  const handleBringWindowToFront = (pdfId, windowName) => {
    console.log('🔼 PDF窗口前置:', { pdfId, windowName });
    
    // 检查窗口是否已经被置顶
    const isPinned = pinnedWindows.some(w => w.pdfId === pdfId && w.windowName === windowName);
    const { normalBase, pinnedBase } = getBaseZIndices();
    
    console.log('🔍 PDF窗口状态:', { isPinned, normalBase, pinnedBase });
    
    setCourseFiles(prev => {
      // 🔧 关键修复：获取全局所有课程的PDF窗口，而不仅仅是当前课程的
      const allGlobalWindows = [];
      let targetCourseKey = null;
      let targetPdfIndex = -1;
      let targetPdf = null;
      
      // 遍历所有课程文件，找到目标PDF并收集所有窗口信息
      for (const [courseKey, pdfs] of Object.entries(prev)) {
        const pdfArray = Array.isArray(pdfs) ? pdfs : [];
        
        pdfArray.forEach((pdf, index) => {
          // 检查是否是目标PDF
          if (pdf.id === pdfId) {
            targetCourseKey = courseKey;
            targetPdfIndex = index;
            targetPdf = pdf;
          }
          
          // 收集所有可见窗口的信息
          Object.entries(pdf.windows).forEach(([wName, wData]) => {
            if (wData.visible) {
              allGlobalWindows.push({
                pdfId: pdf.id,
                windowName: wName,
                courseKey: courseKey,
                isPinned: pinnedWindows.some(w => w.pdfId === pdf.id && w.windowName === wName),
                zIndex: wData.zIndex,
                visible: wData.visible
              });
            }
          });
        });
      }
      
      // 检查是否找到目标PDF
      if (!targetCourseKey || targetPdfIndex === -1 || !targetPdf) {
        console.warn('⚠️ 未找到目标PDF窗口:', { pdfId, windowName });
        return prev;
      }
      
      const currentWindow = targetPdf.windows[windowName];
      if (!currentWindow) {
        console.warn('⚠️ 未找到PDF窗口:', windowName);
        return prev;
      }
      
      console.log('📋 当前PDF窗口z-index:', currentWindow.zIndex);
      console.log('🌍 全局窗口数量:', allGlobalWindows.length);

      // 分离置顶和非置顶窗口的z-index
      const pinnedZIndices = allGlobalWindows
        .filter(w => w.isPinned)
        .map(w => w.zIndex)
        .filter(z => typeof z === 'number'); // 确保是数字
      
      const normalZIndices = allGlobalWindows
        .filter(w => !w.isPinned)
        .map(w => w.zIndex)
        .filter(z => typeof z === 'number'); // 确保是数字

      console.log('📊 全局PDF窗口Z-index分布:', { 
        pinnedZIndices: pinnedZIndices.sort((a, b) => a - b), 
        normalZIndices: normalZIndices.sort((a, b) => a - b),
        totalWindows: allGlobalWindows.length,
        currentWindowZIndex: currentWindow.zIndex,
        targetWindow: `${pdfId}:${windowName}`,
        allWindowsDetail: allGlobalWindows.map(w => ({
          window: `${w.pdfId}:${w.windowName}`,
          zIndex: w.zIndex,
          isPinned: w.isPinned,
          courseKey: w.courseKey
        }))
      });

      // 计算新的zIndex
      let newZIndex;
      if (isPinned) {
        // 如果是置顶窗口，使其成为全局置顶窗口中最高的
        newZIndex = pinnedZIndices.length > 0 
          ? Math.max(...pinnedZIndices) + 1 
          : pinnedBase;
          
        console.log('📌 置顶PDF窗口新z-index:', newZIndex);
      } else {
        // 🔧 修复：确保普通窗口能正确前置
        if (normalZIndices.length > 0) {
          const maxNormalZIndex = Math.max(...normalZIndices);
          console.log('📊 当前最高普通窗口z-index:', maxNormalZIndex);
          
          // 🔧 关键修复：即使当前窗口已经是最高的，也要强制增加1来确保前置
          // 除非已经达到置顶窗口范围的边界
          if (maxNormalZIndex >= pinnedBase - 1) {
            // 如果已经接近置顶窗口范围，重新分配所有普通窗口的z-index
            console.log('⚠️ 普通窗口z-index接近置顶范围，重新分配');
            newZIndex = normalBase + normalZIndices.length;
          } else {
            // 正常情况：在最高z-index基础上+1
            newZIndex = maxNormalZIndex + 1;
          }
        } else {
          newZIndex = normalBase;
        }
        
        // 确保不超过置顶窗口的范围
        if (newZIndex >= pinnedBase) {
          newZIndex = pinnedBase - 1;
        }
        
        console.log('🔢 普通PDF窗口新z-index:', newZIndex, '(当前:', currentWindow.zIndex, ')');
      }
      
      // 🔧 修复：移除"无需更新"的过早判断，确保窗口能够前置
      // 注释掉这个判断，让窗口总是更新到最新的z-index
      // if (currentWindow.zIndex === newZIndex) {
      //   console.log('✅ PDF窗口已经在前端，无需更新');
      //   return prev;
      // }
      
      // 🔧 新增：只有当新z-index确实比当前z-index小或相等时才跳过更新
      if (newZIndex <= currentWindow.zIndex && currentWindow.zIndex !== 999) {
        console.log('⏭️ PDF窗口z-index无需增加:', newZIndex, '<=', currentWindow.zIndex);
        return prev;
      }
      
      // 更新目标PDF窗口的z-index
      const updatedPdfs = [...(prev[targetCourseKey] || [])];
      const updatedWindows = {
        ...updatedPdfs[targetPdfIndex].windows,
        [windowName]: {
          ...updatedPdfs[targetPdfIndex].windows[windowName],
          zIndex: newZIndex
        }
      };
      
      updatedPdfs[targetPdfIndex] = {
        ...updatedPdfs[targetPdfIndex],
        windows: updatedWindows
      };
      
      console.log(`✅ PDF窗口 ${pdfId}:${windowName} z-index更新: ${currentWindow.zIndex} → ${newZIndex}`);
      
      return {
        ...prev,
        [targetCourseKey]: updatedPdfs
      };
    });
  };

  // 处理专家LLM查询
  const handleExpertQuery = async (query, streamMode = false) => {
    if (!query.trim()) return;

    // 确保使用统一的boardId - 优先使用currentExpertBoardId，然后使用为课程文件生成的展板ID
    let boardId = currentExpertBoardId || getBoardIdForCourseFile(currentFile?.key);

    // 如果没有currentExpertBoardId，设置它为课程文件对应的展板ID确保一致性
    if (!currentExpertBoardId && currentFile?.key) {
      const mappedBoardId = getBoardIdForCourseFile(currentFile.key);
      setCurrentExpertBoardId(mappedBoardId);
      boardId = mappedBoardId;
    }

    // ... existing code ...
  };

  // 快捷键相关处理函数
  const handleToggleWindow = (pdfId, windowName) => {
    if (!pdfId || !currentFile) return;
    
    const pdfs = courseFiles[currentFile.key] || [];
    const pdf = pdfs.find(p => p.id === pdfId);
    if (!pdf) return;
    
    const currentVisible = pdf.windows[windowName]?.visible || false;
    handleWindowChange(pdfId, windowName, { visible: !currentVisible });
    
    // 如果是打开窗口，将其置于前端
    if (!currentVisible) {
      handleBringWindowToFront(pdfId, windowName);
    }
    
    message.success(`${getWindowTitle(pdf, windowName)} ${!currentVisible ? '已打开' : '已关闭'}`);
  };

  const handleSwitchPdf = (pdfId) => {
    setActivePdfId(pdfId);
    // 将新激活的PDF窗口置于前端
    handleBringWindowToFront(pdfId, 'pdf');
    message.success('已切换到PDF');
  };

  const handleNewPdf = () => {
    if (!currentFile) {
      message.warning('请先选择一个课程文件');
      return;
    }
    setUploadModalVisible(true);
  };

  const handleClosePdf = (pdfId) => {
    handleDeletePdf(pdfId);
  };

  const handleTogglePin = (pdfId) => {
    const pdf = getActivePdf();
    if (!pdf) return;
    
    // 找到当前激活的窗口
    let activeWindow = null;
    for (const [windowName, windowData] of Object.entries(pdf.windows)) {
      if (windowData.visible) {
        activeWindow = windowName;
        break;
      }
    }
    
    if (activeWindow) {
      handleToggleWindowPin(`${pdfId}:${activeWindow}`);
    }
  };

  const handleFocusSearch = () => {
    // 聚焦到搜索框（如果有的话）
    const searchInput = document.querySelector('.course-search input');
    if (searchInput) {
      searchInput.focus();
      message.success('已聚焦到搜索框');
    }
  };

  const handleToggleExpert = () => {
    if (!currentFile) {
      message.warning('请先选择一个课程文件');
      return;
    }
    
    if (!expertWindowVisible) {
      const boardId = getBoardIdForCourseFile(currentFile.key);
      setCurrentExpertBoardId(boardId);
    }
    setExpertWindowVisible(!expertWindowVisible);
  };

  const handleToggleButler = () => {
    setAssistantWindowVisible(!assistantWindowVisible);
  };

  const handleSaveNote = async (pdfId) => {
    const pdf = getActivePdf();
    if (!pdf) return;
    
    try {
      // 保存笔记到服务器
      await api.saveNote(pdfId, {
        note: pdf.note,
        userNote: pdf.userNote,
        pageAnnotations: pdf.pageAnnotations,
        userPageNotes: pdf.userPageNotes
      });
      message.success('笔记已保存');
    } catch (error) {
      message.error('保存笔记失败');
      console.error('保存笔记错误:', error);
    }
  };

  const handleExportPdf = async (pdfId) => {
    const pdf = getActivePdf();
    if (!pdf) return;
    
    try {
      // 准备导出数据
      const exportData = {
        filename: pdf.clientFilename || pdf.filename,
        note: pdf.note,
        userNote: pdf.userNote,
        pageAnnotations: pdf.pageAnnotations,
        userPageNotes: pdf.userPageNotes,
        exportTime: new Date().toISOString()
      };
      
      // 创建并下载JSON文件
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdf.clientFilename || 'notes'}_笔记导出.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      message.success('笔记已导出');
    } catch (error) {
      message.error('导出笔记失败');
      console.error('导出笔记错误:', error);
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleImproveAnnotationShortcut = (pdfId, improvePrompt) => {
    const pdf = getActivePdf();
    if (!pdf) return;
    
    const currentAnnotation = pdf.pageAnnotations[pdf.currentPage];
    if (currentAnnotation) {
      handleImproveAnnotation(pdfId, pdf.currentPage, currentAnnotation, improvePrompt);
    }
  };

  const handleSaveAsNewVersion = async (pdfId) => {
    const pdf = getActivePdf();
    if (!pdf) return;
    
    try {
      // 创建新版本的笔记
      const versionName = prompt('请输入版本名称：', `版本_${new Date().toLocaleString()}`);
      if (!versionName) return;
      
      const versionData = {
        versionName,
        filename: pdf.clientFilename || pdf.filename,
        note: pdf.note,
        userNote: pdf.userNote,
        pageAnnotations: pdf.pageAnnotations,
        userPageNotes: pdf.userPageNotes,
        createTime: new Date().toISOString()
      };
      
      // 保存到本地存储
      const versions = JSON.parse(localStorage.getItem(`pdf_versions_${pdfId}`) || '[]');
      versions.push(versionData);
      localStorage.setItem(`pdf_versions_${pdfId}`, JSON.stringify(versions));
      
      message.success(`已保存为新版本: ${versionName}`);
    } catch (error) {
      message.error('保存版本失败');
      console.error('保存版本错误:', error);
    }
  };

  // 调试函数：检查当前PDF状态
  const debugCurrentPdfState = (pdfId) => {
    const targetPdf = courseFiles[currentFile?.key]?.find(pdf => pdf.id === pdfId);
    
    if (!targetPdf) {
      return;
    }
    
    console.log('🔍 [DEBUG] 当前PDF完整状态:', {
      id: targetPdf.id,
      filename: targetPdf.filename,
      clientFilename: targetPdf.clientFilename,
      serverFilename: targetPdf.serverFilename,
      currentPage: targetPdf.currentPage,
      
      // 笔记相关
      note: {
        exists: !!targetPdf.note,
        length: targetPdf.note?.length || 0,
        preview: targetPdf.note?.substring(0, 200) + '...',
        loading: targetPdf.noteLoading
      },
      
      // 注释相关
      annotation: {
        current: {
          exists: !!targetPdf.annotation,
          length: targetPdf.annotation?.length || 0,
          preview: targetPdf.annotation?.substring(0, 200) + '...'
        },
        byPage: Object.keys(targetPdf.pageAnnotations || {}).map(pageNum => ({
          page: pageNum,
          exists: !!targetPdf.pageAnnotations[pageNum],
          length: targetPdf.pageAnnotations[pageNum]?.length || 0,
          preview: targetPdf.pageAnnotations[pageNum]?.substring(0, 100) + '...'
        })),
        loading: targetPdf.annotationLoading
      },
      
      // 窗口状态
      windows: {
        note: targetPdf.windows?.note || {},
        annotation: targetPdf.windows?.annotation || {}
      },
      
      // 会话信息
      sessionId: targetPdf.sessionId
    });
    
    // 同时检查全局状态
    console.log('🌍 [DEBUG] 全局状态:', {
      currentFileKey: currentFile?.key,
      currentExpertBoardId: currentExpertBoardId,
      totalPdfsInCurrentFile: courseFiles[currentFile?.key]?.length || 0,
      allFileKeys: Object.keys(courseFiles || {})
    });
  };

  // 渲染调试面板
  const renderDebugInfo = () => {
    if (process.env.NODE_ENV !== 'development') return null;
    
    const activePdf = getActivePdf();
    
    return (
      <div style={{
        position: 'fixed',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 10000,
        maxWidth: '300px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>🔧 调试面板</div>
        {activePdf && (
          <div>
            <div>当前PDF: {activePdf.filename}</div>
            <div>页码: {activePdf.currentPage}</div>
            <div>笔记长度: {activePdf.note?.length || 0}</div>
            <div>注释长度: {activePdf.annotation?.length || 0}</div>
            <button 
              onClick={() => debugCurrentPdfState(activePdf.id)}
              style={{ 
                marginTop: '5px', 
                padding: '2px 5px', 
                background: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              详细状态
            </button>
            <button 
              onClick={() => {
                // 通过更新一个无关的状态来强制重新渲染
                setActivePdfId(prev => prev === activePdf.id ? null : activePdf.id);
                setTimeout(() => setActivePdfId(activePdf.id), 50);
              }}
              style={{ 
                marginTop: '5px', 
                marginLeft: '5px',
                padding: '2px 5px', 
                background: '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              强制刷新
            </button>
          </div>
        )}
      </div>
    );
  };

  // 更新展板笔记
  const updateBoardNote = (boardId, content) => {
    setBoardNotes(prev => ({
      ...prev,
      [boardId]: content
    }));
    
    // 存储到localStorage以持久化保存
    localStorage.setItem('whatnote-board-notes', JSON.stringify({
      ...boardNotes,
      [boardId]: content
    }));
  };

  // 处理展板笔记AI生成
  const handleGenerateBoardNote = async (boardId) => {
    if (!boardId) {
      message.warning('未找到展板信息');
      return;
    }
    
    try {
      // 获取当前展板下的所有PDF的笔记内容
      // 修复：使用boardId而不是直接从courseFiles获取
      let currentFiles = [];
      
      // 如果boardId与currentFile.key匹配，使用currentFile
      if (currentFile && currentFile.key === boardId) {
        currentFiles = courseFiles[currentFile.key] || [];
      } else {
        // 否则尝试从courseFiles中查找匹配的boardId
        currentFiles = courseFiles[boardId] || [];
      }
      
      console.log(`🔍 展板ID: ${boardId}, 找到PDF文件数量: ${currentFiles.length}`);
      
      if (currentFiles.length === 0) {
        message.warning('当前展板没有PDF文件，无法生成展板笔记');
        return;
      }
      
      // 收集所有PDF的笔记内容
      const allNotes = [];
      for (const pdf of currentFiles) {
        if (pdf.note && pdf.note.trim()) {
          const filename = pdf.clientFilename || pdf.filename || '未知文件';
          allNotes.push({
            filename: filename,
            note: pdf.note,
            pages: pdf.totalPages || '未知'
          });
        }
      }
      
      console.log(`📝 收集到有笔记的PDF数量: ${allNotes.length}/${currentFiles.length}`);
      
      if (allNotes.length === 0) {
        message.warning('当前展板的PDF文件都没有生成笔记，请先为PDF文件生成笔记');
        return;
      }
      
      // 设置加载状态
      setBoardNoteLoading(prev => ({ ...prev, [boardId]: true }));
      
      console.log(`🔄 开始生成展板笔记: ${boardId}`);
      console.log(`📋 收集到 ${allNotes.length} 个PDF笔记`);
      
      // 构建展板笔记生成的输入内容
      const notesContent = allNotes.map(item => 
        `## ${item.filename} (共${item.pages}页)\n\n${item.note}`
      ).join('\n\n---\n\n');
      
      // 调用API生成展板笔记
      const requestData = { 
        content: notesContent, 
        board_id: boardId,
        note_type: 'board_summary'
      };
      
      // 使用专家LLM的笔记生成API，传递特殊的展板笔记标识
      const response = await fetch(`${api.getBaseUrl()}/api/expert/dynamic/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          task_type: 'generate_board_note',
          task_info: {
            notes_content: notesContent,
            pdf_count: allNotes.length,
            board_id: boardId
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status}`);
      }
      
      const result = await response.json();
      const taskId = result.task_id;
      
      if (!taskId) {
        throw new Error('未获得任务ID');
      }
      
      // 轮询获取结果
      const maxPolls = 30;
      const pollInterval = 2000;
      let pollCount = 0;
      
      const pollResult = async () => {
        try {
          const pollResponse = await fetch(`${api.getBaseUrl()}/api/expert/dynamic/result/${taskId}`);
          
          if (!pollResponse.ok) {
            throw new Error(`获取结果失败: ${pollResponse.status}`);
          }
          
          const pollData = await pollResponse.json();
          
          if (pollData.status === 'completed' && pollData.result) {
            console.log(`✅ 展板笔记生成成功: ${boardId}`);
            
            // 更新展板笔记
            updateBoardNote(boardId, pollData.result);
            
            // 显示展板笔记窗口
            setBoardNoteWindowVisible(prev => ({ ...prev, [boardId]: true }));
            
            message.success('展板笔记生成成功');
            
            setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
            return;
          } else if (pollData.status === 'failed') {
            throw new Error(pollData.error || '任务执行失败');
          } else if (pollData.status === 'pending' || pollData.status === 'running') {
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollResult, pollInterval);
            } else {
              throw new Error('任务超时');
            }
          }
        } catch (error) {
          console.error('轮询结果出错:', error);
          setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
          throw error;
        }
      };
      
      // 开始轮询
      setTimeout(pollResult, pollInterval);
      
    } catch (error) {
      console.error('❌ 展板笔记生成失败:', error);
      message.error(`展板笔记生成失败: ${error.message}`);
      
      // 重置加载状态
      setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
    }
  };
  
  // 处理展板笔记AI完善
  const handleImproveBoardNote = async (boardId, content, improvePrompt = '') => {
    if (!boardId) {
      message.warning('未找到展板信息');
      return content;
    }
    
    try {
      // 设置加载状态
      setBoardNoteLoading(prev => ({ ...prev, [boardId]: true }));
      
      console.log(`🔄 开始通过AI完善展板笔记: ${boardId}`);
      console.log(`👉 用户改进提示: "${improvePrompt}"`);
      
      // 使用API客户端完善笔记
      const requestData = { 
        content, 
        improve_prompt: improvePrompt || "",
        board_id: boardId
      };
      
      // 调用专家LLM改进API
      const response = await fetch(`${api.getBaseUrl()}/api/expert/dynamic/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          task_type: 'improve_board_note',
          task_info: {
            content: content,
            improve_prompt: improvePrompt,
            board_id: boardId
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status}`);
      }
      
      const result = await response.json();
      const taskId = result.task_id;
      
      if (!taskId) {
        throw new Error('未获得任务ID');
      }
      
      // 轮询获取结果
      const maxPolls = 30;
      const pollInterval = 2000;
      let pollCount = 0;
      
      const pollResult = async () => {
        try {
          const pollResponse = await fetch(`${api.getBaseUrl()}/api/expert/dynamic/result/${taskId}`);
          
          if (!pollResponse.ok) {
            throw new Error(`获取结果失败: ${pollResponse.status}`);
          }
          
          const pollData = await pollResponse.json();
          
          if (pollData.status === 'completed' && pollData.result) {
            console.log(`✅ 展板笔记完善成功: ${boardId}`);
            
            // 更新展板笔记
            const improvedContent = pollData.result;
            updateBoardNote(boardId, improvedContent);
            
            message.success('展板笔记完善成功');
            
            setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
            return improvedContent;
          } else if (pollData.status === 'failed') {
            throw new Error(pollData.error || '任务执行失败');
          } else if (pollData.status === 'pending' || pollData.status === 'running') {
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollResult, pollInterval);
            } else {
              throw new Error('任务超时');
            }
          }
        } catch (error) {
          console.error('轮询结果出错:', error);
          setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
          throw error;
        }
      };
      
      // 开始轮询
      setTimeout(pollResult, pollInterval);
      
      return content; // 先返回原内容，异步更新
      
    } catch (err) {
      console.error("❌ 完善展板笔记失败:", err);
      message.error("完善展板笔记失败");
      
      // 确保加载状态结束
      setBoardNoteLoading(prev => ({ ...prev, [boardId]: false }));
      
      return content;
    }
  };
  
  // 加载展板笔记
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem('whatnote-board-notes');
      if (savedNotes) {
        setBoardNotes(JSON.parse(savedNotes));
      }
    } catch (error) {
      console.error('加载展板笔记失败:', error);
    }
  }, []);

  // 渲染展板笔记内容 - 完全模仿PDF窗口的userNote结构
  const renderBoardNoteContent = (boardId) => {
    return (
      <UserNoteEditor
        aiContent={''} // 展板笔记没有AI内容，留空
        content={boardNotes[boardId] || ''}
        onSave={(content) => updateBoardNote(boardId, content)}
        loading={boardNoteLoading[boardId] || false}
        editorTitle="展板笔记"
        color="#999"
        onAIImprove={async (content) => {
          // 使用Modal获取改进提示
          return new Promise((resolve) => {
            let improvePrompt = '';
            
            Modal.confirm({
              title: '改进展板笔记',
              content: (
                <div>
                  <p>请提供改进建议，告诉AI如何改进当前展板笔记（选填）</p>
                  <Input.TextArea
                    placeholder="例如：用中文重写，增加总结，调整结构使内容更清晰"
                    rows={4}
                    onChange={(e) => { improvePrompt = e.target.value; }}
                    defaultValue="用中文重写，调整结构使内容更清晰"
                  />
                  <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
                    <p>改进建议示例：</p>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      <li>使语言更简洁易懂</li>
                      <li>调整结构，使要点更突出</li>
                      <li>添加更多具体的例子</li>
                      <li>修正文本中的错误</li>
                      <li>添加更详细的解释</li>
                    </ul>
                  </div>
                </div>
              ),
              okText: '开始改进',
              cancelText: '取消',
              onOk: async () => {
                const improvedContent = await handleImproveBoardNote(boardId, content, improvePrompt || '');
                resolve(improvedContent);
              },
              onCancel: () => {
                resolve(content); // 取消时返回原内容
              }
            });
          });
        }}
        showGenerateButton={true}
        onGenerate={() => handleGenerateBoardNote(boardId)}
      />
    );
  };

  // 生成展板笔记窗口的右键菜单选项
  const generateBoardNoteContextMenu = (boardId) => {
    if (!boardId) return [];

    return [
      {
        label: '置顶窗口',
        onClick: () => handleBringWindowToTop(boardId, 'boardNote'),
        icon: <VerticalAlignTopOutlined />
      },
      {
        label: '重新生成笔记',
        onClick: () => handleGenerateBoardNote(boardId),
        icon: <FileTextOutlined />
      },
      {
        label: '改进笔记',
        onClick: () => {
          const content = boardNotes[boardId] || '';
          const improvePrompt = window.prompt('请输入改进提示（例如：增加总结）', '重新整理结构，使内容更清晰');
          if (improvePrompt) {
            handleImproveBoardNote(boardId, content, improvePrompt);
          }
        },
        icon: <FileTextOutlined />
      },
      {
        label: '关闭窗口',
        onClick: () => setBoardNoteWindowVisible(prev => ({ ...prev, [boardId]: false })),
        icon: <CloseOutlined />
      }
    ];
  };

  // 从当前展板删除PDF文件的处理函数
  const handleDeletePdfFromBoard = async (filename, pdfId, pdfToDelete, boardId) => {
    try {
      message.loading({ content: '正在从当前展板删除...', key: 'delete-pdf' });
      
      // 调用API从当前展板删除PDF
      await api.deletePdfFile(filename, boardId);
      
      // 从前端状态中移除PDF
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        const updatedPdfs = filePdfs.filter(pdf => pdf.id !== pdfId);
        return {
          ...prev,
          [currentFile.key]: updatedPdfs
        };
      });
      
      message.success({ 
        content: `PDF文件 "${pdfToDelete.clientFilename || pdfToDelete.filename}" 已从当前展板删除`, 
        key: 'delete-pdf' 
      });
      
    } catch (error) {
      console.error('从展板删除PDF失败:', error);
      message.error({ 
        content: `删除失败: ${error.message}`, 
        key: 'delete-pdf' 
      });
    }
  };

  // 完全删除PDF文件的处理函数
  const handleDeletePdfCompletely = async (filename, pdfId, pdfToDelete) => {
    try {
      message.loading({ content: '正在完全删除PDF文件...', key: 'delete-pdf' });
      
      // 调用API完全删除PDF（从所有展板）
      await api.deletePdfFile(filename);
      
      // 从前端状态中移除PDF
      setCourseFiles(prev => {
        const filePdfs = [...(prev[currentFile.key] || [])];
        const updatedPdfs = filePdfs.filter(pdf => pdf.id !== pdfId);
        return {
          ...prev,
          [currentFile.key]: updatedPdfs
        };
      });
      
      message.success({ 
        content: `PDF文件 "${pdfToDelete.clientFilename || pdfToDelete.filename}" 已完全删除`, 
        key: 'delete-pdf' 
      });
      
    } catch (error) {
      console.error('完全删除PDF失败:', error);
      message.error({ 
        content: `删除失败: ${error.message}`, 
        key: 'delete-pdf' 
      });
    }
  };

  // 更新章节笔记
  const updateChapterNote = (fileKey, content) => {
    setChapterNotes(prev => ({
      ...prev,
      [fileKey]: content
    }));
    
    // 存储到localStorage以持久化保存
    localStorage.setItem('whatnote-chapter-notes', JSON.stringify({
      ...chapterNotes,
      [fileKey]: content
    }));
  };

  // 处理章节笔记AI完善
  const handleImproveChapterNote = async (content, improvePrompt) => {
    try {
      // 这里可以调用AI API来完善章节笔记
      // 暂时返回原内容
      return content;
    } catch (error) {
      console.error('完善章节笔记失败:', error);
      return content;
    }
  };

  // 生成章节笔记右键菜单
  const generateChapterContextMenu = () => {
    return [
      {
        label: '置顶窗口',
        onClick: () => handleToggleWindowPin(`chapter:${currentFile.key}`),
        icon: <VerticalAlignTopOutlined />
      },
      {
        label: '关闭窗口',
        onClick: () => setShowChapterNoteWindow(false),
        icon: <CloseOutlined />
      }
    ];
  };

  // 执行命令处理函数
  const executeCommand = (command) => {
    console.log('执行命令:', command);
    // 这里可以添加具体的命令执行逻辑
  };

  // 处理右键菜单命令
  const handleContextMenuCommand = (command, data) => {
    console.log('处理右键菜单命令:', command, data);
    
    switch (command) {
      case 'open_board_note':
        // 打开展板笔记
        if (data && data.boardId && currentFile && currentFile.key === data.boardId) {
          console.log('打开展板笔记:', data.boardId);
          setBoardNoteWindowVisible(prev => ({ 
            ...prev, 
            [data.boardId]: true 
          }));
          message.success('展板笔记已打开');
        } else {
          console.error('无法打开展板笔记 - 数据不匹配:', { 
            dataBoardId: data?.boardId, 
            currentFileKey: currentFile?.key 
          });
          message.error('无法打开展板笔记，请确保选择了正确的展板');
        }
        break;
        
      case 'ask_expert_llm':
        // 打开专家LLM窗口
        if (data && data.boardId) {
          console.log('打开专家LLM:', data.boardId);
          setCurrentExpertBoardId(data.boardId);
          setExpertWindowVisible(true);
          message.success('专家LLM已打开');
        } else if (currentFile) {
          console.log('使用当前展板打开专家LLM:', currentFile.key);
          setCurrentExpertBoardId(currentFile.key);
          setExpertWindowVisible(true);
          message.success('专家LLM已打开');
        } else {
          message.error('无法打开专家LLM，请先选择展板');
        }
        break;
        
      case 'upload_pdf':
        // 上传PDF文件
        if (currentFile) {
          console.log('上传PDF到展板:', currentFile.key);
          setUploadModalVisible(true);
        } else {
          message.error('请先选择一个展板');
        }
        break;
        
      case 'refresh_board':
        // 刷新展板
        console.log('刷新展板');
        message.success('展板已刷新');
        // 这里可以添加具体的刷新逻辑
        break;
        
      case 'close_all_windows':
        // 关闭所有窗口
        if (currentFile && courseFiles[currentFile.key]) {
          console.log('关闭当前展板所有窗口');
          setCourseFiles(prev => {
            const updatedFiles = { ...prev };
            if (updatedFiles[currentFile.key]) {
              updatedFiles[currentFile.key] = updatedFiles[currentFile.key].map(pdf => ({
                ...pdf,
                windows: Object.fromEntries(
                  Object.entries(pdf.windows).map(([windowName, windowData]) => [
                    windowName,
                    { ...windowData, visible: false }
                  ])
                )
              }));
            }
            return updatedFiles;
          });
          
          // 关闭其他窗口
          setExpertWindowVisible(false);
          setAssistantWindowVisible(false);
          setShowChapterNoteWindow(false);
          setBoardNoteWindowVisible(prev => ({ 
            ...prev, 
            [currentFile.key]: false 
          }));
          
          message.success('所有窗口已关闭');
        }
        break;
        
      default:
        console.log('未处理的命令:', command);
        break;
    }
  };

  // 获取窗口标题
  const getWindowTitle = (pdf, windowName) => {
    const titles = {
      pdf: 'PDF查看器',
      note: 'AI笔记',
      annotation: '页面注释',
      answer: 'AI问答',
      userNote: '用户笔记',
      userPageNote: '用户页面笔记'
    };
    return titles[windowName] || '窗口';
  };

  // 渲染PDF窗口
  const renderPdfWindow = (pdf, windowType) => {
    const window = pdf.windows[windowType];
    if (!window || !window.visible) return null;

    const windowId = `${pdf.id}:${windowType}`;
    const isPinned = pinnedWindows.some(w => w.pdfId === pdf.id && w.windowName === windowType);

    // 根据窗口类型渲染不同的内容
    let content = null;
    let title = '';

    switch (windowType) {
      case 'pdf':
        title = `PDF: ${pdf.clientFilename || pdf.filename}`;
        content = (
          <PDFViewer
            pdfId={pdf.id}
            file={pdf.fileUrl || pdf.file}
            filename={pdf.serverFilename || pdf.filename}
            currentPage={pdf.currentPage}
            totalPages={pdf.totalPages}
            onPageChange={(page) => handlePageChange(page, pdf.id)}
            onGenerateNote={() => handleGenerateNote(pdf.id)}
            onGenerateAnnotation={() => handleGenerateAnnotation(pdf.id)}
            onAsk={handleAsk}
            onContextMenu={handleContextMenu}
          />
        );
        break;
      case 'note':
        title = `AI笔记: ${pdf.clientFilename || pdf.filename}`;
        content = (
          <NoteWindow
            content={pdf.note || ''}
            loading={pdf.noteLoading || false}
            type="note"
            filename={pdf.serverFilename || pdf.filename}
            onGenerate={() => handleGenerateNote(pdf.id)}
            onImprove={(improvePrompt) => handleImproveNote(pdf.id, improvePrompt)}
            segmentedNoteStatus={pdf.segmentedNoteStatus}
            onContinueGenerate={() => handleContinueNote(pdf.id)}
            pdf={pdf}
          />
        );
        break;
      case 'annotation':
        title = `页面注释: ${pdf.clientFilename || pdf.filename} - 第${pdf.currentPage}页`;
        content = (
          <NoteWindow
            content={pdf.annotation || ''}
            loading={pdf.annotationLoading || false}
            type="annotation"
            filename={pdf.serverFilename || pdf.filename}
            pageNumber={pdf.currentPage}
            source={pdf.pageAnnotationSources?.[pdf.currentPage] || 'text'}
            onGenerate={() => handleGenerateAnnotation(pdf.id)}
            onImprove={(improvePrompt) => handleGenerateAnnotation(pdf.id, improvePrompt)}
            onForceVisionAnnotate={() => handleForceVisionAnnotate(pdf.id)}
            boardId={currentFile ? currentFile.key : null}
            pdf={pdf}
          />
        );
        break;
      default:
        return null;
    }

    return (
      <DraggableWindow
        key={windowId}
        title={title}
        defaultPosition={window.position}
        defaultSize={window.size}
        onClose={() => handleWindowClose(pdf.id, windowType)}
        onDragStop={(e, data) => handleWindowChange(pdf.id, windowType, { position: data })}
        onResize={(e, dir, ref, delta, pos) => {
          const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
          handleWindowChange(pdf.id, windowType, { size: newSize });
        }}
        zIndex={window.zIndex}
        windowId={windowId}
        windowType="pdf"
        onBringToFront={() => handleBringWindowToFront(pdf.id, windowType)}
        isPinned={isPinned}
        onTogglePin={() => handleToggleWindowPin(windowId)}
        titleBarColor={getPdfColor(pdf.id)}
        resizable
      >
        {content}
      </DraggableWindow>
    );
  };

  // 改进注释功能
  const handleImproveAnnotation = async (pdfId, pageNum, currentAnnotation, improvePrompt) => {
    try {
      // 调用生成注释API，传入改进提示
      await handleGenerateAnnotation(pdfId, improvePrompt);
    } catch (error) {
      console.error('改进注释失败:', error);
      message.error('改进注释失败');
    }
  };

  // 监听全局菜单命令事件
  useEffect(() => {
    const handleMenuCommand = (event) => {
      const { command, data } = event.detail;
      console.log('收到全局菜单命令事件:', command, data);
      handleContextMenuCommand(command, data);
    };

    window.addEventListener('menu-command', handleMenuCommand);
    
    return () => {
      window.removeEventListener('menu-command', handleMenuCommand);
    };
  }, [currentFile, courseFiles]); // 依赖currentFile和courseFiles以确保命令处理中的状态是最新的

  // 获取展板的自定义窗口
  const loadCustomWindows = async (boardId) => {
    console.log(`🔍 [DEBUG] loadCustomWindows 被调用，boardId: ${boardId}`);
    
    try {
      console.log(`📡 [DEBUG] 开始请求展板数据: /api/boards/${boardId}`);
      const response = await api.get(`/api/boards/${boardId}`);
      
      console.log(`📋 [DEBUG] API响应状态: ${response.status}`);
      
      if (response.status === 200) {
        const boardData = response.data;
        const windows = boardData.windows || [];
        
        console.log(`🪟 [DEBUG] 获取到的窗口数据:`, windows);
        console.log(`📊 [DEBUG] 窗口数量: ${windows.length}`);
        
        // 更新自定义窗口状态
        setCustomWindows(prev => {
          const newState = {
            ...prev,
            [boardId]: windows
          };
          console.log(`🔄 [DEBUG] 更新customWindows状态:`, newState);
          return newState;
        });
        
        // 设置所有窗口为可见
        const visibilityMap = {};
        windows.forEach(window => {
          visibilityMap[window.id] = true;
          console.log(`👁️ [DEBUG] 设置窗口可见: ${window.id} - ${window.title}`);
        });
        
        setCustomWindowsVisible(prev => {
          const newState = {
            ...prev,
            [boardId]: visibilityMap
          };
          console.log(`🔄 [DEBUG] 更新customWindowsVisible状态:`, newState);
          return newState;
        });
        
        console.log(`✅ [DEBUG] 已加载展板 ${boardId} 的 ${windows.length} 个自定义窗口`);
      } else {
        console.error(`❌ [DEBUG] API响应错误，状态码: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ [DEBUG] 加载自定义窗口失败:', error);
      console.error('❌ [DEBUG] 错误详情:', error.message, error.stack);
    }
  };

  // 更新自定义窗口内容
  const updateCustomWindowContent = (boardId, windowId, newContent) => {
    setCustomWindows(prev => ({
      ...prev,
      [boardId]: prev[boardId]?.map(window => 
        window.id === windowId 
          ? { ...window, content: newContent }
          : window
      ) || []
    }));
  };

  // 删除自定义窗口
  const deleteCustomWindow = async (boardId, windowId) => {
    try {
      const response = await api.delete(`/api/boards/${boardId}/windows/${windowId}`);
      if (response.status === 200) {
        // 从状态中移除窗口
        setCustomWindows(prev => ({
          ...prev,
          [boardId]: prev[boardId]?.filter(window => window.id !== windowId) || []
        }));
        
        setCustomWindowsVisible(prev => ({
          ...prev,
          [boardId]: {
            ...prev[boardId],
            [windowId]: false
          }
        }));
        
        message.success('窗口已删除');
      }
    } catch (error) {
      console.error('删除窗口失败:', error);
      message.error('删除窗口失败');
    }
  };

  // 渲染自定义窗口
  const renderCustomWindows = (boardId) => {
    const windows = customWindows[boardId] || [];
    const visibility = customWindowsVisible[boardId] || {};
    
    return windows.map(window => {
      if (!visibility[window.id]) return null;
      
      const windowId = `custom-${boardId}-${window.id}`;
      
      return (
        <DraggableWindow
          key={windowId}
          title={window.title}
          defaultPosition={window.position || { x: 100, y: 100 }}
          defaultSize={window.size || { width: 300, height: 200 }}
          onClose={() => {
            setCustomWindowsVisible(prev => ({
              ...prev,
              [boardId]: {
                ...prev[boardId],
                [window.id]: false
              }
            }));
          }}
          onDragStop={(e, data) => {
            // 可以在这里保存位置到后端
            console.log(`窗口 ${window.id} 移动到:`, data);
          }}
          onResize={(e, dir, ref, delta, pos) => {
            // 可以在这里保存大小到后端
            const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
            console.log(`窗口 ${window.id} 调整大小到:`, newSize);
          }}
          zIndex={600 + parseInt(window.id.replace(/\D/g, '')) % 100} // 动态z-index
          windowId={windowId}
          windowType="textbox"
          onBringToFront={() => handleBringNonPdfWindowToFront(windowId, 'textbox')}
          titleBarColor="#52c41a" // 绿色标题栏表示自定义窗口
          resizable
        >
          <TextBoxWindow
            window={window}
            boardId={boardId}
            onContentChange={(newContent) => updateCustomWindowContent(boardId, window.id, newContent)}
            onClose={() => deleteCustomWindow(boardId, window.id)}
          />
        </DraggableWindow>
      );
    });
  };

  return (
    <Layout style={{ height: "100vh" }}>
      {/* 调试面板 */}
      {/* {renderDebugInfo()} */}
      
      {/* 键盘快捷键处理组件 */}
      <KeyboardShortcuts
        activePdfId={activePdfId}
        currentFile={currentFile}
        courseFiles={courseFiles}
        onPageChange={handlePageChange}
        onToggleWindow={handleToggleWindow}
        onGenerateNote={handleGenerateNote}
        onGenerateAnnotation={handleGenerateAnnotation}
        onSwitchPdf={handleSwitchPdf}
        onNewPdf={handleNewPdf}
        onClosePdf={handleClosePdf}
        onTogglePin={handleTogglePin}
        onFocusSearch={handleFocusSearch}
        onToggleExpert={handleToggleExpert}
        onToggleButler={handleToggleButler}
        onToggleConsole={handleToggleConsole}
        onSaveNote={handleSaveNote}
        onExportPdf={handleExportPdf}
        onToggleFullscreen={handleToggleFullscreen}
        onImproveAnnotation={handleImproveAnnotationShortcut}
        onSaveAsNewVersion={handleSaveAsNewVersion}
        getActivePdf={getActivePdf}
        getVisiblePdfs={getVisiblePdfs}
      />
      
      <Header className="app-header">
        <div className="logo">WhatNote - 智能笔记系统</div>
        <div className="header-buttons">
          <Tooltip title="快捷键提示">
            <Button
              icon={<QuestionCircleOutlined />}
              onClick={() => {
                const event = new CustomEvent('whatnote-show-shortcuts');
                window.dispatchEvent(event);
              }}
              size="small"
              style={{ marginRight: 8 }}
            >
              快捷键
            </Button>
          </Tooltip>
          <Tooltip title="打开管家助手 (Ctrl+B)">
            <Button
              icon={<RobotOutlined />}
              onClick={() => setAssistantWindowVisible(!assistantWindowVisible)}
              type={assistantWindowVisible ? "primary" : "default"}
              shape="round"
              size="small"
              style={{ marginRight: 8 }}
            >
              管家助手
            </Button>
          </Tooltip>
        </div>
      </Header>
      
      <Layout>
        {/* 侧边栏 */}
        <div
          style={{
            width: siderWidth,
            height: '100%',
            position: 'relative',
            display: 'flex'
          }}
        >
          <Sider
            width={siderWidth}
            theme="light"
            style={{
              height: '100%',
              position: 'relative',
              boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
              zIndex: 2,
              overflowY: 'auto',
              flex: 1
            }}
          >
            <CourseExplorer 
              onSelectFile={handleSelectFile}
              onUploadFile={handleUploadToCourse}
              activeCourseFile={currentFile}
              currentFile={currentFile}
              courseFiles={courseFiles}
              setCourseFiles={setCourseFiles}
              pdfFiles={courseFiles}
              onSelectPdf={handleSelectPdf}
              onDeletePdf={handleDeletePdf}
            />
          </Sider>
          
          {/* 拖拽分隔条 */}
          <div
            className="sider-resize-handle"
            onMouseDown={handleSiderResizeStart}
            style={{
              width: '12px',
              height: '100%',
              cursor: 'col-resize',
              backgroundColor: '#f0f0f0',
              borderLeft: '1px solid #d9d9d9',
              borderRight: '1px solid #d9d9d9',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#e6f7ff';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#f0f0f0';
            }}
          >
            {/* 拖拽图标 */}
            <div style={{
              width: '4px',
              height: '40px',
              background: 'linear-gradient(to bottom, #d9d9d9 0%, #d9d9d9 20%, transparent 20%, transparent 40%, #d9d9d9 40%, #d9d9d9 60%, transparent 60%, transparent 80%, #d9d9d9 80%, #d9d9d9 100%)',
              borderRadius: '2px',
              opacity: 0.6
            }} />
          </div>
        </div>

        {/* 主内容区域 */}
        <Content 
          style={{ position: 'relative', overflow: 'hidden' }}
          className="board-area"
          data-board-id={currentFile ? currentFile.key : null}
          data-board-name={currentFile ? currentFile.title : 'Default Board'}
        >
          {/* 渲染可见的PDF视窗 */}
          {currentFile && Object.values(courseFiles[currentFile.key] || {}).map(pdf => (
            <React.Fragment key={pdf.id}>
              {pdf.windows.pdf.visible && renderPdfWindow(pdf, 'pdf')}
              {pdf.windows.note.visible && renderPdfWindow(pdf, 'note')}
              {pdf.windows.annotation.visible && renderPdfWindow(pdf, 'annotation')}
              {pdf.windows.answer?.visible && renderPdfWindow(pdf, 'answer')}
              {pdf.windows.userNote.visible && renderPdfWindow(pdf, 'userNote')}
              {pdf.windows.userPageNote.visible && renderPdfWindow(pdf, 'userPageNote')}
            </React.Fragment>
          ))}

          {/* 章节笔记窗口 */}
          {showChapterNoteWindow && currentFile && (
            <DraggableWindow
              key={`chapterNote-${currentFile.key}`}
              title={`章节笔记: ${currentFile.title || ''}`}
              defaultPosition={chapterNoteWindowPosition}
              defaultSize={chapterNoteWindowSize}
              onClose={() => setShowChapterNoteWindow(false)}
              onDragStop={(e, data) => setChapterNoteWindowPosition(data)}
              onResize={(e, dir, ref, delta, pos) => {
                const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
                setChapterNoteWindowSize(newSize);
              }}
              zIndex={500}  // 章节笔记窗口固定z-index
              windowId={`chapter:${currentFile.key}`}
              windowType="chapterNote"
              onBringToFront={() => handleBringNonPdfWindowToFront(`chapter:${currentFile.key}`, 'chapterNote')}
              isPinned={pinnedWindows.some(w => w.pdfId === 'chapter' && w.windowName === currentFile.key)}
              onTogglePin={() => handleToggleWindowPin(`chapter:${currentFile.key}`)}
              onContextMenu={() => generateChapterContextMenu()}
              titleBarColor="#666"  // 章节笔记也使用灰色标题栏
              resizable
            >
              <UserNoteEditor
                content={chapterNotes[currentFile.key] || ''}
                onChange={(content) => updateChapterNote(currentFile.key, content)}
                onImprove={(content, improvePrompt) => handleImproveChapterNote(content, improvePrompt)}
                placeholder="在这里记录关于整个章节的笔记..."
                isLoading={chapterNoteLoading}
              />
            </DraggableWindow>
          )}

          {/* 专家LLM对话窗口 */}
          {expertWindowVisible && currentExpertBoardId && (
            <DraggableWindow
              key={`expertLLM-${currentExpertBoardId}`}
              title={`专家LLM: ${currentExpertBoardId}`}
              defaultPosition={expertWindowPosition}
              defaultSize={expertWindowSize}
              onClose={() => setExpertWindowVisible(false)}
              onDragStop={(e, data) => setExpertWindowPosition(data)}
              onResize={(e, dir, ref, delta, pos) => {
                const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
                setExpertWindowSize(newSize);
              }}
              zIndex={501}  // 专家LLM窗口固定z-index
              windowId={`expert:${currentExpertBoardId}`}
              windowType="expertLLM"
              onBringToFront={() => handleBringNonPdfWindowToFront(`expert:${currentExpertBoardId}`, 'expertLLM')}
              isPinned={pinnedWindows.some(w => w.pdfId === 'expert' && w.windowName === currentExpertBoardId)}
              onTogglePin={() => handleToggleWindowPin(`expert:${currentExpertBoardId}`)}
              titleBarColor="#666"  // 专家LLM使用灰色标题栏
              resizable
            >
              <BoardExpertPanel
                boardId={currentExpertBoardId}
                initialHistory={expertHistory[currentExpertBoardId] || []}
                onHistoryChange={(history) => {
                  setExpertHistory(prev => ({
                    ...prev,
                    [currentExpertBoardId]: history
                  }));
                }}
              />
            </DraggableWindow>
          )}

          {/* 管家LLM窗口 */}
          {assistantWindowVisible && (
            <DraggableWindow
              key="butler-assistant"
              title="管家LLM助手"
              defaultPosition={assistantWindowPosition}
              defaultSize={assistantWindowSize}
              onClose={() => setAssistantWindowVisible(false)}
              onDragStop={(e, data) => setAssistantWindowPosition(data)}
              onResize={(e, dir, ref, delta, pos) => {
                const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
                setAssistantWindowSize(newSize);
              }}
              zIndex={502}  // 管家LLM窗口固定z-index
              windowId="butler:assistant"
              windowType="butlerLLM"
              onBringToFront={() => handleBringNonPdfWindowToFront('butler:assistant', 'butlerLLM')}
              isPinned={pinnedWindows.some(w => w.pdfId === 'butler' && w.windowName === 'assistant')}
              onTogglePin={() => handleToggleWindowPin('butler:assistant')}
              titleBarColor="#666"  // 管家LLM也使用灰色标题栏
              resizable
            >
              <ButlerPanel
                onAction={executeCommand}
              />
            </DraggableWindow>
          )}

          {/* 上传PDF的Modal */}
      <Modal 
            title="上传PDF文件"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
          >
            <Upload.Dragger
              name="file"
          accept=".pdf"
              multiple={false}
          showUploadList={false}
              beforeUpload={handleFileChange}
              customRequest={({ file, onSuccess }) => {
                onSuccess();
              }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">仅支持PDF文件</p>
            </Upload.Dragger>
      </Modal>
      
          {/* PDF选择列表Modal */}
      <Modal
            title={`选择 ${currentFile?.title || ''} 的PDF文件`}
        open={pdfListModalVisible}
        onCancel={() => setPdfListModalVisible(false)}
        footer={null}
            width={600}
      >
        <List
              itemLayout="horizontal"
          dataSource={currentFile ? (courseFiles[currentFile.key] || []) : []}
          renderItem={pdf => (
            <List.Item
              actions={[
                    <Button
                      key="select"
                      type="primary"
                      onClick={() => handleSelectPdf(pdf.id)}
                    >
                      选择
                    </Button>,
                <Button 
                      key="delete"
                  danger 
                  onClick={() => handleDeletePdf(pdf.id)}
                      icon={<DeleteOutlined />}
                    />
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<FilePdfOutlined />} style={{ backgroundColor: getPdfColor(pdf.id) }} />}
                    title={pdf.clientFilename || pdf.filename}
                description={`页数: ${pdf.totalPages || '未知'}`}
              />
            </List.Item>
          )}
            />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button
                type="dashed"
                icon={<UploadOutlined />}
                onClick={() => {
                  setPdfListModalVisible(false);
                  setUploadModalVisible(true);
                }}
                style={{ width: '100%' }}
              >
                上传新的PDF文件
              </Button>
            </div>
      </Modal>

          {/* 展板笔记窗口 - 完全使用PDF窗口的结构 */}
          {currentFile && boardNoteWindowVisible[currentFile.key] && (
            <DraggableWindow
              key={`boardNote-${currentFile.key}`}
              title={`展板笔记: ${currentFile.title || ''}`}
              defaultPosition={boardNoteWindowPosition}
              defaultSize={boardNoteWindowSize}
              onClose={() => setBoardNoteWindowVisible(prev => ({ ...prev, [currentFile.key]: false }))}
              onDragStop={(e, data) => setBoardNoteWindowPosition(data)}
              onResize={(e, dir, ref, delta, pos) => {
                const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
                setBoardNoteWindowSize(newSize);
              }}
              zIndex={600}
              windowId={`boardNote:${currentFile.key}`}
              windowType="boardNote"
              onBringToFront={() => handleBringNonPdfWindowToFront(`boardNote:${currentFile.key}`, 'boardNote')}
              isPinned={pinnedWindows.some(w => w.pdfId === 'boardNote' && w.windowName === currentFile.key)}
              onTogglePin={() => handleToggleWindowPin(`boardNote:${currentFile.key}`)}
              onContextMenu={() => generateBoardNoteContextMenu(currentFile.key)}
              titleBarColor="#999"
              resizable
            >
              {renderBoardNoteContent(currentFile.key)}
            </DraggableWindow>
          )}

          {/* 自定义窗口（通过控制台创建的文本框等） */}
          {currentFile && renderCustomWindows(currentFile.key)}
        </Content>
      </Layout>
      
      {/* 调试面板 */}
      {/* {renderDebugPanel()} */}
      
      {/* 任务列表组件 */}
      {currentFile && (
        <TaskList 
          boardId={currentFile.key} 
          apiClient={api}
        />
      )}
      
      {/* 控制台组件 */}
      {consoleVisible && (
        <Console
          isVisible={consoleVisible}
          onClose={() => setConsoleVisible(false)}
          apiClient={api}
          onCommand={handleConsoleCommand}
          onNavigation={handleConsoleNavigation}
        />
      )}
      
      {/* 全局右键菜单组件 */}
      <GlobalContextMenu onCommand={handleContextMenuCommand} />
    </Layout>
  );
}

export default App;