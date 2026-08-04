"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type ToneKey = "review" | "travel" | "casual";

interface Photo {
  id: string;
  dataUrl: string;
  name: string;
}

const MAX_IMAGES = 8;
const MAX_FILE_MB = 8;

const TONE_OPTIONS: { value: ToneKey; label: string }[] = [
  { value: "review", label: "정보 / 리뷰 위주" },
  { value: "travel", label: "여행 / 감성 에세이" },
  { value: "casual", label: "친근한 구어체" },
];

// 톤별 권장 글자 수(공백 제외). 리뷰는 정보량, 여행 에세이는 서사 분량이 더
// 필요하고, 구어체는 짧아도 체류시간 확보가 가능하다.
const CHAR_TARGET: Record<ToneKey, number> = {
  review: 1000,
  travel: 1200,
  casual: 600,
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type SeoStatus = "ok" | "warn" | "info";

interface SeoMetric {
  label: string;
  value: string;
  status: SeoStatus;
  hint?: string;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

const TITLE_MARKER = "▼ 제목 후보";

// 생성된 글을 본문과 "제목 후보" 블록으로 분리한다.
function splitPostAndCandidates(text: string): {
  post: string;
  candidates: string[];
} {
  const markerIdx = text.indexOf(TITLE_MARKER);
  if (markerIdx === -1) return { post: text, candidates: [] };

  // 마커 바로 앞에 붙은 구분선(———, ---, ─── 등)은 본문에서 떼어낸다.
  const before = text.slice(0, markerIdx);
  const sep = before.match(/\n*[—\-─]{2,}\s*$/);
  const post = text.slice(0, markerIdx - (sep ? sep[0].length : 0)).replace(/\s+$/, "");

  const after = text.slice(markerIdx + TITLE_MARKER.length);
  const candidates = after
    .split("\n")
    // 앞의 번호(1. / 1)) · 불릿 · 따옴표를 제거
    .map((l) =>
      l
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/^\s*[-•▷▶*]\s*/, "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter((l) => l.length > 0 && !l.startsWith("("));

  return { post, candidates };
}

function buildCandidateBlock(candidates: string[]): string {
  return [
    "———",
    `${TITLE_MARKER} (골라서 교체하세요)`,
    ...candidates.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

// 생성된 글을 네이버 상위노출 기준으로 실시간 점검한다.
function analyzeSeo(
  text: string,
  keyword: string,
  related: string,
  tone: ToneKey,
): SeoMetric[] {
  const metrics: SeoMetric[] = [];
  const body = text.trim();
  if (!body) return metrics;

  const kw = keyword.trim();
  const title = (body.split("\n").find((l) => l.trim().length > 0) ?? "").trim();

  // 제목 길이
  metrics.push({
    label: "제목 길이",
    value: `${title.length}자`,
    status: title.length >= 15 && title.length <= 25 ? "ok" : "warn",
    hint:
      title.length < 15
        ? "15자 이상 권장"
        : title.length > 25
          ? "25자 이하 권장"
          : "적정(15~25자)",
  });

  // 제목 키워드 앞배치
  if (kw) {
    const pos = title.indexOf(kw);
    const front = pos !== -1 && pos <= Math.floor(title.length * 0.4);
    metrics.push({
      label: "제목 키워드",
      value: pos === -1 ? "없음" : front ? "앞배치 ✓" : "뒤쪽",
      status: pos === -1 || !front ? "warn" : "ok",
      hint:
        pos === -1
          ? "제목에 핵심 키워드를 넣으세요"
          : front
            ? "적정"
            : "키워드를 제목 앞쪽으로",
    });
  }

  // 글자 수 (공백 제외) — 톤별 목표치 적용
  const noSpace = body.replace(/\s/g, "").length;
  const target = CHAR_TARGET[tone];
  metrics.push({
    label: "글자 수(공백 제외)",
    value: `${noSpace} / ${target}자`,
    status: noSpace >= target ? "ok" : "warn",
    hint:
      noSpace >= target
        ? "목표 충족"
        : `${target}자↑ 권장 (체류시간)`,
  });

  // 핵심 키워드 반복
  if (kw) {
    const n = countOccurrences(body, kw);
    metrics.push({
      label: "핵심 키워드 반복",
      value: `${n}회`,
      status: n < 3 || n > 8 ? "warn" : "ok",
      hint:
        n < 3 ? "3회↑ 자연스럽게" : n > 8 ? "과다 — 스팸 위험" : "적정(3~8회)",
    });
  } else {
    metrics.push({
      label: "핵심 키워드",
      value: "미입력",
      status: "info",
      hint: "키워드를 넣으면 반복 횟수를 점검합니다",
    });
  }

  // 연관 키워드 반영
  const relList = related
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (relList.length) {
    const hit = relList.filter((r) => body.includes(r)).length;
    metrics.push({
      label: "연관 키워드 반영",
      value: `${hit}/${relList.length}`,
      status: hit === relList.length ? "ok" : "warn",
      hint: hit === relList.length ? "모두 포함" : "빠진 키워드를 본문에",
    });
  }

  // 해시태그
  const tags = (body.match(/#[^\s#]+/g) ?? []).length;
  metrics.push({
    label: "해시태그",
    value: `${tags}개`,
    status: tags >= 8 && tags <= 15 ? "ok" : "warn",
    hint: tags < 8 ? "8~12개 권장" : tags > 15 ? "너무 많음" : "적정",
  });

  // 사진 위치 표시
  const photoMarks = (body.match(/\[사진[^\]]*\]/g) ?? []).length;
  metrics.push({
    label: "사진 위치",
    value: `${photoMarks}곳`,
    status: photoMarks > 0 ? "ok" : "info",
    hint: photoMarks > 0 ? "그 자리에 사진 삽입" : "",
  });

  // 채워야 할 자리표시자 ([사진] 제외)
  const brackets = body.match(/\[[^\]]+\]/g) ?? [];
  const placeholders = brackets.filter((b) => !b.startsWith("[사진")).length;
  if (placeholders > 0) {
    metrics.push({
      label: "채울 자리표시자",
      value: `${placeholders}개`,
      status: "warn",
      hint: "발행 전 실제 값으로 채우세요",
    });
  }

  return metrics;
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [place, setPlace] = useState("");
  const [keyword, setKeyword] = useState("");
  const [relatedKeywords, setRelatedKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState<ToneKey>("review");
  const [showTips, setShowTips] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => splitPostAndCandidates(result), [result]);
  const seo = useMemo(
    () => analyzeSeo(parsed.post, keyword, relatedKeywords, tone),
    [parsed.post, keyword, relatedKeywords, tone],
  );

  // 후보 제목을 현재 제목과 맞바꾼다. 기존 제목은 후보 목록으로 되돌려 둔다.
  const swapTitle = (candidate: string) => {
    const { post, candidates } = parsed;
    const lines = post.split("\n");
    const firstIdx = lines.findIndex((l) => l.trim().length > 0);
    const oldTitle = firstIdx >= 0 ? lines[firstIdx].trim() : "";
    if (firstIdx >= 0) lines[firstIdx] = candidate;

    const nextCandidates = candidates
      .map((c) => (c === candidate ? oldTitle : c))
      .filter((c) => c.length > 0);

    setResult(`${lines.join("\n")}\n\n${buildCandidateBlock(nextCandidates)}`);
  };

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const next: Photo[] = [];
      for (const file of list) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setError(`"${file.name}" 파일이 ${MAX_FILE_MB}MB를 초과해 제외했습니다.`);
          continue;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          next.push({
            id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
            dataUrl,
            name: file.name,
          });
        } catch {
          setError(`"${file.name}" 파일을 읽지 못했습니다.`);
        }
      }
      setPhotos((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removePhoto = (id: string) =>
    setPhotos((prev) => prev.filter((p) => p.id !== id));

  const generate = async () => {
    if (loading) return;
    if (!place.trim() && !keyword.trim() && photos.length === 0) {
      setError("장소 이름, 핵심 키워드, 사진 중 하나 이상은 입력해 주세요.");
      return;
    }
    setError("");
    setResult("");
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place,
          keyword,
          relatedKeywords,
          notes,
          tone,
          images: photos.map((p) => ({ dataUrl: p.dataUrl })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `요청 실패 (${res.status})`);
      }
      if (!res.body) throw new Error("응답 스트림을 받지 못했습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResult((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  };

  return (
    <div className="container">
      <header className="hero">
        <h1>네이버 블로그 AI 에디터</h1>
        <p>
          사진·장소·키워드를 넣으면 네이버 검색 상위노출에 맞춰 튜닝된 블로그 글을
          작성해 줍니다.
        </p>
      </header>

      <div className="grid">
        {/* 입력 영역 */}
        <section className="card">
          <h2>입력</h2>

          <label className="field">
            <span className="label-text">장소 이름</span>
            <input
              type="text"
              placeholder="예: 성수동 ○○카페, 제주 애월 바닷가"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="label-text">핵심 키워드 (검색 상위노출용)</span>
            <input
              type="text"
              placeholder="예: 성수동 브런치카페, 제주 애월 가볼만한곳"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <p className="hint">
              실제로 검색될 법한 말로. 제목 앞쪽 + 본문에 자연스럽게 반복됩니다.
            </p>
          </label>

          <label className="field">
            <span className="label-text">연관 키워드 (선택)</span>
            <input
              type="text"
              placeholder="쉼표로 구분 · 예: 아기랑, 주차, 웨이팅, 디저트"
              value={relatedKeywords}
              onChange={(e) => setRelatedKeywords(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="label-text">
              사진{" "}
              <span className="count">
                ({photos.length}/{MAX_IMAGES})
              </span>
            </span>
            <div
              className={`dropzone${dragging ? " drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              사진을 끌어다 놓거나 클릭해서 선택하세요
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="hint">JPG · PNG · WebP · GIF, 장당 최대 {MAX_FILE_MB}MB</p>

            {photos.length > 0 && (
              <div className="thumbs">
                {photos.map((p) => (
                  <div className="thumb" key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={p.name} />
                    <button
                      type="button"
                      aria-label="사진 삭제"
                      onClick={() => removePhoto(p.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </label>

          <label className="field">
            <span className="label-text">글 스타일</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ToneKey)}
            >
              {TONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label-text">추가 정보 (선택)</span>
            <textarea
              rows={3}
              placeholder="강조하고 싶은 점, 방문 목적, 함께 간 사람 등"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <button className="primary" onClick={generate} disabled={loading}>
            {loading ? "작성 중…" : "블로그 글 작성하기"}
          </button>

          {error && <p className="error">{error}</p>}

          <div className="tips">
            <button
              type="button"
              className="tips-toggle"
              onClick={() => setShowTips((v) => !v)}
              aria-expanded={showTips}
            >
              {showTips ? "▾" : "▸"} 네이버 상위노출 팁 (앱이 대신 못 하는 부분)
            </button>
            {showTips && (
              <ul className="tips-list">
                <li>
                  <b>글 자체는 튜닝되어 있습니다.</b> 실제 경험 톤, 구체적 수치,
                  소제목·요약 구조, 키워드 배치, 붙여넣기 되는 형식으로 생성됩니다.
                </li>
                <li>
                  <b>한 주제로 꾸준히.</b> 네이버 C-Rank는 특정 분야 글을 오래 쌓은
                  블로그를 신뢰합니다. 잡블로그보다 한 카테고리 집중이 유리합니다.
                </li>
                <li>
                  <b>내 사진을 쓰세요.</b> 다른 곳에서 가져온·무료 스톡 이미지는
                  감점 요인. 직접 찍은 사진 6~13장이 좋습니다.
                </li>
                <li>
                  <b>자리표시자 [ ]를 채우세요.</b> 가격·주소·영업시간 등은 지어내지
                  않고 비워 둡니다. 발행 전 실제 값으로 채우면 신뢰도가 올라갑니다.
                </li>
                <li>
                  <b>발행 후 바로 이탈 방지.</b> 밀도 있게 쓴 글이라야 체류시간(권장
                  1분 30초+)이 확보되고 품질 점수가 오릅니다. 채우기 문장은 지우세요.
                </li>
                <li>
                  <b>수정하면 재크롤링.</b> 저품질로 밀린 글도 구조·팩트를 고쳐 다시
                  저장하면 1~2주 뒤 재평가됩니다.
                </li>
              </ul>
            )}
          </div>
        </section>

        {/* 결과 영역 */}
        <section className="card">
          <div className="result-toolbar">
            <h2>블로그 글</h2>
            {result && (
              <button className="ghost-btn" onClick={copyResult}>
                {copied ? "복사됨 ✓" : "복사"}
              </button>
            )}
          </div>

          {result ? (
            <>
              <textarea
                className="result-area"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                spellCheck={false}
              />
              {parsed.candidates.length > 0 && (
                <div className="title-swap">
                  <div className="title-swap-head">
                    제목 후보
                    <span className="seo-note">클릭하면 맨 위 제목과 교체됩니다</span>
                  </div>
                  <div className="title-swap-list">
                    {parsed.candidates.map((c, i) => (
                      <button
                        type="button"
                        className="title-swap-btn"
                        key={`${c}-${i}`}
                        onClick={() => swapTitle(c)}
                        title="이 제목으로 교체"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {seo.length > 0 && (
                <div className="seo-panel">
                  <div className="seo-head">
                    SEO 점검
                    <span className="seo-note">글을 수정하면 실시간 반영</span>
                  </div>
                  <div className="seo-grid">
                    {seo.map((m) => (
                      <div className={`seo-item ${m.status}`} key={m.label}>
                        <span className="seo-dot" aria-hidden />
                        <div className="seo-body">
                          <span className="seo-label">{m.label}</span>
                          <span className="seo-value">{m.value}</span>
                          {m.hint && <span className="seo-hint">{m.hint}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              {loading
                ? "AI가 사진을 분석하고 상위노출용 글을 쓰는 중입니다…"
                : "왼쪽에 사진·장소·핵심 키워드를 입력하고 작성 버튼을 눌러보세요.\n생성된 글은 네이버에 바로 붙여넣을 수 있고, 여기서 수정도 됩니다."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
