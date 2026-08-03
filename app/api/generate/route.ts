import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
// 사진 여러 장을 분석하고 긴 글을 스트리밍하므로 넉넉한 실행 시간을 준다.
export const maxDuration = 300;

const MODEL = "claude-opus-5";
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

function buildSystemPrompt(tone: ToneKey): string {
  return [
    "당신은 한국어 블로그 글을 대신 작성해 주는 전문 에디터입니다.",
    "사용자가 준 사진과 장소 정보를 바탕으로, 실제로 방문해 본 사람처럼 자연스러운 블로그 글을 작성합니다.",
    "",
    "작성 규칙:",
    "- 반드시 한국어로 작성한다.",
    `- 톤: ${TONE_GUIDE[tone]}`,
    "- 사진에서 실제로 보이는 요소(메뉴, 인테리어, 풍경, 분위기 등)를 근거로 구체적으로 묘사한다.",
    "- 사진에 없는 사실(정확한 가격, 주소, 영업시간 등)은 지어내지 않는다. 확실하지 않은 정보는 '방문 전 확인 권장'처럼 표현한다.",
    "- 자연스러운 소제목으로 문단을 나누고, 마크다운(##, 목록 등)을 사용한다.",
    "- 매력적인 제목 한 줄을 맨 위에 '# 제목' 형태로 넣는다.",
    "- 마지막에 해시태그 5~8개를 제안한다.",
    "- 과장된 광고 문구나 남발되는 이모지는 피하고, 신뢰감 있게 쓴다.",
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
  const tone: ToneKey = body.tone && body.tone in TONE_GUIDE ? body.tone : "review";
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];

  if (!place && images.length === 0) {
    return Response.json(
      { error: "장소 이름이나 사진 중 하나 이상은 필요합니다." },
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
    place ? `장소: ${place}` : "장소: (미입력 — 사진으로 추정)",
    notes ? `추가 정보/강조하고 싶은 점:\n${notes}` : "",
    "",
    imageBlocks.length > 0
      ? `첨부한 사진 ${imageBlocks.length}장을 참고해서 위 장소에 대한 블로그 글을 작성해 주세요.`
      : "위 정보를 바탕으로 블로그 글을 작성해 주세요.",
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
          system: buildSystemPrompt(tone),
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
