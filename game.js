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
  var resultParam = params.get("result") || ""; // 친구가 공유한 "결과 보기" 링크 (attemptId)

  var KAKAO_JS_KEY = "9571640b8eab8e91dc39c6bc0018e149";
  try {
    if (window.Kakao && !window.Kakao.isInitialized()) { window.Kakao.init(KAKAO_JS_KEY); }
  } catch (e) {}

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

  function resetDepthBg() {
    document.body.classList.remove("depth-2", "depth-3");
  }

  // 구간 전환 문구를 짧게 보여준 뒤 다음 화면으로 (별도 페이지 없이 stage 안에서)
  function renderTransition(text, next) {
    stageEl.innerHTML =
      '<div class="stage-transition">' +
      '<div class="connector"><span class="dot"></span><span class="line"><span class="line-fill" style="width:60%"></span></span><span class="dot"></span></div>' +
      '<p class="stage-transition-text">' + escapeHtml(text) + "</p>" +
      "</div>";
    playStageAnim();
    setTimeout(next, 700);
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
    playStageAnim();
  }

  if (!gameId) {
    renderError("잘못된 링크예요. 링크를 다시 확인해주세요.");
    return;
  }

  if (resultParam) {
    // 친구가 "공유하기"로 보낸 결과 링크 — 테스트를 새로 시작하지 않고, 그 친구의
    // 점수 + 관계 리플레이 내용을 바로 보여줌.
    renderSharedResult(gameId, resultParam);
  } else {
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
  }

  // ---------- 공유된 결과 링크 전용 화면 ----------
  function renderSharedResult(gameId, attemptId) {
    progressWrap.style.display = "none";
    resetDepthBg();
    stageEl.innerHTML = '<div class="analyzing-card"><div class="analyzing"><div class="analyzing-spinner"></div><div class="analyzing-title">불러오는 중...</div></div></div>';
    playStageAnim();

    fetch("/api/attempt-detail?gameId=" + encodeURIComponent(gameId) + "&attemptId=" + encodeURIComponent(attemptId))
      .then(function (r) {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then(function (detail) {
        if (!detail || typeof detail.score !== "number") throw new Error("bad_response");
        track("shared_result_view");

        var resultShareUrl = location.origin + "/game.html?token=" + encodeURIComponent(gameId) + "&result=" + encodeURIComponent(attemptId);
        var takeTestUrl = location.origin + "/game.html?token=" + encodeURIComponent(gameId);
        var tierClass = detail.score >= 100 ? " tier-perfect" : detail.score >= 90 ? " tier-high" : "";
        var built = buildReplayContentHtml(detail);

        stageEl.innerHTML =
          '<p class="banner">' + escapeHtml(detail.respondentNickname || "친구") + "님이 " + escapeHtml(detail.creatorNickname || "") + " 테스트에서 받은 결과예요</p>" +
          '<div class="score-big"><div class="num" id="scoreNum">0%</div><div class="cap">' + escapeHtml(detail.scoreCopy || "") + "</div></div>" +
          '<div class="connector' + tierClass + '" style="margin:8px 0 6px;"><span class="dot"></span><span class="line"><span class="line-fill" id="scoreLineFill"></span></span><span class="dot"></span></div>' +
          '<p class="result-oneliner" style="text-align:center;font-size:13.5px;color:var(--ink-2);margin:0 0 18px;line-height:1.6;">' + escapeHtml(detail.oneLiner || "") + "</p>" +
          surfaceInnerBarsHtml(detail.surfaceScore, detail.innerScore) +
          built.html +
          '<p class="mini-note" style="opacity:1;">' + escapeHtml(built.oneLiner) + "</p>" +
          '<button class="btn btn-ghost" id="shareAgainBtn" style="margin-top:16px;">이 결과 다시 공유하기</button>' +
          '<div class="cta-fixed"><a class="btn btn-primary" href="' + escapeHtml(takeTestUrl) + '">나도 테스트해볼래 →</a></div>';
        playStageAnim();

        animateScoreCountUp(detail.score);
        setTimeout(function () {
          var f = document.getElementById("scoreLineFill");
          if (f) f.style.width = Math.max(4, detail.score) + "%";
        }, 120);
        setTimeout(function () {
          Array.prototype.forEach.call(stageEl.querySelectorAll(".stat-fill[data-target]"), function (el) {
            el.style.width = el.getAttribute("data-target") + "%";
          });
        }, 500);

        var shareAgainBtn = document.getElementById("shareAgainBtn");
        if (shareAgainBtn) {
          shareAgainBtn.addEventListener("click", function () {
            openShareSheet(resultShareUrl, (detail.respondentNickname || "친구") + "가 " + (detail.creatorNickname || "") + " 테스트에서 " + detail.score + "% 나왔대! 결과 보러 가기");
          });
        }
      })
      .catch(function () {
        renderError("결과를 찾을 수 없어요. 링크가 정확한지 확인해주세요.");
      });
  }

  // ---------- 생성자 화면: 관계 리포트 ----------
  function renderOwnerView(data) {
    progressWrap.style.display = "none";
    resetDepthBg();
    var shareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId);
    var report = data.report;

    // 아직 아무도 안 했으면 리포트 대신 안내 + 공유 UI만 보여줌
    if (!data.attemptCount || !report) {
      var tierMsg = GameCore.creatorTierMessage(data.attemptCount);
      stageEl.innerHTML =
        '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "의 테스트</div>" +
        '<p class="banner">' + escapeHtml(tierMsg) + "</p>" +
        '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
        '<button class="btn btn-primary cta-pulse-once" id="copyBtn">친구에게 링크 보내기</button>' +
        '<p class="footer-note">이 페이지는 나만 볼 수 있는 페이지예요. 이 링크는 저장해두고, 친구들에겐 위의 공유 링크만 보내주세요.</p>';
      playStageAnim();
      bindOwnerShare(shareUrl, data);
      return;
    }

    var changeInfo = computeChangeEvents(data.gameId, report, data.attemptCount);
    var changeBannerHtml = "";
    if (!changeInfo.isFirstVisit && changeInfo.newCount > 0) {
      changeBannerHtml =
        '<div class="change-banner">' +
        '<p class="change-banner-title">지난번 이후 ' + changeInfo.newCount + "명이 새로 도전했어.</p>" +
        (changeInfo.events.length
          ? '<ul class="change-list">' + changeInfo.events.map(function (e) { return "<li>" + escapeHtml(e.text) + "</li>"; }).join("") + "</ul>"
          : "") +
        "</div>";
    }

    var mutualHtml = "";
    if (report.mutual) {
      var m = report.mutual;
      mutualHtml =
        '<div class="mutual-card">' +
        '<div class="mutual-title">우리 서로 이해도</div>' +
        '<div class="mutual-scores">' +
        '<div class="mutual-score-col"><div class="mutual-score-num">' + m.meUnderstandsThemScore + "%</div><div class=\"mutual-score-label\">" + escapeHtml(m.meNickname) + " → " + escapeHtml(m.themNickname) + "</div></div>" +
        '<div class="mutual-score-col"><div class="mutual-score-num">' + m.themUnderstandsMeScore + "%</div><div class=\"mutual-score-label\">" + escapeHtml(m.themNickname) + " → " + escapeHtml(m.meNickname) + "</div></div>" +
        "</div>" +
        '<div class="mutual-avg">서로 이해도 ' + m.mutualScore + "%</div>" +
        (m.comparisonLine ? '<p class="mutual-compare">' + escapeHtml(m.comparisonLine) + "</p>" : "") +
        "</div>";
    }

    var summaryHtml =
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "의 관계 리포트</div>" +
      '<p class="banner">지금까지 <b>' + data.attemptCount + "명</b>이 나를 맞혀봤어요 · 평균 이해도 <b>" + report.avgScore + "%</b>" +
      (report.topNickname
        ? " · 나를 제일 잘 아는 사람 <b>" + escapeHtml(report.topNickname) + " " + report.topScore + "%</b>"
        : "") +
      "</p>";

    var rankingSection = "";
    if (report.people.length) {
      var top3 = report.people.slice(0, 3);
      var top3Rows = top3.map(function (p, i) {
        var medal = i === 0 ? "1위" : i === 1 ? "2위" : "3위";
        var cls = "lb-row" + (i === 0 ? " lb-row-first" : "");
        return (
          '<div class="' + cls + '"><div class="lb-rank">' + medal + "</div>" +
          '<div class="lb-names">' + escapeHtml(p.nickname) + '<span class="lb-trait">' + escapeHtml(p.shortTrait) + "</span></div>" +
          '<div class="lb-score">' + p.score + "%</div></div>"
        );
      }).join("");
      rankingSection = '<div class="section-title">누가 ' + escapeHtml(data.creatorNickname) + '를 제일 잘 알까</div><div class="lb-list">' + top3Rows + "</div>";
    }

    var knownSection = "";
    if (report.knownCategories.length || report.unknownCategories.length) {
      knownSection =
        '<div class="section-title">사람들이 잘 아는 나 vs 잘 모르는 나</div>' +
        '<div class="know-compare">' +
        '<div class="know-col know-good"><div class="know-col-title">잘 아는 나</div>' +
        report.knownCategories.map(function (c) {
          return '<div class="know-item"><span>' + escapeHtml(c.label) + "</span><b>" + c.rate + "%</b></div>";
        }).join("") +
        "</div>" +
        '<div class="know-col know-bad"><div class="know-col-title">잘 모르는 나</div>' +
        report.unknownCategories.map(function (c) {
          return '<div class="know-item"><span>' + escapeHtml(c.label) + "</span><b>" + c.rate + "%</b></div>";
        }).join("") +
        "</div>" +
        "</div>";
    }

    var misHtml = "";
    if (report.misunderstandings.length) {
      misHtml =
        '<div class="section-title">사람들이 생각하는 나와 실제 나는 어디서 다를까?</div>' +
        report.misunderstandings.map(function (m) {
          return (
            '<div class="advice-bubble advice-partner">' +
            '<span class="advice-name">' + escapeHtml(m.label) + " · 총 " + m.total + "명 중 " + m.count + "명</span>“" +
            escapeHtml(m.guessedAnswer) + "”" +
            '<span class="reveal-line">근데 실제 내 답은 “<b>' + escapeHtml(m.actualAnswer) + "</b>”이었어요.</span>" +
            "</div>"
          );
        }).join("") +
        '<p class="mini-note" style="opacity:1;">생각보다 아무도 모르고 있던 나</p>';
    }

    var hardestHtml = "";
    if (report.hardest) {
      hardestHtml =
        '<div class="section-title">아무도 잘 모르는 나</div>' +
        '<div class="advice-bubble advice-partner">' +
        '<span class="advice-name">' + escapeHtml(report.hardest.category) + "</span>" +
        escapeHtml(report.hardest.actualAnswer) +
        '<span class="reveal-line">친구 정답률 ' + report.hardest.ratePercent + "%</span>" +
        "</div>";
    }

    var easiestHtml = "";
    if (report.easiest) {
      easiestHtml =
        '<div class="section-title">역시 다 알고 있는 나</div>' +
        '<div class="advice-bubble advice-me">' +
        '<span class="advice-name">' + escapeHtml(report.easiest.category) + "</span>" +
        escapeHtml(report.easiest.actualAnswer) +
        '<span class="reveal-line">친구 정답률 ' + report.easiest.ratePercent + "% · 숨길 생각도 없었네요</span>" +
        "</div>";
    }

    var peopleTitle = report.people.length <= 1 ? "이 사람은 나를 이렇게 알고 있어" : "사람마다 알고 있는 나는 달랐어";
    var leaderBannerHtml = "";
    if (report.categoryLeaders && report.categoryLeaders.length >= 2) {
      // 같은 사람이 여러 카테고리 1등이면 한 문장으로 묶어줌(같은 이름이 반복되는 걸 방지)
      var grouped = [];
      report.categoryLeaders.forEach(function (l) {
        var g = null;
        for (var gi = 0; gi < grouped.length; gi++) {
          if (grouped[gi].nickname === l.nickname) { g = grouped[gi]; break; }
        }
        if (g) g.labels.push(l.label); else grouped.push({ nickname: l.nickname, labels: [l.label] });
      });
      if (grouped.length >= 2) {
        var leaderSegs = grouped.map(function (g) {
          var p1 = GameCore.hasBatchim(g.nickname) ? "은" : "는";
          var joinedLabel = g.labels.join("·");
          var p2 = GameCore.hasBatchim(g.labels[g.labels.length - 1]) ? "을" : "를";
          return escapeHtml(g.nickname) + p1 + " 내 " + escapeHtml(joinedLabel) + p2 + " 제일 잘 알고";
        });
        leaderSegs[leaderSegs.length - 1] = leaderSegs[leaderSegs.length - 1].replace(/잘 알고$/, "잘 알아.");
        leaderBannerHtml = '<p class="banner">' + leaderSegs.join(" ") + "</p>";
      }
    }

    var peopleHtml = "";
    if (report.people.length) {
      peopleHtml =
        '<div class="section-title">' + peopleTitle + "</div>" +
        leaderBannerHtml +
        '<div class="people-grid">' +
        report.people.map(function (p) {
          var catsHtml = p.categories.map(function (c) {
            return '<span class="people-cat-chip"><b>' + escapeHtml(c.label) + "</b> " + c.rate + "%</span>";
          }).join("");
          var uniqueCorrectHtml = p.uniqueCorrect
            ? '<div class="people-highlight">' +
              '<span class="people-highlight-tag">' + escapeHtml(p.nickname) + "만 맞힌 내 모습</span>" +
              escapeHtml(p.uniqueCorrect.text) +
              '<span class="people-highlight-sub">' + data.attemptCount + "명 중 " + escapeHtml(p.nickname) + "만 맞혔어.</span>" +
              "</div>"
            : "";
          var uniqueWrongHtml = p.uniqueWrong
            ? '<div class="people-note">여기선 나를 조금 다르게 알고 있었어<br/>다른 사람들은 대부분 맞혔는데 ' + escapeHtml(p.nickname) + "은 이 부분을 다르게 예상했어.</div>"
            : "";
          return (
            '<div class="people-card" data-attempt-id="' + escapeHtml(p.attemptId) + '" data-nickname="' + escapeHtml(p.nickname) + '">' +
            '<div class="people-top"><span class="people-name">' + escapeHtml(p.nickname) + "</span><span class=\"people-score\">" + p.score + "%</span></div>" +
            '<div class="people-oneliner">' + escapeHtml(p.oneLiner) + "</div>" +
            '<div class="people-cats">' + catsHtml + "</div>" +
            uniqueCorrectHtml +
            uniqueWrongHtml +
            '<div class="people-cta">' + escapeHtml(p.nickname) + "가 알고 있는 나 자세히 보기 →</div>" +
            "</div>"
          );
        }).join("") +
        "</div>";
      if (report.people.length === 1) {
        peopleHtml +=
          '<p class="banner" style="margin-top:12px;">사람이 더 참여하면 서로 어떤 부분을 다르게 알고 있는지도 비교할 수 있어.</p>' +
          '<button class="btn btn-ghost" id="inviteMoreBtn">다른 친구에게 보내기</button>';
      }
    }

    var allRankingHtml =
      data.ranking && data.ranking.length ? '<div class="section-title">전체 참가자</div>' + rankingHtml(data.ranking) : "";

    var ctaHtml =
      '<div class="section-title">지금 최고 점수는 ' + (report.topScore != null ? report.topScore + "%" : "-") + "</div>" +
      '<p class="banner">이 점수를 이길 사람이 있을까?</p>' +
      '<div class="field"><input id="shareUrlInput" type="text" readonly value="' + escapeHtml(shareUrl) + '"/></div>' +
      '<button class="btn btn-primary cta-pulse-once" id="copyBtn">친구에게 링크 보내기</button>';

    stageEl.innerHTML =
      changeBannerHtml +
      mutualHtml +
      summaryHtml +
      rankingSection +
      knownSection +
      misHtml +
      hardestHtml +
      easiestHtml +
      peopleHtml +
      allRankingHtml +
      ctaHtml +
      '<p class="footer-note">이 페이지는 나만 볼 수 있는 페이지예요. 이 링크는 저장해두고, 친구들에겐 위의 공유 링크만 보내주세요.</p>';
    playStageAnim();

    bindOwnerShare(shareUrl, data);

    Array.prototype.forEach.call(stageEl.querySelectorAll(".people-card"), function (card) {
      card.addEventListener("click", function () {
        var attemptId = card.getAttribute("data-attempt-id");
        var nickname = card.getAttribute("data-nickname");
        openPersonDetailSheet(data.gameId, attemptId, nickname);
      });
    });
    var inviteMoreBtn = document.getElementById("inviteMoreBtn");
    if (inviteMoreBtn) {
      inviteMoreBtn.addEventListener("click", function () {
        openShareSheet(shareUrl, data.creatorNickname + "가 나를 얼마나 아는지 테스트해봐!");
      });
    }
  }

  // 사람 카드를 눌렀을 때 그 사람의 상세 결과(관계 리플레이와 동일한 데이터)를
  // 바텀시트로 보여줌 — 페이지 이동 없이 그 자리에서 열림/닫힘.
  function openPersonDetailSheet(gameId, attemptId, nickname) {
    var old = document.getElementById("detailSheetOverlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.className = "detail-sheet-overlay";
    overlay.id = "detailSheetOverlay";
    overlay.innerHTML =
      '<div class="detail-sheet">' +
      '<div class="detail-sheet-header"><span>' + escapeHtml(nickname) + "이 알고 있는 나</span><button class=\"detail-sheet-close\" id=\"detailSheetClose\">닫기</button></div>" +
      '<div class="detail-sheet-body" id="detailSheetBody"><div class="analyzing"><div class="analyzing-spinner"></div><div class="analyzing-title">불러오는 중...</div></div></div>' +
      "</div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("show"); });

    function close() {
      overlay.classList.remove("show");
      setTimeout(function () { overlay.remove(); }, 220);
    }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.getElementById("detailSheetClose").addEventListener("click", close);

    fetch("/api/attempt-detail?gameId=" + encodeURIComponent(gameId) + "&attemptId=" + encodeURIComponent(attemptId))
      .then(function (r) {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then(function (detail) {
        var body = document.getElementById("detailSheetBody");
        if (!body) return;
        var built = buildReplayContentHtml(detail);
        body.innerHTML =
          '<div class="score-big" style="padding:0 0 4px;"><div class="num" style="font-size:38px;">' + detail.score + "%</div><div class=\"cap\">" + escapeHtml(detail.scoreCopy || "") + "</div></div>" +
          surfaceInnerBarsHtml(detail.surfaceScore, detail.innerScore) +
          built.html +
          '<p class="mini-note" style="opacity:1;">' + escapeHtml(built.oneLiner) + "</p>";
      })
      .catch(function () {
        var body = document.getElementById("detailSheetBody");
        if (body) body.innerHTML = '<p style="text-align:center;color:var(--warn);">불러오지 못했어요.</p>';
      });
  }

  function bindOwnerShare(shareUrl, data) {
    var copyBtn = document.getElementById("copyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        openShareSheet(shareUrl, data.creatorNickname + "가 나를 얼마나 아는지 테스트해봐!");
      });
    }
  }

  // 지난 방문 이후 뭐가 달라졌는지(참여자 증가, 새 1위, 평균 변화, 새 공통 오해,
  // 처음 맞힌 문제, 카테고리 리더 교체, 새로운 unique-correct)를 로컬에 저장해둔
  // 스냅샷과 비교해서 "change_event" 목록으로 만들어줌. 서버에 따로 저장하지 않고
  // 이 브라우저에서 마지막으로 본 상태만 기억하는 방식이라 로그인이 필요 없음.
  function computeChangeEvents(gameId, report, attemptCount) {
    var key = "myeotdoya_report_snapshot_" + gameId;
    var prev = null;
    try { prev = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { prev = null; }

    var current = {
      attemptCount: attemptCount,
      avgScore: report.avgScore,
      topScore: report.topScore,
      topNickname: report.topNickname,
      misKeys: (report.misunderstandings || []).map(function (m) { return m.text; }),
      categoryLeaders: {},
      uniqueCorrectKeys: [],
      questionCorrectCounts: {},
    };
    (report.categoryLeaders || []).forEach(function (l) { current.categoryLeaders[l.category] = l.nickname; });
    (report.people || []).forEach(function (p) {
      if (p.uniqueCorrect) current.uniqueCorrectKeys.push(p.nickname + "::" + p.uniqueCorrect.text);
    });
    (report.questionStats || []).forEach(function (q) { current.questionCorrectCounts[q.idx] = q.correctCount; });

    var events = [];
    if (prev && current.attemptCount > prev.attemptCount) {
      if (current.topNickname && (current.topScore > prev.topScore || (current.topScore === prev.topScore && current.topNickname !== prev.topNickname))) {
        events.push({ type: "new_rank_1", text: "새로운 1위가 등장했어 — " + current.topNickname + " " + current.topScore + "% (이전 " + (prev.topNickname || "-") + " " + prev.topScore + "%)" });
      }
      if (typeof prev.avgScore === "number" && current.avgScore !== prev.avgScore) {
        var diff = current.avgScore - prev.avgScore;
        events.push({
          type: diff > 0 ? "average_score_up" : "average_score_down",
          text: "평균 이해도가 " + (diff > 0 ? "올랐어" : "내려갔어") + " — " + prev.avgScore + "% → " + current.avgScore + "%",
        });
      }
      current.misKeys.forEach(function (k) {
        if (prev.misKeys && prev.misKeys.indexOf(k) === -1) {
          events.push({ type: "new_common_misunderstanding", text: "새롭게 발견된 생각 차이가 있어" });
        }
      });
      Object.keys(current.questionCorrectCounts).forEach(function (idx) {
        var prevCount = prev.questionCorrectCounts ? prev.questionCorrectCounts[idx] : 0;
        if (current.questionCorrectCounts[idx] >= 1 && !prevCount) {
          events.push({ type: "first_correct_answer", text: "처음으로 누군가 맞힌 문제가 생겼어" });
        }
      });
      Object.keys(current.categoryLeaders).forEach(function (cat) {
        if (prev.categoryLeaders && prev.categoryLeaders[cat] && prev.categoryLeaders[cat] !== current.categoryLeaders[cat]) {
          events.push({ type: "new_category_leader", text: current.categoryLeaders[cat] + "가 " + GameCore.categoryLabel(cat) + "을(를) 가장 잘 아는 사람으로 바뀌었어" });
        }
      });
      current.uniqueCorrectKeys.forEach(function (k) {
        if (prev.uniqueCorrectKeys && prev.uniqueCorrectKeys.indexOf(k) === -1) {
          var nick = k.split("::")[0];
          events.push({ type: "unique_correct_answer", text: nick + "만 맞힌 문제가 새로 생겼어" });
        }
      });
    }

    var newCount = prev ? Math.max(0, current.attemptCount - prev.attemptCount) : 0;
    try { localStorage.setItem(key, JSON.stringify(current)); } catch (e) {}
    return { events: events.slice(0, 3), newCount: newCount, isFirstVisit: !prev };
  }

  // ---------- 응답자: 인트로 / 질문 ----------
  var respondentNickname = "";
  var guesses = [];
  var confidence = [];
  var subjectiveGuess = "";

  var DEEP_CONFIDENCE_LABEL = { guess: "그냥 느낌", half: "반반", sure: "이건 확실함" };

  function renderIntro(data) {
    progressWrap.style.display = "none";
    resetDepthBg();
    guesses = new Array(data.questions.length).fill(null);
    confidence = new Array(data.questions.length).fill(null);
    subjectiveGuess = "";
    stageEl.innerHTML =
      '<div class="q-text" style="text-align:center;">' + escapeHtml(data.creatorNickname) + "를<br/>얼마나 잘 알고 있어?</div>" +
      '<p style="font-size:14px;color:var(--ink-2);text-align:center;line-height:1.6;">10개의 질문.<br/>마지막 한 문제는 찍을 수도 없어요.</p>' +
      '<div class="field"><label>닉네임 (랭킹에 그대로 보여요)</label><input id="nickInput" type="text" maxlength="12" placeholder="예: 지수"/></div>' +
      '<button class="btn btn-primary" id="startBtn">시작하기 →</button>';
    playStageAnim();

    var input = document.getElementById("nickInput");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      respondentNickname = v.slice(0, 12);
      track("game_start");
      renderGameStartTransition(data, function () {
        renderQuestion(data, 0, { skipTransition: true });
      });
    }
    document.getElementById("startBtn").addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function renderGameStartTransition(data, cb) {
    progressWrap.style.display = "none";
    stageEl.innerHTML =
      '<div class="stage-transition">' +
      '<div class="connector"><span class="dot"></span><span class="line"><span class="line-fill" style="width:18%"></span></span><span class="dot"></span></div>' +
      '<p class="stage-transition-text">' + escapeHtml(data.creatorNickname) + "를 얼마나 알고 있는지 볼게.</p>" +
      "</div>";
    playStageAnim();
    setTimeout(cb, 700);
  }

  function renderQuestion(data, idx, opts) {
    opts = opts || {};
    var banner = GameCore.depthBannerForIndex(idx);
    if (banner && !opts.skipTransition) {
      renderTransition(banner, function () { renderQuestionCard(data, idx); });
    } else {
      renderQuestionCard(data, idx);
    }
  }

  function renderQuestionCard(data, idx) {
    var questions = data.questions;
    progressWrap.style.display = "block";
    progressFill.style.width = Math.round(((idx + 1) / TOTAL_STEPS) * 100) + "%";
    progressLabel.textContent = (idx + 1) + " / " + TOTAL_STEPS;
    setDepthBg(idx);
    var q = questions[idx];
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
        '<div class="confidence-sheet">' +
        '<p style="font-size:14px;font-weight:800;color:var(--ink);margin:18px 0 10px;">이 답, 얼마나 확신해?</p>' +
        '<div class="pill-group" id="confPills">' + pillsHtml + "</div>" +
        "</div>";
    }
    var showNextBtn = isDeep && guesses[idx] !== null && confidence[idx] !== null;

    stageEl.innerHTML =
      backHtml +
      '<div class="q-index">Q' + (idx + 1) + "</div>" +
      '<div class="q-text">' + escapeHtml(data.creatorNickname) + "라면?<br/>" + escapeHtml(q.text) + "</div>" +
      '<div class="opt-list">' + optsHtml + "</div>" +
      confidenceHtml +
      (showNextBtn ? '<button class="btn btn-primary" id="nextBtn" style="margin-top:18px;">다음 →</button>' : "");
    playStageAnim();

    var backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (idx === 0) { renderIntro(data); } else { renderQuestion(data, idx - 1, { skipTransition: true }); }
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
          // 같은 페이지 그대로, 확신 선택지만 새로 드러나도록 다시 그림 (전환 연출 없이)
          renderQuestion(data, idx, { skipTransition: true });
        } else {
          Array.prototype.forEach.call(stageEl.querySelectorAll(".opt"), function (b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          setTimeout(function () { advanceFrom(data, idx); }, 200);
        }
      });
    });
    Array.prototype.forEach.call(stageEl.querySelectorAll("#confPills .pill"), function (btn) {
      btn.addEventListener("click", function () {
        confidence[idx] = btn.getAttribute("data-v");
        renderQuestion(data, idx, { skipTransition: true });
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

    setTimeout(function () { renderSubjectiveForm(data); }, 850);
  }

  function renderSubjectiveForm(data) {
    stageEl.innerHTML =
      '<div class="q-index">Q10 · 주관식</div>' +
      '<div class="q-text">' + escapeHtml(data.creatorNickname) + "라면?<br/>" + escapeHtml(data.subjectivePrompt) + "</div>" +
      '<div class="field"><input id="subjInput" type="text" maxlength="80" placeholder="솔직하게, 짧게 예상해보세요"/></div>' +
      '<button class="btn btn-primary" id="subjNextBtn">완료하고 결과 보기 →</button>';
    playStageAnim();

    var input = document.getElementById("subjInput");
    var nextBtn = document.getElementById("subjNextBtn");
    input.focus();
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      subjectiveGuess = v.slice(0, 80);
      track("subjective_completed");

      // 입력을 고정하고, 두 점 사이 연결선이 끝까지 채워지는 걸 보여준 뒤 결과로.
      input.setAttribute("readonly", "readonly");
      nextBtn.disabled = true;
      var fillWrap = document.createElement("div");
      fillWrap.className = "connector";
      fillWrap.style.marginTop = "16px";
      fillWrap.innerHTML = '<span class="dot"></span><span class="line"><span class="line-fill" id="subjLineFill"></span></span><span class="dot"></span>';
      stageEl.appendChild(fillWrap);
      setTimeout(function () {
        var f = document.getElementById("subjLineFill");
        if (f) f.style.width = "100%";
      }, 60);

      setTimeout(function () { submitAttempt(data); }, 650);
    }
    nextBtn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  function submitAttempt(data) {
    progressWrap.style.display = "none";
    stageEl.innerHTML =
      '<div class="calc-card">' +
      '<div class="connector connector-lg"><span class="dot"></span><span class="line"><span class="line-fill" id="calcLineFill"></span></span><span class="dot"></span></div>' +
      '<p class="calc-phrase" style="animation-delay:.4s;">답을 하나씩 맞춰보는 중</p>' +
      '<p class="calc-phrase" style="animation-delay:1s;">겹치는 부분과 엇갈린 부분을 나누는 중</p>' +
      "</div>";
    playStageAnim();
    setTimeout(function () {
      var f = document.getElementById("calcLineFill");
      if (f) f.style.width = "100%";
    }, 100);

    var minWait = new Promise(function (resolve) { setTimeout(resolve, 1700); });
    var req = fetch("/api/submit-attempt", {
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
    }).then(function (r) { return r.json(); });

    Promise.all([req, minWait])
      .then(function (results) {
        var result = results[0];
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
        playStageAnim();
        document.getElementById("retryBtn").addEventListener("click", function () { submitAttempt(data); });
      });
  }

  // ---------- 응답자: 결과 화면 ----------
  function animateScoreCountUp(target) {
    var el = document.getElementById("scoreNum");
    if (!el) return;
    var start = null;
    var duration = 800;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      el.textContent = Math.round(target * p) + "%";
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target + "%";
        el.classList.add("num-bounce");
      }
    }
    requestAnimationFrame(step);
  }

  // "역도전" 링크 — 랜딩 페이지를 거치지 않고 바로 테스트 생성 흐름으로 들어가게,
  // 그리고 이미 알고 있는 정보(내 닉네임, 원본 게임/시도, 상대 닉네임)를 다시 묻지
  // 않도록 쿼리로 같이 넘겨줌.
  function buildReverseUrl(data, result, nickname) {
    return (
      "./create.html?reverseGameId=" + encodeURIComponent(data.gameId) +
      "&reverseAttemptId=" + encodeURIComponent(result.attemptId || "") +
      "&reverseCreatorNickname=" + encodeURIComponent(data.creatorNickname || "") +
      "&nickname=" + encodeURIComponent(nickname || "")
    );
  }

  function renderResultView(data, result, ranking) {
    progressWrap.style.display = "none";
    resetDepthBg();
    track("result_reveal");
    var nickname = result.nickname || respondentNickname;
    var showRanking = ranking && ranking.length >= 2;
    var score = result.score;
    var tierClass = score >= 100 ? " tier-perfect" : score >= 90 ? " tier-high" : "";

    stageEl.innerHTML =
      '<div class="score-big"><div class="num" id="scoreNum">0%</div><div class="cap">' + escapeHtml(result.scoreCopy) + "</div></div>" +
      '<div class="connector' + tierClass + '" style="margin:8px 0 6px;"><span class="dot"></span><span class="line"><span class="line-fill" id="scoreLineFill"></span></span><span class="dot"></span></div>' +
      '<p class="result-oneliner" style="text-align:center;font-weight:800;margin:14px 0 4px;">' + escapeHtml(data.creatorNickname) + " 이해도 " + result.score + "%</p>" +
      '<p class="result-oneliner" style="text-align:center;font-size:13.5px;color:var(--ink-2);margin:0 0 18px;line-height:1.6;animation-delay:1.05s;">' + escapeHtml(result.oneLiner) + "</p>" +
      surfaceInnerBarsHtml(result.surfaceScore, result.innerScore) +
      (showRanking
        ? '<p class="banner" style="margin-top:18px;">이 점수보다 ' + escapeHtml(data.creatorNickname) + '를 더 잘 아는 사람이 있을까?</p>' +
          '<div class="section-title">' + escapeHtml(data.creatorNickname) + '를 제일 잘 아는 사람</div>' + rankingHtml(ranking, nickname)
        : "") +
      '<div class="locked" id="adGateBox">' +
      '<div style="font-weight:800;font-size:14.5px;margin-bottom:6px;">우리가 엇갈린 순간</div>' +
      "<ul><li>가장 잘 안다고 확신한 문제에서 오히려 크게 빗나갔을 수도 있어요</li><li>취향은 거의 다 맞혔는데 속마음에서는 반복해서 엇갈렸을 수도 있고요</li><li>주관식 답변이 얼마나 비슷했는지도 같이 보여드려요</li></ul>" +
      '<button class="btn btn-primary unlock-btn" id="watchAdBtn">15초 보고 관계 리플레이 열기</button>' +
      "</div>" +
      '<div class="reverse-beat">' +
      '<p class="reverse-beat-line1">넌 ' + escapeHtml(data.creatorNickname) + "를 " + score + "% 알고 있었어.</p>" +
      '<p class="reverse-beat-line2">그런데 반대로,<br/>' + escapeHtml(data.creatorNickname) + "는 널 몇 % 알고 있을까?</p>" +
      "</div>" +
      '<div class="swap-connector" aria-hidden="true"><span class="dot a"></span><span class="line"></span><span class="dot b"></span></div>' +
      '<div class="cta-fixed"><a class="btn btn-primary cta-pulse-once" href="' + escapeHtml(buildReverseUrl(data, result, nickname)) + '" id="reverseCta">이번엔 ' + escapeHtml(data.creatorNickname) + "가 나를 맞혀보게 하기 →</a></div>";
    playStageAnim();

    animateScoreCountUp(score);
    setTimeout(function () {
      var f = document.getElementById("scoreLineFill");
      if (f) f.style.width = Math.max(4, score) + "%";
    }, 120);
    setTimeout(function () {
      Array.prototype.forEach.call(stageEl.querySelectorAll(".stat-fill[data-target]"), function (el) {
        el.style.width = el.getAttribute("data-target") + "%";
      });
    }, 500);

    // 광고 게이트가 스크롤로 들어오면 살짝 분위기를 바꿈 (한 번만)
    var adBox = document.getElementById("adGateBox");
    if (adBox && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            adBox.classList.add("ad-gate-enter");
            io.disconnect();
          }
        });
      }, { threshold: 0.4 });
      io.observe(adBox);
    }

    var reverseCta = document.getElementById("reverseCta");
    if (reverseCta) reverseCta.addEventListener("click", function () { track("reverse_challenge_click"); });

    // "내 결과 공유하기"는 광고(관계 리플레이 언락)를 실제로 본 뒤에만 노출함 — 그 전에 공유
    // 링크를 만들면 받는 사람이 광고 없이도 잠긴 콘텐츠(관계 리플레이)를 그대로 볼 수 있어서,
    // 광고를 본 뒤 나오는 "이 결과 친구에게 공유하기"(renderReplay 안)만 남겨둠.

    document.getElementById("watchAdBtn").addEventListener("click", function () {
      handleWatchAd(data, result);
    });
  }

  function surfaceInnerBarsHtml(surfaceScore, innerScore) {
    if (surfaceScore == null && innerScore == null) return "";
    var rows = [];
    if (surfaceScore != null) {
      rows.push('<div class="stat-row"><div class="stat-label">겉으로 보이는 나</div><div class="stat-track"><div class="stat-fill" data-target="' + surfaceScore + '" style="width:0%"></div></div><div class="stat-val">' + surfaceScore + "</div></div>");
    }
    if (innerScore != null) {
      rows.push('<div class="stat-row"><div class="stat-label">속으로 생각하는 나</div><div class="stat-track"><div class="stat-fill" data-target="' + innerScore + '" style="width:0%"></div></div><div class="stat-val">' + innerScore + "</div></div>");
    }
    return rows.join("");
  }

  function handleWatchAd(data, result) {
    track("rewarded_ad_start");
    var box = document.getElementById("adGateBox");
    box.classList.add("ad-gate-teaser");
    setTimeout(function () { box.classList.remove("ad-gate-teaser"); }, 320);

    setTimeout(function () {
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
            .then(function (detail) { showUnlockThenReplay(detail, data, result); })
            .catch(function () {
              var b = document.getElementById("adGateBox");
              if (b) b.innerHTML = '<p style="text-align:center;color:var(--warn);">불러오지 못했어요.</p>';
            });
        }
      }, 1000);
    }, 360);
  }

  function showUnlockThenReplay(detail, data, result) {
    var box = document.getElementById("adGateBox");
    if (!box) return;
    box.innerHTML = '<p style="text-align:center;font-weight:800;font-size:16px;color:var(--ink);padding:22px 0;opacity:0;animation:fadeUp .35s ease forwards;">열렸어.</p>';
    setTimeout(function () { renderReplay(detail, data, result); }, 550);
  }

  // "우리가 엇갈린 순간" 블록 + 전체 문제 비교 리스트를 만드는 공통 로직.
  // 관계 리플레이 화면(renderReplay)과, 공유된 결과 링크 화면(renderSharedResult)에서
  // 똑같이 재사용함.
  function buildReplayContentHtml(detail) {
    var blocks = [];
    var delay = 0;
    var STEP = 150;

    if (detail.bestKnownArea) {
      blocks.push(
        '<div class="advice-bubble advice-me" style="animation-delay:' + delay + 'ms;">' +
        '<span class="advice-name">내가 제일 잘 아는 부분</span>' +
        escapeHtml(detail.bestKnownArea.label) + " 관련 질문은 " + detail.bestKnownArea.correct + " / " + detail.bestKnownArea.total + "개 맞혔어요." +
        "</div>"
      );
      delay += STEP;
    }
    if (detail.mostMissedArea) {
      blocks.push(
        '<div class="advice-bubble advice-partner" style="animation-delay:' + delay + 'ms;">' +
        '<span class="advice-name">가장 크게 엇갈린 부분</span>' +
        escapeHtml(detail.mostMissedArea.label) + " 관련 질문에서는 " + detail.mostMissedArea.correct + " / " + detail.mostMissedArea.total + "개만 맞혔어요." +
        "</div>"
      );
      delay += STEP;
    }
    if (detail.confidentMiss) {
      var base = delay;
      blocks.push(
        '<div class="advice-bubble advice-partner" style="animation-delay:' + base + 'ms;">' +
        '<span class="advice-name">가장 자신 있었는데 빗나간 답</span>' +
        escapeHtml(detail.confidentMiss.text) + "<br/>" +
        '<span class="reveal-line" style="animation-delay:' + (base + 150) + 'ms;">내 예상: ' + escapeHtml(detail.confidentMiss.myGuess) + "</span>" +
        '<span class="reveal-line" style="animation-delay:' + (base + 500) + 'ms;">실제 답: <b>' + escapeHtml(detail.confidentMiss.actualAnswer) + "</b></span>" +
        '<span class="reveal-line" style="animation-delay:' + (base + 800) + 'ms;color:var(--ink-muted);font-size:12px;">이건 확실하다고 했었어.</span>' +
        "</div>"
      );
      delay = base + 950;
    }
    if (detail.subjective && detail.subjective.prompt) {
      var s = detail.subjective;
      var base2 = delay;
      blocks.push(
        '<div class="advice-bubble advice-me" style="animation-delay:' + base2 + 'ms;">' +
        '<span class="advice-name">주관식 의미 싱크</span>' +
        escapeHtml(s.prompt) + "<br/>" +
        '<span class="reveal-line" style="animation-delay:' + (base2 + 150) + 'ms;">내 예상: «' + escapeHtml(s.myGuess) + '»</span>' +
        '<span class="reveal-line" style="animation-delay:' + (base2 + 500) + 'ms;">실제 답: «<b>' + escapeHtml(s.actualAnswer) + '»</b></span>' +
        '<span class="reveal-line" style="animation-delay:' + (base2 + 850) + 'ms;font-weight:800;color:var(--pink);">' + (s.semanticScore != null ? s.semanticScore + "% · " : "") + escapeHtml(s.reason || "의미를 비교해봤어요.") + "</span>" +
        "</div>"
      );
      delay = base2 + 1000;
    }

    // 요약만으론 부족하다는 피드백 반영 — 9문제 전부 맞았는지/틀렸는지랑
    // 내 예상 vs 실제 답을 하나하나 다 비교해서 보여줌.
    var qaListHtml = "";
    if (detail.perQuestion && detail.perQuestion.length) {
      var qaBase = delay;
      var qaRows = detail.perQuestion.map(function (q, i) {
        var d = qaBase + Math.min(i, 10) * 40;
        var flag = q.correct
          ? '<span class="qa-flag qa-flag-correct">정답</span>'
          : '<span class="qa-flag qa-flag-wrong">다르게 답함</span>';
        var answerLine = q.correct
          ? "정답: <b>" + escapeHtml(q.actualAnswer) + "</b>"
          : "내 예상: " + escapeHtml(q.myGuess) + " · 실제 답: <b>" + escapeHtml(q.actualAnswer) + "</b>";
        return (
          '<div class="qa-row" style="animation-delay:' + d + 'ms;">' +
          '<div class="qa-row-top"><span class="qa-cat">' + escapeHtml(q.category) + "</span>" + flag + "</div>" +
          '<div class="qa-text">' + escapeHtml(q.text) + "</div>" +
          '<div class="qa-answer">' + answerLine + "</div>" +
          "</div>"
        );
      }).join("");
      delay = qaBase + Math.min(detail.perQuestion.length, 10) * 40 + 200;
      qaListHtml = '<div class="section-title">전체 문제 비교</div><div class="qa-list">' + qaRows + "</div>";
    }

    return {
      html: '<div class="section-title">우리가 엇갈린 순간</div>' + blocks.join("") + qaListHtml,
      oneLiner: detail.oneLiner || "",
      delay: delay,
    };
  }

  function renderReplay(detail, data, result) {
    track("replay_view");
    var box = document.getElementById("adGateBox");
    if (!box) return;

    var built = buildReplayContentHtml(detail);

    box.outerHTML =
      built.html +
      '<p class="mini-note" style="animation-delay:' + (built.delay + 100) + 'ms;">' + escapeHtml(built.oneLiner) + "</p>" +
      '<button class="btn btn-ghost" id="shareReplayBtn" style="margin-top:16px;">이 결과 친구에게 공유하기</button>';

    var shareReplayBtn = document.getElementById("shareReplayBtn");
    if (shareReplayBtn && data && result) {
      shareReplayBtn.addEventListener("click", function () {
        var replayShareUrl = location.origin + "/game.html?token=" + encodeURIComponent(data.gameId) + "&result=" + encodeURIComponent(result.attemptId);
        openShareSheet(replayShareUrl, "나는 " + data.creatorNickname + " 테스트에서 " + result.score + "% 나왔어! 관계 리플레이까지 다 봤어. 결과 보러 와줘");
      });
    }
  }

  // ---------- 공통 헬퍼 ----------
  function rankingHtml(ranking, highlightNickname) {
    if (!ranking || !ranking.length) return '<p class="lb-loading">아직 랭킹이 없어요.</p>';
    var n = ranking.length;
    var rows = ranking.map(function (r, i) {
      var medal = i === 0 ? "1위" : i === 1 ? "2위" : i === 2 ? "3위" : (i + 1) + "위";
      var cls = "lb-row";
      if (highlightNickname && r.nickname === highlightNickname) cls += " lb-row-me";
      if (i === 0) cls += " lb-row-first";
      var d = Math.round((n - 1 - i) * (900 / Math.max(1, n)));
      return (
        '<div class="' + cls + '" style="animation-delay:' + d + 'ms;"><div class="lb-rank">' + medal + "</div>" +
        '<div class="lb-names">' + escapeHtml(r.nickname) + "</div>" +
        '<div class="lb-score">' + r.score + "%</div></div>"
      );
    }).join("");
    return '<div class="lb-list">' + rows + "</div>";
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
    // 카카오 SDK가 없거나 실패하면 링크 복사로 대체
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

  function showToast(msg) {
    var t = document.createElement("div");
    t.className = "toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }
})();
