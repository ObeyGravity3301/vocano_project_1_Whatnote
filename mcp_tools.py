#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Dict, List, Any, Optional, Callable, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import Enum
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

class ToolCategory(Enum):
    """工具分类"""
    PDF_ANALYSIS = "pdf_analysis"
    NOTE_GENERATION = "note_generation"
    BOARD_MANAGEMENT = "board_management"
    SEARCH_QUERY = "search_query"
    CONTENT_CREATION = "content_creation"
    FILE_MANAGEMENT = "file_management"

class ToolSecurityLevel(Enum):
    """工具安全级别"""
    SAFE = "safe"           # 安全操作，无需确认
    CAUTION = "caution"     # 需要提示的操作
    DANGEROUS = "dangerous" # 需要用户确认的操作

@dataclass
class MCPToolSchema:
    """MCP工具模式定义"""
    name: str
    description: str
    category: ToolCategory
    security_level: ToolSecurityLevel
    parameters: Dict[str, Any]
    required: List[str] = field(default_factory=list)
    examples: List[Dict[str, Any]] = field(default_factory=list)
    use_cases: List[str] = field(default_factory=list)
    
    def to_openai_format(self) -> Dict[str, Any]:
        """转换为OpenAI Function Calling格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": f"{self.description}\n类别: {self.category.value}\n安全级别: {self.security_level.value}",
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required
                }
            }
        }
    
    def get_detailed_description(self) -> str:
        """获取详细描述"""
        desc = f"**{self.name}** ({self.category.value})\n"
        desc += f"描述: {self.description}\n"
        desc += f"安全级别: {self.security_level.value}\n"
        
        if self.use_cases:
            desc += f"使用场景: {', '.join(self.use_cases)}\n"
        
        if self.examples:
            desc += "示例:\n"
            for i, example in enumerate(self.examples[:2], 1):
                desc += f"  {i}. {json.dumps(example, ensure_ascii=False)}\n"
        
        return desc

@dataclass
class MCPToolResult:
    """MCP工具执行结果"""
    success: bool
    data: Any = None
    error: str = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    execution_time: float = 0
    tool_name: str = ""
    suggested_next_actions: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "metadata": self.metadata,
            "execution_time": self.execution_time,
            "tool_name": self.tool_name,
            "suggested_next_actions": self.suggested_next_actions
        }

class MCPTool(ABC):
    """MCP工具基类"""
    
    def __init__(self, name: str, description: str, category: ToolCategory, 
                 security_level: ToolSecurityLevel = ToolSecurityLevel.SAFE):
        self.name = name
        self.description = description
        self.category = category
        self.security_level = security_level
    
    @abstractmethod
    def get_schema(self) -> MCPToolSchema:
        """获取工具模式"""
        pass
    
    @abstractmethod
    async def execute(self, **kwargs) -> MCPToolResult:
        """执行工具"""
        pass
    
    def requires_confirmation(self) -> bool:
        """是否需要用户确认"""
        return self.security_level == ToolSecurityLevel.DANGEROUS
    
    def get_execution_context(self, **kwargs) -> Dict[str, Any]:
        """获取执行上下文信息"""
        return {
            "tool_name": self.name,
            "category": self.category.value,
            "security_level": self.security_level.value,
            "parameters": kwargs,
            "timestamp": datetime.now().isoformat()
        }

class ListBoardFilesTool(MCPTool):
    """列出展板文件工具"""
    
    def __init__(self, board_id: str):
        super().__init__(
            name="list_board_files",
            description="列出指定展板上的所有PDF文件和相关信息，帮助了解学习材料概况",
            category=ToolCategory.FILE_MANAGEMENT,
            security_level=ToolSecurityLevel.SAFE
        )
        self.board_id = board_id
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            security_level=self.security_level,
            parameters={
                "include_details": {
                    "type": "boolean",
                    "description": "是否包含文件详细信息（页数、大小、内容摘要等）",
                    "default": True
                },
                "filter_type": {
                    "type": "string",
                    "description": "文件过滤类型",
                    "enum": ["all", "recent", "large", "annotated"],
                    "default": "all"
                }
            },
            required=[],
            examples=[
                {"include_details": True, "filter_type": "all"},
                {"include_details": False, "filter_type": "recent"}
            ],
            use_cases=[
                "查看展板上有哪些学习材料",
                "了解PDF文件的基本信息",
                "筛选特定类型的文件"
            ]
        )
    
    async def execute(self, include_details: bool = True, filter_type: str = "all") -> MCPToolResult:
        """执行文件列表获取"""
        start_time = time.time()
        
        try:
            # 调用展板信息API
            url = f"http://127.0.0.1:8000/api/boards/{self.board_id}/simple"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                board_data = response.json()
                files = []
                
                for pdf in board_data.get("pdfs", []):
                    file_info = {
                        "filename": pdf.get("filename", ""),
                        "pages": pdf.get("pages", 0),
                        "display_name": pdf.get("filename", "").replace(".pdf", "")
                    }
                    
                    if include_details:
                        file_info.update({
                            "added_at": pdf.get("added_at", ""),
                            "content_summary": pdf.get("content_summary", ""),
                            "file_size": pdf.get("file_size", 0),
                            "has_annotations": pdf.get("has_annotations", False)
                        })
                    
                    # 应用过滤器
                    if self._should_include_file(file_info, filter_type):
                        files.append(file_info)
                
                execution_time = time.time() - start_time
                
                # 生成建议的下一步操作
                suggested_actions = self._generate_suggestions(files)
                
                return MCPToolResult(
                    success=True,
                    data={
                        "board_id": self.board_id,
                        "file_count": len(files),
                        "files": files,
                        "filter_applied": filter_type,
                        "summary": f"找到 {len(files)} 个文件，总页数 {sum(f.get('pages', 0) for f in files)}"
                    },
                    metadata={
                        "tool": self.name,
                        "board_id": self.board_id,
                        "filter_type": filter_type
                    },
                    execution_time=execution_time,
                    tool_name=self.name,
                    suggested_next_actions=suggested_actions
                )
            else:
                return MCPToolResult(
                    success=False,
                    error=f"无法获取展板信息，状态码: {response.status_code}",
                    tool_name=self.name
                )
                
        except Exception as e:
            logger.error(f"列出展板文件失败: {str(e)}")
            return MCPToolResult(
                success=False,
                error=f"获取文件列表失败: {str(e)}",
                tool_name=self.name
            )
    
    def _should_include_file(self, file_info: Dict, filter_type: str) -> bool:
        """判断文件是否应该包含在结果中"""
        if filter_type == "all":
            return True
        elif filter_type == "recent":
            # 简单的时间过滤逻辑
            return True  # TODO: 实现基于时间的过滤
        elif filter_type == "large":
            return file_info.get("pages", 0) > 10
        elif filter_type == "annotated":
            return file_info.get("has_annotations", False)
        return True
    
    def _generate_suggestions(self, files: List[Dict]) -> List[str]:
        """基于文件列表生成建议操作"""
        suggestions = []
        
        if not files:
            suggestions.append("上传一些PDF文件开始学习")
        elif len(files) == 1:
            suggestions.append(f"开始分析 '{files[0]['display_name']}'")
            suggestions.append("为PDF页面生成注释")
        else:
            suggestions.append("选择一个文件进行深入分析")
            suggestions.append("比较多个文件的内容")
            suggestions.append("创建整体学习计划")
        
        return suggestions

class GetPDFPageTool(MCPTool):
    """获取PDF页面内容工具"""
    
    def __init__(self):
        super().__init__(
            name="get_pdf_page",
            description="获取PDF文件指定页面的文本内容或AI注释，用于深入分析特定页面",
            category=ToolCategory.PDF_ANALYSIS,
            security_level=ToolSecurityLevel.SAFE
        )
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            security_level=self.security_level,
            parameters={
                "filename": {
                    "type": "string",
                    "description": "PDF文件名（包含.pdf扩展名）"
                },
                "page_number": {
                    "type": "integer",
                    "description": "页码（从1开始）",
                    "minimum": 1
                },
                "content_type": {
                    "type": "string",
                    "description": "获取的内容类型",
                    "enum": ["raw_text", "annotation", "both"],
                    "default": "annotation"
                },
                "force_regenerate": {
                    "type": "boolean",
                    "description": "是否强制重新生成注释（仅适用于annotation类型）",
                    "default": False
                }
            },
            required=["filename", "page_number"],
            examples=[
                {"filename": "高等数学.pdf", "page_number": 1, "content_type": "annotation"},
                {"filename": "线性代数.pdf", "page_number": 5, "content_type": "both"}
            ],
            use_cases=[
                "获取页面的AI注释进行学习",
                "提取页面原始文本进行分析",
                "对比原始文本和AI注释"
            ]
        )
    
    async def execute(self, filename: str, page_number: int, 
                     content_type: str = "annotation", force_regenerate: bool = False) -> MCPToolResult:
        """执行页面内容获取"""
        start_time = time.time()
        
        try:
            result_data = {}
            
            # 获取原始文本
            if content_type in ["raw_text", "both"]:
                text_url = f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/raw-text"
                text_response = requests.get(text_url, timeout=30)
                
                if text_response.status_code == 200:
                    text_data = text_response.json()
                    result_data["raw_text"] = text_data.get("text", "")
                else:
                    result_data["raw_text"] = f"无法获取原始文本 (状态码: {text_response.status_code})"
            
            # 获取或生成注释
            if content_type in ["annotation", "both"]:
                if force_regenerate:
                    # 强制重新生成注释
                    annotation_url = f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/annotate"
                    annotation_response = requests.post(annotation_url, timeout=60)
                else:
                    # 获取现有注释
                    annotation_url = f"http://127.0.0.1:8000/api/materials/{filename}/pages/{page_number}/annotate"
                    annotation_response = requests.get(annotation_url, timeout=30)
                
                if annotation_response.status_code == 200:
                    annotation_data = annotation_response.json()
                    result_data["annotation"] = annotation_data.get("annotation", "")
                    result_data["annotation_source"] = annotation_data.get("source", "unknown")
                else:
                    result_data["annotation"] = f"无法获取注释 (状态码: {annotation_response.status_code})"
            
            execution_time = time.time() - start_time
            
            # 生成建议操作
            suggestions = self._generate_page_suggestions(filename, page_number, result_data)
            
            return MCPToolResult(
                success=True,
                data={
                    "filename": filename,
                    "page_number": page_number,
                    "content_type": content_type,
                    **result_data,
                    "page_info": {
                        "has_text": bool(result_data.get("raw_text", "")),
                        "has_annotation": bool(result_data.get("annotation", "")),
                        "content_length": len(result_data.get("raw_text", "") + result_data.get("annotation", ""))
                    }
                },
                metadata={
                    "tool": self.name,
                    "filename": filename,
                    "page_number": page_number,
                    "content_type": content_type
                },
                execution_time=execution_time,
                tool_name=self.name,
                suggested_next_actions=suggestions
            )
                
        except Exception as e:
            logger.error(f"获取PDF页面内容失败: {str(e)}")
            return MCPToolResult(
                success=False,
                error=f"获取页面内容失败: {str(e)}",
                tool_name=self.name
            )
    
    def _generate_page_suggestions(self, filename: str, page_number: int, result_data: Dict) -> List[str]:
        """基于页面内容生成建议操作"""
        suggestions = []
        
        if result_data.get("annotation"):
            suggestions.append(f"继续分析 {filename} 的下一页 (第{page_number + 1}页)")
            suggestions.append("改进当前页面的注释")
            suggestions.append("基于此页面内容提问")
        
        if result_data.get("raw_text"):
            suggestions.append("搜索相关内容")
            suggestions.append("生成知识点总结")
        
        suggestions.append("返回文件列表查看其他页面")
        
        return suggestions

class SearchPDFContentTool(MCPTool):
    """搜索PDF内容工具"""
    
    def __init__(self):
        super().__init__(
            name="search_pdf_content",
            description="在PDF文件中搜索关键词，快速定位相关内容页面",
            category=ToolCategory.SEARCH_QUERY,
            security_level=ToolSecurityLevel.SAFE
        )
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            security_level=self.security_level,
            parameters={
                "filename": {
                    "type": "string",
                    "description": "要搜索的PDF文件名（包含.pdf扩展名）"
                },
                "keywords": {
                    "type": "string",
                    "description": "搜索关键词，可以是多个词用空格分隔"
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大返回结果数量",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 20
                },
                "search_type": {
                    "type": "string",
                    "description": "搜索类型",
                    "enum": ["exact", "fuzzy", "semantic"],
                    "default": "fuzzy"
                }
            },
            required=["filename", "keywords"],
            examples=[
                {"filename": "高等数学.pdf", "keywords": "极限 定义", "max_results": 5},
                {"filename": "线性代数.pdf", "keywords": "矩阵乘法", "search_type": "exact"}
            ],
            use_cases=[
                "查找特定概念在哪些页面出现",
                "快速定位关键内容",
                "了解某个主题在全文中的分布"
            ]
        )
    
    async def execute(self, filename: str, keywords: str, max_results: int = 5, 
                     search_type: str = "fuzzy") -> MCPToolResult:
        """执行PDF内容搜索"""
        start_time = time.time()
        
        try:
            # 构建搜索请求
            search_params = {
                "keywords": keywords,
                "max_results": max_results,
                "search_type": search_type
            }
            
            url = f"http://127.0.0.1:8000/api/materials/{filename}/search"
            response = requests.post(url, json=search_params, timeout=30)
            
            if response.status_code == 200:
                search_data = response.json()
                results = search_data.get("results", [])
                
                # 处理搜索结果
                processed_results = []
                for result in results[:max_results]:
                    processed_results.append({
                        "page_number": result.get("page_number", 0),
                        "content_snippet": result.get("snippet", ""),
                        "relevance_score": result.get("score", 0),
                        "context": result.get("context", "")
                    })
                
                execution_time = time.time() - start_time
                
                # 生成建议操作
                suggestions = self._generate_search_suggestions(filename, keywords, processed_results)
                
                return MCPToolResult(
                    success=True,
                    data={
                        "filename": filename,
                        "keywords": keywords,
                        "search_type": search_type,
                        "total_results": len(processed_results),
                        "results": processed_results,
                        "search_summary": f"在 {filename} 中找到 {len(processed_results)} 处关于 '{keywords}' 的内容"
                    },
                    metadata={
                        "tool": self.name,
                        "filename": filename,
                        "keywords": keywords,
                        "search_type": search_type
                    },
                    execution_time=execution_time,
                    tool_name=self.name,
                    suggested_next_actions=suggestions
                )
            else:
                return MCPToolResult(
                    success=False,
                    error=f"搜索请求失败，状态码: {response.status_code}",
                    tool_name=self.name
                )
                
        except Exception as e:
            logger.error(f"搜索PDF内容失败: {str(e)}")
            return MCPToolResult(
                success=False,
                error=f"搜索失败: {str(e)}",
                tool_name=self.name
            )
    
    def _generate_search_suggestions(self, filename: str, keywords: str, results: List[Dict]) -> List[str]:
        """基于搜索结果生成建议操作"""
        suggestions = []
        
        if not results:
            suggestions.append(f"尝试使用不同关键词搜索 {filename}")
            suggestions.append("检查关键词拼写或使用同义词")
        elif len(results) == 1:
            page = results[0]["page_number"]
            suggestions.append(f"查看第 {page} 页的详细内容")
            suggestions.append(f"生成第 {page} 页的注释")
        else:
            top_pages = [str(r["page_number"]) for r in results[:3]]
            suggestions.append(f"重点查看第 {', '.join(top_pages)} 页")
            suggestions.append("对搜索结果页面进行批量注释")
            suggestions.append("基于搜索结果创建专题笔记")
        
        return suggestions

class GetPDFInfoTool(MCPTool):
    """获取PDF信息工具"""
    
    def __init__(self):
        super().__init__(
            name="get_pdf_info",
            description="获取PDF文件的基本信息和结构，包括总页数、章节目录、文档属性等",
            category=ToolCategory.PDF_ANALYSIS,
            security_level=ToolSecurityLevel.SAFE
        )
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            security_level=self.security_level,
            parameters={
                "filename": {
                    "type": "string",
                    "description": "PDF文件名（包含.pdf扩展名）"
                },
                "include_structure": {
                    "type": "boolean",
                    "description": "是否包含文档结构信息（目录、章节等）",
                    "default": True
                },
                "include_metadata": {
                    "type": "boolean",
                    "description": "是否包含文档元数据（作者、创建时间等）",
                    "default": False
                }
            },
            required=["filename"],
            examples=[
                {"filename": "高等数学.pdf", "include_structure": True},
                {"filename": "教材.pdf", "include_structure": True, "include_metadata": True}
            ],
            use_cases=[
                "了解PDF文档的整体结构",
                "制定学习计划前的文档分析",
                "快速了解文档的主要内容分布"
            ]
        )
    
    async def execute(self, filename: str, include_structure: bool = True, 
                     include_metadata: bool = False) -> MCPToolResult:
        """执行PDF信息获取"""
        start_time = time.time()
        
        try:
            # 构建请求参数
            params = {
                "include_structure": include_structure,
                "include_metadata": include_metadata
            }
            
            url = f"http://127.0.0.1:8000/api/materials/{filename}/info"
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 200:
                pdf_info = response.json()
                
                execution_time = time.time() - start_time
                
                # 生成建议操作
                suggestions = self._generate_info_suggestions(filename, pdf_info)
                
                return MCPToolResult(
                    success=True,
                    data={
                        "filename": filename,
                        "basic_info": {
                            "total_pages": pdf_info.get("total_pages", 0),
                            "file_size": pdf_info.get("file_size", 0),
                            "creation_date": pdf_info.get("creation_date", ""),
                            "title": pdf_info.get("title", "")
                        },
                        "structure": pdf_info.get("structure", []) if include_structure else [],
                        "metadata": pdf_info.get("metadata", {}) if include_metadata else {},
                        "analysis_summary": self._generate_analysis_summary(pdf_info)
                    },
                    metadata={
                        "tool": self.name,
                        "filename": filename,
                        "include_structure": include_structure,
                        "include_metadata": include_metadata
                    },
                    execution_time=execution_time,
                    tool_name=self.name,
                    suggested_next_actions=suggestions
                )
            else:
                return MCPToolResult(
                    success=False,
                    error=f"无法获取PDF信息，状态码: {response.status_code}",
                    tool_name=self.name
                )
                
        except Exception as e:
            logger.error(f"获取PDF信息失败: {str(e)}")
            return MCPToolResult(
                success=False,
                error=f"获取PDF信息失败: {str(e)}",
                tool_name=self.name
            )
    
    def _generate_analysis_summary(self, pdf_info: Dict) -> str:
        """生成分析摘要"""
        pages = pdf_info.get("total_pages", 0)
        structure = pdf_info.get("structure", [])
        
        summary = f"这是一个 {pages} 页的PDF文档"
        
        if structure:
            chapters = len([item for item in structure if item.get("level") == 1])
            if chapters > 0:
                summary += f"，包含 {chapters} 个主要章节"
        
        if pages < 20:
            summary += "，适合快速阅读"
        elif pages < 100:
            summary += "，中等长度，建议分章节学习"
        else:
            summary += "，内容丰富，建议制定详细学习计划"
        
        return summary
    
    def _generate_info_suggestions(self, filename: str, pdf_info: Dict) -> List[str]:
        """基于PDF信息生成建议操作"""
        suggestions = []
        pages = pdf_info.get("total_pages", 0)
        structure = pdf_info.get("structure", [])
        
        if pages > 0:
            suggestions.append(f"开始阅读第1页")
            if pages > 10:
                suggestions.append("创建学习计划")
            if structure:
                suggestions.append("基于目录结构进行章节学习")
        
        suggestions.append(f"搜索 {filename} 中的特定内容")
        suggestions.append("为重要页面生成注释")
        
        return suggestions

class CreateNoteTool(MCPTool):
    """创建笔记工具"""
    
    def __init__(self, board_id: str):
        super().__init__(
            name="create_note",
            description="创建学习笔记，支持多种笔记类型和格式",
            category=ToolCategory.NOTE_GENERATION,
            security_level=ToolSecurityLevel.CAUTION
        )
        self.board_id = board_id
    
    def get_schema(self) -> MCPToolSchema:
        return MCPToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            security_level=self.security_level,
            parameters={
                "title": {
                    "type": "string",
                    "description": "笔记标题"
                },
                "content": {
                    "type": "string", 
                    "description": "笔记内容，支持Markdown格式"
                },
                "note_type": {
                    "type": "string",
                    "description": "笔记类型",
                    "enum": ["summary", "concept", "example", "question", "plan", "general"],
                    "default": "general"
                },
                "source_info": {
                    "type": "object",
                    "description": "笔记来源信息",
                    "properties": {
                        "filename": {"type": "string"},
                        "page_numbers": {"type": "array", "items": {"type": "integer"}},
                        "keywords": {"type": "array", "items": {"type": "string"}}
                    }
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "笔记标签",
                    "default": []
                }
            },
            required=["title", "content"],
            examples=[
                {
                    "title": "极限的定义",
                    "content": "# 极限的定义\n\n极限是微积分的基础概念...",
                    "note_type": "concept",
                    "tags": ["数学", "极限", "微积分"]
                }
            ],
            use_cases=[
                "总结学习内容",
                "记录重要概念",
                "创建学习计划",
                "整理问题和解答"
            ]
        )
    
    async def execute(self, title: str, content: str, note_type: str = "general",
                     source_info: Dict = None, tags: List[str] = None) -> MCPToolResult:
        """执行笔记创建"""
        start_time = time.time()
        
        try:
            # 构建笔记数据
            note_data = {
                "title": title,
                "content": content,
                "note_type": note_type,
                "board_id": self.board_id,
                "source_info": source_info or {},
                "tags": tags or [],
                "created_at": datetime.now().isoformat()
            }
            
            # 调用笔记创建API
            url = f"http://127.0.0.1:8000/api/notes"
            response = requests.post(url, json=note_data, timeout=30)
            
            if response.status_code == 200:
                result_data = response.json()
                note_id = result_data.get("note_id")
                
                execution_time = time.time() - start_time
                
                # 生成建议操作
                suggestions = self._generate_note_suggestions(note_type, title)
                
                return MCPToolResult(
                    success=True,
                    data={
                        "note_id": note_id,
                        "title": title,
                        "note_type": note_type,
                        "content_length": len(content),
                        "tags": tags or [],
                        "creation_summary": f"成功创建{note_type}类型的笔记：{title}"
                    },
                    metadata={
                        "tool": self.name,
                        "board_id": self.board_id,
                        "note_type": note_type,
                        "note_id": note_id
                    },
                    execution_time=execution_time,
                    tool_name=self.name,
                    suggested_next_actions=suggestions
                )
            else:
                return MCPToolResult(
                    success=False,
                    error=f"创建笔记失败，状态码: {response.status_code}",
                    tool_name=self.name
                )
                
        except Exception as e:
            logger.error(f"创建笔记失败: {str(e)}")
            return MCPToolResult(
                success=False,
                error=f"创建笔记失败: {str(e)}",
                tool_name=self.name
            )
    
    def _generate_note_suggestions(self, note_type: str, title: str) -> List[str]:
        """基于笔记类型生成建议操作"""
        suggestions = []
        
        if note_type == "concept":
            suggestions.append("为这个概念添加实例")
            suggestions.append("查找相关概念建立联系")
        elif note_type == "summary":
            suggestions.append("基于总结创建复习计划")
            suggestions.append("生成相关的练习题")
        elif note_type == "question":
            suggestions.append("尝试解答这个问题")
            suggestions.append("寻找类似问题进行对比")
        else:
            suggestions.append("继续完善笔记内容")
            suggestions.append("为笔记添加更多标签")
        
        suggestions.append("创建相关的新笔记")
        suggestions.append("将笔记导出或分享")
        
        return suggestions

class MCPCapabilityRegistry:
    """MCP能力注册表"""
    
    def __init__(self):
        self.capabilities = {}
        self.tools_by_category = {}
        self.security_policies = {}
    
    def register_capability(self, tool: MCPTool):
        """注册一个新的能力"""
        schema = tool.get_schema()
        self.capabilities[tool.name] = {
            "tool": tool,
            "schema": schema,
            "category": tool.category,
            "security_level": tool.security_level,
            "registered_at": datetime.now().isoformat()
        }
        
        # 按类别分组
        if tool.category not in self.tools_by_category:
            self.tools_by_category[tool.category] = []
        self.tools_by_category[tool.category].append(tool.name)
        
        logger.info(f"注册MCP能力: {tool.name} ({tool.category.value})")
    
    def get_capability(self, name: str) -> Optional[MCPTool]:
        """获取特定能力"""
        cap_info = self.capabilities.get(name)
        return cap_info["tool"] if cap_info else None
    
    def list_capabilities(self) -> List[Dict[str, Any]]:
        """列出所有可用能力"""
        capabilities = []
        for name, cap_info in self.capabilities.items():
            capabilities.append({
                "name": name,
                "description": cap_info["schema"].description,
                "category": cap_info["category"].value,
                "security_level": cap_info["security_level"].value,
                "use_cases": cap_info["schema"].use_cases
            })
        return capabilities
    
    def get_capabilities_by_category(self, category: ToolCategory) -> List[str]:
        """获取特定类别的能力"""
        return self.tools_by_category.get(category, [])
    
    def get_capabilities_description(self) -> str:
        """获取所有能力的详细描述，用于LLM提示"""
        descriptions = []
        
        # 按类别组织描述
        for category in ToolCategory:
            tools_in_category = self.tools_by_category.get(category, [])
            if tools_in_category:
                descriptions.append(f"\n## {category.value.upper()}类工具:")
                
                for tool_name in tools_in_category:
                    cap_info = self.capabilities[tool_name]
                    schema = cap_info["schema"]
                    descriptions.append(schema.get_detailed_description())
        
        return "\n".join(descriptions)

class MCPCommandParser:
    """MCP指令解析器"""
    
    def __init__(self, capability_registry: MCPCapabilityRegistry):
        self.capability_registry = capability_registry
    
    def parse_function_call(self, function_call: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """解析Function Calling格式的指令"""
        try:
            function_name = function_call.get("name")
            function_args = json.loads(function_call.get("arguments", "{}"))
            
            # 验证是否是已注册的能力
            capability = self.capability_registry.get_capability(function_name)
            if not capability:
                return None
            
            return {
                "action": function_name,
                "parameters": function_args,
                "tool": capability
            }
        except Exception as e:
            logger.error(f"解析Function Call失败: {str(e)}")
            return None
    
    def validate_parameters(self, command: Dict[str, Any]) -> bool:
        """验证命令参数"""
        try:
            tool = command["tool"]
            parameters = command["parameters"]
            schema = tool.get_schema()
            
            # 检查必需参数
            for required_param in schema.required:
                if required_param not in parameters:
                    logger.warning(f"缺少必需参数: {required_param}")
                    return False
            
            # 可以添加更多的参数验证逻辑
            return True
        except Exception as e:
            logger.error(f"参数验证失败: {str(e)}")
            return False

class MCPExecutionEngine:
    """MCP执行引擎"""
    
    def __init__(self, capability_registry: MCPCapabilityRegistry):
        self.capability_registry = capability_registry
        self.execution_history = []
        self.active_executions = {}
    
    async def execute_command(self, command: Dict[str, Any], 
                            confirmation_callback: Optional[Callable] = None) -> MCPToolResult:
        """执行命令"""
        execution_id = str(uuid.uuid4())
        start_time = time.time()
        
        try:
            tool = command["tool"]
            parameters = command["parameters"]
            
            # 生成执行上下文
            context = tool.get_execution_context(**parameters)
            context["execution_id"] = execution_id
            
            # 记录活跃执行
            self.active_executions[execution_id] = {
                "tool_name": tool.name,
                "start_time": start_time,
                "status": "running",
                "context": context
            }
            
            # 检查是否需要用户确认
            if tool.requires_confirmation() and confirmation_callback:
                confirmed = await confirmation_callback(tool, parameters)
                if not confirmed:
                    return MCPToolResult(
                        success=False,
                        error="用户取消了操作",
                        tool_name=tool.name
                    )
            
            # 执行工具
            result = await tool.execute(**parameters)
            
            # 更新执行记录
            execution_time = time.time() - start_time
            execution_record = {
                "execution_id": execution_id,
                "tool_name": tool.name,
                "parameters": parameters,
                "result": result.to_dict(),
                "execution_time": execution_time,
                "timestamp": datetime.now().isoformat(),
                "context": context
            }
            
            self.execution_history.append(execution_record)
            
            # 清理活跃执行记录
            if execution_id in self.active_executions:
                del self.active_executions[execution_id]
            
            logger.info(f"工具执行完成: {tool.name} ({execution_time:.2f}s)")
            
            return result
            
        except Exception as e:
            logger.error(f"执行命令失败: {str(e)}")
            
            # 清理活跃执行记录
            if execution_id in self.active_executions:
                del self.active_executions[execution_id]
            
            return MCPToolResult(
                success=False,
                error=f"执行失败: {str(e)}",
                tool_name=command.get("tool", {}).get("name", "unknown")
            )
    
    def get_execution_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """获取执行历史"""
        return self.execution_history[-limit:]
    
    def get_active_executions(self) -> Dict[str, Any]:
        """获取活跃的执行"""
        return self.active_executions.copy()

class MCPContextManager:
    """MCP上下文管理器"""
    
    def __init__(self, max_history: int = 20):
        self.max_history = max_history
        self.conversation_history = []
        self.execution_history = []
        self.application_state = {}
        self.user_preferences = {}
        self.session_metadata = {
            "session_id": str(uuid.uuid4()),
            "created_at": datetime.now().isoformat(),
            "last_activity": datetime.now().isoformat()
        }
    
    def add_conversation_turn(self, user_input: str, assistant_response: str, 
                            executed_commands: List[Dict] = None):
        """添加对话轮次"""
        turn = {
            "turn_id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "user_input": user_input,
            "assistant_response": assistant_response,
            "executed_commands": executed_commands or [],
            "turn_number": len(self.conversation_history) + 1
        }
        
        self.conversation_history.append(turn)
        
        # 保持历史记录在限定范围内
        if len(self.conversation_history) > self.max_history:
            self.conversation_history = self.conversation_history[-self.max_history:]
        
        self._update_last_activity()
    
    def add_execution_record(self, execution_record: Dict[str, Any]):
        """添加执行记录"""
        self.execution_history.append(execution_record)
        
        # 保持执行历史在限定范围内
        if len(self.execution_history) > self.max_history * 2:
            self.execution_history = self.execution_history[-self.max_history * 2:]
    
    def update_application_state(self, state_update: Dict[str, Any]):
        """更新应用状态"""
        self.application_state.update(state_update)
        self._update_last_activity()
    
    def update_user_preferences(self, preferences: Dict[str, Any]):
        """更新用户偏好"""
        self.user_preferences.update(preferences)
    
    def get_context_for_llm(self) -> Dict[str, Any]:
        """获取用于LLM的上下文信息"""
        return {
            "session_metadata": self.session_metadata,
            "conversation_turns": len(self.conversation_history),
            "recent_commands": [
                {
                    "tool_name": record["tool_name"],
                    "success": record["result"]["success"],
                    "timestamp": record["timestamp"]
                }
                for record in self.execution_history[-5:]
            ],
            "application_state": self.application_state,
            "user_preferences": self.user_preferences,
            "last_activity": self.session_metadata["last_activity"]
        }
    
    def get_conversation_summary(self) -> str:
        """获取对话摘要"""
        if not self.conversation_history:
            return "这是一个新的对话会话。"
        
        total_turns = len(self.conversation_history)
        recent_commands = len([r for r in self.execution_history[-10:] if r["result"]["success"]])
        
        summary = f"当前对话已进行 {total_turns} 轮，最近成功执行了 {recent_commands} 个操作。"
        
        if self.application_state:
            current_files = self.application_state.get("current_files", [])
            if current_files:
                summary += f" 当前正在处理 {len(current_files)} 个文件。"
        
        return summary
    
    def _update_last_activity(self):
        """更新最后活动时间"""
        self.session_metadata["last_activity"] = datetime.now().isoformat()

class MCPToolRegistry:
    """简化的MCP工具注册中心"""
    
    def __init__(self, board_id: str):
        self.board_id = board_id
        self.capability_registry = MCPCapabilityRegistry()
        self.command_parser = MCPCommandParser(self.capability_registry)
        self.execution_engine = MCPExecutionEngine(self.capability_registry)
        self.context_manager = MCPContextManager()
        
        # 注册默认工具
        self._register_default_tools()
        
        logger.info(f"MCP工具注册中心已初始化: {board_id}")
    
    def _register_default_tools(self):
        """注册默认工具"""
        # 注册展板文件管理工具
        list_files_tool = ListBoardFilesTool(self.board_id)
        self.capability_registry.register_capability(list_files_tool)
        
        # 注册PDF分析工具
        get_page_tool = GetPDFPageTool()
        self.capability_registry.register_capability(get_page_tool)
        
        search_tool = SearchPDFContentTool()
        self.capability_registry.register_capability(search_tool)
        
        info_tool = GetPDFInfoTool()
        self.capability_registry.register_capability(info_tool)
        
        # 注册内容创建工具
        note_tool = CreateNoteTool(self.board_id)
        self.capability_registry.register_capability(note_tool)
    
    def register_tool(self, tool: MCPTool):
        """注册新工具"""
        self.capability_registry.register_capability(tool)
    
    def get_tool(self, name: str) -> Optional[MCPTool]:
        """获取工具"""
        return self.capability_registry.get_capability(name)
    
    def get_all_tools(self) -> Dict[str, MCPTool]:
        """获取所有工具"""
        return {
            name: info["tool"] 
            for name, info in self.capability_registry.capabilities.items()
        }
    
    def get_openai_functions(self) -> List[Dict[str, Any]]:
        """获取OpenAI Functions格式的工具定义（废弃）"""
        # 为了向后兼容
        return self.get_openai_tools()
    
    def get_openai_tools(self) -> List[Dict[str, Any]]:
        """获取OpenAI格式的工具定义"""
        openai_tools = []
        for tool in self.get_all_tools().values():
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.schema.to_dict()
                }
            })
        return openai_tools
    
    def get_tools_description(self) -> str:
        """获取所有工具的文本描述"""
        descriptions = []
        for tool in self.get_all_tools().values():
            desc = f"- **{tool.name}** ({tool.category.value}): {tool.description}"
            descriptions.append(desc)
        return "\n".join(descriptions)
    
    async def execute_tool(self, name: str, confirmation_callback: Optional[Callable] = None, 
                          **kwargs) -> MCPToolResult:
        """执行工具（简化接口）"""
        tool = self.capability_registry.get_capability(name)
        if not tool:
            return MCPToolResult(
                success=False,
                error=f"未找到工具: {name}",
                tool_name=name
            )
        
        command = {
            "action": name,
            "parameters": kwargs,
            "tool": tool
        }
        
        # 验证参数
        if not self.command_parser.validate_parameters(command):
            return MCPToolResult(
                success=False,
                error=f"工具参数验证失败: {name}",
                tool_name=name
            )
        
        return await self.execution_engine.execute_command(command, confirmation_callback)
    
    async def execute_function_call(self, function_call: Dict[str, Any], 
                                  confirmation_callback: Optional[Callable] = None) -> MCPToolResult:
        """执行Function Call格式的指令"""
        command = self.command_parser.parse_function_call(function_call)
        if not command:
            return MCPToolResult(
                success=False,
                error="无法解析Function Call指令",
                tool_name=function_call.get("name", "unknown")
            )
        
        # 验证参数
        if not self.command_parser.validate_parameters(command):
            return MCPToolResult(
                success=False,
                error=f"参数验证失败",
                tool_name=command["tool"].name
            )
        
        result = await self.execution_engine.execute_command(command, confirmation_callback)
        
        # 记录执行到上下文
        if hasattr(self.execution_engine, 'execution_history') and self.execution_engine.execution_history:
            latest_execution = self.execution_engine.execution_history[-1]
            self.context_manager.add_execution_record(latest_execution)
        
        return result
    
    def get_capabilities_description(self) -> str:
        """获取能力描述"""
        return self.capability_registry.get_capabilities_description()
    
    def get_system_context(self) -> Dict[str, Any]:
        """获取系统上下文"""
        return self.context_manager.get_context_for_llm()
    
    def update_application_state(self, state_update: Dict[str, Any]):
        """更新应用状态"""
        self.context_manager.update_application_state(state_update)
    
    def get_execution_stats(self) -> Dict[str, Any]:
        """获取执行统计"""
        history = self.execution_engine.get_execution_history(50)
        
        stats = {
            "total_executions": len(history),
            "successful_executions": len([r for r in history if r["result"]["success"]]),
            "failed_executions": len([r for r in history if not r["result"]["success"]]),
            "tools_used": {},
            "avg_execution_time": 0,
            "active_executions": len(self.execution_engine.get_active_executions())
        }
        
        if history:
            # 工具使用统计
            for record in history:
                tool_name = record["tool_name"]
                if tool_name not in stats["tools_used"]:
                    stats["tools_used"][tool_name] = 0
                stats["tools_used"][tool_name] += 1
            
            # 平均执行时间
            total_time = sum(r["execution_time"] for r in history)
            stats["avg_execution_time"] = total_time / len(history)
        
        return stats 