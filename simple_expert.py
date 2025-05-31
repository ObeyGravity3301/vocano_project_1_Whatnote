#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
简化的专家LLM系统
支持并发任务管理和状态追踪
"""

import asyncio
import logging
import time
import httpx
import os
import secrets
from typing import Dict, List, Any, Optional, AsyncGenerator, Set
from openai import OpenAI
from datetime import datetime
from enum import Enum

# 导入配置
try:
    from config import DASHSCOPE_API_KEY, QWEN_API_KEY, PAGE_DIR
except ImportError:
    # 如果config.py不存在，直接从环境变量获取
    DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")
    QWEN_API_KEY = os.getenv("QWEN_API_KEY")

logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class Task:
    """任务类"""
    def __init__(self, task_id: str, task_type: str, params: Dict[str, Any], board_id: str):
        self.task_id = task_id
        self.task_type = task_type
        self.params = params
        self.status = TaskStatus.PENDING
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.completed_at = None
        self.started_at = None
        self.board_id = board_id

class SimpleExpert:
    """简化的专家LLM，支持并发任务管理"""
    
    def __init__(self, board_id: str):
        """初始化简化专家LLM"""
        self.board_id = board_id
        self.conversation_history = []
        self.max_concurrent_tasks = 3
        self.task_queue = asyncio.Queue()
        self.active_tasks: Set[str] = set()
        self.tasks: Dict[str, Task] = {}
        self.task_results: Dict[str, Dict[str, Any]] = {}
        
        # 预创建HTTP客户端
        self.http_client = httpx.AsyncClient(timeout=60.0)
        
        # 初始化LLM客户端（更灵活的API密钥处理）
        api_key = DASHSCOPE_API_KEY or QWEN_API_KEY
        if api_key:
            try:
                self.client = OpenAI(
                    api_key=api_key,
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                )
                self.has_llm_client = True
                logger.info(f"🧠 [INIT] LLM客户端初始化成功: {board_id}")
            except Exception as e:
                logger.warning(f"⚠️ [INIT] LLM客户端初始化失败: {board_id}, 错误: {str(e)}")
                self.client = None
                self.has_llm_client = False
        else:
            logger.warning(f"⚠️ [INIT] 未找到API密钥，LLM功能将不可用: {board_id}")
            self.client = None
            self.has_llm_client = False
        
        # 预启动任务处理器
        self._processor_started = False
        self._startup_task = None
        logger.info(f"📝 [INIT] SimpleExpert初始化完成: {board_id}")
        
        # 立即启动任务处理器（异步）
        try:
            # 尝试获取当前事件循环
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 如果循环正在运行，创建任务
                self._startup_task = loop.create_task(self._ensure_processor_started())
            else:
                # 如果没有运行的循环，标记需要延迟启动
                self._needs_delayed_start = True
        except RuntimeError:
            # 没有事件循环，标记需要延迟启动
            self._needs_delayed_start = True
            logger.info(f"🔄 [INIT] 将在首次任务提交时启动处理器: {board_id}")
    
    async def _ensure_processor_started(self):
        """确保任务处理器已启动"""
        if not self._processor_started:
            logger.info(f"🚀 [PROCESSOR] 预启动任务处理器: {self.board_id}")
            start_time = time.time()
            
            # 启动任务处理器
            asyncio.create_task(self._task_processor())
            self._processor_started = True
            
            startup_time = time.time() - start_time
            logger.info(f"✅ [PROCESSOR] 任务处理器预启动完成: {self.board_id}，耗时: {startup_time:.3f}s")
        
    async def submit_task(self, task_type: str, params: Dict[str, Any]) -> Optional[str]:
        """提交任务到并发处理系统"""
        submit_start_time = time.time()
        logger.info(f"📋 [TASK-SUBMIT] 开始提交任务，类型: {task_type}，展板: {self.board_id}")
        
        # 生成任务ID
        task_id = f"{task_type}_task_{int(time.time() * 1000)}_{secrets.token_hex(2)}"
        
        # 创建任务对象
        task = Task(
            task_id=task_id,
            task_type=task_type,
            params=params,
            board_id=self.board_id
        )
        
        # 存储任务
        self.tasks[task_id] = task
        task_create_time = time.time()
        logger.info(f"📝 [TASK-SUBMIT] 任务对象创建完成，耗时: {task_create_time - submit_start_time:.3f}s，任务ID: {task_id}")
        
        try:
            # 快速检查并启动任务处理器
            processor_check_time = time.time()
            
            # 如果有延迟启动标记，现在启动
            if getattr(self, '_needs_delayed_start', False):
                await self._ensure_processor_started()
                self._needs_delayed_start = False
            elif not self._processor_started:
                await self._ensure_processor_started()
            
            logger.info(f"✅ [TASK-SUBMIT] 处理器检查完成，耗时: {time.time() - processor_check_time:.3f}s")
            
            # 提交任务到队列
            queue_submit_time = time.time()
            await self.task_queue.put(task)
            logger.info(f"📤 [TASK-SUBMIT] 任务已加入队列，耗时: {time.time() - queue_submit_time:.3f}s")
            
        except Exception as e:
            logger.error(f"❌ [TASK-SUBMIT] 提交任务失败: {str(e)}", exc_info=True)
            return None
        
        total_submit_time = time.time() - submit_start_time
        logger.info(f"🎯 [TASK-SUBMIT] 任务提交完成，总耗时: {total_submit_time:.3f}s，任务ID: {task_id}")
        return task_id
    
    async def _task_processor(self):
        """后台任务处理器"""
        processor_start_time = time.time()
        logger.info(f"🔧 [PROCESSOR] 任务处理器启动，时间戳: {processor_start_time}")
        
        while True:
            try:
                # 等待任务
                queue_wait_start = time.time()
                task = await self.task_queue.get()
                queue_wait_time = time.time() - queue_wait_start
                
                logger.info(f"📥 [PROCESSOR] 从队列获取任务: {task.task_id}，等待时间: {queue_wait_time:.3f}s")
                
                # 检查并发限制
                concurrent_check_time = time.time()
                if len(self.active_tasks) >= self.max_concurrent_tasks:
                    # 如果超过并发限制，重新放回队列
                    logger.warning(f"⏸️ [PROCESSOR] 并发已满({len(self.active_tasks)}/{self.max_concurrent_tasks})，任务 {task.task_id} 重新入队")
                    await asyncio.sleep(0.1)
                    await self.task_queue.put(task)
                    continue
                
                logger.info(f"✅ [PROCESSOR] 并发检查通过，耗时: {time.time() - concurrent_check_time:.3f}s")
                
                # 将任务标记为活跃
                active_mark_time = time.time()
                self.active_tasks.add(task.task_id)
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                
                logger.info(f"🏃 [PROCESSOR] 任务 {task.task_id} 标记为活跃，耗时: {time.time() - active_mark_time:.3f}s")
                logger.info(f"📊 [PROCESSOR] 当前活跃任务数: {len(self.active_tasks)}/{self.max_concurrent_tasks}")
                
                # 异步执行任务
                execution_start_time = time.time()
                asyncio.create_task(self._execute_task(task))
                logger.info(f"🚀 [PROCESSOR] 任务 {task.task_id} 已启动执行，启动耗时: {time.time() - execution_start_time:.3f}s")
                
            except Exception as e:
                logger.error(f"❌ [PROCESSOR] 任务处理器错误: {str(e)}", exc_info=True)
                await asyncio.sleep(1)  # 错误后稍微等待
    
    async def _execute_task(self, task: Task):
        """执行单个任务"""
        execution_start_time = time.time()
        logger.info(f"⚡ [EXECUTE] 开始执行任务: {task.task_id}，类型: {task.task_type}")
        
        try:
            # 根据任务类型执行相应的处理函数
            handler_start_time = time.time()
            
            if task.task_type == "generate_annotation":
                result = await self._generate_annotation_task(task.params["filename"], task.params["pageNumber"])
            elif task.task_type == "improve_annotation":
                result = await self._improve_annotation_task(task.params)
            elif task.task_type == "generate_note":
                result = await self._generate_note_task(task.params)
            elif task.task_type == "ask_question":
                result = await self._ask_question_task(task.params)
            else:
                result = await self._general_query_task(task.params)
            
            handler_time = time.time() - handler_start_time
            logger.info(f"✅ [EXECUTE] 任务处理器执行完成: {task.task_id}，处理耗时: {handler_time:.3f}s，结果长度: {len(result) if result else 0}")
            
            task.status = TaskStatus.COMPLETED
            task.result = result
            task.completed_at = datetime.now()
            
            # 存储任务结果
            result_store_time = time.time()
            self.task_results[task.task_id] = {
                "status": "completed",
                "result": result,
                "task_type": task.task_type,
                "completed_at": task.completed_at.isoformat(),
                "task_id": task.task_id,
                "board_id": self.board_id,
                "success": True,
                # 提供多个字段以兼容前端
                "data": {"content": result},
                "note": result,
                "annotation": result,
                "answer": result,
                "timing": {
                    "handler_time": handler_time,
                    "total_execution_time": time.time() - execution_start_time
                }
            }
            logger.info(f"💾 [EXECUTE] 任务结果存储完成: {task.task_id}，存储耗时: {time.time() - result_store_time:.3f}s")
            
        except Exception as e:
            error_time = time.time() - execution_start_time
            logger.error(f"❌ [EXECUTE] 任务执行失败: {task.task_id}，错误: {str(e)}，失败耗时: {error_time:.3f}s", exc_info=True)
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = datetime.now()
            
            self.task_results[task.task_id] = {
                "status": "failed",
                "error": str(e),
                "task_type": task.task_type,
                "completed_at": task.completed_at.isoformat(),
                "task_id": task.task_id,
                "board_id": self.board_id,
                "success": False,
                "timing": {
                    "error_time": error_time
                }
            }
        
        finally:
            # 从活动任务中移除
            cleanup_time = time.time()
            self.active_tasks.discard(task.task_id)
            total_execution_time = time.time() - execution_start_time
            logger.info(f"🏁 [EXECUTE] 任务完成清理: {task.task_id}，总执行时间: {total_execution_time:.3f}s，当前活跃任务数: {len(self.active_tasks)}")
            logger.info(f"🧹 [EXECUTE] 清理耗时: {time.time() - cleanup_time:.3f}s")
    
    async def _generate_annotation_task(self, filename: str, page_number: int) -> str:
        """
        生成页面注释任务 - 优先使用文字提取
        """
        start_time = time.time()
        
        try:
            logger.info(f"开始注释生成任务: {filename} 第{page_number}页")
            
            # 首先尝试获取PDF文字内容
            try:
                from controller import get_page_text
                page_text = get_page_text(filename, page_number)
                
                if page_text and len(page_text.strip()) > 50:  # 文字内容充足
                    logger.info(f"使用PDF文字生成注释，文字长度: {len(page_text)} 字符")
                    
                    # 使用专门的文字注释提示模板
                    annotation_prompt = f"""
请为以下PDF页面内容生成详细的学术注释：

PDF文件：{filename}
页码：第{page_number}页

页面文字内容：
{page_text}

请提供：
1. 核心概念总结
2. 重要知识点解释
3. 与其他概念的关联
4. 学习要点和记忆提示

注释要求：
- 详细且准确
- 突出重点概念
- 提供具体例子
- 便于理解和记忆
"""
                    
                    # 使用通用LLM生成注释
                    if self.has_llm_client and self.client:
                        response = self.client.chat.completions.create(
                            model="qwen-plus",
                            messages=[
                                {"role": "system", "content": "你是一个专业的学术助手，擅长为PDF内容生成详细的学术注释。"},
                                {"role": "user", "content": annotation_prompt}
                            ],
                            max_tokens=2000,
                            temperature=0.7
                        )
                        
                        annotation_content = response.choices[0].message.content
                        execution_time = time.time() - start_time
                        
                        logger.info(f"基于文字的注释生成完成，长度: {len(annotation_content)} 字符，耗时: {execution_time:.3f}秒")
                        return annotation_content
                    else:
                        logger.warning("LLM客户端不可用，无法生成注释")
                        return "LLM服务不可用，无法生成注释"
                
                else:
                    logger.info(f"PDF文字内容不足({len(page_text) if page_text else 0}字符)，将使用图像识别")
                    
            except Exception as e:
                logger.warning(f"PDF文字提取失败: {str(e)}，将使用图像识别")
            
            # 文字提取失败或内容不足时，使用图像识别
            logger.info(f"使用图像识别生成注释")
            
            # 获取页面图像
            try:
                from controller import get_page_image
                img_path = get_page_image(filename, page_number)
                
                if not os.path.exists(img_path):
                    raise ValueError(f"页面图像不存在: {img_path}")
                
                # 读取图像并编码为base64
                import base64
                with open(img_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                
                # 使用视觉识别生成注释
                vision_prompt = f"""
请分析这个PDF页面图像并生成详细的学术注释：

PDF文件：{filename}
页码：第{page_number}页

请识别页面中的：
1. 主要文字内容
2. 图表、公式或示意图
3. 重要概念和知识点
4. 结构层次关系

并提供：
- 内容总结
- 关键概念解释
- 学习重点
- 理解建议
"""
                
                if self.has_llm_client and self.client:
                    response = self.client.chat.completions.create(
                        model="qwen-plus",
                        messages=[
                            {"role": "system", "content": "你是一个专业的学术助手，擅长分析PDF页面并生成详细注释。"},
                            {"role": "user", "content": [
                                {"type": "text", "text": vision_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                            ]}
                        ],
                        max_tokens=2000,
                        temperature=0.7
                    )
                    
                    annotation_content = response.choices[0].message.content
                    execution_time = time.time() - start_time
                    
                    logger.info(f"基于图像的注释生成完成，长度: {len(annotation_content)} 字符，耗时: {execution_time:.3f}秒")
                    return annotation_content
                else:
                    logger.warning("LLM客户端不可用，无法生成注释")
                    return "LLM服务不可用，无法生成注释"
                    
            except Exception as e:
                logger.error(f"图像识别注释生成失败: {str(e)}")
                return f"注释生成失败: {str(e)}"
            
        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = f"注释生成任务失败: {str(e)}"
            logger.error(f"{error_msg}，耗时: {execution_time:.3f}秒")
            return error_msg
    
    async def _improve_annotation_task(self, params: Dict[str, Any]) -> str:
        """改进注释任务"""
        filename = params.get('filename')
        page_number = params.get('pageNumber', params.get('page_number'))
        current_annotation = params.get('currentAnnotation', params.get('current_annotation', ''))
        improve_request = params.get('improveRequest', params.get('improve_request', ''))
        
        logger.info(f"🔄 改进注释任务: {filename} 第{page_number}页, 当前注释长度: {len(current_annotation)}, 改进要求: {improve_request}")
        
        # 调用改进注释API
        response = await self.http_client.post(
            f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/improve-annotation",
            json={
                "current_annotation": current_annotation,
                "improve_request": improve_request,
                "board_id": self.board_id
            },
            timeout=60.0
        )
        
        if response.status_code == 200:
            data = response.json()
            # 直接返回改进后的注释内容作为字符串结果
            improved_content = data.get("improved_annotation", "")
            logger.info(f"✅ 注释改进成功，返回内容长度: {len(improved_content)}")
            return improved_content
        else:
            error_msg = f"改进注释失败: {response.status_code}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    async def _generate_note_task(self, params: Dict[str, Any]) -> str:
        """生成笔记任务"""
        filename = params.get('filename')
        content = params.get('content', '')
        
        try:
            if filename:
                # 生成PDF笔记 - 读取实际PDF内容
                logger.info(f"开始生成PDF笔记，文件名: {filename}")
                
                # 读取PDF所有页面内容
                prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
                pages_text = []
                i = 1
                while True:
                    page_file = f"{prefix}{i}.txt"
                    if not os.path.exists(page_file):
                        break
                    try:
                        with open(page_file, 'r', encoding='utf-8') as f:
                            page_content = f.read().strip()
                            if page_content:  # 只添加非空页面
                                pages_text.append(f"第{i}页:\n{page_content}")
                    except Exception as e:
                        logger.warning(f"读取页面文件失败: {page_file}, 错误: {str(e)}")
                    i += 1
                
                if not pages_text:
                    error_msg = f"未找到PDF页面内容文件: {filename}"
                    logger.error(error_msg)
                    return error_msg
                
                # 合并所有页面内容
                full_content = "\n\n".join(pages_text)
                logger.info(f"成功读取PDF内容，共{len(pages_text)}页，总长度: {len(full_content)}字符")
                
                # 生成笔记的提示词
                query = f"""请为以下PDF文档内容生成详细的学习笔记。文档名称：《{filename}》

PDF内容：
{full_content}

请生成一份结构化的学习笔记，包含：
1. 文档概述
2. 主要概念和定义
3. 重要知识点
4. 关键公式或原理（如有）
5. 总结

请使用Markdown格式，确保内容准确、详细且易于理解。"""
                
                note_content = await self.process_query(query)
                
                if note_content and len(note_content) > 50:
                    logger.info(f"成功生成PDF笔记，长度: {len(note_content)}")
                    return note_content
                else:
                    error_msg = f"PDF笔记生成内容为空或过短: '{note_content}'"
                    logger.error(error_msg)
                    return error_msg
                    
            else:
                # 生成文本笔记
                logger.info(f"开始生成文本笔记，内容长度: {len(content)}")
                
                if content and len(content) > 5:
                    query = f"请为以下内容创建详细的学习笔记，使用Markdown格式：\n\n{content}"
                    note_content = await self.process_query(query)
                    
                    if note_content and len(note_content) > 10:
                        logger.info(f"成功生成文本笔记，长度: {len(note_content)}")
                        return note_content
                    else:
                        error_msg = f"文本笔记生成内容为空或过短: '{note_content}'"
                        logger.error(error_msg)
                        return error_msg
                else:
                    error_msg = f"输入内容为空或过短，无法生成笔记"
                    logger.error(error_msg)
                    return error_msg
                    
        except Exception as e:
            error_msg = f"笔记生成任务执行异常: {str(e)}, 参数: {params}"
            logger.error(error_msg, exc_info=True)
            return error_msg
    
    async def _ask_question_task(self, params: Dict[str, Any]) -> str:
        """问答任务"""
        filename = params.get('filename')
        question = params.get('question')
        
        response = await self.http_client.post(
            f"http://127.0.0.1:8000/api/materials/{filename}/ask",
            json={"question": question},
            timeout=60.0
        )
        
        if response.status_code == 200:
            data = response.json()
            # 从answer字段提取答案内容
            answer_content = data.get("answer", "")
            return answer_content
        else:
            raise Exception(f"问答失败: {response.status_code}")
    
    async def _general_query_task(self, params: Dict[str, Any]) -> str:
        """通用查询任务"""
        query = params.get('query', '')
        result = await self.process_query(query)
        return result
    
    def get_task_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务结果"""
        return self.task_results.get(task_id)
    
    def get_concurrent_status(self) -> Dict[str, Any]:
        """获取并发状态"""
        active_count = len(self.active_tasks)
        completed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.COMPLETED])
        failed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.FAILED])
        pending_count = len([t for t in self.tasks.values() if t.status == TaskStatus.PENDING])
        
        return {
            "active_tasks": active_count,
            "max_concurrent_tasks": self.max_concurrent_tasks,
            "completed_tasks": completed_count,
            "failed_tasks": failed_count,
            "pending_tasks": pending_count,
            "total_tasks": len(self.tasks),
            "active_task_ids": list(self.active_tasks)
        }
    
    def _get_available_tools(self) -> List[Dict[str, Any]]:
        """获取可用工具列表"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "list_board_files",
                    "description": "列出展板上的所有PDF文件",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            },
            {
                "type": "function", 
                "function": {
                    "name": "get_pdf_page",
                    "description": "获取PDF页面内容",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string", "description": "PDF文件名"},
                            "page_number": {"type": "integer", "description": "页码"}
                        },
                        "required": ["filename", "page_number"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "search_pdf_content", 
                    "description": "在PDF中搜索内容",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string", "description": "PDF文件名"},
                            "query": {"type": "string", "description": "搜索关键词"}
                        },
                        "required": ["filename", "query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_note",
                    "description": "创建学习笔记",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string", "description": "PDF文件名"},
                            "note_type": {"type": "string", "description": "笔记类型"},
                            "content": {"type": "string", "description": "笔记内容"}
                        },
                        "required": ["filename", "note_type"]
                    }
                }
            }
        ]
    
    async def _execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """执行工具调用（使用异步HTTP客户端）"""
        try:
            base_url = "http://127.0.0.1:8000"
            
            if tool_name == "list_board_files":
                # 获取展板文件列表
                response = await self.http_client.get(f"{base_url}/api/boards/{self.board_id}")
                if response.status_code == 200:
                    board_data = response.json()
                    files = []
                    for window in board_data.get("windows", []):
                        if window.get("type") == "pdf":
                            files.append({
                                "filename": window.get("filename", ""),
                                "title": window.get("title", ""),
                                "page": window.get("page", 1)
                            })
                    return {"success": True, "files": files}
                return {"success": False, "error": "无法获取展板信息"}
            
            elif tool_name == "get_pdf_page":
                filename = arguments["filename"]
                page_number = arguments["page_number"]
                
                # 获取页面内容
                response = await self.http_client.get(
                    f"{base_url}/api/materials/{filename}/pages/{page_number}/annotate",
                    params={"board_id": self.board_id}
                )
                if response.status_code == 200:
                    return {"success": True, "content": response.json()}
                return {"success": False, "error": "无法获取页面内容"}
            
            elif tool_name == "search_pdf_content":
                filename = arguments["filename"]
                query = arguments["query"]
                
                # 实现搜索逻辑
                return {"success": True, "results": f"在{filename}中搜索'{query}'的结果"}
            
            elif tool_name == "create_note":
                filename = arguments["filename"]
                note_type = arguments["note_type"]
                
                # 创建笔记
                response = await self.http_client.post(
                    f"{base_url}/api/materials/{filename}/note",
                    timeout=60.0
                )
                if response.status_code == 200:
                    return {"success": True, "note": response.json()}
                return {"success": False, "error": "无法创建笔记"}
            
            else:
                return {"success": False, "error": f"未知工具: {tool_name}"}
                
        except Exception as e:
            logger.error(f"工具执行失败 {tool_name}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def process_query(self, query: str) -> str:
        """处理查询并返回结果"""
        try:
            # 检查是否有可用的LLM客户端
            if not self.has_llm_client or not self.client:
                logger.warning(f"⚠️ [QUERY] 没有可用的LLM客户端，无法处理查询: {self.board_id}")
                return "抱歉，当前没有配置可用的AI模型。请检查API密钥配置。"
            
            # 添加用户消息到对话历史
            self.conversation_history.append({
                "role": "user",
                "content": query
            })
            
            # 调用LLM
            response = self.client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "你是一个智能学习助手，专门帮助用户理解和学习各种知识。请用中文回答，提供准确、详细且有用的信息。"},
                    *self.conversation_history
                ],
                max_tokens=4000,
                temperature=0.7
            )
            
            assistant_message = response.choices[0].message.content
            
            # 添加助手回复到对话历史
            self.conversation_history.append({
                "role": "assistant", 
                "content": assistant_message
            })
            
            # 保持对话历史长度
            if len(self.conversation_history) > 20:
                self.conversation_history = self.conversation_history[-20:]
            
            return assistant_message
            
        except Exception as e:
            logger.error(f"处理查询失败: {str(e)}", exc_info=True)
            return f"抱歉，处理您的请求时发生错误: {str(e)}"
    
    async def process_query_stream(self, query: str) -> AsyncGenerator[str, None]:
        """流式处理用户查询"""
        try:
            # 先处理工具调用（如果需要）
            result = await self.process_query(query)
            
            # 逐字输出结果
            for char in result:
                yield char
                await asyncio.sleep(0.01)  # 模拟流式效果
                
        except Exception as e:
            yield f"流式处理出错: {str(e)}"

class SimpleExpertManager:
    """简化的专家管理器"""
    
    def __init__(self):
        self.experts: Dict[str, SimpleExpert] = {}
        self.created_at = datetime.now().isoformat()
    
    def get_expert(self, board_id: str) -> SimpleExpert:
        """获取或创建专家实例"""
        if board_id not in self.experts:
            self.experts[board_id] = SimpleExpert(board_id)
        return self.experts[board_id]
    
    def remove_expert(self, board_id: str):
        """移除专家实例"""
        if board_id in self.experts:
            del self.experts[board_id]

# 全局管理器实例
simple_expert_manager = SimpleExpertManager() 