# WhatNote 项目上下文

## 项目概述

WhatNote 是一个基于 React 前端和 FastAPI 后端的智能学习笔记应用。主要功能包括 PDF 阅读、AI 笔记生成、专家LLM智能问答和展板管理等。

## 🚨 关键修复阶段记录（2025年5月）

### 阶段1: 展板隔离问题修复

**问题描述：** 新创建的展板会自动包含之前其他展板的PDF文件，而不是空白状态。

**根本原因：** App.js中错误地将课程文件ID（如`file-course-9-1`）当作展板ID使用，导致：
- 课程文件ID被误认为展板ID
- 后端为虚假展板ID创建日志文件
- 这些日志包含之前的PDF使用数据
- 新展板显示旧PDF内容而非空白状态

**解决方案：**
1. **前端修复** (`frontend/src/App.js`)：
   - 添加课程文件到展板ID的映射系统
   - 实现`courseFileBoardMap`状态管理
   - 创建`getBoardIdForCourseFile`函数处理ID转换

2. **后端清理** (`board_isolation_fix.py`)：
   - 清理虚假展板ID的日志文件
   - 移除格式为`file-course-*`的展板日志

**验证结果：** 新创建展板正确显示空白状态（0个PDF，0个窗口）

### 阶段2: React Hooks错误修复

**问题描述：** 
```
ERROR [eslint] src\App.js Line 98:53: React Hook "useState" cannot be called at the top level
Warning: Invalid hook call. Hooks can only be called inside of the body of a function component
```

**根本原因：** `useState`调用和相关函数被错误地放置在App组件外部（第97-119行）

**解决方案：** 将以下内容移入App组件内部：
- `courseFileBoardMap`状态
- `getBoardIdForCourseFile`函数
- 所有相关的hooks调用

**技术要点：**
- React hooks必须在函数组件内部调用
- 状态管理函数必须在组件作用域内
- 正确的组件结构对React编译至关重要

### 阶段3: PDF尺寸响应问题修复

**问题描述：** PDF查看器窗口拖拽变大时，PDF内容显示范围在达到某个尺寸后就不再继续扩大。

**根本原因：** `PDFViewer.js`中硬编码了900像素的最大宽度限制：
```javascript
width={containerRef.current ? Math.min(containerRef.current.offsetWidth - 30, 900) : 800}
```

**解决方案：**

1. **动态容器宽度跟踪**：
   - 添加`containerWidth`状态
   - 使用`ResizeObserver` API监听容器大小变化
   - 添加窗口resize事件监听作为备选

2. **智能尺寸限制**：
   ```javascript
   const minWidth = 300;  // 最小宽度，确保可读性
   const maxWidth = 1200; // 最大宽度，避免过大
   newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
   ```

3. **CSS样式优化**：
   - 优化`.pdf-content`、`.pdf-document`、`.pdf-page`样式
   - 确保100%宽度响应性
   - 使用`!important`确保样式优先级

**技术特性：**
- 使用`ResizeObserver`进行高性能监听
- 100ms防抖机制避免频繁更新
- 完全响应式设计，支持300-1200像素范围

**文档记录：** 详细技术实现记录在`PDF尺寸响应修复总结.md`

## 最新功能更新（2024年）

### 🔧 调试面板请求体类型显示功能

**实现位置：** `frontend/src/components/LLMDebugPanel.js`

**功能描述：**
- 在LLM调试面板中显示详细的请求类型信息
- 支持以下请求类型的可视化标识：
  - 🟠 **流式** (stream) - WebSocket实时流式输出
  - 🟣 **图像** (vision) - 图像理解和分析
  - 🔵 **改进** (improve_annotation) - 注释改进功能
  - 🟡 **视觉识别** (vision_annotation) - 图像识别注释
  - 🔵 **智能** (intelligent) - 智能专家模式
  - ⚪ **普通** (normal) - 常规文本处理

**实现细节：**
```javascript
// LLM类型列渲染逻辑
render: (text, record) => {
  const llmType = text || 'unknown';
  const requestType = record.metadata?.requestType || 
                     record.metadata?.operation || 
                     (record.metadata?.streaming ? 'stream' : 'normal');
  
  return (
    <div>
      <Tag color={llmType === 'expert' ? 'blue' : 'green'}>
        {llmType === 'expert' ? '专家LLM' : '管家LLM'}
      </Tag>
      <br />
      <Tag size="small" color={/* 根据requestType设置颜色 */}>
        {/* 根据requestType显示中文标签 */}
      </Tag>
    </div>
  );
}
```

**日志记录增强：**
- 图像识别：`metadata.requestType = 'vision_annotation'`
- 改进注释：`metadata.requestType = 'improve_annotation'`
- 智能模式：`metadata.requestType = 'intelligent'`

### 🧠 专家LLM统一智能模式

**核心改进：** 所有专家LLM操作统一使用智能模式，并实时显示执行步骤

**后端实现：** `main.py` - `/api/expert/stream` WebSocket端点

**主要变化：**
```python
# 修改前：使用普通专家LLM
expert = get_expert_llm(board_id)
full_response = expert.stream_call_llm(query, callback)

# 修改后：使用智能专家系统
intelligent_expert = IntelligentExpert(board_id)
full_response = await intelligent_expert.process_query(query, status_callback)
```

**步骤显示功能：**
- WebSocket实时推送步骤进度
- 前端显示美观的步骤动画
- 支持以下步骤类型：
  - 🚀 启动智能专家分析系统
  - 🔍 开始分析查询
  - 🤔 多轮分析和信息收集
  - 🔧 调用工具（如list_board_files、get_pdf_page等）
  - ✅ 智能分析完成

**前端步骤处理：** `frontend/src/components/BoardExpertPanel.js`

```javascript
// WebSocket消息处理
if (data.step) {
  const stepMessage = {
    role: 'system',
    content: `🔧 [进度] ${data.step}`,
    isStep: true,
    timestamp: new Date().toISOString()
  };
  // 插入到消息列表
}
```

**CSS动画效果：** `frontend/src/components/NoteWindow.css`

```css
/* 脉冲动画 */
@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

/* 滑入动画 */
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
```

## 核心架构组件

### 后端架构

#### 1. 主应用 (`main.py`)
- **核心职责：** FastAPI应用入口，路由定义，WebSocket端点
- **重要端点：**
  - `/api/expert/stream` - 专家LLM智能WebSocket（🆕 统一智能模式）
  - `/api/materials/{filename}/pages/{page_number}/annotate` - 页面注释生成
  - `/api/expert/dynamic/*` - 动态任务管理系统

#### 2. 智能专家系统 (`intelligent_expert.py`)
- **核心功能：** Function Calling模式，多轮对话，工具调用
- **支持工具：**
  - `list_board_files` - 列出展板文件
  - `get_pdf_page` - 获取PDF页面内容
  - `get_pdf_info` - 获取PDF信息
  - `search_pdf_content` - 搜索PDF内容

#### 3. 专家LLM (`expert_llm.py`)
- **动态任务支持：** 支持vision_annotation和improve_annotation任务类型
- **并发管理：** 任务状态跟踪和超时处理

#### 4. 控制器 (`controller.py`)
- **页面处理：** PDF页面注释，图像识别结果保存

### 前端架构

#### 1. 主应用 (`frontend/src/App.js`)
- **图像识别：** `handleForceVisionAnnotate` - 使用动态任务API
- **改进注释：** `handleImproveAnnotation` - 参数顺序修复，请求体记录
- **日志记录：** 完整的LLM交互日志，包含请求体和元数据

#### 2. 专家LLM面板 (`frontend/src/components/BoardExpertPanel.js`)
- **步骤显示：** 实时WebSocket步骤消息处理
- **智能模式：** 统一使用智能分析，移除普通/智能模式切换
- **视觉效果：** 步骤进度动画，脉冲指示器

#### 3. 调试面板 (`frontend/src/components/LLMDebugPanel.js`)
- **请求类型显示：** 可视化标签系统
- **请求体详情：** JSON格式美化显示
- **响应内容：** Markdown渲染支持

## 重要注意事项与避免破坏功能的指南

### ⚠️ 关键文件修改注意事项

#### 1. 前端JavaScript文件格式
**问题：** JavaScript代码被压缩成一行导致语法错误

**解决方案：**
- 始终保持代码格式化，避免压缩成一行
- 使用适当的代码编辑器和格式化工具
- 修改JavaScript时检查语法正确性

**危险操作：**
```javascript
// ❌ 错误：压缩成一行
{title:'LLM类型',dataIndex:'llmType',render:(text,record)=>{const llmType=text||'unknown';return(<Tag>{llmType}</Tag>);},},

// ✅ 正确：格式化代码
{
  title: 'LLM类型',
  dataIndex: 'llmType',
  render: (text, record) => {
    const llmType = text || 'unknown';
    return <Tag>{llmType}</Tag>;
  },
},
```

#### 2. WebSocket端点修改
**关键文件：** `main.py` - `/api/expert/stream`

**注意事项：**
- 保持WebSocket消息格式一致性
- 确保步骤回调函数正确传递
- 维护智能专家系统的异步处理

**消息格式标准：**
```python
# 步骤进度消息
await websocket.send_json({
    "step": "🔧 执行步骤描述",
    "timestamp": time.time()
})

# 完成信号
await websocket.send_json({
    "done": True,
    "full_response": response,
    "intelligent_mode": True
})
```

#### 3. 日志记录系统
**关键文件：** `frontend/src/App.js`

**元数据格式要求：**
```javascript
metadata: {
  operation: 'improve_annotation',
  requestType: 'improve_annotation',  // 关键字段，用于调试面板显示
  streaming: false,
  taskBased: true,
  boardId: boardId  // 可选
}
```

### 🔄 功能测试验证

#### 1. 智能专家系统测试
**测试文件：** `test_intelligent_expert_steps.py`

**验证内容：**
- 步骤消息数量 ≥ 2
- 智能模式标识正确
- 工具调用步骤显示
- WebSocket消息格式

#### 2. 调试面板功能测试
**验证步骤：**
1. 执行各种LLM操作（图像识别、改进注释、智能问答）
2. 检查调试面板显示的请求类型标签
3. 验证请求体详情显示
4. 确认响应内容正确渲染

### 🚨 常见破坏性操作避免

#### 1. 不要修改核心消息格式
```javascript
// ❌ 错误：修改步骤消息结构
if (data.step_info) { // 不要改变字段名
  // ...
}

// ✅ 正确：保持现有结构
if (data.step) {
  // ...
}
```

#### 2. 不要移除必要的metadata字段
```javascript
// ❌ 错误：缺少requestType
metadata: {
  operation: 'improve_annotation'
  // 缺少 requestType 字段
}

// ✅ 正确：包含完整metadata
metadata: {
  operation: 'improve_annotation',
  requestType: 'improve_annotation',
  streaming: false,
  taskBased: true
}
```

#### 3. 不要破坏异步处理逻辑
```python
# ❌ 错误：移除异步支持
def process_query(self, query):  # 移除了async
    # ...

# ✅ 正确：保持异步处理
async def process_query(self, query, status_callback=None):
    # ...
```

### 🔧 调试技巧

#### 1. 前端调试
- 使用浏览器开发者工具检查WebSocket消息
- 查看LLM调试面板的日志记录
- 验证步骤动画是否正常显示

#### 2. 后端调试
- 检查日志文件中的智能专家系统输出
- 验证WebSocket连接状态
- 确认任务执行流程

#### 3. 集成测试
- 运行`test_intelligent_expert_steps.py`验证整体功能
- 检查前后端日志一致性
- 验证用户界面响应正确

## 技术栈详情

### 前端技术栈
- **React 18+** - 核心UI框架
- **Ant Design** - UI组件库
- **WebSocket** - 实时通信
- **React-Markdown** - Markdown渲染
- **Babel** - JavaScript编译器

### 后端技术栈
- **FastAPI** - Web框架
- **WebSocket** - 实时通信支持
- **OpenAI API** - LLM集成
- **PDF处理** - 文档解析
- **异步处理** - 并发任务管理

### 部署配置
- **开发环境：** npm start (前端) + python main.py (后端)
- **端口配置：** 前端3000，后端8000
- **API代理：** 前端请求代理到后端

## 项目文件结构

```
whatnote/
├── frontend/                         # React前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── LLMDebugPanel.js      # 🆕 调试面板（请求类型显示）
│   │   │   ├── BoardExpertPanel.js   # 🆕 专家面板（步骤显示）
│   │   │   ├── PDFViewer.js          # 🆕 PDF响应式显示组件
│   │   │   └── NoteWindow.css        # 🆕 步骤动画样式
│   │   └── App.js                    # 🆕 展板隔离修复，日志记录增强
├── main.py                           # 🆕 智能WebSocket端点
├── intelligent_expert.py            # 智能专家系统
├── expert_llm.py                     # 🆕 动态任务支持
├── controller.py                     # PDF处理和注释
├── board_isolation_fix.py            # 展板隔离问题修复脚本
├── board_logger.py                   # 展板日志管理
├── board_manager.py                  # 展板管理器
├── butler_llm.py                     # 管家LLM系统
├── conversation_manager.py           # 对话管理器
├── llm_agents.py                     # LLM代理系统
├── llm_logger.py                     # LLM日志记录
├── config.py                         # 配置管理
├── requirements.txt                  # Python依赖
├── package.json                      # Node.js依赖
├── CLAUDE_CONTEXT.md                 # 🆕 项目上下文文档
├── PDF尺寸响应修复总结.md            # 🆕 PDF修复技术文档
├── 临时测试文件备份/                 # 🆕 测试文件备份文件夹
│   ├── README.md                     # 备份说明文档
│   └── [82个测试和临时文件]          # 已移动的测试文件
├── test_intelligent_expert_steps.py # ✅ 保留：智能专家系统步骤验证
├── test_intelligent_expert.py       # ✅ 保留：智能专家系统基础测试
├── test_improve_annotation.py       # ✅ 保留：改进注释功能测试
├── test_frontend_performance.py     # ✅ 保留：前端性能测试
├── board_logs/                       # 展板日志目录
├── llm_logs/                         # LLM日志目录
├── uploads/                          # 上传文件目录
├── pages/                            # 页面文件目录
└── 各种修复总结文档.md               # 历史修复记录文档
```

## 🗂️ 项目文件清理说明（2025年5月25日）

### 清理目标
为了保持项目目录整洁，将82个临时测试文件和调试脚本移动到`临时测试文件备份/`文件夹中。

### 保留的重要测试文件
- `test_intelligent_expert_steps.py` - 智能专家系统步骤验证（核心功能测试）
- `test_intelligent_expert.py` - 智能专家系统基础测试
- `test_improve_annotation.py` - 改进注释功能测试
- `test_frontend_performance.py` - 前端性能测试

### 已备份的文件类型
1. **临时测试文件** - 各种`test_*.py`调试和验证脚本
2. **代码备份** - `temp_main.py`, `main_backup.py`, `controller_*.py`等
3. **修复脚本** - `fix_*.js`, `add_rename_api.py`等
4. **调试页面** - `test_rename_browser.html`等

### 恢复方法
如需恢复任何文件，可从`临时测试文件备份/`文件夹中复制回主目录。

## 开发最佳实践

### 1. 代码提交前检查
- [ ] JavaScript语法检查（避免压缩代码）
- [ ] WebSocket消息格式验证
- [ ] 元数据字段完整性
- [ ] 测试脚本执行通过

### 2. 功能扩展指南
- 新增请求类型时，同时更新LLMDebugPanel.js的颜色映射
- 新增步骤类型时，确保WebSocket消息格式一致
- 新增LLM操作时，记录完整的metadata信息

### 3. 性能优化注意
- WebSocket连接复用，避免频繁创建
- 长时间任务使用动态任务API
- 大文件处理使用流式处理

这份文档应该帮助后续开发者理解项目架构，避免破坏现有功能，并正确扩展新功能。 