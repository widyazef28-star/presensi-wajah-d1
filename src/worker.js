export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Ambil semua data wajah & riwayat absensi
    if (url.pathname === "/api/sync" && request.method === "GET") {
      const { results: users } = await env.DB.prepare(
        "SELECT id, name, role, descriptor FROM users"
      ).all();

      const { results: logs } = await env.DB.prepare(
        "SELECT * FROM attendance ORDER BY timestamp DESC LIMIT 100"
      ).all();

      const parsedUsers = users.map(u => ({
        ...u,
        descriptor: JSON.parse(u.descriptor)
      }));

      return Response.json({ users: parsedUsers, logs });
    }

    // 2. Simpan pendaftaran wajah baru
    if (url.pathname === "/api/users" && request.method === "POST") {
      const body = await request.json();
      if (!body.id || !body.name || !body.descriptor) {
        return Response.json({ error: "Data tidak lengkap" }, { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO users (id, name, role, descriptor) VALUES (?, ?, ?, ?)"
      )
        .bind(body.id, body.name, body.role || "-", JSON.stringify(body.descriptor))
        .run();

      return Response.json({ success: true });
    }

    // 3. Simpan riwayat presensi (anti-duplikasi 1 menit)
    if (url.pathname === "/api/attendance" && request.method === "POST") {
      const body = await request.json();

      const recent = await env.DB.prepare(
        "SELECT id FROM attendance WHERE user_id = ? AND timestamp >= datetime('now', '-1 minute')"
      )
        .bind(body.user_id)
        .first();

      if (recent) {
        return Response.json({ skipped: true, message: "Sudah tercatat baru saja" });
      }

      await env.DB.prepare(
        "INSERT INTO attendance (user_id, name, confidence) VALUES (?, ?, ?)"
      )
        .bind(body.user_id, body.name, body.confidence)
        .run();

      return Response.json({ success: true });
    }

    // 4. Hapus user
    if (url.pathname.startsWith("/api/users/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    // Tampilkan halaman HTML dari folder public
    return env.ASSETS.fetch(request);
  }
};
