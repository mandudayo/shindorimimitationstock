export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          game_id: string | null
          id: number
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          game_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          game_id?: string | null
          id?: never
        }
        Relationships: Relationship[]
      }
      admin_users: {
        Row: { created_at: string; user_id: string }
        Insert: { created_at?: string; user_id: string }
        Update: { created_at?: string; user_id?: string }
        Relationships: Relationship[]
      }
      games: {
        Row: {
          code: string
          created_at: string
          ended_at: string | null
          id: string
          initial_cash: number
          news_strength_multiplier: number
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          tick_interval_ms: number
          updated_at: string
          volatility_multiplier: number
        }
        Insert: {
          code: string
          created_at?: string
          ended_at?: string | null
          id?: string
          initial_cash?: number
          news_strength_multiplier?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tick_interval_ms?: number
          updated_at?: string
          volatility_multiplier?: number
        }
        Update: {
          code?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          initial_cash?: number
          news_strength_multiplier?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tick_interval_ms?: number
          updated_at?: string
          volatility_multiplier?: number
        }
        Relationships: Relationship[]
      }
      holdings: {
        Row: {
          avg_price: number
          game_id: string
          player_id: string
          quantity: number
          stock_id: string
          updated_at: string
        }
        Insert: {
          avg_price: number
          game_id: string
          player_id: string
          quantity: number
          stock_id: string
          updated_at?: string
        }
        Update: {
          avg_price?: number
          game_id?: string
          player_id?: string
          quantity?: number
          stock_id?: string
          updated_at?: string
        }
        Relationships: Relationship[]
      }
      news: {
        Row: {
          created_at: string
          description: string
          duration_seconds: number
          game_id: string
          id: string
          last_activated_at: string | null
          strength: number
          target_stock_id: string | null
          target_stock_name: string | null
          title: string
          type: Database["public"]["Enums"]["news_type"]
        }
        Insert: {
          created_at?: string
          description: string
          duration_seconds: number
          game_id: string
          id: string
          last_activated_at?: string | null
          strength: number
          target_stock_id?: string | null
          target_stock_name?: string | null
          title: string
          type: Database["public"]["Enums"]["news_type"]
        }
        Update: {
          created_at?: string
          description?: string
          duration_seconds?: number
          game_id?: string
          id?: string
          last_activated_at?: string | null
          strength?: number
          target_stock_id?: string | null
          target_stock_name?: string | null
          title?: string
          type?: Database["public"]["Enums"]["news_type"]
        }
        Relationships: Relationship[]
      }
      players: {
        Row: {
          auth_user_id: string
          cash: number
          created_at: string
          game_id: string
          id: string
          nickname: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          cash: number
          created_at?: string
          game_id: string
          id?: string
          nickname: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          cash?: number
          created_at?: string
          game_id?: string
          id?: string
          nickname?: string
          updated_at?: string
        }
        Relationships: Relationship[]
      }
      stocks: {
        Row: {
          code: string
          game_id: string
          id: string
          industry: string
          initial_price: number
          name: string
          previous_price: number
          price: number
          updated_at: string
          volatility: Database["public"]["Enums"]["stock_volatility"]
        }
        Insert: {
          code: string
          game_id: string
          id: string
          industry: string
          initial_price: number
          name: string
          previous_price: number
          price: number
          updated_at?: string
          volatility: Database["public"]["Enums"]["stock_volatility"]
        }
        Update: {
          code?: string
          game_id?: string
          id?: string
          industry?: string
          initial_price?: number
          name?: string
          previous_price?: number
          price?: number
          updated_at?: string
          volatility?: Database["public"]["Enums"]["stock_volatility"]
        }
        Relationships: Relationship[]
      }
      transactions: {
        Row: {
          created_at: string
          game_id: string
          id: string
          player_id: string
          price: number
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          stock_id: string
          stock_name: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id: string
          player_id: string
          price: number
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          stock_id: string
          stock_name: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          player_id?: string
          price?: number
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          stock_id?: string
          stock_name?: string
        }
        Relationships: Relationship[]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      activate_news: {
        Args: { p_game_id: string; p_news_id: string }
        Returns: undefined
      }
      execute_trade: {
        Args: {
          p_player_id: string
          p_quantity: number
          p_request_id: string
          p_side: Database["public"]["Enums"]["trade_side"]
          p_stock_id: string
        }
        Returns: Json
      }
      get_leaderboard: {
        Args: { p_game_id: string }
        Returns: {
          nickname: string
          player_id: string
          return_pct: number
          total_assets: number
        }[]
      }
      is_admin: {
        Args: { check_user_id?: string }
        Returns: boolean
      }
      join_game: { Args: { p_nickname: string }; Returns: string }
      reset_game: { Args: { p_game_id: string }; Returns: undefined }
      set_game_status: {
        Args: {
          p_game_id: string
          p_status: Database["public"]["Enums"]["game_status"]
        }
        Returns: undefined
      }
      update_game_settings: {
        Args: {
          p_game_id: string
          p_news_strength_multiplier: number
          p_tick_interval_ms: number
          p_volatility_multiplier: number
        }
        Returns: undefined
      }
    }
    Enums: {
      game_status: "waiting" | "running" | "paused" | "ended"
      news_type: "market_positive" | "market_negative" | "stock_positive" | "stock_negative"
      stock_volatility: "low" | "medium" | "high"
      trade_side: "buy" | "sell"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]

export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      game_status: ["waiting", "running", "paused", "ended"],
      news_type: ["market_positive", "market_negative", "stock_positive", "stock_negative"],
      stock_volatility: ["low", "medium", "high"],
      trade_side: ["buy", "sell"],
    },
  },
} as const
