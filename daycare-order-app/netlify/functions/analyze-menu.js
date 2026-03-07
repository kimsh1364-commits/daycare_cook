exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  try {
    const { imageBase64, mediaType, year, month } = JSON.parse(event.body);

    const mm = String(month).padStart(2, '0');
    const prompt = `이 이미지는 ${year}년 ${month}월 어린이집/유치원 식단표입니다.

각 날짜(평일만, 주말·공휴일 제외)의 메뉴를 분석하고, 각 메뉴에 필요한 주요 식재료를 추출해주세요.

규칙:
- 날짜 형식: "${year}-${mm}-DD" (예: "${year}-${mm}-01")
- 식재료: 채소, 고기, 생선, 해산물, 두부류, 버섯류 등 주요 재료만 포함
- 된장·고추장·간장 등 특수 양념은 포함, 소금·설탕·기름·후춧가루 등 기본 양념은 제외
- 같은 날 중복 재료는 한 번만
- 재료명은 단순하게 (예: "돼지고기", "감자", "표고버섯", "쑥갓")

아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "days": [
    {
      "date": "${year}-${mm}-01",
      "menu": ["메뉴명1", "메뉴명2"],
      "ingredients": ["재료1", "재료2", "재료3"]
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
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err }) };
    }

    const data = await response.json();
    const parts = data.candidates[0].content.parts;
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
    const m1 = text.match(/```json\s*([\s\S]*?)\s*```/);
    const m1b = text.match(/```json\s*([\s\S]*)/);
    const m2 = text.match(/```\s*(\{[\s\S]*?\})\s*```/);
    const m3 = text.match(/\{[\s\S]*\}/);
    const jsonStr = (m1 && m1[1]) || (m1b && m1b[1].trim()) || (m2 && m2[1]) || (m3 && m3[0]);
    if (!jsonStr) throw new Error('JSON을 찾을 수 없습니다: ' + text.substring(0, 300));
    const result = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
