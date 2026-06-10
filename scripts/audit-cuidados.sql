SELECT id, full_name, phone, phone_key, provider_id, service_id, whatsapp_conversation_id, source, updated_at
FROM crm_directory
WHERE full_name ILIKE '%Cuidados De La Piel%'
   OR phone_key = '3146283332';
