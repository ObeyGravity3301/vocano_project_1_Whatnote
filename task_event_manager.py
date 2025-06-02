#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
任务事件管理器
负责任务状态变化的实时事件推送
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Set
from datetime import datetime
import weakref

logger = logging.getLogger(__name__)

class TaskEventManager:
    """任务事件管理器，使用SSE推送任务状态变化"""
    
    def __init__(self):
        # 存储各个展板的事件订阅者
        self.board_subscribers: Dict[str, Set[weakref.ReferenceType]] = {}
        # 任务状态缓存
        self.task_states: Dict[str, Dict[str, Any]] = {}
        
    def subscribe(self, board_id: str, subscriber):
        """订阅展板的任务事件"""
        if board_id not in self.board_subscribers:
            self.board_subscribers[board_id] = set()
        
        # 使用弱引用避免内存泄漏
        weak_ref = weakref.ref(subscriber)
        self.board_subscribers[board_id].add(weak_ref)
        
        logger.info(f"📻 [EVENT] 新订阅者加入展板 {board_id}，当前订阅者数: {len(self.board_subscribers[board_id])}")
        
        # 立即发送当前任务状态
        current_tasks = self.get_board_tasks(board_id)
        if current_tasks:
            asyncio.create_task(self._send_to_subscriber(subscriber, {
                "type": "task_list_update",
                "board_id": board_id,
                "tasks": current_tasks,
                "timestamp": datetime.now().isoformat()
            }))
    
    def unsubscribe(self, board_id: str, subscriber):
        """取消订阅"""
        if board_id in self.board_subscribers:
            # 清理失效的弱引用
            self.board_subscribers[board_id] = {
                ref for ref in self.board_subscribers[board_id] 
                if ref() is not None and ref() != subscriber
            }
            
            if not self.board_subscribers[board_id]:
                del self.board_subscribers[board_id]
                
            logger.info(f"📻 [EVENT] 订阅者离开展板 {board_id}")
    
    async def notify_task_started(self, board_id: str, task_id: str, task_info: Dict[str, Any]):
        """通知任务开始"""
        # 更新任务状态缓存
        if board_id not in self.task_states:
            self.task_states[board_id] = {}
        
        self.task_states[board_id][task_id] = {
            "task_id": task_id,
            "task_type": task_info.get("task_type", "unknown"),
            "status": "running",
            "start_time": datetime.now().isoformat(),
            "duration": 0,
            "description": task_info.get("description", ""),
            "display_name": self._get_task_display_name(task_info.get("task_type", "unknown"))
        }
        
        logger.info(f"🚀 [EVENT] 任务开始: {board_id}/{task_id} - {task_info.get('task_type')}")
        
        # 广播事件
        await self._broadcast_to_board(board_id, {
            "type": "task_started",
            "board_id": board_id,
            "task": self.task_states[board_id][task_id],
            "tasks": self.get_board_tasks(board_id),
            "timestamp": datetime.now().isoformat()
        })
    
    async def notify_task_completed(self, board_id: str, task_id: str, result: Any = None):
        """通知任务完成"""
        if board_id in self.task_states and task_id in self.task_states[board_id]:
            # 移除完成的任务
            completed_task = self.task_states[board_id].pop(task_id)
            
            logger.info(f"✅ [EVENT] 任务完成: {board_id}/{task_id} - {completed_task.get('task_type')}")
            
            # 广播事件
            await self._broadcast_to_board(board_id, {
                "type": "task_completed",
                "board_id": board_id,
                "task_id": task_id,
                "completed_task": completed_task,
                "tasks": self.get_board_tasks(board_id),
                "timestamp": datetime.now().isoformat()
            })
    
    async def notify_task_failed(self, board_id: str, task_id: str, error: str):
        """通知任务失败"""
        if board_id in self.task_states and task_id in self.task_states[board_id]:
            # 移除失败的任务
            failed_task = self.task_states[board_id].pop(task_id)
            failed_task["error"] = error
            
            logger.error(f"❌ [EVENT] 任务失败: {board_id}/{task_id} - {error}")
            
            # 广播事件
            await self._broadcast_to_board(board_id, {
                "type": "task_failed",
                "board_id": board_id,
                "task_id": task_id,
                "failed_task": failed_task,
                "tasks": self.get_board_tasks(board_id),
                "timestamp": datetime.now().isoformat()
            })
    
    async def update_task_progress(self, board_id: str, task_id: str, duration: float):
        """更新任务进度"""
        if board_id in self.task_states and task_id in self.task_states[board_id]:
            self.task_states[board_id][task_id]["duration"] = duration
            
            # 每5秒广播一次进度更新
            if int(duration) % 5 == 0:
                await self._broadcast_to_board(board_id, {
                    "type": "task_progress",
                    "board_id": board_id,
                    "task_id": task_id,
                    "duration": duration,
                    "tasks": self.get_board_tasks(board_id),
                    "timestamp": datetime.now().isoformat()
                })
    
    def get_board_tasks(self, board_id: str) -> List[Dict[str, Any]]:
        """获取展板的活跃任务列表"""
        if board_id not in self.task_states:
            return []
        
        tasks = []
        for task_id, task_info in self.task_states[board_id].items():
            # 计算运行时间
            if task_info.get("start_time"):
                try:
                    start_time = datetime.fromisoformat(task_info["start_time"])
                    duration = (datetime.now() - start_time).total_seconds()
                    task_info["duration"] = duration
                except:
                    pass
            
            tasks.append(task_info.copy())
        
        return tasks
    
    async def _broadcast_to_board(self, board_id: str, event_data: Dict[str, Any]):
        """向展板的所有订阅者广播事件"""
        if board_id not in self.board_subscribers:
            return
        
        # 清理失效的弱引用并发送事件
        valid_subscribers = set()
        for weak_ref in self.board_subscribers[board_id]:
            subscriber = weak_ref()
            if subscriber is not None:
                valid_subscribers.add(weak_ref)
                await self._send_to_subscriber(subscriber, event_data)
        
        self.board_subscribers[board_id] = valid_subscribers
    
    async def _send_to_subscriber(self, subscriber, event_data: Dict[str, Any]):
        """发送事件给特定订阅者"""
        try:
            if hasattr(subscriber, 'send_event'):
                await subscriber.send_event(event_data)
            elif callable(subscriber):
                await subscriber(event_data)
        except Exception as e:
            logger.error(f"❌ [EVENT] 发送事件失败: {str(e)}")
    
    def _get_task_display_name(self, task_type: str) -> str:
        """获取任务的友好显示名称"""
        display_names = {
            'annotation': '生成注释',
            'improve_annotation': '改进注释',
            'generate_note': '生成笔记',
            'generate_segmented_note': '分段生成笔记',
            'generate_board_note': '生成展板笔记',
            'improve_board_note': '改进展板笔记',
            'answer_question': '回答问题',
            'vision_annotation': '视觉识别注释',
            'general_query': '通用查询'
        }
        return display_names.get(task_type, task_type)

# 全局事件管理器实例
task_event_manager = TaskEventManager() 