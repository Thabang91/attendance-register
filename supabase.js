// ─── supabase.js — all database operations ───────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY  = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('⚠ Missing Supabase env vars. Check .env or Netlify environment settings.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function handle(data, error, label) {
  if (error) { console.error(`Supabase error [${label}]:`, error.message); throw error; }
  return data;
}

// ─── ADMIN CONFIG ─────────────────────────────────────────────────────────────

export async function getAdminConfig() {
  const { data, error } = await supabase.from('admin_config').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data; // null if not set up yet
}

export async function upsertAdminConfig({ username, password }) {
  const { data, error } = await supabase
    .from('admin_config')
    .upsert({ id: 1, username, password, initialized: true, updated_at: new Date().toISOString() })
    .select().single();
  return handle(data, error, 'upsertAdminConfig');
}

export async function updateAdminPassword(newPassword) {
  const { data, error } = await supabase
    .from('admin_config')
    .update({ password: newPassword, updated_at: new Date().toISOString() })
    .eq('id', 1).select().single();
  return handle(data, error, 'updateAdminPassword');
}

// ─── LECTURERS ────────────────────────────────────────────────────────────────

export async function getLecturers() {
  const { data, error } = await supabase.from('lecturers').select('*').order('name');
  return handle(data, error, 'getLecturers');
}

export async function createLecturer({ id, name, email, department, passwords }) {
  const { data, error } = await supabase
    .from('lecturers')
    .insert({ id, name, email, department, passwords })
    .select().single();
  return handle(data, error, 'createLecturer');
}

export async function updateLecturerPasswords(id, passwords) {
  const { data, error } = await supabase
    .from('lecturers')
    .update({ passwords, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  return handle(data, error, 'updateLecturerPasswords');
}

export async function deleteLecturer(id) {
  const { error } = await supabase.from('lecturers').delete().eq('id', id);
  handle(null, error, 'deleteLecturer');
}

// ─── COURSES ──────────────────────────────────────────────────────────────────

export async function getCourses() {
  const { data, error } = await supabase.from('courses').select('*').order('code');
  return handle(data, error, 'getCourses');
}

export async function createCourse({ id, lecturer_id, code, name, department, year, semester, total_planned_classes, room }) {
  const { data, error } = await supabase
    .from('courses')
    .insert({ id, lecturer_id, code, name, department, year, semester, total_planned_classes, room })
    .select().single();
  return handle(data, error, 'createCourse');
}

export async function deleteCourse(id) {
  const { error } = await supabase.from('courses').delete().eq('id', id);
  handle(null, error, 'deleteCourse');
}

// ─── STUDENTS ─────────────────────────────────────────────────────────────────

export async function getStudentsForCourse(courseId) {
  const { data, error } = await supabase
    .from('enrolments')
    .select('students(*)')
    .eq('course_id', courseId);
  const result = handle(data, error, 'getStudentsForCourse');
  return result.map(r => r.students);
}

export async function getAllStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('*, enrolments(course_id)')
    .order('surname_initials');
  return handle(data, error, 'getAllStudents');
}

export async function upsertStudentAndEnrol(studentNo, surnameInitials, courseId) {
  // 1. Upsert student (insert or ignore if already exists)
  const studentId = 'S_' + studentNo;
  const { error: se } = await supabase
    .from('students')
    .upsert({ id: studentId, student_no: studentNo, surname_initials: surnameInitials }, { onConflict: 'student_no', ignoreDuplicates: false });
  if (se) throw se;

  // Get real id (in case student existed)
  const { data: existing } = await supabase.from('students').select('id').eq('student_no', studentNo).single();
  const realId = existing?.id || studentId;

  // 2. Enrol in course (ignore if already enrolled)
  const { error: ee } = await supabase
    .from('enrolments')
    .upsert({ student_id: realId, course_id: courseId }, { onConflict: 'student_id,course_id', ignoreDuplicates: true });
  if (ee && ee.code !== '23505') throw ee;

  return { id: realId, student_no: studentNo, surname_initials: surnameInitials };
}

export async function upsertManyStudents(students, courseId) {
  // students: [{ studentNo, surnameInitials }]
  let added = 0, skipped = 0;
  for (const { studentNo, surnameInitials } of students) {
    try {
      await upsertStudentAndEnrol(studentNo, surnameInitials, courseId);
      added++;
    } catch (e) {
      console.warn('Skipping student', studentNo, e.message);
      skipped++;
    }
  }
  return { added, skipped };
}

export async function removeStudentFromCourse(studentId, courseId) {
  const { error } = await supabase.from('enrolments').delete().eq('student_id', studentId).eq('course_id', courseId);
  handle(null, error, 'removeStudentFromCourse');
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

export async function getSessions(courseId) {
  const query = supabase.from('sessions').select('*, scans(*)').order('date', { ascending: false });
  if (courseId) query.eq('course_id', courseId);
  const { data, error } = await query;
  return handle(data, error, 'getSessions');
}

export async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, scans(*)')
    .eq('id', sessionId)
    .maybeSingle();
  return handle(data, error, 'getSession');
}

export async function createSession({ id, course_id, lecturer_id, date, start_time, room, lat, lng }) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ id, course_id, lecturer_id, date, start_time, room, lat, lng, status: 'active' })
    .select().single();
  return handle(data, error, 'createSession');
}

export async function closeSession(sessionId) {
  const { error } = await supabase.from('sessions').update({ status: 'closed' }).eq('id', sessionId);
  handle(null, error, 'closeSession');
}

export async function getAllSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, scans(*)')
    .order('date', { ascending: false });
  return handle(data, error, 'getAllSessions');
}

// ─── SCANS ────────────────────────────────────────────────────────────────────

export async function recordScan({ session_id, student_no, surname_initials, status, minutes_late, lat, lng }) {
  const { data, error } = await supabase
    .from('scans')
    .insert({ session_id, student_no, surname_initials, status, minutes_late, lat, lng })
    .select().single();
  return handle(data, error, 'recordScan');
}

export async function getScansForSession(sessionId) {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('session_id', sessionId)
    .order('scanned_at', { ascending: false });
  return handle(data, error, 'getScansForSession');
}

// ─── LIVE SUBSCRIPTION ────────────────────────────────────────────────────────
// Real-time listener for new scans during a live session

export function subscribeToScans(sessionId, onNewScan) {
  const channel = supabase
    .channel(`scans:${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'scans',
      filter: `session_id=eq.${sessionId}`,
    }, payload => onNewScan(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToSession(sessionId, onChange) {
  const channel = supabase
    .channel(`session:${sessionId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: `id=eq.${sessionId}`,
    }, payload => onChange(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
