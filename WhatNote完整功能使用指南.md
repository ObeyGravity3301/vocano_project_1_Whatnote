# WhatNote 完整功能使用指南

## 🎯 项目概述

WhatNote是一个基于React前端和FastAPI后端的智能学习笔记应用，集成了AI注释生成、专家LLM问答、展板管理等功能。

### 技术架构
- **前端**: React 18 + Ant Design + PDF.js + React-Markdown
- **后端**: FastAPI + PyMuPDF + OpenAI API
- **AI集成**: 通义千问API (文本+视觉)
- **特色功能**: MCP协议专家系统、实时WebSocket通信、并发任务处理

## 🚀 启动应用

### 方法一：一键启动（推荐）
```bash
# 双击启动脚本
启动WhatNote.bat
```

### 方法二：手动启动
```bash
# 1. 启动后端服务
python main.py

# 2. 启动前端（可选，如果需要开发模式）
cd frontend
npm start
```

### 访问地址
- **主界面**: `http://127.0.0.1:8000/frontend_debug.html`
- **React前端**: `http://127.0.0.1:3000` (开发模式)
- **MCP测试**: `http://127.0.0.1:8000/mcp_test_frontend.html`
- **API文档**: `http://127.0.0.1:8000/docs`

## 📱 界面布局详解

### 主界面结构
```
┌─────────────────────────────────────────────────────────────┐
│ 🏠 WhatNote | 🔍 搜索 | 💬 管家助手 | ⚙️ 设置 | 📊 状态    │
├─────────────────┬───────────────────────────────────────────┤
│   📁 课程管理    │           📋 展板工作区                    │
│                │                                          │
│ 📚 高等数学     │  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│   📄 第一章.pdf │  │ PDF窗口 │  │ 注释窗口 │  │ 笔记窗口 │   │
│   📄 第二章.pdf │  │         │  │         │  │         │   │
│                │  └─────────┘  └─────────┘  └─────────┘   │
│ 📚 线性代数     │                                          │
│   📄 矩阵.pdf   │  ┌─────────────────────────────────────┐ │
│                │  │        💬 专家助手面板              │ │
│ [+ 新建课程]    │  │ 输入框: 请解释第5页的核心概念        │ │
│ [📤 上传PDF]    │  │ [智能分析] [普通问答] [MCP模式]     │ │
│                │  └─────────────────────────────────────┘ │
└─────────────────┴───────────────────────────────────────────┤
│           📊 状态栏 | 🔧 工具栏 | 📈 任务监控               │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件说明

#### 1. CourseExplorer（课程管理器）
- **位置**: 左侧边栏
- **功能**: 管理课程文件夹和PDF文件
- **操作**: 创建课程、上传PDF、文件管理

#### 2. 展板工作区（主要内容区）
- **PDFViewer**: PDF阅读器窗口
- **NoteWindow**: 笔记编辑窗口  
- **DraggableWindow**: 可拖拽的窗口容器
- **UserNoteEditor**: 用户笔记编辑器

#### 3. BoardExpertPanel（专家助手面板）
- **位置**: 展板右下角
- **功能**: MCP专家系统交互
- **特色**: 实时WebSocket通信、工具调用

#### 4. ButlerPanel（管家助手面板）
- **位置**: 顶部工具栏
- **功能**: 全局文件管理和系统操作

## 📚 核心功能使用

### 1. 课程和文件管理

#### 创建课程文件夹
1. 点击左侧 **"+ 新建课程"** 按钮
2. 输入课程名称（如："高等数学"）
3. 系统自动创建课程文件夹和对应展板

#### 上传PDF文件
1. 选择课程文件夹
2. 点击 **"📤 上传PDF"** 按钮
3. 选择PDF文件上传
4. 系统自动处理：
   - PDF分页解析
   - 文本提取
   - 图像生成
   - 展板窗口创建

#### 文件操作
- **重命名**: 右键文件 → 重命名
- **删除**: 右键文件 → 删除
- **查看**: 双击文件打开

### 2. PDF阅读和注释

#### 打开PDF
1. 在课程管理器中双击PDF文件
2. PDF会在展板中以窗口形式打开
3. 支持多PDF同时打开

#### 生成AI注释
**自动注释**:
```
1. 在PDF窗口中浏览到目标页面
2. 点击页面下方的 "生成AI注释" 按钮
3. 系统调用通义千问API分析文本内容
4. 注释显示在右侧注释窗口
```

**视觉识别注释**:
```
1. 点击 "视觉识别注释" 按钮
2. 系统使用通义千问视觉API分析页面图像
3. 适用于包含图表、公式、图片的复杂页面
4. 生成更详细的视觉内容描述
```

**改进注释**:
```
1. 在已有注释基础上点击 "改进注释"
2. 输入改进要求（如："请详细解释公式推导"）
3. AI基于原注释和新要求生成优化内容
```

#### 页面导航
- **翻页**: 使用页面底部的翻页按钮
- **跳转**: 直接输入页码跳转
- **快捷键**: 
  - `←/→`: 上一页/下一页
  - `Ctrl+G`: 跳转到指定页面

### 3. 专家LLM智能问答

#### 使用MCP专家系统（推荐）
```
1. 在展板右下角找到 "专家助手" 面板
2. 输入问题，如：
   - "请总结这个PDF的主要内容"
   - "第5页的公式是什么意思？"
   - "帮我找到包含'微分'的页面"
3. 点击 "智能分析" 按钮
4. 系统会：
   - 自动分析展板内容
   - 调用相关MCP工具
   - 提供详细专业回答
```

#### MCP工具能力
- **ListBoardFilesTool**: 列出展板中的所有文件
- **GetPDFPageTool**: 获取PDF特定页面内容
- **SearchPDFContentTool**: 搜索PDF中的关键词
- **GetPDFInfoTool**: 获取PDF基本信息
- **CreateNoteTool**: 创建和保存笔记

#### 实时对话模式
```javascript
// WebSocket连接示例
const ws = new WebSocket('ws://127.0.0.1:8000/api/expert/stream');
ws.send(JSON.stringify({
    query: "请解释这个概念",
    board_id: "your-board-id"
}));
```

### 4. 管家LLM助手

#### 使用管家助手
1. 在顶部工具栏找到 **"💬 智能助手"** 输入框
2. 输入管理类问题：
   - "帮我整理课程文件"
   - "清理重复的PDF文件"
   - "创建新的学习计划"
3. 管家助手会分析文件结构并执行操作

#### 管家功能
- 文件管理和整理
- 课程结构优化
- 重复文件清理
- 系统状态监控

### 5. 窗口管理系统

#### 窗口类型
- **PDF窗口**: 显示PDF内容
- **注释窗口**: 显示AI生成的注释
- **笔记窗口**: 用户自定义笔记
- **问答窗口**: 专家LLM回答

#### 窗口操作
- **拖拽**: 拖动窗口标题栏移动位置
- **调整大小**: 拖动窗口边缘调整尺寸
- **置顶**: 点击窗口使其置于最前
- **关闭**: 点击窗口右上角的关闭按钮
- **最小化**: 双击标题栏最小化窗口

#### 窗口颜色系统
```javascript
// 每个PDF自动分配颜色
const PDF_COLORS = [
  '#1890ff', // 蓝色
  '#52c41a', // 绿色  
  '#722ed1', // 紫色
  '#fa8c16', // 橙色
  // ... 更多颜色
];
```

## 🔧 高级功能

### 1. 并发任务处理

#### 同时处理多个任务
```python
# 后端支持并发处理
@app.post('/api/expert/dynamic/submit')
async def submit_dynamic_task(request_data: dict):
    # 支持多个LLM实例并发运行
    pass
```

#### 任务状态监控
```bash
# 查看任务状态
curl http://127.0.0.1:8000/api/expert/dynamic/concurrent-status/board-id
```

### 2. 实时调试功能

#### LLM交互日志
```bash
# 查看最近的LLM交互
curl http://127.0.0.1:8000/api/llm-logs/recent
```

#### 系统健康检查
```bash
# 健康检查
curl http://127.0.0.1:8000/health
```

#### 前端调试面板
- 访问: `http://127.0.0.1:8000/frontend_debug.html`
- 功能: 测试API、查看状态、调试功能

### 3. 快捷键系统

#### 全局快捷键
```javascript
// KeyboardShortcuts组件定义的快捷键
const shortcuts = {
  'Ctrl+N': '新建展板',
  'Ctrl+U': '上传文件', 
  'Ctrl+S': '保存当前状态',
  'F5': '刷新展板内容',
  'Ctrl+F': '搜索功能',
  'Ctrl+E': '切换专家助手',
  'Ctrl+B': '切换管家助手'
};
```

#### PDF阅读快捷键
- `←/→`: 翻页
- `Ctrl+G`: 跳转页面
- `Ctrl+A`: 生成注释
- `Ctrl+V`: 视觉识别
- `Ctrl+I`: 改进注释

### 4. 右键菜单系统

#### PDF页面右键菜单
- 生成注释
- 视觉识别注释
- 改进注释
- 保存页面
- 导出图片

#### 文件右键菜单
- 重命名
- 删除
- 移动到其他课程
- 查看属性

## 📊 API接口说明

### 核心API端点

#### 文件管理
```python
POST /api/materials/upload          # 上传文件
GET  /api/materials/{filename}/pages # 获取页面列表
GET  /api/materials/{filename}/pages/{page}/image # 获取页面图片
```

#### 注释生成
```python
POST /api/materials/{filename}/pages/{page}/annotate # 生成注释
POST /api/materials/{filename}/pages/{page}/vision-annotate # 视觉注释
POST /api/materials/{filename}/pages/{page}/improve-annotation # 改进注释
```

#### 专家LLM
```python
POST /api/expert                    # 专家问答
WebSocket /api/expert/stream        # 实时对话
GET  /api/mcp/tools/{board_id}     # 获取MCP工具
```

#### 展板管理
```python
GET  /api/boards/list              # 获取展板列表
POST /api/boards                   # 创建展板
GET  /api/boards/{board_id}        # 获取展板信息
```

### WebSocket通信

#### 专家LLM流式对话
```javascript
const ws = new WebSocket('ws://127.0.0.1:8000/api/expert/stream');

// 发送消息
ws.send(JSON.stringify({
    query: "你的问题",
    board_id: "展板ID"
}));

// 接收响应
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.step) {
        console.log('步骤:', data.step);
    } else if (data.done) {
        console.log('完成:', data.full_response);
    }
};
```

## 🛠️ 故障排除

### 常见问题

#### 1. 服务启动失败
**症状**: 无法访问主界面
**解决**:
```bash
# 检查端口占用
netstat -ano | findstr :8000

# 检查Python环境
python --version
pip list | findstr fastapi

# 重新安装依赖
pip install -r requirements.txt
```

#### 2. API密钥未配置
**症状**: 无法生成注释，提示API错误
**解决**:
```bash
# 检查.env文件
cat .env

# 设置API密钥
QWEN_API_KEY=your_api_key
QWEN_VL_API_KEY=your_vision_api_key
```

#### 3. PDF上传失败
**症状**: 上传进度卡住或报错
**解决**:
- 检查文件大小（限制50MB）
- 确认文件格式为PDF
- 检查磁盘空间
- 查看后端日志

#### 4. 前端无法连接后端
**症状**: 界面显示连接错误
**解决**:
```javascript
// 检查API配置
const API_BASE_URL = 'http://127.0.0.1:8000';

// 测试连接
fetch('http://127.0.0.1:8000/health')
  .then(r => r.json())
  .then(console.log);
```

### 调试工具

#### 后端调试
```bash
# 查看实时日志
tail -f logs/app.log

# 检查API状态
curl http://127.0.0.1:8000/api/check-config

# 查看展板信息
curl http://127.0.0.1:8000/api/boards/list
```

#### 前端调试
```javascript
// 浏览器控制台
console.log('当前展板ID:', currentBoardId);

// 查看组件状态
React.DevTools

// 网络请求监控
Chrome DevTools → Network
```

## 🎯 最佳实践

### 1. 高效学习流程
```
1. 准备阶段
   ├── 创建课程文件夹
   ├── 上传所有相关PDF
   └── 配置API密钥

2. 学习阶段  
   ├── 为每个主题创建专门展板
   ├── 逐页生成AI注释
   ├── 使用专家LLM深入理解
   └── 记录个人笔记

3. 复习阶段
   ├── 使用搜索功能定位内容
   ├── 生成章节总结
   └── 创建知识图谱

4. 整理阶段
   ├── 用管家助手整理文件
   ├── 清理重复内容
   └── 导出重要笔记
```

### 2. 注释策略
| 页面类型 | 推荐方法 | 适用场景 |
|----------|----------|----------|
| 纯文字页面 | 自动注释 | 理论概念、定义 |
| 包含图表 | 视觉识别 | 图表、公式、图片 |
| 复杂概念 | 先生成后改进 | 需要深度解析的内容 |
| 练习题 | 专家助手 | 需要解题思路 |

### 3. 专家助手提问技巧
**优秀提问示例**:
- ✅ "请详细解释第5页的微分定义，并举个实际例子"
- ✅ "这个公式在什么情况下使用？有什么限制条件？"
- ✅ "帮我总结这一章的核心知识点，并列出重点公式"

**避免的提问方式**:
- ❌ "这是什么？"（太模糊）
- ❌ "帮我做作业"（缺乏具体指向）
- ❌ "解释一下"（没有明确对象）

### 4. 性能优化建议
- 合理控制同时打开的PDF数量（建议≤5个）
- 定期清理LLM日志和临时文件
- 使用并发功能时注意API调用频率限制
- 大文件上传时确保网络稳定

## 📈 系统监控

### 性能指标
```bash
# 查看系统统计
curl http://127.0.0.1:8000/api/mcp/system-stats

# 监控任务状态
curl http://127.0.0.1:8000/api/expert/dynamic/concurrent-status/board-id

# LLM使用统计
curl http://127.0.0.1:8000/api/llm-logs/recent?limit=10
```

### 资源使用
- **内存**: 建议8GB以上
- **存储**: PDF文件和日志需要足够空间
- **网络**: API调用需要稳定网络连接
- **CPU**: 并发处理时需要多核支持

## 🔮 未来功能预览

基于项目架构，以下功能正在开发中：
1. **Markdown实时编辑渲染**（类似Obsidian）
2. **语音输入和音频聊天**
3. **Excalidraw绘图标注**
4. **手机互联拍摄课件**
5. **联网搜索教程视频**
6. **UI样式自定义系统**

---

## 📞 获取帮助

### 文档资源
- **MCP系统**: 查看 `MCP_SYSTEM_README.md`
- **API文档**: 访问 `http://127.0.0.1:8000/docs`
- **更新日志**: 查看各种修复总结文档

### 调试信息
- **系统状态**: `http://127.0.0.1:8000/api/mcp/system-stats`
- **展板信息**: `http://127.0.0.1:8000/api/boards/list`
- **LLM日志**: `http://127.0.0.1:8000/api/llm-logs/recent`

记住：WhatNote是一个智能学习助手，善用AI功能可以大大提高学习效率！🎓 