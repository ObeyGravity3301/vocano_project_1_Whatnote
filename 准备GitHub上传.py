#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
准备WhatNote项目用于GitHub上传
清理不必要的文件，检查必需的文件
"""

import os
import glob
import shutil
from pathlib import Path

def clean_backup_files():
    """清理备份文件"""
    print("🧹 清理备份文件...")
    
    # 清理模式
    patterns = [
        "*.backup*",
        "*_backup_*", 
        "main.py.backup_*",
        "app_state.json.backup*",
        "board_logs_backup_*"
    ]
    
    cleaned_count = 0
    for pattern in patterns:
        files = glob.glob(pattern)
        for file in files:
            try:
                if os.path.isfile(file):
                    os.remove(file)
                    print(f"  ✅ 删除备份文件: {file}")
                    cleaned_count += 1
                elif os.path.isdir(file):
                    shutil.rmtree(file)
                    print(f"  ✅ 删除备份目录: {file}")
                    cleaned_count += 1
            except Exception as e:
                print(f"  ❌ 删除失败: {file} - {e}")
    
    print(f"  📊 总共清理了 {cleaned_count} 个备份文件")

def clean_test_files():
    """清理测试文件"""
    print("\n🧪 清理测试和调试文件...")
    
    patterns = [
        "test_*.py",
        "debug_*.py", 
        "fix_*.py",
        "check_*.py",
        "complete_*.py",
        "quick_*.py",
        "demo_*.py",
        "comprehensive_fix.py",
        "final_fix.py"
    ]
    
    # 保留的重要文件
    keep_files = [
        "test_app.py",  # 如果有主要测试文件可以保留
    ]
    
    cleaned_count = 0
    for pattern in patterns:
        files = glob.glob(pattern)
        for file in files:
            if file not in keep_files:
                try:
                    os.remove(file)
                    print(f"  ✅ 删除测试文件: {file}")
                    cleaned_count += 1
                except Exception as e:
                    print(f"  ❌ 删除失败: {file} - {e}")
    
    print(f"  📊 总共清理了 {cleaned_count} 个测试文件")

def clean_cache_files():
    """清理缓存文件"""
    print("\n💾 清理缓存文件...")
    
    cleaned_count = 0
    
    # Python缓存
    for cache_dir in glob.glob("**/__pycache__", recursive=True):
        try:
            shutil.rmtree(cache_dir)
            print(f"  ✅ 删除Python缓存: {cache_dir}")
            cleaned_count += 1
        except Exception as e:
            print(f"  ❌ 删除失败: {cache_dir} - {e}")
    
    # .pyc文件
    for pyc_file in glob.glob("**/*.pyc", recursive=True):
        try:
            os.remove(pyc_file)
            print(f"  ✅ 删除pyc文件: {pyc_file}")
            cleaned_count += 1
        except Exception as e:
            print(f"  ❌ 删除失败: {pyc_file} - {e}")
    
    print(f"  📊 总共清理了 {cleaned_count} 个缓存文件")

def check_important_files():
    """检查重要文件是否存在"""
    print("\n📋 检查重要文件...")
    
    important_files = [
        "main.py",
        "controller.py", 
        "config.py",
        "butler_llm.py",
        "board_logger.py",
        "board_manager.py",
        "requirements.txt",
        "README.md",
        ".env.example",
        ".gitignore"
    ]
    
    missing_files = []
    for file in important_files:
        if os.path.exists(file):
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ 缺失: {file}")
            missing_files.append(file)
    
    if missing_files:
        print(f"\n⚠️  警告：缺失 {len(missing_files)} 个重要文件")
        return False
    else:
        print(f"\n✅ 所有重要文件都存在")
        return True

def check_env_example():
    """检查.env.example文件"""
    print("\n🔧 检查环境配置文件...")
    
    if os.path.exists(".env.example"):
        with open(".env.example", "r", encoding="utf-8") as f:
            content = f.read()
        
        required_keys = [
            "DASHSCOPE_API_KEY",
            "QWEN_API_KEY", 
            "QWEN_VL_API_KEY"
        ]
        
        missing_keys = []
        for key in required_keys:
            if key not in content:
                missing_keys.append(key)
        
        if missing_keys:
            print(f"  ⚠️  .env.example缺少配置项: {', '.join(missing_keys)}")
            return False
        else:
            print(f"  ✅ .env.example配置完整")
            return True
    else:
        print(f"  ❌ .env.example文件不存在")
        return False

def check_gitignore():
    """检查.gitignore文件"""
    print("\n📝 检查.gitignore文件...")
    
    if os.path.exists(".gitignore"):
        with open(".gitignore", "r", encoding="utf-8") as f:
            content = f.read()
        
        required_patterns = [
            ".env",
            "__pycache__/",
            "*.backup",
            "uploads/",
            "pages/",
            "board_logs/",
            "llm_logs/",
            "app_state.json",
            "test_*.py"
        ]
        
        missing_patterns = []
        for pattern in required_patterns:
            if pattern not in content:
                missing_patterns.append(pattern)
        
        if missing_patterns:
            print(f"  ⚠️  .gitignore缺少模式: {', '.join(missing_patterns)}")
            return False
        else:
            print(f"  ✅ .gitignore配置完整")
            return True
    else:
        print(f"  ❌ .gitignore文件不存在")
        return False

def get_project_stats():
    """获取项目统计信息"""
    print("\n📊 项目统计信息...")
    
    # 统计代码文件
    py_files = glob.glob("*.py")
    py_files = [f for f in py_files if not f.startswith("test_") and not f.startswith("debug_")]
    
    # 统计文档文件
    md_files = glob.glob("*.md")
    
    # 统计总文件大小
    total_size = 0
    for file in py_files + md_files:
        if os.path.exists(file):
            total_size += os.path.getsize(file)
    
    print(f"  📁 Python文件: {len(py_files)}个")
    print(f"  📄 文档文件: {len(md_files)}个") 
    print(f"  💾 总大小: {total_size / 1024 / 1024:.2f} MB")
    
    # 检查是否有大文件
    large_files = []
    for file in py_files + md_files:
        if os.path.exists(file):
            size = os.path.getsize(file)
            if size > 50 * 1024 * 1024:  # 50MB
                large_files.append((file, size))
    
    if large_files:
        print(f"  ⚠️  大文件（>50MB）:")
        for file, size in large_files:
            print(f"    - {file}: {size / 1024 / 1024:.2f} MB")

def main():
    """主函数"""
    print("🚀 准备WhatNote项目用于GitHub上传")
    print("=" * 50)
    
    # 清理文件
    clean_backup_files()
    clean_test_files()  
    clean_cache_files()
    
    print("\n" + "=" * 50)
    
    # 检查文件
    files_ok = check_important_files()
    env_ok = check_env_example()
    gitignore_ok = check_gitignore()
    
    # 项目统计
    get_project_stats()
    
    print("\n" + "=" * 50)
    
    if files_ok and env_ok and gitignore_ok:
        print("🎉 项目准备完成！可以上传到GitHub了")
        print("\n📋 下一步操作:")
        print("1. git add .")
        print("2. git commit -m '初始提交：WhatNote智能学习助手'")
        print("3. git remote add origin <your-github-repo-url>")
        print("4. git push -u origin main")
    else:
        print("❌ 项目准备未完成，请解决上述问题后再上传")
    
    print("\n📚 更多信息请查看: GitHub上传文件选择指南.md")

if __name__ == "__main__":
    main() 