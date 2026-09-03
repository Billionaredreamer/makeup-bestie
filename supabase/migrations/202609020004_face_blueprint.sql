alter table public.profiles
  add column if not exists face_blueprint jsonb;

comment on column public.profiles.face_blueprint is
  'User-confirmed categorical feature estimates and optional skin concerns. Does not contain photos or raw landmark coordinates.';
