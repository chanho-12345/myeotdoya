(function () {
  "use strict";
  var GameCore = window.GameCore;

  var KAKAO_JS_KEY = "9571640b8eab8e91dc39c6bc0018e149";
  try {
    if (window.Kakao && !window.Kakao.isInitialized()) { window.Kakao.init(KAKAO_JS_KEY); }
  } catch (e) {}

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

  function copyLink(url) {
    function fallbackCopy() {
      var tmp = document.createElement("textarea");
      tmp.value = url;
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand("copy"); } catch (e) {}
      tmp.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  // 다른 기기/브라우저에서도 "내가 만든 테스트"를 다시 불러올 수 있게 해주는 복구 코드.
  function getCreatorKey() {
    try { return localStorage.getItem("myeotdoya_creator_key") || ""; } catch (e) { return ""; }
  }
  function saveCreatorKey(key) {
    try { if (key) localStorage.setItem("myeotdoya_creator_key", key); } catch (e) {}
  }

  // 만든 테스트를 "내가 만든 테스트" 보관함(로컬 저장)에 남겨서, 나중에 owner 링크를 잃어버려도 찾을 수 있게 함.
  function saveMyTest(gameId, ownerToken, creatorNickname) {
    try {
      localStorage.setItem("myeotdoya_owner_" + gameId, ownerToken); // 예전 방식도 그대로 유지(하위 호환)
      var raw = localStorage.getItem("myeotdoya_my_tests");
      var list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e2) { list = []; }
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (t) { return t.gameId !== gameId; });
      list.unshift({ gameId: gameId, ownerToken: ownerToken, nickname: creatorNickname, createdAt: Date.now() });
      localStorage.setItem("myeotdoya_my_tests", JSON.stringify(list.slice(0, 30)));
    } catch (e) {}
  }

  function shareViaKakao(shareUrl, shareText) {
    try {
      if (window.Kakao && window.Kakao.isInitialized() && window.Kakao.Share) {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: shareText,
            description: "내가 먼저 답을 골라놨어. 10문제, 1분이면 끝나요.",
            imageUrl: "https://myeotdoya.vercel.app/og-image.png",
            link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
          },
          buttons: [{ title: "테스트 하러 가기", link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }],
        });
        return;
      }
    } catch (e) {}
    copyLink(shareUrl);
    showToast("링크가 복사됐어요. 카카오톡에서 붙여넣어 보내주세요!");
  }

  // 링크를 그냥 복사만 하는 대신, "어디로 보낼지" 고르는 공유 시트를 띄움 (LOVE DNA와 동일한 방식).
  function openShareSheet(shareUrl, shareText) {
    var old = document.getElementById("shareSheetOverlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.className = "share-sheet-overlay";
    overlay.id = "shareSheetOverlay";
    overlay.innerHTML =
      '<div class="share-sheet">' +
      '<div class="share-sheet-title">친구에게 보내기</div>' +
      '<div class="share-sheet-grid">' +
      '<button class="share-sheet-item" data-action="kakao"><span class="share-sheet-ico ico-kakao" style="font-size:16px;font-weight:800;">톡</span><span class="share-sheet-label">카카오톡</span></button>' +
      '<button class="share-sheet-item" data-action="sms"><span class="share-sheet-ico ico-sms" style="font-size:16px;font-weight:800;">문자</span><span class="share-sheet-label">문자</span></button>' +
      '<button class="share-sheet-item" data-action="fb"><span class="share-sheet-ico ico-fb" style="font-size:18px;font-weight:800;">f</span><span class="share-sheet-label">페이스북</span></button>' +
      '<button class="share-sheet-item" data-action="copy"><span class="share-sheet-ico ico-copy" style="font-size:16px;font-weight:800;">복사</span><span class="share-sheet-label">링크 복사</span></button>' +
      "</div>" +
      '<button class="btn btn-ghost share-sheet-cancel" id="shareSheetCancel">닫기</button>' +
      "</div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("show"); });

    function close() {
      overlay.classList.remove("show");
      setTimeout(function () { overlay.remove(); }, 220);
    }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.getElementById("shareSheetCancel").addEventListener("click", close);

    Array.prototype.forEach.call(overlay.querySelectorAll(".share-sheet-item"), function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.getAttribute("data-action");
        if (action === "kakao") {
          shareViaKakao(shareUrl, shareText);
        } else if (action === "sms") {
          var body = encodeURIComponent(shareText + " " + shareUrl);
          var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
          window.location.href = isIOS ? ("sms:&body=" + body) : ("sms:?body=" + body);
        } else if (action === "fb") {
          window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl), "_blank", "noopener,width=600,height=520");
        } else if (action === "copy") {
          copyLink(shareUrl);
          showToast("링크가 복사됐어요!");
        }
        close();
      });
    });
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
        creatorKey: getCreatorKey(),
      }),
    }).then(function (r) { return r.json(); });

    Promise.all([req, minWait])
      .then(function (results) {
        var data = results[0];
        if (!data || !data.gameId) throw new Error("bad response");
        var shareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId);
        var ownerUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId) + "&owner=" + encodeURIComponent(data.ownerToken);
        saveCreatorKey(data.creatorKey);
        saveMyTest(data.gameId, data.ownerToken, nickname);

        stageEl.innerHTML =
          '<div class="q-text" style="text-align:center;">테스트가 만들어졌어요</div>' +
          '<p style="font-size:14px;color:var(--ink-2);text-align:center;margin-top:-8px;">아래 링크를 친구들에게 보내보세요.</p>' +
          '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
          '<button class="btn btn-primary cta-pulse-once" id="copyBtn">친구에게 보내기</button>' +
          '<a class="btn btn-ghost" style="display:block;margin-top:10px;box-sizing:border-box;" href="' + escapeHtml(ownerUrl) + '">내 게임 페이지로 이동 →</a>' +
          '<p class="banner" style="margin-top:16px;">✓ 이 페이지, 자동으로 저장해뒀어요. 나중에 홈 화면 "내가 만든 테스트 보기"에서 언제든 다시 찾을 수 있어요.</p>' +
          '<a class="btn btn-ghost" style="display:block;box-sizing:border-box;" href="./mytests.html">내가 만든 테스트 목록 보기 →</a>' +
          '<p class="footer-note">내 게임 페이지 링크는 나만 가지고 있어야 해요 — 친구들에게는 위의 공유 링크만 보내주세요.</p>';
        playStageAnim();

        document.getElementById("copyBtn").addEventListener("click", function () {
          openShareSheet(shareUrl, nickname + "를 얼마나 아는지 테스트해봐!");
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
