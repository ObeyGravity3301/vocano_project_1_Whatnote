# Function Calling与流式生成协同技术指南

## 1. Function Calling与流式生成的基本概念

### 1.1 Function Calling概述

Function Calling是一种允许大语言模型（LLM）调用预定义函数的技术，使模型能够执行特定操作并获取外部信息。这种技术的核心在于：

- 模型能够识别何时需要调用函数
- 模型能够生成符合函数参数要求的结构化输出
- 模型能够理解函数返回的结果并继续对话

### 1.2 流式生成概述

流式生成（Streaming Generation）是指LLM不等待完整响应生成完毕就开始向用户返回部分生成内容的技术。其特点包括：

- 实时性：用户可以立即看到模型开始生成的内容
- 渐进式：内容逐步呈现，而非一次性展示
- 交互性：在某些实现中，用户可以在生成过程中进行干预

### 1.3 两者结合的挑战

将Function Calling与流式生成结合面临以下挑战：

- 如何在流式生成过程中识别并执行函数调用
- 如何在函数执行期间暂停生成并在获得结果后恢复
- 如何在单次对话中支持多次函数调用
- 如何保持对话的连贯性和上下文一致性

## 2. 技术架构与实现原理

### 2.1 整体架构设计

实现Function Calling与流式生成协同的系统通常采用以下架构：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  用户界面层     │◄────┤  对话管理层     │◄────┤  LLM服务层      │
│                 │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │                 │              │
         └─────────────►│  函数执行层     │◄─────────────┘
                        │                 │
                        └─────────────────┘
```

- **用户界面层**：负责展示流式生成内容和用户交互
- **对话管理层**：协调整个对话流程，管理上下文和状态
- **LLM服务层**：处理模型调用和响应解析
- **函数执行层**：执行模型请求的函数并返回结果

### 2.2 流式生成中的函数调用识别

系统需要在流式生成过程中识别函数调用意图。主要有两种实现方式：

#### 2.2.1 标记检测方法

```python
def detect_function_call_in_stream(token_stream):
    """在token流中检测函数调用标记"""
    buffer = ""
    in_function_block = False
    
    for token in token_stream:
        buffer += token
        
        # 检测函数调用开始标记
        if "<function>" in buffer and not in_function_block:
            in_function_block = True
            buffer = buffer[buffer.find("<function>") + len("<function>"):]
        
        # 检测函数调用结束标记
        if in_function_block and "</function>" in buffer:
            function_call_json = buffer[:buffer.find("</function>")]
            try:
                function_call = json.loads(function_call_json)
                return function_call
            except json.JSONDecodeError:
                # 处理解析错误
                in_function_block = False
                buffer = buffer[buffer.find("</function>") + len("</function>"):]
    
    return None
```

#### 2.2.2 模型直接输出方法

一些高级模型可以直接输出结构化的函数调用：

```python
def stream_with_function_calls(prompt, functions):
    """使用支持函数调用的模型进行流式生成"""
    response_stream = llm_client.generate_stream(
        prompt=prompt,
        functions=functions,
        stream=True
    )
    
    for chunk in response_stream:
        if chunk.get("type") == "text":
            # 普通文本内容
            yield {"type": "text", "content": chunk["content"]}
        elif chunk.get("type") == "function_call":
            # 函数调用
            yield {"type": "function_call", "function": chunk["function"]}
```

### 2.3 生成暂停与恢复机制

实现生成暂停和恢复的核心机制：

#### 2.3.1 基于状态的暂停恢复

```python
class GenerationManager:
    def __init__(self, llm_client):
        self.llm_client = llm_client
        self.current_state = "idle"  # idle, generating, paused
        self.generation_id = None
        self.context = []
    
    def start_generation(self, prompt):
        """开始生成"""
        self.current_state = "generating"
        self.generation_id = str(uuid.uuid4())
        self.context = [{"role": "user", "content": prompt}]
        
        return self._generate()
    
    def pause_generation(self):
        """暂停生成"""
        if self.current_state == "generating":
            self.current_state = "paused"
            # 某些API支持暂停生成
            self.llm_client.pause_generation(self.generation_id)
    
    def resume_generation(self, function_result=None):
        """恢复生成"""
        if self.current_state == "paused":
            if function_result:
                # 将函数结果添加到上下文
                self.context.append({
                    "role": "function",
                    "name": function_result["name"],
                    "content": json.dumps(function_result["result"])
                })
            
            self.current_state = "generating"
            return self._generate()
    
    def _generate(self):
        """内部生成方法"""
        return self.llm_client.generate_stream(
            messages=self.context,
            generation_id=self.generation_id
        )
```

#### 2.3.2 基于会话的暂停恢复

```python
class ConversationManager:
    def __init__(self, llm_client):
        self.llm_client = llm_client
        self.conversation_id = None
        self.messages = []
    
    def process_user_input(self, user_input):
        """处理用户输入"""
        if not self.conversation_id:
            self.conversation_id = str(uuid.uuid4())
        
        # 添加用户消息
        self.messages.append({"role": "user", "content": user_input})
        
        # 开始流式生成
        return self._stream_response()
    
    def _stream_response(self):
        """流式生成响应"""
        response_stream = self.llm_client.generate_stream(
            messages=self.messages,
            conversation_id=self.conversation_id
        )
        
        assistant_message = {"role": "assistant", "content": ""}
        function_calls = []
        
        for chunk in response_stream:
            if chunk.get("type") == "text":
                assistant_message["content"] += chunk["content"]
                yield {"type": "text", "content": chunk["content"]}
            
            elif chunk.get("type") == "function_call":
                function_call = chunk["function"]
                function_calls.append(function_call)
                
                # 执行函数
                function_result = self._execute_function(function_call)
                
                # 添加函数调用和结果到消息历史
                self.messages.append({
                    "role": "assistant",
                    "function_call": function_call
                })
                self.messages.append({
                    "role": "function",
                    "name": function_call["name"],
                    "content": json.dumps(function_result)
                })
                
                yield {"type": "function_call", "function": function_call}
                yield {"type": "function_result", "result": function_result}
        
        # 添加完整的助手消息到历史
        if assistant_message["content"]:
            self.messages.append(assistant_message)
    
    def _execute_function(self, function_call):
        """执行函数调用"""
        # 实现函数执行逻辑
        name = function_call["name"]
        arguments = json.loads(function_call["arguments"])
        
        # 调用实际函数
        # ...
        
        return {"result": "function result"}
```

### 2.4 多轮函数调用管理

在单次对话中支持多次函数调用的实现：

```python
class MultiFunctionCallManager:
    def __init__(self, llm_client, function_registry):
        self.llm_client = llm_client
        self.function_registry = function_registry
        self.current_conversation = []
    
    def process_with_multiple_function_calls(self, user_input):
        """处理可能包含多次函数调用的用户输入"""
        self.current_conversation.append({"role": "user", "content": user_input})
        
        # 初始响应生成
        response_stream = self.llm_client.generate_stream(
            messages=self.current_conversation
        )
        
        assistant_response = ""
        function_calls_made = []
        
        for chunk in response_stream:
            if "function_call" in chunk:
                # 检测到函数调用
                function_call = chunk["function_call"]
                function_name = function_call["name"]
                function_args = json.loads(function_call["arguments"])
                
                # 记录函数调用
                function_calls_made.append(function_call)
                
                # 执行函数
                function_result = self._execute_function(function_name, function_args)
                
                # 将函数调用和结果添加到对话
                self.current_conversation.append({
                    "role": "assistant",
                    "content": None,
                    "function_call": function_call
                })
                self.current_conversation.append({
                    "role": "function",
                    "name": function_name,
                    "content": json.dumps(function_result)
                })
                
                # 继续生成，考虑函数结果
                continuation_stream = self.llm_client.generate_stream(
                    messages=self.current_conversation
                )
                
                # 处理继续生成的内容
                for cont_chunk in continuation_stream:
                    if "content" in cont_chunk:
                        assistant_response += cont_chunk["content"]
                        yield {"type": "text", "content": cont_chunk["content"]}
                    elif "function_call" in cont_chunk:
                        # 处理嵌套函数调用
                        # 递归处理...
                        pass
            
            elif "content" in chunk:
                assistant_response += chunk["content"]
                yield {"type": "text", "content": chunk["content"]}
        
        # 记录最终的助手响应
        if assistant_response:
            self.current_conversation.append({
                "role": "assistant",
                "content": assistant_response
            })
    
    def _execute_function(self, function_name, function_args):
        """执行函数并返回结果"""
        if function_name in self.function_registry:
            function = self.function_registry[function_name]
            try:
                result = function(**function_args)
                return {"status": "success", "result": result}
            except Exception as e:
                return {"status": "error", "error": str(e)}
        else:
            return {"status": "error", "error": f"Function {function_name} not found"}
```

## 3. 用户确认与交互设计

### 3.1 函数执行前的用户确认

在执行某些敏感操作前，可能需要用户确认：

```python
class UserConfirmationManager:
    def __init__(self, ui_interface):
        self.ui_interface = ui_interface
        self.pending_functions = []
    
    def request_confirmation(self, function_call):
        """请求用户确认函数执行"""
        function_name = function_call["name"]
        function_args = function_call["arguments"]
        
        # 构建用户友好的确认消息
        confirmation_message = f"模型想要执行函数 '{function_name}' 使用以下参数:\n{json.dumps(function_args, indent=2)}\n\n是否允许执行？"
        
        # 显示确认对话框并等待用户响应
        user_confirmed = self.ui_interface.show_confirmation_dialog(confirmation_message)
        
        return user_confirmed
    
    def add_pending_function(self, function_call):
        """添加待确认的函数调用"""
        self.pending_functions.append(function_call)
        
        # 通知UI显示待确认函数
        self.ui_interface.update_pending_functions(self.pending_functions)
    
    def get_confirmed_functions(self):
        """获取用户已确认的函数调用"""
        confirmed = []
        remaining = []
        
        for func in self.pending_functions:
            if self.request_confirmation(func):
                confirmed.append(func)
            else:
                remaining.append(func)
        
        self.pending_functions = remaining
        return confirmed
```

### 3.2 执行进度反馈

向用户提供函数执行进度的反馈：

```python
class ExecutionProgressManager:
    def __init__(self, ui_interface):
        self.ui_interface = ui_interface
        self.active_executions = {}
    
    def start_execution(self, function_call):
        """开始执行函数并显示进度"""
        execution_id = str(uuid.uuid4())
        function_name = function_call["name"]
        
        self.active_executions[execution_id] = {
            "function": function_call,
            "status": "running",
            "progress": 0,
            "start_time": time.time()
        }
        
        # 更新UI
        self.ui_interface.show_execution_progress(
            execution_id, 
            function_name, 
            "开始执行...", 
            0
        )
        
        return execution_id
    
    def update_progress(self, execution_id, progress, message=None):
        """更新执行进度"""
        if execution_id in self.active_executions:
            self.active_executions[execution_id]["progress"] = progress
            
            function_name = self.active_executions[execution_id]["function"]["name"]
            
            # 更新UI
            self.ui_interface.show_execution_progress(
                execution_id,
                function_name,
                message or f"执行中... {progress}%",
                progress
            )
    
    def complete_execution(self, execution_id, result):
        """完成函数执行"""
        if execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "completed"
            self.active_executions[execution_id]["result"] = result
            self.active_executions[execution_id]["end_time"] = time.time()
            
            function_name = self.active_executions[execution_id]["function"]["name"]
            
            # 更新UI
            self.ui_interface.show_execution_progress(
                execution_id,
                function_name,
                "执行完成",
                100
            )
            
            # 显示结果
            self.ui_interface.show_execution_result(execution_id, result)
            
            return result
```

### 3.3 用户干预机制

允许用户在生成过程中进行干预：

```python
class UserInterventionHandler:
    def __init__(self, generation_manager):
        self.generation_manager = generation_manager
        self.intervention_callbacks = {}
    
    def register_intervention_callback(self, intervention_type, callback):
        """注册干预回调函数"""
        self.intervention_callbacks[intervention_type] = callback
    
    def handle_intervention(self, intervention_type, intervention_data=None):
        """处理用户干预"""
        if intervention_type == "stop":
            # 停止生成
            self.generation_manager.stop_generation()
            return {"status": "success", "message": "生成已停止"}
        
        elif intervention_type == "regenerate":
            # 重新生成
            self.generation_manager.regenerate()
            return {"status": "success", "message": "正在重新生成"}
        
        elif intervention_type == "modify_function_args":
            # 修改函数参数
            function_name = intervention_data["function_name"]
            new_args = intervention_data["new_args"]
            
            # 更新函数调用参数
            self.generation_manager.update_function_args(function_name, new_args)
            return {"status": "success", "message": f"已更新函数 {function_name} 的参数"}
        
        elif intervention_type in self.intervention_callbacks:
            # 调用自定义干预回调
            return self.intervention_callbacks[intervention_type](intervention_data)
        
        else:
            return {"status": "error", "message": f"未知的干预类型: {intervention_type}"}
```

## 4. 实际系统中的实现分析

### 4.1 Cursor类系统的工作原理

Cursor等代码辅助工具的工作原理通常包括以下几个方面：

#### 4.1.1 对话管理与任务分解

Cursor使用复杂的对话管理系统，将用户请求分解为多个子任务：

1. **初始理解阶段**：分析用户请求，确定需要执行的操作
2. **信息收集阶段**：通过函数调用收集必要信息（如查看代码文件）
3. **规划阶段**：制定解决方案的步骤计划
4. **执行阶段**：逐步执行计划，包括生成代码、修改文件等
5. **验证阶段**：检查执行结果，必要时进行调整

这种任务分解使系统能够处理复杂的编程任务，同时保持对话的连贯性。

#### 4.1.2 流式生成与函数调用协同

Cursor在流式生成过程中集成函数调用的方式：

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  用户请求                                                    │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  初始响应生成                                                │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  函数调用检测                                                │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  用户确认（如需要）                                           │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  函数执行                                                    │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  继续生成（考虑函数结果）                                      │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  重复上述步骤直到完成                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

这个过程看起来像是单个对话，但实际上是由多个连续的模型调用组成的，每次调用都考虑了之前的上下文和函数执行结果。

#### 4.1.3 用户体验设计

Cursor等工具在用户体验设计上的关键点：

1. **无缝衔接**：虽然后台进行了多次模型调用和函数执行，但用户体验是连续的
2. **实时反馈**：通过流式生成提供即时反馈
3. **透明执行**：显示正在执行的操作和进度
4. **用户控制**：关键操作（如文件修改）需要用户确认
5. **上下文保持**：整个过程中保持对话上下文的连贯性

### 4.2 通用LLM助手系统的实现模式

现代LLM助手系统通常采用以下实现模式：

#### 4.2.1 事件驱动架构

```python
class EventDrivenAssistant:
    def __init__(self):
        self.event_bus = EventBus()
        self.llm_client = LLMClient()
        self.function_registry = FunctionRegistry()
        self.conversation_manager = ConversationManager()
        
        # 注册事件处理器
        self.event_bus.register("user_input", self.handle_user_input)
        self.event_bus.register("function_call_detected", self.handle_function_call)
        self.event_bus.register("function_executed", self.handle_function_result)
        self.event_bus.register("generation_completed", self.handle_generation_completed)
    
    def handle_user_input(self, event):
        """处理用户输入事件"""
        user_input = event["data"]["input"]
        
        # 更新对话历史
        self.conversation_manager.add_user_message(user_input)
        
        # 开始生成响应
        self.event_bus.emit("start_generation", {
            "conversation": self.conversation_manager.get_conversation()
        })
    
    def handle_function_call(self, event):
        """处理检测到的函数调用"""
        function_call = event["data"]["function_call"]
        
        # 暂停生成
        self.event_bus.emit("pause_generation", {})
        
        # 执行函数
        function_name = function_call["name"]
        function_args = json.loads(function_call["arguments"])
        
        if function_name in self.function_registry:
            function = self.function_registry.get_function(function_name)
            
            # 检查是否需要用户确认
            if function.requires_confirmation:
                self.event_bus.emit("request_user_confirmation", {
                    "function_call": function_call,
                    "callback": lambda confirmed: self.execute_function_after_confirmation(function_call, confirmed)
                })
            else:
                self.execute_function(function_call)
    
    def execute_function_after_confirmation(self, function_call, confirmed):
        """用户确认后执行函数"""
        if confirmed:
            self.execute_function(function_call)
        else:
            # 用户拒绝执行，继续生成但告知模型函数执行被拒绝
            self.conversation_manager.add_function_result(
                function_call["name"],
                {"status": "rejected", "message": "User rejected function execution"}
            )
            
            self.event_bus.emit("resume_generation", {
                "conversation": self.conversation_manager.get_conversation()
            })
    
    def execute_function(self, function_call):
        """执行函数"""
        function_name = function_call["name"]
        function_args = json.loads(function_call["arguments"])
        
        function = self.function_registry.get_function(function_name)
        
        try:
            result = function(**function_args)
            
            # 记录函数结果
            self.conversation_manager.add_function_call(function_call)
            self.conversation_manager.add_function_result(function_name, result)
            
            # 通知函数执行完成
            self.event_bus.emit("function_executed", {
                "function_call": function_call,
                "result": result
            })
        except Exception as e:
            # 处理函数执行错误
            error_result = {"status": "error", "message": str(e)}
            self.conversation_manager.add_function_result(function_name, error_result)
            
            self.event_bus.emit("function_executed", {
                "function_call": function_call,
                "result": error_result
            })
    
    def handle_function_result(self, event):
        """处理函数执行结果"""
        # 恢复生成，考虑函数结果
        self.event_bus.emit("resume_generation", {
            "conversation": self.conversation_manager.get_conversation()
        })
    
    def handle_generation_completed(self, event):
        """处理生成完成事件"""
        generated_text = event["data"]["text"]
        
        # 更新对话历史
        self.conversation_manager.add_assistant_message(generated_text)
        
        # 通知UI更新
        self.event_bus.emit("update_ui", {
            "conversation": self.conversation_manager.get_conversation()
        })
```

#### 4.2.2 状态机模型

```python
class StateMachineAssistant:
    def __init__(self):
        self.state = "idle"  # idle, generating, executing_function, waiting_confirmation
        self.llm_client = LLMClient()
        self.function_registry = FunctionRegistry()
        self.conversation = []
        self.current_function_call = None
        self.generation_buffer = ""
    
    def process_user_input(self, user_input):
        """处理用户输入"""
        # 添加用户消息
        self.conversation.append({"role": "user", "content": user_input})
        
        # 转换到生成状态
        self.transition_to("generating")
    
    def transition_to(self, new_state, **kwargs):
        """状态转换"""
        old_state = self.state
        self.state = new_state
        
        print(f"状态转换: {old_state} -> {new_state}")
        
        # 根据新状态执行相应操作
        if new_state == "generating":
            self._start_generation()
        
        elif new_state == "executing_function":
            function_call = kwargs.get("function_call")
            if function_call:
                self._execute_function(function_call)
        
        elif new_state == "waiting_confirmation":
            function_call = kwargs.get("function_call")
            if function_call:
                self._request_confirmation(function_call)
    
    def _start_generation(self):
        """开始生成响应"""
        self.generation_buffer = ""
        
        # 开始流式生成
        for chunk in self.llm_client.generate_stream(self.conversation):
            if self.state != "generating":
                # 状态已改变，停止处理
                break
            
            if "content" in chunk:
                content = chunk["content"]
                self.generation_buffer += content
                yield {"type": "text", "content": content}
            
            elif "function_call" in chunk:
                # 检测到函数调用
                function_call = chunk["function_call"]
                
                # 检查是否需要用户确认
                function = self.function_registry.get_function(function_call["name"])
                if function and function.requires_confirmation:
                    self.current_function_call = function_call
                    self.transition_to("waiting_confirmation", function_call=function_call)
                else:
                    self.current_function_call = function_call
                    self.transition_to("executing_function", function_call=function_call)
                
                yield {"type": "function_call", "function": function_call}
        
        # 生成完成，添加助手消息
        if self.state == "generating" and self.generation_buffer:
            self.conversation.append({"role": "assistant", "content": self.generation_buffer})
            self.transition_to("idle")
    
    def _execute_function(self, function_call):
        """执行函数"""
        function_name = function_call["name"]
        function_args = json.loads(function_call["arguments"])
        
        try:
            function = self.function_registry.get_function(function_name)
            result = function(**function_args)
            
            # 添加函数调用和结果到对话
            self.conversation.append({
                "role": "assistant",
                "function_call": function_call
            })
            self.conversation.append({
                "role": "function",
                "name": function_name,
                "content": json.dumps(result)
            })
            
            # 返回到生成状态
            self.transition_to("generating")
            
            return result
        except Exception as e:
            # 处理错误
            error_result = {"status": "error", "message": str(e)}
            
            self.conversation.append({
                "role": "function",
                "name": function_name,
                "content": json.dumps(error_result)
            })
            
            # 返回到生成状态
            self.transition_to("generating")
            
            return error_result
    
    def _request_confirmation(self, function_call):
        """请求用户确认"""
        # 这里应该显示确认对话框并等待用户响应
        # 在实际实现中，这可能是异步的
        
        # 模拟用户确认
        confirmed = True
        
        if confirmed:
            self.transition_to("executing_function", function_call=function_call)
        else:
            # 用户拒绝，添加拒绝信息并继续生成
            self.conversation.append({
                "role": "function",
                "name": function_call["name"],
                "content": json.dumps({"status": "rejected", "message": "User rejected function execution"})
            })
            
            self.transition_to("generating")
```

## 5. 实现自己的Function Calling与流式生成系统

### 5.1 基础实现步骤

1. **设置LLM客户端**：选择支持函数调用和流式生成的LLM API
2. **定义函数注册表**：创建用于注册和管理可调用函数的系统
3. **实现对话管理器**：管理对话历史和上下文
4. **创建流式处理器**：处理流式生成内容和函数调用检测
5. **设计用户界面**：展示流式内容和函数执行状态

### 5.2 示例实现：简单的文件操作助手

```python
import json
import os
import re
import time
import uuid
from typing import Dict, List, Any, Generator, Optional

# 模拟LLM客户端
class MockLLMClient:
    def generate_stream(self, messages: List[Dict[str, Any]], functions: List[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        """模拟流式生成"""
        user_message = next((m for m in messages if m["role"] == "user"), {"content": ""})["content"]
        
        if "列出文件" in user_message:
            # 先生成一些文本
            yield {"type": "text", "content": "我将帮您列出指定目录中的文件。"}
            time.sleep(0.5)
            
            # 生成函数调用
            yield {
                "type": "function_call",
                "function": {
                    "name": "list_files",
                    "arguments": json.dumps({"directory": "/home"})
                }
            }
            
            # 等待函数执行结果
            # 在实际实现中，这里会暂停生成，等待函数结果被添加到消息中
            
            # 假设函数已执行并结果已添加到消息中
            function_result = next((m for m in messages if m["role"] == "function" and m["name"] == "list_files"), None)
            
            if function_result:
                # 继续生成，考虑函数结果
                yield {"type": "text", "content": "\n\n根据查询结果，该目录包含以下文件：\n\n"}
                
                try:
                    result = json.loads(function_result["content"])
                    for file in result.get("files", []):
                        yield {"type": "text", "content": f"- {file}\n"}
                except:
                    yield {"type": "text", "content": "无法解析文件列表。"}
            
            yield {"type": "text", "content": "\n\n您还需要进行其他操作吗？"}
        
        elif "读取文件" in user_message:
            # 提取文件名
            file_match = re.search(r'读取文件\s+([^\s]+)', user_message)
            filename = file_match.group(1) if file_match else "example.txt"
            
            yield {"type": "text", "content": f"我将帮您读取文件 {filename}。"}
            time.sleep(0.5)
            
            # 生成函数调用
            yield {
                "type": "function_call",
                "function": {
                    "name": "read_file",
                    "arguments": json.dumps({"filename": filename})
                }
            }
            
            # 假设函数已执行
            function_result = next((m for m in messages if m["role"] == "function" and m["name"] == "read_file"), None)
            
            if function_result:
                yield {"type": "text", "content": "\n\n文件内容如下：\n\n```\n"}
                
                try:
                    result = json.loads(function_result["content"])
                    yield {"type": "text", "content": result.get("content", "文件为空或无法读取。")}
                except:
                    yield {"type": "text", "content": "无法解析文件内容。"}
                
                yield {"type": "text", "content": "\n```\n\n需要对文件进行其他操作吗？"}
        
        else:
            # 普通回复
            yield {"type": "text", "content": "我是一个文件操作助手，可以帮您执行以下操作：\n\n"}
            yield {"type": "text", "content": "1. 列出目录中的文件（例如：'列出/home目录中的文件'）\n"}
            yield {"type": "text", "content": "2. 读取文件内容（例如：'读取文件example.txt'）\n"}
            yield {"type": "text", "content": "\n请告诉我您需要执行什么操作？"}

# 函数注册表
class FunctionRegistry:
    def __init__(self):
        self.functions = {}
    
    def register(self, name: str, function, description: str, requires_confirmation: bool = False):
        """注册函数"""
        self.functions[name] = {
            "function": function,
            "description": description,
            "requires_confirmation": requires_confirmation
        }
    
    def get_function(self, name: str):
        """获取函数"""
        return self.functions.get(name, {}).get("function")
    
    def get_function_info(self, name: str):
        """获取函数信息"""
        return self.functions.get(name)
    
    def list_functions(self):
        """列出所有函数"""
        return [
            {
                "name": name,
                "description": info["description"],
                "requires_confirmation": info["requires_confirmation"]
            }
            for name, info in self.functions.items()
        ]

# 对话管理器
class ConversationManager:
    def __init__(self, max_history: int = 10):
        self.messages = []
        self.max_history = max_history
    
    def add_message(self, message: Dict[str, Any]):
        """添加消息"""
        self.messages.append(message)
        
        # 保持历史记录在限定范围内
        if len(self.messages) > self.max_history:
            # 保留system消息
            system_messages = [m for m in self.messages if m["role"] == "system"]
            other_messages = [m for m in self.messages if m["role"] != "system"]
            
            # 只裁剪非system消息
            other_messages = other_messages[-(self.max_history - len(system_messages)):]
            
            # 重建消息列表
            self.messages = system_messages + other_messages
    
    def add_user_message(self, content: str):
        """添加用户消息"""
        self.add_message({"role": "user", "content": content})
    
    def add_assistant_message(self, content: str):
        """添加助手消息"""
        self.add_message({"role": "assistant", "content": content})
    
    def add_function_call(self, function_call: Dict[str, Any]):
        """添加函数调用"""
        self.add_message({
            "role": "assistant",
            "content": None,
            "function_call": function_call
        })
    
    def add_function_result(self, function_name: str, result: Any):
        """添加函数结果"""
        self.add_message({
            "role": "function",
            "name": function_name,
            "content": json.dumps(result)
        })
    
    def get_messages(self):
        """获取所有消息"""
        return self.messages

# 文件操作助手
class FileOperationAssistant:
    def __init__(self):
        self.llm_client = MockLLMClient()
        self.function_registry = FunctionRegistry()
        self.conversation_manager = ConversationManager()
        
        # 注册函数
        self._register_functions()
    
    def _register_functions(self):
        """注册文件操作函数"""
        # 列出文件
        self.function_registry.register(
            name="list_files",
            function=self._list_files,
            description="列出指定目录中的文件",
            requires_confirmation=False
        )
        
        # 读取文件
        self.function_registry.register(
            name="read_file",
            function=self._read_file,
            description="读取文件内容",
            requires_confirmation=False
        )
        
        # 写入文件（需要确认）
        self.function_registry.register(
            name="write_file",
            function=self._write_file,
            description="写入内容到文件",
            requires_confirmation=True
        )
    
    def _list_files(self, directory: str):
        """列出目录中的文件"""
        try:
            files = os.listdir(directory)
            return {"status": "success", "files": files}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _read_file(self, filename: str):
        """读取文件内容"""
        try:
            with open(filename, 'r') as f:
                content = f.read()
            return {"status": "success", "content": content}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _write_file(self, filename: str, content: str):
        """写入内容到文件"""
        try:
            with open(filename, 'w') as f:
                f.write(content)
            return {"status": "success", "message": f"成功写入 {len(content)} 字节到 {filename}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def process_user_input(self, user_input: str):
        """处理用户输入"""
        # 添加用户消息
        self.conversation_manager.add_user_message(user_input)
        
        # 获取函数定义
        functions = self.function_registry.list_functions()
        
        # 开始流式生成
        assistant_message = ""
        pending_function_call = None
        
        for chunk in self.llm_client.generate_stream(self.conversation_manager.get_messages(), functions):
            if chunk["type"] == "text":
                assistant_message += chunk["content"]
                yield {"type": "text", "content": chunk["content"]}
            
            elif chunk["type"] == "function_call":
                pending_function_call = chunk["function"]
                
                function_name = pending_function_call["name"]
                function_info = self.function_registry.get_function_info(function_name)
                
                if function_info and function_info["requires_confirmation"]:
                    # 需要用户确认
                    yield {
                        "type": "confirmation_request",
                        "function": pending_function_call,
                        "message": f"模型想要执行函数 '{function_name}'，是否允许？"
                    }
                    
                    # 在实际实现中，这里应该暂停并等待用户确认
                    # 为了简化示例，我们假设用户总是确认
                    confirmed = True
                    
                    if not confirmed:
                        # 用户拒绝，添加拒绝信息
                        self.conversation_manager.add_function_result(
                            function_name,
                            {"status": "rejected", "message": "User rejected function execution"}
                        )
                        continue
                
                # 执行函数
                function = self.function_registry.get_function(function_name)
                if function:
                    try:
                        arguments = json.loads(pending_function_call["arguments"])
                        result = function(**arguments)
                        
                        # 添加函数调用和结果
                        self.conversation_manager.add_function_call(pending_function_call)
                        self.conversation_manager.add_function_result(function_name, result)
                        
                        yield {"type": "function_result", "result": result}
                    except Exception as e:
                        error_result = {"status": "error", "message": str(e)}
                        self.conversation_manager.add_function_result(function_name, error_result)
                        yield {"type": "function_result", "result": error_result}
        
        # 添加完整的助手消息
        if assistant_message:
            self.conversation_manager.add_assistant_message(assistant_message)

# 使用示例
def main():
    assistant = FileOperationAssistant()
    
    while True:
        user_input = input("\n用户: ")
        if user_input.lower() in ["exit", "quit", "q"]:
            break
        
        print("\n助手: ", end="", flush=True)
        for chunk in assistant.process_user_input(user_input):
            if chunk["type"] == "text":
                print(chunk["content"], end="", flush=True)
            elif chunk["type"] == "function_call":
                print(f"\n[执行函数: {chunk['function']['name']}]", end="", flush=True)
            elif chunk["type"] == "function_result":
                result = chunk["result"]
                status = result.get("status", "unknown")
                if status == "success":
                    print(f"\n[函数执行成功]", end="", flush=True)
                else:
                    print(f"\n[函数执行失败: {result.get('message', 'Unknown error')}]", end="", flush=True)
            elif chunk["type"] == "confirmation_request":
                print(f"\n{chunk['message']} (y/n): ", end="", flush=True)
                # 在实际实现中，这里应该等待用户输入
                print("y", end="", flush=True)  # 模拟用户输入

if __name__ == "__main__":
    main()
```

### 5.3 高级功能：并行函数执行

在某些情况下，可能需要并行执行多个函数以提高效率：

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

class ParallelFunctionExecutor:
    def __init__(self, max_workers=5):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.loop = asyncio.get_event_loop()
    
    async def execute_functions_parallel(self, function_calls):
        """并行执行多个函数调用"""
        tasks = []
        
        for call in function_calls:
            function_name = call["name"]
            function_args = json.loads(call["arguments"])
            
            # 创建异步任务
            task = self.loop.run_in_executor(
                self.executor,
                self._execute_single_function,
                function_name,
                function_args
            )
            
            tasks.append((call, task))
        
        # 等待所有任务完成
        results = []
        for call, task in tasks:
            try:
                result = await task
                results.append({
                    "function_call": call,
                    "result": result,
                    "success": True
                })
            except Exception as e:
                results.append({
                    "function_call": call,
                    "result": {"error": str(e)},
                    "success": False
                })
        
        return results
    
    def _execute_single_function(self, function_name, function_args):
        """执行单个函数"""
        # 实现函数执行逻辑
        # ...
        return {"status": "success", "result": "function result"}
```

### 5.4 高级功能：自适应上下文管理

为了处理长对话，可以实现自适应上下文管理：

```python
class AdaptiveContextManager:
    def __init__(self, max_tokens=4000, token_estimator=None):
        self.max_tokens = max_tokens
        self.token_estimator = token_estimator or self._default_token_estimator
        self.messages = []
        self.message_tokens = []
        self.total_tokens = 0
    
    def add_message(self, message):
        """添加消息并管理上下文大小"""
        # 估算消息token数
        tokens = self.token_estimator(message)
        
        # 添加消息
        self.messages.append(message)
        self.message_tokens.append(tokens)
        self.total_tokens += tokens
        
        # 如果超出最大token数，压缩上下文
        if self.total_tokens > self.max_tokens:
            self._compress_context()
    
    def _compress_context(self):
        """压缩上下文以适应token限制"""
        # 保留system消息
        system_indices = [i for i, m in enumerate(self.messages) if m["role"] == "system"]
        system_tokens = sum(self.message_tokens[i] for i in system_indices)
        
        # 保留最近的用户-助手交互
        recent_tokens = 0
        recent_indices = []
        
        # 从最新消息开始向前遍历
        for i in range(len(self.messages) - 1, -1, -1):
            if i in system_indices:
                continue
            
            if recent_tokens + self.message_tokens[i] + system_tokens <= self.max_tokens * 0.9:
                recent_indices.append(i)
                recent_tokens += self.message_tokens[i]
            else:
                break
        
        # 按原始顺序排序索引
        preserved_indices = sorted(system_indices + recent_indices)
        
        # 重建消息列表
        self.messages = [self.messages[i] for i in preserved_indices]
        self.message_tokens = [self.message_tokens[i] for i in preserved_indices]
        self.total_tokens = sum(self.message_tokens)
        
        # 如果仍然超出限制，可能需要摘要或更激进的压缩
        if self.total_tokens > self.max_tokens:
            self._summarize_oldest_interactions()
    
    def _summarize_oldest_interactions(self):
        """摘要最旧的交互"""
        # 实现摘要逻辑
        # ...
    
    def _default_token_estimator(self, message):
        """默认token估算器"""
        # 简单估算：每个字符算0.25个token
        content = message.get("content", "")
        if isinstance(content, str):
            return len(content) // 4 + 5  # 基础token + 内容
        return 5  # 基础token
    
    def get_messages(self):
        """获取当前消息列表"""
        return self.messages
```

## 6. 总结与最佳实践

### 6.1 设计原则

1. **用户体验优先**：确保流式生成和函数执行的无缝衔接
2. **透明性**：让用户了解系统正在执行的操作
3. **控制权**：关键操作需要用户确认
4. **错误恢复**：优雅处理函数执行错误
5. **上下文管理**：智能管理对话上下文，避免超出限制

### 6.2 性能优化

1. **批处理**：将多个相关函数调用合并为一个批处理
2. **并行执行**：并行执行独立的函数调用
3. **缓存结果**：缓存频繁使用的函数结果
4. **增量更新**：只传输变化的部分，减少数据传输

### 6.3 安全考虑

1. **权限控制**：限制函数可以执行的操作范围
2. **用户确认**：敏感操作需要用户确认
3. **输入验证**：验证所有函数参数
4. **超时机制**：为函数执行设置超时限制

### 6.4 调试技巧

1. **日志记录**：记录所有函数调用和结果
2. **状态可视化**：可视化系统状态和转换
3. **模拟模式**：使用模拟数据测试系统
4. **断点调试**：在关键点设置断点

通过遵循这些原则和最佳实践，您可以构建一个高效、可靠的Function Calling与流式生成协同系统，为用户提供流畅、自然的交互体验。
