import React from 'react';
import { Card, CardContent, CardProps, useTheme } from '@mui/material';
import { motion } from 'framer-motion';

type BentoCardProps = {
  children: React.ReactNode;
  animate?: boolean;
  delay?: number;
  variant?: 'default' | 'kpi' | 'chart';
  onClick?: () => void;
} & Omit<CardProps, 'onClick'>;

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] },
  }),
};

const MotionCard = motion(Card);

const BentoCard: React.FC<BentoCardProps> = ({
  children,
  animate = true,
  delay = 0,
  variant = 'default',
  onClick,
  sx,
  ...cardProps
}) => {
  const theme = useTheme();

  return (
    <MotionCard
      variants={animate ? cardVariants : undefined}
      custom={delay}
      initial={animate ? 'hidden' : undefined}
      animate={animate ? 'visible' : undefined}
      whileHover={animate ? { y: -2, transition: { duration: 0.2 } } : undefined}
      elevation={0}
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px',
        bgcolor: 'background.paper',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease-out',
        '&:hover': onClick ? { boxShadow: theme.shadows[2] } : undefined,
        ...sx,
      }}
      {...cardProps}
    >
      <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 2.5 }, '&:last-child': { pb: { xs: 1.5, sm: 2, md: 2.5 } } }}>
        {children}
      </CardContent>
    </MotionCard>
  );
};

export default BentoCard;
