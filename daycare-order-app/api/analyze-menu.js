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

[식단표 구조 - 매우 중요]
이 표는 다음과 같은 열(column) 구조를 가집니다:
  열1: 날짜 | 열2: 열량/단백질 | 열3: 오전간식 | 열4: 중식 | 열5: 오후간식(무시)

읽는 방법:
1. 한 행(row)씩 왼쪽→오른쪽으로 읽음
2. 열5(오후간식)는 완전히 무시할 것 - 추출 대상 아님
3. 오전간식(열3)과 중식(열4)만 추출
4. 주말(토·일)과 공휴일 행은 건너뜀

[추출 규칙]
날짜: "${year}-${mm}-DD" 형식
메뉴명:
- 오전간식과 중식 항목만 포함 (오후간식 제외)
- 이미지에서 명확하게 읽히는 텍스트만 그대로 적을 것
- 흐리거나 불확실한 글자는 절대 추측하거나 비슷한 다른 단어로 대체하지 말 것
- 읽을 수 없으면 그 항목은 아예 생략할 것 (잘못된 추측보다 생략이 낫다)
- 예: "달걀채소죽", "미나리어묵국", "근대무죽"
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
