(function () {
  "use strict";
  // Storage keys keep the app's original "track." prefix on purpose:
  // data saved before the rename to Docket must keep loading.
  var STORE_KEY = "track.tasks.v1";
  var WISH_KEY = "track.wishlist.v1";
  var REC_KEY = "track.recurring.v1";
  var VIEW_KEY = "track.view.v1";
  var JOB_KEY = "track.jobs.v1";
  var data = load();          // { "YYYY-MM-DD": [{id, text, job?}, ...] } — job is a job id
  var wishlist = loadList(WISH_KEY);  // [{id, text}, ...]
  var recurring = loadList(REC_KEY);  // [{id, text}, ...]
  var jobs = loadList(JOB_KEY);       // [{id, text}, ...] — text is the job's name
  var currentDate = todayISO();
  var currentJob = null;      // job id shown by the Job view
  var editingId = null;
  var view = (function () {
    var v = localStorage.getItem(VIEW_KEY);
    return (v === "week" || v === "month") ? v : "day";
  })();

  // ---------- storage ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) { return {}; }
  }
  // Every write goes through here: localStorage can be full, or blocked
  // outright (private windows, file:// with site data disabled). Failing
  // silently would leave the screen showing work that was never stored.
  var storageBroken = false;
  function writeStore(key, value) {
    try {
      localStorage.setItem(key, value);
      if (storageBroken) {
        storageBroken = false;
        toast("Saving again — your log is being stored");
      }
      pulseSaved();
      return true;
    } catch (e) {
      failSaved();
      if (!storageBroken) {
        storageBroken = true;
        toast("Couldn't save — this browser's storage is full or blocked. Export a backup before closing.");
      }
      return false;
    }
  }
  function save() {
    // prune empty days so the sidebar stays clean
    Object.keys(data).forEach(function (d) {
      if (!data[d] || data[d].length === 0) delete data[d];
    });
    writeStore(STORE_KEY, JSON.stringify(data));
  }
  function newId() {
    return Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }
  function loadList(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (it) {
        return it && typeof it.text === "string" && it.text !== "";
      }) : [];
    } catch (e) { return []; }
  }
  function saveWishlist() {
    writeStore(WISH_KEY, JSON.stringify(wishlist));
  }
  function saveRecurring() {
    writeStore(REC_KEY, JSON.stringify(recurring));
  }
  function saveJobs() {
    writeStore(JOB_KEY, JSON.stringify(jobs));
  }

  // ---------- jobs ----------
  // A job groups entries across days (a client, site or project). Entries
  // point at a job by id, so renaming a job never touches the log itself.
  var JOB_MAX = 60;
  function cleanJobName(name) {
    return String(name || "").replace(/\s+/g, " ").trim().slice(0, JOB_MAX);
  }
  function jobById(id) {
    if (!id) return null;
    for (var i = 0; i < jobs.length; i++) if (jobs[i].id === id) return jobs[i];
    return null;
  }
  function jobByName(name) {
    var n = cleanJobName(name).toLowerCase();
    if (n === "") return null;
    for (var i = 0; i < jobs.length; i++) if (jobs[i].text.toLowerCase() === n) return jobs[i];
    return null;
  }
  // Name → id, creating the job the first time a name is used ("" → null).
  function ensureJob(name, color) {
    var clean = cleanJobName(name);
    if (clean === "") return null;
    var found = jobByName(clean);
    if (found) return found.id;
    var job = { id: newId(), text: clean, color: validColor(color) ? color : nextJobColor() };
    jobs.push(job);
    saveJobs();
    return job.id;
  }

  // Every job has a colour, shown on its pills, entries, calendar bars and
  // Job view. Picked from a fixed palette that reads well on light and dark;
  // new jobs take the least-used colour so neighbours rarely match.
  var JOB_COLORS = ["#3e7bfa", "#12a37f", "#9b5cf6", "#e09a00", "#e8458b", "#0ea5b7", "#e5484d", "#6e9e1c"];
  function validColor(c) { return typeof c === "number" && c >= 0 && c < JOB_COLORS.length && c % 1 === 0; }
  function nextJobColor() {
    var used = JOB_COLORS.map(function () { return 0; });
    jobs.forEach(function (j) { if (validColor(j.color)) used[j.color]++; });
    var best = 0;
    for (var i = 1; i < used.length; i++) if (used[i] < used[best]) best = i;
    return best;
  }
  function jobColor(idOrJob) {
    var j = typeof idOrJob === "string" ? jobById(idOrJob) : idOrJob;
    return j && validColor(j.color) ? JOB_COLORS[j.color] : "";
  }
  // Paint an element with a job's colour (read by CSS as --job).
  function tintJob(el, jobId) {
    var c = jobColor(jobId);
    if (c) el.style.setProperty("--job", c);
  }
  // Jobs made before colours existed get one, once.
  (function colourExistingJobs() {
    var changed = false;
    jobs.forEach(function (j) {
      if (!validColor(j.color)) { j.color = nextJobColor(); changed = true; }
    });
    if (changed) saveJobs();
  })();
  function jobName(entry) {
    var j = entry && jobById(entry.job);
    return j ? j.text : "";
  }
  // One pass over the log: per job, entry count, days worked, first/last day.
  function jobStats() {
    var stats = {};
    Object.keys(data).forEach(function (d) {
      (data[d] || []).forEach(function (it) {
        if (!it.job || !jobById(it.job)) return;
        var st = stats[it.job] || (stats[it.job] = { n: 0, days: [], first: d, last: d });
        st.n++;
        if (st.days.indexOf(d) === -1) st.days.push(d);
        if (d < st.first) st.first = d;
        if (d > st.last) st.last = d;
      });
    });
    return stats;
  }
  var pulseTimer;
  function pulseSaved() {
    var p = document.getElementById("savedPill");
    p.classList.remove("failed");
    p.firstChild.textContent = "●";
    p.lastChild.textContent = " Auto-saved locally";
    p.dataset.tip = "Everything saves to this browser automatically — keep an occasional Export as a backup";
    p.classList.add("pulse");
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function () { p.classList.remove("pulse"); }, 900);
  }
  // The pill is the only always-visible promise that the data is safe;
  // when a write fails it has to stop making that promise.
  function failSaved() {
    var p = document.getElementById("savedPill");
    clearTimeout(pulseTimer);
    p.classList.remove("pulse");
    p.classList.add("failed");
    p.firstChild.textContent = "▲";
    p.lastChild.textContent = " Not saved";
    p.dataset.tip = "This browser refused to store the last change — export a backup before you close the file";
  }

  // ---------- date helpers ----------
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function shiftDay(iso, delta) {
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2] + delta);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function dateObj(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function prettyDate(iso) {
    return dateObj(iso).toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }
  // "Today — Thursday 17 July 2026" when the date is near enough to name.
  function dayHeading(iso) {
    var rel = iso === todayISO() ? "Today"
            : iso === shiftDay(todayISO(), -1) ? "Yesterday"
            : iso === shiftDay(todayISO(), 1) ? "Tomorrow" : null;
    return rel ? rel + " — " + prettyDate(iso) : prettyDate(iso);
  }
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var LONGDOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDow(iso) { return DOW[dateObj(iso).getDay()]; }
  function isoOf(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function weekStart(iso) { // Monday-first weeks
    var d = dateObj(iso);
    return shiftDay(iso, -((d.getDay() + 6) % 7));
  }
  function shiftMonth(iso, delta) {
    var d = dateObj(iso);
    var first = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    var maxDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return isoOf(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), maxDay)));
  }
  function monthLabel(iso) {
    return dateObj(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function weekLabel(iso) {
    var ws = dateObj(weekStart(iso));
    var we = dateObj(shiftDay(weekStart(iso), 6));
    var a = ws.getDate() + (ws.getMonth() !== we.getMonth() ? " " + MON[ws.getMonth()] : "");
    return "Week of " + a + " – " + we.getDate() + " " + MON[we.getMonth()] + " " + we.getFullYear();
  }

  // Accepts 2026-07-05, 2026/07/05, 05/07/2026, 5-7-2026, 05.07.2026.
  // Day-first is assumed for d/m/y unless the first number can only be a month.
  function parseDateFlexible(s) {
    s = String(s || "").trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
      if (!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; } // clearly month-first
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var check = new Date(y, mo - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
    return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  // ---------- rendering ----------
  var $ = function (id) { return document.getElementById(id); };

  // Crisp stroke icons for the buttons that JS builds on every render.
  var ICONS = {
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
    job: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  function icon(name) {
    var s = document.createElement("span");
    s.className = "ic";
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
    return s;
  }

  // The small job tag on an entry; clicking it opens everything on that job.
  function jobPill(entry) {
    var j = jobById(entry.job);
    if (!j) return null;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "jobpill";
    tintJob(b, j.id);
    b.appendChild(icon("job"));
    var n = document.createElement("span");
    n.className = "jn";
    n.textContent = j.text;
    b.appendChild(n);
    b.dataset.tip = "Job: " + j.text + " — click to see all its work";
    b.setAttribute("aria-label", "Open job " + j.text);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      openJob(j.id);
    });
    return b;
  }

  function openJob(id) {
    if (!jobById(id)) return;
    currentJob = id;
    setView("job");
  }

  function items() {
    if (!data[currentDate]) data[currentDate] = [];
    return data[currentDate];
  }

  function entryCount(iso) { return (data[iso] || []).length; }

  // One clickable bar per day; heights scale to the busiest day shown.
  function fillBars(strip, days, currentIso, maxH) {
    strip.innerHTML = "";
    var max = 1;
    days.forEach(function (d) { max = Math.max(max, entryCount(d)); });
    days.forEach(function (d) {
      var n = entryCount(d);
      var b = document.createElement("button");
      b.className = (n > 0 ? "hit" : "") + (d === currentIso ? " cur" : "");
      b.style.height = (n > 0 ? Math.round(4 + (maxH - 4) * n / max) : 3) + "px";
      b.dataset.tip = shortDow(d) + " " + d + " — " +
        (n === 0 ? "no entries" : n + (n === 1 ? " entry" : " entries")) + " · click to open";
      b.setAttribute("aria-label", "Open " + prettyDate(d));
      b.addEventListener("click", function () {
        currentDate = d;
        editingId = null;
        setView("day");
      });
      strip.appendChild(b);
    });
  }

  // Entries stagger in when a day is opened, but not on edits within it.
  var lastRenderKey = null;
  var staggerNext = false;

  function setView(v) {
    view = v;
    if (v !== "job") { try { localStorage.setItem(VIEW_KEY, v); } catch (e) {} }
    editingId = null;
    render();
  }

  function render() {
    hideTip();
    if (view === "job" && !jobById(currentJob)) view = "day"; // its job was deleted
    $("datePick").value = currentDate;
    var renderKey = view + "|" + (view === "job" ? currentJob : currentDate);
    staggerNext = renderKey !== lastRenderKey;
    lastRenderKey = renderKey;

    var tabs = document.querySelectorAll("#viewTabs button");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].dataset.view === view);
    }

    var unit = view === "week" ? "week" : view === "month" ? "month" : "day";
    $("prevDay").dataset.tip = "Previous " + unit + " — shortcut: ←";
    $("nextDay").dataset.tip = "Next " + unit + " — shortcut: →";
    $("todayBtn").disabled = currentDate === todayISO();
    var inJob = view === "job";
    document.body.setAttribute("data-view", view);
    var jc = inJob ? jobColor(currentJob) : "";
    if (jc) document.body.style.setProperty("--jobc", jc); else document.body.style.removeProperty("--jobc");
    $("prevDay").classList.toggle("gone", inJob);
    $("nextDay").classList.toggle("gone", inJob);
    $("prevDay").disabled = $("nextDay").disabled = inJob;
    $("navDate").disabled = inJob;
    $("navDate").dataset.tip = inJob ? "Every entry logged against this job" : "Pick a date from the calendar";
    $("todayBtn").style.display = inJob ? "none" : "";
    $("logJobBtn").style.display = inJob ? "" : "none";

    // The heading names the view; the navigator below it owns the date.
    if (inJob) {
      $("dayTitle").textContent = "Job";
      $("navDate").textContent = jobById(currentJob).text;
      $("copyDayLabel").textContent = "Copy Job to Clipboard";
    } else if (view === "week") {
      $("dayTitle").textContent = "Weekly Overview";
      $("navDate").textContent = weekLabel(currentDate).replace("Week of ", "");
      $("copyDayLabel").textContent = "Copy Week to Clipboard";
    } else if (view === "month") {
      $("dayTitle").textContent = "Monthly Calendar";
      $("navDate").textContent = monthLabel(currentDate);
      $("copyDayLabel").textContent = "Copy Month to Clipboard";
    } else {
      $("dayTitle").textContent = "Daily Log";
      $("navDate").textContent = dayHeading(currentDate);
      $("copyDayLabel").textContent = "Copy Day to Clipboard";
    }

    $("logPanel").style.display = view === "day" ? "" : "none";
    $("weekView").style.display = view === "week" ? "" : "none";
    $("monthView").style.display = view === "month" ? "" : "none";
    $("jobView").style.display = inJob ? "" : "none";

    if (view === "day") renderDay();
    if (view === "week") renderWeek();
    if (view === "month") renderMonth();
    if (inJob) renderJob();

    renderSidebar();
    renderJobs();
    renderWishlist();
    renderRecurring();
    markScrollable();
  }

  // Recent days scrolls once there is enough history; without a cue the
  // half-visible row at the fold just looks like a clipping bug.
  function markScrollable() {
    var ul = $("dayList");
    var grow = ul.parentNode;
    grow.classList.toggle("scrolls", ul.scrollHeight > ul.clientHeight + 1);
  }

  function renderDay() {
    var list = data[currentDate] || [];

    // stat tiles: the open day, its week, its month, and a 14-day chart
    var weekN = 0;
    var ws = weekStart(currentDate);
    for (var w = 0; w < 7; w++) weekN += entryCount(shiftDay(ws, w));
    var md = dateObj(currentDate);
    var dim = new Date(md.getFullYear(), md.getMonth() + 1, 0).getDate();
    var monthN = 0;
    for (var dn = 1; dn <= dim; dn++) monthN += entryCount(isoOf(new Date(md.getFullYear(), md.getMonth(), dn)));
    $("statToday").textContent = list.length;
    $("statWeek").textContent = weekN;
    $("statMonth").textContent = monthN;
    var days14 = [];
    for (var b = 13; b >= 0; b--) days14.push(shiftDay(currentDate, -b));
    fillBars($("actStrip"), days14, currentDate, 20);

    var ol = $("itemList");
    ol.classList.toggle("stagger", staggerNext);
    ol.innerHTML = "";
    list.forEach(function (item, idx) {
      ol.appendChild(item.id === editingId ? buildEditor(item, currentDate) : buildEntry(item, idx, currentDate));
    });

    $("sheet").style.display = list.length === 0 ? "none" : "";
    $("emptyMsg").style.display = list.length === 0 ? "" : "none";
    $("clearDay").style.display = list.length === 0 ? "none" : "";
  }

  function renderWeek() {
    var wrap = $("weekView");
    wrap.innerHTML = "";
    var ws = weekStart(currentDate);

    var total = 0, daysWith = 0;
    for (var c = 0; c < 7; c++) {
      var n = (data[shiftDay(ws, c)] || []).length;
      total += n;
      if (n > 0) daysWith++;
    }
    var sum = document.createElement("div");
    sum.className = "view-sum";
    var sumText = document.createElement("span");
    sumText.textContent = total === 0 ? "Nothing logged this week yet" :
      total + (total === 1 ? " entry" : " entries") + " across " +
      daysWith + (daysWith === 1 ? " day" : " days") + " this week";
    sum.appendChild(sumText);
    var weekDays = [];
    for (var wd2 = 0; wd2 < 7; wd2++) weekDays.push(shiftDay(ws, wd2));
    var strip = document.createElement("div");
    strip.className = "actstrip";
    fillBars(strip, weekDays, todayISO(), 14);
    sum.appendChild(strip);
    wrap.appendChild(sum);

    for (var i = 0; i < 7; i++) {
      (function (d) {
        var list = data[d] || [];
        var isToday = d === todayISO();
        var card = document.createElement("div");
        card.className = "wday" + (isToday ? " today" : "") +
          (list.length === 0 && !isToday ? " vacant" : "");
        var dd = dateObj(d);

        // calendar-style date chip on the left
        var chip = document.createElement("div");
        chip.className = "wchip";
        chip.addEventListener("click", function () {
          currentDate = d;
          setView("day");
        });
        var wd = document.createElement("span");
        wd.className = "wd";
        wd.textContent = DOW[dd.getDay()];
        var wn = document.createElement("span");
        wn.className = "wn";
        wn.textContent = dd.getDate();
        chip.appendChild(wd);
        chip.appendChild(wn);
        card.appendChild(chip);

        var main = document.createElement("div");
        main.className = "wday-main";

        var head = document.createElement("div");
        head.className = "wday-head";
        var btn = document.createElement("button");
        btn.textContent = LONGDOW[dd.getDay()];
        btn.dataset.tip = "Open " + prettyDate(d);
        btn.addEventListener("click", function () {
          currentDate = d;
          setView("day");
        });
        head.appendChild(btn);
        var sub = document.createElement("span");
        sub.className = "wsub";
        sub.textContent = dd.getDate() + " " + MON[dd.getMonth()];
        head.appendChild(sub);
        if (list.length > 0) {
          var count = document.createElement("span");
          count.className = "count";
          count.textContent = list.length;
          head.appendChild(count);
        }
        main.appendChild(head);

        if (list.length > 0) {
          var ul = document.createElement("ul");
          list.forEach(function (it) { ul.appendChild(buildMiniEntry(it, d, true)); });
          main.appendChild(ul);
        } else {
          var none = document.createElement("div");
          none.className = "none";
          none.textContent = "no entries";
          main.appendChild(none);
        }

        card.appendChild(main);
        card.dataset.day = d;
        makeDropTarget(card, function () { return d; });
        wrap.appendChild(card);
      })(shiftDay(ws, i));
    }
  }

  function renderMonth() {
    var grid = $("monthGrid");
    grid.innerHTML = "";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (h) {
      var el = document.createElement("div");
      el.className = "mhead";
      el.textContent = h;
      grid.appendChild(el);
    });

    var d = dateObj(currentDate);
    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var blanks = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    var total = 0, daysWith = 0;
    for (var c = 1; c <= daysInMonth; c++) {
      var cn = (data[isoOf(new Date(d.getFullYear(), d.getMonth(), c))] || []).length;
      total += cn;
      if (cn > 0) daysWith++;
    }
    $("monthSum").textContent = total === 0 ?
      "Nothing logged in " + monthLabel(currentDate) + " yet" :
      total + (total === 1 ? " entry" : " entries") + " across " +
      daysWith + (daysWith === 1 ? " day" : " days") + " in " + monthLabel(currentDate);

    for (var b = 0; b < blanks; b++) {
      var blank = document.createElement("div");
      blank.className = "mcell blank";
      grid.appendChild(blank);
    }
    for (var day = 1; day <= daysInMonth; day++) {
      (function (iso) {
        var list = data[iso] || [];
        var cell = document.createElement("button");
        var cdow = dateObj(iso).getDay();
        cell.className = "mcell" + (iso === todayISO() ? " today" : "") +
          (cdow === 0 || cdow === 6 ? " wknd" : "") +
          (list.length >= 4 ? " d3" : list.length >= 2 ? " d2" : list.length === 1 ? " d1" : "");
        // jobs worked that day, busiest first, for the cell line and tooltip
        var perJob = {}, jobOrder = [];
        list.forEach(function (it) {
          if (!jobById(it.job)) return;
          if (!perJob[it.job]) { perJob[it.job] = 0; jobOrder.push(it.job); }
          perJob[it.job]++;
        });
        jobOrder.sort(function (a, b) { return perJob[b] - perJob[a]; });
        var jobTip = jobOrder.map(function (id) { return jobById(id).text + " " + perJob[id]; }).join(", ");
        cell.dataset.tip = (list.length ? list.length + " entr" + (list.length === 1 ? "y" : "ies") : "No entries") +
          (jobTip ? " · " + jobTip : "") + " — click to open the day";

        var dnum = document.createElement("div");
        dnum.className = "dnum";
        var n = document.createElement("span");
        n.textContent = dateObj(iso).getDate();
        dnum.appendChild(n);
        if (list.length > 0) {
          var count = document.createElement("span");
          count.className = "count";
          count.textContent = list.length;
          dnum.appendChild(count);
        }
        cell.appendChild(dnum);

        if (jobOrder.length) {
          var mj = document.createElement("div");
          mj.className = "mjobs";
          tintJob(mj, jobOrder[0]);
          mj.appendChild(icon("job"));
          var mjn = document.createElement("span");
          mjn.className = "jn";
          mjn.textContent = jobById(jobOrder[0]).text;
          mj.appendChild(mjn);
          if (jobOrder.length > 1) {
            var mjm = document.createElement("span");
            mjm.className = "jm";
            mjm.textContent = "+" + (jobOrder.length - 1);
            mj.appendChild(mjm);
          }
          cell.appendChild(mj);
          // how the day split between jobs (job-less entries in grey)
          var bar = document.createElement("div");
          bar.className = "mbar";
          bar.setAttribute("aria-hidden", "true");
          var loose = list.length - jobOrder.reduce(function (n, id) { return n + perJob[id]; }, 0);
          jobOrder.forEach(function (id) {
            var seg = document.createElement("span");
            seg.style.flex = String(perJob[id]);
            tintJob(seg, id);
            bar.appendChild(seg);
          });
          if (loose > 0) {
            var rest = document.createElement("span");
            rest.style.flex = String(loose);
            bar.appendChild(rest);
          }
          cell.appendChild(bar);
        }

        list.slice(0, 2).forEach(function (it) {
          var snip = document.createElement("div");
          snip.className = "snip";
          snip.textContent = it.text;
          cell.appendChild(snip);
        });
        if (list.length > 2) {
          var more = document.createElement("div");
          more.className = "snip";
          more.textContent = "+" + (list.length - 2) + " more";
          cell.appendChild(more);
        }

        cell.addEventListener("click", function () {
          currentDate = iso;
          setView("day");
        });
        cell.dataset.day = iso;
        makeDropTarget(cell, function () { return iso; });
        grid.appendChild(cell);
      })(isoOf(new Date(d.getFullYear(), d.getMonth(), day)));
    }
    // pad the final row so the printed grid stays rectangular
    var used = (blanks + daysInMonth) % 7;
    for (var t2 = used === 0 ? 0 : 7 - used; t2 > 0; t2--) {
      var tail = document.createElement("div");
      tail.className = "mcell blank";
      grid.appendChild(tail);
    }
  }

  // Everything logged against one job, oldest day first — the order an
  // invoice reads in.
  function renderJob() {
    var wrap = $("jobView");
    wrap.innerHTML = "";
    var job = jobById(currentJob);
    var st = jobStats()[currentJob] || { n: 0, days: [], first: null, last: null };
    var days = st.days.slice().sort();

    var stats = document.createElement("div");
    stats.className = "stats";
    function stat(value, label, tipText) {
      var el = document.createElement("div");
      el.className = "stat";
      el.dataset.tip = tipText;
      var sn = document.createElement("span");
      sn.className = "sn";
      sn.textContent = value;
      var sl = document.createElement("span");
      sl.className = "sl";
      sl.textContent = label;
      el.appendChild(sn);
      el.appendChild(sl);
      stats.appendChild(el);
    }
    function shortDate(iso) {
      var dd = dateObj(iso);
      return dd.getDate() + " " + MON[dd.getMonth()];
    }
    stat(st.n, "Entries", "Entries logged against " + job.text);
    stat(days.length, days.length === 1 ? "Day worked" : "Days worked", "Days with at least one entry on this job");
    stat(st.last ? shortDate(st.last) : "—", "Last logged",
      st.last ? "Most recent work: " + prettyDate(st.last) : "Nothing logged yet");
    wrap.appendChild(stats);

    // what's still to do on this job sits above what's been done
    var todo = wishlist.filter(function (it) { return it.job === currentJob; });
    var reps = recurring.filter(function (it) { return it.job === currentJob; });
    if (todo.length || reps.length) {
      var q = document.createElement("div");
      q.className = "jobq";
      function queueCol(kind, title, items, glyph, sendTip) {
        if (!items.length) return;
        var col = document.createElement("div");
        col.className = "jobq-col";
        var h = document.createElement("h3");
        h.textContent = title;
        var c = document.createElement("span");
        c.className = "count";
        c.textContent = items.length;
        h.appendChild(c);
        col.appendChild(h);
        var ul = document.createElement("ul");
        items.forEach(function (it) {
          var li = document.createElement("li");
          var g = document.createElement("span");
          g.className = "qg";
          g.textContent = glyph;
          g.setAttribute("aria-hidden", "true");
          var t = document.createElement("span");
          t.className = "qt";
          t.textContent = it.text;
          var b = document.createElement("button");
          b.appendChild(icon("send"));
          b.dataset.tip = sendTip + " (" + shortDow(currentDate) + " " + currentDate + ")";
          b.setAttribute("aria-label", sendTip + ": " + it.text);
          b.addEventListener("click", function () { sendQueueItem(kind, it.id, currentDate); });
          li.appendChild(g);
          li.appendChild(t);
          li.appendChild(b);
          ul.appendChild(li);
        });
        col.appendChild(ul);
        q.appendChild(col);
      }
      queueCol("w", "Wishlist", todo, "⣿", "Log on open day");
      queueCol("r", "Recurring", reps, "⟳", "Log on open day, keep in Recurring");
      wrap.appendChild(q);
    }

    if (days.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS.job + '</svg>';
      var e1 = document.createElement("p");
      e1.className = "e1";
      e1.textContent = "Nothing logged against this job yet";
      var e2 = document.createElement("p");
      e2.className = "e2";
      e2.textContent = todo.length || reps.length
        ? "Log an item above with ↳, or click “Log Work on This Job”."
        : "Click “Log Work on This Job” above — new entries will go against it.";
      empty.appendChild(e1);
      empty.appendChild(e2);
      wrap.appendChild(empty);
      return;
    }

    var sum = document.createElement("div");
    sum.className = "view-sum";
    var sumText = document.createElement("span");
    sumText.textContent = st.first === st.last ? prettyDate(st.first)
      : prettyDate(st.first) + " – " + prettyDate(st.last);
    sum.appendChild(sumText);
    wrap.appendChild(sum);

    days.forEach(function (d) {
      var list = (data[d] || []).filter(function (it) { return it.job === currentJob; });
      var dd = dateObj(d);
      var card = document.createElement("div");
      card.className = "wday" + (d === todayISO() ? " today" : "");

      var chip = document.createElement("div");
      chip.className = "wchip";
      chip.dataset.tip = "Open " + prettyDate(d);
      chip.addEventListener("click", function () { currentDate = d; setView("day"); });
      var wd = document.createElement("span");
      wd.className = "wd";
      wd.textContent = MON[dd.getMonth()];
      var wn = document.createElement("span");
      wn.className = "wn";
      wn.textContent = dd.getDate();
      chip.appendChild(wd);
      chip.appendChild(wn);
      card.appendChild(chip);

      var main = document.createElement("div");
      main.className = "wday-main";
      var head = document.createElement("div");
      head.className = "wday-head";
      var btn = document.createElement("button");
      btn.textContent = LONGDOW[dd.getDay()];
      btn.dataset.tip = "Open " + prettyDate(d);
      btn.addEventListener("click", function () { currentDate = d; setView("day"); });
      head.appendChild(btn);
      var sub = document.createElement("span");
      sub.className = "wsub";
      sub.textContent = dd.getDate() + " " + MON[dd.getMonth()] + " " + dd.getFullYear();
      head.appendChild(sub);
      var count = document.createElement("span");
      count.className = "count";
      count.textContent = list.length;
      head.appendChild(count);
      main.appendChild(head);

      var ul = document.createElement("ul");
      list.forEach(function (it) { ul.appendChild(buildMiniEntry(it, d, false)); });
      main.appendChild(ul);
      card.appendChild(main);
      wrap.appendChild(card);
    });
  }

  // Entries drag onto another day (Recent days, a Week card, a Month cell)
  // to move there, or onto a job in the sidebar to link them.
  function makeEntryDraggable(li, item) {
    li.draggable = true;
    li.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", "e:" + item.id);
      e.dataTransfer.effectAllowed = "linkMove"; // move onto a day, link onto a job
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", function () { li.classList.remove("dragging"); });
  }

  function entryButtons(item) {
    var edit = document.createElement("button");
    edit.className = "icon edit";
    edit.dataset.tip = "Edit — text, job or date. Double-clicking the text works too";
    edit.setAttribute("aria-label", "Edit entry");
    edit.appendChild(icon("pencil"));
    edit.addEventListener("click", function () { startEdit(item.id); });

    var del = document.createElement("button");
    del.className = "icon del";
    del.dataset.tip = "Delete this entry — you can Undo";
    del.setAttribute("aria-label", "Delete entry");
    del.appendChild(icon("x"));
    del.addEventListener("click", function () { removeItem(item.id); });
    return [edit, del];
  }

  // A compact entry for the Week and Job views: same edit, delete and drag
  // as the Day view's ledger rows.
  function buildMiniEntry(item, day, showPill) {
    if (item.id === editingId) return buildEditor(item, day);
    var li = document.createElement("li");
    li.className = "mini";
    tintJob(li, item.job);
    var t = document.createElement("span");
    t.className = "mt";
    t.textContent = item.text;
    t.addEventListener("dblclick", function () { startEdit(item.id); });
    li.appendChild(t);
    var pill = showPill && jobPill(item);
    if (pill) li.appendChild(pill);
    entryButtons(item).forEach(function (b) { li.appendChild(b); });
    makeEntryDraggable(li, item);
    return li;
  }

  function buildEntry(item, idx) {
    var li = document.createElement("li");
    li.className = "entry";
    tintJob(li, item.job);
    makeEntryDraggable(li, item);

    var num = document.createElement("span");
    num.className = "num";
    num.textContent = idx + 1;
    num.dataset.tip = "Drag the entry onto another day to move it, or onto a job to link it";

    var txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = item.text;
    txt.addEventListener("dblclick", function () { startEdit(item.id); });
    var btns = entryButtons(item);

    var body = document.createElement("div");
    body.className = "body";
    body.appendChild(txt);
    var pill = jobPill(item);
    if (pill) body.appendChild(pill);

    li.appendChild(num);
    li.appendChild(body);
    li.appendChild(btns[0]);
    li.appendChild(btns[1]);
    return li;
  }

  function buildEditor(item, day) {
    var li = document.createElement("li");
    li.className = "editing";

    var input = document.createElement("input");
    input.type = "text";
    input.value = item.text;
    input.setAttribute("aria-label", "Entry text");

    var jobWrap = document.createElement("div");
    jobWrap.className = "jobwrap";
    jobWrap.appendChild(icon("job"));
    var jobInput = document.createElement("input");
    jobInput.type = "text";
    jobInput.setAttribute("list", "jobOptions");
    jobInput.maxLength = JOB_MAX;
    jobInput.placeholder = "No job";
    jobInput.autocomplete = "off";
    jobInput.value = jobName(item);
    jobInput.setAttribute("aria-label", "Job for this entry");
    jobWrap.dataset.tip = "The job this entry belongs to — pick one, type a new name, or leave empty";
    jobWrap.appendChild(jobInput);

    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "edate";
    dateInput.value = day;
    dateInput.required = true;
    dateInput.setAttribute("aria-label", "Date of this entry");
    dateInput.dataset.tip = "Change the date to move this entry to another day";

    function commit() {
      var v = input.value.trim();
      editingId = null;
      if (v === "") { removeItem(item.id); return; }
      var changed = false;
      if (v !== item.text) { item.text = v; changed = true; }
      var jid = ensureJob(jobInput.value);
      if ((item.job || null) !== jid) {
        if (jid) item.job = jid; else delete item.job;
        changed = true;
      }
      if (changed) save();
      // a valid new date moves it (moveEntry renders and offers Undo)
      var to = parseDateFlexible(dateInput.value);
      if (to && to !== day && moveEntry(item.id, to)) return;
      render();
    }
    function cancel() {
      editingId = null;
      render();
    }
    [input, jobInput, dateInput].forEach(function (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
      });
    });

    var row = document.createElement("div");
    row.className = "editrow";
    row.appendChild(jobWrap);
    row.appendChild(dateInput);
    var saveBtn = document.createElement("button");
    saveBtn.className = "save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", commit);
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", cancel);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);

    li.appendChild(input);
    li.appendChild(row);
    setTimeout(function () { input.focus(); input.select(); }, 0);
    return li;
  }

  function startEdit(id) {
    editingId = id;
    render();
  }

  // Months collapse so years of history stay scannable. Only the month
  // being viewed opens by default; toggles live for the session.
  var monthOpen = {};
  var lastViewedMonth = null;
  function monthIsOpen(m) {
    return monthOpen[m] === undefined ? m === currentDate.slice(0, 7) : monthOpen[m];
  }

  function renderSidebar() {
    var m = currentDate.slice(0, 7);
    if (m !== lastViewedMonth) {
      monthOpen[m] = true; // moving into a month always reveals it
      lastViewedMonth = m;
    }

    var ul = $("dayList");
    ul.innerHTML = "";
    var days = Object.keys(data).filter(function (d) {
      return data[d] && data[d].length > 0;
    });
    if (days.indexOf(currentDate) === -1) days.push(currentDate);
    days.sort().reverse();

    var order = [], groups = {};
    days.forEach(function (d) {
      var key = d.slice(0, 7);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(d);
    });

    order.forEach(function (key) {
      var open = monthIsOpen(key);
      var entryTotal = groups[key].reduce(function (sum, d) {
        return sum + (data[d] || []).length;
      }, 0);

      var headLi = document.createElement("li");
      var head = document.createElement("div");
      head.className = "mgroup";

      var toggle = document.createElement("button");
      toggle.className = "mtoggle";
      var chev = document.createElement("span");
      chev.className = "chev" + (open ? " open" : "");
      chev.textContent = "▸";
      toggle.appendChild(chev);
      toggle.appendChild(document.createTextNode(monthLabel(key + "-01")));
      var badge = document.createElement("span");
      badge.className = "mbadge";
      badge.textContent = groups[key].filter(function (d) { return (data[d] || []).length > 0; }).length || "·";
      toggle.appendChild(badge);
      toggle.dataset.tip = entryTotal + " entr" + (entryTotal === 1 ? "y" : "ies") + " — click to " + (open ? "fold" : "unfold") + " the month";
      toggle.addEventListener("click", function () {
        monthOpen[key] = !monthIsOpen(key);
        renderSidebar();
        markScrollable();
      });
      // dragging a task over a folded month unfolds it
      toggle.addEventListener("dragenter", function () {
        if (!monthIsOpen(key)) { monthOpen[key] = true; renderSidebar(); }
      });

      var goto = document.createElement("button");
      goto.className = "mgoto";
      goto.appendChild(icon("grid"));
      goto.dataset.tip = "Open " + monthLabel(key + "-01") + " in the Month view";
      goto.setAttribute("aria-label", "Open " + monthLabel(key + "-01") + " in the Month view");
      goto.addEventListener("click", function () {
        currentDate = groups[key][0];
        setView("month");
      });

      head.appendChild(toggle);
      head.appendChild(goto);
      headLi.appendChild(head);
      ul.appendChild(headLi);

      if (!open) return;

      groups[key].forEach(function (d) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.className = "dayrow" + (d === currentDate ? " current" : "");
        var label = document.createElement("span");
        var dd = dateObj(d);
        label.textContent = DOW[dd.getDay()] + " " + dd.getDate();
        btn.appendChild(label);
        var n = (data[d] || []).length;
        btn.dataset.tip = "Open " + prettyDate(d) + (n ? " — " + n + " entr" + (n === 1 ? "y" : "ies") : "");
        if (d === todayISO()) {
          var tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "today";
          btn.appendChild(tag);
        }
        if (n > 0) {
          var count = document.createElement("span");
          count.className = "count";
          count.textContent = n;
          btn.appendChild(count);
        }
        btn.addEventListener("click", function () {
          currentDate = d;
          editingId = null;
          render();
        });
        btn.dataset.day = d;
        makeDropTarget(btn, function () { return d; });
        li.appendChild(btn);
        ul.appendChild(li);
      });
    });
  }

  // ---------- jobs sidebar ----------
  var renamingJob = null;

  // Most recently worked jobs first; jobs with nothing logged sit at the end.
  function renderJobs() {
    var stats = jobStats();
    $("jobCount").textContent = jobs.length ? "· " + jobs.length : "";

    var opts = $("jobOptions");
    opts.innerHTML = "";
    var sorted = jobs.slice().sort(function (a, b) {
      var la = stats[a.id] ? stats[a.id].last : "", lb = stats[b.id] ? stats[b.id].last : "";
      if (la !== lb) return la < lb ? 1 : -1;
      return a.text.localeCompare(b.text);
    });
    sorted.forEach(function (j) {
      var o = document.createElement("option");
      o.value = j.text;
      opts.appendChild(o);
    });

    var ul = $("jobList");
    ul.innerHTML = "";
    if (jobs.length === 0) {
      var li0 = document.createElement("li");
      var span = document.createElement("span");
      span.className = "nothing";
      span.textContent = "No jobs yet — type one in the Job box";
      li0.appendChild(span);
      ul.appendChild(li0);
      return;
    }

    sorted.forEach(function (j) {
      var st = stats[j.id];
      var li = document.createElement("li");
      li.className = "row" + (view === "job" && currentJob === j.id ? " current" : "");

      if (renamingJob === j.id) {
        var input = document.createElement("input");
        input.type = "text";
        input.className = "jobedit";
        input.value = j.text;
        input.maxLength = JOB_MAX;
        input.setAttribute("aria-label", "Rename job " + j.text);
        var done = false;
        var finish = function (keep) {
          if (done) return;
          done = true;
          renamingJob = null;
          if (keep) renameJob(j.id, input.value);
          render();
        };
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
        input.addEventListener("blur", function () { finish(true); });
        li.appendChild(input);
        ul.appendChild(li);
        setTimeout(function () { input.focus(); input.select(); }, 0);
        return;
      }

      var dot = document.createElement("button");
      dot.className = "jobdot";
      tintJob(dot, j.id);
      li.style.setProperty("--job", jobColor(j));
      dot.dataset.tip = "Change this job's colour";
      dot.setAttribute("aria-label", "Change colour of job " + j.text);
      dot.addEventListener("click", function () {
        j.color = ((validColor(j.color) ? j.color : 0) + 1) % JOB_COLORS.length;
        saveJobs();
        render();
      });
      li.appendChild(dot);

      var row = document.createElement("button");
      row.className = "jobrow";
      row.appendChild(icon("job"));
      var name = document.createElement("span");
      name.className = "jn";
      name.textContent = j.text;
      row.appendChild(name);
      if (st) {
        var count = document.createElement("span");
        count.className = "count";
        count.textContent = st.n;
        row.appendChild(count);
      }
      var open = wishlist.filter(function (it) { return it.job === j.id; }).length +
        recurring.filter(function (it) { return it.job === j.id; }).length;
      row.dataset.tip = (st
        ? st.n + " entr" + (st.n === 1 ? "y" : "ies") + " over " + st.days.length + " day" + (st.days.length === 1 ? "" : "s")
        : "Nothing logged yet") +
        (open ? " · " + open + " on the wishlist/recurring" : "") + " — click to see it all";
      row.setAttribute("aria-label", "Open job " + j.text + (st ? ", " + st.n + " entries" : ""));
      row.addEventListener("click", function () { openJob(j.id); });

      var ren = document.createElement("button");
      ren.className = "wbtn ren";
      ren.appendChild(icon("pencil"));
      ren.dataset.tip = "Rename this job";
      ren.setAttribute("aria-label", "Rename job " + j.text);
      ren.addEventListener("click", function () {
        renamingJob = j.id;
        renderJobs();
      });

      var kill = document.createElement("button");
      kill.className = "wbtn kill";
      kill.appendChild(icon("x"));
      kill.dataset.tip = "Delete this job — its entries stay in the log. You can Undo";
      kill.setAttribute("aria-label", "Delete job " + j.text);
      kill.addEventListener("click", function () { removeJob(j.id); });

      li.appendChild(row);
      li.appendChild(ren);
      li.appendChild(kill);
      li.dataset.job = j.id;
      makeJobDropTarget(li, function () { return j.id; });
      ul.appendChild(li);
    });
  }

  function addJobFromSide() {
    var input = $("newJobSide");
    var name = cleanJobName(input.value);
    if (name === "") return;
    if (jobByName(name)) {
      toast("“" + jobByName(name).text + "” is already a job");
    } else {
      ensureJob(name);
      toast("Job added — pick it in the Job box to log against it");
    }
    input.value = "";
    renderJobs();
    input.focus();
  }

  function renameJob(id, name) {
    var j = jobById(id);
    var clean = cleanJobName(name);
    if (!j || clean === "" || clean === j.text) return;
    var other = jobByName(clean);
    if (other && other.id !== id) { toast("There's already a job called “" + other.text + "”"); return; }
    var old = j.text;
    j.text = clean;
    saveJobs();
    retargetJobBoxes(old, clean);
  }

  function removeJob(id) {
    var i = jobs.findIndex(function (j) { return j.id === id; });
    if (i === -1) return;
    var gone = jobs.splice(i, 1)[0];
    // entries, wishlist and recurring items all keep their place, minus the job
    var touched = [];
    function strip(it) { if (it.job === id) { touched.push(it); delete it.job; } }
    Object.keys(data).forEach(function (d) { (data[d] || []).forEach(strip); });
    wishlist.forEach(strip);
    recurring.forEach(strip);
    // job boxes shouldn't keep offering a job that no longer exists
    retargetJobBoxes(gone.text, "");
    function saveAll() { saveJobs(); save(); saveWishlist(); saveRecurring(); }
    saveAll();
    render();
    toast("Job deleted" + (touched.length ? " — the " + touched.length + " item" + (touched.length === 1 ? "" : "s") + " on it stay, without the job" : ""), function () {
      jobs.splice(Math.min(i, jobs.length), 0, gone);
      touched.forEach(function (it) { it.job = gone.id; });
      saveAll();
      render();
    });
  }

  // Every "Job (optional)" box behaves the same: it stays set between adds,
  // matches an existing job whatever the case, and ✕ clears it. The boxes
  // are registered so a rename or delete reaches all of them.
  var jobBoxes = {};
  function registerJobBox(key, input, wrap, clearBtn, tips) {
    var box = { input: input, wrap: wrap, tips: tips };
    jobBoxes[key] = box;
    input.addEventListener("input", function () { syncJobInput(box); });
    input.addEventListener("change", function () { syncJobInput(box); });
    input.addEventListener("blur", function () {
      var known = jobByName(input.value);
      setJobInput(box, known ? known.text : cleanJobName(input.value)); // the job's exact spelling
    });
    clearBtn.addEventListener("click", function () {
      setJobInput(box, "");
      input.focus();
    });
    syncJobInput(box);
    return box;
  }
  function syncJobInput(box) {
    var v = cleanJobName(box.input.value);
    box.wrap.classList.toggle("set", v !== "");
    var known = jobByName(v);
    box.wrap.dataset.tip = v === "" ? box.tips.empty
      : (known ? box.tips.set + " “" + known.text + "”" : "New job “" + v + "” — created when you add") + " · ✕ to stop";
  }
  function setJobInput(box, name) {
    box.input.value = name;
    syncJobInput(box);
  }
  function setJobBox(name) { setJobInput(jobBoxes.main, name); }
  // After a rename (newName) or delete (""), boxes showing the old name follow.
  function retargetJobBoxes(oldName, newName) {
    Object.keys(jobBoxes).forEach(function (k) {
      var box = jobBoxes[k];
      if (cleanJobName(box.input.value).toLowerCase() === oldName.toLowerCase()) setJobInput(box, newName);
    });
  }

  // Import merging. A file that carries jobs (ctx.jobAware) treats the same
  // words on different jobs as different items; a file from before jobs
  // can't tell, so the same words count as a duplicate whatever the job.
  // A job in the file fills in a job-less item that was already here — so
  // re-importing a newer backup upgrades older copies — but never one this
  // same import just added, which keeps a backup's own rows apart.
  // Returns "added", "updated" or "dup".
  function newImport(jobAware) { return { jobAware: jobAware, fresh: {} }; }
  function mergeItem(list, text, jobId, ctx) {
    var same = list.filter(function (it) { return it.text === text; });
    var jobOf = function (it) { return jobById(it.job) ? it.job : null; };
    if (!ctx.jobAware) {
      if (same.length) return "dup";
    } else {
      if (same.some(function (it) { return jobOf(it) === (jobId || null); })) return "dup";
      var bare = jobId && same.find(function (it) { return !jobOf(it) && !ctx.fresh[it.id]; });
      if (bare) { bare.job = jobId; return "updated"; }
    }
    var item = { id: newId(), text: text };
    if (jobId) item.job = jobId;
    list.push(item);
    ctx.fresh[item.id] = true;
    return "added";
  }

  // ---------- entries anywhere ----------
  // Entry ids are unique across the whole log, so an id alone finds one —
  // which lets the Day, Week and Job views share edit, delete and move.
  function findEntry(id) {
    var days = Object.keys(data);
    for (var i = 0; i < days.length; i++) {
      var list = data[days[i]] || [];
      for (var k = 0; k < list.length; k++) {
        if (list[k].id === id) return { day: days[i], index: k, item: list[k] };
      }
    }
    return null;
  }

  function moveEntry(id, toDay) {
    var f = findEntry(id);
    if (!f || !toDay || f.day === toDay) return false;
    data[f.day].splice(f.index, 1);
    if (!data[toDay]) data[toDay] = [];
    data[toDay].push(f.item);
    if (editingId === id) editingId = null;
    save();
    render();
    toast("Moved to " + shortDow(toDay) + " " + toDay, function () {
      removeEntryById(toDay, id);
      if (!data[f.day]) data[f.day] = [];
      data[f.day].splice(Math.min(f.index, data[f.day].length), 0, f.item);
      save();
      render();
    });
    return true;
  }

  // Dropping anything — an entry, a wishlist or a recurring item — on a job
  // links it to that job.
  function makeJobDropTarget(el, getJob) {
    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "link";
      el.classList.add("droptarget");
    });
    el.addEventListener("dragleave", function (e) {
      if (!el.contains(e.relatedTarget)) el.classList.remove("droptarget");
    });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("droptarget");
      linkToJob(e.dataTransfer.getData("text/plain"), getJob());
    });
  }

  function linkToJob(payload, jobId) {
    var job = jobById(jobId);
    var kind = payload.charAt(0), id = payload.slice(2), item = null;
    if (!job || payload.charAt(1) !== ":") return;
    if (kind === "e") {
      var f = findEntry(id);
      item = f && f.item;
    } else if (kind === "w" || kind === "r") {
      item = queueList(kind).find(function (it) { return it.id === id; });
    }
    if (!item) return;
    if (item.job === jobId) { toast("Already on “" + job.text + "”"); return; }
    var before = item.job;
    var persist = function () { if (kind === "e") save(); else saveQueue(kind); };
    item.job = jobId;
    persist();
    render();
    toast("Linked to “" + job.text + "”", function () {
      if (before) item.job = before; else delete item.job;
      persist();
      render();
    });
  }

  // ---------- wishlist & recurring ----------
  // Drag payloads are prefixed: "w:<id>" wishlist (moves), "r:<id>" recurring
  // (copies), "e:<id>" an entry (moves to the day dropped on).
  function makeDropTarget(el, getDay) {
    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("droptarget");
    });
    el.addEventListener("dragleave", function () {
      el.classList.remove("droptarget");
    });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("droptarget");
      var payload = e.dataTransfer.getData("text/plain");
      if (payload.indexOf("w:") === 0 || payload.indexOf("r:") === 0) {
        sendQueueItem(payload.charAt(0), payload.slice(2), getDay());
      } else if (payload.indexOf("e:") === 0) {
        moveEntry(payload.slice(2), getDay());
      }
    });
  }

  // The two sidebar lists share everything but what logging does:
  // "w" (wishlist) moves the item onto the day, "r" (recurring) copies it.
  var QUEUE = {
    w: { input: "newWish", noun: "wishlist item", removed: "Removed from wishlist" },
    r: { input: "newRec", noun: "recurring task", removed: "Recurring task deleted" }
  };
  function queueList(kind) { return kind === "w" ? wishlist : recurring; }
  function saveQueue(kind) { if (kind === "w") saveWishlist(); else saveRecurring(); }
  function removeEntryById(day, entryId) {
    var list = data[day] || [];
    var k = list.findIndex(function (it) { return it.id === entryId; });
    if (k !== -1) list.splice(k, 1);
  }

  function assignRecurringToDay(id, day) {
    var item = recurring.find(function (it) { return it.id === id; });
    if (!item) return;
    if (!data[day]) data[day] = [];
    var job = jobById(item.job) ? item.job : null;
    var dup = data[day].some(function (it) {
      return it.text === item.text && (jobById(it.job) ? it.job : null) === job;
    });
    if (dup) { toast("Already logged on " + shortDow(day) + " " + day); return; }
    var entry = { id: newId(), text: item.text };
    if (job) entry.job = job;
    data[day].push(entry);
    save();
    render();
    toast("Logged on " + shortDow(day) + " " + day + " — kept in Recurring", function () {
      removeEntryById(day, entry.id);
      save();
      render();
    });
  }

  function moveWishToDay(id, day) {
    var i = wishlist.findIndex(function (it) { return it.id === id; });
    if (i === -1) return;
    var item = wishlist.splice(i, 1)[0];
    if (!data[day]) data[day] = [];
    var entry = { id: newId(), text: item.text };
    if (jobById(item.job)) entry.job = item.job;
    data[day].push(entry);
    saveWishlist();
    save();
    render();
    toast("Moved to " + shortDow(day) + " " + day, function () {
      removeEntryById(day, entry.id);
      wishlist.splice(Math.min(i, wishlist.length), 0, item);
      saveWishlist();
      save();
      render();
    });
  }

  function sendQueueItem(kind, id, day) {
    if (kind === "w") moveWishToDay(id, day); else assignRecurringToDay(id, day);
  }

  function addQueueItem(kind) {
    var input = $(QUEUE[kind].input);
    var v = input.value.trim();
    if (v === "") return;
    var item = { id: newId(), text: v };
    var box = jobBoxes[kind];
    var jid = ensureJob(box.input.value);
    if (jid) {
      item.job = jid;
      setJobInput(box, jobById(jid).text);
    }
    queueList(kind).push(item);
    input.value = "";
    saveQueue(kind);
    render(); // a new job shows up in the Jobs list and Job view too
    input.focus();
  }

  function removeQueueItem(kind, id) {
    var list = queueList(kind);
    var i = list.findIndex(function (it) { return it.id === id; });
    if (i === -1) return;
    var gone = list.splice(i, 1)[0];
    if (queueEdit && queueEdit.id === id) queueEdit = null;
    saveQueue(kind);
    render();
    toast(QUEUE[kind].removed, function () {
      var l = queueList(kind);
      l.splice(Math.min(i, l.length), 0, gone);
      saveQueue(kind);
      render();
    });
  }

  // The list item being edited: { kind, id }; focus is taken once, on open,
  // so unrelated re-renders don't pull the cursor into the sidebar.
  var queueEdit = null;
  var queueEditFocus = false;
  function startQueueEdit(kind, id) {
    queueEdit = { kind: kind, id: id };
    queueEditFocus = true;
    render();
  }

  function buildQueueEditor(kind, item) {
    var li = document.createElement("li");
    li.className = "qediting";

    var input = document.createElement("input");
    input.type = "text";
    input.value = item.text;
    input.setAttribute("aria-label", "Edit " + QUEUE[kind].noun);

    var jobWrap = document.createElement("div");
    jobWrap.className = "jobwrap";
    jobWrap.dataset.tip = "The job this belongs to — pick one, type a new name, or leave empty";
    jobWrap.appendChild(icon("job"));
    var jobInput = document.createElement("input");
    jobInput.type = "text";
    jobInput.setAttribute("list", "jobOptions");
    jobInput.maxLength = JOB_MAX;
    jobInput.placeholder = "No job";
    jobInput.autocomplete = "off";
    jobInput.value = jobName(item);
    jobInput.setAttribute("aria-label", "Job for this " + QUEUE[kind].noun);
    jobWrap.appendChild(jobInput);

    function commit() {
      var v = input.value.trim();
      queueEdit = null;
      if (v === "") { removeQueueItem(kind, item.id); return; }
      item.text = v;
      var jid = ensureJob(jobInput.value);
      if (jid) item.job = jid; else delete item.job;
      saveQueue(kind);
      render();
    }
    function cancel() {
      queueEdit = null;
      render();
    }
    [input, jobInput].forEach(function (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
      });
    });

    var row = document.createElement("div");
    row.className = "qrow";
    var saveBtn = document.createElement("button");
    saveBtn.className = "save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", commit);
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", cancel);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);

    li.appendChild(input);
    li.appendChild(jobWrap);
    li.appendChild(row);
    if (queueEditFocus) {
      queueEditFocus = false;
      setTimeout(function () { input.focus(); input.select(); }, 0);
    }
    return li;
  }

  // Shared renderer for the two sidebar queues (wishlist + recurring).
  function renderQueue(kind, ul, cfg) {
    var list = queueList(kind);
    ul.innerHTML = "";

    if (list.length === 0) {
      var li0 = document.createElement("li");
      li0.style.cursor = "default";
      var span = document.createElement("span");
      span.className = "nothing";
      span.textContent = cfg.emptyText;
      li0.appendChild(span);
      ul.appendChild(li0);
      return;
    }

    list.forEach(function (item) {
      if (queueEdit && queueEdit.kind === kind && queueEdit.id === item.id) {
        ul.appendChild(buildQueueEditor(kind, item));
        return;
      }
      var li = document.createElement("li");
      li.draggable = true;

      var grip = document.createElement("span");
      grip.className = "grip";
      grip.textContent = cfg.grip;

      var body = document.createElement("div");
      body.className = "wbody";
      var txt = document.createElement("div");
      txt.className = "wtxt";
      txt.textContent = item.text;
      txt.dataset.tip = "Click to edit · drag onto the log or any day";
      txt.addEventListener("click", function () { startQueueEdit(kind, item.id); });
      body.appendChild(txt);
      var pill = jobPill(item);
      if (pill) {
        pill.draggable = false;
        body.appendChild(pill);
      }

      li.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", kind + ":" + item.id);
        e.dataTransfer.effectAllowed = "linkMove"; // move onto a day, link onto a job
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", function () {
        li.classList.remove("dragging");
      });

      var send = document.createElement("button");
      send.className = "wbtn send";
      send.appendChild(icon("send"));
      send.dataset.tip = cfg.sendTitle + " (" + shortDow(currentDate) + " " + currentDate + ")";
      send.setAttribute("aria-label", cfg.sendTitle);
      send.addEventListener("click", function () { sendQueueItem(kind, item.id, currentDate); });

      var edit = document.createElement("button");
      edit.className = "wbtn edit";
      edit.appendChild(icon("pencil"));
      edit.dataset.tip = "Edit the text or set its job";
      edit.setAttribute("aria-label", "Edit " + QUEUE[kind].noun);
      edit.addEventListener("click", function () { startQueueEdit(kind, item.id); });

      var kill = document.createElement("button");
      kill.className = "wbtn kill";
      kill.appendChild(icon("x"));
      kill.dataset.tip = cfg.killTitle + " — you can Undo";
      kill.setAttribute("aria-label", cfg.killTitle);
      kill.addEventListener("click", function () { removeQueueItem(kind, item.id); });

      li.appendChild(grip);
      li.appendChild(body);
      li.appendChild(send);
      li.appendChild(edit);
      li.appendChild(kill);
      ul.appendChild(li);
    });
  }

  function renderWishlist() {
    $("wishCount").textContent = wishlist.length ? "· " + wishlist.length : "";
    renderQueue("w", $("wishList"), {
      grip: "⣿",
      emptyText: "Nothing queued",
      sendTitle: "Log on open day",
      killTitle: "Delete from wishlist"
    });
  }

  function renderRecurring() {
    $("recCount").textContent = recurring.length ? "· " + recurring.length : "";
    renderQueue("r", $("recList"), {
      grip: "⟳",
      emptyText: "No recurring tasks",
      sendTitle: "Log on open day, keep here",
      killTitle: "Delete recurring task"
    });
  }

  // ---------- actions ----------
  function addItem() {
    var input = $("newItem");
    var v = input.value.trim();
    if (v === "") return;
    var entry = { id: newId(), text: v };
    var jid = ensureJob($("newJob").value);
    if (jid) {
      entry.job = jid;
      setJobBox(jobById(jid).text); // tidy the box to the job's canonical name
    }
    items().push(entry);
    input.value = "";
    save();
    render();
    var last = $("itemList").lastElementChild;
    if (last) last.classList.add("new"); // slide-in for just the new entry
    input.focus();
  }

  function removeItem(id) {
    var f = findEntry(id);
    if (!f) return;
    var day = f.day, i = f.index;
    var gone = data[day].splice(i, 1)[0];
    if (editingId === id) editingId = null;
    save();
    render();
    toast("Entry deleted", function () {
      if (!data[day]) data[day] = [];
      data[day].splice(Math.min(i, data[day].length), 0, gone);
      save();
      render();
    });
  }

  // Entries carry their job in brackets — except in the Job view, where
  // every line belongs to the job named in the heading.
  function dayAsText(iso, withHeading, onlyJob) {
    var list = (data[iso] || []).filter(function (it) { return !onlyJob || it.job === onlyJob; });
    var lines = list.map(function (it) {
      var j = onlyJob ? "" : jobName(it);
      return (withHeading ? "- " : "") + it.text + (j ? " (" + j + ")" : "");
    });
    if (withHeading) lines.unshift(prettyDate(iso), "");
    return lines.join("\n");
  }

  // What the copy buttons copy follows the active view: day, week, or month.
  function viewAsText(withHeading) {
    var days;
    if (view === "job") {
      var st = jobStats()[currentJob];
      if (!st) return "";
      var body = st.days.slice().sort().map(function (iso) {
        return dayAsText(iso, withHeading, currentJob);
      }).join(withHeading ? "\n\n" : "\n");
      return withHeading ? jobById(currentJob).text + "\n\n" + body : body;
    }
    if (view === "week") {
      days = [];
      for (var i = 0; i < 7; i++) days.push(shiftDay(weekStart(currentDate), i));
    } else if (view === "month") {
      var d = dateObj(currentDate);
      var n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      days = [];
      for (var day = 1; day <= n; day++) days.push(isoOf(new Date(d.getFullYear(), d.getMonth(), day)));
    } else {
      days = [currentDate];
    }
    return days.filter(function (iso) {
      return (data[iso] || []).length > 0;
    }).map(function (iso) {
      return dayAsText(iso, withHeading);
    }).join("\n\n");
  }

  function copyText(text, doneMsg, emptyMsg) {
    if (text.trim() === "") { toast(emptyMsg || "Nothing to copy"); return; }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(doneMsg); }
      catch (e) { toast("Copy failed — select and copy manually"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(doneMsg); }, fallback);
    } else {
      fallback();
    }
  }

  var toastTimer;
  // Pass an undo function to get an Undo button; those toasts linger longer.
  function toast(msg, undo, ms) {
    var t = $("toast");
    t.textContent = "";
    t.appendChild(document.createTextNode(msg));
    if (undo) {
      var b = document.createElement("button");
      b.className = "undo";
      b.textContent = "Undo";
      b.addEventListener("click", function () {
        clearTimeout(toastTimer);
        t.classList.remove("show");
        undo();
      });
      t.appendChild(b);
    }
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || (undo ? 6000 : 2600));
  }

  function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // ---------- CSV ----------
  // Handles quoted fields, "" escapes, CRLF, and auto-detects , ; or tab.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    var firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
    var delim = ",";
    var best = (firstLine.match(/,/g) || []).length;
    [[";", (firstLine.match(/;/g) || []).length], ["\t", (firstLine.match(/\t/g) || []).length]]
      .forEach(function (c) { if (c[1] > best) { best = c[1]; delim = c[0]; } });

    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (f) { return f.trim() !== ""; });
    });
  }

  function csvQuote(s) {
    return /[",;\t\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    var days = Object.keys(data).sort();
    if (days.length === 0 && jobs.length === 0 && wishlist.length === 0 && recurring.length === 0) {
      toast("Nothing to export");
      return;
    }
    var lines = ["Date,Task,Job"];
    var used = {};
    function row(first, it) {
      if (jobById(it.job)) used[it.job] = true;
      lines.push(first + "," + csvQuote(it.text) + "," + csvQuote(jobName(it)));
    }
    days.forEach(function (d) {
      data[d].forEach(function (it) { row(d, it); });
    });
    // The lists ride along with "Wishlist" / "Recurring" in the Date column.
    wishlist.forEach(function (it) { row("Wishlist", it); });
    recurring.forEach(function (it) { row("Recurring", it); });
    // Jobs nothing points at still belong in the export: a row with only
    // the Job column recreates them on import.
    jobs.forEach(function (j) {
      if (!used[j.id]) lines.push(",," + csvQuote(j.text));
    });
    // BOM so Excel opens it as UTF-8
    downloadFile("docket-export-" + todayISO() + ".csv", "﻿" + lines.join("\r\n"), "text/csv");
    toast("CSV exported");
  }

  // Expected shape: one entry per row — date in the first column, task in the
  // second (extra columns are appended to the task). A header row naming the
  // third column "Job" (or Project/Client) makes that column the entry's job.
  // Merges, skips duplicates.
  function importCSV(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var rows = parseCSV(String(reader.result));
      if (rows.length === 0) { toast("CSV is empty"); return; }
      var LIST_ROW = /^(wishlist|recurring)$/i;
      var first = String(rows[0][0] || "").trim();
      var start = parseDateFlexible(first) || LIST_ROW.test(first) ? 0 : 1; // skip header row
      var jobCol = start === 1 && /^(job|project|client|group)$/i.test(String(rows[0][2] || "").trim());
      var added = 0, skipped = 0, filled = 0, daysTouched = {};
      var ctx = newImport(jobCol);
      var listAdded = { w: 0, r: 0 };
      var jobsBefore = jobs.length;
      for (var i = start; i < rows.length; i++) {
        var day = parseDateFlexible(rows[i][0]);
        var cells = rows[i].map(function (f) { return f.trim(); });
        var jobText = jobCol ? cleanJobName(cells[2]) : "";
        if (jobCol) cells.splice(2, 1);
        var text = cells.slice(1)
          .filter(function (f) { return f !== ""; })
          .join(", ");
        // a job-only row (no date, no task) is a job with nothing logged yet
        if (jobText && cells[0] === "" && text === "") { ensureJob(jobText); continue; }
        var listKind = LIST_ROW.test(cells[0]) ? cells[0].charAt(0).toLowerCase() : null;
        if ((!day && !listKind) || text === "") { skipped++; continue; }
        var target = listKind ? queueList(listKind) : (data[day] || (data[day] = []));
        var result = mergeItem(target, text, ensureJob(jobText), ctx);
        if (result === "dup") { skipped++; continue; }
        if (result === "updated") { filled++; continue; }
        if (listKind) { listAdded[listKind]++; continue; }
        daysTouched[day] = true;
        added++;
      }
      save();
      saveWishlist();
      saveRecurring();
      render();
      var dayCount = Object.keys(daysTouched).length;
      var newJobs = jobs.length - jobsBefore;
      var jobNote = (newJobs ? " · " + newJobs + " new job" + (newJobs === 1 ? "" : "s") : "") +
        (listAdded.w ? " · " + listAdded.w + " to the wishlist" : "") +
        (listAdded.r ? " · " + listAdded.r + " recurring" : "") +
        (filled ? " · " + filled + " given their job" : "");
      if (added === 0 && (newJobs || listAdded.w || listAdded.r || filled)) {
        toast("Imported" + jobNote.replace(/^ ·/, "") + (skipped ? " — " + skipped + " skipped" : ""));
      } else if (added === 0) {
        toast("Nothing imported — " + skipped + " row" + (skipped === 1 ? "" : "s") + " skipped (duplicate or unreadable)" + jobNote);
      } else {
        toast("Imported " + added + " entr" + (added === 1 ? "y" : "ies") +
          " across " + dayCount + " day" + (dayCount === 1 ? "" : "s") + jobNote +
          (skipped ? " — " + skipped + " skipped" : ""));
      }
    };
    reader.readAsText(file);
  }

  // ---------- JSON backup ----------
  function exportData() {
    var payload = {};
    Object.keys(data).forEach(function (d) { payload[d] = data[d]; });
    payload._wishlist = wishlist;
    payload._recurring = recurring;
    payload._jobs = jobs;
    payload._docket = { version: 2, exported: new Date().toISOString() };
    downloadFile("docket-backup-" + todayISO() + ".json",
      JSON.stringify(payload, null, 2), "application/json");
    toast("Backup exported");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = JSON.parse(reader.result);
        if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
          throw new Error("bad format");
        }
        var added = 0, filled = 0;
        var ctx = newImport(Array.isArray(incoming._jobs));
        // Jobs merge by name; the backup's job ids are mapped onto local ones.
        var jobMap = {};
        if (Array.isArray(incoming._jobs)) {
          incoming._jobs.forEach(function (j) {
            if (!j || typeof j.text !== "string" || typeof j.id !== "string") return;
            var had = !!jobByName(j.text);
            var local = ensureJob(j.text, j.color);
            if (local) { jobMap[j.id] = local; if (!had) added++; }
          });
        }
        // Entries, wishlist and recurring all merge by the same rule.
        function mergeAll(incomingList, target) {
          if (!Array.isArray(incomingList)) return;
          incomingList.forEach(function (it) {
            var text = (it && typeof it.text === "string") ? it.text
                     : (typeof it === "string") ? it : null;
            if (!text) return;
            var r = mergeItem(target, text, (it && jobMap[it.job]) || null, ctx);
            if (r === "added") added++;
            if (r === "updated") filled++;
          });
        }
        mergeAll(incoming._wishlist, wishlist);
        mergeAll(incoming._recurring, recurring);
        Object.keys(incoming).forEach(function (day) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(incoming[day])) return;
          if (!data[day]) data[day] = [];
          mergeAll(incoming[day], data[day]);
        });
        save();
        saveWishlist();
        saveRecurring();
        render();
        toast(added === 0 && filled === 0
          ? "Nothing new — everything in that backup is already here"
          : "Imported " + added + " item" + (added === 1 ? "" : "s") +
            (filled ? " · " + filled + " given their job" : ""));
      } catch (e) {
        toast("Import failed — not a valid Docket backup file");
      }
    };
    reader.readAsText(file);
  }

  // ---------- wiring ----------
  makeDropTarget($("logPanel"), function () { return currentDate; });
  makeJobDropTarget($("jobView"), function () { return currentJob; });
  registerJobBox("main", $("newJob"), $("jobWrap"), $("jobClear"), {
    empty: "Job — entries you add go against it, and it stays set so you can log several in a row. Shortcut: J",
    set: "New entries go against"
  });
  registerJobBox("w", $("wishJob"), $("wishJobWrap"), $("wishJobClear"), {
    empty: "Job for new wishlist items (optional) — it stays set for the next one",
    set: "New wishlist items go against"
  });
  registerJobBox("r", $("recJob"), $("recJobWrap"), $("recJobClear"), {
    empty: "Job for new recurring tasks (optional) — it stays set for the next one",
    set: "New recurring tasks go against"
  });
  // Enter in a list's job box adds what's typed, or moves on to typing it.
  ["w", "r"].forEach(function (kind) {
    var input = $(QUEUE[kind].input);
    $(kind === "w" ? "addWishBtn" : "addRecBtn").addEventListener("click", function () { addQueueItem(kind); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addQueueItem(kind);
    });
    jobBoxes[kind].input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.value.trim() !== "") addQueueItem(kind); else input.focus();
      }
      if (e.key === "Escape") setJobInput(jobBoxes[kind], "");
    });
  });
  $("addBtn").addEventListener("click", addItem);
  $("newJob").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      // with words already typed, Enter adds them; otherwise move on to typing
      if ($("newItem").value.trim() !== "") addItem(); else $("newItem").focus();
    }
    if (e.key === "Escape") { setJobBox(""); }
  });
  $("addJobBtn").addEventListener("click", addJobFromSide);
  $("newJobSide").addEventListener("keydown", function (e) {
    if (e.key === "Enter") addJobFromSide();
  });
  $("logJobBtn").addEventListener("click", function () {
    var j = jobById(currentJob);
    if (j) setJobBox(j.text);
    focusNewItem();
  });
  $("newItem").addEventListener("keydown", function (e) {
    if (e.key === "Enter") addItem();
  });
  $("datePick").addEventListener("change", function () {
    if (this.value) { currentDate = this.value; editingId = null; render(); }
  });
  $("navDate").addEventListener("click", function () {
    var input = $("datePick");
    if (input.showPicker) { try { input.showPicker(); return; } catch (e) {} }
    input.click();
  });
  function shiftForView(dir) {
    if (view === "job") return; // a job isn't a stretch of dates
    if (view === "week") currentDate = shiftDay(currentDate, 7 * dir);
    else if (view === "month") currentDate = shiftMonth(currentDate, dir);
    else currentDate = shiftDay(currentDate, dir);
    editingId = null;
    render();
  }
  $("prevDay").addEventListener("click", function () { shiftForView(-1); });
  $("nextDay").addEventListener("click", function () { shiftForView(1); });
  function goToday() {
    currentDate = todayISO();
    editingId = null;
    if (view === "job") setView("day"); else render();
  }
  $("todayBtn").addEventListener("click", goToday);
  var tabBtns = document.querySelectorAll("#viewTabs button");
  for (var t = 0; t < tabBtns.length; t++) {
    tabBtns[t].addEventListener("click", function () { setView(this.dataset.view); });
  }
  function focusNewItem() {
    if (view !== "day") setView("day");
    $("newItem").focus();
    $("newItem").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  $("fab").addEventListener("click", focusNewItem);
  function copyView(withHeading) {
    var noun = view === "week" ? "week" : view === "month" ? "month" : view === "job" ? "job" : "day";
    var empty = "Nothing to copy — this " + noun + " has no entries";
    if (withHeading) {
      copyText(viewAsText(true), noun.charAt(0).toUpperCase() + noun.slice(1) + " copied to clipboard", empty);
    } else {
      copyText(viewAsText(false), "Entries copied to clipboard", empty);
    }
  }
  $("copyDay").addEventListener("click", function () { copyView(true); });
  $("copyPlain").addEventListener("click", function () { copyView(false); });
  $("clearDay").addEventListener("click", function () {
    var day = currentDate;
    var gone = data[day] || [];
    if (gone.length === 0) { toast("Day is already empty"); return; }
    delete data[day];
    editingId = null;
    save();
    render();
    toast("Cleared " + gone.length + " entr" + (gone.length === 1 ? "y" : "ies"), function () {
      data[day] = gone;
      save();
      render();
    });
  });
  $("csvExportBtn").addEventListener("click", exportCSV);
  $("csvImportBtn").addEventListener("click", function () { $("csvFile").click(); });
  $("csvFile").addEventListener("change", function () {
    if (this.files && this.files[0]) importCSV(this.files[0]);
    this.value = "";
  });
  $("exportBtn").addEventListener("click", exportData);
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    if (this.files && this.files[0]) importData(this.files[0]);
    this.value = "";
  });

  // ---------- clear data ----------
  // Wipes the chosen stores so a backup can be re-imported onto a clean
  // slate. A snapshot backs the Undo, since this is the one big-red-button.
  var clearOpener = null;
  var CLEAR_OPTS = [
    { box: "clrLog", key: "log" },
    { box: "clrJobs", key: "jobs" },
    { box: "clrWish", key: "wish" },
    { box: "clrRec", key: "rec" }
  ];
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function entryTotals() {
    var n = 0, days = 0;
    Object.keys(data).forEach(function (d) {
      var c = (data[d] || []).length;
      n += c;
      if (c) days++;
    });
    return { n: n, days: days };
  }
  function clearPicks() {
    var picks = {};
    CLEAR_OPTS.forEach(function (o) { picks[o.key] = $(o.box).checked; });
    return picks;
  }
  function syncClearDialog() {
    var t = entryTotals();
    var counts = { log: t.n, jobs: jobs.length, wish: wishlist.length, rec: recurring.length };
    $("clrLogN").textContent = t.n ? plural(t.n, "entry", "entries") + " over " + plural(t.days, "day", "days") : "empty";
    $("clrJobsN").textContent = jobs.length ? plural(jobs.length, "job", "jobs") : "empty";
    $("clrWishN").textContent = wishlist.length ? plural(wishlist.length, "item", "items") : "empty";
    $("clrRecN").textContent = recurring.length ? plural(recurring.length, "task", "tasks") : "empty";
    var p = clearPicks();
    var anything = CLEAR_OPTS.some(function (o) { return p[o.key] && counts[o.key] > 0; });
    $("clearGo").disabled = !anything;
    var all = CLEAR_OPTS.every(function (o) { return p[o.key]; });
    $("clearGo").textContent = all ? "Clear everything" : "Clear selected";
    var keptWithJobs = (!p.log && t.n) || (!p.wish && wishlist.length) || (!p.rec && recurring.length);
    $("clearWarn").textContent = p.jobs && jobs.length && keptWithJobs
      ? "Anything you keep will lose its job — the items themselves stay."
      : (!anything ? "Nothing to clear with that selection." : "");
  }
  function openClear() {
    clearOpener = document.activeElement;
    CLEAR_OPTS.forEach(function (o) { $(o.box).checked = true; });
    var b = $("clearBackup");
    b.classList.remove("done");
    b.lastChild.textContent = "Export JSON";
    syncClearDialog();
    $("clearOverlay").classList.add("open");
    $("clearCancel").focus();
  }
  function closeClear() {
    $("clearOverlay").classList.remove("open");
    var back = clearOpener && document.contains(clearOpener) && clearOpener.offsetParent !== null
      ? clearOpener : $("clearAllBtn");
    clearOpener = null;
    if (back) back.focus();
  }
  function clearData(p) {
    var snap = JSON.stringify({ data: data, jobs: jobs, wishlist: wishlist, recurring: recurring });
    var gone = [];
    var t = entryTotals();
    if (p.log && t.n) { data = {}; gone.push(plural(t.n, "entry", "entries")); }
    if (p.jobs && jobs.length) {
      gone.push(plural(jobs.length, "job", "jobs"));
      jobs = [];
      Object.keys(data).forEach(function (d) {
        (data[d] || []).forEach(function (it) { delete it.job; });
      });
      wishlist.forEach(function (it) { delete it.job; });
      recurring.forEach(function (it) { delete it.job; });
      Object.keys(jobBoxes).forEach(function (k) { setJobInput(jobBoxes[k], ""); });
    }
    if (p.wish && wishlist.length) { gone.push(plural(wishlist.length, "wishlist item", "wishlist items")); wishlist = []; }
    if (p.rec && recurring.length) { gone.push(plural(recurring.length, "recurring task", "recurring tasks")); recurring = []; }
    if (gone.length === 0) return;
    editingId = null;
    renamingJob = null;
    queueEdit = null;
    save();
    saveJobs();
    saveWishlist();
    saveRecurring();
    render();
    toast("Cleared " + gone.join(", "), function () {
      var s = JSON.parse(snap);
      data = s.data;
      jobs = s.jobs;
      wishlist = s.wishlist;
      recurring = s.recurring;
      save();
      saveJobs();
      saveWishlist();
      saveRecurring();
      render();
      toast("Restored — everything is back");
    }, 15000);
  }
  $("clearAllBtn").addEventListener("click", openClear);
  $("clearClose").addEventListener("click", closeClear);
  $("clearCancel").addEventListener("click", closeClear);
  $("clearOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeClear();
  });
  CLEAR_OPTS.forEach(function (o) { $(o.box).addEventListener("change", syncClearDialog); });
  $("clearBackup").addEventListener("click", function () {
    exportData();
    this.classList.add("done");
    this.lastChild.textContent = "Backup saved ✓";
  });
  $("clearGo").addEventListener("click", function () {
    var p = clearPicks();
    closeClear();
    clearData(p);
  });

  // ---------- help ----------
  var HELP_KEY = "track.helpseen.v1";
  var helpOpener = null;
  function openHelp() {
    helpOpener = document.activeElement;
    $("helpOverlay").classList.add("open");
    $("helpDone").focus();
  }
  function closeHelp() {
    $("helpOverlay").classList.remove("open");
    try { localStorage.setItem(HELP_KEY, "1"); } catch (e) {}
    // Send focus back where it came from; falling back to the entry box,
    // which only exists in Day view.
    var back = helpOpener && document.contains(helpOpener) && helpOpener.offsetParent !== null
      ? helpOpener
      : (view === "day" ? $("newItem") : $("helpBtn"));
    helpOpener = null;
    if (back) back.focus();
  }
  // aria-modal="true" is a promise to assistive tech that the rest of the
  // page is out of reach; without a trap, Tab broke that promise immediately.
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    var f = this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var list = [];
    for (var i = 0; i < f.length; i++) {
      if (!f[i].disabled && f[i].offsetParent !== null) list.push(f[i]);
    }
    if (list.length === 0) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  $("helpOverlay").addEventListener("keydown", trapFocus);
  $("clearOverlay").addEventListener("keydown", trapFocus);
  $("helpBtn").addEventListener("click", openHelp);
  $("helpClose").addEventListener("click", closeHelp);
  $("helpDone").addEventListener("click", closeHelp);
  $("helpOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeHelp();
  });
  // ---------- keyboard shortcuts ----------
  // Active anywhere except while typing in a field or editing text.
  document.addEventListener("keydown", function (e) {
    var helpOpen = $("helpOverlay").classList.contains("open");
    if (e.key === "Escape" && helpOpen) { closeHelp(); return; }
    if ($("clearOverlay").classList.contains("open")) {
      if (e.key === "Escape") closeClear();
      return; // no shortcuts behind an open dialog
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
    if (helpOpen) return;
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); shiftForView(-1); break;
      case "ArrowRight": e.preventDefault(); shiftForView(1); break;
      case "t": case "T": goToday(); break;
      case "d": case "D": setView("day"); break;
      case "w": case "W": setView("week"); break;
      case "m": case "M": setView("month"); break;
      case "n": case "N": case "/": e.preventDefault();
        if (view === "job") $("logJobBtn").click(); else focusNewItem();
        break;
      case "j": case "J": e.preventDefault();
        if (view !== "day") setView("day");
        $("newJob").focus();
        $("newJob").select();
        break;
      case "c": case "C": copyView(true); break;
      case "?": openHelp(); break;
    }
  });

  // ---------- hover hints ----------
  // One fixed tooltip element follows anything carrying a data-tip attribute;
  // being position:fixed, it never gets clipped by the scrolling sidebar lists.
  var tip = document.createElement("div");
  tip.id = "tip";
  document.body.appendChild(tip);
  var tipFor = null;
  function hideTip() {
    tipFor = null;
    tip.classList.remove("show");
  }
  function showTip(t) {
    if (t === tipFor) return;
    if (!t) { hideTip(); return; }
    tipFor = t;
    tip.textContent = t.dataset.tip;
    var r = t.getBoundingClientRect();
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.classList.add("show");
    var x = Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8);
    var y = r.top - tip.offsetHeight - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  document.addEventListener("mouseover", function (e) {
    showTip(e.target && e.target.closest ? e.target.closest("[data-tip]") : null);
  });
  // Keyboard parity: the guide promises a hint on everything, so focus
  // has to raise the same hint the mouse does.
  document.addEventListener("focusin", function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    try { if (!el.matches(":focus-visible")) return; } catch (err) {}
    showTip(el.closest("[data-tip]"));
  });
  document.addEventListener("focusout", hideTip);
  window.addEventListener("resize", markScrollable);
  document.addEventListener("mousedown", hideTip, true);
  document.addEventListener("scroll", hideTip, true);
  document.addEventListener("dragstart", hideTip, true);

  // ---------- theme ----------
  // Auto follows the system; Light and Dark pin one. The <head> script
  // applies a pinned choice before first paint; this keeps it in step.
  var THEME_KEY = "track.theme.v1";
  var THEME_ICONS = {
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>'
  };
  var THEME_NEXT = { auto: "light", light: "dark", dark: "auto" };
  var THEME_LABEL = { auto: "Theme: matches your system", light: "Theme: light", dark: "Theme: dark" };
  function currentTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    return t === "light" || t === "dark" ? t : "auto";
  }
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    var b = $("themeBtn");
    b.querySelector("svg").innerHTML = THEME_ICONS[t];
    b.dataset.tip = THEME_LABEL[t] + " — click for " + THEME_NEXT[t];
    b.setAttribute("aria-label", THEME_LABEL[t] + ". Switch to " + THEME_NEXT[t]);
  }
  $("themeBtn").addEventListener("click", function () {
    var next = THEME_NEXT[currentTheme()];
    try {
      if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next);
    } catch (e) {}
    applyTheme(next);
    hideTip();
    showTip(this); // keep the hint in step with the new state
  });
  applyTheme(currentTheme());

  // ---------- installable app ----------
  // Served over http(s), Docket is a PWA: a manifest makes it installable and
  // a service worker lets it open offline. Opened as a file (file://) neither
  // can work, so both are wired up only when served — the standalone file
  // stays free of console errors.
  var APP_VERSION = "__APP_VERSION__";
  $("appVersion").textContent = "Docket " + APP_VERSION;
  var served = location.protocol === "https:" || location.protocol === "http:";
  if (served) {
    var mf = document.createElement("link");
    mf.rel = "manifest";
    mf.href = "manifest.webmanifest";
    document.head.appendChild(mf);
    var touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (touch) touch.href = "icons/apple-touch-icon.png";
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {
          // offline support is a bonus; the app works fine without it
        });
      });
    }
  }
  var installPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); // show our own button instead of the browser's mini-bar
    installPrompt = e;
    $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(function () {
      installPrompt = null;
      $("installBtn").hidden = true;
    });
  });
  window.addEventListener("appinstalled", function () {
    installPrompt = null;
    $("installBtn").hidden = true;
    toast("Docket installed — open it from your Start menu, dock or desktop");
  });

  render();
  if (!localStorage.getItem(HELP_KEY)) {
    openHelp(); // first run: show the guide
  } else {
    $("newItem").focus();
  }
})();
