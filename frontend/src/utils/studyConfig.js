export const STUDY_MODE_ENABLED = process.env.REACT_APP_USER_STUDY_MODE === 'true';

export const STUDY_DATASETS = [
  {
    key: 'part1_no_predictions',
    title: 'Part 1 (No model predictions)',
    language: process.env.REACT_APP_STUDY_LANG_NO_PRED || 'Study_NoPred',
    description: 'Annotate examples where gloss predictions are intentionally not pre-filled.'
  },
  {
    key: 'part2_with_predictions',
    title: 'Part 2 (Predictions provided)',
    language: process.env.REACT_APP_STUDY_LANG_WITH_PRED || 'Study_WithPred',
    description: 'Annotate examples with pre-filled predictions uploaded in advance.'
  }
];
