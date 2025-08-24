
<div align="center">

  <h1>mongoose-reactions</h1>

  <p>
	<a href="#features">features</a> •
	<a href="#Installation">Installation</a> •
	<a href="#Usage">Usage</a>
  </p>


  <p>
    <a href="https://github.com/Silent-Watcher/mongoose-reactions/blob/master/LICENSE">
      <img src="https://img.shields.io/github/license/Silent-Watcher/mongoose-reactions?color=#2fb64e"license">
    </a>
  </p>

</div>



**Mongoose‑Reactions** is a TypeScript‑first Mongoose plugin that adds polymorphic reaction support (like 👍, ❤️, 😂, or any custom emoji) to any Mongoose model.

> It works with both single‑reaction‑per‑user and multi‑reaction‑per‑user modes, offers a full‑featured static and instance API, and is fully typed.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Static API](#static-api)
- [Instance API](#instance-api)
- [Advanced Usage](#advanced-usage)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| ✅ | Feature |
|---|---------|
| ✅ | **Polymorphic reactions** – attach reactions to any model (posts, comments, users, etc.). |
| ✅ | **Single‑ or multi‑reaction per user** – choose whether a user can have only one reaction per reactable or many different reactions. |
| ✅ | **Whitelist & case‑insensitivity** – restrict allowed reaction types and optionally treat them case‑insensitively. |
| ✅ | **Typed API** – full TypeScript definitions for all static and instance methods. |
| ✅ | **Atomic upserts** – uses MongoDB unique indexes to guarantee consistency under concurrency. |
| ✅ | **Aggregation helpers** – quickly get reaction counts per type. |
| ✅ | **Session support** – all operations accept an optional `ClientSession` for transaction safety. |
| ✅ | **Custom metadata** – store arbitrary extra data (`meta`) with each reaction. |

---

## Installation

```bash
# Using npm
npm install mongoose-reactions

# Using yarn
yarn add mongoose-reactions

# Using pnpm
pnpm add mongoose-reactions
```

> **Peer dependency:** `mongoose@^8.18.0`. Make sure Mongoose is installed in your project.

---

## Quick Start

```ts
import mongoose from 'mongoose';
import { reactionsPlugin } from 'mongoose-reactions';

// Define a simple Post schema
const postSchema = new mongoose.Schema({
  title: String,
  content: String,
});

// Apply the plugin (default options)
postSchema.plugin(reactionsPlugin);

const Post = mongoose.model('Post', postSchema);

// --- Using the static API ---
async function demo() {
  const post = await Post.create({ title: 'Hello', content: 'World' });

  // User 1 likes the post
  await Post.react(post._id, '60c72b2f9f1b2c001c8d4e9a', 'like');

  // User 2 loves the post with extra meta
  await Post.react(post._id, '60c72b2f9f1b2c001c8d4e9b', 'love', { source: 'mobile' });

  // Toggle a reaction (remove if exists, add otherwise)
  await Post.toggleReaction(post._id, '60c72b2f9f1b2c001c8d4e9a', 'like');

  // Get counts
  const counts = await Post.getReactionCounts(post._id);
  console.log(counts); // { like: 0, love: 1 }

  // List all reactors for a specific reaction
  const lovers = await Post.listReactors(post._id, { reaction: 'love' });
  console.log(lovers);
}
```

---

## Configuration Options

When applying the plugin you can pass a `PluginOptions` object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowMultipleReactionsPerUser` | `boolean` | `false` | If `true`, a user may store many different reactions on the same reactable. |
| `reactionTypes` | `string[]` | `undefined` | Whitelist of allowed reaction identifiers (e.g. `['like', 'love', 'haha']`). |
| `reactionTypesCaseInsensitive` | `boolean` | `true` | Convert incoming reaction strings to lower‑case before validation. |
| `reactionModelName` | `string` | `'Reaction'` | Name of the internal Mongoose model that stores reactions. |

```ts
// Example: enable multiple reactions and whitelist
postSchema.plugin(reactionsPlugin, {
  allowMultipleReactionsPerUser: true,
  reactionTypes: ['like', 'love', 'haha', 'wow'],
  reactionTypesCaseInsensitive: false,
});
```

---

## Static API

| Method | Signature | Description |
|--------|-----------|-------------|
| `react` | `react(reactableId, userId, reaction, meta?, opOpts?)` | Add a reaction (or update it in single‑mode). Returns the created/updated document. |
| `unreact` | `unreact(reactableId, userId, reaction?, opOpts?)` | Remove a specific reaction (if provided) or all reactions of a user on the reactable. Returns number of deleted docs. |
| `toggleReaction` | `toggleReaction(reactableId, userId, reaction, meta?, opOpts?)` | Flip the presence of a reaction. Returns `{removed:true}` or the created/updated document. |
| `getReactionCounts` | `getReactionCounts(reactableId, opOpts?)` | Returns an object mapping reaction types → counts. |
| `getUserReactions` | `getUserReactions(reactableId, userId, options?)` | Fetch reactions a user has made on a reactable (array of docs). |
| `listReactors` | `listReactors(reactableId, opts?)` | Paginated list of all reaction documents for a reactable, optionally filtered by reaction type. |

All static methods accept an optional `opOpts` object with a `session` field to run inside a MongoDB transaction.

---

## Instance API

When the plugin is applied, each document gains the following methods:

| Method | Signature | Description |
|--------|-----------|-------------|
| `react` | `(userId, reaction, meta?)` | Shortcut to the static `react` using the document’s `_id`. |
| `unreact` | `(userId, reaction?)` | Shortcut to the static `unreact` for this document. |

Example:

```ts
const post = await Post.findById(id);
await post.react('60c72b2f9f1b2c001c8d4e9a', 'like');
await post.unreact('60c72b2f9f1b2c001c8d4e9a');
```

---

## Advanced Usage

### Transactions

```ts
const session = await mongoose.startSession();
session.startTransaction();

try {
  await Post.react(postId, userId, 'like', undefined, { session });
  await SomeOtherModel.updateOne(..., { session });
  await session.commitTransaction();
} catch (e) {
  await session.abortTransaction();
  throw e;
} finally {
  session.endSession();
}
```

### Custom Reaction Model Name

If you need a differently named collection:

```ts
postSchema.plugin(reactionsPlugin, { reactionModelName: 'PostReaction' });
```

The collection will be `postreactions` (Mongoose pluralizes automatically).

### Adding Extra Fields

You can extend the internal reaction schema via Mongoose discriminators or by creating a separate model that references the generated one. The plugin stores only the core fields (`reactableId`, `reactableModel`, `user`, `reaction`, `meta`, timestamps).

---

## Contributing

1. **Fork** the repository.
2. **Create a branch** for your feature or bugfix.
3. **Write tests** for any new functionality.
4. **Run lint & format**: `npm run lint` and `npm run prelint`.
5. **Commit** using Conventional Commits (`npm run commit`).
6. **Open a Pull Request** – the CI will run linting, tests, and coverage checks automatically.

Please read the full [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on coding style, commit messages, and issue reporting.

---

## License

MIT © 2025 Ali Nazari

See the full license text in the [LICENSE](./LICENSE) file.

---

## Contact

If you encounter bugs or have feature ideas, feel free to open an issue or contact the maintainer at **backendwithali@gmail.com**.

---

*Happy reacting!*

---

<div align="center">
  <p>
    <sub>Built with ❤️ by <a href="https://github.com/Silent-Watcher" target="_blank">Ali Nazari</a>, for developers.</sub>
  </p>
  <p>
    <a href="https://github.com/Silent-Watcher/mongoose-reactions">⭐ Star us on GitHub</a> •
    <a href="https://www.linkedin.com/in/alitte/">🐦 Follow on Linkedin</a>
  </p>
</div>
