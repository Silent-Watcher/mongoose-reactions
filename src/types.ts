import type { Document, Types } from 'mongoose';

export interface PluginOptions {
	// reactionField?: string; // name of field e.g. 'reaction'
	allowMultipleReactionsPerUser?: boolean; // default: false (one reaction per user per reactable)
	reactionTypes?: string[]; // optional whitelist
	reactionTypesCaseInsensitive?: boolean; // default true
	reactionModelName?: string; // default 'Reaction'
}

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
	// reactionField: "reaction",
	allowMultipleReactionsPerUser: false,
	reactionTypesCaseInsensitive: true,
	reactionModelName: 'Reaction',
};

export type ReactionType = string;
export interface ReactionDoc extends Document {
	reactableId: Types.ObjectId | string;
	reactableModel: string;
	user: Types.ObjectId;
	reaction: ReactionType;
	meta?: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}
