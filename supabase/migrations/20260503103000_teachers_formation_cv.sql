-- Academic / biographical fields for teachers (formation, birth date).

alter table public.teachers
  add column if not exists education_institution text,
  add column if not exists academic_degree text,
  add column if not exists field_of_study text,
  add column if not exists birth_date date;

comment on column public.teachers.education_institution is 'School, college or university where the teacher studied.';
comment on column public.teachers.academic_degree is 'Stored app value e.g. twelfth_year, bachelors, masters, doctorate.';
comment on column public.teachers.field_of_study is 'Study area / field.';
comment on column public.teachers.birth_date is 'Date of birth; age is computed in the UI when needed.';
