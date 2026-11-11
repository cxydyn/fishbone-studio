export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model = 'gemini-3.1-flash-lite', tool = 'fishbone', expectedCategories = [], additionalFacts = '', existingData = null } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum disetel di Environment Variables Vercel.' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt masalah tidak boleh kosong.' });
  }

  try {
    let systemPrompt = '';

    // PROMPT GENERATE SEMUA TOOL SEKALIGUS (FISHBONE + 5WHYS + FTA)
    if (tool === 'all') {
      const default6M = ["Man (Tenaga Kerja)", "Machine (Mesin)", "Method (Metode)", "Material (Bahan Baku)", "Measurement (Pengukuran)", "Milieu / Environment (Lingkungan)"];
      const targetCategories = (expectedCategories && expectedCategories.length >= 6) ? expectedCategories : (expectedCategories && expectedCategories.length > 0 ? expectedCategories : default6M);
      const catListStr = targetCategories.map(c => `"${c}"`).join(', ');

      systemPrompt = `Anda adalah Senior RCA Facilitator. Analisis masalah: "${prompt}".
Tugas Anda adalah menghasilkan 3 jenis analisis sekaligus (Fishbone, 5 Whys, dan Fault Tree) secara komprehensif dan saling berkaitan.

1. FISHBONE (6M): Hasilkan TEPAT ${targetCategories.length} KATEGORI: [${catListStr}]. Tiap kategori min 2 Cause. Tiap Cause WAJIB punya "subCause" dan "actionPlan".
2. 5 WHYS: Buat 5 level "Why" yang berurutan, temukan "rootCause" dan "actionPlan".
3. FAULT TREE (FTA): Buat pohon kegagalan hierarkis. Node "top", "intermediate" (pakai "gate": "AND" atau "OR"), dan "basic". Min 3 level.

Kembalikan HANYA JSON murni dengan format persis seperti ini:
{
  "problem": "Masalah utama (singkat)",
  "fishbone": {
    "conclusion": "Kesimpulan eksekutif singkat",
    "categories": [ { "name": "Nama Kategori", "causes": [ { "text": "Penyebab utama", "subCause": "Mekanisme detail", "actionPlan": "Rencana perbaikan" } ] } ]
  },
  "fiveWhys": {
    "whys": [ "Why 1: ...", "Why 2: ...", "Why 3: ...", "Why 4: ...", "Why 5: ..." ],
    "rootCause": "Kesimpulan akar masalah",
    "actionPlan": "Rencana tindakan"
  },
  "fta": {
    "id": "root", "text": "Kegagalan Utama (Top Event)", "type": "top", "gate": "OR",
    "children": [
      {
        "id": "node-1", "text": "Subsistem A", "type": "intermediate", "gate": "AND",
        "children": [ { "id": "node-1-1", "text": "Komponen X Rusak", "type": "basic" } ]
      }
    ]
  }
}`;
    }
    // PROMPT UNTUK FISHBONE (6M)
    else if (tool === 'fishbone') {
      const default6M = ["Man (Tenaga Kerja)", "Machine (Mesin)", "Method (Metode)", "Material (Bahan Baku)", "Measurement (Pengukuran)", "Milieu / Environment (Lingkungan)"];
      const targetCategories = (expectedCategories && expectedCategories.length > 0) ? expectedCategories : default6M;
      const catListStr = targetCategories.map(c => `"${c}"`).join(', ');

      systemPrompt = `Anda adalah Ahli Root Cause Analysis. Analisis masalah: "${prompt}".
Gunakan TEPAT ${targetCategories.length} kategori berikut: [${catListStr}].
Kembalikan HANYA JSON murni (tanpa format markdown) dengan struktur:
{
  "problem": "Judul Masalah",
  "conclusion": "Kesimpulan Eksekutif",
  "categories": [
    {
      "name": "Nama Kategori",
      "causes": [
        { "text": "Penyebab Utama", "subCause": "Detail sub-cause", "actionPlan": "Rencana tindakan" }
      ]
    }
  ]
}`;
    }
    // PROMPT UNTUK FAULT TREE ANALYSIS (FTA)
    else if (tool === 'fta') {
      systemPrompt = `Anda adalah Ahli Fault Tree Analysis (FTA). Buat pohon kegagalan dari Top Event: "${prompt}".
Struktur berbentuk pohon (tree). "gate" bisa "OR" atau "AND". "type" bisa "top", "intermediate", atau "basic".
Event tingkat bawah (basic) harus merupakan penyebab dasar. Buat hierarki minimal 3 level.
Kembalikan HANYA JSON:
{
  "id": "root",
  "text": "Kegagalan Utama (Top Event)",
  "type": "top",
  "gate": "OR",
  "children": [
    {
      "id": "node-1",
      "text": "Kegagalan Subsistem A",
      "type": "intermediate",
      "gate": "AND",
      "children": [
        { "id": "node-1-1", "text": "Komponen X Rusak", "type": "basic" },
        { "id": "node-1-2", "text": "Sistem Backup Gagal", "type": "basic" }
      ]
    }
  ]
}`;
    }

    // TAMBAHAN INSTRUKSI REFINEMENT ITERATIF BERDASARKAN FAKTA BARU
    if (existingData && additionalFacts.trim()) {
      systemPrompt += `\n\n--- PENTING: REFINEMENT BERDASARKAN FAKTA BARU ---
DATA DIAGRAM EKSISTING SAAT INI:
${JSON.stringify(existingData)}

FAKTA/BUKTI BARU DARI DISKUSI TIM:
"${additionalFacts}"

TUGAS ANDA: Perbarui seluruh struktur JSON (termasuk Fishbone, 5 Whys, dan FTA) dengan mengintegrasikan FAKTA BARU di atas. 
JANGAN merombak total struktur eksisting jika tidak perlu. Pertahankan akar masalah yang masih valid.
Cukup sesuaikan, tambahkan cabang penyebab/event baru, atau perbaiki hipotesis lama yang ternyata bertentangan dengan fakta baru. 
Kembalikan format JSON gabungan yang sama persis seperti instruksi awal.`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        })
      }
    );

    if (!response.ok) {
      const errDetail = await response.text();
      
      // Deteksi Limit Limit/Quota (HTTP 429 Too Many Requests)
      if (response.status === 429) {
        return res.status(429).json({ error: 'Limit kuota/token API Gemini telah tercapai (Cooldown). Mohon tunggu beberapa menit sebelum mencoba men-generate kembali.' });
      }
      
      // Deteksi Server Sibuk (HTTP 503 Service Unavailable)
      if (response.status === 503) {
         return res.status(503).json({ error: 'Server AI Google sedang sibuk. Silakan coba lagi dalam beberapa saat.' });
      }
      
      // Bersihkan pesan error lain agar mudah dibaca
      let parsedError = errDetail;
      try {
         const jsonErr = JSON.parse(errDetail);
         if (jsonErr.error && jsonErr.error.message) parsedError = jsonErr.error.message;
      } catch(e) {}
      
      return res.status(response.status).json({ error: `Gagal diproses (Error ${response.status}): ${parsedError}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return res.status(200).json({ result: rawText });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}