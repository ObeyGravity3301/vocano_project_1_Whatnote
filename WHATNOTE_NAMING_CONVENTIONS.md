# WhatNote 文件命名规范

> **重要提示**：此文档定义了WhatNote应用的标准文件命名规则。所有开发者在修改代码前必须阅读并遵循此规范，以避免文件路径和ID不匹配导致的系统错误。

## 📋 目录
1. [文件系统概念](#文件系统概念)
2. [ID命名规范](#id命名规范)
3. [文件存储规范](#文件存储规范)
4. [路径拼接规范](#路径拼接规范)
5. [前后端兼容性](#前后端兼容性)
6. [常见问题避免](#常见问题避免)

---

## 🏗️ 文件系统概念

### 虚拟概念（JSON数据）
- **课程文件夹（Course Folders）**：存储在 `app_state.json` 中的逻辑分组
- **展板（Boards）**：存储在 `app_state.json` 中的工作区概念
- **课程文件（Course Files）**：存储在课程文件夹中的逻辑文件条目

### 物理文件存储
- **uploads/**：存储用户上传的原始PDF文件
- **pages/**：存储PDF页面的提取内容（txt文件和png图像）
- **board_logs/**：存储展板日志文件

---

## 🆔 ID命名规范

### 时间戳格式
```
标准格式：{类型}-{毫秒时间戳}-{随机后缀}
示例：course-1748134005312-868
```

### ID类型定义

#### 课程文件夹ID
```
格式：course-{timestamp}-{random}
示例：course-1748134005312-868
用途：app_state.json中的course_folders[].id
```

#### 展板ID
```
格式：board-{timestamp}-{random}
示例：board-1748146372538-988
用途：app_state.json中的boards[].id，SimpleExpert实例标识
```

#### 课程文件ID
```
格式：file-{course_id}-{序号}
示例：file-course-1748134005312-868-1
用途：课程文件夹中的files[].id，前端展示和状态栏识别
```

#### 任务ID
```
格式：{task_type}_task_{timestamp}_{random_hex}
示例：generate_annotation_task_1748639683498_dda4
用途：SimpleExpert任务系统
```

---

## 📁 文件存储规范

### PDF文件存储
```
路径：uploads/{原始文件名}
示例：uploads/遗传学(2).pdf
规则：保持用户上传的原始文件名，支持中文和特殊字符
```

### PDF页面文字提取文件
```
路径：pages/{原始文件名}_page_{页码}.txt
示例：pages/遗传学(2).pdf_page_53.txt
规则：
- 直接使用PDF原始文件名（包含.pdf扩展名）
- 页码从1开始
- 编码：UTF-8
```

### PDF页面图像文件
```
路径：pages/{原始文件名}_page_{页码}.png
示例：pages/遗传学(2).pdf_page_53.png
规则：
- 直接使用PDF原始文件名（包含.pdf扩展名）
- 页码从1开始
- 格式：PNG，DPI=200
```

### 展板日志文件
```
路径：board_logs/{board_id}.json
示例：board_logs/board-1748146372538-988.json
规则：直接使用展板ID作为文件名
```

---

## 🔗 路径拼接规范

### 后端路径拼接（Python）
```python
# ✅ 正确方式
import os
page_file = os.path.join("pages", f"{filename}_page_{page_number}.txt")
pdf_path = os.path.join("uploads", filename)

# ❌ 错误方式 - 硬编码路径分隔符
page_file = f"pages/{filename}_page_{page_number}.txt"  # Windows上可能出错
```

### 前端API调用
```javascript
// ✅ 正确方式 - 使用encodeURIComponent处理特殊字符
const apiUrl = `/api/materials/${encodeURIComponent(filename)}/pages/${pageNumber}/raw-text`;

// ❌ 错误方式 - 直接拼接可能包含特殊字符的文件名
const apiUrl = `/api/materials/${filename}/pages/${pageNumber}/raw-text`;
```

---

## 🔄 前后端兼容性

### 状态栏API字段映射
```javascript
// 前端期望的字段
const frontendFields = {
  active_tasks: 0,           // 当前活跃任务数
  max_concurrent: 3          // 最大并发数
};

// 后端返回的字段
const backendFields = {
  active_tasks: 0,               // ✅ 字段一致
  max_concurrent_tasks: 3        // ❌ 需要映射到max_concurrent
};

// 字段映射代码
setTaskStatus({
  active_tasks: backendStatus.active_tasks || 0,
  max_concurrent: backendStatus.max_concurrent_tasks || 3  // 映射字段名
});
```

### Board ID在前后端的使用
```javascript
// 前端TaskStatusIndicator使用的boardId来源（优先级从高到低）
const boardId = currentExpertBoardId 
  || (currentFile ? currentFile.key : null)
  || null;

// currentFile.key的格式应该是课程文件ID
// 示例：file-course-1748134005312-868-1
```

---

## ⚠️ 常见问题避免

### 1. 文件名特殊字符处理
```python
# ✅ 正确：controller.py中已有的robust文件查找
def get_page_text(filename: str, page_number: int) -> str:
    page_file = os.path.join(PAGE_DIR, f"{filename}_page_{page_number}.txt")
    
    # 文件不存在时的fallback逻辑
    if not os.path.exists(page_file):
        # 搜索匹配的文件
        all_page_files = os.listdir(PAGE_DIR)
        possible_matches = [f for f in all_page_files if f.endswith(f"_page_{page_number}.txt")]
        # ... 进一步匹配逻辑
```

### 2. API端点URL编码
```python
# ✅ 正确：FastAPI会自动处理URL解码
@app.get('/materials/{filename}/pages/{page_number}/raw-text')
async def get_raw_page_text(filename: str, page_number: int):
    # filename会自动从URL解码，包括中文和特殊字符
    pass
```

### 3. 任务参数传递
```python
# ✅ 正确：SimpleExpert中的参数解析
if task.task_type == "generate_annotation":
    filename = task.params["filename"]      # 从params获取
    page_number = task.params["pageNumber"] # 注意大小写
    
# ❌ 错误：直接传递params对象
result = await self._generate_annotation_task(task.params)  # 类型不匹配
```

### 4. 前端文件名处理
```javascript
// ✅ 正确：处理包含特殊字符的文件名
const handleFileSelect = (fileInfo) => {
  // fileInfo.pdf_filename可能包含中文和特殊字符
  const safeFilename = encodeURIComponent(fileInfo.pdf_filename);
  const apiUrl = `/api/materials/${safeFilename}/pages`;
};
```

---

## 🛠️ 迁移和修复指导

### 现有代码需要检查的位置

1. **controller.py** - `get_page_text()` 函数的路径拼接
2. **simple_expert.py** - 任务参数解析和文件路径处理
3. **main.py** - API端点的URL参数处理
4. **frontend/App.js** - 文件名的URL编码
5. **TaskStatusIndicator.js** - 字段映射逻辑

### 测试验证清单

- [ ] PDF文件上传后能正确提取文字到pages目录
- [ ] 注释生成能找到对应的文字文件
- [ ] 状态栏显示正确的并发数（不是undefined）
- [ ] 包含中文和特殊字符的文件名能正常处理
- [ ] 前后端API调用能正确传递文件名

---

## 📅 版本历史

- **v1.0** (2025-05-31): 初始版本，定义基础命名规范
- **v1.1** (待定): 根据实际使用反馈优化规范

---

**⚠️ 重要提醒**：在修改任何涉及文件路径、ID生成或API参数的代码前，请务必参考此文档，确保遵循命名规范，避免引入新的兼容性问题。 