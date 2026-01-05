export async function onRequest(context) {
    const { request, env } = context;
    const { DB, PASSWORD, Storage } = env;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB 限制

    // 1. 回傳配置
    if (action === "config") {
        return new Response(JSON.stringify({
            hasPassword: !!PASSWORD,
            storageMode: Storage === "d1" ? "d1" : "local"
        }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. 驗證
    if (action === "login" && request.method === "POST") {
        const { password } = await request.json();
        if (password === PASSWORD) return new Response(JSON.stringify({ success: true }));
        return new Response(JSON.stringify({ success: false }), { status: 401 });
    }

    // 3. 測試連線
    if (action === "ping") {
        try {
            if (Storage === "d1") await DB.prepare("SELECT 1").run();
            return new Response(JSON.stringify({ status: "ok" }));
        } catch (e) {
            return new Response(JSON.stringify({ status: "error" }), { status: 500 });
        }
    }

    if (Storage === "d1") {
        // GET: 讀取 + 統計
        if (request.method === "GET") {
            try {
                const notesQuery = DB.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
                const statsQuery = DB.prepare("SELECT COUNT(*) as count, SUM(LENGTH(title) + LENGTH(content)) as size FROM notes").first();
                const [notesRes, statsRes] = await Promise.all([notesQuery, statsQuery]);
                
                return new Response(JSON.stringify({
                    notes: notesRes.results,
                    stats: {
                        count: statsRes.count || 0,
                        sizeBytes: statsRes.size || 0,
                        limitBytes: MAX_SIZE_BYTES
                    }
                }));
            } catch (e) {
                // 自動建表
                await DB.prepare(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
                return new Response(JSON.stringify({ notes: [], stats: { count: 0, sizeBytes: 0, limitBytes: MAX_SIZE_BYTES } }));
            }
        }

        // POST: 新增 (檢查容量)
        if (request.method === "POST") {
            const stats = await DB.prepare("SELECT SUM(LENGTH(title) + LENGTH(content)) as size FROM notes").first();
            const currentSize = stats.size || 0;

            if (currentSize >= MAX_SIZE_BYTES) {
                return new Response(JSON.stringify({ error: "Limit reached" }), { status: 403 });
            }

            const { title, content } = await request.json();
            await DB.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").bind(title, content).run();
            return new Response(JSON.stringify({ success: true }), { status: 201 });
        }

        // DELETE: 刪除
        if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            await DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
            return new Response(null, { status: 204 });
        }
    }

    return new Response("Not Handled", { status: 200 });
}

