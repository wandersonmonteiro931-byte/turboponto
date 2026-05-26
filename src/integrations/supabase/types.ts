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
      alteracoes_ponto: {
        Row: {
          campo_alterado: string
          created_at: string
          empresa_id: string
          funcionario_id: string
          id: string
          justificativa: string
          registro_ponto_id: string | null
          usuario_editor_id: string
          valor_antigo: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado: string
          created_at?: string
          empresa_id: string
          funcionario_id: string
          id?: string
          justificativa: string
          registro_ponto_id?: string | null
          usuario_editor_id: string
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string
          created_at?: string
          empresa_id?: string
          funcionario_id?: string
          id?: string
          justificativa?: string
          registro_ponto_id?: string | null
          usuario_editor_id?: string
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      avisos: {
        Row: {
          cargo_destino: string | null
          created_at: string
          criado_por: string
          empresa_id: string
          funcionario_id: string | null
          id: string
          mensagem: string
          status: string
          tipo_destino: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cargo_destino?: string | null
          created_at?: string
          criado_por: string
          empresa_id: string
          funcionario_id?: string | null
          id?: string
          mensagem: string
          status?: string
          tipo_destino?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cargo_destino?: string | null
          created_at?: string
          criado_por?: string
          empresa_id?: string
          funcionario_id?: string | null
          id?: string
          mensagem?: string
          status?: string
          tipo_destino?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_funcionario_fk"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_leituras: {
        Row: {
          aviso_id: string
          funcionario_id: string
          id: string
          lido_em: string
        }
        Insert: {
          aviso_id: string
          funcionario_id: string
          id?: string
          lido_em?: string
        }
        Update: {
          aviso_id?: string
          funcionario_id?: string
          id?: string
          lido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "avleit_aviso_fk"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avleit_funcionario_fk"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      banco_horas_movimentos: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          empresa_id: string
          funcionario_id: string
          id: string
          justificativa_aplicada_id: string | null
          minutos: number
          observacao: string | null
          origem: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          empresa_id: string
          funcionario_id: string
          id?: string
          justificativa_aplicada_id?: string | null
          minutos: number
          observacao?: string | null
          origem?: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          empresa_id?: string
          funcionario_id?: string
          id?: string
          justificativa_aplicada_id?: string | null
          minutos?: number
          observacao?: string | null
          origem?: string
          tipo?: string
        }
        Relationships: []
      }
      beneficios: {
        Row: {
          created_at: string
          dia_entrega: number
          empresa_id: string
          id: string
          limite_alerta_minutos: number
          limite_atraso_minutos: number
          nome: string
          regra_descricao: string | null
          status: string
          tipo: string
          updated_at: string
          valor_maximo: number
        }
        Insert: {
          created_at?: string
          dia_entrega?: number
          empresa_id: string
          id?: string
          limite_alerta_minutos?: number
          limite_atraso_minutos?: number
          nome: string
          regra_descricao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_maximo?: number
        }
        Update: {
          created_at?: string
          dia_entrega?: number
          empresa_id?: string
          id?: string
          limite_alerta_minutos?: number
          limite_atraso_minutos?: number
          nome?: string
          regra_descricao?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_maximo?: number
        }
        Relationships: []
      }
      beneficios_calculos: {
        Row: {
          ano_referencia: number
          beneficio_id: string
          calculado_em: string
          created_at: string
          dias_com_atraso: number
          empresa_id: string
          faltas_injustificadas: number
          fechado_em: string | null
          funcionario_id: string
          horas_extras_minutos: number
          id: string
          mes_referencia: number
          motivo_perda: string | null
          status: string
          tem_direito: boolean
          total_atraso_minutos: number
          updated_at: string
          valor_estimado: number
        }
        Insert: {
          ano_referencia: number
          beneficio_id: string
          calculado_em?: string
          created_at?: string
          dias_com_atraso?: number
          empresa_id: string
          faltas_injustificadas?: number
          fechado_em?: string | null
          funcionario_id: string
          horas_extras_minutos?: number
          id?: string
          mes_referencia: number
          motivo_perda?: string | null
          status?: string
          tem_direito?: boolean
          total_atraso_minutos?: number
          updated_at?: string
          valor_estimado?: number
        }
        Update: {
          ano_referencia?: number
          beneficio_id?: string
          calculado_em?: string
          created_at?: string
          dias_com_atraso?: number
          empresa_id?: string
          faltas_injustificadas?: number
          fechado_em?: string | null
          funcionario_id?: string
          horas_extras_minutos?: number
          id?: string
          mes_referencia?: number
          motivo_perda?: string | null
          status?: string
          tem_direito?: boolean
          total_atraso_minutos?: number
          updated_at?: string
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "bencalc_beneficio_fk"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bencalc_funcionario_fk"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficios_entregas: {
        Row: {
          ano_referencia: number
          beneficio_id: string
          created_at: string
          data_entrega: string | null
          empresa_id: string
          entregue: boolean
          entregue_por: string | null
          funcionario_id: string
          id: string
          mes_referencia: number
          observacao: string | null
          recibo_pdf_url: string | null
          valor_estimado: number
        }
        Insert: {
          ano_referencia: number
          beneficio_id: string
          created_at?: string
          data_entrega?: string | null
          empresa_id: string
          entregue?: boolean
          entregue_por?: string | null
          funcionario_id: string
          id?: string
          mes_referencia: number
          observacao?: string | null
          recibo_pdf_url?: string | null
          valor_estimado?: number
        }
        Update: {
          ano_referencia?: number
          beneficio_id?: string
          created_at?: string
          data_entrega?: string | null
          empresa_id?: string
          entregue?: boolean
          entregue_por?: string | null
          funcionario_id?: string
          id?: string
          mes_referencia?: number
          observacao?: string | null
          recibo_pdf_url?: string | null
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "benent_beneficio_fk"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benent_funcionario_fk"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficios_logs: {
        Row: {
          acao: string
          beneficio_id: string | null
          created_at: string
          empresa_id: string
          funcionario_id: string | null
          id: string
          justificativa: string | null
          status_anterior: string | null
          status_novo: string | null
          usuario_id: string
        }
        Insert: {
          acao: string
          beneficio_id?: string | null
          created_at?: string
          empresa_id: string
          funcionario_id?: string | null
          id?: string
          justificativa?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id: string
        }
        Update: {
          acao?: string
          beneficio_id?: string | null
          created_at?: string
          empresa_id?: string
          funcionario_id?: string | null
          id?: string
          justificativa?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      cartoes_ponto: {
        Row: {
          ano_referencia: number
          created_at: string
          empresa_id: string
          fechado_em: string | null
          funcionario_id: string
          id: string
          liberado_em: string | null
          mes_referencia: number
          pdf_url: string | null
          status: string
          total_atraso_minutos: number
          total_faltas: number
          total_horas_extras_minutos: number
          total_horas_trabalhadas_minutos: number
          updated_at: string
        }
        Insert: {
          ano_referencia: number
          created_at?: string
          empresa_id: string
          fechado_em?: string | null
          funcionario_id: string
          id?: string
          liberado_em?: string | null
          mes_referencia: number
          pdf_url?: string | null
          status?: string
          total_atraso_minutos?: number
          total_faltas?: number
          total_horas_extras_minutos?: number
          total_horas_trabalhadas_minutos?: number
          updated_at?: string
        }
        Update: {
          ano_referencia?: number
          created_at?: string
          empresa_id?: string
          fechado_em?: string | null
          funcionario_id?: string
          id?: string
          liberado_em?: string | null
          mes_referencia?: number
          pdf_url?: string | null
          status?: string
          total_atraso_minutos?: number
          total_faltas?: number
          total_horas_extras_minutos?: number
          total_horas_trabalhadas_minutos?: number
          updated_at?: string
        }
        Relationships: []
      }
      dias_falta: {
        Row: {
          created_at: string
          data: string
          empresa_id: string
          funcionario_id: string
          id: string
          justificativa: string | null
          marcado_por: string | null
        }
        Insert: {
          created_at?: string
          data: string
          empresa_id: string
          funcionario_id: string
          id?: string
          justificativa?: string | null
          marcado_por?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          empresa_id?: string
          funcionario_id?: string
          id?: string
          justificativa?: string | null
          marcado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dias_falta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_falta_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
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
      fechamentos_mensais: {
        Row: {
          ano_referencia: number
          created_at: string
          empresa_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          liberado_em: string | null
          mes_referencia: number
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ano_referencia: number
          created_at?: string
          empresa_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          liberado_em?: string | null
          mes_referencia: number
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ano_referencia?: number
          created_at?: string
          empresa_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          liberado_em?: string | null
          mes_referencia?: number
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          banco_agencia: string | null
          cargo: string | null
          conta: string | null
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
          lotacao: string | null
          matricula: string | null
          motivo_desligamento: string | null
          nome: string
          num_dep_irrf: number
          num_dep_sal_fam: number
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
          banco_agencia?: string | null
          cargo?: string | null
          conta?: string | null
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
          lotacao?: string | null
          matricula?: string | null
          motivo_desligamento?: string | null
          nome: string
          num_dep_irrf?: number
          num_dep_sal_fam?: number
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
          banco_agencia?: string | null
          cargo?: string | null
          conta?: string | null
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
          lotacao?: string | null
          matricula?: string | null
          motivo_desligamento?: string | null
          nome?: string
          num_dep_irrf?: number
          num_dep_sal_fam?: number
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
      holerite_lancamentos: {
        Row: {
          codigo: string
          created_at: string
          desconto: number
          descricao: string
          empresa_id: string
          holerite_id: string
          id: string
          ordem: number
          provento: number
          qtde: number | null
          resultado: number
        }
        Insert: {
          codigo: string
          created_at?: string
          desconto?: number
          descricao: string
          empresa_id: string
          holerite_id: string
          id?: string
          ordem?: number
          provento?: number
          qtde?: number | null
          resultado?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          desconto?: number
          descricao?: string
          empresa_id?: string
          holerite_id?: string
          id?: string
          ordem?: number
          provento?: number
          qtde?: number | null
          resultado?: number
        }
        Relationships: [
          {
            foreignKeyName: "holerite_lancamentos_holerite_id_fkey"
            columns: ["holerite_id"]
            isOneToOne: false
            referencedRelation: "holerites"
            referencedColumns: ["id"]
          },
        ]
      }
      holerite_rubricas: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string
          empresa_id: string
          id: string
          tipo: string
          tipo_calculo: string
          updated_at: string
          valor_referencia: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao: string
          empresa_id: string
          id?: string
          tipo: string
          tipo_calculo?: string
          updated_at?: string
          valor_referencia?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string
          empresa_id?: string
          id?: string
          tipo?: string
          tipo_calculo?: string
          updated_at?: string
          valor_referencia?: number
        }
        Relationships: []
      }
      holerites: {
        Row: {
          acessado_em: string | null
          ano_referencia: number
          banco_agencia: string | null
          base_fgts: number
          base_irpf: number
          conta: string | null
          created_at: string
          data_pagamento: string | null
          empresa_id: string
          fgts_mes: number
          folha_tipo: string
          funcionario_id: string
          id: string
          liberado: boolean
          liberado_em: string | null
          liberado_por: string | null
          lotacao: string | null
          mes_referencia: number
          num_dep_irrf: number
          num_dep_sal_fam: number
          observacoes: string | null
          pdf_url: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          sal_contrib_inss: number
          salario_contratual: number
          status: string
          total_descontos: number
          total_liquido: number
          total_proventos: number
          updated_at: string
        }
        Insert: {
          acessado_em?: string | null
          ano_referencia: number
          banco_agencia?: string | null
          base_fgts?: number
          base_irpf?: number
          conta?: string | null
          created_at?: string
          data_pagamento?: string | null
          empresa_id: string
          fgts_mes?: number
          folha_tipo?: string
          funcionario_id: string
          id?: string
          liberado?: boolean
          liberado_em?: string | null
          liberado_por?: string | null
          lotacao?: string | null
          mes_referencia: number
          num_dep_irrf?: number
          num_dep_sal_fam?: number
          observacoes?: string | null
          pdf_url?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          sal_contrib_inss?: number
          salario_contratual?: number
          status?: string
          total_descontos?: number
          total_liquido?: number
          total_proventos?: number
          updated_at?: string
        }
        Update: {
          acessado_em?: string | null
          ano_referencia?: number
          banco_agencia?: string | null
          base_fgts?: number
          base_irpf?: number
          conta?: string | null
          created_at?: string
          data_pagamento?: string | null
          empresa_id?: string
          fgts_mes?: number
          folha_tipo?: string
          funcionario_id?: string
          id?: string
          liberado?: boolean
          liberado_em?: string | null
          liberado_por?: string | null
          lotacao?: string | null
          mes_referencia?: number
          num_dep_irrf?: number
          num_dep_sal_fam?: number
          observacoes?: string | null
          pdf_url?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          sal_contrib_inss?: number
          salario_contratual?: number
          status?: string
          total_descontos?: number
          total_liquido?: number
          total_proventos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holerites_funcionario_fk"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          carga_horaria_minutos: number
          codigo: string
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
          codigo: string
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
          codigo?: string
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
      justificativas_aplicadas: {
        Row: {
          anexo_url: string | null
          aplicado_por: string
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          data: string
          data_fim: string | null
          data_inicio: string | null
          empresa_id: string
          funcionario_id: string
          id: string
          observacao: string | null
          quantidade_minutos: number | null
          status: string
          tipo_id: string
          updated_at: string
        }
        Insert: {
          anexo_url?: string | null
          aplicado_por: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          data: string
          data_fim?: string | null
          data_inicio?: string | null
          empresa_id: string
          funcionario_id: string
          id?: string
          observacao?: string | null
          quantidade_minutos?: number | null
          status?: string
          tipo_id: string
          updated_at?: string
        }
        Update: {
          anexo_url?: string | null
          aplicado_por?: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          data?: string
          data_fim?: string | null
          data_inicio?: string | null
          empresa_id?: string
          funcionario_id?: string
          id?: string
          observacao?: string | null
          quantidade_minutos?: number | null
          status?: string
          tipo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "justificativas_aplicadas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificativas_aplicadas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "justificativas_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      justificativas_historico: {
        Row: {
          acao: string
          alterado_por: string | null
          created_at: string
          empresa_id: string
          funcionario_id: string
          id: string
          justificativa_id: string
          observacao: string | null
          status_anterior: string | null
          status_novo: string | null
        }
        Insert: {
          acao: string
          alterado_por?: string | null
          created_at?: string
          empresa_id: string
          funcionario_id: string
          id?: string
          justificativa_id: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo?: string | null
        }
        Update: {
          acao?: string
          alterado_por?: string | null
          created_at?: string
          empresa_id?: string
          funcionario_id?: string
          id?: string
          justificativa_id?: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo?: string | null
        }
        Relationships: []
      }
      justificativas_tipos: {
        Row: {
          abona_ocorrencia: boolean
          afeta_assiduidade: string
          ativo: boolean
          categoria: string
          codigo: string
          conta_dia_trabalhado: boolean
          created_at: string
          desconta_dsr: boolean
          desconta_salario: boolean
          descricao: string | null
          empresa_id: string
          exige_anexo: boolean
          exige_aprovacao: boolean
          exige_marcacao_ponto: boolean
          exige_observacao: boolean
          id: string
          movimenta_banco_horas: string
          nome: string
          padrao_sistema: boolean
          pode_aplicar_individual: boolean
          pode_aplicar_massa: boolean
          updated_at: string
        }
        Insert: {
          abona_ocorrencia?: boolean
          afeta_assiduidade?: string
          ativo?: boolean
          categoria: string
          codigo: string
          conta_dia_trabalhado?: boolean
          created_at?: string
          desconta_dsr?: boolean
          desconta_salario?: boolean
          descricao?: string | null
          empresa_id: string
          exige_anexo?: boolean
          exige_aprovacao?: boolean
          exige_marcacao_ponto?: boolean
          exige_observacao?: boolean
          id?: string
          movimenta_banco_horas?: string
          nome: string
          padrao_sistema?: boolean
          pode_aplicar_individual?: boolean
          pode_aplicar_massa?: boolean
          updated_at?: string
        }
        Update: {
          abona_ocorrencia?: boolean
          afeta_assiduidade?: string
          ativo?: boolean
          categoria?: string
          codigo?: string
          conta_dia_trabalhado?: boolean
          created_at?: string
          desconta_dsr?: boolean
          desconta_salario?: boolean
          descricao?: string | null
          empresa_id?: string
          exige_anexo?: boolean
          exige_aprovacao?: boolean
          exige_marcacao_ponto?: boolean
          exige_observacao?: boolean
          id?: string
          movimenta_banco_horas?: string
          nome?: string
          padrao_sistema?: boolean
          pode_aplicar_individual?: boolean
          pode_aplicar_massa?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      lotacoes: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          categoria: string
          created_at: string
          empresa_id: string
          funcionario_id: string
          id: string
          lida: boolean
          lida_em: string | null
          link: string | null
          mensagem: string
          titulo: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          empresa_id: string
          funcionario_id: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          mensagem: string
          titulo: string
        }
        Update: {
          categoria?: string
          created_at?: string
          empresa_id?: string
          funcionario_id?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          mensagem?: string
          titulo?: string
        }
        Relationships: []
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
      registros_ponto: {
        Row: {
          atraso_minutos: number
          created_at: string
          data_referencia: string
          empresa_id: string
          funcionario_id: string
          horario_programado: string | null
          horario_registrado: string
          id: string
          jornada_id: string | null
          observacao: string | null
          origem: string
          status: string
          tipo_ponto: string
        }
        Insert: {
          atraso_minutos?: number
          created_at?: string
          data_referencia: string
          empresa_id: string
          funcionario_id: string
          horario_programado?: string | null
          horario_registrado?: string
          id?: string
          jornada_id?: string | null
          observacao?: string | null
          origem?: string
          status?: string
          tipo_ponto: string
        }
        Update: {
          atraso_minutos?: number
          created_at?: string
          data_referencia?: string
          empresa_id?: string
          funcionario_id?: string
          horario_programado?: string | null
          horario_registrado?: string
          id?: string
          jornada_id?: string | null
          observacao?: string | null
          origem?: string
          status?: string
          tipo_ponto?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_ponto_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_ponto_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
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
      calcular_desconto_folha: {
        Args: { _ano: number; _funcionario_id: string; _mes: number }
        Returns: {
          dias_desc: number
          dias_dsr: number
          valor_desconto: number
        }[]
      }
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
      diff_minutos_relogio: {
        Args: { _a: string; _b: string }
        Returns: number
      }
      get_user_empresa: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      preencher_marcacoes_esquecimento_registro_dia: {
        Args: { _data: string; _empresa_id: string; _funcionario_id: string }
        Returns: undefined
      }
      seed_justificativas_padrao: {
        Args: { _empresa_id: string }
        Returns: undefined
      }
      sync_banco_horas_automatico_dia: {
        Args: { _data: string; _funcionario_id: string }
        Returns: undefined
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
