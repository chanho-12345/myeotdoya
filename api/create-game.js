// Vercel Serverless Function — POST /api/create-game
// body: { nickname, questionIds: [9 ids, casualx3+personalx3+deepx3], answers: [9 ints],
//         subjectivePrompt, subjectiveAnswer }
// 생성자가 객관식 9개 + 주관식 1개에 먼저 답한 걸 받아서 새 게임을 만듦.
// answers/subjectiveAnswer(생성자의 정답)는 이후 그 어떤 GET 응답에도 절대
// 포함되지 않음 — api/game.js, api/submit-attempt.js 쪽 주석 참고.

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
    const nickname = clip(body.nickname, 12);
    const questionIds = body.questionIds;
    const answers = body.answers;
    const subjectivePrompt = clip(body.subjectivePrompt, 80);
    const subjectiveAnswer = clip(body.subjectiveAnswer, 80);

    if (!nickname) {
      res.status(400).json({ error: "missing_nickname" });
      return;
    }
    if (!GameCore.isValidQuestionSet(questionIds)) {
      res.status(400).json({ error: "invalid_question_set" });
      return;
    }
    if (!Array.isArray(answers) || answers.length !== questionIds.length) {
      res.status(400).json({ error: "invalid_answers" });
      return;
    }
    if (!GameCore.isValidSubjectivePrompt(subjectivePrompt)) {
      res.status(400).json({ error: "invalid_subjective_prompt" });
      return;
    }
    if (!subjectiveAnswer) {
      res.status(400).json({ error: "missing_subjective_answer" });
      return;
    }
    const questions = GameCore.getQuestionsByIds(questionIds);
    for (let i = 0; i < questions.length; i++) {
      const a = answers[i];
      if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a >= questions[i].options.length) {
        res.status(400).json({ error: "invalid_answer_index" });
        return;
      }
    }

    // gameId 충돌은 사실상 거의 없지만(62^8 공간), 안전하게 몇 번 재시도
    let gameId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = GameCore.genId(8);
      const exists = await redis.exists("game:" + candidate);
      if (!exists) {
        gameId = candidate;
        break;
      }
    }
    if (!gameId) {
      res.status(500).json({ error: "id_generation_failed" });
      return;
    }
    const ownerToken = GameCore.genId(32);

    await redis.hset("game:" + gameId, {
      creatorNickname: nickname,
      createdAt: Date.now(),
      questionIds: JSON.stringify(questionIds),
      answers: JSON.stringify(answers),
      subjectivePrompt: subjectivePrompt,
      subjectiveAnswer: subjectiveAnswer,
      ownerToken: ownerToken,
      attemptCount: 0,
    });
    await redis.set("owner_lookup:" + ownerToken, gameId);
    await redis.incr("stats:games_created");

    res.status(200).json({ gameId: gameId, ownerToken: ownerToken });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
