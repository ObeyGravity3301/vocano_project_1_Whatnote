import os
import json
import logging
import requests
import uuid
import time
from config import QWEN_API_KEY, QWEN_VL_API_KEY, API_TIMEOUT
from llm_logger import LLMLogger

logger = logging.getLogger(__name__)
#dddddddddddddddddddddddddaaaaaaaaaaaaaaaaaaaaaaa
def main_llm_annotate(text, session_id=None, file_id=None):
    """
    基于文本内容生成注释
    
    Args:
        text: 页面文本内容
        session_id: 会话ID，用于保持上下文连续性
        file_id: 文件ID，用于日志记录
        
    Returns:
        包含注释内容的字典
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    if not QWEN_API_KEY:
        logger.error("未配置QWEN_API_KEY")
        return {"note": "API调用错误：未配置API密钥", "error": True}
    
    try:
        # 准备API请求
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {QWEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 构建提示词
        prompt = f"""请为以下PDF页面内容生成一份结构化的笔记。
        
页面内容:
{text}

请生成一份清晰、结构化的笔记，使用Markdown格式，突出重点内容和关键概念。
注意：只基于提供的内容生成笔记，不要添加未在原文中提及的信息。"""
        
        # 构建消息
        messages = [
            {"role": "system", "content": "你是一个专业的笔记生成助手，擅长将PDF内容转化为结构化笔记。"},
            {"role": "user", "content": prompt}
        ]
        
        data = {
            "model": "qwen-max",
            "messages": messages,
            "temperature": 0.3
        }
        
        # 发送请求 - 配置代理设置以避免连接问题
        start_time = time.time()
        proxies = {'http': None, 'https': None}
        response = requests.post(url, headers=headers, json=data, timeout=API_TIMEOUT, proxies=proxies)
        response.raise_for_status()
        result = response.json()
        
        # 提取回复
        note_content = result["choices"][0]["message"]["content"]
        
        # 计算API调用耗时
        duration = time.time() - start_time
        
        # 记录LLM交互日志
        LLMLogger.log_interaction(
            llm_type="text_annotate",
            query=prompt,
            response=note_content,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "duration": duration,
                "token_count": result.get("usage", {}).get("total_tokens", 0)
            }
        )
        
        return {"note": note_content, "error": False}
        
    except Exception as e:
        error_msg = f"生成注释失败: {str(e)}"
        logger.error(error_msg)
        
        # 记录错误日志
        LLMLogger.log_interaction(
            llm_type="text_annotate",
            query=prompt if 'prompt' in locals() else "未构建提示词",
            response=error_msg,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "error": str(e)
            }
        )
        
        return {"note": f"生成注释时出错: {str(e)}", "error": True}

def vision_llm_recognize(image_path, session_id=None, file_id=None, context=None, board_id=None):
    """
    使用视觉LLM识别图像内容并生成注释，同时将结果保存替换原文本文件
    
    Args:
        image_path: 图像文件路径
        session_id: 会话ID，用于保持上下文连续性
        file_id: 文件ID，用于日志记录
        context: 上下文信息，如当前注释和改进请求
        board_id: 展板ID，如果有，可以使用对应的专家LLM
        
    Returns:
        生成的注释内容
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    if not QWEN_VL_API_KEY:
        logger.error("未配置QWEN_VL_API_KEY")
        return "API调用错误：未配置视觉模型API密钥"
    
    try:
        # 检查图像文件是否存在
        if not os.path.exists(image_path):
            raise ValueError(f"图像文件不存在: {image_path}")
            
        # 从图像路径中提取文件名和页码信息
        # 图像路径格式通常是: uploads/temp/{filename}_page_{page_number}.png
        import re
        filename = None
        page_number = None
        
        # 尝试从图像路径中提取文件名和页码
        if "temp" in image_path and "_page_" in image_path:
            # 例如: uploads/temp/document.pdf_page_1.png
            path_parts = image_path.replace("\\", "/").split("/")
            image_filename = path_parts[-1]  # 获取文件名部分
            
            # 使用正则表达式提取文件名和页码
            match = re.match(r"(.+)_page_(\d+)\.png$", image_filename)
            if match:
                filename = match.group(1)  # 原文件名
                page_number = int(match.group(2))  # 页码
                logger.info(f"从图像路径提取信息: 文件={filename}, 页码={page_number}")
            
        # 读取图像文件并进行base64编码
        import base64
        with open(image_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode('utf-8')
        
        # 准备API请求
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {QWEN_VL_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 构建提示词
        prompt = "请分析这个PDF页面图像，提取其中的所有文本内容，并生成一份结构化的笔记。"
        
        # 如果有上下文信息，添加到提示词中
        if context:
            if 'current_annotation' in context:
                prompt += f"\n\n当前注释内容:\n{context['current_annotation']}"
            if 'improve_request' in context:
                prompt += f"\n\n改进要求:\n{context['improve_request']}"
        
        # 构建消息
        messages = [
            {
                "role": "system", 
                "content": "你是一个专业的视觉内容分析助手，擅长从PDF页面图像中提取信息并生成结构化笔记。"
            },
            {
                "role": "user", 
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_data}"
                        }
                    }
                ]
            }
        ]
        
        data = {
            "model": "qwen-vl-max",
            "messages": messages,
            "temperature": 0.3
        }
        
        # 发送请求 - 配置代理设置以避免连接问题
        start_time = time.time()
        proxies = {
            'http': None,
            'https': None
        }
        response = requests.post(url, headers=headers, json=data, timeout=API_TIMEOUT*2, proxies=proxies)  # 视觉模型可能需要更长时间
        response.raise_for_status()
        result = response.json()
        
        # 提取回复
        note_content = result["choices"][0]["message"]["content"]
        
        # 计算API调用耗时
        duration = time.time() - start_time
        
        # 记录LLM交互日志
        LLMLogger.log_interaction(
            llm_type="vision_recognize",
            query=prompt,
            response=note_content,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "board_id": board_id,
                "duration": duration,
                "token_count": result.get("usage", {}).get("total_tokens", 0),
                "requestType": "image",  # 前端调试面板期望的字段名
                "operation_type": "vision_annotation",  # 添加操作类型
                "input_type": "image"  # 明确指示这是图像输入
            }
        )
        
        # 新增：将图像识别结果保存到对应的页面文本文件，替换原有的文本提取内容
        if filename and page_number:
            try:
                page_text_file = os.path.join("pages", f"{filename}_page_{page_number}.txt")
                logger.info(f"保存图像识别结果到: {page_text_file}")
                
                # 确保pages目录存在
                os.makedirs("pages", exist_ok=True)
                
                # 将图像识别的结果写入到对应的页面文本文件中，替换原有内容
                with open(page_text_file, 'w', encoding='utf-8') as f:
                    f.write(note_content)
                
                logger.info(f"成功将图像识别结果保存到 {page_text_file}，内容长度: {len(note_content)}")
                
            except Exception as save_error:
                logger.error(f"保存图像识别结果到文件失败: {str(save_error)}")
                # 即使保存失败，也不影响返回识别结果
        else:
            logger.warning(f"无法从图像路径提取文件信息，跳过保存: {image_path}")
        
        return note_content
        
    except Exception as e:
        error_str = str(e)
        
        # 根据错误类型返回更具体的错误信息
        if ("Arrearage" in error_str or 
            "Access denied" in error_str or 
            "account is in good standing" in error_str):
            error_msg = f"视觉识别失败: API账户余额不足，请充值后重试"
        elif ("HTTPSConnectionPool" in error_str or 
              "Unable to connect" in error_str or
              "Connection refused" in error_str):
            error_msg = f"视觉识别失败: 网络连接问题，请检查网络后重试"
        elif "未配置" in error_str and "API" in error_str:
            error_msg = f"视觉识别失败: API密钥未配置"
        else:
            error_msg = f"视觉识别失败: {error_str}"
            
        logger.error(error_msg)
        
        # 记录错误日志
        LLMLogger.log_interaction(
            llm_type="vision_recognize",
            query=prompt if 'prompt' in locals() else "未构建提示词",
            response=error_msg,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "board_id": board_id,
                "error": error_str
            }
        )
        
        return f"视觉识别过程中出错: {error_msg}"

def generate_pdf_note(pages_text, session_id=None, file_id=None):
    """
    生成整本PDF的笔记
    
    Args:
        pages_text: 所有页面的文本内容列表
        session_id: 会话ID，用于保持上下文连续性
        file_id: 文件ID，用于日志记录
        
    Returns:
        生成的笔记内容
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    if not QWEN_API_KEY:
        logger.error("未配置QWEN_API_KEY")
        return "API调用错误：未配置API密钥"
    
    try:
        # 准备API请求
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {QWEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 构建提示词 - 为避免超出上下文长度，只使用部分页面作为示例
        # 将限制从5页改为40页
        total_pages = len(pages_text)
        sample_pages = min(40, total_pages)
        
        # 判断使用的页面范围
        if total_pages <= 40:
            # 如果总页数不超过40页，使用全部页面
            pages_used = pages_text
            page_range_info = f"<参考第1页-第{total_pages}页内容>"
        else:
            # 如果超过40页，取前20页和后20页
            front_pages = 20
            back_pages = 20
            pages_used = pages_text[:front_pages] + pages_text[-back_pages:]
            page_range_info = f"<参考第1页-第{front_pages}页及第{total_pages-back_pages+1}页-第{total_pages}页内容>"
        
        # 构建内容样本
        content_samples = "\n\n".join([f"第{i+1}页:\n{text[:300]}..." for i, text in enumerate(pages_used)])
        
        prompt = f"""请为以下PDF文档生成一份完整的笔记。

文档有 {total_pages} 页，以下是部分内容示例:
{content_samples}

请生成一份完整的笔记，包括主要内容的结构化总结，使用Markdown格式，突出重点和关键概念。
注意：只基于提供的内容生成笔记，不要添加未在原文中提及的信息。
重要要求：
1. 在笔记中引用重要内容时，请标注相应的页码，格式为：(第X页) 或 (第X-Y页)
2. 例如："该理论的核心观点是... (第3页)"
3. 对于跨越多页的内容，可以标注页码范围："详细推导过程见原文 (第5-7页)"
"""
        
        # 构建消息
        messages = [
            {"role": "system", "content": "你是一个专业的笔记生成助手，擅长将PDF内容转化为结构化笔记。"},
            {"role": "user", "content": prompt}
        ]
        
        data = {
            "model": "qwen-max",
            "messages": messages,
            "temperature": 0.3
        }
        
        # 发送请求 - 配置代理设置以避免连接问题
        start_time = time.time()
        proxies = {'http': None, 'https': None}
        response = requests.post(url, headers=headers, json=data, timeout=API_TIMEOUT*2, proxies=proxies)  # 整本笔记可能需要更长时间
        response.raise_for_status()
        result = response.json()
        
        # 提取回复
        note_content = result["choices"][0]["message"]["content"]
        
        # 在笔记开头添加页数引用信息
        note_content_with_range = f"{page_range_info}\n\n{note_content}"
        
        # 计算API调用耗时
        duration = time.time() - start_time
        
        # 记录LLM交互日志
        LLMLogger.log_interaction(
            llm_type="pdf_note",
            query=prompt,
            response=note_content,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "duration": duration,
                "token_count": result.get("usage", {}).get("total_tokens", 0),
                "pages_count": total_pages,
                "pages_used": len(pages_used)
            }
        )
        
        return note_content_with_range
        
    except Exception as e:
        error_msg = f"生成整本笔记失败: {str(e)}"
        logger.error(error_msg)
        
        # 记录错误日志
        LLMLogger.log_interaction(
            llm_type="pdf_note",
            query=prompt if 'prompt' in locals() else "未构建提示词",
            response=error_msg,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "error": str(e)
            }
        )
        
        return f"生成整本笔记时出错: {str(e)}"

def ask_pdf_question(pages_text, question, session_id=None, file_id=None):
    """
    回答关于PDF内容的问题
    
    Args:
        pages_text: 所有页面的文本内容列表
        question: 用户问题
        session_id: 会话ID，用于保持上下文连续性
        file_id: 文件ID，用于日志记录
        
    Returns:
        问题的回答
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    if not QWEN_API_KEY:
        logger.error("未配置QWEN_API_KEY")
        return "API调用错误：未配置API密钥"
    
    try:
        # 准备API请求
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {QWEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 构建提示词 - 为避免超出上下文长度，只使用部分页面作为上下文
        # 根据问题长度动态调整包含的页面数量
        max_pages = max(1, min(10, 8000 // (len(question) + 100)))
        content_context = "\n\n".join([f"第{i+1}页:\n{text}" for i, text in enumerate(pages_text[:max_pages])])
        
        prompt = f"""请基于以下PDF文档内容回答问题。

文档内容:
{content_context}

用户问题: {question}

请提供准确、详细的回答，只基于文档中包含的信息。如果文档中没有相关信息，请明确说明。"""
        
        # 构建消息
        messages = [
            {"role": "system", "content": "你是一个专业的PDF内容问答助手，擅长基于文档内容回答问题。"},
            {"role": "user", "content": prompt}
        ]
        
        data = {
            "model": "qwen-max",
            "messages": messages,
            "temperature": 0.3
        }
        
        # 发送请求 - 配置代理设置以避免连接问题
        start_time = time.time()
        proxies = {'http': None, 'https': None}
        response = requests.post(url, headers=headers, json=data, timeout=API_TIMEOUT, proxies=proxies)
        response.raise_for_status()
        result = response.json()
        
        # 提取回复
        answer_content = result["choices"][0]["message"]["content"]
        
        # 计算API调用耗时
        duration = time.time() - start_time
        
        # 记录LLM交互日志
        LLMLogger.log_interaction(
            llm_type="pdf_question",
            query=question,
            response=answer_content,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "duration": duration,
                "token_count": result.get("usage", {}).get("total_tokens", 0)
            }
        )
        
        return answer_content
        
    except Exception as e:
        error_msg = f"回答问题失败: {str(e)}"
        logger.error(error_msg)
        
        # 记录错误日志
        LLMLogger.log_interaction(
            llm_type="pdf_question",
            query=question,
            response=error_msg,
            metadata={
                "session_id": session_id,
                "file_id": file_id,
                "error": str(e)
            }
        )
        
        return f"回答问题时出错: {str(e)}"

def improve_user_note(note_content, pages_text, improve_prompt, session_id=None, file_id=None):
    """
    改进用户笔记内容
    
    Args:
        note_content: 当前笔记内容
        pages_text: 相关页面的文本内容列表
        improve_prompt: 用户的改进要求
        session_id: 会话ID，用于保持上下文连续性
        file_id: 文件ID，用于日志记录
        
    Returns:
        改进后的笔记内容
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    if not QWEN_API_KEY:
        logger.error("未配置QWEN_API_KEY")
        return "API调用错误：未配置API密钥"
    
    # 尝试次数
    max_retries = 2
    
    for attempt in range(max_retries):
        try:
            # 准备API请求
            url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {QWEN_API_KEY}",
                "Content-Type": "application/json"
            }
            
            # 对超长内容进行截断处理，避免超时
            MAX_CONTENT_LENGTH = 4000  # 设置最大内容长度
            truncated_note = note_content
            if len(note_content) > MAX_CONTENT_LENGTH:
                truncated_note = note_content[:MAX_CONTENT_LENGTH] + "\n\n[内容过长，已截断...]"
                logger.info(f"笔记内容过长({len(note_content)}字符)，已截断至{MAX_CONTENT_LENGTH}字符")
            
            # 构建提示词
            prompt = f"""请根据以下要求改进笔记内容:

改进要求: {improve_prompt}

当前笔记内容:
{truncated_note}
"""
            
            # 如果有页面文本，添加部分作为参考
            if pages_text and len(pages_text) > 0:
                # 添加部分参考内容
                sample_text = "\n\n".join([f"第{i+1}页:\n{text[:300]}..." for i, text in enumerate(pages_text[:2])])
                prompt += f"\n\n参考内容:\n{sample_text}"
            
            # 构建消息
            messages = [
                {"role": "system", "content": "你是一个专业的笔记改进助手，擅长根据用户要求优化笔记内容。"},
                {"role": "user", "content": prompt}
            ]
            
            data = {
                "model": "qwen-max",
                "messages": messages,
                "temperature": 0.3
            }
            
            # 发送请求，对于改进任务使用更长的超时时间
            start_time = time.time()
            timeout = API_TIMEOUT * 2 if len(note_content) > 2000 else API_TIMEOUT  # 对长内容使用更长超时
            proxies = {'http': None, 'https': None}
            
            logger.info(f"开始笔记改进请求（尝试 {attempt + 1}/{max_retries}），超时时间：{timeout}秒")
            response = requests.post(url, headers=headers, json=data, timeout=timeout, proxies=proxies)
            response.raise_for_status()
            result = response.json()
            
            # 提取回复
            improved_note = result["choices"][0]["message"]["content"]
            
            # 计算API调用耗时
            duration = time.time() - start_time
            logger.info(f"笔记改进成功，耗时：{duration:.2f}秒")
            
            # 记录LLM交互日志
            LLMLogger.log_interaction(
                llm_type="improve_note",
                query=prompt,
                response=improved_note,
                metadata={
                    "session_id": session_id,
                    "file_id": file_id,
                    "duration": duration,
                    "token_count": result.get("usage", {}).get("total_tokens", 0),
                    "original_length": len(note_content),
                    "truncated": len(note_content) > MAX_CONTENT_LENGTH,
                    "attempt": attempt + 1
                }
            )
            
            return improved_note
            
        except requests.exceptions.ReadTimeout:
            error_msg = f"API调用超时（尝试 {attempt + 1}/{max_retries}）"
            logger.warning(error_msg)
            if attempt == max_retries - 1:  # 最后一次尝试
                return f"笔记改进请求超时，请稍后重试。如果问题持续，请考虑缩短笔记内容后再次尝试。"
            time.sleep(2)  # 重试前等待2秒
            
        except requests.exceptions.ConnectionError:
            error_msg = f"网络连接错误（尝试 {attempt + 1}/{max_retries}）"
            logger.warning(error_msg)
            if attempt == max_retries - 1:  # 最后一次尝试
                return f"网络连接失败，请检查网络连接后重试。"
            time.sleep(3)  # 重试前等待3秒
            
        except Exception as e:
            error_msg = f"改进笔记失败: {str(e)}"
            logger.error(error_msg)
            
            # 记录错误日志
            LLMLogger.log_interaction(
                llm_type="improve_note",
                query=prompt if 'prompt' in locals() else "未构建提示词",
                response=error_msg,
                metadata={
                    "session_id": session_id,
                    "file_id": file_id,
                    "error": str(e),
                    "attempt": attempt + 1
                }
            )
            
            # 对于非网络错误，不重试
            return f"改进笔记时出错: {str(e)}"
    
    # 如果所有重试都失败了，返回默认错误信息
    return "笔记改进失败，已尝试多次请求。请稍后重试。"
