import React, { useEffect, useState } from 'react';

/**
 * CursorGlow
 * Renders a soft, ambient radial glow following the cursor.
 * Disabled on touch screens, small viewports, and reduced-motion modes.
 */
export function CursorGlow() {
  const [position, setPosition] = useState({ x: -1000, y: -1000 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only enable for pointer devices with hover and standard motion
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isFinePointer || prefersReducedMotion) {
      return;
    }

    let frameId;
    const handleMouseMove = (e) => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setPosition({ x: e.clientX, y: e.clientY });
        if (!visible) setVisible(true);
      });
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(frameId);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full blur-3xl opacity-20"
        style={{
          width: '500px',
          height: '500px',
          left: `${position.x - 250}px`,
          top: `${position.y - 250}px`,
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.25) 0%, rgba(13, 148, 136, 0.08) 40%, transparent 70%)',
          willChange: 'transform, left, top',
          transform: 'translate3d(0, 0, 0)'
        }}
      />
    </div>
  );
}

export default CursorGlow;
