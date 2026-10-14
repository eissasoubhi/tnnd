/** Small, testable rules for progressive onboarding disclosure. */
export function isSetupComplete(percent: number | null): boolean {
  return percent === 100;
}

export function shouldShowGuidedTour(input: {
  dismissed: boolean;
  setupComplete: boolean;
  reopenedManually: boolean;
}): boolean {
  return input.reopenedManually || (!input.dismissed && !input.setupComplete);
}
