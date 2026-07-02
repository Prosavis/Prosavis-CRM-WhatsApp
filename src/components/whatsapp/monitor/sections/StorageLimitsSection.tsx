import React, { useState } from 'react';
import {
  Box, Stack, Typography, Collapse, IconButton, Table, TableBody, TableCell,
  TableHead, TableRow, Link, Chip,
} from '@mui/material';
import {
  Policy as PolicyIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import {
  META_MEDIA_LIMITS,
  STORAGE_LIMITS,
  STORAGE_ERROR_CODES,
} from '@/constants/storageLimits';

const DOCS_URL = 'https://github.com/prosavis/prosavis-firebase/blob/main/docs/whatsapp/WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md';

const StorageLimitsSection: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <BentoCard>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <PolicyIcon color="info" />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Límites y políticas
        </Typography>
        <Chip label="Meta + Supabase" size="small" variant="outlined" />
        <IconButton size="small" aria-label={open ? 'Colapsar' : 'Expandir'}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Plan Free Supabase: {STORAGE_LIMITS.bucketObjectMaxLabel} por objeto · 1 GB total · TUS desde {STORAGE_LIMITS.tusThresholdLabel}
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Meta WhatsApp</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Bucket whatsapp-media</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.values(META_MEDIA_LIMITS).map((row) => (
                <TableRow key={row.label}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{row.maxLabel}</TableCell>
                  <TableCell>
                    {row.label.includes('Documento') ? STORAGE_LIMITS.bucketObjectMaxLabel : '—'}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>Plan total</TableCell>
                <TableCell>—</TableCell>
                <TableCell>1 GB (Free)</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.5 }}>
            Códigos de error frecuentes:
          </Typography>
          <Stack spacing={0.5}>
            {Object.entries(STORAGE_ERROR_CODES).map(([code, desc]) => (
              <Typography key={code} variant="caption" component="div">
                <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{code}</Box>
                {' — '}{desc}
              </Typography>
            ))}
          </Stack>

          <Link href={DOCS_URL} target="_blank" rel="noopener" variant="caption" sx={{ display: 'inline-block', mt: 1.5 }}>
            Ver documentación de arquitectura
          </Link>
        </Box>
      </Collapse>
    </BentoCard>
  );
};

export default StorageLimitsSection;
