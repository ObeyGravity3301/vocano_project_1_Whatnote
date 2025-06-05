# WhatNote 控制台系统完整指南

## 🎯 控制台系统概述

WhatNote控制台系统是一个创新的混合操作界面，同时支持：
- **精确的CLI指令操作** (90%识别准确率)
- **自然语言智能交互** (管家LLM理解)
- **Function Calling技术** (自动执行前端操作)

## 🚀 快速开始

### 打开控制台
- 按 **` ** (反引号) 键打开控制台
- 或在界面右下角点击控制台图标

### 基本使用模式

```bash
# 精确CLI指令 - 立即执行
pwd                           # 显示当前位置
course list                   # 列出所有课程

# 自然语言 - 智能理解
"请帮我创建一个机器学习的课程文件夹"
"我想查看当前系统状态"
```

## 📚 完整CLI指令参考

### 🗂️ 基础导航命令

```bash
# 显示当前工作目录
pwd

# 切换目录
cd /                          # 回到根目录
cd courses                    # 进入课程目录  
cd courses/机器学习            # 进入特定课程
cd boards/board-123           # 进入特定展板
cd ..                         # 返回上级目录

# 列出内容
ls                            # 列出当前目录内容
ls -l                         # 详细列表模式
ls -a                         # 显示所有内容（包括隐藏）
ls --type=pdf                 # 只显示PDF文件
ls boards --active            # 只显示活跃展板
```

### 📁 课程文件夹管理

```bash
# 创建课程
course create "机器学习"
course create "深度学习" --desc="AI课程"
course new "数据科学"         # create的别名

# 列出课程
course list                   # 列出所有课程
course ls                     # list的别名
course ls --sort=name         # 按名称排序
course ls --sort=date         # 按创建时间排序

# 重命名课程
course rename "旧名称" "新名称"
course mv "机器学习" "深度学习基础"

# 删除课程
course delete "课程名称"      
course rm "课程名称"          # delete的别名
course rm "课程名称" --force  # 强制删除

# 查看课程详情
course show "机器学习"
course info "机器学习"        # show的别名
```

### 🎯 展板管理

```bash
# 创建展板
board create "神经网络基础"
board create "CNN实验" --course="机器学习"
board new "RNN研究"           # create的别名

# 打开/切换展板
board open "神经网络基础"
board switch board-123        # 通过ID切换
board go "CNN基础"            # go别名

# 列出展板
board list                    # 列出所有展板
board ls --active             # 只显示活跃展板
board ls --course="机器学习"  # 显示特定课程的展板
board status                  # 显示展板状态

# 关闭/删除展板
board close                   # 关闭当前展板
board close "神经网络基础"    # 关闭指定展板
board delete "测试展板"       # 删除展板
board rm board-123 --force    # 强制删除
```

### 📄 PDF文件管理

```bash
# 上传PDF
pdf upload                    # 交互式上传
pdf upload "机器学习.pdf"     # 指定文件上传
pdf add "深度学习.pdf" --course="AI课程"

# 打开PDF
pdf open "机器学习.pdf"       # 在当前展板打开PDF
pdf show "深度学习.pdf" --page=5  # 打开并跳到第5页
pdf load "neural_networks.pdf"    # load别名

# PDF导航
pdf goto 10                   # 跳转到第10页
pdf next                      # 下一页
pdf prev                      # 上一页
pdf first                     # 第一页
pdf last                      # 最后一页
pdf page +5                   # 向后翻5页
pdf page -3                   # 向前翻3页

# 关闭PDF
pdf close                     # 关闭当前PDF
pdf close "机器学习.pdf"      # 关闭指定PDF
pdf closeall                  # 关闭所有PDF

# 列出PDF
pdf list                      # 列出当前展板的PDF
pdf ls --all                  # 列出所有PDF文件
pdf status                    # 显示PDF状态
```

### 📝 笔记与注释管理

```bash
# 生成笔记
note generate                 # 为当前PDF生成笔记
note gen --type=summary       # 生成摘要笔记
note gen --type=detailed      # 生成详细笔记
note gen --pages=1-10         # 为指定页面生成笔记
note create --manual          # 创建手动笔记

# 注释管理
note annotate                 # 为当前页生成注释
note annotate --vision        # 使用视觉识别生成注释
note annotate --style=keywords # 指定注释风格
note improve "增加更多例子"   # 改进当前注释

# 笔记操作
note show                     # 显示当前笔记
note edit                     # 编辑笔记
note save                     # 保存笔记
note export --format=md       # 导出为Markdown
note export --format=pdf      # 导出为PDF

# 展板笔记
board-note generate           # 生成展板笔记
board-note gen --comprehensive # 生成综合笔记
board-note show               # 显示展板笔记
board-note improve "增加联系分析"  # 改进展板笔记
```

### 🤖 专家系统交互

```bash
# 启动专家对话
expert start                  # 启动专家对话
expert chat "分析当前PDF内容" # 直接咨询
expert ask "什么是卷积神经网络？"  # 提问
expert mode intelligent       # 切换到智能模式
expert mode simple            # 切换到简单模式

# 专家任务
expert task generate-plan     # 生成学习计划
expert task analyze-structure # 分析文档结构
expert task --async generate-notes  # 异步生成笔记
expert status                 # 查看专家状态
```

### 🔧 系统管理

```bash
# 系统状态
status                        # 显示系统整体状态
status --verbose              # 详细状态信息
status api                    # 检查API状态
status --json                 # JSON格式输出

# 配置管理
config show                   # 显示当前配置
config set annotation.style keywords    # 设置注释风格
config set expert.mode intelligent      # 设置专家模式
config reset                  # 重置配置

# 帮助系统
help                          # 显示主要命令帮助
help course                   # 显示course命令帮助
help pdf --examples           # 显示PDF命令示例

# 搜索
find --name="*.pdf"           # 搜索PDF文件
find --type=board             # 搜索展板
find --content="机器学习"     # 内容搜索
find --recent                 # 最近使用的

# 历史记录
history                       # 显示命令历史
history --clear               # 清空历史
history 10                    # 显示最近10条
```

## 🎨 高级功能

### 管道操作
```bash
board ls | grep "学习"        # 搜索包含"学习"的展板
pdf ls | head -5              # 显示前5个PDF
course ls | sort              # 排序显示课程
```

### 别名系统
```bash
alias ll="ls -l"              # 创建别名
alias gs="status"             # 状态别名
alias gc="course create"      # 创建课程别名
```

### 批量操作
```bash
batch pdf upload *.pdf       # 批量上传PDF
batch note generate --all     # 为所有PDF生成笔记
batch board create --from-template  # 批量创建展板
```

## 📖 实际使用场景

### 场景1：创建新的学习项目
```bash
# 完整的项目创建流程
course create "机器学习进阶"
cd courses/机器学习进阶
board create "神经网络基础" --course="机器学习进阶"
cd boards/神经网络基础
pdf upload "deep_learning.pdf"
pdf open "deep_learning.pdf"
note generate --type=summary
```

### 场景2：快速查看和导航
```bash
# 快速了解系统状态
status
course ls
board ls --active

# 切换到特定工作区
cd boards/board-123
pdf status
note show
```

### 场景3：专家交互和内容生成
```bash
# 使用专家系统分析内容
expert start
expert chat "分析当前PDF的知识结构"
expert task generate-plan

# 生成和改进笔记
note annotate --vision
note improve "增加实践例子"
board-note generate --comprehensive
```

### 场景4：批量处理和自动化
```bash
# 批量处理多个PDF
find --type=pdf
batch note generate --all
batch note export --format=md

# 配置优化
config set annotation.style keywords
config set expert.mode intelligent
```

## 🔄 CLI与自然语言混合使用

### 精确操作 + 智能对话
```bash
# 1. 使用CLI精确导航
cd courses/机器学习
board open "神经网络基础"
pdf goto 15

# 2. 切换到自然语言深度交互
"请详细解释第15页的反向传播算法，并生成相关笔记"

# 3. 继续使用CLI进行后续操作
note save
note export --format=md
```

### 自然语言规划 + CLI执行
```bash
# 1. 自然语言制定计划
"帮我制定一个学习深度学习的计划，包括需要创建的课程结构"

# 2. 根据计划使用CLI精确执行
course create "深度学习基础"
course create "CNN专题"
course create "RNN应用"
board create "基础概念" --course="深度学习基础"
```

## ⚡ 性能优化技巧

### 1. 使用别名提高效率
```bash
alias gl="course ls"
alias bl="board ls"
alias pg="pdf goto"
alias ng="note generate"
```

### 2. 组合命令链
```bash
# 使用 && 连接多个命令
course create "新课程" && board create "第一章" && pdf upload "教材.pdf"
```

### 3. 批量操作模式
```bash
# 进入批量模式
batch mode on
pdf upload file1.pdf
pdf upload file2.pdf
note generate --all
batch mode off
```

## 🛠️ 故障排除

### 常见问题

1. **命令无法识别**
   ```bash
   help                      # 查看可用命令
   help <command>            # 查看特定命令帮助
   ```

2. **参数错误**
   ```bash
   # 检查命令格式
   help course               # 查看course命令用法
   ```

3. **文件路径问题**
   ```bash
   pwd                       # 确认当前位置
   ls                        # 查看可用内容
   ```

4. **权限或状态错误**
   ```bash
   status                    # 检查系统状态
   status api                # 检查API连接
   ```

### 调试模式
```bash
# 开启详细输出
config set debug.verbose true
status --verbose

# 查看执行历史
history
history --clear             # 清空历史重新开始
```

## 📊 系统监控

### 实时状态查看
```bash
status --verbose             # 详细系统状态
board status                 # 展板状态
pdf status                   # PDF状态
expert status                # 专家系统状态
```

### 性能监控
```bash
find --recent                # 最近操作
history 20                   # 最近20条命令
config show                  # 当前配置状态
```

---

## 🎯 总结

WhatNote控制台系统提供了革命性的人机交互体验：

### ✅ 核心优势
1. **双模式操作**: CLI精确控制 + 自然语言智能理解
2. **无缝集成**: 自动执行前端操作，无需手动点击
3. **高效灵活**: 支持批量操作、别名、管道等高级功能
4. **学习友好**: 经典CLI语法，熟悉的用户体验

### 🚀 使用建议
- **日常操作**: 使用CLI指令提高效率
- **复杂任务**: 结合自然语言和专家系统
- **批量处理**: 利用别名和批量命令
- **学习探索**: 善用help系统和自然语言询问

通过掌握这套控制台系统，您可以极大提升在WhatNote中的工作效率，实现真正的"指令即操作"的流畅体验！ 