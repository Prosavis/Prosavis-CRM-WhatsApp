import { useState } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { Box, CircularProgress, IconButton, TextField, Tooltip } from '@mui/material';

const MAX_INSTRUCTION_CHARS = 2000;

export interface SuggestionSparkleControlProps {
  disabled?: boolean;
  loading?: boolean;
  onRequest: (extraContext?: string) => void;
}

export default function SuggestionSparkleControl({
  disabled = false,
  loading = false,
  onRequest,
}: SuggestionSparkleControlProps) {
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const blocked = disabled || loading;

  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.25, minWidth: 0 }}>
      {instructionOpen && (
        <TextField
          size="small"
          value={instruction}
          disabled={blocked}
          placeholder="Instrucción opcional"
          onChange={(event) => setInstruction(event.target.value.slice(0, MAX_INSTRUCTION_CHARS))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onRequest(instruction.trim() || undefined);
            }
          }}
          inputProps={{ 'aria-label': 'Instrucción opcional para la sugerencia', maxLength: MAX_INSTRUCTION_CHARS }}
          sx={{ minWidth: 180, flex: 1 }}
        />
      )}
      <Tooltip title={instructionOpen ? 'Ocultar instrucción' : 'Agregar instrucción'}>
        <span>
          <IconButton
            size="small"
            disabled={blocked}
            aria-label="Agregar instrucción para la sugerencia"
            aria-expanded={instructionOpen}
            onClick={() => setInstructionOpen((open) => !open)}
          >
            <EditNoteIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Sugerir respuesta">
        <span>
          <IconButton
            size="small"
            disabled={blocked}
            aria-label="Sugerir respuesta"
            onClick={() => onRequest(instruction.trim() || undefined)}
            sx={{ color: loading ? undefined : '#7c3aed' }}
          >
            {loading ? <CircularProgress size={20} /> : <AutoAwesomeIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
