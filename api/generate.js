export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model = 'gemini-3.1-flash-lite' } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum disetel di Environment Variables Vercel.' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt masalah tidak boleh kosong.' });
  }

  try {
    const systemPrompt = `Anda adalah konsultan analisis akar masalah (Root Cause Analysis). Analisis masalah berikut: "${prompt}".

Buat diagram Fishbone beserta draft Corrective Action Plan. Setiap penyebab (cause) wajib dilengkapi dengan "subCause" (detail/akar masalah lebih dalam) dan "actionPlan" (rencana tindakan korektif awal yang dapat dirasionalisasi oleh manusia).

Kembalikan HANYA format JSON valid tanpa format markdown, tanpa prefix/suffix.
Format JSON yang diharapkan:
{
  "name": "Analisis AI",
  "problem": "${prompt}",
  "categories": [
    {
      "name": "Nama Kategori (misal: Man, Machine, Method, Material, dll)",
      "causes": [
        {
          "text": "Penyebab utama tingkat 1 yang ringkas (untuk ditampilkan di tulang diagram)",
          "subCause": "Detail penjabaran atau akar masalah spesifik tingkat lanjutan",
          "actionPlan": "Draft rekomendasi tindakan perbaikan konkret dan terukur"
        }
      ]
    }
  ]
}
Catatan: Berikan 4 hingga 6 kategori relevan, dan 2 hingga 3 penyebab lengkap per kategori.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.7,
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