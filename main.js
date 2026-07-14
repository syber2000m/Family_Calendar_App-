// 일정 목록을 저장하는 배열 (변경될 때마다 localStorage에도 자동 저장됨)
// 각 항목: { id, text, completed, startDate, endDate, members } — "YYYY-MM-DD" 문자열, 하루짜리 일정은 startDate === endDate
// members는 구성원 이름 배열 (여러 명 중복 선택 가능)
let todos = [];

// 일정을 등록할 수 있는 가족 구성원과 표시용 이모지 + 구성원별 색상(그라데이션 시작/끝 색)
const FAMILY_MEMBERS = [
  { name: "엄마", emoji: "👩", color: "#ff6b9d", colorLight: "#ff9a9e" },
  { name: "아빠", emoji: "👨", color: "#2f80ed", colorLight: "#56ccf2" },
  { name: "승우", emoji: "👦", color: "#11998e", colorLight: "#38ef7d" },
  { name: "정우", emoji: "🧑", color: "#f2994a", colorLight: "#f2c94c" },
  { name: "창우", emoji: "🧒", color: "#9b51e0", colorLight: "#d291ff" },
];

// 새 일정에 부여할 고유 id 카운터
let nextId = 1;

// 빠른 추가/기간 추가 팝업에 사용할 날짜 범위 { start, end }
let quickAddRange = null;

// 메인 달력에서 클릭으로 지정한 기간 시작 날짜 (Ctrl+클릭으로 종료 날짜를 지정하기 전까지 임시 보관)
let rangeStartDate = null;

// 일정 내용 팝업을 띄운 날짜 ("일정 추가" 버튼을 눌렀을 때 어느 날짜에 추가할지 기억)
let dayDetailDate = null;

// 수정/삭제 팝업이 대상으로 하는 일정의 id (일정 텍스트를 더블클릭했을 때 지정됨)
let actionTodoId = null;

// 수정 중인 일정의 id (null이면 새 일정을 추가하는 것)
let editingTodoId = null;

// 구성원 선택 팝업에서 선택을 마치기 전까지 저장을 기다리는 일정 정보 { text, startDate, endDate }
let pendingMemberData = null;

// 구성원 선택 팝업에서 현재까지 선택된 구성원 이름 목록 (중복 선택 가능)
let selectedMembers = [];

// 목록/달력 필터링에 사용할, 현재 선택된 구성원 이름 목록 (비어 있으면 전체 표시)
let activeFilters = [];

// 메인 달력에 현재 표시 중인 연도/월(0-11) — 기본값은 오늘 날짜 기준, ◀/▶/월 선택으로 변경됨
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();

// 월 선택 팝업에서 현재 보여주고 있는 연도 (팝업 안의 ◀/▶로만 바뀌고, 달을 선택해야 실제로 이동함)
let monthPickerYear = viewYear;

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// localStorage에 저장할 때 사용하는 키
const STORAGE_KEY = "family-todo-app-data";

// 현재 todos/nextId를 localStorage에 저장하는 함수
function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, nextId }));
}

// localStorage에 저장된 todos/nextId를 불러오는 함수
function loadTodos() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    todos = parsed.todos || [];
    nextId = parsed.nextId || 1;
  } catch (e) {
    todos = [];
    nextId = 1;
  }
}

// "YYYY-MM-DD" 형태의 날짜 키를 만드는 함수
function formatDateKey(year, month, day) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// 두 날짜 키를 시간 순서대로 [빠른 날짜, 늦은 날짜]로 정렬하는 함수
function sortDateKeys(a, b) {
  return a <= b ? [a, b] : [b, a];
}

// "YYYY-MM-DD" 날짜 키에 일수를 더한(또는 뺀) 날짜 키를 반환하는 함수
function addDays(dateKey, delta) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

// "YYYY-MM-DD" 날짜 키에서 연도를 뺀 "MM-DD"를 반환하는 함수 (일정 목록 표시용)
function formatDateWithoutYear(dateKey) {
  return dateKey.slice(5);
}

// 동일한 텍스트 + 기간의 일정이 이미 있는지 확인하는 함수 (중복 등록 방지)
function isDuplicateTodo(text, startDate, endDate) {
  return todos.some((t) => t.text === text && t.startDate === startDate && t.endDate === endDate);
}

// 일정이 현재 활성화된 필터에 해당하는지 확인하는 함수 (필터가 없으면 항상 true)
function matchesActiveFilter(todo) {
  if (activeFilters.length === 0) return true;
  return getTodoMembers(todo).some((m) => activeFilters.includes(m));
}

// 구성원 이름에 해당하는 표시용 이모지를 반환하는 함수 (없으면 빈 문자열)
function getMemberEmoji(memberName) {
  const found = FAMILY_MEMBERS.find((m) => m.name === memberName);
  return found ? found.emoji : "";
}

// 구성원 이름에 해당하는 그라데이션 배경을 반환하는 함수 (구성원 정보가 없는 옛 일정은 기본 색상)
function getMemberGradient(memberName) {
  const found = FAMILY_MEMBERS.find((m) => m.name === memberName);
  if (!found) return "linear-gradient(135deg, #6a11cb, #a960ee)";
  return `linear-gradient(135deg, ${found.color}, ${found.colorLight})`;
}

// 일정의 구성원 목록을 반환하는 함수 (옛 데이터의 단수 member 필드도 함께 지원)
function getTodoMembers(todo) {
  if (Array.isArray(todo.members)) return todo.members;
  if (todo.member) return [todo.member];
  return [];
}

// 구성원 목록에 해당하는 이모지를 이어붙여 반환하는 함수
function getMembersEmoji(members) {
  return members.map((name) => getMemberEmoji(name)).join("");
}

// 구성원 목록에 해당하는 그라데이션 배경을 반환하는 함수 (첫 번째로 선택된 구성원의 색상 사용)
function getMembersGradient(members) {
  return members.length > 0 ? getMemberGradient(members[0]) : getMemberGradient(null);
}

// year, month(0-11) 기준으로 몇 번째 주(0-indexed)에 어떤 날짜가 들어가는지 계산하는 함수
function computeWeeks(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = []; // weeks[w] = [{ day, dateKey } | null, ...] (7칸, 일~토)

  for (let day = 1; day <= daysInMonth; day++) {
    const idx = day - 1 + firstWeekday;
    const w = Math.floor(idx / 7);
    const col = idx % 7;
    if (!weeks[w]) weeks[w] = new Array(7).fill(null);
    weeks[w][col] = { day, dateKey: formatDateKey(year, month, day) };
  }

  return weeks;
}

// 여러 날짜짜리 일정을 주 단위 막대 세그먼트로 나누고, 겹치면 세로로 쌓이도록 레인을 배정하는 함수
function computeEventBars(weeks) {
  const multiDayTodos = todos.filter((t) => t.startDate !== t.endDate);
  const bars = [];

  weeks.forEach((week, weekIndex) => {
    if (!week) return;
    const weekDates = week.map((slot) => (slot ? slot.dateKey : null));

    // 이 주에 걸치는 세그먼트 계산 (종료일은 체크아웃 날로 숙박이 없으므로 막대에서 제외)
    const segments = [];
    multiDayTodos.forEach((todo) => {
      const barEndDate = addDays(todo.endDate, -1);
      let colStart = -1;
      let colEnd = -1;
      weekDates.forEach((dateKey, col) => {
        if (dateKey && dateKey >= todo.startDate && dateKey <= barEndDate) {
          if (colStart === -1) colStart = col;
          colEnd = col;
        }
      });
      if (colStart !== -1) segments.push({ todo, colStart, colEnd });
    });

    // 레인 배정: colStart 기준 정렬 후, 겹치지 않는 첫 레인에 배치
    segments.sort((a, b) => a.colStart - b.colStart);
    const laneEnds = []; // laneEnds[lane] = 그 레인의 마지막 colEnd
    segments.forEach((seg) => {
      let lane = laneEnds.findIndex((end) => end < seg.colStart);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = seg.colEnd;
      bars.push({
        weekIndex,
        colStart: seg.colStart,
        colSpan: seg.colEnd - seg.colStart + 1,
        lane,
        todo: seg.todo,
      });
    });
  });

  return bars;
}

// 달력 한 칸(day cell) 요소를 만드는 함수
function createDayCell(year, month, day, { today, isRangeStart, onClick, onDblClick }) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";
  if (today) cell.classList.add("today");
  if (isRangeStart) cell.classList.add("range-start");

  const dateKey = formatDateKey(year, month, day);

  const numberEl = document.createElement("div");
  numberEl.className = "day-number";
  numberEl.textContent = String(day);
  cell.appendChild(numberEl);

  // 하루짜리 일정만 칸 안에 미리보기로 표시 (여러 날짜짜리 일정은 달력에 이어진 막대로 표시됨)
  // 칸에 다 들어가지 않으면 마우스를 올렸을 때 스크롤로 확인할 수 있도록 별도 컨테이너에 담음
  const todoListEl = document.createElement("div");
  todoListEl.className = "day-todo-list";
  todos
    .filter((todo) => todo.startDate === todo.endDate && todo.startDate === dateKey)
    .forEach((todo) => {
      const preview = document.createElement("div");
      preview.className = "day-todo";
      preview.textContent = `${getMembersEmoji(getTodoMembers(todo))} ${todo.text}`;
      preview.style.background = getMembersGradient(getTodoMembers(todo));
      if (activeFilters.length > 0) {
        preview.classList.add(matchesActiveFilter(todo) ? "emphasized" : "dimmed");
      }
      todoListEl.appendChild(preview);
    });
  cell.appendChild(todoListEl);

  // 클릭 시 처리 (팝업의 날짜 선택, 메인 달력의 기간 지정 등)
  if (onClick) {
    cell.addEventListener("click", (event) => onClick(dateKey, event));
  }

  // 더블클릭 시 해당 날짜로 바로 일정 입력 팝업 표시
  if (onDblClick) {
    cell.addEventListener("dblclick", () => onDblClick(dateKey));
  }

  return cell;
}

// 지정한 연도/월(0-11)의 달력을 컨테이너에 그리는 함수
// showEventBars가 true면 여러 날짜짜리 일정을 기간에 걸쳐 이어진 막대로 함께 그린다
function renderMonthGrid(gridEl, titleEl, year, month, { onDateClick, onDateDblClick, showRangeStart, showEventBars }) {
  const now = new Date();
  // 실제 오늘 날짜가 지금 보고 있는 달에 포함될 때만 "오늘" 강조를 적용
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const today = now.getDate();

  titleEl.textContent = `${year}년 ${month + 1}월`;

  gridEl.innerHTML = "";

  // 요일 헤더 (일~토): 1행에 명시적으로 배치
  WEEKDAY_LABELS.forEach((label, col) => {
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "calendar-weekday";
    weekdayEl.textContent = label;
    weekdayEl.style.gridRow = 1;
    weekdayEl.style.gridColumn = col + 1;
    gridEl.appendChild(weekdayEl);
  });

  const weeks = computeWeeks(year, month);
  const bars = showEventBars ? computeEventBars(weeks) : [];

  // 주별 막대 최대 레인 수 계산 (막대가 없는 주는 0) — 날짜 칸 높이를 늘려 막대가 칸 안에 들어가도록 함
  const laneCountByWeek = weeks.map((_, weekIndex) => {
    const weekBars = bars.filter((b) => b.weekIndex === weekIndex);
    return weekBars.reduce((max, b) => Math.max(max, b.lane + 1), 0);
  });

  // 날짜 칸 (1일 이전/이후의 빈 칸 포함, 주 단위로 명시적 행/열에 배치) — 한 주는 항상 한 행만 차지
  weeks.forEach((week, weekIndex) => {
    const dayRow = weekIndex + 2; // 1행은 요일 헤더
    const laneCount = laneCountByWeek[weekIndex];
    const cellMinHeight = laneCount > 0 ? 54 + laneCount * 16 : 54;

    week.forEach((slot, col) => {
      if (!slot) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "calendar-day empty";
        emptyEl.style.gridRow = dayRow;
        emptyEl.style.gridColumn = col + 1;
        emptyEl.style.minHeight = `${cellMinHeight}px`;
        gridEl.appendChild(emptyEl);
        return;
      }

      const cell = createDayCell(year, month, slot.day, {
        today: isCurrentMonth && slot.day === today,
        isRangeStart: showRangeStart && slot.dateKey === rangeStartDate,
        onClick: onDateClick,
        onDblClick: onDateDblClick,
      });
      cell.style.gridRow = dayRow;
      cell.style.gridColumn = col + 1;
      cell.style.minHeight = `${cellMinHeight}px`;
      gridEl.appendChild(cell);
    });
  });

  // 여러 날짜짜리 일정을 기간에 걸쳐 이어진 막대로, 날짜 칸과 같은 행 안에 겹쳐서(하단 정렬) 표시
  bars.forEach((b) => {
    const bar = document.createElement("div");
    bar.className = "day-todo day-todo-bar";
    bar.textContent = `${getMembersEmoji(getTodoMembers(b.todo))} ${b.todo.text}`;
    bar.style.background = getMembersGradient(getTodoMembers(b.todo));
    if (activeFilters.length > 0) {
      bar.classList.add(matchesActiveFilter(b.todo) ? "emphasized" : "dimmed");
    }
    bar.style.gridRow = b.weekIndex + 2;
    bar.style.gridColumn = `${b.colStart + 1} / span ${b.colSpan}`;
    bar.style.marginBottom = `${b.lane * 16}px`;
    gridEl.appendChild(bar);
  });
}

// 메인 화면에 현재 viewYear/viewMonth 기준 달력을 다시 그리는 함수
function renderMainCalendar() {
  const gridEl = document.getElementById("calendar-grid");
  const titleEl = document.getElementById("calendar-title");
  renderMonthGrid(gridEl, titleEl, viewYear, viewMonth, {
    showRangeStart: true,
    showEventBars: true,
    onDateClick: handleMainCalendarClick,
    onDateDblClick: openDayPopup,
  });
}

// 이전 달로 이동하는 함수
function goToPrevMonth() {
  viewMonth -= 1;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear -= 1;
  }
  renderMainCalendar();
}

// 다음 달로 이동하는 함수
function goToNextMonth() {
  viewMonth += 1;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear += 1;
  }
  renderMainCalendar();
}

// 연/월 제목을 클릭했을 때: 월 선택 팝업을 현재 보고 있는 연도로 열기
function openMonthPicker() {
  monthPickerYear = viewYear;
  renderMonthPickerGrid();
  document.getElementById("month-picker-overlay").classList.add("visible");
}

// 월 선택 팝업을 닫는 함수
function closeMonthPicker() {
  document.getElementById("month-picker-overlay").classList.remove("visible");
}

// 월 선택 팝업의 연도 표시와 12개월 버튼을 다시 그리는 함수
function renderMonthPickerGrid() {
  document.getElementById("month-picker-year-label").textContent = `${monthPickerYear}년`;

  const gridEl = document.getElementById("month-picker-grid");
  gridEl.innerHTML = "";

  for (let m = 0; m < 12; m++) {
    const btn = document.createElement("button");
    btn.className = "month-picker-btn";
    btn.textContent = `${m + 1}월`;
    if (monthPickerYear === viewYear && m === viewMonth) {
      btn.classList.add("current");
    }
    btn.addEventListener("click", () => {
      viewYear = monthPickerYear;
      viewMonth = m;
      closeMonthPicker();
      renderMainCalendar();
    });
    gridEl.appendChild(btn);
  }
}

// 월 선택 팝업에서 이전 연도로 이동하는 함수
function goToPrevPickerYear() {
  monthPickerYear -= 1;
  renderMonthPickerGrid();
}

// 월 선택 팝업에서 다음 연도로 이동하는 함수
function goToNextPickerYear() {
  monthPickerYear += 1;
  renderMonthPickerGrid();
}

// 메인 달력의 날짜를 클릭했을 때: 일반 클릭은 기간 시작일 지정, Ctrl+클릭은 종료일을 지정해 기간 일정 입력 팝업 표시
function handleMainCalendarClick(dateKey, event) {
  if (event.ctrlKey && rangeStartDate) {
    const [start, end] = sortDateKeys(rangeStartDate, dateKey);
    openRangeAdd(start, end);
    return;
  }

  // 기간 시작 날짜로 지정하고 시각적으로 강조
  rangeStartDate = dateKey;
  renderMainCalendar();
}

// 날짜 칸(텍스트가 있는 실제 날짜) 이외의 영역을 클릭하면 기간 시작 표시(점선 테두리)를 취소
function handleGlobalClickForRangeCancel(event) {
  if (!rangeStartDate) return;
  if (event.target.closest(".calendar-day:not(.empty)")) return;

  rangeStartDate = null;
  renderMainCalendar();
}

// 전체/완료 일정 개수를 화면에 표시하는 함수
function renderTodoStats() {
  const statsEl = document.getElementById("todo-stats");
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  statsEl.textContent = `전체 ${total}개, 완료 ${completed}개`;
}

// 일정 목록 화면을 현재 todos 배열 기준으로 다시 그리는 함수 (현재 필터에 해당하는 항목만 표시)
function renderTodos() {
  renderTodoStats();

  const listEl = document.getElementById("todo-list");
  listEl.innerHTML = "";

  todos.filter(matchesActiveFilter).forEach((todo) => {
    // 항목 하나를 나타내는 li 생성
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.completed ? " completed" : "");
    li.dataset.id = todo.id;

    // 완료 여부 체크박스
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.className = "todo-checkbox";

    // 일정 텍스트 (연도는 생략하고 월-일만 표시, 기간이 있으면 함께 표시)
    const span = document.createElement("span");
    span.className = "todo-text";
    const dateLabel =
      todo.startDate === todo.endDate
        ? `[${formatDateWithoutYear(todo.startDate)}]`
        : `[${formatDateWithoutYear(todo.startDate)} ~ ${formatDateWithoutYear(todo.endDate)}]`;
    span.textContent = `${getMembersEmoji(getTodoMembers(todo))} ${dateLabel} ${todo.text}`;

    // 삭제 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "삭제";

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

// 완료/미완료 상태를 토글하는 함수
function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveTodos();
    renderTodos();
  }
}

// 일정을 배열에서 제거하는 함수
function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  renderTodos();
  renderMainCalendar();
}

// 구성원별 필터 버튼들을 한 번만 그려두는 함수 (클릭할 때마다 토글, 중복 선택 가능)
// 배경색은 달력 막대/칩과 동일하게 구성원별 색상을 사용
function renderFilterButtons() {
  const container = document.getElementById("filter-buttons");
  FAMILY_MEMBERS.forEach((member) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.innerHTML = `<span>${member.emoji}</span>${member.name}`;
    btn.style.background = getMemberGradient(member.name);
    btn.addEventListener("click", () => toggleFilter(member.name, btn));
    container.appendChild(btn);
  });
}

// 필터 버튼을 토글하는 함수 — 목록/달력을 다시 그려 반영
function toggleFilter(memberName, btnEl) {
  const idx = activeFilters.indexOf(memberName);
  if (idx === -1) {
    activeFilters.push(memberName);
    btnEl.classList.add("active");
  } else {
    activeFilters.splice(idx, 1);
    btnEl.classList.remove("active");
  }
  renderTodos();
  renderMainCalendar();
}

// 구성원 선택 버튼들을 한 번만 그려두는 함수 (클릭할 때마다 선택/해제 토글, 중복 선택 가능)
function renderMemberSelectButtons() {
  const container = document.getElementById("member-select-buttons");
  FAMILY_MEMBERS.forEach((member) => {
    const btn = document.createElement("button");
    btn.className = "member-select-btn";
    btn.innerHTML = `<span class="member-select-emoji">${member.emoji}</span>${member.name}`;
    btn.style.borderBottom = `4px solid ${member.color}`;
    btn.addEventListener("click", () => toggleMemberSelection(member.name, btn));
    container.appendChild(btn);
  });
}

// 구성원 버튼 선택 상태를 토글하는 함수
function toggleMemberSelection(memberName, btnEl) {
  const idx = selectedMembers.indexOf(memberName);
  if (idx === -1) {
    selectedMembers.push(memberName);
    btnEl.classList.add("selected");
  } else {
    selectedMembers.splice(idx, 1);
    btnEl.classList.remove("selected");
  }
}

// 구성원 선택 팝업을 여는 함수 — 선택 완료 버튼을 눌러야 실제로 일정이 저장됨
function openMemberSelect(text, startDate, endDate) {
  pendingMemberData = { text, startDate, endDate };
  selectedMembers = [];
  document
    .querySelectorAll("#member-select-buttons .member-select-btn")
    .forEach((btn) => btn.classList.remove("selected"));
  document.getElementById("member-select-overlay").classList.add("visible");
}

// 구성원 선택 팝업을 닫는 함수
function closeMemberSelect() {
  document.getElementById("member-select-overlay").classList.remove("visible");
  pendingMemberData = null;
  selectedMembers = [];
}

// "선택 완료" 버튼을 눌렀을 때: 선택된 구성원들과 함께 실제로 일정을 추가하고 목록/달력에 표시
function handleMemberSelectConfirm() {
  if (selectedMembers.length === 0) {
    alert("구성원을 한 명 이상 선택하세요");
    return;
  }

  // 동일한 텍스트 + 기간의 일정이 이미 있으면 중복 등록을 막음
  if (isDuplicateTodo(pendingMemberData.text, pendingMemberData.startDate, pendingMemberData.endDate)) {
    alert("이미 등록된 일정 입니다.");
    closeMemberSelect();
    return;
  }

  todos.push({
    id: nextId++,
    text: pendingMemberData.text,
    completed: false,
    startDate: pendingMemberData.startDate,
    endDate: pendingMemberData.endDate,
    members: [...selectedMembers],
  });
  saveTodos();

  closeMemberSelect();
  renderTodos();
  renderMainCalendar();
}

// 메인 달력의 날짜를 더블클릭했을 때: 이미 일정이 있으면 내용 팝업, 없으면 바로 입력 팝업 표시
function openDayPopup(dateKey) {
  const dayTodos = todos.filter((t) => dateKey >= t.startDate && dateKey <= t.endDate);

  if (dayTodos.length === 0) {
    openQuickAdd(dateKey);
    return;
  }

  dayDetailDate = dateKey;
  document.getElementById("day-detail-title").textContent = `${dateKey} 일정`;

  const listEl = document.getElementById("day-detail-list");
  listEl.innerHTML = "";
  dayTodos.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "day-detail-item" + (todo.completed ? " completed" : "");
    li.dataset.id = todo.id;
    li.textContent = `${getMembersEmoji(getTodoMembers(todo))} ${todo.text}`;
    listEl.appendChild(li);
  });

  document.getElementById("day-detail-overlay").classList.add("visible");
}

// 일정 내용 팝업을 닫는 함수
function closeDayPopup() {
  document.getElementById("day-detail-overlay").classList.remove("visible");
  dayDetailDate = null;
}

// 일정 텍스트를 더블클릭했을 때 뜨는 수정/삭제 팝업을 여는 함수
function openItemAction(todo) {
  actionTodoId = todo.id;
  document.getElementById("item-action-text").textContent = `${getMembersEmoji(getTodoMembers(todo))} ${todo.text}`;
  document.getElementById("item-action-overlay").classList.add("visible");
}

// 수정/삭제 팝업을 닫는 함수
function closeItemAction() {
  document.getElementById("item-action-overlay").classList.remove("visible");
  actionTodoId = null;
}

// 수정/삭제 팝업의 "수정" 버튼: 팝업을 닫고 텍스트 수정 팝업 표시
function handleItemActionEdit() {
  const todo = todos.find((t) => t.id === actionTodoId);
  if (!todo) return;

  closeItemAction();
  openEditTodo(todo);
}

// 수정/삭제 팝업의 "삭제" 버튼: 해당 일정을 삭제
function handleItemActionDelete() {
  if (actionTodoId === null) return;

  deleteTodo(actionTodoId);
  closeItemAction();
}

// 일정 내용 팝업의 "일정 추가" 버튼: 팝업을 닫고 같은 날짜의 입력 팝업 표시
function handleDayDetailAdd() {
  const dateKey = dayDetailDate;
  closeDayPopup();
  openQuickAdd(dateKey);
}

// 메인 달력의 날짜를 더블클릭했을 때: 해당 날짜(하루) 일정 입력 팝업 표시
function openQuickAdd(dateKey) {
  openRangeAdd(dateKey, dateKey);
}

// 기간(시작~종료)을 지정해 일정 입력 팝업을 여는 함수 — 시작/종료가 같으면 하루짜리 일정
function openRangeAdd(start, end) {
  // 새 일정 추가 모드이므로 수정 상태는 정리
  editingTodoId = null;

  // 팝업을 여는 시점에 메인 달력의 기간 시작 표시는 더 이상 필요 없으므로 정리
  if (rangeStartDate) {
    rangeStartDate = null;
    renderMainCalendar();
  }

  quickAddRange = { start, end };
  document.getElementById("quick-add-title").textContent =
    start === end ? `${start} 일정 추가` : `${start} ~ ${end} 일정 추가`;
  const inputEl = document.getElementById("quick-add-input");
  inputEl.value = "";
  document.getElementById("quick-add-overlay").classList.add("visible");
  inputEl.focus();
}

// 기존 일정의 텍스트를 수정하는 팝업을 여는 함수 (날짜/구성원은 변경하지 않음)
function openEditTodo(todo) {
  editingTodoId = todo.id;
  quickAddRange = null;
  document.getElementById("quick-add-title").textContent = "일정 수정";
  const inputEl = document.getElementById("quick-add-input");
  inputEl.value = todo.text;
  document.getElementById("quick-add-overlay").classList.add("visible");
  inputEl.focus();
}

// 일정 입력 팝업을 닫는 함수
function closeQuickAdd() {
  document.getElementById("quick-add-overlay").classList.remove("visible");
  quickAddRange = null;
  editingTodoId = null;
}

// 일정 입력 팝업에서 추가/수정(또는 Enter) 시: 입력값 검증 후 저장
function handleQuickAddSubmit() {
  const inputEl = document.getElementById("quick-add-input");
  const text = inputEl.value.trim();

  // 빈 값이면 알림을 띄우고 진행하지 않음
  if (text === "") {
    alert("일정을 입력하세요");
    return;
  }

  // 수정 모드이면 기존 일정의 텍스트만 바꾸고 끝냄 (날짜/구성원 유지)
  if (editingTodoId !== null) {
    const todo = todos.find((t) => t.id === editingTodoId);
    if (todo) {
      todo.text = text;
      saveTodos();
    }
    closeQuickAdd();
    renderTodos();
    renderMainCalendar();
    return;
  }

  const { start, end } = quickAddRange;
  closeQuickAdd();
  openMemberSelect(text, start, end);
}

// 앱 초기화 함수: 버튼/입력창 이벤트 바인딩
function initApp() {
  const listEl = document.getElementById("todo-list");
  const quickAddClose = document.getElementById("quick-add-close");
  const quickAddBtn = document.getElementById("quick-add-btn");
  const quickAddInput = document.getElementById("quick-add-input");
  const dayDetailAddBtn = document.getElementById("day-detail-add");
  const dayDetailCloseBtn = document.getElementById("day-detail-close");
  const dayDetailListEl = document.getElementById("day-detail-list");
  const itemActionEditBtn = document.getElementById("item-action-edit");
  const itemActionDeleteBtn = document.getElementById("item-action-delete");
  const itemActionCloseBtn = document.getElementById("item-action-close");
  const memberSelectConfirmBtn = document.getElementById("member-select-confirm");
  const calendarPrevBtn = document.getElementById("calendar-prev-month");
  const calendarNextBtn = document.getElementById("calendar-next-month");
  const calendarTitleEl = document.getElementById("calendar-title");
  const monthPickerClose = document.getElementById("month-picker-close");
  const monthPickerPrevYear = document.getElementById("month-picker-prev-year");
  const monthPickerNextYear = document.getElementById("month-picker-next-year");

  // 목록 영역에 이벤트 위임: 체크박스 토글, 삭제 버튼 클릭 처리
  listEl.addEventListener("click", (event) => {
    const li = event.target.closest(".todo-item");
    if (!li) return;
    const id = Number(li.dataset.id);

    if (event.target.classList.contains("delete-btn")) {
      deleteTodo(id);
    } else if (event.target.classList.contains("todo-checkbox")) {
      toggleTodo(id);
    }
  });

  // 빠른 일정 입력 팝업: 추가 버튼, Enter 키, 닫기 버튼
  quickAddBtn.addEventListener("click", handleQuickAddSubmit);
  quickAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleQuickAddSubmit();
    }
  });
  quickAddClose.addEventListener("click", closeQuickAdd);

  // 일정 내용 팝업의 "일정 추가"/"닫기" 버튼
  dayDetailAddBtn.addEventListener("click", handleDayDetailAdd);
  dayDetailCloseBtn.addEventListener("click", closeDayPopup);

  // 일정 내용 팝업의 목록: 일정 텍스트를 더블클릭하면 수정/삭제 팝업 표시
  dayDetailListEl.addEventListener("dblclick", (event) => {
    const li = event.target.closest(".day-detail-item");
    if (!li) return;
    const todo = todos.find((t) => t.id === Number(li.dataset.id));
    if (!todo) return;
    closeDayPopup();
    openItemAction(todo);
  });

  // 수정/삭제 팝업의 "수정"/"삭제"/"닫기" 버튼
  itemActionEditBtn.addEventListener("click", handleItemActionEdit);
  itemActionDeleteBtn.addEventListener("click", handleItemActionDelete);
  itemActionCloseBtn.addEventListener("click", closeItemAction);

  // 구성원 선택 버튼 초기 렌더링 및 "선택 완료" 버튼
  renderMemberSelectButtons();
  memberSelectConfirmBtn.addEventListener("click", handleMemberSelectConfirm);

  // 구성원별 필터 버튼 초기 렌더링
  renderFilterButtons();

  // 이전/다음 달 버튼, 연/월 제목 클릭 시 월 선택 팝업
  calendarPrevBtn.addEventListener("click", goToPrevMonth);
  calendarNextBtn.addEventListener("click", goToNextMonth);
  calendarTitleEl.addEventListener("click", openMonthPicker);

  // 월 선택 팝업의 닫기 버튼, 이전/다음 연도 버튼
  monthPickerClose.addEventListener("click", closeMonthPicker);
  monthPickerPrevYear.addEventListener("click", goToPrevPickerYear);
  monthPickerNextYear.addEventListener("click", goToNextPickerYear);

  // 날짜가 아닌 영역(빈 칸, 달력 바깥 등)을 클릭하면 기간 시작 점선 테두리 취소
  document.addEventListener("click", handleGlobalClickForRangeCancel);

  // localStorage에 저장된 일정을 불러와 화면에 표시 (새로고침해도 유지)
  loadTodos();
  renderTodos();
  renderMainCalendar();
}

initApp();
