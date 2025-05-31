import os
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

# 基础目录配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PAGE_DIR = os.path.join(BASE_DIR, "pages")

# 文件上传配置
UPLOAD_MAX_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'pdf', 'pptx'}

# API配置
API_TIMEOUT = 180  # 增加超时时间至3分钟，应对复杂的笔记改进任务
QWEN_API_KEY = os.getenv("QWEN_API_KEY")
# 定义DashScope API密钥
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")
# 优先使用DASHSCOPE_API_KEY环境变量，不存在时再使用QWEN_VL_API_KEY
QWEN_VL_API_KEY = DASHSCOPE_API_KEY or os.getenv("QWEN_VL_API_KEY")

# 日志配置
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PAGE_DIR, exist_ok=True)
