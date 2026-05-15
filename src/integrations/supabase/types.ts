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
      academic_terms: {
        Row: {
          academic_year_id: string | null
          created_at: string
          end_date: string
          id: string
          name: string
          school_id: string
          start_date: string
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          name: string
          school_id: string
          start_date: string
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          school_id?: string
          start_date?: string
          term_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
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
      activity_fees: {
        Row: {
          academic_year_id: string | null
          activity_id: string
          amount_due: number
          created_at: string
          due_date: string
          enrollment_id: string
          id: string
          is_paid: boolean
          month_index: number | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          activity_id: string
          amount_due?: number
          created_at?: string
          due_date: string
          enrollment_id: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          activity_id?: string
          amount_due?: number
          created_at?: string
          due_date?: string
          enrollment_id?: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_fees_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_fees_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          academic_year_id: string | null
          assessment_type_id: string | null
          classroom_id: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          end_time: string | null
          id: string
          room: string | null
          school_id: string | null
          start_time: string | null
          subject_id: string | null
          teacher_id: string | null
          term_id: string | null
          title: string
          type: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          academic_year_id?: string | null
          assessment_type_id?: string | null
          classroom_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          end_time?: string | null
          id?: string
          room?: string | null
          school_id?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          term_id?: string | null
          title: string
          type?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          academic_year_id?: string | null
          assessment_type_id?: string | null
          classroom_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          end_time?: string | null
          id?: string
          room?: string | null
          school_id?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          term_id?: string | null
          title?: string
          type?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          classroom_id: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          schedule_id: string | null
          school_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string | null
          sync_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string | null
          sync_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string | null
          sync_id?: string | null
          teacher_id?: string | null
          updated_at?: string
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
      billing_config: {
        Row: {
          created_at: string
          last_sequence: number
          school_id: string
          series: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_sequence?: number
          school_id: string
          series?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_sequence?: number
          school_id?: string
          series?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_config_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          agt_signing_plaintext: string | null
          cliente_nif: string
          cliente_nome: string
          created_at: string
          currency: string
          digital_signature_sha1_b64: string | null
          doc_number: number
          document_hash: string | null
          document_number: string
          exemption_code: string
          exemption_reason: string
          gross_total: number
          hash_control: string | null
          id: string
          invoice_date: string
          invoice_issued_at: string
          line_description: string
          parent_profile_id: string | null
          payment_id: string | null
          previous_document_hash: string | null
          school_id: string
          series: string
          student_id: string | null
        }
        Insert: {
          agt_signing_plaintext?: string | null
          cliente_nif: string
          cliente_nome: string
          created_at?: string
          currency?: string
          digital_signature_sha1_b64?: string | null
          doc_number: number
          document_hash?: string | null
          document_number: string
          exemption_code?: string
          exemption_reason?: string
          gross_total: number
          hash_control?: string | null
          id?: string
          invoice_date: string
          invoice_issued_at?: string
          line_description?: string
          parent_profile_id?: string | null
          payment_id?: string | null
          previous_document_hash?: string | null
          school_id: string
          series?: string
          student_id?: string | null
        }
        Update: {
          agt_signing_plaintext?: string | null
          cliente_nif?: string
          cliente_nome?: string
          created_at?: string
          currency?: string
          digital_signature_sha1_b64?: string | null
          doc_number?: number
          document_hash?: string | null
          document_number?: string
          exemption_code?: string
          exemption_reason?: string
          gross_total?: number
          hash_control?: string | null
          id?: string
          invoice_date?: string
          invoice_issued_at?: string
          line_description?: string
          parent_profile_id?: string | null
          payment_id?: string | null
          previous_document_hash?: string | null
          school_id?: string
          series?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_profile_id_fkey"
            columns: ["parent_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          record_id: string | null
          school_id: string | null
          table_name: string
          user_full_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          school_id?: string | null
          table_name: string
          user_full_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          school_id?: string | null
          table_name?: string
          user_full_name?: string | null
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
          academic_year_id: string
          course_id: string | null
          created_at: string | null
          grade_level: string | null
          homeroom_teacher_id: string | null
          id: string
          name: string
          period: string | null
          school_id: string | null
        }
        Insert: {
          academic_year_id: string
          course_id?: string | null
          created_at?: string | null
          grade_level?: string | null
          homeroom_teacher_id?: string | null
          id?: string
          name: string
          period?: string | null
          school_id?: string | null
        }
        Update: {
          academic_year_id?: string
          course_id?: string | null
          created_at?: string | null
          grade_level?: string | null
          homeroom_teacher_id?: string | null
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
            foreignKeyName: "classrooms_homeroom_teacher_id_fkey"
            columns: ["homeroom_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          kind: string
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
          kind?: string
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
          kind?: string
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
      document_requests: {
        Row: {
          classroom_id: string | null
          created_at: string
          document_id: string
          id: string
          ip_address: string | null
          notes: string | null
          recipient_profile_id: string | null
          responded_at: string | null
          signature_data: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          signer_name: string | null
          status: string
          student_id: string | null
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          document_id: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          recipient_profile_id?: string | null
          responded_at?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signer_name?: string | null
          status?: string
          student_id?: string | null
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          recipient_profile_id?: string | null
          responded_at?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signer_name?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          academic_year_id: string | null
          category: string
          content_text: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          pdf_template_url: string | null
          required: boolean
          school_id: string | null
          signature_fields: Json | null
          status: string
          target_role: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          category?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          pdf_template_url?: string | null
          required?: boolean
          school_id?: string | null
          signature_fields?: Json | null
          status?: string
          target_role?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          category?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          pdf_template_url?: string | null
          required?: boolean
          school_id?: string | null
          signature_fields?: Json | null
          status?: string
          target_role?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_charge_rule_classrooms: {
        Row: {
          charge_rule_id: string
          classroom_id: string
        }
        Insert: {
          charge_rule_id: string
          classroom_id: string
        }
        Update: {
          charge_rule_id?: string
          classroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_charge_rule_classrooms_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "enrollment_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charge_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_charge_rule_students: {
        Row: {
          charge_rule_id: string
          student_id: string
        }
        Insert: {
          charge_rule_id: string
          student_id: string
        }
        Update: {
          charge_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_charge_rule_students_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "enrollment_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charge_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_charge_rules: {
        Row: {
          academic_year_id: string | null
          amount_new: number
          amount_renewal: number
          created_at: string
          due_offset_days: number
          id: string
          notes: string | null
          school_id: string
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_new?: number
          amount_renewal?: number
          created_at?: string
          due_offset_days?: number
          id?: string
          notes?: string | null
          school_id: string
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_new?: number
          amount_renewal?: number
          created_at?: string
          due_offset_days?: number
          id?: string
          notes?: string | null
          school_id?: string
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_charge_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charge_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_fees: {
        Row: {
          academic_year_id: string | null
          amount_due: number
          created_at: string
          due_date: string
          enrollment_id: string | null
          fee_type: string
          id: string
          is_paid: boolean
          notes: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date?: string
          enrollment_id?: string | null
          fee_type: string
          id?: string
          is_paid?: boolean
          notes?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date?: string
          enrollment_id?: string | null
          fee_type?: string
          id?: string
          is_paid?: boolean
          notes?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_fees_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          result: string | null
          result_notes: string | null
          result_published_at: string | null
          result_published_by: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          classroom_id?: string | null
          enrolled_at?: string | null
          id?: string
          result?: string | null
          result_notes?: string | null
          result_published_at?: string | null
          result_published_by?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          classroom_id?: string | null
          enrolled_at?: string | null
          id?: string
          result?: string | null
          result_notes?: string | null
          result_published_at?: string | null
          result_published_by?: string | null
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
      erp_export_configs: {
        Row: {
          article_code_extracurricular: string | null
          article_code_matricula: string | null
          article_code_transporte: string | null
          created_at: string
          default_article_code_propina: string | null
          header_amount_paid: string | null
          header_article_code: string | null
          header_payment_date: string | null
          header_payment_method: string | null
          header_student_id: string | null
          header_student_name: string | null
          header_tax_id: string | null
          id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          article_code_extracurricular?: string | null
          article_code_matricula?: string | null
          article_code_transporte?: string | null
          created_at?: string
          default_article_code_propina?: string | null
          header_amount_paid?: string | null
          header_article_code?: string | null
          header_payment_date?: string | null
          header_payment_method?: string | null
          header_student_id?: string | null
          header_student_name?: string | null
          header_tax_id?: string | null
          id?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          article_code_extracurricular?: string | null
          article_code_matricula?: string | null
          article_code_transporte?: string | null
          created_at?: string
          default_article_code_propina?: string | null
          header_amount_paid?: string | null
          header_article_code?: string | null
          header_payment_date?: string | null
          header_payment_method?: string | null
          header_student_id?: string | null
          header_student_name?: string | null
          header_tax_id?: string | null
          id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_export_configs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      event_charge_rule_classrooms: {
        Row: {
          charge_rule_id: string
          classroom_id: string
        }
        Insert: {
          charge_rule_id: string
          classroom_id: string
        }
        Update: {
          charge_rule_id?: string
          classroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_charge_rule_classrooms_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "event_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_charge_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      event_charge_rule_students: {
        Row: {
          charge_rule_id: string
          student_id: string
        }
        Insert: {
          charge_rule_id: string
          student_id: string
        }
        Update: {
          charge_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_charge_rule_students_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "event_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_charge_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_charge_rules: {
        Row: {
          academic_year_id: string | null
          created_at: string
          due_day: number
          end_month: number | null
          event_id: string
          generate_all_upfront: boolean
          id: string
          monthly_amount: number
          months_count: number
          notes: string | null
          recurrence: string
          school_id: string
          start_month: number
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          event_id: string
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          event_id?: string
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id?: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_charge_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_charge_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_charge_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      event_fees: {
        Row: {
          academic_year_id: string | null
          amount_due: number
          created_at: string
          due_date: string
          event_id: string
          id: string
          is_paid: boolean
          month_index: number | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date: string
          event_id: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date?: string
          event_id?: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_fees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_student_rsvp: {
        Row: {
          event_id: string
          response: string
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_id: string
          response?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_id?: string
          response?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_student_rsvp_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_student_rsvp_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_student_rsvp_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_profile_rsvp: {
        Row: {
          event_id: string
          profile_id: string
          response: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_id: string
          profile_id: string
          response?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_id?: string
          profile_id?: string
          response?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_profile_rsvp_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_profile_rsvp_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_profile_rsvp_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          audience: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          id: string
          location: string | null
          organizer: string | null
          school_id: string | null
          start_time: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          location?: string | null
          organizer?: string | null
          school_id?: string | null
          start_time?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          location?: string | null
          organizer?: string | null
          school_id?: string | null
          start_time?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          notes: string | null
          payment_method: string | null
          receipt_url: string | null
          recurring_expense_id: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_expense_id?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_expense_id?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_expense_id_fkey"
            columns: ["recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_charge_rule_classrooms: {
        Row: {
          charge_rule_id: string
          classroom_id: string
        }
        Insert: {
          charge_rule_id: string
          classroom_id: string
        }
        Update: {
          charge_rule_id?: string
          classroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_charge_rule_classrooms_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "activity_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_charge_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_charge_rule_students: {
        Row: {
          charge_rule_id: string
          student_id: string
        }
        Insert: {
          charge_rule_id: string
          student_id: string
        }
        Update: {
          charge_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_charge_rule_students_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "activity_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_charge_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_charge_rules: {
        Row: {
          academic_year_id: string | null
          activity_id: string
          created_at: string
          due_day: number
          end_month: number | null
          generate_all_upfront: boolean
          id: string
          monthly_amount: number
          months_count: number
          notes: string | null
          recurrence: string
          school_id: string
          start_month: number
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          activity_id: string
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          activity_id?: string
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id?: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_charge_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_charge_rules_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_charge_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_activities: {
        Row: {
          academic_year_id: string | null
          billing_frequency: string
          capacity: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          enrollment_fee: number
          id: string
          is_recurring: boolean
          location: string | null
          name: string
          responsible: string | null
          school_id: string | null
          single_date: string | null
          start_date: string | null
          start_time: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          academic_year_id?: string | null
          billing_frequency?: string
          capacity?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          enrollment_fee?: number
          id?: string
          is_recurring?: boolean
          location?: string | null
          name: string
          responsible?: string | null
          school_id?: string | null
          single_date?: string | null
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          academic_year_id?: string | null
          billing_frequency?: string
          capacity?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          enrollment_fee?: number
          id?: string
          is_recurring?: boolean
          location?: string | null
          name?: string
          responsible?: string | null
          school_id?: string | null
          single_date?: string | null
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_activities_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_enrollments: {
        Row: {
          activity_id: string
          created_at: string
          enrolled_at: string
          id: string
          notes: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          notes?: string | null
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          notes?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_enrollments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      family_discount_rules: {
        Row: {
          created_at: string
          discount_percentage: number
          id: string
          school_id: string
          sibling_position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percentage?: number
          id?: string
          school_id: string
          sibling_position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          id?: string
          school_id?: string
          sibling_position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_discount_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      fee_rule_classrooms: {
        Row: {
          classroom_id: string
          fee_rule_id: string
        }
        Insert: {
          classroom_id: string
          fee_rule_id: string
        }
        Update: {
          classroom_id?: string
          fee_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_rule_classrooms_fee_rule_id_fkey"
            columns: ["fee_rule_id"]
            isOneToOne: false
            referencedRelation: "fee_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_rule_students: {
        Row: {
          fee_rule_id: string
          student_id: string
        }
        Insert: {
          fee_rule_id: string
          student_id: string
        }
        Update: {
          fee_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rule_students_fee_rule_id_fkey"
            columns: ["fee_rule_id"]
            isOneToOne: false
            referencedRelation: "fee_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_rules: {
        Row: {
          academic_year_id: string | null
          created_at: string
          due_day: number
          end_month: number | null
          generate_all_upfront: boolean
          grade_level: string | null
          id: string
          monthly_amount: number
          months_count: number
          notes: string | null
          recurrence: string
          school_id: string
          start_month: number
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          grade_level?: string | null
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          grade_level?: string | null
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id?: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_rules_school_id_fkey"
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
      material_request_deliveries: {
        Row: {
          brought: boolean
          created_at: string
          id: string
          marked_at: string | null
          marked_by: string | null
          notes: string | null
          request_id: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          brought?: boolean
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          request_id: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          brought?: boolean
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          request_id?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_request_deliveries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_deliveries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          category: string
          classroom_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string | null
          id: string
          item_name: string
          material_id: string | null
          needed_date: string | null
          quantity: number
          recipient: string | null
          requester_id: string | null
          school_id: string | null
          status: string
          student_id: string | null
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          classroom_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          id?: string
          item_name: string
          material_id?: string | null
          needed_date?: string | null
          quantity?: number
          recipient?: string | null
          requester_id?: string | null
          school_id?: string | null
          status?: string
          student_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          classroom_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          id?: string
          item_name?: string
          material_id?: string | null
          needed_date?: string | null
          quantity?: number
          recipient?: string | null
          requester_id?: string | null
          school_id?: string | null
          status?: string
          student_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          location: string | null
          min_quantity: number
          name: string
          quantity: number
          school_id: string | null
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          min_quantity?: number
          name: string
          quantity?: number
          school_id?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          min_quantity?: number
          name?: string
          quantity?: number
          school_id?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_read: boolean | null
          message_type: string
          receiver_id: string | null
          school_id: string | null
          sender_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string
          receiver_id?: string | null
          school_id?: string | null
          sender_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string
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
      module_authorization_named_recipients: {
        Row: {
          assignee_profile_id: string
          created_at: string
          student_id: string
          template_id: string
        }
        Insert: {
          assignee_profile_id: string
          created_at?: string
          student_id: string
          template_id: string
        }
        Update: {
          assignee_profile_id?: string
          created_at?: string
          student_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_authorization_named_recipients_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_named_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_named_recipients_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "module_authorization_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      module_authorization_submissions: {
        Row: {
          attachment_urls: Json
          created_at: string
          id: string
          responses: Json
          school_id: string
          signature_data: string | null
          student_id: string
          submitted_by: string
          template_id: string
        }
        Insert: {
          attachment_urls?: Json
          created_at?: string
          id?: string
          responses?: Json
          school_id: string
          signature_data?: string | null
          student_id: string
          submitted_by: string
          template_id: string
        }
        Update: {
          attachment_urls?: Json
          created_at?: string
          id?: string
          responses?: Json
          school_id?: string
          signature_data?: string | null
          student_id?: string
          submitted_by?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_authorization_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "module_authorization_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      module_authorization_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          module: string
          recipient_classroom_ids: string[]
          recipient_mode: string
          school_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          module: string
          recipient_classroom_ids?: string[]
          recipient_mode?: string
          school_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          module?: string
          recipient_classroom_ids?: string[]
          recipient_mode?: string
          school_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_authorization_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_authorization_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          id: string
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          id?: string
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          id?: string
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          link: string | null
          recipient_id: string
          school_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          recipient_id: string
          school_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          recipient_id?: string
          school_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          activity_fee_id: string | null
          amount_paid: number
          enrollment_fee_id: string | null
          erp_exported_at: string | null
          event_fee_id: string | null
          id: string
          meal_fee_id: string | null
          method: string | null
          notes: string | null
          payment_date: string | null
          proof_url: string | null
          rejection_reason: string | null
          school_id: string | null
          status: string
          student_fee_id: string | null
          submitted_by: string | null
          transport_fee_id: string | null
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          activity_fee_id?: string | null
          amount_paid: number
          enrollment_fee_id?: string | null
          erp_exported_at?: string | null
          event_fee_id?: string | null
          id?: string
          meal_fee_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          school_id?: string | null
          status?: string
          student_fee_id?: string | null
          submitted_by?: string | null
          transport_fee_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          activity_fee_id?: string | null
          amount_paid?: number
          enrollment_fee_id?: string | null
          erp_exported_at?: string | null
          event_fee_id?: string | null
          id?: string
          meal_fee_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          school_id?: string | null
          status?: string
          student_fee_id?: string | null
          submitted_by?: string | null
          transport_fee_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_activity_fee_id_fkey"
            columns: ["activity_fee_id"]
            isOneToOne: false
            referencedRelation: "activity_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_fee_id_fkey"
            columns: ["enrollment_fee_id"]
            isOneToOne: false
            referencedRelation: "enrollment_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_meal_fee_id_fkey"
            columns: ["meal_fee_id"]
            isOneToOne: false
            referencedRelation: "meal_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_fee_id_fkey"
            columns: ["event_fee_id"]
            isOneToOne: false
            referencedRelation: "event_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transport_fee_id_fkey"
            columns: ["transport_fee_id"]
            isOneToOne: false
            referencedRelation: "transport_fees"
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
      plan_change_requests: {
        Row: {
          created_at: string
          current_plan: string | null
          id: string
          message: string | null
          requested_by: string | null
          requested_plan: string
          school_id: string
          status: string
        }
        Insert: {
          created_at?: string
          current_plan?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          requested_plan: string
          school_id: string
          status?: string
        }
        Update: {
          created_at?: string
          current_plan?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          requested_plan?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          language: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_id: string | null
          tax_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          language?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          tax_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          tax_id?: string | null
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
      recurring_expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          notes: string | null
          payment_method: string | null
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          end_date?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method?: string | null
          school_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method?: string | null
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_delete: boolean
          can_read: boolean
          can_write: boolean
          id: string
          module: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at: string
        }
        Insert: {
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          id?: string
          module: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at?: string
        }
        Update: {
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_school_id_fkey"
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
          last_generated_cycle_key: string | null
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
          last_generated_cycle_key?: string | null
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
          last_generated_cycle_key?: string | null
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
          academic_year_id: string | null
          classroom_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          notes: string | null
          room: string | null
          school_id: string | null
          shift: string | null
          start_time: string
          subject_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          classroom_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          notes?: string | null
          room?: string | null
          school_id?: string | null
          shift?: string | null
          start_time: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          classroom_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          notes?: string | null
          room?: string | null
          school_id?: string | null
          shift?: string | null
          start_time?: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      school_holidays: {
        Row: {
          academic_year_id: string | null
          created_at: string
          description: string | null
          end_date: string
          id: string
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_holidays_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_holidays_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          cycle_key: string | null
          description: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          proof_url: string | null
          school_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          cycle_key?: string | null
          description?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          proof_url?: string | null
          school_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          cycle_key?: string | null
          description?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          proof_url?: string | null
          school_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_payment_prefs: {
        Row: {
          bank_iban: string | null
          guardian_payment_mode: string
          school_id: string
          updated_at: string
        }
        Insert: {
          bank_iban?: string | null
          guardian_payment_mode?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          bank_iban?: string | null
          guardian_payment_mode?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_payment_prefs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_time_slots: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_break: boolean
          label: string | null
          position: number
          school_id: string
          shift: string
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_break?: boolean
          label?: string | null
          position?: number
          school_id: string
          shift: string
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_break?: boolean
          label?: string | null
          position?: number
          school_id?: string
          shift?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_time_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          subscription_status: string
          trial_ends_at: string
          trial_started_at: string
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
          subscription_status?: string
          trial_ends_at?: string
          trial_started_at?: string
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
          subscription_status?: string
          trial_ends_at?: string
          trial_started_at?: string
        }
        Relationships: []
      }
      staff_absences: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string | null
          end_date: string
          id: string
          profile_id: string | null
          reason: string
          requester_id: string | null
          school_id: string | null
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          profile_id?: string | null
          reason?: string
          requester_id?: string | null
          school_id?: string | null
          start_date: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          profile_id?: string | null
          reason?: string
          requester_id?: string | null
          school_id?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_absences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_absences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_discounts: {
        Row: {
          academic_year_id: string | null
          created_at: string
          discount_fixed_amount: number | null
          discount_percentage: number | null
          id: string
          is_active: boolean
          reason: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          discount_fixed_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean
          reason?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          discount_fixed_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean
          reason?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_discounts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          late_fee_amount: number
          late_fee_applied_at: string | null
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
          late_fee_amount?: number
          late_fee_applied_at?: string | null
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
          late_fee_amount?: number
          late_fee_applied_at?: string | null
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
          avatar_color: string | null
          birth_date: string | null
          classroom_id: string | null
          created_at: string | null
          email: string | null
          enrollment_number: string | null
          full_name: string
          gender: string | null
          id: string
          parent_id: string | null
          phone: string | null
          school_id: string | null
          tax_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_color?: string | null
          birth_date?: string | null
          classroom_id?: string | null
          created_at?: string | null
          email?: string | null
          enrollment_number?: string | null
          full_name: string
          gender?: string | null
          id?: string
          parent_id?: string | null
          phone?: string | null
          school_id?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_color?: string | null
          birth_date?: string | null
          classroom_id?: string | null
          created_at?: string | null
          email?: string | null
          enrollment_number?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          parent_id?: string | null
          phone?: string | null
          school_id?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
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
      teachers: {
        Row: {
          academic_degree: string | null
          avatar_color: string | null
          birth_date: string | null
          created_at: string
          education_institution: string | null
          employee_id: string | null
          field_of_study: string | null
          hire_date: string | null
          id: string
          is_active: boolean | null
          profile_id: string | null
          school_id: string | null
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          academic_degree?: string | null
          avatar_color?: string | null
          birth_date?: string | null
          created_at?: string
          education_institution?: string | null
          employee_id?: string | null
          field_of_study?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          profile_id?: string | null
          school_id?: string | null
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_degree?: string | null
          avatar_color?: string | null
          birth_date?: string | null
          created_at?: string
          education_institution?: string | null
          employee_id?: string | null
          field_of_study?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          profile_id?: string | null
          school_id?: string | null
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          check_in: string | null
          check_in_address: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_out: string | null
          check_out_address: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          date: string
          employee_name: string
          hours_worked: number
          id: string
          profile_id: string | null
          role: string | null
          school_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_in_address?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out?: string | null
          check_out_address?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          date?: string
          employee_name: string
          hours_worked?: number
          id?: string
          profile_id?: string | null
          role?: string | null
          school_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_in_address?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out?: string | null
          check_out_address?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          date?: string
          employee_name?: string
          hours_worked?: number
          id?: string
          profile_id?: string | null
          role?: string | null
          school_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_charge_rule_classrooms: {
        Row: {
          charge_rule_id: string
          classroom_id: string
        }
        Insert: {
          charge_rule_id: string
          classroom_id: string
        }
        Update: {
          charge_rule_id?: string
          classroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_charge_rule_classrooms_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "meal_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_charge_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_charge_rule_students: {
        Row: {
          charge_rule_id: string
          student_id: string
        }
        Insert: {
          charge_rule_id: string
          student_id: string
        }
        Update: {
          charge_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_charge_rule_students_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "meal_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_charge_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_charge_rules: {
        Row: {
          academic_year_id: string | null
          created_at: string
          due_day: number
          end_month: number | null
          generate_all_upfront: boolean
          id: string
          meal_program_id: string
          monthly_amount: number
          months_count: number
          notes: string | null
          recurrence: string
          school_id: string
          start_month: number
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          meal_program_id: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          meal_program_id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          school_id?: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_charge_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_charge_rules_meal_program_id_fkey"
            columns: ["meal_program_id"]
            isOneToOne: false
            referencedRelation: "meal_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_charge_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_enrollments: {
        Row: {
          created_at: string
          end_date: string | null
          enrolled_at: string
          id: string
          meal_program_id: string
          monthly_fee_override: number | null
          notes: string | null
          school_id: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          enrolled_at?: string
          id?: string
          meal_program_id: string
          monthly_fee_override?: number | null
          notes?: string | null
          school_id: string
          start_date?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          enrolled_at?: string
          id?: string
          meal_program_id?: string
          monthly_fee_override?: number | null
          notes?: string | null
          school_id?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_enrollments_meal_program_id_fkey"
            columns: ["meal_program_id"]
            isOneToOne: false
            referencedRelation: "meal_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_fees: {
        Row: {
          academic_year_id: string | null
          amount_due: number
          created_at: string
          due_date: string
          enrollment_id: string
          id: string
          is_paid: boolean
          meal_program_id: string
          month_index: number | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date: string
          enrollment_id: string
          id?: string
          is_paid?: boolean
          meal_program_id: string
          month_index?: number | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date?: string
          enrollment_id?: string
          id?: string
          is_paid?: boolean
          meal_program_id?: string
          month_index?: number | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_fees_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "meal_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_fees_meal_program_id_fkey"
            columns: ["meal_program_id"]
            isOneToOne: false
            referencedRelation: "meal_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_programs: {
        Row: {
          academic_year_id: string | null
          created_at: string
          default_monthly_fee: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          default_monthly_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          default_monthly_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_programs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_programs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_charge_rule_classrooms: {
        Row: {
          charge_rule_id: string
          classroom_id: string
        }
        Insert: {
          charge_rule_id: string
          classroom_id: string
        }
        Update: {
          charge_rule_id?: string
          classroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_charge_rule_classrooms_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "transport_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_charge_rule_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_charge_rule_students: {
        Row: {
          charge_rule_id: string
          student_id: string
        }
        Insert: {
          charge_rule_id: string
          student_id: string
        }
        Update: {
          charge_rule_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_charge_rule_students_charge_rule_id_fkey"
            columns: ["charge_rule_id"]
            isOneToOne: false
            referencedRelation: "transport_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_charge_rule_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_charge_rules: {
        Row: {
          academic_year_id: string | null
          created_at: string
          due_day: number
          end_month: number | null
          generate_all_upfront: boolean
          id: string
          monthly_amount: number
          months_count: number
          notes: string | null
          recurrence: string
          route_id: string
          school_id: string
          start_month: number
          target_scope: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          route_id: string
          school_id: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          due_day?: number
          end_month?: number | null
          generate_all_upfront?: boolean
          id?: string
          monthly_amount?: number
          months_count?: number
          notes?: string | null
          recurrence?: string
          route_id?: string
          school_id?: string
          start_month?: number
          target_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_charge_rules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_charge_rules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_charge_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_enrollments: {
        Row: {
          created_at: string
          direction: string
          dropoff_stop_id: string | null
          end_date: string | null
          id: string
          monthly_fee_override: number | null
          notes: string | null
          pickup_stop_id: string | null
          route_id: string
          school_id: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction?: string
          dropoff_stop_id?: string | null
          end_date?: string | null
          id?: string
          monthly_fee_override?: number | null
          notes?: string | null
          pickup_stop_id?: string | null
          route_id: string
          school_id: string
          start_date?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          dropoff_stop_id?: string | null
          end_date?: string | null
          id?: string
          monthly_fee_override?: number | null
          notes?: string | null
          pickup_stop_id?: string | null
          route_id?: string
          school_id?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_enrollments_dropoff_stop_id_fkey"
            columns: ["dropoff_stop_id"]
            isOneToOne: false
            referencedRelation: "transport_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_enrollments_pickup_stop_id_fkey"
            columns: ["pickup_stop_id"]
            isOneToOne: false
            referencedRelation: "transport_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_enrollments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_fees: {
        Row: {
          academic_year_id: string | null
          amount_due: number
          created_at: string
          due_date: string
          enrollment_id: string
          id: string
          is_paid: boolean
          month_index: number | null
          route_id: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date: string
          enrollment_id: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          route_id: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_due?: number
          created_at?: string
          due_date?: string
          enrollment_id?: string
          id?: string
          is_paid?: boolean
          month_index?: number | null
          route_id?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fees_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "transport_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fees_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          is_active: boolean
          monthly_fee: number
          name: string
          notes: string | null
          school_id: string
          shift: string
          updated_at: string
          vehicle_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name: string
          notes?: string | null
          school_id: string
          shift?: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name?: string
          notes?: string | null
          school_id?: string
          shift?: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_stops: {
        Row: {
          address: string | null
          created_at: string
          dropoff_time: string | null
          id: string
          name: string
          notes: string | null
          pickup_time: string | null
          position: number
          route_id: string
          school_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          dropoff_time?: string | null
          id?: string
          name: string
          notes?: string | null
          pickup_time?: string | null
          position?: number
          route_id: string
          school_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          dropoff_time?: string | null
          id?: string
          name?: string
          notes?: string | null
          pickup_time?: string | null
          position?: number
          route_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_stops_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_delete: boolean
          can_read: boolean
          can_write: boolean
          id: string
          module: string
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          id?: string
          module: string
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          id?: string
          module?: string
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _ensure_audit_trigger: { Args: { p_table: string }; Returns: undefined }
      apply_monthly_late_fees: { Args: never; Returns: Json }
      billing_reserve_next_invoice: {
        Args: { _school_id: string }
        Returns: { serie: string; seq: number }[]
      }
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      clone_academic_year: {
        Args: {
          _clone_classrooms?: boolean
          _clone_courses?: boolean
          _clone_fee_rules?: boolean
          _clone_subjects?: boolean
          _new_end: string
          _new_label: string
          _new_start: string
          _school_id: string
          _set_active?: boolean
          _source_year_id: string
        }
        Returns: Json
      }
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
      generate_activity_fees: {
        Args: { _enrollment_id: string }
        Returns: number
      }
      generate_recurring_expense_occurrences: {
        Args: { _recurring_id: string; _until?: string }
        Returns: number
      }
      generate_school_invoices: {
        Args: { _school_id: string }
        Returns: number
      }
      generate_student_fees_for_year: {
        Args: { _academic_year_id: string; _student_id: string }
        Returns: number
      }
      generate_student_fee_for_rule_period: {
        Args: {
          _academic_year_id: string
          _fee_rule_id: string
          _period_index: number
          _student_id: string
        }
        Returns: number
      }
      generate_transport_fees: {
        Args: { _enrollment_id: string }
        Returns: number
      }
      generate_event_fees: {
        Args: { _event_id: string }
        Returns: number
      }
      generate_meal_fees: {
        Args: { _enrollment_id: string }
        Returns: number
      }
      get_auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_school: { Args: never; Returns: string }
      get_term_for_date: {
        Args: { _date: string; _school_id: string }
        Returns: string
      }
      is_parent_of_student: { Args: { _student_id: string }; Returns: boolean }
      is_school_active: { Args: { _school_id: string }; Returns: boolean }
      is_self_student: { Args: { _student_id: string }; Returns: boolean }
      notify_low_stock_materials: { Args: never; Returns: Json }
      notify_user: {
        Args: {
          _actor_id?: string
          _actor_name?: string
          _category: string
          _description: string
          _link?: string
          _recipient_id: string
          _school_id: string
          _title: string
        }
        Returns: undefined
      }
      run_daily_notifications: { Args: never; Returns: number }
      seed_default_time_slots: {
        Args: { _school_id: string }
        Returns: undefined
      }
    }
    Enums: {
      absence_reason: "SICKNESS" | "PERSONAL" | "FAMILY" | "OTHER"
      attendance_status:
        | "PRESENT"
        | "ABSENT"
        | "JUSTIFIED"
        | "LATE"
        | "DISCIPLINARY"
      payment_status: "PENDING" | "VALIDATED" | "REJECTED"
      user_role:
        | "SUPER_ADMIN"
        | "ADMIN"
        | "DIRECTOR"
        | "SECRETARY"
        | "TREASURER"
        | "LIBRARIAN"
        | "STOCK_MANAGER"
        | "RECEPTIONIST"
        | "TEACHER"
        | "PARENT"
        | "STUDENT"
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
      attendance_status: [
        "PRESENT",
        "ABSENT",
        "JUSTIFIED",
        "LATE",
        "DISCIPLINARY",
      ],
      payment_status: ["PENDING", "VALIDATED", "REJECTED"],
      user_role: [
        "SUPER_ADMIN",
        "ADMIN",
        "DIRECTOR",
        "SECRETARY",
        "TREASURER",
        "LIBRARIAN",
        "STOCK_MANAGER",
        "RECEPTIONIST",
        "TEACHER",
        "PARENT",
        "STUDENT",
      ],
    },
  },
} as const
