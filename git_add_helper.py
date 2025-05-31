#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Git添加助手 - 帮助选择需要提交的文件
"""

import os
import subprocess

def run_git_command(cmd):
    """运行git命令"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8')
        return result.stdout.strip()
    except Exception as e:
        print(f"命令执行失败: {e}")
        return ""

def categorize_files():
    """分类未跟踪的文件"""
    
    # 获取所有未跟踪的文件
    untracked = run_git_command("git ls-files --others --exclude-standard")
    if not untracked:
        print("✅ 没有发现未跟踪的文件")
        return
    
    files = untracked.split('\n')
    
    # 分类
    core_files = []          # 核心代码文件
    config_files = []        # 配置文件
    doc_files = []          # 文档文件
    test_files = []         # 测试文件
    frontend_files = []     # 前端文件
    other_files = []        # 其他文件
    
    for file in files:
        if not file.strip():
            continue
            
        # 核心Python文件
        if file.endswith('.py') and not file.startswith('test_'):
            core_files.append(file)
        
        # 配置文件
        elif file in ['requirements.txt', 'package.json', 'package-lock.json', '.env.example', 'config.py']:
            config_files.append(file)
        
        # 前端文件（在frontend目录或主要的JS/HTML文件）
        elif ('frontend/' in file or file.endswith('.js') or file.endswith('.html') 
              or file.endswith('.css') or file.endswith('.ts') or file.endswith('.tsx')):
            frontend_files.append(file)
        
        # 文档文件
        elif file.endswith('.md') or file.endswith('.txt'):
            doc_files.append(file)
        
        # 测试文件
        elif file.startswith('test_') or '_test.' in file:
            test_files.append(file)
        
        # 其他
        else:
            other_files.append(file)
    
    return {
        'core': core_files,
        'config': config_files, 
        'frontend': frontend_files,
        'docs': doc_files,
        'tests': test_files,
        'others': other_files
    }

def suggest_git_add():
    """建议git add命令"""
    print("🔍 分析项目文件...")
    print("=" * 60)
    
    categories = categorize_files()
    if not categories:
        return
    
    print("📁 核心代码文件（强烈建议添加）:")
    if categories['core']:
        for file in categories['core']:
            print(f"   ✅ {file}")
        print(f"\n   命令: git add {' '.join(categories['core'])}")
    else:
        print("   ℹ️ 没有发现新的核心代码文件")
    
    print("\n⚙️ 配置文件（建议添加）:")
    if categories['config']:
        for file in categories['config']:
            print(f"   ✅ {file}")
        print(f"\n   命令: git add {' '.join(categories['config'])}")
    else:
        print("   ℹ️ 没有发现新的配置文件")
    
    print("\n🎨 前端文件（建议添加）:")
    if categories['frontend']:
        for file in categories['frontend']:
            print(f"   ✅ {file}")
        print(f"\n   命令: git add {' '.join(categories['frontend'])}")
    else:
        print("   ℹ️ 没有发现新的前端文件")
    
    print("\n📚 文档文件（可选添加）:")
    if categories['docs']:
        important_docs = ['README.md', 'CHANGELOG.md', '使用指南.md']
        for file in categories['docs']:
            is_important = any(doc in file for doc in important_docs)
            icon = "✅" if is_important else "📄"
            print(f"   {icon} {file}")
        print(f"\n   命令: git add {' '.join(categories['docs'])}")
    else:
        print("   ℹ️ 没有发现新的文档文件")
    
    print("\n🧪 测试文件（通常不添加）:")
    if categories['tests']:
        for file in categories['tests']:
            print(f"   ⚠️ {file}")
        print("   💡 测试文件已被.gitignore忽略，一般不需要提交")
    else:
        print("   ℹ️ 没有发现测试文件")
    
    print("\n🔧 其他文件:")
    if categories['others']:
        for file in categories['others']:
            print(f"   ❓ {file}")
    else:
        print("   ℹ️ 没有发现其他文件")
    
    # 提供综合建议
    print("\n" + "=" * 60)
    print("💡 综合建议:")
    
    all_important = []
    all_important.extend(categories['core'])
    all_important.extend(categories['config'])
    all_important.extend(categories['frontend'])
    
    # 只添加重要的文档
    important_docs = [f for f in categories['docs'] 
                     if any(doc in f for doc in ['README.md', 'CHANGELOG.md', '使用指南.md', '快速入门.md'])]
    all_important.extend(important_docs)
    
    if all_important:
        print("🚀 推荐一次性添加所有重要文件:")
        print(f"   git add {' '.join(all_important)}")
        
        print("\n📝 或者分步添加:")
        if categories['core']:
            print(f"   git add {' '.join(categories['core'])}  # 核心代码")
        if categories['config']:
            print(f"   git add {' '.join(categories['config'])}  # 配置文件")
        if categories['frontend']:
            print(f"   git add {' '.join(categories['frontend'])}  # 前端文件")
        if important_docs:
            print(f"   git add {' '.join(important_docs)}  # 重要文档")
    
    print("\n🔒 已忽略的文件类型:")
    print("   - 日志文件 (*.log, logs/, llm_logs/)")
    print("   - 临时文件 (temp/, uploads/, __pycache__/)")
    print("   - 测试文件 (test_*.py)")
    print("   - 环境变量 (.env)")
    print("   - Node模块 (node_modules/)")
    print("   - 应用状态 (app_state.json)")

if __name__ == "__main__":
    suggest_git_add() 