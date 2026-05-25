export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: 'admin' | 'super_admin';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role?: 'admin' | 'super_admin';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admin_profiles']['Insert']>;
      };
      whatsapp_conversations: {
        Row: {
          id: string;
          stable_key: string;
          phone: string | null;
          bsuid: string | null;
          state: 'active' | 'escalated' | 'resolved';
          contact_name: string | null;
          contact_phone: string | null;
          contact_photo_url: string | null;
          whatsapp_profile_name: string | null;
          admin_notes: string | null;
          assigned_to: string | null;
          last_message_text: string | null;
          last_message_at: string | null;
          last_message_direction: 'inbound' | 'outbound' | null;
          last_message_outbound_status: string | null;
          unread_count: number;
          phone_number_id: string | null;
          automated_inbound_disabled: boolean;
          tag_ids: string[];
          is_archived: boolean;
          archived_at: string | null;
          is_pinned: boolean;
          pinned_at: string | null;
          crm_force_unread: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_conversations']['Row']> & {
          stable_key: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_conversations']['Row']>;
      };
      whatsapp_message_log: {
        Row: {
          id: string;
          conversation_stable_key: string;
          recipient_phone: string | null;
          recipient_bsuid: string | null;
          direction: 'inbound' | 'outbound';
          sender_type: 'bot' | 'agent' | 'system' | 'user';
          agent_uid: string | null;
          message_body: string | null;
          media_type: 'image' | 'audio' | 'video' | 'document' | 'sticker' | null;
          media_id: string | null;
          media_url: string | null;
          storage_url: string | null;
          caption: string | null;
          status: string;
          wa_message_id: string | null;
          intent: string | null;
          template_name: string | null;
          campaign_type: string | null;
          phone_number_id: string | null;
          client_request_id: string | null;
          reply_to_wa_message_id: string | null;
          filename: string | null;
          batch_id: string | null;
          storage_path: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          voice_transcription: string | null;
          hidden_from_panel: boolean;
          revoked_at: string | null;
          revoked_reason: string | null;
          raw_payload: Json;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_message_log']['Row']> & {
          conversation_stable_key: string;
          direction: 'inbound' | 'outbound';
        };
        Update: Partial<Database['public']['Tables']['whatsapp_message_log']['Row']>;
      };
      whatsapp_chat_tags: {
        Row: {
          id: string;
          name: string;
          color: string | null;
          created_by: string | null;
          archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string | null;
          created_by?: string | null;
          archived?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_chat_tags']['Insert']>;
      };
      platform_settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['platform_settings']['Insert']>;
      };
      whatsapp_webhook_events: {
        Row: {
          id: string;
          event_type: string;
          payload: Json;
          signature: string | null;
          verified: boolean;
          processing_mode: 'shadow' | 'active';
          processed: boolean;
          error_message: string | null;
          received_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_webhook_events']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_webhook_events']['Row']>;
      };
      whatsapp_media_assets: {
        Row: {
          id: string;
          message_log_id: string | null;
          conversation_stable_key: string | null;
          bucket_id: string;
          storage_path: string;
          media_id: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          sha256: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_media_assets']['Row']> & {
          storage_path: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_media_assets']['Row']>;
      };
      whatsapp_templates: {
        Row: {
          id: string;
          name: string;
          language: string;
          category: string | null;
          status: string;
          components: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_templates']['Row']> & {
          name: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_templates']['Row']>;
      };
      whatsapp_snippets: {
        Row: {
          id: string;
          title: string;
          body: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_snippets']['Row']> & {
          title: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_snippets']['Row']>;
      };
      whatsapp_stickers: {
        Row: {
          id: string;
          name: string;
          storage_path: string;
          created_by: string | null;
          archived: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_stickers']['Row']> & {
          name: string;
          storage_path: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_stickers']['Row']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
