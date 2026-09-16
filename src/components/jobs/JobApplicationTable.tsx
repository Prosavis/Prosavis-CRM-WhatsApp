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
import { jobStageLabel, maskDocumentNumber } from '@/utils/jobApplicationsDomain';

interface JobApplicationTableProps {
  items: JobApplicationListItem[];
  onOpen: (id: string) => void;
}

export const JobApplicationTable: React.FC<JobApplicationTableProps> = ({ items, onOpen }) => {
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
          <TableCell>Remitente</TableCell>
          <TableCell>Etapa</TableCell>
          <TableCell>Fuente</TableCell>
          <TableCell>Documento</TableCell>
          <TableCell>Alta</TableCell>
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
            </TableCell>
            <TableCell>{row.directory?.full_name ?? row.directory?.phone ?? '—'}</TableCell>
            <TableCell>{jobStageLabel(row.stage)}</TableCell>
            <TableCell>{row.source_channel}</TableCell>
            <TableCell>{maskDocumentNumber(row.candidate?.document_number)}</TableCell>
            <TableCell>{new Date(row.created_at).toLocaleDateString('es-CO')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
