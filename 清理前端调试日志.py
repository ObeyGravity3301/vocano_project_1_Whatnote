#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理前端调试日志脚本
移除或简化前端JavaScript文件中的调试日志
"""

import os
import re
import glob

def clean_debug_logs(file_path):
    """清理单个文件的调试日志"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_lines = len(content.split('\n'))
        
        # 移除DEBUG相关的console.log
        content = re.sub(r'console\.log\([^)]*\[DEBUG\][^)]*\);\s*\n?', '', content)
        
        # 移除长的对象状态调试日志
        content = re.sub(r'console\.log\([^)]*状态[^)]*\{[^}]{100,}[^)]*\);\s*\n?', '', content)
        
        # 移除加载状态计算日志
        content = re.sub(r'console\.log\([^)]*加载状态计算[^)]*\);\s*\n?', '', content)
        
        # 移除组件渲染日志
        content = re.sub(r'console\.log\([^)]*组件渲染[^)]*\);\s*\n?', '', content)
        
        # 移除状态快照日志
        content = re.sub(r'console\.log\([^)]*状态快照[^)]*\);\s*\n?', '', content)
        
        new_lines = len(content.split('\n'))
        
        if original_lines != new_lines:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ 清理 {file_path}: 删除 {original_lines - new_lines} 行调试日志")
            return True
        else:
            print(f"ℹ️  {file_path}: 无需清理")
            return False
            
    except Exception as e:
        print(f"❌ 清理 {file_path} 失败: {str(e)}")
        return False

def main():
    """主函数"""
    print("🧹 开始清理前端调试日志...")
    
    # 要清理的文件模式
    patterns = [
        "frontend/src/**/*.js",
        "frontend/src/**/*.jsx", 
        "frontend/src/**/*.ts",
        "frontend/src/**/*.tsx"
    ]
    
    cleaned_files = 0
    total_files = 0
    
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        for file_path in files:
            total_files += 1
            if clean_debug_logs(file_path):
                cleaned_files += 1
    
    print(f"\n📊 清理完成!")
    print(f"   总文件数: {total_files}")
    print(f"   已清理文件: {cleaned_files}")
    print(f"   未变更文件: {total_files - cleaned_files}")

if __name__ == "__main__":
    main() 