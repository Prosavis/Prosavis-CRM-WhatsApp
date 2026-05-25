import { useState, type FormEvent } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface MessageInputProps {
  disabled?: boolean;
  onSend: (message: string) => Promise<void>;
}

export default function MessageInput({ disabled = false, onSend }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 2,
        borderTop: '1px solid rgba(7, 94, 84, 0.1)',
        bgcolor: 'rgba(255,255,255,0.9)',
      }}
    >
      <TextField
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Escribe una respuesta..."
        multiline
        maxRows={4}
        fullWidth
        disabled={disabled || sending}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={disabled || sending || !message.trim()}
        endIcon={<SendIcon />}
        sx={{ alignSelf: 'flex-end' }}
      >
        Enviar
      </Button>
    </Box>
  );
}
