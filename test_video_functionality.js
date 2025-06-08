// 视频框功能测试脚本
// 在浏览器控制台中运行此脚本来测试视频框功能

console.log("🎬 开始视频框功能测试...");

// 1. 检查当前展板
const currentBoard = document.querySelector('.board-area[data-board-id]');
if (currentBoard) {
    const boardId = currentBoard.getAttribute('data-board-id');
    console.log(`📋 当前展板ID: ${boardId}`);
    
    // 2. 检查自定义窗口状态
    console.log("🪟 检查自定义窗口状态...");
    console.log("customWindows:", window.customWindows || "未定义");
    console.log("customWindowsVisible:", window.customWindowsVisible || "未定义");
    
    // 3. 检查视频窗口
    const videoWindows = document.querySelectorAll('.video-window');
    console.log(`🎬 找到 ${videoWindows.length} 个视频窗口`);
    
    videoWindows.forEach((videoWindow, index) => {
        const windowId = videoWindow.getAttribute('data-window-id');
        const windowType = videoWindow.getAttribute('data-window-type');
        const video = videoWindow.querySelector('video');
        
        console.log(`视频窗口 ${index + 1}:`, {
            windowId,
            windowType,
            hasVideo: !!video,
            videoSrc: video ? video.src : '无视频元素',
            videoContent: video ? (video.src.length > 50 ? video.src.substring(0, 50) + '...' : video.src) : '无'
        });
    });
    
    // 4. 手动触发窗口重新加载
    console.log("🔄 尝试手动重新加载窗口数据...");
    if (typeof loadCustomWindows === 'function') {
        loadCustomWindows(boardId);
        console.log("✅ 已触发窗口数据重新加载");
    } else {
        console.log("❌ loadCustomWindows 函数不可用");
    }
    
} else {
    console.log("❌ 未找到当前展板");
}

console.log("🎬 视频框功能测试完成");
