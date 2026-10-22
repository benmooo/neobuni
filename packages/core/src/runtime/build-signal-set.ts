import type {
  MemorySlice,
  RuntimeTurnSignalInput,
  ScheduleSignalInput,
  SignalSet,
} from "@neobuni/contracts";

import {
  adaptBehavioralSignals,
  adaptEnvironmentalSignals,
  adaptMemorySignals,
  adaptScheduleSignals,
  adaptTextSignals,
} from "../perception";

const buildSignalSet = (input: {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedSlices: MemorySlice[];
  recentSlices: MemorySlice[];
  schedules: ScheduleSignalInput[];
  recentRuntimeTurns: RuntimeTurnSignalInput[];
  effectiveTimezone: string;
  now: string;
}): SignalSet => {
  return {
    textSignals: adaptTextSignals({
      latestUserText: input.latestUserText,
      recentUserTexts: input.recentUserTexts,
    }),
    memorySignals: adaptMemorySignals({
      latestUserText: input.latestUserText,
      unresolvedSlices: input.unresolvedSlices,
      recentSlices: input.recentSlices,
    }),
    scheduleSignals: adaptScheduleSignals({
      schedules: input.schedules,
      now: input.now,
    }),
    behavioralSignals: adaptBehavioralSignals({
      latestUserText: input.latestUserText,
      recentUserTexts: input.recentUserTexts,
      recentRuntimeTurns: input.recentRuntimeTurns,
    }),
    environmentalSignals: adaptEnvironmentalSignals({
      now: input.now,
      effectiveTimezone: input.effectiveTimezone,
    }),
  };
};

export { buildSignalSet };
