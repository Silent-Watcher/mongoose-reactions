import type {
	ClientSession,
	HydratedDocument,
	PopulateOptions,
	ProjectionType,
	Schema,
	Types,
} from 'mongoose';
import { normalizeReaction } from './helpers';
import { createReactionModel } from './model';
import { DEFAULT_OPTIONS, type PluginOptions, type ReactionDoc } from './types';

export function reactionsPlugin(schema: Schema, options: PluginOptions = {}) {
	const pluginOpts = { ...DEFAULT_OPTIONS, ...options } as PluginOptions;
	const reactionModel = createReactionModel(pluginOpts);

	/**
	 * react: user adds (or updates) a reaction
	 */
	schema.statics.react = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		userId: Types.ObjectId | string,
		reaction: string,
		meta?: Record<string, any>,
		opOpts?: { session?: ClientSession },
	) {
		const session = opOpts?.session ?? null;

		reaction = normalizeReaction(reaction, pluginOpts);
		if (
			pluginOpts.reactionTypes &&
			!pluginOpts.reactionTypes.includes(reaction)
		) {
			throw new Error(`Reaction "${reaction}" not allowed.`);
		}

		if (pluginOpts.allowMultipleReactionsPerUser) {
			// insert if not exists; unique index will prevent duplicates
			try {
				const doc = new reactionModel({
					reactableId,
					reactableModel: this.modelName,
					user: userId,
					reaction,
					meta,
				});
				return await doc.save({ session });
			} catch (error) {
				// handle duplicate key (concurrent)
				if ((error as { code: number }).code === 11000) {
					// already exists: return existing
					return await reactionModel
						.findOne({
							reactableModel: this.modelName,
							reactableId,
							user: userId,
							reaction,
						})
						.session(session)
						.lean();
				}
				throw error;
			}
		} else {
			// single reaction per user: upsert the reaction (replace reaction)
			const res = await reactionModel
				.findOneAndUpdate(
					{
						reactableModel: this.modelName,
						reactableId,
						user: userId,
					},
					{ $set: { reaction, meta, updatedAt: new Date() } },
					{
						upsert: true,
						new: true,
						setDefaultsOnInsert: true,
						session,
					},
				)
				.lean();

			return res;
		}
	};

	/**
	 * unreact: remove reaction(s)
	 * If reaction param provided, remove that reaction (useful for multi mode)
	 * If omitted, remove all reactions by user on that reactable (single mode will remove the one)
	 */
	schema.statics.unreact = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		userId: Types.ObjectId | string,
		reaction?: string,
		opOpts?: { session?: ClientSession },
	) {
		const session = opOpts?.session ?? null;

		const filter: any = {
			reactableModel: this.modelName,
			reactableId,
			user: userId,
		};
		if (reaction) filter.reaction = normalizeReaction(reaction, pluginOpts);
		const res = await reactionModel.deleteMany(filter, {
			...(session ? { session } : {}),
		});
		return res.deletedCount ?? 0;
	};

	/**
	 * toggleReaction: if user has the same reaction => remove, else set it
	 * Behavior depends on allowMultipleReactionsPerUser:
	 * - single-mode: toggles between 'no reaction' and the given reaction (replaces previous)
	 * - multi-mode: toggles presence of the given reaction only
	 */
	schema.statics.toggleReaction = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		userId: Types.ObjectId | string,
		reaction: string,
		meta?: Record<string, any>,
		opOpts?: { session?: ClientSession },
	) {
		const session = opOpts?.session ?? null;

		reaction = normalizeReaction(reaction, pluginOpts);
		if (
			pluginOpts.reactionTypes &&
			!pluginOpts.reactionTypes.includes(reaction)
		) {
			throw new Error(`Reaction "${reaction}" not allowed.`);
		}

		if (pluginOpts.allowMultipleReactionsPerUser) {
			const existingReaction = await reactionModel
				.findOne({
					reactableModel: this.modelName,
					reactableId,
					user: userId,
					reaction,
				})
				.session(session);
			if (existingReaction) {
				await existingReaction.deleteOne();
				return { removed: true };
			} else {
				const createdReaction = new reactionModel({
					reactableId,
					reactableModel: this.modelName,
					user: userId,
					reaction,
					meta,
				});
				await createdReaction.save({ session });

				return { createdReaction };
			}
		} else {
			const existingReaction = await reactionModel
				.findOne({
					reactableModel: this.modelName,
					reactableId,
					user: userId,
				})
				.session(session);

			if (existingReaction && existingReaction.reaction === reaction) {
				await reactionModel.deleteOne(
					{ _id: existingReaction._id },
					{
						...(session ? { session } : {}),
					},
				);
				return { removed: true };
			} else {
				const res = await reactionModel
					.findOneAndUpdate(
						{
							reactableModel: this.modelName,
							reactableId,
							user: userId,
						},
						{ $set: { reaction, meta, updatedAt: new Date() } },
						{
							upsert: true,
							new: true,
							setDefaultsOnInsert: true,
							session,
						},
					)
					.lean();
				return { createdOrUpdated: res };
			}
		}
	};

	/**
	 * getReactionCounts: returns counts grouped by reaction type for a reactable
	 * e.g. { like: 12, love: 3, haha: 1 }
	 */
	schema.statics.getReactionCounts = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		opOpts?: { session?: ClientSession },
	) {
		const session = opOpts?.session ?? null;

		console.log('this.modelName: ', this.modelName);
		const reactionModel = createReactionModel(pluginOpts);
		const pipeline = [
			{ $match: { reactableModel: this.modelName, reactableId } },
			{ $group: { _id: '$reaction', count: { $sum: 1 } } },
		];
		const rows = await reactionModel
			.aggregate(pipeline, { session })
			.exec();
		const result: Record<string, number> = {};
		rows.forEach((r: any) => {
			result[r._id] = r.count;
		});
		return result;
	};

	/**
	 * getUserReaction: returns user's reaction for a reactable (string) or null
	 */
	schema.statics.getUserReactions = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		userId: Types.ObjectId | string,
		opOpts: {
			session?: ClientSession;
			projection?: ProjectionType<HydratedDocument<ReactionDoc>>;
			lean?: boolean;
			limit?: number;
			skip?: number;
		} = {},
	) {
		const session = opOpts?.session ?? null;
		let query = reactionModel
			.find(
				{
					reactableModel: this.modelName,
					reactableId,
					user: userId,
				},
				opOpts.projection ?? {},
			)
			.sort({ createdAt: -1 })
			.skip(opOpts.skip ?? 0)
			.limit(opOpts.limit ?? 50)
			.session(session);

		if (opOpts.lean) query = (query as any).lean();

		return await query;
	};

	/**
	 * listReactors: list users who reacted with optional reaction filter, paginated
	 */
	schema.statics.listReactors = async function (
		reactableId: Types.ObjectId | string,
		// reactableModel: string,
		opts: {
			reaction?: string;
			projection?: ProjectionType<HydratedDocument<ReactionDoc>>;
			lean?: boolean;
			limit?: number;
			skip?: number;
			session?: ClientSession;
		} = {},
	) {
		const session = opts?.session ?? null;

		const filter: any = { reactableModel: this.modelName, reactableId };
		if (opts.reaction) {
			filter.reaction = normalizeReaction(opts.reaction, pluginOpts);
		}
		let query = reactionModel
			.find(filter, opts.projection ?? {})
			.sort({
				createdAt: -1,
			})
			.skip(opts.skip ?? 0)
			.limit(opts.limit ?? 50)
			.session(session);

		if (opts.lean) query = (query as any).lean();

		return await query;
	};

	// instance helpers (document methods)
	schema.methods.react = function (
		userId: Types.ObjectId | string,
		reaction: string,
		meta?: Record<string, any>,
	) {
		return (this.constructor as any).react(
			this._id,
			//@ts-expect-error
			this.constructor.modelName,
			userId,
			reaction,
			meta,
		);
	};

	schema.methods.unreact = function (
		userId: Types.ObjectId | string,
		reaction?: string,
	) {
		return (this.constructor as any).unreact(
			this._id,
			//@ts-expect-error
			this.constructor.modelName,
			userId,
			reaction,
		);
	};
}
