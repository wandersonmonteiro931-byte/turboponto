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
      empresas: {
        Row: {
          afastado_pode_bater_ponto: boolean
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          horario_entrada: string | null
          horario_saida: string | null
          id: string
          intervalo_almoco_min: number | null
          logo_url: string | null
          nome_fantasia: string
          razao_social: string | null
          responsavel: string | null
          telefone: string | null
          tolerancia_atraso_min: number | null
          updated_at: string
        }
        Insert: {
          afastado_pode_bater_ponto?: boolean
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          horario_entrada?: string | null
          horario_saida?: string | null
          id?: string
          intervalo_almoco_min?: number | null
          logo_url?: string | null
          nome_fantasia: string
          razao_social?: string | null
          responsavel?: string | null
          telefone?: string | null
          tolerancia_atraso_min?: number | null
          updated_at?: string
        }
        Update: {
          afastado_pode_bater_ponto?: boolean
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          horario_entrada?: string | null
          horario_saida?: string | null
          id?: string
          intervalo_almoco_min?: number | null
          logo_url?: string | null
          nome_fantasia?: string
          razao_social?: string | null
          responsavel?: string | null
          telefone?: string | null
          tolerancia_atraso_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          empresa_id: string
          endereco: string | null
          foto_url: string | null
          id: string
          jornada_padrao_id: string | null
          motivo_desligamento: string | null
          nome: string
          observacoes: string | null
          permite_bater_ponto: boolean
          rg: string | null
          salario: number | null
          status: string
          telefone: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id: string
          endereco?: string | null
          foto_url?: string | null
          id?: string
          jornada_padrao_id?: string | null
          motivo_desligamento?: string | null
          nome: string
          observacoes?: string | null
          permite_bater_ponto?: boolean
          rg?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id?: string
          endereco?: string | null
          foto_url?: string | null
          id?: string
          jornada_padrao_id?: string | null
          motivo_desligamento?: string | null
          nome?: string
          observacoes?: string | null
          permite_bater_ponto?: boolean
          rg?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios_jornadas: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string
          funcionario_id: string
          id: string
          jornada_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcionario_id: string
          id?: string
          jornada_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcionario_id?: string
          id?: string
          jornada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_jornadas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_jornadas_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          carga_horaria_minutos: number
          created_at: string
          descricao: string | null
          empresa_id: string
          horario_entrada: string | null
          horario_intervalo_retorno: string | null
          horario_intervalo_saida: string | null
          horario_saida: string | null
          id: string
          nome: string
          status: string
          tolerancia_atraso_minutos: number
          updated_at: string
        }
        Insert: {
          carga_horaria_minutos?: number
          created_at?: string
          descricao?: string | null
          empresa_id: string
          horario_entrada?: string | null
          horario_intervalo_retorno?: string | null
          horario_intervalo_saida?: string | null
          horario_saida?: string | null
          id?: string
          nome: string
          status?: string
          tolerancia_atraso_minutos?: number
          updated_at?: string
        }
        Update: {
          carga_horaria_minutos?: number
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          horario_entrada?: string | null
          horario_intervalo_retorno?: string | null
          horario_intervalo_saida?: string | null
          horario_saida?: string | null
          id?: string
          nome?: string
          status?: string
          tolerancia_atraso_minutos?: number
          updated_at?: string
        }
        Relationships: []
      }
      jornadas_dias: {
        Row: {
          dia_semana: number
          horario_entrada: string | null
          horario_intervalo_retorno: string | null
          horario_intervalo_saida: string | null
          horario_saida: string | null
          id: string
          jornada_id: string
          trabalha: boolean
        }
        Insert: {
          dia_semana: number
          horario_entrada?: string | null
          horario_intervalo_retorno?: string | null
          horario_intervalo_saida?: string | null
          horario_saida?: string | null
          id?: string
          jornada_id: string
          trabalha?: boolean
        }
        Update: {
          dia_semana?: number
          horario_entrada?: string | null
          horario_intervalo_retorno?: string | null
          horario_intervalo_saida?: string | null
          horario_saida?: string | null
          id?: string
          jornada_id?: string
          trabalha?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_dias_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          empresa_id: string | null
          id: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string | null
          id: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      criar_empresa_inicial: {
        Args: {
          _cnpj: string
          _email: string
          _endereco: string
          _nome_fantasia: string
          _razao_social: string
          _responsavel: string
          _telefone: string
        }
        Returns: string
      }
      get_user_empresa: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "funcionario"
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
      app_role: ["admin", "gerente", "funcionario"],
    },
  },
} as const
