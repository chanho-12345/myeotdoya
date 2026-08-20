(function () {
  "use strict";
  var GameCore = window.GameCore;
  var stageEl = document.getElementById("stage");
  var progressWrap = document.getElementById("progressWrap");
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");

  var nickname = "";
  var questionIds = GameCore.pickRandomQuestionSet();
  var questions = GameCore.getQuestionsByIds(questionIds);
  var answers = new Array(questions.length).fill(null);
  var step = 0; // 0 = 닉네임, 1~10 = 질문(questions[step-1]), 11 = 완료/제출

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    if (step === 0) return renderNickname();
    if (step >= 1 && step <= questions.length) return renderQuestion(step - 1);
    return renderComplete();
  }

  function renderNickname() {
    progressWrap.style.display = "none";
    stageEl.innerHTML =
      '<div class="q-text">닉네임을 입력해주세요</div>' +
      '<p style="font-size:13px;color:var(--ink-2);margin:-10px 0 16px;line-height:1.6;">먼저 나에 대한 질문 10개에 스스로 답해주세요.<br/>친구들이 결과·랭킹에서 이 이름으로 나를 보게 돼요.</p>' +
      '<div class="field"><input id="nickInput" type="text" maxlength="12" placeholder="예: 민준" value="' + escapeHtml(nickname) + '"/></div>' +
      '<button class="btn btn-primary" id="nickNextBtn">다음 →</button>';
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

  function renderQuestion(idx) {
    progressWrap.style.display = "block";
    progressFill.style.width = Math.round(((idx + 1) / questions.length) * 100) + "%";
    progressLabel.textContent = (idx + 1) + " / " + questions.length;
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
      '<div class="q-index">Q' + (idx + 1) + ". " + escapeHtml(q.category) + "</div>" +
      '<div class="q-text">' + escapeHtml(q.text) + "</div>" +
      '<div class="opt-list">' + optsHtml + "</div>";

    var backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        step -= 1;
        render();
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
        }, 220);
      });
    });
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
      '<div class="analyzing-card"><div class="analyzing">' +
      '<div class="analyzing-spinner"></div>' +
      '<div class="analyzing-title">게임 만드는 중...</div>' +
      "</div></div>";

    fetch("/api/create-game", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: nickname, questionIds: questionIds, answers: answers }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.gameId) throw new Error("bad response");
        var shareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId);
        var ownerUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId) + "&owner=" + encodeURIComponent(data.ownerToken);
        try { localStorage.setItem("myeotdoya_owner_" + data.gameId, data.ownerToken); } catch (e) {}

        stageEl.innerHTML =
          '<div style="text-align:center;font-size:48px;">🎉</div>' +
          '<div class="q-text" style="text-align:center;">게임이 만들어졌어요!</div>' +
          '<p style="font-size:14px;color:var(--ink-2);text-align:center;margin-top:-8px;">아래 링크를 친구들에게 보내서 도전장을 날려보세요.</p>' +
          '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
          '<button class="btn btn-primary" id="copyBtn">링크 복사하기</button>' +
          '<a class="btn btn-ghost" style="display:block;margin-top:10px;box-sizing:border-box;" href="' + escapeHtml(ownerUrl) + '">내 게임 페이지로 이동 →</a>' +
          '<p class="footer-note">내 게임 페이지 링크는 나만 가지고 있어야 해요 — 친구들에게는 위의 공유 링크만 보내주세요. 즐겨찾기 해두는 걸 추천해요.</p>';

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
        document.getElementById("retryBtn").addEventListener("click", renderComplete);
      });
  }

  render();
})();
