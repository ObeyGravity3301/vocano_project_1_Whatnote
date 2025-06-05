# WhatNote 完整控制台指令体系

## 🏠 根目录层级（whatnote/）

### 📋 列出和查看
```bash
ls                           # 列出课程文件夹和展板概览
ls -l                        # 详细列表：课程+展板+PDF统计
ls -a                        # 显示所有内容包括隐藏项
course list                  # 列出所有课程文件夹
course list -d               # 课程文件夹详细信息（展板数、PDF数、创建时间）
board list                   # 列出所有展板（跨课程）
board list -g                # 按课程分组显示展板
tree                         # 树形显示完整目录结构
```

### 📚 课程文件夹操作
```bash
course create "课程名"        # 创建课程文件夹
course delete "课程名"        # 删除课程文件夹
course rename "旧名" "新名"   # 重命名课程文件夹
course show "课程名"          # 显示课程详细信息
course copy "源课程" "新课程" # 复制课程文件夹
course backup "课程名"        # 备份课程
course export "课程名"        # 导出课程数据
```

### 🔍 搜索和查找
```bash
find "关键词"                # 全局搜索课程、展板、PDF
find -t course "关键词"      # 只搜索课程
find -t board "关键词"       # 只搜索展板
find -t pdf "关键词"         # 只搜索PDF
search content "内容"        # 搜索笔记和注释内容
```

### 📊 统计和信息
```bash
status                       # 系统状态概览
status -d                    # 详细系统状态
stats                        # 使用统计信息
quota                        # 存储空间使用情况
recent                       # 最近访问的项目
history                      # 操作历史记录
```

---

## 📚 课程文件夹层级（whatnote/课程名/）

### 📋 列出和查看
```bash
ls                           # 列出当前课程的展板
ls -l                        # 展板详细列表（PDF数、大小、修改时间）
ls -p                        # 同时显示每个展板的PDF列表
board list                   # 列出当前课程的展板
board list -d                # 展板详细信息
pdf list                     # 列出当前课程所有PDF（跨展板）
```

### 📋 展板操作
```bash
board create "展板名"        # 在当前课程创建展板
board delete "展板名"        # 删除指定展板
board rename "旧名" "新名"   # 重命名展板
board show "展板名"          # 显示展板详细信息
board copy "源展板" "新展板" # 复制展板
board move "展板名" "目标课程" # 移动展板到其他课程
board template "模板名"      # 从模板创建展板
```

### 📁 当前课程操作
```bash
pwd                          # 显示当前路径
rename "新课程名"            # 重命名当前课程
delete                       # 删除当前课程（需确认）
info                         # 显示当前课程信息
backup                       # 备份当前课程
export                       # 导出当前课程
```

### 📄 PDF批量操作
```bash
pdf upload "本地路径"        # 上传PDF到默认展板
pdf upload "本地路径" "展板名" # 上传PDF到指定展板
pdf import "文件夹路径"      # 批量导入PDF
pdf cleanup                  # 清理重复PDF文件
pdf organize                 # 智能整理PDF到展板
```

---

## 📋 展板层级（whatnote/课程名/展板名/）

### 📋 列出和查看
```bash
ls                           # 列出当前展板的PDF和窗口
ls -l                        # 详细列表（文件大小、页数、上传时间）
pdf list                     # 列出当前展板的PDF
pdf list -d                  # PDF详细信息
windows list                 # 列出所有窗口（文本框、图片框等）
layout                       # 显示展板布局信息
```

### 📋 展板操作
```bash
pwd                          # 显示当前路径
rename "新展板名"            # 重命名当前展板
delete                       # 删除当前展板（需确认）
info                         # 显示当前展板信息
copy "新展板名"              # 复制当前展板
backup                       # 备份当前展板
```

### 📄 PDF操作
```bash
pdf upload "本地路径"        # 上传PDF到当前展板
pdf delete "PDF名"           # 删除指定PDF
pdf rename "旧名" "新名"     # 重命名PDF
pdf show "PDF名"             # 显示PDF信息
pdf open "PDF名"             # 在界面中打开PDF
pdf close "PDF名"            # 关闭PDF窗口
```

### 📝 展板笔记
```bash
note generate                # 生成展板综合笔记
note show                    # 显示展板笔记
note edit                    # 编辑展板笔记
note export                  # 导出展板笔记
note improve "改进要求"      # 改进展板笔记
```

### 🖼️ 窗口和框架操作（预留）
```bash
window create text           # 新建文本框
window create image          # 新建图片框
window create video          # 新建视频框
window list                  # 列出所有窗口
window show "窗口ID"         # 显示窗口内容
window delete "窗口ID"       # 删除窗口
window move "窗口ID" x y     # 移动窗口位置
window resize "窗口ID" w h   # 调整窗口大小
```

---

## 📄 PDF层级（whatnote/课程名/展板名/PDF名）

### 📄 PDF信息和导航
```bash
pwd                          # 显示当前路径
info                         # 显示PDF基本信息
pages                        # 显示总页数
goto 页码                    # 跳转到指定页
next                         # 下一页
prev                         # 上一页
first                        # 跳转到第一页
last                         # 跳转到最后一页
```

### 📝 页面内容操作
```bash
page text                    # 获取当前页文字内容
page text 页码               # 获取指定页文字内容
page extract 页码            # 提取指定页的详细内容
page ocr 页码                # 对指定页进行OCR识别
page vision 页码             # 使用视觉模型分析页面
page reanalyze 页码          # 重新分析页面内容
```

### 🔍 注释操作
```bash
annotate                     # 为当前页生成注释
annotate 页码                # 为指定页生成注释
annotate 页码 "自定义要求"   # 带要求的注释生成
annotation show              # 显示当前页注释
annotation show 页码         # 显示指定页注释
annotation edit 页码         # 编辑指定页注释
annotation delete 页码       # 删除指定页注释
annotation improve 页码 "要求" # 改进指定页注释
annotation export            # 导出所有注释
```

### 📝 PDF笔记
```bash
note generate                # 生成整个PDF的笔记
note show                    # 显示PDF笔记
note edit                    # 编辑PDF笔记
note improve "改进要求"      # 改进PDF笔记
note export                  # 导出PDF笔记
note summary                 # 生成PDF摘要
```

### 📄 PDF文件操作
```bash
rename "新文件名"            # 重命名当前PDF
delete                       # 删除当前PDF（需确认）
copy "新名称"                # 复制PDF
move "目标展板"              # 移动PDF到其他展板
download                     # 下载PDF文件
properties                   # 显示PDF属性
```

### 🔍 搜索和分析
```bash
search "关键词"              # 在PDF中搜索文本
search page 页码 "关键词"    # 在指定页搜索
find similar                 # 查找相似内容
analyze structure            # 分析PDF结构
extract images               # 提取PDF中的图片
extract tables               # 提取PDF中的表格
```

---

## 🌐 通用命令（所有层级可用）

### 🧭 导航命令
```bash
cd 路径                      # 切换目录
cd ..                        # 返回上级目录
cd /                         # 返回根目录
cd ~                         # 返回根目录
back                         # 返回上次位置
forward                      # 前进到下次位置
```

### 📋 基础命令
```bash
help                         # 显示帮助信息
help 命令                    # 显示指定命令帮助
clear                        # 清空控制台
history                      # 命令历史记录
exit                         # 关闭控制台
version                      # 显示版本信息
```

### 🔧 系统命令
```bash
config show                  # 显示配置信息
config set 键 值             # 设置配置项
log show                     # 显示日志
log clear                    # 清空日志
cache clear                  # 清空缓存
refresh                      # 刷新数据
```

---

## 📝 使用示例

### 创建完整工作流
```bash
# 创建新课程
whatnote> course create "机器学习课程"
whatnote> cd "机器学习课程"

# 创建展板
whatnote/机器学习课程> board create "第一章 入门"
whatnote/机器学习课程> cd "第一章 入门"

# 上传PDF并操作
whatnote/机器学习课程/第一章 入门> pdf upload "/path/to/教材.pdf"
whatnote/机器学习课程/第一章 入门> cd "教材.pdf"

# PDF操作
whatnote/机器学习课程/第一章 入门/教材.pdf> goto 25
whatnote/机器学习课程/第一章 入门/教材.pdf> annotate "请详细解释这页的核心概念"
whatnote/机器学习课程/第一章 入门/教材.pdf> note generate
```

### 搜索和管理
```bash
# 全局搜索
whatnote> find "神经网络"
whatnote> search content "反向传播"

# 查看统计
whatnote> stats
whatnote> recent

# 备份和维护
whatnote> course backup "机器学习课程"
whatnote> pdf cleanup
``` 