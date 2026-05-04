-- More admin policies extended to management staff roles.

DROP POLICY IF EXISTS "Admins can insert schedules" ON public.schedules;
CREATE POLICY "Admins can insert schedules"
  ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update schedules" ON public.schedules;
CREATE POLICY "Admins can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete schedules" ON public.schedules;
CREATE POLICY "Admins can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can insert time slots" ON public.school_time_slots;
CREATE POLICY "Admins can insert time slots"
  ON public.school_time_slots FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update time slots" ON public.school_time_slots;
CREATE POLICY "Admins can update time slots"
  ON public.school_time_slots FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete time slots" ON public.school_time_slots;
CREATE POLICY "Admins can delete time slots"
  ON public.school_time_slots FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can insert courses" ON public.courses;
CREATE POLICY "Admins can insert courses"
  ON public.courses FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update courses" ON public.courses;
CREATE POLICY "Admins can update courses"
  ON public.courses FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete courses" ON public.courses;
CREATE POLICY "Admins can delete courses"
  ON public.courses FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can insert subjects" ON public.subjects;
CREATE POLICY "Admins can insert subjects"
  ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update subjects" ON public.subjects;
CREATE POLICY "Admins can update subjects"
  ON public.subjects FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete subjects" ON public.subjects;
CREATE POLICY "Admins can delete subjects"
  ON public.subjects FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can insert enrollments" ON public.enrollments;
CREATE POLICY "Admins can insert enrollments"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_is_school_admin()
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrollments.student_id AND s.school_id = public.get_my_school())
  );

DROP POLICY IF EXISTS "Admins can update enrollments" ON public.enrollments;
CREATE POLICY "Admins can update enrollments"
  ON public.enrollments FOR UPDATE TO authenticated
  USING (
    public.auth_is_school_admin()
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrollments.student_id AND s.school_id = public.get_my_school())
  );

DROP POLICY IF EXISTS "Admins can delete enrollments" ON public.enrollments;
CREATE POLICY "Admins can delete enrollments"
  ON public.enrollments FOR DELETE TO authenticated
  USING (
    public.auth_is_school_admin()
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrollments.student_id AND s.school_id = public.get_my_school())
  );

DROP POLICY IF EXISTS "Admins can insert materials" ON public.materials;
CREATE POLICY "Admins can insert materials"
  ON public.materials FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can update materials" ON public.materials;
CREATE POLICY "Admins can update materials"
  ON public.materials FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Admins can delete materials" ON public.materials;
CREATE POLICY "Admins can delete materials"
  ON public.materials FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());

DROP POLICY IF EXISTS "Teachers and admins can create material requests" ON public.material_requests;
CREATE POLICY "Teachers and admins can create material requests"
  ON public.material_requests FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_is_school_admin_or_teacher()
  );

DROP POLICY IF EXISTS "Requester or admin can update material requests" ON public.material_requests;
CREATE POLICY "Requester or admin can update material requests"
  ON public.material_requests FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_school_admin()
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND (
      public.auth_is_school_admin()
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  );

DROP POLICY IF EXISTS "Requester or admin can delete material requests" ON public.material_requests;
CREATE POLICY "Requester or admin can delete material requests"
  ON public.material_requests FOR DELETE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_school_admin()
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  );

DROP POLICY IF EXISTS "Deliveries viewable by school members" ON public.material_request_deliveries;
CREATE POLICY "Deliveries viewable by school members"
ON public.material_request_deliveries FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.auth_is_school_admin_or_teacher()
    OR student_id IN (SELECT s.id FROM public.students s WHERE s.parent_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins and teachers can insert deliveries" ON public.material_request_deliveries;
CREATE POLICY "Admins and teachers can insert deliveries"
ON public.material_request_deliveries FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin_or_teacher()
);

DROP POLICY IF EXISTS "Admins and teachers can update deliveries" ON public.material_request_deliveries;
CREATE POLICY "Admins and teachers can update deliveries"
ON public.material_request_deliveries FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin_or_teacher()
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin_or_teacher()
);

DROP POLICY IF EXISTS "Admins can delete deliveries" ON public.material_request_deliveries;
CREATE POLICY "Admins can delete deliveries"
  ON public.material_request_deliveries FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_is_school_admin());
