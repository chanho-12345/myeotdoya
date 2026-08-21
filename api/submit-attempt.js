// Vercel Serverless Function — POST /api/submit-attempt
// body: { gameId, nickname, guesses: [9 ints], confidence: [9 | null], subjectiveGuess, clientId }
// V2: 객관식 9문제(가중치 반영) + 주관식 1문제(AI 의미 비교)를 한 번에 채점함.
// 생성자의 정답(game.answers / game.subjectiveAnswer)은 이 함수 안에서만 읽고,
// 응답에는 점수류만 내려줌 — 문항별 정답 텍스트는 attempt-detail.js에서만,
// 그것도 이미 채점이 끝난 "본인 시도"에 한해서만 내려줌.

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

function buildSemanticPrompt(promptText, creatorAnswer, respondentGuess) {
  return (
    "너는 두 사람의 짧은 주관식 답변이 의미적으로 얼마나 비슷한지 판단하는 채점자야. " +
    "새로운 사실을 지어내거나 심리 분석을 하지 말고, 오직 두 문장의 의미 유사도만 판단해.\n\n" +
    "[질문]\n" + promptText + "\n\n" +
    "[생성자의 실제 답변]\n" + creatorAnswer + "\n\n" +
    "[응답자의 추측]\n" + respondentGuess + "\n\n" +
    "표현이 다르더라도 핵심 의미가 같으면 높은 점수를 줘. 완전히 다른 내용이면 낮은 점수를 줘.\n\n" +
    "아래 JSON 형식으로만 답해. 다른 설명이나 마크다운 없이 순수 JSON 객체 하나만 출력해:\n" +
    "{\n" +
    '  "semantic_score": 0~100 사이 정수,\n' +
    '  "match_level": "very_close" | "close" | "partial" | "different" 중 하나,\n' +
    '  "short_reason": "한 문장, 20자 내외로 왜 그런 점수인지"\n' +
    "}"
  );
}

// AI가 실패해도(키 없음/타임아웃/파싱실패) 게임이 멈추면 안 되므로,
// 항상 { score, level, reason, viaAI } 형태로 반환하고 실패 시 fallback으로 대체함.
async function semanticScore(promptText, creatorAnswer, respondentGuess) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !creatorAnswer || !respondentGuess) {
    const s = GameCore.fallbackSemanticScore(creatorAnswer, respondentGuess);
    return { score: s, level: GameCore.matchLevelForScore(s), reason: "표현은 다르지만 겹치는 단어를 기준으로 비교했어요.", viaAI: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [{ role: "user", content: buildSemanticPrompt(promptText, creatorAnswer, respondentGuess) }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) throw new Error("upstream_" + upstream.status);
    const data = await upstream.json();
    const textBlock = data && Array.isArray(data.content) ? data.content.find((b) => b && b.type === "text") : null;
    const raw = textBlock && textBlock.text;
    if (!raw) throw new Error("empty_response");
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.semantic_score))));
    if (Number.isNaN(score)) throw new Error("bad_score");
    return {
      score: score,
      level: parsed.match_level || GameCore.matchLevelForScore(score),
      reason: clip(parsed.short_reason, 60) || "의미를 비교해봤어요.",
      viaAI: true,
    };
  } catch (e) {
    const s = GameCore.fallbackSemanticScore(creatorAnswer, respondentGuess);
    return { score: s, level: GameCore.matchLevelForScore(s), reason: "표현은 다르지만 겹치는 단어를 기준으로 비교했어요.", viaAI: false };
  }
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
    const confidenceRaw = Array.isArray(body.confidence) ? body.confidence : [];
    const subjectiveGuess = clip(body.subjectiveGuess, 200);
    const clientId = clip(body.clientId, 64);

    if (!gameId || !nickname || !clientId || !subjectiveGuess) {
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
        res.status(200).json({
          attemptId: existingAttemptId,
          score: Number(attempt.score || 0),
          surfaceScore: attempt.surfaceScore != null ? Number(attempt.surfaceScore) : null,
          innerScore: attempt.innerScore != null ? Number(attempt.innerScore) : null,
          title: GameCore.titleForScore(Number(attempt.score || 0)),
          scoreCopy: GameCore.scoreCopy(Number(attempt.score || 0)),
          oneLiner: GameCore.relationshipOneLiner(
            attempt.surfaceScore != null ? Number(attempt.surfaceScore) : null,
            attempt.innerScore != null ? Number(attempt.innerScore) : null
          ),
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
    const confidence = questions.map(function (q, i) {
      const c = confidenceRaw[i];
      return ["guess", "half", "sure"].indexOf(c) !== -1 ? c : null;
    });

    const semantic = await semanticScore(game.subjectivePrompt || "", game.subjectiveAnswer || "", subjectiveGuess);
    const result = GameCore.scoreAttempt(questionIds, creatorAnswers, guesses, semantic.score);
    const attemptId = GameCore.genId(12);

    await redis.hset("attempt:" + attemptId, {
      gameId: gameId,
      nickname: nickname,
      answers: JSON.stringify(guesses),
      correctFlags: JSON.stringify(result.correctFlags),
      confidence: JSON.stringify(confidence),
      subjectiveGuess: subjectiveGuess,
      semanticScore: semantic.score,
      semanticLevel: semantic.level,
      semanticReason: semantic.reason,
      score: result.score,
      surfaceScore: result.surfaceScore == null ? "" : result.surfaceScore,
      innerScore: result.innerScore == null ? "" : result.innerScore,
      createdAt: Date.now(),
    });
    await redis.zadd("game:" + gameId + ":ranking", { score: result.score, member: attemptId });

    for (let i = 0; i < result.correctFlags.length; i++) {
      if (!result.correctFlags[i]) {
        await redis.hincrby("game:" + gameId + ":miscount", "q" + i, 1);
        // 어떤 오답을 얼마나 많이 골랐는지도 집계함 — "친구들의 공통 오해" 계산용.
        // 누가 그 오답을 골랐는지는 저장하지 않고, 문항×오답 조합의 카운트만 늘림.
        await redis.hincrby("game:" + gameId + ":miscount_opt", "q" + i + "_" + guesses[i], 1);
      }
    }

    await redis.set("game:" + gameId + ":client_attempt:" + clientId, attemptId);
    await redis.hincrby("game:" + gameId, "attemptCount", 1);
    await redis.incr("stats:total_attempts");

    res.status(200).json({
      attemptId: attemptId,
      score: result.score,
      surfaceScore: result.surfaceScore,
      innerScore: result.innerScore,
      title: GameCore.titleForScore(result.score),
      scoreCopy: GameCore.scoreCopy(result.score),
      oneLiner: GameCore.relationshipOneLiner(result.surfaceScore, result.innerScore),
      alreadyResponded: false,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
