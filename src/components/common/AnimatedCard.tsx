import React from 'react';
import { Card, type CardProps } from '@mui/material';
import { motion, useReducedMotion, type MotionProps } from 'framer-motion';
import { ANIMATIONS } from '@/constants/styles';

type AnimatedCardProps = CardProps & {
  delay?: number;
  enableHover?: boolean;
  onClick?: () => void;
  motionProps?: Omit<MotionProps, 'initial' | 'animate' | 'variants' | 'onClick'>;
};

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  delay = 0,
  enableHover = true,
  onClick,
  motionProps,
  ...cardProps
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={
        shouldReduceMotion
          ? undefined
          : delay > 0
            ? ANIMATIONS.cardWithDelay(delay)
            : ANIMATIONS.card
      }
      initial={shouldReduceMotion ? false : 'hidden'}
      animate={shouldReduceMotion ? undefined : 'visible'}
      whileHover={!shouldReduceMotion && enableHover ? ANIMATIONS.cardHover.hover : undefined}
      whileTap={!shouldReduceMotion && enableHover ? ANIMATIONS.cardHover.tap : undefined}
      onClick={onClick}
      style={{ width: '100%', height: '100%', cursor: onClick ? 'pointer' : 'default' }}
      {...motionProps}
    >
      <Card {...cardProps}>{children}</Card>
    </motion.div>
  );
};

export default AnimatedCard;
