#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
import uuid
import logging
import re
from typing import Dict, List, Any, Optional, Callable
from openai import OpenAI
from expert_llm import ExpertLLM
from config import QWEN_API_KEY
import controller
import requests

logger = logging.getLogger(__name__)

class IntelligentExpert:
    """智能专家LLM，支持自主工具调用和多轮对话"""
    
    def __init__(self, board_id: str):
        self.board_id = board_id
        self.session_id = f"intelligent_{board_id}_{uuid.uuid4().hex[:8]}"
        self.client = OpenAI(
            api_key=QWEN_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        self.conversation_history = []
        self.available_tools = self._setup_tools()
        
    def _setup_tools(self) -> Dict[str, Dict]:
        """设置可用的工具函数"""
        return {
            "get_pdf_page": {
                "description": "获取PDF文件特定页面的内容",
                "parameters": {
                    "filename": "PDF文件名",
                    "page_number": "页码（整数）"
                },
                "function": self._get_pdf_page
            },
            "get_pdf_info": {
                "description": "获取PDF文件的基本信息（总页数、文件名等）",
                "parameters": {
                    "filename": "PDF文件名"
                },
                "function": self._get_pdf_info
            },
            "list_board_files": {
                "description": "列出展板上的所有PDF文件",
                "parameters": {},
                "function": self._list_board_files
            },
            "search_pdf_content": {
                "description": "在PDF文件中搜索包含特定关键词的页面",
                "parameters": {
                    "filename": "PDF文件名",
                    "keywords": "搜索关键词"
                },
                "function": self._search_pdf_content
            }
        }
    
    async def _get_pdf_page(self, filename: str, page_number: int) -> Dict[str, Any]:
        """获取PDF页面内容"""
        try:
            url = f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/annotate"
            response = requests.get(url, timeout=20)  # 增加超时时间
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "content": data.get("annotation", ""),
                    "page_number": page_number,
                    "filename": filename
                }
            else:
                return {
                    "success": False,
                    "error": f"无法获取页面内容，状态码: {response.status_code}"
                }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": f"获取页面内容超时: {filename} 第{page_number}页"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"获取页面内容失败: {str(e)}"
            }
    
    async def _get_pdf_info(self, filename: str) -> Dict[str, Any]:
        """获取PDF基本信息"""
        try:
            url = f"http://127.0.0.1:8000/api/materials/{filename}/pages"
            response = requests.get(url, timeout=15)  # 适当增加超时时间
            
            if response.status_code == 200:
                pages = response.json()
                return {
                    "success": True,
                    "filename": filename,
                    "total_pages": len(pages),
                    "available_pages": pages
                }
            else:
                return {
                    "success": False,
                    "error": f"无法获取PDF信息，状态码: {response.status_code}"
                }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": f"获取PDF信息超时: {filename}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"获取PDF信息失败: {str(e)}"
            }
    
    async def _list_board_files(self) -> Dict[str, Any]:
        """列出展板文件"""
        try:
            url = f"http://127.0.0.1:8000/api/boards/{self.board_id}/simple"
            response = requests.get(url, timeout=10)  # 使用简化API，减少超时时间
            
            if response.status_code == 200:
                board_data = response.json()
                pdfs = board_data.get("pdfs", [])
                return {
                    "success": True,
                    "files": pdfs,
                    "count": len(pdfs)
                }
            else:
                return {
                    "success": False,
                    "error": f"无法获取展板信息，状态码: {response.status_code}"
                }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": f"获取展板文件列表超时: {self.board_id}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"获取展板文件列表失败: {str(e)}"
            }
    
    async def _search_pdf_content(self, filename: str, keywords: str) -> Dict[str, Any]:
        """搜索PDF内容"""
        try:
            # 先获取PDF信息
            pdf_info = await self._get_pdf_info(filename)
            if not pdf_info["success"]:
                return pdf_info
            
            # 搜索包含关键词的页面
            matching_pages = []
            total_pages = pdf_info["total_pages"]
            
            # 限制搜索范围，避免过长时间
            search_limit = min(total_pages, 10)  # 最多搜索10页
            
            for page_num in range(1, search_limit + 1):
                page_content = await self._get_pdf_page(filename, page_num)
                if page_content["success"]:
                    content = page_content["content"].lower()
                    if keywords.lower() in content:
                        matching_pages.append({
                            "page": page_num,
                            "content_preview": page_content["content"][:300] + "..."
                        })
            
            return {
                "success": True,
                "filename": filename,
                "keywords": keywords,
                "matching_pages": matching_pages,
                "total_matches": len(matching_pages),
                "searched_pages": search_limit
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"搜索PDF内容失败: {str(e)}"
            }
    
    def _create_system_prompt(self) -> str:
        """创建系统提示词"""
        tools_desc = "\n".join([
            f"- {name}: {info['description']}" 
            for name, info in self.available_tools.items()
        ])
        
        return f"""你是一个智能专家助手，专门帮助用户分析和理解PDF文档内容。

你可以使用以下工具来获取信息：
{tools_desc}

工作流程：
1. 分析用户的问题，确定需要哪些信息
2. 如果需要获取信息，明确说明要使用哪个工具
3. 基于获取的信息给出完整、准确的回答

重要规则：
- 当需要使用工具时，在回复中明确提到工具名称，如"我需要使用list_board_files工具"
- 如果用户询问特定页面内容，先确认文件存在和页面存在
- 如果文件名模糊（如"4开头的PDF"），先列出所有文件找到匹配项
- 始终基于实际获取的内容回答，不要臆测
- 如果工具调用失败，直接说明情况，不要重复尝试

当前展板ID：{self.board_id}
"""
    
    async def process_query(self, user_query: str, status_callback: Optional[Callable] = None) -> str:
        """处理用户查询，返回最终答案"""
        
        start_time = time.time()
        max_processing_time = 120  # 最大处理时间2分钟
        
        if status_callback:
            await status_callback("🔍 开始分析查询...")
        
        # 添加用户查询到对话历史
        self.conversation_history.append({
            "role": "user", 
            "content": user_query
        })
        
        max_iterations = 3  # 减少最大迭代次数
        iteration = 0
        
        while iteration < max_iterations:
            # 检查是否超时
            if time.time() - start_time > max_processing_time:
                if status_callback:
                    await status_callback("⏰ 处理超时，返回当前结果")
                return "抱歉，处理时间过长，已超时停止。请简化您的问题或稍后重试。"
            
            iteration += 1
            
            if status_callback:
                await status_callback(f"🤔 第{iteration}轮分析和信息收集...")
            
            # 构建消息列表
            messages = [{"role": "system", "content": self._create_system_prompt()}]
            messages.extend(self.conversation_history)
            
            # 调用LLM分析
            try:
                response = self.client.chat.completions.create(
                    model="qwen-plus",
                    messages=messages,
                    temperature=0.1,
                    max_tokens=1000,
                    timeout=45  # 增加LLM调用超时
                )
                
                ai_response = response.choices[0].message.content
                
                # 检查是否需要调用工具
                tool_call = self._extract_tool_call(ai_response)
                
                if tool_call and iteration < max_iterations:  # 最后一轮不调用工具
                    tool_name = tool_call["tool"]
                    tool_params = tool_call["parameters"]
                    
                    if status_callback:
                        await status_callback(f"🔧 调用工具：{tool_name}")
                    
                    # 执行工具调用
                    tool_result = await self._execute_tool(tool_name, tool_params)
                    
                    # 将工具调用和结果添加到对话历史
                    self.conversation_history.append({
                        "role": "assistant",
                        "content": f"我需要使用工具 {tool_name} 来获取信息。"
                    })
                    self.conversation_history.append({
                        "role": "user",
                        "content": f"工具 {tool_name} 的执行结果：{json.dumps(tool_result, ensure_ascii=False)}"
                    })
                    
                    # 继续下一轮分析
                    continue
                
                else:
                    # 没有工具调用或达到最大迭代次数，返回最终答案
                    self.conversation_history.append({
                        "role": "assistant",
                        "content": ai_response
                    })
                    
                    if status_callback:
                        await status_callback("✅ 分析完成，生成最终回答")
                    
                    return ai_response
                    
            except Exception as e:
                logger.error(f"LLM调用失败: {str(e)}")
                if status_callback:
                    await status_callback(f"❌ 分析过程出错: {str(e)}")
                return f"抱歉，分析过程中出现错误：{str(e)}"
        
        # 达到最大迭代次数
        if status_callback:
            await status_callback("⚠️ 达到最大分析轮数，返回当前结果")
        
        return "抱歉，经过多轮分析仍然无法获得完整答案。请提供更具体的信息或重新表述您的问题。"
    
    def _extract_tool_call(self, response: str) -> Optional[Dict[str, Any]]:
        """从AI响应中提取工具调用"""
        response_lower = response.lower()
        
        # 检测明确的工具调用指示
        if "list_board_files" in response_lower or "列出文件" in response:
            return {
                "tool": "list_board_files",
                "parameters": {}
            }
            
        if "get_pdf_page" in response_lower:
            # 尝试提取文件名和页码
            page_match = re.search(r'第(\d+)页', response)
            filename_match = re.search(r'([^/\s]+\.pdf)', response)
            
            if page_match and filename_match:
                return {
                    "tool": "get_pdf_page",
                    "parameters": {
                        "filename": filename_match.group(1),
                        "page_number": int(page_match.group(1))
                    }
                }
        
        if "get_pdf_info" in response_lower:
            filename_match = re.search(r'([^/\s]+\.pdf)', response)
            if filename_match:
                return {
                    "tool": "get_pdf_info",
                    "parameters": {
                        "filename": filename_match.group(1)
                    }
                }
        
        if "search_pdf_content" in response_lower:
            filename_match = re.search(r'([^/\s]+\.pdf)', response)
            keywords_match = re.search(r'搜索[：""]([^"]+)', response)
            
            if filename_match and keywords_match:
                return {
                    "tool": "search_pdf_content",
                    "parameters": {
                        "filename": filename_match.group(1),
                        "keywords": keywords_match.group(1)
                    }
                }
        
        # 隐式检测：需要获取文件列表的情况
        if ("4开头" in response or "哪些pdf文件" in response_lower or "pdf文件" in response_lower) and "工具" not in response:
            return {
                "tool": "list_board_files",
                "parameters": {}
            }
        
        return None
    
    async def _execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """执行工具调用"""
        if tool_name not in self.available_tools:
            return {
                "success": False,
                "error": f"未知工具: {tool_name}"
            }
        
        tool_func = self.available_tools[tool_name]["function"]
        
        try:
            # 添加超时控制
            if parameters:
                result = await asyncio.wait_for(tool_func(**parameters), timeout=60)
            else:
                result = await asyncio.wait_for(tool_func(), timeout=60)
            return result
        except asyncio.TimeoutError:
            logger.error(f"工具 {tool_name} 执行超时")
            return {
                "success": False,
                "error": f"工具执行超时: {tool_name}"
            }
        except Exception as e:
            logger.error(f"工具 {tool_name} 执行失败: {str(e)}")
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}"
            } 