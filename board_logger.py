import os
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class BoardLogger:
    """
    展板日志系统，负责记录展板状态和操作历史
    """
    
    def __init__(self, log_dir="board_logs"):
        """
        初始化展板日志系统
        
        Args:
            log_dir: 日志存储目录
        """
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.active_logs = {}  # 活跃的日志缓存
    
    def get_log_path(self, board_id):
        """获取特定展板的日志文件路径"""
        return os.path.join(self.log_dir, f"{board_id}.json")
    
    def load_log(self, board_id):
        """加载展板日志"""
        log_path = self.get_log_path(board_id)
        if board_id in self.active_logs:
            return self.active_logs[board_id]
            
        if os.path.exists(log_path):
            try:
                with open(log_path, 'r', encoding='utf-8') as f:
                    log_data = json.load(f)
                    self.active_logs[board_id] = log_data
                    return log_data
            except Exception as e:
                logger.error(f"加载展板日志失败: {str(e)}")
        
        # 如果日志不存在或加载失败，创建新日志
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
        return new_log
    
    def save_log(self, board_id, log_data=None):
        """保存展板日志"""
        if log_data is None:
            if board_id not in self.active_logs:
                return False
            log_data = self.active_logs[board_id]
        
        # 更新时间戳
        log_data["updated_at"] = datetime.now().isoformat()
        
        # 保存到内存缓存
        self.active_logs[board_id] = log_data
        
        # 保存到文件
        log_path = self.get_log_path(board_id)
        try:
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(log_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"保存展板日志失败: {str(e)}")
            return False
    
    def add_pdf(self, board_id, pdf_data):
        """添加PDF到展板日志"""
        log_data = self.load_log(board_id)
        
        # 检查PDF是否已存在
        for pdf in log_data["pdfs"]:
            if pdf["filename"] == pdf_data["filename"]:
                # 更新已存在的PDF信息
                pdf.update(pdf_data)
                pdf["updated_at"] = datetime.now().isoformat()
                self.save_log(board_id, log_data)
                return
        
        # 添加新PDF
        pdf_data["added_at"] = datetime.now().isoformat()
        pdf_data["updated_at"] = datetime.now().isoformat()
        log_data["pdfs"].append(pdf_data)
        log_data["state"] = "active"
        
        # 记录操作
        self.add_operation(board_id, "pdf_added", pdf_data)
        self.save_log(board_id, log_data)
    
    def update_pdf_content(self, board_id, filename, content_summary):
        """更新PDF内容摘要"""
        log_data = self.load_log(board_id)
        
        for pdf in log_data["pdfs"]:
            if pdf["filename"] == filename:
                pdf["content_summary"] = content_summary
                pdf["updated_at"] = datetime.now().isoformat()
                self.add_operation(board_id, "pdf_analyzed", {"filename": filename})
                self.save_log(board_id, log_data)
                return True
        
        return False
    
    def add_window(self, board_id, window_data):
        """添加窗口到展板日志"""
        log_data = self.load_log(board_id)
        
        # 生成窗口ID
        window_id = window_data.get("id", f"window_{int(time.time())}")
        window_data["id"] = window_id
        
        # 检查窗口是否已存在
        for i, window in enumerate(log_data["windows"]):
            if window["id"] == window_id:
                # 更新已存在的窗口
                log_data["windows"][i] = window_data
                self.save_log(board_id, log_data)
                return window_id
        
        # 添加新窗口
        window_data["created_at"] = datetime.now().isoformat()
        window_data["updated_at"] = datetime.now().isoformat()
        log_data["windows"].append(window_data)
        
        # 记录操作
        self.add_operation(board_id, "window_added", {"window_id": window_id, "type": window_data.get("type")})
        self.save_log(board_id, log_data)
        return window_id
    
    def remove_window(self, board_id, window_id):
        """从展板日志中移除窗口"""
        log_data = self.load_log(board_id)
        
        for i, window in enumerate(log_data["windows"]):
            if window["id"] == window_id:
                removed = log_data["windows"].pop(i)
                self.add_operation(board_id, "window_removed", {"window_id": window_id, "type": removed.get("type")})
                self.save_log(board_id, log_data)
                return True
        
        return False
    
    def update_window(self, board_id, window_id, window_data):
        """更新窗口信息"""
        log_data = self.load_log(board_id)
        
        for i, window in enumerate(log_data["windows"]):
            if window["id"] == window_id:
                # 保留创建时间
                window_data["created_at"] = window.get("created_at")
                window_data["updated_at"] = datetime.now().isoformat()
                log_data["windows"][i] = window_data
                self.add_operation(board_id, "window_updated", {"window_id": window_id})
                self.save_log(board_id, log_data)
                return True
        
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
            
        self.save_log(board_id, log_data)
    
    def get_board_summary(self, board_id):
        """获取展板摘要信息，用于管家LLM"""
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
        """获取完整展板信息，用于专家LLM"""
        return self.load_log(board_id)
    
    def init_board(self, board_id):
        """初始化展板日志 - 确保新展板从空白状态开始"""
        
        # 验证展板ID
        if not self.validate_board_id(board_id):
            raise ValueError(f"无效的展板ID: {board_id}，不能使用课程文件ID作为展板ID")
        
        # 先清除可能存在的旧日志
        if board_id in self.active_logs:
            del self.active_logs[board_id]
        
        # 如果磁盘上有旧的日志文件，也删除它
        log_path = self.get_log_path(board_id)
        if os.path.exists(log_path):
            try:
                os.remove(log_path)
                logger.info(f"已清除展板 {board_id} 的旧日志文件")
            except Exception as e:
                logger.error(f"清除旧日志文件失败: {str(e)}")
        
        # 创建全新的日志数据
        new_log = {
            "board_id": board_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "pdfs": [],
            "windows": [],
            "operations": [],
            "state": "empty"
        }
        
        # 保存到内存和磁盘
        self.active_logs[board_id] = new_log
        self.save_log(board_id, new_log)
        
        # 记录初始化操作
        self.add_operation(board_id, "board_initialized", {
            "initialized_at": datetime.now().isoformat(),
            "is_fresh_board": True
        })
        
        logger.info(f"展板 {board_id} 已初始化为空白状态")
        return True
    
    def clear_board_log(self, board_id):
        """清除展板日志"""
        if board_id in self.active_logs:
            del self.active_logs[board_id]
            
        log_path = self.get_log_path(board_id)
        if os.path.exists(log_path):
            try:
                os.remove(log_path)
                return True
            except Exception as e:
                logger.error(f"删除展板日志失败: {str(e)}")
        
        return False


    def validate_board_id(self, board_id):
        """验证展板ID的有效性，防止使用课程文件ID"""
        if not board_id:
            return False
        
        # 检查是否是课程文件ID格式（file-course-*）
        if board_id.startswith('file-course-'):
            logger.warning(f"检测到无效的展板ID（课程文件ID）: {board_id}")
            return False
        
        # 检查是否是课程文件ID格式（file-*）
        if board_id.startswith('file-') and not board_id.startswith('file-1748'):
            logger.warning(f"检测到可能无效的展板ID: {board_id}")
            return False
        
        return True

# 全局单例
board_logger = BoardLogger() 