import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Excalidraw, VERSIONS } from "@excalidraw/excalidraw";
import { MENU_AREAS } from "./GlobalContextMenu";

// 添加版本显示组件
const VersionInfo = () => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.1)',
      padding: '5px 10px',
      borderRadius: '4px',
      fontSize: '12px',
      zIndex: 100
    }}>
      Excalidraw版本: {VERSIONS?.excalidrawVersion || '未知'}
    </div>
  );
};

const Whiteboard = forwardRef(({ elements, onChange, boardId }, ref) => {
  const excalidrawRef = useRef(null);
  // 追踪是否已经初始化
  const [initialized, setInitialized] = useState(false);
  // 添加上次更新时间戳，防止频繁更新
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  // 添加上次元素哈希值，防止相同元素重复渲染
  const [lastElementsHash, setLastElementsHash] = useState("");

  // 将内部excalidrawRef暴露给父组件
  useImperativeHandle(ref, () => ({
    updateScene: (sceneData) => {
      if (excalidrawRef.current) {
        console.log('📢 父组件调用updateScene:', 
          sceneData.elements?.length || 0, '元素, ',
          Object.keys(sceneData.files || {}).length || 0, '个文件'
        );
        excalidrawRef.current.updateScene(sceneData);
      }
    },
    getSceneElements: () => {
      if (excalidrawRef.current) {
        return excalidrawRef.current.getSceneElements();
      }
      return [];
    },
    getFiles: () => {
      if (excalidrawRef.current) {
        return excalidrawRef.current.getFiles();
      }
      return {};
    },
    addFiles: (files) => {
      if (excalidrawRef.current) {
        return excalidrawRef.current.addFiles(files);
      }
    },
    refresh: () => {
      if (excalidrawRef.current) {
        excalidrawRef.current.refresh();
      }
    }
  }));

  // 计算元素数组的简单哈希，用于检测实际变化
  const getElementsHash = useCallback((elems) => {
    if (!elems || !Array.isArray(elems) || elems.length === 0) return "empty";
    return elems.map(e => e.id).join("-");
  }, []);

  // 处理空或无效元素
  const sanitizeElements = useCallback((elems) => {
    console.log('⚠️ 处理元素输入:', 
      elems ? `数组长度: ${elems.length}` : '无元素', 
      elems && elems.length > 0 ? `第一个元素类型: ${elems[0].type}` : ''
    );
    
    // 检查是否有iframe元素
    const hasIframe = elems && Array.isArray(elems) && elems.some(el => el.type === 'iframe');
    if (hasIframe) {
      console.log('🔍 检测到iframe元素，详细信息:', 
        elems.filter(el => el.type === 'iframe').map(el => ({
          id: el.id,
          type: el.type,
          frameUrl: el.frameData?.url || '无URL',
          frameWidth: el.width,
          frameHeight: el.height,
          x: el.x,
          y: el.y
        }))
      );
    }
    
    if (!elems || !Array.isArray(elems)) {
      console.warn('⚠️ 输入元素无效或为空');
      return [];
    }
    
    try {
      return elems.map(element => {
        if (!element || typeof element !== 'object') {
          console.error('❌ 元素对象无效:', element);
          return null;
        }
        
        // 特殊处理iframe元素
        if (element.type === 'iframe') {
          console.log('🔧 处理iframe元素:', element.id);
          
          // 确保iframe元素具有有效的结构
          const sanitizedElement = {
            ...element,
            id: element.id || `iframe-${Math.random().toString(36).substr(2, 9)}`,
            x: Number(element.x || 0),
            y: Number(element.y || 0),
            width: Number(element.width || 800),
            height: Number(element.height || 600),
            type: "iframe",
            strokeColor: element.strokeColor || "#1e88e5",
            backgroundColor: element.backgroundColor || "transparent",
            fillStyle: element.fillStyle || "solid",
            strokeWidth: element.strokeWidth || 2,
            strokeStyle: element.strokeStyle || "solid",
            roughness: element.roughness || 0,
            opacity: element.opacity || 100,
            groupIds: element.groupIds || [],
            roundness: element.roundness || { type: 2 },
            seed: element.seed || Math.floor(Math.random() * 100000),
            version: element.version || 1,
            versionNonce: element.versionNonce || Math.floor(Math.random() * 100000),
            isDeleted: element.isDeleted || false,
            frameData: {
              url: element.frameData?.url || "",
              name: element.frameData?.name || "嵌入内容"
            }
          };
          
          console.log('✅ 处理后的iframe元素:', sanitizedElement);
          return sanitizedElement;
        }
        
        // 确保所有必需属性存在
        const sanitized = {
          ...element,
          id: element.id || `id-${Math.random().toString(36).substr(2, 9)}`,
          type: element.type || "text",
          x: Number(element.x || 0),
          y: Number(element.y || 0),
          width: Number(element.width || 100),
          height: Number(element.height || 100),
          groupIds: element.groupIds || [],
          strokeColor: element.strokeColor || "#000000",
          backgroundColor: element.backgroundColor || "transparent",
          fillStyle: element.fillStyle || "solid",
          strokeWidth: element.strokeWidth || 1,
          roughness: element.roughness || 1,
          opacity: element.opacity || 100,
          seed: element.seed || Math.floor(Math.random() * 100000),
          version: element.version || 1,
          versionNonce: element.versionNonce || Math.floor(Math.random() * 100000),
          isDeleted: false
        };
        
        return sanitized;
      }).filter(Boolean); // 过滤掉无效元素
    } catch (err) {
      console.error('❌ 处理元素时出错:', err);
      return [];
    }
  }, []);

  // 仅在元素变化时更新
  useEffect(() => {
    const currentTime = Date.now();
    const currentHash = getElementsHash(elements);
    console.log(`🔄 元素变化检测 - 数量: ${elements?.length || 0}, 哈希: ${currentHash.substring(0, 20)}...`);
    console.log(`⏱️ 上次更新: ${currentTime - lastUpdateTime}ms前，初始化状态: ${initialized}`);
    
    // 检查是否应该跳过更新 (防止频繁更新和无限循环)
    const shouldSkipUpdate = 
      // 相同元素哈希值(内容没变)
      (currentHash === lastElementsHash) || 
      // 距离上次更新不到500ms
      (currentTime - lastUpdateTime < 500) ||
      // 组件尚未初始化完成
      !initialized || 
      // 引用不存在
      !excalidrawRef.current;
      
    if (shouldSkipUpdate) {
      console.log('⏭️ 跳过更新:', 
        currentHash === lastElementsHash ? '相同元素' : '',
        currentTime - lastUpdateTime < 500 ? '更新过于频繁' : '',
        !initialized ? '组件未初始化' : '',
        !excalidrawRef.current ? 'Excalidraw引用不存在' : ''
      );
      return;
    }
    
    // 记录本次更新时间和元素哈希
    setLastUpdateTime(currentTime);
    setLastElementsHash(currentHash);
    
    try {
      console.log('🔄 开始处理元素用于Excalidraw渲染');
      const processedElements = sanitizeElements(elements);
      
      // 检查PDF iframe元素
      const pdfEmbeds = processedElements.filter(el => el.type === 'iframe');
      if (pdfEmbeds.length > 0) {
        console.log(`📄 检测到${pdfEmbeds.length}个PDF嵌入元素，将进行处理`);
        // 检查iframe元素的URL是否有效
        pdfEmbeds.forEach(embed => {
          if (!embed.frameData || !embed.frameData.url) {
            console.error('❌ iframe元素缺少URL:', embed.id);
          } else {
            console.log(`✅ iframe元素URL有效: ${embed.frameData.url.substring(0, 30)}...`);
          }
        });
      }
      
      // 添加固定的测试元素
      const testElement = {
        id: "test-rect",
        type: "rectangle",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        backgroundColor: "#4CAF50",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeColor: "#000000",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        strokeStyle: "solid",
        version: 1,
        isDeleted: false,
        seed: 12345,
      };
      
      // 添加固定的测试文本
      const testText = {
        id: "test-text",
        type: "text",
        x: 60,
        y: 170,
        width: 200,
        height: 50,
        text: "测试文本 - 如果能看到此文本，渲染正常",
        fontSize: 16,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        seed: 67890,
        version: 1,
        versionNonce: 67890,
        isDeleted: false
      };
      
      // 检查是否已存在测试元素
      const hasTestRect = processedElements.some(el => el.id === "test-rect");
      const hasTestText = processedElements.some(el => el.id === "test-text");
      
      let finalElements = [...processedElements];
      if (!hasTestRect) finalElements.push(testElement);
      if (!hasTestText) finalElements.push(testText);
      
      console.log(`✅ Excalidraw准备更新 - 最终元素数量: ${finalElements.length}`);
      console.log(`📊 元素类型统计: 文本: ${finalElements.filter(e => e.type === 'text').length}, 矩形: ${finalElements.filter(e => e.type === 'rectangle').length}, iframe: ${finalElements.filter(e => e.type === 'iframe').length}`);
      
      // 确认Excalidraw API和场景可用性
      if (excalidrawRef.current && typeof excalidrawRef.current.updateScene === 'function') {
        console.log('✅ Excalidraw API正常，准备更新场景');
      } else {
        console.error('❌ Excalidraw API不可用!', excalidrawRef.current);
        return;
      }
      
      // 使用requestAnimationFrame确保DOM完全就绪
      const frameId = requestAnimationFrame(() => {
        try {
          console.time('excalidraw-update');
          excalidrawRef.current.updateScene({
            elements: finalElements
          });
          console.timeEnd('excalidraw-update');
          console.log('✅ 场景更新完成');
        } catch (err) {
          console.error('❌ 更新场景失败:', err.message);
        }
      });
      
      // 清理函数
      return () => cancelAnimationFrame(frameId);
    } catch (err) {
      console.error('❌ 处理元素时发生严重错误:', err.message);
    }
  }, [elements, initialized, sanitizeElements, lastUpdateTime, lastElementsHash, getElementsHash]);

  // 组件初次加载时
  useEffect(() => {
    console.log('🔄 Whiteboard组件开始初始化...');
    
    // 延迟设置初始化状态，确保Excalidraw组件已完全加载
    const timer = setTimeout(() => {
      setInitialized(true);
      console.log('✅ Whiteboard组件初始化完成');
    }, 1000); // 增加延迟以确保完全加载
    
    return () => {
      clearTimeout(timer);
      console.log('🛑 Whiteboard组件卸载');
    };
  }, []);

  // 当场景变化时调用onChange (防抖处理)
  const handleChange = useCallback((sceneElements, state, files) => {
    console.log(`📝 Excalidraw内部元素变化: ${sceneElements.length}个元素`);
    
    // 仅当元素有实际变化且onChange回调存在时才调用
    if (onChange && Array.isArray(sceneElements)) {
      onChange(sceneElements);
    }
  }, [onChange]);

  // 处理右键菜单
  const handleContextMenu = useCallback((e) => {
    if (typeof window !== 'undefined' && window.showContextMenu) {
      // 获取鼠标位置
      const position = { x: e.clientX, y: e.clientY };
      
      // 传递展板ID
      const data = { boardId };
      
      // 调用全局上下文菜单
      window.showContextMenu(MENU_AREAS.BOARD_AREA, null, position, data);
      
      // 阻止默认右键菜单
      e.preventDefault();
    }
  }, [boardId]);
  
  // 添加右键菜单事件监听
  useEffect(() => {
    const excalidrawWrapper = document.querySelector('.excalidraw-wrapper');
    if (excalidrawWrapper) {
      excalidrawWrapper.addEventListener('contextmenu', handleContextMenu);
    }
    
    return () => {
      if (excalidrawWrapper) {
        excalidrawWrapper.removeEventListener('contextmenu', handleContextMenu);
      }
    };
  }, [handleContextMenu]);

  return (
    <div className="excalidraw-wrapper" style={{ height: "100%", width: "100%", position: "relative" }}>
      <Excalidraw
        ref={excalidrawRef}
        initialData={{ 
          scrollToContent: true
        }}
        onChange={handleChange}
        viewModeEnabled={false}
        zenModeEnabled={false}
        gridModeEnabled={false}
      />
      <VersionInfo />
    </div>
  );
});

export default Whiteboard; 