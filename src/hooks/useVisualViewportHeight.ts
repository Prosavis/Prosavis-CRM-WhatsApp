import { useEffect } from 'react';

const VIEWPORT_HEIGHT_PROPERTY = '--crm-viewport-height';

export function useVisualViewportHeight(): void {
  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    let animationFrame = 0;

    const updateViewportHeight = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const height = visualViewport?.height ?? window.innerHeight;
        root.style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${Math.round(height)}px`);
      });
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight, { passive: true });
    visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true });
    visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateViewportHeight);
      visualViewport?.removeEventListener('resize', updateViewportHeight);
      visualViewport?.removeEventListener('scroll', updateViewportHeight);
      root.style.removeProperty(VIEWPORT_HEIGHT_PROPERTY);
    };
  }, []);
}
