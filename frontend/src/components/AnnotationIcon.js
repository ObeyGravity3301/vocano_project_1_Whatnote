import React, { useState } from "react";
import { Popover } from "antd";
import "./AnnotationIcon.css";

function AnnotationIcon({ x, y, content }) {
  const [visible, setVisible] = useState(false);

  return (
    <Popover
      content={content}
      title="批注"
      trigger="hover"
      open={visible}
      onOpenChange={setVisible}
    >
      <div
        className="annotation-icon"
        style={{
          left: x,
          top: y,
          position: "absolute",
          zIndex: 10,
          cursor: "pointer"
        }}
      >
        <span role="img" aria-label="注释">💬</span>
      </div>
    </Popover>
  );
}

export default AnnotationIcon; 