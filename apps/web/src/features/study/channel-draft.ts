interface ChannelAliasInput {
  alias: string;
  hasTelegramTargets: boolean;
  platform: string;
  selectedTarget: string;
}

/**
 * The Telegram branch renders either a target picker (when bound targets exist)
 * or a free-text alias input. Reading `selectedTarget` unconditionally made the
 * free-text path a no-op, so the alias source must follow the rendered control.
 */
const resolveChannelAlias = (input: ChannelAliasInput): string => {
  const useTargetPicker =
    input.platform === "telegram" && input.hasTelegramTargets;

  return (useTargetPicker ? input.selectedTarget : input.alias).trim();
};

export type { ChannelAliasInput };
export { resolveChannelAlias };
