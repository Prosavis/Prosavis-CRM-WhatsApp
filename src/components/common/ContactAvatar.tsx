import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, type SxProps, type Theme } from '@mui/material';
import {
  getContactAvatarColor,
  getContactInitials,
} from '@/utils/contactAvatar';
import { isHttpPhotoUrl, resolvePhotoUrl } from '@/utils/resolvePhotoUrl';

export interface ContactAvatarProps {
  displayName?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  size?: number;
  sx?: SxProps<Theme>;
}

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  displayName,
  phone,
  photoUrl,
  size = 40,
  sx,
}) => {
  const [imgError, setImgError] = useState(false);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | undefined>(undefined);

  const initials = useMemo(
    () => getContactInitials(displayName, phone),
    [displayName, phone],
  );
  const bgColor = useMemo(() => getContactAvatarColor(initials), [initials]);

  useEffect(() => {
    let cancelled = false;
    setImgError(false);

    if (!photoUrl?.trim()) {
      setResolvedPhotoUrl(undefined);
      return () => {
        cancelled = true;
      };
    }

    const trimmed = photoUrl.trim();
    if (isHttpPhotoUrl(trimmed)) {
      setResolvedPhotoUrl(trimmed);
      return () => {
        cancelled = true;
      };
    }

    void resolvePhotoUrl(trimmed).then((url) => {
      if (!cancelled) setResolvedPhotoUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const showImage = !!resolvedPhotoUrl && !imgError;

  return (
    <Avatar
      src={showImage ? resolvedPhotoUrl : undefined}
      imgProps={{
        onError: () => setImgError(true),
      }}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        fontWeight: 600,
        bgcolor: bgColor,
        color: '#fff',
        flexShrink: 0,
        ...sx,
      }}
    >
      {initials}
    </Avatar>
  );
};
