import { NextRequest, NextResponse } from "next/server";
import { defaultCourseIntro, type CourseIntro } from "../../../lib/course-intro";
import { parseShanghaiDateTime } from "../../../lib/shanghai-time";
import { getDb } from "../../../server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Actor = { role: "admin" | "student"; studentId: number | null };
type Body = Record<string, unknown>;
const now = () => new Date().toISOString();
const PASSWORD_ITERATIONS = 100000;
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const db = getDb;
const clean = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
function parseCourseIntro(value: unknown): CourseIntro | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const field = (v: unknown, max: number, required = true) => typeof v === "string" && v.trim().length <= max && (!required || v.trim().length > 0) ? v.trim() : null;
  const title = field(input.title, 90), summary = field(input.summary, 500), note = field(input.note, 500, false);
  if (!title || !summary || note === null || !Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > 8) return null;
  const stages = input.stages.map((stage: unknown) => {
    if (!stage || typeof stage !== "object") return null;
    const item = stage as Record<string, unknown>;
    const title = field(item.title, 60), detail = field(item.detail, 200);
    return title && detail ? { title, detail } : null;
  });
  if (stages.some(stage => !stage)) return null;
  return { title, summary, stages: stages as CourseIntro["stages"], note };
}
async function courseIntro() {
  const row = await (await db()).prepare("SELECT value FROM site_content WHERE key='course_intro'").first<{ value: string }>();
  if (!row) return defaultCourseIntro;
  try { return parseCourseIntro(JSON.parse(row.value)) || defaultCourseIntro; }
  catch { return defaultCourseIntro; }
}
const hex = (bytes: Uint8Array) => Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
const random = (length = 32) => hex(crypto.getRandomValues(new Uint8Array(length)));
async function sha(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256)));
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
async function actor(req: NextRequest): Promise<Actor | null> {
  const token = req.cookies.get("fieldclass_session")?.value;
  if (!token) return null;
  const row = await (await db()).prepare("SELECT role, student_id FROM access_tokens WHERE token_hash=? AND expires_at>?")
    .bind(await sha(token), now()).first<{ role: string; student_id: number | null }>();
  if (!row || !["admin", "student"].includes(row.role)) return null;
  return { role: row.role as Actor["role"], studentId: row.student_id };
}
async function signIn(role: Actor["role"], studentId: number | null) {
  const token = random();
  await (await db()).prepare("INSERT INTO access_tokens(token_hash,role,student_id,expires_at) VALUES(?,?,?,?)")
    .bind(await sha(token), role, studentId, new Date(Date.now() + 14 * 86400000).toISOString()).run();
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set("fieldclass_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 86400 });
  return response;
}

async function publicLessons() {
  return (await (await db()).prepare(`SELECT l.id,l.title,l.kind,l.starts_at,l.ends_at,l.public_place,l.objective,l.capacity,
    (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status='confirmed') AS confirmed
    FROM lessons l WHERE l.status='open' AND l.ends_at>=? ORDER BY l.starts_at LIMIT 160`).bind(now()).all()).results;
}

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") || "public";
    if (scope === "public") {
      const [lessons, intro] = await Promise.all([publicLessons(), courseIntro()]);
      return NextResponse.json({ lessons, courseIntro: intro });
    }
    const who = await actor(req);
    if (!who) return fail("请先登录", 401);
    if (scope === "me" && who.role === "student") {
      const student = await (await db()).prepare("SELECT id,name,phone FROM students WHERE id=? AND active=1").bind(who.studentId).first();
      if (!student) return fail("账号已停用", 403);
      const bookings = (await (await db()).prepare(`SELECT b.id,b.lesson_id,b.status,b.attended,l.title,l.kind,l.starts_at,l.ends_at,
        CASE WHEN b.status='confirmed' THEN l.private_place ELSE '' END AS private_place,
        CASE WHEN b.status='confirmed' THEN l.private_brief ELSE '' END AS private_brief
        FROM bookings b JOIN lessons l ON l.id=b.lesson_id WHERE b.student_id=? ORDER BY l.starts_at DESC`)
        .bind(who.studentId).all()).results;
      return NextResponse.json({ student, bookings });
    }
    if (scope === "admin" && who.role === "admin") {
      const [lessons, students, bookings, intro] = await Promise.all([
        (await db()).prepare("SELECT * FROM lessons ORDER BY starts_at DESC LIMIT 160").all(),
        (await db()).prepare("SELECT id,name,phone,active,created_at FROM students ORDER BY id DESC LIMIT 160").all(),
        (await db()).prepare(`SELECT b.*,s.name AS student_name,s.phone AS student_phone,l.title AS lesson_title,l.starts_at AS lesson_starts_at
          FROM bookings b JOIN students s ON s.id=b.student_id JOIN lessons l ON l.id=b.lesson_id ORDER BY b.id DESC LIMIT 500`).all(),
        courseIntro(),
      ]);
      return NextResponse.json({ lessons: lessons.results, students: students.results, bookings: bookings.results, courseIntro: intro });
    }
    return fail("没有访问权限", 403);
  } catch (error) { console.error(error); return fail("服务暂时不可用", 500); }
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) return fail("请求来源无效", 403);
    const body = await req.json() as Body;
    const action = clean(body.action, 40);
    if (action === "admin-login") {
      if (!process.env.ADMIN_KEY || !equal(clean(body.key, 200), process.env.ADMIN_KEY)) return fail("管理密钥不正确", 401);
      return signIn("admin", null);
    }
    if (action === "activate") {
      const phone = clean(body.phone, 20), invite = clean(body.invite, 100), password = clean(body.password, 200);
      if (!/^1\d{10}$/.test(phone) || password.length < 8 || !invite) return fail("请填写手机号、邀请码和至少8位密码");
      const row = await (await db()).prepare("SELECT id,invite_hash,invite_expires_at,active FROM students WHERE phone=?").bind(phone)
        .first<{ id: number; invite_hash: string | null; invite_expires_at: string | null; active: number }>();
      if (!row || row.active || !row.invite_hash || !row.invite_expires_at || row.invite_expires_at < now() || !equal(row.invite_hash, await sha(invite))) return fail("邀请码无效或已过期");
      const salt = random(16);
      const result = await (await db()).prepare("UPDATE students SET password_hash=?,password_salt=?,invite_hash=NULL,invite_expires_at=NULL,active=1 WHERE id=? AND active=0 AND invite_hash=?")
        .bind(await passwordHash(password, salt), salt, row.id, row.invite_hash).run();
      if (!result.meta.changes) return fail("邀请码已被使用");
      return signIn("student", row.id);
    }
    if (action === "student-login") {
      const row = await (await db()).prepare("SELECT id,password_hash,password_salt FROM students WHERE phone=? AND active=1")
        .bind(clean(body.phone, 20)).first<{ id: number; password_hash: string; password_salt: string }>();
      if (!row || !row.password_hash || !row.password_salt || !equal(row.password_hash, await passwordHash(clean(body.password, 200), row.password_salt))) return fail("手机号或密码不正确", 401);
      return signIn("student", row.id);
    }
    const who = await actor(req);
    if (action === "logout") {
      const token = req.cookies.get("fieldclass_session")?.value;
      if (token) await (await db()).prepare("DELETE FROM access_tokens WHERE token_hash=?").bind(await sha(token)).run();
      const response = NextResponse.json({ ok: true });
      response.cookies.delete("fieldclass_session");
      return response;
    }
    if (!who) return fail("请先登录", 401);
    if (action === "book" && who.role === "student") {
      const lessonId = Number(body.lessonId);
      const lesson = await (await db()).prepare("SELECT id,capacity FROM lessons WHERE id=? AND status='open' AND starts_at>?")
        .bind(lessonId, now()).first<{ id: number; capacity: number }>();
      if (!lesson) return fail("本场暂不可预约");
      const count = await (await db()).prepare("SELECT COUNT(*) AS n FROM bookings WHERE lesson_id=? AND status='confirmed'").bind(lessonId).first<{ n: number }>();
      const status = Number(count?.n || 0) >= lesson.capacity ? "waitlist" : "pending";
      const result = await (await db()).prepare(`INSERT INTO bookings(student_id,lesson_id,status,attended,created_at) VALUES(?,?,?,0,?)
        ON CONFLICT(student_id,lesson_id) DO UPDATE SET status=excluded.status,attended=0
        WHERE bookings.status IN ('cancelled','rejected')`).bind(who.studentId, lessonId, status, now()).run();
      if (!result.meta.changes) return fail("你已预约过本场课程");
      return NextResponse.json({ ok: true, status });
    }
    if (action === "cancel" && who.role === "student") {
      const result = await (await db()).prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND student_id=? AND attended=0 AND status IN ('pending','waitlist','confirmed')")
        .bind(Number(body.bookingId), who.studentId).run();
      if (!result.meta.changes) return fail("该预约无法取消");
      return NextResponse.json({ ok: true });
    }
    if (who.role !== "admin") return fail("没有管理权限", 403);
    if (action === "save-course-intro") {
      const intro = parseCourseIntro(body.courseIntro);
      if (!intro) return fail("请填写课程标题、简介及1至8个完整阶段，并检查文字长度");
      await (await db()).prepare("INSERT INTO site_content(key,value,updated_at) VALUES('course_intro',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
        .bind(JSON.stringify(intro), now()).run();
      return NextResponse.json({ ok: true, courseIntro: intro });
    }
    if (action === "create-student") {
      const name = clean(body.name, 40), phone = clean(body.phone, 20);
      if (!name || !/^1\d{10}$/.test(phone)) return fail("请填写姓名和11位手机号");
      const invite = random(12);
      try {
        await (await db()).prepare("INSERT INTO students(name,phone,invite_hash,invite_expires_at,created_at) VALUES(?,?,?,?,?)")
          .bind(name, phone, await sha(invite), new Date(Date.now() + 30 * 86400000).toISOString(), now()).run();
      } catch { return fail("手机号已存在"); }
      return NextResponse.json({ ok: true, invite });
    }
    if (action === "delete-student") {
      const studentId = Number(body.studentId);
      if (!Number.isInteger(studentId) || studentId < 1) return fail("学员编号无效");
      const student = await (await db()).prepare("SELECT id FROM students WHERE id=?").bind(studentId).first();
      if (!student) return fail("学员不存在", 404);
      const results = await (await db()).batch([
        (await db()).prepare("DELETE FROM students WHERE id=? AND NOT EXISTS (SELECT 1 FROM bookings WHERE student_id=?)").bind(studentId, studentId),
        (await db()).prepare("DELETE FROM access_tokens WHERE student_id=? AND NOT EXISTS (SELECT 1 FROM students WHERE id=?)").bind(studentId, studentId),
      ]);
      if (!results[0].meta.changes) return fail("该学员已有预约记录，不能删除；请保留记录以便核对出勤");
      return NextResponse.json({ ok: true });
    }
    if (action === "delete-lesson") {
      const lessonId = Number(body.lessonId);
      if (!Number.isInteger(lessonId) || lessonId < 1) return fail("课程编号无效");
      const lesson = await (await db()).prepare("SELECT id FROM lessons WHERE id=?").bind(lessonId).first();
      if (!lesson) return fail("课程不存在", 404);
      const result = await (await db()).prepare("DELETE FROM lessons WHERE id=? AND NOT EXISTS (SELECT 1 FROM bookings WHERE lesson_id=?)")
        .bind(lessonId, lessonId).run();
      if (!result.meta.changes) return fail("这场课程已有预约记录，不能删除；可以编辑课程并将发布状态设为“已取消”");
      return NextResponse.json({ ok: true });
    }
    if (action === "save-lesson") {
      const title = clean(body.title, 70), kind = clean(body.kind, 20), startsAt = clean(body.startsAt, 40), endsAt = clean(body.endsAt, 40);
      const startTime = parseShanghaiDateTime(startsAt), endTime = parseShanghaiDateTime(endsAt);
      const capacity = Number(body.capacity);
      const status = clean(body.status, 20);
      if (!title || !["expo", "project", "online"].includes(kind) || !["draft", "open", "cancelled"].includes(status) || !Number.isInteger(capacity) || capacity < 1 || capacity > 5 || !startTime || !endTime || endTime <= startTime) return fail("请检查课程名称、时间、类型及1至5人的名额");
      const values = [title, kind, startTime.toISOString(), endTime.toISOString(), clean(body.publicPlace, 80), clean(body.privatePlace, 150), clean(body.objective, 600), clean(body.privateBrief, 1000), capacity, status];
      if (body.id) {
        const confirmed = await (await db()).prepare("SELECT COUNT(*) AS n FROM bookings WHERE lesson_id=? AND status='confirmed'").bind(Number(body.id)).first<{ n: number }>();
        if (Number(confirmed?.n || 0) > capacity) return fail("名额不能少于已确认人数");
        const result = await (await db()).prepare(`UPDATE lessons SET title=?,kind=?,starts_at=?,ends_at=?,public_place=?,private_place=?,objective=?,private_brief=?,capacity=?,status=? WHERE id=?`)
          .bind(...values, Number(body.id)).run();
        if (!result.meta.changes) return fail("课程不存在", 404);
      } else {
        await (await db()).prepare(`INSERT INTO lessons(title,kind,starts_at,ends_at,public_place,private_place,objective,private_brief,capacity,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(...values, now()).run();
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "review") {
      const decision = clean(body.decision, 20), bookingId = Number(body.bookingId);
      if (!["confirmed", "rejected", "waitlist"].includes(decision)) return fail("审核状态无效");
      if (decision === "confirmed") {
        const result = await (await db()).prepare(`UPDATE bookings SET status='confirmed' WHERE id=? AND status IN ('pending','waitlist')
          AND EXISTS(SELECT 1 FROM lessons l WHERE l.id=bookings.lesson_id AND l.status='open' AND l.starts_at>? AND
          (SELECT COUNT(*) FROM bookings b WHERE b.lesson_id=l.id AND b.status='confirmed')<l.capacity)
          AND NOT EXISTS(SELECT 1 FROM bookings b JOIN lessons other ON b.lesson_id=other.id JOIN lessons current ON current.id=bookings.lesson_id
            WHERE b.student_id=bookings.student_id AND b.status='confirmed' AND other.starts_at<current.ends_at AND other.ends_at>current.starts_at)`)
          .bind(bookingId, now()).run();
        if (!result.meta.changes) return fail("名额已满、时间冲突或课程不可确认");
      } else {
        const result = await (await db()).prepare("UPDATE bookings SET status=? WHERE id=? AND status IN ('pending','waitlist')").bind(decision, bookingId).run();
        if (!result.meta.changes) return fail("该申请无法更改");
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "attendance") {
      const result = await (await db()).prepare("UPDATE bookings SET attended=? WHERE id=? AND status='confirmed'")
        .bind(body.attended ? 1 : 0, Number(body.bookingId)).run();
      if (!result.meta.changes) return fail("只有已确认预约可记录出勤");
      return NextResponse.json({ ok: true });
    }
    return fail("未知操作", 404);
  } catch (error) { console.error(error); return fail("操作失败，请稍后重试", 500); }
}
