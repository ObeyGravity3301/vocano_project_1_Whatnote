import os
import json
import uuid
import logging
import requests
import time
import asyncio
import httpx
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
from collections import deque
import threading
from config import QWEN_API_KEY, API_TIMEOUT
from board_logger import board_logger
from conversation_manager import conversation_manager
from llm_logger import LLMLogger  # 导入LLM日志记录器
from board_manager import board_manager  # 导入展板管理器

# 使用更长的超时时间用于PDF笔记生成，避免60秒超时
PDF_NOTE_TIMEOUT = 180  # PDF笔记生成使用3分钟超时

logger = logging.getLogger(__name__)

class ExpertLLM:
    """
    专家LLM，负责特定展板内的所有内容理解和生成。
    每个展板有一个专属的专家LLM实例，负责该展板内的所有操作。
    现在支持动态并发处理多个任务。
    """
    
    def __init__(self, board_id):
        self.board_id = board_id
        # 创建专家LLM的独立会话ID
        self.session_id = f"expert_{board_id}_{uuid.uuid4()}"
        
        # 动态并发任务管理
        self.active_tasks = {}  # 正在进行的任务 {task_id: task_info}
        self.completed_tasks = deque(maxlen=100)  # 已完成任务的结果队列
        self.task_counter = 0  # 任务计数器
        self.context_lock = threading.Lock()  # 上下文更新锁
        self.max_concurrent_tasks = 3  # 最大并发任务数
        self.result_processor_started = False  # 结果处理器启动标志
        
        # 初始化展板和专家对话
        self._init_expert_conversation()
        
    def _ensure_result_processor_started(self):
        """确保结果处理器已启动"""
        if not self.result_processor_started:
            try:
                # 启动结果处理后台任务
                asyncio.create_task(self._start_result_processor())
                self.result_processor_started = True
                logger.info(f"展板 {self.board_id} 的结果处理器已启动")
            except RuntimeError:
                # 如果没有运行中的event loop，先不启动，稍后再试
                logger.warning(f"展板 {self.board_id} 的结果处理器延迟启动")
        
    async def _start_result_processor(self):
        """启动后台任务处理器，负责将完成的任务结果整合到主上下文"""
        logger.info(f"展板 {self.board_id} 启动结果处理器")
        
        while True:
            try:
                if self.completed_tasks:
                    with self.context_lock:
                        # 处理所有已完成的任务（但不清空队列）
                        tasks_to_process = []
                        for task_result in self.completed_tasks:
                            # 只处理未集成的任务
                            if not task_result.get("integrated", False):
                                tasks_to_process.append(task_result)
                                task_result["integrated"] = True  # 标记为已集成
                        
                        for task_result in tasks_to_process:
                            self._integrate_task_result(task_result)
                
                await asyncio.sleep(0.5)  # 每0.5秒检查一次
            except Exception as e:
                logger.error(f"结果处理器错误: {str(e)}")
                await asyncio.sleep(2)
    
    def _integrate_task_result(self, task_result: Dict[str, Any]):
        """将任务结果整合到主上下文"""
        if task_result["success"]:
            task_type = task_result["task_info"].get("type", "unknown")
            response_content = task_result["result"]
            timestamp = task_result.get("completed_at", time.time())
            
            # 添加到主会话上下文，包含时间戳信息
            conversation_manager.add_message(
                self.session_id,
                self.board_id,
                "assistant",
                f"[并发任务-{task_type}@{timestamp:.0f}] {response_content}"
            )
            
            logger.info(f"任务结果已整合到主上下文: {task_result['task_id']}")

    async def submit_task_dynamic(self, task_info: Dict[str, Any]) -> str:
        """
        动态提交单个任务，立即开始执行
        
        Args:
            task_info: 任务信息 {"type": "task_type", "params": {...}}
            
        Returns:
            任务ID，可用于跟踪任务状态
        """
        # 确保结果处理器已启动
        self._ensure_result_processor_started()
        
        # 检查并发限制
        if len(self.active_tasks) >= self.max_concurrent_tasks:
            # 等待有任务完成，或者返回错误
            logger.warning(f"并发任务数已达上限 ({self.max_concurrent_tasks})，新任务将等待")
            # 可以选择等待或直接拒绝
            await self._wait_for_available_slot()
        
        # 创建任务ID
        task_id = f"dynamic_task_{self.task_counter}_{uuid.uuid4().hex[:8]}"
        self.task_counter += 1
        
        # 记录任务为活跃状态
        self.active_tasks[task_id] = {
            "task_info": task_info,
            "started_at": time.time(),
            "status": "running"
        }
        
        logger.info(f"启动动态任务 {task_id}: {task_info.get('type')}")
        
        # 异步执行任务
        asyncio.create_task(self._execute_dynamic_task(task_id, task_info))
        
        # 启动超时监控
        asyncio.create_task(self._monitor_task_timeout(task_id))
        
        return task_id
    
    async def _wait_for_available_slot(self, timeout: float = 30.0):
        """等待有可用的并发槽位"""
        start_time = time.time()
        while len(self.active_tasks) >= self.max_concurrent_tasks:
            if time.time() - start_time > timeout:
                raise Exception("等待并发槽位超时")
            await asyncio.sleep(0.5)
    
    async def _execute_dynamic_task(self, task_id: str, task_info: Dict[str, Any]):
        """执行动态任务"""
        try:
            # 获取当前上下文快照
            with self.context_lock:
                base_context = conversation_manager.get_conversation(self.session_id, self.board_id)
            
            # 创建任务专用会话ID
            task_session_id = f"{self.session_id}_dynamic_{task_id}"
            
            # 复制基础上下文到任务会话
            for msg in base_context:
                conversation_manager.add_message(
                    task_session_id,
                    self.board_id,
                    msg.get("role"),
                    msg.get("content")
                )
            
            # 执行具体任务
            result = await self._execute_task_async(task_info, task_session_id)
            
            # 标记任务完成并添加到完成队列
            task_result = {
                "task_id": task_id,
                "success": True,
                "result": result,
                "task_info": task_info,
                "completed_at": time.time()
            }
            
            self.completed_tasks.append(task_result)
            
            # 从活跃任务中移除
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
            
            logger.info(f"动态任务 {task_id} 执行成功")
            
        except Exception as e:
            logger.error(f"动态任务 {task_id} 执行失败: {str(e)}")
            
            # 记录失败结果
            task_result = {
                "task_id": task_id,
                "success": False,
                "error": str(e),
                "task_info": task_info,
                "completed_at": time.time()
            }
            
            self.completed_tasks.append(task_result)
            
            # 从活跃任务中移除（这很重要！）
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
                logger.info(f"已从活跃任务列表中移除失败任务: {task_id}")
        
        finally:
            # 确保任务一定会从活跃列表中移除（双重保险）
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
                logger.warning(f"在finally块中移除任务: {task_id}")

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        获取指定任务的详细状态
        
        Args:
            task_id: 任务ID
            
        Returns:
            任务状态信息，如果任务不存在则返回None
        """
        with self.context_lock:
            # 检查活跃任务
            if task_id in self.active_tasks:
                task_info = self.active_tasks[task_id]
                return {
                    "task_id": task_id,
                    "status": "running",
                    "task_type": task_info.get("task_type", "unknown"),
                    "started_at": task_info.get("started_at"),
                    "duration": time.time() - task_info.get("started_at", time.time()),
                    "params": task_info.get("params", {}),
                    "success": None,  # 运行中的任务没有成功状态
                    "result_length": 0,  # 运行中的任务没有结果
                    "board_id": self.board_id
                }
            
            # 检查已完成任务
            for completed_task in self.completed_tasks:
                if completed_task.get("task_id") == task_id:
                    return {
                        "task_id": task_id,
                        "status": "completed",
                        "task_type": completed_task.get("task_type", "unknown"),
                        "started_at": completed_task.get("started_at"),
                        "completed_at": completed_task.get("completed_at"),
                        "duration": completed_task.get("duration", 0),
                        "success": completed_task.get("success", False),
                        "result_length": len(completed_task.get("result", "")),
                        "cancelled": completed_task.get("cancelled", False),
                        "board_id": self.board_id
                    }
            
            return None

    def get_concurrent_status(self) -> Dict[str, Any]:
        """获取当前并发状态"""
        with self.context_lock:
            active_task_ids = list(self.active_tasks.keys())
            available_slots = self.max_concurrent_tasks - len(active_task_ids)
            recently_completed = len(self.completed_tasks)
            
            # 构建活跃任务的详细信息
            active_task_details = []
            for task_id, task_info in self.active_tasks.items():
                task_type = task_info.get("task_info", {}).get("type", "unknown")
                params = task_info.get("task_info", {}).get("params", {})
                
                # 构建任务描述
                description = self._build_task_description(task_type, params)
                
                active_task_details.append({
                    "task_id": task_id,
                    "task_type": task_type,
                    "description": description,
                    "started_at": task_info.get("started_at"),
                    "duration": time.time() - task_info.get("started_at", time.time())
                })
            
            return {
                "active_tasks": len(active_task_ids),
                "max_concurrent": self.max_concurrent_tasks,
                "active_task_ids": active_task_ids,
                "active_task_details": active_task_details,  # 新增详细信息
                "recently_completed": recently_completed,
                "available_slots": max(0, available_slots),
                "board_id": self.board_id
            }

    def _build_task_description(self, task_type: str, params: Dict[str, Any]) -> str:
        """构建任务的友好描述"""
        try:
            if task_type == "generate_annotation":
                filename = params.get("filename", "未知文件")
                page_number = params.get("pageNumber", "未知页")
                # 更友好的文件名显示 - 去掉扩展名，保留更多字符
                if filename.endswith('.pdf'):
                    filename = filename[:-4]  # 去掉.pdf扩展名
                short_filename = filename[:25] + "..." if len(filename) > 28 else filename
                return f"{short_filename} 第{page_number}页注释"
                
            elif task_type == "generate_pdf_note":
                filename = params.get("filename", "未知文件")
                if filename.endswith('.pdf'):
                    filename = filename[:-4]
                short_filename = filename[:25] + "..." if len(filename) > 28 else filename
                return f"{short_filename} 整本笔记"
                
            elif task_type == "generate_note":
                note_type = params.get("note_type", "笔记")
                return f"{note_type}生成"
                
            elif task_type == "improve_note":
                return "笔记改进"
                
            elif task_type == "improve_pdf_note":
                filename = params.get("filename", "未知文件")
                if filename.endswith('.pdf'):
                    filename = filename[:-4]
                short_filename = filename[:25] + "..." if len(filename) > 28 else filename
                return f"{short_filename} 笔记改进"
                
            elif task_type == "answer_question":
                question = params.get("question", "")
                short_question = question[:20] + "..." if len(question) > 23 else question
                return f"问答: {short_question}"
                
            elif task_type == "process_image":
                filename = params.get("filename", "")
                if filename:
                    if filename.endswith('.pdf'):
                        filename = filename[:-4]
                    short_filename = filename[:20] + "..." if len(filename) > 23 else filename
                    return f"{short_filename} 图像识别"
                return "图像识别"
                
            else:
                return f"{task_type}任务"
                
        except Exception as e:
            logger.error(f"构建任务描述失败: {str(e)}")
            return f"{task_type}任务"

    # 便捷接口：常用任务的快速提交
    async def generate_note_async(self, content: str, note_type: str = "general") -> str:
        """异步生成笔记（立即返回任务ID）"""
        task_info = {
            "type": "generate_note",
            "params": {"content": content, "note_type": note_type}
        }
        return await self.submit_task_dynamic(task_info)

    async def generate_pdf_note_async(self, filename: str, pages_text: List[str]) -> str:
        """异步生成PDF笔记（立即返回任务ID）"""
        task_info = {
            "type": "generate_pdf_note",
            "params": {"filename": filename, "pages_text": pages_text}
        }
        return await self.submit_task_dynamic(task_info)

    async def improve_note_async(self, current_note: str, improvement_request: str) -> str:
        """异步改进笔记（立即返回任务ID）"""
        task_info = {
            "type": "improve_note",
            "params": {
                "current_note": current_note,
                "improvement_request": improvement_request
            }
        }
        return await self.submit_task_dynamic(task_info)

    async def improve_pdf_note_async(self, filename: str, current_note: str, improvement_request: str) -> str:
        """异步改进PDF笔记（立即返回任务ID）"""
        task_info = {
            "type": "improve_pdf_note",
            "params": {
                "filename": filename,
                "current_note": current_note,
                "improvement_request": improvement_request
            }
        }
        return await self.submit_task_dynamic(task_info)

    async def answer_question_async(self, question: str, context: str = "") -> str:
        """异步回答问题（立即返回任务ID）"""
        task_info = {
            "type": "answer_question",
            "params": {"question": question, "context": context}
        }
        return await self.submit_task_dynamic(task_info)

    def _init_expert_conversation(self):
        """初始化专家LLM的对话"""
        # 获取展板信息
        board_info = board_logger.get_full_board_info(self.board_id)
        
        # 构建系统提示词
        system_prompt = self._get_system_prompt(board_info)
        
        # 初始化对话
        conversation_manager.add_message(
            self.session_id, 
            self.board_id, 
            "system", 
            system_prompt
        )
        
        # 添加初始化消息
        conversation_manager.add_message(
            self.session_id,
            self.board_id,
            "user",
            f"我要处理展板 {self.board_id} 的内容。请提供针对展板内容的专业支持。"
        )
        
        # 添加模拟的初始响应，避免初始化时调用API
        init_response = f"展板 {self.board_id} 的专家LLM已初始化完成，随时可以提供服务。"
        conversation_manager.add_message(
            self.session_id,
            self.board_id,
            "assistant",
            init_response
        )
        
        # 记录到展板日志
        board_logger.add_operation(
            self.board_id, 
            "expert_llm_initialized", 
            {"session_id": self.session_id}
        )
        
    def _get_system_prompt(self, board_info):
        """获取专家LLM的系统提示词"""
        # 获取实时展板上下文信息
        board_summary = board_manager.get_board_summary(self.board_id)
        pdf_files = board_manager.get_pdf_files(self.board_id)
        notes = board_manager.get_notes(self.board_id)
        
        # 构建展板内容描述
        content_description = f"""
当前展板状态:
- 展板ID: {self.board_id}
- 创建时间: {board_info.get("created_at", "未知")}
- 更新时间: {board_summary.get("updated_at", "未知")}
- 内容概览: {board_summary.get("description", "无描述")}
- PDF文件数: {len(pdf_files)}
- 笔记数: {len(notes)}

展板内容详情:"""

        if pdf_files:
            content_description += "\n\nPDF文件列表:"
            for pdf in pdf_files:
                filename = pdf.get('filename', '未知文件')
                current_page = pdf.get('current_page', 1)
                preview = pdf.get('content_preview', '')[:100]
                content_description += f"\n  • {filename} (当前第{current_page}页): {preview}..."
        else:
            content_description += "\n\n当前展板没有PDF文件。"

        if notes:
            content_description += "\n\n笔记列表:"
            for note in notes:
                title = note.get('title', '无标题')
                preview = note.get('content_preview', '')[:100]
                content_description += f"\n  • {title}: {preview}..."
        else:
            content_description += "\n\n当前展板没有笔记。"
        
        return f"""你是WhatNote应用的专家LLM，负责处理展板ID: {self.board_id} 的所有内容。

你的主要职责包括：
1. 理解并分析上传到展板的PDF文档内容
2. 生成和改进笔记、注释
3. 回答用户关于展板内容的问题
4. 协助用户完成复杂的多步骤任务

{content_description}

你拥有以下能力:
1. 实时获取展板上的PDF文件和笔记内容
2. 生成笔记和注释
3. 改进已有内容
4. 调用图像识别AI处理PDF图像
5. 执行多步骤操作，但每步操作前需获得用户确认

当用户询问关于展板内容的问题时，你应该：
1. 首先查看上述展板内容详情
2. 如果需要更详细的信息，可以请求获取具体PDF页面或笔记的完整内容
3. 基于实际内容提供准确、有针对性的回答

请记住用户的偏好和操作习惯，提供连贯一致的服务。
你的回复应当简洁明了，专注于满足用户需求。
如需执行操作，应提供明确的操作计划并等待用户确认。

请记住你是专注于当前展板的专家，不要尝试处理其他展板或全局应用的功能。
"""
    
    def analyze_pdf(self, filename, pages_text):
        """
        分析PDF内容，生成摘要
        
        Args:
            filename: PDF文件名
            pages_text: 页面文本内容列表
        
        Returns:
            摘要内容
        """
        # 构建提示词
        prompt = f"【PDF分析任务】请分析这个文件：{filename}\n\n"
        
        # 添加页面内容（限制长度）
        content = "\n\n".join([f"第{i+1}页:\n{text[:500]}..." for i, text in enumerate(pages_text[:5])])
        prompt += f"文件内容示例:\n{content}\n\n"
        prompt += "请提供这个PDF的内容摘要，包括主题、关键概念和结构概述。"
        
        # 调用LLM
        summary = self._call_llm(prompt)
        
        # 更新展板日志
        board_logger.update_pdf_content(self.board_id, filename, summary)
        
        return summary
    
    def generate_note(self, filename, pages_text, page_number=None):
        """
        生成笔记
        
        Args:
            filename: PDF文件名
            pages_text: 页面文本内容列表
            page_number: 特定页码，如果为None则生成整本笔记
            
        Returns:
            生成的笔记内容
        """
        # 首先检查pages_text是否为空列表或只有一页的情况下是否需要尝试直接从PDF重新提取
        if not pages_text or len(pages_text) < 2:
            try:
                logger.info(f"检测到页面文本不完整或为空，尝试从PDF文件中提取页面: {filename}")
                from controller import split_pdf
                import os
                from config import UPLOAD_DIR
                
                pdf_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(pdf_path):
                    # 重新拆分PDF并获取所有页面
                    new_pages = split_pdf(pdf_path, filename)
                    logger.info(f"重新提取PDF页面完成，共提取到 {len(new_pages)} 页")
                    
                    # 重新读取页面内容
                    from controller import get_page_text
                    pages_text = []
                    i = 1
                    while True:
                        text = get_page_text(filename, i)
                        if not text and i > 30:  # 设置一个合理的上限，防止无限循环
                            break
                        pages_text.append(text)
                        i += 1
                    
                    logger.info(f"成功重新读取 {len(pages_text)} 页文本内容")
                else:
                    logger.error(f"PDF文件不存在: {pdf_path}")
            except Exception as e:
                logger.error(f"尝试重新提取页面失败: {str(e)}")
        
        # 如果仍然没有页面内容，返回错误信息
        if not pages_text:
            error_msg = f"错误：{filename} 未找到任何页面内容"
            logger.error(error_msg)
            return error_msg
            
        if page_number is not None:
            # 尝试从文件名检测预期的总页数（如果在文件名中有明确标记）
            expected_pages = None
            try:
                import re
                import fitz
                from config import UPLOAD_DIR
                import os
                
                # 方法1: 直接从PDF文件获取页数
                pdf_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(pdf_path):
                    try:
                        doc = fitz.open(pdf_path)
                        expected_pages = len(doc)
                        logger.info(f"从PDF文件获取到页数: {expected_pages}")
                    except Exception as e:
                        logger.error(f"无法从PDF文件获取页数: {str(e)}")
            except Exception as e:
                logger.error(f"检测页数时出错: {str(e)}")
            
            # 生成特定页的笔记 - 仅使用当前页的内容
            if page_number < 1 or page_number > len(pages_text):
                # 找不到对应页码时，提供更友好的错误信息
                error_msg = f"错误：页码 {page_number} 超出范围（1-{len(pages_text)}）"
                if expected_pages and expected_pages > len(pages_text):
                    error_msg += f"\n\nPDF实际有 {expected_pages} 页，但系统只能找到 {len(pages_text)} 页内容。正在尝试重新提取页面..."
                
                logger.error(error_msg)
                
                # 如果我们知道实际页数，并且请求页码在实际页数范围内，尝试直接从PDF提取
                try:
                    if expected_pages and 1 <= page_number <= expected_pages:
                        from controller import get_page_text
                        # 强制重新从PDF提取指定页面的文本
                        text = get_page_text(filename, page_number)
                        if text:
                            logger.info(f"成功直接从PDF提取第 {page_number} 页内容")
                            # 使用提取的内容生成注释
                            prompt = f"【单页笔记生成任务】为PDF文件 {filename} 的第 {page_number} 页生成笔记。\n\n"
                            prompt += f"页面内容:\n{text}\n\n"
                            prompt += f"""请仅基于这一页的内容，生成一份结构清晰的笔记，突出重点内容，使用Markdown格式。

注意：
1. 不要试图总结整本PDF，而只关注这一页的内容
2. 由于这是第 {page_number} 页的内容，在提到重要概念时可以标注"(本页)"或"(第{page_number}页)"
"""
                            return self._call_llm(prompt)
                except Exception as e:
                    logger.error(f"尝试直接提取页面内容失败: {str(e)}")
                
                # 尝试生成一个基于当前情况的笔记
                try:
                    # 如果有至少一页内容，使用第一页作为参考
                    if len(pages_text) > 0:
                        content = pages_text[0]
                        return f"**注意：所请求的第 {page_number} 页不存在。** \n\n当前PDF只有 {len(pages_text)} 页。\n\n请确认您要查看的页码，或重新上传PDF文件以确保所有页面都被正确提取。"
                    else:
                        return f"**错误：找不到任何页面内容。** 请重新上传PDF文件或联系管理员。"
                except Exception as e:
                    return f"生成页面内容时出错: {str(e)}"
                
            # 只提取当前页的内容
            try:
                content = pages_text[page_number - 1]
                
                # 检查页面内容是否为空
                if not content or content.strip() == "":
                    logger.warning(f"第 {page_number} 页内容为空，尝试生成基本结构")
                    return f"**注意：第 {page_number} 页内容为空。** \n\n这可能是因为该页面包含图像但没有文本，或者页面提取过程中出现问题。\n\n请尝试使用视觉识别功能获取更好的分析结果。"
                
                logger.info(f"正在为 {filename} 第 {page_number} 页生成笔记，内容长度: {len(content)} 字符")
                
                prompt = f"【单页笔记生成任务】为PDF文件 {filename} 的第 {page_number} 页生成笔记。\n\n"
                prompt += f"页面内容:\n{content}\n\n"
                prompt += f"""请仅基于这一页的内容，生成一份结构清晰的笔记，突出重点内容，使用Markdown格式。注意：1. 不要试图总结整本PDF，而只关注这一页的内容2. 由于这是第 {page_number} 页的内容，在提到重要概念时可以标注"(本页)"或"(第{page_number}页)"




"""
                
                # 记录操作开始
                board_logger.add_operation(
                    self.board_id,
                    "page_note_generation_started",
                    {"filename": filename, "page": page_number}
                )
            except IndexError:
                error_msg = f"错误：无法获取第 {page_number} 页内容，页码可能超出范围"
                logger.error(error_msg)
                return error_msg
            except Exception as e:
                error_msg = f"处理页面内容时出错: {str(e)}"
                logger.error(error_msg)
                return error_msg
            
        else:
            # 生成整本笔记
            # 为避免超出上下文长度，只使用部分页面作为示例
            try:
                if len(pages_text) == 0:
                    return "**错误：未找到任何页面内容。** 请重新上传PDF文件或确保文件内容可提取。"
                    
                # 将限制从5页改为40页
                total_pages = len(pages_text)
                sample_pages = min(40, total_pages)
                
                # 判断使用的页面范围
                if total_pages <= 40:
                    # 如果总页数不超过40页，使用全部页面
                    pages_used = pages_text
                    page_range_info = f"<参考第1页-第{total_pages}页内容>"
                else:
                    # 如果超过40页，取前20页和后20页
                    front_pages = 20
                    back_pages = 20
                    pages_used = pages_text[:front_pages] + pages_text[-back_pages:]
                    page_range_info = f"<参考第1页-第{front_pages}页及第{total_pages-back_pages+1}页-第{total_pages}页内容>"
                
                # 构建内容样本
                content = "\n\n".join([f"第{i+1}页:\n{text[:300]}..." for i, text in enumerate(pages_used)])
                logger.info(f"正在为 {filename} 生成整本笔记，共 {total_pages} 页")
                
                prompt = f"【整本笔记生成任务】为PDF文件 {filename} 生成整本笔记。\n\n"
                prompt += f"文件有 {total_pages} 页，以下是部分内容示例:\n{content}\n\n"
                prompt += """请生成一份完整的笔记，包括主要内容的结构化总结，使用Markdown格式，突出重点和关键概念。
                
重要要求：
1. 在笔记中引用重要内容时，请标注相应的页码，格式为：(第X页) 或 (第X-Y页)
2. 例如："该理论的核心观点是... (第3页)"
3. 对于跨越多页的内容，可以标注页码范围："详细推导过程见原文 (第5-7页)"

"""
                
                # 记录操作开始
                board_logger.add_operation(
                    self.board_id,
                    "full_note_generation_started",
                    {"filename": filename}
                )
            except Exception as e:
                error_msg = f"准备整本笔记生成时出错: {str(e)}"
                logger.error(error_msg)
                return error_msg
        
        try:
            # 调用LLM
            note = self._call_llm(prompt)
            
            # 检查返回的内容是否为错误信息
            if note.startswith("API调用错误:"):
                logger.error(f"LLM调用失败，返回错误信息: {note}")
                return f"笔记生成失败: {note}"
            
            # 检查返回内容是否过短（可能是API超时导致的不完整响应）
            if len(note.strip()) < 50:
                logger.warning(f"LLM返回内容过短 ({len(note)}字符)，可能是不完整的响应: {note[:100]}")
                return f"笔记生成可能不完整。请重试或检查网络连接。\n\n部分内容: {note}"
            
            # 如果是整本笔记，在开头添加页数引用信息
            if not page_number and 'page_range_info' in locals():
                note = f"{page_range_info}\n\n{note}"
            
            # 记录操作完成
            operation_type = "page_note_generated" if page_number else "full_note_generated"
            page_info = {"page": page_number} if page_number else {}
            
            board_logger.add_operation(
                self.board_id,
                operation_type,
                {"filename": filename, **page_info}
            )
            
            return note
        except Exception as e:
            error_msg = f"生成笔记时出错: {str(e)}"
            logger.error(error_msg)
            
            # 详细的错误处理
            if "Read timed out" in str(e):
                return f"笔记生成超时，这通常是因为PDF内容较多或网络较慢。请尝试：\n1. 重试操作\n2. 检查网络连接\n3. 稍后再试\n\n技术错误: {str(e)}"
            elif "HTTPSConnectionPool" in str(e):
                return f"网络连接失败，无法访问AI服务。请检查：\n1. 网络连接是否正常\n2. 防火墙设置\n3. 稍后重试\n\n技术错误: {str(e)}"
            else:
                return f"笔记生成过程中出现错误: {str(e)}\n\n请尝试重新生成或联系管理员。"
    
    def improve_note(self, note_content, improve_prompt, reference_pages=None):
        """
        改进笔记内容
        
        Args:
            note_content: 当前笔记内容
            improve_prompt: 改进要求
            reference_pages: 参考页面内容（可选）
            
        Returns:
            改进后的笔记内容
        """
        prompt = f"【笔记改进任务】根据以下要求改进笔记内容:\n\n{improve_prompt}\n\n"
        prompt += f"当前笔记内容:\n{note_content}\n\n"
        
        if reference_pages:
            # 添加部分参考内容
            sample_text = "\n\n".join([text[:300] + "..." for text in reference_pages[:2]])
            prompt += f"参考内容:\n{sample_text}"
        
        # 调用LLM
        improved_note = self._call_llm(prompt)
        
        # 记录操作
        board_logger.add_operation(
            self.board_id,
            "note_improved",
            {"improve_prompt": improve_prompt}
        )
        
        return improved_note
    
    def answer_question(self, question, context_pdfs=None):
        """
        回答关于展板内容的问题
        
        Args:
            question: 用户问题
            context_pdfs: 相关PDF信息列表
            
        Returns:
            回答内容
        """
        # 获取展板实时上下文信息
        pdf_files = board_manager.get_pdf_files(self.board_id)
        notes = board_manager.get_notes(self.board_id)
        board_summary = board_manager.get_board_summary(self.board_id)
        
        # 构建提示词
        prompt = f"【问题回答任务】用户问题: {question}\n\n"
        
        # 添加展板当前状态信息
        prompt += f"展板当前状态:\n"
        prompt += f"- 展板ID: {self.board_id}\n"
        prompt += f"- PDF文件数: {len(pdf_files)}\n"
        prompt += f"- 笔记数: {len(notes)}\n"
        prompt += f"- 更新时间: {board_summary.get('updated_at', '未知')}\n\n"
        
        # 添加PDF文件详细信息
        if pdf_files:
            prompt += "展板上的PDF文件:\n"
            for pdf in pdf_files:
                filename = pdf.get('filename', '未知文件')
                current_page = pdf.get('current_page', 1)
                preview = pdf.get('content_preview', '')
                prompt += f"  • {filename} (当前第{current_page}页)\n"
                if preview:
                    prompt += f"    内容预览: {preview[:300]}...\n"
            prompt += "\n"
        
        # 添加笔记信息
        if notes:
            prompt += "展板上的笔记:\n"
            for note in notes:
                title = note.get('title', '无标题')
                preview = note.get('content_preview', '')
                prompt += f"  • {title}\n"
                if preview:
                    prompt += f"    内容预览: {preview[:300]}...\n"
            prompt += "\n"
        
        # 添加传统上下文信息（如果有）
        if context_pdfs:
            context_info = []
            for pdf in context_pdfs:
                pdf_info = f"文件: {pdf['filename']}"
                if 'content_summary' in pdf:
                    pdf_info += f"\n摘要: {pdf['content_summary']}"
                context_info.append(pdf_info)
            
            prompt += "额外上下文信息:\n" + "\n\n".join(context_info) + "\n\n"
        
        # 提供回答指导
        if not pdf_files and not notes:
            prompt += "注意：当前展板为空，没有PDF文件或笔记。请据此向用户说明并建议他们先上传内容。"
        else:
            prompt += "请根据展板上的实际内容回答用户问题。如果需要更详细的信息，可以说明需要查看具体的PDF页面或笔记内容。"
        
        # 调用LLM
        answer = self._call_llm(prompt)
        
        # 记录操作
        board_logger.add_operation(
            self.board_id,
            "question_answered",
            {"question": question, "has_board_context": len(pdf_files) > 0 or len(notes) > 0}
        )
        
        return answer
    
    def plan_multi_step_task(self, task_description):
        """
        为复杂任务规划多步骤操作
        
        Args:
            task_description: 任务描述
            
        Returns:
            操作计划和第一步操作
        """
        prompt = f"【多步骤任务规划】用户任务: {task_description}\n\n"
        prompt += """请制定一个分步骤的计划来完成这个任务。每个步骤应该清晰可执行，格式如下:

步骤 1: [步骤描述]
- 操作: [具体操作]
- 需要的信息: [此步骤需要的信息]
- 预期结果: [此步骤完成后的结果]

步骤 2: ...

请确保步骤之间有逻辑连贯性，且每个步骤都需要用户确认才能执行。
同时，请提供第一步具体的执行建议。"""
        
        # 调用LLM
        plan = self._call_llm(prompt)
        
        # 记录操作
        board_logger.add_operation(
            self.board_id,
            "task_planned",
            {"task": task_description}
        )
        
        return plan
    
    def execute_step(self, step_description, previous_result=None):
        """
        执行任务中的一个步骤
        
        Args:
            step_description: 步骤描述
            previous_result: 上一步的结果（可选）
            
        Returns:
            步骤执行结果
        """
        prompt = f"【步骤执行】当前步骤: {step_description}\n\n"
        
        if previous_result:
            prompt += f"上一步结果:\n{previous_result}\n\n"
            
        prompt += "请执行这个步骤并提供结果。如果需要额外信息，请明确说明。"
        
        # 调用LLM
        result = self._call_llm(prompt)
        
        # 记录操作
        board_logger.add_operation(
            self.board_id,
            "step_executed",
            {"step": step_description}
        )
        
        return result
    
    def process_user_message(self, message):
        """
        处理用户直接发送的消息
        
        Args:
            message: 用户消息内容
            
        Returns:
            LLM回复
        """
        # 调用LLM
        response = self._call_llm(message)
        
        # 记录操作
        board_logger.add_operation(
            self.board_id,
            "user_message_processed",
            {"message_preview": message[:50] + "..." if len(message) > 50 else message}
        )
        
        return response
    
    def _call_llm(self, prompt):
        """内部方法：调用LLM API - 🔧 优化：使用异步包装避免阻塞"""
        # 🔧 关键修复：将同步LLM调用包装为异步，避免阻塞其他操作
        import asyncio
        
        # 如果在异步上下文中，直接运行异步版本
        try:
            loop = asyncio.get_running_loop()
            # 在当前事件循环中运行
            task = asyncio.create_task(self._async_call_llm(prompt, self.session_id))
            # 使用run_until_complete可能会导致嵌套循环问题，所以使用gather
            future = asyncio.gather(task, return_exceptions=True)
            result = loop.run_until_complete(future)
            return result[0] if isinstance(result, list) and len(result) > 0 else "API调用错误"
        except RuntimeError:
            # 如果没有运行中的事件循环，创建新的
            return asyncio.run(self._async_call_llm(prompt, self.session_id))
        except Exception as e:
            logger.error(f"LLM异步包装调用失败: {str(e)}")
            return f"API调用错误: {str(e)}"
    
    def _prepare_messages(self, prompt):
        """
        准备发送给LLM的消息列表
        
        Args:
            prompt: 用户提示词
            
        Returns:
            格式化的消息列表
        """
        # 获取历史对话
        conversation_history = conversation_manager.get_conversation(self.session_id, self.board_id)
        
        # 添加当前用户消息到历史记录
        conversation_manager.add_message(
            self.session_id, 
            self.board_id, 
            "user", 
            prompt
        )
        
        # 构建正确格式的消息列表
        messages = []
        
        # 添加系统消息
        system_msg = next((msg for msg in conversation_history if msg.get("role") == "system"), None)
        if system_msg:
            messages.append({"role": "system", "content": system_msg.get("content", "")})
        
        # 添加最近的对话历史
        for msg in conversation_history[-8:]:  # 最多取最近8条历史记录
            role = msg.get("role")
            content = msg.get("content")
            
            if role and content and role in ["user", "assistant"]:
                messages.append({"role": role, "content": content})
        
        # 确保最后一条是当前用户消息
        if not (len(messages) >= 2 and messages[-1]["role"] == "user" and messages[-1]["content"] == prompt):
            messages.append({"role": "user", "content": prompt})
        
        return messages

    def stream_call_llm(self, prompt, callback=None):
        """
        使用流式输出调用LLM
        
        Args:
            prompt: 提示文本
            callback: 流数据块回调函数
            
        Returns:
            完整响应文本
        """
        logger.info(f"🔥 stream_call_llm 开始执行 - 展板: {self.board_id}")
        
        if not QWEN_API_KEY:
            logger.error("未配置QWEN_API_KEY")
            raise ValueError("未配置QWEN_API_KEY")
            
        logger.info("🔍 检查 _prepare_messages 方法...")
        if not hasattr(self, '_prepare_messages'):
            error_msg = "ExpertLLM对象缺少_prepare_messages方法"
            logger.error(error_msg)
            raise AttributeError(error_msg)
            
        logger.info("✅ _prepare_messages 方法存在，开始获取会话历史...")
        # 获取会话历史
        try:
            messages = self._prepare_messages(prompt)
            logger.info(f"📝 准备了 {len(messages)} 条消息")
        except Exception as e:
            logger.error(f"❌ _prepare_messages 调用失败: {str(e)}")
            raise
        
        try:
            start_time = time.time()
            
            # 使用requests直接调用流式API
            url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {QWEN_API_KEY}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "qwen-plus",
                "messages": messages,
                "stream": True,
                "temperature": 0.7
            }
            
            full_response = ""
            chunk_count = 0
            
            logger.info("🌐 开始流式API请求...")
            # 使用流式请求 - 配置代理设置以避免连接问题
            proxies = {'http': None, 'https': None}
            with requests.post(url, headers=headers, json=data, stream=True, timeout=60, proxies=proxies) as response:
                response.raise_for_status()
                logger.info(f"📡 HTTP响应状态: {response.status_code}")
                
                for line in response.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            data_str = line[6:]  # 去掉 'data: ' 前缀
                            
                            if data_str.strip() == '[DONE]':
                                logger.info("🏁 收到[DONE]信号，流式结束")
                                break
                                
                            try:
                                chunk_data = json.loads(data_str)
                                if 'choices' in chunk_data and chunk_data['choices']:
                                    delta = chunk_data['choices'][0].get('delta', {})
                                    content = delta.get('content', '')
                                    
                                    if content:
                                        chunk_count += 1
                                        full_response += content
                                        logger.info(f"📦 收到数据块 {chunk_count}: '{content}' (长度: {len(content)})")
                                        
                                        # 如果有回调函数，则调用
                                        if callback and callable(callback):
                                            try:
                                                logger.info(f"🔄 调用回调函数，内容: '{content}'")
                                                callback(content)
                                                logger.info("✅ 回调函数调用成功")
                                            except Exception as callback_error:
                                                logger.warning(f"❌ 回调函数执行失败: {callback_error}")
                                        else:
                                            logger.warning("⚠️ 没有可用的回调函数")
                                                
                            except json.JSONDecodeError as json_error:
                                logger.warning(f"⚠️ JSON解析失败: {json_error}, 数据: {data_str[:100]}...")
                                continue
            
            logger.info(f"📊 流式处理统计 - 总块数: {chunk_count}, 总长度: {len(full_response)}")
            
            # 计算耗时
            end_time = time.time()
            duration = end_time - start_time
            
            # 记录LLM交互日志
            logger.info(f"流式调用成功，响应长度: {len(full_response)}")
            LLMLogger.log_interaction(
                llm_type="expert_stream",
                query=prompt,
                response=full_response,
                command=None,
                metadata={
                    "board_id": self.board_id,
                    "duration": duration,
                    "streaming": True,
                    "session_id": self.session_id
                }
            )
            
            # 添加到会话历史
            conversation_manager.add_message(
                self.session_id,
                self.board_id,
                "assistant",
                full_response
            )
            
            return full_response
        except Exception as e:
            error_msg = f"流式调用失败: {str(e)}"
            logger.error(error_msg)
            
            if callback:
                callback(f"错误: {str(e)}")
                
            return error_msg
    
    def process_image(self, image_path, context=None):
        """
        处理PDF页面图像，生成注释
        
        Args:
            image_path: 图像文件路径
            context: 上下文信息，可包含当前注释和改进请求
            
        Returns:
            生成的注释内容
        """
        try:
            # 导入配置
            from config import DASHSCOPE_API_KEY, QWEN_VL_API_KEY
            api_key = DASHSCOPE_API_KEY or QWEN_VL_API_KEY
            
            if not api_key:
                raise ValueError("未配置DASHSCOPE_API_KEY或QWEN_VL_API_KEY")
            
            # 构建提示词
            prompt = f"【图像识别任务】请分析这个PDF页面图像，生成一个简洁但有信息量的注释。"
            
            # 添加上下文信息（如果有）
            if context:
                if isinstance(context, dict):
                    current_annotation = context.get('current_annotation', '')
                    improve_request = context.get('improve_request', '')
                    
                    if current_annotation and improve_request:
                        prompt += f"\n\n当前注释内容：\n{current_annotation}\n\n用户改进建议：\n{improve_request}\n\n请根据用户的改进建议和当前注释内容，生成一个更好的注释版本。"
                    elif current_annotation:
                        prompt += f"\n\n当前注释内容：\n{current_annotation}\n\n请生成一个更好的注释版本。"
                    elif improve_request:
                        prompt += f"\n\n用户指导建议：\n{improve_request}\n\n请根据用户的指导生成注释。"
                elif isinstance(context, str):
                    prompt += f"\n\n附加说明：\n{context}"
            
            print(f"图像识别提示词: {prompt[:100]}...")
            
            # 将图片转为base64编码
            import base64
            with open(image_path, "rb") as f:
                image_data = f.read()
                base64_image = base64.b64encode(image_data).decode("utf-8")
            
            # 使用OpenAI客户端
            from openai import OpenAI
            
            client = OpenAI(
                api_key=api_key,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
            
            # 构建消息体
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ]
            
            # 调用模型
            print(f"使用展板专家LLM({self.board_id})处理图像...")
            completion = client.chat.completions.create(
                model="qwen-vl-plus",  # 视觉语言模型
                messages=messages
            )
            
            # 提取回复内容
            response_content = completion.choices[0].message.content
            
            print(f"图像识别成功，响应长度: {len(response_content)}")
            
            # 保存到会话历史 - 使用正确的方法
            # 查看类中是否有process_user_message方法
            if hasattr(self, 'process_user_message'):
                self.process_user_message(f"[图像识别请求]\n{prompt}")
            # 或者如果有_call_llm方法，我们可以直接使用它
            elif hasattr(self, '_call_llm'):
                self._call_llm(prompt)
            # 不再调用_add_to_history，因为它不存在
            
            return response_content
        except Exception as e:
            error_str = str(e)
            
            # 根据错误类型返回更具体的错误信息
            if ("Arrearage" in error_str or 
                "Access denied" in error_str or 
                "account is in good standing" in error_str):
                error_msg = f"图像识别失败: API账户余额不足，请充值后重试"
            elif ("HTTPSConnectionPool" in error_str or 
                  "Unable to connect" in error_str or
                  "Connection refused" in error_str):
                error_msg = f"图像识别失败: 网络连接问题，请检查网络后重试"
            elif "未配置" in error_str and "API" in error_str:
                error_msg = f"图像识别失败: API密钥未配置"
            else:
                error_msg = f"图像识别失败: {error_str}"
            
            print(error_msg)
            return error_msg
    
    def get_session_id(self):
        """获取专家LLM的会话ID"""
        return self.session_id

    async def process_concurrent_tasks(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        并发处理多个任务
        
        Args:
            tasks: 任务列表，每个任务包含 {"type": "task_type", "params": {...}}
            
        Returns:
            结果列表，与任务顺序对应
        """
        if not tasks:
            return []
            
        logger.info(f"展板 {self.board_id} 开始并发处理 {len(tasks)} 个任务")
        
        # 获取当前上下文作为基础
        base_context = conversation_manager.get_conversation(self.session_id, self.board_id)
        
        # 创建并发任务
        async def execute_single_task(task_info):
            task_id = f"task_{self.task_counter}_{uuid.uuid4().hex[:8]}"
            self.task_counter += 1
            
            try:
                # 为每个任务创建独立的会话上下文
                task_session_id = f"{self.session_id}_concurrent_{task_id}"
                
                # 复制基础上下文到新会话
                for msg in base_context:
                    conversation_manager.add_message(
                        task_session_id,
                        self.board_id,
                        msg.get("role"),
                        msg.get("content")
                    )
                
                # 执行具体任务
                result = await self._execute_task_async(task_info, task_session_id)
                
                return {
                    "task_id": task_id,
                    "success": True,
                    "result": result,
                    "task_info": task_info
                }
                
            except Exception as e:
                logger.error(f"并发任务 {task_id} 执行失败: {str(e)}")
                return {
                    "task_id": task_id,
                    "success": False,
                    "error": str(e),
                    "task_info": task_info
                }
        
        # 并发执行所有任务
        results = await asyncio.gather(*[execute_single_task(task) for task in tasks])
        
        # 整合成功的结果到主会话上下文
        successful_results = [r for r in results if r["success"]]
        
        if successful_results:
            # 按照任务类型和重要性整合结果
            for result in successful_results:
                task_type = result["task_info"].get("type")
                response_content = result["result"]
                
                # 添加任务结果到主会话
                conversation_manager.add_message(
                    self.session_id,
                    self.board_id,
                    "assistant",
                    f"[并发任务-{task_type}] {response_content}"
                )
        
        logger.info(f"展板 {self.board_id} 并发任务完成: 成功 {len(successful_results)}/{len(tasks)}")
        
        return results

    async def _execute_task_async(self, task_info: Dict[str, Any], task_session_id: str) -> str:
        """
        异步执行单个任务
        
        Args:
            task_info: 任务信息
            task_session_id: 任务专用会话ID
            
        Returns:
            任务执行结果
        """
        task_type = task_info.get("type")
        params = task_info.get("params", {})
        
        if task_type == "generate_note":
            return await self._async_generate_note(params, task_session_id)
        elif task_type == "generate_pdf_note":
            return await self._async_generate_pdf_note(params, task_session_id)
        elif task_type == "improve_note":
            return await self._async_improve_note(params, task_session_id)
        elif task_type == "improve_pdf_note":
            return await self._async_improve_pdf_note(params, task_session_id)
        elif task_type == "answer_question":
            return await self._async_answer_question(params, task_session_id)
        elif task_type == "generate_annotation":
            return await self._async_generate_annotation(params, task_session_id)
        elif task_type == "vision_annotation":
            return await self._async_vision_annotation(params, task_session_id)
        elif task_type == "improve_annotation":
            return await self._async_improve_annotation(params, task_session_id)
        elif task_type == "process_image":
            return await self._async_process_image(params, task_session_id)
        else:
            raise ValueError(f"不支持的任务类型: {task_type}")

    async def _async_call_llm(self, prompt: str, task_session_id: str) -> str:
        """异步调用LLM API"""
        if not QWEN_API_KEY:
            logger.error("未配置QWEN_API_KEY")
            raise ValueError("未配置QWEN_API_KEY")
            
        # 获取任务会话历史
        conversation_history = conversation_manager.get_conversation(task_session_id, self.board_id)
        
        # 添加当前用户消息
        conversation_manager.add_message(
            task_session_id, 
            self.board_id, 
            "user", 
            prompt
        )
        
        try:
            # 判断是否为PDF笔记生成任务，使用不同的超时时间
            is_pdf_note_task = ("PDF文件" in prompt and "生成" in prompt) or "整本笔记生成任务" in prompt or "并发生成PDF笔记" in prompt
            timeout = PDF_NOTE_TIMEOUT if is_pdf_note_task else API_TIMEOUT
            
            logger.info(f"异步LLM API调用开始 - 会话:{task_session_id}, 任务类型: {'PDF笔记生成' if is_pdf_note_task else '常规任务'}, 超时时间: {timeout}秒")
            
            # 使用httpx进行异步请求
            async with httpx.AsyncClient(timeout=timeout) as client:
                url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {QWEN_API_KEY}",
                    "Content-Type": "application/json"
                }
                
                # 构建消息列表
                messages = []
                
                # 添加系统消息
                system_msg = next((msg for msg in conversation_history if msg.get("role") == "system"), None)
                if system_msg:
                    messages.append({"role": "system", "content": system_msg.get("content", "")})
                
                # 添加最近的对话历史
                for msg in conversation_history[-8:]:
                    role = msg.get("role")
                    content = msg.get("content")
                    
                    if role and content and role in ["user", "assistant"]:
                        messages.append({"role": role, "content": content})
                
                # 确保最后一条是当前用户消息
                if not (len(messages) >= 2 and messages[-1]["role"] == "user" and messages[-1]["content"] == prompt):
                    messages.append({"role": "user", "content": prompt})
                
                data = {
                    "model": "qwen-max",
                    "messages": messages,
                    "temperature": 0.7
                }
                
                # 记录API调用开始时间
                start_time = time.time()
                
                # 发送异步请求
                response = await client.post(url, headers=headers, json=data)
                response.raise_for_status()
                
                result = response.json()
                response_content = result["choices"][0]["message"]["content"]
                
                # 计算API调用耗时
                end_time = time.time()
                duration = end_time - start_time
                
                logger.info(f"异步LLM API调用成功 - 会话:{task_session_id}, 耗时: {duration:.1f}秒, 响应长度: {len(response_content)}字符")
                
                # 记录LLM交互日志 - 根据任务类型判断
                llm_type = "expert_concurrent"
                metadata = {
                    "session_id": task_session_id,
                    "board_id": self.board_id,
                    "duration": duration,
                    "token_count": result.get("usage", {}).get("total_tokens", 0),
                    "concurrent": True,
                    "timeout_used": timeout,
                    "is_pdf_note_task": is_pdf_note_task
                }
                
                # 特殊处理视觉识别任务
                if "vision_annotation" in task_session_id or "vision" in prompt.lower():
                    llm_type = "vision_recognize"
                    metadata.update({
                        "requestType": "image",  # 前端调试面板期望的字段名
                        "operation_type": "vision_annotation",
                        "input_type": "image"
                    })
                
                LLMLogger.log_interaction(
                    llm_type=llm_type,
                    query=prompt,
                    response=response_content,
                    metadata=metadata
                )
                
                # 添加助手回复
                conversation_manager.add_message(
                    task_session_id, 
                    self.board_id, 
                    "assistant", 
                    response_content
                )
                
                return response_content
                
        except Exception as e:
            logger.error(f"并发LLM API调用失败: {str(e)}")
            error_msg = f"API调用错误: {str(e)}"
            
            # 记录错误回复
            conversation_manager.add_message(
                task_session_id, 
                self.board_id, 
                "assistant", 
                error_msg
            )
            
            raise e

    async def _async_generate_note(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步生成笔记"""
        content = params.get("content", "")
        note_type = params.get("note_type", "general")
        
        prompt = f"【并发笔记生成任务】请为以下内容生成{note_type}笔记:\n\n{content}"
        
        return await self._async_call_llm(prompt, task_session_id)

    async def _async_generate_pdf_note(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步生成PDF笔记"""
        filename = params.get("filename", "")
        pages_text = params.get("pages_text", [])
        
        logger.info(f"并发生成PDF笔记: {filename}")
        
        try:
            # 直接使用异步LLM调用生成笔记，不需要先分析
            # 构建笔记生成提示词
            if not pages_text:
                return f"错误：{filename} 未找到任何页面内容"
                
            # 限制页面数量避免超出上下文长度
            total_pages = len(pages_text)
            sample_pages = min(40, total_pages)
            
            # 判断使用的页面范围
            if total_pages <= 40:
                # 如果总页数不超过40页，使用全部页面
                pages_used = pages_text
                page_range_info = f"<参考第1页-第{total_pages}页内容>"
            else:
                # 如果超过40页，取前20页和后20页
                front_pages = 20
                back_pages = 20
                pages_used = pages_text[:front_pages] + pages_text[-back_pages:]
                page_range_info = f"<参考第1页-第{front_pages}页及第{total_pages-back_pages+1}页-第{total_pages}页内容>"
            
            # 构建内容样本
            content = "\n\n".join([f"第{i+1}页:\n{text[:300]}..." for i, text in enumerate(pages_used)])
            
            prompt = f"【整本笔记生成任务】为PDF文件 {filename} 生成整本笔记。\n\n"
            prompt += f"文件有 {total_pages} 页，以下是部分内容示例:\n{content}\n\n"
            prompt += """请生成一份完整的笔记，包括主要内容的结构化总结，使用Markdown格式，突出重点和关键概念。
            
重要要求：
1. 在笔记中引用重要内容时，请标注相应的页码，格式为：(第X页) 或 (第X-Y页)
2. 例如："该理论的核心观点是... (第3页)"
3. 对于跨越多页的内容，可以标注页码范围："详细推导过程见原文 (第5-7页)"

"""
            
            # 使用异步LLM调用
            note = await self._async_call_llm(prompt, task_session_id)
            
            # 检查返回的内容是否为错误信息
            if note.startswith("API调用错误:"):
                logger.error(f"LLM调用失败，返回错误信息: {note}")
                return f"笔记生成失败: {note}"
            
            # 检查返回内容是否过短（可能是API超时导致的不完整响应）
            if len(note.strip()) < 50:
                logger.warning(f"LLM返回内容过短 ({len(note)}字符)，可能是不完整的响应: {note[:100]}")
                return f"笔记生成可能不完整。请重试或检查网络连接。\n\n部分内容: {note}"
            
            # 在开头添加页数引用信息
            note = f"{page_range_info}\n\n{note}"
            
            # 记录操作完成
            board_logger.add_operation(
                self.board_id,
                "pdf_note_generated",
                {"filename": filename}
            )
            
            return note
        except Exception as e:
            error_msg = f"生成PDF笔记失败: {str(e)}"
            logger.error(error_msg)
            
            # 详细的错误处理
            if "Read timed out" in str(e):
                return f"PDF笔记生成超时，这通常是因为PDF内容较多或网络较慢。请尝试：\n1. 重试操作\n2. 检查网络连接\n3. 稍后再试\n\n技术错误: {str(e)}"
            elif "HTTPSConnectionPool" in str(e):
                return f"网络连接失败，无法访问AI服务。请检查：\n1. 网络连接是否正常\n2. 防火墙设置\n3. 稍后重试\n\n技术错误: {str(e)}"
            else:
                return f"PDF笔记生成过程中出现错误: {str(e)}\n\n请尝试重新生成或联系管理员。"

    async def _async_improve_note(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步改进笔记"""
        current_note = params.get("current_note", "")
        improvement_request = params.get("improvement_request", "")
        
        prompt = f"【并发笔记改进任务】\n当前笔记:\n{current_note}\n\n改进要求:\n{improvement_request}\n\n请提供改进的笔记版本。"
        
        return await self._async_call_llm(prompt, task_session_id)

    async def _async_improve_pdf_note(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步改进PDF笔记"""
        filename = params.get("filename", "")
        current_note = params.get("current_note", "")
        improvement_request = params.get("improvement_request", "")
        
        logger.info(f"并发改进PDF笔记: {filename}")
        
        try:
            # 改进笔记
            improved_note = self.improve_note(current_note, improvement_request)
            
            # 记录操作完成
            board_logger.add_operation(
                self.board_id,
                "pdf_note_improved",
                {"filename": filename}
            )
            
            return improved_note
        except Exception as e:
            logger.error(f"PDF笔记改进失败: {str(e)}")
            return f"改进PDF笔记失败: {str(e)}"

    async def _async_answer_question(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步回答问题"""
        question = params.get("question", "")
        context = params.get("context", "")
        
        prompt = f"【并发问答任务】问题: {question}"
        if context:
            prompt += f"\n\n相关上下文:\n{context}"
        
        return await self._async_call_llm(prompt, task_session_id)

    async def _async_generate_annotation(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步生成注释"""
        filename = params.get("filename", "")
        page_number = params.get("pageNumber", 1)
        session_id = params.get("sessionId")
        current_annotation = params.get("currentAnnotation")
        improve_request = params.get("improveRequest")
        
        logger.info(f"并发生成注释: {filename} 第{page_number}页")
        
        # 导入注释生成功能
        from controller import get_page_text, get_page_image
        
        try:
            # 获取页面文本
            text = get_page_text(filename, page_number)
            
            # 构建提示词
            if current_annotation and improve_request:
                prompt = f"【注释改进任务】\n当前注释:\n{current_annotation}\n\n改进要求:\n{improve_request}\n\n页面内容:\n{text}\n\n请根据改进要求提供更好的注释版本。"
            elif current_annotation:
                prompt = f"【注释重新生成任务】\n当前注释:\n{current_annotation}\n\n页面内容:\n{text}\n\n请生成一个更好的注释版本。"
            elif improve_request:
                prompt = f"【注释生成任务】\n用户指导:\n{improve_request}\n\n页面内容:\n{text}\n\n请根据用户指导生成注释。"
            else:
                prompt = f"【注释生成任务】请为以下PDF页面内容生成简洁但有信息量的注释:\n\n{text}"
            
            # 使用异步LLM调用
            return await self._async_call_llm(prompt, task_session_id)
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"文本注释生成失败: {error_str}")
            
            # 检查是否是API相关错误
            if ("Arrearage" in error_str or 
                "Access denied" in error_str or 
                "account is in good standing" in error_str or
                "余额不足" in error_str or
                "API调用错误" in error_str):
                return f"注释生成失败: API账户问题 - {error_str}"
            
            # 检查是否是网络连接问题
            if ("HTTPSConnectionPool" in error_str or 
                "Unable to connect" in error_str or
                "Connection refused" in error_str or
                "网络连接" in error_str):
                return f"注释生成失败: 网络连接问题 - {error_str}"
            
            # 只有在非API错误的情况下才尝试图像识别
            logger.info("文本注释失败但非API/网络错误，尝试图像识别作为备选方案")
            
            try:
                image_path = get_page_image(filename, page_number)
                if image_path:
                    # 构建图像识别上下文
                    context = {}
                    if current_annotation:
                        context['current_annotation'] = current_annotation
                    if improve_request:
                        context['improve_request'] = improve_request
                    
                    # 调用图像处理（暂时使用同步版本）
                    return self.process_image(image_path, context)
                else:
                    raise ValueError(f"无法获取页面{page_number}的图像")
            except Exception as img_error:
                img_error_str = str(img_error)
                logger.error(f"图像注释生成也失败: {img_error_str}")
                
                # 根据错误类型返回更具体的错误信息
                if ("Arrearage" in img_error_str or 
                    "Access denied" in img_error_str or 
                    "account is in good standing" in img_error_str):
                    return f"注释生成失败: API账户余额不足，请充值后重试"
                elif ("HTTPSConnectionPool" in img_error_str or 
                      "Unable to connect" in img_error_str):
                    return f"注释生成失败: 网络连接问题，请检查网络后重试"
                else:
                    return f"注释生成失败: 文本处理错误 - {error_str}, 图像处理错误 - {img_error_str}"

    async def _async_vision_annotation(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步视觉识别注释（带自动改进功能）"""
        filename = params.get("filename", "")
        page_number = params.get("page_number", 1)
        session_id = params.get("session_id")
        current_annotation = params.get("current_annotation")
        improve_request = params.get("improve_request")
        
        logger.info(f"并发视觉识别注释（自动改进版本）: {filename} 第{page_number}页")
        
        # 导入视觉识别功能
        from controller import get_page_image, vision_llm_recognize, get_page_text
        
        try:
            # 第一阶段：图像识别生成初始注释
            logger.info("=== 第一阶段：强制图像识别生成初始注释 ===")
            
            # 获取页面图像
            image_path = get_page_image(filename, page_number)
            if not image_path:
                raise ValueError(f"无法获取页面{page_number}的图像")
            
            # 构建上下文
            context = {
                'board_id': self.board_id,
                'session_id': session_id,
                'page_number': page_number
            }
            
            if current_annotation:
                context['current_annotation'] = current_annotation
            if improve_request:
                context['improve_request'] = improve_request
            
            # 调用视觉识别
            initial_result = vision_llm_recognize(image_path, session_id, filename, context, self.board_id)
            
            # 检查结果是否为错误消息
            if initial_result and (initial_result.startswith("视觉识别失败:") or 
                          initial_result.startswith("视觉识别过程中出错:") or
                          initial_result.startswith("API调用错误：") or
                          "Arrearage" in initial_result or
                          "Access denied" in initial_result or
                          "account is in good standing" in initial_result or
                          "余额不足" in initial_result or
                          "HTTPSConnectionPool" in initial_result or
                          "Unable to connect" in initial_result):
                # 将API失败转换为异常，让任务系统正确处理为失败
                raise Exception(initial_result)
            
            logger.info(f"初始图像识别注释长度: {len(initial_result or '')}")
            
            if not initial_result or initial_result.strip() == "" or initial_result == "无注释内容":
                logger.warning("图像识别未生成有效注释，返回默认错误信息")
                return "图像识别未能生成有效内容，请检查PDF图像或重试"
            
            # 第二阶段：自动改进生成的注释
            logger.info("=== 第二阶段：自动改进初始注释 ===")
            
            try:
                # 读取页面内容作为改进的参考
                page_text = ""
                try:
                    page_text = get_page_text(filename, page_number)
                except Exception as e:
                    logger.warning(f"无法获取页面文本作为参考: {str(e)}")
                
                # 设置默认的改进提示，如果用户没有提供的话
                auto_improve_prompt = improve_request if improve_request else "请优化和完善这个注释，使其更加详细、准确和易于理解。"
                
                logger.info(f"使用改进提示: {auto_improve_prompt}")
                
                # 构建改进提示词
                improve_prompt = f"【自动注释改进任务】\n"
                improve_prompt += f"文件: {filename} 第{page_number}页\n\n"
                improve_prompt += f"初始图像识别注释:\n{initial_result}\n\n"
                improve_prompt += f"改进要求:\n{auto_improve_prompt}\n\n"
                
                if page_text and len(page_text.strip()) > 0:
                    improve_prompt += f"页面文本内容参考:\n{page_text[:1000]}...\n\n"
                
                improve_prompt += "请根据改进要求，对初始图像识别注释进行优化和改进，使其更加准确、清晰、有用。保持注释的准确性，同时增强其可读性和实用性。"
                
                # 使用异步LLM调用进行改进
                improved_result = await self._async_call_llm(improve_prompt, task_session_id)
                
                logger.info(f"改进后注释长度: {len(improved_result or '')}")
                
                # 返回改进后的结果
                logger.info("=== 图像识别+自动改进完成 ===")
                return improved_result
                
            except Exception as improve_error:
                logger.error(f"自动改进注释失败: {str(improve_error)}")
                logger.info("改进失败，返回原始图像识别结果")
                # 如果改进失败，返回原始结果
                return initial_result
            
        except Exception as e:
            logger.error(f"视觉识别注释失败: {str(e)}")
            raise e  # 重新抛出异常，让任务系统正确标记为失败

    async def _async_improve_annotation(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步改进注释"""
        filename = params.get("filename", "")
        page_number = params.get("page_number", 1)
        current_annotation = params.get("current_annotation", "")
        improve_request = params.get("improve_request", "")
        session_id = params.get("session_id")
        
        logger.info(f"并发改进注释: {filename} 第{page_number}页")
        
        # 导入页面文本获取功能
        from controller import get_page_text
        
        try:
            # 获取页面文本作为参考
            page_text = get_page_text(filename, page_number)
            
            # 构建改进提示词
            prompt = f"【注释改进任务】\n"
            prompt += f"文件: {filename} 第{page_number}页\n\n"
            prompt += f"当前注释:\n{current_annotation}\n\n"
            prompt += f"改进要求:\n{improve_request}\n\n"
            prompt += f"页面内容参考:\n{page_text[:1000]}...\n\n"
            prompt += "请根据改进要求，对当前注释进行优化和改进，使其更加准确、清晰、有用。"
            
            # 使用异步LLM调用
            return await self._async_call_llm(prompt, task_session_id)
            
        except Exception as e:
            logger.error(f"改进注释失败: {str(e)}")
            return f"改进注释失败: {str(e)}"

    async def _async_process_image(self, params: Dict[str, Any], task_session_id: str) -> str:
        """异步处理图像"""
        # 这里可以调用现有的process_image方法，或者实现异步版本
        image_path = params.get("image_path", "")
        context = params.get("context")
        
        # 暂时调用同步版本，后续可以改为完全异步
        return self.process_image(image_path, context)

    # 提供便捷的并发任务接口
    async def concurrent_generate_and_improve(self, content: str, improvement_request: str) -> Dict[str, Any]:
        """同时生成笔记和改进笔记"""
        tasks = [
            {
                "type": "generate_note",
                "params": {"content": content, "note_type": "detailed"}
            },
            {
                "type": "improve_note", 
                "params": {
                    "current_note": "正在生成中...",
                    "improvement_request": improvement_request
                }
            }
        ]
        
        results = await self.process_concurrent_tasks(tasks)
        
        return {
            "generated_note": results[0]["result"] if results[0]["success"] else None,
            "improved_note": results[1]["result"] if results[1]["success"] else None,
            "errors": [r["error"] for r in results if not r["success"]]
        }

    async def concurrent_multi_question(self, questions: List[str], context: str = "") -> List[Dict[str, Any]]:
        """同时回答多个问题"""
        tasks = [
            {
                "type": "answer_question",
                "params": {"question": q, "context": context}
            }
            for q in questions
        ]
        
        results = await self.process_concurrent_tasks(tasks)
        
        return [
            {
                "question": questions[i],
                "answer": results[i]["result"] if results[i]["success"] else None,
                "error": results[i].get("error")
            }
            for i in range(len(questions))
        ]

    def cancel_task(self, task_id: str) -> bool:
        """
        取消指定的任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            是否成功取消任务
        """
        with self.context_lock:
            if task_id in self.active_tasks:
                # 移除活跃任务
                task_info = self.active_tasks.pop(task_id)
                
                # 添加到已完成任务列表（标记为已取消）
                self.completed_tasks.append({
                    "task_id": task_id,
                    "task_type": task_info.get("task_type", "unknown"),
                    "started_at": task_info.get("started_at"),
                    "completed_at": time.time(),
                    "duration": time.time() - task_info.get("started_at", time.time()),
                    "success": False,
                    "result": "",
                    "cancelled": True
                })
                
                logger.info(f"任务 {task_id} 已被取消")
                return True
            
            return False

    async def _monitor_task_timeout(self, task_id: str):
        """监控任务超时"""
        timeout = 300  # 设置超时时间为5分钟
        await asyncio.sleep(timeout)  # 直接等待超时时间
        
        # 检查任务是否仍在活跃列表中
        if task_id in self.active_tasks:
            logger.warning(f"任务 {task_id} 已超时（运行时间超过{timeout}秒）")
            
            task_info = self.active_tasks[task_id]
            
            # 添加到已完成任务列表（标记为超时失败）
            self.completed_tasks.append({
                "task_id": task_id,
                "success": False,
                "error": f"任务超时（运行时间超过{timeout}秒）",
                "task_info": task_info.get("task_info", {}),
                "completed_at": time.time(),
                "started_at": task_info.get("started_at", time.time()),
                "timeout": True
            })
            
            # 从活跃任务中移除
            del self.active_tasks[task_id]
            logger.info(f"超时任务 {task_id} 已从活跃列表中移除")

    # 在generate_note方法后添加新的分段生成方法

    def generate_segmented_note(self, filename, pages_text, start_page=1, page_count=40, existing_note=""):
        """
        分段生成PDF笔记
        
        Args:
            filename: PDF文件名
            pages_text: 所有页面的文本内容列表
            start_page: 开始页码（从1开始）
            page_count: 每次生成的页数（默认40页）
            existing_note: 已有的笔记内容
            
        Returns:
            dict: 包含生成的笔记内容、下一段开始页码、是否还有更多内容等信息
        """
        try:
            if len(pages_text) == 0:
                return {
                    "note": "**错误：未找到任何页面内容。** 请重新上传PDF文件或确保文件内容可提取。",
                    "next_start_page": None,
                    "has_more": False,
                    "total_pages": 0,
                    "current_range": f"第{start_page}页"
                }
            
            total_pages = len(pages_text)
            
            # 计算实际的结束页码
            end_page = min(start_page + page_count - 1, total_pages)
            
            # 检查页码范围的有效性
            if start_page > total_pages:
                return {
                    "note": f"**错误：起始页码({start_page})超出PDF总页数({total_pages})。**",
                    "next_start_page": None,
                    "has_more": False,
                    "total_pages": total_pages,
                    "current_range": f"第{start_page}页"
                }
            
            # 提取指定范围的页面内容
            pages_to_process = pages_text[start_page-1:end_page]
            
            # 构建内容样本
            content = "\n\n".join([f"第{i+start_page}页:\n{text[:500]}..." for i, text in enumerate(pages_to_process)])
            
            # 计算是否还有更多内容
            has_more = end_page < total_pages
            next_start_page = end_page + 1 if has_more else None
            
            # 构建页面范围信息
            current_range = f"第{start_page}页-第{end_page}页" if start_page != end_page else f"第{start_page}页"
            
            logger.info(f"正在为 {filename} 生成分段笔记，{current_range}，共处理 {len(pages_to_process)} 页")
            
            # 构建提示词
            if existing_note:
                # 如果有已存在的笔记，提示AI进行续写
                prompt = f"【分段笔记续写任务】为PDF文件 {filename} 的{current_range}生成笔记，并续写到已有笔记后面。\n\n"
                prompt += f"已有笔记内容（前面部分）:\n{existing_note[-1000:]}...\n\n"  # 只显示最后1000字符作为上下文
                prompt += f"当前需要处理的内容（{current_range}）:\n{content}\n\n"
                prompt += f"""请为{current_range}的内容生成笔记，要求：

1. 内容要与前面的笔记保持连贯性和一致性
2. 使用Markdown格式，突出重点和关键概念
3. 在引用重要内容时标注页码，格式为：(第X页) 或 (第X-Y页)
4. 不要重复前面已经总结过的内容
5. 如果当前段落是前面内容的延续，请自然衔接
6. 请只生成{current_range}的笔记内容，不要重复已有笔记

请开始生成{current_range}的笔记："""
            else:
                # 第一次生成笔记
                prompt = f"【分段笔记生成任务】为PDF文件 {filename} 的{current_range}生成笔记。\n\n"
                prompt += f"这是PDF的第一部分内容，文件总共有 {total_pages} 页。\n\n"
                prompt += f"当前处理内容（{current_range}）:\n{content}\n\n"
                prompt += f"""请为{current_range}的内容生成笔记，要求：

1. 使用Markdown格式，突出重点和关键概念
2. 在引用重要内容时标注页码，格式为：(第X页) 或 (第X-Y页)  
3. 生成结构化的内容总结
4. 这是PDF的第一部分，请为后续内容预留良好的结构
5. 请只基于提供的{current_range}内容生成笔记

请开始生成{current_range}的笔记："""
            
            # 记录操作开始
            board_logger.add_operation(
                self.board_id,
                "segmented_note_generation_started",
                {
                    "filename": filename, 
                    "start_page": start_page, 
                    "end_page": end_page,
                    "has_existing_note": bool(existing_note)
                }
            )
            
            # 调用LLM生成笔记
            note_segment = self._call_llm(prompt)
            
            # 检查返回的内容是否为错误信息
            if note_segment.startswith("API调用错误:"):
                logger.error(f"LLM调用失败，返回错误信息: {note_segment}")
                return {
                    "note": f"笔记生成失败: {note_segment}",
                    "next_start_page": next_start_page,
                    "has_more": has_more,
                    "total_pages": total_pages,
                    "current_range": current_range
                }
            
            # 检查返回内容是否过短
            if len(note_segment.strip()) < 50:
                logger.warning(f"LLM返回内容过短 ({len(note_segment)}字符)，可能是不完整的响应")
                return {
                    "note": f"笔记生成可能不完整。请重试或检查网络连接。\n\n部分内容: {note_segment}",
                    "next_start_page": next_start_page,
                    "has_more": has_more,
                    "total_pages": total_pages,
                    "current_range": current_range
                }
            
            # 在笔记开头添加范围信息
            note_with_range = f"**{current_range}内容：**\n\n{note_segment}"
            
            # 记录操作完成
            board_logger.add_operation(
                self.board_id,
                "segmented_note_generated",
                {
                    "filename": filename,
                    "start_page": start_page,
                    "end_page": end_page,
                    "note_length": len(note_segment),
                    "has_more": has_more
                }
            )
            
            return {
                "note": note_with_range,
                "next_start_page": next_start_page,
                "has_more": has_more,
                "total_pages": total_pages,
                "current_range": current_range,
                "pages_processed": len(pages_to_process)
            }
            
        except Exception as e:
            error_msg = f"分段生成笔记时出错: {str(e)}"
            logger.error(error_msg)
            
            return {
                "note": error_msg,
                "next_start_page": None,
                "has_more": False,
                "total_pages": len(pages_text) if pages_text else 0,
                "current_range": f"第{start_page}页"
            }

# 存储专家LLM实例的字典
expert_llm_instances = {}

def get_expert_llm(board_id):
    """获取或创建特定展板的专家LLM实例"""
    if board_id not in expert_llm_instances:
        expert_llm_instances[board_id] = ExpertLLM(board_id)
    return expert_llm_instances[board_id]

def clear_expert_llm(board_id):
    """清除特定展板的专家LLM实例"""
    if board_id in expert_llm_instances:
        del expert_llm_instances[board_id]
        return True
    return False

# 专家LLM注册表，便于跨模块访问
class ExpertLLMRegistry:
    """专家LLM实例注册表，提供静态方法用于获取和管理展板专家LLM实例"""
    
    @staticmethod
    def get_or_create(board_id):
        """
        获取或创建特定展板的专家LLM实例
        
        Args:
            board_id: 展板ID
            
        Returns:
            ExpertLLM实例
        """
        return get_expert_llm(board_id)
    
    @staticmethod
    def clear(board_id):
        """
        清除特定展板的专家LLM实例
        
        Args:
            board_id: 展板ID
            
        Returns:
            是否成功清除
        """
        return clear_expert_llm(board_id)
    
    @staticmethod
    def get_all_instances():
        """
        获取所有专家LLM实例
        
        Returns:
            专家LLM实例字典 {board_id: ExpertLLM实例}
        """
        return expert_llm_instances.copy() 