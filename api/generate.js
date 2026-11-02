export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model = 'gemini-3.1-flash-lite', expectedCategories = [] } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum disetel di Environment Variables Vercel.' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt masalah tidak boleh kosong.' });
  }

  try {
    // Pastikan jika 6M, wajib 6 kategori
    const default6M = [
      "Man (Tenaga Kerja)",
      "Machine (Mesin)",
      "Method (Metode)",
      "Material (Bahan Baku)",
      "Measurement (Pengukuran)",
      "Milieu / Environment (Lingkungan)"
    ];

    const targetCategories = (expectedCategories && expectedCategories.length >= 6)
      ? expectedCategories
      : (expectedCategories && expectedCategories.length > 0 ? expectedCategories : default6M);

    const catListStr = targetCategories.map(c => `"${c}"`).join(', ');

    const systemPrompt = `You are a Senior Root Cause Analysis (RCA) & Six Sigma Black Belt Facilitator.
Tugas Anda adalah membedah laporan insiden/masalah secara MENDALAM, KOMPREHENSIF, dan TEKNIKAL.

MASALAH YANG DIANALISIS:
"${prompt}"

ATURAN KATEGORI & CABANG (WAJIB DIPATUHI):
1. Anda WAJIB menghasilkan TEPAT ${targetCategories.length} KATEGORI berikut tanpa dikurangi: [${catListStr}].
2. Untuk SETIAP kategori, berikan minimal 2 akar masalah (Cause).
3. Setiap Cause WAJIB memiliki rincian Sub-Cause (anak cabang tulang) dan Action Plan konkret:
   - "text": Judul akar masalah tingkat 1 yang padat dan jelas (maksimal 5-8 kata).
   - "subCause": Penjelasan teknis akar masalah tingkat lanjutan/detail kronologi (1-2 kalimat).
   - "actionPlan": Rekomendasi tindakan perbaikan terukur dan realistis.

FORMAT KELUARAN:
Kembalikan HANYA format JSON valid tanpa format markdown (tanpa backtick \`\`\`json).
Format yang diharapkan:
{
  "problem": "Judul masalah utama yang tegas",
  "conclusion": "Kesimpulan analisis akar masalah secara eksekutif.",
  "categories": [
    {
      "name": "Nama Kategori Sesuai Daftar",
      "causes": [
        {
          "text": "Akar Masalah Utama",
          "subCause": "Detail akar masalah tingkat lanjutan",
          "actionPlan": "Rencana tindakan perbaikan"
        }
      ]
    }
  ]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.6,
            responseMimeType: 'application/json'
          }
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