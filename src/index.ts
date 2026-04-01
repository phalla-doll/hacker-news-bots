interface HNPost {
	id: number;
	title: string;
	score: number;
	url?: string;
	by: string;
	time: number;
}

async function githubApi<T = unknown>(
	token: string,
	repo: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "hacker-news-bots",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${err}`);
	}
	return res.json() as Promise<T>;
}

async function createDigestPR(
	env: Env,
	posts: HNPost[],
) {
	const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = env;
	if (!token || !repo) {
		console.warn("GITHUB_TOKEN or GITHUB_REPO not configured, skipping PR creation");
		return;
	}

	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const timeStr = now.toISOString().slice(11, 16).replace(":", "");
	const branchName = `digest/${dateStr}-${timeStr}`;

	const fileContent = [
		`# HN Digest - ${dateStr}`,
		"",
		`Generated at ${now.toISOString()}`,
		"",
		...posts.map(
			(p) =>
				`- **${p.title}** (score: ${p.score})\n  https://news.ycombinator.com/item?id=${p.id}`,
		),
		"",
	].join("\n");

	const encodedContent = btoa(fileContent);

	const refData = await githubApi<{ object: { sha: string } }>(token, repo, "GET", "/git/ref/heads/main");
	const mainSha = refData.object.sha;

	await githubApi(token, repo, "POST", "/git/refs", {
		ref: `refs/heads/${branchName}`,
		sha: mainSha,
	});

	await githubApi(token, repo, "PUT", `/contents/digests/${dateStr}.md`, {
		message: `digest: ${dateStr} (${posts.length} posts)`,
		content: encodedContent,
		branch: branchName,
	});

	const prTitle = `HN Digest - ${dateStr} ${timeStr}`;
	const prBody = posts
		.map((p) => `- **${p.title}** (score: ${p.score})`)
		.join("\n");

	const pr = await githubApi<{ html_url: string }>(token, repo, "POST", "/pulls", {
		title: prTitle,
		body: prBody,
		head: branchName,
		base: "main",
	});

	console.log(`Created digest PR: ${pr.html_url}`);
}

export default {
	async scheduled(event, env, ctx) {
		const BOT_TOKEN = env.BOT_TOKEN;
		const CHAT_ID = env.CHAT_ID;

		if (!BOT_TOKEN || !CHAT_ID) {
			console.error("Missing BOT_TOKEN or CHAT_ID");
			return;
		}

		try {
			const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
			const ids: number[] = await idsRes.json();

			const topIds = ids.slice(0, 20);

			const posts: HNPost[] = await Promise.all(
				topIds.map(id =>
					fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
						.then(res => res.json() as Promise<HNPost>)
				)
			);

			const keywords = ["ai", "react", "angular", "startup", "nextjs"];

			const filtered = posts.filter(p =>
				p?.title &&
				keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p.title)) &&
				p.score >= 50
			);

			const newPosts: HNPost[] = [];
			for (const post of filtered) {
				const exists = await env.HN_CACHE.get(`seen:${post.id}`);
				if (!exists) {
					newPosts.push(post);
					await env.HN_CACHE.put(`seen:${post.id}`, "1", { expirationTtl: 172800 });
				}
			}

			if (!newPosts.length) {
				console.log("No new posts to send");
				return;
			}

			const message =
				"🔥 Hacker News Digest\n\n" +
				newPosts
					.map(p => `• ${p.title}\nhttps://news.ycombinator.com/item?id=${p.id}`)
					.join("\n\n");

			const response = await fetch(
				`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: CHAT_ID,
						text: message
					})
				}
			);

			if (!response.ok) {
				const error = await response.text();
				console.error("Telegram API error:", error);
			} else {
				console.log(`Sent ${newPosts.length} posts to Telegram`);

				ctx.waitUntil(
					createDigestPR(env, newPosts).catch((err) => {
						console.error("Failed to create digest PR:", err);
					})
				);
			}
		} catch (error) {
			console.error("Error in scheduled task:", error);
		}
	},

	async fetch(req) {
		const url = new URL(req.url);
		url.pathname = "/cdn-cgi/handler/scheduled";
		url.searchParams.append("cron", "0 */3 * * *");
		return new Response(`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`);
	},
} satisfies ExportedHandler<Env>;
