(function () {
  "use strict";
  var GameCore = window.GameCore;
  var stageEl = document.getElementById("stage");
  var progressWrap = document.getElementById("progressWrap");
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");

  var params = new URLSearchParams(location.search);
  var gameId = params.get("token") || "";
  var ownerParam = params.get("owner") || "";

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getClientId() {
    var key = "myeotdoya_client_id";
    var id = null;
    try { id = localStorage.getItem(key); } catch (e) {}
    if (!id) {
      id = GameCore.genId(20);
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }
  var clientId = getClientId();

  function renderError(msg) {
    progressWrap.style.display = "none";
    stageEl.innerHTML =
      '<p style="text-align:center;color:var(--warn);padding:20px 0;">' + escapeHtml(msg) + "</p>" +
      '<a class="btn btn-primary" href="./index.html">홈으로</a>';
  }

  if (!gameId) {
    renderError("잘못된 링크예요. 링크를 다시 확인해주세요.");
    return;
  }

  fetch("/api/game?token=" + encodeURIComponent(gameId) + "&owner=" + encodeURIComponent(ownerParam) + "&clientId=" + encodeURIComponent(clientId))
    .then(function (r) {
      if (!r.ok) throw new Error("not_found");
      return r.json();
    })
    .then(function (data) {
      if (data.isOwner) {
        renderOwnerView(data);
      } else if (data.alreadyResponded) {
        renderResultView(data, data.myAttempt, data.ranking);
      } else {
        renderIntro(data);
      }
    })
    .catch(function () {
      renderError("게임을 찾을 수 없어요. 링크가 정확한지 확인해주세요.");
    });

  // ---------- 생성자 화면 ----------
  function renderOwnerView(data) {
    progressWrap.style.display = "none";
    var shareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId);
    var tierMsg = GameCore.creatorTierMessage(data.attemptCount);

    var miscountHtml = "";
    if (data.miscount && data.miscount.length) {
      miscountHtml =
        '<div class="section-title">🔍 친구들이 가장 헷갈린 내 모습</div>' +
        '<ul class="feature-list">' +
        data.miscount.map(function (m) {
          return '<li><span class="ico">❓</span>[' + escapeHtml(m.category) + "] " + escapeHtml(m.text) + " — " + m.missCount + "명이 틀렸어요</li>";
        }).join("") +
        "</ul>";
    } else if (data.attemptCount > 0) {
      miscountHtml = '<p class="banner">' + escapeHtml(tierMsg) + "</p>";
    }

    stageEl.innerHTML =
      '<div style="text-align:center;font-size:40px;">👑</div>' +
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "님의 게임</div>" +
      '<p class="banner">' + (data.attemptCount > 0 ? "지금까지 " + data.attemptCount + "명이 참여했어요." : escapeHtml(tierMsg)) + "</p>" +
      '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
      '<button class="btn btn-primary" id="copyBtn">공유 링크 복사하기</button>' +
      (data.ranking && data.ranking.length ? '<div class="section-title">🏆 랭킹</div>' + rankingHtml(data.ranking) : "") +
      miscountHtml +
      '<p class="footer-note">이 페이지는 나만 볼 수 있는 페이지예요. 이 링크는 저장해두고, 친구들에겐 위의 공유 링크만 보내주세요.</p>';

    bindCopyButton(shareUrl);
  }

  // ---------- 응답자: 인트로 / 질문 ----------
  var respondentNickname = "";
  var guesses = [];

  function renderIntro(data) {
    progressWrap.style.display = "none";
    guesses = new Array(data.questions.length).fill(null);
    stageEl.innerHTML =
      '<div style="text-align:center;font-size:40px;">🔥</div>' +
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "님이<br/>도전장을 보냈어요!</div>" +
      '<p style="font-size:14px;color:var(--ink-2);text-align:center;line-height:1.6;">10문제 · 약 1분<br/>&quot;' + escapeHtml(data.creatorNickname) + '님이라면 이걸 골랐을까?&quot;를 맞혀보세요.</p>' +
      '<div class="field"><label>닉네임 (랭킹에 그대로 보여요)</label><input id="nickInput" type="text" maxlength="12" placeholder="예: 지수"/></div>' +
      '<button class="btn btn-primary" id="startBtn">시작하기 →</button>';

    var input = document.getElementById("nickInput");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      respondentNickname = v.slice(0, 12);
      renderQuestion(data, 0);
    }
    document.getElementById("startBtn").addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function renderQuestion(data, idx) {
    var questions = data.questions;
    progressWrap.style.display = "block";
    progressFill.style.width = Math.round(((idx + 1) / questions.length) * 100) + "%";
    progressLabel.textContent = (idx + 1) + " / " + questions.length;
    var q = questions[idx];
    var backHtml = idx === 0
      ? '<div class="q-top-row"><span></span></div>'
      : '<div class="q-top-row"><button class="q-back-btn" id="backBtn">← 이전</button></div>';
    var optsHtml = q.options.map(function (opt, i) {
      var sel = guesses[idx] === i ? " selected" : "";
      return '<button class="opt' + sel + '" data-i="' + i + '">' + escapeHtml(opt) + "</button>";
    }).join("");
    stageEl.innerHTML =
      backHtml +
      '<div class="q-index">Q' + (idx + 1) + ". " + escapeHtml(q.category) + "</div>" +
      '<div class="q-text">' + escapeHtml(data.creatorNickname) + "님이라면?<br/>" + escapeHtml(q.text) + "</div>" +
      '<div class="opt-list">' + optsHtml + "</div>";

    var backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (idx === 0) { renderIntro(data); } else { renderQuestion(data, idx - 1); }
      });
    }
    Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.getAttribute("data-i"), 10);
        guesses[idx] = i;
        Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        setTimeout(function () {
          if (idx + 1 < questions.length) {
            renderQuestion(data, idx + 1);
          } else {
            submitAttempt(data);
          }
        }, 220);
      });
    });
  }

  function submitAttempt(data) {
    progressWrap.style.display = "none";
    stageEl.innerHTML = '<div class="analyzing-card"><div class="analyzing"><div class="analyzing-spinner"></div><div class="analyzing-title">채점 중...</div></div></div>';
    fetch("/api/submit-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId: data.gameId, nickname: respondentNickname, guesses: guesses, clientId: clientId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (!result || typeof result.score !== "number") throw new Error("bad response");
        return fetch("/api/game?token=" + encodeURIComponent(data.gameId) + "&clientId=" + encodeURIComponent(clientId))
          .then(function (r2) { return r2.json(); })
          .then(function (freshData) {
            renderResultView(freshData, freshData.myAttempt || result, freshData.ranking);
          });
      })
      .catch(function () {
        stageEl.innerHTML =
          '<p style="text-align:center;color:var(--warn);">결과를 저장하는 중 문제가 발생했어요.</p>' +
          '<button class="btn btn-primary" id="retryBtn">다시 시도</button>';
        document.getElementById("retryBtn").addEventListener("click", function () { submitAttempt(data); });
      });
  }

  // ---------- 응답자: 결과 화면 ----------
  function renderResultView(data, result, ranking) {
    progressWrap.style.display = "none";
    var nickname = result.nickname || respondentNickname;
    var showRanking = ranking && ranking.length >= 2;

    stageEl.innerHTML =
      '<div class="score-big"><div class="num">' + result.score + '%</div><div class="cap">' + escapeHtml(result.scoreCopy) + "</div></div>" +
      '<p style="text-align:center;font-weight:800;margin:2px 0 18px;">' + escapeHtml(data.creatorNickname) + "님을 <b>" + result.score + "%</b> 알고 있어요 · 칭호: &quot;" + escapeHtml(result.title) + "&quot;</p>" +
      '<div class="section-title">📊 카테고리별 점수</div>' +
      categoryBarsHtml(result.categoryScores) +
      (showRanking ? '<div class="section-title">🏆 랭킹</div>' + rankingHtml(ranking, nickname) : "") +
      '<div class="locked" id="adGateBox">' +
      '<div style="font-weight:800;font-size:14.5px;margin-bottom:6px;">🔍 가장 의외로 틀린 질문</div>' +
      "<ul><li>짧은 광고 하나 보면 바로 확인할 수 있어요</li><li>어떤 질문에서 의외의 답을 골랐는지</li><li>" + escapeHtml(data.creatorNickname) + "님의 실제 답까지 같이 보여드려요</li></ul>" +
      '<button class="btn btn-primary unlock-btn" id="watchAdBtn">광고 보고 확인하기</button>' +
      "</div>" +
      '<div class="cta-fixed"><a class="btn btn-ghost" href="./create.html">나도 만들기 →</a></div>';

    document.getElementById("watchAdBtn").addEventListener("click", function () {
      handleWatchAd(data, result);
    });
  }

  function handleWatchAd(data, result) {
    var box = document.getElementById("adGateBox");
    var seconds = 3;
    box.innerHTML =
      '<div class="analyzing"><div class="analyzing-spinner"></div>' +
      '<div class="analyzing-title" id="adCountdown">광고 재생 중... ' + seconds + "초</div>" +
      '<div class="analyzing-sub">(실제 서비스에서는 여기에 광고 네트워크의 리워드 광고가 재생됩니다)</div></div>';
    var timer = setInterval(function () {
      seconds -= 1;
      var el = document.getElementById("adCountdown");
      if (el) el.textContent = seconds > 0 ? "광고 재생 중... " + seconds + "초" : "완료!";
      if (seconds <= 0) {
        clearInterval(timer);
        fetch("/api/attempt-detail?gameId=" + encodeURIComponent(data.gameId) + "&attemptId=" + encodeURIComponent(result.attemptId))
          .then(function (r) { return r.json(); })
          .then(function (detail) { renderDetail(detail); })
          .catch(function () {
            var b = document.getElementById("adGateBox");
            if (b) b.innerHTML = '<p style="text-align:center;color:var(--warn);">불러오지 못했어요.</p>';
          });
      }
    }, 1000);
  }

  function renderDetail(detail) {
    var box = document.getElementById("adGateBox");
    if (!box) return;
    if (!detail.items || !detail.items.length) {
      box.outerHTML = '<p class="banner">👏 전부 다 맞혔어요! 의외로 틀린 질문이 없네요.</p>';
      return;
    }
    var itemsHtml = detail.items.map(function (it) {
      return (
        '<div class="advice-bubble advice-partner">' +
        '<span class="advice-name">[' + escapeHtml(it.category) + "] " + escapeHtml(it.text) + "</span>" +
        "내 예상: " + escapeHtml(it.myGuess) + "<br/>실제 답: <b>" + escapeHtml(it.actualAnswer) + "</b>" +
        "</div>"
      );
    }).join("");
    box.outerHTML = '<div class="section-title">🔍 가장 의외로 틀린 질문</div>' + itemsHtml;
  }

  // ---------- 공통 헬퍼 ----------
  function categoryBarsHtml(categoryScores) {
    categoryScores = categoryScores || {};
    return GameCore.CATEGORIES.map(function (cat) {
      var val = categoryScores[cat];
      if (val === null || val === undefined) return "";
      return (
        '<div class="stat-row"><div class="stat-label">' + escapeHtml(cat) + '</div>' +
        '<div class="stat-track"><div class="stat-fill" style="width:' + val + '%"></div></div>' +
        '<div class="stat-val">' + val + "</div></div>"
      );
    }).join("");
  }

  function rankingHtml(ranking, highlightNickname) {
    if (!ranking || !ranking.length) return '<p class="lb-loading">아직 랭킹이 없어요.</p>';
    var rows = ranking.map(function (r, i) {
      var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1) + "위";
      var cls = highlightNickname && r.nickname === highlightNickname ? "lb-row lb-row-me" : "lb-row";
      return (
        '<div class="' + cls + '"><div class="lb-rank">' + medal + "</div>" +
        '<div class="lb-names">' + escapeHtml(r.nickname) + "</div>" +
        '<div class="lb-score">' + r.score + "점</div></div>"
      );
    }).join("");
    return '<div class="lb-list">' + rows + "</div>";
  }

  function bindCopyButton(shareUrl) {
    var btn = document.getElementById("copyBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      function fallbackCopy() {
        var input = document.getElementById("shareUrlInput");
        if (input) { input.select(); try { document.execCommand("copy"); } catch (e) {} }
        showToast("링크가 복사됐어요!");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(function () { showToast("링크가 복사됐어요!"); }, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  function showToast(msg) {
    var t = document.createElement("div");
    t.className = "toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }
})();
