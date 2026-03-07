module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { imageBase64, mediaType, year, month } = req.body;

    const mm = String(month).padStart(2, '0');
    const prompt = `이 이미지는 ${year}년 ${month}월 어린이집 급식 식단표입니다.

열 순서: 날짜 | 열량/단백질 | 오전간식 | 중식 | 오후간식
추출 대상: 오전간식 + 중식만 (오후간식 열 무시)
제외 행: 주말(토·일), 공휴일

각 날짜의 오전간식·중식 메뉴명과 주요 식재료를 추출하세요.
식재료: 채소·육류·생선·해산물·두부·버섯·달걀·된장·고추장·간장 포함 / 소금·설탕·식용유·밀가루 제외 / 중복 제외 / 간결하게

JSON으로만 응답:
{
  "days": [
    {
      "date": "${year}-${mm}-03",
      "menu": ["근대무죽", "쌀밥", "미나리어묵국", "닭고기짜장볶음", "애호박나물", "깍두기"],
      "ingredients": ["근대", "무", "미나리", "어묵", "닭고기", "애호박"]
    }
  ]
}`;

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    const parts = data.candidates[0].content.parts;
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
    const m1 = text.match(/```json\s*([\s\S]*?)\s*```/);
    const m1b = text.match(/```json\s*([\s\S]*)/);
    const m2 = text.match(/```\s*(\{[\s\S]*?\})\s*```/);
    const m3 = text.match(/\{[\s\S]*\}/);
    const jsonStr = (m1 && m1[1]) || (m1b && m1b[1].trim()) || (m2 && m2[1]) || (m3 && m3[0]) || text.trim();
    const result = JSON.parse(jsonStr);

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
