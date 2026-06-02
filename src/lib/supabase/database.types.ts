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
      ai_connections: {
        Row: {
          api_key_enc: string
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          primary_model: string
          provider: string
          settings: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key_enc: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          primary_model: string
          provider: string
          settings?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key_enc?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          primary_model?: string
          provider?: string
          settings?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_ingest_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          document_id: string | null
          id: string
          meta: Json
          mime_type: string
          original_name: string
          run_id: string
          sha256: string | null
          size_bytes: number
          state: string
          storage_path: string
          tenant_id: string
        }
        Insert: {
          artifact_type: string
          created_at?: string
          document_id?: string | null
          id?: string
          meta?: Json
          mime_type: string
          original_name: string
          run_id: string
          sha256?: string | null
          size_bytes?: number
          state?: string
          storage_path: string
          tenant_id: string
        }
        Update: {
          artifact_type?: string
          created_at?: string
          document_id?: string | null
          id?: string
          meta?: Json
          mime_type?: string
          original_name?: string
          run_id?: string
          sha256?: string | null
          size_bytes?: number
          state?: string
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_ingest_artifacts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_ingest_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "browser_ingest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_ingest_artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_ingest_connections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_run_at: string | null
          last_state: string | null
          login_url: string | null
          name: string
          portal_url: string
          provider_id: string | null
          schedule_enabled: boolean
          schedule_note: string | null
          selectors: Json
          settings: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          last_state?: string | null
          login_url?: string | null
          name: string
          portal_url: string
          provider_id?: string | null
          schedule_enabled?: boolean
          schedule_note?: string | null
          selectors?: Json
          settings?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          last_state?: string | null
          login_url?: string | null
          name?: string
          portal_url?: string
          provider_id?: string | null
          schedule_enabled?: boolean
          schedule_note?: string | null
          selectors?: Json
          settings?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_ingest_connections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_ingest_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_ingest_runs: {
        Row: {
          artifacts_created: number
          connection_id: string
          created_at: string
          documents_created: number
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          meta: Json
          provider_id: string | null
          started_at: string | null
          state: string
          tenant_id: string
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          artifacts_created?: number
          connection_id: string
          created_at?: string
          documents_created?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json
          provider_id?: string | null
          started_at?: string | null
          state?: string
          tenant_id: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Update: {
          artifacts_created?: number
          connection_id?: string
          created_at?: string
          documents_created?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json
          provider_id?: string | null
          started_at?: string | null
          state?: string
          tenant_id?: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "browser_ingest_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "browser_ingest_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_ingest_runs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_ingest_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cleo_orders: {
        Row: {
          attempts: number
          cleo_batch_id: string | null
          cleo_message_id: string
          cleo_reference: string | null
          created_at: string
          document_id: string | null
          html_storage_path: string | null
          id: string
          inbound_email_id: string | null
          last_error: string | null
          meta: Json
          parsed_payload: Json | null
          state: string
          tenant_id: string
          trading_partner: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          cleo_batch_id?: string | null
          cleo_message_id: string
          cleo_reference?: string | null
          created_at?: string
          document_id?: string | null
          html_storage_path?: string | null
          id?: string
          inbound_email_id?: string | null
          last_error?: string | null
          meta?: Json
          parsed_payload?: Json | null
          state?: string
          tenant_id: string
          trading_partner?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          cleo_batch_id?: string | null
          cleo_message_id?: string
          cleo_reference?: string | null
          created_at?: string
          document_id?: string | null
          html_storage_path?: string | null
          id?: string
          inbound_email_id?: string | null
          last_error?: string | null
          meta?: Json
          parsed_payload?: Json | null
          state?: string
          tenant_id?: string
          trading_partner?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleo_orders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleo_orders_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleo_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cleo_smoke_runs: {
        Row: {
          checks: Json
          created_at: string
          id: string
          ok: boolean
          tenant_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          ok: boolean
          tenant_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          ok?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleo_smoke_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coming_soon_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          integration_id: string
          integration_name: string
          ip: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          integration_id: string
          integration_name: string
          ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          integration_id?: string
          integration_name?: string
          ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coming_soon_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          document_id: string | null
          id: string
          kind: string
          note: string | null
          stripe_event_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          document_id?: string | null
          id?: string
          kind: string
          note?: string | null
          stripe_event_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          document_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          stripe_event_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_mappings: {
        Row: {
          confidence: number
          created_at: string
          id: string
          match_key: string
          odoo_partner_id: number
          odoo_partner_name: string
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          match_key: string
          odoo_partner_id: number
          odoo_partner_name: string
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          match_key?: string
          odoo_partner_id?: number
          odoo_partner_name?: string
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          confidence: number | null
          created_at: string
          document_id: string
          id: string
          is_relevant: boolean
          meta: Json
          page_number: number
          page_type: string
          tenant_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          document_id: string
          id?: string
          is_relevant: boolean
          meta?: Json
          page_number: number
          page_type: string
          tenant_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          document_id?: string
          id?: string
          is_relevant?: boolean
          meta?: Json
          page_number?: number
          page_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_hash: string | null
          created_at: string
          doc_number: string | null
          document_kind: string | null
          id: string
          last_error: string | null
          meta: Json | null
          mime_type: string
          original_name: string
          page_count: number | null
          processing_run_id: string | null
          provider_id: string | null
          review_profile_id: string | null
          size_bytes: number
          source_channel: string
          source_meta: Json
          source_ref: string | null
          state: string
          storage_path: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          doc_number?: string | null
          document_kind?: string | null
          id?: string
          last_error?: string | null
          meta?: Json | null
          mime_type: string
          original_name: string
          page_count?: number | null
          processing_run_id?: string | null
          provider_id?: string | null
          review_profile_id?: string | null
          size_bytes: number
          source_channel?: string
          source_meta?: Json
          source_ref?: string | null
          state?: string
          storage_path: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          doc_number?: string | null
          document_kind?: string | null
          id?: string
          last_error?: string | null
          meta?: Json | null
          mime_type?: string
          original_name?: string
          page_count?: number | null
          processing_run_id?: string | null
          provider_id?: string | null
          review_profile_id?: string | null
          size_bytes?: number
          source_channel?: string
          source_meta?: Json
          source_ref?: string | null
          state?: string
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_review_profile_id_fkey"
            columns: ["review_profile_id"]
            isOneToOne: false
            referencedRelation: "review_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingest_events: {
        Row: {
          adapter: string
          created_at: string
          error_code: string | null
          event_id: string | null
          id: string
          inbound_email_id: string | null
          ingest_source_id: string | null
          meta: Json
          state: string
          status_code: number | null
          tenant_id: string | null
        }
        Insert: {
          adapter: string
          created_at?: string
          error_code?: string | null
          event_id?: string | null
          id?: string
          inbound_email_id?: string | null
          ingest_source_id?: string | null
          meta?: Json
          state: string
          status_code?: number | null
          tenant_id?: string | null
        }
        Update: {
          adapter?: string
          created_at?: string
          error_code?: string | null
          event_id?: string | null
          id?: string
          inbound_email_id?: string | null
          ingest_source_id?: string | null
          meta?: Json
          state?: string
          status_code?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_ingest_events_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingest_events_ingest_source_id_fkey"
            columns: ["ingest_source_id"]
            isOneToOne: false
            referencedRelation: "email_ingest_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingest_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingest_sources: {
        Row: {
          address: string
          allowed_senders: string[]
          created_at: string
          id: string
          provider_id: string | null
          settings: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address: string
          allowed_senders?: string[]
          created_at?: string
          id?: string
          provider_id?: string | null
          settings?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          allowed_senders?: string[]
          created_at?: string
          id?: string
          provider_id?: string | null
          settings?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_ingest_sources_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingest_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recipients: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          id: string
          intro: string
          subject: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          id?: string
          intro: string
          subject: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          id?: string
          intro?: string
          subject?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_profile_mappings: {
        Row: {
          active: boolean
          created_at: string
          default_value: Json | null
          destination_field: string
          destination_model: string
          export_profile_id: string
          id: string
          required: boolean
          scope: string
          source_path: string
          tenant_id: string
          transform: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_value?: Json | null
          destination_field: string
          destination_model: string
          export_profile_id: string
          id?: string
          required?: boolean
          scope: string
          source_path: string
          tenant_id: string
          transform?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_value?: Json | null
          destination_field?: string
          destination_model?: string
          export_profile_id?: string
          id?: string
          required?: boolean
          scope?: string
          source_path?: string
          tenant_id?: string
          transform?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_profile_mappings_export_profile_id_fkey"
            columns: ["export_profile_id"]
            isOneToOne: false
            referencedRelation: "export_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_profile_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_profiles: {
        Row: {
          active: boolean
          created_at: string
          flow: string
          id: string
          line_model: string | null
          name: string
          provider: string
          root_model: string
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          flow: string
          id?: string
          line_model?: string | null
          name: string
          provider: string
          root_model: string
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          flow?: string
          id?: string
          line_model?: string | null
          name?: string
          provider?: string
          root_model?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_runs: {
        Row: {
          created_at: string
          error_message: string | null
          export_profile_id: string | null
          external_id: string | null
          external_name: string | null
          id: string
          order_draft_id: string | null
          provider: string
          request_meta: Json
          response_meta: Json
          run_key: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          export_profile_id?: string | null
          external_id?: string | null
          external_name?: string | null
          id?: string
          order_draft_id?: string | null
          provider: string
          request_meta?: Json
          response_meta?: Json
          run_key?: string
          status: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          export_profile_id?: string | null
          external_id?: string | null
          external_name?: string | null
          id?: string
          order_draft_id?: string | null
          provider?: string
          request_meta?: Json
          response_meta?: Json
          run_key?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_runs_export_profile_id_fkey"
            columns: ["export_profile_id"]
            isOneToOne: false
            referencedRelation: "export_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_runs_order_draft_id_fkey"
            columns: ["order_draft_id"]
            isOneToOne: false
            referencedRelation: "order_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          confidence: number | null
          created_at: string
          current: boolean
          document_id: string
          id: string
          model_meta: Json
          normalized: Json
          payload: Json
          run_id: string
          schema_version: number
          tenant_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          current?: boolean
          document_id: string
          id?: string
          model_meta?: Json
          normalized: Json
          payload: Json
          run_id: string
          schema_version?: number
          tenant_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          current?: boolean
          document_id?: string
          id?: string
          model_meta?: Json
          normalized?: Json
          payload?: Json
          run_id?: string
          schema_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_attachments: {
        Row: {
          created_at: string
          disposition: string | null
          document_id: string | null
          id: string
          inbound_email_id: string
          meta: Json
          mime_type: string
          original_name: string
          sha256: string | null
          size_bytes: number
          state: string
          storage_path: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          disposition?: string | null
          document_id?: string | null
          id?: string
          inbound_email_id: string
          meta?: Json
          mime_type: string
          original_name: string
          sha256?: string | null
          size_bytes: number
          state?: string
          storage_path: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          disposition?: string | null
          document_id?: string | null
          id?: string
          inbound_email_id?: string
          meta?: Json
          mime_type?: string
          original_name?: string
          sha256?: string | null
          size_bytes?: number
          state?: string
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_attachments_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_emails: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          from_email: string
          from_name: string | null
          html_storage_path: string | null
          id: string
          ingest_source_id: string | null
          message_id: string
          meta: Json
          provider_id: string | null
          raw_storage_path: string | null
          received_at: string
          state: string
          subject: string | null
          tenant_id: string
          text_storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          from_email: string
          from_name?: string | null
          html_storage_path?: string | null
          id?: string
          ingest_source_id?: string | null
          message_id: string
          meta?: Json
          provider_id?: string | null
          raw_storage_path?: string | null
          received_at?: string
          state?: string
          subject?: string | null
          tenant_id: string
          text_storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          from_email?: string
          from_name?: string | null
          html_storage_path?: string | null
          id?: string
          ingest_source_id?: string | null
          message_id?: string
          meta?: Json
          provider_id?: string | null
          raw_storage_path?: string | null
          received_at?: string
          state?: string
          subject?: string | null
          tenant_id?: string
          text_storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_ingest_source_id_fkey"
            columns: ["ingest_source_id"]
            isOneToOne: false
            referencedRelation: "email_ingest_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog_partners: {
        Row: {
          active: boolean
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          external_id: string
          id: string
          last_synced_at: string
          name: string
          phone: string | null
          provider: string
          raw: Json
          tenant_id: string
          updated_at: string
          vat: string | null
        }
        Insert: {
          active?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_id: string
          id?: string
          last_synced_at?: string
          name: string
          phone?: string | null
          provider: string
          raw?: Json
          tenant_id: string
          updated_at?: string
          vat?: string | null
        }
        Update: {
          active?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_id?: string
          id?: string
          last_synced_at?: string
          name?: string
          phone?: string | null
          provider?: string
          raw?: Json
          tenant_id?: string
          updated_at?: string
          vat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_catalog_partners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog_products: {
        Row: {
          active: boolean
          barcode: string | null
          code: string | null
          created_at: string
          external_id: string
          id: string
          last_synced_at: string
          name: string
          provider: string
          raw: Json
          tenant_id: string
          uom: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          code?: string | null
          created_at?: string
          external_id: string
          id?: string
          last_synced_at?: string
          name: string
          provider: string
          raw?: Json
          tenant_id: string
          uom?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          code?: string | null
          created_at?: string
          external_id?: string
          id?: string
          last_synced_at?: string
          name?: string
          provider?: string
          raw?: Json
          tenant_id?: string
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_catalog_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog_refs: {
        Row: {
          active: boolean
          catalog_type: string
          code: string | null
          created_at: string
          external_id: string
          id: string
          last_synced_at: string
          name: string
          provider: string
          raw: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_type: string
          code?: string | null
          created_at?: string
          external_id: string
          id?: string
          last_synced_at?: string
          name: string
          provider: string
          raw?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_type?: string
          code?: string | null
          created_at?: string
          external_id?: string
          id?: string
          last_synced_at?: string
          name?: string
          provider?: string
          raw?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_catalog_refs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          created_at: string
          id: string
          provider: string
          settings: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          settings?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          settings?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_fields: {
        Row: {
          created_at: string
          field_label: string | null
          field_name: string
          field_type: string
          id: string
          last_synced_at: string
          meta: Json
          model_name: string
          provider: string
          readonly: boolean
          relation_model: string | null
          required: boolean
          selectable: boolean
          stored: boolean
          tenant_id: string
          updated_at: string
          writeable: boolean
        }
        Insert: {
          created_at?: string
          field_label?: string | null
          field_name: string
          field_type: string
          id?: string
          last_synced_at?: string
          meta?: Json
          model_name: string
          provider: string
          readonly?: boolean
          relation_model?: string | null
          required?: boolean
          selectable?: boolean
          stored?: boolean
          tenant_id: string
          updated_at?: string
          writeable?: boolean
        }
        Update: {
          created_at?: string
          field_label?: string | null
          field_name?: string
          field_type?: string
          id?: string
          last_synced_at?: string
          meta?: Json
          model_name?: string
          provider?: string
          readonly?: boolean
          relation_model?: string | null
          required?: boolean
          selectable?: boolean
          stored?: boolean
          tenant_id?: string
          updated_at?: string
          writeable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "integration_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_models: {
        Row: {
          abstract: boolean
          created_at: string
          id: string
          last_synced_at: string
          manual: boolean
          meta: Json
          model_label: string | null
          model_name: string
          provider: string
          tenant_id: string
          transient: boolean
          updated_at: string
        }
        Insert: {
          abstract?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string
          manual?: boolean
          meta?: Json
          model_label?: string | null
          model_name: string
          provider: string
          tenant_id: string
          transient?: boolean
          updated_at?: string
        }
        Update: {
          abstract?: boolean
          created_at?: string
          id?: string
          last_synced_at?: string
          manual?: boolean
          meta?: Json
          model_label?: string | null
          model_name?: string
          provider?: string
          tenant_id?: string
          transient?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_failed_messages: {
        Row: {
          attempts: number
          created_at: string
          graph_message_id: string
          id: string
          internet_message_id: string | null
          last_attempt_at: string
          last_error: string | null
          resolved_at: string | null
          source_id: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          graph_message_id: string
          id?: string
          internet_message_id?: string | null
          last_attempt_at?: string
          last_error?: string | null
          resolved_at?: string | null
          source_id: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          graph_message_id?: string
          id?: string
          internet_message_id?: string | null
          last_attempt_at?: string
          last_error?: string | null
          resolved_at?: string | null
          source_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_failed_messages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "email_ingest_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_failed_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_health_checks: {
        Row: {
          checks: Json
          created_at: string
          error: string | null
          id: string
          ok: boolean
          source_id: string | null
          tenant_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          error?: string | null
          id?: string
          ok: boolean
          source_id?: string | null
          tenant_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          error?: string | null
          id?: string
          ok?: boolean
          source_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_health_checks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "email_ingest_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_health_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_processing_locks: {
        Row: {
          graph_message_id: string
          locked_until: string
          tenant_id: string
        }
        Insert: {
          graph_message_id: string
          locked_until: string
          tenant_id: string
        }
        Update: {
          graph_message_id?: string
          locked_until?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_processing_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_renewal_log: {
        Row: {
          action: string
          created_at: string
          error: string | null
          id: string
          new_expires_at: string | null
          old_expires_at: string | null
          source_id: string
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          id?: string
          new_expires_at?: string | null
          old_expires_at?: string | null
          source_id: string
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          id?: string
          new_expires_at?: string | null
          old_expires_at?: string | null
          source_id?: string
          subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_renewal_log_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "email_ingest_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_renewal_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_connections: {
        Row: {
          account_email: string | null
          api_key_enc: string
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          api_key_enc: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          api_key_enc?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          description: string | null
          href: string | null
          id: string
          meta: Json
          severity: string
          source: string
          source_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          href?: string | null
          id?: string
          meta?: Json
          severity: string
          source: string
          source_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          href?: string | null
          id?: string
          meta?: Json
          severity?: string
          source?: string
          source_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_connections: {
        Row: {
          api_key_enc: string
          base_url: string
          contact_settings: Json
          created_at: string
          database: string
          export_mode: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          status: string
          tenant_id: string
          updated_at: string
          username: string
        }
        Insert: {
          api_key_enc: string
          base_url: string
          contact_settings?: Json
          created_at?: string
          database: string
          export_mode?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          username: string
        }
        Update: {
          api_key_enc?: string
          base_url?: string
          contact_settings?: Json
          created_at?: string
          database?: string
          export_mode?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_products: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          default_code: string | null
          id: string
          last_synced_at: string | null
          name: string
          odoo_product_id: number
          raw: Json
          sale_ok: boolean
          tenant_id: string
          uom_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          default_code?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          odoo_product_id: number
          raw?: Json
          sale_ok?: boolean
          tenant_id: string
          uom_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          default_code?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          odoo_product_id?: number
          raw?: Json
          sale_ok?: boolean
          tenant_id?: string
          uom_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_sync_attempts: {
        Row: {
          attempt_key: string | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          odoo_so_id: number | null
          odoo_so_name: string | null
          order_draft_id: string
          outcome: string | null
          request_meta: Json
          response_meta: Json
          run_id: string | null
          started_at: string
          tenant_id: string
        }
        Insert: {
          attempt_key?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          odoo_so_id?: number | null
          odoo_so_name?: string | null
          order_draft_id: string
          outcome?: string | null
          request_meta?: Json
          response_meta?: Json
          run_id?: string | null
          started_at?: string
          tenant_id: string
        }
        Update: {
          attempt_key?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          odoo_so_id?: number | null
          odoo_so_name?: string | null
          order_draft_id?: string
          outcome?: string | null
          request_meta?: Json
          response_meta?: Json
          run_id?: string | null
          started_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_sync_attempts_order_draft_id_fkey"
            columns: ["order_draft_id"]
            isOneToOne: false
            referencedRelation: "order_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odoo_sync_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_sync_runs: {
        Row: {
          created_at: string
          deactivated: number | null
          error: string | null
          finished_at: string | null
          id: string
          imported: number | null
          ok: boolean | null
          scope: string
          started_at: string
          tenant_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported?: number | null
          ok?: boolean | null
          scope: string
          started_at?: string
          tenant_id: string
          trigger: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported?: number | null
          ok?: boolean | null
          scope?: string
          started_at?: string
          tenant_id?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_sync_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_draft_lines: {
        Row: {
          created_at: string
          customer_sku: string | null
          description: string
          id: string
          kind: string
          line_total: number | null
          odoo_product_id: number | null
          order_draft_id: string
          position: number
          product_mapping_id: string | null
          quantity: number
          sku: string | null
          tax_rate: number | null
          tenant_id: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_sku?: string | null
          description: string
          id?: string
          kind?: string
          line_total?: number | null
          odoo_product_id?: number | null
          order_draft_id: string
          position: number
          product_mapping_id?: string | null
          quantity: number
          sku?: string | null
          tax_rate?: number | null
          tenant_id: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_sku?: string | null
          description?: string
          id?: string
          kind?: string
          line_total?: number | null
          odoo_product_id?: number | null
          order_draft_id?: string
          position?: number
          product_mapping_id?: string | null
          quantity?: number
          sku?: string | null
          tax_rate?: number | null
          tenant_id?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_draft_lines_order_draft_id_fkey"
            columns: ["order_draft_id"]
            isOneToOne: false
            referencedRelation: "order_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_draft_lines_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_draft_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billing_address: Json
          buyer: Json
          created_at: string
          currency: string | null
          customer_mapping_id: string | null
          delivery_date: string | null
          document_id: string
          document_kind: string | null
          extraction_id: string | null
          id: string
          last_sync_error: string | null
          meta: Json
          notes: string | null
          odoo_so_id: number | null
          odoo_so_name: string | null
          payment_terms: string | null
          po_date: string | null
          po_number: string | null
          provider_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          review_profile_id: string | null
          shipping_address: Json
          subtotal: number | null
          sync_state: string
          tax_total: number | null
          tenant_id: string
          total: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: Json
          buyer?: Json
          created_at?: string
          currency?: string | null
          customer_mapping_id?: string | null
          delivery_date?: string | null
          document_id: string
          document_kind?: string | null
          extraction_id?: string | null
          id?: string
          last_sync_error?: string | null
          meta?: Json
          notes?: string | null
          odoo_so_id?: number | null
          odoo_so_name?: string | null
          payment_terms?: string | null
          po_date?: string | null
          po_number?: string | null
          provider_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          review_profile_id?: string | null
          shipping_address?: Json
          subtotal?: number | null
          sync_state?: string
          tax_total?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: Json
          buyer?: Json
          created_at?: string
          currency?: string | null
          customer_mapping_id?: string | null
          delivery_date?: string | null
          document_id?: string
          document_kind?: string | null
          extraction_id?: string | null
          id?: string
          last_sync_error?: string | null
          meta?: Json
          notes?: string | null
          odoo_so_id?: number | null
          odoo_so_name?: string | null
          payment_terms?: string | null
          po_date?: string | null
          po_number?: string | null
          provider_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          review_profile_id?: string | null
          shipping_address?: Json
          subtotal?: number | null
          sync_state?: string
          tax_total?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_drafts_customer_mapping_id_fkey"
            columns: ["customer_mapping_id"]
            isOneToOne: false
            referencedRelation: "customer_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_review_profile_id_fkey"
            columns: ["review_profile_id"]
            isOneToOne: false
            referencedRelation: "review_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mappings: {
        Row: {
          confidence: number
          created_at: string
          default_tax_rate: number | null
          default_uom: string | null
          id: string
          match_description: string | null
          match_sku: string | null
          odoo_product_id: number
          odoo_product_name: string
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          default_tax_rate?: number | null
          default_uom?: string | null
          id?: string
          match_description?: string | null
          match_sku?: string | null
          odoo_product_id: number
          odoo_product_name: string
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          default_tax_rate?: number | null
          default_uom?: string | null
          id?: string
          match_description?: string | null
          match_sku?: string | null
          odoo_product_id?: number
          odoo_product_name?: string
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          activated_at: string | null
          activated_by_email: string | null
          content: string
          created_at: string
          created_by_email: string | null
          description: string | null
          id: string
          is_active: boolean
          max_tokens: number
          model: string
          prompt_id: string
          version_label: string
        }
        Insert: {
          activated_at?: string | null
          activated_by_email?: string | null
          content: string
          created_at?: string
          created_by_email?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_tokens: number
          model: string
          prompt_id: string
          version_label: string
        }
        Update: {
          activated_at?: string | null
          activated_by_email?: string | null
          content?: string
          created_at?: string
          created_by_email?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_tokens?: number
          model?: string
          prompt_id?: string
          version_label?: string
        }
        Relationships: []
      }
      provider_detection_rules: {
        Row: {
          active: boolean
          confidence: number
          created_at: string
          field_path: string | null
          id: string
          pattern: string
          priority: number
          provider_id: string
          rule_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          confidence?: number
          created_at?: string
          field_path?: string | null
          id?: string
          pattern: string
          priority?: number
          provider_id: string
          rule_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          confidence?: number
          created_at?: string
          field_path?: string | null
          id?: string
          pattern?: string
          priority?: number
          provider_id?: string
          rule_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_detection_rules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_detection_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_field_annotations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          normalized_text: string | null
          provider_id: string
          selection_meta: Json
          source_hint: string | null
          target_field_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_text?: string | null
          provider_id: string
          selection_meta?: Json
          source_hint?: string | null
          target_field_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_text?: string | null
          provider_id?: string
          selection_meta?: Json
          source_hint?: string | null
          target_field_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_field_annotations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_field_annotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_field_mappings: {
        Row: {
          active: boolean
          created_at: string
          id: string
          provider_id: string
          required_override: boolean | null
          source_field_key: string
          source_field_label: string | null
          target_field_id: string
          tenant_id: string
          transform: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          provider_id: string
          required_override?: boolean | null
          source_field_key: string
          source_field_label?: string | null
          target_field_id: string
          tenant_id: string
          transform?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          provider_id?: string
          required_override?: boolean | null
          source_field_key?: string
          source_field_label?: string | null
          target_field_id?: string
          tenant_id?: string
          transform?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_field_mappings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_field_mappings_target_field_id_fkey"
            columns: ["target_field_id"]
            isOneToOne: false
            referencedRelation: "target_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_field_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_product_mappings: {
        Row: {
          confidence: number
          created_at: string
          default_tax_rate: number | null
          default_uom: string | null
          id: string
          odoo_default_code: string | null
          odoo_product_id: number
          odoo_product_name: string
          provider_id: string
          source: string
          source_company_sku: string | null
          source_description: string | null
          source_sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          default_tax_rate?: number | null
          default_uom?: string | null
          id?: string
          odoo_default_code?: string | null
          odoo_product_id: number
          odoo_product_name: string
          provider_id: string
          source?: string
          source_company_sku?: string | null
          source_description?: string | null
          source_sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          default_tax_rate?: number | null
          default_uom?: string | null
          id?: string
          odoo_default_code?: string | null
          odoo_product_id?: number
          odoo_product_name?: string
          provider_id?: string
          source?: string
          source_company_sku?: string | null
          source_description?: string | null
          source_sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_product_mappings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_product_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_reseller_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          odoo_partner_id: number
          odoo_partner_name: string | null
          provider_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          odoo_partner_id: number
          odoo_partner_name?: string | null
          provider_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          odoo_partner_id?: number
          odoo_partner_name?: string | null
          provider_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_reseller_mappings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_reseller_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          code: string
          created_at: string
          default_currency: string | null
          email_domains: string[]
          id: string
          name: string
          settings: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_currency?: string | null
          email_domains?: string[]
          id?: string
          name: string
          settings?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_currency?: string | null
          email_domains?: string[]
          id?: string
          name?: string
          settings?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          key: string
          refilled_at: string
          tenant_id: string
          tokens: number
        }
        Insert: {
          key: string
          refilled_at?: string
          tenant_id: string
          tokens: number
        }
        Update: {
          key?: string
          refilled_at?: string
          tenant_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      review_profiles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          document_kind: string
          id: string
          layout: Json
          name: string
          normalize_billing_from_odoo_partner: boolean
          slug: string
          sort_order: number
          system: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          document_kind: string
          id?: string
          layout?: Json
          name: string
          normalize_billing_from_odoo_partner?: boolean
          slug: string
          sort_order?: number
          system?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          document_kind?: string
          id?: string
          layout?: Json
          name?: string
          normalize_billing_from_odoo_partner?: boolean
          slug?: string
          sort_order?: number
          system?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rithum_orders: {
        Row: {
          attempts: number
          created_at: string
          document_id: string | null
          failure_screenshot_path: string | null
          html_storage_path: string | null
          id: string
          inbound_email_id: string | null
          last_error: string | null
          last_error_code: string | null
          last_error_diagnostics: Json | null
          meta: Json
          parsed_payload: Json | null
          pdf_source: string | null
          rithum_order_number: string
          rithum_partner: string | null
          rithum_status: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_id?: string | null
          failure_screenshot_path?: string | null
          html_storage_path?: string | null
          id?: string
          inbound_email_id?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_diagnostics?: Json | null
          meta?: Json
          parsed_payload?: Json | null
          pdf_source?: string | null
          rithum_order_number: string
          rithum_partner?: string | null
          rithum_status?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          document_id?: string | null
          failure_screenshot_path?: string | null
          html_storage_path?: string | null
          id?: string
          inbound_email_id?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_diagnostics?: Json | null
          meta?: Json
          parsed_payload?: Json | null
          pdf_source?: string | null
          rithum_order_number?: string
          rithum_partner?: string | null
          rithum_status?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rithum_orders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rithum_orders_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rithum_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rithum_smoke_runs: {
        Row: {
          checks: Json
          created_at: string
          id: string
          ok: boolean
          tenant_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          ok: boolean
          tenant_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          ok?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rithum_smoke_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      target_fields: {
        Row: {
          active: boolean
          created_at: string
          default_value: Json | null
          id: string
          key: string
          label: string
          required: boolean
          review_profile_id: string | null
          scope: string
          sort_order: number
          system: boolean
          target_field: string
          target_model: string
          tenant_id: string
          updated_at: string
          validation: Json
          value_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_value?: Json | null
          id?: string
          key: string
          label: string
          required?: boolean
          review_profile_id?: string | null
          scope: string
          sort_order?: number
          system?: boolean
          target_field: string
          target_model: string
          tenant_id: string
          updated_at?: string
          validation?: Json
          value_type?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_value?: Json | null
          id?: string
          key?: string
          label?: string
          required?: boolean
          review_profile_id?: string | null
          scope?: string
          sort_order?: number
          system?: boolean
          target_field?: string
          target_model?: string
          tenant_id?: string
          updated_at?: string
          validation?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_fields_review_profile_id_fkey"
            columns: ["review_profile_id"]
            isOneToOne: false
            referencedRelation: "review_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "target_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          auto_approve_clean: boolean
          created_at: string
          display_tz: string
          id: string
          locale: string
          name: string
          scan_pin_hash: string | null
          scan_pin_salt: string | null
          scan_pin_updated_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          auto_approve_clean?: boolean
          created_at?: string
          display_tz?: string
          id?: string
          locale?: string
          name: string
          scan_pin_hash?: string | null
          scan_pin_salt?: string | null
          scan_pin_updated_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          auto_approve_clean?: boolean
          created_at?: string
          display_tz?: string
          id?: string
          locale?: string
          name?: string
          scan_pin_hash?: string | null
          scan_pin_salt?: string | null
          scan_pin_updated_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      walmart_buybox_snapshots: {
        Row: {
          buybox_price: number | null
          competitor_count: number | null
          id: string
          is_winning: boolean
          our_price: number | null
          taken_at: string
          tenant_id: string
          walmart_item_id: string
        }
        Insert: {
          buybox_price?: number | null
          competitor_count?: number | null
          id?: string
          is_winning: boolean
          our_price?: number | null
          taken_at?: string
          tenant_id: string
          walmart_item_id: string
        }
        Update: {
          buybox_price?: number | null
          competitor_count?: number | null
          id?: string
          is_winning?: boolean
          our_price?: number | null
          taken_at?: string
          tenant_id?: string
          walmart_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walmart_buybox_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_inventory_snapshots: {
        Row: {
          id: string
          inventory_total: number
          taken_at: string
          tenant_id: string
          walmart_item_id: string
        }
        Insert: {
          id?: string
          inventory_total: number
          taken_at?: string
          tenant_id: string
          walmart_item_id: string
        }
        Update: {
          id?: string
          inventory_total?: number
          taken_at?: string
          tenant_id?: string
          walmart_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walmart_inventory_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_items: {
        Row: {
          buybox_winner_price: number | null
          buybox_winning: boolean | null
          category: string | null
          currency: string | null
          id: string
          inventory_total: number | null
          inventory_unit: string | null
          lag_time_days: number | null
          last_sale_date: string | null
          price: number | null
          product_name: string | null
          publish_status: string | null
          raw_data: Json | null
          ship_node_type: string | null
          sku: string
          status: string | null
          synced_at: string
          tenant_id: string
          units_sold_30d: number | null
          units_sold_90d: number | null
          upc: string | null
          walmart_item_id: string
        }
        Insert: {
          buybox_winner_price?: number | null
          buybox_winning?: boolean | null
          category?: string | null
          currency?: string | null
          id?: string
          inventory_total?: number | null
          inventory_unit?: string | null
          lag_time_days?: number | null
          last_sale_date?: string | null
          price?: number | null
          product_name?: string | null
          publish_status?: string | null
          raw_data?: Json | null
          ship_node_type?: string | null
          sku: string
          status?: string | null
          synced_at?: string
          tenant_id: string
          units_sold_30d?: number | null
          units_sold_90d?: number | null
          upc?: string | null
          walmart_item_id: string
        }
        Update: {
          buybox_winner_price?: number | null
          buybox_winning?: boolean | null
          category?: string | null
          currency?: string | null
          id?: string
          inventory_total?: number | null
          inventory_unit?: string | null
          lag_time_days?: number | null
          last_sale_date?: string | null
          price?: number | null
          product_name?: string | null
          publish_status?: string | null
          raw_data?: Json | null
          ship_node_type?: string | null
          sku?: string
          status?: string | null
          synced_at?: string
          tenant_id?: string
          units_sold_30d?: number | null
          units_sold_90d?: number | null
          upc?: string | null
          walmart_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walmart_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_orders: {
        Row: {
          acknowledged_at: string | null
          attempts: number
          created_at: string
          customer_order_id: string | null
          document_id: string | null
          id: string
          last_error: string | null
          meta: Json
          parsed_payload: Json | null
          raw_response: Json | null
          ship_node_id: string | null
          source: string
          state: string
          tenant_id: string
          updated_at: string
          walmart_po_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          attempts?: number
          created_at?: string
          customer_order_id?: string | null
          document_id?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          parsed_payload?: Json | null
          raw_response?: Json | null
          ship_node_id?: string | null
          source?: string
          state?: string
          tenant_id: string
          updated_at?: string
          walmart_po_id: string
        }
        Update: {
          acknowledged_at?: string | null
          attempts?: number
          created_at?: string
          customer_order_id?: string | null
          document_id?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          parsed_payload?: Json | null
          raw_response?: Json | null
          ship_node_id?: string | null
          source?: string
          state?: string
          tenant_id?: string
          updated_at?: string
          walmart_po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walmart_orders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walmart_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_performance_snapshots: {
        Row: {
          cancellation_rate: number | null
          id: string
          on_time_delivery_rate: number | null
          raw_data: Json | null
          refund_rate: number | null
          seller_response_rate: number | null
          taken_at: string
          tenant_id: string
          valid_tracking_rate: number | null
        }
        Insert: {
          cancellation_rate?: number | null
          id?: string
          on_time_delivery_rate?: number | null
          raw_data?: Json | null
          refund_rate?: number | null
          seller_response_rate?: number | null
          taken_at?: string
          tenant_id: string
          valid_tracking_rate?: number | null
        }
        Update: {
          cancellation_rate?: number | null
          id?: string
          on_time_delivery_rate?: number | null
          raw_data?: Json | null
          refund_rate?: number | null
          seller_response_rate?: number | null
          taken_at?: string
          tenant_id?: string
          valid_tracking_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "walmart_performance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_returns: {
        Row: {
          created_at: string
          customer_order_id: string | null
          id: string
          raw_data: Json | null
          refund_amount: number | null
          refund_status: string | null
          return_lines: Json | null
          return_order_id: string
          return_reason: string | null
          return_status: string | null
          synced_at: string
          tenant_id: string
          walmart_po_id: string | null
        }
        Insert: {
          created_at?: string
          customer_order_id?: string | null
          id?: string
          raw_data?: Json | null
          refund_amount?: number | null
          refund_status?: string | null
          return_lines?: Json | null
          return_order_id: string
          return_reason?: string | null
          return_status?: string | null
          synced_at?: string
          tenant_id: string
          walmart_po_id?: string | null
        }
        Update: {
          created_at?: string
          customer_order_id?: string | null
          id?: string
          raw_data?: Json | null
          refund_amount?: number | null
          refund_status?: string | null
          return_lines?: Json | null
          return_order_id?: string
          return_reason?: string | null
          return_status?: string | null
          synced_at?: string
          tenant_id?: string
          walmart_po_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "walmart_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_smoke_runs: {
        Row: {
          checks: Json
          created_at: string
          id: string
          ok: boolean
          tenant_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          ok: boolean
          tenant_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          ok?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walmart_smoke_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      walmart_tenant_settings: {
        Row: {
          ai_fallback_enabled: boolean
          auto_acknowledge: boolean
          created_at: string
          meta: Json
          tenant_id: string
          updated_at: string
          webhook_subscription_id: string | null
        }
        Insert: {
          ai_fallback_enabled?: boolean
          auto_acknowledge?: boolean
          created_at?: string
          meta?: Json
          tenant_id: string
          updated_at?: string
          webhook_subscription_id?: string | null
        }
        Update: {
          ai_fallback_enabled?: boolean
          auto_acknowledge?: boolean
          created_at?: string
          meta?: Json
          tenant_id?: string
          updated_at?: string
          webhook_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "walmart_tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          created_at: string
          document_id: string | null
          duration_ms: number | null
          error_code: string | null
          id: string
          meta: Json
          outcome: string
          run_id: string | null
          stage: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          meta?: Json
          outcome: string
          run_id?: string | null
          stage: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          meta?: Json
          outcome?: string
          run_id?: string | null
          stage?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      credit_balances: {
        Row: {
          balance: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_tenant_member_by_email: {
        Args: { p_email: string; p_role?: string; p_tenant_id: string }
        Returns: {
          created_at: string
          member_id: string
          role: string
          user_id: string
        }[]
      }
      is_tenant_member: { Args: { t: string }; Returns: boolean }
      is_tenant_owner: { Args: { t: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
