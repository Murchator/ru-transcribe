"use client";

import { useRef, useState } from "react";
import { MAX_IMAGES, approxBytes, fileToDataUrl } from "@/lib/images";
import { plural } from "@/lib/ru";

/**
 * Turn marked-up lesson pictures into a narration the teacher can read aloud.
 * Accepts drag-drop, the file picker, or a pasted screenshot.
 */
export default function NotesComposer({ images, setImages, onCompose, busy, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function add(files) {
    setError("");
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`Больше ${MAX_IMAGES} изображений нельзя. Сначала удалите одно.`);
      return;
    }

    const added = [];
    for (const file of list.slice(0, room)) {
      try {
        const dataUrl = await fileToDataUrl(file);
        added.push({ id: `${Date.now()}-${added.length}`, name: file.name, dataUrl });
      } catch (err) {
        setError(err.message);
      }
    }
    if (added.length) setImages([...images, ...added]);
    if (list.length > room) {
      setError(`Добавлены только первые ${room} — больше ${MAX_IMAGES} нельзя.`);
    }
  }

  const totalMb = images.reduce((sum, i) => sum + approxBytes(i.dataUrl), 0) / 1048576;

  return (
    <div
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length) {
          e.preventDefault();
          add(files);
        }
      }}
    >
      {error && <div className="error">{error}</div>}

      <div
        className={`drop${dragOver ? " over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <strong>Перетащите сюда скриншоты с урока или нажмите, чтобы выбрать</strong>
        <span>
          Картинка вместе с вашими надписями. До {MAX_IMAGES} изображений — можно также вставить
          через Ctrl/Cmd+V.
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {images.length > 0 && (
        <>
          <div className="thumbs">
            {images.map((img, i) => (
              <figure key={img.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt={img.name} />
                <figcaption>
                  <span>{i + 1}</span>
                  <button
                    type="button"
                    aria-label={`Удалить изображение ${i + 1}`}
                    onClick={() => setImages(images.filter((x) => x.id !== img.id))}
                    disabled={busy || disabled}
                  >
                    ✕
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="hint">
            {plural(images.length, "изображение", "изображения", "изображений")} ·{" "}
            {totalMb.toFixed(1)} МБ
            {images.length > 1 ? " · читаются в показанном порядке" : ""}
          </p>
          <button onClick={onCompose} disabled={busy || disabled}>
            {busy ? "Читаем ваши заметки…" : "Написать рассказ"}
          </button>
        </>
      )}
    </div>
  );
}
