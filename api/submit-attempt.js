// Vercel Serverless Function — POST /api/submit-attempt
// body: { gameId, nickname, guesses: [10 ints], clientId }
// 응답자의 추측을 서버에서만 채점함 (생성자의 정답은 이 함수 안에서만 읽고,
// 응답에는 점수/카테고리 점수만 내려줌 — 문항별 정답 자체는 내려주지 않음).
// clientId로 중복 제출을 막고(로그인 없이도), 이미 낸 사람이 다시 보내면
// 새로 만들지 않고 기존 결과를 그대로 돌려줌(멱등 처리).

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

function clip(s, n) {
  return String(s || "").trim().slice(0, n);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
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
    const body = req.body || {};
    const gameId = body.gameId || "";
    const nickname = clip(body.nickname, 12);
    const guesses = body.guesses;
    const clientId = clip(body.clientId, 64);

    if (!gameId || !nickname || !clientId) {
      res.status(400).json({ error: "missing_data" });
      return;
    }

    const game = await redis.hgetall("game:" + gameId);
    if (!game || !game.creatorNickname) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // 이미 이 clientId로 제출한 적 있으면, 새로 만들지 않고 기존 결과 반환
    const existingAttemptId = await redis.get("game:" + gameId + ":client_attempt:" + clientId);
    if (existingAttemptId) {
      const attempt = await redis.hgetall("attempt:" + existingAttemptId);
      if (attempt && attempt.nickname) {
        const score = Number(attempt.score || 0);
        res.status(200).json({
          attemptId: existingAttemptId,
          score: score,
          categoryScores: safeParseField(attempt.categoryScores, {}),
          title: GameCore.titleForScore(score),
          scoreCopy: GameCore.scoreCopy(score),
          alreadyResponded: true,
        });
        return;
      }
    }

    const questionIds = safeParseField(game.questionIds, []);
    const creatorAnswers = safeParseField(game.answers, []);

    if (!Array.isArray(guesses) || guesses.length !== questionIds.length) {
      res.status(400).json({ error: "invalid_guesses" });
      return;
    }
    const questions = GameCore.getQuestionsByIds(questionIds);
    for (let i = 0; i < questions.length; i++) {
      const g = guesses[i];
      if (typeof g !== "number" || !Number.isInteger(g) || g < 0 || g >= questions[i].options.length) {
        res.status(400).json({ error: "invalid_guess_index" });
        return;
      }
    }

    const result = GameCore.scoreAttempt(questionIds, creatorAnswers, guesses);
    const attemptId = GameCore.genId(12);

    await redis.hset("attempt:" + attemptId, {
      gameId: gameId,
      nickname: nickname,
      answers: JSON.stringify(guesses),
      correctFlags: JSON.stringify(result.correctFlags),
      score: result.score,
      categoryScores: JSON.stringify(result.categoryScores),
      createdAt: Date.now(),
    });
    await redis.zadd("game:" + gameId + ":ranking", { score: result.score, member: attemptId });

    for (let i = 0; i < result.correctFlags.length; i++) {
      if (!result.correctFlags[i]) {
        await redis.hincrby("game:" + gameId + ":miscount", "q" + i, 1);
      }
    }

    await redis.set("game:" + gameId + ":client_attempt:" + clientId, attemptId);
    await redis.hincrby("game:" + gameId, "attemptCount", 1);
    await redis.incr("stats:total_attempts");

    res.status(200).json({
      attemptId: attemptId,
      score: result.score,
      categoryScores: result.categoryScores,
      title: GameCore.titleForScore(result.score),
      scoreCopy: GameCore.scoreCopy(result.score),
      alreadyResponded: false,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
