import { useRef, useEffect, useState, ReactEventHandler } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // pixels
}

interface TouchCoordinates {
  x: number;
  y: number;
}

/**
 * Hook để detect swipe gestures (trái/phải)
 * Dùng cho mobile actions: vuốt phải = duyệt, vuốt trái = từ chối
 */
export function useSwipeGesture(options: SwipeGestureOptions) {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = options;
  const touchStart = useRef<TouchCoordinates | null>(null);
  const touchEnd = useRef<TouchCoordinates | null>(null);
  const [isGesturing, setIsGesturing] = useState(false);

  const handleTouchStart: ReactEventHandler<HTMLDivElement> = (e) => {
    const touchEvent = e as React.TouchEvent<HTMLDivElement>;
    setIsGesturing(true);
    touchStart.current = {
      x: touchEvent.changedTouches[0].clientX,
      y: touchEvent.changedTouches[0].clientY,
    };
  };

  const handleTouchEnd: ReactEventHandler<HTMLDivElement> = (e) => {
    const touchEvent = e as React.TouchEvent<HTMLDivElement>;
    touchEnd.current = {
      x: touchEvent.changedTouches[0].clientX,
      y: touchEvent.changedTouches[0].clientY,
    };

    if (!touchStart.current || !touchEnd.current) return;

    const distance = touchStart.current.x - touchEnd.current.x;
    const isLongEnough = Math.abs(distance) > threshold;
    const isNotVertical = Math.abs(touchStart.current.y - touchEnd.current.y) < 50;

    // Swiped left
    if (distance > threshold && isNotVertical) {
      onSwipeLeft?.();
    }

    // Swiped right
    if (distance < -threshold && isNotVertical) {
      onSwipeRight?.();
    }

    setIsGesturing(false);
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    isGesturing,
  };
}

/**
 * Advanced swipe component wrapper để dễ sử dụng
 */
export interface SwipeableElementProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

export function useSwipeableElement(
  ref: React.RefObject<HTMLElement>,
  options: SwipeGestureOptions
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const { onTouchStart, onTouchEnd } = useSwipeGesture(options);

    const handleTouchStart = (e: TouchEvent) => {
      onTouchStart(e as unknown as React.TouchEvent<HTMLDivElement>);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      onTouchEnd(e as unknown as React.TouchEvent<HTMLDivElement>);
    };

    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, options]);
}
