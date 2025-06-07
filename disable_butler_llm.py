#!/usr/bin/env python3
"""
禁用管家LLM功能脚本
用于临时禁用管家LLM相关功能，专注于基本功能
"""

import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def backup_file(file_path):
    """备份文件"""
    backup_path = f"{file_path}.butler_backup"
    if os.path.exists(file_path):
        shutil.copy2(file_path, backup_path)
        logger.info(f"已备份文件: {file_path} -> {backup_path}")
        return True
    return False

def disable_butler_in_main():
    """在main.py中禁用管家LLM相关功能"""
    main_file = "main.py"
    
    if not os.path.exists(main_file):
        logger.error(f"文件不存在: {main_file}")
        return False
    
    # 备份文件
    backup_file(main_file)
    
    # 读取文件内容
    with open(main_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    logger.info("开始禁用管家LLM功能...")
    
    # 1. 注释掉管家LLM导入
    content = content.replace(
        'from butler_llm import ButlerLLM',
        '# from butler_llm import ButlerLLM  # 临时禁用'
    )
    
    # 2. 注释掉管家LLM初始化
    content = content.replace(
        'butler_llm = ButlerLLM()',
        '# butler_llm = ButlerLLM()  # 临时禁用'
    )
    
    # 3. 修改sync_app_state_to_butler函数为空函数
    sync_function_start = content.find('def sync_app_state_to_butler():')
    if sync_function_start != -1:
        # 找到函数结束位置
        lines = content.split('\n')
        start_line = content[:sync_function_start].count('\n')
        
        # 查找函数结束位置（下一个不缩进的行或下一个def）
        end_line = start_line + 1
        while end_line < len(lines):
            line = lines[end_line]
            if line.strip() and not line.startswith('    ') and not line.startswith('\t'):
                break
            end_line += 1
        
        # 替换函数内容为简单的pass
        new_function = '''def sync_app_state_to_butler():
    """同步应用状态到管家LLM - 已禁用"""
    pass  # 管家LLM功能已临时禁用'''
        
        # 重建内容
        new_lines = lines[:start_line] + new_function.split('\n') + lines[end_line:]
        content = '\n'.join(new_lines)
    
    # 4. 注释掉所有管家LLM相关的API端点
    butler_endpoints = [
        '@app.post(\'/api/assistant\')',
        '@app.post(\'/api/assistant/execute\')',
        '@app.websocket(\'/api/assistant/stream\')',
        '@app.get(\'/api/butler/status\')',
        '@app.post(\'/api/global-task\')'
    ]
    
    for endpoint in butler_endpoints:
        if endpoint in content:
            # 找到端点并注释掉整个函数
            endpoint_start = content.find(endpoint)
            if endpoint_start != -1:
                lines = content.split('\n')
                start_line = content[:endpoint_start].count('\n')
                
                # 查找函数结束位置
                end_line = start_line + 1
                while end_line < len(lines):
                    line = lines[end_line]
                    if line.strip() and not line.startswith('    ') and not line.startswith('\t') and (line.startswith('@app.') or line.startswith('def ') or line.startswith('class ')):
                        break
                    end_line += 1
                
                # 注释掉这些行
                for i in range(start_line, end_line):
                    if i < len(lines) and not lines[i].startswith('#'):
                        lines[i] = '# ' + lines[i] + '  # 管家LLM功能已禁用'
                
                content = '\n'.join(lines)
    
    # 写回文件
    with open(main_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    logger.info("✅ 已禁用main.py中的管家LLM功能")
    return True

def disable_frontend_butler():
    """禁用前端的管家LLM组件"""
    app_js_file = "frontend/src/App.js"
    
    if not os.path.exists(app_js_file):
        logger.warning(f"文件不存在: {app_js_file}")
        return False
    
    # 备份文件
    backup_file(app_js_file)
    
    # 读取文件内容
    with open(app_js_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 注释掉ButlerPanel的导入和使用
    content = content.replace(
        "import ButlerPanel from './components/ButlerPanel';",
        "// import ButlerPanel from './components/ButlerPanel';  // 临时禁用"
    )
    
    # 注释掉ButlerPanel的渲染
    if 'ButlerPanel' in content:
        # 查找并注释掉 <ButlerPanel /> 相关的JSX
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'ButlerPanel' in line and not line.strip().startswith('//'):
                lines[i] = '        {/* ' + line.strip() + ' */}  {/* 管家LLM功能已禁用 */}'
        content = '\n'.join(lines)
    
    # 写回文件
    with open(app_js_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    logger.info("✅ 已禁用前端的管家LLM组件")
    return True

def create_restore_script():
    """创建恢复脚本"""
    restore_script = """#!/usr/bin/env python3
'''
管家LLM功能恢复脚本
'''

import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def restore_file(file_path):
    backup_path = f"{file_path}.butler_backup"
    if os.path.exists(backup_path):
        shutil.copy2(backup_path, file_path)
        os.remove(backup_path)
        logger.info(f"已恢复文件: {backup_path} -> {file_path}")
        return True
    else:
        logger.warning(f"备份文件不存在: {backup_path}")
        return False

def main():
    logger.info("开始恢复管家LLM功能...")
    
    files_to_restore = [
        "main.py",
        "frontend/src/App.js"
    ]
    
    success_count = 0
    for file_path in files_to_restore:
        if restore_file(file_path):
            success_count += 1
    
    if success_count == len(files_to_restore):
        logger.info("✅ 管家LLM功能已成功恢复")
    else:
        logger.warning(f"⚠️ 部分文件恢复失败 ({success_count}/{len(files_to_restore)})")

if __name__ == "__main__":
    main()
"""
    
    with open("restore_butler_llm.py", 'w', encoding='utf-8') as f:
        f.write(restore_script)
    
    logger.info("✅ 已创建恢复脚本: restore_butler_llm.py")

def main():
    """主函数"""
    logger.info("🔧 开始禁用管家LLM功能...")
    
    success_count = 0
    total_operations = 3
    
    # 1. 禁用后端管家LLM功能
    if disable_butler_in_main():
        success_count += 1
    
    # 2. 禁用前端管家LLM组件
    if disable_frontend_butler():
        success_count += 1
    
    # 3. 创建恢复脚本
    create_restore_script()
    success_count += 1
    
    if success_count == total_operations:
        logger.info("✅ 管家LLM功能已成功禁用")
        logger.info("📋 影响的功能:")
        logger.info("  - 管家LLM对话面板")
        logger.info("  - 全局任务规划")
        logger.info("  - 应用状态同步")
        logger.info("  - 多展板协调")
        logger.info("")
        logger.info("📌 保留的功能:")
        logger.info("  - 基本的PDF查看和注释")
        logger.info("  - 展板笔记功能")
        logger.info("  - 专家LLM（展板内AI助手）")
        logger.info("  - 文件上传和管理")
        logger.info("")
        logger.info("🔄 要恢复管家LLM功能，请运行: python restore_butler_llm.py")
    else:
        logger.error("❌ 禁用管家LLM功能时出现错误")

if __name__ == "__main__":
    main() 