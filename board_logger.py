import os
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class BoardLogger:
    """
    展板日志系统 - 完整版（恢复文件存储功能）
    """
    
    def __init__(self, log_dir="board_logs"):
        """初始化展板日志系统"""
        self.log_dir = log_dir
        self.active_logs = {}
        
        # 确保日志目录存在
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        logger.info("展板日志系统已初始化（完整模式）")
    
    def get_log_path(self, board_id):
        """获取特定展板的日志文件路径"""
        return os.path.join(self.log_dir, f"{board_id}.json")
    
    def load_log(self, board_id):
        """加载展板日志"""
        if board_id in self.active_logs:
            return self.active_logs[board_id]
            
        log_path = self.get_log_path(board_id)
        
        # 尝试从文件加载
        if os.path.exists(log_path):
            try:
                with open(log_path, 'r', encoding='utf-8') as f:
                    log_data = json.load(f)
                    self.active_logs[board_id] = log_data
                    return log_data
            except Exception as e:
                logger.error(f"加载展板日志失败 {board_id}: {str(e)}")
            
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
        self.save_log(board_id, default_log)
        return default_log
    
    def save_log(self, board_id, log_data=None):
        """保存展板日志"""
        try:
            if log_data is None:
                log_data = self.active_logs.get(board_id)
                
            if not log_data:
                return False
                
            log_path = self.get_log_path(board_id)
            log_data["updated_at"] = datetime.now().isoformat()
            
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(log_data, f, ensure_ascii=False, indent=2)
                
            self.active_logs[board_id] = log_data
            return True
            
        except Exception as e:
            logger.error(f"保存展板日志失败 {board_id}: {str(e)}")
            return False
    
    def add_pdf(self, board_id, pdf_data):
        """添加PDF到展板日志"""
        log_data = self.load_log(board_id)
        pdf_data["added_at"] = datetime.now().isoformat()
        pdf_data["updated_at"] = datetime.now().isoformat()
        log_data["pdfs"].append(pdf_data)
        log_data["state"] = "active"
        return self.save_log(board_id, log_data)
    
    def update_pdf_content(self, board_id, filename, content_summary):
        """更新PDF内容摘要"""
        log_data = self.load_log(board_id)
        for pdf in log_data["pdfs"]:
            if pdf.get("filename") == filename:
                pdf["content_summary"] = content_summary
                pdf["updated_at"] = datetime.now().isoformat()
                return self.save_log(board_id, log_data)
        return False
    
    def add_window(self, board_id, window_data):
        """添加窗口到展板日志"""
        log_data = self.load_log(board_id)
        window_id = window_data.get("id", f"window_{int(time.time() * 1000)}")
        window_data["id"] = window_id
        window_data["created_at"] = datetime.now().isoformat()
        window_data["updated_at"] = datetime.now().isoformat()
        log_data["windows"].append(window_data)
        log_data["state"] = "active"
        
        if self.save_log(board_id, log_data):
            logger.info(f"窗口已添加到展板 {board_id}: {window_id}")
            return window_id
        else:
            logger.error(f"添加窗口失败: {board_id}, {window_id}")
            return None
    
    def remove_window(self, board_id, window_id):
        """从展板日志中移除窗口"""
        log_data = self.load_log(board_id)
        original_count = len(log_data["windows"])
        log_data["windows"] = [w for w in log_data["windows"] if w.get("id") != window_id]
        
        if len(log_data["windows"]) < original_count:
            self.add_operation(board_id, "window_removed", {"window_id": window_id})
            return self.save_log(board_id, log_data)
        return False
    
    def update_window(self, board_id, window_id, window_data):
        """更新窗口信息"""
        log_data = self.load_log(board_id)
        
        for i, window in enumerate(log_data["windows"]):
            if window.get("id") == window_id:
                # 保留原始的创建时间
                window_data["created_at"] = window.get("created_at", datetime.now().isoformat())
                window_data["updated_at"] = datetime.now().isoformat()
                window_data["id"] = window_id
                log_data["windows"][i] = window_data
                
                self.add_operation(board_id, "window_updated", {"window_id": window_id})
                return self.save_log(board_id, log_data)
        
        logger.warning(f"未找到要更新的窗口: {board_id}, {window_id}")
        return False
    
    def add_operation(self, board_id, operation_type, data=None):
        """添加操作记录"""
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
        # 操作记录可以不立即保存到文件，在其他操作时一起保存
    
    def get_board_summary(self, board_id):
        """获取展板摘要信息"""
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
        """获取完整展板信息"""
        return self.load_log(board_id)
    
    def init_board(self, board_id):
        """初始化展板日志"""
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
        
        success = self.save_log(board_id, new_log)
        if success:
            logger.info(f"展板 {board_id} 已初始化")
        return success
    
    def clear_board_log(self, board_id):
        """清除展板日志"""
        try:
            log_path = self.get_log_path(board_id)
            if os.path.exists(log_path):
                os.remove(log_path)
            if board_id in self.active_logs:
                del self.active_logs[board_id]
            return True
        except Exception as e:
            logger.error(f"清除展板日志失败 {board_id}: {str(e)}")
            return False

    def validate_board_id(self, board_id):
        """验证展板ID的有效性"""
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
