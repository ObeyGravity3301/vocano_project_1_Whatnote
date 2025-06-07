import asyncio
import aiohttp
import json
import logging
from typing import Optional, Callable, Dict, Any
import time

logger = logging.getLogger(__name__)

class AsyncLLMWrapper:
    """异步LLM包装器，避免同步requests阻塞事件循环"""
    
    def __init__(self):
        self.session = None
        
    async def _ensure_session(self):
        """确保aiohttp会话存在"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=120)
            self.session = aiohttp.ClientSession(timeout=timeout)
    
    async def close(self):
        """关闭会话"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def stream_call_llm_async(self, url: str, headers: Dict[str, str], 
                                   data: Dict[str, Any], callback: Optional[Callable] = None) -> str:
        """异步流式LLM调用，避免阻塞事件循环"""
        try:
            await self._ensure_session()
            start_time = time.time()
            
            logger.info("🌐 开始异步流式API请求...")
            
            full_response = ""
            chunk_count = 0
            
            async with self.session.post(url, headers=headers, json=data) as response:
                response.raise_for_status()
                logger.info(f"📡 HTTP响应状态: {response.status}")
                
                async for line in response.content:
                    if line:
                        line_str = line.decode('utf-8').strip()
                        if line_str.startswith('data: '):
                            data_str = line_str[6:]  # 去掉 'data: ' 前缀
                            
                            if data_str.strip() == '[DONE]':
                                logger.info("🏁 收到[DONE]信号，流式结束")
                                break
                                
                            try:
                                chunk_data = json.loads(data_str)
                                if 'choices' in chunk_data and chunk_data['choices']:
                                    delta = chunk_data['choices'][0].get('delta', {})
                                    content = delta.get('content', '')
                                    
                                    if content:
                                        chunk_count += 1
                                        full_response += content
                                        logger.info(f"📦 收到数据块 {chunk_count}: '{content}' (长度: {len(content)})")
                                        
                                        # 如果有回调函数，则调用
                                        if callback and callable(callback):
                                            try:
                                                logger.info(f"🔄 调用回调函数，内容: '{content}'")
                                                if asyncio.iscoroutinefunction(callback):
                                                    await callback(content)
                                                else:
                                                    callback(content)
                                                logger.info("✅ 回调函数调用成功")
                                            except Exception as callback_error:
                                                logger.warning(f"❌ 回调函数执行失败: {callback_error}")
                                        
                                        # 让出控制权，避免阻塞事件循环
                                        await asyncio.sleep(0)
                                        
                            except json.JSONDecodeError as json_error:
                                logger.warning(f"⚠️ JSON解析失败: {json_error}, 数据: {data_str[:100]}...")
                                continue
            
            logger.info(f"📊 异步流式处理统计 - 总块数: {chunk_count}, 总长度: {len(full_response)}")
            
            # 计算耗时
            end_time = time.time()
            duration = end_time - start_time
            logger.info(f"⏱️ 异步流式调用完成，耗时: {duration:.2f}秒")
            
            return full_response
            
        except Exception as e:
            error_msg = f"异步流式调用失败: {str(e)}"
            logger.error(error_msg)
            
            if callback:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(f"错误: {str(e)}")
                    else:
                        callback(f"错误: {str(e)}")
                except:
                    pass
                    
            return error_msg

# 全局异步LLM包装器实例
async_llm_wrapper = AsyncLLMWrapper()

async def cleanup_async_llm():
    """清理异步LLM包装器"""
    await async_llm_wrapper.close() 