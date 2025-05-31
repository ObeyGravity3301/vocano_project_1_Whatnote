#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
WhatNote 文件命名一致性修复工具
根据 WHATNOTE_NAMING_CONVENTIONS.md 规范修复现有的命名问题
"""

import os
import json
import re
import shutil
import time
from typing import Dict, List, Tuple
import requests

class NamingConsistencyFixer:
    """文件命名一致性修复器"""
    
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.issues_found = []
        self.fixes_applied = []
        
    def check_server_connection(self) -> bool:
        """检查服务器连接"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=3)
            return response.status_code == 200
        except:
            return False
    
    def load_app_state(self) -> Dict:
        """加载应用状态"""
        try:
            with open('app_state.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ 无法加载app_state.json: {str(e)}")
            return {}
    
    def save_app_state(self, state: Dict):
        """保存应用状态"""
        try:
            # 备份原文件
            if os.path.exists('app_state.json'):
                shutil.copy2('app_state.json', 'app_state.json.backup')
            
            with open('app_state.json', 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"❌ 无法保存app_state.json: {str(e)}")
            return False
    
    def check_id_format(self, item_id: str, expected_prefix: str) -> Tuple[bool, str]:
        """检查ID格式是否符合规范"""
        if not item_id:
            return False, "ID为空"
        
        # 标准格式：{prefix}-{timestamp}-{random}
        pattern = rf"^{expected_prefix}-\d{{13}}-\d{{3}}$"
        if re.match(pattern, item_id):
            return True, "格式正确"
        
        # 检查是否是旧格式
        old_patterns = [
            rf"^{expected_prefix}-\d+$",  # course-1, board-2
            rf"^{expected_prefix}$",      # course, board
        ]
        
        for pattern in old_patterns:
            if re.match(pattern, item_id):
                return False, "使用了旧格式"
        
        return False, "格式不符合规范"
    
    def generate_new_id(self, prefix: str) -> str:
        """生成符合规范的新ID"""
        import random
        timestamp = int(time.time() * 1000)
        random_suffix = random.randint(100, 999)
        return f"{prefix}-{timestamp}-{random_suffix}"
    
    def check_app_state_consistency(self):
        """检查app_state.json的一致性"""
        print("🔍 检查 app_state.json 的一致性...")
        
        app_state = self.load_app_state()
        if not app_state:
            return False
        
        needs_update = False
        
        # 检查课程文件夹ID格式
        for folder in app_state.get('course_folders', []):
            folder_id = folder.get('id', '')
            is_valid, reason = self.check_id_format(folder_id, 'course')
            
            if not is_valid:
                self.issues_found.append(f"课程文件夹ID格式问题: {folder_id} - {reason}")
                # 生成新ID
                new_id = self.generate_new_id('course')
                old_id = folder_id
                folder['id'] = new_id
                needs_update = True
                self.fixes_applied.append(f"课程文件夹ID: {old_id} → {new_id}")
                
                # 更新关联的文件ID
                for file_item in folder.get('files', []):
                    old_file_id = file_item.get('id', '')
                    if old_file_id.startswith(f"file-{old_id}-"):
                        new_file_id = old_file_id.replace(f"file-{old_id}-", f"file-{new_id}-")
                        file_item['id'] = new_file_id
                        self.fixes_applied.append(f"文件ID: {old_file_id} → {new_file_id}")
            
            # 检查文件ID格式
            for file_item in folder.get('files', []):
                file_id = file_item.get('id', '')
                expected_prefix = f"file-{folder['id']}"
                
                if not file_id.startswith(expected_prefix):
                    self.issues_found.append(f"文件ID格式问题: {file_id} - 不匹配课程ID")
        
        # 检查展板ID格式
        for board in app_state.get('boards', []):
            board_id = board.get('id', '')
            is_valid, reason = self.check_id_format(board_id, 'board')
            
            if not is_valid:
                self.issues_found.append(f"展板ID格式问题: {board_id} - {reason}")
                new_id = self.generate_new_id('board')
                old_id = board_id
                board['id'] = new_id
                needs_update = True
                self.fixes_applied.append(f"展板ID: {old_id} → {new_id}")
        
        # 保存更新
        if needs_update:
            if self.save_app_state(app_state):
                print("✅ app_state.json 已更新")
            else:
                print("❌ app_state.json 更新失败")
                return False
        
        return True
    
    def check_file_storage_consistency(self):
        """检查文件存储的一致性"""
        print("🔍 检查文件存储的一致性...")
        
        # 检查uploads目录
        uploads_dir = "uploads"
        if not os.path.exists(uploads_dir):
            self.issues_found.append("uploads目录不存在")
            os.makedirs(uploads_dir, exist_ok=True)
            self.fixes_applied.append("创建uploads目录")
        
        # 检查pages目录
        pages_dir = "pages"
        if not os.path.exists(pages_dir):
            self.issues_found.append("pages目录不存在")
            os.makedirs(pages_dir, exist_ok=True)
            self.fixes_applied.append("创建pages目录")
        
        # 检查PDF文件和对应的文字提取文件
        if os.path.exists(uploads_dir) and os.path.exists(pages_dir):
            pdf_files = [f for f in os.listdir(uploads_dir) if f.lower().endswith('.pdf')]
            page_files = [f for f in os.listdir(pages_dir) if f.endswith('.txt')]
            
            print(f"📄 找到 {len(pdf_files)} 个PDF文件")
            print(f"📝 找到 {len(page_files)} 个页面文字文件")
            
            # 检查文字提取文件的命名格式
            for pdf_file in pdf_files:
                # 查找对应的页面文件
                matching_pages = [f for f in page_files if f.startswith(f"{pdf_file}_page_")]
                
                if matching_pages:
                    print(f"✅ {pdf_file}: 找到 {len(matching_pages)} 个页面文字文件")
                    
                    # 验证命名格式
                    for page_file in matching_pages:
                        expected_pattern = rf"^{re.escape(pdf_file)}_page_\d+\.txt$"
                        if not re.match(expected_pattern, page_file):
                            self.issues_found.append(f"页面文件命名格式错误: {page_file}")
                else:
                    print(f"⚠️ {pdf_file}: 没有找到对应的页面文字文件")
    
    def check_api_endpoints(self):
        """检查API端点的兼容性"""
        print("🔍 检查API端点兼容性...")
        
        if not self.check_server_connection():
            print("⚠️ 服务器未运行，跳过API检查")
            return
        
        # 测试状态栏API
        test_board_id = "file-course-1748134005312-868-1"
        status_url = f"{self.base_url}/api/expert/dynamic/concurrent-status/{test_board_id}"
        
        try:
            response = requests.get(status_url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                concurrent_status = data.get('concurrent_status', {})
                
                # 检查字段完整性
                required_fields = ['active_tasks', 'max_concurrent_tasks']
                for field in required_fields:
                    if field not in concurrent_status:
                        self.issues_found.append(f"状态栏API缺少字段: {field}")
                    elif concurrent_status[field] is None:
                        self.issues_found.append(f"状态栏API字段为None: {field}")
                
                print(f"✅ 状态栏API正常响应: {concurrent_status.get('active_tasks', '?')}/{concurrent_status.get('max_concurrent_tasks', '?')}")
            else:
                self.issues_found.append(f"状态栏API响应异常: {response.status_code}")
        
        except Exception as e:
            self.issues_found.append(f"状态栏API请求失败: {str(e)}")
    
    def check_pdf_text_extraction(self):
        """检查PDF文字提取功能"""
        print("🔍 检查PDF文字提取功能...")
        
        try:
            from controller import get_page_text
            
            # 测试已知的PDF文件
            test_pdf = "遗传学(2).pdf"
            test_page = 53
            
            if os.path.exists(f"uploads/{test_pdf}"):
                text_result = get_page_text(test_pdf, test_page)
                
                if text_result and len(text_result) > 100:
                    print(f"✅ PDF文字提取正常: {test_pdf} 第{test_page}页 ({len(text_result)}字符)")
                else:
                    self.issues_found.append(f"PDF文字提取结果过短: {len(text_result)}字符")
            else:
                print(f"⚠️ 测试PDF文件不存在: {test_pdf}")
        
        except Exception as e:
            self.issues_found.append(f"PDF文字提取功能异常: {str(e)}")
    
    def generate_report(self):
        """生成修复报告"""
        print("\n" + "="*60)
        print("📋 WhatNote 文件命名一致性检查报告")
        print("="*60)
        
        if self.issues_found:
            print(f"\n❌ 发现 {len(self.issues_found)} 个问题:")
            for i, issue in enumerate(self.issues_found, 1):
                print(f"  {i}. {issue}")
        else:
            print("\n✅ 未发现命名一致性问题")
        
        if self.fixes_applied:
            print(f"\n🔧 应用 {len(self.fixes_applied)} 个修复:")
            for i, fix in enumerate(self.fixes_applied, 1):
                print(f"  {i}. {fix}")
        else:
            print("\n📝 无需应用修复")
        
        # 生成建议
        print("\n💡 建议:")
        print("1. 定期运行此脚本检查命名一致性")
        print("2. 在修改ID生成逻辑前参考 WHATNOTE_NAMING_CONVENTIONS.md")
        print("3. 测试文件上传和注释生成功能")
        print("4. 检查前端状态栏是否显示正确")
        
        # 保存报告
        report_file = f"naming_consistency_report_{int(time.time())}.txt"
        try:
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write("WhatNote 文件命名一致性检查报告\n")
                f.write("="*60 + "\n\n")
                
                f.write(f"检查时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                
                f.write("发现的问题:\n")
                for issue in self.issues_found:
                    f.write(f"- {issue}\n")
                
                f.write("\n应用的修复:\n")
                for fix in self.fixes_applied:
                    f.write(f"- {fix}\n")
            
            print(f"\n📄 详细报告已保存至: {report_file}")
        except Exception as e:
            print(f"⚠️ 无法保存报告: {str(e)}")
    
    def run_full_check(self):
        """运行完整的一致性检查"""
        print("🚀 开始 WhatNote 文件命名一致性检查")
        print("📖 参考规范: WHATNOTE_NAMING_CONVENTIONS.md")
        print("-" * 60)
        
        # 执行各项检查
        self.check_app_state_consistency()
        self.check_file_storage_consistency()
        self.check_api_endpoints()
        self.check_pdf_text_extraction()
        
        # 生成报告
        self.generate_report()

def main():
    """主函数"""
    fixer = NamingConsistencyFixer()
    fixer.run_full_check()

if __name__ == "__main__":
    main() 