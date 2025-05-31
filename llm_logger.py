import os
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Body
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# 创建API路由
router = APIRouter(
    prefix="/api",
    tags=["llm-logs"]
)

class LLMLogger:
    """
    LLM交互日志记录器，用于记录所有LLM API调用
    """
    
    # 修改为使用llm_logs目录下的文件
    log_dir = "llm_logs"
    log_file = os.path.join(log_dir, "llm_interactions.jsonl")
    
    @classmethod
    def log_interaction(cls, llm_type, query, response, command=None, metadata=None):
        """
        记录LLM交互
        
        Args:
            llm_type: LLM类型（butler, expert, vision等）
            query: 查询内容
            response: 响应内容
            command: 提取的命令（如果有）
            metadata: 元数据（如会话ID、耗时等）
        """
        try:
            # 确保日志目录存在
            os.makedirs(cls.log_dir, exist_ok=True)
            
            # 生成唯一ID
            import uuid
            log_id = str(uuid.uuid4())
            
            # 创建日志条目 - 增加完整内容和ID
            log_entry = {
                "id": log_id,
                "timestamp": datetime.now().isoformat(),
                "llmType": llm_type,  # 改为前端期望的字段名
                "query": query,        # 存储完整内容
                "response": response,  # 存储完整内容
                "query_preview": query[:100] + "..." if len(query) > 100 else query,
                "response_preview": response[:100] + "..." if len(response) > 100 else response,
                "fullResponse": response,  # 添加完整响应字段
                "metadata": metadata or {}
            }
            
            if command:
                log_entry["command"] = command
                
            # 记录到日志文件
            with open(cls.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
                
            # 同时输出到应用日志
            logger.info(f"LLM交互: {llm_type}, 查询长度: {len(query)}, 响应长度: {len(response)}")
            
            return True
        except Exception as e:
            logger.error(f"记录LLM交互失败: {str(e)}")
            return False

# 添加API路由处理函数 - 改为POST方法并支持过滤
@router.post("/llm-logs")
async def get_llm_logs(params: dict = Body(None)):
    """获取LLM交互日志，支持过滤和分页"""
    try:
        # 获取参数
        llm_type = params.get("llm_type", "all") if params else "all"
        keyword = params.get("keyword", "") if params else ""
        time_range = params.get("time_range", None) if params else None
        limit = params.get("limit", 10) if params else 10
        offset = params.get("offset", 0) if params else 0
        
        logs = []
        if os.path.exists(LLMLogger.log_file):
            with open(LLMLogger.log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        log_entry = json.loads(line)
                        
                        # 过滤逻辑
                        if llm_type != "all" and log_entry.get("llmType") != llm_type:
                            continue
                            
                        if keyword and keyword not in log_entry.get("query", "") and keyword not in log_entry.get("response", ""):
                            continue
                            
                        if time_range:
                            log_time = datetime.fromisoformat(log_entry.get("timestamp"))
                            start_time = datetime.fromisoformat(time_range[0])
                            end_time = datetime.fromisoformat(time_range[1])
                            if not (start_time <= log_time <= end_time):
                                continue
                                
                        logs.append(log_entry)
                    except Exception as e:
                        logger.error(f"解析日志行失败: {str(e)}")
        
        # 按时间倒序排序
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        # 分页
        total = len(logs)
        logs = logs[offset:offset + limit]
        
        return {
            "records": logs,
            "total": total
        }
    except Exception as e:
        logger.error(f"获取日志失败: {str(e)}")
        return {"records": [], "total": 0, "error": str(e)}

@router.post("/llm-logs/clear")
async def clear_llm_logs():
    """清空LLM交互日志"""
    try:
        if os.path.exists(LLMLogger.log_file):
            # 创建备份
            backup_file = f"{LLMLogger.log_file}.bak"
            os.rename(LLMLogger.log_file, backup_file)
            
        # 确保日志目录存在
        os.makedirs(LLMLogger.log_dir, exist_ok=True)
            
        # 创建新的空日志文件
        with open(LLMLogger.log_file, 'w', encoding='utf-8') as f:
            pass
            
        return {"status": "success", "message": "日志已清空"}
    except Exception as e:
        logger.error(f"清空日志失败: {str(e)}")
        return {"error": str(e)}
