import os
import shutil
import logging
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Body, WebSocket, Query, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
import fitz  # PyMuPDF
from pptx import Presentation
from controller import annotate_page, create_pdf_note, ask_question, improve_note
from config import (
    PAGE_DIR, UPLOAD_DIR, UPLOAD_MAX_SIZE, 
    ALLOWED_EXTENSIONS, LOG_LEVEL, LOG_FORMAT, QWEN_API_KEY, QWEN_VL_API_KEY
)
# 导入新模块
#ddddddddddddddddddddddddddddddddd
from board_logger import board_logger
from butler_llm import butler_llm
from llm_logger import router as llm_logger_router  # 导入日志API路由
from board_manager import board_manager  # 导入展板管理器
from intelligent_expert import IntelligentExpert
# 导入简化的专家系统
from simple_expert import simple_expert_manager
from fastapi.staticfiles import StaticFiles
import asyncio
import uvicorn
import dotenv
import config
import llm_agents
import conversation_manager
import time
import datetime
import httpx
from fastapi import WebSocketDisconnect
from openai import OpenAI
import requests
import random

# 配置日志
logging.basicConfig(level=getattr(logging, LOG_LEVEL), format=LOG_FORMAT)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="WhatNote API",
    description="课件注释生成API",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该更具体地指定源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 集成LLM日志API路由
app.include_router(llm_logger_router)

# 挂载静态文件目录
app.mount("/materials", StaticFiles(directory="uploads"), name="materials")

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PAGE_DIR, exist_ok=True)

# 健康检查端点
@app.get('/health')
async def health_check():
    """健康检查端点，用于启动脚本检测服务状态"""
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "message": "WhatNote服务运行正常"
    }

# 添加同步函数
def sync_app_state_to_butler():
    """同步应用状态到管家LLM"""
    try:
        with open("app_state.json", "r", encoding="utf-8") as f:
            app_state_data = json.load(f)
        
        # 扫描uploads目录获取PDF文件信息
        uploaded_files = []
        if os.path.exists(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                if filename.lower().endswith('.pdf'):
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    file_size = os.path.getsize(file_path)
                    uploaded_files.append({
                        "filename": filename,
                        "size": file_size,
                        "path": file_path,
                        "type": "pdf"
                    })
        
        # 构建完整的文件结构
        file_structure = {
            "course_folders": app_state_data.get("course_folders", []),
            "boards": app_state_data.get("boards", []),
            "uploaded_files": uploaded_files
        }
        
        # 更新管家LLM
        butler_llm.update_file_structure(file_structure)
        logger.info("已同步应用状态到管家LLM")
    except Exception as e:
        logger.error(f"同步应用状态失败: {str(e)}")

def validate_file(file: UploadFile) -> None:
    """验证上传文件"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    
    ext = file.filename.split('.')[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"不支持的文件类型，仅支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

def save_upload_file(upload_file: UploadFile, destination: str):
    """保存上传文件"""
    try:
        with open(destination, 'wb') as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        logger.info(f"文件已保存: {destination}")
    except Exception as e:
        logger.error(f"保存文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail="文件保存失败")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理"""
    logger.error(f"未处理的异常: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误"}
    )

@app.post('/materials/upload')
async def upload_material(file: UploadFile = File(...)):
    """上传课件文件"""
    logger.info(f"收到文件上传请求: {file.filename}")
    validate_file(file)
    
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    save_upload_file(file, save_path)
    
    try:
        ext = file.filename.split('.')[-1].lower()
        if ext == 'pdf':
            pages = split_pdf(save_path, file.filename)
        else:
            pages = split_pptx(save_path, file.filename)
        logger.info(f"文件处理完成: {file.filename}, 共{len(pages)}页")
        
        # 同步到管家LLM
        sync_app_state_to_butler()
        
        return {"filename": file.filename, "pages": len(pages)}
    except Exception as e:
        logger.error(f"文件处理失败: {str(e)}")
        raise HTTPException(status_code=500, detail="文件处理失败")

# PDF按页拆分
def split_pdf(pdf_path, base_name):
    # 使用controller.py中的split_pdf函数
    from controller import split_pdf as controller_split_pdf
    return controller_split_pdf(pdf_path, base_name)

# PPTX按页拆分

def split_pptx(pptx_path, base_name):
    prs = Presentation(pptx_path)
    page_files = []
    for i, slide in enumerate(prs.slides):
        texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text"):
                texts.append(shape.text)
        text = '\n'.join(texts)
        page_file = os.path.join(PAGE_DIR, f"{base_name}_page_{i+1}.txt")
        with open(page_file, 'w', encoding='utf-8') as f:
            f.write(text)
        page_files.append(page_file)
    return page_files

# 获取课件分页内容列表
@app.get('/materials/{filename}/pages')
async def get_material_pages(filename: str) -> List[str]:
    """获取课件分页内容"""
    logger.info(f"获取文件页面: {filename}")
    prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
    pages = []
    i = 1
    while True:
        page_file = f"{prefix}{i}.txt"
        if not os.path.exists(page_file):
            break
        try:
            with open(page_file, 'r', encoding='utf-8') as f:
                pages.append(f.read())
            i += 1
        except Exception as e:
            logger.error(f"读取页面失败: {str(e)}")
            raise HTTPException(status_code=500, detail="读取页面失败")
    
    if not pages:
        raise HTTPException(status_code=404, detail='未找到分页内容')
    return pages

@app.get('/materials/{filename}/pages/{page_number}/annotate')
async def annotate_material_page(
    filename: str, 
    page_number: int, 
    force_vision: bool = False,
    session_id: Optional[str] = Query(None),
    current_annotation: Optional[str] = None,
    improve_request: Optional[str] = None,
    board_id: Optional[str] = Query(None)
):
    """生成页面注释"""
    logger.info(f"生成注释: {filename} 第{page_number}页, 会话ID: {session_id}, 展板ID: {board_id}")
    logger.info(f"注释生成参数: 强制视觉={force_vision}, 当前注释长度={len(current_annotation) if current_annotation else 0}, 改进请求={improve_request}")
    try:
        result = annotate_page(filename, page_number, force_vision, session_id, current_annotation, improve_request, board_id)
        return result
    except Exception as e:
        logger.error(f"生成注释失败: {str(e)}")
        raise HTTPException(status_code=500, detail="生成注释失败")

@app.post('/materials/{filename}/pages/{page_number}/annotate')
async def post_annotate_material_page(
    filename: str, 
    page_number: int, 
    force_vision: bool = False,
    session_id: Optional[str] = Query(None),
    request_data: Optional[dict] = Body(None)
):
    """POST方式生成页面注释（直接路径）"""
    logger.info(f"直接路径POST生成注释: {filename} 第{page_number}页, 会话ID: {session_id}")
    logger.info(f"请求数据: {request_data}")
    try:
        # 从请求数据中获取board_id
        board_id = request_data.get('board_id') if request_data else None
        
        result = annotate_page(
            filename, 
            page_number, 
            force_vision, 
            session_id, 
            request_data.get('current_annotation') if request_data else None,
            request_data.get('improve_request') if request_data else None,
            board_id
        )
        return result
    except Exception as e:
        logger.error(f"生成注释失败: {str(e)}")
        raise HTTPException(status_code=500, detail="生成注释失败")

@app.get('/materials/{filename}/pages/{page_number}/raw-text')
async def get_raw_page_text(filename: str, page_number: int):
    """获取页面原始提取文本"""
    logger.info(f"获取原始文本: {filename} 第{page_number}页")
    try:
        from controller import get_page_text
        text = get_page_text(filename, page_number)
        return {"text": text}
    except Exception as e:
        logger.error(f"获取原始文本失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取原始文本失败")

@app.post('/materials/{filename}/pages/{page_number}/vision-annotate')
async def post_force_vision_annotation(
    filename: str, 
    page_number: int,
    session_id: Optional[str] = Query(None),
    request_data: Optional[dict] = Body(None)
):
    """POST方式强制使用图像识别对页面进行注释（直接路径）"""
    logger.info(f"直接路径POST强制图像识别注释: {filename} 第{page_number}页, 会话ID: {session_id}")
    logger.info(f"请求数据: {request_data}")
    try:
        # 从请求数据中获取board_id
        board_id = request_data.get('board_id') if request_data else None
        logger.info(f"使用展板ID: {board_id}")
        
        # 从请求数据中获取当前注释和改进请求
        current_annotation = request_data.get('current_annotation') if request_data else None
        improve_request = request_data.get('improve_request') if request_data else None
        
        # 记录关键参数以便调试
        if current_annotation:
            logger.info(f"当前注释长度: {len(current_annotation)}")
        if improve_request:
            logger.info(f"用户改进请求: {improve_request}")
            
        result = annotate_page(
            filename, 
            page_number, 
            force_vision=True, 
            session_id=session_id, 
            current_annotation=current_annotation,
            improve_request=improve_request,
            board_id=board_id
        )
        return result
    except Exception as e:
        logger.error(f"强制视觉识别注释失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"生成注释失败: {str(e)}")

@app.get('/materials/{filename}/pages/{page_number}/image')
async def get_material_page_image(filename: str, page_number: int):
    """获取页面图片"""
    logger.info(f"获取页面图片: {filename} 第{page_number}页")
    try:
        from controller import get_page_image
        img_path = get_page_image(filename, page_number)
        return FileResponse(img_path, media_type="image/png")
    except Exception as e:
        logger.error(f"获取页面图片失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取页面图片失败")

@app.post('/materials/{filename}/note')
async def generate_material_note(
    filename: str,
    session_id: Optional[str] = Query(None)
):
    """生成整本PDF的AI笔记"""
    try:
        # 读取所有页面内容
        prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
        pages = []
        i = 1
        while True:
            page_file = f"{prefix}{i}.txt"
            if not os.path.exists(page_file):
                break
            with open(page_file, 'r', encoding='utf-8') as f:
                pages.append(f.read())
            i += 1
        if not pages:
            raise HTTPException(status_code=404, detail='未找到分页内容')
            
        # 使用修改后的controller函数
        result = create_pdf_note(filename, pages, session_id)
        return result
    except Exception as e:
        logger.error(f"生成整本笔记失败: {str(e)}")
        raise HTTPException(status_code=500, detail="生成整本笔记失败")

@app.post('/materials/{filename}/ask')
async def ask_material_question(
    filename: str, 
    question: str = Body(..., embed=True),
    session_id: Optional[str] = Query(None)
):
    """针对整本PDF的AI问答"""
    try:
        # 读取所有页面内容
        prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
        pages = []
        i = 1
        while True:
            page_file = f"{prefix}{i}.txt"
            if not os.path.exists(page_file):
                break
            with open(page_file, 'r', encoding='utf-8') as f:
                pages.append(f.read())
            i += 1
        if not pages:
            raise HTTPException(status_code=404, detail='未找到分页内容')
        
        # 使用修改后的controller函数
        result = ask_question(filename, question, pages, session_id)
        return result
    except Exception as e:
        logger.error(f"AI问答失败: {str(e)}")
        raise HTTPException(status_code=500, detail="AI问答失败")

@app.websocket('/materials/{filename}/ask/stream')
async def ask_pdf_question_stream(websocket: WebSocket, filename: str):
    """提供流式AI问答服务"""
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        question = data.get("question", "")
        session_id = data.get("session_id", None)
        
        if not question:
            await websocket.send_json({"error": "问题不能为空"})
            await websocket.close()
            return
        
        # 读取所有页面内容
        prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
        pages = []
        i = 1
        while True:
            page_file = f"{prefix}{i}.txt"
            if not os.path.exists(page_file):
                break
            with open(page_file, 'r', encoding='utf-8') as f:
                pages.append(f.read())
            i += 1
            
        if not pages:
            await websocket.send_json({"error": "未找到PDF内容"})
            await websocket.close()
            return
        
        logger.info(f"开始流式问答: {filename}, 问题: {question}, 会话ID: {session_id}")
        
        # 定义回调函数，将流式生成的文本发送给WebSocket客户端
        async def send_chunk(chunk):
            await websocket.send_json({"chunk": chunk})
        
        # 创建一个同步回调
        def callback(chunk):
            asyncio.run_coroutine_threadsafe(send_chunk(chunk), asyncio.get_event_loop())
        
        # 导入流式问答
        from llm_agents import ask_pdf_question_stream
        
        # 启动流式生成，传递会话ID和回调函数
        full_answer = ask_pdf_question_stream(pages, question, callback, session_id, filename)
        
        # 发送完成信号
        await websocket.send_json({"done": True, "full_answer": full_answer})
        logger.info(f"流式问答完成: {filename}")
    except Exception as e:
        logger.error(f"流式问答失败: {str(e)}")
        try:
            await websocket.send_json({"error": f"处理请求失败: {str(e)}"})
        except:
            # 连接可能已关闭
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass

@app.post('/materials/{filename}/improve-note')
async def improve_material_note(
    filename: str, 
    request_data: dict = Body(...),
):
    """AI完善用户笔记"""
    logger.info(f"收到笔记完善请求: {filename}")
    try:
        content = request_data.get("content", "")
        improve_prompt = request_data.get("improve_prompt", "")
        session_id = request_data.get("session_id", None)
        board_id = request_data.get("board_id", None)
        
        logger.info(f"笔记改进提示: {improve_prompt}")
        logger.info(f"使用展板ID: {board_id or '无'}")
        
        if not content:
            raise HTTPException(status_code=400, detail="内容不能为空")
        
        # 读取所有页面内容作为参考资料
        prefix = os.path.join(PAGE_DIR, f"{filename}_page_")
        pages = []
        i = 1
        while True:
            page_file = f"{prefix}{i}.txt"
            if not os.path.exists(page_file):
                break
            with open(page_file, 'r', encoding='utf-8') as f:
                pages.append(f.read())
            i += 1
            
        if not pages:
            raise HTTPException(status_code=404, detail='未找到PDF内容')

        # 使用controller函数，传递改进提示和展板ID
        result = improve_note(filename, content, pages, improve_prompt, session_id, board_id)
        
        logger.info(f"笔记完善成功: {filename}, 改进提示: {improve_prompt}")
        return result
    except Exception as e:
        logger.error(f"笔记完善失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"笔记完善失败: {str(e)}")

@app.get('/api/check-config')
async def check_api_config():
    """检查API配置是否正确"""
    return {
        "qwen_api_configured": bool(QWEN_API_KEY),
        "qwen_vl_api_configured": bool(QWEN_VL_API_KEY)
    }

@app.get('/materials/check/{filename}')
async def check_material_file(filename: str):
    """检查指定文件是否存在，返回真实文件路径"""
    logger.info(f"检查文件是否存在: {filename}")
    try:
        from controller import check_file_exists
        result = check_file_exists(filename)
        return result
    except Exception as e:
        logger.error(f"检查文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail="检查文件失败")

@app.get('/materials/view/{filename}')
async def view_material_file(filename: str):
    """获取文件内容"""
    logger.info(f"请求查看文件: {filename}")
    try:
        from controller import check_file_exists
        file_check = check_file_exists(filename)
        
        if not file_check["exists"]:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        file_path = os.path.join(UPLOAD_DIR, file_check["path"])
        return FileResponse(file_path, filename=file_check["path"])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取文件失败")

# 初始化应用状态管理
class AppState:
    def __init__(self):
        self.course_folders = []
        self.boards = []
        self.pdfs = []
        
        # 初始加载状态
        self._load_state()
    
    def _load_state(self):
        # 从持久化存储加载状态
        try:
            if os.path.exists('app_state.json'):
                with open('app_state.json', 'r', encoding='utf-8') as f:
                    state = json.load(f)
                    self.course_folders = state.get('course_folders', [])
                    self.boards = state.get('boards', [])
                    self.pdfs = state.get('pdfs', [])
                    
                    # 确保每个课程文件夹都有files字段
                    for folder in self.course_folders:
                        if 'files' not in folder:
                            folder['files'] = []
        except Exception as e:
            logger.error(f"加载应用状态失败: {str(e)}")
    
    def save_state(self):
        # 保存状态到持久化存储
        try:
            state = {
                'course_folders': self.course_folders,
                'boards': self.boards,
                'pdfs': self.pdfs
            }
            with open('app_state.json', 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存应用状态失败: {str(e)}")
    
    def add_course_folder(self, folder_name: str) -> Dict[str, Any]:
        # 添加课程文件夹 - 使用时间戳和随机数确保ID唯一性
        import time
        import random
        timestamp = int(time.time() * 1000)  # 毫秒级时间戳
        random_suffix = random.randint(100, 999)  # 3位随机数
        folder_id = f"course-{timestamp}-{random_suffix}"
        
        folder = {
            'id': folder_id,
            'name': folder_name,
            'files': [],  # 初始化文件列表
            'created_at': time.time()  # 添加创建时间戳
        }
        self.course_folders.append(folder)
        self.save_state()
        return folder
    
    def add_board(self, board_name: str, course_folder: str) -> Dict[str, Any]:
        # 添加展板 - 使用时间戳和随机数确保ID唯一性
        import time
        import random
        timestamp = int(time.time() * 1000)  # 毫秒级时间戳
        random_suffix = random.randint(100, 999)  # 3位随机数
        board_id = f"board-{timestamp}-{random_suffix}"
        
        board = {
            'id': board_id,
            'name': board_name,
            'course_folder': course_folder,
            'pdfs': 0,
            'windows': 0,
            'created_at': time.time()  # 添加创建时间戳
        }
        self.boards.append(board)
        self.save_state()
        return board
    
    def course_folder_exists(self, folder_name: str) -> bool:
        # 检查课程文件夹是否存在
        return any(folder['name'] == folder_name for folder in self.course_folders)
    
    def board_exists(self, board_name: str, course_folder: str) -> bool:
        # 检查展板是否存在
        return any(
            board['name'] == board_name and board['course_folder'] == course_folder 
            for board in self.boards
        )
    
    def get_boards(self) -> List[Dict[str, Any]]:
        # 获取所有展板
        return self.boards
    
    def get_course_folders(self) -> List[Dict[str, Any]]:
        # 获取所有课程文件夹
        return self.course_folders

# 初始化应用状态
app_state = AppState()

# 新增API端点: 获取应用状态
@app.get('/api/app-state')
async def get_app_state():
    """获取应用当前状态"""
    logger.info("获取应用状态")
    
    # 注意：为了确保前端能访问到课程文件，确保每个课程都有files字段
    course_folders = app_state.get_course_folders()
    for folder in course_folders:
        if 'files' not in folder:
            folder['files'] = []
    
    return {
        'course_folders': course_folders,
        'boards': app_state.get_boards(),
        'pdfs': [],  # 可以根据需要添加更多信息
    }

# 新增调试API端点: 查看原始app_state.json文件内容
@app.get('/api/debug/app-state-raw')
async def get_raw_app_state():
    """获取原始app_state.json文件内容（调试用）"""
    logger.info("获取原始应用状态文件内容")
    
    try:
        if os.path.exists('app_state.json'):
            with open('app_state.json', 'r', encoding='utf-8') as f:
                raw_content = f.read()
                parsed_content = json.loads(raw_content)
                
            return {
                'status': 'success',
                'file_exists': True,
                'raw_content': raw_content,
                'parsed_content': parsed_content,
                'course_folders_count': len(parsed_content.get('course_folders', [])),
                'boards_count': len(parsed_content.get('boards', [])),
                'timestamp': os.path.getmtime('app_state.json')
            }
        else:
            return {
                'status': 'error',
                'file_exists': False,
                'message': 'app_state.json file does not exist'
            }
    except Exception as e:
        logger.error(f"读取原始应用状态文件失败: {str(e)}")
        return {
            'status': 'error',
            'file_exists': os.path.exists('app_state.json'),
            'error': str(e)
        }

# 新增API端点: 获取所有展板
@app.get('/api/boards/list')
async def list_boards():
    """获取所有展板列表"""
    logger.info("获取展板列表")
    return app_state.get_boards()

# 创建课程文件夹
@app.post('/api/courses')
async def create_course_folder(request_data: dict = Body(...)):
    """创建新课程文件夹"""
    folder_name = request_data.get('name')
    if not folder_name:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")
    
    logger.info(f"创建课程文件夹: {folder_name}")
    folder = app_state.add_course_folder(folder_name)
    
    # 同步到管家LLM
    sync_app_state_to_butler()
    
    return folder

# 检查课程文件夹是否存在
@app.get('/api/course-folders/{folder_name}/exists')
async def check_course_folder_exists(folder_name: str):
    """检查课程文件夹是否存在"""
    exists = app_state.course_folder_exists(folder_name)
    return {"exists": exists}

# 创建展板（修改现有endpoints）
@app.post('/api/boards')
async def create_board(request_data: dict = Body(...)):
    """创建新展板"""
    board_name = request_data.get('name')
    course_folder = request_data.get('course_folder')
    
    if not board_name:
        raise HTTPException(status_code=400, detail="展板名称不能为空")
    
    if not course_folder:
        raise HTTPException(status_code=400, detail="课程文件夹不能为空")
    
    logger.info(f"创建展板: {board_name} (在 {course_folder} 内)")
    
    # 检查课程文件夹是否存在，不存在则创建
    if not app_state.course_folder_exists(course_folder):
        app_state.add_course_folder(course_folder)
    
    board = app_state.add_board(board_name, course_folder)
    
    # 初始化展板日志
    board_logger.init_board(board['id'])
    
    # 同步到管家LLM
    sync_app_state_to_butler()
    
    return board

@app.post('/api/assistant')
async def assistant_query(request_data: dict = Body(...)):
    """处理助手LLM查询"""
    query = request_data.get('query')
    status_log = request_data.get('status_log', '')
    history = request_data.get('history', [])
    
    if not query:
        raise HTTPException(status_code=400, detail="查询不能为空")
    
    logger.info(f"助手查询: {query[:50]}...")
    
    # 使用butler_llm处理查询
    response = butler_llm.query(
        query=query,
        status_log=status_log,
        history=history
    )
    
    # 提取回复和命令
    reply = response.get('response', '无法处理您的请求')
    command = response.get('command')
    
    return {
        "response": reply,
        "command": command
    }

@app.post('/api/boards/{board_id}/windows')
async def add_board_window(
    board_id: str, 
    request_data: dict = Body(...)
):
    """添加窗口到展板"""
    logger.info(f'添加窗口: {board_id}')
    try:
        window_data = request_data.get('window', {})
        
        if not window_data or "type" not in window_data:
            raise HTTPException(status_code=400, detail='窗口数据不能为空且必须指定类型')
        
        # 添加窗口
        window_id = board_logger.add_window(board_id, window_data)
        
        # 更新管家LLM的板块信息
        butler_llm.update_board_info(board_id)
        
        logger.info(f'窗口添加成功: {window_id}')
        return {"window_id": window_id}
    except Exception as e:
        logger.error(f'添加窗口失败: {str(e)}')
        raise HTTPException(status_code=500, detail=f'添加窗口失败: {str(e)}')

@app.delete('/api/boards/{board_id}/windows/{window_id}')
async def remove_board_window(board_id: str, window_id: str):
    """从展板移除窗口"""
    logger.info(f'移除窗口: {window_id}, 展板: {board_id}')
    try:
        # 移除窗口
        success = board_logger.remove_window(board_id, window_id)
        
        if not success:
            raise HTTPException(status_code=404, detail='未找到窗口')
        
        # 更新管家LLM的板块信息
        butler_llm.update_board_info(board_id)
        
        logger.info(f'窗口移除成功: {window_id}')
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'移除窗口失败: {str(e)}')
        raise HTTPException(status_code=500, detail=f'移除窗口失败: {str(e)}')

@app.put('/api/boards/{board_id}/windows/{window_id}')
async def update_board_window(
    board_id: str, 
    window_id: str, 
    request_data: dict = Body(...)
):
    """更新展板窗口"""
    logger.info(f'更新窗口: {window_id}, 展板: {board_id}')
    try:
        window_data = request_data.get('window', {})
        
        if not window_data:
            raise HTTPException(status_code=400, detail='窗口数据不能为空')
        
        # 更新窗口
        success = board_logger.update_window(board_id, window_id, window_data)
        
        if not success:
            raise HTTPException(status_code=404, detail='未找到窗口')
        
        logger.info(f'窗口更新成功: {window_id}')
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'更新窗口失败: {str(e)}')
        raise HTTPException(status_code=500, detail=f'更新窗口失败: {str(e)}')

# 创建课程文件
@app.post('/api/courses/{course_id}/files')
async def create_course_file(course_id: str, request_data: dict = Body(...)):
    """创建课程下的文件"""
    file_name = request_data.get('name')
    pdf_filename = request_data.get('pdf_filename')  # 接收PDF文件名
    
    if not file_name:
        raise HTTPException(status_code=400, detail="文件名称不能为空")
    
    # 查找对应的课程文件夹
    course_folder = None
    for folder in app_state.course_folders:
        if folder['id'] == course_id:
            course_folder = folder
            break
    
    if not course_folder:
        raise HTTPException(status_code=404, detail="未找到课程文件夹")
    
    # 创建文件记录
    # 注意：此处只创建文件记录，不创建实际文件
    # 实际应用中可能需要创建真实文件并存储内容
    file_id = f"file-{course_id}-{len(course_folder.get('files', []))+1}"
    
    # 如果课程没有files字段，添加它
    if 'files' not in course_folder:
        course_folder['files'] = []
    
    file_record = {
        'id': file_id,
        'name': file_name,
        'course_id': course_id,
        'created_at': None,  # 可以添加时间戳
        'pdf_filename': pdf_filename  # 添加PDF文件名字段
    }
    
    course_folder['files'].append(file_record)
    app_state.save_state()
    
    # 同步到管家LLM
    sync_app_state_to_butler()
    
    logger.info(f"创建课程文件: {file_name} (在课程 {course_folder['name']} 中)")
    return file_record

# 添加清理多余PDF展板文件的API
@app.post('/api/cleanup/duplicate-pdf-files')
async def cleanup_duplicate_pdf_files():
    """清理与PDF文件同名的多余展板文件"""
    logger.info("开始清理与PDF文件同名的多余展板文件")
    
    try:
        app_state = AppState()
        cleanup_count = 0
        
        for folder in app_state.course_folders:
            if 'files' not in folder:
                continue
                
            # 查找需要删除的文件（pdf_filename不为空且文件名以.pdf结尾）
            files_to_remove = []
            for file in folder.get('files', []):
                # 如果文件名以.pdf结尾且有pdf_filename字段，说明这是上传PDF时意外创建的展板文件
                if (file.get('name', '').endswith('.pdf') and 
                    file.get('pdf_filename') is not None and
                    file.get('name') == file.get('pdf_filename')):
                    files_to_remove.append(file)
                    cleanup_count += 1
                    logger.info(f"标记删除多余文件: {file.get('name')} (ID: {file.get('id')})")
            
            # 删除标记的文件
            folder['files'] = [f for f in folder.get('files', []) if f not in files_to_remove]
        
        # 保存状态
        if cleanup_count > 0:
            app_state.save_state()
            sync_app_state_to_butler()
            logger.info(f"清理完成，删除了 {cleanup_count} 个多余的PDF展板文件")
        else:
            logger.info("没有发现需要清理的多余PDF展板文件")
        
        return {
            "status": "success", 
            "message": f"清理完成，删除了 {cleanup_count} 个多余的PDF展板文件",
            "cleaned_count": cleanup_count
        }
        
    except Exception as e:
        logger.error(f"清理过程出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")

# 添加新的API路由处理PDF上传
@app.post('/api/materials/upload')
async def api_upload_material(file: UploadFile = File(...)):
    """API路由: 上传课件文件"""
    logger.info(f"收到API文件上传请求: {file.filename}")
    validate_file(file)
    
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    save_upload_file(file, save_path)
    
    try:
        ext = file.filename.split('.')[-1].lower()
        if ext == 'pdf':
            pages = split_pdf(save_path, file.filename)
        else:
            pages = split_pptx(save_path, file.filename)
        logger.info(f"文件处理完成: {file.filename}, 共{len(pages)}页")
        return {"filename": file.filename, "pages": len(pages)}
    except Exception as e:
        logger.error(f"文件处理失败: {str(e)}")
        raise HTTPException(status_code=500, detail="文件处理失败")

# 添加API转发路由 - 用于统一前端路径
@app.get('/api/materials/view/{filename}')
async def api_view_material_file(filename: str):
    """API路由: 获取文件内容"""
    return await view_material_file(filename)

@app.get('/api/materials/{filename}/pages')
async def api_get_material_pages(filename: str) -> List[str]:
    """API路由: 获取课件分页内容"""
    return await get_material_pages(filename)

@app.get('/api/materials/{filename}/pages/{page_number}/annotate')
async def api_annotate_material_page(
    filename: str, 
    page_number: int, 
    force_vision: bool = False,
    session_id: Optional[str] = Query(None),
    board_id: Optional[str] = Query(None)
):
    """API方式获取页面注释"""
    logger.info(f"API方式生成注释: {filename} 第{page_number}页, 会话ID: {session_id}, 展板ID: {board_id}")
    try:
        result = annotate_page(filename, page_number, force_vision, session_id, None, None, board_id)
        return result
    except Exception as e:
        logger.error(f"生成注释失败: {str(e)}")
        raise HTTPException(status_code=500, detail="生成注释失败")

@app.post('/api/materials/{filename}/pages/{page_number}/annotate')
async def api_post_annotate_material_page(
    filename: str, 
    page_number: int, 
    force_vision: bool = False,
    session_id: Optional[str] = Query(None),
    request_data: Optional[dict] = Body(None)
):
    """API POST方式生成页面注释"""
    logger.info(f"API POST生成注释: {filename} 第{page_number}页")
    try:
        # 从请求数据中获取board_id
        board_id = request_data.get('board_id') if request_data else None
        
        result = annotate_page(
            filename, 
            page_number, 
            force_vision, 
            session_id, 
            request_data.get('current_annotation') if request_data else None,
            request_data.get('improve_request') if request_data else None,
            board_id
        )
        return result
    except Exception as e:
        logger.error(f"生成注释失败: {str(e)}")
        raise HTTPException(status_code=500, detail="生成注释失败")

@app.post('/api/materials/{filename}/pages/{page_number}/vision-annotate')
async def api_force_vision_annotation_post(
    filename: str, 
    page_number: int,
    session_id: Optional[str] = Query(None),
    request_data: Optional[dict] = Body(None)
):
    """API路由: POST方式强制使用图像识别对页面进行注释"""
    # 确保请求数据中的board_id可以被下一级函数使用
    logger.info(f"API POST强制视觉识别: {filename} 第{page_number}页")
    logger.info(f"请求数据: {request_data}")
    
    return await post_force_vision_annotation(filename, page_number, session_id, request_data)

@app.get('/api/materials/{filename}/pages/{page_number}/image')
async def api_get_material_page_image(filename: str, page_number: int):
    """API路由: 获取页面图像"""
    return await get_material_page_image(filename, page_number)

@app.post('/api/materials/{filename}/note')
async def api_generate_material_note(
    filename: str,
    session_id: Optional[str] = Query(None)
):
    """API路由: 生成整本笔记"""
    return await generate_material_note(filename, session_id)

@app.post('/api/materials/{filename}/ask')
async def api_ask_material_question(
    filename: str, 
    question: str = Body(..., embed=True),
    session_id: Optional[str] = Query(None)
):
    """API路由: 提问PDF问题"""
    return await ask_material_question(filename, question, session_id)

@app.post('/api/materials/{filename}/improve-note')
async def api_improve_material_note(
    filename: str, 
    request_data: dict = Body(...),
):
    """API路由：AI完善用户笔记"""
    logger.info(f"收到API笔记完善请求: {filename}")
    # 直接调用主路由处理函数
    return await improve_material_note(filename, request_data)

@app.get('/api/materials/check/{filename}')
async def api_check_material_file(filename: str):
    """API路由: 检查指定文件是否存在"""
    return await check_material_file(filename)

@app.delete('/api/courses/{course_id}')
async def delete_course_folder(course_id: str):
    """删除课程文件夹"""
    logger.info(f"=== 开始删除课程文件夹 ===")
    logger.info(f"要删除的课程ID: '{course_id}' (类型: {type(course_id)})")
    
    try:
        # 使用全局app_state变量，而不是创建新实例
        global app_state
        
        logger.info(f"当前课程文件夹数量: {len(app_state.course_folders)}")
        
        # 记录删除前的状态
        original_folders_count = len(app_state.course_folders)
        logger.info(f"删除前课程文件夹总数: {original_folders_count}")
        
        # 详细记录每个课程文件夹的信息
        logger.info("=== 当前所有课程文件夹详情 ===")
        for i, folder in enumerate(app_state.course_folders):
            folder_id = folder.get('id')
            folder_name = folder.get('name')
            logger.info(f"  课程 {i}: ID='{folder_id}' (类型:{type(folder_id)}), 名称='{folder_name}'")
            # 检查ID是否匹配
            if str(folder_id) == str(course_id):
                logger.info(f"    ✅ ID匹配: '{folder_id}' == '{course_id}'")
            else:
                logger.info(f"    ❌ ID不匹配: '{folder_id}' != '{course_id}'")
        
        # 查找课程文件夹 - 使用字符串比较确保类型一致
        course_folder = None
        matched_index = -1
        for i, folder in enumerate(app_state.get_course_folders()):
            if str(folder["id"]) == str(course_id):
                course_folder = folder
                matched_index = i
                logger.info(f"✅ 在索引 {i} 找到匹配的课程文件夹: {course_folder}")
                break
                
        if not course_folder:
            logger.warning(f"❌ 未找到要删除的课程文件夹: '{course_id}'")
            logger.warning("可能的原因:")
            logger.warning("1. ID不匹配（类型或值不同）")
            logger.warning("2. 课程已被删除")
            logger.warning("3. 前端传递了错误的ID")
            
            # 尝试模糊匹配，看看是否有类似的ID
            similar_ids = []
            for folder in app_state.course_folders:
                folder_id = str(folder.get('id', ''))
                if course_id in folder_id or folder_id in course_id:
                    similar_ids.append(folder_id)
            
            if similar_ids:
                logger.warning(f"发现类似的ID: {similar_ids}")
            
            raise HTTPException(status_code=404, detail="课程文件夹不存在")
            
        logger.info(f"找到要删除的课程文件夹: {course_folder}")
        
        # 筛选出其他课程（删除指定课程）
        original_count = len(app_state.course_folders)
        app_state.course_folders = [
            folder for folder in app_state.course_folders 
            if str(folder["id"]) != str(course_id)  # 使用字符串比较确保类型一致
        ]
        new_count = len(app_state.course_folders)
        
        logger.info(f"删除操作完成: 原数量={original_count}, 新数量={new_count}, 删除数量={original_count - new_count}")
        
        if original_count == new_count:
            logger.error(f"❌ 删除失败：课程数量没有变化，可能ID匹配有问题")
            logger.error(f"目标ID: '{course_id}', 类型: {type(course_id)}")
            for folder in app_state.course_folders:
                folder_id = folder.get('id')
                logger.error(f"存储的ID: '{folder_id}', 类型: {type(folder_id)}, 相等: {str(folder_id) == str(course_id)}")
            raise HTTPException(status_code=500, detail="删除操作失败：未找到匹配的课程ID")
        
        # 记录删除后的状态
        logger.info(f"删除后剩余的课程文件夹:")
        for i, folder in enumerate(app_state.course_folders):
            logger.info(f"  剩余课程 {i}: ID={folder.get('id')}, 名称={folder.get('name')}")
        
        # 保存状态
        logger.info("开始保存应用状态到文件")
        app_state.save_state()
        logger.info("应用状态保存完成")
        
        # 验证保存结果
        try:
            # 重新加载状态验证保存是否成功
            verification_state = AppState()
            verification_count = len(verification_state.course_folders)
            logger.info(f"验证：重新加载后的课程数量: {verification_count}")
            
            # 检查删除的课程是否真的不存在了
            deleted_still_exists = any(str(f["id"]) == str(course_id) for f in verification_state.course_folders)
            if deleted_still_exists:
                logger.error(f"❌ 严重错误：删除的课程 {course_id} 在重新加载后仍然存在！")
                raise HTTPException(status_code=500, detail="删除操作未能持久化")
            else:
                logger.info(f"✅ 验证通过：课程 {course_id} 已彻底删除")
                
        except Exception as verify_error:
            logger.error(f"验证删除结果时出错: {str(verify_error)}")
        
        # 同步到管家LLM
        logger.info("开始同步到管家LLM")
        sync_app_state_to_butler()
        logger.info("同步到管家LLM完成")
        
        success_message = f"课程文件夹 '{course_folder['name']}' 已删除"
        logger.info(f"=== 删除课程文件夹操作成功 ===: {success_message}")
        return {"status": "success", "message": success_message}
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        error_msg = f"删除课程文件夹失败: {str(e)}"
        logger.error(f"=== 删除课程文件夹操作失败 ===")
        logger.error(error_msg, exc_info=True)
        logger.error(f"失败的课程ID: '{course_id}'")
        logger.error(f"异常类型: {type(e).__name__}")
        logger.error(f"异常详情: {str(e)}")
        raise HTTPException(status_code=500, detail=error_msg)

@app.delete('/api/courses/files/{file_id}')
async def delete_course_file(file_id: str):
    """删除课程文件"""
    logger.info(f"=== 开始删除课程文件 ===")
    logger.info(f"要删除的文件ID: '{file_id}' (类型: {type(file_id)})")
    
    try:
        # ʹ��ȫ��app_state�����������Ǵ�����ʵ��
        global app_state
        
        logger.info(f"当前课程文件夹数量: {len(app_state.course_folders)}")
        
        # 在所有课程文件夹中查找文件
        file_found = False
        deleted_file_name = None
        found_in_folder = None
        
        # 详细记录查找过程
        logger.info("=== 在所有课程文件夹中查找目标文件 ===")
        for i, folder in enumerate(app_state.course_folders):
            folder_name = folder.get('name', '未命名')
            folder_id = folder.get('id', '无ID')
            files_count = len(folder.get('files', []))
            
            logger.info(f"检查文件夹 {i}: '{folder_name}' (ID: {folder_id})")
            logger.info(f"  该文件夹中的文件数量: {files_count}")
            
            original_files_count = len(folder.get("files", []))
            
            # 记录删除前的文件列表
            original_files = folder.get("files", [])
            for j, file in enumerate(original_files):
                file_id_stored = file.get('id')
                file_name = file.get('name', '未命名')
                logger.info(f"    文件 {j}: ID='{file_id_stored}' (类型:{type(file_id_stored)}), 名称='{file_name}'")
                
                # 检查ID是否匹配
                if str(file_id_stored) == str(file_id):
                    logger.info(f"      ✅ ID匹配: '{file_id_stored}' == '{file_id}'")
                    deleted_file_name = file_name
                    found_in_folder = folder_name
                else:
                    logger.info(f"      ❌ ID不匹配: '{file_id_stored}' != '{file_id}'")
            
            # 过滤掉要删除的文件 - 使用字符串比较确保类型一致
            folder["files"] = [
                file for file in folder.get("files", [])
                if str(file.get("id")) != str(file_id)
            ]
            
            # 如果过滤后文件数减少，说明找到并删除了文件
            if len(folder.get("files", [])) < original_files_count:
                file_found = True
                logger.info(f"✅ 文件已从文件夹 '{folder_name}' 中删除")
                logger.info(f"删除前文件数: {original_files_count}, 删除后文件数: {len(folder.get('files', []))}")
                break
                
        if not file_found:
            logger.warning(f"❌ 未找到要删除的文件: '{file_id}'")
            logger.warning("可能的原因:")
            logger.warning("1. 文件ID不匹配（类型或值不同）")
            logger.warning("2. 文件已被删除")
            logger.warning("3. 前端传递了错误的文件ID")
            
            # 尝试模糊匹配，看看是否有类似的ID
            similar_ids = []
            for folder in app_state.course_folders:
                for file in folder.get('files', []):
                    stored_file_id = str(file.get('id', ''))
                    if file_id in stored_file_id or stored_file_id in file_id:
                        similar_ids.append(stored_file_id)
            
            if similar_ids:
                logger.warning(f"发现类似的文件ID: {similar_ids}")
            
            raise HTTPException(status_code=404, detail="文件不存在")
            
        logger.info("开始保存应用状态")
        # 保存状态
        app_state.save_state()
        logger.info("应用状态保存成功")
        
        # 验证保存结果
        try:
            verification_state = AppState()
            # 检查删除的文件是否真的不存在了
            deleted_still_exists = False
            for folder in verification_state.course_folders:
                for file in folder.get('files', []):
                    if str(file.get('id')) == str(file_id):
                        deleted_still_exists = True
                        break
                if deleted_still_exists:
                    break
            
            if deleted_still_exists:
                logger.error(f"❌ 严重错误：删除的文件 {file_id} 在重新加载后仍然存在！")
                raise HTTPException(status_code=500, detail="删除操作未能持久化")
            else:
                logger.info(f"✅ 验证通过：文件 {file_id} 已彻底删除")
        except Exception as verify_error:
            logger.error(f"验证删除结果时出错: {str(verify_error)}")
        
        logger.info("开始同步到管家LLM")
        # 同步到管家LLM
        sync_app_state_to_butler()
        logger.info("同步到管家LLM完成")
        
        success_message = f"文件 '{deleted_file_name}' 已从 '{found_in_folder}' 中删除"
        logger.info(f"=== 删除课程文件操作成功 ===: {success_message}")
        return {"status": "success", "message": success_message}
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        error_msg = f"删除文件失败: {str(e)}"
        logger.error(f"=== 删除课程文件操作失败 ===")
        logger.error(error_msg, exc_info=True)
        logger.error(f"删除失败的文件ID: '{file_id}'")
        logger.error(f"异常类型: {type(e).__name__}")
        logger.error(f"异常详情: {str(e)}")
        raise HTTPException(status_code=500, detail=error_msg)



@app.put('/api/courses/{course_id}/rename')
async def rename_course_folder(course_id: str, request_data: dict = Body(...)):
    """重命名课程文件夹"""
    try:
        new_name = request_data.get('new_name', '').strip()
        
        if not new_name:
            raise HTTPException(status_code=400, detail="新名称不能为空")
        
        logger.info(f"开始重命名课程文件夹: {course_id} -> {new_name}")
        
        global app_state
        
        target_course = None
        for course in app_state.course_folders:
            if course.get('id') == course_id:
                target_course = course
                break
        
        if not target_course:
            logger.warning(f"课程文件夹不存在: {course_id}")
            raise HTTPException(status_code=404, detail="课程文件夹不存在")
        
        for course in app_state.course_folders:
            if course.get('id') != course_id and course.get('name') == new_name:
                raise HTTPException(status_code=400, detail="课程文件夹名称已存在")
        
        old_name = target_course.get('name')
        target_course['name'] = new_name
        
        app_state.save_state()
        sync_app_state_to_butler()
        
        logger.info(f"课程文件夹重命名成功: {old_name} -> {new_name}")
        
        return {
            "status": "success",
            "message": f"课程文件夹重命名成功: {old_name} -> {new_name}",
            "course": {
                "id": course_id,
                "old_name": old_name,
                "new_name": new_name
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重命名课程文件夹失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"重命名课程文件夹失败: {str(e)}")

@app.put('/api/courses/files/{file_id}/rename')
async def rename_course_file(file_id: str, request_data: dict = Body(...)):
    """重命名课程文件"""
    try:
        new_name = request_data.get('new_name', '').strip()
        
        if not new_name:
            raise HTTPException(status_code=400, detail="新名称不能为空")
        
        logger.info(f"开始重命名课程文件: {file_id} -> {new_name}")
        
        global app_state
        
        target_file = None
        target_course = None
        
        for course in app_state.course_folders:
            for file in course.get('files', []):
                if file.get('id') == file_id:
                    target_file = file
                    target_course = course
                    break
            if target_file:
                break
        
        if not target_file:
            logger.warning(f"课程文件不存在: {file_id}")
            raise HTTPException(status_code=404, detail="课程文件不存在")
        
        for file in target_course.get('files', []):
            if file.get('id') != file_id and file.get('name') == new_name:
                raise HTTPException(status_code=400, detail="文件名称在当前课程文件夹中已存在")
        
        old_name = target_file.get('name')
        target_file['name'] = new_name
        
        app_state.save_state()
        sync_app_state_to_butler()
        
        logger.info(f"课程文件重命名成功: {old_name} -> {new_name}")
        
        return {
            "status": "success",
            "message": f"课程文件重命名成功: {old_name} -> {new_name}",
            "file": {
                "id": file_id,
                "old_name": old_name,
                "new_name": new_name,
                "course_folder": target_course.get('name')
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重命名课程文件失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"重命名课程文件失败: {str(e)}")



# 添加专家LLM的API端点

@app.post('/api/expert')
async def expert_llm_query(request_data: dict = Body(...)):
    """
    处理专家LLM的查询请求
    """
    try:
        query = request_data.get('query')
        board_id = request_data.get('board_id')
        history = request_data.get('history', [])
        
        if not query or not board_id:
            return JSONResponse(
                status_code=400,
                content={"detail": "查询和展板ID不能为空"}
            )
            
        logger.info(f"专家LLM查询: {query}, 展板ID: {board_id}")
        
        # 使用简化专家系统
        expert = simple_expert_manager.get_expert(board_id)
        
        # 处理用户消息
        response = await expert.process_query(query)
        
        return {
            "status": "success",
            "response": response,
            "board_id": board_id
        }
    except Exception as e:
        logger.error(f"专家LLM查询失败: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"处理查询失败: {str(e)}"}
        )

# 添加获取单个展板信息的API端点
@app.get('/api/boards/{board_id}')
async def get_board_info(board_id: str):
    """获取展板详细信息"""
    logger.info(f"获取展板信息: {board_id}")
    try:
        # 从board_logger获取展板详细信息
        board_info = board_logger.get_full_board_info(board_id)
        
        if not board_info:
            # 如果board_logger中没有找到，尝试从app_state中查找
            global app_state
            for board in app_state.get_boards():
                if board["id"] == board_id:
                    # 如果在app_state中找到，但没有详细信息，创建一个基本信息结构
                    board_info = {
                        "id": board_id,
                        "name": board.get("name", "未命名展板"),
                        "state": "empty",  # 新展板状态为空
                        "created_at": board.get("created_at"),
                        "pdfs": [],  # 新展板没有PDF文件
                        "windows": [],  # 新展板没有窗口
                        "course_folder": board.get("course_folder")
                    }
                    # 初始化展板日志（这会清除任何旧数据）
                    board_logger.init_board(board_id)
                    logger.info(f"已为展板 {board_id} 创建空白状态")
                    break
        
        if not board_info:
            # 如果找不到展板信息，创建新的空展板
            board_info = {
                "id": board_id,
                "name": "自动创建展板",
                "state": "empty",  # 新展板状态为空
                "created_at": None,
                "pdfs": [],  # 新展板没有PDF文件
                "windows": [],  # 新展板没有窗口
                "course_folder": None
            }
            # 初始化展板日志（这会清除任何旧数据）
            board_logger.init_board(board_id)
            logger.info(f"已自动创建空白展板 {board_id}")
        else:
            # 验证展板状态，如果是新创建的展板但有旧数据，清除它
            if board_info.get("state") == "empty" and (board_info.get("pdfs") or board_info.get("windows")):
                logger.warning(f"检测到展板 {board_id} 状态不一致，重新初始化")
                board_logger.init_board(board_id)
                board_info = board_logger.get_full_board_info(board_id)
        
        return board_info
    except Exception as e:
        logger.error(f"获取展板信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取展板信息失败: {str(e)}")

@app.get('/api/boards/{board_id}/simple')
async def get_board_simple_info(board_id: str):
    """获取展板简化信息（专为智能专家系统优化）"""
    logger.info(f"获取展板简化信息: {board_id}")
    try:
        # 从board_logger获取展板信息
        board_info = board_logger.get_full_board_info(board_id)
        
        if not board_info:
            # 如果没有找到，返回空的PDF列表
            return {
                "board_id": board_id,
                "pdfs": [],
                "count": 0
            }
        
        # 只返回PDF文件的基本信息
        pdfs = []
        for pdf in board_info.get("pdfs", []):
            pdf_info = {
                "filename": pdf.get("filename", ""),
                "currentPage": pdf.get("currentPage", 1)
            }
            pdfs.append(pdf_info)
        
        # 返回简化数据
        response_data = {
            "board_id": board_id,
            "pdfs": pdfs,
            "count": len(pdfs)
        }
        
        return response_data
        
    except Exception as e:
        logger.error(f"获取展板简化信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取展板简化信息失败: {str(e)}")

@app.post('/api/boards/{board_id}/send-context')
async def update_board_context(board_id: str, context_data: dict = Body(...)):
    """
    接收并处理展板上下文信息更新
    
    接收前端收集的展板内容信息，包括PDF内容、笔记内容、截图等，
    并更新专家LLM的上下文，确保专家LLM了解展板的最新状态
    
    Args:
        board_id: 展板ID
        context_data: 展板上下文数据，包含展板内容信息
        
    Returns:
        更新状态
    """
    logger.info(f"接收展板上下文更新: {board_id}")
    try:
        # 保存上下文数据到BoardManager
        board_manager.update_board_context(board_id, context_data)
        
        # 使用简化专家系统
        expert = simple_expert_manager.get_expert(board_id)
        
        # 记录操作
        board_logger.add_operation(
            board_id,
            "context_updated",
            {
                "timestamp": context_data.get("timestamp"),
                "windows_count": len(context_data.get("windows", [])),
                "has_screenshot": context_data.get("screenshot") is not None
            }
        )
        
        # 更新展板信息
        windows_data = context_data.get("windows", [])
        for window in windows_data:
            if window.get("type") == "pdf":
                # 更新PDF窗口信息
                board_logger.add_pdf(board_id, {
                    "filename": window.get("filename"),
                    "currentPage": window.get("currentPage"),
                    "contentPreview": window.get("contentPreview", "")[:500]  # 限制长度
                })
        
        # 构建详细的上下文信息给专家LLM
        pdf_files = board_manager.get_pdf_files(board_id)
        notes = board_manager.get_notes(board_id)
        
        # 构建详细的上下文更新消息
        context_details = []
        context_details.append(f"展板 {board_id} 状态更新:")
        context_details.append(f"- 总窗口数: {len(windows_data)}")
        context_details.append(f"- PDF文件数: {len(pdf_files)}")
        context_details.append(f"- 笔记数: {len(notes)}")
        
        if pdf_files:
            context_details.append("\nPDF文件详情:")
            for pdf in pdf_files:
                filename = pdf.get('filename', '未知文件')
                current_page = pdf.get('current_page', 1)
                preview = pdf.get('content_preview', '')[:200]
                context_details.append(f"  • {filename} (第{current_page}页): {preview}...")
        
        if notes:
            context_details.append("\n笔记详情:")
            for note in notes:
                title = note.get('title', '无标题')
                preview = note.get('content_preview', '')[:200]
                context_details.append(f"  • {title}: {preview}...")
        
        update_message = "\n".join(context_details)
        
        # 向简化专家LLM发送详细的上下文更新
        try:
            await expert.process_query(f"[系统上下文更新]\n{update_message}")
        except Exception as update_error:
            logger.warning(f"发送上下文更新到专家LLM失败: {str(update_error)}")
        
        logger.info(f"展板 {board_id} 上下文已成功更新到BoardManager和专家LLM")
        
        return {"status": "success", "message": "展板上下文已更新"}
    except Exception as e:
        logger.error(f"更新展板上下文失败: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"更新展板上下文失败: {str(e)}"}
        )

@app.websocket('/api/assistant/stream')
async def assistant_stream(websocket: WebSocket):
    """WebSocket端点：管家LLM流式输出"""
    await websocket.accept()
    
    # WebSocket连接状态标志
    websocket_active = True
    
    try:
        # 接收请求数据
        data = await websocket.receive_json()
        
        query = data.get('query')
        status_log = data.get('status_log', '')
        history = data.get('history', [])
        
        if not query:
            await websocket.send_json({"error": "查询不能为空"})
            await websocket.close()
            websocket_active = False
            return
        
        logger.info(f"管家LLM流式查询: {query[:50]}...")
        
        # 定义回调函数处理流式输出
        async def send_chunk(chunk):
            if websocket_active:
                try:
                    await websocket.send_json({"chunk": chunk})
                except Exception as e:
                    logger.error(f"发送数据块失败: {str(e)}")
        
        # 同步转异步回调，增加连接状态检查
        def callback(chunk):
            if websocket_active:
                try:
                    asyncio.create_task(send_chunk(chunk))
                except Exception as e:
                    logger.error(f"创建发送任务失败: {str(e)}")
        
        # 使用butler_llm处理流式查询
        full_response = butler_llm.stream_call_llm(query, callback)
        
        # 识别响应中可能的命令
        command = butler_llm._extract_command_json(full_response)
        
        # 发送完成信号和可能的命令
        if websocket_active:
            try:
                await websocket.send_json({
                    "done": True,
                    "full_response": full_response,
                    "command": command
                })
            except Exception as e:
                logger.error(f"发送完成信号失败: {str(e)}")
        
        # 稍等一下，确保所有异步任务完成
        await asyncio.sleep(0.1)
        
    except WebSocketDisconnect:
        logger.warning("WebSocket连接已断开")
        websocket_active = False
    except Exception as e:
        logger.error(f"管家LLM流式查询错误: {str(e)}")
        websocket_active = False
        if websocket_active:
            try:
                await websocket.send_json({"error": f"处理请求时出错: {str(e)}"})
            except:
                # 连接可能已关闭
                pass
    finally:
        websocket_active = False
        try:
            await websocket.close()
        except:
            pass

@app.websocket('/api/expert/stream')
async def expert_stream(websocket: WebSocket):
    """专家LLM WebSocket端点：使用简化的专家系统"""
    await websocket.accept()
    
    websocket_active = True
    
    try:
        # 接收请求数据
        data = await websocket.receive_json()
        
        query = data.get('query')
        board_id = data.get('board_id')
        
        if not query:
            await websocket.send_json({"error": "查询不能为空"})
            await websocket.close()
            return
            
        if not board_id:
            await websocket.send_json({"error": "展板ID不能为空"})
            await websocket.close()
            return
        
        logger.info(f"专家LLM查询: 展板 {board_id}, 查询: {query[:50]}...")
        
        # 获取简化专家实例
        expert = simple_expert_manager.get_expert(board_id)
        
        # 处理查询
        try:
            response = await expert.process_query(query)
            
            # 发送最终响应
            if websocket_active:
                await websocket.send_json({
                    "done": True,
                    "full_response": response,
                    "timestamp": time.time()
                })
                
            logger.info(f"专家LLM查询完成: 展板 {board_id}")
            
        except Exception as process_error:
            error_msg = f"分析失败: {str(process_error)}"
            logger.error(f"专家LLM处理失败: {str(process_error)}", exc_info=True)
            if websocket_active:
                await websocket.send_json({"error": error_msg})
        
    except WebSocketDisconnect:
        logger.warning("专家LLM WebSocket连接已断开")
        websocket_active = False
    except Exception as e:
        logger.error(f"专家LLM查询错误: {str(e)}", exc_info=True)
        if websocket_active:
            try:
                await websocket.send_json({"error": f"处理请求时出错: {str(e)}"})
            except:
                pass
    finally:
        websocket_active = False
        try:
            await websocket.close()
        except:
            pass

@app.websocket('/api/expert/intelligent')
async def intelligent_expert_stream(websocket: WebSocket):
    """智能专家LLM WebSocket端点：支持自主工具调用和多轮对话"""
    await websocket.accept()
    websocket_active = True
    
    try:
        # 接收请求数据
        data = await websocket.receive_json()
        
        query = data.get('query')
        board_id = data.get('board_id')
        
        if not query:
            await websocket.send_json({"error": "查询不能为空"})
            return
            
        if not board_id:
            await websocket.send_json({"error": "展板ID不能为空"})
            return
        
        logger.info(f"智能专家LLM查询: 展板 {board_id}, 查询: {query[:50]}...")
        
        # 创建智能专家实例
        intelligent_expert = IntelligentExpert(board_id)
        
        # 定义状态回调函数
        async def status_callback(status_message: str):
            if websocket_active:
                try:
                    await websocket.send_json({
                        "status": status_message,
                        "timestamp": time.time()
                    })
                except Exception as e:
                    logger.error(f"发送状态信息失败: {str(e)}")
        
        # 处理查询并获取最终答案
        try:
            final_answer = await intelligent_expert.process_query(query, status_callback)
            
            # 发送最终答案
            if websocket_active:
                await websocket.send_json({
                    "answer": final_answer,
                    "done": True,
                    "timestamp": time.time()
                })
                
            logger.info(f"智能专家LLM查询完成: 展板 {board_id}")
            
        except Exception as process_error:
            error_msg = f"智能分析失败: {str(process_error)}"
            logger.error(f"智能专家LLM处理失败: {str(process_error)}", exc_info=True)
            if websocket_active:
                await websocket.send_json({"error": error_msg})
        
    except WebSocketDisconnect:
        logger.warning("智能专家LLM WebSocket连接已断开")
        websocket_active = False
    except Exception as e:
        logger.error(f"智能专家LLM查询错误: {str(e)}", exc_info=True)
        websocket_active = False
        if websocket_active:
            try:
                await websocket.send_json({"error": f"处理请求时出错: {str(e)}"})
            except:
                pass
    finally:
        websocket_active = False
        try:
            await websocket.close()
        except:
            pass

@app.delete('/api/boards/{board_id}')
async def delete_board(board_id: str):
    """删除展板"""
    logger.info(f"删除展板: {board_id}")
    try:
        # 使用全局app_state变量，而不是创建新实例
        global app_state
        
        # 查找展板
        board = None
        for b in app_state.get_boards():
            if b["id"] == board_id:
                board = b
                break
                
        if not board:
            raise HTTPException(status_code=404, detail="展板不存在")
            
        # 筛选出其他展板
        app_state.boards = [
            b for b in app_state.boards 
            if b["id"] != board_id
        ]
        
        # 保存状态
        app_state.save_state()
        
        # 同步到管家LLM
        sync_app_state_to_butler()
        
        return {"status": "success", "message": f"展板 {board['name']} 已删除"}
    except Exception as e:
        logger.error(f"删除展板失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除展板失败: {str(e)}")

@app.get('/api/test-connection')
async def test_api_connection():
    """测试API连接状态"""
    try:
        # 检查API密钥配置
        config_status = {
            "qwen_api_configured": bool(QWEN_API_KEY),
            "qwen_vl_api_configured": bool(QWEN_VL_API_KEY),
            "env_path": os.path.abspath('.env') if os.path.exists('.env') else "不存在"
        }
        
        # 测试通义千问API连接
        qwen_test = {"status": "未测试", "error": None}
        if QWEN_API_KEY:
            try:
                client = OpenAI(
                    api_key=QWEN_API_KEY,
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                )
                
                # 使用最简单的API调用
                completion = client.chat.completions.create(
                    model="qwen-turbo",
                    messages=[
                        {"role": "system", "content": "你是一个测试助手"},
                        {"role": "user", "content": "测试连接"}
                    ],
                    max_tokens=10
                )
                
                qwen_test["status"] = "成功"
                qwen_test["response"] = completion.choices[0].message.content
            except Exception as e:
                qwen_test["status"] = "失败"
                qwen_test["error"] = str(e)
        
        # 测试通义千问视觉API连接
        qwen_vl_test = {"status": "未测试", "error": None}
        if QWEN_VL_API_KEY:
            try:
                # 使用基本的API查询验证密钥是否有效
                url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
                headers = {"Authorization": f"Bearer {QWEN_VL_API_KEY}"}
                
                resp = requests.get(url, headers=headers, timeout=10)
                resp.raise_for_status()
                
                qwen_vl_test["status"] = "成功"
            except Exception as e:
                qwen_vl_test["status"] = "失败"
                qwen_vl_test["error"] = str(e)
        
        return {
            "config": config_status,
            "qwen_test": qwen_test,
            "qwen_vl_test": qwen_vl_test
        }
    except Exception as e:
        logger.error(f"API测试失败: {str(e)}")
        return {"error": f"API测试过程中出错: {str(e)}"}

@app.post('/api/materials/{filename}/pages/{page_number}/improve-annotation')
async def api_improve_annotation(
    filename: str, 
    page_number: int,
    session_id: Optional[str] = Query(None),
    request_data: Optional[dict] = Body(None)
):
    """改进页面注释API"""
    logger.info(f"收到改进注释请求: {filename}, 页码: {page_number}")
    
    current_annotation = request_data.get("current_annotation") if request_data else None
    improve_request = request_data.get("improve_request") if request_data else None
    board_id = request_data.get("board_id") if request_data else None
    
    # 修改：即使没有现有注释也允许继续
    is_new_annotation = False
    if not current_annotation:
        logger.info("没有提供现有注释内容，将执行初始注释生成")
        is_new_annotation = True
        current_annotation = ""  # 设置为空字符串，避免None引起的错误
    
    try:
        # 读取原始页面内容
        page_file = os.path.join(PAGE_DIR, f"{filename}_page_{page_number}.txt")
        if not os.path.exists(page_file):
            raise HTTPException(status_code=404, detail="找不到页面内容")
        
        with open(page_file, 'r', encoding='utf-8') as f:
            page_text = f.read()
        
        # 根据是否有现有注释决定使用哪个函数
        if is_new_annotation:
            # 使用annotate_page生成全新注释
            from controller import annotate_page
            result = annotate_page(
                filename, 
                page_number, 
                force_vision=False, 
                session_id=session_id, 
                current_annotation=None,
                improve_request=improve_request,
                board_id=board_id
            )
            return {"improved_annotation": result.get("note")}
        else:
            # 使用improve_note改进现有注释
            from controller import improve_note
            result = improve_note(
                filename, 
                current_annotation, 
                [page_text], 
                improve_request, 
                session_id, 
                board_id
            )
            return {"improved_annotation": result.get("improved_note")}
    except Exception as e:
        logger.error(f"改进注释失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"改进注释失败: {str(e)}")

@app.get('/api/expert/dynamic/result/{task_id}')
async def get_dynamic_task_result(task_id: str):
    """
    获取动态任务的执行结果
    """
    query_start_time = time.time()
    logger.info(f"🔍 [RESULT-QUERY] 开始查询任务结果: {task_id}")
    
    try:
        # 从所有专家实例中查找任务结果
        result_found = False
        task_result = None
        board_id_found = None
        
        search_start_time = time.time()
        for board_id, expert in simple_expert_manager.experts.items():
            if task_id in expert.task_results:
                task_result = expert.task_results[task_id]
                board_id_found = board_id
                result_found = True
                break
        
        search_time = time.time() - search_start_time
        logger.info(f"🔎 [RESULT-QUERY] 搜索完成，耗时: {search_time:.3f}s，搜索了 {len(simple_expert_manager.experts)} 个专家实例")
        
        if result_found:
            # 记录查询统计
            logger.info(f"✅ [RESULT-QUERY] 任务结果找到: {task_id} (展板: {board_id_found}), 状态: {task_result.get('status', 'unknown')}")
            
            response = {
                "status": "success",
                "task_id": task_id,
                "board_id": board_id_found,
                **task_result,  # 展开任务结果的所有字段
                "query_timing": {
                    "total_query_time": time.time() - query_start_time,
                    "search_time": search_time,
                    "expert_count": len(simple_expert_manager.experts)
                }
            }
            
            total_query_time = time.time() - query_start_time
            logger.info(f"🎯 [RESULT-QUERY] 查询完成，总耗时: {total_query_time:.3f}s")
            
            return response
        else:
            logger.warning(f"❓ [RESULT-QUERY] 任务结果未找到: {task_id}，搜索耗时: {search_time:.3f}s")
            return JSONResponse(
                status_code=404,
                content={
                    "detail": f"任务结果不存在: {task_id}",
                    "task_id": task_id,
                    "expert_count": len(simple_expert_manager.experts),
                    "search_time": search_time
                }
            )
            
    except Exception as e:
        error_time = time.time() - query_start_time
        logger.error(f"❌ [RESULT-QUERY] 获取任务结果失败: {task_id}，错误: {str(e)}，耗时: {error_time:.3f}s", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"获取任务结果失败: {str(e)}",
                "task_id": task_id,
                "error_time": error_time
            }
        )

@app.get('/api/expert/dynamic/concurrent-status/{board_id}')
async def get_concurrent_status(board_id: str):
    """
    获取指定展板的并发任务状态
    """
    timestamp_start = time.time()
    logger.info(f"📊 获取并发状态请求: 展板ID={board_id}")
    
    try:
        # 使用简化专家系统获取状态
        expert = simple_expert_manager.get_expert(board_id)
        
        # 获取并发状态
        status = expert.get_concurrent_status()
        
        # 记录详细的状态信息
        logger.info(f"📈 并发状态查询结果: 展板={board_id}, 活跃任务={status.get('active_tasks', 0)}, 最大并发={status.get('max_concurrent_tasks', 3)}")
        
        response_time = time.time() - timestamp_start
        return {
            "status": "success",
            "concurrent_status": status,
            "board_id": board_id,
            "response_time": response_time,
            "timestamp": datetime.datetime.now().isoformat()
        }
    except Exception as e:
        error_time = time.time() - timestamp_start
        logger.error(f"❌ 获取并发状态失败: 展板ID={board_id}, 错误={str(e)}, 耗时={error_time:.3f}s", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取并发状态失败: {str(e)}")

@app.post('/api/expert/dynamic/generate-pdf-note')
async def submit_generate_pdf_note_task(request_data: dict = Body(...)):
    """
    提交PDF笔记生成任务 - 使用SimpleExpert并发系统
    """
    try:
        board_id = request_data.get('board_id')
        filename = request_data.get('filename')
        
        if not board_id or not filename:
            return JSONResponse(
                status_code=400,
                content={"detail": "展板ID和文件名不能为空"}
            )
        
        logger.info(f"🚀 [PDF-NOTE] 提交PDF笔记生成任务: 展板={board_id}, 文件={filename}")
        
        # 获取专家实例
        expert = simple_expert_manager.get_expert(board_id)
        
        # 提交生成笔记任务
        task_id = await expert.submit_task("generate_note", {
            "filename": filename
        })
        
        if task_id:
            logger.info(f"✅ [PDF-NOTE] PDF笔记生成任务提交成功: {task_id}")
            
            return {
                "status": "success",
                "board_id": board_id,
                "task_id": task_id,
                "task_type": "generate_note",
                "filename": filename,
                "message": f"PDF笔记生成任务已提交: {filename}"
            }
        else:
            logger.error(f"❌ [PDF-NOTE] 任务提交失败: 返回task_id为空")
            return JSONResponse(
                status_code=500,
                content={"detail": "任务提交失败: 无法创建任务ID"}
            )
            
    except Exception as e:
        logger.error(f"❌ [PDF-NOTE] 提交PDF笔记生成任务失败: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"任务提交失败: {str(e)}"}
        )

@app.post('/api/expert/dynamic/submit')
async def submit_dynamic_task(request_data: dict = Body(...)):
    """
    提交动态任务到并发处理系统
    """
    submit_start_time = time.time()
    logger.info(f"🚀 [TASK-SUBMIT] 收到并发任务提交请求")
    
    try:
        board_id = request_data.get('board_id')
        task_type = request_data.get('task_type')
        task_info = request_data.get('task_info', {})
        
        if not board_id:
            logger.error(f"❌ [TASK-SUBMIT] 展板ID不能为空")
            return JSONResponse(
                status_code=400,
                content={"detail": "展板ID不能为空"}
            )
            
        if not task_type:
            logger.error(f"❌ [TASK-SUBMIT] 任务类型不能为空")
            return JSONResponse(
                status_code=400,
                content={"detail": "任务类型不能为空"}
            )
        
        logger.info(f"📋 [TASK-SUBMIT] 提交任务: 展板={board_id}, 类型={task_type}")
        
        # 获取专家实例
        expert_start_time = time.time()
        expert = simple_expert_manager.get_expert(board_id)
        expert_time = time.time() - expert_start_time
        
        logger.info(f"🧠 [TASK-SUBMIT] 获取专家实例完成，耗时: {expert_time:.3f}s")
        
        # 根据任务类型处理不同的任务
        task_submit_start_time = time.time()
        
        if task_type == 'generate_board_note':
            # 展板笔记生成任务
            task_id = await expert.submit_task("generate_board_note", task_info)
        elif task_type == 'improve_board_note':
            # 展板笔记改进任务
            task_id = await expert.submit_task("improve_board_note", task_info)
        elif task_type in ['generate_annotation', 'improve_annotation', 'generate_note', 'ask_question']:
            # 其他已存在的任务类型
            task_id = await expert.submit_task(task_type, task_info)
        else:
            logger.error(f"❌ [TASK-SUBMIT] 不支持的任务类型: {task_type}")
            return JSONResponse(
                status_code=400,
                content={"detail": f"不支持的任务类型: {task_type}"}
            )
        
        task_submit_time = time.time() - task_submit_start_time
        
        if task_id:
            total_submit_time = time.time() - submit_start_time
            logger.info(f"✅ [TASK-SUBMIT] 任务提交成功: {task_id}, 总耗时: {total_submit_time:.3f}s (专家: {expert_time:.3f}s, 提交: {task_submit_time:.3f}s)")
            
            return {
                "status": "success",
                "board_id": board_id,
                "task_id": task_id,
                "task_type": task_type,
                "message": f"任务已提交: {task_type}",
                "timing": {
                    "total_time": total_submit_time,
                    "expert_time": expert_time,
                    "submit_time": task_submit_time
                }
            }
        else:
            logger.error(f"❌ [TASK-SUBMIT] 任务提交失败: 返回task_id为空")
            return JSONResponse(
                status_code=500,
                content={"detail": "任务提交失败: 无法创建任务ID"}
            )
            
    except Exception as e:
        error_time = time.time() - submit_start_time
        logger.error(f"❌ [TASK-SUBMIT] 提交动态任务失败: {str(e)}, 耗时: {error_time:.3f}s", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"任务提交失败: {str(e)}"}
        )

# 启动应用
if __name__ == "__main__":
    # 加载环境变量
    dotenv.load_dotenv('.env')
    
    # 打印欢迎信息
    print("\n=== WhatNote 服务已启动 ===")
    print(f"API密钥配置: {'已配置' if bool(os.getenv('QWEN_API_KEY')) else '未配置'}")
    print(f"视觉API配置: {'已配置' if bool(os.getenv('QWEN_VL_API_KEY')) else '未配置'}")
    print("=======================\n")
    
    # 应用启动时同步一次文件结构
    sync_app_state_to_butler()
    
    # 启动服务
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)  
