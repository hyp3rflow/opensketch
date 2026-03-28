import type { Editor } from "../editor";

interface QuizQuestion {
  id: number;
  category: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: string;
  related_id: number | null;
}

interface ChecklistItem {
  category: string;
  text: string;
  passed: boolean;
  suggestion: string | null;
}

type QuizMode = "menu" | "quiz" | "results" | "checklist";

let overlay: HTMLDivElement | null = null;

export function toggleQuizPanel(editor: Editor) {
  if (overlay) { closeQuiz(); return; }
  openQuizModal(editor);
}

/** Tab-based setup for right pane */
export function setupQuizPanel(container: HTMLElement, editor: Editor) {
  renderMenu(container, editor);
}

function closeQuiz() {
  overlay?.remove();
  overlay = null;
}

function openQuizModal(editor: Editor) {
  overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);";
  overlay.onclick = (e) => { if (e.target === overlay) closeQuiz(); };

  const modal = document.createElement("div");
  modal.style.cssText = "background:#1e1e2e;border-radius:16px;width:560px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);color:#e0e0e0;font-family:system-ui;";
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  renderMenu(modal, editor);
}

function renderMenu(modal: HTMLElement, editor: Editor) {
  modal.innerHTML = "";
  const pad = "padding:32px;";

  const header = el("div", `${pad}text-align:center;`);
  header.innerHTML = `
    <div style="font-size:36px;margin-bottom:8px;">🎓</div>
    <h2 style="margin:0;font-size:20px;font-weight:700;color:#fff;">Design Quiz</h2>
    <p style="margin:6px 0 0;font-size:13px;color:#888;">Test your knowledge of this design file</p>
  `;
  modal.appendChild(header);

  const body = el("div", "padding:0 32px 32px;display:flex;flex-direction:column;gap:12px;");

  const quizBtn = actionCard("🧠", "Start Quiz", "Answer questions about components, styles, tokens & more", "#6c5ce7");
  quizBtn.onclick = () => startQuiz(modal, editor);
  body.appendChild(quizBtn);

  const checkBtn = actionCard("📋", "Design Review Checklist", "Auto-generated review of your file's health", "#00b894");
  checkBtn.onclick = () => showChecklist(modal, editor);
  body.appendChild(checkBtn);

  modal.appendChild(body);
}

function actionCard(icon: string, title: string, desc: string, color: string): HTMLElement {
  const card = el("div", `display:flex;align-items:center;gap:14px;padding:16px;background:#2a2a3e;border-radius:12px;cursor:pointer;border:1px solid #333;transition:border-color 0.2s;`);
  card.onmouseenter = () => card.style.borderColor = color;
  card.onmouseleave = () => card.style.borderColor = "#333";
  card.innerHTML = `
    <div style="font-size:28px;width:44px;text-align:center;">${icon}</div>
    <div><div style="font-weight:600;font-size:14px;color:#fff;">${title}</div><div style="font-size:12px;color:#888;margin-top:2px;">${desc}</div></div>
  `;
  return card;
}

function startQuiz(modal: HTMLElement, editor: Editor) {
  const seed = Math.floor(Math.random() * 100000);
  const json = editor.engine.generate_quiz(seed);
  const questions: QuizQuestion[] = JSON.parse(json);

  if (questions.length === 0) {
    modal.innerHTML = `<div style="padding:40px;text-align:center;"><p style="font-size:16px;color:#888;">No quiz questions could be generated.<br>Add more content to your design file.</p><button id="qz-back" style="margin-top:16px;${btnStyle("#6c5ce7")}">Back</button></div>`;
    modal.querySelector("#qz-back")!.addEventListener("click", () => renderMenu(modal, editor));
    return;
  }

  let current = 0;
  const answers: (number | null)[] = new Array(questions.length).fill(null);

  function renderQuestion() {
    const q = questions[current];
    modal.innerHTML = "";

    // Progress bar
    const progress = el("div", "padding:16px 24px 0;");
    const pct = ((current + 1) / questions.length * 100).toFixed(0);
    progress.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:6px;">
        <span>Question ${current + 1} / ${questions.length}</span>
        <span style="padding:2px 8px;border-radius:8px;background:${diffColor(q.difficulty)};color:#fff;font-size:10px;">${q.difficulty}</span>
      </div>
      <div style="height:4px;background:#333;border-radius:2px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:#6c5ce7;border-radius:2px;transition:width 0.3s;"></div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${q.category}</div>
    `;
    modal.appendChild(progress);

    // Question
    const qDiv = el("div", "padding:16px 24px;");
    qDiv.innerHTML = `<div style="font-size:16px;font-weight:600;color:#fff;line-height:1.5;">${q.question}</div>`;
    modal.appendChild(qDiv);

    // Options
    const optDiv = el("div", "padding:0 24px;display:flex;flex-direction:column;gap:8px;");
    const answered = answers[current] !== null;
    q.options.forEach((opt, i) => {
      const btn = el("button", `width:100%;text-align:left;padding:12px 16px;border-radius:10px;font-size:14px;cursor:pointer;border:2px solid #333;background:#2a2a3e;color:#e0e0e0;transition:all 0.2s;`);
      btn.textContent = opt;

      if (answered) {
        if (i === q.correct_index) {
          btn.style.borderColor = "#00b894";
          btn.style.background = "rgba(0,184,148,0.15)";
        }
        if (i === answers[current] && i !== q.correct_index) {
          btn.style.borderColor = "#d63031";
          btn.style.background = "rgba(214,48,49,0.15)";
        }
        btn.style.cursor = "default";
      } else {
        btn.onmouseenter = () => { btn.style.borderColor = "#6c5ce7"; };
        btn.onmouseleave = () => { btn.style.borderColor = "#333"; };
        btn.onclick = () => { answers[current] = i; renderQuestion(); };
      }
      optDiv.appendChild(btn);
    });
    modal.appendChild(optDiv);

    // Explanation
    if (answered) {
      const explDiv = el("div", "padding:12px 24px;");
      const isCorrect = answers[current] === q.correct_index;
      explDiv.innerHTML = `
        <div style="padding:12px 16px;border-radius:10px;background:${isCorrect ? "rgba(0,184,148,0.1)" : "rgba(214,48,49,0.1)"};border:1px solid ${isCorrect ? "#00b894" : "#d63031"};">
          <div style="font-weight:600;font-size:13px;color:${isCorrect ? "#00b894" : "#d63031"};margin-bottom:4px;">${isCorrect ? "✓ Correct!" : "✗ Incorrect"}</div>
          <div style="font-size:12px;color:#aaa;">${q.explanation}</div>
        </div>
      `;
      modal.appendChild(explDiv);
    }

    // Navigation
    const nav = el("div", "padding:16px 24px 24px;display:flex;justify-content:space-between;gap:8px;");
    if (current > 0) {
      const prev = el("button", btnStyle("#555"));
      prev.textContent = "← Previous";
      prev.onclick = () => { current--; renderQuestion(); };
      nav.appendChild(prev);
    } else {
      nav.appendChild(el("div", ""));
    }

    if (answered && current < questions.length - 1) {
      const next = el("button", btnStyle("#6c5ce7"));
      next.textContent = "Next →";
      next.onclick = () => { current++; renderQuestion(); };
      nav.appendChild(next);
    } else if (answered && current === questions.length - 1) {
      const finish = el("button", btnStyle("#00b894"));
      finish.textContent = "See Results";
      finish.onclick = () => showResults(modal, editor, questions, answers as number[]);
      nav.appendChild(finish);
    }
    modal.appendChild(nav);
  }

  renderQuestion();
}

function showResults(modal: HTMLElement, editor: Editor, questions: QuizQuestion[], answers: number[]) {
  const correct = questions.filter((q, i) => answers[i] === q.correct_index).length;
  const pct = Math.round(correct / questions.length * 100);

  const byCategory: Record<string, [number, number]> = {};
  questions.forEach((q, i) => {
    if (!byCategory[q.category]) byCategory[q.category] = [0, 0];
    byCategory[q.category][1]++;
    if (answers[i] === q.correct_index) byCategory[q.category][0]++;
  });

  modal.innerHTML = "";
  const pad = "padding:32px;text-align:center;";
  const header = el("div", pad);
  const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "👍" : pct >= 40 ? "📚" : "💪";
  const grade = pct >= 80 ? "Excellent!" : pct >= 60 ? "Good job!" : pct >= 40 ? "Keep learning!" : "Room to grow!";
  header.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px;">${emoji}</div>
    <h2 style="margin:0;font-size:22px;color:#fff;">${grade}</h2>
    <div style="margin-top:12px;font-size:48px;font-weight:700;color:${pct >= 60 ? "#00b894" : "#fdcb6e"};">${pct}%</div>
    <div style="font-size:14px;color:#888;margin-top:4px;">${correct} / ${questions.length} correct</div>
  `;
  modal.appendChild(header);

  // Category breakdown
  const catDiv = el("div", "padding:0 32px 16px;");
  for (const [cat, [c, t]] of Object.entries(byCategory)) {
    const row = el("div", "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#2a2a3e;border-radius:8px;margin-bottom:6px;");
    const catPct = Math.round(c / t * 100);
    row.innerHTML = `
      <span style="font-size:13px;color:#ccc;">${cat}</span>
      <span style="font-size:12px;color:${catPct >= 60 ? "#00b894" : "#fdcb6e"};font-weight:600;">${c}/${t} (${catPct}%)</span>
    `;
    catDiv.appendChild(row);
  }
  modal.appendChild(catDiv);

  const nav = el("div", "padding:16px 32px 32px;display:flex;gap:10px;justify-content:center;");
  const retry = el("button", btnStyle("#6c5ce7"));
  retry.textContent = "🔄 Retry";
  retry.onclick = () => startQuiz(modal, editor);
  nav.appendChild(retry);
  const back = el("button", btnStyle("#555"));
  back.textContent = "Back to Menu";
  back.onclick = () => renderMenu(modal, editor);
  nav.appendChild(back);
  modal.appendChild(nav);
}

function showChecklist(modal: HTMLElement, editor: Editor) {
  const json = editor.engine.generate_review_checklist();
  const items: ChecklistItem[] = JSON.parse(json);

  modal.innerHTML = "";
  const header = el("div", "padding:24px 24px 12px;");
  const passed = items.filter(i => i.passed).length;
  header.innerHTML = `
    <h2 style="margin:0;font-size:18px;color:#fff;">📋 Design Review Checklist</h2>
    <p style="margin:6px 0 0;font-size:13px;color:#888;">${passed} / ${items.length} checks passed</p>
    <div style="height:4px;background:#333;border-radius:2px;overflow:hidden;margin-top:10px;">
      <div style="height:100%;width:${(passed / items.length * 100).toFixed(0)}%;background:${passed === items.length ? "#00b894" : "#fdcb6e"};border-radius:2px;"></div>
    </div>
  `;
  modal.appendChild(header);

  const body = el("div", "padding:0 24px 24px;");
  let lastCat = "";
  for (const item of items) {
    if (item.category !== lastCat) {
      lastCat = item.category;
      const catLabel = el("div", "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px;");
      catLabel.textContent = item.category;
      body.appendChild(catLabel);
    }
    const row = el("div", "display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#2a2a3e;border-radius:8px;margin-bottom:6px;");
    const icon = item.passed ? "✅" : "⚠️";
    row.innerHTML = `
      <span style="font-size:16px;flex-shrink:0;">${icon}</span>
      <div>
        <div style="font-size:13px;color:${item.passed ? "#ccc" : "#fdcb6e"};">${item.text}</div>
        ${item.suggestion ? `<div style="font-size:11px;color:#888;margin-top:3px;">💡 ${item.suggestion}</div>` : ""}
      </div>
    `;
    body.appendChild(row);
  }
  modal.appendChild(body);

  const nav = el("div", "padding:0 24px 24px;text-align:center;");
  const back = el("button", btnStyle("#555"));
  back.textContent = "← Back";
  back.onclick = () => renderMenu(modal, editor);
  nav.appendChild(back);
  modal.appendChild(nav);
}

// LLM Agent integration
export function generateQuiz(editor: Editor): QuizQuestion[] {
  const seed = Math.floor(Math.random() * 100000);
  const json = editor.engine.generate_quiz(seed);
  return JSON.parse(json);
}

export function formatQuizResult(correct: number, total: number): string {
  return `Score: ${correct}/${total} (${Math.round(correct / total * 100)}%)`;
}

// Helpers
function el(tag: string, css: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

function btnStyle(bg: string): string {
  return `padding:10px 20px;border:none;border-radius:8px;background:${bg};color:#fff;font-size:13px;font-weight:600;cursor:pointer;`;
}

function diffColor(d: string): string {
  return d === "Easy" ? "#00b894" : d === "Medium" ? "#fdcb6e" : "#d63031";
}
