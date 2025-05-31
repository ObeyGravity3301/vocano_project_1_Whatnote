import os
import uuid
from llm_agents import main_llm_annotate, vision_llm_recognize, generate_pdf_note, ask_pdf_question, improve_user_note
from config import PAGE_DIR, UPLOAD_DIR
import fitz
import json
from typing import Optional
from fastapi import Query, Body, HTTPException
import logging

# 配置日志
logger = logging.getLogger(__name__)

def get_page_text(filename: str, page_number: int) -> str:
    """
    获取PDF页面文本，增强对特殊文件名的处理
    """
    # 标准路径尝试
    page_file = os.path.join(PAGE_DIR, f"{filename}_page_{page_number}.txt")
    
    # 如果文件不存在，尝试其他可能的文件名格式
    if not os.path.exists(page_file):
        print(f"警告: 未找到页面文本文件: {page_file}")
        
        # 尝试列出pages目录中所有可能匹配的文件
        try:
            all_page_files = os.listdir(PAGE_DIR)
            possible_matches = [f for f in all_page_files if f.endswith(f"_page_{page_number}.txt")]
            
            # 尝试找到与当前文件名匹配度最高的文件
            if possible_matches:
                # 提取原始文件名部分（不含扩展名）
                name_without_ext = os.path.splitext(filename)[0]
                
                # 寻找包含原文件名的页面文件
                for match in possible_matches:
                    if name_without_ext in match:
                        page_file = os.path.join(PAGE_DIR, match)
                        print(f"找到匹配的页面文件: {page_file}")
                        break
        except Exception as e:
            print(f"搜索匹配页面文件时出错: {str(e)}")
    
    # 如果仍然找不到文件，返回空字符串
    if not os.path.exists(page_file):
        # 尝试提取PDF并生成文本
        try:
            print(f"尝试从PDF文件提取第{page_number}页内容...")
            pdf_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(pdf_path):
                doc = fitz.open(pdf_path)
                if 0 <= page_number-1 < len(doc):
                    page = doc[page_number-1]
                    text = page.get_text()
                    
                    # 保存提取的文本到文件
                    with open(page_file, 'w', encoding='utf-8') as f:
                        f.write(text)
                    print(f"成功提取并保存页面文本: {page_file}")
                    return text
                else:
                    print(f"页码超出范围: {page_number}，PDF总页数: {len(doc)}")
            else:
                print(f"PDF文件不存在: {pdf_path}")
        except Exception as e:
            print(f"即时提取PDF页面文本失败: {str(e)}")
        
        return ""
    
    # 读取并返回文本内容
    try:
        with open(page_file, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"读取页面文本文件失败: {str(e)}")
        return ""

def get_page_image(filename: str, page_number: int) -> str:
    pdf_path = os.path.join(UPLOAD_DIR, filename)
    img_path = os.path.join(PAGE_DIR, f"{filename}_page_{page_number}.png")
    if not os.path.exists(img_path):
        doc = fitz.open(pdf_path)
        page = doc[page_number - 1]
        pix = page.get_pixmap(dpi=200)
        pix.save(img_path)
    return img_path

def check_file_exists(filename: str) -> dict:
    """
    检查文件是否存在，如果存在返回真实路径
    """
    if not filename:
        return {"exists": False, "path": None}
    
    # 检查直接使用文件名
    direct_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(direct_path):
        return {"exists": True, "path": filename}
    
    # 尝试在上传目录中查找匹配的文件
    try:
        all_files = os.listdir(UPLOAD_DIR)
        
        # 1. 检查精确匹配
        if filename in all_files:
            return {"exists": True, "path": filename}
        
        # 2. 忽略大小写查找
        lower_filename = filename.lower()
        for file in all_files:
            if file.lower() == lower_filename:
                return {"exists": True, "path": file}
        
        # 3. 查找包含原文件名的文件(针对服务器可能添加前缀或后缀的情况)
        name_without_ext = os.path.splitext(filename)[0]
        for file in all_files:
            if name_without_ext in file:
                return {"exists": True, "path": file}
    except Exception as e:
        print(f"查找文件出错: {e}")
    
    return {"exists": False, "path": None}

def annotate_page(filename: str, page_number: int, force_vision: bool = False, 
                session_id: str = None, current_annotation: str = None, 
                improve_request: str = None, board_id: str = None) -> dict:
    """
    为PDF页面生成注释
    
    Args:
        filename: PDF文件名
        page_number: 页码
        force_vision: 是否强制使用视觉识别
        session_id: 会话ID，用于保持LLM上下文连续性
        current_annotation: 当前的注释内容（用于重新生成时参考）
        improve_request: 用户的改进请求
        board_id: 展板ID，如果有，则使用对应的专家LLM
        
    Returns:
        包含注释内容和来源的字典
    """
    # 如果没有提供session_id，生成一个新的
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # 记录调用详细信息
    print(f"注释生成请求: 文件={filename}, 页码={page_number}, 强制视觉={force_vision}, "
          f"会话ID={session_id}, 当前注释长度={len(current_annotation) if current_annotation else 0}, "
          f"改进请求={improve_request}, 展板ID={board_id}")
    
    # 构建临时文件路径
    temp_dir = os.path.join("uploads", "temp")
    os.makedirs(temp_dir, exist_ok=True)
    
    # 获取文件路径
    file_path = os.path.join("uploads", filename)
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        raise ValueError(f"文件不存在: {file_path}")
    
    # 重点改进：创建上下文字典，包含当前注释和改进请求
    context_dict = {}
    if current_annotation:
        context_dict['current_annotation'] = current_annotation
    if improve_request:
        context_dict['improve_request'] = improve_request
    
    # 处理改进请求 - 已有注释内容且有改进请求的情况
    if current_annotation and improve_request:
        print(f"检测到通过专家LLM重新生成注释请求: {improve_request}")
        
        try:
            # 正常情况下尝试获取文本内容
            text = get_page_text(filename, page_number)
            
            # 使用专家LLM改进文本注释，不再调用视觉识别
            if board_id:
                try:
                    from expert_llm import ExpertLLMRegistry
                    # 获取或创建展板专家LLM
                    expert_llm = ExpertLLMRegistry.get_or_create(board_id)
                    if expert_llm:
                        improved_note = expert_llm.improve_note(
                            current_annotation, 
                            improve_request
                        )
                        return {"source": "expert_llm", "annotation": improved_note, "session_id": session_id}
                except Exception as e:
                    print(f"使用展板专家LLM改进注释失败: {str(e)}，将使用通用LLM")
                        
            # 如果没有展板ID或专家LLM处理失败，使用通用LLM改进
            improved_note = improve_user_note(
                current_annotation, 
                [text], 
                improve_request,
                session_id=session_id, 
                file_id=filename
            )
            return {"source": "text", "annotation": improved_note, "session_id": session_id}
        except Exception as e:
            print(f"改进注释过程中出错: {str(e)}")
            # 如果获取文本失败，仍然尝试使用当前注释进行改进
            improved_note = improve_user_note(
                current_annotation, 
                [], 
                improve_request,
                session_id=session_id, 
                file_id=filename
            )
            return {"source": "text", "annotation": improved_note, "session_id": session_id}
    
    # 强制视觉识别的情况
    if force_vision:
        # 获取图片路径
        img_path = get_page_image(filename, page_number)
        
        if not img_path:
            raise ValueError(f"无法获取页面图片: {filename} 第{page_number}页")
        
        # 调用视觉LLM，传递上下文字典和展板ID
        vision_result = vision_llm_recognize(img_path, session_id=session_id, file_id=filename, 
                                           context=context_dict, board_id=board_id)
        
        # 🔥 新增功能：将视觉识别结果保存到txt文件中，替换原始PDF提取的内容
        try:
            page_file = os.path.join(PAGE_DIR, f"{filename}_page_{page_number}.txt")
            with open(page_file, 'w', encoding='utf-8') as f:
                f.write(vision_result)
            print(f"✅ 视觉识别结果已保存到: {page_file}")
        except Exception as e:
            print(f"⚠️ 保存视觉识别结果失败: {str(e)}")
            # 即使保存失败，也继续返回结果
        
        return {"source": "vision", "annotation": vision_result, "session_id": session_id}
    
    # 标准注释生成流程（非改进情况）
    if not force_vision:
        # 如果有改进请求但没有当前注释，也应该传递改进请求
        if improve_request and not current_annotation:
            print(f"首次生成注释，但包含改进建议: {improve_request}")
        
        try:
            # 获取页面文本
            text = get_page_text(filename, page_number)
            
            # 使用展板专家LLM注释文本
            if board_id:
                try:
                    from expert_llm import ExpertLLMRegistry
                    # 获取或创建展板专家LLM
                    expert_llm = ExpertLLMRegistry.get_or_create(board_id)
                    if expert_llm:
                        note = expert_llm.generate_note(filename, [text], page_number)
                        return {"source": "expert_llm", "annotation": note, "session_id": session_id}
                except Exception as e:
                    print(f"使用展板专家LLM生成注释失败: {str(e)}，将使用通用LLM")
            
            # 如果没有展板ID或专家LLM处理失败，使用通用LLM
            response = main_llm_annotate(text, session_id, filename)
            return {"source": "text", "annotation": response["note"], "session_id": session_id}
        except Exception as e:
            print(f"文本注释过程中出错: {str(e)}")
            # 文本注释出错，尝试视觉识别
            img_path = get_page_image(filename, page_number)
            
            if not img_path:
                raise ValueError(f"无法获取页面图片: {filename} 第{page_number}页")
            
            # 调用视觉LLM，传递上下文和展板ID
            vision_result = vision_llm_recognize(img_path, session_id=session_id, file_id=filename, 
                                               context=context_dict, board_id=board_id)
            return {"source": "vision", "annotation": vision_result, "session_id": session_id}
    
    raise ValueError("未知的注释生成模式")

def create_pdf_note(filename: str, pages_text: list, session_id: str = None) -> dict:
    """
    创建整本PDF的笔记
    
    Args:
        filename: PDF文件名
        pages_text: 所有页面的文本内容列表
        session_id: 会话ID
        
    Returns:
        包含笔记内容和会话ID的字典
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    note = generate_pdf_note(pages_text, session_id=session_id, file_id=filename)
    return {"note": note, "session_id": session_id}

def ask_question(filename: str, question: str, pages_text: list, session_id: str = None) -> dict:
    """
    向PDF提问
    
    Args:
        filename: PDF文件名
        question: 问题内容
        pages_text: PDF页面文本列表
        session_id: 会话ID
        
    Returns:
        包含回答和会话ID的字典
    """
    if not session_id:
        session_id = str(uuid.uuid4())
        
    answer = ask_pdf_question(pages_text, question, session_id=session_id, file_id=filename)
    return {"answer": answer, "session_id": session_id}

def improve_note(filename: str, note_content: str, pages_text: list, improve_prompt: str = "", session_id: str = None, board_id: str = None) -> dict:
    """
    改进笔记内容
    
    Args:
        filename: PDF文件名
        note_content: 当前笔记内容
        pages_text: PDF页面文本列表
        improve_prompt: 用户指定的改进要求
        session_id: 会话ID
        board_id: 展板ID，如果提供则优先使用
        
    Returns:
        包含改进后的笔记和会话ID的字典
    """
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # 如果直接提供了board_id，则使用它
    if board_id:
        print(f"使用提供的展板ID: {board_id}")
    else:
        # 否则尝试从文件名中提取展板ID
        try:
            # 从app_state.json中获取文件关联的展板ID
            if os.path.exists('app_state.json'):
                with open('app_state.json', 'r', encoding='utf-8') as f:
                    app_state = json.load(f)
                    # 遍历所有展板，查找包含此文件的展板
                    for board in app_state.get('boards', []):
                        # 检查展板是否关联此文件
                        windows = board.get('windows', [])
                        for window in windows:
                            if window.get('content', {}).get('filename') == filename:
                                board_id = board.get('id')
                                print(f"从app_state.json找到关联展板ID: {board_id}")
                                break
                        if board_id:
                            break
        except Exception as e:
            print(f"获取文件关联展板ID时出错: {str(e)}")
    
    # 如果找到了展板ID，优先使用专家LLM
    if board_id:
        try:
            from expert_llm import ExpertLLMRegistry
            # 获取或创建展板专家LLM
            expert_llm = ExpertLLMRegistry.get_or_create(board_id)
            if expert_llm:
                print(f"使用展板专家LLM (ID: {board_id}) 改进笔记，改进提示: {improve_prompt}")
                improved_note = expert_llm.improve_note(
                    note_content, 
                    improve_prompt,
                    reference_pages=pages_text
                )
                return {"improved_note": improved_note, "session_id": session_id}
        except Exception as e:
            print(f"使用展板专家LLM改进笔记失败: {str(e)}，将使用通用LLM")
    
    # 如果没有展板ID或专家LLM处理失败，使用通用LLM改进
    print(f"使用通用LLM改进笔记，改进提示: {improve_prompt}")
    improved_note = improve_user_note(note_content, pages_text, improve_prompt, 
                                     session_id=session_id, file_id=filename)
    return {"improved_note": improved_note, "session_id": session_id}

def split_pdf(pdf_path, base_name):
    """
    将PDF按页拆分成文本文件，增强错误处理和日志记录
    
    Args:
        pdf_path: PDF文件路径
        base_name: 保存的基本文件名
        
    Returns:
        创建的页面文件列表
    """
    try:
        print(f"开始拆分PDF文件: {pdf_path}")
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        print(f"PDF总页数: {total_pages}")
        
        page_files = []
        for i, page in enumerate(doc):
            try:
                # 获取页面文本
                text = page.get_text()
                
                # 生成页面文件路径
                page_file = os.path.join(PAGE_DIR, f"{base_name}_page_{i+1}.txt")
                
                # 保存页面文本
                with open(page_file, 'w', encoding='utf-8') as f:
                    f.write(text)
                
                # 验证文件已正确创建
                if os.path.exists(page_file):
                    page_size = os.path.getsize(page_file)
                    print(f"✅ 成功创建第{i+1}页文本文件，大小: {page_size} 字节")
                    page_files.append(page_file)
                else:
                    print(f"⚠️ 第{i+1}页文本文件未正确创建")
            except Exception as e:
                print(f"❌ 处理第{i+1}页时出错: {str(e)}")
                # 创建一个包含错误信息的页面文件，避免中断拆分过程
                error_page_file = os.path.join(PAGE_DIR, f"{base_name}_page_{i+1}.txt")
                with open(error_page_file, 'w', encoding='utf-8') as f:
                    f.write(f"无法提取此页内容。错误信息: {str(e)}")
                page_files.append(error_page_file)
        
        # 验证提取的页面数量
        if len(page_files) != total_pages:
            print(f"⚠️ 警告: 实际提取的页面数({len(page_files)})与PDF总页数({total_pages})不符")
        else:
            print(f"✅ 成功提取PDF全部{total_pages}页内容")
        
        return page_files
    except Exception as e:
        print(f"❌ 拆分PDF文件失败: {str(e)}")
        raise e 