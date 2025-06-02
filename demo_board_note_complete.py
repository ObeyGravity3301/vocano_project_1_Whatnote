#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
展板笔记功能完整演示
"""

import requests
import time
import json

def demo_complete_board_note_functionality():
    """完整演示展板笔记功能"""
    base_url = "http://127.0.0.1:8000"
    board_id = "demo-board-001"
    
    print("🎯 展板笔记功能完整演示")
    print("=" * 60)
    
    # 1. 展示生成展板笔记
    print("\n📝 1. 展板笔记生成功能演示")
    print("-" * 40)
    
    # 模拟多个PDF的笔记内容
    sample_notes = """## PDF文件1: 机器学习基础.pdf (共45页)
<参考第1-40页>

# 机器学习概论

## 监督学习 (第3-8页)
- 分类算法：决策树、支持向量机、朴素贝叶斯 (第4页)
- 回归算法：线性回归、多项式回归 (第6页)
- 模型评估：交叉验证、ROC曲线 (第8页)

## 无监督学习 (第15-25页)  
- 聚类算法：K-means、层次聚类 (第16页)
- 降维技术：PCA、t-SNE (第20页)
- 关联规则：Apriori算法 (第23页)

---

## PDF文件2: 深度学习原理.pdf (共60页)
<参考第1-40页>

# 神经网络基础

## 前馈神经网络 (第5-12页)
- 感知器模型：单层与多层感知器 (第6页)
- 激活函数：ReLU、Sigmoid、Tanh (第8页)
- 反向传播算法：梯度计算与权重更新 (第10页)

## 卷积神经网络 (第18-30页)
- 卷积层：特征提取原理 (第19页)
- 池化层：降采样技术 (第22页)
- 经典架构：LeNet、AlexNet、ResNet (第25页)

## 循环神经网络 (第35-45页)
- LSTM：长短期记忆网络 (第37页)
- GRU：门控循环单元 (第40页)
- 序列到序列模型：编码器-解码器架构 (第43页)

---

## PDF文件3: 计算机视觉应用.pdf (共55页)
<参考第1-40页>

# 计算机视觉技术

## 图像预处理 (第2-10页)
- 图像增强：直方图均衡化、噪声去除 (第4页)
- 边缘检测：Sobel、Canny算子 (第7页)
- 特征提取：SIFT、HOG特征 (第9页)

## 目标检测 (第20-35页)
- 传统方法：滑动窗口、HOG+SVM (第22页)
- 深度学习方法：R-CNN、YOLO、SSD (第28页)
- 评估指标：mAP、IoU (第33页)"""

    try:
        # 提交展板笔记生成任务
        print("   📤 提交生成任务...")
        submit_data = {
            "board_id": board_id,
            "task_type": "generate_board_note",
            "task_info": {
                "notes_content": sample_notes
            }
        }
        
        response = requests.post(
            f"{base_url}/api/expert/dynamic/submit",
            json=submit_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            task_id = result.get('task_id')
            print(f"   ✅ 任务提交成功: {task_id}")
            
            # 等待任务完成
            print("   ⏳ 等待任务完成...")
            max_wait = 30  # 最多等待30次，每次2秒
            for i in range(max_wait):
                time.sleep(2)
                check_response = requests.get(
                    f"{base_url}/api/expert/dynamic/result/{task_id}",
                    timeout=10
                )
                
                if check_response.status_code == 200:
                    task_result = check_response.json()
                    if task_result.get('status') == 'completed':
                        print("   🎉 生成完成！")
                        content = task_result.get('result', '')
                        print(f"   📋 生成的展板笔记长度: {len(content)} 字符")
                        print(f"   📝 内容预览:\n{content[:500]}...")
                        generated_note = content
                        break
                    elif task_result.get('status') == 'failed':
                        print("   ❌ 生成失败")
                        return
                
                if i == max_wait - 1:
                    print("   ⏰ 等待超时")
                    return
        else:
            print(f"   ❌ 提交失败: {response.status_code}")
            return
            
    except Exception as e:
        print(f"   ❌ 生成异常: {e}")
        return

    # 2. 展示改进展板笔记
    print("\n✨ 2. 展板笔记改进功能演示")
    print("-" * 40)
    
    try:
        improve_prompt = "请为笔记添加学习路径建议和实践项目推荐，使内容更适合初学者"
        
        print(f"   📝 改进提示: {improve_prompt}")
        print("   📤 提交改进任务...")
        
        improve_data = {
            "board_id": board_id,
            "task_type": "improve_board_note",
            "task_info": {
                "content": generated_note,
                "improve_prompt": improve_prompt
            }
        }
        
        response = requests.post(
            f"{base_url}/api/expert/dynamic/submit",
            json=improve_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            task_id = result.get('task_id')
            print(f"   ✅ 改进任务提交成功: {task_id}")
            
            # 等待改进完成
            print("   ⏳ 等待改进完成...")
            for i in range(25):  # 改进通常更快
                time.sleep(2)
                check_response = requests.get(
                    f"{base_url}/api/expert/dynamic/result/{task_id}",
                    timeout=10
                )
                
                if check_response.status_code == 200:
                    task_result = check_response.json()
                    if task_result.get('status') == 'completed':
                        print("   🎉 改进完成！")
                        improved_content = task_result.get('result', '')
                        print(f"   📋 改进后笔记长度: {len(improved_content)} 字符")
                        print(f"   📝 改进内容预览:\n{improved_content[:500]}...")
                        break
                    elif task_result.get('status') == 'failed':
                        print("   ❌ 改进失败")
                        break
                
                if i == 24:
                    print("   ⏰ 改进等待超时")
        else:
            print(f"   ❌ 改进提交失败: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ 改进异常: {e}")

    # 3. 展示并发状态监控
    print("\n📊 3. 并发状态监控演示")
    print("-" * 40)
    
    try:
        response = requests.get(
            f"{base_url}/api/expert/dynamic/concurrent-status/{board_id}",
            timeout=5
        )
        
        if response.status_code == 200:
            status = response.json()
            concurrent_info = status.get('concurrent_status', {})
            print("   ✅ 并发状态查询成功:")
            print(f"   🔄 活跃任务: {concurrent_info.get('active_tasks', 0)}")
            print(f"   ⚡ 最大并发: {concurrent_info.get('max_concurrent_tasks', 3)}")
            print(f"   ✅ 已完成任务: {concurrent_info.get('completed_tasks', 0)}")
            print(f"   ❌ 失败任务: {concurrent_info.get('failed_tasks', 0)}")
            print(f"   📋 总任务数: {concurrent_info.get('total_tasks', 0)}")
        else:
            print(f"   ❌ 状态查询失败: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ 状态查询异常: {e}")

    print("\n" + "=" * 60)
    print("🎉 展板笔记功能演示完成！")
    print("\n📋 功能总结:")
    print("   ✅ 展板笔记生成 - 根据展板内所有PDF笔记综合生成")
    print("   ✅ 展板笔记改进 - 根据用户提示优化和完善笔记")
    print("   ✅ 并发任务管理 - 支持多任务并发处理（最大3个）")
    print("   ✅ 任务状态监控 - 实时查询任务执行状态和结果")
    print("   ✅ 异步处理架构 - 非阻塞任务提交和轮询获取结果")
    
    print("\n🔧 前端集成说明:")
    print("   📱 右键菜单 - '展板笔记'选项")
    print("   🎨 灰色框显示 - 独立于PDF文件的展板级笔记")
    print("   🔘 修改按钮 - 支持手动编辑展板笔记")
    print("   ⚙️ 编辑模式 - 切换编辑和预览模式")
    print("   🔄 生成按钮 - 一键生成/重新生成展板总结")
    print("   ✨ AI改进 - 根据提示智能优化笔记内容")

if __name__ == '__main__':
    demo_complete_board_note_functionality() 