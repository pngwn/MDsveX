The slow part is not the query, it is how often it runs. The list view asks for the author of every row, one row at a time, so a page of 50 posts makes 51 round trips. Below is what I would change, in the order I would change it.

## What is happening

Each `Post` loads its `author` when the template first reads it. That is one `SELECT` per post:

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 50;
SELECT * FROM users WHERE id = 17;
SELECT * FROM users WHERE id = 4;
-- 48 more of these
```

The database answers each one in under a millisecond. The cost is the trip there and back, and the pool slot each trip holds.

## Three ways to fix it

1. **Join in the first query.** One round trip, and the simplest change.
2. **Batch the lookups.** Collect the ids, then ask once with `WHERE id IN (...)`.
3. **Cache the authors.** This only helps when the same few authors write most posts.

I would start with the first. It needs no new moving parts:

```ts
export async function list_posts(db: Database, limit = 50): Promise<PostRow[]> {
	return db.query<PostRow>(
		`SELECT p.id, p.title, p.created_at, u.id AS author_id, u.name AS author_name
		   FROM posts p
		   JOIN users u ON u.id = p.author_id
		  ORDER BY p.created_at DESC
		  LIMIT $1`,
		[limit]
	);
}
```

Batching is the better choice when the author is one of several relations, since a join for each of them multiplies the rows:

```ts
const ids = [...new Set(posts.map((post) => post.author_id))];
const authors = await db.query<User>('SELECT * FROM users WHERE id = ANY($1)', [ids]);
const by_id = new Map(authors.map((author) => [author.id, author]));

for (const post of posts) post.author = by_id.get(post.author_id) ?? null;
```

## How they compare

| approach | round trips | rows read | new code | when it fits |
| --- | ---: | ---: | --- | --- |
| as it is now | 51 | 100 | none | never |
| join | 1 | 50 | one query | one relation per row |
| batch | 2 | 50 to 100 | a small loader | several relations |
| cache | 1 to 51 | 50 to 100 | a cache and its expiry | few authors, many posts |

The counts are for a page of 50 posts. With the join, the page I measured went from **212 ms** to **19 ms** on a warm pool. Most of what is left is rendering.

## Things to check before you ship it

- The join needs an index on `posts.author_id`. Without one, the planner scans `posts` for each user.
- A deleted author turns an inner join into a missing post. Use `LEFT JOIN` if a post can outlive its author.
- If the list is paginated by offset, the sort needs a tiebreaker such as `p.id`, or rows move between pages.

> A test that counts queries is worth more here than a timing test. A timing test passes on a fast machine and fails on a slow one. A count of 1 is the same everywhere.

Something like this is enough:

```ts
test('the list makes one query', async () => {
	const db = counting(test_db());
	await list_posts(db);
	expect(db.count).toBe(1);
});
```

## If it is still slow

Look at these next, in this order:

1. The size of the rows. `SELECT *` on `posts` reads the body of every post, and the list shows only the title.
2. The render. 50 rows with a date formatter each can cost more than the query does.
3. The pool. If requests wait for a connection, a faster query only moves the queue.

Tell me which of the three relations the detail page loads and I can sketch the loader for it.
