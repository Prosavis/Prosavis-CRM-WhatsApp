import React from 'react';
import { Chip, Stack, Tooltip } from '@mui/material';
import type { InboxAiProposedAction } from '@/services/whatsappService';
import { canStartActionExecution } from '../../../supabase/functions/_shared/inboxAiActionHelpers';

export interface ProposedActionChipsProps {
  proposedActions: InboxAiProposedAction[];
  executingActionId: string | null;
  onConfirmAction: (action: InboxAiProposedAction) => void;
  dense?: boolean;
}

const ProposedActionChips: React.FC<ProposedActionChipsProps> = ({
  proposedActions,
  executingActionId,
  onConfirmAction,
  dense = false,
}) => {
  if (!proposedActions.length) return null;

  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      useFlexGap
      spacing={dense ? 0.5 : 1}
      sx={{ gap: dense ? 0.5 : 1 }}
    >
      {proposedActions.map((action) => {
        const pending = executingActionId === action.id;
        const chipDisabled = !canStartActionExecution(executingActionId, action.id);
        return (
          <Tooltip key={action.id} title={action.reason} arrow>
            <span>
              <Chip
                label={pending ? `${action.label}…` : action.label}
                size={dense ? 'small' : 'medium'}
                color="primary"
                variant={pending ? 'filled' : 'outlined'}
                disabled={chipDisabled}
                onClick={() => {
                  if (!canStartActionExecution(executingActionId, action.id)) return;
                  onConfirmAction(action);
                }}
                sx={{ maxWidth: 280 }}
              />
            </span>
          </Tooltip>
        );
      })}
    </Stack>
  );
};

export default ProposedActionChips;
