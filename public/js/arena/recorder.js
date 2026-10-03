/**
 * 浏览器录音的最小封装，供实践模式与学习模式共用。
 */

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function supportsRecording() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * 申请麦克风并开始录音。
 *
 * @param {Blob[]} chunks 录音分片会持续追加到这个数组
 * @returns {Promise<{ stream: MediaStream, recorder: MediaRecorder }>} 失败时抛出原始错误
 */
export async function openMicRecorder(chunks) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.start(250);
    return { stream, recorder };
  } catch (error) {
    stopStream(stream);
    throw error;
  }
}

/** 停止录音并返回完整的录音 Blob，同时释放麦克风。 */
export function finishRecorder({ recorder, stream, chunks }) {
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => {
      stopStream(stream);
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    }, { once: true });
    recorder.stop();
  });
}

export function recordingErrorMessage(error) {
  return error?.name === "NotAllowedError" ? "没有麦克风权限，已改为只计时。" : "无法启动录音，已改为只计时。";
}

/**
 * 一次表达（take）的生命周期：requesting（等待麦克风授权）→ running → 结束或取消。
 *
 * 等待授权期间可以改为只计时；授权迟到时自动释放麦克风。计时从真正开始时起算。
 *
 * @param {{ showToast: Function, onChange: Function, saveRecording: Function }} deps
 */
export function createTakeRunner({ showToast, onChange, saveRecording }) {
  let current = null;

  async function start({ record, id }) {
    if (current?.status === "requesting" && !record) {
      current = null;
    }
    if (current) return false;
    const run = { id, status: "requesting", startedAt: null, recorder: null, stream: null, chunks: [], flags: {} };
    current = run;
    if (record && !supportsRecording()) {
      showToast("当前浏览器不支持录音，已改为只计时。回听检查只能凭记忆，准确度会下降。", "danger");
    } else if (record) {
      onChange();
      try {
        const opened = await openMicRecorder(run.chunks);
        if (current !== run) {
          // 等待授权期间已改为只计时或离开了本阶段
          try { opened.recorder.stop(); } catch { /* 录音器已停止 */ }
          stopStream(opened.stream);
          return false;
        }
        Object.assign(run, opened);
      } catch (error) {
        if (current !== run) return false;
        showToast(recordingErrorMessage(error), "danger");
      }
    }
    if (current !== run) return false;
    run.status = "running";
    run.startedAt = Date.now();
    return true;
  }

  /** 结束当前表达，保存录音；返回 { id, take } 或 null（没有进行中的表达）。 */
  async function finish() {
    const run = current;
    if (!run || run.status !== "running" || run.finishing) return null;
    run.finishing = true;
    const durationSeconds = Math.round((Date.now() - run.startedAt) / 1000);
    let recordingId = null;
    if (run.recorder) {
      const blob = await finishRecorder(run);
      if (blob.size > 0) {
        recordingId = `${run.id}-${Date.now()}`;
        try {
          await saveRecording(recordingId, blob);
        } catch {
          recordingId = null;
          showToast("录音保存失败，本次按只计时处理。", "danger");
        }
      }
    }
    current = null;
    return { id: run.id, take: { recordingId, durationSeconds, noRecording: !recordingId } };
  }

  function cancel() {
    const run = current;
    if (!run) return;
    current = null;
    try {
      if (run.recorder?.state === "recording") run.recorder.stop();
    } catch {
      // 录音器无法正常停止时，下方仍会释放麦克风
    }
    stopStream(run.stream);
  }

  return {
    get current() {
      return current;
    },
    start,
    finish,
    cancel,
    isBusy: () => Boolean(current),
    isRunning: () => current?.status === "running",
    isRequesting: () => current?.status === "requesting",
    elapsedSeconds: () => (current?.status === "running" ? (Date.now() - current.startedAt) / 1000 : null),
  };
}
