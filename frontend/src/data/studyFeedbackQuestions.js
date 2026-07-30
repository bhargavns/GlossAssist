export const surveyQuestionSections = [
  {
    title: "GlossAssist without predictions",
    questions: [
      {
        id: "scratch_mental_load",
        prompt: "How much mental and perceptual activity was required?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very low mental activity",
        maxLabel: "Very high mental activity"
      },
      {
        id: "scratch_goal_success",
        prompt: "How successful were you in accomplishing the goals of the task?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Not at all successful",
        maxLabel: "Extremely successful"
      },
      {
        id: "scratch_effort",
        prompt: "How hard did you have to work to accomplish your level of performance?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very little effort",
        maxLabel: "Very high effort"
      },
      {
        id: "scratch_affect",
        prompt: "How discouraged or stressed versus relaxed and content did you feel?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very discouraged or stressed",
        maxLabel: "Very relaxed and content"
      },
      {
        id: "scratch_meets_requirements",
        prompt: "GlossAssist capabilities meet my requirements.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "scratch_frustrating",
        prompt: "Using GlossAssist is a frustrating experience.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "scratch_easy",
        prompt: "GlossAssist is easy to use.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      }
    ]
  },
  {
    title: "GlossAssist with CWoMP predictions",
    questions: [
      {
        id: "pred_mental_load",
        prompt: "How much mental and perceptual activity was required with predictions?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very low mental activity",
        maxLabel: "Very high mental activity"
      },
      {
        id: "pred_goal_success",
        prompt: "How successful were you in accomplishing the goals with predictions?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Not at all successful",
        maxLabel: "Extremely successful"
      },
      {
        id: "pred_effort",
        prompt: "How hard did you have to work with predictions?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very little effort",
        maxLabel: "Very high effort"
      },
      {
        id: "pred_affect",
        prompt: "How discouraged or stressed versus relaxed and content did you feel with predictions?",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "Very discouraged or stressed",
        maxLabel: "Very relaxed and content"
      },
      {
        id: "pred_meets_requirements",
        prompt: "GlossAssist + CWoMP capabilities meet my requirements.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "pred_frustrating",
        prompt: "Using GlossAssist + CWoMP is a frustrating experience.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "pred_easy",
        prompt: "GlossAssist + CWoMP is easy to use.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "pred_correction_time",
        prompt: "I have to spend too much time correcting things in GlossAssist + CWoMP.",
        type: "scale",
        min: 1,
        max: 7,
        minLabel: "Strongly disagree",
        maxLabel: "Strongly agree"
      },
      {
        id: "pred_influence_notes",
        prompt: "How did suggestions affect your decisions or confidence?",
        type: "text"
      }
    ]
  },
  {
    title: "Perception of CWoMP",
    questions: [
      { id: "trust_interprets_correctly", prompt: "CWoMP is capable of interpreting situations correctly.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_state_clear", prompt: "CWoMP state was always clear to me.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_know_similar", prompt: "I already know similar systems to CWoMP.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_developers_trustworthy", prompt: "The developers are trustworthy.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_be_careful", prompt: "One should be careful with unfamiliar automated systems.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_reliable", prompt: "CWoMP works reliably.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_unpredictable", prompt: "CWoMP reacts unpredictably.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_wellbeing", prompt: "The developers take my well-being seriously.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_i_trust", prompt: "I trust CWoMP.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_malfunction_likely", prompt: "A CWoMP malfunction is likely.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_understand_why", prompt: "I was able to understand why things happened.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_rather_trust", prompt: "I rather trust a system than mistrust it.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_complicated_tasks", prompt: "CWoMP is capable of taking over complicated tasks.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_rely", prompt: "I can rely on CWoMP.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_sporadic_errors", prompt: "CWoMP might make sporadic errors.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_predict_next", prompt: "It is difficult to identify what CWoMP will do next.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_used_similar", prompt: "I have already used systems similar to CWoMP.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_automated_good", prompt: "Automated systems generally work well.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      { id: "trust_confident", prompt: "I am confident about CWoMP capabilities.", type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" }
    ]
  }
];

export const interviewQuestions = [
  "Describe your usual process for working with your collected data, especially for glossing.",
  "Describe your first impressions when GlossAssist predictions appeared.",
  "Walk me through a moment where you accepted or rejected a suggestion. What was going through your mind?",
  "Did you notice any patterns in mistakes that GlossAssist made, or in things it did well?",
  "Was there a moment where the tool got in your way, or where you wanted information that was not there?",
  "Has working with GlossAssist changed how you think about where automated tools fit into documentation work?",
  "Are there any other things you would like to talk about?",
  "Did you look at retrieved lexical entries and grammatical rules? What role did they play in your decisions?",
  "When you disagreed with a prediction, what did you do, and how effortful did it feel?",
  "Did your relationship with suggestions change over time (early vs later)?",
  "Can you imagine doing this task without automated suggestions? How would that have gone?",
  "How did you feel about the tool making morpheme decisions in this language?"
];
