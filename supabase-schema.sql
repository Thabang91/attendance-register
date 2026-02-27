-- ═══════════════════════════════════════════════════════════════════════════
-- ATTENDANCE REGISTER — Supabase Database Schema
-- Faculty of Management Sciences, Polokwane
--
-- HOW TO USE:
--   1. Go to your Supabase project dashboard
--   2. Click "SQL Editor" in the left sidebar
--   3. Paste this entire file and click "Run"
--   4. Done — all tables will be created automatically
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Admin config (single row) ───────────────────────────────────────────────
create table if not exists admin_config (
  id          integer primary key default 1,
  username    text not null default 'admin',
  password    text not null,
  initialized boolean not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  -- Enforce single row
  constraint single_row check (id = 1)
);

-- ─── Lecturers ────────────────────────────────────────────────────────────────
create table if not exists lecturers (
  id          text primary key,
  name        text not null,
  email       text not null unique,
  department  text not null default '',
  passwords   text[] not null default '{}',   -- array of 5 passwords
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── Courses ─────────────────────────────────────────────────────────────────
create table if not exists courses (
  id                    text primary key,
  lecturer_id           text not null references lecturers(id) on delete cascade,
  code                  text not null,
  name                  text not null,
  department            text not null default '',
  year                  integer not null,
  semester              text not null default '1',
  total_planned_classes integer not null default 40,
  room                  text not null default '',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─── Students ─────────────────────────────────────────────────────────────────
create table if not exists students (
  id                text primary key,
  student_no        text not null unique,
  surname_initials  text not null,
  created_at        timestamptz default now()
);

-- ─── Student ↔ Course enrolments (many-to-many) ───────────────────────────────
create table if not exists enrolments (
  student_id  text not null references students(id) on delete cascade,
  course_id   text not null references courses(id) on delete cascade,
  enrolled_at timestamptz default now(),
  primary key (student_id, course_id)
);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id          text primary key,
  course_id   text not null references courses(id) on delete cascade,
  lecturer_id text not null references lecturers(id) on delete cascade,
  date        date not null,
  start_time  text not null,
  room        text not null default '',
  lat         double precision,
  lng         double precision,
  status      text not null default 'active',  -- 'active' | 'closed'
  created_at  timestamptz default now()
);

-- ─── Scans (attendance records per session per student) ───────────────────────
create table if not exists scans (
  id              bigint generated always as identity primary key,
  session_id      text not null references sessions(id) on delete cascade,
  student_no      text not null,
  surname_initials text not null default '',
  status          text not null,               -- 'present' | 'late'
  minutes_late    integer not null default 0,
  lat             double precision,
  lng             double precision,
  scanned_at      timestamptz default now(),
  unique (session_id, student_no)              -- one scan per student per session
);

-- ─── Row Level Security (RLS) — allow anon key full access ───────────────────
-- Since we do our own auth (not Supabase Auth), we allow the anon key to
-- read/write everything. The app enforces its own login.

alter table admin_config   enable row level security;
alter table lecturers      enable row level security;
alter table courses        enable row level security;
alter table students       enable row level security;
alter table enrolments     enable row level security;
alter table sessions       enable row level security;
alter table scans          enable row level security;

-- Grant full access to anon role (our app uses the anon key)
create policy "allow_all_admin_config"  on admin_config  for all using (true) with check (true);
create policy "allow_all_lecturers"     on lecturers     for all using (true) with check (true);
create policy "allow_all_courses"       on courses       for all using (true) with check (true);
create policy "allow_all_students"      on students      for all using (true) with check (true);
create policy "allow_all_enrolments"    on enrolments    for all using (true) with check (true);
create policy "allow_all_sessions"      on sessions      for all using (true) with check (true);
create policy "allow_all_scans"         on scans         for all using (true) with check (true);

-- ─── Indexes for performance ─────────────────────────────────────────────────
create index if not exists idx_courses_lecturer     on courses(lecturer_id);
create index if not exists idx_enrolments_course    on enrolments(course_id);
create index if not exists idx_enrolments_student   on enrolments(student_id);
create index if not exists idx_sessions_course      on sessions(course_id);
create index if not exists idx_sessions_status      on sessions(status);
create index if not exists idx_scans_session        on scans(session_id);
create index if not exists idx_scans_student        on scans(student_no);

-- ─── Done! ────────────────────────────────────────────────────────────────────
-- Your database is ready. Go back to the setup guide and continue from Step 3.
