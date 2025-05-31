#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
展板隔离问题修复脚本

解决问题：
1. 课程文件ID被误用作展板ID，导致新展板显示旧PDF数据
2. 清理错误的展板日志文件
3. 修复展板ID生成机制
"""

import os
import json
import glob
import shutil
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def identify_problematic_board_logs():
    """识别有问题的展板日志文件"""
    board_logs_dir = "board_logs"
    if not os.path.exists(board_logs_dir):
        logger.info("展板日志目录不存在")
        return []
    
    # 找到所有以file-开头的展板日志（这些应该是课程文件，不应该作为展板）
    file_based_logs = glob.glob(os.path.join(board_logs_dir, "file-*.json"))
    
    problematic_logs = []
    
    for log_file in file_based_logs:
        filename = os.path.basename(log_file)
        logger.info(f"检查文件: {filename}")
        
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 检查是否包含PDF数据
            has_pdfs = len(data.get('pdfs', [])) > 0
            has_operations = len(data.get('operations', [])) > 0
            
            if has_pdfs or has_operations:
                logger.warning(f"⚠️  发现问题文件 {filename}: {len(data.get('pdfs', []))} PDFs, {len(data.get('operations', []))} 操作")
                problematic_logs.append({
                    'file': log_file,
                    'filename': filename,
                    'board_id': data.get('board_id'),
                    'pdf_count': len(data.get('pdfs', [])),
                    'operation_count': len(data.get('operations', [])),
                    'data': data
                })
            else:
                logger.info(f"✅ 文件 {filename} 是空的，可以安全删除")
                
        except Exception as e:
            logger.error(f"❌ 读取文件 {filename} 失败: {e}")
    
    return problematic_logs

def backup_problematic_logs(problematic_logs):
    """备份有问题的日志文件"""
    backup_dir = f"board_logs_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(backup_dir, exist_ok=True)
    
    logger.info(f"创建备份目录: {backup_dir}")
    
    for log_info in problematic_logs:
        source = log_info['file']
        dest = os.path.join(backup_dir, log_info['filename'])
        shutil.copy2(source, dest)
        logger.info(f"备份: {log_info['filename']} -> {dest}")
    
    return backup_dir

def clean_board_logs():
    """清理展板日志"""
    board_logs_dir = "board_logs"
    if not os.path.exists(board_logs_dir):
        return
    
    # 删除所有以file-开头的日志文件（这些是误用的课程文件ID）
    file_based_logs = glob.glob(os.path.join(board_logs_dir, "file-*.json"))
    
    for log_file in file_based_logs:
        try:
            os.remove(log_file)
            logger.info(f"✅ 删除错误的展板日志: {os.path.basename(log_file)}")
        except Exception as e:
            logger.error(f"❌ 删除文件失败 {log_file}: {e}")

def update_board_logger_init():
    """更新board_logger的初始化逻辑以确保真正的隔离"""
    board_logger_file = "board_logger.py"
    
    if not os.path.exists(board_logger_file):
        logger.warning("board_logger.py文件不存在")
        return
    
    # 读取原文件
    with open(board_logger_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 添加一个验证方法到BoardLogger类
    validation_method = '''
    def validate_board_id(self, board_id):
        """验证展板ID的有效性，防止使用课程文件ID"""
        if not board_id:
            return False
        
        # 检查是否是课程文件ID格式（file-course-*）
        if board_id.startswith('file-course-'):
            logger.warning(f"检测到无效的展板ID（课程文件ID）: {board_id}")
            return False
        
        # 检查是否是课程文件ID格式（file-*）
        if board_id.startswith('file-') and not board_id.startswith('file-1748'):
            logger.warning(f"检测到可能无效的展板ID: {board_id}")
            return False
        
        return True
'''
    
    # 更新init_board方法，添加ID验证
    if 'def init_board(self, board_id):' in content:
        # 在init_board方法开始处添加验证
        init_board_validation = '''    def init_board(self, board_id):
        """初始化展板日志 - 确保新展板从空白状态开始"""
        
        # 验证展板ID
        if not self.validate_board_id(board_id):
            raise ValueError(f"无效的展板ID: {board_id}，不能使用课程文件ID作为展板ID")
        
        # 先清除可能存在的旧日志'''
        
        # 替换原有的init_board方法开始部分
        content = content.replace(
            '    def init_board(self, board_id):\n        """初始化展板日志 - 确保新展板从空白状态开始"""\n        # 先清除可能存在的旧日志',
            init_board_validation
        )
    
    # 添加验证方法（在类的末尾添加）
    if 'class BoardLogger:' in content and 'def validate_board_id' not in content:
        # 在类的最后一个方法之前插入验证方法
        content = content.replace(
            '# 全局单例\nboard_logger = BoardLogger()',
            validation_method + '\n# 全局单例\nboard_logger = BoardLogger()'
        )
    
    # 写回文件
    with open(board_logger_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    logger.info("✅ 已更新board_logger.py，添加展板ID验证")

def create_fix_summary(problematic_logs, backup_dir):
    """创建修复总结报告"""
    report = f"""# 展板隔离问题修复报告

## 修复时间
{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 问题描述
发现 {len(problematic_logs)} 个有问题的展板日志文件，这些文件使用了课程文件ID作为展板ID，导致新展板显示旧的PDF数据。

## 修复内容

### 1. 备份问题文件
备份目录: `{backup_dir}`

### 2. 有问题的文件列表
"""
    
    for log_info in problematic_logs:
        report += f"""
#### {log_info['filename']}
- 展板ID: {log_info['board_id']}
- PDF数量: {log_info['pdf_count']}
- 操作数量: {log_info['operation_count']}
"""
    
    report += f"""

### 3. 修复措施
1. ✅ 备份了所有有问题的日志文件到 `{backup_dir}`
2. ✅ 删除了所有以 `file-` 开头的展板日志文件
3. ✅ 更新了 `board_logger.py`，添加了展板ID验证机制
4. ✅ 防止未来再次出现相同问题

### 4. 前端修复建议
为了彻底解决问题，还需要修改前端代码：
1. 修改 `App.js` 中所有使用 `currentFile.key` 作为展板ID的地方
2. 实现课程文件到展板ID的正确映射
3. 确保每个课程文件有独立的展板ID

### 5. 验证方法
1. 重启后端服务
2. 创建新的课程文件夹和展板
3. 验证新展板是否为空
4. 确认不同展板之间的数据隔离

## 预期结果
修复后，新创建的展板应该：
- 总是从空白状态开始
- 不会显示其他展板的PDF文件
- 具有正确的数据隔离

## 注意事项
- 备份的数据保存在 `{backup_dir}` 目录中
- 如需恢复数据，可以从备份目录中取回
- 建议在前端也做相应的修复以彻底解决问题
"""
    
    with open("展板隔离问题修复报告.md", 'w', encoding='utf-8') as f:
        f.write(report)
    
    logger.info("✅ 修复报告已生成: 展板隔离问题修复报告.md")

def main():
    """主修复流程"""
    logger.info("🔧 开始展板隔离问题修复...")
    
    # 1. 识别有问题的日志文件
    logger.info("1️⃣ 识别有问题的展板日志...")
    problematic_logs = identify_problematic_board_logs()
    
    if not problematic_logs:
        logger.info("✅ 没有发现问题文件，无需修复")
        return
    
    logger.info(f"📊 发现 {len(problematic_logs)} 个有问题的文件")
    
    # 2. 备份问题文件
    logger.info("2️⃣ 备份有问题的文件...")
    backup_dir = backup_problematic_logs(problematic_logs)
    
    # 3. 清理展板日志
    logger.info("3️⃣ 清理错误的展板日志...")
    clean_board_logs()
    
    # 4. 更新board_logger
    logger.info("4️⃣ 更新board_logger.py...")
    update_board_logger_init()
    
    # 5. 生成修复报告
    logger.info("5️⃣ 生成修复报告...")
    create_fix_summary(problematic_logs, backup_dir)
    
    logger.info("🎉 展板隔离问题修复完成！")
    logger.info("📋 请查看 '展板隔离问题修复报告.md' 了解详细信息")
    logger.info("⚠️  建议重启后端服务以确保修复生效")

if __name__ == "__main__":
    main() 