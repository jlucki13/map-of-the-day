import { ORCHESTRATOR_MODEL, SUBAGENT_MODEL } from "@/agents/client";
import { MockHintsmithAgent } from "@/agents/mock/hintsmith";
import { MockJudgeAgent } from "@/agents/mock/judge";
import { MockOrchestratorAgent } from "@/agents/mock/orchestrator";
import { MockRedactorAgent } from "@/agents/mock/redactor";
import { MockScoutAgent } from "@/agents/mock/scout";
import { LiveOrchestratorAgent } from "@/agents/orchestrator";
import { LiveHintsmithAgent } from "@/agents/subagents/hintsmith";
import { LiveJudgeAgent } from "@/agents/subagents/judge";
import { LiveRedactorAgent } from "@/agents/subagents/redactor";
import { LiveScoutAgent } from "@/agents/subagents/scout";
import type { AgentPipeline } from "@/agents/types";
import { isLiveMode } from "@/lib/config";

export { isLiveMode } from "@/lib/config";

let cachedPipeline: AgentPipeline | null = null;

/**
 * Factory keyed on whether ANTHROPIC_API_KEY is set. generatePuzzle() and the
 * guess route receive the same interface either way — byte-identical control
 * flow, only the injected implementations differ.
 */
export function getAgentPipeline(): AgentPipeline {
  if (cachedPipeline) return cachedPipeline;

  if (isLiveMode()) {
    cachedPipeline = {
      mode: "live",
      orchestratorModel: ORCHESTRATOR_MODEL,
      subagentModel: SUBAGENT_MODEL,
      scout: new LiveScoutAgent(),
      redactor: new LiveRedactorAgent(),
      hintsmith: new LiveHintsmithAgent(),
      judge: new LiveJudgeAgent(),
      orchestrator: new LiveOrchestratorAgent(),
    };
  } else {
    cachedPipeline = {
      mode: "mock",
      orchestratorModel: `mock:${ORCHESTRATOR_MODEL}`,
      subagentModel: `mock:${SUBAGENT_MODEL}`,
      scout: new MockScoutAgent(),
      redactor: new MockRedactorAgent(),
      hintsmith: new MockHintsmithAgent(),
      judge: new MockJudgeAgent(),
      orchestrator: new MockOrchestratorAgent(),
    };
  }

  return cachedPipeline;
}
