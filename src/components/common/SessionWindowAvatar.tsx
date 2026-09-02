import React, { useEffect, useMemo, useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import {
  formatSessionWindowRemainingLabel,
  getMetaSessionWindow,
  sessionWindowRemainingMs,
  sessionWindowRemainingRatio,
  sessionWindowStrokeColor,
} from '../../../supabase/functions/_shared/metaSessionWindow';
import { ContactAvatar, type ContactAvatarProps } from './ContactAvatar';
import {
  SESSION_WINDOW_RING_PADDING,
  sessionWindowRingDashoffset,
  sessionWindowRingMetrics,
} from '@/utils/sessionWindowRing';

export interface SessionWindowAvatarProps extends ContactAvatarProps {
  lastInboundAt?: Date | string | null;
}

export const SessionWindowAvatar: React.FC<SessionWindowAvatarProps> = React.memo(({
  lastInboundAt,
  size = 40,
  displayName,
  phone,
  photoUrl,
  sx,
}) => {
  const [expired, setExpired] = useState(false);
  const [label, setLabel] = useState(() => formatSessionWindowRemainingLabel(lastInboundAt));
  const inboundKey = lastInboundAt instanceof Date
    ? lastInboundAt.toISOString()
    : lastInboundAt ?? '';

  useEffect(() => {
    setExpired(false);
    setLabel(formatSessionWindowRemainingLabel(lastInboundAt));
  }, [inboundKey, lastInboundAt]);

  const sessionWindow = useMemo(
    () => getMetaSessionWindow(lastInboundAt),
    [inboundKey, lastInboundAt],
  );
  const metrics = useMemo(() => sessionWindowRingMetrics(size), [size]);
  const remainingMs = sessionWindowRemainingMs(lastInboundAt);
  const remainingRatio = sessionWindowRemainingRatio(lastInboundAt);
  const status = expired && sessionWindow.status === 'open' ? 'closed' : sessionWindow.status;
  const ratio = status === 'open' ? (remainingRatio ?? 0) : 0;
  const dashoffset = sessionWindowRingDashoffset(metrics.circumference, ratio);
  const stroke = status === 'open'
    ? sessionWindowStrokeColor(ratio)
    : status === 'closed'
      ? 'hsl(0, 90%, 42%)'
      : '#9e9e9e';

  return (
    <Tooltip
      title={label}
      onOpen={() => setLabel(formatSessionWindowRemainingLabel(lastInboundAt))}
    >
      <Box
        data-testid="session-window-avatar"
        aria-label={label}
        sx={{
          position: 'relative',
          width: metrics.outer,
          height: metrics.outer,
          flexShrink: 0,
          '@keyframes sessionWindowRingDeplete': {
            from: {
              strokeDashoffset: 'var(--session-ring-from-offset)',
              stroke: 'var(--session-ring-from-color)',
            },
            to: {
              strokeDashoffset: 'var(--session-ring-circumference)',
              stroke: 'hsl(0, 90%, 42%)',
            },
          },
        }}
      >
        <svg
          width={metrics.outer}
          height={metrics.outer}
          viewBox={`0 0 ${metrics.outer} ${metrics.outer}`}
          aria-hidden
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <circle
            cx={metrics.center}
            cy={metrics.center}
            r={metrics.radius}
            fill="none"
            stroke={status === 'unknown' ? '#bdbdbd' : 'rgba(0,0,0,0.08)'}
            strokeWidth={status === 'closed' ? 2 : metrics.stroke}
            strokeDasharray={status === 'unknown' ? '3 4' : undefined}
          />
          {status === 'open' && remainingMs != null && remainingMs > 0 && (
            <circle
              cx={metrics.center}
              cy={metrics.center}
              r={metrics.radius}
              fill="none"
              stroke={stroke}
              strokeWidth={metrics.stroke}
              strokeLinecap="round"
              strokeDasharray={metrics.circumference}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${metrics.center} ${metrics.center})`}
              style={{
                ['--session-ring-from-offset' as string]: String(dashoffset),
                ['--session-ring-from-color' as string]: stroke,
                ['--session-ring-circumference' as string]: String(metrics.circumference),
                animation:
                  typeof window !== 'undefined' &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'none'
                    : `sessionWindowRingDeplete ${remainingMs}ms linear forwards`,
              }}
              onAnimationEnd={() => setExpired(true)}
            />
          )}
          {status === 'closed' && (
            <circle
              cx={metrics.center}
              cy={metrics.center}
              r={metrics.radius}
              fill="none"
              stroke="hsl(0, 90%, 42%)"
              strokeWidth={2}
              opacity={0.9}
            />
          )}
        </svg>
        <Box
          sx={{
            position: 'absolute',
            top: SESSION_WINDOW_RING_PADDING,
            left: SESSION_WINDOW_RING_PADDING,
          }}
        >
          <ContactAvatar
            displayName={displayName}
            phone={phone}
            photoUrl={photoUrl}
            size={size}
            sx={sx}
          />
        </Box>
      </Box>
    </Tooltip>
  );
});

SessionWindowAvatar.displayName = 'SessionWindowAvatar';
