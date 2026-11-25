"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Users, X } from "lucide-react";
import { defaultCourseIntro, type CourseIntro } from "../lib/course-intro";
import { lessonCalendarLabel, lessonOccursInMonth, lessonOccursOnDay, shanghaiDateTime, shanghaiInput, shanghaiRange } from "../lib/shanghai-time";

type Lesson = { id: number; title: string; kind: string; starts_at: string; ends_at: string; public_place: string; private_place?: string; objective: string; private_brief?: string; capacity: number; confirmed?: number; status?: string };
type Booking = { id: number; lesson_id: number; status: string; attended: number; title: string; kind: string; starts_at: string; private_place: string; private_brief: string; student_name?: string; lesson_title?: string; lesson_starts_at?: string };
type Student = { id: number; name: string; phone: string; active: number };
type AdminData = { lessons: Lesson[]; students: Student[]; bookings: Booking[]; courseIntro: CourseIntro };
const labels: Record<string, string> = { pending: "待审核", confirmed: "已确认", waitlist: "候补中", cancelled: "已取消", rejected: "未通过", draft: "草稿", open: "开放预约" };
const fmt = shanghaiDateTime;
const formDate = (s?: string) => s ? shanghaiInput(s) : "";
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const sameMonth = (lesson: Lesson, month: Date) => lessonOccursInMonth(lesson.starts_at, lesson.ends_at, localDayKey(month).slice(0, 7));
async function get(scope: string): Promise<any> { const r = await fetch(`/api/portal?scope=${scope}`, { cache: "no-store" }); return r.ok ? r.json() : null; }
async function post(data: Record<string, unknown>): Promise<any> { const r = await fetch("/api/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); const v: any = await r.json(); if (!r.ok) throw new Error(v.error || "操作失败"); return v; }

function Login({ close, refresh }: { close: () => void; refresh: () => Promise<{ admin: AdminData | null }> }) {
  const [mode, setMode] = useState("student-login"); const [phone, setPhone] = useState(""); const [invite, setInvite] = useState(""); const [password, setPassword] = useState(""); const [key, setKey] = useState(""); const [error, setError] = useState("");
  async function submit(e: React.FormEvent) { e.preventDefault(); setError(""); try { await post({ action: mode, phone, invite, password, key }); const session = await refresh(); if (mode === "admin-login" && !session.admin) throw new Error("登录已提交，但管理会话未生效，请刷新页面后重试"); close(); if (mode === "admin-login") requestAnimationFrame(() => document.getElementById("admin")?.scrollIntoView({ behavior: "smooth" })); } catch (e) { setError(e instanceof Error ? e.message : "登录失败"); } }
  return <div className="dialog-backdrop" onMouseDown={close}><div className="dialog" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><button className="icon-btn close" onClick={close} aria-label="关闭"><X/></button><h2>{mode === "admin-login" ? "管理端登录" : mode === "activate" ? "开通学员账号" : "学员登录"}</h2><p>{mode === "activate" ? "输入老师发给你的一次性邀请码。" : "登录后查看预约与课程详情。"}</p><form onSubmit={submit} className="form">
    {mode !== "admin-login" && <label>手机号<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" required placeholder="报名使用的手机号"/></label>}
    {mode === "activate" && <label>邀请码<input value={invite} onChange={e => setInvite(e.target.value)} required/></label>}
    {mode === "admin-login" ? <label>管理密钥<input type="password" value={key} onChange={e => setKey(e.target.value)} required/></label> : <label>密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "activate" ? 8 : undefined} required/></label>}
    {error && <p className="error" role="alert">{error}</p>}<button className="primary">{mode === "activate" ? "开通并登录" : "登录"}</button></form><div className="dialog-links"><button onClick={() => setMode(mode === "activate" ? "student-login" : "activate")}>{mode === "activate" ? "已有账号？登录" : "首次使用邀请码"}</button><button onClick={() => setMode(mode === "admin-login" ? "student-login" : "admin-login")}>{mode === "admin-login" ? "返回学员登录" : "管理入口"}</button></div></div></div>;
}

function MonthGrid({ month, lessons, selected, pick }: { month: Date; lessons: Lesson[]; selected: number | null; pick: (id: number) => void }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const start = new Date(first); start.setDate(1 - offset);
  return <div className="calendar"><div className="weekdays">{["周一","周二","周三","周四","周五","周六","周日"].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{Array.from({ length: 42 }, (_, i) => { const day = new Date(start); day.setDate(start.getDate() + i); const dayKey = localDayKey(day); const items = lessons.filter(l => lessonOccursOnDay(l.starts_at, l.ends_at, dayKey)); return <div key={i} className={`day ${day.getMonth() !== month.getMonth() ? "outside" : ""}`}><span>{day.getDate()}</span>{items.map(l => <button key={l.id} className={`event ${selected === l.id ? "selected" : ""}`} onClick={() => pick(l.id)}><strong>{l.title}</strong><small>{lessonCalendarLabel(l.starts_at, l.ends_at, dayKey)} · {Number(l.confirmed || 0) >= l.capacity ? "已满" : "可申请"}</small></button>)}</div>; })}</div></div>;
}

function Admin({ data, refresh, say }: { data: AdminData; refresh: () => void; say: (s: string) => void }) {
  const blank = { id: 0, title: "", kind: "expo", startsAt: "", endsAt: "", publicPlace: "上海新国际博览中心", privatePlace: "", objective: "", privateBrief: "", capacity: 5, status: "draft" };
  const [f, setF] = useState(blank); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [invite, setInvite] = useState("");
  async function save(e: React.FormEvent) { e.preventDefault(); try { await post({ action: "save-lesson", ...f }); say("课程已保存"); setF(blank); refresh(); } catch (e) { say(e instanceof Error ? e.message : "保存失败"); } }
  async function addStudent(e: React.FormEvent) { e.preventDefault(); try { const v = await post({ action: "create-student", name, phone }); setInvite(v.invite); setName(""); setPhone(""); refresh(); } catch (e) { say(e instanceof Error ? e.message : "开通失败"); } }
  async function update(action: string, payload: Record<string, unknown>) { try { await post({ action, ...payload }); say("已更新"); refresh(); } catch (e) { say(e instanceof Error ? e.message : "操作失败"); } }
  async function removeStudent(s: Student) {
    if (!window.confirm(`确定删除学员「${s.name}」和手机号 ${s.phone}？删除后原邀请码将失效。`)) return;
    try {
      await post({ action: "delete-student", studentId: s.id });
      setInvite("");
      say("学员已删除，该手机号可以重新开通");
      refresh();
    } catch (e) { say(e instanceof Error ? e.message : "删除失败"); }
  }
  function edit(l: Lesson) { setF({ id: l.id, title: l.title, kind: l.kind, startsAt: formDate(l.starts_at), endsAt: formDate(l.ends_at), publicPlace: l.public_place, privatePlace: l.private_place || "", objective: l.objective, privateBrief: l.private_brief || "", capacity: l.capacity, status: l.status || "draft" }); document.getElementById("editor")?.scrollIntoView({ behavior: "smooth" }); }
  async function removeLesson(l: Lesson) {
    if (!window.confirm(`确定删除课程「${l.title}」？删除后不能恢复。`)) return;
    try {
      await post({ action: "delete-lesson", lessonId: l.id });
      if (f.id === l.id) setF(blank);
      say("课程已删除");
      refresh();
    } catch (e) { say(e instanceof Error ? e.message : "删除失败"); }
  }
  return <section className="admin-section" id="admin"><div className="section-heading"><h2>课程管理</h2><p>发布排期、审核预约、记录出勤。</p></div><div className="admin-columns"><form className="admin-panel form" onSubmit={save} id="editor"><h3>{f.id ? "编辑课程" : "新增课程"}</h3><div className="form-two"><label>课程名称<input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="例如：展位必拍画面"/></label><label>类型<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="expo">展会带教</option><option value="project">真实项目</option></select></label><label>开始时间<input required type="datetime-local" value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })}/></label><label>结束时间<input required type="datetime-local" value={f.endsAt} onChange={e => setF({ ...f, endsAt: e.target.value })}/></label><label>公开地点<input value={f.publicPlace} onChange={e => setF({ ...f, publicPlace: e.target.value })}/></label><label>人数上限<select value={f.capacity} onChange={e => setF({ ...f, capacity: Number(e.target.value) })}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}人</option>)}</select></label></div><label>公开的训练内容<textarea required value={f.objective} onChange={e => setF({ ...f, objective: e.target.value })} placeholder="访客可见，请勿填写客户隐私"/></label><label>预约确认后的集合地点<input value={f.privatePlace} onChange={e => setF({ ...f, privatePlace: e.target.value })}/></label><label>预约确认后的任务说明<textarea value={f.privateBrief} onChange={e => setF({ ...f, privateBrief: e.target.value })}/></label><label>发布状态<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="draft">草稿，不公开</option><option value="open">开放预约</option><option value="cancelled">已取消</option></select></label><div className="form-actions"><button className="primary">{f.id ? "保存修改" : "新增课程"}</button>{f.id > 0 && <button type="button" className="outline" onClick={() => setF(blank)}>放弃编辑</button>}</div></form><div className="admin-right"><form className="admin-panel form" onSubmit={addStudent}><h3>开通学员</h3><p>确认报名后填写，生成一次性邀请码。</p><label>姓名<input required value={name} onChange={e => setName(e.target.value)}/></label><label>手机号<input required inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)}/></label><button className="primary">生成邀请码</button>{invite && <div className="invite"><strong>一次性邀请码</strong><code>{invite}</code><button type="button" onClick={() => navigator.clipboard.writeText(invite)}>复制</button><p>只显示这一次，请单独发给学员。</p></div>}</form><div className="admin-panel"><h3>学员名单</h3>{data.students.length ? data.students.map(s => <div className="list-row" key={s.id}><div><strong>{s.name}</strong><span>{s.phone}</span></div><div className="row-buttons"><em>{s.active ? "已开通" : "待激活"}</em><button type="button" className="text-button" onClick={() => removeStudent(s)}>删除</button></div></div>) : <p>还没有学员。</p>}</div></div></div><div className="admin-lists"><div><h3>课程列表</h3>{data.lessons.length ? data.lessons.map(l => <div className="list-row" key={l.id}><div><strong>{l.title}</strong><span>{shanghaiRange(l.starts_at, l.ends_at)} · {labels[l.status || ""] || l.status}</span></div><div className="row-buttons"><button className="outline" onClick={() => edit(l)}>编辑</button><button className="text-button" onClick={() => removeLesson(l)}>删除</button></div></div>) : <p>还没有课程，请新增第一场。</p>}</div><div><h3>预约审核与出勤</h3>{data.bookings.length ? data.bookings.map(b => <div className="list-row" key={b.id}><div><strong>{b.student_name} · {b.lesson_title}</strong><span>{labels[b.status]} · {fmt(b.lesson_starts_at || b.starts_at)}</span></div><div className="row-buttons">{["pending","waitlist"].includes(b.status) && <><button className="outline" onClick={() => update("review", { bookingId: b.id, decision: "confirmed" })}>确认</button><button className="text-button" onClick={() => update("review", { bookingId: b.id, decision: "rejected" })}>拒绝</button></>}{b.status === "confirmed" && <button className="outline" onClick={() => update("attendance", { bookingId: b.id, attended: !b.attended })}>{b.attended ? "撤销出勤" : "标记出勤"}</button>}</div></div>) : <p>还没有预约。</p>}</div></div></section>;
}

function CourseIntroEditor({ value, refresh, say }: { value: CourseIntro; refresh: () => void; say: (message: string) => void }) {
  const [draft, setDraft] = useState<CourseIntro>(value);
  useEffect(() => setDraft(value), [value]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post({ action: "save-course-intro", courseIntro: draft });
      say("课程介绍已更新，公开页面同步生效");
      refresh();
    } catch (error) { say(error instanceof Error ? error.message : "保存失败"); }
  }
  function changeStage(index: number, field: "title" | "detail", text: string) {
    setDraft(current => ({ ...current, stages: current.stages.map((stage, i) => i === index ? { ...stage, [field]: text } : stage) }));
  }
  return <section className="admin-section course-editor" id="course-editor">
    <div className="section-heading"><h2>编辑课程介绍</h2><p>保存后，访客和学员看到的介绍立即更新。</p></div>
    <form className="admin-panel form" onSubmit={save}>
      <label>课程标题<input required maxLength={90} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <label>课程简介<textarea required maxLength={500} value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })}/></label>
      <div className="course-stage-heading"><h3>课程阶段</h3><button type="button" className="outline" disabled={draft.stages.length >= 8} onClick={() => setDraft({ ...draft, stages: [...draft.stages, { title: "", detail: "" }] })}>增加阶段</button></div>
      {draft.stages.map((stage, index) => <div className="course-stage-edit" key={index}>
        <div className="course-stage-heading"><strong>阶段 {index + 1}</strong><button type="button" className="text-button" disabled={draft.stages.length <= 1} onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== index) })}>删除阶段</button></div>
        <div className="form-two"><label>阶段名称<input required maxLength={60} value={stage.title} onChange={e => changeStage(index, "title", e.target.value)}/></label><label>阶段说明<input required maxLength={200} value={stage.detail} onChange={e => changeStage(index, "detail", e.target.value)}/></label></div>
      </div>)}
      <label>底部说明<textarea maxLength={500} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label>
      <button className="primary">保存课程介绍</button>
    </form>
  </section>;
}

export default function Home() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1)); const [filter, setFilter] = useState("all"); const [lessons, setLessons] = useState<Lesson[]>([]); const [selected, setSelected] = useState<number | null>(null); const [me, setMe] = useState<{ student: Student; bookings: Booking[] } | null>(null); const [admin, setAdmin] = useState<AdminData | null>(null); const [intro, setIntro] = useState<CourseIntro>(defaultCourseIntro); const [dialog, setDialog] = useState(false); const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { const [pub, student, manager] = await Promise.all([get("public"), get("me"), get("admin")]); setLessons(pub?.lessons || []); setIntro(pub?.courseIntro || defaultCourseIntro); setMe(student); setAdmin(manager); setLoading(false); return { admin: manager as AdminData | null }; }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const say = (s: string) => { setNotice(s); setTimeout(() => setNotice(""), 5000); };
  const visible = useMemo(() => lessons.filter(l => filter === "all" || l.kind === filter), [lessons, filter]);
  const active = visible.find(l => l.id === selected) || visible.find(l => sameMonth(l, month));
  const booking = me?.bookings.find(b => b.lesson_id === active?.id && !["cancelled","rejected"].includes(b.status));
  const attended = me?.bookings.filter(b => b.attended) || [];
  async function bookingAction(action: string, bookingId?: number) { try { const result = await post({ action, lessonId: active?.id, bookingId }); say(action === "book" ? result.status === "waitlist" ? "已加入候补，等待老师审核" : "已提交预约申请，等待老师审核" : "已取消预约"); refresh(); } catch (e) { say(e instanceof Error ? e.message : "操作失败"); } }
  async function logout() { await post({ action: "logout" }); refresh(); }
  return <><header className="site-header"><div className="header-inner"><a className="brand" href="#top">实战跟拍</a><nav><a className="active" href="#schedule">课程排期</a><a href="#pathway">课程介绍</a></nav><div className="header-actions">{me && <span>{me.student.name}</span>}{admin && <span>管理端</span>}{me || admin ? <button className="header-button" onClick={logout}>退出</button> : <button className="header-button" onClick={() => setDialog(true)}>学员登录</button>}</div></div></header>
  <main id="top"><section className="schedule" id="schedule"><div className="intro"><h1>本月实战排期</h1><p>查看展会与活动跟拍课程，报名学员可在线预约。</p></div><div className="schedule-layout"><div className="calendar-column"><div className="toolbar"><div className="month-nav"><button className="icon-btn" aria-label="上个月" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelected(null); }}><ChevronLeft/></button><h2>{month.getFullYear()}年{month.getMonth() + 1}月</h2><button className="icon-btn" aria-label="下个月" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelected(null); }}><ChevronRight/></button></div><div className="filters">{[["all","全部"],["expo","展会带教"],["project","真实项目"]].map(([id,label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => { setFilter(id); setSelected(null); }}>{label}</button>)}</div></div><MonthGrid month={month} lessons={visible} selected={active?.id || null} pick={setSelected}/>{!loading && !visible.some(l => sameMonth(l, month)) && <p className="empty-note">本月课程正在安排中。可以查看其他月份，最新排期由老师发布。</p>}</div><aside className="detail">{active ? <><span className="detail-kind">{active.kind === "expo" ? "展会带教" : "真实项目"}</span><h2>{active.title}</h2><span className="status">{Number(active.confirmed || 0) >= active.capacity ? "已满 · 可候补" : "开放申请"}</span><div className="detail-line"><Clock3/><div><b>时间</b><span>{shanghaiRange(active.starts_at, active.ends_at)}</span></div></div><div className="detail-line"><MapPin/><div><b>地点</b><span>{active.public_place || "以老师通知为准"}</span></div></div><div className="detail-line"><CalendarDays/><div><b>训练内容</b><span>{active.objective}</span></div></div><div className="detail-line"><Users/><div><b>名额</b><span>{active.confirmed || 0} / {active.capacity} 人已确认</span></div></div><div className="seats">{Array.from({ length: active.capacity }, (_, i) => <i key={i} className={i < Number(active.confirmed || 0) ? "taken" : ""}/>)}</div>{booking ? <div className="booking-info"><strong>{labels[booking.status]}</strong>{booking.status === "confirmed" && <p>集合：{booking.private_place || "老师稍后通知"}<br/>{booking.private_brief}</p>}<button className="text-button" onClick={() => bookingAction("cancel", booking.id)}>取消预约</button></div> : me ? <button className="primary wide" onClick={() => bookingAction("book")}>{Number(active.confirmed || 0) >= active.capacity ? "申请候补" : "申请预约"}</button> : <button className="primary wide" onClick={() => setDialog(true)}>报名后可预约</button>}</> : <div className="detail-empty"><CalendarDays size={32}/><h2>选择一场课程</h2><p>点击日历中的课程，查看训练内容和开放状态。</p><hr/><p>每期3—5人小班，现场示范、拍摄、评片与补拍相结合。</p>{!me && !admin && <button className="primary wide" onClick={() => setDialog(true)}>学员登录</button>}</div>}</aside></div></section>
  {me && <section className="student-section"><div className="progress-heading"><div><h2>我的实战进度</h2><p>实际出勤后计入完成次数。</p></div><strong>{attended.length}<small> / 20 次</small></strong></div><div className="track"><i style={{ width: `${Math.min(100, attended.length * 5)}%` }}/></div><p className="progress-meta">展会带教 {attended.filter(b => b.kind === "expo").length} / 10　·　真实项目 {attended.filter(b => b.kind === "project").length} / 10</p><h3>我的预约</h3>{me.bookings.length ? me.bookings.map(b => <div className="list-row" key={b.id}><div><strong>{b.title}</strong><span>{fmt(b.starts_at)} · {labels[b.status]}{b.attended ? " · 已出勤" : ""}</span></div>{["pending","waitlist","confirmed"].includes(b.status) && !b.attended && <button className="text-button" onClick={() => bookingAction("cancel", b.id)}>取消</button>}</div>) : <p>还没有预约记录，从日历中选择课程开始吧。</p>}</section>}
  <section className="pathway" id="pathway"><div><h2>{intro.title}</h2><p>{intro.summary}</p></div><div className="steps">{intro.stages.map((stage, index) => <div key={index}><b>{String(index + 1).padStart(2, "0")}</b><h3>{stage.title}</h3><p>{stage.detail}</p></div>)}</div>{intro.note && <p className="pathway-note">{intro.note}</p>}</section>
  {admin && <><Admin data={admin} refresh={refresh} say={say}/><CourseIntroEditor value={admin.courseIntro} refresh={refresh} say={say}/></>}</main><footer>实战跟拍 · 展会与活动摄影带教 <span>课程安排由带教老师发布，以确认通知为准</span></footer>{dialog && <Login close={() => setDialog(false)} refresh={refresh}/ >}{notice && <div className="toast" role="status">{notice}</div>}</>;
}
