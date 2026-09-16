import type { AppMetricsSnapshot, AppProfileHealthCriterion } from './metricsContract.ts';
import { METRICS_TIMEZONE } from './metricsContract.ts';
import { addDaysToKey, weekKeyFromDay } from './completedServicesCore.ts';
import { todayBogotaKey } from './metricsWindows.ts';

export function buildProfileHealth(service: Record<string, unknown>): AppMetricsSnapshot['profile'] {
  const images = Array.isArray(service.images) ? service.images : [];
  const features = Array.isArray(service.features) ? service.features : [];
  const callPhones = Array.isArray(service.callPhones) ? service.callPhones : [];
  const description = typeof service.description === 'string' ? service.description : null;
  const criteria: AppProfileHealthCriterion[] = [
    {
      key: 'mainImage',
      label: 'Imagen principal',
      weight: 20,
      isMet: Boolean(service.mainImage),
      suggestion: 'Agrega una imagen principal atractiva',
    },
    {
      key: 'images',
      label: 'Imágenes adicionales',
      weight: 10,
      isMet: images.length > 0,
      suggestion: 'Agrega más fotos de tu servicio',
    },
    {
      key: 'description',
      label: 'Descripción completa',
      weight: 10,
      isMet: Boolean(description && description.length > 100),
      suggestion: 'Escribe una descripción detallada (min. 100 caracteres)',
    },
    {
      key: 'verified',
      label: 'Cuenta verificada',
      weight: 30,
      isMet: Boolean(service.providerIsVerified),
      suggestion: 'Verifica tu cuenta para generar confianza',
    },
    {
      key: 'features',
      label: 'Etiquetas/Características',
      weight: 10,
      isMet: features.length > 0,
      suggestion: 'Agrega etiquetas para mejorar tu visibilidad',
    },
    {
      key: 'social',
      label: 'Redes sociales',
      weight: 20,
      isMet: Boolean(
        service.instagram || service.whatsappNumber || service.facebook || callPhones.length,
      ),
      suggestion: 'Agrega al menos una red social o teléfono',
    },
  ];
  const score = criteria.reduce((sum, item) => sum + (item.isMet ? item.weight : 0), 0);
  return {
    name: typeof service.name === 'string' ? service.name : null,
    description,
    mainImage: typeof service.mainImage === 'string' ? service.mainImage : null,
    imagesCount: images.length,
    featuresCount: features.length,
    providerIsVerified: Boolean(service.providerIsVerified),
    instagram: typeof service.instagram === 'string' ? service.instagram : null,
    whatsappNumber: typeof service.whatsappNumber === 'string' ? service.whatsappNumber : null,
    facebook: typeof service.facebook === 'string' ? service.facebook : null,
    callPhonesCount: callPhones.length,
    rating: Number(service.rating) || 0,
    views: Number(service.views ?? service.viewsCount) || 0,
    health: {
      score,
      completedCriteria: criteria.filter((item) => item.isMet).length,
      totalCriteria: criteria.length,
      criteria,
    },
  };
}

export function buildWeeklyFromDaily(
  daily: Array<{ bucket: string; completed: number; appointments?: number; revenue?: number }>,
  todayKey: string,
) {
  const thisWeek = weekKeyFromDay(todayKey);
  const prevWeekDay = addDaysToKey(todayKey, -7);
  const prevWeek = weekKeyFromDay(prevWeekDay);
  let servicesCompleted = 0;
  let prevServices = 0;
  let totalAppointments = 0;
  let prevAppointments = 0;
  let totalRevenue = 0;
  let prevRevenue = 0;
  for (const point of daily) {
    const week = weekKeyFromDay(point.bucket);
    if (week === thisWeek) {
      servicesCompleted += point.completed;
      totalAppointments += point.appointments ?? point.completed;
      totalRevenue += point.revenue ?? 0;
    }
    if (week === prevWeek) {
      prevServices += point.completed;
      prevAppointments += point.appointments ?? point.completed;
      prevRevenue += point.revenue ?? 0;
    }
  }
  return {
    weekStart: addDaysToKey(todayKey, -((new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7)),
    weekEnd: todayKey,
    servicesCompleted,
    totalAppointments: totalAppointments || servicesCompleted,
    totalRevenue,
    comparedToPrevWeek: {
      servicesChange: servicesCompleted - prevServices,
      revenueChange: prevRevenue === 0
        ? (totalRevenue > 0 ? 100 : 0)
        : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10,
    },
  };
}

export function emptyDirectorySnapshot(): AppMetricsSnapshot['directory'] {
  return {
    total: 0,
    clients: 0,
    company: 0,
    recurring: 0,
    active: 0,
    inactive: 0,
    favorites: 0,
    blacklist: 0,
    leads: { total: 0, enSeguimiento: 0, enRebooking: 0, optOut: 0, agendados: 0 },
    optOutCount: 0,
    directoryRows: 0,
  };
}

export { METRICS_TIMEZONE, todayBogotaKey };
