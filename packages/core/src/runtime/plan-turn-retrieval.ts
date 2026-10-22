import type { TurnContext } from "@neobuni/contracts";

import { buildRetrievalPlan } from "../cognition/retrieval-plan";

const planTurnRetrieval = (turnContext: TurnContext) =>
  buildRetrievalPlan(turnContext);

export { planTurnRetrieval };
