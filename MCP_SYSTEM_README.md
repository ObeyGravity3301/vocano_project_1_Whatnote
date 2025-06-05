# WhatNote MCP专家系统

## 🎯 概述

WhatNote的MCP（Model Context Protocol）专家系统是一个全新的智能助手架构，基于标准化的工具调用协议，提供更强大、更灵活的PDF文档分析和学习辅助功能。

## 🏗️ 系统架构

### 核心组件

#### 1. MCP工具系统 (`mcp_tools.py`)
- **MCPTool基类**: 标准化的工具接口
- **MCPToolSchema**: 工具模式定义，支持OpenAI Function Calling格式
- **MCPToolResult**: 统一的工具执行结果格式
- **MCPToolRegistry**: 工具注册和管理中心

#### 2. MCP专家引擎 (`mcp_expert.py`)
- **MCPExpert**: 基于MCP协议的智能专家LLM
- **MCPExpertManager**: 专家实例管理器
- 支持多轮对话、工具调用、会话管理

#### 3. 集成API (`main.py`)
- WebSocket实时通信端点
- RESTful管理API
- 完整的日志记录系统

## 🛠️ 可用工具

### 1. 展板文件管理
- **list_board_files**: 列出展板上的所有PDF文件
- **get_pdf_info**: 获取PDF基本信息（页数、大小等）

### 2. PDF内容分析
- **get_pdf_page**: 获取PDF页面内容（原始文本或AI注释）
- **search_pdf_content**: 在PDF中搜索关键词

### 3. 笔记管理
- **create_note**: 创建和保存笔记

## 🚀 使用方式

### WebSocket实时对话

```javascript
// 连接MCP专家WebSocket
const ws = new WebSocket('ws://localhost:8000/api/expert/stream');

// 发送查询
ws.send(JSON.stringify({
    query: "请分析第5页的内容并总结要点",
    board_id: "your-board-id"
}));

// 接收响应
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.step) {
        console.log('步骤:', data.step);
    } else if (data.done) {
        console.log('完成:', data.full_response);
        console.log('工具使用:', data.tool_usage);
    }
};
```

### REST API管理

```bash
# 获取系统统计
curl http://localhost:8000/api/mcp/system-stats

# 获取工具列表
curl http://localhost:8000/api/mcp/tools/{board_id}

# 获取对话历史
curl http://localhost:8000/api/mcp/expert/{board_id}/conversation

# 清空对话历史
curl -X POST http://localhost:8000/api/mcp/expert/{board_id}/clear
```

## 🔧 技术特性

### 1. 标准化工具协议
- 基于MCP标准设计
- 支持OpenAI Function Calling格式
- 类型安全的参数验证

### 2. 智能工具调用
- 自动工具选择和参数推理
- 多轮工具调用支持
- 错误处理和重试机制

### 3. 会话管理
- 持久化对话历史
- 上下文窗口管理
- 工具使用统计

### 4. 性能优化
- 异步工具执行
- 超时控制
- 资源管理

## 📊 监控和调试

### 系统统计
```json
{
  "active_experts": 3,
  "board_ids": ["board-1", "board-2", "board-3"],
  "total_conversations": 15
}
```

### 工具使用统计
```json
{
  "list_board_files": 5,
  "get_pdf_page": 12,
  "search_pdf_content": 3
}
```

### 日志记录
- 完整的LLM交互日志
- 工具调用追踪
- 性能指标记录

## 🆚 与旧系统对比

| 特性 | 旧系统 | MCP系统 |
|------|--------|---------|
| 工具调用 | 手动解析 | 标准化协议 |
| 错误处理 | 基础 | 完善的错误恢复 |
| 扩展性 | 有限 | 高度可扩展 |
| 调试能力 | 基础 | 完整的监控体系 |
| 性能 | 一般 | 优化的异步处理 |

## 🔄 迁移指南

### 前端适配
现有的前端代码无需修改，MCP系统完全兼容现有的WebSocket接口：

```javascript
// 现有代码继续工作
const response = await fetch('/api/expert/stream', {
    method: 'POST',
    // ... 现有参数
});
```

### 新增功能
可以利用新的管理API获取更多信息：

```javascript
// 获取工具使用统计
const toolStats = await fetch(`/api/mcp/expert/${boardId}/conversation`);

// 获取可用工具列表
const tools = await fetch(`/api/mcp/tools/${boardId}`);
```

## 🧪 测试

运行测试脚本验证系统功能：

```bash
python test_mcp_system.py
```

测试内容包括：
- 工具注册和管理
- WebSocket通信
- 工具调用功能
- API端点验证

## 🔮 未来扩展

### 计划中的工具
- **web_search**: 联网搜索功能
- **file_operations**: 文件操作工具
- **note_export**: 笔记导出功能
- **collaboration**: 协作工具

### 架构改进
- 分布式工具注册
- 插件化工具系统
- 更智能的工具选择算法

## 📝 开发指南

### 添加新工具

1. 继承MCPTool基类：
```python
class MyCustomTool(MCPTool):
    def __init__(self):
        super().__init__("my_tool", "工具描述")
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            parameters={
                "param1": {"type": "string", "description": "参数描述"}
            },
            required=["param1"]
        )
    
    async def execute(self, **kwargs) -> MCPToolResult:
        # 实现工具逻辑
        return MCPToolResult(success=True, data="结果")
```

2. 注册到工具注册中心：
```python
registry.register_tool(MyCustomTool())
```

### 最佳实践
- 工具应该是幂等的
- 提供详细的错误信息
- 使用适当的超时设置
- 记录工具使用情况

## 🤝 贡献

欢迎贡献新的工具和改进！请遵循以下步骤：

1. Fork项目
2. 创建功能分支
3. 添加测试
4. 提交Pull Request

## 📄 许可证

本项目采用MIT许可证。 