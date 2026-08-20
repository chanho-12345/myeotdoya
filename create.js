(function () {
  "use strict";
  var GameCore = window.GameCore;
  var stageEl = document.getElementById("stage");
  var progressWrap = document.getElementById("progressWrap");
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");

  var TOTAL_STEPS = 10; // 객관식 9 + 주관식 1

  var nickname = "";
  var questionIds = GameCore.pickRandomQuestionSet();
  var questions = GameCore.getQuestionsByIds(questionIds);
  var answers = new Array(questions.length).fill(null);
  var subjectivePrompt = "";
  var subjectiveAnswer = "";
  var step = 0; // 0=닉네임, 1~9=질문(questions[step-1]), 10=주관식, 11=완료/제출

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- 공통 연출 헬퍼 ----------
  function playStageAnim() {
    stageEl.classList.remove("stage-anim-in");
    void stageEl.offsetWidth; // reflow로 애니메이션 재시작
    stageEl.classList.add("stage-anim-in");
  }

  function setDepthBg(idx) {
    var section = idx < 3 ? 1 : idx < 6 ? 2 : 3;
    document.body.classList.remove("depth-2", "depth-3");
    if (section === 2) document.body.classList.add("depth-2");
    if (section === 3) document.body.classList.add("depth-3");
  }

  // 구간 전환 문구를 짧게 보여준 뒤 다음 화면으로 넘어감 (별도 페이지 없이 stage 안에서만)
  function renderTransition(text, next) {
    stageEl.innerHTML =
      '<div class="stage-transition">' +
      '<div class="connector"><span class="dot"></span><span class="line"><span class="line-fill" style="width:60%"></span></span><span class="dot"></span></div>' +
      '<p class="stage-transition-text">' + escapeHtml(text) + "</p>" +
      "</div>";
    playStageAnim();
    setTimeout(next, 700);
  }

  function render() {
    if (step === 0) return renderNickname();
    if (step >= 1 && step <= questions.length) return renderQuestion(step - 1);
    if (step === questions.length + 1) return renderSubjective();
    return renderComplete();
  }

  function renderNickname() {
    progressWrap.style.display = "none";
    document.body.classList.remove("depth-2", "depth-3");
    stageEl.innerHTML =
      '<div class="q-text">닉네임을 입력해주세요</div>' +
      '<p style="font-size:13px;color:var(--ink-2);margin:-10px 0 16px;line-height:1.6;">먼저 나에 대한 질문 10개에 스스로 답해주세요.<br/>친구들이 결과·랭킹에서 이 이름으로 나를 보게 돼요.</p>' +
      '<div class="field"><input id="nickInput" type="text" maxlength="12" placeholder="예: 민준" value="' + escapeHtml(nickname) + '"/></div>' +
      '<button class="btn btn-primary" id="nickNextBtn">다음 →</button>';
    playStageAnim();
    var input = document.getElementById("nickInput");
    var btn = document.getElementById("nickNextBtn");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      nickname = v.slice(0, 12);
      step = 1;
      render();
    }
    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function renderQuestion(idx, opts) {
    opts = opts || {};
    var banner = GameCore.depthBannerForIndex(idx);
    if (banner && !opts.skipTransition) {
      renderTransition(banner, function () { renderQuestionCard(idx); });
    } else {
      renderQuestionCard(idx);
    }
  }

  function renderQuestionCard(idx) {
    progressWrap.style.display = "block";
    progressFill.style.width = Math.round(((idx + 1) / TOTAL_STEPS) * 100) + "%";
    progressLabel.textContent = (idx + 1) + " / " + TOTAL_STEPS;
    setDepthBg(idx);
    var q = questions[idx];
    var backHtml = idx === 0
      ? '<div class="q-top-row"><span></span></div>'
      : '<div class="q-top-row"><button class="q-back-btn" id="backBtn">← 이전</button></div>';
    var optsHtml = q.options.map(function (opt, i) {
      var sel = answers[idx] === i ? " selected" : "";
      return '<button class="opt' + sel + '" data-i="' + i + '">' + escapeHtml(opt) + "</button>";
    }).join("");
    stageEl.innerHTML =
      backHtml +
      '<div class="q-index">Q' + (idx + 1) + "</div>" +
      '<div class="q-text">' + escapeHtml(q.text) + "</div>" +
      '<div class="opt-list">' + optsHtml + "</div>";
    playStageAnim();

    var backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        step -= 1;
        renderQuestion(step - 1, { skipTransition: true });
      });
    }
    Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.getAttribute("data-i"), 10);
        answers[idx] = i;
        Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        setTimeout(function () {
          step += 1;
          render();
        }, 200);
      });
    });
  }

  function renderSubjective() {
    progressWrap.style.display = "block";
    progressFill.style.width = "100%";
    progressLabel.textContent = TOTAL_STEPS + " / " + TOTAL_STEPS;
    document.body.classList.add("depth-3");

    var overlay = document.createElement("div");
    overlay.className = "dark-pulse-overlay";
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.remove(); }, 500);

    stageEl.innerHTML =
      '<div class="stage-transition" style="padding:40px 6px;">' +
      '<p class="stage-transition-text">마지막 질문</p>' +
      '<p class="stage-transition-text" style="animation-delay:.4s;font-weight:500;font-size:13.5px;color:var(--ink-2);margin-top:8px;">이건 찍어서 맞힐 수 없어.</p>' +
      "</div>";
    playStageAnim();

    setTimeout(renderSubjectiveForm, 850);
  }

  function renderSubjectiveForm() {
    var pillsHtml = GameCore.SUBJECTIVE_PROMPTS.map(function (p) {
      var sel = subjectivePrompt === p ? " selected" : "";
      return '<button class="pill' + sel + '" data-p="' + escapeHtml(p) + '">' + escapeHtml(p) + "</button>";
    }).join("");

    stageEl.innerHTML =
      '<div class="q-top-row"><button class="q-back-btn" id="backBtn">← 이전</button></div>' +
      '<div class="q-index">Q10 · 주관식</div>' +
      '<div class="q-text">아래 중 하나를 골라서, 내 진짜 답을 적어주세요</div>' +
      '<div class="pill-group" id="promptPills">' + pillsHtml + "</div>" +
      '<div id="subjectiveInputArea" style="margin-top:16px;' + (subjectivePrompt ? "" : "display:none;") + '">' +
      '<div class="field"><label id="chosenPromptLabel">' + escapeHtml(subjectivePrompt) + '</label>' +
      '<input id="subjectiveInput" type="text" maxlength="80" placeholder="솔직하게, 짧게 적어주세요" value="' + escapeHtml(subjectiveAnswer) + '"/></div>' +
      '<button class="btn btn-primary" id="subjectiveNextBtn">완료하기 →</button>' +
      "</div>";
    playStageAnim();

    var backBtn = document.getElementById("backBtn");
    backBtn.addEventListener("click", function () {
      step -= 1;
      render();
    });

    Array.prototype.forEach.call(stageEl.querySelectorAll(".pill"), function (btn) {
      btn.addEventListener("click", function () {
        subjectivePrompt = btn.getAttribute("data-p");
        renderSubjectiveForm();
        var input = document.getElementById("subjectiveInput");
        if (input) input.focus();
      });
    });

    var nextBtn = document.getElementById("subjectiveNextBtn");
    if (nextBtn) {
      var subjInput = document.getElementById("subjectiveInput");
      function go() {
        var v = subjInput.value.trim();
        if (!v) { subjInput.focus(); return; }
        subjectiveAnswer = v.slice(0, 80);

        // 입력을 고정하고, 두 점 사이 연결선이 끝까지 채워지는 걸 보여준 뒤 다음으로.
        subjInput.setAttribute("readonly", "readonly");
        nextBtn.disabled = true;
        var wrap = document.getElementById("subjectiveInputArea");
        var fillBar = document.createElement("div");
        fillBar.className = "connector";
        fillBar.style.marginTop = "16px";
        fillBar.innerHTML = '<span class="dot"></span><span class="line"><span class="line-fill" id="subjLineFill"></span></span><span class="dot"></span>';
        wrap.appendChild(fillBar);
        setTimeout(function () {
          var fill = document.getElementById("subjLineFill");
          if (fill) fill.style.width = "100%";
        }, 60);

        setTimeout(function () {
          step = questions.length + 2;
          render();
        }, 650);
      }
      nextBtn.addEventListener("click", go);
      subjInput.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    }
  }

  function showToast(msg) {
    var t = document.createElement("div");
    t.className = "toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  function renderComplete() {
    progressWrap.style.display = "none";
    stageEl.innerHTML =
      '<div class="calc-card">' +
      '<div class="connector connector-lg"><span class="dot"></span><span class="line"><span class="line-fill" id="createLineFill"></span></span><span class="dot"></span></div>' +
      '<p class="calc-phrase" style="animation-delay:.15s;">테스트를 만드는 중</p>' +
      "</div>";
    playStageAnim();
    setTimeout(function () {
      var f = document.getElementById("createLineFill");
      if (f) f.style.width = "100%";
    }, 100);

    var minWait = new Promise(function (resolve) { setTimeout(resolve, 550); });
    var req = fetch("/api/create-game", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: nickname,
        questionIds: questionIds,
        answers: answers,
        subjectivePrompt: subjectivePrompt,
        subjectiveAnswer: subjectiveAnswer,
      }),
    }).then(function (r) { return r.json(); });

    Promise.all([req, minWait])
      .then(function (results) {
        var data = results[0];
        if (!data || !data.gameId) throw new Error("bad response");
        var shareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId);
        var ownerUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId) + "&owner=" + encodeURIComponent(data.ownerToken);
        try { localStorage.setItem("myeotdoya_owner_" + data.gameId, data.ownerToken); } catch (e) {}

        stageEl.innerHTML =
          '<div class="q-text" style="text-align:center;">테스트가 만들어졌어요</div>' +
          '<p style="font-size:14px;color:var(--ink-2);text-align:center;margin-top:-8px;">아래 링크를 친구들에게 보내서 도전장을 날려보세요.</p>' +
          '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
          '<button class="btn btn-primary cta-pulse-once" id="copyBtn">링크 복사하기</button>' +
          '<a class="btn btn-ghost" style="display:block;margin-top:10px;box-sizing:border-box;" href="' + escapeHtml(ownerUrl) + '">내 게임 페이지로 이동 →</a>' +
          '<p class="footer-note">내 게임 페이지 링크는 나만 가지고 있어야 해요 — 친구들에게는 위의 공유 링크만 보내주세요. 즐겨찾기 해두는 걸 추천해요.</p>';
        playStageAnim();

        var shareInput = document.getElementById("shareUrlInput");
        document.getElementById("copyBtn").addEventListener("click", function () {
          function fallbackCopy() {
            shareInput.select();
            try { document.execCommand("copy"); } catch (e) {}
            showToast("링크가 복사됐어요!");
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(function () { showToast("링크가 복사됐어요!"); }, fallbackCopy);
          } else {
            fallbackCopy();
          }
        });
      })
      .catch(function () {
        stageEl.innerHTML =
          '<p style="text-align:center;color:var(--warn);">게임을 만드는 중 문제가 발생했어요. 다시 시도해주세요.</p>' +
          '<button class="btn btn-primary" id="retryBtn">다시 시도</button>';
        playStageAnim();
        document.getElementById("retryBtn").addEventListener("click", renderComplete);
      });
  }

  render();
})();
