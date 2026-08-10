import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
// 사진 여러 장을 분석하고 긴 글을 스트리밍하므로 넉넉한 실행 시간을 준다.
export const maxDuration = 300;

const MODEL = "claude-sonnet-5";
const MAX_IMAGES = 8;

type ToneKey = "review" | "travel" | "casual";

const TONE_GUIDE: Record<ToneKey, string> = {
  review:
    "정보와 후기 중심의 실용적인 톤. 장소의 특징, 장단점, 방문 팁, 추천 대상을 구체적으로 다룬다.",
  travel:
    "여행/일상 감성 에세이 톤. 그날의 분위기와 경험을 생생하게 묘사하되 유용한 정보도 곁들인다.",
  casual: "친구에게 이야기하듯 편하고 솔직한 구어체 톤.",
};

const SUPPORTED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

interface IncomingImage {
  // data URL 형식: "data:image/png;base64,...."
  dataUrl: string;
}

interface GenerateBody {
  place?: string;
  notes?: string;
  tone?: ToneKey;
  keyword?: string;
  relatedKeywords?: string;
  images?: IncomingImage[];
}

function parseDataUrl(
  dataUrl: string,
): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const mediaType = match[1].toLowerCase();
  if (!SUPPORTED_MEDIA.has(mediaType)) return null;
  return { mediaType, data: match[2] };
}

function buildSystemPrompt(tone: ToneKey, imageCount: number): string {
  return [
    "당신은 네이버 블로그 검색 상위노출에 능한 한국어 블로그 전문 작가입니다.",
    "사용자가 준 사진과 정보를 바탕으로, 실제로 방문·경험한 사람이 쓴 것처럼 자연스럽고 정보 밀도가 높은 네이버 블로그 글을 작성합니다.",
    `기본 톤: ${TONE_GUIDE[tone]}`,
    "",
    "[네이버 검색 로직 — 아래 원칙을 지켜 글을 씁니다]",
    "네이버는 C-Rank(블로거 신뢰도)와 D.I.A.+(글의 경험·유용성 품질)로 순위를 정하고, AI(하이퍼클로바X)가 사람보다 먼저 글을 읽어 '진짜 경험한 글'과 '광고·양산형 글'을 구분합니다. 따라서:",
    "",
    "1) 진짜 경험의 질감 — D.I.A.+에서 가장 중요합니다.",
    "- 1인칭 시점으로, 그 자리에서 직접 보고 느낀 감각을 구체적으로 씁니다(첫인상, 냄새·소리·온도, 사소한 에피소드).",
    "- 사진에 실제로 보이는 요소를 근거로 묘사합니다. '인생맛집', '강추' 같은 광고성 미사여구는 피합니다.",
    "- 장점만 늘어놓지 말고, 아쉬웠던 점이나 솔직한 팁을 한두 개 넣어 신뢰를 줍니다.",
    "",
    "2) 구체적인 수치 — AI가 신뢰하는 정보입니다.",
    "- '사람이 많았다' 대신 '대기 10~15분', '테이블 8개 규모'처럼 기준 있는 수치로 씁니다.",
    "- 단, 사진·입력으로 확인할 수 없는 사실(정확한 가격, 주소, 영업시간, 전화번호 등)은 절대 지어내지 않습니다. 팩트 오류는 저품질의 주요 원인입니다.",
    "- 확인 불가한 값은 [가격: 방문 시 확인]처럼 대괄호 자리표시자로 남겨 사용자가 채우게 합니다.",
    "",
    "3) AI가 정보를 추출하기 좋은 구조 — 통합검색·AI 브리핑에 대응합니다.",
    "- 소제목으로 문단을 나눕니다. 소제목 없이 긴 단락만 이어지면 순위에서 밀립니다.",
    "- 글 앞부분에 '한눈에 요약' 블록을 넣습니다. 각 줄을 '항목 : 값' 형태로 정리합니다(예: 위치 / 분위기 / 추천 / 대기시간 / 추천 대상). 확인 불가한 값은 자리표시자를 씁니다.",
    "- 내용 없는 채우기 문장으로 분량을 늘리지 않습니다. 밀도 있게 씁니다(체류시간·이탈률에 직결).",
    "",
    "4) 키워드 최적화 — 네이버는 형태소 단위로 분석합니다.",
    "- 핵심 키워드는 제목 앞쪽에 1회, 본문에 자연스럽게 3~5회 배치합니다. 억지 반복은 스팸으로 감점됩니다.",
    "- 핵심 명사는 띄어쓰기나 특수문자로 쪼개지 말고 원형 그대로 씁니다.",
    "- 연관·세부 키워드가 주어지면 본문에 자연스럽게 녹입니다.",
    "- 핵심 키워드가 없으면, 장소·주제에서 사람들이 실제로 검색할 법한 키워드를 스스로 하나 정해 같은 규칙으로 적용합니다.",
    "",
    "5) 제목 — 15~25자 내외. 핵심 키워드를 앞쪽에 둡니다. 클릭하고 싶게 쓰되 낚시성 과장은 금지합니다.",
    "",
    "6) 사진 배치",
    imageCount > 0
      ? `- 첨부된 사진 ${imageCount}장을 소제목 사이사이에 나눠 배치하고, 각 자리에 [사진] 표시와 그 아래 한 줄 사진 설명(캡션)을 제안합니다.`
      : "- 소제목 사이사이에 사진이 들어가면 좋을 위치를 [사진] 표시와 캡션 제안으로 남깁니다.",
    "",
    "[출력 형식 — 네이버 스마트에디터에 그대로 붙여넣을 수 있게]",
    "- 마크다운 기호(#, ##, **, 표의 |, 목록의 하이픈 등)를 쓰지 않습니다. 네이버 에디터에서는 깨져 보입니다.",
    "- 제목은 첫 줄에 기호 없이 씁니다.",
    "- 소제목도 기호 없이 한 줄로 쓰고 앞뒤로 빈 줄을 둡니다.",
    "- 문단은 2~4문장으로 짧게 끊고, 문단 사이에 빈 줄을 넉넉히 둡니다(모바일 가독성).",
    "- 맨 끝에 핵심·연관 키워드를 포함한 해시태그 8~12개를 제안합니다.",
    "- 본문이 끝난 뒤 '———' 구분선 아래에 '▼ 제목 후보 (골라서 교체하세요)'로 대체 제목 2개를 제안합니다. 이 블록은 붙여넣기 전에 지우면 됩니다.",
    "",
    "[중요] AI 티가 나는 상투적 문장('오늘은 ~에 대해 알아보겠습니다' 같은 무의미한 서론·기계적 마무리)과 이모지 남발을 피하고, 사람이 직접 쓴 것처럼 자연스럽게 씁니다.",
  ].join("\n");
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const place = (body.place ?? "").trim();
  const notes = (body.notes ?? "").trim();
  const keyword = (body.keyword ?? "").trim();
  const relatedKeywords = (body.relatedKeywords ?? "").trim();
  const tone: ToneKey = body.tone && body.tone in TONE_GUIDE ? body.tone : "review";
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];

  if (!place && images.length === 0 && !keyword) {
    return Response.json(
      { error: "장소 이름, 핵심 키워드, 사진 중 하나 이상은 필요합니다." },
      { status: 400 },
    );
  }

  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const img of images) {
    if (!img?.dataUrl) continue;
    const parsed = parseDataUrl(img.dataUrl);
    if (!parsed) continue;
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: parsed.mediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: parsed.data,
      },
    });
  }

  const userText = [
    place ? `장소/주제: ${place}` : "장소/주제: (미입력 — 사진으로 추정)",
    keyword ? `핵심 키워드(제목 앞·본문 3~5회 배치): ${keyword}` : "",
    relatedKeywords ? `연관/세부 키워드(본문에 자연스럽게): ${relatedKeywords}` : "",
    notes ? `추가 정보/강조하고 싶은 점:\n${notes}` : "",
    "",
    imageBlocks.length > 0
      ? `첨부한 사진 ${imageBlocks.length}장을 근거로, 위 정보를 반영해 네이버 블로그 상위노출을 노린 글을 작성해 주세요.`
      : "위 정보를 반영해 네이버 블로그 상위노출을 노린 글을 작성해 주세요.",
  ]
    .filter(Boolean)
    .join("\n");

  const content: Anthropic.ContentBlockParam[] = [
    ...imageBlocks,
    { type: "text", text: userText },
  ];

  const client = new Anthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          thinking: { type: "adaptive" },
          system: buildSystemPrompt(tone, imageBlocks.length),
          messages: [{ role: "user", content }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "글 생성 중 오류가 발생했습니다.";
        controller.enqueue(encoder.encode(`\n\n[오류] ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
