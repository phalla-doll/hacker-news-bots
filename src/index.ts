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

			const posts = await Promise.all(
				topIds.map(id =>
					fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
						.then(res => res.json())
				)
			);

			const keywords = ["ai", "react", "angular", "startup"];

			const filtered = posts.filter(p =>
				p?.title &&
				keywords.some(k => p.title.toLowerCase().includes(k)) &&
				p.score >= 50
			);

			const newPosts = [];
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
