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
    let idsInOrder = [];
    let attemptById = {};
    if (attemptCount > 0) {
      const raw = await redis.zrange("game:" + gameId + ":ranking", 0, 9, { rev: true, withScores: true });
      const scoreById = {};
      for (let i = 0; i < raw.length; i += 2) {
        idsInOrder.push(raw[i]);
        scoreById[raw[i]] = Number(raw[i + 1]);
      }
      // owner 화면(관계 리포트)에서는 상위 응답자들의 카테고리별 정답 여부까지 필요해서
      // hgetall로 한 번에 받아두고, 응답 자체에는 닉네임/점수만 내려줌.
      const attempts = await Promise.all(
        idsInOrder.map(function (id) {
          return redis.hgetall("attempt:" + id);
        })
      );
      attempts.forEach(function (a, i) {
        attemptById[idsInOrder[i]] = a;
      });
      ranking = idsInOrder.map(function (id, i) {
        const a = attempts[i];
        return { nickname: (a && a.nickname) || "익명", score: scoreById[id] };
      });
    }

    // "관계 리포트" — 생성자 전용. 개별 응답자를 특정할 수 없도록 집계 데이터만 사용하고,
    // 타입 문구는 AI 추측이 아니라 실제 카테고리별 정답 데이터로만 결정함.
    let report = null;
    if (isOwner && attemptCount > 0) {
      const creatorAnswers = safeParseField(game.answers, []);

      // 평균 이해도 — 상위 10명만이 아니라 전체 응답자 기준으로 계산
      let avgScore = 0;
      try {
        const allScores = await redis.zrange("game:" + gameId + ":ranking", 0, -1, { withScores: true });
        let sum = 0, n = 0;
        for (let i = 0; i < allScores.length; i += 2) {
          sum += Number(allScores[i + 1]);
          n += 1;
        }
        avgScore = n ? Math.round(sum / n) : 0;
      } catch (e) {
        avgScore = ranking.length ? Math.round(ranking.reduce((s, r) => s + r.score, 0) / ranking.length) : 0;
      }

      // 사람별 "나를 아는 방식" — 실제 카테고리 정답 데이터로만 타입을 정함(추측 금지)
      const people = idsInOrder
        .map(function (id) {
          const a = attemptById[id];
          if (!a || !a.nickname) return null;
          const flags = safeParseField(a.correctFlags, []);
          const catTotal = {}, catCorrect = {};
          questions.forEach(function (q, qi) {
            catTotal[q.category] = (catTotal[q.category] || 0) + 1;
            if (flags[qi]) catCorrect[q.category] = (catCorrect[q.category] || 0) + 1;
          });
          const typeInfo = GameCore.typeFromCategoryScores(catCorrect, catTotal);
          return { nickname: a.nickname, score: Number(a.score || 0), type: typeInfo.type, typeDesc: typeInfo.desc };
        })
        .filter(Boolean);

      // 문항별 정답률(전체 응답자 기준, miscount 해시로 계산 — 개인 특정 불가)
      const miscountRaw = (await redis.hgetall("game:" + gameId + ":miscount")) || {};
      const perQ = questions.map(function (q, i) {
        const miss = Number(miscountRaw["q" + i] || 0);
        const correct = Math.max(0, attemptCount - miss);
        return {
          idx: i,
          category: q.category,
          label: GameCore.categoryLabel(q.category),
          text: q.text,
          actualAnswer: q.options[creatorAnswers[i]] || "",
          rate: attemptCount ? correct / attemptCount : 0,
        };
      });

      // 카테고리별 집계(전체 응답자 기준) — "잘 아는 나 vs 잘 모르는 나"
      const catAgg = {};
      perQ.forEach(function (pq) {
        if (!catAgg[pq.category]) catAgg[pq.category] = { sum: 0, n: 0, label: pq.label };
        catAgg[pq.category].sum += pq.rate;
        catAgg[pq.category].n += 1;
      });
      const catList = Object.keys(catAgg).map(function (cat) {
        const c = catAgg[cat];
        return { category: cat, label: c.label, rate: c.n ? Math.round((c.sum / c.n) * 100) : 0 };
      });
      catList.sort(function (a, b) { return b.rate - a.rate; });

      let knownCategories = [];
      let unknownCategories = [];
      if (attemptCount >= 3 && catList.length >= 2) {
        const half = Math.max(1, Math.min(2, Math.floor(catList.length / 2)));
        knownCategories = catList.slice(0, half);
        unknownCategories = catList.slice(catList.length - half).reverse();
      }

      // "친구들의 공통 오해" — 같은 오답을 3명 이상 골랐을 때만, 집계 카운트만 사용
      // (누가 그 답을 골랐는지는 절대 노출하지 않음)
      let misunderstandings = [];
      if (attemptCount >= 3) {
        const optRaw = (await redis.hgetall("game:" + gameId + ":miscount_opt")) || {};
        questions.forEach(function (q, i) {
          let bestOpt = -1, bestCount = 0;
          q.options.forEach(function (opt, optIdx) {
            if (optIdx === creatorAnswers[i]) return;
            const c = Number(optRaw["q" + i + "_" + optIdx] || 0);
            if (c > bestCount) { bestCount = c; bestOpt = optIdx; }
          });
          if (bestOpt !== -1 && bestCount >= 3) {
            misunderstandings.push({
              category: GameCore.categoryLabel(q.category),
              text: q.text,
              guessedAnswer: q.options[bestOpt],
              actualAnswer: q.options[creatorAnswers[i]] || "",
              count: bestCount,
              total: attemptCount,
            });
          }
        });
        misunderstandings.sort(function (a, b) { return b.count - a.count; });
        misunderstandings = misunderstandings.slice(0, 3);
      }

      // "아무도 잘 모르는 나" / "역시 다 알고 있는 나" — 7명 이상 모였을 때만
      let hardest = null, easiest = null;
      if (attemptCount >= 7 && perQ.length) {
        const sorted = perQ.slice().sort(function (a, b) { return a.rate - b.rate; });
        const h = sorted[0];
        const e = sorted[sorted.length - 1];
        hardest = { category: h.label, text: h.text, actualAnswer: h.actualAnswer, ratePercent: Math.round(h.rate * 100) };
        easiest = { category: e.label, text: e.text, actualAnswer: e.actualAnswer, ratePercent: Math.round(e.rate * 100) };
      }

      report = {
        avgScore: avgScore,
        topScore: ranking.length ? ranking[0].score : null,
        topNickname: ranking.length ? ranking[0].nickname : null,
        people: people.slice(0, 10),
        knownCategories: knownCategories,
        unknownCategories: unknownCategories,
        misunderstandings: misunderstandings,
        hardest: hardest,
        easiest: easiest,
      };
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
      report: report,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
