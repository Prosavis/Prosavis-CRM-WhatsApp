/**
 * Tres familias de automatizaciones WhatsApp — identidad visual y URL.
 */

import type { SvgIconComponent } from '@mui/icons-material';
import AccessAlarmOutlinedIcon from '@mui/icons-material/AccessAlarmOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { DesignTokens } from '@/constants/designSystem';

export type WaFamily = 'reminders' | 'reactivations' | 'post-service';

export type AutoSubTab =
  | 'clients'
  | 'cleaners'
  | 'history'
  | 'reactivations'
  | 'react-history'
  | 'post-service'
  | 'post-service-history'
  | 'rules';

export interface FamilyView {
  key: AutoSubTab;
  label: string;
}

export interface AutomationFamilyDef {
  id: WaFamily;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  accentSoft: string;
  icon: SvgIconComponent;
  defaultView: AutoSubTab;
  views: FamilyView[];
}

export const AUTOMATION_FAMILIES: AutomationFamilyDef[] = [
  {
    id: 'reminders',
    label: 'Recordatorios 24h',
    shortLabel: 'Recordatorios',
    description: 'Envío diario 6:00 p.m. · clientes, cleaners e historial',
    accent: DesignTokens.brand.primary.blue,
    accentSoft: 'rgba(0, 36, 70, 0.08)',
    icon: AccessAlarmOutlinedIcon,
    defaultView: 'clients',
    views: [
      { key: 'clients', label: 'Clientes' },
      { key: 'cleaners', label: 'Cleaners' },
      { key: 'history', label: 'Historial' },
    ],
  },
  {
    id: 'reactivations',
    label: 'Reactivaciones',
    shortLabel: 'Reactivaciones',
    description: 'Cadencia para clientes inactivos · operación e historial',
    accent: DesignTokens.brand.primary.orange,
    accentSoft: 'rgba(255, 119, 0, 0.10)',
    icon: AutorenewOutlinedIcon,
    defaultView: 'reactivations',
    views: [
      { key: 'reactivations', label: 'Operación' },
      { key: 'react-history', label: 'Historial' },
    ],
  },
  {
    id: 'post-service',
    label: 'Post-servicio',
    shortLabel: 'Post-servicio',
    description: 'Seguimiento tras cita completada · operación e historial',
    accent: DesignTokens.charts.teal,
    accentSoft: 'rgba(0, 150, 136, 0.10)',
    icon: TaskAltOutlinedIcon,
    defaultView: 'post-service',
    views: [
      { key: 'post-service', label: 'Operación' },
      { key: 'post-service-history', label: 'Historial' },
    ],
  },
];

export function familyFromAuto(auto: AutoSubTab | string | null): WaFamily {
  switch (auto) {
    case 'cleaners':
    case 'history':
    case 'clients':
      return 'reminders';
    case 'reactivations':
    case 'react-history':
      return 'reactivations';
    case 'post-service':
    case 'post-service-history':
      return 'post-service';
    default:
      return 'reminders';
  }
}

export function getFamily(id: WaFamily): AutomationFamilyDef {
  const found = AUTOMATION_FAMILIES.find((f) => f.id === id);
  return found ?? AUTOMATION_FAMILIES[0];
}

export const ALL_WA_SUBTABS: AutoSubTab[] = AUTOMATION_FAMILIES.flatMap((f) =>
  f.views.map((v) => v.key),
);
