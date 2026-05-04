-- Broaden school "admin" checks to new staff roles via auth_is_school_admin() / auth_is_school_admin_or_teacher().

-- ========== schools / academic years / classrooms ==========
DROP POLICY IF EXISTS "Admins can update their own school" ON public.schools;
CREATE POLICY "Admins can update their own school"
ON public.schools FOR UPDATE TO authenticated
USING (id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can create academic years for their school" ON public.academic_years;
CREATE POLICY "Admins can create academic years for their school"
ON public.academic_years FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete academic years" ON public.academic_years;
CREATE POLICY "Admins can delete academic years"
ON public.academic_years FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can manage classrooms" ON public.classrooms;
CREATE POLICY "Admins can manage classrooms"
ON public.classrooms FOR ALL TO authenticated
USING (public.auth_is_school_admin())
WITH CHECK (public.auth_is_school_admin() AND school_id = public.get_my_school());

-- ========== students / teachers ==========
DROP POLICY IF EXISTS "Admins can insert students" ON public.students;
CREATE POLICY "Admins can insert students"
ON public.students FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update students" ON public.students;
CREATE POLICY "Admins can update students"
ON public.students FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete students" ON public.students;
CREATE POLICY "Admins can delete students"
ON public.students FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can insert teachers" ON public.teachers;
CREATE POLICY "Admins can insert teachers"
ON public.teachers FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update teachers" ON public.teachers;
CREATE POLICY "Admins can update teachers"
ON public.teachers FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete teachers" ON public.teachers;
CREATE POLICY "Admins can delete teachers"
ON public.teachers FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

-- ========== profiles & permissions ==========
DROP POLICY IF EXISTS "Admins can update profiles in their school" ON public.profiles;
CREATE POLICY "Admins can update profiles in their school"
ON public.profiles FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update academic years" ON public.academic_years;
CREATE POLICY "Admins can update academic years"
ON public.academic_years FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "User permissions viewable by self or admin" ON public.user_permissions;
CREATE POLICY "User permissions viewable by self or admin"
ON public.user_permissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.auth_is_school_admin())
);

DROP POLICY IF EXISTS "Admins manage user permissions" ON public.user_permissions;
CREATE POLICY "Admins manage user permissions"
ON public.user_permissions FOR ALL TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Notification prefs viewable by self or admin" ON public.notification_preferences;
CREATE POLICY "Notification prefs viewable by self or admin"
ON public.notification_preferences FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.auth_is_school_admin())
);

DROP POLICY IF EXISTS "Self or admin can manage notification prefs" ON public.notification_preferences;
CREATE POLICY "Self or admin can manage notification prefs"
ON public.notification_preferences FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.auth_is_school_admin())
)
WITH CHECK (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.auth_is_school_admin())
);

DROP POLICY IF EXISTS "School invoices viewable by school admins" ON public.school_invoices;
CREATE POLICY "School invoices viewable by school admins"
ON public.school_invoices FOR SELECT TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins view their subscription" ON public.saas_subscriptions;
CREATE POLICY "Admins view their subscription"
ON public.saas_subscriptions FOR SELECT TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins update their subscription cycle" ON public.saas_subscriptions;
CREATE POLICY "Admins update their subscription cycle"
ON public.saas_subscriptions FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins insert their subscription" ON public.saas_subscriptions;
CREATE POLICY "Admins insert their subscription"
ON public.saas_subscriptions FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update complaints" ON public.complaints;
CREATE POLICY "Admins can update complaints"
ON public.complaints FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete complaints" ON public.complaints;
CREATE POLICY "Admins can delete complaints"
ON public.complaints FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

-- ========== attendance ==========
DROP POLICY IF EXISTS "Admins and teachers can insert attendance" ON public.attendance;
CREATE POLICY "Admins and teachers can insert attendance"
ON public.attendance FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin_or_teacher()
);

DROP POLICY IF EXISTS "Admins and teachers can update attendance" ON public.attendance;
CREATE POLICY "Admins and teachers can update attendance"
ON public.attendance FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin_or_teacher())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin_or_teacher());

DROP POLICY IF EXISTS "Admins and teachers can delete attendance" ON public.attendance;
CREATE POLICY "Admins and teachers can delete attendance"
ON public.attendance FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin_or_teacher());

-- ========== payments ==========
DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND submitted_by = auth.uid()
  AND public.auth_is_school_admin_or_teacher()
  AND (
    (student_fee_id IS NOT NULL AND activity_fee_id IS NULL)
    OR (student_fee_id IS NULL AND activity_fee_id IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
CREATE POLICY "Admins can update payments"
ON public.payments FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Admins can delete payments"
ON public.payments FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete payment proofs" ON storage.objects;
CREATE POLICY "Admins can delete payment proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_my_school()::text
  AND public.auth_is_school_admin()
);

-- ========== grades ==========
DROP POLICY IF EXISTS "Grades viewable by relevant parties" ON public.grades;
CREATE POLICY "Grades viewable by relevant parties"
ON public.grades FOR SELECT TO authenticated
USING (
  (
    public.auth_is_school_admin()
    OR public.get_auth_role() = 'TEACHER'::public.user_role
    OR public.get_auth_role() = 'STUDENT'::public.user_role
  )
  OR (student_id IN (SELECT s.id FROM public.students s WHERE s.parent_id = auth.uid()))
);

-- ========== assessments / events ==========
DROP POLICY IF EXISTS "Admins and teachers can update assessments" ON public.assessments;
CREATE POLICY "Admins and teachers can update assessments"
ON public.assessments FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.auth_is_school_admin()
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by IS NOT NULL
      AND created_by = auth.uid()
    )
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.auth_is_school_admin()
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins and teachers can update events" ON public.events;
CREATE POLICY "Admins and teachers can update events"
ON public.events FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.auth_is_school_admin()
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by IS NOT NULL
      AND created_by = auth.uid()
    )
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.auth_is_school_admin()
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Staff manage enrollment fees in their school" ON public.enrollment_fees;
CREATE POLICY "Staff manage enrollment fees in their school"
ON public.enrollment_fees FOR ALL TO authenticated
USING (
  public.auth_is_school_admin_or_teacher()
  AND school_id = public.get_my_school()
)
WITH CHECK (
  public.auth_is_school_admin_or_teacher()
  AND school_id = public.get_my_school()
);

DROP POLICY IF EXISTS "Staff manage erp export configs in their school" ON public.erp_export_configs;
CREATE POLICY "Staff manage erp export configs in their school"
ON public.erp_export_configs FOR ALL TO authenticated
USING (
  public.auth_is_school_admin_or_teacher()
  AND school_id = public.get_my_school()
)
WITH CHECK (
  public.auth_is_school_admin_or_teacher()
  AND school_id = public.get_my_school()
);
