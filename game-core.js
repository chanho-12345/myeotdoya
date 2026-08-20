/* 누가 나를 제일 잘 알까 V2 — core logic (no dependencies, runs in browser or Node) */
(function (root) {
  "use strict";

  // depth(깊이 레벨)와 category(내용 카테고리)를 분리해서 태깅함.
  // depth: casual(가볍게) → personal(꽤 친해야) → deep(진짜 가까워야)
  // category: 리플레이 리포트에서 "어떤 부분을 잘 아는지" 설명할 때 씀
  var DEPTHS = ["casual", "personal", "deep"];
  var DEPTH_LABEL = { casual: "가볍게 아는 나", personal: "꽤 친해야 아는 나", deep: "진짜 가까워야 아는 나" };
  var CATEGORY_LABEL = {
    daily: "일상", taste: "취향", habit: "습관", emotion: "감정",
    relationship: "관계", value: "가치관", current: "요즘 관심사", memory: "추억",
  };
  var WEIGHTS = { casual: 1.0, personal: 1.5, deep: 1.7 };
  var SUBJECTIVE_WEIGHT = 2.0;

  var QUESTIONS = [
    // casual — 가볍게 맞힐 수 있는, 게임 진입용
    { id: "c1", depth: "casual", category: "daily", text: "아무 일정 없는 하루가 갑자기 생기면 나는?", options: ["집에서 완전히 쉰다", "사람을 만난다", "혼자 밖에 나간다", "그날 기분대로 정한다"] },
    { id: "c2", depth: "casual", category: "taste", text: "내가 돈을 쓸 때 가장 덜 아까워하는 건?", options: ["맛있는 음식", "여행과 경험", "갖고 싶은 물건", "좋아하는 사람"] },
    { id: "c3", depth: "casual", category: "habit", text: "여행에서 내가 제일 못 참는 건?", options: ["계획이 계속 꼬이는 것", "기다리는 시간이 긴 것", "돈이 아깝게 쓰이는 것", "같이 간 사람과 분위기가 안 맞는 것"] },
    { id: "c4", depth: "casual", category: "daily", text: "아침에 눈뜨자마자 제일 먼저 하는 행동은?", options: ["핸드폰부터 확인", "이불 속에서 좀 더 뭉그적", "바로 일어나서 씻기", "물 한 잔부터"] },
    { id: "c5", depth: "casual", category: "habit", text: "낯선 카페에 가면 자연스럽게 앉는 자리는?", options: ["창가", "구석", "중앙", "그때그때 다름"] },
    { id: "c6", depth: "casual", category: "habit", text: "약속 시간에 나는 보통?", options: ["일찍 도착하는 편", "딱 맞춰 도착", "살짝 늦는 편", "그날그날 다름"] },
    { id: "c7", depth: "casual", category: "taste", text: "쉬는 날 옷차림은?", options: ["편한 대로 아무거나", "그래도 신경 써서 입음", "집이면 잠옷 그대로", "나갈 계획 있으면 다르게"] },
    { id: "c8", depth: "casual", category: "taste", text: "새로운 음식을 볼 때 나는?", options: ["일단 도전해본다", "늘 먹던 걸 시킨다", "남이 시키는 거 보고 정한다", "후기부터 찾아본다"] },

    // personal — 어느 정도 친해야, 관찰이 필요한
    { id: "p1", depth: "personal", category: "relationship", text: "누군가에게 서운할 때 나는 어떻게 하는 편인가?", options: ["바로 이야기하는 편", "생각을 정리한 뒤 이야기", "티는 나지만 말은 잘 안 함", "웬만하면 그냥 넘김"] },
    { id: "p2", depth: "personal", category: "emotion", text: "내가 기분이 안 좋은데 누가 \"괜찮아?\"라고 물으면?", options: ["바로 이야기한다", "조금 정리하고 이야기한다", "괜찮다고 하고 넘긴다", "상대에 따라 완전히 다르다"] },
    { id: "p3", depth: "personal", category: "relationship", text: "내가 사람을 오래 볼 때 가장 중요하게 생각하는 건?", options: ["신뢰", "대화가 잘 통하는 것", "배려", "함께 있을 때 재미있는 것"] },
    { id: "p4", depth: "personal", category: "relationship", text: "연락은 나는 주로 어느 쪽이 먼저?", options: ["내가 먼저 하는 편", "상대가 먼저 하는 편", "반반인 편", "친밀도에 따라 다름"] },
    { id: "p5", depth: "personal", category: "habit", text: "일이 뜻대로 안 풀릴 때 나는?", options: ["바로 다른 방법을 찾는다", "일단 짜증부터 낸다", "시간을 두고 다시 본다", "누군가에게 하소연한다"] },
    { id: "p6", depth: "personal", category: "habit", text: "내가 계획 세울 때 스타일은?", options: ["To-do 리스트를 꼭 쓴다", "머릿속으로만 정리한다", "그때그때 즉흥적으로 한다", "남이 짜준 대로 따라간다"] },
    { id: "p7", depth: "personal", category: "relationship", text: "친구들 사이에서 내가 주로 맡는 역할은?", options: ["분위기 띄우는 사람", "얘기 들어주는 사람", "의견 정리해주는 사람", "그냥 묻어가는 사람"] },
    { id: "p8", depth: "personal", category: "emotion", text: "내가 힘든 티를 낼 때는 보통?", options: ["말투가 짧아진다", "조용해진다", "괜히 예민해진다", "티가 거의 안 난다"] },

    // deep — 진짜 가까워야 아는, 감정·가치관
    { id: "d1", depth: "deep", category: "emotion", text: "내가 진짜 힘들 때 가장 원하는 반응은?", options: ["해결 방법을 같이 찾아주는 것", "내 이야기를 충분히 들어주는 것", "아무 말 없이 옆에 있어주는 것", "혼자 있을 시간을 주는 것"] },
    { id: "d2", depth: "deep", category: "value", text: "내가 들었을 때 가장 기분 좋은 칭찬은?", options: ["능력을 인정받는 말", "외모나 분위기 칭찬", "센스 있고 재미있다는 말", "좋은 사람이라는 말"] },
    { id: "d3", depth: "deep", category: "value", text: "중요한 선택을 할 때 내가 마지막에 가장 크게 보는 건?", options: ["현실적인 이득", "내가 진짜 원하는지", "주변 사람에게 미치는 영향", "나중에 후회하지 않을지"] },
    { id: "d4", depth: "deep", category: "relationship", text: "내가 누군가를 정말 믿게 되는 순간은?", options: ["힘들 때 옆에 있어줬을 때", "비밀을 지켜줬을 때", "솔직하게 말해줬을 때", "한결같은 모습을 봤을 때"] },
    { id: "d5", depth: "deep", category: "value", text: "요즘 내가 스스로에게 가장 부족하다고 느끼는 건?", options: ["시간 여유", "자신감", "체력", "인간관계"] },
    { id: "d6", depth: "deep", category: "relationship", text: "내가 관계에서 제일 못 견디는 건?", options: ["무시당하는 느낌", "거짓말", "일방적인 관계", "무관심"] },
    { id: "d7", depth: "deep", category: "value", text: "내가 진짜 원하는 삶의 모습에 더 가까운 건?", options: ["안정적이고 예측 가능한 삶", "변화 많고 도전적인 삶", "사람들과 함께하는 삶", "혼자만의 시간이 많은 삶"] },
    { id: "d8", depth: "deep", category: "current", text: "요즘 내가 혼자 있을 때 자주 하는 생각은?", options: ["지금 하고 있는 일", "사람들과의 관계", "미래에 대한 고민", "그냥 아무 생각 없음"] },
  ];

  // 주관식(10번째 문제) 후보 — 생성자가 이 중 하나를 골라서 직접 답을 씀
  var SUBJECTIVE_PROMPTS = [
    "요즘 내 머릿속에서 가장 큰 비중을 차지하는 건?",
    "내가 올해 꼭 해보고 싶은 건?",
    "요즘 내가 가장 신경 쓰고 있는 것은?",
    "내가 시간이 더 생긴다면 가장 하고 싶은 건?",
    "최근 내가 가장 이루고 싶은 건?",
  ];

  function questionById(id) {
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].id === id) return QUESTIONS[i];
    }
    return null;
  }

  function getQuestionsByIds(ids) {
    return (ids || []).map(questionById).filter(Boolean);
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 3 casual + 3 personal + 3 deep = 9개, 항상 이 순서(버킷) 그대로 유지 —
  // 뒤로 갈수록 깊어지는 서사를 만들기 위해 depth 순서는 섞지 않음.
  function pickRandomQuestionSet() {
    var picked = [];
    DEPTHS.forEach(function (depth) {
      var pool = shuffle(QUESTIONS.filter(function (q) { return q.depth === depth; }).slice());
      picked.push(pool[0].id, pool[1].id, pool[2].id);
    });
    return picked;
  }

  function isValidQuestionSet(ids) {
    if (!Array.isArray(ids) || ids.length !== 9) return false;
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var q = questionById(ids[i]);
      if (!q) return false;
      if (seen[ids[i]]) return false;
      seen[ids[i]] = true;
    }
    // 순서(버킷)도 casual x3, personal x3, deep x3 여야 함
    var expected = ["casual", "casual", "casual", "personal", "personal", "personal", "deep", "deep", "deep"];
    for (var j = 0; j < ids.length; j++) {
      if (questionById(ids[j]).depth !== expected[j]) return false;
    }
    return true;
  }

  function isValidSubjectivePrompt(text) {
    return SUBJECTIVE_PROMPTS.indexOf(text) !== -1;
  }

  // 1~9번(객관식) 채점 + 가중치 반영 + surface/inner 분리
  // - surface = casual + personal (겉으로 보이는 나)
  // - inner   = deep + 주관식 (속으로 생각하는 나)
  // subjectiveScore(0~100, 없으면 null)는 주관식 의미 유사도를 그대로 inner에 반영
  function scoreAttempt(questionIds, creatorAnswers, guesses, subjectiveScore) {
    var qs = getQuestionsByIds(questionIds);
    var correctFlags = [];
    var totalWeight = 0, earnedWeight = 0;
    var surfaceTotal = 0, surfaceEarned = 0;
    var innerTotal = 0, innerEarned = 0;
    var categoryTotal = {}, categoryCorrect = {};

    qs.forEach(function (q, i) {
      var w = WEIGHTS[q.depth] || 1.0;
      var ok = creatorAnswers[i] === guesses[i];
      correctFlags.push(!!ok);
      totalWeight += w;
      if (ok) earnedWeight += w;

      if (q.depth === "deep") {
        innerTotal += w;
        if (ok) innerEarned += w;
      } else {
        surfaceTotal += w;
        if (ok) surfaceEarned += w;
      }

      categoryTotal[q.category] = (categoryTotal[q.category] || 0) + 1;
      if (ok) categoryCorrect[q.category] = (categoryCorrect[q.category] || 0) + 1;
    });

    var subjFrac = typeof subjectiveScore === "number" ? Math.max(0, Math.min(100, subjectiveScore)) / 100 : null;
    if (subjFrac !== null) {
      totalWeight += SUBJECTIVE_WEIGHT;
      innerTotal += SUBJECTIVE_WEIGHT;
      earnedWeight += subjFrac * SUBJECTIVE_WEIGHT;
      innerEarned += subjFrac * SUBJECTIVE_WEIGHT;
    }

    var score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    var surfaceScore = surfaceTotal ? Math.round((surfaceEarned / surfaceTotal) * 100) : null;
    var innerScore = innerTotal ? Math.round((innerEarned / innerTotal) * 100) : null;

    return {
      score: score,
      correctFlags: correctFlags,
      surfaceScore: surfaceScore,
      innerScore: innerScore,
      categoryTotal: categoryTotal,
      categoryCorrect: categoryCorrect,
    };
  }

  function scoreCopy(score) {
    if (score >= 100) return "혹시 본인인가요?";
    if (score >= 90) return "웬만한 건 다 알고 있습니다";
    if (score >= 70) return "꽤 잘 알고 있네요";
    if (score >= 50) return "반은 알고 반은 의외입니다";
    return "아직 서로 알아갈 게 많네요";
  }

  function titleForScore(score) {
    if (score >= 90) return "관계 만렙";
    if (score >= 70) return "찐친 인증";
    if (score >= 50) return "반반 텔레파시";
    return "츤데레 매칭";
  }

  // 겉/속 점수 차이를 실제 데이터로 설명하는 한 줄 — 규칙 기반 템플릿.
  // (AI는 주관식 의미 비교에만 쓰고, 이 문장은 실제 점수만 갖고 결정론적으로 생성함)
  function relationshipOneLiner(surfaceScore, innerScore) {
    if (surfaceScore === null || innerScore === null) {
      return "겉모습과 속마음, 둘 다 골고루 알고 있는 편이에요.";
    }
    var gap = surfaceScore - innerScore;
    if (gap >= 25) {
      return "취향·습관은 잘 아는데, 속마음에서는 생각보다 다르게 알고 있었어요.";
    }
    if (gap >= 10) {
      return "겉으로 보이는 모습은 잘 아는 편이고, 감정·가치관은 조금 엇갈렸어요.";
    }
    if (gap <= -25) {
      return "의외로 속마음은 잘 아는데, 평소 사소한 습관에서 더 많이 헷갈렸어요.";
    }
    if (gap <= -10) {
      return "속마음까지 잘 읽는 편인데, 자잘한 습관에서는 의외로 다르게 봤어요.";
    }
    if (surfaceScore >= 80 && innerScore >= 80) {
      return "겉모습도 속마음도 고르게 잘 알고 있는 사이예요.";
    }
    return "겉으로 보이는 모습과 속마음, 비슷한 정도로 알고 있어요.";
  }

  // 참여자 수에 따라 생성자에게 보여줄 상태 문구
  function creatorTierMessage(count) {
    if (count <= 0) return "아직 아무도 도전 안 했어요. 링크를 공유해보세요!";
    if (count < 5) return "참여자가 5명 모이면 \"친구들이 가장 헷갈린 내 모습\"이 열려요.";
    return "친구들이 가장 헷갈린 내 모습을 확인할 수 있어요.";
  }

  // 질문 진행 중 깊이가 올라간다는 걸 알려주는 배너 — idx는 0-based (0~8)
  function depthBannerForIndex(idx) {
    if (idx === 0) return "가볍게 시작해볼게.";
    if (idx === 3) return "여기부터는 좀 친해야 맞혀.";
    if (idx === 6) return "이제 진짜 나를 아는지 볼 차례.";
    return "";
  }

  function categoryLabel(cat) {
    return CATEGORY_LABEL[cat] || cat;
  }
  function depthLabel(depth) {
    return DEPTH_LABEL[depth] || depth;
  }

  function matchLevelForScore(score) {
    if (score >= 90) return "very_close";
    if (score >= 70) return "close";
    if (score >= 40) return "partial";
    return "different";
  }

  // AI(또는 fallback) 호출이 실패했을 때를 대비한 아주 단순한 어절 겹침 기반 유사도.
  // 진짜 의미 비교는 아니지만, 완전히 다른 답과 비슷한 답 정도는 구분해줌.
  function normalizeTokens(s) {
    return String(s || "")
      .trim()
      .replace(/[.,!?~^]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }
  function fallbackSemanticScore(a, b) {
    var ta = normalizeTokens(a);
    var tb = normalizeTokens(b);
    if (!ta.length || !tb.length) return 20;
    var setB = {};
    tb.forEach(function (w) { setB[w] = true; });
    var inter = 0;
    ta.forEach(function (w) { if (setB[w]) inter += 1; });
    var union = {};
    ta.concat(tb).forEach(function (w) { union[w] = true; });
    var unionSize = Object.keys(union).length;
    var jac = unionSize ? inter / unionSize : 0;
    // 짧은 단어 하나가 그대로 포함되는 경우도 부분 점수 (예: "가게" 공통 포함)
    var substr = a && b && (String(b).indexOf(a) !== -1 || String(a).indexOf(b) !== -1) ? 0.3 : 0;
    var combined = Math.max(jac, substr);
    return Math.round(Math.min(90, Math.max(15, combined * 100)));
  }

  function genId(len) {
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var out = "";
    var randVals;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      randVals = new Uint8Array(len);
      crypto.getRandomValues(randVals);
    } else {
      var nodeCrypto = null;
      try { nodeCrypto = require("crypto"); } catch (e) { nodeCrypto = null; }
      if (nodeCrypto) {
        randVals = nodeCrypto.randomBytes(len);
      } else {
        randVals = [];
        for (var i = 0; i < len; i++) randVals.push(Math.floor(Math.random() * 256));
      }
    }
    for (var j = 0; j < len; j++) out += chars[randVals[j] % chars.length];
    return out;
  }

  var GameCore = {
    DEPTHS: DEPTHS,
    WEIGHTS: WEIGHTS,
    SUBJECTIVE_WEIGHT: SUBJECTIVE_WEIGHT,
    QUESTIONS: QUESTIONS,
    SUBJECTIVE_PROMPTS: SUBJECTIVE_PROMPTS,
    questionById: questionById,
    getQuestionsByIds: getQuestionsByIds,
    pickRandomQuestionSet: pickRandomQuestionSet,
    isValidQuestionSet: isValidQuestionSet,
    isValidSubjectivePrompt: isValidSubjectivePrompt,
    scoreAttempt: scoreAttempt,
    scoreCopy: scoreCopy,
    titleForScore: titleForScore,
    relationshipOneLiner: relationshipOneLiner,
    creatorTierMessage: creatorTierMessage,
    depthBannerForIndex: depthBannerForIndex,
    categoryLabel: categoryLabel,
    depthLabel: depthLabel,
    matchLevelForScore: matchLevelForScore,
    fallbackSemanticScore: fallbackSemanticScore,
    genId: genId,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = GameCore;
  } else {
    root.GameCore = GameCore;
  }
})(typeof window !== "undefined" ? window : global);
