import React from 'react';
import {
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
  onTransition: (id: string, change: JobStageChange) => Promise<void> | void;
}

function hasDirectoryTag(tags: string[] | null | undefined, name: string): boolean {
  const needle = name.toLowerCase();
  return (tags ?? []).some((tag) => tag.trim().toLowerCase() === needle);
}

function fitColor(rank: number | null | undefined): 'success' | 'info' | 'default' {
  if (rank === 2) return 'success';
  if (rank === 1) return 'info';
  return 'default';
}

export const JobApplicationTable: React.FC<JobApplicationTableProps> = ({
  items,
  onOpen,
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
    <Table size="small" data-testid="jobs-table">
      <TableHead>
        <TableRow>
          <TableCell>Candidata</TableCell>
          <TableCell>Marca</TableCell>
          <TableCell>Estado</TableCell>
          <TableCell>Teléfono</TableCell>
          <TableCell>Cita</TableCell>
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
              {row.candidate?.full_name ?? 'Sin nombre'}
              {row.needs_review ? (
                <Chip size="small" label="Revisar" color="warning" sx={{ ml: 1 }} />
              ) : null}
              {hasDirectoryTag(row.directory?.tags, 'despedida')
                || hasDirectoryTag(row.directory?.tags, 'auxiliares desactivadas') ? (
                <Chip size="small" label="Despedida" sx={{ ml: 1 }} />
              ) : null}
              {row.needs_stage_review && row.legacy_stage ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Antes: ${jobStageLabel(row.legacy_stage)}`}
                  sx={{ ml: 1 }}
                />
              ) : null}
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                label={fitMarkLabel(row.fit_rank)}
                color={fitColor(row.fit_rank)}
                variant={row.fit_rank === 2 ? 'filled' : 'outlined'}
              />
            </TableCell>
            <TableCell sx={{ minWidth: 220 }}>
              <JobStageControl
                value={row.stage}
                onChange={(change) => onTransition(row.id, change)}
                onHire={() => onOpen(row.id)}
              />
            </TableCell>
            <TableCell>{row.candidate?.phone ?? '—'}</TableCell>
            <TableCell>
              {row.interview_at
                ? new Date(row.interview_at).toLocaleString('es-CO', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
                : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
