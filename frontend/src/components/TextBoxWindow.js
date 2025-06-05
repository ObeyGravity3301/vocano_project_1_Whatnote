import React, { useState, useEffect } from 'react';
import { Input, Button, message } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import './TextBoxWindow.css';
import api from '../api';

const { TextArea } = Input;

/**
 * 简单文本框窗口组件
 * 用于显示通过控制台创建的文本框，支持手动编辑和通过指令修改
 */
const TextBoxWindow = ({ 
  window,
  boardId,
  onContentChange,
  onClose
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(window.content || '');
  const [saving, setSaving] = useState(false);

  // 同步外部内容变化
  useEffect(() => {
    setContent(window.content || '');
  }, [window.content]);

  // 保存内容到后端
  const saveContent = async (newContent) => {
    try {
      setSaving(true);
      
      // 通过API更新窗口内容
      const response = await api.put(`/api/boards/${boardId}/windows/${window.id}`, {
        ...window,
        content: newContent
      });
      
      if (response.status === 200) {
        message.success('内容已保存');
        if (onContentChange) {
          onContentChange(newContent);
        }
      }
    } catch (error) {
      console.error('保存内容失败:', error);
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 处理编辑模式切换
  const handleEdit = () => {
    setIsEditing(true);
  };

  // 处理保存
  const handleSave = async () => {
    await saveContent(content);
    setIsEditing(false);
  };

  // 处理取消编辑
  const handleCancel = () => {
    setContent(window.content || '');
    setIsEditing(false);
  };

  return (
    <div className="textbox-window" data-window-id={window.id} data-window-type="textbox">
      <div className="textbox-content">
        {isEditing ? (
          <div className="textbox-edit-mode">
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里输入文本内容..."
              autoSize={{ minRows: 3, maxRows: 10 }}
              style={{ marginBottom: '12px' }}
            />
            <div className="textbox-controls">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
                size="small"
              >
                保存
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={handleCancel}
                size="small"
                style={{ marginLeft: '8px' }}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="textbox-view-mode">
            <div 
              className="textbox-display"
              onClick={handleEdit}
              style={{
                minHeight: '60px',
                padding: '8px',
                border: '1px dashed #d9d9d9',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: content ? '#fafafa' : '#f5f5f5',
                whiteSpace: 'pre-wrap'
              }}
            >
              {content || (
                <span style={{ color: '#999', fontStyle: 'italic' }}>
                  点击编辑内容...
                </span>
              )}
            </div>
            <div className="textbox-controls" style={{ marginTop: '8px' }}>
              <Button
                type="dashed"
                icon={<EditOutlined />}
                onClick={handleEdit}
                size="small"
              >
                编辑
              </Button>
            </div>
          </div>
        )}
      </div>
      
      <div className="textbox-info">
        <small style={{ color: '#666' }}>
          ID: {window.id} | 类型: {window.type} | 可通过控制台 "window write {window.id} 内容" 修改
        </small>
      </div>
    </div>
  );
};

export default TextBoxWindow; 