// Task class definitions
// Deterministic task classification with regex patterns

const CLASS_ID_PATTERN = /^[a-z0-9_-]+$/;

export const DEFAULT_TASK_CLASSES = {
  quick: {
    semanticLabel: "quick transformation",
    semanticScore: 15,
    priority: 10,
    scoreDelta: -15,
    patterns: [
      /\b(translate|summari[sz]e|rewrite|rephrase|format|spellcheck|typo|define|convert|one[- ]liner|short answer)\b/i,
    ],
  },
  coding: {
    semanticLabel: "software coding",
    semanticScore: 50,
    priority: 50,
    scoreDelta: 10,
    patterns: [
      /\b(code|implement|function|class|typescript|javascript|python|rust|golang|java|sql|regex|api|endpoint|component|refactor|repository|codebase)\b/i,
    ],
  },
  research: {
    semanticLabel: "technical research",
    semanticScore: 70,
    priority: 60,
    scoreDelta: 20,
    hardFloor: "medium",
    patterns: [
      /\b(research|compare|evaluate|benchmark|investigate|latest|sources?|citations?|evidence)\b/i,
    ],
  },
  debugging: {
    semanticLabel: "software debugging",
    semanticScore: 60,
    priority: 70,
    scoreDelta: 15,
    hardFloor: "medium",
    patterns: [
      /\b(debug|bug|error|exception|stack trace|fails?|broken|regression|root cause|diagnos[ei]|fix this)\b/i,
    ],
  },
  review: {
    semanticLabel: "code review",
    semanticScore: 70,
    priority: 80,
    scoreDelta: 20,
    hardFloor: "medium",
    patterns: [
      /\b(review|audit|pull request|diff|vulnerabil\w*|security review|code review|threat model)\b/i,
    ],
  },
  planning: {
    semanticLabel: "technical planning",
    semanticScore: 80,
    priority: 90,
    scoreDelta: 25,
    hardFloor: "medium",
    patterns: [
      /\b(plan|architecture|design|strategy|proposal|roadmap|specification|migration plan|implementation plan|trade[- ]?offs?)\b/i,
    ],
  },
  general: {
    semanticLabel: "general question",
    semanticScore: 45,
    priority: 0,
    scoreDelta: 0,
    patterns: [],
  },
  risk: {
    task: false,
    scoreDelta: 30,
    hardFloor: "high",
    patterns: [
      /\b(production|security|authentication|authorization|permission|credential|secret|payment|billing|finance|medical|legal|destructive|delete data|data loss|tenant|encryption)\b/i,
    ],
  },
  migration: {
    task: false,
    scoreDelta: 25,
    hardFloor: "high",
    patterns: [
      /\b(migrat(?:e|ion)|schema change|database upgrade|backfill|zero downtime|rollout|rollback|compatibility)\b/i,
    ],
  },
  multi_step: {
    task: false,
    scoreDelta: 10,
    patterns: [
      /\b(first|then|after that|finally|step \d+|end[- ]to[- ]end|across (?:the )?codebase|multiple files?)\b/i,
    ],
  },
};

function compileTaskClass(id, definition) {
  const isTask = definition.task !== false;
  return {
    id,
    isTask,
    semanticLabel: definition.semanticLabel || null,
    patterns: Array.isArray(definition.patterns) ? definition.patterns : [],
    scoreDelta: definition.scoreDelta ?? 0,
    priority: definition.priority ?? 0,
    hardFloor: definition.hardFloor ?? null,
  };
}

export function compileTaskClasses(taskClasses = DEFAULT_TASK_CLASSES) {
  const compiled = Object.entries(taskClasses).map(([id, def]) => compileTaskClass(id, def));
  const taskClassesOnly = compiled
    .filter((tc) => tc.isTask)
    .sort((a, b) => b.priority - a.priority);
  return {
    classes: compiled,
    taskClasses: taskClassesOnly,
  };
}

export const DEFAULT_COMPILED = compileTaskClasses();
