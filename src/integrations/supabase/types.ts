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
      decisions: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          meeting_id: string
          source_timestamp_ms: number | null
          text: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          meeting_id: string
          source_timestamp_ms?: number | null
          text: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          meeting_id?: string
          source_timestamp_ms?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          meeting_id: string | null
          recipient_email: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          meeting_id?: string | null
          recipient_email: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          meeting_id?: string | null
          recipient_email?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          created_at: string
          email: string
          id: string
          meeting_id: string
          name: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          meeting_id: string
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          meeting_id?: string
          name?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audio_hash: string | null
          audio_path: string | null
          created_at: string
          duration_seconds: number | null
          encryption_iv: string | null
          ended_at: string | null
          id: string
          is_leadership: boolean
          language: string
          notes: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_hash?: string | null
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          encryption_iv?: string | null
          ended_at?: string | null
          id?: string
          is_leadership?: boolean
          language?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_hash?: string | null
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          encryption_iv?: string | null
          ended_at?: string | null
          id?: string
          is_leadership?: boolean
          language?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      open_questions: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          resolved: boolean
          source_timestamp_ms: number | null
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          resolved?: boolean
          source_timestamp_ms?: number | null
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          resolved?: boolean
          source_timestamp_ms?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_questions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      screenshots: {
        Row: {
          caption: string | null
          created_at: string
          hash: string | null
          id: string
          meeting_id: string
          storage_path: string
          timestamp_ms: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          meeting_id: string
          storage_path: string
          timestamp_ms: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          meeting_id?: string
          storage_path?: string
          timestamp_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      summaries: {
        Row: {
          content_encrypted: string
          content_iv: string
          generated_at: string
          id: string
          kind: string
          meeting_id: string
        }
        Insert: {
          content_encrypted: string
          content_iv: string
          generated_at?: string
          id?: string
          kind?: string
          meeting_id: string
        }
        Update: {
          content_encrypted?: string
          content_iv?: string
          generated_at?: string
          id?: string
          kind?: string
          meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_email: string | null
          assignee_name: string | null
          confidence: number | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string
          source_timestamp_ms: number | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_email?: string | null
          assignee_name?: string | null
          confidence?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id: string
          source_timestamp_ms?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_email?: string | null
          assignee_name?: string | null
          confidence?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string
          source_timestamp_ms?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          confidence: number | null
          created_at: string
          end_ms: number
          id: string
          meeting_id: string
          speaker: string | null
          start_ms: number
          text_encrypted: string
          text_hash: string
          text_iv: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          end_ms: number
          id?: string
          meeting_id: string
          speaker?: string | null
          start_ms: number
          text_encrypted: string
          text_hash: string
          text_iv: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          end_ms?: number
          id?: string
          meeting_id?: string
          speaker?: string | null
          start_ms?: number
          text_encrypted?: string
          text_hash?: string
          text_iv?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      unresolved_topics: {
        Row: {
          created_at: string
          id: string
          last_meeting_id: string | null
          last_seen_at: string
          mention_count: number
          status: string
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_meeting_id?: string | null
          last_seen_at?: string
          mention_count?: number
          status?: string
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_meeting_id?: string | null
          last_seen_at?: string
          mention_count?: number
          status?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unresolved_topics_last_meeting_id_fkey"
            columns: ["last_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          email_digest: boolean
          encryption_key_fingerprint: string | null
          leadership_mode: boolean
          ollama_model: string
          ollama_url: string
          updated_at: string
          user_id: string
          whisper_model: string
          whisper_url: string
        }
        Insert: {
          email_digest?: boolean
          encryption_key_fingerprint?: string | null
          leadership_mode?: boolean
          ollama_model?: string
          ollama_url?: string
          updated_at?: string
          user_id: string
          whisper_model?: string
          whisper_url?: string
        }
        Update: {
          email_digest?: boolean
          encryption_key_fingerprint?: string | null
          leadership_mode?: boolean
          ollama_model?: string
          ollama_url?: string
          updated_at?: string
          user_id?: string
          whisper_model?: string
          whisper_url?: string
        }
        Relationships: []
      }
      vocabulary: {
        Row: {
          category: string | null
          created_at: string
          id: string
          notes: string | null
          term: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          term: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          term?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_meeting: { Args: { _meeting_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member" | "leadership"
      meeting_status:
        | "scheduled"
        | "live"
        | "processing"
        | "completed"
        | "failed"
      task_status: "pending" | "in_progress" | "completed" | "overdue"
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
    Enums: {
      app_role: ["admin", "member", "leadership"],
      meeting_status: [
        "scheduled",
        "live",
        "processing",
        "completed",
        "failed",
      ],
      task_status: ["pending", "in_progress", "completed", "overdue"],
    },
  },
} as const
