import {
  type StudySyllabusTemplate,
  studySyllabusTemplateSchema,
} from "@neobuni/contracts";

import systemArchitect2026Json from "./system-architect-2026.json";

const systemArchitect2026Template = studySyllabusTemplateSchema.parse(
  systemArchitect2026Json
);

const studyTemplates: Record<string, StudySyllabusTemplate> = {
  "system-architect-2026": systemArchitect2026Template,
};

const getStudyTemplate = (templateId: string): StudySyllabusTemplate => {
  const template = studyTemplates[templateId];
  if (!template) {
    throw new Error(`Unknown study template: ${templateId}`);
  }
  return template;
};

const studyTemplateSyllabusRefs = (template: StudySyllabusTemplate): string[] =>
  template.modules.flatMap((module) => module.topics.map((topic) => topic.id));

const studyTemplateTotalMinutes = (template: StudySyllabusTemplate): number =>
  template.modules.reduce(
    (sum, module) =>
      sum +
      module.topics.reduce((topicSum, topic) => topicSum + topic.minutes, 0),
    0
  );

export {
  getStudyTemplate,
  studyTemplateSyllabusRefs,
  studyTemplates,
  studyTemplateTotalMinutes,
  systemArchitect2026Template,
};
