import { createFileRoute } from "@tanstack/react-router";

import { LessonPage } from "@/features/study/lesson/lesson-page";

export const Route = createFileRoute("/_app/study/$goalId_/lesson/$planNodeId")(
  {
    component: LessonRoute,
  }
);

function LessonRoute() {
  const { goalId, planNodeId } = Route.useParams();
  return (
    <LessonPage goalId={goalId} key={planNodeId} planNodeId={planNodeId} />
  );
}
