/**
 * Anonymous counts with GoatCounter (topos.goatcounter.com), whose script `index.html` loads:
 * visits, and quiz results rounded down to tens, collected for a "how many countries do people
 * know?" histogram that players don't see yet. No cookies, and nothing that identifies anyone.
 *
 * GoatCounter never counts localhost. To leave out your own visits on the live site, open it
 * once with #toggle-goatcounter at the end of the address, in each browser.
 */

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event?: boolean }) => void };
  }
}

/** How many quiz results this browser has sent, to tell first quizzes from retakes. */
const SENT_KEY = "topos:quizzes-counted";

/**
 * One event per skill, e.g. `quiz/map/medium/first/120-129`: the skill, the quiz length, whether
 * it's this browser's first quiz, and the estimate in tens. Renaming any part splits the data
 * collected so far.
 */
export function quizEvents(results: { skill: string; known: number }[], length: string, first: boolean) {
  const when = first ? "first" : "retake";
  return results.map(({ skill, known }) => {
    const low = Math.floor(Math.round(known) / 10) * 10;
    return { path: `quiz/${skill}/${length}/${when}/${low}-${low + 9}`, title: `Quiz: ${skill}, ${low} to ${low + 9} (${length}, ${when})` };
  });
}

/** Counts a finished quiz's results. Does nothing if GoatCounter is blocked or hasn't loaded. */
export function countQuiz(results: { skill: string; known: number }[], length: string) {
  let sent = 0;
  try {
    sent = Number(localStorage.getItem(SENT_KEY)) || 0;
    localStorage.setItem(SENT_KEY, String(sent + 1));
  } catch {
    // Storage blocked: count it as a first quiz.
  }
  const gc = window.goatcounter;
  if (typeof gc?.count !== "function") return;
  for (const event of quizEvents(results, length, sent === 0)) {
    try {
      gc.count({ ...event, event: true });
    } catch {
      // Counting is never worth breaking the results screen for.
    }
  }
}
