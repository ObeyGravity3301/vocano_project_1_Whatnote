# WhatNote应用LLM工具指令文档

## 管家LLM (Butler LLM) 可用命令

管家LLM是全局协调者，负责文件结构管理和跨展板操作。以下是管家LLM可以执行的命令类型：

### 1. 文件操作命令 (file_operation)

```json
{
  "type": "file_operation",
  "action": "create_course_folder",
  "params": {
    "folder_name": "课程名称"
  }
}
```

**支持的操作**:
- `create_course_folder`: 创建新的课程文件夹

### 2. 展板操作命令 (board_operation)

```json
{
  "type": "board_operation",
  "action": "create_board",
  "params": {
    "board_name": "展板名称",
    "course_folder": "所属课程"
  }
}
```

**支持的操作**:
- `create_board`: 创建新的展板
- `open_board`: 打开指定展板
- `close_board`: 关闭展板

### 3. 导航命令 (navigation)

```json
{
  "type": "navigation",
  "action": "goto_page",
  "params": {
    "page": 5
  }
}
```

**支持的操作**:
- `next_page`: 前进到下一页
- `prev_page`: 后退到上一页
- `goto_page`: 跳转到指定页码

### 4. 窗口命令 (window)

```json
{
  "type": "window",
  "action": "open_window",
  "params": {
    "type": "note"
  }
}
```

**支持的操作**:
- `open_window`: 打开指定类型的窗口
- `close_window`: 关闭指定类型的窗口
- `close_all`: 关闭所有窗口

**窗口类型**:
- `pdf`: PDF查看器
- `note`: AI笔记
- `annotation`: AI注释
- `answer`: AI问答
- `userNote`: 用户笔记
- `userPageNote`: 用户页面笔记

### 5. 内容生成命令 (content)

```json
{
  "type": "content",
  "action": "generate_note"
}
```

**支持的操作**:
- `generate_note`: 生成整本PDF的笔记
- `generate_annotation`: 生成当前页的注释
- `vision_annotate`: 使用视觉模型生成注释

### 6. 文件选择命令 (file)

```json
{
  "type": "file",
  "action": "select_pdf",
  "params": {
    "pdfId": "pdf-123"
  }
}
```

**支持的操作**:
- `select_pdf`: 选择指定的PDF文件
- `upload_pdf`: 打开上传PDF对话框

## 专家LLM (Expert LLM) 可用功能

专家LLM负责特定展板内的所有操作。以下是专家LLM提供的主要功能：

### 1. PDF分析

```
分析上传到展板的PDF内容，提取关键信息和结构。
```

### 2. 笔记生成

```
为展板内的PDF生成整体笔记或特定页面注释。
```

### 3. 问题回答

```
根据展板内容回答用户提问。
```

### 4. 笔记改进

```
根据用户要求完善或修改已有笔记内容。
```

### 5. 多步骤任务规划

```
规划和执行多步骤复杂任务。
```

## 前端右键菜单可用命令

以下是通过右键菜单触发的命令：

- `generate_page_note`: 生成当前页注释
- `generate_full_note`: 生成整本笔记
- `vision_analyze`: 使用视觉模型分析当前页
- `refresh_pdf`: 刷新PDF显示
- `copy_note`: 复制笔记内容
- `improve_note`: 完善笔记内容
- `copy_to_user_note`: 复制到用户笔记
- `add_course`: 添加新课程(尚未实现)
- `refresh_courses`: 刷新课程列表
- `upload_pdf`: 上传PDF文件
- `open_course_note`: 打开课程笔记
- `delete_course`: 删除课程
- `open_pdf`: 打开PDF文件
- `add_pdf_window`: 添加PDF窗口
- `delete_pdf`: 删除PDF文件
- `arrange_windows`: 整理窗口排列(尚未实现)
- `close_all_windows`: 关闭所有窗口
- `ask_expert_llm`: 向专家LLM提问
- `open_board_note`: 打开展板笔记
- `refresh_board`: 刷新展板

## 命令执行流程

1. LLM生成带有JSON命令的响应
2. 前端提取命令并显示确认对话框
3. 用户确认后，命令被发送到后端执行
4. 执行结果返回并显示状态反馈
5. 执行验证步骤确认操作是否成功

## 已知问题

- 添加新课程功能尚未完全实现，目前通过API可以创建但右键菜单的对应功能显示"即将推出"
- 部分高级功能如窗口自动排列尚未实现

## 功能扩展计划

- 支持更多文件类型：PPT、Word等
- 增强多模态分析能力
- 添加用户偏好设置
- 实现更多展板间协作功能 