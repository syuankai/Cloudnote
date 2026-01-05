export async function onRequest(context) {
    const { request, env } = context;
    const { DB, PASSWORD, Storage } = env; // 讀取 Cloudflare 面板變數
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    // 1. 取得配置資訊 (讓前端知道現在是什麼模式)
    if (action === "config") {
        return new Response(JSON.stringify({
            hasPassword: !!PASSWORD,
            storageMode: Storage === "d1" ? "d1" : "local"
        }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. 密碼驗證邏輯
    if (action === "login") {
        const { password } = await request.json();
        if (password === PASSWORD) {
            return new Response(JSON.stringify({ success: true }));
        }
        return new Response(JSON.stringify({ success: false }), { status: 401 });
    }

    // --- 以下為資料處理邏輯 ---
    // 如果是 Local 模式，後端僅作為 Ping 測試，不處理數據
    if (Storage !== "d1") {
        if (action === "ping") return new Response(JSON.stringify({ status: "local" }));
        return new Response("Storage is set to Local mode", { status: 200 });
    }

    // D1 模式邏輯
    if (action === "ping") {
        try {
            await DB.prepare("SELECT 1").run();
            return new Response(JSON.stringify({ status: "ok" }));
        } catch (e) {
            return new Response(JSON.stringify({ status: "error" }), { status: 500 });
        }
    }

    if (request.method === "GET") {
        try {
            const { results } = await DB.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
            return new Response(JSON.stringify(results));
        } catch (e) {
            await DB.prepare(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
            return new Response(JSON.stringify([]));
        }
    }

    if (request.method === "POST") {
        const { title, content } = await request.json();
        await DB.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").bind(title, content).run();
        return new Response(JSON.stringify({ success: true }));
    }

    if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        await DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
        return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
}

              
