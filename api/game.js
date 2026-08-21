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

      // 문항별 정답률(전체 응답자 기준, miscount 해시로 계산 — 개인 특정 불가)
      const miscountRaw = (await redis.hgetall("game:" + gameId + ":miscount")) || {};
      const perQ = questions.map(function (q, i) {
        const miss = Number(miscountRaw["q" + i] || 0);
        const correctCount = Math.max(0, attemptCount - miss);
        return {
          idx: i,
          category: q.category,
          label: GameCore.categoryLabel(q.category),
          text: q.text,
          actualAnswer: q.options[creatorAnswers[i]] || "",
          missCount: miss,
          correctCount: correctCount,
          rate: attemptCount ? correctCount / attemptCount : 0,
        };
      });

      // 사람별 카드 — 고정 유형명 대신, 그 사람의 실제 데이터로 만든 한 문장 + 카테고리 비교.
      // "이 사람만 맞힌 문제"/"이 사람만 다르게 답한 문제"는 집계(correctCount/missCount)가
      // 정확히 1이고 이 사람이 거기 해당할 때만 나오므로, 다른 사람의 답을 노출하지 않음.
      const showUnique = attemptCount >= 3;
      const people = idsInOrder
        .map(function (id) {
          const a = attemptById[id];
          if (!a || !a.nickname) return null;
          const flags = safeParseField(a.correctFlags, []);
          const confidence = safeParseField(a.confidence, []);
          const surfaceScore = a.surfaceScore === "" || a.surfaceScore == null ? null : Number(a.surfaceScore);
          const innerScore = a.innerScore === "" || a.innerScore == null ? null : Number(a.innerScore);
          const score = Number(a.score || 0);

          const catTotal = {}, catCorrect = {};
          let sureCorrect = 0, sureTotal = 0, guessCorrect = 0, guessTotal = 0;
          let uniqueCorrect = null, uniqueWrong = null;
          questions.forEach(function (q, qi) {
            catTotal[q.category] = (catTotal[q.category] || 0) + 1;
            const ok = !!flags[qi];
            if (ok) catCorrect[q.category] = (catCorrect[q.category] || 0) + 1;
            if (confidence[qi] === "sure") { sureTotal += 1; if (ok) sureCorrect += 1; }
            if (confidence[qi] === "guess") { guessTotal += 1; if (ok) guessCorrect += 1; }
            if (showUnique) {
              const pq = perQ[qi];
              if (pq) {
                if (ok && pq.correctCount === 1 && !uniqueCorrect) {
                  uniqueCorrect = { category: pq.label, text: pq.text };
                }
                if (!ok && pq.missCount === 1 && !uniqueWrong) {
                  uniqueWrong = { category: pq.label, text: pq.text };
                }
              }
            }
          });

          const categories = Object.keys(catTotal).map(function (cat) {
            const total = catTotal[cat];
            const correct = catCorrect[cat] || 0;
            return { category: cat, label: GameCore.categoryLabel(cat), rate: total ? Math.round((correct / total) * 100) : 0 };
          });
          categories.sort(function (x, y) { return y.rate - x.rate; });
          const bestCategory = categories.length ? categories[0] : null;
          const worstCategory = categories.length ? categories[categories.length - 1] : null;

          const oneLiner = GameCore.personOneLiner({
            score: score,
            surfaceScore: surfaceScore,
            innerScore: innerScore,
            bestCategory: bestCategory,
            worstCategory: worstCategory,
            hasUniqueCorrect: !!uniqueCorrect,
            sureRate: sureTotal ? sureCorrect / sureTotal : 0,
            sureTotal: sureTotal,
            guessRate: guessTotal ? guessCorrect / guessTotal : 0,
            guessTotal: guessTotal,
          });

          // TOP3 랭킹 옆에 붙는 짧은 한 줄 — "왜 이 사람이 특별한지"만 압축해서 보여줌
          let shortTrait = "고르게 잘 아는 사람";
          if (uniqueCorrect) shortTrait = "남들이 틀린 걸 혼자 맞힘";
          else if (bestCategory && bestCategory.rate >= 85) shortTrait = bestCategory.label + " 완벽 이해";
          else if (bestCategory) shortTrait = bestCategory.label + " 강함";

          return {
            nickname: a.nickname,
            attemptId: id,
            score: score,
            categories: categories,
            bestCategory: bestCategory,
            worstCategory: worstCategory,
            oneLiner: oneLiner,
            shortTrait: shortTrait,
            uniqueCorrect: uniqueCorrect,
            uniqueWrong: uniqueWrong,
            catCorrect: catCorrect,
            catTotal: catTotal,
          };
        })
        .filter(Boolean);

      // "사람마다 알고 있는 내가 달라" — 카테고리별로 이 게임 참여자 중 누가 제일 잘 맞혔는지
      // (3명 이상일 때만 의미가 있어서 그때만 계산)
      let categoryLeaders = [];
      if (attemptCount >= 3) {
        const catKeys = {};
        questions.forEach(function (q) { catKeys[q.category] = GameCore.categoryLabel(q.category); });
        categoryLeaders = Object.keys(catKeys)
          .map(function (cat) {
            let best = null;
            people.forEach(function (p) {
              const total = p.catTotal[cat] || 0;
              if (!total) return;
              const rate = (p.catCorrect[cat] || 0) / total;
              if (!best || rate > best.rate) best = { rate: rate, nickname: p.nickname };
            });
            return best ? { category: cat, label: catKeys[cat], nickname: best.nickname, rate: Math.round(best.rate * 100) } : null;
          })
          .filter(Boolean)
          .sort(function (a, b) { return b.rate - a.rate; })
          .slice(0, 3);
      }

      // 응답에는 카테고리 집계용 임시 필드(catCorrect/catTotal)는 빼고 내려줌
      const peopleOut = people.map(function (p) {
        return {
          nickname: p.nickname,
          attemptId: p.attemptId,
          score: p.score,
          categories: p.categories,
          bestCategory: p.bestCategory,
          worstCategory: p.worstCategory,
          oneLiner: p.oneLiner,
          shortTrait: p.shortTrait,
          uniqueCorrect: p.uniqueCorrect,
          uniqueWrong: p.uniqueWrong,
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
            // 과반 이상이 같은 방향으로 틀렸을 때만 "공통 오해"라고 부르고,
            // 그보다 약하면 과장하지 않고 "생각이 갈린 질문"으로 톤을 낮춤.
            const ratio = attemptCount ? bestCount / attemptCount : 0;
            misunderstandings.push({
              category: GameCore.categoryLabel(q.category),
              text: q.text,
              guessedAnswer: q.options[bestOpt],
              actualAnswer: q.options[creatorAnswers[i]] || "",
              count: bestCount,
              total: attemptCount,
              label: ratio >= 0.5 ? "공통 오해" : "생각이 갈린 질문",
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

      // "역도전" 상호 결과 — 이 게임이 다른 게임에 대한 되받아치기로 만들어졌고
      // (game.reverseOfGameId/reverseOfAttemptId), 상대가 이미 답까지 했다면
      // (attemptCount > 0) 양쪽 이해도를 한 화면에 묶어서 보여줌.
      let mutual = null;
      if (game.reverseOfGameId && game.reverseOfAttemptId) {
        try {
          const originGame = await redis.hgetall("game:" + game.reverseOfGameId);
          const originAttempt = await redis.hgetall("attempt:" + game.reverseOfAttemptId);
          if (originGame && originGame.creatorNickname && originAttempt && originAttempt.gameId === game.reverseOfGameId && peopleOut.length) {
            const originQuestionIds = safeParseField(originGame.questionIds, []);
            const originQuestions = GameCore.getQuestionsByIds(originQuestionIds);
            const originFlags = safeParseField(originAttempt.correctFlags, []);
            const originCatTotal = {}, originCatCorrect = {};
            originQuestions.forEach(function (q, qi) {
              originCatTotal[q.category] = (originCatTotal[q.category] || 0) + 1;
              if (originFlags[qi]) originCatCorrect[q.category] = (originCatCorrect[q.category] || 0) + 1;
            });
            const originCategories = Object.keys(originCatTotal)
              .map(function (cat) {
                const total = originCatTotal[cat];
                const correct = originCatCorrect[cat] || 0;
                return { category: cat, label: GameCore.categoryLabel(cat), rate: total ? Math.round((correct / total) * 100) : 0 };
              })
              .sort(function (a, b) { return b.rate - a.rate; });
            const originScore = Number(originAttempt.score || 0);
            const originBestCategory = originCategories.length ? originCategories[0] : null;

            const thisSide = peopleOut[0]; // 역도전 게임의 최고 응답자 = 상대방으로 간주
            const meNickname = game.creatorNickname;
            const themNickname = game.reverseOfCreatorNickname || originGame.creatorNickname;

            let comparisonLine = "";
            if (originBestCategory && thisSide.bestCategory) {
              const p1 = GameCore.hasBatchim(themNickname) ? "은" : "는";
              const p2 = GameCore.hasBatchim(originBestCategory.label) ? "을" : "를";
              const p3 = GameCore.hasBatchim(meNickname) ? "은" : "는";
              const p4 = GameCore.hasBatchim(thisSide.bestCategory.label) ? "을" : "를";
              comparisonLine =
                meNickname + p3 + " " + themNickname + "의 " + originBestCategory.label + p2 + " 더 잘 알고, " +
                themNickname + p1 + " " + meNickname + "의 " + thisSide.bestCategory.label + p4 + " 더 잘 알고 있어.";
            }

            mutual = {
              meNickname: meNickname,
              themNickname: themNickname,
              meUnderstandsThemScore: originScore,
              themUnderstandsMeScore: thisSide.score,
              mutualScore: Math.round((originScore + thisSide.score) / 2),
              comparisonLine: comparisonLine,
            };
          }
        } catch (e) {
          mutual = null;
        }
      }

      report = {
        avgScore: avgScore,
        topScore: ranking.length ? ranking[0].score : null,
        topNickname: ranking.length ? ranking[0].nickname : null,
        people: peopleOut.slice(0, 10),
        categoryLeaders: categoryLeaders,
        knownCategories: knownCategories,
        unknownCategories: unknownCategories,
        misunderstandings: misunderstandings,
        hardest: hardest,
        easiest: easiest,
        mutual: mutual,
        questionStats: perQ.map(function (pq) {
          return { idx: pq.idx, category: pq.category, label: pq.label, correctCount: pq.correctCount, missCount: pq.missCount };
        }),
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
