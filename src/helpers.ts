import type { PluginOptions } from './types';

export function normalizeReaction(reaction: string, opts: PluginOptions) {
	if (!reaction) return reaction;
	if (opts.reactionTypesCaseInsensitive) return reaction.toLowerCase();
	return reaction;
}
