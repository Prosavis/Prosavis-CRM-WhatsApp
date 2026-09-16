import {
  shouldAutoCreateSubject,
  type ExtractedResumeSubject,
} from '../jobApplications/domain.ts';

export interface SplitInstruction {
  subject: ExtractedResumeSubject;
  autoCreate: boolean;
}

export function planSubjectActions(subjects: ExtractedResumeSubject[]): {
  keep?: ExtractedResumeSubject;
  splits: SplitInstruction[];
  needsReview: boolean;
  reviewReason: string | null;
} {
  const usable = subjects.filter((subject) => subject.fullName.trim().length > 0);
  if (usable.length === 0) {
    return { splits: [], needsReview: true, reviewReason: 'no_subject' };
  }

  const [first, ...rest] = usable;
  const splits = rest.map((subject) => ({
    subject,
    autoCreate: shouldAutoCreateSubject(subject),
  }));
  const firstAuto = shouldAutoCreateSubject(first);
  const ambiguous = !firstAuto || splits.some((item) => !item.autoCreate) || usable.length > 1;

  return {
    keep: first,
    splits,
    needsReview: ambiguous,
    reviewReason: usable.length > 1
      ? 'multiple_subjects'
      : firstAuto
        ? null
        : 'weak_identity',
  };
}
