#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import time
import os
import asyncio
import websockets
from datetime import datetime

class WhatNoteDemo:
    """WhatNote功能演示脚本"""
    
    def __init__(self):
        self.base_url = "http://127.0.0.1:8000"
        self.ws_url = "ws://127.0.0.1:8000"
        self.demo_board_id = f"demo-board-{int(time.time())}"
        
    def print_step(self, step_num, title, description=""):
        """打印演示步骤"""
        print(f"\n{'='*60}")
        print(f"🎯 步骤 {step_num}: {title}")
        if description:
            print(f"📝 {description}")
        print(f"{'='*60}")
    
    def print_result(self, success, message):
        """打印结果"""
        status = "✅ 成功" if success else "❌ 失败"
        print(f"{status}: {message}")
    
    def check_server_health(self):
        """检查服务器健康状态"""
        self.print_step(1, "检查服务器状态", "验证WhatNote服务是否正常运行")
        
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.print_result(True, f"服务器运行正常 - {data['message']}")
                return True
            else:
                self.print_result(False, f"服务器响应异常: {response.status_code}")
                return False
        except Exception as e:
            self.print_result(False, f"无法连接到服务器: {str(e)}")
            print("\n💡 请确保已启动WhatNote服务:")
            print("   python main.py")
            print("   或双击 启动WhatNote.bat")
            return False
    
    def demo_api_config(self):
        """演示API配置检查"""
        self.print_step(2, "检查API配置", "验证通义千问API密钥配置")
        
        try:
            response = requests.get(f"{self.base_url}/api/check-config")
            if response.status_code == 200:
                config = response.json()
                qwen_configured = config.get('qwen_api_configured', False)
                qwen_vl_configured = config.get('qwen_vl_api_configured', False)
                
                self.print_result(qwen_configured, f"通义千问API: {'已配置' if qwen_configured else '未配置'}")
                self.print_result(qwen_vl_configured, f"通义千问视觉API: {'已配置' if qwen_vl_configured else '未配置'}")
                
                if not qwen_configured or not qwen_vl_configured:
                    print("\n💡 配置API密钥:")
                    print("   1. 编辑 .env 文件")
                    print("   2. 设置 QWEN_API_KEY 和 QWEN_VL_API_KEY")
                    print("   3. 重启服务")
                
                return qwen_configured and qwen_vl_configured
            else:
                self.print_result(False, "无法获取配置信息")
                return False
        except Exception as e:
            self.print_result(False, f"检查配置失败: {str(e)}")
            return False
    
    def demo_course_management(self):
        """演示课程管理功能"""
        self.print_step(3, "课程管理功能", "创建课程文件夹和展板")
        
        # 创建演示课程
        course_name = f"演示课程-{datetime.now().strftime('%H%M%S')}"
        try:
            response = requests.post(
                f"{self.base_url}/api/courses",
                json={"name": course_name}
            )
            if response.status_code == 200:
                course_data = response.json()
                course_id = course_data['id']
                self.print_result(True, f"创建课程成功: {course_name} (ID: {course_id})")
            else:
                self.print_result(False, f"创建课程失败: {response.status_code}")
                return False
        except Exception as e:
            self.print_result(False, f"创建课程异常: {str(e)}")
            return False
        
        # 创建演示展板
        board_name = f"演示展板-{datetime.now().strftime('%H%M%S')}"
        try:
            response = requests.post(
                f"{self.base_url}/api/boards",
                json={
                    "name": board_name,
                    "course_folder": course_name
                }
            )
            if response.status_code == 200:
                board_data = response.json()
                self.demo_board_id = board_data['id']
                self.print_result(True, f"创建展板成功: {board_name} (ID: {self.demo_board_id})")
                return True
            else:
                self.print_result(False, f"创建展板失败: {response.status_code}")
                return False
        except Exception as e:
            self.print_result(False, f"创建展板异常: {str(e)}")
            return False
    
    def demo_mcp_system(self):
        """演示MCP系统功能"""
        self.print_step(4, "MCP专家系统", "测试新的智能专家功能")
        
        # 获取系统统计
        try:
            response = requests.get(f"{self.base_url}/api/mcp/system-stats")
            if response.status_code == 200:
                stats = response.json()
                if stats['status'] == 'success':
                    data = stats['data']
                    print(f"📊 系统统计:")
                    print(f"   - 活跃专家: {data['active_experts']}")
                    print(f"   - 展板数量: {len(data['board_ids'])}")
                    print(f"   - 总对话数: {data['total_conversations']}")
                    self.print_result(True, "MCP系统统计获取成功")
                else:
                    self.print_result(False, f"系统统计错误: {stats.get('error', '未知错误')}")
            else:
                self.print_result(False, f"获取系统统计失败: {response.status_code}")
        except Exception as e:
            self.print_result(False, f"系统统计异常: {str(e)}")
        
        # 获取工具列表
        try:
            response = requests.get(f"{self.base_url}/api/mcp/tools/{self.demo_board_id}")
            if response.status_code == 200:
                tools_data = response.json()
                if tools_data['status'] == 'success':
                    tools = tools_data['data']['tools']
                    print(f"\n🛠️ 可用工具 ({len(tools)} 个):")
                    for tool_name, tool_info in tools.items():
                        print(f"   - {tool_name}: {tool_info['description']}")
                    self.print_result(True, f"工具列表获取成功，共 {len(tools)} 个工具")
                else:
                    self.print_result(False, f"工具列表错误: {tools_data.get('error', '未知错误')}")
            else:
                self.print_result(False, f"获取工具列表失败: {response.status_code}")
        except Exception as e:
            self.print_result(False, f"工具列表异常: {str(e)}")
    
    async def demo_websocket_chat(self):
        """演示WebSocket对话功能"""
        self.print_step(5, "WebSocket智能对话", "测试MCP专家实时对话功能")
        
        try:
            uri = f"{self.ws_url}/api/expert/stream"
            async with websockets.connect(uri) as websocket:
                # 发送测试查询
                test_query = {
                    "query": "你好，请介绍一下你的能力和可用的工具",
                    "board_id": self.demo_board_id
                }
                
                print(f"📤 发送查询: {test_query['query']}")
                await websocket.send(json.dumps(test_query))
                
                # 接收响应
                step_count = 0
                final_response = None
                tool_usage = {}
                
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=30)
                        data = json.loads(message)
                        
                        if "step" in data:
                            step_count += 1
                            print(f"🔧 [步骤 {step_count}] {data['step']}")
                        
                        elif "done" in data and data["done"]:
                            final_response = data.get("full_response", "")
                            mcp_mode = data.get("mcp_mode", False)
                            tool_usage = data.get("tool_usage", {})
                            
                            print(f"\n📝 最终回答:")
                            print(f"   {final_response[:200]}...")
                            if tool_usage:
                                print(f"\n🛠️ 工具使用统计: {tool_usage}")
                            
                            self.print_result(True, f"MCP对话完成 (MCP模式: {mcp_mode})")
                            break
                        
                        elif "error" in data:
                            self.print_result(False, f"对话错误: {data['error']}")
                            break
                            
                    except asyncio.TimeoutError:
                        self.print_result(False, "WebSocket响应超时")
                        break
                    except Exception as e:
                        self.print_result(False, f"WebSocket消息处理错误: {str(e)}")
                        break
                
                return final_response is not None
                
        except Exception as e:
            self.print_result(False, f"WebSocket连接错误: {str(e)}")
            return False
    
    def demo_board_info(self):
        """演示展板信息功能"""
        self.print_step(6, "展板信息管理", "获取和管理展板详细信息")
        
        try:
            response = requests.get(f"{self.base_url}/api/boards/{self.demo_board_id}")
            if response.status_code == 200:
                board_info = response.json()
                print(f"📋 展板信息:")
                print(f"   - ID: {board_info.get('id', 'N/A')}")
                print(f"   - 名称: {board_info.get('name', 'N/A')}")
                print(f"   - 状态: {board_info.get('state', 'N/A')}")
                print(f"   - PDF数量: {len(board_info.get('pdfs', []))}")
                print(f"   - 窗口数量: {len(board_info.get('windows', []))}")
                self.print_result(True, "展板信息获取成功")
                return True
            else:
                self.print_result(False, f"获取展板信息失败: {response.status_code}")
                return False
        except Exception as e:
            self.print_result(False, f"展板信息异常: {str(e)}")
            return False
    
    def demo_llm_logs(self):
        """演示LLM日志功能"""
        self.print_step(7, "LLM交互日志", "查看AI交互历史记录")
        
        try:
            response = requests.get(f"{self.base_url}/api/llm-logs/recent?limit=3")
            if response.status_code == 200:
                logs = response.json()
                print(f"📊 最近的LLM交互记录 ({len(logs)} 条):")
                for i, log in enumerate(logs[:3], 1):
                    timestamp = log.get('timestamp', 'N/A')
                    llm_type = log.get('llmType', 'N/A')
                    query_preview = log.get('query', '')[:50] + "..." if len(log.get('query', '')) > 50 else log.get('query', 'N/A')
                    print(f"   {i}. [{timestamp}] {llm_type}: {query_preview}")
                self.print_result(True, "LLM日志获取成功")
                return True
            else:
                self.print_result(False, f"获取LLM日志失败: {response.status_code}")
                return False
        except Exception as e:
            self.print_result(False, f"LLM日志异常: {str(e)}")
            return False
    
    def cleanup_demo_data(self):
        """清理演示数据"""
        self.print_step(8, "清理演示数据", "删除演示过程中创建的数据")
        
        # 清空MCP对话历史
        try:
            response = requests.post(f"{self.base_url}/api/mcp/expert/{self.demo_board_id}/clear")
            if response.status_code == 200:
                self.print_result(True, "MCP对话历史已清空")
            else:
                self.print_result(False, f"清空对话历史失败: {response.status_code}")
        except Exception as e:
            self.print_result(False, f"清空对话历史异常: {str(e)}")
        
        print("\n💡 演示完成！你可以:")
        print("   1. 访问主界面: http://127.0.0.1:8000/frontend_debug.html")
        print("   2. 访问MCP测试: http://127.0.0.1:8000/mcp_test_frontend.html")
        print("   3. 查看API文档: http://127.0.0.1:8000/docs")
    
    async def run_demo(self):
        """运行完整演示"""
        print("🚀 WhatNote 功能演示开始")
        print("=" * 60)
        
        # 检查服务器状态
        if not self.check_server_health():
            return
        
        # 检查API配置
        api_configured = self.demo_api_config()
        
        # 演示课程管理
        if not self.demo_course_management():
            return
        
        # 演示MCP系统
        self.demo_mcp_system()
        
        # 演示WebSocket对话（仅在API配置正确时）
        if api_configured:
            await self.demo_websocket_chat()
        else:
            print("\n⚠️ 跳过WebSocket对话演示（API未配置）")
        
        # 演示展板信息
        self.demo_board_info()
        
        # 演示LLM日志
        self.demo_llm_logs()
        
        # 清理演示数据
        self.cleanup_demo_data()
        
        print(f"\n🎉 演示完成！")
        print("=" * 60)

def main():
    """主函数"""
    print("WhatNote 功能演示脚本")
    print("=" * 60)
    print("此脚本将演示WhatNote的主要功能:")
    print("1. 服务器健康检查")
    print("2. API配置验证")
    print("3. 课程和展板管理")
    print("4. MCP专家系统")
    print("5. WebSocket实时对话")
    print("6. 展板信息管理")
    print("7. LLM交互日志")
    print("8. 数据清理")
    print("=" * 60)
    
    input("按回车键开始演示...")
    
    demo = WhatNoteDemo()
    asyncio.run(demo.run_demo())

if __name__ == "__main__":
    main() 