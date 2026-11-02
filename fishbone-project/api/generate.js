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
    const systemPrompt = `Buat analisis Fishbone untuk masalah: "${prompt}". Kembalikan HANYA format JSON valid tanpa penjelasan, tanpa format markdown.\nFormat:\n{\n  "name": "Hasil AI",\n  "problem": "${prompt}",\n  "categories": [\n    {\n      "name": "Kategori",\n      "causes": ["Penyebab 1", "Penyebab 2"]\n    }\n  ]\n}`;

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