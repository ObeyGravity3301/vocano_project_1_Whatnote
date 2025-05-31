#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import logging
import time
import uuid
from typing import Dict, List, Any, Optional, Callable, AsyncGenerator
from openai import OpenAI
from config import QWEN_API_KEY
from mcp_tools import MCPToolRegistry, MCPToolResult
from datetime import datetime

logger = logging.getLogger(__name__)

class MCPExpert:
    """简化的MCP专家LLM系统"""
    
    def __init__(self, board_id: str):
        self.board_id = board_id
        self.session_id = f"expert_{board_id}_{uuid.uuid4().hex[:8]}"
        
        # 初始化OpenAI客户端
        self.client = OpenAI(
            api_key=QWEN_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        
        # 工具注册中心
        self.tool_registry = MCPToolRegistry(board_id)
        
        # 对话历史
        self.conversation_history = []
        
        # 系统配置
        self.max_iterations = 6  # 最大工具调用轮数
        self.max_processing_time = 180  # 最大处理时间
        
        # 创建系统提示词
        self.system_prompt = self._create_system_prompt()
        
        logger.info(f"MCP专家系统已初始化: {self.session_id}")
    
    def _create_system_prompt(self) -> str:
        """创建系统提示词"""
        tools_description = self.tool_registry.get_tools_description()
        
        return f"""你是WhatNote智能学习助手的专家LLM，专门负责展板内的学习分析和内容生成工作。

## 🎯 核心身份
- **专业学习顾问**：帮助用户深度理解PDF学习材料
- **内容分析专家**：能够分析、总结、注释PDF内容  
- **智能工具调用者**：熟练使用各种工具完成复杂任务

## 🛠️ 可用工具
{tools_description}

## 📋 工作原则
1. **理解用户需求**：准确理解用户要什么
2. **选择合适工具**：根据需求选择最佳工具组合
3. **逐步执行**：按逻辑顺序调用工具
4. **整合结果**：将工具结果整理成有价值的回答
5. **提供建议**：给出下一步行动建议

## 🎯 主要任务
- 分析PDF文档内容和结构
- 生成和改进页面注释
- 创建学习笔记和总结
- 回答基于文档的问题
- 管理展板窗口和内容
- 搜索和定位关键信息

展板ID: {self.board_id}
请根据用户需求，智能地使用工具，提供专业的学习分析服务。"""

    async def process_query(self, user_query: str, status_callback: Optional[Callable] = None) -> str:
        """处理用户查询"""
        start_time = time.time()
        
        if status_callback:
            await status_callback("🚀 启动专家分析系统...")
        
        # 添加用户查询到对话历史
        self.conversation_history.append({
            "role": "user",
            "content": user_query
        })
        
        iteration = 0
        
        while iteration < self.max_iterations:
            # 检查超时
            if time.time() - start_time > self.max_processing_time:
                if status_callback:
                    await status_callback("⏰ 处理超时，返回当前结果")
                break
            
            iteration += 1
            
            if status_callback:
                await status_callback(f"🤔 第{iteration}轮分析...")
            
            # 构建消息列表
            messages = [{"role": "system", "content": self.system_prompt}]
            messages.extend(self.conversation_history)
            
            # 获取工具定义
            tools = self.tool_registry.get_openai_tools()
            
            try:
                # 调用LLM
                if tools:
                    response = self.client.chat.completions.create(
                        model="qwen-plus",
                        messages=messages,
                        tools=tools,
                        tool_choice="auto",
                        temperature=0.1,
                        max_tokens=3000,
                        timeout=90
                    )
                else:
                    response = self.client.chat.completions.create(
                        model="qwen-plus",
                        messages=messages,
                        temperature=0.1,
                        max_tokens=3000,
                        timeout=90
                    )
                
                message = response.choices[0].message
                
                # 检查是否有工具调用
                if message.tool_calls:
                    # 执行工具调用
                    for tool_call in message.tool_calls:
                        function_name = tool_call.function.name
                        function_args = json.loads(tool_call.function.arguments)
                        
                        if status_callback:
                            await status_callback(f"🔧 调用工具: {function_name}")
                        
                        # 执行工具
                        tool_result = await self.tool_registry.execute_tool(
                            function_name, **function_args
                        )
                        
                        # 添加工具调用到对话历史
                        self.conversation_history.append({
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [{
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": function_name,
                                    "arguments": tool_call.function.arguments
                                }
                            }]
                        })
                        
                        # 添加工具结果到对话历史
                        self.conversation_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(tool_result.to_dict(), ensure_ascii=False)
                        })
                    
                    # 继续下一轮分析
                    continue
                
                else:
                    # 没有工具调用，返回最终答案
                    final_answer = message.content
                    
                    # 添加到对话历史
                    self.conversation_history.append({
                        "role": "assistant",
                        "content": final_answer
                    })
                    
                    if status_callback:
                        await status_callback("✅ 分析完成")
                    
                    return final_answer
                    
            except Exception as e:
                logger.error(f"LLM调用失败: {str(e)}")
                if status_callback:
                    await status_callback(f"❌ 分析过程出错: {str(e)}")
                return f"抱歉，分析过程中出现错误：{str(e)}。请稍后重试。"
        
        # 达到最大迭代次数
        if status_callback:
            await status_callback("⚠️ 达到最大分析轮数")
        
        return "分析过程较为复杂，已达到最大处理轮数。如需更深入的分析，请将问题分解为更具体的子问题。"
    
    async def process_query_stream(self, user_query: str) -> AsyncGenerator[str, None]:
        """流式处理用户查询"""
        start_time = time.time()
        
        yield "🚀 启动专家分析系统...\n\n"
        
        # 添加用户查询到对话历史
        self.conversation_history.append({
            "role": "user",
            "content": user_query
        })
        
        iteration = 0
        
        while iteration < self.max_iterations:
            # 检查超时
            if time.time() - start_time > self.max_processing_time:
                yield "⏰ 处理超时，返回当前结果\n"
                break
            
            iteration += 1
            yield f"🤔 第{iteration}轮分析...\n"
            
            # 构建消息列表
            messages = [{"role": "system", "content": self.system_prompt}]
            messages.extend(self.conversation_history)
            
            # 获取工具定义
            tools = self.tool_registry.get_openai_tools()
            
            try:
                # 调用LLM
                if tools:
                    response = self.client.chat.completions.create(
                        model="qwen-plus",
                        messages=messages,
                        tools=tools,
                        tool_choice="auto",
                        temperature=0.1,
                        max_tokens=3000,
                        timeout=90,
                        stream=True
                    )
                else:
                    response = self.client.chat.completions.create(
                        model="qwen-plus",
                        messages=messages,
                        temperature=0.1,
                        max_tokens=3000,
                        timeout=90,
                        stream=True
                    )
                
                # 处理流式响应
                accumulated_content = ""
                tool_calls_buffer = []
                
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        accumulated_content += content
                        yield content
                    
                    if chunk.choices[0].delta.tool_calls:
                        tool_calls_buffer.extend(chunk.choices[0].delta.tool_calls)
                
                # 处理工具调用
                if tool_calls_buffer:
                    yield "\n\n"
                    for tool_call in tool_calls_buffer:
                        if tool_call.function:
                            function_name = tool_call.function.name
                            function_args = json.loads(tool_call.function.arguments)
                            
                            yield f"🔧 调用工具: {function_name}\n"
                            
                            # 执行工具
                            tool_result = await self.tool_registry.execute_tool(
                                function_name, **function_args
                            )
                            
                            # 添加工具调用到对话历史
                            self.conversation_history.append({
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [{
                                    "id": tool_call.id,
                                    "type": "function",
                                    "function": {
                                        "name": function_name,
                                        "arguments": tool_call.function.arguments
                                    }
                                }]
                            })
                            
                            # 添加工具结果到对话历史
                            self.conversation_history.append({
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "content": json.dumps(tool_result.to_dict(), ensure_ascii=False)
                            })
                    
                    yield "\n"
                    # 继续下一轮分析
                    continue
                
                else:
                    # 没有工具调用，完成分析
                    self.conversation_history.append({
                        "role": "assistant",
                        "content": accumulated_content
                    })
                    
                    yield "\n\n✅ 分析完成"
                    return
                    
            except Exception as e:
                logger.error(f"LLM调用失败: {str(e)}")
                yield f"\n❌ 分析过程出错: {str(e)}\n请检查网络连接或稍后重试。"
                return
        
        # 达到最大迭代次数
        yield "\n⚠️ 达到最大分析轮数\n分析过程较为复杂，如需更深入的分析，请将问题分解为更具体的子问题。"

    def get_conversation_summary(self) -> str:
        """获取对话摘要"""
        if not self.conversation_history:
            return "暂无对话记录"
        
        user_messages = [msg for msg in self.conversation_history if msg["role"] == "user"]
        assistant_messages = [msg for msg in self.conversation_history if msg["role"] == "assistant" and msg.get("content")]
        tool_calls = [msg for msg in self.conversation_history if msg["role"] == "assistant" and msg.get("tool_calls")]
        
        return f"""## 对话摘要
- 用户提问: {len(user_messages)} 次
- 助手回复: {len(assistant_messages)} 次  
- 工具调用: {len(tool_calls)} 次
- 展板ID: {self.board_id}

### 最近话题
{user_messages[-1]["content"] if user_messages else "无"}"""

    def clear_conversation(self):
        """清空对话历史"""
        self.conversation_history = []
        logger.info(f"已清空对话历史: {self.session_id}")

    def export_conversation(self) -> Dict[str, Any]:
        """导出对话记录"""
        return {
            "session_id": self.session_id,
            "board_id": self.board_id,
            "conversation_history": self.conversation_history,
            "exported_at": datetime.now().isoformat()
        }

class MCPExpertManager:
    """MCP专家系统管理器"""
    
    def __init__(self):
        self.experts: Dict[str, MCPExpert] = {}
        self.created_at = datetime.now().isoformat()
    
    def get_expert(self, board_id: str) -> MCPExpert:
        """获取或创建专家实例"""
        if board_id not in self.experts:
            self.experts[board_id] = MCPExpert(board_id)
            logger.info(f"为展板 {board_id} 创建新的专家实例")
        
        return self.experts[board_id]
    
    def remove_expert(self, board_id: str):
        """移除专家实例"""
        if board_id in self.experts:
            del self.experts[board_id]
            logger.info(f"已移除展板 {board_id} 的专家实例")
    
    def get_all_experts(self) -> Dict[str, MCPExpert]:
        """获取所有专家实例"""
        return self.experts.copy()
    
    def get_system_stats(self) -> Dict[str, Any]:
        """获取系统统计信息"""
        return {
            "total_experts": len(self.experts),
            "active_boards": list(self.experts.keys()),
            "manager_created_at": self.created_at,
            "current_time": datetime.now().isoformat()
        }

# 全局专家管理器实例
expert_manager = MCPExpertManager() 