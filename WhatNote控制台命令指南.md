 # WhatNote 控制台命令指南

## 📋 概述

WhatNote控制台系统提供了强大的命令行界面，让您可以通过简单的命令管理课程、展板、窗口和PDF文件。本指南包含所有可用命令的详细说明和使用示例。

---

## 🚀 基础命令

### help - 帮助系统
显示命令帮助信息
```bash
help                    # 显示所有可用命令
help <命令名>           # 显示特定命令的详细帮助
```

**示例：**
```bash
help                    # 显示完整命令列表
help cd                 # 显示cd命令的详细用法
help course             # 显示课程管理命令帮助
```

### ls - 列出目录内容
显示当前目录的内容
```bash
ls                      # 列出当前目录内容
```

**不同上下文下的行为：**
- **根目录**：显示所有课程文件夹和全局PDF文件
- **课程目录**：显示该课程下的所有展板
- **展板目录**：显示展板中的窗口和PDF文件

### cd - 切换目录
导航到不同的目录
```bash
cd <目录名>             # 进入指定目录
cd ..                   # 返回上级目录
cd /                    # 返回根目录
cd ~                    # 返回根目录
cd root                 # 返回根目录
```

**示例：**
```bash
cd 遗传学               # 进入"遗传学"课程
cd "数据结构与算法"     # 进入带空格的课程名（用引号）
cd 期末复习展板         # 进入指定展板
cd ..                   # 返回上级目录
```

### pwd - 显示当前路径
显示当前所在的路径
```bash
pwd                     # 显示当前路径
```

### clear - 清屏
清除控制台屏幕内容
```bash
clear                   # 清除屏幕
```

### status - 系统状态
显示WhatNote系统的状态信息
```bash
status                  # 显示基本状态信息
status -d               # 显示详细状态信息
status --detail         # 显示详细状态信息
```

### exit - 退出控制台
关闭控制台界面
```bash
exit                    # 退出控制台
```

---

## 📚 课程管理命令

### course list - 列出课程
显示所有课程文件夹
```bash
course list             # 列出所有课程
```

### course create - 创建课程
创建新的课程文件夹
```bash
course create <课程名>  # 创建新课程
```

**示例：**
```bash
course create 机器学习
course create "高等数学A"        # 带空格的名称用引号
```

### course delete - 删除课程
删除指定的课程文件夹（需要先删除课程下的所有展板）
```bash
course delete <课程名>  # 删除课程
```

**示例：**
```bash
course delete 机器学习
course delete "高等数学A"
```

### course rename - 重命名课程
重命名现有的课程文件夹
```bash
course rename <旧名称> <新名称>
```

**示例：**
```bash
course rename 机器学习 "机器学习基础"
course rename "高数A" "高等数学A"
```

### course show - 显示课程详情
显示指定课程的详细信息
```bash
course show <课程名>    # 显示课程详情
```

---

## 📋 展板管理命令

### board list - 列出展板
显示展板列表
```bash
board list              # 列出所有展板
board list <课程名>     # 列出指定课程的展板
```

### board create - 创建展板
在当前课程中创建新展板
```bash
board create <展板名>   # 在当前课程中创建展板
```

**示例：**
```bash
cd 遗传学               # 先进入课程
board create 期末复习   # 创建展板
board create "实验报告整理"
```

### board delete - 删除展板
删除指定的展板（会检查PDF文件依赖）
```bash
board delete <展板名>   # 删除展板
```

### board rename - 重命名展板
重命名现有的展板
```bash
board rename <旧名称> <新名称>
```

### board show - 显示展板详情
显示指定展板的详细信息
```bash
board show <展板名>     # 显示展板详情
```

---

## 🪟 窗口管理命令

### window list - 列出窗口
显示当前展板中的所有窗口
```bash
window list             # 列出当前展板的窗口
```

### window create - 创建窗口
在当前展板中创建新窗口
```bash
window create <类型> <标题> [内容]
```

**支持的窗口类型：**
- `text` - 文本窗口
- `image` - 图片窗口
- `note` - 笔记窗口

**示例：**
```bash
window create text "学习笔记"
window create text "重点总结" "这是窗口的初始内容"
window create image "实验截图"
```

### window write - 写入窗口内容
向指定窗口写入内容
```bash
window write <窗口ID> <内容>
```

**示例：**
```bash
window write 1234567890 "这是新的窗口内容"
window write 1234567890 "支持特殊字符：@#$%^&*()"
```

### window show - 显示窗口内容
显示指定窗口的详细内容
```bash
window show <窗口ID>    # 显示窗口内容
```

### window delete - 删除窗口
删除指定的窗口
```bash
window delete <窗口ID>  # 删除窗口
```

---

## 📄 PDF管理命令

### pdf list - 列出PDF文件
显示PDF文件列表
```bash
pdf list                # 列出当前上下文的PDF文件
```

### pdf delete - 删除PDF文件
删除指定的PDF文件
```bash
pdf delete <文件名>     # 删除PDF文件
```

**示例：**
```bash
pdf delete "机器学习教程.pdf"
```

---

## 🔍 搜索和查找命令

### find - 查找文件
在系统中查找文件和目录
```bash
find <关键词>           # 查找包含关键词的文件或目录
```

### search - 搜索内容
在内容中搜索关键词
```bash
search <关键词>         # 搜索内容
```

### tree - 显示目录树
显示目录结构树
```bash
tree                    # 显示完整的目录树结构
```

---

## 📊 系统信息命令

### stats - 统计信息
显示系统统计信息
```bash
stats                   # 显示统计信息
```

### recent - 最近活动
显示最近的活动记录
```bash
recent                  # 显示最近活动
```

### quota - 存储使用情况
显示存储空间使用情况
```bash
quota                   # 显示存储使用情况
```

### version - 版本信息
显示WhatNote版本信息
```bash
version                 # 显示版本信息
```

---

## ⚙️ 系统管理命令

### config - 配置管理
管理系统配置
```bash
config show             # 显示当前配置
config set <键> <值>    # 设置配置项
```

### log - 查看日志
显示系统日志
```bash
log                     # 显示最近的日志记录
```

### cache - 缓存管理
管理系统缓存
```bash
cache                   # 显示缓存状态
cache clear             # 清理缓存
```

### refresh - 刷新系统
刷新系统状态
```bash
refresh                 # 刷新系统状态
```

---

## 🎯 高级操作命令

### backup - 备份操作
创建数据备份
```bash
backup                  # 创建当前上下文的备份
```

### export - 导出数据
导出数据到文件
```bash
export                  # 导出当前上下文的数据
```

### copy - 复制操作
复制文件或目录
```bash
copy <源> <目标>        # 复制操作
```

### rename - 重命名操作
重命名文件或目录
```bash
rename <旧名> <新名>    # 重命名操作
```

### info - 显示信息
显示详细信息
```bash
info                    # 显示当前上下文的详细信息
```

---

## 📍 导航命令

### goto - 跳转到指定位置
快速跳转到指定的页面或位置
```bash
goto <目标>             # 跳转到指定位置
```

### next - 下一页
跳转到下一页（在PDF浏览时）
```bash
next                    # 下一页
```

### prev - 上一页
跳转到上一页（在PDF浏览时）
```bash
prev                    # 上一页
```

### first - 第一页
跳转到第一页
```bash
first                   # 第一页
```

### last - 最后一页
跳转到最后一页
```bash
last                    # 最后一页
```

### pages - 页面管理
显示或管理页面
```bash
pages                   # 显示页面信息
```

### page - 跳转到指定页面
跳转到指定页码
```bash
page <页码>             # 跳转到指定页面
```

---

## 📝 注释和标注命令

### annotate - 创建注释
为当前页面创建注释
```bash
annotate                # 为当前页面创建注释
```

### annotation - 管理注释
管理注释内容
```bash
annotation list         # 列出注释
annotation show <ID>    # 显示注释内容
```

---

## 💡 使用技巧

### 1. 命令自动补全
- 输入命令的前几个字母，系统会提供建议

### 2. 引号处理
- 包含空格的名称需要用引号包围
- 支持双引号和单引号
- 示例：`cd "数据结构与算法"`

### 3. 路径导航
- 使用 `pwd` 查看当前位置
- 使用 `cd ..` 返回上级目录
- 使用 `ls` 查看当前目录内容

### 4. 错误处理
- 命令错误时会显示具体的错误信息
- 找不到目标时会提供相似的建议

### 5. 上下文感知
- 命令行为会根据当前所在位置自动调整
- 在不同目录下，同一命令可能有不同的行为

---

## 🔧 故障排除

### 常见问题

1. **命令未找到**
   - 检查命令拼写
   - 使用 `help` 查看可用命令

2. **目录不存在**
   - 使用 `ls` 查看当前目录内容
   - 检查目录名称拼写和大小写

3. **权限问题**
   - 确保有足够的权限操作文件
   - 检查是否有依赖关系（如删除课程前需先删除展板）

4. **服务器连接问题**
   - 检查服务器是否正常运行
   - 重启服务器：停止当前服务器并运行 `python main.py`

---

## 📞 获取帮助

如果您需要更多帮助：

1. 使用 `help` 命令查看命令列表
2. 使用 `help <命令名>` 查看特定命令的详细说明
3. 使用 `status` 命令检查系统状态
4. 查看系统日志：`log`

---

*最后更新：2024年12月*