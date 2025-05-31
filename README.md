# WhatNote - 智能学习助手

WhatNote是一个功能强大的智能学习助手，支持PDF文档管理、笔记生成、智能注释和专家LLM问答等功能。

## 🚀 快速开始

### 启动应用
```bash
# 方式1：使用批处理文件（推荐）
./启动WhatNote.bat

# 方式2：手动启动
python main.py
```

### 访问地址
- **前端界面**：http://localhost:8000
- **API文档**：http://localhost:8000/docs

---

## 📋 主要功能

### 🔧 核心功能
- **PDF文档管理**：上传、预览、分页浏览
- **智能注释生成**：AI驱动的页面内容注释
- **笔记自动生成**：基于PDF内容生成学习笔记
- **专家LLM问答**：支持多种AI模型的智能对话
- **课程文件管理**：分层级的课程和文件组织

### 🎯 高级功能
- **并发任务处理**：支持多任务并行执行
- **实时状态监控**：任务状态栏和进度追踪
- **智能上下文**：自动维护对话历史
- **MCP系统集成**：模型控制协议支持

---

## 🏗️ 系统架构

### 文件系统概念
- **课程文件夹（Course Folders）**：存储在 `app_state.json` 中的逻辑分组
- **展板（Boards）**：存储在 `app_state.json` 中的工作区概念
- **课程文件（Course Files）**：存储在课程文件夹中的逻辑文件条目

### 物理文件存储
- `uploads/` - 存储用户上传的原始PDF文件
- `pages/` - 存储PDF页面的提取内容（txt文件和png图像）
- `board_logs/` - 存储展板日志文件

---

## 📝 文件命名规范

> **⚠️ 重要**：为确保系统稳定运行，请严格遵循文件命名规范

### ID格式标准
```
时间戳格式：{类型}-{毫秒时间戳}-{随机后缀}
示例：course-1748134005312-868
```

### 主要ID类型
- **课程文件夹ID**：`course-{timestamp}-{random}`
- **展板ID**：`board-{timestamp}-{random}`
- **课程文件ID**：`file-{course_id}-{序号}`
- **任务ID**：`{task_type}_task_{timestamp}_{random_hex}`

### 文件存储规范
```
PDF文件：uploads/{原始文件名}
页面文字：pages/{原始文件名}_page_{页码}.txt
页面图像：pages/{原始文件名}_page_{页码}.png
展板日志：board_logs/{board_id}.json
```

**详细规范请参考**：[WHATNOTE_NAMING_CONVENTIONS.md](./WHATNOTE_NAMING_CONVENTIONS.md)

---

## 🛠️ 开发工具

### 命名一致性检查
```bash
# 检查和修复文件命名问题
python fix_naming_consistency.py
```

### 功能测试脚本
```bash
# 测试状态栏功能
python test_status_bar_undefined_fix.py

# 测试PDF文字提取
python test_pdf_text_extraction_fix.py

# 综合功能测试
python test_final_comprehensive_fix.py
```

---

## ⚙️ 配置要求

### 环境依赖
- **Python 3.8+**
- **Node.js 16+**（前端开发）
- **FastAPI**（后端框架）
- **React**（前端框架）

### API密钥配置
在 `.env` 文件中配置：
```env
DASHSCOPE_API_KEY=your_dashscope_key
QWEN_API_KEY=your_qwen_key
```

---

## 📚 使用指南

### 基础操作
1. **创建课程文件夹**：组织相关的学习材料
2. **上传PDF文件**：支持中文文件名和特殊字符
3. **生成智能注释**：AI分析页面内容并生成注释
4. **创建学习笔记**：基于文档内容生成结构化笔记
5. **专家LLM对话**：获得专业的学术解答

### 高级操作
- **展板管理**：创建专题工作区
- **并发任务**：同时处理多个生成任务
- **状态监控**：实时查看任务进度

---

## 🔧 故障排除

### 常见问题

#### 状态栏显示"undefined"
```bash
# 运行诊断脚本
python test_status_bar_undefined_fix.py

# 检查字段映射是否正确
# 前端期望：max_concurrent
# 后端返回：max_concurrent_tasks
```

#### PDF文字提取失败
```bash
# 检查文件路径和命名
python test_pdf_text_extraction_fix.py

# 确认文件格式：pages/{filename}_page_{number}.txt
```

#### 注释生成超时
- **现象**：长时间无响应
- **原因**：可能使用了图像识别而非文字提取
- **解决**：确保PDF文字提取正常工作

### 系统诊断
```bash
# 全面系统检查
python fix_naming_consistency.py

# 查看详细日志
tail -f logs/app.log
```

---

## 📖 相关文档

- [WHATNOTE_NAMING_CONVENTIONS.md](./WHATNOTE_NAMING_CONVENTIONS.md) - 文件命名规范
- [快速入门指南.md](./快速入门指南.md) - 新手使用指南
- [专家LLM使用指南.md](./专家LLM使用指南.md) - AI功能详解
- [WhatNote完整功能使用指南.md](./WhatNote完整功能使用指南.md) - 完整功能说明

---

## 🔄 版本历史

- **v2.1** (2025-05-31): 
  - ✅ 统一文件命名规范
  - ✅ 修复状态栏undefined问题
  - ✅ 优化PDF文字提取逻辑
  - ✅ 增强错误处理和日志

- **v2.0** (2025-05-30): 重大架构优化
- **v1.0** (2025-05-15): 初始版本发布

---

## 💡 开发建议

1. **修改代码前**：务必参考 `WHATNOTE_NAMING_CONVENTIONS.md`
2. **测试完整性**：运行相关测试脚本验证功能
3. **命名一致性**：定期运行 `fix_naming_consistency.py` 检查
4. **文档更新**：重要修改请更新相关文档

---

**📧 问题反馈**：如遇到问题，请先运行诊断脚本，并提供详细的错误日志。 