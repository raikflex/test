/**
 * Tipos de la base de datos.
 *
 * ⚠️  ESTE ARCHIVO ES UN STUB MANUAL. Cuando tengas la CLI de Supabase
 *     configurada y vinculada a tu proyecto, ejecuta:
 *
 *       pnpm db:types
 *
 *     Eso regenera `types.generated.ts` desde tu schema real y este archivo
 *     debe re-exportarlo (ver más abajo).
 *
 * Mientras tanto, este stub modela las tablas del doc maestro v0.2 / migrations
 * 001 y 002 lo suficientemente bien para que el admin app compile.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type EstadoRestaurante = 'activo' | 'suspendido' | 'archivado';
export type RolPerfil = 'dueno' | 'mesero' | 'cocina';
export type EstadoSesion = 'abierta' | 'pago_pendiente' | 'cerrada' | 'expirada';
export type EstadoComanda =
  | 'pendiente'
  | 'aceptada'
  | 'preparando'
  | 'lista'
  | 'entregada'
  | 'cancelada';
export type EstadoPago = 'solicitado' | 'confirmado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'datafono';
export type MotivoLlamado = 'campana' | 'pago' | 'otro';
export type EstadoLlamado = 'activo' | 'atendido' | 'cancelado';

export interface Database {
  public: {
    Tables: {
     restaurantes: {
        Row: {
          id: string;
          dueno_user_id: string;
          nombre_publico: string;
          nit: string | null;
          direccion: string | null;
          usa_meseros: boolean;
          horario_apertura: string;
          horario_cierre: string;
          dias_operacion: string[];
          timezone: string;
          color_marca: string;
          estado: EstadoRestaurante;
          trial_termina_en: string;
          creado_en: string;
          actualizada_en: string;
        };
        Insert: {
          id?: string;
          dueno_user_id: string;
          nombre_publico: string;
          nit?: string | null;
          direccion?: string | null;
          usa_meseros?: boolean;
          horario_apertura?: string;
          horario_cierre?: string;
          dias_operacion?: string[];
          timezone?: string;
          color_marca?: string;
          estado?: EstadoRestaurante;
          trial_termina_en?: string;
          creado_en?: string;
          actualizada_en?: string;
        };
        Update: Partial<Database['public']['Tables']['restaurantes']['Insert']>;
        Relationships: [];
      };
      perfiles: {
        Row: {
          id: string; // = auth.users.id
          restaurante_id: string;
          rol: RolPerfil;
          nombre: string;
          activo: boolean;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id: string;
          restaurante_id: string;
          rol: RolPerfil;
          nombre: string;
          activo?: boolean;
          creado_en?: string;
          actualizado_en?: string;
        };
        Update: Partial<Database['public']['Tables']['perfiles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'perfiles_restaurante_id_fkey';
            columns: ['restaurante_id'];
            referencedRelation: 'restaurantes';
            referencedColumns: ['id'];
          },
        ];
      };
      // Otras tablas (mesas, categorias, productos, sesiones, etc.) se llenan
      // cuando regeneres con `pnpm db:types`. El admin app sólo toca
      // restaurantes y perfiles en esta sesión.
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      estado_restaurante: EstadoRestaurante;
      rol_perfil: RolPerfil;
      estado_sesion: EstadoSesion;
      estado_comanda: EstadoComanda;
      estado_pago: EstadoPago;
      metodo_pago: MetodoPago;
      motivo_llamado: MotivoLlamado;
      estado_llamado: EstadoLlamado;
    };
  };
}

// Helper genérico para pulir el tipo de Row de cualquier tabla
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
