(() => {
  const { TASK, AXES, FIELDS } = window;
  const $ = sel => document.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- 1. 입력 렌더링 ----------
  function renderInput() {
    $("#taskLabel").textContent = TASK.label;

    $("#prompt").innerHTML = TASK.prompt
      .map(s => `<span class="sent ev" data-ev="${s.ev || ""}" data-anchor="${s.anchor}"><span class="num">${s.num}</span>${s.text}</span>`)
      .join(" ");

    $("#history").innerHTML = TASK.history
      .map(h => `<div class="hline ev" data-ev="${h.ev || ""} h-t${h.turn}"><span class="t">turn ${h.turn}</span>${h.text}</div>`)
      .join("");

    $("#objects").innerHTML = TASK.objects.map(o => `
      <div class="obj ev" data-ev="${["o-all", ...(o.ev || [])].join(" ")}" data-rc="${o.rc}" data-anchor="${o.rc}">
        <div class="ty">${o.type}</div>
        <div><span class="rc">${o.rc}</span> <span class="meta">${o.meta}</span></div>
        ${o.body ? `<div class="body">${o.body}</div>` : ""}
      </div>`).join("");

    $("#records").innerHTML = TASK.records
      .map(([k, v]) => `<div class="rec ev" data-ev="r-all r-${k}" data-anchor="${k}"><span class="k">${k}:</span> ${v}</div>`)
      .join("");

    $("#axes").innerHTML = AXES
      .map((a, i) => `<span class="axis" data-i="${i}">${a.key}</span>`)
      .join("");
  }

  // ---------- 2. 단계 정의 ----------
  // 입력 → 할 일 → 축마다 (보는 것 → 판단 → 결론) → 완성
  const PHASES = ["look", "think", "result"];
  const STEPS = [
    { type: "input" },
    // here 항목에 ev가 있으면 항목마다 한 화면, 없으면 필드 전체가 한 화면
    ...FIELDS.flatMap((f, i) => f.here.some(h => h.ev)
      ? f.here.map((_, k) => ({ type: "field", i, k }))
      : [{ type: "field", i, k: Infinity }]),
    { type: "task" },
    ...AXES.flatMap((_, i) => PHASES.map((phase, p) => ({ type: "axis", i, p }))),
    { type: "done" },
  ];

  // ---------- 3. 판단 패널 뷰 ----------
  function fieldView(f) {
    return `
      <h2>${f.name}</h2>
      <p class="q">${f.sub}</p>
      <p class="what">${f.what}</p>
      <div>
        <div class="label">이 문제에서는</div>
        <ul class="here">${f.here.map((h, k) => {
          const text = h.text ?? h;
          return `<li class="part ${h.tone || ""}" data-p="${k}">${text}</li>`;
        }).join("")}</ul>
      </div>`;
  }

  function taskView() {
    return `
      <h2>여기서 할 일:<br>답안 6칸을 채운다</h2>
      <ul class="tasks">
        ${AXES.map(a => `<li><code>${a.key}</code><span>${a.q}</span></li>`).join("")}
      </ul>`;
  }

  // 결론으로 가능한 값들을 늘어놓고, 고른 값은 연출로 초록색 확대 표시한다
  function choicesHtml(c) {
    return `<div class="choices">${c.options.map(o => {
      const v = typeof o === "string" ? o : o.v;
      const d = typeof o === "string" ? "" : `<small>${o.d}</small>`;
      return `<span class="choice${c.pick.includes(v) ? " pick" : ""}">${v}${d}</span>`;
    }).join("")}</div>`;
  }

  function axisView(a) {
    return `
      <h2>${a.key}</h2>
      <p class="q">${a.q}</p>
      <div class="part" data-p="0">
        <div class="label">보는 것</div>
        <ul class="look">${a.look.map(t => typeof t === "string"
          ? `<li>${t}</li>`
          : `<li class="c-${t.color}">${t.text}</li>`).join("")}</ul>
      </div>
      <div class="part" data-p="1">
        <div class="label">판단</div>
        <ol class="think">${a.think.map(t => `<li>${t}</li>`).join("")}</ol>
      </div>
      <div class="part result" data-p="2">
        <div class="label">결론</div>
        ${a.choices ? choicesHtml(a.choices) : ""}
        <div class="v">${a.result}</div>
      </div>`;
  }

  function doneView() {
    return `
      <h2>완성된 답안</h2>
      <div class="answers">
        ${AXES.map(a => `<span class="k">${a.key}</span><span class="v">${a.short}</span>`).join("")}
      </div>
      <p class="note">가상 예시라 공개 정답은 없습니다. 같은 입력을 실제 하네스에 돌린 결과입니다.</p>`;
  }

  // ---------- 화살표: 판단 문장의 참조 → 입력 요소 ----------
  const svg = $("#arrows");
  let arrowToken = 0;

  // 패널 밖으로 잘린 요소에는 화살표를 긋지 않는다
  function visibleIn(r, pane) {
    const p = pane.getBoundingClientRect();
    return r.bottom > p.top && r.top < p.bottom && r.height > 0;
  }

  function clearArrows() {
    arrowToken++;
    svg.querySelectorAll("path.arrow").forEach(p => p.remove());
  }

  // 가장 최근에 드러난 판단 덩어리의 참조만, 문장 순서대로 하나씩 긋는다
  function drawArrows(part, delay) {
    clearArrows();
    if (!part) return;
    const token = arrowToken;
    setTimeout(() => {
      if (token !== arrowToken) return;
      $$(".ref", part).forEach((src, n) => {
        const dst = document.querySelector(`[data-anchor="${src.dataset.to}"]`);
        if (!dst) return;
        const a = src.getBoundingClientRect();
        const b = dst.getBoundingClientRect();
        if (!visibleIn(a, view) || !visibleIn(b, input)) return;
        let d;
        if (b.right < a.left) {
          // 나란히 놓인 화면: 판단(오른쪽) → 입력(왼쪽)
          const x1 = a.left - 4, y1 = a.top + a.height / 2;
          const x2 = b.right + 8, y2 = b.top + b.height / 2;
          const dx = Math.max(60, (x1 - x2) * .45);
          d = `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}`;
        } else {
          // 위아래로 쌓인 화면: 판단(아래) → 입력(위)
          const x1 = a.left + a.width / 2, y1 = a.top - 4;
          const x2 = b.left + b.width / 2, y2 = b.bottom + 8;
          const dy = Math.max(40, (y1 - y2) * .45);
          d = `M${x1},${y1} C${x1},${y1 - dy} ${x2},${y2 + dy} ${x2},${y2}`;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", `arrow ${src.dataset.tone}`);
        path.setAttribute("marker-end", `url(#head-${src.dataset.tone})`);
        svg.appendChild(path);
        const len = path.getTotalLength();
        gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: .5, delay: n * .35, ease: "power2.inOut",
            onComplete: () => path.style.strokeDasharray = src.dataset.tone === "drop" ? "4 4" : "none" });
        src.classList.add("lit");
      });
    }, delay);
  }

  // ---------- 판단 화면 안의 연출 (화살표 → 표시 변경) ----------
  let scriptTimers = [];

  function clearScript() {
    scriptTimers.forEach(clearTimeout);
    scriptTimers = [];
    $$("#view .muted, #view .keep, #view .chosen, #view .faded").forEach(el => el.classList.remove("muted", "keep", "chosen", "faded"));
  }

  // 출발 문구 위쪽 오른쪽 끝에서 올라가 대상 칩의 오른쪽 끝으로 들어가는 곡선
  function localArrow(fromSel, toSel, tone, delay, animate) {
    const from = $(fromSel), to = $(toSel);
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const x1 = a.right - 10, y1 = a.top - 3;
    const x2 = b.right + 10, y2 = b.top + b.height / 2;
    const bow = 40;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${x1},${y1 - 30} ${x2 + bow},${y2} ${x2},${y2}`);
    path.setAttribute("class", `arrow ${tone}`);
    path.setAttribute("marker-end", `url(#head-${tone})`);
    svg.appendChild(path);
    if (!animate) return;
    const len = path.getTotalLength();
    gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: .5, delay, ease: "power2.inOut", onComplete: () => path.style.strokeDasharray = "none" });
  }

  function applyAction(act, animate) {
    if (act.arrow) {
      act.arrow.to.forEach((to, n) => localArrow(act.arrow.from, to, act.arrow.tone, n * .25, animate));
    }
    if (act.mark) {
      Object.entries(act.mark).forEach(([sel, cls]) => $$(sel, view).forEach(el => el.classList.add(cls)));
    }
    if (act.pick) {
      $$(".obj").forEach(el => el.classList.toggle("pick", el.dataset.rc === act.pick));
    }
  }

  // 현재 phase의 동작은 시간차로, 이전 phase의 동작은 끝난 상태로 바로 적용한다
  function runScript(axis, p, instant = false) {
    const script = { ...(axis.script || {}) };
    // 결론 선택지가 있으면 고른 값을 강조하는 동작을 결론 phase에 자동으로 붙인다
    if (axis.choices) {
      script[2] = [...(script[2] || []), { at: 700, mark: { ".choice.pick": "chosen", ".choice:not(.pick)": "faded" } }];
    }
    if (!Object.keys(script).length) return;
    Object.entries(script).forEach(([q, acts]) => {
      if (+q > p) return;
      const now = instant || +q < p;
      acts.forEach(act => {
        if (!now) {
          scriptTimers.push(setTimeout(() => applyAction(act, true), act.at));
        } else if (act.arrow) {
          // 화살표는 스크롤이 끝난 뒤 위치로 그린다
          applyAction({ mark: act.mark, pick: act.pick }, false);
          scriptTimers.push(setTimeout(() => applyAction({ arrow: act.arrow }, false), instant ? 0 : 550));
        } else {
          applyAction(act, false);
        }
      });
    });
  }

  const PHASE_NAME = ["보는 것", "판단", "결론"];
  function stepName(s) {
    if (s.type === "input") return "문제 입력";
    if (s.type === "field") return `입력 · ${FIELDS[s.i].name}`;
    if (s.type === "task") return "할 일";
    if (s.type === "axis") return `${AXES[s.i].key} · ${PHASE_NAME[s.p]}`;
    return "완성된 답안";
  }

  // ---------- 4. 단계 전환 ----------
  const stage = $("#stage");
  const view = $("#view");
  const input = $("#input");
  let current = -1;
  let viewKey = "";

  // 첫 화면: 입력 전체가 한 화면에 들어오도록 축소한다 (안쪽 스크롤 없음)
  function fitInput() {
    const body = $(".input-body");
    body.style.transform = "";
    body.style.width = "";
    if (!stage.classList.contains("mode-input")) return;
    const avail = input.clientHeight - (body.offsetTop - input.offsetTop) - 20;
    // 줄어든 만큼 폭을 늘려 좌우 여백 없이 채운다. 폭이 늘면 줄바꿈이 줄어 높이가
    // 바뀌므로 몇 번 반복해 맞춘다.
    let scale = 1;
    for (let n = 0; n < 4; n++) {
      body.style.width = `${100 / scale}%`;
      const next = Math.min(1, avail / body.scrollHeight);
      if (Math.abs(next - scale) < .01) break;
      scale = next;
    }
    body.style.width = scale < 1 ? `${100 / scale}%` : "";
    if (scale < 1) body.style.transform = `scale(${scale})`;
  }

  function setMode(mode) {
    if (stage.classList.contains(mode)) return;
    const state = Flip.getState(input);
    stage.classList.remove("mode-input", "mode-split");
    stage.classList.add(mode);
    fitInput();
    Flip.from(state, { duration: .6, ease: "power2.inOut" });
    if (mode === "mode-split") {
      gsap.fromTo("#judge", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: .5, delay: .2 });
    }
  }

  function setView(key, html) {
    if (key === viewKey) return false;
    viewKey = key;
    view.innerHTML = html;
    gsap.fromTo(view, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .4, ease: "power2.out" });
    return true;
  }

  // 축 안에서는 단계마다 한 덩어리씩만 추가로 보여준다
  function showParts(p, fresh) {
    $$("#view .part").forEach(el => {
      const visible = +el.dataset.p <= p;
      const appeared = visible && el.hidden && !fresh;
      el.hidden = !visible;
      if (appeared) gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .35, ease: "power2.out" });
    });
    // 판단 패널이 넘치면 방금 드러난 덩어리가 보이도록 내린다
    gsap.to(view, { scrollTop: view.scrollHeight - view.clientHeight, duration: .4, ease: "power2.out" });
  }

  // must: 화살표가 가리킬 요소. 패널 안에 반드시 보이도록 스크롤한다.
  // scope: 이 요소 안의 근거만 강조한다 (입력 설명 단계에서 해당 필드로 한정)
  // tone: "soft"면 덜 눈에 띄는 색으로 강조
  // colors: 근거 키 → 색 이름(a, b). 없으면 기본(청록)
  // segs: 한 줄 안의 구간(.seg) 키 → 색 이름
  function highlight(keys, must = [], scope = input, tone = "", colors = {}, segs = {}) {
    stage.classList.toggle("focus", keys.length > 0);
    const lit = [];
    $$(".input .ev").forEach(el => {
      const on = scope.contains(el) && el.dataset.ev.split(" ").some(k => k && keys.includes(k));
      el.classList.toggle("on", on);
      el.classList.toggle("soft", on && tone === "soft");
      const hit = on && el.dataset.ev.split(" ").find(k => colors[k]);
      ["a", "b", "c"].forEach(c => el.classList.toggle("c-" + c, !!hit && colors[hit] === c));
      el.classList.toggle("has-seg", on && $$(".seg", el).some(sg => segs[sg.dataset.seg]));
      if (on) lit.push(el);
    });
    $$(".input .seg").forEach(sg => {
      const c = scope.contains(sg) ? segs[sg.dataset.seg] : null;
      sg.classList.toggle("on", !!c);
      ["a", "b", "c"].forEach(x => sg.classList.toggle("seg-" + x, c === x));
    });
    if (!lit.length && !must.length) {
      gsap.to(input, { scrollTop: 0, duration: .5, ease: "power2.out" });
      return;
    }
    // 강조된 근거 전체가 들어가면 전체를, 안 들어가면 화살표 대상만 보이게 한다
    const base = input.getBoundingClientRect().top - input.scrollTop;
    const span = els => [
      Math.min(...els.map(el => el.getBoundingClientRect().top)) - base,
      Math.max(...els.map(el => el.getBoundingClientRect().bottom)) - base,
    ];
    const room = input.clientHeight - 60;
    let [top, bottom] = span([...lit, ...must]);
    if (bottom - top > room && must.length) [top, bottom] = span(must);
    let scroll = top - 40;
    if (bottom - scroll > input.clientHeight - 20) scroll = bottom - input.clientHeight + 20;
    gsap.to(input, { scrollTop: Math.max(0, scroll), duration: .5, ease: "power2.out" });
  }

  // 입력 설명 단계: 해당 필드 블록만 밝히고 나머지 블록은 흐리게
  function focusField(key) {
    stage.classList.toggle("field-focus", !!key);
    $$(".blk").forEach(b => b.classList.toggle("field-on", b.dataset.field === key));
  }

  function arrowTargets(part) {
    if (!part) return [];
    return $$(".ref", part)
      .map(r => document.querySelector(`[data-anchor="${r.dataset.to}"]`))
      .filter(Boolean);
  }

  function markAxes(i, done) {
    $$(".axis").forEach(el => {
      const n = +el.dataset.i;
      el.classList.toggle("now", n === i && !done);
      el.classList.toggle("done", n < i || done);
    });
  }

  function show(idx) {
    if (idx === current) return;
    current = idx;
    const s = STEPS[idx];
    $("#stepName").textContent = stepName(s);
    $("#stepNum").textContent = `${idx + 1} / ${STEPS.length}`;
    gsap.to("#stepBar", { width: `${(idx / (STEPS.length - 1)) * 100}%`, duration: .4 });

    clearArrows();
    clearScript();
    // 판단 단계에서는 입력을 줄여서(객체 본문·빈 memory 숨김) 짚는 근거가 한 화면에 모이게 한다
    stage.classList.toggle("compact", s.type === "axis");
    focusField(s.type === "field" ? FIELDS[s.i].key : null);
    $("#judge").classList.toggle("fields", s.type === "field");
    if (s.type === "input") {
      setMode("mode-input");
      viewKey = "";
      highlight([]);
      return;
    }
    setMode("mode-split");

    if (s.type === "field") {
      const f = FIELDS[s.i];
      const fresh = setView("field-" + s.i, fieldView(f));
      showParts(s.k, fresh);
      const item = f.here[s.k] || {};
      const blk = $(`.blk[data-field="${f.key}"]`);
      highlight(item.ev || [], [blk], blk, item.tone);
      drawArrows(view, 600);
      markAxes(-1, false);
    } else if (s.type === "task") {
      setView("task", taskView());
      highlight([]);
      markAxes(-1, false);
    } else if (s.type === "axis") {
      const a = AXES[s.i];
      const fresh = setView("axis-" + s.i, axisView(a));
      showParts(s.p, fresh);
      const part = $(`#view .part[data-p="${s.p}"]`);
      highlight(a.ev, arrowTargets(part), input, "", a.evColor, a.segColor);
      drawArrows(part, 600);
      runScript(a, s.p);
      markAxes(s.i, false);
    } else {
      setView("done", doneView());
      highlight([]);
      markAxes(AXES.length, true);
    }

    // focal_id 결론이 난 뒤에는 확정 객체를 계속 표시
    const focalDone = s.type === "done" || (s.type === "axis" && (s.i > 0 || s.p === 2));
    $$(".obj").forEach(el => el.classList.toggle("pick", focalDone && el.dataset.rc === TASK.focalRef));
  }

  // ---------- 5. 입력 연결: 휠·스와이프·키 한 번 = 한 단계 ----------
  // 전환이 끝날 때까지 막고, 트랙패드 관성 스크롤이 이어지는 동안에도 계속 막는다.
  const LOCK_MS = 220;   // 단계 전환 후 다음 입력을 받기까지의 최소 간격
  const QUIET_MS = 180;  // 이만큼 입력이 멈춰야 다음 제스처로 본다
  let busyUntil = 0;
  let lastBlocked = 0;

  function go(delta, isKey = false) {
    const now = Date.now();
    if (now < busyUntil || (!isKey && now - lastBlocked < QUIET_MS)) { lastBlocked = now; return; }
    const next = Math.max(0, Math.min(STEPS.length - 1, current + delta));
    if (next === current) return;
    busyUntil = now + LOCK_MS;
    show(next);
  }

  renderInput();
  gsap.registerPlugin(Observer, Flip);
  Observer.create({
    target: window,
    type: "wheel,touch",
    wheelSpeed: -1,      // 휠 아래 = 손가락 위로 밀기 = 다음
    tolerance: 10,
    preventDefault: true,
    onUp: () => go(1),
    onDown: () => go(-1),
  });
  window.addEventListener("keydown", e => {
    if (["ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1, true); }
    if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1, true); }
  });

  show(0);
  fitInput();
  window.addEventListener("resize", () => {
    fitInput();
    const s = STEPS[current];
    if (s.type === "axis") {
      clearScript();
      drawArrows($(`#view .part[data-p="${s.p}"]`), 0);
      runScript(AXES[s.i], s.p, true);
    }
    if (s.type === "field") drawArrows(view, 0);
  });
  document.fonts?.ready.then(fitInput);
})();
