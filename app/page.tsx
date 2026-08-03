"use client";

import { useCallback, useRef, useState } from "react";

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
            <textarea
              className="result-area"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              spellCheck={false}
            />
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
