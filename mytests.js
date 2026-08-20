(function () {
  "use strict";
  var stageEl = document.getElementById("stage");

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function playStageAnim() {
    stageEl.classList.remove("stage-anim-in");
    void stageEl.offsetWidth;
    stageEl.classList.add("stage-anim-in");
  }

  function formatDate(ts) {
    if (!ts) return "";
    try {
      var d = new Date(ts);
      return (d.getMonth() + 1) + "월 " + d.getDate() + "일에 만듦";
    } catch (e) {
      return "";
    }
  }

  function loadMyTests() {
    var list = [];
    try {
      var raw = localStorage.getItem("myeotdoya_my_tests");
      list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
    } catch (e) {
      list = [];
    }

    // 이전 버전(보관함 없이 owner 링크만 저장하던 때)에 만든 테스트도 놓치지 않게 같이 모음.
    try {
      var known = {};
      list.forEach(function (t) { known[t.gameId] = true; });
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf("myeotdoya_owner_") === 0) {
          var gameId = key.slice("myeotdoya_owner_".length);
          if (!known[gameId]) {
            list.push({ gameId: gameId, ownerToken: localStorage.getItem(key), nickname: "", createdAt: 0 });
          }
        }
      }
    } catch (e) {}

    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return list;
  }

  function render() {
    var list = loadMyTests();

    if (!list.length) {
      stageEl.innerHTML =
        '<div class="q-text" style="text-align:center;">아직 만든 테스트가 없어요</div>' +
        '<p style="font-size:14px;color:var(--ink-2);text-align:center;line-height:1.6;">테스트를 만들면 여기 자동으로 보관돼서<br/>다음에 다시 찾기 쉬워져요.</p>' +
        '<a class="btn btn-primary" href="./create.html">내 테스트 만들기 →</a>';
      playStageAnim();
      return;
    }

    var rows = list.map(function (t, i) {
      var ownerUrl = "./game.html?token=" + encodeURIComponent(t.gameId) + "&owner=" + encodeURIComponent(t.ownerToken);
      var label = t.nickname ? escapeHtml(t.nickname) + "의 테스트" : "내가 만든 테스트";
      var dateLabel = formatDate(t.createdAt);
      return (
        '<a class="lb-row" style="text-decoration:none;animation-delay:' + Math.min(i, 8) * 60 + 'ms;" href="' + ownerUrl + '">' +
        '<div style="flex:1;">' +
        '<div style="font-weight:800;color:var(--ink);font-size:14px;">' + label + "</div>" +
        (dateLabel ? '<div style="font-size:11.5px;color:var(--ink-muted);margin-top:2px;">' + dateLabel + "</div>" : "") +
        "</div>" +
        '<div style="color:var(--pink);font-weight:700;font-size:13px;">보기 →</div>' +
        "</a>"
      );
    }).join("");

    stageEl.innerHTML =
      '<div class="q-text" style="text-align:center;">내가 만든 테스트</div>' +
      '<p style="font-size:13px;color:var(--ink-2);text-align:center;margin-top:-8px;">이 목록은 이 브라우저에만 저장돼요.</p>' +
      '<div class="lb-list" style="margin-top:16px;">' + rows + "</div>" +
      '<div class="cta-fixed"><a class="btn btn-primary" href="./create.html">+ 새 테스트 만들기</a></div>';
    playStageAnim();
  }

  render();
})();
