// Vercel Serverless Function — GET /api/game?token=<gameId>&owner=<ownerToken>&clientId=<clientId>
// 응답자/생성자 화면이 공통으로 쓰는 조회 API.
// 생성자의 정답(game.answers, game.subjectiveAnswer)은 어떤 경우에도 응답에
// 포함하지 않음 — 서버 채점 전용. 주관식 "질문 문구"(subjectivePrompt)는
// 정답이 아니라서 노출해도 안전함 — 응답자가 질문을 봐야 답을 쓸 수 있음.

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
    const gameId = (req.query && req.query.token) || "";
    const owner = (req.query && req.query.owner) || "";
    const clientId = (req.query && req.query.clientId) || "";
    if (!gameId) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    const game = await redis.hgetall("game:" + gameId);
    if (!game || !game.creatorNickname) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const questionIds = safeParseField(game.questionIds, []);
    const attemptCount = Number(game.attemptCount || 0);
    const isOwner = !!owner && owner === game.ownerToken;
    const questions = GameCore.getQuestionsByIds(questionIds);

    // 이미 참여한 응답자라면 자기 결과를 다시 보여줌 (재방문 대응)
    let myAttempt = null;
    if (clientId) {
      const myAttemptId = await redis.get("game:" + gameId + ":client_attempt:" + clientId);
      if (myAttemptId) {
        const attempt = await redis.hgetall("attempt:" + myAttemptId);
        if (attempt && attempt.nickname) {
          const score = Number(attempt.score || 0);
          const surfaceScore = attempt.surfaceScore === "" || attempt.surfaceScore == null ? null : Number(attempt.surfaceScore);
          const innerScore = attempt.innerScore === "" || attempt.innerScore == null ? null : Number(attempt.innerScore);
          myAttempt = {
            attemptId: myAttemptId,
            nickname: attempt.nickname,
            score: score,
            surfaceScore: surfaceScore,
            innerScore: innerScore,
            title: GameCore.titleForScore(score),
            scoreCopy: GameCore.scoreCopy(score),
            oneLiner: GameCore.relationshipOneLiner(surfaceScore, innerScore),
          };
        }
      }
    }

    // 랭킹은 익명이 아니라서(스펙 원칙) 참여자 누구에게나 노출 — 2명 이상일 때
    // 보여줄지는 화면(클라이언트) 쪽에서 결정하고, 여기선 항상 계산해서 내려줌.
    let ranking = [];
    if (attemptCount > 0) {
      const raw = await redis.zrange("game:" + gameId + ":ranking", 0, 9, { rev: true, withScores: true });
      const idsInOrder = [];
      const scoreById = {};
      for (let i = 0; i < raw.length; i += 2) {
        idsInOrder.push(raw[i]);
        scoreById[raw[i]] = Number(raw[i + 1]);
      }
      const nicknames = await Promise.all(
        idsInOrder.map(function (id) {
          return redis.hget("attempt:" + id, "nickname");
        })
      );
      ranking = idsInOrder.map(function (id, i) {
        return { nickname: nicknames[i] || "익명", score: scoreById[id] };
      });
    }

    // "친구들이 가장 헷갈린 내 모습" — 생성자 전용, 5명 이상 모였을 때만
    let miscount = null;
    if (isOwner && attemptCount >= 5) {
      const raw = await redis.hgetall("game:" + gameId + ":miscount");
      const entries = [];
      if (raw) {
        Object.keys(raw).forEach(function (key) {
          const idx = parseInt(key.replace("q", ""), 10);
          const q = questions[idx];
          if (q) {
            entries.push({ category: GameCore.categoryLabel(q.category), text: q.text, missCount: Number(raw[key] || 0) });
          }
        });
      }
      entries.sort(function (a, b) { return b.missCount - a.missCount; });
      miscount = entries.slice(0, 3);
    }

    res.status(200).json({
      gameId: gameId,
      creatorNickname: game.creatorNickname,
      attemptCount: attemptCount,
      questions: questions,
      subjectivePrompt: game.subjectivePrompt || "",
      isOwner: isOwner,
      alreadyResponded: !!myAttempt,
      myAttempt: myAttempt,
      ranking: ranking,
      miscount: miscount,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
