#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
任务状态检查工具
"""

import requests
import json
import sys

def check_task_status(task_id):
    """检查特定任务的状态"""
    base_url = "http://127.0.0.1:8000"
    
    try:
        print(f"🔍 检查任务状态: {task_id}")
        
        response = requests.get(
            f"{base_url}/api/expert/dynamic/result/{task_id}",
            timeout=30  # 增加到30秒超时
        )
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 任务结果:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            
            status = result.get('status', 'unknown')
            if status == 'completed':
                print("\n🎉 任务已完成！")
                content = result.get('result', '')
                if content:
                    print(f"📝 内容预览: {content[:300]}...")
            elif status == 'running':
                print("\n⏳ 任务正在执行中...")
            elif status == 'failed':
                print("\n❌ 任务执行失败")
            else:
                print(f"\n❓ 任务状态: {status}")
                
        elif response.status_code == 404:
            print("❌ 任务不存在或结果尚未准备好")
        else:
            print(f"❌ 请求失败: {response.status_code}")
            print(f"响应内容: {response.text}")
            
    except Exception as e:
        print(f"❌ 检查失败: {e}")

def check_board_status(board_id):
    """检查展板的并发状态"""
    base_url = "http://127.0.0.1:8000"
    
    try:
        print(f"\n📊 检查展板并发状态: {board_id}")
        
        response = requests.get(
            f"{base_url}/api/expert/dynamic/concurrent-status/{board_id}",
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 并发状态:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"❌ 状态查询失败: {response.status_code}")
            print(f"响应内容: {response.text}")
            
    except Exception as e:
        print(f"❌ 状态查询失败: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        task_id = sys.argv[1]
        check_task_status(task_id)
        check_board_status("test-board-001")
    else:
        print("用法: python check_task_status.py <task_id>")
        print("示例: python check_task_status.py generate_board_note_task_1748836297336_7dbf") 