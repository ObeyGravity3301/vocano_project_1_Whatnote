import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './NoteWindow.css';

/**
 * 支持数学公式的Markdown渲染组件
 * 使用KaTeX渲染数学公式
 * 支持GitHub风格的Markdown和数学公式
 * 
 * @param {Object} props 组件属性
 * @param {string} props.children Markdown内容
 * @param {Object} props.remarkPlugins 额外的remark插件
 * @param {Object} props.rehypePlugins 额外的rehype插件
 * @param {Object} props.components 自定义组件
 * @param {Object} props.className CSS类名
 * @param {Object} props.style 内联样式
 */
const MarkdownMathRenderer = ({ 
  children, 
  remarkPlugins = [], 
  rehypePlugins = [], 
  components = {},
  className = '',
  style = {}
}) => {
  return (
    <div className={`markdown-math-renderer ${className}`} style={style}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, ...remarkPlugins]}
        rehypePlugins={[rehypeKatex, ...rehypePlugins]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownMathRenderer; 