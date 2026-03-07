module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { imageBase64, mediaType, year, month } = req.body;

    const mm = String(month).padStart(2, '0');
    const prompt = `이 이미지는 ${year}년 ${month}월 어린이집/유치원 급식 식단표입니다.

이미지에 적힌 텍스트를 한 글자씩 정확하게 읽어주세요. 흐리거나 작은 글씨도 최대한 정확히 판독하세요.

[식단표 구조 안내]
- 달력 형태 또는 표 형태로 구성됨
- 날짜별로 오전간식 / 중식(주식·국·반찬·김치·후식) / 오후간식 순서로 나열됨
- 오전간식, 중식, 오후간식 모두 빠짐없이 포함할 것
- 특히 오후간식(과일·음료·유제품·떡·빵 등)을 절대 빠뜨리지 말 것
- 주말(토·일)과 빨간 날(공휴일)은 제외

[추출 규칙]
날짜: "${year}-${mm}-DD" 형식 (예: "${year}-${mm}-03")
메뉴명: 오전간식·중식·오후간식 항목 모두 포함하여 이미지에 적힌 그대로 정확하게 (예: "달걀채소죽", "미나리어묵국", "닭고기짜장볶음", "고구마맛탕")
식재료: 아래 기준으로만 포함
  ✅ 포함: 채소류, 육류(돼지/소/닭/오리), 생선·해산물, 두부·콩류, 버섯류, 달걀, 된장·고추장·간장·참기름
  ❌ 제외: 소금, 설탕, 식용유, 후춧가루, 물, 밀가루, 전분 등 기본 조미료
  - 같은 날 중복 재료는 한 번만
  - 재료명은 간결하게 (예: "돼지고기" "감자" "두부" "표고버섯" "달걀")

아래 JSON 형식으로만 응답하세요:
{
  "days": [
    {
      "date": "${year}-${mm}-01",
      "menu": ["달걀채소죽", "쌀밥", "미나리어묵국", "닭고기짜장볶음", "깍두기"],
      "ingredients": ["달걀", "미나리", "어묵", "닭고기", "무"]
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
