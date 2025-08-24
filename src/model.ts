import { type Model, model, models, Schema } from 'mongoose';
import type { PluginOptions, ReactionDoc } from './types';

let anExistingReactionModel: Model<ReactionDoc> | null = null;

export function createReactionModel(options: PluginOptions) {
	if (anExistingReactionModel) return anExistingReactionModel;

	const reactionSchema = new Schema<ReactionDoc>(
		{
			reactableId: {
				type: Schema.Types.Mixed,
				required: true,
				index: true,
			},
			reactableModel: { type: String, required: true, index: true },
			user: { type: Schema.Types.ObjectId, required: true, index: true },
			reaction: { type: String, required: true },
			meta: { type: Schema.Types.Mixed },
		},
		{ timestamps: true, versionKey: false },
	);

	// Indexes - base indexes
	reactionSchema.index({ reactableModel: 1, reactableId: 1, reaction: 1 });

	if (options.allowMultipleReactionsPerUser) {
		reactionSchema.index(
			{ reactableModel: 1, reactableId: 1, user: 1, reaction: 1 },
			{ unique: true, sparse: true },
		);
	} else {
		reactionSchema.index(
			{ reactableModel: 1, reactableId: 1, user: 1 },
			{ unique: true, sparse: true },
		);
	}

	anExistingReactionModel =
		(models[options.reactionModelName!] as Model<ReactionDoc>) ||
		model<ReactionDoc>(options.reactionModelName!, reactionSchema);

	return anExistingReactionModel;
}
