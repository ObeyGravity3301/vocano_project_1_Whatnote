#!/usr/bin/env python3
'''
恢复展板日志功能脚本
'''

import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def restore_file(file_path):
    backup_path = f"{file_path}.logging_backup"
    if os.path.exists(backup_path):
        shutil.copy2(backup_path, file_path)
        os.remove(backup_path)
        logger.info(f"已恢复文件: {backup_path} -> {file_path}")
        return True
    else:
        logger.warning(f"备份文件不存在: {backup_path}")
        return False

def main():
    logger.info("开始恢复展板日志功能...")
    
    files_to_restore = [
        "board_logger.py",
        "board_manager.py"
    ]
    
    success_count = 0
    for file_path in files_to_restore:
        if restore_file(file_path):
            success_count += 1
    
    if success_count == len(files_to_restore):
        logger.info("✅ 展板日志功能已成功恢复")
    else:
        logger.warning(f"⚠️ 部分文件恢复失败 ({success_count}/{len(files_to_restore)})")

if __name__ == "__main__":
    main()
