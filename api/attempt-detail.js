// Vercel Serverless Function — GET /api/attempt-detail?gameId=<gameId>&attemptId=<attemptId>
// "가장 의외로 틀린 질문" — 광고 시청 후 열리는 응답자 본인 전용 상세 콘텐츠.
// 이미 채점이 끝난 자기 자신의 시도에 대한 결과 공개라서(추측을 다 제출한 뒤라
// 부정행위 여지가 없음) 여기서는 정답 텍스트를 보여줘도 안전함.
// 광고 시청 여부는 서버에서 검증하지 않음(플레인 웹 광고라 검증 불가) — 프론트에서
// 광고 재생을 마친 뒤에만 이 API를 호출하도록 게이트함(Phase 1 문서의 "간이형" 원칙).

const GameCore = require("../game-core.js");

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

function safeParseField(v, fallback) {
  if (v && typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const redis = getRedis();
  if (!redis) {
    res.status(500).json({
      error: "db_not_configured",
      message: "Redis가 아직 연결되지 않았어요. (관리자: Vercel Storage 탭에서 Upstash Redis를 연결해주세요)",
    });
    return;
  }

  try {
    const gameId = (req.query && req.query.gameId) || "";
    const attemptId = (req.query && req.query.attemptId) || "";
    if (!gameId || !attemptId) {
      res.status(400).json({ error: "missing_data" });
      return;
    }

    const attempt = await redis.hgetall("attempt:" + attemptId);
    if (!attempt || attempt.gameId !== gameId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const game = await redis.hgetall("game:" + gameId);
    if (!game || !game.creatorNickname) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const questionIds = safeParseField(game.questionIds, []);
    const creatorAnswers = safeParseField(game.answers, []);
    const guesses = safeParseField(attempt.answers, []);
    const correctFlags = safeParseField(attempt.correctFlags, []);
    const questions = GameCore.getQuestionsByIds(questionIds);

    const wrong = [];
    for (let i = 0; i < correctFlags.length; i++) {
      if (!correctFlags[i] && questions[i]) {
        wrong.push({
          category: questions[i].category,
          text: questions[i].text,
          myGuess: questions[i].options[guesses[i]] || "",
          actualAnswer: questions[i].options[creatorAnswers[i]] || "",
        });
      }
    }

    res.status(200).json({
      totalWrong: wrong.length,
      items: wrong.slice(0, 3),
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
