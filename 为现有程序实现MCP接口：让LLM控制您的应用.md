# 为现有程序实现MCP接口：让LLM控制您的应用

## 1. MCP接口设计原则与实现方法

### 1.1 什么是MCP接口

MCP接口是一种允许大语言模型（LLM）通过结构化指令控制应用程序功能的接口设计模式。它使LLM能够：

- 了解应用程序的可用功能
- 发出结构化指令调用这些功能
- 接收执行结果并据此调整后续行为

MCP接口的核心价值在于将LLM的自然语言理解能力与应用程序的功能执行能力无缝连接，使LLM成为应用程序的"智能控制器"。

### 1.2 MCP接口的核心组件

一个完整的MCP接口包含以下核心组件：

1. **能力注册表**：记录应用程序所有可被LLM调用的功能
2. **指令解析器**：将LLM生成的结构化指令转换为实际函数调用
3. **执行引擎**：执行解析后的指令并捕获结果
4. **结果反馈机制**：将执行结果返回给LLM
5. **上下文管理器**：维护LLM与应用程序之间的交互上下文

### 1.3 设计原则

设计有效的MCP接口应遵循以下原则：

1. **明确性**：每个功能的描述、参数和返回值都应清晰明确
2. **一致性**：所有功能应遵循统一的调用模式和错误处理机制
3. **可发现性**：LLM应能轻松了解所有可用功能及其用法
4. **安全性**：实现适当的权限控制，防止危险操作
5. **可扩展性**：设计应支持轻松添加新功能
6. **容错性**：能够优雅处理错误和异常情况

## 2. 实现MCP接口的步骤

### 2.1 步骤一：功能梳理与能力注册

首先，梳理应用程序中可以暴露给LLM的功能，并创建能力注册表：

```python
class Capability:
    def __init__(self, name, description, parameters, return_description):
        self.name = name  # 功能名称
        self.description = description  # 功能描述
        self.parameters = parameters  # 参数说明
        self.return_description = return_description  # 返回值说明

class CapabilityRegistry:
    def __init__(self):
        self.capabilities = {}
    
    def register(self, capability):
        """注册一个新功能"""
        self.capabilities[capability.name] = capability
    
    def get_capability(self, name):
        """获取特定功能"""
        return self.capabilities.get(name)
    
    def list_capabilities(self):
        """列出所有可用功能"""
        return list(self.capabilities.values())
    
    def get_capabilities_description(self):
        """获取所有功能的描述，用于LLM提示"""
        descriptions = []
        for name, cap in self.capabilities.items():
            param_desc = ", ".join([f"{p_name}: {p_desc}" for p_name, p_desc in cap.parameters.items()])
            descriptions.append(f"功能: {name}\n描述: {cap.description}\n参数: {param_desc}\n返回: {cap.return_description}\n")
        return "\n".join(descriptions)
```

### 2.2 步骤二：实现指令解析器

创建一个解析器，将LLM生成的结构化指令转换为实际函数调用：

```python
import json
import re

class CommandParser:
    def __init__(self, registry):
        self.registry = registry
    
    def parse_command(self, text):
        """从LLM输出文本中解析命令"""
        # 查找JSON格式的命令块
        command_pattern = r'```json\s*(.*?)\s*```'
        match = re.search(command_pattern, text, re.DOTALL)
        
        if not match:
            # 尝试查找没有markdown格式的JSON
            command_pattern = r'{[\s\S]*?}'
            match = re.search(command_pattern, text)
            if not match:
                return None
        
        try:
            command_json = match.group(1) if '```' in text else match.group(0)
            command = json.loads(command_json)
            
            # 验证命令格式
            if 'action' not in command or 'parameters' not in command:
                return None
            
            # 检查是否是已注册的功能
            capability = self.registry.get_capability(command['action'])
            if not capability:
                return None
            
            return command
        except json.JSONDecodeError:
            return None
        except Exception as e:
            print(f"解析命令时出错: {str(e)}")
            return None
```

### 2.3 步骤三：实现执行引擎

创建执行引擎，负责调用实际功能并捕获结果：

```python
class ExecutionEngine:
    def __init__(self, app_instance):
        self.app = app_instance  # 应用程序实例
        self.function_map = {}  # 功能名称到实际函数的映射
    
    def register_function(self, capability_name, function):
        """注册功能对应的实际函数"""
        self.function_map[capability_name] = function
    
    def execute(self, command):
        """执行命令并返回结果"""
        try:
            action = command['action']
            parameters = command['parameters']
            
            # 获取对应的函数
            if action not in self.function_map:
                return {
                    "success": False,
                    "error": f"未找到功能: {action}"
                }
            
            function = self.function_map[action]
            
            # 执行函数
            result = function(**parameters)
            
            return {
                "success": True,
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
```

### 2.4 步骤四：实现上下文管理器

创建上下文管理器，维护LLM与应用程序之间的交互上下文：

```python
class ContextManager:
    def __init__(self, max_history=10):
        self.max_history = max_history
        self.command_history = []
        self.result_history = []
        self.app_state = {}
    
    def add_interaction(self, command, result):
        """添加一次交互记录"""
        self.command_history.append(command)
        self.result_history.append(result)
        
        # 保持历史记录在限定范围内
        if len(self.command_history) > self.max_history:
            self.command_history = self.command_history[-self.max_history:]
            self.result_history = self.result_history[-self.max_history:]
    
    def update_app_state(self, state_update):
        """更新应用状态"""
        self.app_state.update(state_update)
    
    def get_context_for_llm(self):
        """获取用于LLM的上下文信息"""
        context = {
            "command_history": self.command_history,
            "result_history": self.result_history,
            "current_state": self.app_state
        }
        return context
```

### 2.5 步骤五：集成MCP控制器

最后，创建MCP控制器，将所有组件集成在一起：

```python
class MCPController:
    def __init__(self, app_instance, llm_client):
        self.app = app_instance
        self.llm_client = llm_client
        self.registry = CapabilityRegistry()
        self.parser = CommandParser(self.registry)
        self.executor = ExecutionEngine(app_instance)
        self.context_manager = ContextManager()
        
        # 初始化能力注册表
        self._initialize_capabilities()
    
    def _initialize_capabilities(self):
        """初始化并注册应用程序的所有功能"""
        # 这里根据实际应用程序注册功能
        # 示例:
        self._register_file_operations()
        self._register_ui_operations()
        self._register_data_operations()
    
    def _register_file_operations(self):
        # 示例：注册文件操作相关功能
        open_file_capability = Capability(
            name="open_file",
            description="打开指定路径的文件",
            parameters={"file_path": "文件的完整路径"},
            return_description="成功返回文件内容，失败返回错误信息"
        )
        self.registry.register(open_file_capability)
        self.executor.register_function("open_file", self.app.open_file)
        
        # 注册更多文件操作...
    
    def process_user_input(self, user_input):
        """处理用户输入，生成LLM响应和执行命令"""
        # 构建提示词
        capabilities_desc = self.registry.get_capabilities_description()
        context = self.context_manager.get_context_for_llm()
        
        prompt = f"""
        用户输入: {user_input}
        
        当前应用状态:
        {json.dumps(context['current_state'], indent=2)}
        
        可用功能:
        {capabilities_desc}
        
        如果需要执行操作，请使用以下JSON格式:
        ```json
        {{
            "action": "功能名称",
            "parameters": {{
                "参数1": "值1",
                "参数2": "值2"
            }}
        }}
        ```
        
        请根据用户需求，提供帮助或执行适当的操作。
        """
        
        # 调用LLM获取响应
        llm_response = self.llm_client.generate(prompt)
        
        # 解析可能的命令
        command = self.parser.parse_command(llm_response)
        
        if command:
            # 执行命令
            result = self.executor.execute(command)
            
            # 更新上下文
            self.context_manager.add_interaction(command, result)
            
            # 如果执行成功，更新应用状态
            if result["success"]:
                # 这里需要根据具体命令更新应用状态
                self._update_app_state_after_command(command, result)
            
            return {
                "llm_response": llm_response,
                "executed_command": command,
                "command_result": result
            }
        else:
            # 没有命令，只返回LLM响应
            return {
                "llm_response": llm_response,
                "executed_command": None,
                "command_result": None
            }
    
    def _update_app_state_after_command(self, command, result):
        """根据命令执行结果更新应用状态"""
        # 这里需要根据具体应用逻辑实现
        # 示例:
        if command["action"] == "open_file":
            self.context_manager.update_app_state({
                "current_file": command["parameters"]["file_path"],
                "file_content_preview": result["result"][:100] + "..." if len(result["result"]) > 100 else result["result"]
            })
```

## 3. 实际应用示例：为笔记应用实现MCP接口

下面我们以一个笔记应用为例，展示如何实现MCP接口：

### 3.1 定义笔记应用的核心功能

```python
class NoteApp:
    def __init__(self):
        self.notes = {}
        self.current_note_id = None
        self.tags = set()
    
    def create_note(self, title, content=""):
        """创建新笔记"""
        note_id = str(uuid.uuid4())
        self.notes[note_id] = {
            "id": note_id,
            "title": title,
            "content": content,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "tags": []
        }
        self.current_note_id = note_id
        return note_id
    
    def get_note(self, note_id):
        """获取笔记内容"""
        return self.notes.get(note_id)
    
    def update_note(self, note_id, title=None, content=None, tags=None):
        """更新笔记"""
        if note_id not in self.notes:
            return False
        
        if title:
            self.notes[note_id]["title"] = title
        
        if content:
            self.notes[note_id]["content"] = content
        
        if tags:
            self.notes[note_id]["tags"] = tags
            for tag in tags:
                self.tags.add(tag)
        
        self.notes[note_id]["updated_at"] = datetime.now().isoformat()
        return True
    
    def delete_note(self, note_id):
        """删除笔记"""
        if note_id in self.notes:
            del self.notes[note_id]
            if self.current_note_id == note_id:
                self.current_note_id = None
            return True
        return False
    
    def list_notes(self, tag=None):
        """列出所有笔记或按标签筛选"""
        if tag:
            return [note for note in self.notes.values() if tag in note["tags"]]
        return list(self.notes.values())
    
    def search_notes(self, query):
        """搜索笔记"""
        results = []
        for note in self.notes.values():
            if (query.lower() in note["title"].lower() or 
                query.lower() in note["content"].lower()):
                results.append(note)
        return results
```

### 3.2 为笔记应用实现MCP接口

```python
def setup_note_app_mcp():
    # 创建笔记应用实例
    note_app = NoteApp()
    
    # 创建LLM客户端（这里使用一个模拟客户端）
    llm_client = MockLLMClient()
    
    # 创建MCP控制器
    mcp = MCPController(note_app, llm_client)
    
    # 注册笔记应用的功能
    
    # 1. 创建笔记
    create_note_capability = Capability(
        name="create_note",
        description="创建一个新的笔记",
        parameters={
            "title": "笔记标题",
            "content": "笔记内容（可选）"
        },
        return_description="返回新创建的笔记ID"
    )
    mcp.registry.register(create_note_capability)
    mcp.executor.register_function("create_note", note_app.create_note)
    
    # 2. 获取笔记
    get_note_capability = Capability(
        name="get_note",
        description="获取指定ID的笔记内容",
        parameters={
            "note_id": "笔记ID"
        },
        return_description="返回笔记的完整信息"
    )
    mcp.registry.register(get_note_capability)
    mcp.executor.register_function("get_note", note_app.get_note)
    
    # 3. 更新笔记
    update_note_capability = Capability(
        name="update_note",
        description="更新指定ID的笔记内容",
        parameters={
            "note_id": "笔记ID",
            "title": "新标题（可选）",
            "content": "新内容（可选）",
            "tags": "标签列表（可选）"
        },
        return_description="更新成功返回True，失败返回False"
    )
    mcp.registry.register(update_note_capability)
    mcp.executor.register_function("update_note", note_app.update_note)
    
    # 4. 删除笔记
    delete_note_capability = Capability(
        name="delete_note",
        description="删除指定ID的笔记",
        parameters={
            "note_id": "笔记ID"
        },
        return_description="删除成功返回True，失败返回False"
    )
    mcp.registry.register(delete_note_capability)
    mcp.executor.register_function("delete_note", note_app.delete_note)
    
    # 5. 列出笔记
    list_notes_capability = Capability(
        name="list_notes",
        description="列出所有笔记或按标签筛选",
        parameters={
            "tag": "标签（可选，如果提供则筛选包含该标签的笔记）"
        },
        return_description="返回笔记列表"
    )
    mcp.registry.register(list_notes_capability)
    mcp.executor.register_function("list_notes", note_app.list_notes)
    
    # 6. 搜索笔记
    search_notes_capability = Capability(
        name="search_notes",
        description="搜索笔记内容",
        parameters={
            "query": "搜索关键词"
        },
        return_description="返回匹配的笔记列表"
    )
    mcp.registry.register(search_notes_capability)
    mcp.executor.register_function("search_notes", note_app.search_notes)
    
    return mcp
```

### 3.3 使用示例

```python
# 创建MCP控制器
note_app_mcp = setup_note_app_mcp()

# 处理用户请求
user_input = "我想创建一个关于Python编程的笔记，内容是Python是一种高级编程语言"
response = note_app_mcp.process_user_input(user_input)

# 输出结果
print("LLM响应:", response["llm_response"])
if response["executed_command"]:
    print("执行的命令:", response["executed_command"])
    print("命令结果:", response["command_result"])

# 再次处理用户请求
user_input = "列出我所有的笔记"
response = note_app_mcp.process_user_input(user_input)

# 输出结果
print("LLM响应:", response["llm_response"])
if response["executed_command"]:
    print("执行的命令:", response["executed_command"])
    print("命令结果:", response["command_result"])
```

## 4. 高级功能：结果感知与状态更新

### 4.1 实现结果感知机制

为了让LLM能够感知命令执行结果，我们需要在每次调用LLM时提供上下文信息：

```python
def process_user_input_with_feedback(self, user_input):
    """处理用户输入，并提供上一次操作的反馈"""
    # 获取上下文
    context = self.context_manager.get_context_for_llm()
    
    # 构建提示词，包含上一次操作的结果
    last_command = None
    last_result = None
    
    if context['command_history'] and context['result_history']:
        last_command = context['command_history'][-1]
        last_result = context['result_history'][-1]
    
    prompt = f"""
    用户输入: {user_input}
    
    当前应用状态:
    {json.dumps(context['current_state'], indent=2)}
    
    """
    
    if last_command and last_result:
        prompt += f"""
        上一次操作:
        命令: {json.dumps(last_command, indent=2)}
        结果: {json.dumps(last_result, indent=2)}
        
        """
    
    prompt += f"""
    可用功能:
    {self.registry.get_capabilities_description()}
    
    如果需要执行操作，请使用以下JSON格式:
    ```json
    {{
        "action": "功能名称",
        "parameters": {{
            "参数1": "值1",
            "参数2": "值2"
        }}
    }}
    ```
    
    请根据用户需求和当前应用状态，提供帮助或执行适当的操作。
    """
    
    # 调用LLM获取响应
    llm_response = self.llm_client.generate(prompt)
    
    # 解析可能的命令
    command = self.parser.parse_command(llm_response)
    
    if command:
        # 执行命令
        result = self.executor.execute(command)
        
        # 更新上下文
        self.context_manager.add_interaction(command, result)
        
        # 如果执行成功，更新应用状态
        if result["success"]:
            self._update_app_state_after_command(command, result)
        
        return {
            "llm_response": llm_response,
            "executed_command": command,
            "command_result": result
        }
    else:
        # 没有命令，只返回LLM响应
        return {
            "llm_response": llm_response,
            "executed_command": None,
            "command_result": None
        }
```

### 4.2 实现状态更新机制

为了让LLM了解应用程序的当前状态，我们需要在每次操作后更新状态：

```python
def _update_app_state_after_command(self, command, result):
    """根据命令执行结果更新应用状态"""
    action = command["action"]
    
    # 笔记应用的状态更新逻辑
    if action == "create_note":
        note_id = result["result"]
        note = self.app.get_note(note_id)
        self.context_manager.update_app_state({
            "current_note_id": note_id,
            "current_note": note
        })
    
    elif action == "get_note":
        note = result["result"]
        if note:
            self.context_manager.update_app_state({
                "current_note_id": note["id"],
                "current_note": note
            })
    
    elif action == "update_note":
        if result["success"]:
            note_id = command["parameters"]["note_id"]
            note = self.app.get_note(note_id)
            self.context_manager.update_app_state({
                "current_note_id": note_id,
                "current_note": note
            })
    
    elif action == "delete_note":
        if result["success"]:
            self.context_manager.update_app_state({
                "current_note_id": self.app.current_note_id,
                "current_note": self.app.get_note(self.app.current_note_id) if self.app.current_note_id else None
            })
    
    elif action == "list_notes" or action == "search_notes":
        notes = result["result"]
        self.context_manager.update_app_state({
            "last_query_results": notes,
            "result_count": len(notes)
        })
    
    # 更新通用状态信息
    self.context_manager.update_app_state({
        "total_notes": len(self.app.notes),
        "available_tags": list(self.app.tags),
        "last_action": action,
        "last_action_success": result["success"]
    })
```

## 5. 最佳实践与注意事项

### 5.1 提示词设计

为了让LLM更好地理解和使用MCP接口，提示词设计至关重要：

1. **清晰描述功能**：每个功能的描述应该清晰、简洁，包含足够的细节
2. **提供使用示例**：为每个功能提供使用示例，帮助LLM理解如何正确调用
3. **明确参数要求**：详细说明每个参数的类型、格式和约束条件
4. **解释返回值**：清楚地描述每个功能的返回值格式和含义

### 5.2 错误处理

健壮的错误处理机制对MCP接口至关重要：

1. **参数验证**：在执行功能前验证参数的有效性
2. **异常捕获**：捕获并处理执行过程中的所有异常
3. **友好错误消息**：提供详细的错误信息，帮助LLM理解问题所在
4. **恢复机制**：在出错后提供恢复建议或自动恢复

### 5.3 安全考虑

实现MCP接口时需要考虑安全问题：

1. **权限控制**：限制LLM可以执行的操作范围
2. **输入验证**：验证所有输入参数，防止注入攻击
3. **资源限制**：限制资源使用，防止DoS攻击
4. **敏感信息保护**：避免暴露敏感信息

### 5.4 性能优化

为了提高MCP接口的性能：

1. **缓存机制**：缓存频繁使用的数据和结果
2. **批处理**：将多个相关操作合并为一个批处理
3. **异步执行**：对于耗时操作，使用异步执行
4. **上下文压缩**：压缩上下文信息，减少LLM输入长度

## 6. 进阶：多步骤任务规划与执行

对于复杂任务，LLM可能需要执行多个步骤。我们可以实现任务规划和执行机制：

```python
class TaskPlanner:
    def __init__(self, mcp_controller):
        self.mcp = mcp_controller
    
    def plan_and_execute(self, user_input):
        """规划并执行多步骤任务"""
        # 1. 生成任务计划
        plan = self._generate_plan(user_input)
        
        # 2. 执行计划中的每个步骤
        results = []
        for step in plan:
            step_result = self._execute_step(step)
            results.append(step_result)
            
            # 如果某一步失败，停止执行
            if not step_result["success"]:
                break
        
        # 3. 生成最终报告
        final_report = self._generate_report(plan, results)
        
        return {
            "plan": plan,
            "results": results,
            "final_report": final_report
        }
    
    def _generate_plan(self, user_input):
        """生成任务计划"""
        # 构建提示词
        capabilities_desc = self.mcp.registry.get_capabilities_description()
        context = self.mcp.context_manager.get_context_for_llm()
        
        prompt = f"""
        用户请求: {user_input}
        
        当前应用状态:
        {json.dumps(context['current_state'], indent=2)}
        
        可用功能:
        {capabilities_desc}
        
        请为完成用户请求制定一个分步骤的执行计划。每个步骤应包含以下信息:
        1. 步骤描述
        2. 要执行的功能
        3. 功能参数
        
        返回JSON格式的计划:
        ```json
        [
            {{
                "description": "步骤1描述",
                "action": "功能名称",
                "parameters": {{
                    "参数1": "值1",
                    "参数2": "值2"
                }}
            }},
            {{
                "description": "步骤2描述",
                "action": "功能名称",
                "parameters": {{
                    "参数1": "值1",
                    "参数2": "值2"
                }}
            }}
        ]
        ```
        """
        
        # 调用LLM生成计划
        llm_response = self.mcp.llm_client.generate(prompt)
        
        # 解析计划
        plan_pattern = r'```json\s*(.*?)\s*```'
        match = re.search(plan_pattern, llm_response, re.DOTALL)
        
        if not match:
            # 尝试查找没有markdown格式的JSON
            plan_pattern = r'\[\s*\{[\s\S]*?\}\s*\]'
            match = re.search(plan_pattern, llm_response)
            if not match:
                return []
        
        try:
            plan_json = match.group(1) if '```' in llm_response else match.group(0)
            plan = json.loads(plan_json)
            return plan
        except:
            return []
    
    def _execute_step(self, step):
        """执行单个步骤"""
        try:
            action = step["action"]
            parameters = step["parameters"]
            
            # 构建命令
            command = {
                "action": action,
                "parameters": parameters
            }
            
            # 执行命令
            result = self.mcp.executor.execute(command)
            
            # 更新上下文
            self.mcp.context_manager.add_interaction(command, result)
            
            # 如果执行成功，更新应用状态
            if result["success"]:
                self.mcp._update_app_state_after_command(command, result)
            
            return {
                "step": step,
                "success": result["success"],
                "result": result["result"] if result["success"] else result["error"]
            }
        except Exception as e:
            return {
                "step": step,
                "success": False,
                "result": str(e)
            }
    
    def _generate_report(self, plan, results):
        """生成执行报告"""
        # 构建提示词
        prompt = f"""
        任务执行结果:
        
        计划:
        {json.dumps(plan, indent=2)}
        
        执行结果:
        {json.dumps(results, indent=2)}
        
        请根据计划和执行结果，生成一份简洁的执行报告，包括:
        1. 总体执行情况
        2. 成功完成的步骤
        3. 失败的步骤及原因
        4. 最终结果摘要
        """
        
        # 调用LLM生成报告
        report = self.mcp.llm_client.generate(prompt)
        
        return report
```

## 7. 实际应用：为WhatNote实现MCP接口

以WhatNote为例，我们可以实现以下MCP接口：

### 7.1 WhatNote的核心功能

1. **文件操作**
   - 上传PDF
   - 获取PDF页面
   - 获取页面图像

2. **笔记操作**
   - 生成页面注释
   - 生成整本笔记
   - 改进笔记
   - 问答

3. **展板操作**
   - 创建展板
   - 获取展板内容
   - 更新展板

4. **课程操作**
   - 创建课程
   - 获取课程内容
   - 更新课程

### 7.2 WhatNote MCP接口实现示例

```python
def setup_whatnote_mcp(app_instance):
    """为WhatNote设置MCP接口"""
    # 创建LLM客户端
    llm_client = create_llm_client()
    
    # 创建MCP控制器
    mcp = MCPController(app_instance, llm_client)
    
    # 注册文件操作
    _register_file_operations(mcp, app_instance)
    
    # 注册笔记操作
    _register_note_operations(mcp, app_instance)
    
    # 注册展板操作
    _register_board_operations(mcp, app_instance)
    
    # 注册课程操作
    _register_course_operations(mcp, app_instance)
    
    return mcp

def _register_file_operations(mcp, app):
    """注册文件操作相关功能"""
    # 上传PDF
    upload_pdf_capability = Capability(
        name="upload_pdf",
        description="上传PDF文件",
        parameters={
            "file_path": "本地文件路径"
        },
        return_description="上传成功返回文件信息，失败返回错误信息"
    )
    mcp.registry.register(upload_pdf_capability)
    mcp.executor.register_function("upload_pdf", app.upload_pdf)
    
    # 获取PDF页面
    get_pdf_page_capability = Capability(
        name="get_pdf_page",
        description="获取PDF特定页面的内容",
        parameters={
            "filename": "PDF文件名",
            "page_number": "页码（从1开始）"
        },
        return_description="返回页面文本内容"
    )
    mcp.registry.register(get_pdf_page_capability)
    mcp.executor.register_function("get_pdf_page", app.get_pdf_page)
    
    # 获取页面图像
    get_page_image_capability = Capability(
        name="get_page_image",
        description="获取PDF特定页面的图像",
        parameters={
            "filename": "PDF文件名",
            "page_number": "页码（从1开始）"
        },
        return_description="返回图像路径"
    )
    mcp.registry.register(get_page_image_capability)
    mcp.executor.register_function("get_page_image", app.get_page_image)

def _register_note_operations(mcp, app):
    """注册笔记操作相关功能"""
    # 生成页面注释
    generate_annotation_capability = Capability(
        name="generate_annotation",
        description="为PDF页面生成注释",
        parameters={
            "filename": "PDF文件名",
            "page_number": "页码（从1开始）",
            "force_vision": "是否强制使用图像识别（可选，默认False）",
            "board_id": "展板ID（可选）"
        },
        return_description="返回生成的注释内容"
    )
    mcp.registry.register(generate_annotation_capability)
    mcp.executor.register_function("generate_annotation", app.generate_annotation)
    
    # 生成整本笔记
    generate_pdf_note_capability = Capability(
        name="generate_pdf_note",
        description="为整本PDF生成笔记",
        parameters={
            "filename": "PDF文件名"
        },
        return_description="返回生成的笔记内容"
    )
    mcp.registry.register(generate_pdf_note_capability)
    mcp.executor.register_function("generate_pdf_note", app.generate_pdf_note)
    
    # 改进笔记
    improve_note_capability = Capability(
        name="improve_note",
        description="改进现有笔记",
        parameters={
            "filename": "PDF文件名",
            "content": "当前笔记内容",
            "improve_prompt": "改进提示"
        },
        return_description="返回改进后的笔记内容"
    )
    mcp.registry.register(improve_note_capability)
    mcp.executor.register_function("improve_note", app.improve_note)
    
    # 问答
    ask_question_capability = Capability(
        name="ask_question",
        description="针对PDF内容提问",
        parameters={
            "filename": "PDF文件名",
            "question": "问题内容"
        },
        return_description="返回回答内容"
    )
    mcp.registry.register(ask_question_capability)
    mcp.executor.register_function("ask_question", app.ask_question)

def _register_board_operations(mcp, app):
    """注册展板操作相关功能"""
    # 创建展板
    create_board_capability = Capability(
        name="create_board",
        description="创建新展板",
        parameters={
            "name": "展板名称",
            "course_id": "所属课程ID（可选）",
            "description": "展板描述（可选）"
        },
        return_description="返回新创建的展板ID"
    )
    mcp.registry.register(create_board_capability)
    mcp.executor.register_function("create_board", app.create_board)
    
    # 获取展板内容
    get_board_capability = Capability(
        name="get_board",
        description="获取展板内容",
        parameters={
            "board_id": "展板ID"
        },
        return_description="返回展板完整信息"
    )
    mcp.registry.register(get_board_capability)
    mcp.executor.register_function("get_board", app.get_board)
    
    # 更新展板
    update_board_capability = Capability(
        name="update_board",
        description="更新展板内容",
        parameters={
            "board_id": "展板ID",
            "name": "新名称（可选）",
            "description": "新描述（可选）",
            "content": "新内容（可选）"
        },
        return_description="更新成功返回True，失败返回False"
    )
    mcp.registry.register(update_board_capability)
    mcp.executor.register_function("update_board", app.update_board)

def _register_course_operations(mcp, app):
    """注册课程操作相关功能"""
    # 创建课程
    create_course_capability = Capability(
        name="create_course",
        description="创建新课程",
        parameters={
            "name": "课程名称",
            "description": "课程描述（可选）"
        },
        return_description="返回新创建的课程ID"
    )
    mcp.registry.register(create_course_capability)
    mcp.executor.register_function("create_course", app.create_course)
    
    # 获取课程内容
    get_course_capability = Capability(
        name="get_course",
        description="获取课程内容",
        parameters={
            "course_id": "课程ID"
        },
        return_description="返回课程完整信息"
    )
    mcp.registry.register(get_course_capability)
    mcp.executor.register_function("get_course", app.get_course)
    
    # 更新课程
    update_course_capability = Capability(
        name="update_course",
        description="更新课程内容",
        parameters={
            "course_id": "课程ID",
            "name": "新名称（可选）",
            "description": "新描述（可选）"
        },
        return_description="更新成功返回True，失败返回False"
    )
    mcp.registry.register(update_course_capability)
    mcp.executor.register_function("update_course", app.update_course)
```

### 7.3 使用示例

```python
# 创建WhatNote应用实例
whatnote_app = WhatNoteApp()

# 设置MCP接口
whatnote_mcp = setup_whatnote_mcp(whatnote_app)

# 处理用户请求
user_input = "我想上传一个名为'高等数学.pdf'的文件，然后为第一页生成注释"
response = whatnote_mcp.process_user_input(user_input)

# 输出结果
print("LLM响应:", response["llm_response"])
if response["executed_command"]:
    print("执行的命令:", response["executed_command"])
    print("命令结果:", response["command_result"])

# 使用任务规划器处理复杂请求
task_planner = TaskPlanner(whatnote_mcp)
complex_request = "创建一个名为'数学分析'的课程，然后在这个课程下创建一个名为'极限理论'的展板，最后上传'极限.pdf'并生成整本笔记"
plan_result = task_planner.plan_and_execute(complex_request)

# 输出计划和结果
print("任务计划:", plan_result["plan"])
print("执行结果:", plan_result["results"])
print("最终报告:", plan_result["final_report"])
```

## 8. 总结

通过实现MCP接口，我们可以让LLM控制现有程序的各种功能，并感知执行结果。关键步骤包括：

1. **功能梳理与能力注册**：明确定义应用程序可被LLM调用的功能
2. **指令解析与执行**：解析LLM生成的结构化指令并执行相应功能
3. **结果反馈与状态更新**：将执行结果反馈给LLM，并更新应用状态
4. **上下文管理**：维护LLM与应用程序之间的交互上下文
5. **任务规划与执行**：支持复杂任务的分步骤规划和执行

通过这些步骤，我们可以将LLM的自然语言理解能力与应用程序的功能执行能力无缝连接，打造更智能、更自然的用户体验。
