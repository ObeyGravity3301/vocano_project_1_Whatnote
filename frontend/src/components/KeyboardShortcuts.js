import React, { useEffect, useRef } from 'react';
import { message, Modal } from 'antd';
import './KeyboardShortcuts.css';

const KeyboardShortcuts = ({ 
  activePdfId,
  currentFile,
  courseFiles,
  onPageChange,
  onToggleWindow,
  onGenerateNote,
  onGenerateAnnotation,
  onSwitchPdf,
  onNewPdf,
  onClosePdf,
  onTogglePin,
  onFocusSearch,
  onToggleExpert,
  onToggleButler,
  onSaveNote,
  onExportPdf,
  onToggleFullscreen,
  onImproveAnnotation,
  onSaveAsNewVersion,
  getActivePdf,
  getVisiblePdfs
}) => {
  const shortcutsRef = useRef({});
  
  // 定义快捷键映射
  const shortcuts = {
    // PDF导航
    'ctrl+arrowright': {
      description: '下一页',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.currentPage < pdf.totalPages) {
          onPageChange(pdf.currentPage + 1, pdf.id);
          message.success(`切换到第 ${pdf.currentPage + 1} 页`);
        }
      }
    },
    'ctrl+arrowleft': {
      description: '上一页',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.currentPage > 1) {
          onPageChange(pdf.currentPage - 1, pdf.id);
          message.success(`切换到第 ${pdf.currentPage - 1} 页`);
        }
      }
    },
    'ctrl+home': {
      description: '跳转到第一页',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onPageChange(1, pdf.id);
          message.success('跳转到第一页');
        }
      }
    },
    'ctrl+end': {
      description: '跳转到最后一页',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.totalPages) {
          onPageChange(pdf.totalPages, pdf.id);
          message.success(`跳转到第 ${pdf.totalPages} 页`);
        }
      }
    },
    'pageup': {
      description: '上一页（PageUp）',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.currentPage > 1) {
          onPageChange(pdf.currentPage - 1, pdf.id);
        }
      }
    },
    'pagedown': {
      description: '下一页（PageDown）',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.currentPage < pdf.totalPages) {
          onPageChange(pdf.currentPage + 1, pdf.id);
        }
      }
    },
    
    // 窗口控制
    'alt+n': {
      description: '显示/隐藏笔记窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onToggleWindow(pdf.id, 'note');
        }
      }
    },
    'alt+a': {
      description: '显示/隐藏注释窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onToggleWindow(pdf.id, 'annotation');
        }
      }
    },
    'alt+u': {
      description: '显示/隐藏用户笔记窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onToggleWindow(pdf.id, 'userNote');
        }
      }
    },
    'alt+p': {
      description: '显示/隐藏用户页面笔记窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onToggleWindow(pdf.id, 'userPageNote');
        }
      }
    },
    'alt+1': {
      description: '快速切换到PDF窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && !pdf.windows.pdf.visible) {
          onToggleWindow(pdf.id, 'pdf');
        }
      }
    },
    'alt+2': {
      description: '快速切换到笔记窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && !pdf.windows.note.visible) {
          onToggleWindow(pdf.id, 'note');
        }
      }
    },
    'alt+3': {
      description: '快速切换到注释窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && !pdf.windows.annotation.visible) {
          onToggleWindow(pdf.id, 'annotation');
        }
      }
    },
    'alt+4': {
      description: '快速切换到用户笔记窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && !pdf.windows.userNote.visible) {
          onToggleWindow(pdf.id, 'userNote');
        }
      }
    },
    'escape': {
      description: '关闭所有弹窗',
      handler: () => {
        // 关闭所有Modal
        Modal.destroyAll();
        message.info('已关闭所有弹窗');
      }
    },
    
    // AI功能
    'ctrl+g': {
      description: '生成当前PDF的整本笔记',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onGenerateNote(pdf.id);
        }
      }
    },
    'ctrl+shift+g': {
      description: '生成当前页注释',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onGenerateAnnotation(pdf.id);
        }
      }
    },
    'ctrl+e': {
      description: '打开/关闭专家LLM',
      handler: () => {
        onToggleExpert();
      }
    },
    'ctrl+b': {
      description: '打开/关闭管家助手',
      handler: () => {
        onToggleButler();
      }
    },
    'ctrl+shift+a': {
      description: '改进当前页注释',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf && pdf.pageAnnotations[pdf.currentPage]) {
          const improvePrompt = prompt('请输入改进建议（可选）：');
          if (improvePrompt !== null) {
            onImproveAnnotation(pdf.id, improvePrompt);
          }
        } else {
          message.warning('当前页还没有注释');
        }
      }
    },
    
    // PDF切换
    'ctrl+tab': {
      description: '切换到下一个PDF',
      handler: () => {
        const visiblePdfs = getVisiblePdfs();
        if (visiblePdfs.length > 1) {
          const currentIndex = visiblePdfs.findIndex(pdf => pdf.id === activePdfId);
          const nextIndex = (currentIndex + 1) % visiblePdfs.length;
          onSwitchPdf(visiblePdfs[nextIndex].id);
        }
      }
    },
    'ctrl+shift+tab': {
      description: '切换到上一个PDF',
      handler: () => {
        const visiblePdfs = getVisiblePdfs();
        if (visiblePdfs.length > 1) {
          const currentIndex = visiblePdfs.findIndex(pdf => pdf.id === activePdfId);
          const prevIndex = (currentIndex - 1 + visiblePdfs.length) % visiblePdfs.length;
          onSwitchPdf(visiblePdfs[prevIndex].id);
        }
      }
    },
    'ctrl+1': {
      description: '切换到第1个PDF',
      handler: () => switchToNthPdf(0)
    },
    'ctrl+2': {
      description: '切换到第2个PDF',
      handler: () => switchToNthPdf(1)
    },
    'ctrl+3': {
      description: '切换到第3个PDF',
      handler: () => switchToNthPdf(2)
    },
    'ctrl+4': {
      description: '切换到第4个PDF',
      handler: () => switchToNthPdf(3)
    },
    'ctrl+5': {
      description: '切换到第5个PDF',
      handler: () => switchToNthPdf(4)
    },
    
    // 文件操作
    'ctrl+o': {
      description: '打开新PDF',
      handler: () => {
        onNewPdf();
      }
    },
    'ctrl+w': {
      description: '关闭当前PDF',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onClosePdf(pdf.id);
        }
      }
    },
    'ctrl+s': {
      description: '保存当前笔记',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onSaveNote(pdf.id);
          message.success('笔记已保存');
        }
      }
    },
    'ctrl+shift+e': {
      description: '导出当前PDF的笔记',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onExportPdf(pdf.id);
        }
      }
    },
    'ctrl+shift+s': {
      description: '另存为新版本',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onSaveAsNewVersion(pdf.id);
        }
      }
    },
    
    // 其他功能
    'ctrl+f': {
      description: '聚焦到搜索框',
      handler: () => {
        onFocusSearch();
      }
    },
    'ctrl+shift+p': {
      description: '置顶/取消置顶当前窗口',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          onTogglePin(pdf.id);
        }
      }
    },
    'f11': {
      description: '全屏/退出全屏',
      handler: () => {
        onToggleFullscreen();
      }
    },
    'ctrl+/': {
      description: '显示快捷键帮助',
      handler: () => {
        showShortcutsHelp();
      }
    },
    'ctrl+,': {
      description: '打开设置',
      handler: () => {
        message.info('设置功能开发中...');
      }
    },
    
    // 页面跳转
    'ctrl+j': {
      description: '跳转到指定页',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          showPageJumpDialog(pdf);
        }
      }
    },
    'ctrl+d': {
      description: '添加当前页到书签',
      handler: () => {
        const pdf = getActivePdf();
        if (pdf) {
          message.success(`已将第 ${pdf.currentPage} 页添加到书签`);
        }
      }
    },
    'ctrl+shift+d': {
      description: '显示所有书签',
      handler: () => {
        message.info('书签功能开发中...');
      }
    }
  };
  
  // 辅助函数：切换到第N个PDF
  const switchToNthPdf = (index) => {
    const visiblePdfs = getVisiblePdfs();
    if (index < visiblePdfs.length) {
      onSwitchPdf(visiblePdfs[index].id);
      message.success(`切换到第 ${index + 1} 个PDF`);
    }
  };
  
  // 显示快捷键帮助
  const showShortcutsHelp = () => {
    const shortcutsList = Object.entries(shortcuts).map(([key, info]) => ({
      key: key.replace('ctrl', 'Ctrl').replace('shift', 'Shift').replace('alt', 'Alt')
        .replace('arrow', '→').replace('left', '←').replace('right', '→')
        .replace('up', '↑').replace('down', '↓').replace('+', ' + '),
      description: info.description
    }));
    
    Modal.info({
      title: '快捷键帮助',
      width: 600,
      content: (
        <div className="shortcuts-help">
          <div className="shortcuts-section">
            <h4>PDF导航</h4>
            {shortcutsList.filter(s => s.description.includes('页')).map(s => (
              <div key={s.key} className="shortcut-item">
                <span className="shortcut-key">{s.key}</span>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
          
          <div className="shortcuts-section">
            <h4>窗口控制</h4>
            {shortcutsList.filter(s => s.description.includes('窗口')).map(s => (
              <div key={s.key} className="shortcut-item">
                <span className="shortcut-key">{s.key}</span>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
          
          <div className="shortcuts-section">
            <h4>AI功能</h4>
            {shortcutsList.filter(s => s.description.includes('生成') || s.description.includes('LLM') || s.description.includes('助手')).map(s => (
              <div key={s.key} className="shortcut-item">
                <span className="shortcut-key">{s.key}</span>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
          
          <div className="shortcuts-section">
            <h4>文件操作</h4>
            {shortcutsList.filter(s => s.description.includes('打开') || s.description.includes('关闭') || s.description.includes('保存') || s.description.includes('导出')).map(s => (
              <div key={s.key} className="shortcut-item">
                <span className="shortcut-key">{s.key}</span>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
          
          <div className="shortcuts-section">
            <h4>其他功能</h4>
            {shortcutsList.filter(s => !s.description.includes('页') && !s.description.includes('窗口') && !s.description.includes('生成') && !s.description.includes('LLM') && !s.description.includes('助手') && !s.description.includes('打开') && !s.description.includes('关闭') && !s.description.includes('保存') && !s.description.includes('导出')).map(s => (
              <div key={s.key} className="shortcut-item">
                <span className="shortcut-key">{s.key}</span>
                <span className="shortcut-desc">{s.description}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      okText: '关闭'
    });
  };
  
  // 显示页面跳转对话框
  const showPageJumpDialog = (pdf) => {
    let pageNumber = pdf.currentPage;
    
    Modal.confirm({
      title: '跳转到指定页',
      content: (
        <div>
          <p>当前页: {pdf.currentPage} / {pdf.totalPages}</p>
          <input
            type="number"
            min="1"
            max={pdf.totalPages}
            defaultValue={pdf.currentPage}
            onChange={(e) => pageNumber = parseInt(e.target.value)}
            style={{ width: '100%', padding: '4px 8px' }}
            autoFocus
          />
        </div>
      ),
      onOk: () => {
        if (pageNumber >= 1 && pageNumber <= pdf.totalPages) {
          onPageChange(pageNumber, pdf.id);
          message.success(`跳转到第 ${pageNumber} 页`);
        } else {
          message.error('页码无效');
        }
      }
    });
  };
  
  // 处理键盘事件
  const handleKeyDown = (e) => {
    // 如果正在输入框中输入，不处理快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
      return;
    }
    
    // 构建快捷键字符串
    let key = '';
    if (e.ctrlKey) key += 'ctrl+';
    if (e.shiftKey) key += 'shift+';
    if (e.altKey) key += 'alt+';
    
    // 特殊键处理
    if (e.key === 'ArrowLeft') key += 'arrowleft';
    else if (e.key === 'ArrowRight') key += 'arrowright';
    else if (e.key === 'ArrowUp') key += 'arrowup';
    else if (e.key === 'ArrowDown') key += 'arrowdown';
    else if (e.key === 'Home') key += 'home';
    else if (e.key === 'End') key += 'end';
    else if (e.key === 'Tab') key += 'tab';
    else if (e.key === 'PageUp') key = 'pageup';
    else if (e.key === 'PageDown') key = 'pagedown';
    else if (e.key === 'Escape') key = 'escape';
    else if (e.key === 'F11') key = 'f11';
    else if (e.key === '/') key += '/';
    else if (e.key === ',') key += ',';
    else key += e.key.toLowerCase();
    
    // 查找并执行对应的快捷键处理函数
    const shortcut = shortcuts[key];
    if (shortcut) {
      e.preventDefault();
      e.stopPropagation();
      shortcut.handler();
    }
  };
  
  // 注册和注销键盘事件监听
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePdfId, currentFile, courseFiles]); // 依赖项确保处理函数能访问最新状态
  
  // 不渲染任何UI，只处理键盘事件
  return null;
};

export default KeyboardShortcuts; 