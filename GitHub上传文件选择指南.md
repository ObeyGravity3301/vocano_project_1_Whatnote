# WhatNote项目GitHub上传指南

## 🚀 应该上传的文件（核心代码）

### ✅ 核心Python文件
```
main.py                    # 主程序文件
controller.py              # 控制器模块
config.py                  # 配置模块
butler_llm.py              # 管家LLM模块
board_logger.py            # 展板日志模块
board_manager.py           # 展板管理器
llm_logger.py              # LLM日志模块
llm_agents.py              # LLM代理模块
expert_llm.py              # 专家LLM模块
intelligent_expert.py      # 智能专家模块
mcp_expert.py              # MCP专家模块
mcp_tools.py              # MCP工具模块
task_event_manager.py      # 任务事件管理器
conversation_manager.py    # 对话管理器
```

### ✅ 前端代码
```
frontend/
├── src/                   # React源码
├── public/                # 静态资源
├── package.json           # 依赖配置
├── .eslintrc.js          # ESLint配置
└── README.md             # 前端说明
```

### ✅ 配置和部署文件
```
requirements.txt           # Python依赖
package.json              # Node.js依赖（如果根目录有的话）
.env.example             # 环境变量示例
electron.js              # Electron配置
preload.js               # Electron预加载脚本
启动WhatNote.bat         # 启动脚本
```

### ✅ 文档文件
```
README.md                          # 项目说明
WHATNOTE_NAMING_CONVENTIONS.md     # 命名规范
MCP_SYSTEM_README.md              # MCP系统说明
RIGHT_CLICK_MENU_GUIDE.md         # 右键菜单指南
快速入门指南.md                     # 用户指南
WhatNote功能使用指南.md             # 功能说明
专家LLM使用指南.md                  # 专家系统说明
控制台系统使用指南.md                # 控制台指南
```

## ❌ 不应该上传的文件（已在.gitignore中）

### 🚫 备份和临时文件
```
main.py.backup_*          # 所有备份文件
*.backup                  # 备份文件
*_backup_*               # 备份文件
备份/                    # 备份目录
临时测试文件备份/          # 临时备份
whatnote_modified_files/  # 修改文件备份
```

### 🚫 用户数据和日志
```
board_logs/              # 展板日志
llm_logs/               # LLM日志
logs/                   # 应用日志
butler_log.json         # 管家日志
app_state.json          # 应用状态
board_data.json         # 展板数据
uploads/                # 用户上传文件
pages/                  # 页面文件
```

### 🚫 测试和调试文件
```
test_*.py               # 所有测试文件
*_test.py              # 测试文件
debug_*.py             # 调试文件
fix_*.py               # 修复脚本
check_*.py             # 检查脚本
complete_*.py          # 完整测试脚本
demo_*.py              # 演示脚本
frontend_debug.html    # 前端调试页面
test_frontend_*.html   # 前端测试页面
```

### 🚫 环境和缓存文件
```
.env                    # 环境变量（包含敏感信息）
__pycache__/           # Python缓存
node_modules/          # Node.js依赖
.vscode/               # VS Code配置
*.log                  # 日志文件
```

## 📋 上传前检查清单

### 1. 清理临时文件
```bash
# 删除所有备份文件
rm -f *.backup*
rm -f *_backup_*

# 清理Python缓存
find . -name "__pycache__" -type d -exec rm -rf {} +
find . -name "*.pyc" -delete

# 清理测试文件（可选）
rm -f test_*.py
rm -f debug_*.py
rm -f fix_*.py
```

### 2. 验证.gitignore文件
确保.gitignore包含以下关键条目：
```
# 备份文件
*backup*
*_backup_*
*.backup
*.bak

# 用户数据
uploads/
pages/
board_logs/
llm_logs/
logs/
app_state.json
butler_log.json

# 测试文件
test_*.py
debug_*.py
fix_*.py

# 环境文件
.env
```

### 3. 准备环境配置
确保.env.example文件包含所需的环境变量：
```
DASHSCOPE_API_KEY=your_dashscope_key_here
QWEN_API_KEY=your_qwen_key_here
QWEN_VL_API_KEY=your_qwen_vl_key_here
```

### 4. 更新README.md
确保README.md包含：
- 项目简介
- 安装说明
- 配置要求
- 使用指南
- API文档链接

## 🎯 推荐的上传结构

```
WhatNote/
├── README.md
├── requirements.txt
├── .env.example
├── .gitignore
├── main.py
├── controller.py
├── config.py
├── butler_llm.py
├── board_logger.py
├── board_manager.py
├── llm_logger.py
├── llm_agents.py
├── expert_llm.py
├── intelligent_expert.py
├── mcp_expert.py
├── mcp_tools.py
├── task_event_manager.py
├── conversation_manager.py
├── electron.js
├── preload.js
├── 启动WhatNote.bat
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── .eslintrc.js
│   └── README.md
└── docs/
    ├── WHATNOTE_NAMING_CONVENTIONS.md
    ├── MCP_SYSTEM_README.md
    ├── RIGHT_CLICK_MENU_GUIDE.md
    ├── 快速入门指南.md
    ├── WhatNote功能使用指南.md
    ├── 专家LLM使用指南.md
    └── 控制台系统使用指南.md
```

## 🚨 重要提醒

1. **敏感信息**：确保.env文件不会被上传
2. **用户数据**：不要上传任何用户的PDF文件或个人数据  
3. **API密钥**：只上传.env.example，不上传实际的API密钥
4. **文件大小**：GitHub有100MB单文件限制，检查大文件
5. **中文文件名**：确保中文文件名在GitHub上正常显示

## 📝 上传命令示例

```bash
# 1. 初始化Git仓库（如果还没有）
git init

# 2. 添加远程仓库
git remote add origin https://github.com/yourusername/whatnote.git

# 3. 添加文件
git add .

# 4. 提交
git commit -m "初始提交：WhatNote智能学习助手"

# 5. 推送到GitHub
git push -u origin main
```

## 🔧 如果已经有不需要的文件被提交

```bash
# 停止跟踪已经被Git跟踪的文件
git rm --cached app_state.json
git rm --cached butler_log.json
git rm -r --cached board_logs/
git rm -r --cached uploads/
git rm -r --cached pages/

# 提交更改
git commit -m "移除用户数据文件"

# 推送更改
git push
``` 