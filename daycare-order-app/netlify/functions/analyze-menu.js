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

이미지 구조 안내:
- 열(Column): 왼쪽부터 월, 화, 수, 목, 금요일 순서 (5열)
- 주차별 행(Row) 패턴: 각 주차마다 3개 행으로 구성
  · 첫 번째 행: 날짜/영양정보 및 오전간식
  · 두 번째 행: 중식 (메뉴 리스트)
  · 세 번째 행: 오후간식 (음료 포함 여부 확인)
- 행 순서가 달라질 수 있으므로 '오전간식', '중식', '오후간식' 키워드로 행을 구분하세요
- 마지막 주차는 월말로 인해 날짜가 적을 수 있으니 예외 처리 필요
- 주말(토·일), 공휴일 제외, 평일만 추출

각 날짜(평일만)의 오전간식·중식·오후간식 메뉴를 모두 추출하고, 필요한 주요 식재료를 추출해주세요.

규칙:
- 날짜 형식: "${year}-${mm}-DD" (예: "${year}-${mm}-01")
- 식재료: 채소, 고기, 생선, 해산물, 두부류, 버섯류, 달걀 등 주요 재료 포함
- 된장·고추장·간장 등 특수 양념은 포함, 소금·설탕·기름·후춧가루 등 기본 양념은 제외
- 같은 날 중복 재료는 한 번만
- 재료명은 단순하게 (예: "돼지고기", "감자", "표고버섯", "쑥갓")
- menu 배열에 오전간식·중식·오후간식을 모두 포함

아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "days": [
    {
      "date": "${year}-${mm}-01",
      "menu": ["오전간식: 메뉴명1", "중식: 메뉴명2, 메뉴명3", "오후간식: 메뉴명4"],
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
