export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_appointments: {
        Row: {
          access_instructions: string | null
          assigned_via: string | null
          booking_snapshot: Json | null
          cancellation_flow: Json | null
          cleaning_instructions: string | null
          client_app_user_id: string | null
          client_id: string
          client_name: string
          client_notes: string | null
          client_phone: string | null
          completion_reminder_task_id: string | null
          contracted_with_products: boolean
          created_at: string
          duration: number
          google_event_id: string | null
          google_event_id_admin: string | null
          id: string
          is_referral_first_booking: boolean
          last_notified_at: string | null
          location: Json | null
          price: number
          provider_id: string
          provider_name: string
          recurrence: Json | null
          recurrence_google_event_id_parent: string | null
          recurrence_rule: string | null
          scheduled_at: string
          service_id: string
          service_name: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          assigned_via?: string | null
          booking_snapshot?: Json | null
          cancellation_flow?: Json | null
          cleaning_instructions?: string | null
          client_app_user_id?: string | null
          client_id: string
          client_name: string
          client_notes?: string | null
          client_phone?: string | null
          completion_reminder_task_id?: string | null
          contracted_with_products?: boolean
          created_at?: string
          duration: number
          google_event_id?: string | null
          google_event_id_admin?: string | null
          id?: string
          is_referral_first_booking?: boolean
          last_notified_at?: string | null
          location?: Json | null
          price: number
          provider_id: string
          provider_name: string
          recurrence?: Json | null
          recurrence_google_event_id_parent?: string | null
          recurrence_rule?: string | null
          scheduled_at: string
          service_id: string
          service_name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          assigned_via?: string | null
          booking_snapshot?: Json | null
          cancellation_flow?: Json | null
          cleaning_instructions?: string | null
          client_app_user_id?: string | null
          client_id?: string
          client_name?: string
          client_notes?: string | null
          client_phone?: string | null
          completion_reminder_task_id?: string | null
          contracted_with_products?: boolean
          created_at?: string
          duration?: number
          google_event_id?: string | null
          google_event_id_admin?: string | null
          id?: string
          is_referral_first_booking?: boolean
          last_notified_at?: string | null
          location?: Json | null
          price?: number
          provider_id?: string
          provider_name?: string
          recurrence?: Json | null
          recurrence_google_event_id_parent?: string | null
          recurrence_rule?: string | null
          scheduled_at?: string
          service_id?: string
          service_name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_automation_executions: {
        Row: {
          automation_id: string
          created_at: string
          error_message: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_executions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_automations: {
        Row: {
          conditions: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          service_id: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          service_id?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          service_id?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          inserted_at: string
          media_url: string | null
          message_type: string
          sender_id: string | null
          sender_type: string
          updated_at: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          inserted_at?: string
          media_url?: string | null
          message_type?: string
          sender_id?: string | null
          sender_type: string
          updated_at?: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          inserted_at?: string
          media_url?: string | null
          message_type?: string
          sender_id?: string | null
          sender_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "crm_chats"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_chats: {
        Row: {
          archived: boolean
          client_id: string | null
          created_at: string
          created_by: string | null
          external_contact_id: string | null
          id: string
          last_message_timestamp: string | null
          last_message_content: string | null
          last_message_sender_type: string | null
          metadata: Json | null
          provider_id: string | null
          service_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          external_contact_id?: string | null
          id?: string
          last_message_timestamp?: string | null
          last_message_content?: string | null
          last_message_sender_type?: string | null
          metadata?: Json | null
          provider_id?: string | null
          service_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          external_contact_id?: string | null
          id?: string
          last_message_timestamp?: string | null
          last_message_content?: string | null
          last_message_sender_type?: string | null
          metadata?: Json | null
          provider_id?: string | null
          service_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_clients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          provider_id: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          provider_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          provider_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_discount_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_percentage: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          service_id: string | null
          status: string
          updated_at: string
          use_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
          use_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_discount_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_external_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_active: boolean
          order: number | null
          question: string
          service_id: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_active?: boolean
          order?: number | null
          question: string
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_active?: boolean
          order?: number | null
          question?: string
          service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_import_batches: {
        Row: {
          created_at: string
          error_details: string | null
          file_name: string | null
          id: string
          imported: number | null
          status: string
          total: number | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_details?: string | null
          file_name?: string | null
          id?: string
          imported?: number | null
          status?: string
          total?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_details?: string | null
          file_name?: string | null
          id?: string
          imported?: number | null
          status?: string
          total?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_directory: {
        Row: {
          id: string
          full_name: string
          display_name: string | null
          email: string | null
          phone: string | null
          photo_url: string | null
          address: string | null
          notes: string | null
          app_user_id: string | null
          is_app_user: boolean
          provider_id: string | null
          service_id: string | null
          classification: string
          quality_tag: string
          status: string
          source: string | null
          channels: string[]
          payment_status: string | null
          pending_amount: number
          pending_appointments_count: number
          last_charged_amount: number | null
          otp_required: boolean
          preferred_service_address_line: string | null
          preferred_service_address_ref: string | null
          first_contact_at: string | null
          last_contact_at: string | null
          messages_count: number
          active_sequence: string
          sequence_step: number
          opt_out: boolean
          last_response_text: string | null
          last_response_at: string | null
          last_whatsapp_message_at: string | null
          last_whatsapp_message_text: string | null
          last_whatsapp_intent: string | null
          unread_whatsapp_count: number
          whatsapp_assigned_to: string | null
          whatsapp_conversation_id: string | null
          appointment_id: string | null
          internal_notes: string | null
          tags: string[]
          metadata: Json
          created_at: string
          updated_at: string
          last_synced_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['crm_directory']['Row']>
        Update: Partial<Database['public']['Tables']['crm_directory']['Row']>
        Relationships: []
      }
      crm_leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
          service_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          service_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          service_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_profile_views: {
        Row: {
          created_at: string
          id: string
          service_id: string | null
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          service_id?: string | null
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string | null
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: []
      }
      crm_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          service_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          service_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          service_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_team_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          role: string
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          role?: string
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          role?: string
          service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      migration_id_map: {
        Row: {
          created_at: string
          id: string
          legacy_id: string
          supabase_id: string
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_id: string
          supabase_id: string
          table_name: string
        }
        Update: {
          created_at?: string
          id?: string
          legacy_id?: string
          supabase_id?: string
          table_name?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_admin_presence: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          is_online: boolean
          last_seen_at: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen_at?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_admin_presence_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_blocklist: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          bsuid: string | null
          id: string
          phone: string
          reason: string | null
          stable_key: string | null
          unblocked_at: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          bsuid?: string | null
          id?: string
          phone: string
          reason?: string | null
          stable_key?: string | null
          unblocked_at?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          bsuid?: string | null
          id?: string
          phone?: string
          reason?: string | null
          stable_key?: string | null
          unblocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_blocklist_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_broadcast_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_count: number | null
          filters: Json | null
          id: string
          message_body: string
          media_url: string | null
          sent_count: number | null
          started_at: string | null
          status: string
          target_count: number | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          filters?: Json | null
          id?: string
          message_body: string
          media_url?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          target_count?: number | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          filters?: Json | null
          id?: string
          message_body?: string
          media_url?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          target_count?: number | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_broadcast_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_chat_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chat_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_conversations: {
        Row: {
          agent_uid: string | null
          assigned_admin_id: string | null
          bsuid: string | null
          chat_tags: string[] | null
          contact_name: string | null
          contact_name_locked: boolean
          contact_phone: string | null
          contact_photo_url: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_outbound_status: string | null
          last_message_sender_type: string | null
          last_message_text: string | null
          lead_id: string | null
          phone: string | null
          phone_number_id: string | null
          pinned: boolean
          stable_key: string
          state: string
          tags: string[] | null
          unread_count: number
          updated_at: string
          wa_conversation_id: string | null
          whatsapp_profile_name: string | null
        }
        Insert: {
          agent_uid?: string | null
          assigned_admin_id?: string | null
          bsuid?: string | null
          chat_tags?: string[] | null
          contact_name?: string | null
          contact_name_locked?: boolean
          contact_phone?: string | null
          contact_photo_url?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_outbound_status?: string | null
          last_message_sender_type?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          phone?: string | null
          phone_number_id?: string | null
          pinned?: boolean
          stable_key: string
          state?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
          wa_conversation_id?: string | null
          whatsapp_profile_name?: string | null
        }
        Update: {
          agent_uid?: string | null
          assigned_admin_id?: string | null
          bsuid?: string | null
          chat_tags?: string[] | null
          contact_name?: string | null
          contact_name_locked?: boolean
          contact_phone?: string | null
          contact_photo_url?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_outbound_status?: string | null
          last_message_sender_type?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          phone?: string | null
          phone_number_id?: string | null
          pinned?: boolean
          stable_key?: string
          state?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
          wa_conversation_id?: string | null
          whatsapp_profile_name?: string | null
        }
        Relationships: []
      }
      whatsapp_media_assets: {
        Row: {
          bucket_id: string
          conversation_stable_key: string | null
          created_at: string
          id: string
          media_id: string
          message_log_id: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          conversation_stable_key?: string | null
          created_at?: string
          id?: string
          media_id: string
          message_log_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          conversation_stable_key?: string | null
          created_at?: string
          id?: string
          media_id?: string
          message_log_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_message_log: {
        Row: {
          agent_uid: string | null
          batch_id: string | null
          batch_index: number | null
          campaign_type: string | null
          caption: string | null
          client_attachment_id: string | null
          conversation_stable_key: string
          crm_deleted_at: string | null
          crm_deleted_by: string | null
          created_at: string
          direction: string
          error_message: string | null
          filename: string | null
          id: string
          is_animated_sticker: boolean
          lead_id: string | null
          media_id: string | null
          media_type: string | null
          media_url: string | null
          message_body: string | null
          mime_type: string | null
          phone_number_id: string | null
          raw_payload: Json | null
          recipient_bsuid: string | null
          recipient_phone: string | null
          reply_to_wa_message_id: string | null
          sender_type: string | null
          size_bytes: number | null
          status: string
          storage_path: string | null
          storage_url: string | null
          template_name: string | null
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          agent_uid?: string | null
          batch_id?: string | null
          batch_index?: number | null
          campaign_type?: string | null
          caption?: string | null
          client_attachment_id?: string | null
          conversation_stable_key: string
          crm_deleted_at?: string | null
          crm_deleted_by?: string | null
          created_at?: string
          direction: string
          error_message?: string | null
          filename?: string | null
          id?: string
          is_animated_sticker?: boolean
          lead_id?: string | null
          media_id?: string | null
          media_type?: string | null
          media_url?: string | null
          message_body?: string | null
          mime_type?: string | null
          phone_number_id?: string | null
          raw_payload?: Json | null
          recipient_bsuid?: string | null
          recipient_phone?: string | null
          reply_to_wa_message_id?: string | null
          sender_type?: string | null
          size_bytes?: number | null
          status: string
          storage_path?: string | null
          storage_url?: string | null
          template_name?: string | null
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          agent_uid?: string | null
          batch_id?: string | null
          batch_index?: number | null
          campaign_type?: string | null
          caption?: string | null
          client_attachment_id?: string | null
          conversation_stable_key?: string
          crm_deleted_at?: string | null
          crm_deleted_by?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          filename?: string | null
          id?: string
          is_animated_sticker?: boolean
          lead_id?: string | null
          media_id?: string | null
          media_type?: string | null
          media_url?: string | null
          message_body?: string | null
          mime_type?: string | null
          phone_number_id?: string | null
          raw_payload?: Json | null
          recipient_bsuid?: string | null
          recipient_phone?: string | null
          reply_to_wa_message_id?: string | null
          sender_type?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          storage_url?: string | null
          template_name?: string | null
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_log_agent_uid_fkey"
            columns: ["agent_uid"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_log_crm_deleted_by_fkey"
            columns: ["crm_deleted_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_outbound_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_count: number | null
          id: string
          message_body: string
          recipients: Json
          sent_count: number | null
          started_at: string | null
          status: string
          template_name: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          id?: string
          message_body: string
          recipients: Json
          sent_count?: number | null
          started_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          id?: string
          message_body?: string
          recipients?: Json
          sent_count?: number | null
          started_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbound_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_snippets: {
        Row: {
          created_at: string
          id: string
          shortcut: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          shortcut: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          shortcut?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_stickers: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          is_animated: boolean
          name: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_animated?: boolean
          name: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_animated?: boolean
          name?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          created_at: string
          id: string
          payload: Json
          received_at: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          received_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
