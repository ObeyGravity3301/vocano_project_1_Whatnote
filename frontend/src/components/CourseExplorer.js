import React, { useState, useEffect } from 'react';
import { Tree, Button, Input, Modal, message, Dropdown, Menu, List, Tooltip, Spin } from 'antd';
import { FolderOutlined, FileOutlined, PlusOutlined, DeleteOutlined, EditOutlined, FilePdfOutlined, EllipsisOutlined, ReloadOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import './CourseExplorer.css';
import api from '../api'; // 导入修复后的API客户端

const { DirectoryTree } = Tree;

const CourseExplorer = ({ 
  onSelectFile,
  currentFile,
  pdfFiles = {}, // 添加pdfFiles属性，格式: { "course-file-key": [pdfObject1, pdfObject2, ...] }
  onSelectPdf,   // 添加选择PDF的回调
  onUploadFile,  // 处理文件上传
  activeCourseFile, // 当前活动的课程文件
  courseFiles,   // 课程文件结构
  setCourseFiles, // 更新课程文件的回调
  onDeletePdf    // 添加删除PDF的回调
}) => {
  const [treeData, setTreeData] = useState([]);
  const [newCourseName, setNewCourseName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // 重命名相关状态
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [newName, setNewName] = useState('');

  // 在其他state声明后添加删除确认Modal的state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // 只在组件挂载时获取一次数据
  useEffect(() => {
    fetchCourses();
    
    // 监听全局刷新事件，当管家LLM执行操作后自动刷新
    const handleRefreshEvent = () => {
      console.log('检测到全局刷新请求，刷新课程列表');
      message.info('正在刷新课程列表...');
      fetchCourses();
    };
    
    // 添加事件监听
    window.addEventListener('whatnote-refresh-courses', handleRefreshEvent);
    
    // 组件卸载时移除事件监听
    return () => {
      window.removeEventListener('whatnote-refresh-courses', handleRefreshEvent);
    };
  }, []);

  // 添加手动刷新方法，可以被外部调用
  const refreshCourses = () => {
    message.loading({ content: '正在刷新课程列表...', key: 'refreshCourses' });
    fetchCourses().then(() => {
      message.success({ content: '课程列表已刷新', key: 'refreshCourses' });
    }).catch(error => {
      message.error({ content: `刷新失败: ${error.message}`, key: 'refreshCourses' });
    });
  };

  // 调试：查看后端状态
  const debugBackendState = async () => {
    try {
      message.loading({ content: '正在获取后端状态...', key: 'debugState' });
      
      const response = await fetch('/api/debug/app-state-raw');
      const data = await response.json();
      
      console.log('=== 后端状态调试信息 ===');
      console.log('文件是否存在:', data.file_exists);
      console.log('课程文件夹数量:', data.course_folders_count);
      console.log('展板数量:', data.boards_count);
      console.log('完整数据:', data.parsed_content);
      
      // 显示调试信息
      Modal.info({
        title: '后端状态调试信息',
        width: 800,
        content: (
          <div>
            <p><strong>文件状态：</strong>{data.file_exists ? '存在' : '不存在'}</p>
            <p><strong>课程文件夹数量：</strong>{data.course_folders_count || 0}</p>
            <p><strong>展板数量：</strong>{data.boards_count || 0}</p>
            <p><strong>详细数据：</strong></p>
            <pre style={{ 
              background: '#f5f5f5', 
              padding: '10px', 
              borderRadius: '4px',
              maxHeight: '400px',
              overflow: 'auto',
              fontSize: '12px'
            }}>
              {JSON.stringify(data.parsed_content, null, 2)}
            </pre>
          </div>
        )
      });
      
      message.success({ content: '后端状态获取成功，请查看调试信息', key: 'debugState' });
      
    } catch (error) {
      console.error('获取后端状态失败:', error);
      message.error({ content: `获取后端状态失败: ${error.message}`, key: 'debugState' });
    }
  };

  // 从API获取课程和文件结构
  const fetchCourses = async () => {
    setLoading(true);
    try {
      console.log('使用API客户端请求应用状态');
      
      // 使用API客户端获取应用状态
      const data = await api.getAppState();
      const courseFolders = data.course_folders || [];
      
      console.log('获取到的课程文件夹:', courseFolders);
      
      // 处理数据...
      const formattedData = processCourseFolders(courseFolders);
      setTreeData(formattedData);
      return formattedData;
    } catch (error) {
      console.error('获取课程列表错误:', error);
      
      // 检查是否是连接错误（服务器未启动）
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message.error('无法连接到后端服务器，使用本地缓存');
        return loadCachedData();
      } else {
        message.error(`获取课程列表失败: ${error.message}`);
      }
      
      return [];
    } finally {
      setLoading(false);
    }
  };
  
  // 将API返回的课程文件夹转换为树形结构
  const processCourseFolders = (courseFolders) => {
    const formattedData = courseFolders.map(folder => {
      // 处理课程文件
      const children = (folder.files || []).map(file => ({
        title: file.name,
        key: file.id,
        isLeaf: true,
        type: file.type, // 保留文件类型信息
      }));
      
      return {
        title: folder.name,
        key: folder.id,
        isLeaf: false,
        children: children
      };
    });
    
    console.log('格式化后的课程数据:', formattedData);
    
    // 保存到本地存储，支持离线模式
    try {
      localStorage.setItem('whatnote-courses-cache', JSON.stringify(formattedData));
    } catch (err) {
      console.warn('缓存课程列表到本地存储失败:', err);
    }
    
    return formattedData;
  };
  
  // 从本地缓存加载数据
  const loadCachedData = () => {
    try {
      const cachedData = localStorage.getItem('whatnote-courses-cache');
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setTreeData(parsedData);
        message.warning('正在使用离线缓存的课程列表');
        return parsedData;
      }
    } catch (cacheError) {
      console.error('读取缓存失败:', cacheError);
    }
    return [];
  };

  // 选择文件时触发
  const handleSelect = (selectedKeys, info) => {
    if (info.node.isLeaf) {
      // 选择了文件节点
      console.log('选择文件:', info.node.title, info.node.key);
      if (onSelectFile) {
        onSelectFile(info.node);
      }
    } else {
      // 选择了课程文件夹
      setSelectedCourse(info.node);
      console.log('选择课程:', info.node.title, info.node.key);
    }
  };

  // 添加新课程
  const handleAddCourse = async () => {
    if (!newCourseName.trim()) {
      message.error('请输入课程名称');
      return;
    }

    try {
      message.loading({ content: '创建课程中...', key: 'createCourse' });
      
      // 使用API客户端创建课程
      const data = await api.createCourse(newCourseName);
      
      // 使用后端返回的数据更新UI
      const newCourse = {
        title: data.name,
        key: data.id,
        isLeaf: false,
        children: []
      };

      setTreeData([...treeData, newCourse]);
      setNewCourseName('');
      setShowAddCourseModal(false);
      message.success({ content: `课程 "${newCourseName}" 创建成功`, key: 'createCourse' });
      
      // 更新本地缓存
      try {
        const cachedData = localStorage.getItem('whatnote-courses-cache');
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          localStorage.setItem('whatnote-courses-cache', JSON.stringify([...parsedData, newCourse]));
        }
      } catch (cacheError) {
        console.warn('更新课程缓存失败:', cacheError);
      }
    } catch (error) {
      console.error('创建课程错误:', error);
      message.error({ content: `创建课程失败: ${error.message}`, key: 'createCourse' });
      
      // 特殊处理连接错误
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message.warning('后端服务器连接失败，请检查后端服务是否已启动');
      }
    }
  };

  // 添加新文件
  const handleAddFile = async () => {
    if (!newFileName.trim()) {
      message.error('请输入文件名称');
      return;
    }

    if (!selectedCourse) {
      message.error('请先选择一个课程文件夹');
      return;
    }

    try {
      message.loading({ content: '创建文件中...', key: 'createFile' });
      
      // 使用API客户端创建文件
      const data = await api.createCourseFile(selectedCourse.key, newFileName);
      
      // 使用后端返回的数据更新UI
      const newFile = {
        title: data.name,
        key: data.id,
        isLeaf: true,
      };

      const updateTreeData = (list) => 
        list.map(node => {
          if (node.key === selectedCourse.key) {
            return {
              ...node,
              children: [...(node.children || []), newFile]
            };
          }
          
          if (node.children) {
            return {
              ...node,
              children: updateTreeData(node.children)
            };
          }
          
          return node;
        });

      const updatedTreeData = updateTreeData(treeData);
      setTreeData(updatedTreeData);
      setNewFileName('');
      setShowAddFileModal(false);
      message.success({ content: `文件 "${newFileName}" 创建成功`, key: 'createFile' });
      
      // 更新本地缓存
      try {
        localStorage.setItem('whatnote-courses-cache', JSON.stringify(updatedTreeData));
      } catch (cacheError) {
        console.warn('更新课程缓存失败:', cacheError);
      }
    } catch (error) {
      console.error('创建文件错误:', error);
      message.error({ content: `创建文件失败: ${error.message}`, key: 'createFile' });
      
      // 特殊处理连接错误
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message.warning('后端服务器连接失败，请检查后端服务是否已启动');
      }
    }
  };
  
  // 打开重命名模态框
  const openRenameModal = (node) => {
    setRenameTarget(node);
    setNewName(node.title);
    setShowRenameModal(true);
  };
  
  // 重命名节点
  const handleRename = async () => {
    if (!newName.trim()) {
      message.error('名称不能为空');
      return;
    }
    
    try {
      message.loading({ content: '重命名中...', key: 'renameNode' });
      
      const isFolder = !renameTarget.isLeaf;
      
      console.log('=== 重命名操作详情 ===');
      console.log('重命名目标:', renameTarget);
      console.log('是否为文件夹:', isFolder);
      console.log('ID:', renameTarget.key);
      console.log('原标题:', renameTarget.title);
      console.log('新标题:', newName);
      
      // 检查API方法是否存在
      console.log('=== API方法检查 ===');
      console.log('主API.renameCourse:', typeof api.renameCourse);
      console.log('主API.renameCourseFile:', typeof api.renameCourseFile);
      
      // 直接定义重命名API调用，绕过可能的导入问题
      const directRenameCourse = async (courseId, newName) => {
        console.log(`直接API调用: 重命名课程文件夹, ID: ${courseId}, 新名称: ${newName}`);
        const response = await fetch(`http://localhost:8000/api/courses/${courseId}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: newName })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`重命名课程失败: ${response.status} - ${errorText}`);
        }
        
        return await response.json();
      };
      
      const directRenameCourseFile = async (fileId, newName) => {
        console.log(`直接API调用: 重命名课程文件, ID: ${fileId}, 新名称: ${newName}`);
        const response = await fetch(`http://localhost:8000/api/courses/files/${fileId}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: newName })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`重命名文件失败: ${response.status} - ${errorText}`);
        }
        
        return await response.json();
      };
      
      // 使用直接API调用
      if (isFolder) {
        // 重命名课程文件夹
        console.log('使用直接重命名课程API:', renameTarget.key, newName);
        await directRenameCourse(renameTarget.key, newName);
      } else {
        // 重命名文件
        console.log('使用直接重命名课程文件API:', renameTarget.key, newName);
        await directRenameCourseFile(renameTarget.key, newName);
      }
      
      console.log('✅ 后端重命名API调用成功，开始更新前端状态');
      
      // 更新前端状态
      const updateNodeTitle = (list) => 
        list.map(node => {
          if (node.key === renameTarget.key) {
            return { ...node, title: newName };
          }
          
          if (node.children) {
            return {
              ...node,
              children: updateNodeTitle(node.children)
            };
          }
          
          return node;
        });
      
      const updatedTreeData = updateNodeTitle(treeData);
      setTreeData(updatedTreeData);
      
      // 更新本地缓存
      try {
        localStorage.setItem('whatnote-courses-cache', JSON.stringify(updatedTreeData));
        console.log('✅ 本地缓存已更新');
      } catch (cacheError) {
        console.warn('更新课程缓存失败:', cacheError);
      }
      
      setShowRenameModal(false);
      message.success({ content: `重命名成功: ${renameTarget.title} -> ${newName}`, key: 'renameNode' });
      
      console.log('✅ 重命名操作完成');
      
    } catch (error) {
      console.error('重命名失败:', error);
      message.error({ content: `重命名失败: ${error.message}`, key: 'renameNode' });
      
      // 特殊处理连接错误
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message.warning('后端服务器连接失败，请检查后端服务是否已启动');
      }
    }
  };
  
  // 自定义渲染标题，添加右键菜单
  const renderTreeTitle = (node) => {
    const menuItems = [
      {
        key: 'rename',
        label: '重命名',
        icon: <EditOutlined />,
        onClick: () => openRenameModal(node)
      },
      {
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        onClick: () => handleDeleteNode(node),
        danger: true
      }
    ];
    
    const hasPdfs = !node.isLeaf && pdfFiles[node.key] && pdfFiles[node.key].length > 0;
    
    return (
      <div className="tree-node-title course-item" data-course-id={node.key} data-course-name={node.title}>
        <div className="node-title-row">
          <span className="node-title-text course-item" data-course-id={node.key} data-course-name={node.title}>
            {/* 为非叶子节点添加文件夹图标 */}
            {!node.isLeaf && <FolderOutlined style={{ marginRight: '5px', color: '#1890ff' }} />}
            {/* 为叶子节点添加文件图标 */}
            {node.isLeaf && <FileOutlined style={{ marginRight: '5px', color: '#52c41a' }} />}
            {node.title}
          </span>
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button 
              type="text" 
              size="small" 
              icon={<EllipsisOutlined />} 
              className="node-action-button"
              onClick={e => e.stopPropagation()}
            />
          </Dropdown>
        </div>
        
        {/* 如果是章节节点且有PDF文件，显示PDF列表 */}
        {node.isLeaf && pdfFiles[node.key] && pdfFiles[node.key].length > 0 && (
          <div className="node-pdf-list" onClick={e => e.stopPropagation()}>
            <List
              size="small"
              dataSource={pdfFiles[node.key]}
              renderItem={pdf => {
                const pdfColor = getPdfColor(pdf.id, pdf.customColor);
                
                // PDF右键菜单项
                const pdfMenuItems = [
                  {
                    key: 'select',
                    label: '选择此PDF',
                    icon: <FilePdfOutlined />,
                    onClick: () => onSelectPdf && onSelectPdf(pdf.id)
                  },
                  {
                    key: 'delete',
                    label: '删除PDF',
                    icon: <DeleteOutlined />,
                    onClick: () => {
                      Modal.confirm({
                        title: '确认删除PDF',
                        content: `您确定要删除PDF文件 "${pdf.filename || pdf.clientFilename}" 吗？`,
                        okText: '确定',
                        cancelText: '取消',
                        onOk: () => {
                          console.log('从CourseExplorer删除PDF:', pdf.id);
                          onDeletePdf && onDeletePdf(pdf.id);
                        }
                      });
                    },
                    danger: true
                  }
                ];
                
                return (
                  <Dropdown
                    menu={{ items: pdfMenuItems }}
                    trigger={['contextMenu']}
                    placement="bottomLeft"
                  >
                    <List.Item 
                      className="pdf-list-item"
                      onClick={() => onSelectPdf && onSelectPdf(pdf.id)}
                      style={{
                        background: `linear-gradient(90deg, ${pdfColor}15 0%, transparent 70%)`,
                        borderLeft: `2px solid ${pdfColor}`,
                        margin: '1px 0',
                        borderRadius: '3px',
                        transition: 'all 0.2s ease',
                        padding: '4px 8px',
                        cursor: 'pointer'
                      }}
                    >
                      <FilePdfOutlined style={{ marginRight: '6px', color: pdfColor }} />
                      <span className="pdf-title" style={{ color: '#333', fontWeight: '450' }}>
                        {pdf.filename || pdf.clientFilename}
                      </span>
                    </List.Item>
                  </Dropdown>
                );
              }}
            />
          </div>
        )}
      </div>
    );
  };
  
  // 自定义树节点渲染
  const renderTreeNodes = (data) => {
    return data.map(item => {
      if (item.children) {
        return {
          ...item,
          title: renderTreeTitle(item),
          children: renderTreeNodes(item.children)
        };
      }
      return {
        ...item,
        title: renderTreeTitle(item)
      };
    });
  };

  // 处理删除节点
  const handleDeleteNode = (node) => {
    setDeleteTarget(node);
    setShowDeleteModal(true);
  };
  
  // 执行删除操作
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      message.loading({ content: `正在删除 ${deleteTarget.title}...`, key: 'deleteNode' });
      
      const isFolder = !deleteTarget.isLeaf;
      
      console.log('=== 删除操作详情 ===');
      console.log('删除目标:', deleteTarget);
      console.log('是否为文件夹:', isFolder);
      console.log('ID:', deleteTarget.key);
      console.log('标题:', deleteTarget.title);
      
      // 使用API客户端删除课程或文件
      if (isFolder) {
        // 删除课程
        console.log('调用删除课程API:', deleteTarget.key);
        await api.deleteCourse(deleteTarget.key);
      } else {
        // 根据文件类型决定删除方式
        if (deleteTarget.type === 'board') {
          // 删除展板
          console.log('调用删除展板API:', deleteTarget.key);
          await api.deleteBoard(deleteTarget.key);
        } else {
          // 删除普通文件
          console.log('调用删除课程文件API:', deleteTarget.key);
          await api.deleteCourseFile(deleteTarget.key);
        }
      }
      
      console.log('✅ 后端删除API调用成功，开始更新前端状态');
      
      // 从树形结构中移除节点
      const removeNode = (list) => 
        list.filter(item => item.key !== deleteTarget.key)
          .map(item => {
            if (item.children) {
              return {
                ...item,
                children: removeNode(item.children)
              };
            }
            return item;
          });
      
      const updatedTreeData = removeNode(treeData);
      setTreeData(updatedTreeData);
      
      // 如果删除的是当前选中的课程，清除选中状态
      if (selectedCourse && selectedCourse.key === deleteTarget.key) {
        setSelectedCourse(null);
      }
      
      setShowDeleteModal(false);
      message.success({ 
        content: `${isFolder ? '课程' : '文件'} "${deleteTarget.title}" 已删除`, 
        key: 'deleteNode' 
      });
      
      // 重要：强制从后端重新获取数据，确保删除真正生效
      console.log('🔄 强制从后端重新获取数据以验证删除');
      setTimeout(async () => {
        try {
          const freshData = await fetchCourses();
          console.log('✅ 重新获取数据完成:', freshData);
          
          // 验证删除的项目是否真的不存在
          const checkDeleted = (data, targetKey) => {
            for (const item of data) {
              if (item.key === targetKey) {
                console.error('❌ 警告：删除的项目仍然存在于后端数据中!', item);
                message.warning(`删除可能未完全生效，请手动刷新页面确认`);
                return false;
              }
              if (item.children && checkDeleted(item.children, targetKey)) {
                return false;
              }
            }
            return true;
          };
          
          const isReallyDeleted = checkDeleted(freshData, deleteTarget.key);
          if (isReallyDeleted) {
            console.log('✅ 验证通过：项目已成功从后端删除');
          }
        } catch (refreshError) {
          console.error('⚠️ 重新获取数据失败，可能存在网络问题:', refreshError);
          message.warning('删除完成，但数据刷新失败。建议手动刷新页面确认删除结果。');
        }
      }, 1000);
      
      // 更新本地缓存（使用更新后的数据）
      try {
        localStorage.setItem('whatnote-courses-cache', JSON.stringify(updatedTreeData));
        console.log('✅ 本地缓存已更新');
      } catch (cacheError) {
        console.warn('更新课程缓存失败:', cacheError);
      }
    } catch (error) {
      console.error('=== 删除操作失败 ===');
      console.error('错误详情:', error);
      console.error('删除目标:', deleteTarget);
      console.error('调用的API:', !deleteTarget.isLeaf ? 'deleteCourse' : 'deleteCourseFile');
      console.error('使用的ID:', deleteTarget.key);
      
      message.error({ content: `删除失败: ${error.message}`, key: 'deleteNode' });
    }
  };

  // 获取PDF颜色的函数（与App.js中保持一致）
  const getPdfColor = (pdfId, customColor = null) => {
    // 预定义的窗口颜色列表
    const PDF_COLORS = [
      '#1890ff', '#52c41a', '#722ed1', '#fa8c16',
      '#eb2f96', '#faad14', '#13c2c2', '#f5222d'
    ];
    
    // 如果有自定义颜色，使用自定义颜色
    if (customColor) {
      return customColor;
    }
    
    // 如果没有ID，返回默认颜色
    if (!pdfId) return '#1890ff';
    
    // 通过ID生成固定的颜色索引
    const idSum = pdfId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const colorIndex = idSum % PDF_COLORS.length;
    
    return PDF_COLORS[colorIndex];
  };

  return (
    <div className="course-explorer" data-active-course={currentFile?.key || ''}>
      <div className="explorer-header">
        <h3>课程资源</h3>
        <div className="explorer-actions">
          <Button 
            type="primary" 
            size="small" 
            icon={<PlusOutlined />}
            onClick={() => setShowAddCourseModal(true)}
          >
            新建课程
          </Button>
          <Button 
            size="small" 
            icon={<PlusOutlined />}
            onClick={() => setShowAddFileModal(true)}
            disabled={!selectedCourse}
          >
            新建文件
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={refreshCourses}
            loading={loading}
            style={{ marginLeft: '4px' }}
          />
          <Tooltip title="查看后端状态">
            <Button
              size="small"
              type="dashed"
              onClick={debugBackendState}
              style={{ marginLeft: '4px', color: '#999' }}
            >
              调试
            </Button>
          </Tooltip>
        </div>
      </div>
      
      <DirectoryTree
        className="course-tree"
        defaultExpandAll
        onSelect={handleSelect}
        treeData={renderTreeNodes(treeData)}
        selectedKeys={currentFile ? [currentFile.key] : []}
      />
      
      {/* 底部的PDF文件操作区域 */}
      <div className="explorer-footer">
        {/* 显示当前选中的课程文件夹 */}
        {selectedCourse && (
          <div className="selected-course">
            <span className="selected-course-label">当前课程:</span>
            <span className="selected-course-name">{selectedCourse.title}</span>
          </div>
        )}
        
        {/* 显示已打开的PDF文件 */}
        {activeCourseFile && courseFiles && courseFiles[activeCourseFile.key] && courseFiles[activeCourseFile.key].length > 0 && (
          <div className="open-pdfs">
            <span className="open-pdfs-label">打开的PDF:</span>
            <div className="pdf-list">
              {courseFiles[activeCourseFile.key]
                .filter(pdf => 
                  pdf.windows.pdf.visible || 
                  pdf.windows.note.visible || 
                  pdf.windows.annotation.visible ||
                  (pdf.windows.answer && pdf.windows.answer.visible)
                )
                .map(pdf => {
                  const pdfColor = getPdfColor(pdf.id, pdf.customColor);
                  return (
                    <div 
                      key={pdf.id} 
                      className="open-pdf-item"
                      style={{
                        background: `linear-gradient(90deg, ${pdfColor}20 0%, transparent 80%)`,
                        borderLeft: `3px solid ${pdfColor}`,
                        padding: '6px 12px',
                        margin: '2px 0',
                        borderRadius: '4px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <FilePdfOutlined style={{ marginRight: '8px', color: pdfColor }} />
                      <span className="pdf-name" style={{ fontWeight: '500' }}>{pdf.clientFilename || pdf.filename}</span>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}
        
        {/* 上传PDF按钮 */}
        <Button 
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => onUploadFile && onUploadFile()}
          block
          style={{ marginTop: '12px' }}
        >
          上传PDF文件
        </Button>
      </div>
      
      {/* 创建课程模态框 */}
      <Modal
        title="创建新课程"
        open={showAddCourseModal}
        onOk={handleAddCourse}
        onCancel={() => setShowAddCourseModal(false)}
      >
        <Input 
          placeholder="输入课程名称"
          value={newCourseName}
          onChange={e => setNewCourseName(e.target.value)}
        />
      </Modal>
      
      {/* 创建文件模态框 */}
      <Modal
        title="创建新文件"
        open={showAddFileModal}
        onOk={handleAddFile}
        onCancel={() => setShowAddFileModal(false)}
      >
        <p>
          将在 <strong>{selectedCourse?.title}</strong> 中创建新文件
        </p>
        <Input 
          placeholder="输入文件名称" 
          value={newFileName}
          onChange={e => setNewFileName(e.target.value)}
        />
      </Modal>
      
      {/* 重命名模态框 */}
      <Modal
        title="重命名"
        open={showRenameModal}
        onOk={handleRename}
        onCancel={() => setShowRenameModal(false)}
      >
        <Input 
          placeholder="输入新名称"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
      </Modal>
      
      {/* 删除确认模态框 */}
      <Modal
        title="确认删除"
        open={showDeleteModal}
        onOk={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      >
        <p>
          您确定要删除 <strong>{deleteTarget?.title}</strong> 吗？
        </p>
      </Modal>
    </div>
  );
};

export default CourseExplorer; 
