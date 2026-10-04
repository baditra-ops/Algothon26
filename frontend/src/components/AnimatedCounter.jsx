import React, { useEffect, useState } from 'react';

/**
 * AnimatedCounter
 * Smoothly interpolates an integer count from 0 to target value on mount or update.
 * Honors prefers-reduced-motion for instant rendering.
 */
export function AnimatedCounter({ value = 0, duration = 400, className = '' }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const startValue = displayValue;
    const endValue = Number(value) || 0;
    if (startValue === endValue) return;

    const startTime = performance.now();

    let animationFrame;
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * easeProgress);

      setDisplayValue(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    };

    animationFrame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}

export default AnimatedCounter;
