#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
检查API端点注册情况
"""

import requests
import json

def check_api_endpoints():
    """检查API端点是否正确注册"""
    
    try:
        # 获取OpenAPI规范
        response = requests.get("http://127.0.0.1:8000/openapi.json")
        if response.status_code == 200:
            openapi_doc = response.json()
            paths = openapi_doc.get("paths", {})
            
            print("🔍 检查API端点注册情况\n")
            
            # 查找annotation-style相关端点
            annotation_endpoints = []
            for path, methods in paths.items():
                if "annotation-style" in path:
                    annotation_endpoints.append((path, list(methods.keys())))
            
            if annotation_endpoints:
                print("✅ 找到注释风格相关端点：")
                for path, methods in annotation_endpoints:
                    print(f"   {path}: {methods}")
            else:
                print("❌ 未找到annotation-style相关端点")
                print("\n🔍 搜索包含'boards'的端点：")
                board_endpoints = []
                for path, methods in paths.items():
                    if "boards" in path:
                        board_endpoints.append((path, list(methods.keys())))
                
                if board_endpoints:
                    print("找到的boards相关端点：")
                    for path, methods in board_endpoints[:10]:  # 只显示前10个
                        print(f"   {path}: {methods}")
                    if len(board_endpoints) > 10:
                        print(f"   ... 还有 {len(board_endpoints) - 10} 个端点")
                else:
                    print("   未找到boards相关端点")
            
            print(f"\n📊 总计端点数: {len(paths)}")
            
        else:
            print(f"❌ 获取OpenAPI文档失败: {response.status_code}")
            
    except Exception as e:
        print(f"❌ 检查API端点时出错: {str(e)}")

if __name__ == "__main__":
    check_api_endpoints() 