import { saveProgress, type Progress } from './economy';

// DEVELOPMENT ONLY: change to false for a release build, then remove this file
// and the marked DEV CHEATS blocks in main.ts when development is complete.
export const DEV_CHEATS_ENABLED = true;

export function installDevCheatGesture(element: HTMLElement, activate: () => void): void {
  if (!DEV_CHEATS_ENABLED) return;
  element.style.touchAction = 'manipulation';
  let taps = 0, firstTap = 0;
  element.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const now = performance.now();
    if (taps === 0 || now - firstTap > 2500) { taps = 1; firstTap = now; }
    else taps++;
    if (taps === 5) { taps = 0; activate(); }
  });
}

export function redeemEntropyCode(progress: Progress, code: string): boolean {
  if (code.trim().toUpperCase() !== 'ENTROPIA5000') return false;
  progress.entropy += 5000;
  saveProgress(progress);
  return true;
}

export function phaseFromCheat(code: string, currentPhase: number): number | null {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized === 'FASE+1' || normalized === 'PROXIMAFASE') return currentPhase < 100 ? currentPhase + 1 : null;
  const match = /^FASE([1-9]\d{0,2})$/.exec(normalized);
  if (!match) return null;
  const target = Number(match[1]);
  return target > currentPhase && target <= 100 ? target : null;
}
