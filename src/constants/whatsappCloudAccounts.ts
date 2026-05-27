export const WHATSAPP_CLOUD_PRODUCTION = {
  phoneNumberId: import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '',
  wabaId: import.meta.env.VITE_WHATSAPP_WABA_ID?.trim() ?? '',
  phoneDisplay: import.meta.env.VITE_WHATSAPP_PHONE_DISPLAY?.trim() ?? '',
  botLabel: import.meta.env.VITE_WHATSAPP_BOT_LABEL?.trim() ?? '',
};

export type WhatsAppCloudProduction = typeof WHATSAPP_CLOUD_PRODUCTION;
