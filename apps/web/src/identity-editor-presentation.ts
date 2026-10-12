import type { IdentityBuilderState } from "./identity-builder-client";

export interface IdentityEditorPresentation {
  showApprovedSummary: boolean;
  openSource: boolean;
  openReview: boolean;
  showApprove: boolean;
  summary: string;
  factCount: number;
  topicCount: number;
}
export function identityEditorPresentation(
  state: IdentityBuilderState | null,
  changedSource = false,
  changedReview = false
): IdentityEditorPresentation {
  const approved = state?.reviewStatus === "approved";
  const pristine = approved && !changedSource && !changedReview;
  return {
    showApprovedSummary: Boolean(pristine),
    openSource: !pristine,
    openReview: !pristine && Boolean(state),
    showApprove: !pristine,
    summary: state?.analysis.summary.trim() ?? "",
    factCount: state?.analysis.stableFacts.length ?? 0,
    topicCount: state?.analysis.conversationTopics.length ?? 0
  };
}
