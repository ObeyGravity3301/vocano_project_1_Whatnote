#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import os
import traceback

BASE_URL = "http://127.0.0.1:8000"

def test_api_response(url, description):
    """测试API响应"""
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ {description} - HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print(f"❌ {description} - 连接失败: {str(e)}")
        return None

def diagnose_backend_state():
    """诊断后端状态"""
    print("=" * 60)
    print("🔍 WhatNote 问题综合诊断")
    print("=" * 60)
    
    # 1. 检查应用状态
    print("\n1. 📊 检查应用状态...")
    app_state = test_api_response(f"{BASE_URL}/api/app-state", "应用状态")
    if app_state:
        print(f"✅ 课程文件夹数量: {len(app_state.get('course_folders', []))}")
        print(f"✅ 展板数量: {len(app_state.get('boards', []))}")
        
        print("\n📁 课程文件夹详情:")
        for i, course in enumerate(app_state.get('course_folders', []), 1):
            files_count = len(course.get('files', []))
            print(f"  {i}. {course.get('name', '未知')} (ID: {course.get('id', '未知')}) - {files_count} 个文件")
            for j, file_item in enumerate(course.get('files', []), 1):
                print(f"     {j}. {file_item.get('name', '未知')} (类型: {file_item.get('type', '未知')}, ID: {file_item.get('id', '未知')})")
        
        print("\n📋 展板详情:")
        for i, board in enumerate(app_state.get('boards', []), 1):
            print(f"  {i}. {board.get('name', '未知')} (ID: {board.get('id', '未知')}, 课程: {board.get('course_folder', '未知')})")
    
    # 2. 检查原始状态文件
    print("\n2. 📄 检查原始状态文件...")
    raw_state = test_api_response(f"{BASE_URL}/api/debug/app-state-raw", "原始状态文件")
    if raw_state and raw_state.get('file_exists'):
        parsed = raw_state.get('parsed_content', {})
        print(f"✅ 文件存在")
        print(f"✅ 原始课程数: {len(parsed.get('course_folders', []))}")
        print(f"✅ 原始展板数: {len(parsed.get('boards', []))}")
    else:
        print("❌ 状态文件不存在或无法读取")
    
    # 3. 测试展板删除
    print("\n3. 🗑️ 测试展板删除功能...")
    if app_state and app_state.get('boards'):
        test_board = app_state['boards'][0]
        test_board_id = test_board.get('id')
        print(f"🎯 测试删除展板: {test_board.get('name')} (ID: {test_board_id})")
        
        try:
            response = requests.delete(f"{BASE_URL}/api/boards/{test_board_id}")
            if response.status_code == 200:
                print("✅ 展板删除API调用成功")
                
                # 验证删除结果
                new_state = test_api_response(f"{BASE_URL}/api/app-state", "删除后状态")
                if new_state:
                    remaining_boards = [b for b in new_state.get('boards', []) if b.get('id') == test_board_id]
                    if not remaining_boards:
                        print("✅ 展板已从boards数组中删除")
                    else:
                        print("❌ 展板仍在boards数组中")
                        
                    # 检查是否从课程files中删除
                    found_in_files = False
                    for course in new_state.get('course_folders', []):
                        for file_item in course.get('files', []):
                            if file_item.get('id') == test_board_id:
                                found_in_files = True
                                break
                    
                    if not found_in_files:
                        print("✅ 展板已从课程files中删除")
                    else:
                        print("❌ 展板仍在某个课程的files中")
            else:
                print(f"❌ 展板删除失败: HTTP {response.status_code}")
                print(f"   错误信息: {response.text}")
        except Exception as e:
            print(f"❌ 展板删除测试失败: {str(e)}")
            traceback.print_exc()
    else:
        print("⚠️ 没有展板可供测试删除")
    
    # 4. 创建测试数据
    print("\n4. 🔧 创建测试数据...")
    try:
        # 创建测试课程
        course_data = {"name": "诊断测试课程"}
        response = requests.post(f"{BASE_URL}/api/courses", json=course_data)
        if response.status_code == 200:
            course_id = response.json().get('id')
            print(f"✅ 创建测试课程成功: {course_id}")
            
            # 创建测试展板
            board_data = {"name": "诊断测试展板", "course_folder": course_id}
            response = requests.post(f"{BASE_URL}/api/boards", json=board_data)
            if response.status_code == 200:
                board_id = response.json().get('id')
                print(f"✅ 创建测试展板成功: {board_id}")
                
                # 验证展板是否正确关联
                final_state = test_api_response(f"{BASE_URL}/api/app-state", "最终状态")
                if final_state:
                    # 检查展板是否在boards数组中
                    board_in_array = any(b.get('id') == board_id for b in final_state.get('boards', []))
                    print(f"✅ 展板在boards数组中: {board_in_array}")
                    
                    # 检查展板是否在课程files中
                    board_in_files = False
                    for course in final_state.get('course_folders', []):
                        if course.get('id') == course_id:
                            board_in_files = any(f.get('id') == board_id for f in course.get('files', []))
                            break
                    print(f"✅ 展板在课程files中: {board_in_files}")
                    
                    if board_in_array and board_in_files:
                        print("✅ 数据结构一致性检查通过")
                    else:
                        print("❌ 数据结构不一致!")
            else:
                print(f"❌ 创建测试展板失败: {response.text}")
        else:
            print(f"❌ 创建测试课程失败: {response.text}")
    except Exception as e:
        print(f"❌ 创建测试数据失败: {str(e)}")
    
    print("\n" + "=" * 60)
    print("🏁 诊断完成")
    print("=" * 60)

def test_specific_board_deletion(board_id):
    """测试特定展板的删除"""
    print(f"\n🎯 测试删除特定展板: {board_id}")
    
    try:
        # 先获取当前状态
        before_state = test_api_response(f"{BASE_URL}/api/app-state", "删除前状态")
        if not before_state:
            print("❌ 无法获取删除前状态")
            return
        
        before_boards = [b.get('id') for b in before_state.get('boards', [])]
        print(f"📊 删除前展板数量: {len(before_boards)}")
        
        if board_id not in before_boards:
            print(f"❌ 展板 {board_id} 不存在于当前状态中")
            return
        
        # 执行删除
        response = requests.delete(f"{BASE_URL}/api/boards/{board_id}")
        print(f"📞 删除API响应: HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ 删除失败: {response.text}")
            return
        
        # 检查删除后状态
        after_state = test_api_response(f"{BASE_URL}/api/app-state", "删除后状态")
        if not after_state:
            print("❌ 无法获取删除后状态")
            return
        
        after_boards = [b.get('id') for b in after_state.get('boards', [])]
        print(f"📊 删除后展板数量: {len(after_boards)}")
        
        if board_id in after_boards:
            print(f"❌ 展板 {board_id} 仍然存在于boards数组中")
        else:
            print(f"✅ 展板 {board_id} 已从boards数组中删除")
        
        # 检查是否从课程files中删除
        found_in_files = False
        for course in after_state.get('course_folders', []):
            for file_item in course.get('files', []):
                if file_item.get('id') == board_id:
                    found_in_files = True
                    print(f"❌ 展板 {board_id} 仍在课程 '{course.get('name')}' 的files中")
                    break
        
        if not found_in_files:
            print(f"✅ 展板 {board_id} 已从所有课程files中删除")
        
    except Exception as e:
        print(f"❌ 删除测试失败: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    diagnose_backend_state()
    
    # 如果用户指定了特定展板ID，则测试该展板的删除
    import sys
    if len(sys.argv) > 1:
        board_id = sys.argv[1]
        test_specific_board_deletion(board_id) 