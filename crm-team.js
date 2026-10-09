// Tasks, team permissions and the owner dashboard. Loaded after crm.html's main script and
// reuses its globals (sb, $, esc, toast, user, isAdmin, myPerms, STATUSES, sLabel, waLink).

const PERM_ORDER = ["admin","crm","installs","inventory","errands","accounts","reports"];
const TASK_TYPES = { first_call:"أول مكالمة", follow_up:"متابعة", schedule_visit:"تحديد معاينة", do_visit:"معاينة",
  prepare_quote:"تجهيز عرض سعر", quote_follow_up:"متابعة عرض سعر", collect_payment:"تحصيل", schedule_install:"تحديد تركيب" };
// only these types are closed through complete_task; the rest have their own forms
const SIMPLE_TYPES = ["first_call","follow_up","schedule_visit","quote_follow_up"];
const CHANNELS = [["call","مكالمة"],["whatsapp","واتساب"],["visit","زيارة"],["email","إيميل"]];
const OUTCOMES = [["interested","مهتم"],["wants_visit","عايز معاينة"],["thinking","بيفكر"],["not_interested","مش مهتم"],["not_now","مش دلوقتي"],["no_answer","مردش"]];
const LOST = [["price","السعر"],["competitor","راح لمنافس"],["not_serious","مش جاد"],["other","سبب تاني"]];
const AREAS = ["الشيخ زايد","أكتوبر","التجمع","العاصمة","أخرى"].map(a=>[a,a]);
const UNIT_TYPES = [["villa","فيلا"],["twin","توين"],["town","تاون"],["apartment","شقة"],["commercial","تجاري"]];
const UNIT_STAGES = [["core","طوب أحمر"],["finishing","تشطيب"],["lived_in","ساكنين فيها"]];
const NEEDS = [["lighting","إضاءة"],["curtains","ستاير"],["ac","تكييف"],["cameras","كاميرات"],["intercom","إنتركم"],["locks","كوالين"],["sensors","حساسات"],["gate","بوابة"]];
const BUDGETS = [["<50","أقل من 50 ألف"],["50-150","50–150 ألف"],["150-300","150–300 ألف"],["300+","أكتر من 300 ألف"]];
const label = (list, v) => (list.find(x=>x[0]===v)||[,v||"—"])[1];
const fmtWhen = d => d ? new Date(d).toLocaleString("ar-EG",{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "من غير ميعاد";
const myEmail = () => (user?.email||"").toLowerCase();
const nameOf = e => (window.teamNames?.[e]) || String(e||"—").split("@")[0];
const chips = (name, list, type="radio") => `<div class="chips">${list.map(([v,l])=>
  `<label class="chip"><input type="${type}" name="${name}" value="${esc(v)}"><span>${esc(l)}</span></label>`).join("")}</div>`;

// ================= MY TASKS =================
let myTasks = [], taskLeads = {}, doing = null;

async function loadTasks(){
  $("taskList").innerHTML = `<div class="empty">بيحمّل…</div>`;
  const { data, error } = await sb.from("tasks").select("id,lead_id,type,title,instructions,due_at,status")
    .eq("assigned_to", myEmail()).eq("status","open").order("due_at",{ascending:true, nullsFirst:false});
  if(error){ $("taskList").innerHTML = `<div class="empty">مشكلة في تحميل المهام</div>`; console.error(error); return; }
  myTasks = data;
  const ids = [...new Set(data.map(t=>t.lead_id).filter(Boolean))];
  taskLeads = {};
  if(ids.length){
    const { data: ls } = await sb.from("leads").select("id,name,phone,area,unit_type,unit_stage,needs,budget_band").in("id", ids);
    (ls||[]).forEach(l=>taskLeads[l.id]=l);
  }
  renderTasks();
}
function renderTasks(){
  const now = new Date(), late = myTasks.filter(t=>t.due_at && new Date(t.due_at) < now);
  $("taskBadge").textContent = myTasks.length || "";
  $("taskBadge").classList.toggle("late", late.length > 0);
  $("taskSummary").textContent = myTasks.length ? `${myTasks.length} مهمة مفتوحة${late.length?` — منهم ${late.length} متأخرة`:""}` : "";
  // overdue first (already oldest first), then the rest by time, undated last
  const list = [...late, ...myTasks.filter(t=>!late.includes(t))];
  $("taskList").innerHTML = list.length ? list.map(t=>{
    const l = taskLeads[t.lead_id], isLate = late.includes(t);
    return `<article class="task${isLate?" late":""}" data-id="${t.id}">
      <div class="task-top"><span class="ttype">${esc(TASK_TYPES[t.type]||t.type)}</span>
        <span class="twhen">${isLate?"⚠ متأخرة · ":""}${esc(fmtWhen(t.due_at))}</span></div>
      <h3>${esc(t.title)}</h3>
      ${t.instructions?`<p class="tins">${esc(t.instructions)}</p>`:""}
      ${l?`<div class="tlead"><div><b>${esc(l.name)}</b>${l.area?` · ${esc(l.area)}`:""}</div>
        <span class="tphone"><a href="tel:${esc(l.phone)}" dir="ltr">${esc(l.phone)}</a> <a href="${waLink(l.phone)}" target="_blank" rel="noopener">واتساب</a>
        <button type="button" class="link-btn" data-lead="${l.id}">التاريخ</button></span></div>`:""}
      ${SIMPLE_TYPES.includes(t.type) ? `<button type="button" class="primary done-btn">تم ✓</button>`
        : `<div class="sub">المهمة دي بتتقفل من الفورم الخاص بيها</div>`}
    </article>`; }).join("")
    : `<div class="empty">مفيش مهام مفتوحة دلوقتي 👌</div>`;
  $("taskList").querySelectorAll(".done-btn").forEach(b=>b.onclick=()=>openDone(b.closest(".task").dataset.id));
  $("taskList").querySelectorAll("[data-lead]").forEach(b=>b.onclick=()=>openLeadHistory(b.dataset.lead));
}

function openDone(id){
  doing = myTasks.find(t=>t.id===id); if(!doing) return;
  const l = taskLeads[doing.lead_id] || {}, first = doing.type === "first_call";
  $("doneTitle").textContent = doing.title;
  $("doneForm").innerHTML = `
    <fieldset><legend>اتواصلت إزاي؟</legend>${chips("channel", CHANNELS)}</fieldset>
    <fieldset><legend>النتيجة</legend>${chips("outcome", OUTCOMES)}</fieldset>
    <fieldset class="f-lost hidden"><legend>ليه مش مهتم؟</legend>${chips("lost_reason", LOST)}</fieldset>
    ${first ? `<div class="f-first">
      <fieldset><legend>المنطقة</legend>${chips("area", AREAS)}</fieldset>
      <fieldset><legend>نوع الوحدة</legend>${chips("unit_type", UNIT_TYPES)}</fieldset>
      <fieldset><legend>مرحلة الوحدة</legend>${chips("unit_stage", UNIT_STAGES)}</fieldset>
      <fieldset><legend>محتاج إيه؟ <span class="sub">(اختار أكتر من واحد)</span></legend>${chips("needs", NEEDS, "checkbox")}</fieldset>
      <fieldset><legend>الميزانية</legend>${chips("budget_band", BUDGETS)}</fieldset></div>` : ""}
    <label class="f">ملاحظة <span class="req">*</span><input name="note" required minlength="3" placeholder="اكتب اللي حصل في سطر"></label>
    <label class="f f-next">ميعاد المتابعة الجاية <span class="req hidden">*</span><input name="next_at" type="datetime-local"></label>
    <div class="err-box hidden" id="doneErr"></div>
    <div class="done-res hidden" id="doneRes"></div>
    <button type="submit" class="primary" id="doneSave">سجّل وقفل المهمة</button>`;
  const f = $("doneForm");
  // prefill what we already know about the client
  if(first){
    [["area",l.area],["unit_type",l.unit_type],["unit_stage",l.unit_stage],["budget_band",l.budget_band]].forEach(([k,v])=>{ if(v){ const r=f.querySelector(`[name=${k}][value="${CSS.escape(v)}"]`); if(r) r.checked=true; } });
    (l.needs||[]).forEach(v=>{ const r=f.querySelector(`[name=needs][value="${CSS.escape(v)}"]`); if(r) r.checked=true; });
  }
  f.onchange = syncDone; syncDone();
  showDone(true);
}
function syncDone(){
  const f = $("doneForm"), out = f.outcome.value;
  f.querySelector(".f-lost").classList.toggle("hidden", out !== "not_interested");
  const needNext = ["interested","thinking"].includes(out) || (doing.type==="schedule_visit" && out==="wants_visit");
  f.querySelector(".f-next .req").classList.toggle("hidden", !needNext);
  f.querySelector(".f-next").firstChild.textContent = doing.type==="schedule_visit" && out==="wants_visit" ? "ميعاد المعاينة " : "ميعاد المتابعة الجاية ";
  f.next_at.required = needNext;
  // client details are only asked for when we actually talked to them
  f.querySelector(".f-first")?.classList.toggle("muted", ["no_answer","not_interested"].includes(out));
}
function showDone(on){ $("doneDrawer").classList.toggle("hidden",!on); $("doneShade").classList.toggle("hidden",!on); }
$("doneClose").onclick = $("doneShade").onclick = ()=>showDone(false);

$("doneForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(!doing) return;
  const f = e.target, v = n => f.querySelector(`[name=${n}]:checked`)?.value || "";
  const p = { channel:v("channel"), outcome:v("outcome"), note:f.note.value.trim() };
  if(f.next_at.value) p.next_at = new Date(f.next_at.value).toISOString();
  if(p.outcome === "not_interested") p.lost_reason = v("lost_reason");
  if(doing.type === "first_call"){
    ["area","unit_type","unit_stage","budget_band"].forEach(k=>{ if(v(k)) p[k] = v(k); });
    const needs = [...f.querySelectorAll("[name=needs]:checked")].map(x=>x.value);
    if(needs.length) p.needs = needs;
  }
  $("doneErr").classList.add("hidden"); $("doneSave").disabled = true;
  const { data, error } = await sb.rpc("complete_task", { p_task: doing.id, p });
  $("doneSave").disabled = false;
  if(error){ $("doneErr").textContent = error.message; $("doneErr").classList.remove("hidden"); return; }
  $("doneRes").innerHTML = `<b>المهمة اتقفلت ✓</b><div>حالة العميل دلوقتي: <b>${esc(sLabel(data?.lead_status))}</b></div>
    <div>${data?.next_task ? `المهمة الجاية: <b>${esc(TASK_TYPES[data.next_task]||data.next_task)}</b>${data.next_at?` — ${esc(fmtWhen(data.next_at))}`:""}` : "مفيش مهمة جاية للعميل ده"}</div>`;
  $("doneRes").classList.remove("hidden"); $("doneSave").classList.add("hidden");
  f.querySelectorAll("input").forEach(i=>i.disabled = true);
  loadTasks();
});

// ---- search by phone → client card with its history ----
$("phoneSearch").addEventListener("submit", async e=>{
  e.preventDefault();
  const digits = $("phoneQ").value.replace(/\D/g,"");
  if(digits.length < 4){ toast("اكتب 4 أرقام على الأقل"); return; }
  const { data, error } = await sb.from("leads").select("id,name,phone,area,status").ilike("phone", `%${digits}%`).limit(8);
  if(error){ toast("البحث فشل"); console.error(error); return; }
  if(!data.length){ $("phoneRes").innerHTML = `<div class="sub">مفيش عميل بالرقم ده عندك</div>`; return; }
  if(data.length === 1){ $("phoneRes").innerHTML = ""; openLeadHistory(data[0].id); return; }
  $("phoneRes").innerHTML = data.map(l=>`<button type="button" class="line-btn" data-lead="${l.id}">${esc(l.name)} · <span dir="ltr">${esc(l.phone)}</span></button>`).join("");
  $("phoneRes").querySelectorAll("[data-lead]").forEach(b=>b.onclick=()=>openLeadHistory(b.dataset.lead));
});

async function openLeadHistory(id){
  $("histBody").innerHTML = `<div class="empty">بيحمّل…</div>`; showHist(true);
  const [{ data: l, error: e1 }, { data: ints, error: e2 }] = await Promise.all([
    sb.from("leads").select("*").eq("id", id).single(),
    sb.from("interactions").select("channel,outcome,note,next_at,done_by,created_at").eq("lead_id", id).order("created_at",{ascending:false})
  ]);
  if(e1){ $("histBody").innerHTML = `<div class="empty">مش قادر أفتح العميل ده</div>`; return; }
  $("histTitle").textContent = l.name;
  const row = (k,v) => v ? `<div><span class="sub">${k}</span> ${v}</div>` : "";
  $("histBody").innerHTML = `<div class="hist-card">
      ${row("الموبايل", `<a href="tel:${esc(l.phone)}" dir="ltr">${esc(l.phone)}</a> · <a href="${waLink(l.phone)}" target="_blank" rel="noopener">واتساب</a>`)}
      ${row("الحالة", esc(sLabel(l.status)))}${row("المنطقة", esc(l.area))}
      ${row("الوحدة", [label(UNIT_TYPES,l.unit_type), l.unit_stage && label(UNIT_STAGES,l.unit_stage)].filter(x=>x&&x!=="—").map(esc).join(" · "))}
      ${row("محتاج", (l.needs||[]).map(n=>esc(label(NEEDS,n))).join("، "))}
      ${row("الميزانية", l.budget_band && esc(label(BUDGETS,l.budget_band)))}
      ${row("مسؤول", l.assigned_to && esc(nameOf(l.assigned_to)))}
    </div>
    <h3 class="sec-h">التاريخ</h3>
    <ul class="timeline">${(ints||[]).length ? ints.map(x=>`<li><div><b>${esc(label(CHANNELS,x.channel))} · ${esc(label(OUTCOMES,x.outcome))}</b></div>
      <div>${esc(x.note)}</div>
      <div class="meta">${new Date(x.created_at).toLocaleString("ar-EG",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})} · ${esc(nameOf(x.done_by))}${x.next_at?` · الجاي: ${esc(fmtWhen(x.next_at))}`:""}</div></li>`).join("")
      : `<li class="meta">${e2?"مش قادر أعرض التاريخ":"لسه مفيش تواصل متسجل"}</li>`}</ul>`;
}
function showHist(on){ $("histDrawer").classList.toggle("hidden",!on); $("histShade").classList.toggle("hidden",!on); }
$("histClose").onclick = $("histShade").onclick = ()=>showHist(false);
document.addEventListener("keydown", e=>{ if(e.key==="Escape"){ showDone(false); showHist(false); } });

// ================= TEAM & PERMISSIONS (admin) =================
let catalog = [], members = [], membersReadable = false;

async function loadCatalog(){
  if(catalog.length) return;
  const { data } = await sb.from("permission_catalog").select("key,label_ar,description_ar");
  catalog = (data||[]).sort((a,b)=>PERM_ORDER.indexOf(a.key)-PERM_ORDER.indexOf(b.key));
}
// team_members may not be readable from the site; then fall back to every email the system has seen
async function loadMembers(){
  const { data, error } = await sb.from("team_members").select("email,name,role,permissions,present_today,company");
  if(!error && data){ membersReadable = true; members = data; }
  else {
    membersReadable = false;
    const [t, l] = await Promise.all([sb.from("tasks").select("assigned_to,done_by"), sb.from("leads").select("created_by,assigned_to")]);
    const seen = new Set();
    (t.data||[]).forEach(x=>[x.assigned_to,x.done_by].forEach(e=>e&&seen.add(e.toLowerCase())));
    (l.data||[]).forEach(x=>[x.created_by,x.assigned_to].forEach(e=>e&&seen.add(e.toLowerCase())));
    members = [...seen].sort().map(email=>({ email, name:null, permissions:null, present_today:null }));
  }
  window.teamNames = Object.fromEntries(members.filter(m=>m.name).map(m=>[m.email.toLowerCase(), m.name]));
}
const permBoxes = (sel, prefix) => catalog.map(c=>`<label class="pbox" title="${esc(c.description_ar||"")}">
  <input type="checkbox" value="${esc(c.key)}" ${sel?.includes(c.key)?"checked":""} data-p="${prefix}"><span>${esc(c.label_ar)}</span></label>`).join("");

async function loadTeam(){
  $("teamRows").innerHTML = `<div class="empty">بيحمّل…</div>`;
  await loadCatalog(); await loadMembers();
  $("newPerms").innerHTML = permBoxes([], "new");
  $("teamNote").classList.toggle("hidden", membersReadable);
  $("teamRows").innerHTML = members.length ? members.map((m,i)=>`<div class="member" data-i="${i}">
      <div class="m-id"><input class="m-name" value="${esc(m.name||"")}" placeholder="الاسم" aria-label="الاسم">
        <span class="sub" dir="ltr">${esc(m.email)}</span></div>
      <div class="m-perms">${permBoxes(m.permissions, i)}</div>
      <div class="m-act">
        ${membersReadable ? `<label class="switch"><input type="checkbox" class="m-present" ${m.present_today?"checked":""}><span>حاضر النهارده</span></label>` : ""}
        <button type="button" class="primary m-save">حفظ</button></div>
    </div>`).join("")
    : `<div class="empty">لسه مفيش موظفين ظاهرين — ضيف واحد من فوق</div>`;
  $("teamRows").querySelectorAll(".member").forEach(row=>{
    const m = members[+row.dataset.i];
    row.querySelector(".m-save").onclick = ()=>saveMember(m.email, row.querySelector(".m-name").value, row, row.querySelector(".m-save"));
    row.querySelector(".m-present")?.addEventListener("change", async ev=>{
      const { error } = await sb.from("team_members").update({ present_today: ev.target.checked }).eq("email", m.email);
      if(error){ ev.target.checked = !ev.target.checked; toast(error.message); return; }
      toast(ev.target.checked ? "اتسجل حاضر" : "اتسجل غايب");
    });
  });
}
async function saveMember(email, name, box, btn){
  // the first permission becomes the member's main role, so keep the most powerful first
  const perms = [...box.querySelectorAll("input[data-p]:checked")].map(x=>x.value).sort((a,b)=>PERM_ORDER.indexOf(a)-PERM_ORDER.indexOf(b));
  if(!email) { toast("اكتب الإيميل"); return false; }
  if(!perms.length){ toast("اختار صلاحية واحدة على الأقل"); return false; }
  if(!membersReadable && !confirm(`الصلاحيات اللي اخترتها هتبقى هي صلاحيات ${email} الوحيدة. أكمّل؟`)) return false;
  btn.disabled = true;
  const { error } = await sb.rpc("set_member_permissions", { p_email: email.trim().toLowerCase(), p_permissions: perms, p_name: name.trim() || null });
  btn.disabled = false;
  if(error){ toast(error.message); return false; }
  toast(`اتحفظ: ${name.trim() || email}`); return true;
}
$("newMember").addEventListener("submit", async e=>{
  e.preventDefault(); const f = e.target;
  if(await saveMember(f.email.value, f.name.value, f, $("newSave"))){ f.reset(); loadTeam(); }
});

// ================= OWNER DASHBOARD (admin) =================
const STATUS_EXTRA = { visit_scheduled:"معاينة متحددة" };
const stLabel = v => STATUS_EXTRA[v] || sLabel(v);

async function loadBoard(){
  await Promise.all([loadDecisions(), loadPipeline(), loadMembers().then(loadTeamToday)]);
}
async function loadDecisions(){
  const { data, error } = await sb.from("decisions").select("id,kind,title,details,options,created_at").eq("status","pending").order("created_at");
  if(error){ $("decList").innerHTML = `<div class="empty">مشكلة في التحميل</div>`; return; }
  $("decCount").textContent = data.length || "";
  const det = d => !d ? "" : typeof d !== "object" ? `<p>${esc(d)}</p>`
    : `<dl>${Object.entries(d).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v)?v.join("، "):typeof v==="object"&&v?JSON.stringify(v):v)}</dd>`).join("")}</dl>`;
  $("decList").innerHTML = data.length ? data.map(d=>`<article class="dec" data-id="${d.id}">
      <h3>${esc(d.title)}</h3>${det(d.details)}
      <textarea class="dec-c" rows="2" placeholder="تعليق (اختياري)"></textarea>
      <div class="dec-opts">${(d.options||[]).map(o=>`<button type="button" class="line-btn" data-o="${esc(o)}">${esc(String(o).split("|")[0])}</button>`).join("")}</div>
    </article>`).join("")
    : `<div class="empty">مفيش قرارات مستنياك 👌</div>`;
  $("decList").querySelectorAll(".dec").forEach(card=>card.querySelectorAll("[data-o]").forEach(b=>b.onclick=async ()=>{
    card.querySelectorAll("button").forEach(x=>x.disabled = true);
    const { error } = await sb.rpc("decide", { p_decision: card.dataset.id, p_choice: b.dataset.o, p_comment: card.querySelector(".dec-c").value.trim() || null });
    if(error){ toast(error.message); card.querySelectorAll("button").forEach(x=>x.disabled = false); return; }
    toast("اتسجل ✓"); loadDecisions();
  }));
}
async function loadPipeline(){
  const { data, error } = await sb.from("leads").select("status");
  if(error){ $("pipe").innerHTML = `<div class="empty">مشكلة في التحميل</div>`; return; }
  const counts = {}; data.forEach(l=>counts[l.status||"new"] = (counts[l.status||"new"]||0)+1);
  const order = ["new","contacted","visit_scheduled","site_visit","quotation_sent","negotiation","won","lost"];
  const keys = [...order.filter(k=>counts[k]!=null), ...Object.keys(counts).filter(k=>!order.includes(k))];
  const max = Math.max(1, ...Object.values(counts));
  $("pipe").innerHTML = keys.length ? keys.map(k=>`<div class="bar-row"><span class="bl">${esc(stLabel(k))}</span>
      <span class="bt"><span class="bf${k==="lost"?" lost":k==="won"?" won":""}" style="width:${Math.max(3, counts[k]/max*100)}%"></span></span><b>${counts[k]}</b></div>`).join("")
    + `<div class="sub" style="margin-top:6px">الإجمالي: ${data.length} عميل</div>`
    : `<div class="empty">لسه مفيش عملاء</div>`;
}
async function loadTeamToday(){
  const start = new Date(); start.setHours(0,0,0,0);
  const { data, error } = await sb.from("tasks").select("assigned_to,status,due_at,done_at,done_by")
    .or(`status.eq.open,done_at.gte.${start.toISOString()}`);
  if(error){ $("teamToday").innerHTML = `<div class="empty">مشكلة في التحميل</div>`; return; }
  const now = new Date(), stats = {};
  const get = e => stats[e] ||= { open:0, done:0, late:0 };
  if(membersReadable) members.forEach(m=>get(m.email.toLowerCase()));
  data.forEach(t=>{
    if(t.status==="open"){ const s = get((t.assigned_to||"بدون مسؤول").toLowerCase()); s.open++; if(t.due_at && new Date(t.due_at) < now) s.late++; }
    else if(t.done_by) get(t.done_by.toLowerCase()).done++;
  });
  const present = Object.fromEntries(members.map(m=>[m.email.toLowerCase(), m.present_today]));
  const rows = Object.entries(stats).sort((a,b)=>b[1].late-a[1].late || b[1].open-a[1].open);
  $("teamToday").innerHTML = rows.length ? `<table class="tt"><thead><tr><th>الموظف</th><th>مفتوحة</th><th>خلصت النهارده</th><th>متأخرة</th>${membersReadable?"<th>حاضر</th>":""}</tr></thead><tbody>
    ${rows.map(([e,s])=>`<tr><td>${esc(nameOf(e))}</td><td>${s.open}</td><td>${s.done}</td><td class="${s.late?"late":""}">${s.late}</td>
      ${membersReadable?`<td>${present[e]===true?"✓":present[e]===false?"✗":"—"}</td>`:""}</tr>`).join("")}</tbody></table>`
    : `<div class="empty">مفيش مهام النهارده</div>`;
}
