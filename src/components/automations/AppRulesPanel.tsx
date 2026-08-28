/**
 * Panel de reglas de app (si X → Y) dentro del hub de Automatizaciones.
 */

import React, { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoFixHigh as AutoFixHighIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { crmToast } from '@/utils/crmToast';
import { DesignTokens } from '@/constants/designSystem';
import { useAppAutomations } from '@/hooks/useAppAutomations';
import type { AutomationRule, CreateAutomationPayload } from '@/types/automations';
import AppRuleCard from './AppRuleCard';
import AppRuleFormDialog from './AppRuleFormDialog';

const AppRulesPanel: React.FC = () => {
  const {
    automations,
    isLoading,
    isFetching,
    error,
    refetch,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    isCreating,
    isUpdating,
  } = useAppAutomations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const handleOpenCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (payload: CreateAutomationPayload) => {
    try {
      if (editingRule) {
        await updateAutomation(editingRule.id, payload);
        crmToast.success('Regla actualizada');
      } else {
        await createAutomation(payload);
        crmToast.success('Regla creada');
      }
      setDialogOpen(false);
      setEditingRule(null);
    } catch (err) {
      crmToast.error(err instanceof Error ? err.message : 'No se pudo guardar');
      throw err;
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteAutomation(ruleId);
      crmToast.success('Regla eliminada');
    } catch (err) {
      crmToast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  const handleToggle = async (ruleId: string, isActive: boolean) => {
    try {
      await toggleAutomation(ruleId, isActive);
    } catch (err) {
      crmToast.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: { xs: 1.5, sm: 2 },
        borderLeft: `4px solid ${DesignTokens.brand.primary.orange}`,
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{
              color: DesignTokens.brand.primary.orange,
              fontWeight: 800,
              letterSpacing: '0.08em',
            }}
          >
            Capa App
          </Typography>
          <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>
            Reglas de la app
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Si X ocurre → hacer Y (chat, push o tarea). Prosavis Limpieza.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refrescar
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ bgcolor: DesignTokens.brand.primary.orange }}
          >
            Nueva regla
          </Button>
        </Stack>
      </Stack>

      <Alert
        severity="info"
        sx={{
          mb: 2,
          borderRadius: DesignTokens.borderRadius.md,
          borderLeft: `4px solid ${DesignTokens.brand.primary.blue}`,
        }}
      >
        Cada regla solo afecta a la cita o cliente que la dispara. La ejecución
        corre en Firebase (Cloud Functions); aquí gestionas las reglas.
      </Alert>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        >
          <AlertTitle>Error al cargar</AlertTitle>
          {error.message}
        </Alert>
      )}

      {isLoading ? (
        <Stack spacing={1.5}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={96}
              sx={{ borderRadius: DesignTokens.borderRadius.lg }}
            />
          ))}
        </Stack>
      ) : automations.length === 0 ? (
        <Box
          sx={{
            py: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            borderRadius: DesignTokens.borderRadius.lg,
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <AutoFixHighIcon
            sx={{
              fontSize: 56,
              color: DesignTokens.brand.primary.orange,
              mb: 1.5,
              opacity: 0.85,
            }}
          />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Sin reglas de app
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, maxWidth: 420 }}
          >
            Crea reglas para enviar mensajes in-app, notificaciones push o tareas
            cuando se complete o cancele una cita.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ bgcolor: DesignTokens.brand.primary.blue }}
          >
            Crear primera regla
          </Button>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {automations.map((rule) => (
            <AppRuleCard
              key={rule.id}
              rule={rule}
              onEdit={(r) => {
                setEditingRule(r);
                setDialogOpen(true);
              }}
              onToggle={(id, active) => void handleToggle(id, active)}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </Stack>
      )}

      <AppRuleFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingRule(null);
        }}
        onSubmit={handleSubmit}
        initialValues={editingRule ?? undefined}
        submitting={isCreating || isUpdating}
      />
    </Box>
  );
};

export default AppRulesPanel;
