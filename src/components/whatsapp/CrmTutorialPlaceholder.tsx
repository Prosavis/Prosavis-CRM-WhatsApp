import React, { useState } from 'react';
import { IconButton, Popover, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const CrmTutorialPlaceholder: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Tutorial del CRM (próximamente)">
        <IconButton
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-label="Tutorial del CRM"
          aria-expanded={open}
          sx={{ width: 36, height: 36, color: 'text.secondary' }}
        >
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { maxWidth: 280, p: 1.5 } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          Tutorial del CRM
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Aquí va el tutorial del CRM. Todavía no está listo.
        </Typography>
      </Popover>
    </>
  );
};

export default CrmTutorialPlaceholder;
