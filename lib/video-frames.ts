export type TutorialFrames = { frames: string[]; sampleTimes: number[]; duration: number };

const waitFor = (target: HTMLMediaElement, event: string, timeout = 12_000) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => { cleanup(); reject(new Error("The tutorial video could not be read.")); }, timeout);
  const done = () => { cleanup(); resolve(); };
  const failed = () => { cleanup(); reject(new Error("This video format is not supported by your browser.")); };
  const cleanup = () => { window.clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener("error", failed); };
  target.addEventListener(event, done, { once: true });
  target.addEventListener("error", failed, { once: true });
});

async function extractFromSource(url:string, count:number, cleanup:()=>void):Promise<TutorialFrames> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "metadata";
  video.src = url;
  try {
    if (video.readyState < 1) await waitFor(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The tutorial duration could not be read.");
    const samples = Math.min(count, Math.max(4, Math.ceil(video.duration / 12)));
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Video frame extraction is unavailable in this browser.");
    const frames: string[] = [];
    const sampleTimes: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const time = Math.min(video.duration - 0.05, ((index + 0.5) / samples) * video.duration);
      if (Math.abs(video.currentTime - time) > 0.01) { video.currentTime = time; await waitFor(video, "seeked"); }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.68));
      sampleTimes.push(Number(time.toFixed(2)));
    }
    return { frames, sampleTimes, duration: video.duration };
  } finally {
    video.pause(); video.removeAttribute("src"); video.load(); cleanup();
  }
}

export async function extractTutorialFrames(file: File, count = 10): Promise<TutorialFrames> {
  if (!file.type.startsWith("video/")) throw new Error("Choose an MP4, WebM, or MOV tutorial video.");
  const url = URL.createObjectURL(file);
  return extractFromSource(url,count,()=>URL.revokeObjectURL(url));
}

export async function extractTutorialFramesFromUrl(url:string,count=10):Promise<TutorialFrames> {
  if(!url.startsWith("/api/tutorial-media?")) throw new Error("The tutorial link did not produce a safe video stream.");
  try { return await extractFromSource(url,count,()=>{}); }
  catch(error) { throw new Error(error instanceof Error?`${error.message} Upload a permitted video copy instead.`:"The linked tutorial could not be read. Upload a permitted video copy instead."); }
}
