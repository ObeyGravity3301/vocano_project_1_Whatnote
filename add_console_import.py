#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import chardet

# 检测文件编码
with open('frontend/src/App.js', 'rb') as f:
    raw_data = f.read()
    encoding = chardet.detect(raw_data)['encoding']
    print(f"检测到文件编码: {encoding}")

# 读取App.js文件
with open('frontend/src/App.js', 'r', encoding=encoding) as f:
    content = f.read()

# 在TaskList导入后添加Console导入
if 'import Console from "./components/Console"' not in content:
    # 找到TaskList导入行
    pattern = r'(import TaskList from "./components/TaskList";.*?\n)'
    replacement = r'\1import Console from "./components/Console"; // 导入控制台组件\n'
    content = re.sub(pattern, replacement, content)
    
    print("已添加Console导入")
else:
    print("Console导入已存在")

# 在pendingCommand状态后添加控制台状态
if 'consoleVisible' not in content:
    # 找到pendingCommand状态行
    pattern = r'(const \[pendingCommand, setPendingCommand\] = useState\(null\);\s*\n)'
    replacement = r'\1  \n  // 控制台相关状态\n  const [consoleVisible, setConsoleVisible] = useState(false);\n'
    content = re.sub(pattern, replacement, content)
    
    print("已添加控制台状态")
else:
    print("控制台状态已存在")

# 写回文件
with open('frontend/src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("修改完成") 