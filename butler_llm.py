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
# import expert_llm  # 暂时注释掉避免循环导入
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
    
    def clear_board_info(self, board_id):
        """清理指定展板的信息"""
        try:
            # 从Butler日志中删除展板信息
            if "boards" in self.butler_log and board_id in self.butler_log["boards"]:
                del self.butler_log["boards"][board_id]
            
            # 清理展板相关的上下文信息
            if hasattr(self, 'board_states') and board_id in self.board_states:
                del self.board_states[board_id]
            if hasattr(self, 'board_contexts') and board_id in self.board_contexts:
                del self.board_contexts[board_id]
            
            self._save_butler_log()
            logger.info(f"已清理Butler中的展板信息: {board_id}")
            
            # 记录操作
            self.add_operation("board_info_cleared", {"board_id": board_id})
            
        except Exception as e:
            logger.error(f"清理展板信息失败: {str(e)}")
    
    def process_user_request(self, request, status_log=None):
        """
        处理用户请求 - 支持CLI指令和自然语言
        
        Args:
            request: 用户请求内容
            status_log: 当前应用状态日志（可选）
            
        Returns:
            处理结果和可能的操作命令
        """
        # 初始化function calls记录
        self.last_function_calls = []
        
        # 检查是否是CLI指令
        cli_command = self._parse_cli_command(request.strip())
        if cli_command:
            return self._process_cli_command(cli_command, status_log)
        
        # 处理自然语言请求
        return self._process_natural_language(request, status_log)
    
    def _parse_cli_command(self, input_text):
        """
        解析CLI指令
        
        Args:
            input_text: 输入文本
            
        Returns:
            解析后的CLI命令对象或None
        """
        import shlex
        import re
        
        # 清理输入文本
        text = input_text.strip()
        if not text:
            return None
        
        # 定义明确的CLI命令关键词
        cli_commands = {
            'pwd', 'cd', 'ls', 'course', 'board', 'pdf', 'note', 'board-note', 
            'expert', 'status', 'config', 'help', 'find', 'history', 'undo', 
            'redo', 'batch', 'alias', 'man'
        }
        
        # 自然语言特征检测
        natural_language_indicators = [
            # 中文自然语言特征
            '请', '能', '帮', '我想', '可以', '如何', '怎么', '什么', '为什么',
            '是否', '有没有', '能否', '可不可以', '应该', '需要', '想要',
            '？', '?', '吗', '呢', '吧', '啊', '哦', '嗯',
            
            # 英文自然语言特征
            'please', 'can you', 'could you', 'would you', 'how to', 'what is',
            'why', 'when', 'where', 'how', 'explain', 'tell me', 'show me',
            'I want', 'I need', 'I would like'
        ]
        
        # 检查是否包含自然语言特征
        text_lower = text.lower()
        for indicator in natural_language_indicators:
            if indicator in text_lower:
                return None
        
        # 检查文本长度（CLI命令通常较短）
        if len(text) > 100:  # CLI命令通常不会太长
            return None
            
        # 检查单词数量（CLI命令单词数有限）
        words = text.split()
        if len(words) > 15:  # CLI命令参数通常不会太多
            return None
            
        # 检查是否以CLI命令开头
        if words and words[0] not in cli_commands:
            # 进一步检查是否像文件路径或其他CLI模式
            first_word = words[0]
            
            # 检查是否是路径表达式
            if first_word.startswith('/') or first_word.startswith('./') or first_word.startswith('../'):
                return None  # 暂时不支持直接路径命令
                
            # 检查是否包含中文字符但不是引号内的参数
            if re.search(r'[\u4e00-\u9fff]', first_word):
                return None
                
            # 如果第一个词不是已知命令，判定为自然语言
            return None
        
        try:
            # 使用shlex解析命令行参数，处理引号
            tokens = shlex.split(text)
            if not tokens:
                return None
                
            return {
                'command': tokens[0],
                'args': tokens[1:],
                'raw': input_text
            }
        except ValueError as e:
            # shlex解析失败，可能是引号不匹配等
            logger.debug(f"CLI解析失败: {str(e)}")
            return None
        except Exception as e:
            logger.debug(f"CLI解析异常: {str(e)}")
            return None
    
    def _process_cli_command(self, cli_command, status_log=None):
        """
        处理CLI指令
        
        Args:
            cli_command: 解析后的CLI命令
            status_log: 状态日志
            
        Returns:
            处理结果
        """
        command = cli_command['command']
        args = cli_command['args']
        
        logger.info(f"处理CLI指令: {command} {' '.join(args)}")
        
        try:
            if command == 'pwd':
                return self._handle_pwd()
            elif command == 'cd':
                return self._handle_cd(args)
            elif command == 'ls':
                return self._handle_ls(args)
            elif command == 'course':
                return self._handle_course(args)
            elif command == 'board':
                return self._handle_board(args)
            elif command == 'pdf':
                return self._handle_pdf(args)
            elif command == 'note':
                return self._handle_note(args)
            elif command == 'board-note':
                return self._handle_board_note(args)
            elif command == 'expert':
                return self._handle_expert(args)
            elif command == 'status':
                return self._handle_status(args)
            elif command == 'config':
                return self._handle_config(args)
            elif command == 'help':
                return self._handle_help(args)
            elif command == 'find':
                return self._handle_find(args)
            elif command == 'history':
                return self._handle_history(args)
            else:
                return {
                    "response": f"未知命令: {command}。输入 'help' 查看可用命令。",
                    "command": None
                }
                
        except Exception as e:
            logger.error(f"CLI命令处理失败: {str(e)}")
            return {
                "response": f"命令执行失败: {str(e)}",
                "command": None
            }
    
    def _process_natural_language(self, request, status_log=None):
        """
        处理自然语言请求（原有逻辑）
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
4. 文件操作: select_pdf, upload_pdf, create_course_folder, delete_file
5. 展板操作: create_board, open_board, close_board, list_boards
6. 与专家LLM交互: consult_expert
7. 多步任务: plan_task, execute_step
8. 系统查询: get_app_state, get_file_list, get_board_info

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
        
        # 如果有命令，尝试执行function call
        if command:
            try:
                function_result = self._execute_function_call(command)
                self.last_function_calls.append({
                    "function": command.get("action"),
                    "args": command.get("params", {}),
                    "result": function_result,
                    "status": "completed"
                })
            except Exception as e:
                logger.error(f"Function call执行失败: {str(e)}")
                self.last_function_calls.append({
                    "function": command.get("action"),
                    "args": command.get("params", {}),
                    "result": f"执行失败: {str(e)}",
                    "status": "failed"
                })
        
        return {
            "response": self._clean_response_json(response),
            "command": command
        }
    
    # CLI命令处理方法
    def _handle_pwd(self):
        """处理pwd命令 - 显示当前工作目录"""
        # 从上下文获取当前位置
        current_path = getattr(self, 'current_path', '/')
        
        return {
            "response": current_path,
            "command": {
                "type": "system_query",
                "action": "get_current_path",
                "params": {}
            }
        }
    
    def _handle_cd(self, args):
        """处理cd命令 - 切换目录"""
        if not args:
            target_path = '/'
        else:
            target_path = args[0]
        
        return {
            "response": f"切换到目录: {target_path}",
            "command": {
                "type": "navigation",
                "action": "change_directory", 
                "params": {"path": target_path}
            }
        }
    
    def _handle_ls(self, args):
        """处理ls命令 - 列出内容"""
        options = self._parse_options(args)
        target_dir = options.get('target', '.')
        
        return {
            "response": f"列出目录内容: {target_dir}",
            "command": {
                "type": "file_operation",
                "action": "list_directory",
                "params": {
                    "directory": target_dir,
                    "detailed": "-l" in args,
                    "all": "-a" in args,
                    "filter": options
                }
            }
        }
    
    def _handle_course(self, args):
        """处理course命令 - 课程管理"""
        if not args:
            return {"response": "course命令需要子命令。输入 'help course' 查看用法。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand in ['create', 'new']:
            if not sub_args:
                return {"response": "请指定课程文件夹名称", "command": None}
            
            course_name = sub_args[0]
            options = self._parse_options(sub_args[1:])
            
            return {
                "response": f"创建课程文件夹: {course_name}",
                "command": {
                    "type": "course_operation",
                    "action": "create_folder",
                    "params": {
                        "folder_name": course_name,
                        "description": options.get("desc", "")
                    }
                }
            }
            
        elif subcommand in ['list', 'ls']:
            options = self._parse_options(sub_args)
            return {
                "response": "列出所有课程文件夹",
                "command": {
                    "type": "course_operation", 
                    "action": "list_folders",
                    "params": {
                        "sort": options.get("sort", "name"),
                        "detailed": "--verbose" in sub_args or "-v" in sub_args
                    }
                }
            }
            
        elif subcommand in ['delete', 'rm']:
            if not sub_args:
                return {"response": "请指定要删除的课程文件夹名称", "command": None}
                
            course_name = sub_args[0]
            force = "--force" in sub_args or "-f" in sub_args
            
            return {
                "response": f"删除课程文件夹: {course_name}",
                "command": {
                    "type": "course_operation",
                    "action": "delete_folder", 
                    "params": {
                        "folder_name": course_name,
                        "force": force
                    }
                }
            }
            
        elif subcommand in ['rename', 'mv']:
            if len(sub_args) < 2:
                return {"response": "重命名需要提供旧名称和新名称", "command": None}
                
            old_name, new_name = sub_args[0], sub_args[1]
            return {
                "response": f"重命名课程文件夹: {old_name} → {new_name}",
                "command": {
                    "type": "course_operation",
                    "action": "rename_folder",
                    "params": {
                        "old_name": old_name,
                        "new_name": new_name
                    }
                }
            }
            
        elif subcommand in ['show', 'info']:
            if not sub_args:
                return {"response": "请指定课程文件夹名称", "command": None}
                
            course_name = sub_args[0]
            return {
                "response": f"显示课程详情: {course_name}",
                "command": {
                    "type": "course_operation",
                    "action": "show_folder_info",
                    "params": {"folder_name": course_name}
                }
            }
        else:
            return {"response": f"未知的course子命令: {subcommand}", "command": None}
    
    def _handle_board(self, args):
        """处理board命令 - 展板管理"""
        if not args:
            return {"response": "board命令需要子命令。输入 'help board' 查看用法。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand in ['create', 'new']:
            if not sub_args:
                return {"response": "请指定展板名称", "command": None}
            
            board_name = sub_args[0]
            options = self._parse_options(sub_args[1:])
            
            return {
                "response": f"创建展板: {board_name}",
                "command": {
                    "type": "board_operation",
                    "action": "create_board",
                    "params": {
                        "board_name": board_name,
                        "course_folder": options.get("course"),
                        "auto_open": options.get("auto_open", True)
                    }
                }
            }
            
        elif subcommand in ['open', 'switch', 'go']:
            if not sub_args:
                return {"response": "请指定展板名称或ID", "command": None}
                
            board_identifier = sub_args[0]
            return {
                "response": f"打开展板: {board_identifier}",
                "command": {
                    "type": "board_operation",
                    "action": "open_board",
                    "params": {"board_identifier": board_identifier}
                }
            }
            
        elif subcommand in ['list', 'ls']:
            options = self._parse_options(sub_args)
            return {
                "response": "列出展板",
                "command": {
                    "type": "board_operation",
                    "action": "list_boards",
                    "params": {
                        "active_only": "--active" in sub_args,
                        "course_filter": options.get("course")
                    }
                }
            }
            
        elif subcommand in ['close']:
            board_name = sub_args[0] if sub_args else None
            return {
                "response": f"关闭展板: {board_name or '当前展板'}",
                "command": {
                    "type": "board_operation",
                    "action": "close_board",
                    "params": {"board_name": board_name}
                }
            }
            
        elif subcommand in ['delete', 'rm']:
            if not sub_args:
                return {"response": "请指定要删除的展板名称", "command": None}
                
            board_name = sub_args[0]
            force = "--force" in sub_args or "-f" in sub_args
            
            return {
                "response": f"删除展板: {board_name}",
                "command": {
                    "type": "board_operation",
                    "action": "delete_board",
                    "params": {
                        "board_name": board_name,
                        "force": force
                    }
                }
            }
            
        elif subcommand == 'status':
            return {
                "response": "显示展板状态",
                "command": {
                    "type": "board_operation",
                    "action": "get_board_status",
                    "params": {}
                }
            }
        else:
            return {"response": f"未知的board子命令: {subcommand}", "command": None}
    
    def _handle_pdf(self, args):
        """处理pdf命令 - PDF管理"""
        if not args:
            return {"response": "pdf命令需要子命令。输入 'help pdf' 查看用法。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand == 'upload':
            filename = sub_args[0] if sub_args else None
            options = self._parse_options(sub_args[1:] if sub_args else [])
            
            return {
                "response": f"上传PDF文件: {filename or '交互式选择'}",
                "command": {
                    "type": "file_operation",
                    "action": "upload_pdf",
                    "params": {
                        "filename": filename,
                        "course": options.get("course")
                    }
                }
            }
            
        elif subcommand in ['open', 'show', 'load']:
            if not sub_args:
                return {"response": "请指定PDF文件名", "command": None}
                
            filename = sub_args[0]
            options = self._parse_options(sub_args[1:])
            
            return {
                "response": f"打开PDF文件: {filename}",
                "command": {
                    "type": "window_operation",
                    "action": "open_pdf",
                    "params": {
                        "filename": filename,
                        "page": options.get("page", 1)
                    }
                }
            }
            
        elif subcommand == 'goto':
            if not sub_args:
                return {"response": "请指定页码", "command": None}
                
            try:
                page = int(sub_args[0])
                return {
                    "response": f"跳转到第{page}页",
                    "command": {
                        "type": "navigation",
                        "action": "goto_page",
                        "params": {"page": page}
                    }
                }
            except ValueError:
                return {"response": "页码必须是数字", "command": None}
                
        elif subcommand in ['next', 'prev', 'first', 'last']:
            return {
                "response": f"PDF导航: {subcommand}",
                "command": {
                    "type": "navigation",
                    "action": f"{subcommand}_page",
                    "params": {}
                }
            }
            
        elif subcommand == 'page':
            if not sub_args:
                return {"response": "请指定页面偏移（如 +5 或 -3）", "command": None}
                
            offset_str = sub_args[0]
            try:
                if offset_str.startswith(('+', '-')):
                    offset = int(offset_str)
                    return {
                        "response": f"页面偏移: {offset}",
                        "command": {
                            "type": "navigation",
                            "action": "offset_page",
                            "params": {"offset": offset}
                        }
                    }
                else:
                    return {"response": "页面偏移必须以+或-开始", "command": None}
            except ValueError:
                return {"response": "无效的页面偏移格式", "command": None}
                
        elif subcommand in ['close', 'closeall']:
            filename = sub_args[0] if sub_args and subcommand == 'close' else None
            return {
                "response": f"关闭PDF: {filename or '所有PDF' if subcommand == 'closeall' else '当前PDF'}",
                "command": {
                    "type": "window_operation",
                    "action": "close_pdf",
                    "params": {
                        "filename": filename,
                        "close_all": subcommand == 'closeall'
                    }
                }
            }
            
        elif subcommand in ['list', 'ls']:
            show_all = "--all" in sub_args
            return {
                "response": f"列出PDF文件: {'所有文件' if show_all else '当前展板'}",
                "command": {
                    "type": "file_operation",
                    "action": "list_pdfs",
                    "params": {"show_all": show_all}
                }
            }
            
        elif subcommand == 'status':
            return {
                "response": "显示PDF状态",
                "command": {
                    "type": "window_operation",
                    "action": "get_pdf_status",
                    "params": {}
                }
            }
        else:
            return {"response": f"未知的pdf子命令: {subcommand}", "command": None}
    
    def _handle_note(self, args):
        """处理note命令 - 笔记管理"""
        if not args:
            return {"response": "note命令需要子命令。输入 'help note' 查看用法。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand in ['generate', 'gen']:
            options = self._parse_options(sub_args)
            return {
                "response": "生成笔记",
                "command": {
                    "type": "content_generation",
                    "action": "generate_note",
                    "params": {
                        "note_type": options.get("type", "summary"),
                        "pages": options.get("pages"),
                        "manual": "--manual" in sub_args
                    }
                }
            }
            
        elif subcommand == 'annotate':
            options = self._parse_options(sub_args)
            return {
                "response": "生成页面注释",
                "command": {
                    "type": "content_generation", 
                    "action": "generate_annotation",
                    "params": {
                        "force_vision": "--vision" in sub_args,
                        "style": options.get("style", "detailed")
                    }
                }
            }
            
        elif subcommand == 'improve':
            if not sub_args:
                return {"response": "请指定改进要求", "command": None}
                
            improve_request = ' '.join(sub_args)
            return {
                "response": f"改进注释: {improve_request}",
                "command": {
                    "type": "content_generation",
                    "action": "improve_annotation", 
                    "params": {"improve_request": improve_request}
                }
            }
            
        elif subcommand in ['show', 'edit', 'save']:
            return {
                "response": f"笔记操作: {subcommand}",
                "command": {
                    "type": "window_operation",
                    "action": f"{subcommand}_note",
                    "params": {}
                }
            }
            
        elif subcommand == 'export':
            options = self._parse_options(sub_args)
            format_type = options.get("format", "md")
            
            return {
                "response": f"导出笔记为{format_type}格式",
                "command": {
                    "type": "content_generation",
                    "action": "export_note",
                    "params": {"format": format_type}
                }
            }
        else:
            return {"response": f"未知的note子命令: {subcommand}", "command": None}
    
    def _handle_board_note(self, args):
        """处理board-note命令 - 展板笔记管理"""
        if not args:
            return {"response": "board-note命令需要子命令。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand in ['generate', 'gen']:
            comprehensive = "--comprehensive" in sub_args
            return {
                "response": f"生成展板笔记: {'综合' if comprehensive else '标准'}",
                "command": {
                    "type": "content_generation",
                    "action": "generate_board_note",
                    "params": {"comprehensive": comprehensive}
                }
            }
            
        elif subcommand == 'show':
            return {
                "response": "显示展板笔记",
                "command": {
                    "type": "content_generation",
                    "action": "show_board_note",
                    "params": {}
                }
            }
            
        elif subcommand == 'improve':
            if not sub_args:
                return {"response": "请指定改进要求", "command": None}
                
            improve_request = ' '.join(sub_args)
            return {
                "response": f"改进展板笔记: {improve_request}",
                "command": {
                    "type": "content_generation",
                    "action": "improve_board_note",
                    "params": {"improve_request": improve_request}
                }
            }
        else:
            return {"response": f"未知的board-note子命令: {subcommand}", "command": None}
    
    def _handle_expert(self, args):
        """处理expert命令 - 专家系统"""
        if not args:
            return {"response": "expert命令需要子命令。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand == 'start':
            return {
                "response": "启动专家对话",
                "command": {
                    "type": "expert_interaction",
                    "action": "start_chat",
                    "params": {}
                }
            }
            
        elif subcommand in ['chat', 'ask']:
            if not sub_args:
                return {"response": "请提供问题或咨询内容", "command": None}
                
            question = ' '.join(sub_args)
            return {
                "response": f"咨询专家: {question}",
                "command": {
                    "type": "expert_interaction",
                    "action": "ask_question",
                    "params": {"question": question}
                }
            }
            
        elif subcommand == 'mode':
            if not sub_args:
                return {"response": "请指定模式: intelligent 或 simple", "command": None}
                
            mode = sub_args[0]
            if mode not in ['intelligent', 'simple']:
                return {"response": "模式必须是 intelligent 或 simple", "command": None}
                
            return {
                "response": f"设置专家模式: {mode}",
                "command": {
                    "type": "expert_interaction",
                    "action": "set_mode",
                    "params": {"mode": mode}
                }
            }
            
        elif subcommand == 'task':
            if not sub_args:
                return {"response": "请指定任务类型", "command": None}
                
            task_type = sub_args[0]
            async_mode = "--async" in sub_args
            
            return {
                "response": f"执行专家任务: {task_type}",
                "command": {
                    "type": "expert_interaction",
                    "action": "execute_task",
                    "params": {
                        "task_type": task_type,
                        "async": async_mode
                    }
                }
            }
            
        elif subcommand == 'status':
            return {
                "response": "查看专家状态",
                "command": {
                    "type": "expert_interaction",
                    "action": "get_status",
                    "params": {}
                }
            }
        else:
            return {"response": f"未知的expert子命令: {subcommand}", "command": None}
    
    def _handle_status(self, args):
        """处理status命令 - 系统状态"""
        verbose = "--verbose" in args or "-v" in args
        json_output = "--json" in args
        api_check = "api" in args
        
        if api_check:
            return {
                "response": "检查API状态",
                "command": {
                    "type": "system_query",
                    "action": "check_api_status",
                    "params": {"verbose": verbose}
                }
            }
        else:
            return {
                "response": "显示系统状态",
                "command": {
                    "type": "system_query",
                    "action": "get_system_status",
                    "params": {
                        "verbose": verbose,
                        "json": json_output
                    }
                }
            }
    
    def _handle_config(self, args):
        """处理config命令 - 配置管理"""
        if not args:
            return {"response": "config命令需要子命令。", "command": None}
        
        subcommand = args[0]
        sub_args = args[1:]
        
        if subcommand == 'show':
            return {
                "response": "显示当前配置",
                "command": {
                    "type": "system_config",
                    "action": "show_config",
                    "params": {}
                }
            }
            
        elif subcommand == 'set':
            if len(sub_args) < 2:
                return {"response": "set需要提供配置项和值", "command": None}
                
            config_key, config_value = sub_args[0], sub_args[1]
            return {
                "response": f"设置配置: {config_key} = {config_value}",
                "command": {
                    "type": "system_config",
                    "action": "set_config",
                    "params": {
                        "key": config_key,
                        "value": config_value
                    }
                }
            }
            
        elif subcommand == 'reset':
            return {
                "response": "重置配置",
                "command": {
                    "type": "system_config",
                    "action": "reset_config",
                    "params": {}
                }
            }
        else:
            return {"response": f"未知的config子命令: {subcommand}", "command": None}
    
    def _handle_help(self, args):
        """处理help命令 - 帮助系统"""
        if not args:
            help_text = """
🎯 WhatNote CLI 指令体系

📚 主要命令分类：

🗂️ 基础导航：
  pwd                        显示当前位置
  cd <path>                  切换目录 (/, courses, boards/board-123)
  ls [options] [path]        列出内容 (-l详细, -a全部, --type=pdf)

📁 课程管理：
  course create "名称"       创建课程文件夹
  course list                列出所有课程
  course delete "名称"       删除课程
  course rename "旧" "新"    重命名课程

🎯 展板管理：
  board create "名称"        创建展板
  board open "名称"          打开展板
  board list                 列出展板
  board close                关闭当前展板

📄 PDF管理：
  pdf upload ["文件名"]      上传PDF文件
  pdf open "文件名"          打开PDF
  pdf goto <页码>            跳转到指定页
  pdf next/prev              翻页导航
  pdf close                  关闭PDF

📝 笔记管理：
  note generate              生成笔记
  note annotate              生成注释
  note improve "要求"        改进注释
  note export --format=md    导出笔记

🤖 专家系统：
  expert start               启动专家对话
  expert chat "问题"         咨询专家
  expert mode intelligent    切换智能模式

🔧 系统工具：
  status                     显示系统状态
  config show                显示配置
  find --name="*.pdf"        搜索文件
  history                    命令历史

💡 快捷技巧：
  • 使用引号包含含空格的参数："文件名称"
  • 支持选项参数：--type=pdf, --verbose
  • 上下键浏览历史命令
  • Tab键自动补全命令（开发中）
  • 支持自然语言：直接描述需求即可

📖 使用示例：
  course create "机器学习"
  board create "第一章" --course="机器学习"
  pdf upload "教材.pdf"
  note generate --type=summary

输入 'help <命令>' 查看具体命令详情。
支持中英文混合输入，自然语言和CLI指令智能识别。
"""
            return {"response": help_text.strip(), "command": None}
        else:
            command = args[0]
            # 返回特定命令的详细帮助
            return {
                "response": self._get_command_detailed_help(command),
                "command": {
                    "type": "system_query",
                    "action": "get_command_help",
                    "params": {"command": command}
                }
            }
    
    def _get_command_detailed_help(self, command):
        """获取特定命令的详细帮助"""
        help_details = {
            'course': """
📁 course - 课程文件夹管理

语法：course <子命令> [参数] [选项]

子命令：
  create "名称" [--desc="描述"]     创建新课程文件夹
  list/ls [--sort=name|date]       列出所有课程
  show/info "名称"                 显示课程详情
  rename/mv "旧名" "新名"          重命名课程
  delete/rm "名称" [--force]       删除课程

示例：
  course create "深度学习基础"
  course create "机器学习" --desc="AI入门课程"
  course list --sort=date
  course rename "旧课程" "新课程名"
  course delete "测试课程" --force
            """,
            
            'board': """
🎯 board - 展板管理

语法：board <子命令> [参数] [选项]

子命令：
  create "名称" [--course="课程"]   创建新展板
  open/switch "名称或ID"           打开指定展板
  list/ls [--active] [--course=""] 列出展板
  close ["名称"]                   关闭展板
  delete/rm "名称" [--force]       删除展板
  status                           显示展板状态

示例：
  board create "神经网络基础"
  board create "CNN实验" --course="深度学习"
  board open "神经网络基础"
  board list --active
  board close
            """,
            
            'pdf': """
📄 pdf - PDF文件管理

语法：pdf <子命令> [参数] [选项]

子命令：
  upload ["文件名"]                交互式或指定文件上传
  open/show "文件名" [--page=N]    打开PDF文件
  goto <页码>                      跳转到指定页
  next/prev/first/last             页面导航
  page +N/-N                       相对页面跳转
  close ["文件名"]                 关闭PDF
  closeall                         关闭所有PDF
  list/ls [--all]                  列出PDF文件
  status                           显示PDF状态

示例：
  pdf upload "machine_learning.pdf"
  pdf open "深度学习.pdf" --page=5
  pdf goto 10
  pdf next
  pdf page +5
            """,
            
            'note': """
📝 note - 笔记与注释管理

语法：note <子命令> [参数] [选项]

子命令：
  generate/gen [--type=summary|detailed] [--pages=1-10]  生成笔记
  annotate [--vision] [--style=keywords|detailed]        生成注释
  improve "改进要求"                                      改进当前注释
  show/edit/save                                          笔记操作
  export --format=md|pdf                                  导出笔记

展板笔记：
  board-note generate [--comprehensive]   生成展板笔记
  board-note improve "要求"               改进展板笔记

示例：
  note generate --type=summary
  note annotate --vision
  note improve "增加更多实例"
  note export --format=md
            """,
            
            'expert': """
🤖 expert - 专家系统交互

语法：expert <子命令> [参数] [选项]

子命令：
  start                           启动专家对话
  chat/ask "问题内容"             直接咨询专家
  mode intelligent|simple         设置专家模式
  task <任务类型> [--async]       执行专家任务
  status                          查看专家状态

任务类型：
  generate-plan                   生成学习计划
  analyze-structure               分析文档结构
  generate-notes                  生成笔记

示例：
  expert start
  expert chat "解释反向传播算法"
  expert mode intelligent
  expert task generate-plan
            """,
            
            'config': """
🔧 config - 配置管理

语法：config <子命令> [参数]

子命令：
  show                            显示当前配置
  set <配置项> <值>               设置配置项
  reset                           重置所有配置

常用配置项：
  annotation.style                注释风格 (keywords|detailed)
  expert.mode                     专家模式 (simple|intelligent)
  debug.verbose                   详细输出 (true|false)

示例：
  config show
  config set annotation.style keywords
  config set expert.mode intelligent
            """
        }
        
        return help_details.get(command, f"暂无 '{command}' 命令的详细帮助。\n输入 'help' 查看所有可用命令。")
    
    def _handle_find(self, args):
        """处理find命令 - 搜索"""
        options = self._parse_options(args)
        
        return {
            "response": "执行搜索",
            "command": {
                "type": "system_query",
                "action": "search",
                "params": {
                    "name": options.get("name"),
                    "type": options.get("type"),
                    "content": options.get("content"),
                    "recent": "--recent" in args
                }
            }
        }
    
    def _handle_history(self, args):
        """处理history命令 - 命令历史"""
        if "--clear" in args:
            return {
                "response": "清空命令历史",
                "command": {
                    "type": "system_query",
                    "action": "clear_history",
                    "params": {}
                }
            }
        else:
            count = args[0] if args and args[0].isdigit() else None
            return {
                "response": f"显示命令历史{f'（最近{count}条）' if count else ''}",
                "command": {
                    "type": "system_query",
                    "action": "get_history",
                    "params": {"count": int(count) if count else None}
                }
            }
    
    def _parse_options(self, args):
        """解析命令行选项"""
        options = {}
        i = 0
        while i < len(args):
            arg = args[i]
            if arg.startswith('--'):
                if '=' in arg:
                    key, value = arg[2:].split('=', 1)
                    options[key] = value
                else:
                    key = arg[2:]
                    if i + 1 < len(args) and not args[i + 1].startswith('-'):
                        i += 1
                        options[key] = args[i]
                    else:
                        options[key] = True
            elif arg.startswith('-'):
                key = arg[1:]
                options[key] = True
            i += 1
        return options

    def _extract_command_json(self, response_text):
        """
        从LLM响应中提取JSON格式的命令
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            解析后的命令字典或None
        """
        import json
        import re
        
        if not response_text:
            return None
            
        try:
            # 首先尝试直接解析整个响应为JSON
            if response_text.strip().startswith('{') and response_text.strip().endswith('}'):
                return json.loads(response_text)
            
            # 在响应中查找JSON块
            json_patterns = [
                r'\{[^{}]*"type"\s*:\s*"[^"]*"[^{}]*\}',  # 简单的JSON模式
                r'\{(?:[^{}]|{[^{}]*})*\}',  # 嵌套JSON模式
            ]
            
            for pattern in json_patterns:
                matches = re.findall(pattern, response_text, re.DOTALL)
                for match in matches:
                    try:
                        command = json.loads(match)
                        if isinstance(command, dict) and 'type' in command:
                            return command
                    except json.JSONDecodeError:
                        continue
            
            # 查找代码块中的JSON
            code_block_pattern = r'```(?:json)?\s*(\{[^`]*\})\s*```'
            code_matches = re.findall(code_block_pattern, response_text, re.DOTALL)
            
            for match in code_matches:
                try:
                    command = json.loads(match)
                    if isinstance(command, dict) and 'type' in command:
                        return command
                except json.JSONDecodeError:
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"提取命令JSON失败: {str(e)}")
            return None
    
    def _clean_response_json(self, response_text):
        """
        清理响应文本，移除JSON命令部分，只保留用户可读的内容
        
        Args:
            response_text: 原始响应文本
            
        Returns:
            清理后的响应文本
        """
        import json
        import re
        
        if not response_text:
            return ""
        
        try:
            # 移除JSON代码块
            cleaned = re.sub(r'```(?:json)?\s*\{[^`]*\}\s*```', '', response_text, flags=re.DOTALL)
            
            # 移除独立的JSON对象
            json_patterns = [
                r'\{[^{}]*"type"\s*:\s*"[^"]*"[^{}]*\}',  # 简单的JSON模式
                r'\{(?:[^{}]|{[^{}]*})*\}',  # 嵌套JSON模式
            ]
            
            for pattern in json_patterns:
                matches = re.findall(pattern, cleaned, re.DOTALL)
                for match in matches:
                    try:
                        # 验证是否为有效的命令JSON
                        command = json.loads(match)
                        if isinstance(command, dict) and 'type' in command:
                            cleaned = cleaned.replace(match, '')
                    except json.JSONDecodeError:
                        continue
            
            # 清理多余的空行和空白
            cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
            cleaned = cleaned.strip()
        
            return cleaned if cleaned else response_text
            
        except Exception as e:
            logger.error(f"清理响应文本失败: {str(e)}")
            return response_text
    
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
    
    def _execute_function_call(self, command):
        """执行function call"""
        action = command.get("action")
        params = command.get("params", {})
        command_type = command.get("type")
        
        logger.info(f"🔧 [BUTLER] 执行function call: {action}")
        
        # 文件操作
        if command_type == "file_operation":
            return self._handle_file_operation(action, params)
        
        # 展板操作
        elif command_type == "board_operation":
            return self._handle_board_operation(action, params)
        
        # 系统查询
        elif command_type == "system_query":
            return self._handle_system_query(action, params)
        
        # 专家咨询
        elif command_type == "expert_consultation":
            return self._handle_expert_consultation(action, params)
        
        # 任务操作
        elif command_type == "task":
            return self._handle_task_operation(action, params)
        
        else:
            return f"未知的操作类型: {command_type}"
    
    def _handle_file_operation(self, action, params):
        """处理文件操作"""
        if action == "create_course_folder":
            folder_name = params.get("folder_name")
            if not folder_name:
                return "错误: 缺少folder_name参数"
            
            # 这里需要调用实际的API来创建课程文件夹
            # 暂时返回模拟结果
            return f"课程文件夹 '{folder_name}' 创建成功"
        
        elif action == "get_file_list":
            # 获取文件列表
            file_structure = self.butler_log.get("file_structure", {})
            uploaded_files = file_structure.get("uploaded_files", [])
            file_list = [f["filename"] for f in uploaded_files]
            return f"当前文件列表: {', '.join(file_list) if file_list else '无文件'}"
        
        elif action == "delete_file":
            filename = params.get("filename")
            if not filename:
                return "错误: 缺少filename参数"
            return f"文件 '{filename}' 删除操作已提交"
        
        else:
            return f"未知的文件操作: {action}"
    
    def _handle_board_operation(self, action, params):
        """处理展板操作"""
        if action == "create_board":
            board_name = params.get("board_name")
            course_folder = params.get("course_folder")
            if not board_name:
                return "错误: 缺少board_name参数"
            return f"展板 '{board_name}' 创建成功"
        
        elif action == "list_boards":
            boards = self.butler_log.get("boards", {})
            board_list = list(boards.keys())
            return f"当前展板列表: {', '.join(board_list) if board_list else '无展板'}"
        
        elif action == "get_board_info":
            board_id = params.get("board_id")
            if not board_id:
                return "错误: 缺少board_id参数"
            
            boards = self.butler_log.get("boards", {})
            board_info = boards.get(board_id, {})
            return f"展板 {board_id} 信息: {board_info}"
        
        else:
            return f"未知的展板操作: {action}"
    
    def _handle_system_query(self, action, params):
        """处理系统查询"""
        if action == "get_app_state":
            file_structure = self.butler_log.get("file_structure_summary", {})
            return f"应用状态: 课程文件夹 {file_structure.get('course_folders', 0)} 个, 展板 {file_structure.get('boards', 0)} 个, 文件 {file_structure.get('uploaded_files', 0)} 个"
        
        elif action == "get_recent_operations":
            operations = self.butler_log.get("recent_operations", [])
            recent = operations[-5:] if operations else []
            op_summary = [f"{op['type']} ({op['timestamp'][:19]})" for op in recent]
            return f"最近操作: {', '.join(op_summary) if op_summary else '无操作记录'}"
        
        else:
            return f"未知的系统查询: {action}"
    
    def _handle_expert_consultation(self, action, params):
        """处理专家咨询"""
        if action == "consult_expert":
            board_id = params.get("board_id")
            question = params.get("question")
            
            if not board_id or not question:
                return "错误: 缺少board_id或question参数"
            
            return self.consult_expert(board_id, question)
        
        else:
            return f"未知的专家咨询操作: {action}"
    
    def _handle_task_operation(self, action, params):
        """处理任务操作"""
        if action == "plan_task":
            task = params.get("task")
            if not task:
                return "错误: 缺少task参数"
            
            plan_result = self.plan_multi_step_task(task)
            return f"任务规划完成: {len(plan_result['steps'])} 个步骤"
        
        elif action == "execute_step":
            if not self.multi_step_context.get("active"):
                return "错误: 没有活跃的多步任务"
            
            return self.continue_multi_step_task()
        
        else:
            return f"未知的任务操作: {action}"

# 全局单例
butler_llm = ButlerLLM()
