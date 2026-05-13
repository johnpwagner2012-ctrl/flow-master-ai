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
      assets: {
        Row: {
          content: string | null
          created_at: string
          duration_ms: number | null
          file_url: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string | null
          node_execution_id: string | null
          node_key: string | null
          provider: string | null
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string | null
          thumbnail_url: string | null
          type: string
          user_id: string
          workflow_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          duration_ms?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string | null
          node_execution_id?: string | null
          node_key?: string | null
          provider?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          type?: string
          user_id: string
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          duration_ms?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string | null
          node_execution_id?: string | null
          node_key?: string | null
          provider?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          type?: string
          user_id?: string
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: []
      }
      execution_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          node_execution_id: string
          user_id: string
          workflow_run_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          node_execution_id: string
          user_id: string
          workflow_run_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          node_execution_id?: string
          user_id?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_logs_node_execution_id_fkey"
            columns: ["node_execution_id"]
            isOneToOne: false
            referencedRelation: "node_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_logs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      node_executions: {
        Row: {
          attempt: number
          client_payload: Json | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_data: Json | null
          node_key: string
          node_type: string
          output_data: Json | null
          provider: string | null
          started_at: string | null
          status: string
          user_id: string
          workflow_run_id: string
        }
        Insert: {
          attempt?: number
          client_payload?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_data?: Json | null
          node_key: string
          node_type: string
          output_data?: Json | null
          provider?: string | null
          started_at?: string | null
          status?: string
          user_id: string
          workflow_run_id: string
        }
        Update: {
          attempt?: number
          client_payload?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_data?: Json | null
          node_key?: string
          node_type?: string
          output_data?: Json | null
          provider?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_executions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_client_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          heartbeat_at: string | null
          id: string
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          node_execution_id: string
          node_key: string
          node_type: string
          payload: Json
          status: string
          user_id: string
          workflow_id: string
          workflow_run_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          node_execution_id: string
          node_key: string
          node_type: string
          payload: Json
          status?: string
          user_id: string
          workflow_id: string
          workflow_run_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          node_execution_id?: string
          node_key?: string
          node_type?: string
          payload?: Json
          status?: string
          user_id?: string
          workflow_id?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_client_jobs_node_execution_id_fkey"
            columns: ["node_execution_id"]
            isOneToOne: true
            referencedRelation: "node_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_client_jobs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token: string | null
          account_email: string | null
          account_label: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          account_label?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          account_label?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_edges: {
        Row: {
          created_at: string
          edge_key: string
          id: string
          source_handle: string | null
          source_key: string
          target_handle: string | null
          target_key: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          edge_key: string
          id?: string
          source_handle?: string | null
          source_key: string
          target_handle?: string | null
          target_key: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          edge_key?: string
          id?: string
          source_handle?: string | null
          source_key?: string
          target_handle?: string | null
          target_key?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string | null
          node_key: string
          position_x: number
          position_y: number
          type: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          node_key: string
          position_x?: number
          position_y?: number
          type: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          node_key?: string
          position_x?: number
          position_y?: number
          type?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          attempt: number
          cancel_requested: boolean
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          output_data: Json | null
          parent_run_id: string | null
          started_at: string | null
          status: string
          trigger_data: Json
          trigger_type: string
          user_id: string
          workflow_id: string
          workflow_version: number | null
        }
        Insert: {
          attempt?: number
          cancel_requested?: boolean
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          output_data?: Json | null
          parent_run_id?: string | null
          started_at?: string | null
          status?: string
          trigger_data?: Json
          trigger_type?: string
          user_id: string
          workflow_id: string
          workflow_version?: number | null
        }
        Update: {
          attempt?: number
          cancel_requested?: boolean
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          output_data?: Json | null
          parent_run_id?: string | null
          started_at?: string | null
          status?: string
          trigger_data?: Json
          trigger_type?: string
          user_id?: string
          workflow_id?: string
          workflow_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_schedules: {
        Row: {
          claimed_at: string | null
          created_at: string
          cron_expression: string
          enabled: boolean
          id: string
          last_run_at: string | null
          last_run_id: string | null
          next_run_at: string | null
          timezone: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          cron_expression: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_id?: string | null
          next_run_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          cron_expression?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_id?: string | null
          next_run_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_versions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_template: boolean
          name: string
          snapshot: Json
          user_id: string
          version: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          snapshot: Json
          user_id: string
          version: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          snapshot?: Json
          user_id?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          current_version: number
          description: string | null
          id: string
          is_active: boolean
          is_published: boolean
          name: string
          published_at: string | null
          updated_at: string
          user_id: string
          viewport: Json
        }
        Insert: {
          created_at?: string
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          name?: string
          published_at?: string | null
          updated_at?: string
          user_id: string
          viewport?: Json
        }
        Update: {
          created_at?: string
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          name?: string
          published_at?: string | null
          updated_at?: string
          user_id?: string
          viewport?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_client_job: {
        Args: {
          _lease_seconds?: number
          _types?: string[]
          _user_id: string
          _worker_id: string
        }
        Returns: {
          attempts: number
          id: string
          max_attempts: number
          node_execution_id: string
          node_key: string
          node_type: string
          payload: Json
          workflow_id: string
          workflow_run_id: string
        }[]
      }
      claim_due_schedules: {
        Args: { _limit?: number; _lock_seconds?: number }
        Returns: {
          cron_expression: string
          id: string
          next_run_at: string
          timezone: string
          user_id: string
          workflow_id: string
        }[]
      }
      mark_schedule_run: {
        Args: { _id: string; _next_run_at: string; _run_id: string }
        Returns: undefined
      }
      release_stale_client_jobs: { Args: never; Returns: number }
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
