// Vercel Serverless Function — GET /game.html?token=... (vercel.json 리라이트로 여기로 들어옴)
// 정적 game.html 파일을 그대로 읽어서 반환하되, <head> 안의 title/og:*만 그 게임의
// 생성자 닉네임에 맞게 바꿔치기함. 카카오톡/문자 등으로 링크를 공유했을 때
// 미리보기 카드에 "OO를 얼마나 잘 알아?" 같은 문구 + 이미지가 뜨게 하기 위함.
// body(HTML)/script 태그는 정적 파일과 완전히 동일해서, 실제 사용자가 열었을 때
// 보이는 화면/동작은 기존과 똑같음 — <head> 메타 태그만 서버에서 살짝 바꿔치기.

const fs = require("fs");
const path = require("path");

let Redis;
try {
  Redis = require("@upstash/redis").Redis;
} catch (e) {
  Redis = null;
}

function getRedis() {
  if (!Redis) return null;
  try {
    return Redis.fromEnv();
  } catch (e) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

module.exports = async function handler(req, res) {
  let html;
  try {
    html = fs.readFileSync(path.join(__dirname, "..", "game.html"), "utf8");
  } catch (e) {
    res.status(500).send("page not found");
    return;
  }

  try {
    const gameId = (req.query && req.query.token) || "";
    const redis = getRedis();

    if (gameId && redis) {
      const game = await redis.hgetall("game:" + gameId);
      if (game && game.creatorNickname) {
        const nickname = game.creatorNickname;
        const attemptCount = Number(game.attemptCount || 0);
        const title = nickname + "를 얼마나 잘 알고 있어? — 누가날알까";
        const desc =
          "내가 먼저 답을 골라놨어. 얼마나 맞히는지 볼까? 10문제, 1분." +
          (attemptCount > 0 ? " 지금까지 " + attemptCount + "명이 도전했어요." : "");
        const imageUrl = "https://myeotdoya.vercel.app/og-image.png";
        const safeTitle = escapeHtml(title);
        const safeDesc = escapeHtml(desc);

        html = html.replace(/<title>[^<]*<\/title>/, "<title>" + safeTitle + "</title>");
        html = html.replace(
          "</head>",
          '<meta property="og:title" content="' + safeTitle + '" />\n' +
          '<meta property="og:description" content="' + safeDesc + '" />\n' +
          '<meta property="og:type" content="website" />\n' +
          '<meta property="og:image" content="' + imageUrl + '" />\n' +
          '<meta name="twitter:card" content="summary_large_image" />\n' +
          '<meta name="twitter:title" content="' + safeTitle + '" />\n' +
          '<meta name="twitter:description" content="' + safeDesc + '" />\n' +
          '<meta name="twitter:image" content="' + imageUrl + '" />\n' +
          "</head>"
        );
      }
    }
  } catch (e) {
    // 미리보기 문구 커스터마이징이 실패해도 페이지 자체는 항상 정상적으로 떠야 함
  }

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(html);
};
