# WhatNote CLI 指令体系

## 🎯 设计理念

基于经典的Unix/Linux CLI设计理念，提供精确、可预测的操作指令。用户可以通过熟悉的命令行语法完成所有WhatNote操作。

## 📚 指令语法规范

### 基本语法
```bash
command [subcommand] [arguments] [options]
```

### 语法元素
- `command`: 主命令（如 cd, ls, create, delete）
- `subcommand`: 子命令（如 course, board, pdf）
- `arguments`: 参数（如 文件名、ID）
- `options`: 选项（如 -f, --force, --verbose）

## 🗂️ 导航与状态管理

### 工作目录概念
WhatNote CLI 采用类似文件系统的层级结构：
```
/ (根目录)
├── courses/          # 课程文件夹目录
│   ├── 机器学习/
│   └── 深度学习/
├── boards/           # 展板目录
│   ├── board-123/
│   └── board-456/
└── files/            # 文件目录
    ├── uploads/
    └── temp/
```

### 导航指令

#### `pwd` - 显示当前位置
```bash
pwd                   # 显示当前工作目录
# 输出: /boards/board-123
```

#### `cd` - 切换目录
```bash
cd /                  # 回到根目录
cd courses            # 进入课程目录
cd courses/机器学习    # 进入特定课程
cd boards/board-123   # 进入特定展板
cd ..                 # 返回上级目录
cd -                  # 返回前一个目录
```

#### `ls` - 列出内容
```bash
ls                    # 列出当前目录内容
ls -l                 # 详细列表模式
ls -a                 # 显示所有内容（包括隐藏）
ls courses            # 列出指定目录内容
ls boards --active    # 只显示活跃展板
ls files --type=pdf   # 只显示PDF文件
```

## 📁 课程文件夹管理

### `course` - 课程管理主命令

#### 创建课程文件夹
```bash
course create "机器学习"                    # 创建课程文件夹
course create "深度学习" --desc="AI课程"     # 带描述创建
course new "数据科学"                       # create的别名
```

#### 列出课程
```bash
course list                                 # 列出所有课程
course ls                                   # list的别名
course ls --sort=name                       # 按名称排序
course ls --sort=date                       # 按创建时间排序
```

#### 重命名课程
```bash
course rename "旧名称" "新名称"              # 重命名课程
course mv "机器学习" "深度学习基础"          # mv别名
```

#### 删除课程
```bash
course delete "课程名称"                    # 删除课程
course rm "课程名称"                        # rm别名  
course rm "课程名称" --force                # 强制删除
course rm "课程名称" -f                     # 强制删除简写
```

#### 查看课程详情
```bash
course show "机器学习"                      # 显示课程详情
course info "机器学习"                      # info别名
course ls "机器学习" --files                # 显示课程内文件
```

## 🎯 展板管理

### `board` - 展板管理主命令

#### 创建展板
```bash
board create "神经网络" --course="机器学习"  # 在指定课程下创建展板
board new "CNN基础"                         # 在当前课程下创建
board create "研究展板" --temp              # 创建临时展板
```

#### 打开/切换展板
```bash
board open "神经网络"                       # 打开展板
board switch board-123                      # 通过ID切换
board go "CNN基础"                          # go别名
cd boards/"神经网络"                        # 使用cd切换
```

#### 列出展板
```bash
board list                                  # 列出所有展板
board ls --active                           # 只显示活跃展板
board ls --course="机器学习"                # 显示特定课程的展板
board status                                # 显示展板状态
```

#### 关闭/删除展板
```bash
board close                                 # 关闭当前展板
board close "神经网络"                      # 关闭指定展板
board delete "测试展板"                     # 删除展板
board rm board-123 --force                 # 强制删除
```

## 📄 PDF文件管理

### `pdf` - PDF管理主命令

#### 上传PDF
```bash
pdf upload                                  # 交互式上传
pdf upload "机器学习.pdf"                  # 指定文件上传
pdf add "深度学习.pdf" --course="AI课程"    # 上传到指定课程
```

#### 打开PDF
```bash
pdf open "机器学习.pdf"                    # 在当前展板打开PDF
pdf show "深度学习.pdf" --page=5           # 打开并跳到第5页
pdf load "neural_networks.pdf"             # load别名
```

#### PDF导航
```bash
pdf goto 10                                # 跳转到第10页
pdf next                                   # 下一页
pdf prev                                   # 上一页
pdf first                                  # 第一页
pdf last                                   # 最后一页
pdf page +5                                # 向后翻5页
pdf page -3                                # 向前翻3页
```

#### 关闭PDF
```bash
pdf close                                  # 关闭当前PDF
pdf close "机器学习.pdf"                   # 关闭指定PDF
pdf closeall                               # 关闭所有PDF
```

#### 列出PDF
```bash
pdf list                                   # 列出当前展板的PDF
pdf ls --all                               # 列出所有PDF文件
pdf status                                 # 显示PDF状态
```

## 📝 笔记与注释管理

### `note` - 笔记管理主命令

#### 生成笔记
```bash
note generate                              # 为当前PDF生成笔记
note gen --type=summary                    # 生成摘要笔记
note gen --type=detailed                   # 生成详细笔记
note gen --pages=1-10                      # 为指定页面生成笔记
note create --manual                       # 创建手动笔记
```

#### 注释管理
```bash
note annotate                              # 为当前页生成注释
note annotate --vision                     # 使用视觉识别生成注释
note annotate --style=keywords             # 指定注释风格
note improve "增加更多例子"                # 改进当前注释
```

#### 笔记操作
```bash
note show                                  # 显示当前笔记
note edit                                  # 编辑笔记
note save                                  # 保存笔记
note export --format=md                    # 导出为Markdown
note export --format=pdf                   # 导出为PDF
```

### `board-note` - 展板笔记管理

#### 展板笔记操作
```bash
board-note generate                        # 生成展板笔记
board-note gen --comprehensive             # 生成综合笔记
board-note show                            # 显示展板笔记
board-note improve "增加联系分析"          # 改进展板笔记
```

## 🤖 专家系统交互

### `expert` - 专家LLM管理

#### 启动专家对话
```bash
expert start                               # 启动专家对话
expert chat "分析当前PDF内容"              # 直接咨询
expert ask "什么是卷积神经网络？"          # 提问
expert mode intelligent                    # 切换到智能模式
expert mode simple                         # 切换到简单模式
```

#### 专家任务
```bash
expert task generate-plan                  # 生成学习计划
expert task analyze-structure              # 分析文档结构
expert task --async generate-notes         # 异步生成笔记
expert status                              # 查看专家状态
```

## 🔧 系统管理

### `status` - 系统状态
```bash
status                                     # 显示系统整体状态
status --verbose                           # 详细状态信息
status api                                 # 检查API状态
status --json                              # JSON格式输出
```

### `config` - 配置管理
```bash
config show                                # 显示当前配置
config set annotation.style keywords       # 设置注释风格
config set expert.mode intelligent         # 设置专家模式
config reset                               # 重置配置
```

### `help` - 帮助系统
```bash
help                                       # 显示主要命令帮助
help course                                # 显示course命令帮助
help pdf --examples                        # 显示PDF命令示例
man course                                 # 详细手册（man别名）
```

## 🔍 搜索与过滤

### `find` - 搜索命令
```bash
find --name="*.pdf"                        # 搜索PDF文件
find --type=board                          # 搜索展板
find --content="机器学习"                  # 内容搜索
find --recent                              # 最近使用的
```

### `filter` - 过滤器
```bash
ls | filter --active                       # 管道过滤
board ls | filter --course="AI"            # 过滤特定课程的展板
```

## 📊 批量操作

### `batch` - 批量处理
```bash
batch pdf upload *.pdf                     # 批量上传PDF
batch note generate --all                  # 为所有PDF生成笔记
batch board create --from-template         # 批量创建展板
```

## 🔄 历史与撤销

### `history` - 命令历史
```bash
history                                    # 显示命令历史
history --clear                            # 清空历史
history 10                                 # 显示最近10条
!5                                         # 重复执行第5条命令
!!                                         # 重复上一条命令
```

### `undo` - 撤销操作
```bash
undo                                       # 撤销上一个操作
undo --list                                # 显示可撤销的操作
redo                                       # 重做操作
```

## 🎨 输出格式化

### 输出选项
```bash
--json                                     # JSON格式输出
--table                                    # 表格格式
--tree                                     # 树形格式
--quiet/-q                                 # 静默模式
--verbose/-v                               # 详细模式
--no-color                                 # 无颜色输出
```

## 🔀 管道与重定向

### 管道操作
```bash
board ls | grep "学习"                     # 搜索包含"学习"的展板
pdf ls | head -5                          # 显示前5个PDF
course ls | sort                          # 排序显示课程
```

### 别名系统
```bash
alias ll="ls -l"                          # 创建别名
alias gs="status"                         # 状态别名
alias gc="course create"                  # 创建课程别名
unalias ll                                # 删除别名
```

## 📖 实际使用示例

### 场景1：创建新的学习项目
```bash
# 1. 创建课程文件夹
course create "机器学习进阶"

# 2. 进入课程目录
cd courses/机器学习进阶

# 3. 创建展板
board create "神经网络基础" --course="机器学习进阶"

# 4. 切换到展板
cd boards/神经网络基础

# 5. 上传PDF
pdf upload "deep_learning.pdf"

# 6. 打开PDF并生成笔记
pdf open "deep_learning.pdf"
note generate --type=summary
```

### 场景2：快速操作流程
```bash
# 一键流程：创建→打开→生成笔记
course create "快速学习" && board create "测试" && pdf upload "test.pdf" && note generate
```

### 场景3：查看和管理现有内容
```bash
# 1. 查看整体状态
status

# 2. 列出所有课程
course ls

# 3. 查看特定课程的展板
board ls --course="机器学习"

# 4. 切换到展板并查看内容
cd boards/board-123
pdf status
note show
```

## 🚀 高级功能

### 脚本支持
```bash
# 创建脚本文件 setup.wn
#!/usr/bin/whatnote
course create "AI研究"
board create "实验1" --course="AI研究"
pdf upload "paper1.pdf"
note generate --async

# 执行脚本
whatnote run setup.wn
```

### 环境变量
```bash
export WHATNOTE_DEFAULT_COURSE="机器学习"
export WHATNOTE_NOTE_STYLE="detailed"
export WHATNOTE_EXPERT_MODE="intelligent"
```

---

这个CLI指令体系遵循经典的Unix/Linux命令行设计理念，具有以下优势：

1. **学习成本低**: 熟悉命令行的用户可以快速上手
2. **精确可控**: 每个操作都有明确的语法和参数
3. **可组合性**: 支持管道、别名、脚本等高级功能
4. **可扩展性**: 容易添加新命令和功能
5. **一致性**: 统一的语法规范，降低认知负担 