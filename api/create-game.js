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

// 로그인 없이도 "내가 만든 테스트"를 다른 기기/브라우저에서 다시 불러올 수 있게 해주는
// 복구 코드. 헷갈리기 쉬운 0/o/1/i/l은 알파벳에서 뺐음.
function genRecoveryCode() {
  var chars = "abcdefghjkmnpqrstuvwxyz23456789";
  var out = "";
  for (var i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeCreatorKey(v) {
  var k = String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return /^[a-z0-9]{6,40}$/.test(k) ? k : "";
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
    // "역도전"으로 만들어진 게임이면(방금 다른 게임에 응답한 사람이 상대를 맞혀보라고
    // 되받아치는 경우), 원본 게임/시도 정보를 같이 저장해서 나중에 "우리 서로 이해도"를
    // 계산할 수 있게 함. 형식만 가볍게 검증하고, 실제 존재 여부는 여기서 확인하지 않음
    // (검증 실패해도 게임 생성 자체는 막지 않고, 나중에 조회 시 조용히 무시됨).
    const reverseOfGameId = /^[a-zA-Z0-9]{4,20}$/.test(String(body.reverseOfGameId || "")) ? String(body.reverseOfGameId) : "";
    const reverseOfAttemptId = /^[a-zA-Z0-9]{4,20}$/.test(String(body.reverseOfAttemptId || "")) ? String(body.reverseOfAttemptId) : "";
    const reverseOfCreatorNickname = clip(body.reverseOfCreatorNickname, 12);

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

    const gameFields = {
      creatorNickname: nickname,
      createdAt: Date.now(),
      questionIds: JSON.stringify(questionIds),
      answers: JSON.stringify(answers),
      subjectivePrompt: subjectivePrompt,
      subjectiveAnswer: subjectiveAnswer,
      ownerToken: ownerToken,
      attemptCount: 0,
    };
    if (reverseOfGameId && reverseOfAttemptId) {
      gameFields.reverseOfGameId = reverseOfGameId;
      gameFields.reverseOfAttemptId = reverseOfAttemptId;
      gameFields.reverseOfCreatorNickname = reverseOfCreatorNickname;
    }
    await redis.hset("game:" + gameId, gameFields);
    await redis.set("owner_lookup:" + ownerToken, gameId);
    await redis.incr("stats:games_created");

    // "내가 만든 테스트" 목록을 다른 기기에서도 볼 수 있게, 복구 코드 하나에
    // 여러 게임을 묶어서 인덱싱해둠. 클라이언트가 기존 코드를 보냈으면 그대로 쓰고,
    // 처음이면 새로 하나 발급함.
    let creatorKey = normalizeCreatorKey(body.creatorKey);
    if (!creatorKey) creatorKey = genRecoveryCode();
    try {
      const indexKey = "creator:" + creatorKey + ":games";
      const rawList = await redis.get(indexKey);
      let list = [];
      if (Array.isArray(rawList)) list = rawList;
      else if (typeof rawList === "string") {
        try { list = JSON.parse(rawList); } catch (e) { list = []; }
      }
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (id) { return id !== gameId; });
      list.unshift(gameId);
      await redis.set(indexKey, JSON.stringify(list.slice(0, 50)));
    } catch (e) {
      // 복구 코드 인덱싱이 실패해도 게임 생성 자체는 정상 처리되어야 함
    }

    res.status(200).json({ gameId: gameId, ownerToken: ownerToken, creatorKey: creatorKey });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
