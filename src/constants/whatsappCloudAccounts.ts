export const WHATSAPP_CLOUD_PRODUCTION = {
  phoneNumberId: import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '',
  wabaId: import.meta.env.VITE_WHATSAPP_WABA_ID?.trim() ?? '',
  phoneDisplay: import.meta.env.VITE_WHATSAPP_PHONE_DISPLAY?.trim() ?? '',
  botLabel: import.meta.env.VITE_WHATSAPP_BOT_LABEL?.trim() ?? '',
};

export const WHATSAPP_CLOUD_COMMERCIAL = {
  phoneNumberId:
    import.meta.env.VITE_WHATSAPP_COMMERCIAL_PHONE_NUMBER_ID?.trim() || '1043086062223440',
  wabaId: import.meta.env.VITE_WHATSAPP_COMMERCIAL_WABA_ID?.trim() || '1680332820009096',
  phoneDisplay:
    import.meta.env.VITE_WHATSAPP_COMMERCIAL_PHONE_DISPLAY?.trim() || '+57 311 212 1108',
  label: import.meta.env.VITE_WHATSAPP_COMMERCIAL_LABEL?.trim() || 'Comercial 311',
};

export type WhatsAppCloudProduction = typeof WHATSAPP_CLOUD_PRODUCTION;
