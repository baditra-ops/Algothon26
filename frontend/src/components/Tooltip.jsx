import React, { useState } from 'react';

/**
 * Tooltip
 * Lightweight accessible tooltip for icon-only buttons.
 */
export function Tooltip({ text, children, position = 'top' }) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <div
          role="tooltip"
          className={`absolute ${positionClasses[position] || positionClasses.top} z-50 pointer-events-none whitespace-nowrap rounded-md bg-slate-900 border border-slate-700/80 px-2 py-1 text-[11px] font-medium text-slate-200 shadow-xl transition-opacity animate-page-enter`}
        >
          {text}
        </div>
      )}
    </div>
  );
}

export default Tooltip;
