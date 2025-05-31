import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

const ContextMenu = ({ visible, position, items, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      console.log('基础菜单组件显示', position, items.length);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose, position, items]);

  const handleItemClick = (item) => {
    console.log('基础菜单组件点击项目', item);
    if (item.onClick && typeof item.onClick === 'function') {
      item.onClick();
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <div 
      className="context-menu" 
      style={{ top: position.y, left: position.x }}
      ref={menuRef}
    >
      <ul>
        {items.map((item, index) => {
          if (item.type === 'divider') {
            return <hr key={`divider-${index}`} />;
          }
          
          return (
            <li 
              key={index} 
              onClick={() => handleItemClick(item)}
              className={item.disabled ? 'disabled' : (item.danger ? 'danger' : '')}
            >
              {item.icon && <span className="menu-icon">{item.icon}</span>}
              {item.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ContextMenu; 