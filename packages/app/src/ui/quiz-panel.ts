/**
 * Quiz Panel — Design quiz / interview mode
 * Generates quizzes about components, styles, accessibility, and design guidelines
 */
import type { Editor } from "../editor";
import { icons } from "./icons";
import { generateDesignReview, formatChecklist, type ChecklistItem } from "./design-review";

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
}

interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  answers: (number | null)[];
  finished: boolean;
}

let quizState: QuizState | null = null;

/** Generate quiz questions from current scene analysis */
export function generateQuiz(editor: Editor): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  let qid = 0;
  let analysis: any;
  try {
    analysis = JSON.parse(editor.engine.get_scene_analysis());
  } catch {
    return [];
  }

  const kinds = analysis.kind_distribution || {};
  const total = analysis.total_nodes || 0;
  const compCount = analysis.component_count || 0;
  const instanceCount = analysis.instance_count || 0;
  const layoutCount = analysis.layout_count || 0;

  // Q: Total nodes
  if (total > 0) {
    const wrong1 = Math.max(1, total + Math.floor(Math.random() * 20) - 10);
    const wrong2 = Math.max(1, total * 2);
    const wrong3 = Math.max(1, Math.floor(total / 2));
    const opts = shuffle([String(total), String(wrong1 === total ? total + 5 : wrong1), String(wrong2), String(wrong3)]);
    questions.push({
      id: qid++, category: "Scene Knowledge",
      question: "How many total nodes are in the current scene?",
      options: opts, correctIndex: opts.indexOf(String(total)),
      explanation: `The scene contains exactly ${total} nodes.`,
    });
  }

  // Q: Most common node type
  const sortedKinds = Object.entries(kinds).sort((a: any, b: any) => b[1] - a[1]);
  if (sortedKinds.length > 1) {
    const correct = sortedKinds[0][0];
    const others = sortedKinds.slice(1).map(k => k[0]);
    const opts = shuffle([correct, ...others.slice(0, 3)].slice(0, 4));
    questions.push({
      id: qid++, category: "Scene Knowledge",
      question: "What is the most common node type in this design?",
      options: opts, correctIndex: opts.indexOf(correct),
      explanation: `${correct} appears ${sortedKinds[0][1]} times, making it the most common type.`,
    });
  }

  // Q: Component count
  questions.push({
    id: qid++, category: "Components",
    question: `How many reusable components are defined in this project?`,
    options: shuffle([String(compCount), String(compCount + 3), String(Math.max(0, compCount - 2)), String(compCount + 7)]),
    correctIndex: -1, // fixed below
    explanation: `There are ${compCount} component(s) and ${instanceCount} instance(s).`,
  });
  questions[questions.length - 1].correctIndex = questions[questions.length - 1].options.indexOf(String(compCount));

  // Q: Layout usage (general knowledge)
  questions.push({
    id: qid++, category: "Layout",
    question: "Which layout mode helps maintain consistent spacing between child elements?",
    options: ["Flex (Auto-layout)", "Absolute positioning", "Grid only", "None"],
    correctIndex: 0,
    explanation: "Flex (auto-layout) automatically manages spacing, alignment, and distribution of children.",
  });

  // Q: Accessibility
  questions.push({
    id: qid++, category: "Accessibility",
    question: "What is the minimum contrast ratio recommended by WCAG AA for normal text?",
    options: ["4.5:1", "3:1", "2:1", "7:1"],
    correctIndex: 0,
    explanation: "WCAG AA requires at least 4.5:1 contrast ratio for normal text (3:1 for large text).",
  });

  // Q: Design system
  questions.push({
    id: qid++, category: "Design Systems",
    question: "What is the primary benefit of using design tokens?",
    options: [
      "Consistent values across platforms",
      "Faster rendering",
      "Smaller file sizes",
      "Better animations",
    ],
    correctIndex: 0,
    explanation: "Design tokens store design decisions (colors, spacing, etc.) as platform-agnostic values for consistency.",
  });

  // Q: Naming
  questions.push({
    id: qid++, category: "Best Practices",
    question: "Why should nodes have descriptive names instead of defaults like 'Frame 1'?",
    options: [
      "Easier navigation and developer handoff",
      "Required by the rendering engine",
      "Reduces file size",
      "Improves animation performance",
    ],
    correctIndex: 0,
    explanation: "Descriptive names make the layer panel navigable and help developers understand the design structure.",
  });

  return questions;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Format quiz result as text for LLM */
export function formatQuizResult(state: QuizState): string {
  const correct = state.answers.filter((a, i) => a === state.questions[i].correctIndex).length;
  const total = state.questions.length;
  const lines = state.questions.map((q, i) => {
    const userAns = state.answers[i];
    const isCorrect = userAns === q.correctIndex;
    return `${isCorrect ? "✅" : "❌"} Q${i + 1}: ${q.question}\n   Your answer: ${userAns !== null ? q.options[userAns] : "(skipped)"}\n   ${isCorrect ? "" : `Correct: ${q.options[q.correctIndex]}\n   `}${q.explanation}`;
  });
  return `Quiz Results: ${correct}/${total} correct\n\n${lines.join("\n\n")}`;
}

/** Setup the Quiz tab panel in the right pane */
export function setupQuizPanel(container: HTMLElement, editor: Editor) {
  function render() {
    container.innerHTML = "";
    container.style.cssText = "display:flex;flex-direction:column;height:100%;font-family:Inter,system-ui,sans-serif;color:#cdd6f4;";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "padding:16px;border-bottom:1px solid #333;";
    header.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:8px;">Design Review & Quiz</div>`;

    // Action buttons
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;";

    const reviewBtn = document.createElement("button");
    reviewBtn.textContent = "📋 Run Review";
    reviewBtn.style.cssText = btnStyle();
    reviewBtn.onclick = () => showReview();

    const quizBtn = document.createElement("button");
    quizBtn.textContent = "🧠 Start Quiz";
    quizBtn.style.cssText = btnStyle();
    quizBtn.onclick = () => startQuiz();

    btnRow.append(reviewBtn, quizBtn);
    header.appendChild(btnRow);
    container.appendChild(header);

    // Content area
    const content = document.createElement("div");
    content.id = "quiz-content";
    content.style.cssText = "flex:1;overflow-y:auto;padding:12px;";
    content.innerHTML = `<div style="color:#666;font-size:12px;text-align:center;padding-top:40px;">
      Run a design review checklist or start a quiz to test your design knowledge.</div>`;
    container.appendChild(content);
  }

  function showReview() {
    const content = document.getElementById("quiz-content")!;
    const items = generateDesignReview(editor);
    content.innerHTML = "";

    const title = document.createElement("div");
    title.style.cssText = "font-size:12px;font-weight:600;margin-bottom:12px;color:#89b4fa;";
    const passed = items.filter(i => i.passed).length;
    title.textContent = `Design Review: ${passed}/${items.length} passed`;
    content.appendChild(title);

    items.forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = `padding:8px 10px;margin-bottom:6px;border-radius:6px;font-size:11px;background:${item.passed ? "#1a2a1a" : item.severity === "error" ? "#2a1a1a" : "#2a2a1a"};border:1px solid ${item.passed ? "#2d4a2d" : item.severity === "error" ? "#4a2d2d" : "#4a4a2d"};`;
      row.innerHTML = `<span style="margin-right:6px;">${item.passed ? "✅" : item.severity === "error" ? "❌" : "⚠️"}</span>
        <span style="color:#888;font-size:10px;">[${item.category}]</span> ${item.message}`;
      content.appendChild(row);
    });
  }

  function startQuiz() {
    const questions = generateQuiz(editor);
    if (questions.length === 0) {
      const content = document.getElementById("quiz-content")!;
      content.innerHTML = `<div style="color:#f38ba8;font-size:12px;padding:20px;">No quiz questions could be generated. Add some nodes to the scene first.</div>`;
      return;
    }
    quizState = { questions, currentIndex: 0, answers: questions.map(() => null), finished: false };
    renderQuestion();
  }

  function renderQuestion() {
    if (!quizState) return;
    const content = document.getElementById("quiz-content")!;
    content.innerHTML = "";

    if (quizState.finished) {
      renderResults();
      return;
    }

    const q = quizState.questions[quizState.currentIndex];
    const progress = document.createElement("div");
    progress.style.cssText = "font-size:10px;color:#666;margin-bottom:8px;";
    progress.textContent = `Question ${quizState.currentIndex + 1} of ${quizState.questions.length} • ${q.category}`;
    content.appendChild(progress);

    // Progress bar
    const bar = document.createElement("div");
    bar.style.cssText = "height:3px;background:#333;border-radius:2px;margin-bottom:16px;overflow:hidden;";
    const fill = document.createElement("div");
    fill.style.cssText = `height:100%;background:#89b4fa;border-radius:2px;width:${((quizState.currentIndex + 1) / quizState.questions.length) * 100}%;transition:width 0.3s;`;
    bar.appendChild(fill);
    content.appendChild(bar);

    const qText = document.createElement("div");
    qText.style.cssText = "font-size:13px;font-weight:500;margin-bottom:16px;line-height:1.5;";
    qText.textContent = q.question;
    content.appendChild(qText);

    const userAnswer = quizState.answers[quizState.currentIndex];

    q.options.forEach((opt, idx) => {
      const optBtn = document.createElement("button");
      optBtn.style.cssText = `display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid #444;background:${userAnswer === idx ? (idx === q.correctIndex ? "#1a3a1a" : "#3a1a1a") : "#1e1e2e"};color:#cdd6f4;transition:all 0.15s;`;
      optBtn.textContent = `${String.fromCharCode(65 + idx)}. ${opt}`;

      if (userAnswer === null) {
        optBtn.onmouseenter = () => { optBtn.style.background = "#2a2a3e"; };
        optBtn.onmouseleave = () => { optBtn.style.background = "#1e1e2e"; };
        optBtn.onclick = () => {
          quizState!.answers[quizState!.currentIndex] = idx;
          renderQuestion(); // re-render to show feedback
          setTimeout(() => {
            if (quizState!.currentIndex < quizState!.questions.length - 1) {
              quizState!.currentIndex++;
              renderQuestion();
            } else {
              quizState!.finished = true;
              renderQuestion();
            }
          }, 1200);
        };
      }
      content.appendChild(optBtn);
    });

    // Show explanation if answered
    if (userAnswer !== null) {
      const expl = document.createElement("div");
      expl.style.cssText = "margin-top:12px;padding:10px;background:#1e1e3e;border-radius:6px;font-size:11px;color:#a6adc8;border-left:3px solid #89b4fa;";
      expl.textContent = q.explanation;
      content.appendChild(expl);
    }
  }

  function renderResults() {
    if (!quizState) return;
    const content = document.getElementById("quiz-content")!;
    content.innerHTML = "";

    const correct = quizState.answers.filter((a, i) => a === quizState!.questions[i].correctIndex).length;
    const total = quizState.questions.length;
    const pct = Math.round((correct / total) * 100);

    const scoreDiv = document.createElement("div");
    scoreDiv.style.cssText = "text-align:center;padding:20px 0;";
    scoreDiv.innerHTML = `
      <div style="font-size:36px;font-weight:700;color:${pct >= 70 ? "#a6e3a1" : pct >= 40 ? "#f9e2af" : "#f38ba8"};">${pct}%</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">${correct}/${total} correct</div>
      <div style="font-size:11px;color:#666;margin-top:8px;">${pct >= 70 ? "Great job! 🎉" : pct >= 40 ? "Keep learning! 📚" : "Review the fundamentals 💪"}</div>
    `;
    content.appendChild(scoreDiv);

    // Retry button
    const retryBtn = document.createElement("button");
    retryBtn.textContent = "🔄 Try Again";
    retryBtn.style.cssText = btnStyle() + "display:block;margin:12px auto;";
    retryBtn.onclick = () => startQuiz();
    content.appendChild(retryBtn);

    // Detail
    quizState.questions.forEach((q, i) => {
      const isCorrect = quizState!.answers[i] === q.correctIndex;
      const row = document.createElement("div");
      row.style.cssText = `padding:8px 10px;margin-bottom:6px;border-radius:6px;font-size:11px;background:${isCorrect ? "#1a2a1a" : "#2a1a1a"};border:1px solid ${isCorrect ? "#2d4a2d" : "#4a2d2d"};`;
      row.innerHTML = `${isCorrect ? "✅" : "❌"} <strong>${q.question}</strong><br/>
        <span style="color:#888;">${q.explanation}</span>`;
      content.appendChild(row);
    });
  }

  function btnStyle() {
    return "padding:8px 14px;font-size:11px;border:1px solid #444;border-radius:6px;background:#2a2a3e;color:#cdd6f4;cursor:pointer;font-weight:500;";
  }

  render();
}
