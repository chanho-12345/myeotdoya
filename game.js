(function () {
  "use strict";
  var GameCore = window.GameCore;
  var stageEl = document.getElementById("stage");
  var progressWrap = document.getElementById("progressWrap");
  var progressFill = document.getElementById("progressFill");
  var progressLabel = document.getElementById("progressLabel");

  var TOTAL_STEPS = 10; // 객관식 9 + 주관식 1

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

  function track(name) {
    try { if (window.va) window.va("event", { name: name }); } catch (e) {}
  }

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
      track("game_open");
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
        '<div class="section-title">친구들이 가장 헷갈린 내 모습</div>' +
        '<ul class="feature-list">' +
        data.miscount.map(function (m) {
          return "<li><span class=\"ico\">·</span>[" + escapeHtml(m.category) + "] " + escapeHtml(m.text) + " — " + m.missCount + "명이 틀렸어요</li>";
        }).join("") +
        "</ul>";
    } else if (data.attemptCount > 0) {
      miscountHtml = '<p class="banner">' + escapeHtml(tierMsg) + "</p>";
    }

    stageEl.innerHTML =
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "의 테스트</div>" +
      '<p class="banner">' + (data.attemptCount > 0 ? "지금까지 " + data.attemptCount + "명이 참여했어요." : escapeHtml(tierMsg)) + "</p>" +
      '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
      '<button class="btn btn-primary" id="copyBtn">공유 링크 복사하기</button>' +
      (data.ranking && data.ranking.length ? '<div class="section-title">' + escapeHtml(data.creatorNickname) + '를 제일 잘 아는 사람</div>' + rankingHtml(data.ranking) : "") +
      miscountHtml +
      '<p class="footer-note">이 페이지는 나만 볼 수 있는 페이지예요. 이 링크는 저장해두고, 친구들에겐 위의 공유 링크만 보내주세요.</p>';

    bindCopyButton(shareUrl);
  }

  // ---------- 응답자: 인트로 / 질문 ----------
  var respondentNickname = "";
  var guesses = [];
  var confidence = [];
  var subjectiveGuess = "";

  var DEEP_CONFIDENCE_LABEL = { guess: "그냥 느낌", half: "반반", sure: "이건 확실함" };

  function renderIntro(data) {
    progressWrap.style.display = "none";
    guesses = new Array(data.questions.length).fill(null);
    confidence = new Array(data.questions.length).fill(null);
    subjectiveGuess = "";
    stageEl.innerHTML =
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "를<br/>얼마나 잘 알고 있어?</div>" +
      '<p style="font-size:14px;color:var(--ink-2);text-align:center;line-height:1.6;">10개의 질문.<br/>마지막 한 문제는 찍을 수도 없어요.</p>' +
      '<div class="field"><label>닉네임 (랭킹에 그대로 보여요)</label><input id="nickInput" type="text" maxlength="12" placeholder="예: 지수"/></div>' +
      '<button class="btn btn-primary" id="startBtn">시작하기 →</button>';

    var input = document.getElementById("nickInput");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      respondentNickname = v.slice(0, 12);
      track("game_start");
      renderQuestion(data, 0);
    }
    document.getElementById("startBtn").addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function renderQuestion(data, idx) {
    var questions = data.questions;
    progressWrap.style.display = "block";
    progressFill.style.width = Math.round(((idx + 1) / TOTAL_STEPS) * 100) + "%";
    progressLabel.textContent = (idx + 1) + " / " + TOTAL_STEPS;
    var q = questions[idx];
    var banner = GameCore.depthBannerForIndex(idx);
    var backHtml = idx === 0
      ? '<div class="q-top-row"><span></span></div>'
      : '<div class="q-top-row"><button class="q-back-btn" id="backBtn">← 이전</button></div>';
    var optsHtml = q.options.map(function (opt, i) {
      var sel = guesses[idx] === i ? " selected" : "";
      return '<button class="opt' + sel + '" data-i="' + i + '">' + escapeHtml(opt) + "</button>";
    }).join("");

    // deep(3단계) 질문은 답 고른 다음 "얼마나 확신해?"도 같이 물어보는데,
    // 별도 화면으로 넘기지 않고 같은 페이지 안에서 아래에 이어서 보여줌 —
    // 질문 개수가 줄어드는 것처럼 느껴지지 않게 하고, 뒤로가기도 그대로 쓸 수 있게 함.
    var isDeep = q.depth === "deep";
    var confidenceHtml = "";
    if (isDeep && guesses[idx] !== null) {
      var pillsHtml = ["guess", "half", "sure"].map(function (v) {
        var sel = confidence[idx] === v ? " selected" : "";
        return '<button class="pill' + sel + '" data-v="' + v + '">' + DEEP_CONFIDENCE_LABEL[v] + "</button>";
      }).join("");
      confidenceHtml =
        '<p style="font-size:14px;font-weight:800;color:var(--ink);margin:18px 0 10px;">이 답, 얼마나 확신해?</p>' +
        '<div class="pill-group" id="confPills">' + pillsHtml + "</div>";
    }
    var showNextBtn = isDeep && guesses[idx] !== null && confidence[idx] !== null;

    stageEl.innerHTML =
      backHtml +
      (banner ? '<p class="banner" style="margin-bottom:14px;">' + escapeHtml(banner) + "</p>" : "") +
      '<div class="q-index">Q' + (idx + 1) + "</div>" +
      '<div class="q-text">' + escapeHtml(data.creatorNickname) + "라면?<br/>" + escapeHtml(q.text) + "</div>" +
      '<div class="opt-list">' + optsHtml + "</div>" +
      confidenceHtml +
      (showNextBtn ? '<button class="btn btn-primary" id="nextBtn" style="margin-top:18px;">다음 →</button>' : "");

    var backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (idx === 0) { renderIntro(data); } else { renderQuestion(data, idx - 1); }
      });
    }
    Array.prototype.forEach.call(stageEl.querySelectorAll(".opt-list .opt"), function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.getAttribute("data-i"), 10);
        if (isDeep && guesses[idx] !== i) {
          confidence[idx] = null; // 답을 바꾸면 확신도도 그 답 기준으로 다시 골라야 함
        }
        guesses[idx] = i;
        if (isDeep) {
          // 같은 페이지 그대로, 확신 선택지만 새로 드러나도록 다시 그림
          renderQuestion(data, idx);
        } else {
          Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          setTimeout(function () { advanceFrom(data, idx); }, 220);
        }
      });
    });
    Array.prototype.forEach.call(stageEl.querySelectorAll("#confPills .pill"), function (btn) {
      btn.addEventListener("click", function () {
        confidence[idx] = btn.getAttribute("data-v");
        renderQuestion(data, idx);
      });
    });
    var nextBtn = document.getElementById("nextBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () { advanceFrom(data, idx); });
    }
  }

  function advanceFrom(data, idx) {
    if (idx + 1 < data.questions.length) {
      renderQuestion(data, idx + 1);
    } else {
      renderSubjectiveStep(data);
    }
  }

  function renderSubjectiveStep(data) {
    progressWrap.style.display = "block";
    progressFill.style.width = "100%";
    progressLabel.textContent = TOTAL_STEPS + " / " + TOTAL_STEPS;
    stageEl.innerHTML =
      '<p class="banner" style="margin-bottom:14px;">마지막은 찍을 수 없는 문제.</p>' +
      '<div class="q-index">Q10 · 주관식</div>' +
      '<div class="q-text">' + escapeHtml(data.creatorNickname) + "라면?<br/>" + escapeHtml(data.subjectivePrompt) + "</div>" +
      '<div class="field"><input id="subjInput" type="text" maxlength="80" placeholder="솔직하게, 짧게 예상해보세요"/></div>' +
      '<button class="btn btn-primary" id="subjNextBtn">완료하고 결과 보기 →</button>';

    var input = document.getElementById("subjInput");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      subjectiveGuess = v.slice(0, 80);
      track("subjective_completed");
      submitAttempt(data);
    }
    document.getElementById("subjNextBtn").addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function submitAttempt(data) {
    progressWrap.style.display = "none";
    stageEl.innerHTML = '<div class="analyzing-card"><div class="analyzing"><div class="analyzing-spinner"></div><div class="analyzing-title">채점 중...</div></div></div>';
    fetch("/api/submit-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameId: data.gameId,
        nickname: respondentNickname,
        guesses: guesses,
        confidence: confidence,
        subjectiveGuess: subjectiveGuess,
        clientId: clientId,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (!result || typeof result.score !== "number") throw new Error("bad response");
        track("game_complete");
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
    track("result_reveal");
    var nickname = result.nickname || respondentNickname;
    var showRanking = ranking && ranking.length >= 2;

    stageEl.innerHTML =
      '<div class="score-big"><div class="num">' + result.score + '%</div><div class="cap">' + escapeHtml(result.scoreCopy) + "</div></div>" +
      '<p style="text-align:center;font-weight:800;margin:2px 0 4px;">' + escapeHtml(data.creatorNickname) + " 이해도 " + result.score + "%</p>" +
      '<p style="text-align:center;font-size:13.5px;color:var(--ink-2);margin:0 0 18px;line-height:1.6;">' + escapeHtml(result.oneLiner) + "</p>" +
      surfaceInnerBarsHtml(result.surfaceScore, result.innerScore) +
      (showRanking ? '<div class="section-title">' + escapeHtml(data.creatorNickname) + '를 제일 잘 아는 사람</div>' + rankingHtml(ranking, nickname) : "") +
      '<div class="locked" id="adGateBox">' +
      '<div style="font-weight:800;font-size:14.5px;margin-bottom:6px;">우리가 엇갈린 순간</div>' +
      "<ul><li>점수보다 재미있는 이야기가 하나 있어요</li><li>가장 크게 엇갈린 부분과 확신했는데 틀린 답</li><li>주관식 답변이 얼마나 비슷했는지도 같이 보여드려요</li></ul>" +
      '<button class="btn btn-primary unlock-btn" id="watchAdBtn">15초 보고 확인하기</button>' +
      "</div>" +
      '<div class="section-title">그런데 ' + escapeHtml(data.creatorNickname) + '는 나를 얼마나 알까?</div>' +
      '<div class="cta-fixed"><a class="btn btn-ghost" href="./create.html" id="reverseCta">이번엔 내 테스트 만들기 →</a></div>';

    var reverseCta = document.getElementById("reverseCta");
    if (reverseCta) reverseCta.addEventListener("click", function () { track("reverse_challenge_click"); });

    document.getElementById("watchAdBtn").addEventListener("click", function () {
      handleWatchAd(data, result);
    });
  }

  function surfaceInnerBarsHtml(surfaceScore, innerScore) {
    if (surfaceScore == null && innerScore == null) return "";
    var rows = [];
    if (surfaceScore != null) {
      rows.push('<div class="stat-row"><div class="stat-label">겉으로 보이는 나</div><div class="stat-track"><div class="stat-fill" style="width:' + surfaceScore + '%"></div></div><div class="stat-val">' + surfaceScore + "</div></div>");
    }
    if (innerScore != null) {
      rows.push('<div class="stat-row"><div class="stat-label">속으로 생각하는 나</div><div class="stat-track"><div class="stat-fill" style="width:' + innerScore + '%"></div></div><div class="stat-val">' + innerScore + "</div></div>");
    }
    return rows.join("");
  }

  function handleWatchAd(data, result) {
    track("rewarded_ad_start");
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
        track("rewarded_ad_complete");
        fetch("/api/attempt-detail?gameId=" + encodeURIComponent(data.gameId) + "&attemptId=" + encodeURIComponent(result.attemptId))
          .then(function (r) { return r.json(); })
          .then(function (detail) { renderReplay(detail); })
          .catch(function () {
            var b = document.getElementById("adGateBox");
            if (b) b.innerHTML = '<p style="text-align:center;color:var(--warn);">불러오지 못했어요.</p>';
          });
      }
    }, 1000);
  }

  function renderReplay(detail) {
    track("replay_view");
    var box = document.getElementById("adGateBox");
    if (!box) return;

    var blocks = [];

    if (detail.bestKnownArea) {
      blocks.push(
        '<div class="advice-bubble advice-me">' +
        '<span class="advice-name">내가 제일 잘 아는 부분</span>' +
        escapeHtml(detail.bestKnownArea.label) + " 관련 질문은 " + detail.bestKnownArea.correct + " / " + detail.bestKnownArea.total + "개 맞혔어요." +
        "</div>"
      );
    }
    if (detail.mostMissedArea) {
      blocks.push(
        '<div class="advice-bubble advice-partner">' +
        '<span class="advice-name">가장 크게 엇갈린 부분</span>' +
        escapeHtml(detail.mostMissedArea.label) + " 관련 질문에서는 " + detail.mostMissedArea.correct + " / " + detail.mostMissedArea.total + "개만 맞혔어요." +
        "</div>"
      );
    }
    if (detail.confidentMiss) {
      blocks.push(
        '<div class="advice-bubble advice-partner">' +
        '<span class="advice-name">가장 자신 있었는데 빗나간 답</span>' +
        escapeHtml(detail.confidentMiss.text) + "<br/>내 예상: " + escapeHtml(detail.confidentMiss.myGuess) +
        "<br/>실제 답: <b>" + escapeHtml(detail.confidentMiss.actualAnswer) + "</b>" +
        "</div>"
      );
    }
    if (detail.subjective && detail.subjective.prompt) {
      var s = detail.subjective;
      blocks.push(
        '<div class="advice-bubble advice-me">' +
        '<span class="advice-name">주관식 의미 싱크 ' + (s.semanticScore != null ? s.semanticScore + "%" : "") + "</span>" +
        escapeHtml(s.prompt) + "<br/>내 예상: " + escapeHtml(s.myGuess) + "<br/>실제 답: <b>" + escapeHtml(s.actualAnswer) + "</b>" +
        (s.reason ? '<div style="margin-top:6px;color:var(--ink-muted);font-size:12.5px;">' + escapeHtml(s.reason) + "</div>" : "") +
        "</div>"
      );
    }

    box.outerHTML =
      '<div class="section-title">우리가 엇갈린 순간</div>' +
      blocks.join("") +
      '<p class="mini-note">' + escapeHtml(detail.oneLiner || "") + "</p>";
  }

  // ---------- 공통 헬퍼 ----------
  function rankingHtml(ranking, highlightNickname) {
    if (!ranking || !ranking.length) return '<p class="lb-loading">아직 랭킹이 없어요.</p>';
    var rows = ranking.map(function (r, i) {
      var medal = i === 0 ? "1위" : i === 1 ? "2위" : i === 2 ? "3위" : (i + 1) + "위";
      var cls = highlightNickname && r.nickname === highlightNickname ? "lb-row lb-row-me" : "lb-row";
      return (
        '<div class="' + cls + '"><div class="lb-rank">' + medal + "</div>" +
        '<div class="lb-names">' + escapeHtml(r.nickname) + "</div>" +
        '<div class="lb-score">' + r.score + "%</div></div>"
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
