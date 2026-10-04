import React, { useRef, useState, useEffect } from 'react';

/**
 * MagneticButton
 * Adds a subtle, premium physical pull effect towards the cursor on hover.
 * Maximum displacement is strictly bounded (4–6px) to maintain ergonomics.
 * Automatically disables on touch devices and when prefers-reduced-motion is active.
 */
export function MagneticButton({
  children,
  className = '',
  maxDisplacement = 5,
  onClick,
  disabled = false,
  type = 'button',
  title,
  ...props
}) {
  const buttonRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    // Check if device supports true hover and motion is permitted
    const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setCanHover(hasHover && !prefersReducedMotion);
  }, []);

  const handleMouseMove = (e) => {
    if (!canHover || disabled || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;

    // Constrain to maximum displacement
    const distance = Math.hypot(deltaX, deltaY);
    const maxDist = Math.max(rect.width, rect.height);
    const factor = Math.min(distance / maxDist, 1);

    const pullX = (deltaX / (rect.width / 2)) * maxDisplacement * factor;
    const pullY = (deltaY / (rect.height / 2)) * maxDisplacement * factor;

    setOffset({
      x: Math.max(-maxDisplacement, Math.min(maxDisplacement, pullX)),
      y: Math.max(-maxDisplacement, Math.min(maxDisplacement, pullY))
    });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  return (
    <button
      ref={buttonRef}
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      title={title}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        transition: offset.x === 0 && offset.y === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'transform 0.1s ease-out'
      }}
      className={`btn-tactile ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default MagneticButton;
