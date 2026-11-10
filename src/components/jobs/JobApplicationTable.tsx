import React from 'react';
import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { JobApplicationListItem } from '@/types/jobApplications';
import { fitMarkLabel, jobStageLabel } from '@/utils/jobApplicationsDomain';
import { JobStageControl, type JobStageChange } from '@/components/jobs/JobStageControl';

interface JobApplicationTableProps {
  items: JobApplicationListItem[];
  onOpen: (id: string) => void;
  onChat: (row: JobApplicationListItem) => void;
  onTransition: (id: string, change: JobStageChange) => Promise<void> | void;
}

function hasDirectoryTag(tags: string[] | null | undefined, name: string): boolean {
  const needle = name.toLowerCase();
  return (tags ?? []).some((tag) => tag.trim().toLowerCase() === needle);
}

function arrivedLabel(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fitColor(rank: number | null | undefined): 'success' | 'info' | 'default' {
  if (rank === 2) return 'success';
  if (rank === 1) return 'info';
  return 'default';
}

export const JobApplicationTable: React.FC<JobApplicationTableProps> = ({
  items,
  onOpen,
  onChat,
  onTransition,
}) => {
  if (items.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4 }} data-testid="jobs-empty">
        No hay solicitudes con estos filtros.
      </Typography>
    );
  }

  return (
    <Table size="medium" data-testid="jobs-table" sx={{ '& td, & th': { borderColor: 'divider' } }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>Candidata</TableCell>
          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>Marca</TableCell>
          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>Estado</TableCell>
          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>Contactó</TableCell>
          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }} />
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((row) => (
          <TableRow
            key={row.id}
            hover
            onClick={() => onOpen(row.id)}
            sx={{ cursor: 'pointer' }}
            data-testid={`jobs-row-${row.id}`}
          >
            <TableCell>
              <Typography variant="body2" fontWeight={600}>
                {row.candidate?.full_name ?? 'Sin nombre'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {row.candidate?.phone ?? 'Sin teléfono'}
                {row.interview_at
                  ? ` · Cita ${new Date(row.interview_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`
                  : ''}
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {row.needs_review ? <Chip size="small" label="Revisar" color="warning" /> : null}
                {hasDirectoryTag(row.directory?.tags, 'despedida')
                  || hasDirectoryTag(row.directory?.tags, 'auxiliares desactivadas') ? (
                  <Chip size="small" label="Despedida" variant="outlined" />
                ) : null}
                {row.needs_stage_review && row.legacy_stage ? (
                  <Chip size="small" variant="outlined" label={`Antes: ${jobStageLabel(row.legacy_stage)}`} />
                ) : null}
              </Box>
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                label={fitMarkLabel(row.fit_rank)}
                color={fitColor(row.fit_rank)}
                variant={row.fit_rank === 2 ? 'filled' : 'outlined'}
              />
            </TableCell>
            <TableCell sx={{ minWidth: 200, width: 220 }}>
              <JobStageControl
                value={row.stage}
                onChange={(change) => onTransition(row.id, change)}
                onHire={() => onOpen(row.id)}
              />
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {arrivedLabel(row.created_at)}
            </TableCell>
            <TableCell>
              <Button
                size="small"
                variant="outlined"
                disabled={!row.sources?.some((source) => source.conversation_stable_key) && !row.candidate?.phone && !row.directory?.phone}
                onClick={(event) => {
                  event.stopPropagation();
                  onChat(row);
                }}
              >
                Chat
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
