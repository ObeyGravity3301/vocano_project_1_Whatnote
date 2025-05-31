import os
import json
import logging
import requests
import uuid
import time
import datetime
from config import QWEN_API_KEY, API_TIMEOUT
from board_logger import board_logger
from conversation_manager import conversation_manager
import expert_llm
import llm_agents  # 导入LLM交互模块
from typing import Dict, List, Any, Optional, Union
from llm_logger import LLMLogger  # 导入LLM日志记录器

logger = logging.getLogger(__name__)

class ButlerLLM:
    """
    管家LLM，负责全局操作和多展板协调
    """
    
    def __init__(self):
        """初始化管家LLM"""
        # 创建管家LLM的独立会话ID
        self.session_id = f"butler_{uuid.uuid4()}"
        self.butler_log_file = "butler_log.json"
        
        # 添加多步操作状态追踪 - 确保在任何方法调用前初始化
        self.multi_step_context = {
            "active": False,
            "task": None,
            "plan": None,
            "steps": [],
            "commands": [],
            "current_step": 0,
            "previous_result": None,
            "results": []
        }
        
        # 初始化管家日志
        self._init_butler_log()
        
        # 初始化管家对话
        self._init_butler_conversation()
    
    def _init_butler_log(self):
        """初始化管家日志"""
        if os.path.exists(self.butler_log_file):
            try:
                with open(self.butler_log_file, 'r', encoding='utf-8') as f:
                    self.butler_log = json.load(f)
            except Exception as e:
                logger.error(f"加载管家日志失败: {str(e)}")
                self._create_new_butler_log()
        else:
            self._create_new_butler_log()
    
    def _create_new_butler_log(self):
        """创建新的管家日志"""
        self.butler_log = {
            "app_state": "initialized",
            "file_structure": {},
            "boards": {},
            "user_preferences": {},
            "recent_operations": []
        }
        self._save_butler_log()
    
    def _save_butler_log(self):
        """保存管家日志"""
        try:
            with open(self.butler_log_file, 'w', encoding='utf-8') as f:
                json.dump(self.butler_log, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存管家日志失败: {str(e)}")
    
    def _init_butler_conversation(self):
        """初始化管家对话"""
        # 构建系统提示词
        system_prompt = self._get_system_prompt()
        
        # 初始化对话
        conversation_manager.add_message(
            self.session_id, 
            "global", 
            "system", 
            system_prompt
        )
        
        # 添加初始化消息，但不实际调用API
        conversation_manager.add_message(
            self.session_id,
            "global",
            "user",
            "初始化管家LLM，请提供应用概览。"
        )
        
        # 添加模拟的初始响应，避免初始化时调用API
        init_response = "WhatNote已启动，管家LLM初始化完成。"
        conversation_manager.add_message(
            self.session_id,
            "global",
            "assistant",
            init_response
        )
        
        # 记录到管家日志
        self.add_operation("butler_initialized", {"session_id": self.session_id})
    
    def _get_system_prompt(self):
        """获取管家LLM的系统提示词"""
        # 获取当前文件结构信息
        file_structure_summary = self.butler_log.get("file_structure_summary", {})
        course_folders = file_structure_summary.get("course_folder_list", [])
        pdf_files = file_structure_summary.get("pdf_list", [])
        
        # 构建文件结构描述
        file_structure_description = ""
        if course_folders or pdf_files:
            file_structure_description = "\n\n【当前文件结构信息】\n"
            if course_folders:
                file_structure_description += f"课程文件夹: {', '.join(course_folders)}\n"
            if pdf_files:
                file_structure_description += f"PDF文件: {', '.join(pdf_files)}\n"
        
        base_prompt = """你是WhatNote应用的管家LLM，负责全局操作和多展板协调。

你的主要职责包括：
1. 管理文件结构（课程文件夹、章节展板）
2. 协调各展板的专家LLM
3. 处理跨展板的操作请求
4. 回答用户关于应用使用的问题
5. 执行用户请求的复杂任务

你拥有以下能力:
1. 查看和修改文件结构
2. 创建和管理展板
3. 与专家LLM通信
4. 执行多步骤操作，但每步操作前需获得用户确认

执行操作时，你应该：
1. 分析用户请求，确定所需的操作步骤
2. 提供明确的操作计划
3. 等待用户确认后执行每一步
4. 根据操作结果调整后续步骤
5. 记住前序命令的执行结果，保持操作连贯性

多步操作时，你需要：
1. 清晰记住当前处于哪一步
2. 每一步的执行结果要传递给下一步
3. 在用户确认完一个步骤后，询问是否继续执行下一步
4. 根据前序步骤结果动态调整后续步骤计划

请保持专业、高效、友好的态度，协助用户完成各种任务。"""
        
        # 组合基础提示和文件结构信息
        return base_prompt + file_structure_description
    
    def add_operation(self, operation_type, data=None):
        """添加操作到管家日志"""
        if "recent_operations" not in self.butler_log:
            self.butler_log["recent_operations"] = []
            
        import datetime
        operation = {
            "type": operation_type,
            "timestamp": datetime.datetime.now().isoformat(),
            "data": data or {}
        }
        
        self.butler_log["recent_operations"].append(operation)
        
        # 限制操作历史记录数量
        if len(self.butler_log["recent_operations"]) > 100:
            self.butler_log["recent_operations"] = self.butler_log["recent_operations"][-100:]
            
        self._save_butler_log()
    
    def update_file_structure(self, file_structure):
        """更新文件结构信息"""
        # 保存完整的文件结构
        self.butler_log["file_structure"] = file_structure
        
        # 创建简化版信息用于LLM提示
        summary = {
            "course_folders": len(file_structure.get("course_folders", [])),
            "boards": len(file_structure.get("boards", [])),
            "uploaded_files": len(file_structure.get("uploaded_files", [])),
            "course_folder_list": [folder.get("name") for folder in file_structure.get("course_folders", [])],
            "pdf_list": [file.get("filename") for file in file_structure.get("uploaded_files", [])]
        }
        
        self.butler_log["file_structure_summary"] = summary
        self._save_butler_log()
        
        # 记录操作
        self.add_operation("file_structure_updated", {
            "course_folders": len(file_structure.get("course_folders", [])),
            "boards": len(file_structure.get("boards", [])),
            "uploaded_files": len(file_structure.get("uploaded_files", []))
        })
    
    def update_board_info(self, board_id):
        """更新特定展板的信息"""
        board_summary = board_logger.get_board_summary(board_id)
        
        if "boards" not in self.butler_log:
            self.butler_log["boards"] = {}
            
        self.butler_log["boards"][board_id] = board_summary
        self._save_butler_log()
        
        # 记录操作
        self.add_operation("board_info_updated", {"board_id": board_id})
    
    def process_user_request(self, request, status_log=None):
        """
        处理用户请求
        
        Args:
            request: 用户请求内容
            status_log: 当前应用状态日志（可选）
            
        Returns:
            处理结果和可能的操作命令
        """
        # 构建提示词
        prompt = f"【用户请求】{request}\n\n"
        
        # 添加状态信息
        if status_log:
            prompt += f"当前应用状态:\n{status_log}\n\n"
            
        # 添加可用的操作命令提示
        prompt += """你可以执行以下类型的操作:
1. 导航操作: next_page, prev_page, goto_page
2. 窗口操作: open_window, close_window, close_all
3. 内容生成: generate_note, generate_annotation, vision_annotate
4. 文件操作: select_pdf, upload_pdf
5. 展板操作: create_board, open_board, close_board
6. 与专家LLM交互: consult_expert
7. 多步任务: plan_task, execute_step

如果需要执行操作，请在回复中包含JSON格式的操作命令。
例如: {"type": "navigation", "action": "next_page"}
或带参数的: {"type": "navigation", "action": "goto_page", "params": {"page": 5}}

如果用户请求需要多步操作，请使用plan_task命令规划任务。
例如: {"type": "task", "action": "plan_task", "params": {"task": "创建学习计划"}}

如果不需要执行操作，直接提供信息性回复即可。"""
        
        # 调用LLM
        response = self._call_llm(prompt)
        
        # 记录操作
        self.add_operation("user_request_processed", {
            "request_preview": request[:50] + "..." if len(request) > 50 else request
        })
        
        # 尝试从回复中提取操作命令
        command = self._extract_command_json(response)
        
        return {
            "response": self._clean_response_json(response),
            "command": command
        }
    
    def _extract_command_json(self, response):
        """从回复中提取JSON格式的操作命令"""
        import re
        import json
        
        # 尝试寻找JSON格式的命令
        json_pattern = r'({[\s\S]*?})'
        json_matches = re.findall(json_pattern, response)
        
        for match in json_matches:
            try:
                cmd = json.loads(match)
                # 检查是否包含必要的命令字段
                if isinstance(cmd, dict) and "type" in cmd and "action" in cmd:
                    return cmd
            except:
                pass
                
        # 如果没有找到有效的JSON命令，返回None
        return None
    
    def _clean_response_json(self, response):
        """清理回复，移除JSON命令部分"""
        import re
        
        # 移除JSON格式的命令
        cleaned = re.sub(r'```json\s*({[\s\S]*?})\s*```', '', response)
        cleaned = re.sub(r'({[\s\S]*?})', '', cleaned)
        
        # 清理多余的空行和空格
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        cleaned = cleaned.strip()
        
        return cleaned
    
    def consult_expert(self, board_id, question, context=None):
        """
        咨询专家LLM
        
        Args:
            board_id: 展板ID
            question: 问题内容
            context: 上下文信息（可选）
            
        Returns:
            专家LLM的回复
        """
        # 获取展板的专家LLM
        from expert_llm import ExpertLLMRegistry
        expert = ExpertLLMRegistry.get_or_create(board_id)
        
        if not expert:
            error_msg = f"无法获取展板 {board_id} 的专家LLM"
            logger.error(error_msg)
            return error_msg
        
        # 添加咨询前缀和上下文
        expert_prompt = f"【管家LLM咨询】{question}"
        
        if context:
            expert_prompt += f"\n\n上下文信息:\n{context}"
        
        # 获取专家回复
        expert_response = expert.process_user_message(expert_prompt)
        
        # 记录操作
        self.add_operation("expert_consulted", {
            "board_id": board_id,
            "question_preview": question[:50] + "..." if len(question) > 50 else question
        })
        
        return expert_response
    
    def plan_multi_step_task(self, task_description, context=None):
        """
        规划多步骤任务
        
        Args:
            task_description: 任务描述
            context: 任务上下文（可选）
            
        Returns:
            任务计划
        """
        # 构建提示词
        prompt = f"【多步骤任务规划】用户任务: {task_description}\n\n"
        
        if context:
            prompt += f"任务上下文:\n{context}\n\n"
            
        prompt += """请制定一个分步骤的计划来完成这个任务。每个步骤应该清晰可执行，格式如下:

步骤 1: [步骤描述]
- 操作类型: [操作类型，如文件操作、展板操作、内容生成等]
- 操作: [具体操作，如创建课程文件夹、生成笔记等]
- 需要的信息: [此步骤需要的信息]
- 预期结果: [此步骤完成后的结果]

步骤 2: ...

请确保步骤之间有逻辑连贯性，且每个步骤都需要用户确认才能执行。
如果某些步骤需要与特定展板的专家LLM协作，请明确说明。
同时，请提供第一步具体的执行建议和所需的JSON命令格式。

对于需要执行的操作，请提供JSON格式的命令示例，例如:
{"type": "file_operation", "action": "create_course_folder", "params": {"folder_name": "课程名称"}}
"""
        
        # 调用LLM
        plan = self._call_llm(prompt)
        
        # 解析步骤和命令
        steps = self._parse_steps(plan)
        commands = self._extract_commands_from_plan(plan)
        
        # 设置多步操作上下文
        self.multi_step_context = {
            "active": True,
            "task": task_description,
            "plan": plan,
            "steps": steps,
            "commands": commands,
            "current_step": 0,
            "previous_result": None,
            "results": []
        }
        
        # 记录操作
        self.add_operation("task_planned", {
            "task": task_description, 
            "steps_count": len(steps)
        })
        
        return {
            "plan": plan,
            "steps": steps,
            "commands": commands
        }
    
    def _extract_commands_from_plan(self, plan):
        """从计划文本中提取命令"""
        import re
        import json
        
        commands = []
        
        # 查找JSON格式的命令
        json_pattern = r'({[\s\S]*?})'
        json_matches = re.findall(json_pattern, plan)
        
        for match in json_matches:
            try:
                cmd = json.loads(match)
                if isinstance(cmd, dict) and "type" in cmd and "action" in cmd:
                    commands.append(cmd)
            except:
                pass
        
        return commands
    
    def _parse_steps(self, plan):
        """从计划文本中解析出步骤列表"""
        import re
        steps = []
        
        # 匹配"步骤 X: "模式
        step_pattern = re.compile(r'步骤\s*(\d+):\s*(.*?)(?=步骤\s*\d+:|$)', re.DOTALL)
        matches = step_pattern.findall(plan)
        
        for step_num, step_content in matches:
            steps.append({
                "number": int(step_num),
                "description": step_content.strip()
            })
        
        return sorted(steps, key=lambda x: x["number"])
    
    def execute_step(self, step_description, previous_result=None, step_index=None):
        """
        执行任务中的一个步骤
        
        Args:
            step_description: 步骤描述
            previous_result: 上一步的结果（可选）
            step_index: 步骤索引（可选，用于直接执行特定步骤）
            
        Returns:
            步骤执行结果和可能的操作命令
        """
        # 如果提供了步骤索引，更新当前步骤
        if step_index is not None and self.multi_step_context["active"]:
            if 0 <= step_index < len(self.multi_step_context["steps"]):
                self.multi_step_context["current_step"] = step_index
                step_description = self.multi_step_context["steps"][step_index]["description"]
            else:
                return {
                    "response": f"错误：步骤索引 {step_index} 超出范围（0-{len(self.multi_step_context['steps'])-1}）",
                    "command": None,
                    "error": True
                }
        
        prompt = f"【步骤执行】当前步骤: {step_description}\n\n"
        
        # 添加任务上下文
        if self.multi_step_context["active"]:
            prompt += f"任务: {self.multi_step_context['task']}\n"
            prompt += f"当前步骤: {self.multi_step_context['current_step'] + 1}/{len(self.multi_step_context['steps'])}\n\n"
        
        if previous_result:
            prompt += f"上一步结果:\n{previous_result}\n\n"
        elif self.multi_step_context["active"] and self.multi_step_context["previous_result"]:
            prompt += f"上一步结果:\n{self.multi_step_context['previous_result']}\n\n"
            
        # 添加所有之前步骤的结果作为上下文
        if self.multi_step_context["active"] and self.multi_step_context["results"]:
            prompt += "之前步骤的结果:\n"
            for i, result in enumerate(self.multi_step_context["results"]):
                prompt += f"步骤 {i+1} 结果: {result}\n"
            prompt += "\n"
        
        prompt += """请执行这个步骤并提供结果。如果需要额外信息，请明确说明。
如果这个步骤需要执行具体操作，请提供JSON格式的操作命令。
例如: {"type": "navigation", "action": "next_page"}
或带参数的: {"type": "file", "action": "upload_pdf", "params": {"course_id": "math101"}}

如果这个步骤需要与专家LLM协作，请提供协作请求命令:
{"type": "collaboration", "action": "consult_expert", "params": {"board_id": "board-123", "question": "分析这个PDF的主题"}}

请确保命令格式正确，并提供执行此步骤的详细说明。"""
        
        # 调用LLM
        response = self._call_llm(prompt)
        
        # 尝试从回复中提取操作命令
        command = self._extract_command_json(response)
        
        # 如果是多步操作中的一步，添加多步操作标记
        if self.multi_step_context["active"]:
            if command:
                # 如果命令没有metadata字段，添加一个
                if "metadata" not in command:
                    command["metadata"] = {}
                
                # 添加多步操作标记
                command["metadata"]["isMultiStep"] = True
                command["metadata"]["stepNumber"] = self.multi_step_context["current_step"] + 1
                command["metadata"]["totalSteps"] = len(self.multi_step_context["steps"])
                
                # 更新当前步骤和上一步结果
                clean_response = self._clean_response_json(response)
                self.multi_step_context["previous_result"] = clean_response
                
                # 保存当前步骤结果
                if self.multi_step_context["current_step"] < len(self.multi_step_context["results"]):
                    self.multi_step_context["results"][self.multi_step_context["current_step"]] = clean_response
                else:
                    self.multi_step_context["results"].append(clean_response)
                    
                self.multi_step_context["current_step"] += 1
        
        # 记录操作
        self.add_operation("step_executed", {
            "step": step_description,
            "has_command": command is not None
        })
        
        return {
            "response": self._clean_response_json(response),
            "command": command,
            "step_index": self.multi_step_context["current_step"] - 1 if self.multi_step_context["active"] else None,
            "is_last_step": self.multi_step_context["active"] and self.multi_step_context["current_step"] >= len(self.multi_step_context["steps"])
        }
    
    def continue_multi_step_task(self):
        """继续执行多步骤任务的下一步"""
        if not self.multi_step_context["active"]:
            return {
                "response": "当前没有活动的多步骤任务。",
                "command": None
            }
        
        # 检查是否已完成所有步骤
        if self.multi_step_context["current_step"] >= len(self.multi_step_context["steps"]):
            # 重置多步操作上下文
            self.multi_step_context["active"] = False
            
            return {
                "response": "多步骤任务已全部完成。",
                "command": None
            }
        
        # 获取当前步骤
        current_step = self.multi_step_context["steps"][self.multi_step_context["current_step"]]
        previous_result = self.multi_step_context["previous_result"]
        
        # 执行当前步骤
        result = self.execute_step(current_step["description"], previous_result)
        
        # 添加多步操作上下文信息
        result["multi_step_context"] = {
            "current_step": self.multi_step_context["current_step"],
            "total_steps": len(self.multi_step_context["steps"]),
            "is_last_step": self.multi_step_context["current_step"] >= len(self.multi_step_context["steps"])
        }
        
        return result
    
    def execute_task(self, task_description, context=None):
        """
        执行完整任务，包括规划和执行所有步骤
        
        Args:
            task_description: 任务描述
            context: 任务上下文（可选）
            
        Returns:
            任务执行结果
        """
        # 首先规划任务
        plan_result = self.plan_multi_step_task(task_description, context)
        
        # 初始化结果列表
        results = []
        
        # 逐步执行每个步骤
        current_step = 0
        total_steps = len(self.multi_step_context["steps"])
        
        while current_step < total_steps:
            # 获取当前步骤
            step = self.multi_step_context["steps"][current_step]
            
            # 执行当前步骤
            step_result = self.execute_step(step["description"])
            
            # 添加到结果列表
            results.append({
                "step_number": current_step + 1,
                "description": step["description"],
                "response": step_result["response"],
                "command": step_result["command"]
            })
            
            # 更新当前步骤
            current_step = self.multi_step_context["current_step"]
        
        # 生成任务总结
        summary_prompt = f"【任务总结】已完成任务: {task_description}\n\n"
        summary_prompt += "各步骤执行结果:\n"
        
        for i, result in enumerate(results):
            summary_prompt += f"步骤 {i+1}: {result['description']}\n"
            summary_prompt += f"结果: {result['response'][:100]}...\n\n"
        
        summary_prompt += "请提供任务执行的总结，包括完成情况、主要成果和可能的后续行动。"
        
        # 调用LLM生成总结
        summary = self._call_llm(summary_prompt)
        
        # 重置多步操作上下文
        self.multi_step_context["active"] = False
        
        # 记录操作
        self.add_operation("task_completed", {
            "task": task_description,
            "steps_executed": len(results)
        })
        
        return {
            "task": task_description,
            "steps": results,
            "summary": summary
        }
    
    def stream_call_llm(self, prompt, callback=None):
        """
        使用流式方式调用LLM API
        
        Args:
            prompt: 提示文本
            callback: 回调函数，用于处理流式输出的每个数据块
            
        Returns:
            完整响应文本
        """
        if not QWEN_API_KEY:
            logger.error("未配置QWEN_API_KEY")
            raise ValueError("未配置QWEN_API_KEY")
        
        try:
            # 使用OpenAI兼容的API调用
            from openai import OpenAI
            
            client = OpenAI(
                api_key=QWEN_API_KEY,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
            
            # 获取历史对话
            conversation_history = conversation_manager.get_conversation(self.session_id, "global")
            
            # 构建消息
            messages = []
            
            # 添加系统消息
            system_message = "你是WhatNote应用的管家LLM，负责协助用户管理文件和展板。"
            messages.append({"role": "system", "content": system_message})
            
            # 添加对话历史
            for msg in conversation_history[-8:]:  # 最多取8条历史记录
                role = msg.get("role")
                content = msg.get("content")
                if role and content and role in ["user", "assistant"]:
                    messages.append({"role": role, "content": content})
            
            # 添加当前用户消息
            messages.append({"role": "user", "content": prompt})
            
            # 流式调用
            completion = client.chat.completions.create(
                model="qwen-plus",
                messages=messages,
                stream=True,
                stream_options={"include_usage": True}
            )
            
            # 收集完整响应
            full_response = ""
            
            # 处理流式响应
            for chunk in completion:
                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                    content_chunk = chunk.choices[0].delta.content
                    full_response += content_chunk
                    
                    # 如果有回调函数，调用它
                    if callback and callable(callback):
                        callback(content_chunk)
            
            # 将用户消息和助手回复添加到历史记录
            conversation_manager.add_message(self.session_id, "global", "user", prompt)
            conversation_manager.add_message(self.session_id, "global", "assistant", full_response)
            
            # 记录交互日志
            LLMLogger.log_interaction(
                llm_type="butler_stream",
                query=prompt,
                response=full_response,
                command=None,
                metadata={
                    "streaming": True,
                    "session_id": self.session_id
                }
            )
            
            logger.info(f"管家LLM流式调用成功，响应长度: {len(full_response)}")
            return full_response
        
        except Exception as e:
            error_msg = f"流式调用失败: {str(e)}"
            logger.error(error_msg)
            
            if callback:
                callback(f"错误: {str(e)}")
            
            # 记录错误日志
            LLMLogger.log_interaction(
                llm_type="butler_stream",
                query=prompt,
                response=error_msg,
                command=None,
                metadata={
                    "error": str(e),
                    "streaming": True,
                    "session_id": self.session_id
                }
            )
            
            return error_msg
    
    def _call_llm(self, prompt):
        """内部方法：调用LLM API"""
        if not QWEN_API_KEY:
            logger.error("未配置QWEN_API_KEY")
            return "API调用错误：未配置API密钥"
            
        # 获取历史对话
        conversation_history = conversation_manager.get_conversation(self.session_id, "global")
        
        # 添加当前用户消息
        conversation_manager.add_message(self.session_id, "global", "user", prompt)
        
        try:
            # 准备API请求 - 使用OpenAI兼容模式
            import requests
            
            url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {QWEN_API_KEY}",
                "Content-Type": "application/json"
            }
            
            # 构建消息列表，最多取最近10条
            messages = []
            
            # 添加系统消息
            system_message = "你是WhatNote应用的管家LLM，负责协助用户管理文件和展板。"
            messages.append({"role": "system", "content": system_message})
            
            # 添加对话历史
            for msg in conversation_history[-8:]:  # 最多取8条历史记录
                role = msg.get("role")
                content = msg.get("content")
                if role and content and role in ["user", "assistant"]:
                    messages.append({"role": role, "content": content})
            
            # 确保最后一条是当前用户消息
            if not (len(messages) >= 2 and messages[-1]["role"] == "user" and messages[-1]["content"] == prompt):
                messages.append({"role": "user", "content": prompt})
            
            data = {
                "model": "qwen-max",  # 使用更高级的模型
                "messages": messages,
                "temperature": 0.7
            }
            
            # 记录调试信息
            logger.info(f"发送API请求，消息数: {len(messages)}")
            
            # 发送请求 - 配置代理设置以避免连接问题
            start_time = time.time()
            proxies = {'http': None, 'https': None}
            response = requests.post(url, headers=headers, json=data, timeout=API_TIMEOUT, proxies=proxies)
            response.raise_for_status()
            
            result = response.json()
            response_content = result["choices"][0]["message"]["content"]
            
            # 计算API调用耗时
            end_time = time.time()
            duration = end_time - start_time
            
            # 记录LLM交互日志
            LLMLogger.log_interaction(
                llm_type="butler",
                query=prompt,
                response=response_content,
                metadata={
                    "session_id": self.session_id,
                    "duration": duration,
                    "token_count": result.get("usage", {}).get("total_tokens", 0)
                }
            )
            
            # 添加助手回复
            conversation_manager.add_message(
                self.session_id, 
                "global", 
                "assistant", 
                response_content
            )
            
            return response_content
            
        except Exception as e:
            logger.error(f"管家LLM API调用失败: {str(e)}")
            error_msg = f"API调用错误: {str(e)}"
            
            # 记录错误回复
            conversation_manager.add_message(
                self.session_id, 
                "global", 
                "assistant", 
                error_msg
            )
            
            # 记录LLM交互错误日志
            LLMLogger.log_interaction(
                llm_type="butler",
                query=prompt,
                response=error_msg,
                metadata={
                    "session_id": self.session_id,
                    "error": str(e)
                }
            )
            
            return error_msg

# 全局单例
butler_llm = ButlerLLM()
