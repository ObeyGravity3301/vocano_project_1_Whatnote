import uuid
import time
from collections import defaultdict

class ConversationManager:
    def __init__(self):
        # 使用嵌套的defaultdict存储对话历史
        # 结构: {session_id: {file_id: conversation_history}}
        self.conversations = defaultdict(lambda: defaultdict(list))
        self.last_activity = {}  # 记录最后活动时间
        
    def get_conversation(self, session_id, file_id):
        """获取特定会话和文件的对话历史"""
        # 更新活动时间
        self.last_activity[session_id] = time.time()
        return self.conversations[session_id][file_id]
        
    def add_message(self, session_id, file_id, role, content):
        """添加一条消息到对话历史"""
        self.conversations[session_id][file_id].append({
            "role": role,
            "content": content
        })
        self.last_activity[session_id] = time.time()
        
    def clear_conversation(self, session_id, file_id=None):
        """清除对话历史"""
        if file_id:
            self.conversations[session_id][file_id] = []
        else:
            self.conversations[session_id] = defaultdict(list)
            
    def cleanup_old_sessions(self, max_age=3600*24):
        """清理超过一定时间未活动的会话"""
        current_time = time.time()
        expired_sessions = []
        
        for session_id, last_time in self.last_activity.items():
            if current_time - last_time > max_age:
                expired_sessions.append(session_id)
                
        for session_id in expired_sessions:
            del self.conversations[session_id]
            del self.last_activity[session_id]
            
# 全局单例
conversation_manager = ConversationManager() 