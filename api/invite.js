// Vercel Serverless Function — GET /api/invite?token=<gameId>
// 카카오톡 등 링크 미리보기는 JS를 실행하지 않고 정적 OG 태그만 읽어가기 때문에,
// 생성자 이름이 들어간 미리보기 카드를 서버에서 미리 렌더링해서 보여주고
// 실제 방문자는 바로 game.html로 넘겨주는 페이지. (LOVE DNA의 api/invite.js와 동일한 패턴)

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
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

module.exports = async function handler(req, res) {
  const gameId = (req.query && req.query.token) || "";
  let creatorNickname = "";

  const redis = getRedis();
  if (redis && gameId) {
    try {
      creatorNickname = (await redis.hget("game:" + gameId, "creatorNickname")) || "";
    } catch (e) {
      creatorNickname = "";
    }
  }

  let title = "누가날알까 — 정말 나를 잘 아는 걸까?";
  let desc = "10개의 질문, 마지막 한 문제는 찍을 수도 없어요.";
  if (creatorNickname) {
    title = escapeHtml(creatorNickname) + "를 얼마나 잘 알고 있어?";
    desc = "10개의 질문. 마지막 한 문제는 찍을 수도 없어요.";
  }

  const redirectUrl = "/game.html" + (gameId ? "?token=" + encodeURIComponent(gameId) : "");
  const safeRedirect = escapeHtml(redirectUrl);

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(
    "<!DOCTYPE html>" +
    '<html lang="ko"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + title + "</title>" +
    '<meta property="og:title" content="' + title + '">' +
    '<meta property="og:description" content="' + desc + '">' +
    '<meta property="og:type" content="website">' +
    '<meta name="twitter:card" content="summary">' +
    '<meta http-equiv="refresh" content="0; url=' + safeRedirect + '">' +
    "<script>location.replace(" + JSON.stringify(redirectUrl) + ");</script>" +
    "</head><body>" +
    '<p>이동 중입니다... <a href="' + safeRedirect + '">여기를 눌러주세요</a></p>' +
    "</body></html>"
  );
};
