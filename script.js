// Constants
const EXAM_DURATION_SECONDS = 1500; // 25 minutes
const ACTION_DEBOUNCE_MS = 300;
const STORAGE_KEYS = {
  examState: "abilities_test_state",
  theme: "abilities_test_theme",
  history: "abilities_test_history"
};

// Labels
const LABELS = {
  category: {
    verbal: "Verbal",
    quantitative: "Quantitative"
  },
  difficulty: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard"
  },
  subType: {
    analogy: "Analogy",
    pattern: "Pattern",
    logical: "Logical",
    numerical: "Numerical"
  }
};

// App State
const app = {
  page: null,
  exam: {
    state: null,
    timer: null
  },
  theme: "light"
};

// Initialize
document.addEventListener("DOMContentLoaded", function () {
  app.page = document.body.dataset.page;
  initTheme();
  initPage();
});

// Theme Management
function initTheme() {
  const savedTheme = readStorage(STORAGE_KEYS.theme, "light");
  app.theme = savedTheme;
  applyTheme(savedTheme);
  bindThemeToggle();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  app.theme = theme;
  writeStorage(STORAGE_KEYS.theme, theme);
}

function bindThemeToggle() {
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      const newTheme = app.theme === "light" ? "dark" : app.theme === "dark" ? "comfort" : "light";
      applyTheme(newTheme);
    });
  }
}

// Page Initialization
function initPage() {
  switch (app.page) {
    case "landing":
      initLandingPage();
      break;
    case "exam":
      initExamPage();
      break;
    case "results":
      initResultsPage();
      break;
    case "about":
      initAboutPage();
      break;
  }
}

// Landing Page
function initLandingPage() {
  const storedState = readStorage(STORAGE_KEYS.examState, null);
  const startButton = document.querySelector('[data-action="start-exam"]');
  const resumeButton = document.querySelector('[data-action="resume-exam"]');

  if (storedState && !storedState.isFinished) {
    startButton.classList.add("hidden");
    resumeButton.classList.remove("hidden");
  }

  startButton.addEventListener("click", function () {
    if (!guardAction("start-exam")) return;
    window.location.href = "exam.html";
  });

  resumeButton.addEventListener("click", function () {
    if (!guardAction("resume-exam")) return;
    window.location.href = "exam.html";
  });

  renderHistorySummary();
}

function renderHistorySummary() {
  const history = readStorage(STORAGE_KEYS.history, []);
  const container = document.getElementById("historySummary");
  
  if (!container || !history.length) return;

  const latest = history[0];
  const summaryHTML = `
    <div class="summary-item">
      <div class="summary-label">Latest Test</div>
      <div class="summary-value">${latest.score} / ${latest.total}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Percentage</div>
      <div class="summary-value">${latest.percentage}%</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Date</div>
      <div class="summary-value">${new Date(latest.date).toLocaleDateString()}</div>
    </div>
  `;
  
  container.innerHTML = summaryHTML;
}

// Exam Page
function initExamPage() {
  bindExamBeforeUnload();
  bindExamVisibilityMonitor();
  bindKeyboardShortcuts();

  const storedState = readStorage(STORAGE_KEYS.examState, null);

  if (storedState && storedState.isFinished && storedState.result) {
    window.location.replace("results.html");
    return;
  }

  if (storedState && Array.isArray(storedState.questions) && storedState.questions.length) {
    app.exam.state = storedState;
    bindExamControls();
    renderExam();
    startExamTimer();
  } else {
    // Start new exam
    loadQuestions().then(questions => {
      app.exam.state = createExamState(questions);
      persistExamState();
      bindExamControls();
      renderExam();
      startExamTimer();
    });
  }
}

function createExamState(questions) {
  return {
    questions: questions,
    answers: new Array(questions.length).fill(null),
    flagged: new Array(questions.length).fill(false),
    currentIndex: 0,
    startTime: Date.now(),
    timeLeft: EXAM_DURATION_SECONDS,
    isFinished: false
  };
}

function loadQuestions() {
  return fetch('questions.json')
    .then(response => response.json())
    .catch(error => {
      console.error('Error loading questions:', error);
      return FALLBACK_QUESTIONS;
    });
}

// Timer Management
function startExamTimer() {
  if (app.exam.timer) clearInterval(app.exam.timer);
  
  app.exam.timer = setInterval(() => {
    if (app.exam.state.timeLeft > 0) {
      app.exam.state.timeLeft--;
      persistExamState();
      renderExam();
    } else {
      finishExam("timeout");
    }
  }, 1000);
}

// Exam Controls
function bindExamControls() {
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");
  const finishButton = document.getElementById("finishButton");
  const flagButton = document.getElementById("flagButton");

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (!guardAction("prev")) return;
      navigateToQuestion(app.exam.state.currentIndex - 1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (!guardAction("next")) return;
      navigateToQuestion(app.exam.state.currentIndex + 1);
    });
  }

  if (finishButton) {
    finishButton.addEventListener("click", () => {
      if (!guardAction("finish")) return;
      finishExam("manual");
    });
  }

  if (flagButton) {
    flagButton.addEventListener("click", () => {
      if (!guardAction("flag")) return;
      toggleFlag();
    });
  }
}

// Navigation
function navigateToQuestion(index) {
  const state = app.exam.state;
  if (index < 0 || index >= state.questions.length) return;
  
  state.currentIndex = index;
  persistExamState();
  renderExam();
}

function toggleFlag() {
  const state = app.exam.state;
  const index = state.currentIndex;
  state.flagged[index] = !state.flagged[index];
  persistExamState();
  renderExam();
}

// Answer Selection
function selectAnswer(optionIndex) {
  const state = app.exam.state;
  state.answers[state.currentIndex] = optionIndex;
  persistExamState();
  renderExam();
  setSessionNotice("Answer saved automatically.");
}

// Rendering
function renderExam() {
  const state = app.exam.state;
  if (!state) return;

  const currentQuestion = state.questions[state.currentIndex];
  const answeredCount = state.answers.filter(a => a !== null).length;
  const flaggedCount = state.flagged.filter(f => f).length;
  const totalQuestions = state.questions.length;
  const progressValue = ((state.currentIndex + 1) / totalQuestions) * 100;

  // Update UI elements
  setText("questionCounter", `${state.currentIndex + 1} / ${totalQuestions}`);
  setText("progressText", `${Math.round(progressValue)}%`);
  setWidth("progressBar", `${progressValue}%`);
  setText("timerDisplay", formatDuration(state.timeLeft));
  setText("flaggedCount", `Flagged: ${flaggedCount}`);
  setText("answeredCount", `${answeredCount} answered`);

  // Update question details
  setText("categoryBadge", LABELS.category[currentQuestion.category]);
  setText("subTypeBadge", LABELS.subType[currentQuestion.subType]);
  setText("difficultyBadge", LABELS.difficulty[currentQuestion.difficulty]);
  setText("questionText", currentQuestion.question);

  // Update flag button
  const flagButton = document.getElementById("flagButton");
  if (flagButton) {
    flagButton.textContent = state.flagged[state.currentIndex] ? "Remove Flag" : "Flag for Review";
  }

  // Render options and navigation
  renderOptions(currentQuestion);
  renderQuestionNav();

  // Update navigation buttons
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");

  if (prevButton) {
    prevButton.disabled = state.currentIndex === 0;
  }

  if (nextButton) {
    const isLastQuestion = state.currentIndex === totalQuestions - 1;
    const hasAnswer = state.answers[state.currentIndex] !== null;
    nextButton.disabled = !hasAnswer;
    nextButton.textContent = isLastQuestion ? "Last Question" : "Next";
  }
}

function renderOptions(question) {
  const container = document.getElementById("optionsList");
  if (!container) return;

  const selectedAnswer = app.exam.state.answers[app.exam.state.currentIndex];
  const fragment = document.createDocumentFragment();

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-card" + (selectedAnswer === index ? " selected" : "");
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", selectedAnswer === index);
    button.setAttribute("aria-label", `Option ${index + 1}: ${option}`);
    
    button.addEventListener("click", () => {
      if (!guardAction(`option-${index}`)) return;
      selectAnswer(index);
    });

    button.innerHTML = `<span class="option-index">${index + 1}</span><span>${escapeHtml(option)}</span>`;
    fragment.appendChild(button);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
}

function renderQuestionNav() {
  const container = document.getElementById("questionNav");
  if (!container) return;

  container.innerHTML = "";

  app.exam.state.questions.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-chip";
    button.textContent = index + 1;
    button.setAttribute("aria-label", `Go to question ${index + 1}`);

    const isAnswered = app.exam.state.answers[index] !== null;
    const isFlagged = app.exam.state.flagged[index];
    const isCurrent = app.exam.state.currentIndex === index;

    if (isAnswered) button.classList.add("answered");
    if (isFlagged) button.classList.add("flagged");
    if (isCurrent) button.classList.add("current");

    button.addEventListener("click", () => {
      if (!guardAction(`jump-${index}`)) return;
      navigateToQuestion(index);
    });

    container.appendChild(button);
  });
}

// Finish Exam
function finishExam(reason) {
  if (app.exam.timer) {
    clearInterval(app.exam.timer);
    app.exam.timer = null;
  }

  const state = app.exam.state;
  state.isFinished = true;
  state.endTime = Date.now();
  state.finishReason = reason;

  const result = calculateResults(state);
  state.result = result;

  persistExamState();
  saveToHistory(result);
  
  window.location.replace("results.html");
}

function calculateResults(state) {
  const correct = state.questions.reduce((count, question, index) => {
    return count + (state.answers[index] === question.correctAnswer ? 1 : 0);
  }, 0);

  const total = state.questions.length;
  const percentage = Math.round((correct / total) * 100);

  return {
    score: correct,
    total: total,
    percentage: percentage,
    timeSpent: EXAM_DURATION_SECONDS - state.timeLeft,
    answers: [...state.answers],
    questions: [...state.questions],
    startTime: state.startTime,
    endTime: Date.now(),
    finishReason: state.finishReason
  };
}

function saveToHistory(result) {
  const history = readStorage(STORAGE_KEYS.history, []);
  history.unshift({
    ...result,
    date: new Date().toISOString()
  });
  
  // Keep only last 10 results
  if (history.length > 10) {
    history.splice(10);
  }
  
  writeStorage(STORAGE_KEYS.history, history);
}

// Results Page
function initResultsPage() {
  const storedState = readStorage(STORAGE_KEYS.examState, null);
  
  if (!storedState || !storedState.isFinished || !storedState.result) {
    window.location.replace("index.html");
    return;
  }

  renderResults(storedState.result);
  bindResultsControls();
}

function renderResults(result) {
  setText("scoreValue", `${result.score} / ${result.total}`);
  setText("scoreMeta", `${result.percentage}%`);
  setText("scoreRating", getRating(result.percentage));

  renderSummaryCards(result);
  renderAnalysis(result);
  renderQuestionReview(result);
}

function getRating(percentage) {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 80) return "Very Good";
  if (percentage >= 70) return "Good";
  if (percentage >= 60) return "Fair";
  return "Needs Improvement";
}

function renderSummaryCards(result) {
  const container = document.getElementById("summaryCards");
  if (!container) return;

  const timeSpent = formatDuration(result.timeSpent);
  const accuracy = Math.round((result.score / result.total) * 100);

  const cards = [
    { label: "Time Spent", value: timeSpent },
    { label: "Accuracy", value: `${accuracy}%` },
    { label: "Correct", value: result.score },
    { label: "Total", value: result.total }
  ];

  container.innerHTML = cards.map(card => `
    <div class="summary-card">
      <div class="summary-label">${card.label}</div>
      <div class="summary-value">${card.value}</div>
    </div>
  `).join('');
}

function renderAnalysis(result) {
  renderCategoryAnalysis(result);
  renderDifficultyAnalysis(result);
}

function renderCategoryAnalysis(result) {
  const container = document.getElementById("categoryAnalysis");
  if (!container) return;

  const categories = {};
  result.questions.forEach((question, index) => {
    const category = question.category;
    if (!categories[category]) {
      categories[category] = { total: 0, correct: 0 };
    }
    categories[category].total++;
    if (result.answers[index] === question.correctAnswer) {
      categories[category].correct++;
    }
  });

  container.innerHTML = Object.entries(categories).map(([category, data]) => {
    const percentage = Math.round((data.correct / data.total) * 100);
    return `
      <div class="analysis-item">
        <div class="analysis-label">${LABELS.category[category]}</div>
        <div class="analysis-value">${data.correct} / ${data.total}</div>
        <div class="analysis-percentage">${percentage}%</div>
      </div>
    `;
  }).join('');
}

function renderDifficultyAnalysis(result) {
  const container = document.getElementById("difficultyAnalysis");
  if (!container) return;

  const difficulties = {};
  result.questions.forEach((question, index) => {
    const difficulty = question.difficulty;
    if (!difficulties[difficulty]) {
      difficulties[difficulty] = { total: 0, correct: 0 };
    }
    difficulties[difficulty].total++;
    if (result.answers[index] === question.correctAnswer) {
      difficulties[difficulty].correct++;
    }
  });

  container.innerHTML = Object.entries(difficulties).map(([difficulty, data]) => {
    const percentage = Math.round((data.correct / data.total) * 100);
    return `
      <div class="analysis-item">
        <div class="analysis-label">${LABELS.difficulty[difficulty]}</div>
        <div class="analysis-value">${data.correct} / ${data.total}</div>
        <div class="analysis-percentage">${percentage}%</div>
      </div>
    `;
  }).join('');
}

function renderQuestionReview(result) {
  const container = document.getElementById("questionReview");
  if (!container) return;

  container.innerHTML = result.questions.map((question, index) => {
    const userAnswer = result.answers[index];
    const isCorrect = userAnswer === question.correctAnswer;
    const answerText = question.options[userAnswer] || "Not answered";
    const correctText = question.options[question.correctAnswer];

    return `
      <div class="review-item ${isCorrect ? 'correct' : 'incorrect'}">
        <div class="review-header">
          <span class="review-number">Question ${index + 1}</span>
          <span class="review-status">${isCorrect ? 'Correct' : 'Incorrect'}</span>
        </div>
        <div class="review-question">${escapeHtml(question.question)}</div>
        <div class="review-answers">
          <div class="review-answer">Your answer: ${escapeHtml(answerText)}</div>
          ${!isCorrect ? `<div class="review-correct">Correct answer: ${escapeHtml(correctText)}</div>` : ''}
        </div>
        ${question.explanation ? `<div class="review-explanation">${escapeHtml(question.explanation)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function bindResultsControls() {
  const retryButton = document.getElementById("retryButton");
  const printButton = document.getElementById("printButton");

  if (retryButton) {
    retryButton.addEventListener("click", () => {
      if (!guardAction("retry")) return;
      clearExamState();
      window.location.href = "exam.html";
    });
  }

  if (printButton) {
    printButton.addEventListener("click", () => {
      if (!guardAction("print")) return;
      window.print();
    });
  }
}

// About Page
function initAboutPage() {
  // About page doesn't need special initialization
}

// Utility Functions
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setWidth(id, width) {
  const element = document.getElementById(id);
  if (element) {
    element.style.width = width;
  }
}

function setSessionNotice(message) {
  const notice = document.getElementById("sessionNotice");
  if (notice) {
    notice.textContent = message;
    notice.classList.remove("hidden");
    
    setTimeout(() => {
      notice.classList.add("hidden");
    }, 3000);
  }
}

// Storage Functions
function readStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    console.error('Error reading from storage:', error);
    return defaultValue;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error writing to storage:', error);
  }
}

function persistExamState() {
  if (app.exam.state) {
    writeStorage(STORAGE_KEYS.examState, app.exam.state);
  }
}

function clearExamState() {
  localStorage.removeItem(STORAGE_KEYS.examState);
}

// Action Guarding
const actionGuard = new Map();
function guardAction(action) {
  const now = Date.now();
  const lastTime = actionGuard.get(action) || 0;
  
  if (now - lastTime < ACTION_DEBOUNCE_MS) {
    return false;
  }
  
  actionGuard.set(action, now);
  return true;
}

// Event Listeners
function bindExamBeforeUnload() {
  window.addEventListener("beforeunload", (e) => {
    if (app.exam.state && !app.exam.state.isFinished) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function bindExamVisibilityMonitor() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && app.exam.state && !app.exam.state.isFinished) {
      persistExamState();
    }
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (app.page !== "exam" || !app.exam.state) return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        if (!guardAction("prev")) return;
        navigateToQuestion(app.exam.state.currentIndex - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (!guardAction("next")) return;
        navigateToQuestion(app.exam.state.currentIndex + 1);
        break;
      case "1":
      case "2":
      case "3":
      case "4":
        e.preventDefault();
        const optionIndex = parseInt(e.key) - 1;
        if (optionIndex < app.exam.state.questions[app.exam.state.currentIndex].options.length) {
          if (!guardAction(`option-${optionIndex}`)) return;
          selectAnswer(optionIndex);
        }
        break;
      case "f":
      case "F":
        e.preventDefault();
        if (!guardAction("flag")) return;
        toggleFlag();
        break;
      case "Enter":
        e.preventDefault();
        if (!guardAction("finish")) return;
        finishExam("manual");
        break;
    }
  });
}

// Fallback Questions
const FALLBACK_QUESTIONS = [
  {
    id: 1,
    question: "What comes next in the series: 2, 4, 8, 16, ?",
    options: ["20", "24", "32", "64"],
    correctAnswer: 2,
    category: "quantitative",
    subType: "pattern",
    difficulty: "easy",
    explanation: "Each number is doubled: 2×2=4, 4×2=8, 8×2=16, 16×2=32"
  },
  {
    id: 2,
    question: "Which word is the odd one out?",
    options: ["Apple", "Banana", "Carrot", "Orange"],
    correctAnswer: 2,
    category: "verbal",
    subType: "logical",
    difficulty: "easy",
    explanation: "Carrot is a vegetable, while the others are fruits"
  }
  // Add more fallback questions as needed
];
