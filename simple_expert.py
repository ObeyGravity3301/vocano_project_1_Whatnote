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

# 导入任务事件管理器
from task_event_manager import task_event_manager

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
        self.session_id = f"simple_expert_{board_id}_{secrets.token_hex(4)}"
        
        # 任务管理
        self.tasks: Dict[str, Task] = {}
        self.task_queue = asyncio.Queue()
        self.active_tasks: Set[str] = set()
        self.task_results: Dict[str, Dict[str, Any]] = {}
        self.max_concurrent_tasks = 5  # 提高并发上限到5个任务
        
        # 处理器状态
        self._processor_started = False
        self._processor_lock = asyncio.Lock()
        
        # 在初始化时标记需要延迟启动（避免循环依赖）
        self._needs_delayed_start = True
        
        # 对话历史管理
        self.conversation_history = []
        
        logger.info(f"SimpleExpert 初始化完成，展板ID: {board_id}, 最大并发任务数: {self.max_concurrent_tasks}")
        
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
        """执行任务"""
        try:
            logger.info(f"开始执行任务: {task.task_id}, 类型: {task.task_type}")
            task.status = TaskStatus.RUNNING
            task.start_time = time.time()
            
            # 🚀 发送任务开始事件
            await task_event_manager.notify_task_started(
                board_id=self.board_id,
                task_id=task.task_id,
                task_info={
                    "task_type": task.task_type,
                    "description": self._get_task_description(task),
                    "board_id": self.board_id,
                    "params": task.params
                }
            )
            
            # 根据任务类型执行对应的处理
            if task.task_type == "annotation" or task.task_type == "generate_annotation":
                filename = task.params.get('filename')
                page_number = task.params.get('pageNumber', task.params.get('page_number'))
                # 🔧 新增：支持显式传递的风格参数
                annotation_style = task.params.get('annotationStyle')
                custom_prompt = task.params.get('customPrompt')
                result = await self._generate_annotation_task(filename, page_number, annotation_style, custom_prompt)
            elif task.task_type == "vision_annotation":
                result = await self._vision_annotation_task(task.params)
            elif task.task_type == "improve_annotation":
                result = await self._improve_annotation_task(task.params)
            elif task.task_type == "generate_note":
                result = await self._generate_note_task(task.params)
            elif task.task_type == "generate_segmented_note":
                result = await self._generate_segmented_note_task(task.params)
            elif task.task_type == "generate_board_note":
                result = await self._generate_board_note_task(task.params)
            elif task.task_type == "improve_board_note":
                result = await self._improve_board_note_task(task.params)
            elif task.task_type == "answer_question":
                result = await self._ask_question_task(task.params)
            elif task.task_type == "general_query":
                result = await self._general_query_task(task.params)
            else:
                raise ValueError(f"未知的任务类型: {task.task_type}")
            
            # 任务完成
            task.status = TaskStatus.COMPLETED
            task.result = result
            task.end_time = time.time()
            task.duration = task.end_time - task.start_time
            
            # 存储任务结果到task_results以便查询 - 确保所有值都可序列化
            self.task_results[task.task_id] = {
                "status": "completed",
                "result": str(result) if result is not None else "",  # 确保结果是字符串
                "task_type": str(task.task_type),
                "task_id": str(task.task_id),
                "board_id": str(self.board_id),
                "success": True,
                "duration": float(task.duration)
            }
            
            # ✅ 发送任务完成事件
            await task_event_manager.notify_task_completed(
                board_id=self.board_id,
                task_id=task.task_id,
                result=result
            )
            
            logger.info(f"任务完成: {task.task_id}, 耗时: {task.duration:.3f}秒, 结果长度: {len(str(result)) if result else 0}")
            
        except Exception as e:
            # 任务失败
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.end_time = time.time()
            task.duration = task.end_time - task.start_time if task.start_time else 0
            
            # 存储失败结果 - 确保所有值都可序列化
            self.task_results[task.task_id] = {
                "status": "failed",
                "error": str(e),
                "task_type": str(task.task_type),
                "task_id": str(task.task_id),
                "board_id": str(self.board_id),
                "success": False,
                "duration": float(task.duration)
            }
            
            # ❌ 发送任务失败事件
            await task_event_manager.notify_task_failed(
                board_id=self.board_id,
                task_id=task.task_id,
                error=str(e)
            )
            
            logger.error(f"任务失败: {task.task_id}, 错误: {str(e)}, 耗时: {task.duration:.3f}秒")
        
        finally:
            # 从活动任务中移除
            self.active_tasks.discard(task.task_id)
    
    async def _generate_annotation_task(self, filename: str, page_number: int, annotation_style: str = None, custom_prompt: str = None) -> str:
        """
        生成页面注释任务 - 支持多种注释风格
        """
        start_time = time.time()
        
        try:
            logger.info(f"开始注释生成任务: {filename} 第{page_number}页")
            
            # 🔧 修复：处理风格参数 - 优先使用传入参数，否则使用实例设置
            if annotation_style:
                logger.info(f"使用传入的注释风格: {annotation_style}")
                if annotation_style == 'custom' and custom_prompt:
                    logger.info(f"使用传入的自定义提示: {custom_prompt[:100]}...")
            else:
                # 回退到实例设置
                annotation_style = getattr(self, 'annotation_style', 'detailed')
                custom_prompt = getattr(self, 'custom_annotation_prompt', '')
                logger.info(f"使用实例设置的注释风格: {annotation_style}")
            
            # 首先尝试获取PDF文字内容
            try:
                from controller import get_page_text
                page_text = get_page_text(filename, page_number)
                
                if page_text and len(page_text.strip()) > 50:  # 文字内容充足
                    logger.info(f"使用PDF文字生成注释，文字长度: {len(page_text)} 字符")
                    
                    # 根据风格选择提示词模板
                    annotation_prompt = self._get_annotation_prompt(
                        filename, page_number, page_text, annotation_style, custom_prompt
                    )
                    
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
                        
                        logger.info(f"基于文字的注释生成完成，风格: {annotation_style}，长度: {len(annotation_content)} 字符，耗时: {execution_time:.3f}秒")
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
                
                logger.info(f"成功读取页面图像: {img_path}, 图像大小: {len(image_data)} 字符")
                
                # 使用视觉识别生成注释 - 修复模型和API调用格式
                vision_prompt = self._get_vision_annotation_prompt(
                    filename, page_number, annotation_style, custom_prompt
                )
                
                if self.has_llm_client and self.client:
                    logger.info(f"正在调用视觉LLM API进行图像分析，风格: {annotation_style}...")
                    
                    # 使用支持视觉的模型和正确的API格式
                    response = self.client.chat.completions.create(
                        model="qwen-vl-plus",  # 使用支持视觉的模型
                        messages=[
                            {
                                "role": "user", 
                                "content": [
                                    {
                                        "type": "text", 
                                        "text": vision_prompt
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/png;base64,{image_data}"
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens=3000,  # 增加token限制以获得更详细的分析
                        temperature=0.3   # 降低温度以获得更准确的分析
                    )
                    
                    annotation_content = response.choices[0].message.content
                    execution_time = time.time() - start_time
                    
                    logger.info(f"基于图像的注释生成完成，风格: {annotation_style}，长度: {len(annotation_content)} 字符，耗时: {execution_time:.3f}秒")
                    
                    # 验证返回内容是否为通用回复
                    if "无法直接访问" in annotation_content or "推测性" in annotation_content:
                        logger.warning(f"检测到通用回复，可能是视觉识别失败")
                        # 尝试使用文本模式的fallback
                        fallback_prompt = f"""基于PDF文件名"{filename}"第{page_number}页，请生成该页面可能包含的学术注释。这是关于细胞结构与形态学的课程内容。

请提供详细的学术注释，包括：
1. 细胞结构的基本概念
2. 形态学观察要点
3. 相关的实验方法
4. 学习重点和要点

请确保内容准确且具有学术价值。"""
                        
                        fallback_response = self.client.chat.completions.create(
                            model="qwen-plus",
                            messages=[
                                {"role": "system", "content": "你是一个专业的生物学学术助手，擅长细胞结构与形态学内容。"},
                                {"role": "user", "content": fallback_prompt}
                            ],
                            max_tokens=2000,
                            temperature=0.7
                        )
                        
                        annotation_content = f"**注：由于视觉识别限制，以下是基于课程内容的推测性注释**\n\n{fallback_response.choices[0].message.content}"
                    
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
    
    def _get_annotation_prompt(self, filename: str, page_number: int, page_text: str, 
                              style: str, custom_prompt: str = '') -> str:
        """根据风格生成注释提示词"""
        
        base_info = f"""
PDF文件：{filename}
页码：第{page_number}页

页面文字内容：
{page_text}
"""
        
        if style == 'keywords':
            # 风格1：关键词解释，中英对照
            return f"""{base_info}

请为以上PDF页面内容生成关键词解释注释，要求：

1. **提取关键概念**：识别页面中的重要学术概念、专业术语
2. **中英对照**：提供中文概念对应的英文术语
3. **简洁解释**：每个关键词提供1-2句简明解释
4. **分类整理**：按主题或重要性分类排列

输出格式：
## 关键概念

### [主题分类]
- **[中文术语]** (*English Term*): 简洁解释
- **[中文术语]** (*English Term*): 简洁解释

请开始分析："""
            
        elif style == 'translation':
            # 风格2：单纯翻译文本内容
            return f"""{base_info}

请将以上PDF页面的文字内容进行准确翻译和整理，要求：

1. **完整翻译**：将页面内容翻译成流畅的中文
2. **保持结构**：保留原文的段落和层次结构
3. **术语统一**：专业术语保持一致性
4. **标注原文**：重要术语标注英文原文

输出格式：
## 页面内容翻译

[翻译后的完整内容，保持原有结构]

请开始翻译："""
            
        elif style == 'custom':
            # 风格4：自定义提示词
            if custom_prompt:
                return f"""{base_info}

用户自定义要求：
{custom_prompt}

请根据用户的自定义要求为以上内容生成注释："""
            else:
                # 如果没有自定义提示词，回退到详细风格
                return self._get_annotation_prompt(filename, page_number, page_text, 'detailed')
                
        else:  # 'detailed' 或默认
            # 风格3：详细学术注释（原来的风格）
            return f"""{base_info}

请为以下PDF页面内容生成详细的学术注释：

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

请开始生成注释："""
    
    def _get_vision_annotation_prompt(self, filename: str, page_number: int, 
                                    style: str, custom_prompt: str = '') -> str:
        """根据风格生成视觉识别注释提示词"""
        
        base_info = f"""请仔细分析这个PDF页面图像：

PDF文件：{filename}
页码：第{page_number}页
"""
        
        if style == 'keywords':
            return f"""{base_info}

请基于图像内容生成关键词解释注释，要求：

1. **识别关键概念**：从图像中识别重要学术概念、专业术语
2. **中英对照**：提供识别出的中文概念对应的英文术语
3. **简洁解释**：每个关键词提供1-2句简明解释
4. **图表分析**：如有图表，解释其含义

输出格式：
## 关键概念

### [主题分类]
- **[中文术语]** (*English Term*): 简洁解释

注意：请基于图像中的实际内容进行分析。"""
            
        elif style == 'translation':
            return f"""{base_info}

请将图像中的文字内容进行识别和翻译，要求：

1. **文字识别**：准确识别图像中的所有文字内容
2. **完整翻译**：将内容翻译成流畅的中文
3. **结构保持**：保留原有的布局和层次
4. **图表说明**：对图表进行文字描述

输出格式：
## 页面内容识别与翻译

[识别并翻译的完整内容]

注意：请基于图像中的实际内容进行分析。"""
            
        elif style == 'custom':
            if custom_prompt:
                return f"""{base_info}

用户自定义要求：
{custom_prompt}

请根据用户的自定义要求分析图像并生成注释。

注意：请基于图像中的实际内容进行分析。"""
            else:
                return self._get_vision_annotation_prompt(filename, page_number, 'detailed')
                
        else:  # 'detailed' 或默认
            return f"""{base_info}

请基于图像中的实际内容进行分析，包括：
1. 识别并转录页面中的所有文字内容
2. 分析图表、公式、示意图等视觉元素
3. 提取重要概念和知识点
4. 理解内容的结构层次关系

请提供详细的学术注释，包括：
- 页面内容的完整总结
- 关键概念的深入解释
- 重要知识点的强调
- 学习建议和记忆要点

注意：请基于图像中的实际内容进行分析，不要使用推测性内容。"""
    
    def set_annotation_style(self, style: str, custom_prompt: str = ''):
        """设置注释风格"""
        self.annotation_style = style
        self.custom_annotation_prompt = custom_prompt
        logger.info(f"展板 {self.board_id} 注释风格已设置为: {style}")
        if style == 'custom' and custom_prompt:
            logger.info(f"自定义提示词: {custom_prompt[:100]}...")
    
    def get_annotation_style(self) -> Dict[str, str]:
        """获取当前注释风格"""
        return {
            "style": getattr(self, 'annotation_style', 'detailed'),
            "custom_prompt": getattr(self, 'custom_annotation_prompt', '')
        }
    
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
    
    async def _vision_annotation_task(self, params: Dict[str, Any]) -> str:
        """视觉识别注释任务"""
        filename = params.get('filename')
        page_number = params.get('pageNumber', params.get('page_number'))
        session_id = params.get('sessionId', params.get('session_id'))
        current_annotation = params.get('currentAnnotation', params.get('current_annotation', ''))
        improve_request = params.get('improveRequest', params.get('improve_request', ''))
        
        logger.info(f"👁️ 视觉识别注释任务: {filename} 第{page_number}页, 会话ID: {session_id}")
        
        # 调用视觉识别API
        response = await self.http_client.post(
            f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/vision-annotate",
            json={
                "current_annotation": current_annotation,
                "improve_request": improve_request,
                "board_id": self.board_id,
                "session_id": session_id
            },
            timeout=90.0  # 视觉识别可能需要更长时间
        )
        
        if response.status_code == 200:
            data = response.json()
            # 提取注释内容
            annotation_content = data.get("annotation", "")
            logger.info(f"✅ 视觉识别注释成功，返回内容长度: {len(annotation_content)}")
            return annotation_content
        else:
            error_msg = f"视觉识别注释失败: {response.status_code}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    async def _generate_note_task(self, params: Dict[str, Any]) -> str:
        """生成笔记任务 - 恢复原来的40页限制和页码标注功能"""
        filename = params.get('filename')
        content = params.get('content', '')
        
        try:
            if filename:
                # 生成PDF笔记 - 读取实际PDF内容，恢复40页限制和页码标注
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
                                pages_text.append(page_content)
                    except Exception as e:
                        logger.warning(f"读取页面文件失败: {page_file}, 错误: {str(e)}")
                    i += 1
                
                if not pages_text:
                    error_msg = f"未找到PDF页面内容文件: {filename}"
                    logger.error(error_msg)
                    return error_msg
                
                # 应用40页限制和页码标注逻辑
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
                
                # 构建带页码标注的内容样本
                content_samples = []
                for i, text in enumerate(pages_used):
                    if total_pages <= 40:
                        # 使用全部页面时，页码是连续的
                        page_num = i + 1
                    else:
                        # 使用前后20页时，需要正确计算页码
                        if i < front_pages:
                            page_num = i + 1
                        else:
                            page_num = total_pages - back_pages + (i - front_pages) + 1
                    
                    # 限制每页内容长度，但保留足够信息
                    page_preview = text[:500] if len(text) > 500 else text
                    content_samples.append(f"第{page_num}页:\n{page_preview}...")
                
                content = "\n\n".join(content_samples)
                logger.info(f"成功读取PDF内容，总页数: {total_pages}，使用页数: {len(pages_used)}，总长度: {len(content)}字符")
                
                # 生成笔记的提示词 - 恢复页码标注要求
                query = f"""请为以下PDF文档生成一份完整的笔记。

文档有 {total_pages} 页，以下是部分内容示例:
{content}

请生成一份完整的笔记，包括主要内容的结构化总结，使用Markdown格式，突出重点和关键概念。
注意：只基于提供的内容生成笔记，不要添加未在原文中提及的信息。

重要要求：
1. 在笔记中引用重要内容时，请标注相应的页码，格式为：(第X页) 或 (第X-Y页)
2. 例如："该理论的核心观点是... (第3页)"
3. 对于跨越多页的内容，可以标注页码范围："详细推导过程见原文 (第5-7页)"
4. 确保页码标注准确，便于读者定位原文

请开始生成笔记："""
                
                note_content = await self.process_query(query)
                
                if note_content and len(note_content) > 50:
                    # 在笔记开头添加页数引用信息
                    note_content_with_range = f"{page_range_info}\n\n{note_content}"
                    
                    logger.info(f"成功生成PDF笔记，长度: {len(note_content_with_range)}")
                    return note_content_with_range
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
        if task_id in self.task_results:
            result = self.task_results[task_id].copy()  # 创建副本避免修改原数据
            
            # 确保所有字段都是可序列化的
            for key, value in result.items():
                if value is not None:
                    result[key] = str(value) if not isinstance(value, (str, int, float, bool, list, dict)) else value
            
            return result
        
        # 检查活动任务
        if task_id in self.active_tasks:
            task_info = self.active_tasks[task_id]
            return {
                "status": "running",
                "task_id": str(task_id),
                "task_type": str(task_info.get("task_type", "unknown")),
                "board_id": str(self.board_id),
                "success": None
            }
        
        return None
    
    def get_concurrent_status(self) -> Dict[str, Any]:
        """获取并发状态"""
        active_count = len(self.active_tasks)
        completed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.COMPLETED])
        failed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.FAILED])
        pending_count = len([t for t in self.tasks.values() if t.status == TaskStatus.PENDING])
        
        # 获取活跃任务的详细信息
        active_task_details = []
        for task_id in self.active_tasks:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                # 计算任务运行时间
                duration = 0
                if hasattr(task, 'start_time') and task.start_time:
                    duration = time.time() - task.start_time
                
                # 构建任务详情
                task_detail = {
                    "task_id": task_id,
                    "task_type": task.task_type,
                    "status": task.status.value if hasattr(task.status, 'value') else str(task.status),
                    "duration": duration,
                    "started_at": task.started_at.isoformat() if hasattr(task, 'started_at') and task.started_at else None,
                    "description": self._get_task_description(task)
                }
                active_task_details.append(task_detail)
        
        return {
            "active_tasks": active_count,
            "max_concurrent_tasks": self.max_concurrent_tasks,
            "completed_tasks": completed_count,
            "failed_tasks": failed_count,
            "pending_tasks": pending_count,
            "total_tasks": len(self.tasks),
            "active_task_ids": list(self.active_tasks),
            "active_task_details": active_task_details  # 添加详细任务信息
        }
    
    def _get_task_description(self, task: Task) -> str:
        """获取任务的友好描述"""
        task_type = task.task_type
        params = task.params
        
        if task_type == "annotation":
            filename = params.get('filename', '未知文件')
            page_number = params.get('pageNumber', params.get('page_number', '未知页'))
            return f"为 {filename} 第{page_number}页生成注释"
        elif task_type == "improve_annotation":
            filename = params.get('filename', '未知文件')
            page_number = params.get('pageNumber', params.get('page_number', '未知页'))
            return f"改进 {filename} 第{page_number}页的注释"
        elif task_type == "vision_annotation":
            filename = params.get('filename', '未知文件')
            page_number = params.get('pageNumber', params.get('page_number', '未知页'))
            return f"视觉识别 {filename} 第{page_number}页"
        elif task_type == "generate_note":
            filename = params.get('filename', '未知文件')
            return f"为 {filename} 生成笔记"
        elif task_type == "generate_segmented_note":
            filename = params.get('filename', '未知文件')
            start_page = params.get('start_page', 1)
            pages_per_segment = params.get('pages_per_segment', 40)
            return f"为 {filename} 分段生成笔记（从第{start_page}页开始，{pages_per_segment}页一段）"
        elif task_type == "generate_board_note":
            return "生成展板笔记"
        elif task_type == "improve_board_note":
            return "改进展板笔记"
        elif task_type == "answer_question":
            question = params.get('question', '问题')
            return f"回答问题：{question[:50]}..."
        elif task_type == "general_query":
            query = params.get('query', '查询')
            return f"处理查询：{query[:50]}..."
        else:
            return f"执行{task_type}任务"
    
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

    async def _generate_board_note_task(self, params: Dict[str, Any]) -> str:
        """
        生成展板笔记任务 - 根据展板内所有PDF笔记生成综合笔记
        """
        start_time = time.time()
        logger.info(f"🔄 [BOARD-NOTE] 开始生成展板笔记，展板ID: {self.board_id}")
        
        try:
            # 从任务参数中获取笔记内容
            notes_content = params.get('notes_content', '')
            pdf_count = params.get('pdf_count', 0)
            board_id = params.get('board_id', self.board_id)
            
            if not notes_content or not notes_content.strip():
                logger.warning(f"⚠️ [BOARD-NOTE] 展板笔记内容为空，无法生成")
                return "展板内没有足够的笔记内容用于生成综合笔记，请先为PDF文件生成笔记。"
            
            logger.info(f"📋 [BOARD-NOTE] 处理 {pdf_count} 个PDF的笔记内容，总长度: {len(notes_content)} 字符")
            
            # 构建展板笔记生成的提示词
            board_note_prompt = f"""
请为以下展板内容生成一份综合性的总结笔记。

展板ID: {board_id}
包含PDF文件数量: {pdf_count}

展板内所有PDF文件的笔记内容:
{notes_content}

请生成一份展板总结笔记，要求：
1. 整合所有PDF文件的核心内容
2. 提取共同主题和知识点
3. 建立不同文件间的关联
4. 突出重点概念和要点
5. 提供学习建议和总结

注意：
- 使用Markdown格式
- 结构清晰，层次分明
- 避免简单罗列，要有深度分析
- 突出整体性和关联性
- 适合作为复习和学习的总结材料

请开始生成展板总结笔记：
"""
            
            if self.has_llm_client and self.client:
                logger.info(f"🤖 [BOARD-NOTE] 使用LLM生成展板笔记")
                
                response = self.client.chat.completions.create(
                    model="qwen-plus",
                    messages=[
                        {"role": "system", "content": "你是一个专业的学术助手，擅长整合多个文档的内容并生成高质量的综合性笔记。"},
                        {"role": "user", "content": board_note_prompt}
                    ],
                    max_tokens=4000,  # 展板笔记可能比较长
                    temperature=0.7
                )
                
                board_note_content = response.choices[0].message.content
                execution_time = time.time() - start_time
                
                # 在开头添加展板信息和生成时间
                final_content = f"""# 展板总结笔记

**展板ID**: {board_id}  
**PDF文件数量**: {pdf_count}  
**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

{board_note_content}

---

*本笔记由AI根据展板内 {pdf_count} 个PDF文件的笔记综合生成*
"""
                
                logger.info(f"✅ [BOARD-NOTE] 展板笔记生成完成，最终长度: {len(final_content)} 字符，耗时: {execution_time:.3f}秒")
                return final_content
                
            else:
                logger.warning(f"⚠️ [BOARD-NOTE] LLM客户端不可用")
                return "LLM服务不可用，无法生成展板笔记。"
                
        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = f"展板笔记生成失败: {str(e)}"
            logger.error(f"❌ [BOARD-NOTE] {error_msg}，耗时: {execution_time:.3f}秒", exc_info=True)
            return error_msg
    
    async def _improve_board_note_task(self, params: Dict[str, Any]) -> str:
        """
        改进展板笔记任务
        """
        start_time = time.time()
        logger.info(f"🔄 [BOARD-NOTE-IMPROVE] 开始改进展板笔记，展板ID: {self.board_id}")
        
        try:
            # 从任务参数中获取内容
            content = params.get('content', '')
            improve_prompt = params.get('improve_prompt', '')
            board_id = params.get('board_id', self.board_id)
            
            if not content or not content.strip():
                logger.warning(f"⚠️ [BOARD-NOTE-IMPROVE] 展板笔记内容为空，无法改进")
                return "展板笔记内容为空，无法进行改进。"
            
            logger.info(f"📝 [BOARD-NOTE-IMPROVE] 改进展板笔记，内容长度: {len(content)} 字符，改进提示: {improve_prompt}")
            
            # 构建展板笔记改进的提示词
            improve_board_note_prompt = f"""
请根据用户要求改进以下展板笔记：

用户改进要求: {improve_prompt}

当前展板笔记内容:
{content}

请根据用户的改进要求，对展板笔记进行优化和改进。保持原有的核心内容和结构，同时：
1. 根据用户要求调整内容重点
2. 改善表达方式和结构
3. 增加或调整必要的细节
4. 保持Markdown格式
5. 确保改进后的内容更加清晰和有用

请提供改进后的展板笔记：
"""
            
            if self.has_llm_client and self.client:
                logger.info(f"🤖 [BOARD-NOTE-IMPROVE] 使用LLM改进展板笔记")
                
                response = self.client.chat.completions.create(
                    model="qwen-plus",
                    messages=[
                        {"role": "system", "content": "你是一个专业的学术助手，擅长根据用户要求改进和优化笔记内容。"},
                        {"role": "user", "content": improve_board_note_prompt}
                    ],
                    max_tokens=4000,
                    temperature=0.7
                )
                
                improved_content = response.choices[0].message.content
                execution_time = time.time() - start_time
                
                logger.info(f"✅ [BOARD-NOTE-IMPROVE] 展板笔记改进完成，改进后长度: {len(improved_content)} 字符，耗时: {execution_time:.3f}秒")
                return improved_content
                
            else:
                logger.warning(f"⚠️ [BOARD-NOTE-IMPROVE] LLM客户端不可用")
                return content  # 返回原内容
                
        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = f"展板笔记改进失败: {str(e)}"
            logger.error(f"❌ [BOARD-NOTE-IMPROVE] {error_msg}，耗时: {execution_time:.3f}秒", exc_info=True)
            return content  # 出错时返回原内容

    async def _generate_segmented_note_task(self, params: Dict[str, Any]) -> str:
        """分段生成PDF笔记任务"""
        filename = params.get('filename')
        start_page = params.get('start_page', 1)
        page_count = params.get('page_count', 40)
        existing_note = params.get('existing_note', '')
        
        if not filename:
            raise ValueError("缺少filename参数")
        
        logger.info(f"开始分段生成PDF笔记: {filename}, 起始页: {start_page}, 页数: {page_count}, 已有笔记: {len(existing_note)}字符")
        
        try:
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
                        pages_text.append(page_content)  # 保留空页面以保持页码一致
                except Exception as e:
                    logger.warning(f"读取页面文件失败: {page_file}, 错误: {str(e)}")
                    pages_text.append("")  # 添加空字符串占位
                i += 1
            
            if not pages_text:
                return f"错误：未找到PDF页面内容文件: {filename}"
            
            total_pages = len(pages_text)
            
            # 计算实际的结束页码
            end_page = min(start_page + page_count - 1, total_pages)
            
            # 检查页码范围的有效性
            if start_page > total_pages:
                return f"错误：起始页码({start_page})超出PDF总页数({total_pages})"
            
            # 提取指定范围的页面内容
            pages_to_process = pages_text[start_page-1:end_page]
            
            # 过滤掉空页面但保留页码信息
            valid_pages = []
            for i, page_content in enumerate(pages_to_process):
                page_num = start_page + i
                if page_content.strip():
                    valid_pages.append((page_num, page_content))
            
            if not valid_pages:
                return f"错误：指定范围({start_page}-{end_page}页)内没有有效内容"
            
            # 构建内容样本
            content_samples = []
            for page_num, page_content in valid_pages:
                page_preview = page_content[:500] if len(page_content) > 500 else page_content
                content_samples.append(f"第{page_num}页:\n{page_preview}...")
            
            content = "\n\n".join(content_samples)
            
            # 计算是否还有更多内容
            has_more = end_page < total_pages
            next_start_page = end_page + 1 if has_more else None
            
            # 构建页面范围信息
            current_range = f"第{start_page}页-第{end_page}页" if start_page != end_page else f"第{start_page}页"
            
            logger.info(f"处理{current_range}，有效页面数: {len(valid_pages)}")
            
            # 构建提示词
            if existing_note:
                # 如果有已存在的笔记，提示AI进行续写
                query = f"""【分段笔记续写任务】为PDF文件 {filename} 的{current_range}生成笔记，并续写到已有笔记后面。

已有笔记内容（前面部分）:
{existing_note[-1000:]}...

当前需要处理的内容（{current_range}）:
{content}

请为{current_range}的内容生成笔记，要求：

1. 内容要与前面的笔记保持连贯性和一致性
2. 使用Markdown格式，突出重点和关键概念
3. 在引用重要内容时标注页码，格式为：(第X页) 或 (第X-Y页)
4. 不要重复前面已经总结过的内容
5. 如果当前段落是前面内容的延续，请自然衔接
6. 请只生成{current_range}的笔记内容，不要重复已有笔记

请开始生成{current_range}的笔记："""
            else:
                # 第一次生成笔记
                query = f"""【分段笔记生成任务】为PDF文件 {filename} 的{current_range}生成笔记。

这是PDF的第一部分内容，文件总共有 {total_pages} 页。

当前处理内容（{current_range}）:
{content}

请为{current_range}的内容生成笔记，要求：

1. 使用Markdown格式，突出重点和关键概念
2. 在引用重要内容时标注页码，格式为：(第X页) 或 (第X-Y页)  
3. 生成结构化的内容总结
4. 这是PDF的第一部分，请为后续内容预留良好的结构
5. 请只基于提供的{current_range}内容生成笔记

请开始生成{current_range}的笔记："""
            
            # 调用LLM生成笔记
            note_segment = await self.process_query(query)
            
            # 检查返回内容
            if not note_segment or len(note_segment.strip()) < 50:
                return f"笔记生成可能不完整。内容: {note_segment}"
            
            # 构建返回结果
            result = {
                "note": f"**{current_range}内容：**\n\n{note_segment}",
                "next_start_page": int(next_start_page) if next_start_page is not None else None,
                "has_more": bool(has_more),
                "total_pages": int(total_pages),
                "current_range": str(current_range),
                "pages_processed": int(len(valid_pages)),
                "start_page": int(start_page),
                "end_page": int(end_page)
            }
            
            logger.info(f"分段笔记生成完成: {current_range}, 笔记长度: {len(note_segment)}, 还有更多: {has_more}")
            
            # 返回JSON字符串，因为任务结果需要是字符串格式
            import json
            return json.dumps(result, ensure_ascii=False)
            
        except Exception as e:
            error_msg = f"分段生成笔记时出错: {str(e)}"
            logger.error(error_msg)
            return json.dumps({
                "note": str(error_msg),
                "next_start_page": None,
                "has_more": False,
                "total_pages": int(len(pages_text)) if 'pages_text' in locals() else 0,
                "current_range": f"第{start_page}页",
                "error": True
            }, ensure_ascii=False)

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