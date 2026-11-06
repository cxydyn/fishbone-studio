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

    // PROMPT UNTUK FISHBONE (6M)
    if (tool === 'fishbone') {
      const default6M = ["Man (Tenaga Kerja)", "Machine (Mesin)", "Method (Metode)", "Material (Bahan Baku)", "Measurement (Pengukuran)", "Milieu / Environment (Lingkungan)"];
      const targetCategories = (expectedCategories && expectedCategories.length >= 6) ? expectedCategories : (expectedCategories && expectedCategories.length > 0 ? expectedCategories : default6M);
      const catListStr = targetCategories.map(c => `"${c}"`).join(', ');

      systemPrompt = `Anda adalah Senior RCA Facilitator. Analisis masalah: "${prompt}".
1. Hasilkan TEPAT ${targetCategories.length} KATEGORI ini: [${catListStr}].
2. Setiap kategori minimal 2 Cause.
3. Setiap Cause WAJIB memiliki "subCause" dan "actionPlan".
Kembalikan JSON:
{
  "problem": "Masalah utama (singkat)",
  "conclusion": "Kesimpulan eksekutif singkat",
  "categories": [ { "name": "Nama Kategori", "causes": [ { "text": "Penyebab utama", "subCause": "Mekanisme detail kegagalan", "actionPlan": "Rencana perbaikan konkret" } ] } ]
}`;
    } 
    
    // PROMPT UNTUK 5 WHYS
    else if (tool === '5whys') {
      systemPrompt = `Anda adalah Senior RCA Facilitator. Analisis masalah ini dengan teknik 5 Whys: "${prompt}".
Lakukan investigasi logis berurutan dari akibat hingga ke akar masalah sistemik.
Kembalikan HANYA JSON:
{
  "problem": "Judul Masalah (Ringkas)",
  "whys": [
    "Why 1: [Alasan langsung terjadinya masalah]",
    "Why 2: [Alasan mengapa Why 1 terjadi]",
    "Why 3: [Alasan mengapa Why 2 terjadi]",
    "Why 4: [Alasan mengapa Why 3 terjadi]",
    "Why 5: [Akar masalah sistemik/proses]"
  ],
  "rootCause": "Kesimpulan akar masalah yang sebenarnya",
  "actionPlan": "Rencana tindakan perbaikan dan pencegahan (CAPA) yang komprehensif"
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
    },
    {
      "id": "node-2",
      "text": "Human Error",
      "type": "basic"
    }
  ]
}`;
    }

    // TAMBAHAN INSTRUKSI REFINEMENT ITERATIF
    if (existingData && additionalFacts.trim()) {
      systemPrompt += `\n\n--- PENTING: REFINEMENT BERDASARKAN FAKTA BARU ---
DATA DIAGRAM EKSISTING SAAT INI:
${JSON.stringify(existingData)}

FAKTA/BUKTI BARU DARI DISKUSI TIM:
"${additionalFacts}"

TUGAS ANDA: Perbarui struktur JSON EKSISTING di atas dengan mengintegrasikan FAKTA BARU. 
JANGAN merombak total struktur eksisting jika tidak perlu. Pertahankan akar masalah yang masih valid.
Cukup sesuaikan, tambahkan cabang penyebab/event baru, atau perbaiki hipotesis lama yang ternyata bertentangan dengan fakta baru. 
Kembalikan format JSON yang sama persis seperti aslinya.`;
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
      return res.status(response.status).json({ error: `Gemini API Error: ${errDetail}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return res.status(200).json({ result: rawText });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}