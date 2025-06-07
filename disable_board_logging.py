#!/usr/bin/env python3
"""
临时禁用展板日志功能脚本
用于避免展板日志系统可能的阻塞问题
"""

import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def backup_file(file_path):
    """备份文件"""
    backup_path = f"{file_path}.logging_backup"
    if os.path.exists(file_path):
        shutil.copy2(file_path, backup_path)
        logger.info(f"已备份文件: {file_path} -> {backup_path}")
        return True
    return False

def disable_board_logging():
    """禁用展板日志功能"""
    board_logger_file = "board_logger.py"
    
    if not os.path.exists(board_logger_file):
        logger.error(f"文件不存在: {board_logger_file}")
        return False
    
    # 备份文件
    backup_file(board_logger_file)
    
    # 读取文件内容
    with open(board_logger_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    logger.info("开始禁用展板日志功能...")
    
    # 创建简化的BoardLogger类，所有方法都返回成功但不实际操作
    simplified_logger = '''import os
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class BoardLogger:
    """
    展板日志系统 - 简化版（已禁用实际日志功能）
    """
    
    def __init__(self, log_dir="board_logs"):
        """初始化展板日志系统 - 简化版"""
        self.log_dir = log_dir
        self.active_logs = {}
        logger.info("展板日志系统已初始化（简化模式）")
    
    def get_log_path(self, board_id):
        """获取特定展板的日志文件路径"""
        return os.path.join(self.log_dir, f"{board_id}.json")
    
    def load_log(self, board_id):
        """加载展板日志 - 简化版"""
        if board_id in self.active_logs:
            return self.active_logs[board_id]
            
        # 返回默认结构
        default_log = {
            "board_id": board_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "pdfs": [],
            "windows": [],
            "operations": [],
            "state": "empty"
        }
        self.active_logs[board_id] = default_log
        return default_log
    
    def save_log(self, board_id, log_data=None):
        """保存展板日志 - 简化版"""
        return True  # 总是返回成功
    
    def add_pdf(self, board_id, pdf_data):
        """添加PDF到展板日志 - 简化版"""
        log_data = self.load_log(board_id)
        pdf_data["added_at"] = datetime.now().isoformat()
        pdf_data["updated_at"] = datetime.now().isoformat()
        log_data["pdfs"].append(pdf_data)
        log_data["state"] = "active"
        self.active_logs[board_id] = log_data
    
    def update_pdf_content(self, board_id, filename, content_summary):
        """更新PDF内容摘要 - 简化版"""
        return True
    
    def add_window(self, board_id, window_data):
        """添加窗口到展板日志 - 简化版"""
        log_data = self.load_log(board_id)
        window_id = window_data.get("id", f"window_{int(time.time())}")
        window_data["id"] = window_id
        window_data["created_at"] = datetime.now().isoformat()
        window_data["updated_at"] = datetime.now().isoformat()
        log_data["windows"].append(window_data)
        self.active_logs[board_id] = log_data
        return window_id
    
    def remove_window(self, board_id, window_id):
        """从展板日志中移除窗口 - 简化版"""
        return True
    
    def update_window(self, board_id, window_id, window_data):
        """更新窗口信息 - 简化版"""
        return True
    
    def add_operation(self, board_id, operation_type, data=None):
        """添加操作记录 - 简化版"""
        log_data = self.load_log(board_id)
        operation = {
            "type": operation_type,
            "timestamp": datetime.now().isoformat(),
            "data": data or {}
        }
        log_data["operations"].append(operation)
        # 限制操作历史记录数量
        if len(log_data["operations"]) > 100:
            log_data["operations"] = log_data["operations"][-100:]
        self.active_logs[board_id] = log_data
    
    def get_board_summary(self, board_id):
        """获取展板摘要信息 - 简化版"""
        log_data = self.load_log(board_id)
        summary = {
            "board_id": board_id,
            "state": log_data["state"],
            "pdf_count": len(log_data["pdfs"]),
            "window_count": len(log_data["windows"]),
            "pdfs": [{"filename": pdf["filename"], "pages": pdf.get("pages", 0)} for pdf in log_data["pdfs"]],
            "windows": [{"id": w["id"], "type": w["type"], "content_type": w.get("content_type")} for w in log_data["windows"]],
            "recent_operations": log_data["operations"][-5:] if log_data["operations"] else []
        }
        return summary
    
    def get_full_board_info(self, board_id):
        """获取完整展板信息 - 简化版"""
        return self.load_log(board_id)
    
    def init_board(self, board_id):
        """初始化展板日志 - 简化版"""
        if not self.validate_board_id(board_id):
            logger.warning(f"展板ID验证失败: {board_id}")
            return False
            
        new_log = {
            "board_id": board_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "pdfs": [],
            "windows": [],
            "operations": [],
            "state": "empty"
        }
        
        self.active_logs[board_id] = new_log
        self.add_operation(board_id, "board_initialized", {
            "initialized_at": datetime.now().isoformat(),
            "is_fresh_board": True
        })
        
        logger.info(f"展板 {board_id} 已初始化（简化模式）")
        return True
    
    def clear_board_log(self, board_id):
        """清除展板日志 - 简化版"""
        if board_id in self.active_logs:
            del self.active_logs[board_id]
        return True

    def validate_board_id(self, board_id):
        """验证展板ID的有效性 - 简化版"""
        if not board_id:
            return False
        if board_id.startswith('file-course-'):
            logger.warning(f"检测到无效的展板ID（课程文件ID）: {board_id}")
            return False
        if board_id.startswith('file-') and not board_id.startswith('file-1748'):
            logger.warning(f"检测到可能无效的展板ID: {board_id}")
            return False
        return True

# 全局单例
board_logger = BoardLogger()
'''
    
    # 写入简化版本
    with open(board_logger_file, 'w', encoding='utf-8') as f:
        f.write(simplified_logger)
    
    logger.info("✅ 已禁用展板日志功能（使用简化版本）")
    return True

def disable_board_manager():
    """禁用展板管理器中的复杂功能"""
    board_manager_file = "board_manager.py"
    
    if not os.path.exists(board_manager_file):
        logger.warning(f"文件不存在: {board_manager_file}")
        return False
    
    # 备份文件
    backup_file(board_manager_file)
    
    # 读取文件内容
    with open(board_manager_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 简化update_board_context方法
    if 'def update_board_context(self, board_id, context_data):' in content:
        # 查找方法并简化
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'def update_board_context(self, board_id, context_data):' in line:
                # 找到方法结束位置
                j = i + 1
                while j < len(lines) and (lines[j].startswith('        ') or lines[j].strip() == ''):
                    j += 1
                
                # 替换为简化版本
                simplified_method = [
                    '    def update_board_context(self, board_id, context_data):',
                    '        """',
                    '        更新展板上下文信息 - 简化版',
                    '        """',
                    '        try:',
                    '            # 保存到内存',
                    '            self.board_contexts[board_id] = context_data',
                    '            logger.info(f"展板 {board_id} 上下文已更新（简化模式）")',
                    '            return True',
                    '        except Exception as e:',
                    '            logger.error(f"更新展板上下文失败: {e}")',
                    '            return False'
                ]
                
                # 替换方法
                new_lines = lines[:i] + simplified_method + lines[j:]
                content = '\n'.join(new_lines)
                break
    
    # 写回文件
    with open(board_manager_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    logger.info("✅ 已简化展板管理器功能")
    return True

def create_restore_logging_script():
    """创建恢复日志功能脚本"""
    restore_script = """#!/usr/bin/env python3
'''
恢复展板日志功能脚本
'''

import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def restore_file(file_path):
    backup_path = f"{file_path}.logging_backup"
    if os.path.exists(backup_path):
        shutil.copy2(backup_path, file_path)
        os.remove(backup_path)
        logger.info(f"已恢复文件: {backup_path} -> {file_path}")
        return True
    else:
        logger.warning(f"备份文件不存在: {backup_path}")
        return False

def main():
    logger.info("开始恢复展板日志功能...")
    
    files_to_restore = [
        "board_logger.py",
        "board_manager.py"
    ]
    
    success_count = 0
    for file_path in files_to_restore:
        if restore_file(file_path):
            success_count += 1
    
    if success_count == len(files_to_restore):
        logger.info("✅ 展板日志功能已成功恢复")
    else:
        logger.warning(f"⚠️ 部分文件恢复失败 ({success_count}/{len(files_to_restore)})")

if __name__ == "__main__":
    main()
"""
    
    with open("restore_board_logging.py", 'w', encoding='utf-8') as f:
        f.write(restore_script)
    
    logger.info("✅ 已创建恢复脚本: restore_board_logging.py")

def main():
    """主函数"""
    logger.info("🔧 开始禁用展板日志功能...")
    
    success_count = 0
    total_operations = 3
    
    # 1. 禁用展板日志功能
    if disable_board_logging():
        success_count += 1
    
    # 2. 简化展板管理器
    if disable_board_manager():
        success_count += 1
    
    # 3. 创建恢复脚本
    create_restore_logging_script()
    success_count += 1
    
    if success_count == total_operations:
        logger.info("✅ 展板日志功能已成功禁用")
        logger.info("📋 影响的功能:")
        logger.info("  - 详细的展板状态记录")
        logger.info("  - 操作历史追踪")
        logger.info("  - 复杂的上下文管理")
        logger.info("")
        logger.info("📌 保留的功能:")
        logger.info("  - 基本的展板创建和管理")
        logger.info("  - 简化的状态跟踪")
        logger.info("  - 内存中的临时状态")
        logger.info("")
        logger.info("🔄 要恢复完整日志功能，请运行: python restore_board_logging.py")
    else:
        logger.error("❌ 禁用展板日志功能时出现错误")

if __name__ == "__main__":
    main() 