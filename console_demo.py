#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WhatNote 控制台功能演示脚本

展示通过反引号(`)呼出的控制台系统，以及管家LLM的function call功能
"""

import requests
import json
import time

def demonstrate_console_features():
    """演示控制台的各种功能"""
    base_url = "http://localhost:8000"
    
    print("=" * 60)
    print("🖥️  WhatNote 控制台系统演示")
    print("=" * 60)
    print()
    
    print("📋 功能概述:")
    print("• 通过 ` (反引号) 键呼出控制台")
    print("• 支持自然语言指令")
    print("• 管家LLM能够理解并执行function calls")
    print("• 实时状态监控")
    print()
    
    # 演示命令列表
    demo_commands = [
        {
            "title": "📚 文件管理",
            "commands": [
                "列出所有PDF文件",
                "创建一个新课程文件夹叫'AI基础'",
                "查看uploads目录的内容"
            ]
        },
        {
            "title": "🎯 展板操作", 
            "commands": [
                "显示所有展板信息",
                "为'AI基础'课程创建一个新展板",
                "查看展板的当前状态"
            ]
        },
        {
            "title": "🔧 系统管理",
            "commands": [
                "查看当前系统状态",
                "检查API配置",
                "显示内存使用情况"
            ]
        },
        {
            "title": "🤖 智能功能",
            "commands": [
                "帮我整理文件结构",
                "分析当前工作流程",
                "推荐下一步操作"
            ]
        }
    ]
    
    for category in demo_commands:
        print(f"\n{category['title']}")
        print("-" * 40)
        
        for i, command in enumerate(category['commands'], 1):
            print(f"\n{i}. 执行命令: '{command}'")
            
            try:
                response = requests.post(
                    f"{base_url}/butler/console",
                    json={"command": command},
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('status') == 'success':
                        response_data = result.get('result', {})
                        response_text = response_data.get('response', '')
                        
                        # 显示响应（限制长度）
                        if len(response_text) > 200:
                            print(f"   📝 管家回复: {response_text[:200]}...")
                        else:
                            print(f"   📝 管家回复: {response_text}")
                        
                        # 显示function calls
                        function_calls = response_data.get('function_calls', [])
                        if function_calls:
                            print(f"   🔧 执行了 {len(function_calls)} 个function calls")
                            for call in function_calls:
                                print(f"      - {call.get('function', 'unknown')}")
                        
                        # 显示多步操作状态
                        multi_step = response_data.get('multi_step_context')
                        if multi_step:
                            print(f"   🔄 多步操作: {multi_step.get('task', '未知任务')}")
                    else:
                        print(f"   ❌ 命令执行失败: {result.get('message', '未知错误')}")
                else:
                    print(f"   ❌ API调用失败: {response.status_code}")
                    
            except Exception as e:
                print(f"   ❌ 请求错误: {str(e)}")
            
            time.sleep(2)  # 避免请求过快
    
    # 显示系统状态
    print(f"\n{'=' * 60}")
    print("📊 当前系统状态")
    print("=" * 60)
    
    try:
        response = requests.get(f"{base_url}/butler/status", timeout=10)
        if response.status_code == 200:
            status = response.json()
            if status.get('status') == 'success':
                data = status['data']
                print(f"🔧 应用状态: {data.get('app_state', 'unknown')}")
                print(f"📋 活跃展板: {data.get('active_boards', 0)}")
                print(f"📄 文件数量: {data.get('file_count', 0)}")
                print(f"🔄 多步操作: {'进行中' if data.get('multi_step_active') else '无'}")
                print(f"🆔 会话ID: {data.get('session_id', 'unknown')}")
            else:
                print("❌ 获取状态失败")
        else:
            print(f"❌ 状态API调用失败: {response.status_code}")
    except Exception as e:
        print(f"❌ 状态获取错误: {str(e)}")
    
    print(f"\n{'=' * 60}")
    print("✅ 控制台功能演示完成！")
    print()
    print("💡 使用方法:")
    print("1. 在前端应用中按 ` (反引号) 键呼出控制台")
    print("2. 输入自然语言指令，如: '列出所有PDF文件'")
    print("3. 按 Enter 执行命令")
    print("4. 使用 ↑/↓ 箭头键浏览命令历史")
    print("5. 按 Escape 或再次按 ` 键关闭控制台")
    print("=" * 60)

if __name__ == "__main__":
    demonstrate_console_features() 