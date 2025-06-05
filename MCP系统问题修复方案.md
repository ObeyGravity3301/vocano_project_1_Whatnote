# MCP系统问题修复方案

## 问题总结
1. 注释生成返回"任务已完成，结果已在提交时返回" - 这是占位符文本
2. PDF笔记生成一直显示"生成中"，task_id为undefined
3. 专家LLM状态栏显示0/undefined并发

## 根本原因分析

### 1. 注释生成问题
- 前端api.js第310行期望返回`resultData.result`字段
- 但后端simple_expert.py的`_generate_annotation_task`返回的是嵌套结构
- App.js第741行检查`result.annotation`或`result.note`字段

### 2. PDF笔记task_id为undefined
- `/api/expert/dynamic/generate-pdf-note`端点没有使用任务队列系统
- 直接调用了`process_query`并返回结果，没有返回task_id

### 3. 状态栏问题
- TaskStatusIndicator.js定期调用`/api/expert/dynamic/concurrent-status/{boardId}`
- 但该端点可能返回的数据格式不符合前端期望

## 修复方案

### 修复1: 更新simple_expert.py的任务结果格式
```python
# _generate_annotation_task方法
if response.status_code == 200:
    data = response.json()
    # 直接返回注释内容作为主结果
    return data.get("note", "")
```

### 修复2: generate-pdf-note使用任务队列
```python
@app.post('/api/expert/dynamic/generate-pdf-note')
async def submit_generate_pdf_note_task(request_data: dict = Body(...)):
    # 使用任务队列系统
    expert = simple_expert_manager.get_expert(board_id)
    task_id = expert.submit_task("generate_note", {
        "filename": filename
    })
    return {
        "status": "success",
        "board_id": board_id,
        "task_id": task_id,
        "message": "PDF笔记生成任务已提交"
    }
```

### 修复3: 统一任务结果返回格式
```python
# get_task_result方法
if result["status"] == "completed":
    task_data = result.get("result", {})
    # 对于字符串结果，直接放在result字段
    if isinstance(task_data, str):
        return {
            "status": "completed",
            "task_id": task_id,
            "result": task_data,
            "annotation": task_data,  # 兼容前端
            "note": task_data,        # 兼容前端
            ...
        }
```

### 修复4: 并发状态格式
确保`/api/expert/dynamic/concurrent-status/{board_id}`返回格式包含：
- active_tasks（数字）
- max_concurrent_tasks（数字，应为3）
- 其他必要字段

## 实施步骤
1. 修改simple_expert.py中的任务结果返回格式
2. 修改main.py中的generate-pdf-note端点
3. 统一get_task_result的返回格式
4. 测试确保前端能正确显示结果 