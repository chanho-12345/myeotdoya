// Vercel Serverless Function — GET /api/attempt-detail?gameId=<gameId>&attemptId=<attemptId>
// "관계 리플레이" — 광고 시청 후 열리는 응답자 본인 전용 상세 리포트.
// V1의 "내 답 A / 네 답 B" 단순 나열을 폐기하고, 실제 데이터로부터:
//   1) 내가 제일 잘 아는 부분   2) 가장 크게 엇갈린 부분
//   3) 확신했는데 틀린 답      4) 주관식 의미 싱크
// 를 만들어 돌려줌. 이미 채점이 끝난 자기 자신의 시도에 대한 결과 공개라서
// (추측을 다 제출한 뒤라 부정행위 여지가 없음) 정답 텍스트를 보여줘도 안전함.
// 광고 시청 여부는 서버에서 검증하지 않음(플레인 웹 광고라 검증 불가) — 프론트에서
// 광고 재생을 마친 뒤에만 이 API를 호출하도록 게이트함.

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
    const confidence = safeParseField(attempt.confidence, []);
    const questions = GameCore.getQuestionsByIds(questionIds);

    // 카테고리별 정답률 -> 제일 잘 아는 부분 / 가장 엇갈린 부분
    const catTotal = {}, catCorrect = {};
    questions.forEach(function (q, i) {
      catTotal[q.category] = (catTotal[q.category] || 0) + 1;
      if (correctFlags[i]) catCorrect[q.category] = (catCorrect[q.category] || 0) + 1;
    });
    const catStats = Object.keys(catTotal).map(function (cat) {
      return { cat: cat, label: GameCore.categoryLabel(cat), total: catTotal[cat], correct: catCorrect[cat] || 0, ratio: (catCorrect[cat] || 0) / catTotal[cat] };
    });
    catStats.sort(function (a, b) { return b.ratio - a.ratio; });
    const bestKnownArea = catStats.length ? { label: catStats[0].label, correct: catStats[0].correct, total: catStats[0].total } : null;
    const worstCandidates = catStats.filter(function (c) { return c.ratio < 1; });
    const mostMissedArea = worstCandidates.length
      ? (function () {
          const w = worstCandidates[worstCandidates.length - 1];
          return { label: w.label, correct: w.correct, total: w.total };
        })()
      : null;

    // 확신했는데 틀린 답 (deep 질문 중 confidence === "sure" 인데 틀린 것)
    let confidentMiss = null;
    for (let i = 0; i < questions.length; i++) {
      if (confidence[i] === "sure" && !correctFlags[i]) {
        confidentMiss = {
          text: questions[i].text,
          myGuess: questions[i].options[guesses[i]] || "",
          actualAnswer: questions[i].options[creatorAnswers[i]] || "",
        };
        break;
      }
    }

    const subjective = {
      prompt: game.subjectivePrompt || "",
      myGuess: attempt.subjectiveGuess || "",
      actualAnswer: game.subjectiveAnswer || "",
      semanticScore: attempt.semanticScore != null ? Number(attempt.semanticScore) : null,
      matchLevel: attempt.semanticLevel || null,
      reason: attempt.semanticReason || "",
    };

    const surfaceScore = attempt.surfaceScore === "" || attempt.surfaceScore == null ? null : Number(attempt.surfaceScore);
    const innerScore = attempt.innerScore === "" || attempt.innerScore == null ? null : Number(attempt.innerScore);

    // 요약(제일 잘 아는 부분 등)만으론 부족하다는 피드백 반영 — 9문제 전부
    // 맞았는지/틀렸는지 + 내 예상/실제 답을 하나하나 다 비교해서 같이 내려줌.
    const perQuestion = questions.map(function (q, i) {
      return {
        category: GameCore.categoryLabel(q.category),
        text: q.text,
        correct: !!correctFlags[i],
        myGuess: q.options[guesses[i]] || "",
        actualAnswer: q.options[creatorAnswers[i]] || "",
        confidence: confidence[i] || null,
      };
    });

    res.status(200).json({
      bestKnownArea: bestKnownArea,
      mostMissedArea: mostMissedArea,
      confidentMiss: confidentMiss,
      subjective: subjective,
      surfaceScore: surfaceScore,
      innerScore: innerScore,
      oneLiner: GameCore.relationshipOneLiner(surfaceScore, innerScore),
      perQuestion: perQuestion,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
