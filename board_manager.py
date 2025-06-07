#!/usr/bin/env python3
"""
展板管理器
负责管理展板状态、上下文和实时信息
"""

import os
import json
import logging
from datetime import datetime
from board_logger import board_logger

logger = logging.getLogger(__name__)

class BoardManager:
    """
    展板管理器，负责管理展板的实时状态和上下文信息
    """
    
    def __init__(self):
        """初始化展板管理器"""
        self.board_contexts = {}  # 存储各展板的实时上下文
        self.board_states = {}    # 存储各展板的状态信息
    
    def update_board_context(self, board_id, context_data):
        """
        更新展板上下文信息 - 简化版
        """
        try:
            # 保存到内存
            self.board_contexts[board_id] = context_data
            logger.info(f"展板 {board_id} 上下文已更新（简化模式）")
            return True
        except Exception as e:
            logger.error(f"更新展板上下文失败: {e}")
            return False
    def get_board_context(self, board_id):
        """
        获取展板上下文信息
        
        Args:
            board_id: 展板ID
            
        Returns:
            展板上下文数据
        """
        return self.board_contexts.get(board_id)
    
    def _update_board_state(self, board_id, context_data):
        """更新展板状态信息"""
        try:
            windows = context_data.get('windows', [])
            
            # 分析窗口信息
            pdf_files = []
            notes = []
            
            for window in windows:
                if window.get('type') == 'pdf':
                    pdf_info = {
                        'filename': window.get('filename'),
                        'title': window.get('title'),
                        'current_page': window.get('currentPage', 1),
                        'content_preview': window.get('contentPreview', ''),
                        'is_visible': window.get('isVisible', False)
                    }
                    pdf_files.append(pdf_info)
                    
                elif window.get('type') in ['note', 'user_note', 'annotation']:
                    note_info = {
                        'id': window.get('id'),
                        'type': window.get('type'),
                        'filename': window.get('filename'),
                        'title': window.get('title'),
                        'content_preview': window.get('contentPreview', ''),
                        'is_visible': window.get('isVisible', False)
                    }
                    notes.append(note_info)
            
            # 更新状态
            self.board_states[board_id] = {
                'board_id': board_id,
                'updated_at': datetime.now().isoformat(),
                'pdf_files': pdf_files,
                'notes': notes,
                'stats': context_data.get('stats', {}),
                'summary': context_data.get('summary', {}),
                'raw_context': context_data
            }
            
            logger.info(f"展板 {board_id} 状态已更新: {len(pdf_files)} PDF, {len(notes)} 笔记")
            
        except Exception as e:
            logger.error(f"更新展板状态失败: {e}")
    
    def get_board_state(self, board_id):
        """获取展板状态"""
        return self.board_states.get(board_id)
    
    def get_pdf_files(self, board_id):
        """获取展板上的PDF文件列表"""
        state = self.get_board_state(board_id)
        if state:
            return state.get('pdf_files', [])
        return []
    
    def get_notes(self, board_id):
        """获取展板上的笔记列表"""
        state = self.get_board_state(board_id)
        if state:
            return state.get('notes', [])
        return []
    
    def get_pdf_content_preview(self, board_id, filename):
        """获取指定PDF的内容预览"""
        pdf_files = self.get_pdf_files(board_id)
        for pdf in pdf_files:
            if pdf.get('filename') == filename:
                return pdf.get('content_preview', '')
        return None
    
    def get_note_content_preview(self, board_id, note_id=None, filename=None):
        """获取指定笔记的内容预览"""
        notes = self.get_notes(board_id)
        for note in notes:
            if (note_id and note.get('id') == note_id) or \
               (filename and note.get('filename') == filename):
                return note.get('content_preview', '')
        return None
    
    def get_current_page(self, board_id, filename):
        """获取指定PDF的当前页码"""
        pdf_files = self.get_pdf_files(board_id)
        for pdf in pdf_files:
            if pdf.get('filename') == filename:
                return pdf.get('current_page', 1)
        return 1
    
    def has_content(self, board_id):
        """检查展板是否有内容"""
        state = self.get_board_state(board_id)
        if not state:
            return False
        
        pdf_count = len(state.get('pdf_files', []))
        note_count = len(state.get('notes', []))
        
        return pdf_count > 0 or note_count > 0
    
    def get_board_summary(self, board_id):
        """获取展板摘要信息"""
        state = self.get_board_state(board_id)
        if not state:
            return {
                'board_id': board_id,
                'has_content': False,
                'pdf_count': 0,
                'note_count': 0,
                'description': '空展板'
            }
        
        pdf_files = state.get('pdf_files', [])
        notes = state.get('notes', [])
        
        return {
            'board_id': board_id,
            'has_content': len(pdf_files) > 0 or len(notes) > 0,
            'pdf_count': len(pdf_files),
            'note_count': len(notes),
            'pdf_list': [f"{pdf.get('filename', '')}(第{pdf.get('current_page', 1)}页)" for pdf in pdf_files],
            'note_list': [note.get('title', '') for note in notes],
            'description': state.get('summary', {}).get('description', ''),
            'updated_at': state.get('updated_at')
        }

# 创建全局实例
board_manager = BoardManager() 