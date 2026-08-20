/* 누가 나를 제일 잘 알까 — core logic (no dependencies, runs in browser or Node) */
(function (root) {
  "use strict";

  var CATEGORIES = ["취향", "일상", "관계", "가치관", "재미"];

  // ---- 30문항 문제은행, 카테고리당 6개. 정답이 정해진 문제가 아니라
  // "이 사람이라면 뭘 골랐을까"를 맞히는 방식이라 문항 자체엔 옳고 그름이 없음.
  var QUESTIONS = [
    // 취향
    { id: "q1", category: "취향", text: "스트레스 받을 때 제일 먼저 하는 행동은?", options: ["맛있는 거 먹기", "잠자기", "운동하기", "누군가에게 털어놓기", "혼자 게임·영상 보기"] },
    { id: "q2", category: "취향", text: "여행 스타일은 어느 쪽에 더 가까워?", options: ["계획을 촘촘히 짜는 편", "숙소만 정하고 나머진 즉흥", "아무 계획 없이 즉흥"] },
    { id: "q3", category: "취향", text: "주말에 더 끌리는 쪽은?", options: ["집에서 푹 쉬기", "사람들 만나서 놀기", "그날 기분 따라 다름"] },
    { id: "q4", category: "취향", text: "새로운 음식, 어느 쪽에 더 가까워?", options: ["늘 먹던 익숙한 메뉴", "일단 새로운 메뉴부터", "반반 섞어서"] },
    { id: "q5", category: "취향", text: "제일 끌리는 영상 장르는?", options: ["로맨스", "스릴러·범죄", "코미디", "판타지·SF", "다큐·현실기반"] },
    { id: "q6", category: "취향", text: "카페에서 자연스럽게 앉게 되는 자리는?", options: ["창가 자리", "구석 조용한 자리", "사람 많은 중앙 자리"] },
    // 일상
    { id: "q7", category: "일상", text: "나는 어느 쪽에 더 가까워?", options: ["완전 아침형 인간", "완전 밤형 인간", "그때그때 다름"] },
    { id: "q8", category: "일상", text: "약속 시간, 보통 어떤 편이야?", options: ["5분 이상 일찍 도착", "딱 맞춰 도착", "살짝 늦는 편"] },
    { id: "q9", category: "일상", text: "하루 중 제일 좋아하는 시간대는?", options: ["아침", "오후", "밤", "새벽"] },
    { id: "q10", category: "일상", text: "내 방(공간) 상태는 평소에?", options: ["늘 깔끔하게 정리", "필요할 때만 치움", "거의 어질러진 편"] },
    { id: "q11", category: "일상", text: "계획 세울 때 스타일은?", options: ["To-do 리스트 꼭 씀", "머릿속으로만 정리", "그때그때 즉흥적으로"] },
    { id: "q12", category: "일상", text: "돈 쓸 때 더 가까운 쪽은?", options: ["필요한 것 위주로 아껴 씀", "하고 싶은 거 있으면 바로 씀", "아낄 땐 아끼고 쓸 땐 화끈하게"] },
    // 관계
    { id: "q13", category: "관계", text: "힘든 일이 있을 때 나는?", options: ["바로 누군가에게 얘기함", "혼자 정리부터 함", "시간 지나고 나서야 얘기함"] },
    { id: "q14", category: "관계", text: "친구들 사이에서 주로 맡는 역할은?", options: ["분위기 띄우는 사람", "얘기 들어주는 사람", "의견 정리해주는 사람", "그냥 묻어가는 사람"] },
    { id: "q15", category: "관계", text: "갈등이 생기면 나는?", options: ["바로 얘기해서 푸는 편", "시간 두고 자연스럽게 넘어가는 편", "되도록 피하는 편"] },
    { id: "q16", category: "관계", text: "연락은 주로 어느 쪽이 먼저 해?", options: ["내가 먼저 하는 편", "상대가 먼저 하는 편", "반반인 편"] },
    { id: "q17", category: "관계", text: "새로운 사람 만나는 자리에서 나는?", options: ["먼저 다가가서 말 거는 편", "다가와주길 기다리는 편", "상황 봐서 다름"] },
    { id: "q18", category: "관계", text: "친한 친구 관계 스타일은?", options: ["소수와 깊게", "여럿과 넓게", "그때그때 다름"] },
    // 가치관
    { id: "q19", category: "가치관", text: "중요한 결정 내릴 때 기준은?", options: ["논리와 데이터", "직감과 느낌", "둘 다 반반 고려"] },
    { id: "q20", category: "가치관", text: "일과 삶의 균형에서 더 중요한 건?", options: ["일에서의 성취", "개인 시간과 여유", "상황 따라 다름"] },
    { id: "q21", category: "가치관", text: "실패했을 때 더 가까운 반응은?", options: ["원인 분석하고 바로 재도전", "충분히 쉬고 나서 움직임", "일단 다른 일에 집중"] },
    { id: "q22", category: "가치관", text: "더 끌리는 삶의 방향은?", options: ["안정적이고 예측 가능한 삶", "변화 많고 도전적인 삶", "둘 사이 균형"] },
    { id: "q23", category: "가치관", text: "남들이 나를 어떻게 보는지에 대해?", options: ["많이 신경 쓰는 편", "거의 신경 안 쓰는 편", "상황에 따라 다름"] },
    { id: "q24", category: "가치관", text: "규칙과 융통성 중 더 중요하게 생각하는 건?", options: ["정해진 규칙 지키기", "상황에 맞게 유연하게", "상황 봐서 반반"] },
    // 재미
    { id: "q25", category: "재미", text: "나의 유머 스타일은?", options: ["드립·말장난", "리액션·오버스러운 반응", "진지한 얼굴로 던지는 드립", "유머보다는 진지한 편"] },
    { id: "q26", category: "재미", text: "갑자기 시간 나면 제일 먼저 하는 건?", options: ["게임", "넷플릭스·유튜브", "운동", "그냥 눕고 쉬기"] },
    { id: "q27", category: "재미", text: "노래방 가면 스타일은?", options: ["신나는 노래 위주", "감성 발라드 위주", "안 부르고 듣기만"] },
    { id: "q28", category: "재미", text: "모임·술자리에서 나는?", options: ["분위기 주도하는 편", "조용히 즐기는 편", "일찍 빠지는 편"] },
    { id: "q29", category: "재미", text: "즐겨 보는 SNS 콘텐츠는?", options: ["밈·짤", "브이로그·일상", "정보성 콘텐츠", "잘 안 봄"] },
    { id: "q30", category: "재미", text: "즉흥 여행 제안을 받으면?", options: ["바로 콜", "일정 보고 결정", "거의 안 가는 편"] },
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

  // 카테고리당 2문항씩 뽑아서 총 10문항 세트를 만듦 (순서는 섞음)
  function pickRandomQuestionSet() {
    var picked = [];
    CATEGORIES.forEach(function (cat) {
      var pool = shuffle(QUESTIONS.filter(function (q) { return q.category === cat; }).slice());
      picked.push(pool[0], pool[1]);
    });
    return shuffle(picked).map(function (q) { return q.id; });
  }

  function isValidQuestionSet(ids) {
    if (!Array.isArray(ids) || ids.length !== 10) return false;
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      if (!questionById(ids[i])) return false;
      if (seen[ids[i]]) return false;
      seen[ids[i]] = true;
    }
    return true;
  }

  // questionIds/creatorAnswers/guesses는 모두 같은 길이의, 서로 인덱스가 맞는 배열
  function scoreAttempt(questionIds, creatorAnswers, guesses) {
    var qs = getQuestionsByIds(questionIds);
    var correctFlags = [];
    var catTotal = {}, catCorrect = {};
    CATEGORIES.forEach(function (c) { catTotal[c] = 0; catCorrect[c] = 0; });
    var correctCount = 0;

    qs.forEach(function (q, i) {
      var ok = creatorAnswers[i] === guesses[i];
      correctFlags.push(!!ok);
      catTotal[q.category] += 1;
      if (ok) { catCorrect[q.category] += 1; correctCount += 1; }
    });

    var categoryScores = {};
    CATEGORIES.forEach(function (c) {
      categoryScores[c] = catTotal[c] ? Math.round((catCorrect[c] / catTotal[c]) * 100) : null;
    });

    var score = qs.length ? Math.round((correctCount / qs.length) * 100) : 0;
    return { score: score, correctFlags: correctFlags, categoryScores: categoryScores };
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

  // 참여자 수에 따라 생성자에게 보여줄 상태 문구 (스펙의 마일스톤 톤 반영)
  function creatorTierMessage(count) {
    if (count <= 0) return "아직 아무도 도전 안 했어요. 링크를 공유해보세요!";
    if (count < 5) return "참여자가 5명 모이면 \"친구들이 가장 헷갈린 내 모습\"이 열려요.";
    return "친구들이 가장 헷갈린 내 모습을 확인할 수 있어요.";
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
    CATEGORIES: CATEGORIES,
    QUESTIONS: QUESTIONS,
    questionById: questionById,
    getQuestionsByIds: getQuestionsByIds,
    pickRandomQuestionSet: pickRandomQuestionSet,
    isValidQuestionSet: isValidQuestionSet,
    scoreAttempt: scoreAttempt,
    scoreCopy: scoreCopy,
    titleForScore: titleForScore,
    creatorTierMessage: creatorTierMessage,
    genId: genId,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = GameCore;
  } else {
    root.GameCore = GameCore;
  }
})(typeof window !== "undefined" ? window : global);
