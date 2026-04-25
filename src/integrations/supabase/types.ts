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
      academic_years: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_active: boolean | null
          label: string
          school_id: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          label: string
          school_id?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          label?: string
          school_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          classroom_id: string | null
          content: string
          created_at: string | null
          id: string
          school_id: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          classroom_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          school_id?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          classroom_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          school_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_types: {
        Row: {
          id: string
          name: string
          school_id: string | null
          weight: number | null
        }
        Insert: {
          id?: string
          name: string
          school_id?: string | null
          weight?: number | null
        }
        Update: {
          id?: string
          name?: string
          school_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_type_id: string | null
          classroom_id: string | null
          date: string
          description: string | null
          id: string
          subject_id: string | null
          teacher_id: string | null
          title: string
        }
        Insert: {
          assessment_type_id?: string | null
          classroom_id?: string | null
          date: string
          description?: string | null
          id?: string
          subject_id?: string | null
          teacher_id?: string | null
          title: string
        }
        Update: {
          assessment_type_id?: string | null
          classroom_id?: string | null
          date?: string
          description?: string | null
          id?: string
          subject_id?: string | null
          teacher_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_assessment_type_id_fkey"
            columns: ["assessment_type_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          date: string
          id: string
          notes: string | null
          schedule_id: string | null
          student_id: string | null
          sync_id: string | null
          teacher_id: string | null
        }
        Insert: {
          date?: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          student_id?: string | null
          sync_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          date?: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          student_id?: string | null
          sync_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          school_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_logs: {
        Row: {
          action_taken: string | null
          date: string | null
          description: string
          id: string
          severity: string | null
          student_id: string | null
          teacher_id: string | null
        }
        Insert: {
          action_taken?: string | null
          date?: string | null
          description: string
          id?: string
          severity?: string | null
          student_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          action_taken?: string | null
          date?: string | null
          description?: string
          id?: string
          severity?: string | null
          student_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "behavior_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_logs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          academic_year_id: string | null
          course_id: string | null
          created_at: string | null
          grade_level: string | null
          id: string
          name: string
          period: string | null
          school_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          course_id?: string | null
          created_at?: string | null
          grade_level?: string | null
          id?: string
          name: string
          period?: string | null
          school_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          course_id?: string | null
          created_at?: string | null
          grade_level?: string | null
          id?: string
          name?: string
          period?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classrooms_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classrooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reporter_id: string | null
          school_id: string | null
          severity: string
          status: string
          subject: string
          target_profile_id: string | null
          target_student_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reporter_id?: string | null
          school_id?: string | null
          severity?: string
          status?: string
          subject: string
          target_profile_id?: string | null
          target_student_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reporter_id?: string | null
          school_id?: string | null
          severity?: string
          status?: string
          subject?: string
          target_profile_id?: string | null
          target_student_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_target_student_id_fkey"
            columns: ["target_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          description: string | null
          id: string
          name: string
          school_id: string | null
          type: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          school_id?: string | null
          type?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          school_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string | null
          classroom_id: string | null
          enrolled_at: string | null
          id: string
          status: string | null
          student_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          classroom_id?: string | null
          enrolled_at?: string | null
          id?: string
          status?: string | null
          student_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          classroom_id?: string | null
          enrolled_at?: string | null
          id?: string
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_categories: {
        Row: {
          default_amount: number
          due_day: number | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          default_amount: number
          due_day?: number | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          default_amount?: number
          due_day?: number | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          assessment_id: string | null
          created_at: string | null
          id: string
          score: number
          student_id: string | null
          teacher_comment: string | null
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string | null
          id?: string
          score: number
          student_id?: string | null
          teacher_comment?: string | null
        }
        Update: {
          assessment_id?: string | null
          created_at?: string | null
          id?: string
          score?: number
          student_id?: string | null
          teacher_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          receiver_id: string | null
          school_id: string | null
          sender_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id?: string | null
          school_id?: string | null
          sender_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id?: string | null
          school_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          id: string
          method: string | null
          payment_date: string | null
          proof_url: string | null
          rejection_reason: string | null
          student_fee_id: string | null
          validated_by: string | null
        }
        Insert: {
          amount_paid: number
          id?: string
          method?: string | null
          payment_date?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          student_fee_id?: string | null
          validated_by?: string | null
        }
        Update: {
          amount_paid?: number
          id?: string
          method?: string | null
          payment_date?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          student_fee_id?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          can_delete: boolean | null
          can_read: boolean | null
          can_write: boolean | null
          id: string
          module: string
        }
        Insert: {
          can_delete?: boolean | null
          can_read?: boolean | null
          can_write?: boolean | null
          id?: string
          module: string
        }
        Update: {
          can_delete?: boolean | null
          can_read?: boolean | null
          can_write?: boolean | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          language: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          language?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_subscriptions: {
        Row: {
          billing_cycle: string | null
          id: string
          last_billing_date: string | null
          next_billing_date: string | null
          plan_type: string
          price_per_student: number | null
          school_id: string | null
          status: string | null
        }
        Insert: {
          billing_cycle?: string | null
          id?: string
          last_billing_date?: string | null
          next_billing_date?: string | null
          plan_type: string
          price_per_student?: number | null
          school_id?: string | null
          status?: string | null
        }
        Update: {
          billing_cycle?: string | null
          id?: string
          last_billing_date?: string | null
          next_billing_date?: string | null
          plan_type?: string
          price_per_student?: number | null
          school_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          classroom_id: string | null
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          subject_id: string | null
          teacher_id: string | null
        }
        Insert: {
          classroom_id?: string | null
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          classroom_id?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          created_at: string | null
          custom_domain: string | null
          id: string
          logo_url: string | null
          name: string
          nif: string | null
          primary_color: string | null
          secondary_color: string | null
          settings: Json | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          nif?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          nif?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
        }
        Relationships: []
      }
      staff_absences: {
        Row: {
          description: string | null
          end_date: string
          id: string
          profile_id: string | null
          start_date: string
          status: string | null
        }
        Insert: {
          description?: string | null
          end_date: string
          id?: string
          profile_id?: string | null
          start_date: string
          status?: string | null
        }
        Update: {
          description?: string | null
          end_date?: string
          id?: string
          profile_id?: string | null
          start_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_absences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fees: {
        Row: {
          academic_year_id: string | null
          amount_due: number
          due_date: string
          fee_category_id: string | null
          id: string
          is_paid: boolean | null
          month_index: number | null
          student_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          amount_due: number
          due_date: string
          fee_category_id?: string | null
          id?: string
          is_paid?: boolean | null
          month_index?: number | null
          student_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          amount_due?: number
          due_date?: string
          fee_category_id?: string | null
          id?: string
          is_paid?: boolean | null
          month_index?: number | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          created_at: string | null
          enrollment_number: string | null
          full_name: string
          gender: string | null
          id: string
          parent_id: string | null
          profile_id: string | null
          school_id: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          enrollment_number?: string | null
          full_name: string
          gender?: string | null
          id?: string
          parent_id?: string | null
          profile_id?: string | null
          school_id?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          enrollment_number?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          parent_id?: string | null
          profile_id?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          code?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          code?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_school_with_admin: {
        Args: {
          _address: string
          _logo_url: string
          _name: string
          _nif: string
          _primary_color: string
          _secondary_color: string
          _year_end: string
          _year_label: string
          _year_start: string
        }
        Returns: string
      }
      get_auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_school: { Args: never; Returns: string }
    }
    Enums: {
      absence_reason: "SICKNESS" | "PERSONAL" | "FAMILY" | "OTHER"
      attendance_status: "PRESENT" | "ABSENT" | "JUSTIFIED" | "LATE"
      payment_status: "PENDING" | "VALIDATED" | "REJECTED"
      user_role: "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "PARENT" | "STUDENT"
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
      absence_reason: ["SICKNESS", "PERSONAL", "FAMILY", "OTHER"],
      attendance_status: ["PRESENT", "ABSENT", "JUSTIFIED", "LATE"],
      payment_status: ["PENDING", "VALIDATED", "REJECTED"],
      user_role: ["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"],
    },
  },
} as const
