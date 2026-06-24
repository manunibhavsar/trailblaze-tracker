// STARFIELD
const sf=document.getElementById('starfield');
if(sf){
  for(let i=0;i<220;i++){
    const s=document.createElement('div');
    const sz=Math.random()*2.2+0.4;
    const travel=(55+Math.random()*45)/0.7;
    s.className='star';
    s.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*220}vw;top:${Math.random()*100}%;--d:${2+Math.random()*6}s;--dl:${Math.random()*6}s;--op:${0.2+Math.random()*0.8};--travel:${travel}s;--travel-delay:${-Math.random()*travel}s`;
    sf.appendChild(s);
  }
  for(let i=0;i<5;i++){const s=document.createElement('div');s.className='shoot';s.style.cssText=`width:${60+Math.random()*80}px;left:${Math.random()*80}%;top:${Math.random()*50}%;--sd:${8+Math.random()*14}s;--sdl:${Math.random()*12}s`;sf.appendChild(s);}
}

const ICON_FALLBACK={check:'✓',x:'x',pencil:'E',archive:'A','archive-restore':'R','calendar-days':'Cal',bell:'!','clock-3':'Time',swords:'Task',rocket:'*',moon:'*',gem:'*',flame:'*'};
function icon(name, cls='icon-inline'){
  return `<i data-lucide="${name}" class="${cls}" aria-hidden="true">${ICON_FALLBACK[name]||''}</i>`;
}
function refreshIcons(){
  if(window.lucide&&typeof window.lucide.createIcons==='function') window.lucide.createIcons();
}
function stripEmojiText(s){
  return String(s||'')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?/gu,'')
    .replace(/\s{2,}/g,' ')
    .trim();
}

// PAGE NAVIGATION — the core fix: everything in one file, no links between files
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('navDashboard').classList.remove('active');
  document.getElementById('navCalendar').classList.remove('active');
  document.getElementById('navAnalytics').classList.remove('active');
  document.getElementById('navAbout').classList.remove('active');
  document.getElementById('navSettings').classList.remove('active');
  if(document.getElementById('navShop')) document.getElementById('navShop').classList.remove('active');
  document.getElementById('page-'+name).classList.add('active');
  const navMap={dashboard:'navDashboard',calendar:'navCalendar',analytics:'navAnalytics',about:'navAbout',settings:'navSettings',shop:'navShop'};
  if(navMap[name] && document.getElementById(navMap[name])) document.getElementById(navMap[name]).classList.add('active');
  window.scrollTo(0,0);
  if(name==='calendar'){render();const v=document.getElementById('calBannerVid');if(v){v.play().catch(()=>{});}}
  if(name==='analytics') renderAnalytics();
  if(name==='settings') initSettings();
  if(name==='shop') renderShop();
  refreshIcons();

}

// DASHBOARD
function safeJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}
  catch(e){return fallback;}
}
function safeInt(key,fallback=0){
  const n=parseInt(localStorage.getItem(key)||String(fallback),10);
  return Number.isFinite(n)?n:fallback;
}
function nowISO(){return new Date().toISOString();}
function dateFromISO(dateStr){return new Date((dateStr||fmt(new Date()))+'T12:00:00');}
function addDays(dateStr,days){const d=dateFromISO(dateStr);d.setDate(d.getDate()+days);return fmt(d);}
function addMonths(dateStr,months){const d=dateFromISO(dateStr);d.setMonth(d.getMonth()+months);return fmt(d);}
function startOfCurrentWeek(){
  const d=dateFromISO(fmt(new Date()));
  const offset=(d.getDay()+6)%7;
  d.setDate(d.getDate()-offset);
  return d;
}

let tasks=safeJson('hsrT3',[]);
let habits=safeJson('hsrH3',[]);
let journal=safeJson('hsrJ3',[]);
let xp=safeInt('hsrX3',0);
let taskSearch='';
let taskFilter='active';
let taskSort='smart';
let editingTaskId=null;
let pendingImportData=null;
let reminderTimer=null;

const DEFAULT_RECURRENCE='none';
function normalizeTask(task){
  const id=task.id||genId();
  const createdAt=task.createdAt||nowISO();
  const completedAt=task.completedAt||(task.done?createdAt:null);
  return{
    id,
    text:stripEmojiText(task.text||task.title||'Untitled mission'),
    priority:['low','med','high'].includes(task.priority)?task.priority:'low',
    done:!!task.done,
    due:task.due||null,
    notes:task.notes||task.note||'',
    tags:Array.isArray(task.tags)?task.tags.map(stripEmojiText).filter(Boolean):String(task.tags||'').split(',').map(s=>stripEmojiText(s)).filter(Boolean),
    recurrence:['none','daily','weekly','monthly'].includes(task.recurrence)?task.recurrence:DEFAULT_RECURRENCE,
    reminderAt:task.reminderAt||null,
    archived:!!task.archived,
    createdAt,
    completedAt,
    lastNotifiedAt:task.lastNotifiedAt||null,
  };
}
function migrateHabitDays(habit,history){
  if(!Array.isArray(habit.days))return history;
  const start=startOfCurrentWeek();
  habit.days.forEach((checked,idx)=>{
    if(!checked)return;
    const d=new Date(start);
    d.setDate(start.getDate()+idx);
    history[fmt(d)]=true;
  });
  return history;
}
function normalizeHabit(habit){
  const history={...(habit.historyByDate||{})};
  migrateHabitDays(habit,history);
  return{
    id:habit.id||genId(),
    name:stripEmojiText(habit.name||'Untitled ritual'),
    schedule:habit.schedule||'daily',
    historyByDate:history,
    createdAt:habit.createdAt||nowISO(),
    archived:!!habit.archived,
  };
}
function normalizeJournalEntry(entry){
  if(typeof entry==='string')return{id:genId(),text:entry,date:new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),createdAt:nowISO()};
  return{id:entry.id||genId(),text:String(entry.text||''),date:entry.date||new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),createdAt:entry.createdAt||entry.iso||nowISO()};
}
function migrateData(){
  tasks=Array.isArray(tasks)?tasks.map(normalizeTask):[];
  habits=Array.isArray(habits)?habits.map(normalizeHabit):[];
  journal=Array.isArray(journal)?journal.map(normalizeJournalEntry):[];
  localStorage.setItem('hsrT3',JSON.stringify(tasks));
  localStorage.setItem('hsrH3',JSON.stringify(habits));
  localStorage.setItem('hsrJ3',JSON.stringify(journal));
  localStorage.setItem('hsrSchemaVersion','2');
}
migrateData();

function getHabitWeekDates(){
  const start=startOfCurrentWeek();
  return DAYS.map((_,idx)=>{const d=new Date(start);d.setDate(start.getDate()+idx);return fmt(d);});
}
function calcStreak(habit){
  let streak=0;
  for(let d=fmt(new Date());habit.historyByDate&&habit.historyByDate[d];d=addDays(d,-1))streak++;
  return streak;
}
const LVL_TITLES=['Novice Trailblazer','Stellar Wanderer','Cosmic Pathfinder','Astral Voyager','Star Railbound','Galactic Pioneer','Void Walker','Aeon Touched','Trailblaze Legend','Aeonic Sovereign'];
const DAYS=['M','T','W','T','F','S','S'];
const PRIO={high:'Critical',med:'Urgent',low:'Normal'};
const QUOTES=['"The stars don\'t just watch — they remember every step you take."','"Even the longest journey begins aboard the Astral Express."','"Fortune favors those who persist through the void."','"Discipline is your shield; habits are your stars."','"Small rituals forge the strongest Trailblazers."','"In the silence between galaxies, consistency becomes power."','"Every completed mission brings you closer to the horizon."','"The path of the Trailblazer is paved with daily resolve."','"Across a thousand worlds — only you can walk your path."','"The Express waits for no one. But your future waits for you."'];
const QUOTE_INTERVAL_MS=15000;
let quoteIndex=Math.floor(Math.random()*QUOTES.length);
let quoteTimer=null;
function resetQuoteTimer(box){
  if(!box) return;
  box.style.setProperty('--quote-ms',QUOTE_INTERVAL_MS+'ms');
  box.classList.remove('quote-timer');
  void box.offsetWidth;
  box.classList.add('quote-timer');
}
function setQuote(nextIndex,animate=false){
  const q=document.getElementById('qT');
  if(!q) return;
  const box=q.closest('.quote');
  const apply=()=>{
    q.textContent=QUOTES[nextIndex];
    if(box){
      box.classList.remove('quote-exit');
      box.classList.add('quote-enter');
      setTimeout(()=>box.classList.remove('quote-enter'),650);
      resetQuoteTimer(box);
    }
  };
  if(animate&&box){
    box.classList.add('quote-exit');
    setTimeout(apply,320);
  }else{
    apply();
  }
}
function nextQuote(){
  quoteIndex=(quoteIndex+1)%QUOTES.length;
  setQuote(quoteIndex,true);
}
function startQuoteRotation(){
  setQuote(quoteIndex,false);
  clearInterval(quoteTimer);
  quoteTimer=setInterval(nextQuote,QUOTE_INTERVAL_MS);
}
startQuoteRotation();
function lvOf(x){return Math.floor(x/100)+1;}
function updLv(){const lv=lvOf(xp);const prog=xp%100;const ttl=LVL_TITLES[Math.min(lv-1,9)];document.getElementById('lvN').textContent=lv;document.getElementById('lvTitle').textContent=ttl;document.getElementById('lvFill').style.width=`${prog}%`;document.getElementById('lvXp').textContent=`${prog} / 100 XP to next level`;const xpEl=document.getElementById('sXP');if(xpEl)xpEl.textContent=xp;}
function gainXP(a){const old=lvOf(xp);xp+=a;localStorage.setItem('hsrX3',xp);const nw=lvOf(xp);updLv();if(nw>old){toast(`Level up: ${LVL_TITLES[Math.min(nw-1,9)]}!`);document.getElementById('lvPanel').classList.add('flash');setTimeout(()=>document.getElementById('lvPanel').classList.remove('flash'),7000);if(typeof earnJade==='function')earnJade(100,'Level up bonus!');}}
function updStats(){
  const visibleTasks=tasks.filter(t=>!t.archived);
  const done=visibleTasks.filter(t=>t.done).length;
  const ms=habits.reduce((m,h)=>Math.max(m,calcStreak(h)),0);
  document.getElementById('stT').textContent=visibleTasks.length;
  document.getElementById('stD').textContent=done;
  document.getElementById('stH').textContent=habits.filter(h=>!h.archived).length;
  document.getElementById('stL').textContent=journal.length;
  // legacy hidden spans (used by updLv)
  document.getElementById('sDone').textContent=done;
  document.getElementById('sStr').textContent=ms;
}

function save(){localStorage.setItem('hsrT3',JSON.stringify(tasks));localStorage.setItem('hsrH3',JSON.stringify(habits));localStorage.setItem('hsrJ3',JSON.stringify(journal));updStats();scheduleReminderCheck();}
function toast(m){const t=document.getElementById('toast');t.textContent=stripEmojiText(m);t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
function esc(s){const d=document.createElement('div');d.appendChild(document.createTextNode(s));return d.innerHTML;}
function jsArg(s){return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
function todayStr(){return fmt(new Date());}
function dueDateLabel(due){
  if(!due)return null;
  const t=todayStr();
  if(due<t)return{cls:'due-overdue',label:'Overdue'};
  if(due===t)return{cls:'due-today',label:'Due Today'};
  const d=new Date(due+'T12:00:00');const label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return{cls:'due-future',label};
}
function taskPriorityXP(priority){return priority==='high'?30:priority==='med'?20:10;}
function recurrenceLabel(rec){return rec&&rec!=='none'?rec[0].toUpperCase()+rec.slice(1):'';}
function getVisibleTasks(){
  const q=taskSearch.trim().toLowerCase();
  let list=tasks.filter(t=>{
    if(taskFilter==='active'&& (t.archived||t.done))return false;
    if(taskFilter==='done'&& (t.archived||!t.done))return false;
    if(taskFilter==='archived'&&!t.archived)return false;
    if(taskFilter==='all'&&t.archived)return false;
    if(taskFilter==='overdue'&&(t.archived||t.done||!t.due||t.due>=todayStr()))return false;
    if(q){
      const hay=[t.text,t.notes,(t.tags||[]).join(' '),t.priority,t.due].join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  const prioRank={high:0,med:1,low:2};
  list.sort((a,b)=>{
    if(taskSort==='due')return (a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')||prioRank[a.priority]-prioRank[b.priority];
    if(taskSort==='priority')return prioRank[a.priority]-prioRank[b.priority]||(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31');
    if(taskSort==='created')return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
    return Number(a.done)-Number(b.done)||(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')||prioRank[a.priority]-prioRank[b.priority];
  });
  return list;
}
function renderTasks(){
  const el=document.getElementById('tList');
  el.innerHTML='';
  const list=getVisibleTasks();
  updateTaskSearchSummary(list.length);
  if(!list.length){el.innerHTML=`<div class="empty"><span class="empty-i">${icon('rocket')}</span>No missions match this view.</div>`;renderDueToday();refreshIcons();return;}
  list.forEach(t=>{
    const dl=t.due?dueDateLabel(t.due):null;
    const dueChip=dl?`<span class="ti-due ${dl.cls}">${dl.label}</span>`:'';
    const rowCls=t.done?'done':t.due&&t.due<todayStr()?'overdue':t.due===todayStr()?'due-today-row':'';
    const calBtn=t.due?`<button class="goto-cal" title="View on calendar" aria-label="View ${esc(t.text)} on calendar" onclick="jumpToTaskDate('${t.due}')">${icon('calendar-days','task-action-icon')}</button>`:'';
    const tagHtml=(t.tags||[]).slice(0,3).map(tag=>`<span class="task-tag">${esc(tag)}</span>`).join('');
    const rec=t.recurrence&&t.recurrence!=='none'?`<span class="task-tag task-repeat">${recurrenceLabel(t.recurrence)}</span>`:'';
    const remind=t.reminderAt?`<span class="task-tag">${icon('bell','task-action-icon')} ${new Date(t.reminderAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>`:'';
    const archiveBtn=t.archived?`<button class="db" title="Restore mission" aria-label="Restore ${esc(t.text)}" onclick="restoreTask('${jsArg(t.id)}')">${icon('archive-restore','task-action-icon')}</button>`:`<button class="db" title="Archive mission" aria-label="Archive ${esc(t.text)}" onclick="archiveTask('${jsArg(t.id)}')">${icon('archive','task-action-icon')}</button>`;
    el.innerHTML+=`<div class="ti ${rowCls}" data-task-id="${esc(t.id)}">
      <button class="chk" aria-label="${t.done?'Mark incomplete':'Mark complete'}" aria-pressed="${t.done}" onclick="toggleT('${jsArg(t.id)}')">${t.done?icon('check','task-action-icon'):''}</button>
      <div class="task-main"><div class="ttxt">${esc(t.text)}</div><div class="task-meta">${dueChip}<span class="pb ${t.priority}">${PRIO[t.priority]}</span>${rec}${tagHtml}${remind}</div>${t.notes?`<div class="task-note">${esc(t.notes)}</div>`:''}</div>
      ${calBtn}
      <button class="db" title="Edit mission" aria-label="Edit ${esc(t.text)}" onclick="openTaskEditModal('${jsArg(t.id)}')">${icon('pencil','task-action-icon')}</button>
      ${archiveBtn}
      <button class="db" title="Delete mission" aria-label="Delete ${esc(t.text)}" onclick="delT('${jsArg(t.id)}')">${icon('x','task-action-icon')}</button>
    </div>`;
  });
  renderDueToday();
  refreshIcons();
}
function renderDueToday(){
  const today=todayStr();
  const due=tasks.filter(t=>!t.done&&!t.archived&&t.due&&(t.due===today||t.due<today));
  const sec=document.getElementById('dueTodaySection');
  const list=document.getElementById('dueTodayList');
  const badge=document.getElementById('dueTodayBadge');
  if(!due.length){sec.style.display='none';return;}
  sec.style.display='block';
  badge.textContent=`${due.length} mission${due.length>1?'s':''}`;
  list.innerHTML='';
  due.forEach(t=>{
    const dl=dueDateLabel(t.due);
    list.innerHTML+=`<div class="ti ${t.due<today?'overdue':'due-today-row'}"><button class="chk" aria-label="Mark complete" onclick="toggleT('${jsArg(t.id)}')">${t.done?icon('check','task-action-icon'):''}</button><div class="task-main"><div class="ttxt">${esc(t.text)}</div><div class="task-meta"><span class="ti-due ${dl.cls}">${dl.label}</span><span class="pb ${t.priority}">${PRIO[t.priority]}</span></div></div><button class="goto-cal" title="View on calendar" onclick="jumpToTaskDate('${t.due}')">${icon('calendar-days','task-action-icon')}</button><button class="db" title="Edit mission" onclick="openTaskEditModal('${jsArg(t.id)}')">${icon('pencil','task-action-icon')}</button></div>`;
  });
}
function jumpToTaskDate(dateStr){
  showPage('calendar');
  jumpTo(dateStr);
}
function addTask(){
  const inp=document.getElementById('tInp');
  const p=document.getElementById('pSel').value;
  const due=document.getElementById('tDate').value;
  const notes=document.getElementById('tNotes')?.value.trim()||'';
  const tags=String(document.getElementById('tTags')?.value||'').split(',').map(s=>stripEmojiText(s)).filter(Boolean);
  const recurrence=document.getElementById('tRecurrence')?.value||'none';
  const reminderAt=document.getElementById('tReminder')?.value||null;
  const txt=inp.value.trim();
  if(!txt){inp.focus();return;}
  const id=genId();
  const task=normalizeTask({id,text:txt,priority:p,done:false,due:due||null,notes,tags,recurrence,reminderAt,createdAt:nowISO()});
  tasks.unshift(task);
  syncTaskEvent(task);
  inp.value='';document.getElementById('tDate').value='';
  if(document.getElementById('tNotes'))document.getElementById('tNotes').value='';
  if(document.getElementById('tTags'))document.getElementById('tTags').value='';
  if(document.getElementById('tRecurrence'))document.getElementById('tRecurrence').value='none';
  if(document.getElementById('tReminder'))document.getElementById('tReminder').value='';
  updateMissionDetailsSummary();
  save();renderTasks();
  toast(due?'Mission deployed and added to calendar.':'Mission deployed.');
}
function syncTaskEvent(task){
  if(typeof events==='undefined')return;
  events=events.filter(e=>e.taskId!==task.id);
  if(task.due&&!task.archived){
    events.push({id:genId(),title:task.text,date:task.due,time:'',note:[task.notes,`Priority: ${PRIO[task.priority]}`].filter(Boolean).join(' | '),color:task.done?'green':task.priority==='high'?'red':task.priority==='med'?'gold':'blue',taskId:task.id});
    saveAll();
  }
}
function nextDueDate(task){
  if(!task.due)return null;
  if(task.recurrence==='daily')return addDays(task.due,1);
  if(task.recurrence==='weekly')return addDays(task.due,7);
  if(task.recurrence==='monthly')return addMonths(task.due,1);
  return null;
}
function createNextRecurringTask(task){
  const due=nextDueDate(task);
  if(!due)return;
  const next=normalizeTask({...task,id:genId(),done:false,archived:false,due,completedAt:null,createdAt:nowISO(),lastNotifiedAt:null});
  tasks.unshift(next);
  syncTaskEvent(next);
}
function toggleT(id){
  const task=tasks.find(t=>t.id===id);if(!task)return;
  task.done=!task.done;
  task.completedAt=task.done?nowISO():null;
  syncTaskEvent(task);
  if(task.done){
    const reward=taskPriorityXP(task.priority);
    gainXP(reward);
    if(typeof earnJade==='function')earnJade(reward,'Mission complete');
    createNextRecurringTask(task);
  }
  save();renderTasks();
}
function delT(id){
  const idx=tasks.findIndex(t=>t.id===id);if(idx<0)return;
  const tid=tasks[idx].id;
  if(typeof events!=='undefined'&&tid){events=events.filter(e=>e.taskId!==tid);saveAll();}
  tasks.splice(idx,1);save();renderTasks();
}
function archiveTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.archived=true;syncTaskEvent(t);save();renderTasks();toast('Mission archived.');}
function restoreTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.archived=false;syncTaskEvent(t);save();renderTasks();toast('Mission restored.');}
function archiveCompletedTasks(){let count=0;tasks.forEach(t=>{if(t.done&&!t.archived){t.archived=true;syncTaskEvent(t);count++;}});save();renderTasks();toast(count?`${count} completed mission${count>1?'s':''} archived.`:'No completed missions to archive.');}
function selectedOptionLabel(id,fallback){
  const el=document.getElementById(id);
  return el?.selectedOptions?.[0]?.textContent?.replace(/[◆]/g,'').trim()||fallback;
}
function updateTaskSearchSummary(count){
  const el=document.getElementById('taskSearchSummary');
  if(!el)return;
  const search=document.getElementById('taskSearch')?.value.trim();
  const filter=selectedOptionLabel('taskFilter','Active');
  const sort=selectedOptionLabel('taskSort','Smart');
  el.textContent=search?`"${search}" - ${count} match${count===1?'':'es'}`:`${filter} - ${sort} - ${count}`;
}
function updateMissionDetailsSummary(){
  const el=document.getElementById('missionDetailsBadge');
  if(!el)return;
  const filled=[
    document.getElementById('tNotes')?.value.trim(),
    document.getElementById('tTags')?.value.trim(),
    (document.getElementById('tRecurrence')?.value||'none')!=='none',
    document.getElementById('tReminder')?.value
  ].filter(Boolean).length;
  el.textContent=filled?`${filled} set`:'Optional';
}
function updateTaskFilters(){taskSearch=document.getElementById('taskSearch')?.value||'';taskFilter=document.getElementById('taskFilter')?.value||'active';taskSort=document.getElementById('taskSort')?.value||'smart';renderTasks();}
function openTaskEditModal(id){
  const task=tasks.find(t=>t.id===id);if(!task)return;
  editingTaskId=id;
  document.getElementById('taskModalTitle').textContent='Edit Mission';
  document.getElementById('editTaskTitle').value=task.text;
  document.getElementById('editTaskPriority').value=task.priority;
  document.getElementById('editTaskDate').value=task.due||'';
  document.getElementById('editTaskNotes').value=task.notes||'';
  document.getElementById('editTaskTags').value=(task.tags||[]).join(', ');
  document.getElementById('editTaskRecurrence').value=task.recurrence||'none';
  document.getElementById('editTaskReminder').value=task.reminderAt?task.reminderAt.slice(0,16):'';
  openDialog(document.getElementById('taskModalBackdrop'),document.getElementById('editTaskTitle'));
}
function closeTaskModal(){editingTaskId=null;closeDialog(document.getElementById('taskModalBackdrop'));}
function saveTaskEdit(){
  const task=tasks.find(t=>t.id===editingTaskId);if(!task)return;
  const title=document.getElementById('editTaskTitle').value.trim();
  if(!title){document.getElementById('editTaskTitle').focus();return;}
  task.text=stripEmojiText(title);
  task.priority=document.getElementById('editTaskPriority').value;
  task.due=document.getElementById('editTaskDate').value||null;
  task.notes=document.getElementById('editTaskNotes').value.trim();
  task.tags=String(document.getElementById('editTaskTags').value||'').split(',').map(s=>stripEmojiText(s)).filter(Boolean);
  task.recurrence=document.getElementById('editTaskRecurrence').value||'none';
  task.reminderAt=document.getElementById('editTaskReminder').value||null;
  syncTaskEvent(task);
  save();renderTasks();closeTaskModal();toast('Mission updated.');
}
document.getElementById('tInp').addEventListener('keydown',e=>{if(e.key==='Enter')addTask();});
['tNotes','tTags','tRecurrence','tReminder'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el)return;
  el.addEventListener('input',updateMissionDetailsSummary);
  el.addEventListener('change',updateMissionDetailsSummary);
});
updateMissionDetailsSummary();
function renderHabits(){
  const el=document.getElementById('hList');
  const hd=document.getElementById('dHd');
  el.innerHTML='';hd.innerHTML='';
  const weekDates=getHabitWeekDates();
  const activeHabits=habits.filter(h=>!h.archived);
  if(!activeHabits.length){
    el.innerHTML=`<div class="empty"><span class="empty-i">${icon('moon')}</span>No rituals yet. Build your daily path.</div>`;
    refreshIcons();
    return;
  }
  DAYS.forEach((d,idx)=>{hd.innerHTML+=`<div class="dh-lbl" title="${weekDates[idx]}">${d}</div>`;});
  activeHabits.forEach(h=>{
    const streak=calcStreak(h);
    const streakLabel=streak>0?`${icon('flame','task-streak-icon')}${streak}`:'-';
    const streakTitle=streak>0?`${streak}-day streak`:'No streak yet';
    const days=weekDates.map((date,di)=>{
      const on=!!h.historyByDate?.[date];
      return `<button class="hd${on?' on':''}" aria-label="${on?'Clear':'Mark'} ${h.name} on ${date}" aria-pressed="${on}" onclick="togDay('${jsArg(h.id)}','${date}')">${DAYS[di]}</button>`;
    }
    ).join('');
    el.innerHTML+=`<div class="hrow">
      <div class="hname">${esc(h.name)}</div>
      <div class="hdays">${days}</div>
      <div class="hstrk" title="${streakTitle}">${streakLabel}</div>
      <div class="hactions">
        <button class="db" title="Archive ritual" aria-label="Archive ${esc(h.name)}" onclick="archiveHabit('${jsArg(h.id)}')">${icon('archive','task-action-icon')}</button>
        <button class="db" title="Delete ritual" aria-label="Delete ${esc(h.name)}" onclick="delH('${jsArg(h.id)}')">${icon('x','task-action-icon')}</button>
      </div>
    </div>`;
  });
  refreshIcons();
}
function addHabit(){const inp=document.getElementById('hInp');const txt=inp.value.trim();if(!txt){inp.focus();return;}habits.push(normalizeHabit({name:txt,schedule:'daily',historyByDate:{},createdAt:nowISO()}));inp.value='';save();renderHabits();toast('New ritual established.');}
function togDay(id,date){const h=habits.find(x=>x.id===id);if(!h)return;h.historyByDate=h.historyByDate||{};h.historyByDate[date]=!h.historyByDate[date];if(!h.historyByDate[date])delete h.historyByDate[date];else{gainXP(5);if(typeof earnJade==='function')earnJade(5,'Ritual checked');}save();renderHabits();}
function archiveHabit(id){const h=habits.find(x=>x.id===id);if(!h)return;h.archived=true;save();renderHabits();toast('Ritual archived.');}
function delH(id){habits=habits.filter(h=>h.id!==id);save();renderHabits();}
document.getElementById('hInp').addEventListener('keydown',e=>{if(e.key==='Enter')addHabit();});
function renderJournal(){const el=document.getElementById('jEnt');el.innerHTML='';[...journal].reverse().forEach(e=>{el.innerHTML+=`<div class="je"><div class="jm">${esc(e.date)}</div><div class="jt">${esc(e.text)}</div></div>`;});}
function saveLog(){const inp=document.getElementById('jInp');const txt=inp.value.trim();if(!txt){inp.focus();return;}const now=new Date();const date=now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});journal.push({id:genId(),text:txt,date,createdAt:nowISO()});inp.value='';gainXP(15);if(typeof earnJade==='function')earnJade(15,'Log recorded');save();renderJournal();toast('Entry recorded. +15 XP');}
renderTasks();renderHabits();renderJournal();updLv();updStats();

// CALENDAR
function normalizeEvent(e){
  return{id:e.id||genId(),title:stripEmojiText(e.title||'Untitled event'),date:e.date||todayStr(),time:e.time||'',note:e.note||'',color:e.color||'gold',taskId:e.taskId||null,done:!!e.done,lastNotifiedAt:e.lastNotifiedAt||null};
}
let events=safeJson('hsrCal',[]).map(normalizeEvent);
let currentDate=new Date();
let currentView='month';
let editingId=null;
let selectedColor='gold';
let pendingDate=null;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const COLOR_CLASS={gold:'ec-gold',blue:'ec-blue',purple:'ec-purple',red:'ec-red',green:'ec-green'};
const UI_CLASS={gold:'ui-gold',blue:'ui-blue',purple:'ui-purple',red:'ui-red',green:'ui-green'};
function saveAll(){localStorage.setItem('hsrCal',JSON.stringify(events));}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function fmt(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
tasks.forEach(syncTaskEvent);
function renderMonth(){
  const y=currentDate.getFullYear(),mo=currentDate.getMonth();
  document.getElementById('monthLabel').textContent=`${MONTHS[mo]} ${y}`;
  const grid=document.getElementById('calGrid');grid.innerHTML='';
  const first=new Date(y,mo,1).getDay();const daysInMonth=new Date(y,mo+1,0).getDate();
  const daysInPrev=new Date(y,mo,0).getDate();const todayStr=fmt(new Date());
  const totalCells=Math.ceil((first+daysInMonth)/7)*7;
  for(let i=0;i<totalCells;i++){
    let day,isOther=false,mo2=mo;
    if(i<first){day=daysInPrev-first+i+1;isOther=true;mo2=mo-1;}
    else if(i>=first+daysInMonth){day=i-first-daysInMonth+1;isOther=true;mo2=mo+1;}
    else{day=i-first+1;}
    const realY=mo2<0?y-1:mo2>11?y+1:y;const realM=((mo2%12)+12)%12;
    const dateStr=`${realY}-${String(realM+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEvents=events.filter(e=>e.date===dateStr).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const isToday=dateStr===todayStr;const isWeekend=(i%7===6);
    const cell=document.createElement('div');
    cell.className=`cal-cell${isOther?' other-month':''}${isToday?' today':''}${dayEvents.length?' has-events':''}${isWeekend?' weekend-col':''}`;
    cell.dataset.date=dateStr;
    let chipsHtml='';const maxShow=3;
    dayEvents.slice(0,maxShow).forEach(ev=>{
      const timeLabel=ev.time?`${ev.time} · `:'';
      const isDone=ev.taskId&&tasks.find(t=>t.id===ev.taskId&&t.done);
      const doneStyle=isDone?'opacity:0.45;text-decoration:line-through;':'' ;
      const taskIcon=ev.taskId?icon('swords','cal-task-icon'):'';
      const title=esc(stripEmojiText(ev.title));
      chipsHtml+=`<div class="event-chip ${COLOR_CLASS[ev.color]||'ec-gold'}" onclick="openEditModal('${ev.id}',event)" title="${title}" style="${doneStyle}"><span style="flex-shrink:0;font-size:8px">●</span><span style="overflow:hidden;text-overflow:ellipsis">${timeLabel}${taskIcon}${title}</span></div>`;
    });
    if(dayEvents.length>maxShow)chipsHtml+=`<div class="more-events" onclick="openEditModal('${dayEvents[maxShow].id}',event)">+${dayEvents.length-maxShow} more</div>`;
    cell.innerHTML=`<span class="day-num">${day}</span>${chipsHtml}<div class="add-event-btn" onclick="openAddModal('${dateStr}')">+ Add</div>`;
    grid.appendChild(cell);
  }
  renderUpcoming();renderMiniCal();
}
function renderWeek(){
  const dow=currentDate.getDay();const weekStart=new Date(currentDate);weekStart.setDate(currentDate.getDate()-dow);
  const todayStr=fmt(new Date());const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  document.getElementById('monthLabel').textContent=weekStart.getMonth()===weekEnd.getMonth()?`${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`:`${MONTHS[weekStart.getMonth()].slice(0,3)} – ${MONTHS[weekEnd.getMonth()].slice(0,3)} ${weekEnd.getFullYear()}`;
  const hd=document.getElementById('weekHd');hd.innerHTML='<div class="wdh-blank"></div>';
  const body=document.getElementById('weekBody');
  const timeCol=document.createElement('div');timeCol.className='time-col';
  for(let h=0;h<24;h++){const lbl=document.createElement('div');lbl.className='time-slot-lbl';lbl.textContent=h===0?'':`${h%12||12}${h<12?'am':'pm'}`;timeCol.appendChild(lbl);}
  body.innerHTML='';body.appendChild(timeCol);
  for(let di=0;di<7;di++){
    const dd=new Date(weekStart);dd.setDate(weekStart.getDate()+di);const dateStr=fmt(dd);const isToday=dateStr===todayStr;
    const wdh=document.createElement('div');wdh.className=`wdh${isToday?' today':''}`;wdh.innerHTML=`<div class="wdh-day">${DAYS_SHORT[di]}</div><div class="wdh-date">${dd.getDate()}</div>`;hd.appendChild(wdh);
    const col=document.createElement('div');col.className='week-day-col';
    for(let h=0;h<24;h++){const slot=document.createElement('div');slot.className='week-slot';slot.onclick=()=>{const t=`${String(h).padStart(2,'0')}:00`;openAddModal(dateStr,t);};col.appendChild(slot);}
    const dayEvents=events.filter(e=>e.date===dateStr);
    dayEvents.forEach(ev=>{if(!ev.time)return;const[hh,mm]=ev.time.split(':').map(Number);const top=(hh+mm/60)*52;const chip=document.createElement('div');chip.className=`week-event ${COLOR_CLASS[ev.color]||'ec-gold'}`;chip.style.cssText=`top:${top}px;min-height:42px;`;chip.textContent=stripEmojiText(ev.title);chip.onclick=(e)=>{e.stopPropagation();openEditModal(ev.id,e);};col.appendChild(chip);});
    body.appendChild(col);
  }
  renderUpcoming();renderMiniCal();
}
function renderUpcoming(){
  const ul=document.getElementById('upcomingList');ul.innerHTML='';const tStr=fmt(new Date());
  const upcoming=events.filter(e=>e.date>=tStr).sort((a,b)=>{if(a.date!==b.date)return a.date.localeCompare(b.date);return(a.time||'').localeCompare(b.time||'');}).slice(0,8);
  if(!upcoming.length){ul.innerHTML='<div class="sb-empty">No upcoming events.<br>The void awaits.</div>';return;}
  upcoming.forEach(ev=>{
    const d=new Date(ev.date+'T12:00:00');const label=d.toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'});
    const linkedTask=ev.taskId?tasks.find(t=>t.id===ev.taskId):null;
    const isDone=linkedTask&&linkedTask.done;
    const taskBadge=ev.taskId?`<span class="task-badge" style="font-family:'Rajdhani',sans-serif;font-size:8px;letter-spacing:1px;color:${isDone?'var(--green)':'var(--gold)'};margin-left:4px;">${icon(isDone?'check':'swords','cal-task-icon')}${isDone?'Done':'Task'}</span>`:'';
    const title=esc(stripEmojiText(ev.title));
    ul.innerHTML+=`<div class="upcoming-item ${UI_CLASS[ev.color]||'ui-gold'}" onclick="openEditModal('${ev.id}',event)" style="${isDone?'opacity:0.5':''}"><div class="ui-date">${label}</div><div class="ui-name" style="${isDone?'text-decoration:line-through':''}">${title}${taskBadge}</div>${ev.time?`<div class="ui-time">${icon('clock-3','cal-task-icon')} ${ev.time}</div>`:''}</div>`;
  });
}
function renderMiniCal(){
  const y=currentDate.getFullYear(),mo=currentDate.getMonth();
  const miniHd=document.getElementById('miniHd');miniHd.innerHTML='';
  DAYS_SHORT.forEach(d=>{miniHd.innerHTML+=`<div class="mini-dh">${d[0]}</div>`;});
  const grid=document.getElementById('miniGrid');grid.innerHTML='';
  const first=new Date(y,mo,1).getDay();const dim=new Date(y,mo+1,0).getDate();const todayStr=fmt(new Date());
  const evDates=new Set(events.map(e=>e.date));
  for(let i=0;i<first;i++)grid.innerHTML+=`<div class="mini-day other"></div>`;
  for(let d=1;d<=dim;d++){const ds=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const cls=`mini-day${ds===todayStr?' today':''}${evDates.has(ds)?' has-ev':''}`;grid.innerHTML+=`<div class="${cls}" onclick="jumpTo('${ds}')">${d}</div>`;}
}
function jumpTo(dateStr){currentDate=new Date(dateStr+'T12:00:00');render();}
function setView(v){currentView=v;document.getElementById('monthView').classList.toggle('hidden',v!=='month');document.getElementById('weekView').classList.toggle('active',v==='week');document.getElementById('vMonth').classList.toggle('active',v==='month');document.getElementById('vWeek').classList.toggle('active',v==='week');render();}
function render(){if(currentView==='month')renderMonth();else renderWeek();refreshIcons();}
document.getElementById('prevBtn').onclick=()=>{if(currentView==='month')currentDate.setMonth(currentDate.getMonth()-1);else currentDate.setDate(currentDate.getDate()-7);render();};
document.getElementById('nextBtn').onclick=()=>{if(currentView==='month')currentDate.setMonth(currentDate.getMonth()+1);else currentDate.setDate(currentDate.getDate()+7);render();};
function goToday(){currentDate=new Date();render();}
document.getElementById('colorPicker').addEventListener('click',e=>{const opt=e.target.closest('.cp-opt');if(!opt)return;document.querySelectorAll('.cp-opt').forEach(o=>o.classList.remove('selected'));opt.classList.add('selected');selectedColor=opt.dataset.color;});
function focusableElements(root){return [...root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&el.offsetParent!==null);}
function openDialog(backdrop,focusTarget){
  if(!backdrop)return;
  backdrop.classList.add('open');backdrop.setAttribute('aria-hidden','false');
  const target=focusTarget||focusableElements(backdrop)[0];
  setTimeout(()=>target?.focus(),60);
}
function closeDialog(backdrop){
  if(!backdrop)return;
  backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');
}
function trapDialogFocus(e,backdrop){
  if(e.key!=='Tab'||!backdrop?.classList.contains('open'))return;
  const els=focusableElements(backdrop);if(!els.length)return;
  const first=els[0],last=els[els.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function openAddModal(dateStr,time){editingId=null;pendingDate=dateStr||fmt(new Date());document.getElementById('modalTitle').textContent='New Event';document.getElementById('evTitle').value='';document.getElementById('evDate').value=pendingDate;document.getElementById('evTime').value=time||'';document.getElementById('evNote').value='';selectedColor='gold';document.querySelectorAll('.cp-opt').forEach(o=>o.classList.toggle('selected',o.dataset.color==='gold'));document.getElementById('modalActions').innerHTML=`<button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="saveEvent()">Deploy</button>`;openDialog(document.getElementById('modalBackdrop'),document.getElementById('evTitle'));}
function openEditModal(id,e){if(e)e.stopPropagation();const ev=events.find(x=>x.id===id);if(!ev)return;editingId=id;document.getElementById('modalTitle').textContent='Edit Event';document.getElementById('evTitle').value=stripEmojiText(ev.title);document.getElementById('evDate').value=ev.date;document.getElementById('evTime').value=ev.time||'';document.getElementById('evNote').value=ev.note||'';selectedColor=ev.color||'gold';document.querySelectorAll('.cp-opt').forEach(o=>o.classList.toggle('selected',o.dataset.color===selectedColor));document.getElementById('modalActions').innerHTML=`<button class="btn-delete" onclick="deleteEvent()">Delete</button><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="saveEvent()">Save</button>`;openDialog(document.getElementById('modalBackdrop'),document.getElementById('evTitle'));}
function closeModal(){closeDialog(document.getElementById('modalBackdrop'));}
function saveEvent(){
  const title=document.getElementById('evTitle').value.trim();
  if(!title){document.getElementById('evTitle').focus();return;}
  const date=document.getElementById('evDate').value;
  const time=document.getElementById('evTime').value;
  const note=document.getElementById('evNote').value.trim();
  if(editingId){
    const idx=events.findIndex(x=>x.id===editingId);
    if(idx>-1){
      const ev=events[idx];
      events[idx]={...ev,title:stripEmojiText(title),date,time,note,color:selectedColor};
      // If this event is linked to a task, update the task's due date too
      if(ev.taskId){const ti=tasks.findIndex(t=>t.id===ev.taskId);if(ti>-1){tasks[ti].due=date;save();renderTasks();}}
    }
    toast('Event updated.');
  } else {
    events.push(normalizeEvent({id:genId(),title:stripEmojiText(title),date,time,note,color:selectedColor}));
    toast('Event deployed.');
  }
  saveAll();closeModal();render();
}
function deleteEvent(){
  const ev=events.find(x=>x.id===editingId);
  // If linked to a task, remove the due date from the task (but keep the task)
  if(ev&&ev.taskId){const ti=tasks.findIndex(t=>t.id===ev.taskId);if(ti>-1){tasks[ti].due=null;save();renderTasks();}}
  events=events.filter(x=>x.id!==editingId);
  saveAll();closeModal();render();toast('Event removed.');
}
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
document.addEventListener('keydown',e=>{
  ['modalBackdrop','taskModalBackdrop','confirmOverlay','importOverlay'].forEach(id=>trapDialogFocus(e,document.getElementById(id)));
  if(e.key==='Escape'){closeModal();closeTaskModal();closeImportChoice();closeDialog(document.getElementById('confirmOverlay'));}
  if(e.key==='Enter'&&document.getElementById('modalBackdrop').classList.contains('open')){if(document.activeElement.tagName!=='BUTTON')saveEvent();}
});

// ═══ FOCUS TIMER ═══
let focusDuration=25*60,focusLeft=25*60,focusRunning=false,focusInterval=null,focusStartedAt=null,focusBaseLeft=null;
let focusHistory=safeJson('hsrFocusHistory',{});
let focusSessions=(focusHistory[todayStr()]||[]).length||safeInt('hsrFocusSes',0);
const savedFocus=safeJson('hsrFocusState',null);
if(savedFocus&&savedFocus.duration&&savedFocus.left){
  focusDuration=savedFocus.duration;
  focusLeft=savedFocus.left;
  if(savedFocus.running&&savedFocus.startedAt){
    const elapsed=Math.floor((Date.now()-savedFocus.startedAt)/1000);
    focusLeft=Math.max(0,savedFocus.left-elapsed);
    focusRunning=focusLeft>0;
    focusStartedAt=Date.now();
    focusBaseLeft=focusLeft;
  }
}
document.getElementById('fSessions').textContent=focusSessions;
function setFocusMode(mins,label,btn){
  if(focusRunning)return;
  document.querySelectorAll('.fmode-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  focusDuration=mins*60;focusLeft=focusDuration;
  document.getElementById('fMode').textContent=label;
  saveFocusState();updateFocusDisplay();
}
function setCustomFocus(){
  const input=document.getElementById('customFocusMins');
  const mins=Math.max(1,Math.min(180,parseInt(input?.value||'25',10)||25));
  if(input)input.value=mins;
  setFocusMode(mins,'CUSTOM',document.getElementById('customFocusBtn'));
}
function updateFocusDisplay(){
  const m=String(Math.floor(focusLeft/60)).padStart(2,'0');const s=String(focusLeft%60).padStart(2,'0');
  document.getElementById('fTime').textContent=`${m}:${s}`;
  const circ=2*Math.PI*66;const offset=circ*(1-focusLeft/focusDuration);
  document.getElementById('fRing').style.strokeDashoffset=offset;
}
function saveFocusState(){
  localStorage.setItem('hsrFocusState',JSON.stringify({duration:focusDuration,left:focusLeft,running:focusRunning,startedAt:focusRunning?focusStartedAt:null,mode:document.getElementById('fMode')?.textContent||'FOCUS'}));
}
function recordFocusSession(){
  const day=todayStr();
  focusHistory[day]=focusHistory[day]||[];
  focusHistory[day].push({completedAt:nowISO(),duration:focusDuration});
  localStorage.setItem('hsrFocusHistory',JSON.stringify(focusHistory));
  focusSessions=focusHistory[day].length;
  localStorage.setItem('hsrFocusSes',focusSessions);
  document.getElementById('fSessions').textContent=focusSessions;
}
function completeFocusSession(){
  clearInterval(focusInterval);focusRunning=false;focusLeft=0;
  document.getElementById('fStartBtn').textContent='▶ Start';
  recordFocusSession();saveFocusState();updateFocusDisplay();
  gainXP(25);if(typeof earnJade==='function')earnJade(25,'Focus session complete');
  sendLocalNotification('Focus session complete','You earned 25 XP.');
  toast('Focus session complete. +25 XP');
}
function tickFocus(){
  if(!focusRunning)return;
  const elapsed=Math.floor((Date.now()-focusStartedAt)/1000);
  focusLeft=Math.max(0,focusBaseLeft-elapsed);
  updateFocusDisplay();saveFocusState();
  if(focusLeft<=0)completeFocusSession();
}
function toggleFocus(){
  if(focusRunning){clearInterval(focusInterval);focusRunning=false;focusStartedAt=null;focusBaseLeft=null;document.getElementById('fStartBtn').textContent='▶ Resume';saveFocusState();return;}
  focusRunning=true;focusStartedAt=Date.now();focusBaseLeft=focusLeft;document.getElementById('fStartBtn').textContent='⏸ Pause';
  saveFocusState();tickFocus();focusInterval=setInterval(tickFocus,1000);
}
function resetFocus(){clearInterval(focusInterval);focusRunning=false;focusLeft=focusDuration;
  focusStartedAt=null;focusBaseLeft=null;document.getElementById('fStartBtn').textContent='▶ Start';saveFocusState();updateFocusDisplay();}
if(focusRunning){document.getElementById('fStartBtn').textContent='⏸ Pause';focusInterval=setInterval(tickFocus,1000);}
updateFocusDisplay();

// ── Daily snapshot logger ─────────────────────────────────────────────────
// Runs once per day on page load. Saves a lightweight record of today's
// stats so the XP chart and heatmap can show REAL historical trends.
function logDailySnapshot(){
  const todayKey=fmt(new Date());
  let snapshots=JSON.parse(localStorage.getItem('hsrSnaps')||'{}');
  // Always overwrite today's record so it stays fresh
  snapshots[todayKey]={
    xp,
    tasksDone:tasks.filter(t=>t.done&&!t.archived).length,
    tasksTotal:tasks.filter(t=>!t.archived).length,
    habitsChecked:habits.reduce((s,h)=>s+Object.keys(h.historyByDate||{}).filter(k=>k>=addDays(todayKey,-6)&&k<=todayKey).length,0),
    habitsTotal:habits.filter(h=>!h.archived).length*7,
    journalCount:journal.length,
    focusSessions:(focusHistory[todayKey]||[]).length
  };
  // Keep only last 30 days
  const keys=Object.keys(snapshots).sort();
  if(keys.length>30)keys.slice(0,keys.length-30).forEach(k=>delete snapshots[k]);
  localStorage.setItem('hsrSnaps',JSON.stringify(snapshots));
}

function renderAnalytics(){
  logDailySnapshot();

  drawTaskChart();
  drawXpChart();
  drawHabitRings();
  drawPrioChart();
  drawJournalStreak();

}

function drawTaskChart(){
  const canvas=document.getElementById('taskChart');const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth||500;canvas.height=180;ctx.clearRect(0,0,canvas.width,canvas.height);
  const visibleTasks=tasks.filter(t=>!t.archived);
  const cats=['Normal','Urgent','Critical'];const colors=['rgba(103,232,249,0.7)','rgba(251,146,60,0.7)','rgba(248,113,113,0.7)'];
  const borderColors=['#67e8f9','#fb923c','#f87171'];
  const allD=[visibleTasks.filter(t=>t.priority==='low'&&t.done).length,visibleTasks.filter(t=>t.priority==='med'&&t.done).length,visibleTasks.filter(t=>t.priority==='high'&&t.done).length];
  const allT=[visibleTasks.filter(t=>t.priority==='low').length,visibleTasks.filter(t=>t.priority==='med').length,visibleTasks.filter(t=>t.priority==='high').length];
  const W=canvas.width,H=canvas.height,pad=36,bw=Math.min(60,Math.floor((W-pad*2)/cats.length*0.55));
  const gap=(W-pad*2-bw*cats.length)/(cats.length+1);
  const maxV=Math.max(...allT,1);
  ctx.fillStyle='rgba(255,255,255,0.04)';
  for(let g=0;g<=4;g++){const y=pad+(H-pad*2)/4*g;ctx.fillRect(pad,y,W-pad*2,1);}
  cats.forEach((c,i)=>{
    const x=pad+gap+(bw+gap)*i;const bh=(allT[i]/maxV)*(H-pad*2);const dh=(allD[i]/maxV)*(H-pad*2);
    ctx.fillStyle='rgba(255,255,255,0.06)';ctx.beginPath();ctx.roundRect(x,H-pad-bh,bw,bh,3);ctx.fill();
    ctx.fillStyle=colors[i];ctx.beginPath();ctx.roundRect(x,H-pad-dh,bw,dh,3);ctx.fill();
    ctx.strokeStyle=borderColors[i];ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x,H-pad-dh,bw,dh,3);ctx.stroke();
    ctx.fillStyle='rgba(221,238,255,0.7)';ctx.font=`bold 11px Rajdhani,sans-serif`;ctx.textAlign='center';
    ctx.fillText(c,x+bw/2,H-8);
    ctx.fillStyle=borderColors[i];ctx.font=`bold 13px Cinzel,serif`;
    ctx.fillText(`${allD[i]}/${allT[i]}`,x+bw/2,H-pad-bh-6);
  });
  ctx.fillStyle='rgba(104,136,176,0.5)';ctx.font='9px Rajdhani,sans-serif';ctx.textAlign='left';
  ctx.fillText('DONE / TOTAL',pad,pad-8);
}

function drawXpChart(){
  const canvas=document.getElementById('xpChart');const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth||500;canvas.height=180;ctx.clearRect(0,0,canvas.width,canvas.height);
  const W=canvas.width,H=canvas.height,pad=36;
  // Use real snapshots
  const snapshots=JSON.parse(localStorage.getItem('hsrSnaps')||'{}');
  const keys=Object.keys(snapshots).sort();
  // Always include today even if just logged
  const todayKey=fmt(new Date());
  if(!keys.includes(todayKey))keys.push(todayKey);
  const pts=keys.map(k=>snapshots[k]?snapshots[k].xp:xp);
  if(pts.length<2){
    ctx.fillStyle='rgba(104,136,176,0.4)';ctx.font='13px Rajdhani,sans-serif';ctx.textAlign='center';
    ctx.fillText('Come back tomorrow to see your XP growth!',W/2,H/2);
    ctx.fillStyle='rgba(104,136,176,0.25)';ctx.font='10px Rajdhani,sans-serif';
    ctx.fillText(`Today: ${xp} XP`,W/2,H/2+20);
    return;
  }
  const maxV=Math.max(...pts,1);
  const xStep=(W-pad*2)/(pts.length-1);
  for(let g=0;g<=4;g++){const y=pad+(H-pad*2)/4*g;ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fillRect(pad,y,W-pad*2,1);}
  // Fill
  ctx.beginPath();ctx.moveTo(pad,H-pad-(pts[0]/maxV)*(H-pad*2));
  pts.forEach((v,i)=>{if(i===0)return;ctx.lineTo(pad+xStep*i,H-pad-(v/maxV)*(H-pad*2));});
  ctx.lineTo(pad+xStep*(pts.length-1),H-pad);ctx.lineTo(pad,H-pad);ctx.closePath();
  const grad=ctx.createLinearGradient(0,pad,0,H-pad);grad.addColorStop(0,'rgba(232,201,107,0.28)');grad.addColorStop(1,'rgba(232,201,107,0.01)');ctx.fillStyle=grad;ctx.fill();
  // Line
  ctx.beginPath();ctx.moveTo(pad,H-pad-(pts[0]/maxV)*(H-pad*2));
  pts.forEach((v,i)=>{if(i===0)return;ctx.lineTo(pad+xStep*i,H-pad-(v/maxV)*(H-pad*2));});
  ctx.strokeStyle='rgba(232,201,107,0.9)';ctx.lineWidth=2;ctx.stroke();
  // Dots + date labels
  pts.forEach((v,i)=>{
    const x=pad+xStep*i;const y=H-pad-(v/maxV)*(H-pad*2);
    ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle='#e8c96b';ctx.fill();
    if(i===0||i===pts.length-1){
      const d=new Date(keys[i]+'T12:00:00');
      const lbl=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      ctx.fillStyle='rgba(104,136,176,0.6)';ctx.font='9px Rajdhani,sans-serif';ctx.textAlign='center';
      ctx.fillText(lbl,x,H-4);
    }
  });
  ctx.fillStyle='rgba(104,136,176,0.5)';ctx.font='9px Rajdhani,sans-serif';ctx.textAlign='left';ctx.fillText('XP OVER TIME (REAL DATA)',pad,pad-8);
}

function drawHabitRings(){
  const el=document.getElementById('habitRings');
  const activeHabits=habits.filter(h=>!h.archived);
  const weekDates=getHabitWeekDates();
  if(!activeHabits.length){el.innerHTML=`<div class="empty"><span class="empty-i">${icon('moon')}</span>No habits tracked yet.</div>`;refreshIcons();return;}
  el.innerHTML=activeHabits.map(h=>{
    const cnt=weekDates.filter(d=>h.historyByDate&&h.historyByDate[d]).length;const pct=Math.round(cnt/7*100);
    const r=18;const circ=2*Math.PI*r;const offset=circ*(1-cnt/7);
    const col=cnt>=6?'#4ade80':cnt>=4?'#e8c96b':cnt>=2?'#5eb4f5':'#6888b0';
    return `<div class="habit-ring-row">
      <svg class="habit-ring-svg" width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 24 24)"/>
        <text x="24" y="28" text-anchor="middle" font-family="Cinzel,serif" font-size="11" font-weight="700" fill="${col}">${cnt}/7</text>
      </svg>
      <div class="habit-ring-info">
        <div class="hri-name">${esc(h.name)}</div>
        <div class="hri-bar"><div class="hri-fill" style="width:${pct}%;background:linear-gradient(90deg,${col}88,${col})"></div></div>
      </div>
      <div class="hri-pct">${pct}%</div>
    </div>`;
  }).join('');
}


function drawPrioChart(){
  const canvas=document.getElementById('prioChart');const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth||220;canvas.height=200;ctx.clearRect(0,0,canvas.width,canvas.height);
  const W=canvas.width,H=canvas.height;
  const visibleTasks=tasks.filter(t=>!t.archived);
  const vals=[visibleTasks.filter(t=>t.priority==='low').length,visibleTasks.filter(t=>t.priority==='med').length,visibleTasks.filter(t=>t.priority==='high').length];
  const total=vals.reduce((a,b)=>a+b,0);
  if(!total){ctx.fillStyle='rgba(104,136,176,0.4)';ctx.font='12px Rajdhani,sans-serif';ctx.textAlign='center';ctx.fillText('No tasks yet!',W/2,H/2);return;}
  const colors=['#67e8f9','#fb923c','#f87171'];const labels=['Normal','Urgent','Critical'];
  const cx=W/2,cy=H/2-10,r=Math.min(W,H)/2-30;
  let start=0;
  vals.forEach((v,i)=>{if(!v)return;
    const angle=(v/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,start+angle);ctx.closePath();
    ctx.fillStyle=colors[i]+'bb';ctx.fill();
    ctx.strokeStyle=colors[i];ctx.lineWidth=2;ctx.stroke();
    const mid=start+angle/2;const lx=cx+Math.cos(mid)*(r*0.65);const ly=cy+Math.sin(mid)*(r*0.65);
    ctx.fillStyle='#fff';ctx.font='bold 12px Cinzel,serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(v,lx,ly);
    start+=angle;
  });
  // Legend
  labels.forEach((l,i)=>{const ly=H-28+(i-1)*14;ctx.fillStyle=colors[i];ctx.fillRect(8,ly-5,10,10);
    ctx.fillStyle='rgba(221,238,255,0.7)';ctx.font='10px Rajdhani,sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(l,22,ly);});
}

function drawJournalStreak(){
  const el=document.getElementById('journalStreak');
  if(!journal.length){el.innerHTML=`<div class="empty"><span class="empty-i">${icon('book-open')}</span>No journal entries yet.</div>`;refreshIcons();return;}
  const stats=`<div class="js-hd">
    <div class="js-stat"><div class="js-sv">${journal.length}</div><div class="js-sl">Entries</div></div>
    <div class="js-stat"><div class="js-sv" style="color:var(--purple)">${Math.round(journal.reduce((s,e)=>s+(e.text?.length||0),0)/journal.length)}</div><div class="js-sl">Avg Length</div></div>
    <div class="js-stat"><div class="js-sv" style="color:var(--green)">${journal.length*15}</div><div class="js-sl">XP Earned</div></div>
  </div>`;
  const timeline=`<div class="js-timeline">${[...journal].reverse().slice(0,8).map(e=>`
    <div class="js-entry">
      <div class="js-dot"></div>
      <div class="js-date">${e.date?.slice(0,10)||'Unknown'}</div>
      <div class="js-preview">${e.text?.slice(0,80)||''}</div>
    </div>`).join('')}</div>`;
  el.innerHTML=stats+timeline;
}

// ═══ SETTINGS ═══
let pendingConfirmAction=null;
const HABIT_TEMPLATES=[
  {name:'Morning Meditation',ico:'sunrise'},
  {name:'Daily Exercise',ico:'dumbbell'},
  {name:'Read for 30 min',ico:'book-open'},
  {name:'Drink 8 glasses of water',ico:'droplets'},
  {name:'Journal Entry',ico:'notebook-pen'},
  {name:'No social media before noon',ico:'bell-off'},
  {name:'10,000 steps',ico:'footprints'},
  {name:'Practice gratitude',ico:'flower-2'},
];

function showSettingsPanel(id,el){
  document.querySelectorAll('.settings-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.snav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sp-'+id)?.classList.add('active');
  if(el)el.classList.add('active');
  if(id==='data') updateStorageStats();
  if(id==='profile') updateProfilePanel();
  if(id==='prefs') updateNotificationStatus();
}

function initSettings(){
  const prefs=getPrefs();
  const setChecked=(id,val)=>{const el=document.getElementById(id);if(el)el.checked=!!val;};
  setChecked('togQuote',prefs.showQuote!==false);
  setChecked('togDueToday',prefs.showDueToday!==false);
  setChecked('togStars',prefs.showStars!==false);
  setChecked('togCompact',prefs.compactTasks===true);
  setChecked('togNotifications',prefs.notifications===true);
  const savedName=localStorage.getItem('hsrName')||'';
  const profileName=document.getElementById('profileName');
  if(profileName)profileName.value=savedName;
  const savedTheme=localStorage.getItem('hsrXpTheme')||'gold';
  document.querySelectorAll('.theme-swatch').forEach(s=>{
    s.classList.toggle('active',s.dataset.theme===savedTheme);
  });
  updateProfilePanel();updateNotificationStatus();
}


function updateProfilePanel(){
  const lv=lvOf(xp);
  document.getElementById('sLvDisplay').textContent=lv;
  document.getElementById('sXpDisplay').textContent=xp;
  const done=tasks.filter(t=>t.done&&!t.archived).length;
  const total=tasks.filter(t=>!t.archived).length;
  const maxStr=habits.reduce((m,h)=>Math.max(m,calcStreak(h)),0);
  const summary=document.getElementById('profileSummary');
  if(summary)summary.textContent=`${done}/${total} missions complete · ${maxStr}-day best active ritual streak · ${(focusHistory[todayStr()]||[]).length} focus sessions today`;
}

function getPrefs(){
  try{return JSON.parse(localStorage.getItem('hsrPrefs')||'{}')}catch(e){return {};}
}
function savePref(key,val){
  const p=getPrefs();p[key]=val;localStorage.setItem('hsrPrefs',JSON.stringify(p));
  if(key==='notifications')scheduleReminderCheck();
}
function toggleStarfield(on){
  const el=document.getElementById('starfield');if(el)el.style.display=on?'':'none';
  savePref('showStars',on);
}
function toggleCompact(on){
  savePref('compactTasks',on);
  document.querySelectorAll('.ti').forEach(el=>el.style.padding=on?'6px 10px':'');
}
function saveProfileName(){
  const n=document.getElementById('profileName').value.trim();
  localStorage.setItem('hsrName',n);
  const el=document.querySelector('.nav-title');
  if(n&&el)el.textContent=n+' — Tracker';
  toast('Name updated: '+n);
}
function setXpTheme(theme,el){
  document.querySelectorAll('.theme-swatch').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  localStorage.setItem('hsrXpTheme',theme);
  const fills={gold:'linear-gradient(90deg,#8a5c00,#b8952a,#e8c96b,#f7e8b0)',blue:'linear-gradient(90deg,#1a3a8a,#2a6ab5,#5eb4f5,#a8d4f8)',purple:'linear-gradient(90deg,#4a1a7a,#8a3acc,#c084fc,#e0b0ff)',green:'linear-gradient(90deg,#0a3a1a,#1a7a3a,#4ade80,#a0ffc0)',red:'linear-gradient(90deg,#5a0a0a,#9a1a1a,#f87171,#ffa0a0)'};
  document.getElementById('lvFill').style.background=fills[theme]||fills.gold;
}

function updateStorageStats(){
  let total=0;const breakdown={tasks:0,habits:0,journal:0,calendar:0,xp:0,other:0};
  for(let k in localStorage){
    if(!localStorage.hasOwnProperty(k))continue;
    const bytes=((localStorage.getItem(k)||'').length+k.length)*2;
    total+=bytes;
    if(k==='hsrT3')breakdown.tasks=bytes;
    else if(k==='hsrH3')breakdown.habits=bytes;
    else if(k==='hsrJ3')breakdown.journal=bytes;
    else if(k==='hsrCal')breakdown.calendar=bytes;
    else if(k==='hsrX3')breakdown.xp=bytes;
    else breakdown.other+=bytes;
  }
  const maxBytes=5*1024*1024;
  const pct=Math.min((total/maxBytes)*100,100);
  document.getElementById('storageFill').style.width=pct+'%';
  function fmtBytes(b){return b>1024?(b/1024).toFixed(1)+' KB':b+' B';}
  document.getElementById('storageUsed').textContent=fmtBytes(total)+' used ('+pct.toFixed(2)+'%)';
  const bd=document.getElementById('storageBreakdown');
  const items=[
    {label:'Tasks',val:breakdown.tasks,col:'var(--gold)'},
    {label:'Habits',val:breakdown.habits,col:'var(--blue-star)'},
    {label:'Journal',val:breakdown.journal,col:'var(--purple)'},
    {label:'Calendar',val:breakdown.calendar,col:'var(--green)'},
  ];
  bd.innerHTML=items.map(i=>`
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-glow);border-radius:8px;padding:12px;text-align:center;">
      <div style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:${i.col};margin-bottom:4px;">${fmtBytes(i.val)}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:9px;color:var(--text-muted);letter-spacing:2px;text-transform:uppercase;">${i.label}</div>
    </div>`).join('');
}

function exportData(){
  const data={version:2,exported:new Date().toISOString(),tasks,habits,journal,xp,events,jade,ownedItems,equippedItems,prefs:getPrefs(),focusHistory,focusState:safeJson('hsrFocusState',null)};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='trailblaze-tracker-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();toast('Data exported successfully.');
}
function exportTasksTxt(){
  const lines=['TRAILBLAZE TRACKER — TASK LIST','Exported: '+new Date().toLocaleDateString(),'','ACTIVE MISSIONS:',''];
  const active=tasks.filter(t=>!t.done&&!t.archived);const done=tasks.filter(t=>t.done&&!t.archived);
  active.forEach(t=>lines.push(`[ ] [${(t.priority||'low').toUpperCase()}] ${t.text}${t.due?' (due '+t.due+')':''}${t.recurrence&&t.recurrence!=='none'?' ['+t.recurrence+']':''}`));
  if(done.length){lines.push('','COMPLETED MISSIONS:','');done.forEach(t=>lines.push(`[✓] [${(t.priority||'low').toUpperCase()}] ${t.text}`));}
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='trailblaze-tasks-'+new Date().toISOString().slice(0,10)+'.txt';a.click();
  toast('Tasks exported as text.');
}
function importData(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      pendingImportData=validateImportData(data);
      openImportChoice();
    }catch(err){toast('Invalid backup file.');}
  };
  reader.readAsText(file);input.value='';
}
function validateImportData(data){
  if(!data||typeof data!=='object')throw new Error('Invalid backup');
  return{
    version:data.version||1,
    tasks:Array.isArray(data.tasks)?data.tasks.map(normalizeTask):[],
    habits:Array.isArray(data.habits)?data.habits.map(normalizeHabit):[],
    journal:Array.isArray(data.journal)?data.journal.map(normalizeJournalEntry):[],
    events:Array.isArray(data.events)?data.events.map(normalizeEvent):[],
    xp:typeof data.xp==='number'?data.xp:0,
    jade:typeof data.jade==='number'?data.jade:0,
    ownedItems:Array.isArray(data.ownedItems)?data.ownedItems:[],
    equippedItems:data.equippedItems&&typeof data.equippedItems==='object'?data.equippedItems:{},
    prefs:data.prefs&&typeof data.prefs==='object'?data.prefs:{},
    focusHistory:data.focusHistory&&typeof data.focusHistory==='object'?data.focusHistory:{},
  };
}
function openImportChoice(){
  const count=(pendingImportData.tasks?.length||0)+(pendingImportData.habits?.length||0)+(pendingImportData.journal?.length||0)+(pendingImportData.events?.length||0);
  const summary=document.getElementById('importSummary');
  if(summary)summary.textContent=`Backup version ${pendingImportData.version} · ${count} records found.`;
  openDialog(document.getElementById('importOverlay'),document.getElementById('importMergeBtn'));
}
function closeImportChoice(){pendingImportData=null;closeDialog(document.getElementById('importOverlay'));}
function mergeUniqueById(current,incoming){
  const map=new Map(current.map(item=>[item.id,item]));
  incoming.forEach(item=>map.set(item.id,item));
  return [...map.values()];
}
function mergeJournal(current,incoming){
  const seen=new Set(current.map(e=>`${e.createdAt}|${e.text}`));
  incoming.forEach(e=>{const key=`${e.createdAt}|${e.text}`;if(!seen.has(key)){current.push(e);seen.add(key);}});
  return current;
}
function executeImport(mode){
  if(!pendingImportData)return;
  if(mode==='replace'){
    tasks=pendingImportData.tasks;habits=pendingImportData.habits;journal=pendingImportData.journal;events=pendingImportData.events;
    xp=pendingImportData.xp;jade=pendingImportData.jade;ownedItems=pendingImportData.ownedItems.length?pendingImportData.ownedItems:['badge_pathfinder'];equippedItems=pendingImportData.equippedItems;focusHistory=pendingImportData.focusHistory;
  }else{
    tasks=mergeUniqueById(tasks,pendingImportData.tasks);
    habits=mergeUniqueById(habits,pendingImportData.habits);
    journal=mergeJournal(journal,pendingImportData.journal);
    events=mergeUniqueById(events,pendingImportData.events);
    xp+=pendingImportData.xp;
    jade+=pendingImportData.jade;
    ownedItems=[...new Set([...ownedItems,...pendingImportData.ownedItems])];
    equippedItems={...equippedItems,...pendingImportData.equippedItems};
    focusHistory={...focusHistory,...pendingImportData.focusHistory};
  }
  localStorage.setItem('hsrX3',xp);localStorage.setItem('hsrJade',jade);localStorage.setItem('hsrFocusHistory',JSON.stringify(focusHistory));localStorage.setItem('hsrPrefs',JSON.stringify({...getPrefs(),...pendingImportData.prefs}));
  saveShopData();save();saveAll();updLv();updateJadeDisplay();renderTasks();renderHabits();renderJournal();render();renderShop();closeImportChoice();toast('Backup imported.');
}


// Confirm/danger actions
function confirmAction(action,title,desc){
  pendingConfirmAction=action;
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmDesc').textContent=desc;
  openDialog(document.getElementById('confirmOverlay'),document.getElementById('confirmOkBtn'));
}
function executeConfirm(){
  closeDialog(document.getElementById('confirmOverlay'));
  switch(pendingConfirmAction){
    case 'clearDone':
      tasks=tasks.filter(t=>!t.done);if(typeof events!=='undefined')events=events.filter(e=>!e.taskId||tasks.some(t=>t.id===e.taskId));save();saveAll();renderTasks();toast('Completed missions cleared.');break;
    case 'resetHabitWeek':
      const dates=getHabitWeekDates();habits.forEach(h=>dates.forEach(d=>{if(h.historyByDate)delete h.historyByDate[d];}));save();renderHabits();toast('Habit week reset.');break;
    case 'wipeTasks':
      tasks=[];if(typeof events!=='undefined')events=events.filter(e=>!e.taskId);save();saveAll();renderTasks();toast('All tasks wiped.');break;
    case 'wipeHabits':
      habits=[];save();renderHabits();toast('All habits wiped.');break;
    case 'wipeJournal':
      journal=[];save();renderJournal();toast('Journal cleared.');break;
    case 'nukeAll':
      localStorage.clear();location.reload();break;
  }
  updateProfilePanel();
}
function updateNotificationStatus(){
  const status=document.getElementById('notificationStatus');
  const btn=document.getElementById('notificationBtn');
  if(!status)return;
  if(!('Notification' in window)){
    status.textContent='Browser notifications are not supported here.';
    if(btn)btn.disabled=true;
    return;
  }
  status.textContent=`Permission: ${Notification.permission}. Reminders: ${getPrefs().notifications?'on':'off'}.`;
  if(btn)btn.textContent=Notification.permission==='granted'?'Notifications On':'Enable Notifications';
}
function requestNotificationPermission(){
  if(!('Notification' in window)){toast('Notifications are not supported.');return;}
  Notification.requestPermission().then(permission=>{
    savePref('notifications',permission==='granted');
    updateNotificationStatus();
    toast(permission==='granted'?'Notifications enabled.':'Notifications not enabled.');
  });
}
function sendLocalNotification(title,body){
  if(!getPrefs().notifications||!('Notification' in window)||Notification.permission!=='granted')return;
  try{new Notification(title,{body,tag:'trailblaze-tracker'});}catch(e){}
}
function reminderDueAt(event){
  if(!event.date||!event.time)return null;
  return new Date(`${event.date}T${event.time}`).getTime();
}
function checkReminders(){
  const prefs=getPrefs();
  if(!prefs.notifications)return;
  const now=Date.now();
  tasks.forEach(task=>{
    if(task.done||task.archived||!task.reminderAt||task.lastNotifiedAt)return;
    if(new Date(task.reminderAt).getTime()<=now){
      sendLocalNotification('Mission reminder',task.text);
      task.lastNotifiedAt=nowISO();
    }
  });
  events.forEach(event=>{
    const due=reminderDueAt(event);
    if(!due||event.lastNotifiedAt||due>now)return;
    if(now-due<60*60*1000){
      sendLocalNotification('Calendar event',event.title);
      event.lastNotifiedAt=nowISO();
    }
  });
  localStorage.setItem('hsrT3',JSON.stringify(tasks));
  saveAll();
}
function scheduleReminderCheck(){
  clearInterval(reminderTimer);
  reminderTimer=setInterval(checkReminders,30000);
}
function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing)return;
    refreshing=true;
    if(sessionStorage.getItem('trailblaze-sw-v4-reloaded'))return;
    sessionStorage.setItem('trailblaze-sw-v4-reloaded','1');
    location.reload();
  });
  navigator.serviceWorker.register('sw.js?v=4',{updateViaCache:'none'}).then(reg=>{
    reg.update?.();
    if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          worker.postMessage({type:'SKIP_WAITING'});
        }
      });
    });
  }).catch(()=>{});
}
function applyHashRoute(){
  const page=(location.hash||'').replace('#','');
  if(['dashboard','calendar','analytics','about','settings','shop'].includes(page))showPage(page);
}
render();

// ═══════════════════════════════════════
// JADE CURRENCY & SHOP
// ═══════════════════════════════════════
let jade = parseInt(localStorage.getItem('hsrJade') || '0');

function updateJadeDisplay(){
  const nj = document.getElementById('navJadeCount');
  if(nj) nj.textContent = jade.toLocaleString();
  const bv = document.getElementById('shopBalanceVal');
  if(bv) bv.textContent = jade.toLocaleString();
}
function earnJade(amount, reason){
  jade += amount;
  localStorage.setItem('hsrJade', jade);
  updateJadeDisplay();
  toast('+' + amount + ' Jade — ' + reason);
}
function spendJade(amount){
  if(jade < amount) return false;
  jade -= amount;
  localStorage.setItem('hsrJade', jade);
  updateJadeDisplay();
  return true;
}

const SHOP_ITEMS = [
  {id:'title_nameless',cat:'titles',name:'The Nameless One',desc:'The legendary title of the Trailblazer. A name beyond names.',price:150,icon:'star',bg:'rgba(232,201,107,0.15)',isNew:true},
  {id:'title_express',cat:'titles',name:'Express Crew',desc:'A trusted member of the Astral Express. Ride eternal.',price:200,icon:'train-front',bg:'rgba(94,180,245,0.15)'},
  {id:'title_void',cat:'titles',name:'Void Walker',desc:'One who traverses the space between stars.',price:300,icon:'orbit',bg:'rgba(192,132,252,0.15)'},
  {id:'title_aeon',cat:'titles',name:'Aeon Touched',desc:'Blessed by the Aeons themselves. Rare beyond measure.',price:500,icon:'sparkles',bg:'rgba(232,201,107,0.2)'},
  {id:'theme_luofu',cat:'themes',name:'Luofu Jade',desc:'The celestial jade theme of the Xianzhou Luofu.',price:250,icon:'gem',bg:'rgba(103,232,192,0.2)'},
  {id:'theme_belobog',cat:'themes',name:'Belobog Frost',desc:'Icy white and silver from the eternal frozen city.',price:250,icon:'snowflake',bg:'rgba(168,212,248,0.2)'},
  {id:'theme_penacony',cat:'themes',name:'Penacony Dream',desc:'The dreamlike pink hues of the Land of Dreams.',price:300,icon:'flower-2',bg:'rgba(248,113,163,0.2)',isNew:true},
  {id:'theme_IPC',cat:'themes',name:'IPC Gold',desc:'The prestigious gold of the Interastral Peace Corporation.',price:400,icon:'coins',bg:'rgba(232,201,107,0.25)'},
  {id:'badge_pathfinder',cat:'badges',name:'Pathfinder',desc:'Awarded to those who completed their very first mission.',price:0,icon:'map',bg:'rgba(74,222,128,0.15)'},
  {id:'badge_streak7',cat:'badges',name:'Seven Stars',desc:'Maintained a 7-day habit streak without breaking.',price:100,icon:'flame',bg:'rgba(251,146,60,0.15)'},
  {id:'badge_scholar',cat:'badges',name:'Star Scholar',desc:'Wrote 10 journal entries. A chronicler of the cosmos.',price:150,icon:'book-open',bg:'rgba(94,180,245,0.15)'},
  {id:'badge_sovereign',cat:'badges',name:'Aeonic Sovereign',desc:'The rarest badge. Reach Level 10 on the Trailblaze path.',price:1000,icon:'crown',bg:'rgba(232,201,107,0.25)'},
  {id:'fx_aurora',cat:'effects',name:'Aurora Starfield',desc:'Replaces the starfield with a shimmering aurora effect.',price:350,icon:'waves',bg:'rgba(103,232,192,0.15)',isNew:true},
  {id:'fx_meteor',cat:'effects',name:'Meteor Shower',desc:'More frequent shooting stars across the cosmos.',price:200,icon:'zap',bg:'rgba(255,255,255,0.08)'},
  {id:'fx_nebula',cat:'effects',name:'Deep Nebula',desc:'Rich purple and blue nebula clouds across the background.',price:275,icon:'cloud',bg:'rgba(192,132,252,0.15)'},
];

let ownedItems = JSON.parse(localStorage.getItem('hsrOwned') || '["badge_pathfinder"]');
let equippedItems = JSON.parse(localStorage.getItem('hsrEquipped') || '{}');

function saveShopData(){
  localStorage.setItem('hsrOwned', JSON.stringify(ownedItems));
  localStorage.setItem('hsrEquipped', JSON.stringify(equippedItems));
}
function isOwned(id){ return ownedItems.includes(id); }
function isEquipped(id){ return Object.values(equippedItems).includes(id); }

function buyItem(id){
  const item = SHOP_ITEMS.find(i=>i.id===id); if(!item) return;
  if(isOwned(id)){ equipItem(id); return; }
  if(!spendJade(item.price)){ toast('Not enough Jade.'); return; }
  ownedItems.push(id); saveShopData(); renderShop();
  toast(item.name + ' unlocked.');
}
function equipItem(id){
  const item = SHOP_ITEMS.find(i=>i.id===id); if(!item||!isOwned(id)) return;
  equippedItems[item.cat] = id; saveShopData(); applyEquipped(); renderShop();
  toast(item.name + ' equipped.');
}
function applyEquipped(){
  const titleId = equippedItems['titles'];
  if(titleId){ const t=SHOP_ITEMS.find(i=>i.id===titleId); const el=document.querySelector('.nav-title'); const n=localStorage.getItem('hsrName')||'Trailblazer'; if(t&&el) el.textContent=n+' · '+t.name; }
  const fxId = equippedItems['effects'];
  const sf = document.getElementById('starfield');
  if(sf){
  if(fxId==='fx_aurora'){
    const ac=document.getElementById('auroraCanvas');
    if(ac) ac.remove();
    const sf=document.getElementById('starfield');
    if(sf){
      sf.style.background='radial-gradient(ellipse 120% 40% at 0% 30%,rgba(103,232,192,0.3) 0%,transparent 60%),radial-gradient(ellipse 100% 40% at 100% 60%,rgba(192,132,252,0.28) 0%,transparent 60%),radial-gradient(ellipse 80% 30% at 50% 80%,rgba(94,180,245,0.2) 0%,transparent 60%),#04091a';
      sf.style.animation='auroraShift 8s ease-in-out infinite alternate';
    }
    if(!document.getElementById('auroraStyle')){
      const style=document.createElement('style');
      style.id='auroraStyle';
      style.textContent='@keyframes auroraShift{0%{filter:hue-rotate(0deg) brightness(1);}50%{filter:hue-rotate(30deg) brightness(1.2);}100%{filter:hue-rotate(-20deg) brightness(0.9);}}';
      document.head.appendChild(style);
    }
  } else {
    const ac=document.getElementById('auroraCanvas');
    if(ac) ac.remove();
    const as=document.getElementById('auroraStyle');
    if(as) as.remove();
    const sf=document.getElementById('starfield');
    if(sf){ sf.style.animation=''; }
    if(sf && fxId==='fx_nebula') sf.style.background='radial-gradient(ellipse 70% 50% at 15% 15%,rgba(192,132,252,0.35) 0%,transparent 65%),radial-gradient(ellipse 55% 45% at 85% 75%,rgba(94,180,245,0.35) 0%,transparent 65%),radial-gradient(ellipse 40% 60% at 50% 40%,rgba(8,18,60,0.6) 0%,transparent 100%),#04091a';
    if(fxId==='fx_meteor') document.querySelectorAll('.shoot').forEach(s=>s.style.animationDuration='3s');
  }
  }
  const themeId = equippedItems['themes'];
  const themes = {
    theme_luofu:{'--gold':'#67e8c0','--gold-dark':'#2a9e7a','--gold-light':'#a0fff0'},
    theme_belobog:{'--gold':'#a8d4f8','--gold-dark':'#4a8ab5','--gold-light':'#e0f0ff'},
    theme_penacony:{'--gold':'#f8a8c8','--gold-dark':'#b54a7a','--gold-light':'#ffe0f0'},
    theme_IPC:{'--gold':'#e8c96b','--gold-dark':'#b8952a','--gold-light':'#f7e8b0'}
  };
  if(themeId && themes[themeId]) Object.entries(themes[themeId]).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
}

let activeShopTab = 'titles';
function setShopTab(tab){
  activeShopTab = tab;
  document.querySelectorAll('.shop-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  renderShop();
}
function renderShop(){
  updateJadeDisplay();
  const grid = document.getElementById('shopGrid'); if(!grid) return;
  const items = SHOP_ITEMS.filter(i=>i.cat===activeShopTab);
  grid.innerHTML = items.map(item=>{
    const owned=isOwned(item.id), equipped=isEquipped(item.id), canAfford=jade>=item.price;
    const badge = equipped?'<span class="shop-item-badge badge-equipped">Equipped</span>':owned?'<span class="shop-item-badge badge-owned">Owned</span>':item.isNew?'<span class="shop-item-badge badge-new">New</span>':'';
    const btn = equipped?'<button class="shop-buy-btn equipped-btn">Equipped</button>':owned?'<button class="shop-buy-btn equip-btn" onclick="equipItem(\''+item.id+'\')">Equip</button>':item.price===0?'<button class="shop-buy-btn can-buy" onclick="buyItem(\''+item.id+'\')">Claim Free</button>':'<button class="shop-buy-btn '+(canAfford?'can-buy':'cant-buy')+'" onclick="buyItem(\''+item.id+'\')">'+(canAfford?'Purchase':'Need Jade')+'</button>';
    const price = owned?'<span style="font-family:Rajdhani,sans-serif;font-size:11px;color:var(--green)">Unlocked</span>':item.price===0?'<span style="color:var(--jade);font-size:11px">Free</span>':'<div class="shop-item-price">'+icon('gem')+' '+item.price.toLocaleString()+'</div>';
    return '<div class="shop-item '+(owned?'owned':'')+' '+(equipped?'equipped':'')+'"><div class="shop-item-preview" style="background:'+item.bg+'">'+badge+icon(item.icon||'sparkles','shop-preview-icon')+'</div><div class="shop-item-info"><div class="shop-item-name">'+item.name+'</div><div class="shop-item-desc">'+item.desc+'</div><div class="shop-item-footer">'+price+btn+'</div></div></div>';
  }).join('');
  refreshIcons();
}

updateJadeDisplay();
applyEquipped();
scheduleReminderCheck();
checkReminders();
registerServiceWorker();
applyHashRoute();
window.addEventListener('hashchange',applyHashRoute);
