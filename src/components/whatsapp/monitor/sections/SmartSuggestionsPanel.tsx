import React from 'react';
import { Alert, Stack } from '@mui/material';
import type { StorageSuggestion } from '@/services/monitorService';

interface SmartSuggestionsPanelProps {
  suggestions: StorageSuggestion[];
}

const SmartSuggestionsPanel: React.FC<SmartSuggestionsPanelProps> = ({ suggestions }) => {
  const visible = suggestions.filter((s) => s.severity === 'critical' || s.severity === 'warning');
  if (visible.length === 0) return null;

  return (
    <Stack spacing={1}>
      {visible.map((s) => (
        <Alert key={s.id} severity={s.severity === 'critical' ? 'error' : 'warning'}>
          <strong>{s.title}</strong> — {s.message}
        </Alert>
      ))}
    </Stack>
  );
};

export default SmartSuggestionsPanel;
